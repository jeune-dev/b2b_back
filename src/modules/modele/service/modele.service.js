'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { DocumentTemplate } = require('../../../models/index.js');
const { ConflictError } = require('../../../errors/AppError.js');
const { chargerPourEntreprise } = require('../../../utils/acces.js');
const { transactionAvecFichiers } = require('../../../database/transaction.js');
const documents = require('../../document/service/document.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');

/**
 * Modèles de documents (§ 15) : « chaque entreprise peut importer son modèle
 * de bon de commande et son modèle de facture. Si un modèle personnalisé
 * existe, Pro2Link l'utilise pour générer le document. Sinon, Pro2Link fournit
 * automatiquement un modèle standard. Les modèles peuvent être remplacés ou
 * mis à jour. »
 *
 * Un modèle = papier à en-tête importé (image A4 : logo, coordonnées, pied
 * imprimés), couleur, textes d'en-tête et de pied, mentions légales, marges
 * qui laissent libres les zones imprimées. Pro2Link écrit le contenu
 * (parties, lignes, totaux) par-dessus.
 *
 * VERSIONNÉ : remplacer un modèle archive l'ancien et crée la version
 * suivante. Un document déjà émis garde la version avec laquelle il a été
 * produit (`orders.template_id`, `invoices.template_id`) : le réimprimer
 * donne toujours le même document.
 */

const CHAMPS = ['name', 'accent_color', 'header_text', 'footer_text', 'legal_mentions', 'show_logo', 'margin_top', 'margin_bottom'];

function versApi(modele) {
  const m = modele.toJSON();
  return {
    ...m,
    background_url: m.background_document_id ? `/api/v1/documents/${m.background_document_id}/fichier` : null,
  };
}

async function lister(companyId, { type, status } = {}) {
  const where = { company_id: companyId };
  if (type) where.type = type;
  if (status) where.status = status;
  const modeles = await DocumentTemplate.findAll({ where, order: [['type', 'ASC'], ['version', 'DESC']] });
  return modeles.map(versApi);
}

async function detail(id, companyId) {
  return versApi(await chargerPourEntreprise(DocumentTemplate, id, companyId, {}, 'Modèle'));
}

/** Modèle actif d'une entreprise pour un type, ou null (modèle standard). */
async function modeleActif(companyId, type, transaction) {
  return DocumentTemplate.findOne({ where: { company_id: companyId, type, status: 'actif' }, transaction });
}

/**
 * Importe (ou remplace) le modèle d'un type : la version active est archivée,
 * la nouvelle devient active. Sans nouveau fond, le fond de la version
 * précédente est conservé si `keep_background` est demandé.
 */
async function creer(companyId, user, donnees, fichier = null) {
  const modele = await transactionAvecFichiers(async (t) => {
    const precedent = await DocumentTemplate.findOne({
      where: { company_id: companyId, type: donnees.type },
      order: [['version', 'DESC']],
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    const actif = precedent?.status === 'actif' ? precedent : await modeleActif(companyId, donnees.type, t);
    if (actif) await actif.update({ status: 'archive', archived_at: new Date() }, { transaction: t });
    const cree = await DocumentTemplate.create({
      ...Object.fromEntries(CHAMPS.filter((c) => donnees[c] !== undefined).map((c) => [c, donnees[c]])),
      name: donnees.name || `Modèle ${donnees.type === 'facture' ? 'de facture' : 'de bon de commande'}`,
      company_id: companyId,
      type: donnees.type,
      version: (precedent?.version || 0) + 1,
      status: 'actif',
      background_document_id: !fichier && donnees.keep_background && actif ? actif.background_document_id : null,
      created_by: user.id,
    }, { transaction: t });
    if (fichier) {
      const fond = await documents.creerDocument({
        companyId, entityType: 'document_template', entityId: cree.id, category: 'modele', visibility: 'prive', fichier, uploadedBy: user.id,
      }, t);
      await cree.update({ background_document_id: fond.id }, { transaction: t });
    }
    await journaliser({
      action: 'modele.creation', entityType: 'document_template', entityId: cree.id, companyId,
      details: { type: cree.type, version: cree.version, remplace: actif?.id || null, fond: Boolean(cree.background_document_id) },
    }, t);
    return cree;
  });
  return versApi(modele);
}

/** Archivage : sans modèle actif, le modèle standard de Pro2Link s'applique de nouveau. */
async function archiver(id, companyId) {
  return sequelize.transaction(async (t) => {
    const modele = await chargerPourEntreprise(DocumentTemplate, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Modèle');
    if (modele.status === 'archive') throw new ConflictError('Ce modèle est déjà archivé.', 'STATUT_INCHANGE');
    await modele.update({ status: 'archive', archived_at: new Date() }, { transaction: t });
    await journaliser({ action: 'modele.archivage', entityType: 'document_template', entityId: id, companyId, details: { type: modele.type, version: modele.version } }, t);
    return versApi(modele);
  });
}

/** Réactive une version archivée (retour à un modèle précédent). */
async function reactiver(id, companyId) {
  return sequelize.transaction(async (t) => {
    const modele = await chargerPourEntreprise(DocumentTemplate, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Modèle');
    if (modele.status === 'actif') throw new ConflictError('Ce modèle est déjà actif.', 'STATUT_INCHANGE');
    await DocumentTemplate.update(
      { status: 'archive', archived_at: new Date() },
      { where: { company_id: companyId, type: modele.type, status: 'actif', id: { [Op.ne]: id } }, transaction: t }
    );
    await modele.update({ status: 'actif', archived_at: null }, { transaction: t });
    await journaliser({ action: 'modele.reactivation', entityType: 'document_template', entityId: id, companyId, details: { type: modele.type, version: modele.version } }, t);
    return versApi(modele);
  });
}

module.exports = { lister, detail, modeleActif, creer, archiver, reactiver };
