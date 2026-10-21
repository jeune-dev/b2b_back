'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { Company, Document, Partnership, Product } = require('../../../models/index.js');
const { parametresEntreprise } = require('../../../config/parametres.js');
const { ConflictError } = require('../../../errors/AppError.js');
const { transactionAvecFichiers } = require('../../../database/transaction.js');
const documents = require('../../document/service/document.service.js');
const droits = require('../../abonnement/service/droits.service.js');
const { journaliser, difference } = require('../../audit/service/audit.service.js');
const { synchroniser } = require('../../notification/service/notification.service.js');

/**
 * Gestion de l'entreprise (§ 6) : nom, logo, adresse, téléphone, e-mail,
 * NINEA, RCCM, informations fiscales, paramètres. Les utilisateurs et leurs
 * rôles relèvent du module `utilisateur`.
 */

const CHAMPS = [
  'name', 'legal_name', 'type', 'sector', 'description', 'address', 'city', 'country', 'phone', 'email', 'website',
  'ninea', 'rccm', 'tax_regime', 'vat_registered', 'default_tax_rate', 'bank_details', 'is_listed',
];

async function detail(companyId) {
  const company = await Company.findByPk(companyId, {
    include: [{ model: Document, as: 'logo', attributes: ['id', 'mime_type', 'thumbnail_key', 'size_bytes', 'original_name', 'created_at', 'category', 'visibility', 'company_id'] }],
  });
  const { logo, settings, ...donnees } = company.toJSON();
  return {
    company: { ...donnees, logo: documents.versApi(logo) },
    settings: parametresEntreprise(company),
    abonnement: await droits.etat(companyId),
  };
}

/**
 * Passer d'un profil vendeur (fournisseur, mixte) à « acheteur » seul n'est
 * permis que sans clients ni catalogue : sinon des commandes en cours
 * perdraient leur fournisseur. Même règle dans l'autre sens.
 */
async function verifierChangementType(company, nouveauType, t) {
  if (!nouveauType || nouveauType === company.type || nouveauType === 'mixte') return;
  if (nouveauType === 'acheteur') {
    const [clients, produits] = await Promise.all([
      Partnership.count({ where: { supplier_company_id: company.id, status: { [Op.in]: ['actif', 'en_attente', 'suspendu'] } }, transaction: t }),
      Product.count({ where: { company_id: company.id }, transaction: t }),
    ]);
    if (clients || produits) {
      throw new ConflictError('Votre entreprise a des clients ou un catalogue : elle ne peut pas devenir uniquement acheteuse (choisissez « mixte »).', 'TYPE_ENTREPRISE_INCOMPATIBLE');
    }
  }
  if (nouveauType === 'fournisseur') {
    const fournisseurs = await Partnership.count({ where: { buyer_company_id: company.id, status: { [Op.in]: ['actif', 'en_attente', 'suspendu'] } }, transaction: t });
    if (fournisseurs) {
      throw new ConflictError('Votre entreprise a des fournisseurs : elle ne peut pas devenir uniquement fournisseur (choisissez « mixte »).', 'TYPE_ENTREPRISE_INCOMPATIBLE');
    }
  }
}

async function modifier(companyId, donnees) {
  if (donnees.ninea) {
    const pris = await Company.findOne({
      where: { [Op.and]: [sequelize.where(sequelize.fn('upper', sequelize.col('ninea')), donnees.ninea.toUpperCase()), { id: { [Op.ne]: companyId } }] },
      attributes: ['id'],
    });
    if (pris) throw new ConflictError('Une autre entreprise est déjà inscrite avec ce NINEA.', 'NINEA_UTILISE');
  }
  return sequelize.transaction(async (t) => {
    const company = await Company.findByPk(companyId, { transaction: t, lock: t.LOCK.UPDATE });
    await verifierChangementType(company, donnees.type, t);
    const avant = company.toJSON();
    await company.update(donnees, { transaction: t, fields: CHAMPS });
    await journaliser({ action: 'entreprise.modification', entityType: 'company', entityId: companyId, companyId, details: difference(avant, donnees, CHAMPS) }, t);
    await synchroniser(t, [companyId], 'entreprise', { company_id: companyId });
    return company;
  });
}

async function modifierParametres(companyId, reglages) {
  return sequelize.transaction(async (t) => {
    const company = await Company.findByPk(companyId, { transaction: t, lock: t.LOCK.UPDATE });
    const avant = parametresEntreprise(company);
    await company.update({ settings: { ...(company.settings || {}), ...reglages } }, { transaction: t });
    await journaliser({ action: 'entreprise.modification_parametres', entityType: 'company', entityId: companyId, companyId, details: difference(avant, reglages, Object.keys(reglages)) }, t);
    return parametresEntreprise(company);
  });
}

/**
 * Logo (§ 6) : visible de toute entreprise connectée (annuaire, bons de
 * commande, factures). L'ancien logo est retiré (suppression logique).
 */
async function changerLogo(companyId, user, fichier) {
  const document = await transactionAvecFichiers(async (t) => {
    const company = await Company.findByPk(companyId, { transaction: t, lock: t.LOCK.UPDATE });
    const nouveau = await documents.creerDocument({
      companyId, entityType: 'company', entityId: companyId, category: 'logo', visibility: 'public', fichier, uploadedBy: user.id,
    }, t);
    if (company.logo_document_id) await Document.destroy({ where: { id: company.logo_document_id }, transaction: t });
    await company.update({ logo_document_id: nouveau.id }, { transaction: t });
    return nouveau;
  });
  return documents.versApi(document);
}

async function supprimerLogo(companyId) {
  await sequelize.transaction(async (t) => {
    const company = await Company.findByPk(companyId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!company.logo_document_id) return;
    const ancien = company.logo_document_id;
    await company.update({ logo_document_id: null }, { transaction: t });
    await Document.destroy({ where: { id: ancien }, transaction: t });
    await journaliser({ action: 'entreprise.suppression_logo', entityType: 'company', entityId: companyId, companyId, details: { document_id: ancien } }, t);
  });
}

module.exports = { detail, modifier, modifierParametres, changerLogo, supprimerLogo };
