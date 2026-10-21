'use strict';

const sequelize = require('../../../config/db.js');
const { Company, OrderLine } = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { ValidationError } = require('../../../errors/AppError.js');
const { transactionAvecFichiers } = require('../../../database/transaction.js');
const C = require('./commun.js');
const { detail } = require('./commande.service.js');
const documents = require('../../document/service/document.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');

/**
 * Exécution de la commande validée (§ 12, § 13) :
 *   fournisseur : en préparation → prête → livrée (bon de livraison facultatif) ;
 *   acheteur    : confirmation de réception (quantités reçues, réserves).
 * « Le fournisseur est principalement responsable de la mise à jour des
 * statuts opérationnels. L'acheteur est responsable de la confirmation de
 * réception. »
 */

const NOTIFICATIONS = Object.freeze({
  en_preparation: { type: 'commande_en_preparation', titre: 'Commande en préparation', corps: (n, f) => `${f} prépare votre commande ${n}.` },
  prete: { type: 'commande_prete', titre: 'Commande prête', corps: (n, f) => `Votre commande ${n} est prête chez ${f}.` },
  livree: { type: 'commande_livree', titre: 'Commande livrée', corps: (n, f) => `${f} indique avoir livré votre commande ${n}. Vérifiez la livraison et confirmez la réception.` },
});

const HORODATAGES = Object.freeze({ en_preparation: 'preparation_at', prete: 'ready_at', livree: 'delivered_at' });

/** Changement de statut opérationnel par le fournisseur. */
async function changerStatut(t, commande, statut, { user, companyId, note = null, details = null }) {
  C.verifierStatut(commande, statut);
  const avant = commande.status;
  await commande.update({
    status: statut,
    [HORODATAGES[statut]]: new Date(),
    ...(statut === 'livree' ? { delivery_note: note } : {}),
  }, { transaction: t });
  await C.historiser(t, commande, {
    type: statut === 'livree' ? 'livraison' : 'changement_statut', de: avant, vers: statut, acteur: user, companyId, cote: 'fournisseur', message: note, details,
  });
  await journaliser({ action: 'commande.changement_statut', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, de: avant, a: statut } }, t);
  const fournisseur = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
  const n = NOTIFICATIONS[statut];
  // La livraison concerne aussi le réceptionnaire (permission de réception).
  await notifierEntreprise(t, commande.buyer_company_id, statut === 'livree' ? P.RECEPTION_CONFIRMER : P.ACHATS_LIRE, {
    type: n.type, titre: `${n.titre} — ${commande.number}`, corps: n.corps(commande.number, fournisseur.name),
    donnees: { order_id: commande.id, number: commande.number },
  });
  await C.apresChangement(t, commande);
}

/** « en_preparation » ou « prete ». */
async function mettreAJourStatut(id, companyId, user, { status, note = null, revision }) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'fournisseur');
    C.verifierRevision(commande, revision);
    await changerStatut(t, commande, status, { user, companyId, note });
  });
  return detail(id, companyId);
}

/**
 * § 13 — « le fournisseur indique que la commande a été livrée ». Le bon de
 * livraison (photo ou PDF signé) est facultatif et partagé avec l'acheteur.
 */
async function livrer(id, companyId, user, { note = null, revision }, fichier = null) {
  await transactionAvecFichiers(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'fournisseur');
    C.verifierRevision(commande, revision);
    let document = null;
    if (fichier) {
      document = await documents.creerDocument({
        companyId, partnerCompanyId: commande.buyer_company_id, entityType: 'order', entityId: commande.id,
        category: 'bon_livraison', visibility: 'partenaire', fichier, uploadedBy: user.id,
      }, t);
    }
    await changerStatut(t, commande, 'livree', { user, companyId, note, details: document ? { bon_livraison_id: document.id } : null });
  });
  return detail(id, companyId);
}

/**
 * § 13 — l'acheteur vérifie la livraison et confirme la réception. Les
 * quantités réellement reçues (livraison partielle, casse) sont facultatives
 * et servent de base à la facture ; un écart marque la réception « avec
 * réserves ».
 * @param {{ lines?: Array<{ line_no: number, received_quantity: number }>, note?: string, with_reserves?: boolean, revision?: number }} donnees
 */
async function confirmerReception(id, companyId, user, { lines = [], note = null, with_reserves: reserves = false, revision }) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'acheteur');
    C.verifierRevision(commande, revision);
    C.verifierStatut(commande, 'reception_confirmee');
    const version = await C.version(commande.id, commande.validated_version_no, t);
    const parNumero = new Map(version.lines.map((l) => [l.line_no, l]));
    const erreurs = [];
    for (const saisie of lines) {
      const ligne = parNumero.get(saisie.line_no);
      if (!ligne) erreurs.push(`La ligne ${saisie.line_no} n'existe pas dans la commande validée`);
      else if (saisie.received_quantity > Number(ligne.quantity)) erreurs.push(`Ligne ${saisie.line_no} : quantité reçue supérieure à la quantité commandée`);
    }
    if (erreurs.length) throw new ValidationError('Données invalides', erreurs, 'RECEPTION_INVALIDE');
    let ecart = false;
    for (const ligne of version.lines) {
      const saisie = lines.find((s) => s.line_no === ligne.line_no);
      const recue = saisie ? saisie.received_quantity : Number(ligne.quantity);
      if (recue !== Number(ligne.quantity)) ecart = true;
      await OrderLine.update({ received_quantity: recue }, { where: { id: ligne.id }, transaction: t });
    }
    const avecReserves = Boolean(reserves) || ecart;
    await commande.update({
      status: 'reception_confirmee', received_at: new Date(), reception_note: note, reception_with_reserves: avecReserves,
    }, { transaction: t });
    await C.historiser(t, commande, {
      type: 'reception', de: 'livree', vers: 'reception_confirmee', versionNo: version.version_no, acteur: user, companyId, cote: 'acheteur', message: note,
      details: { avec_reserves: avecReserves, ecarts: lines },
    });
    await journaliser({ action: 'commande.reception', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, avec_reserves: avecReserves } }, t);
    const acheteur = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await notifierEntreprise(t, commande.supplier_company_id, P.VENTES_LIRE, {
      type: 'reception_confirmee',
      titre: `Réception confirmée — ${commande.number}`,
      corps: `${acheteur.name} a confirmé la réception de la commande ${commande.number}${avecReserves ? ' avec réserves' : ''}. Vous pouvez établir la facture.`,
      donnees: { order_id: commande.id, number: commande.number },
    });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

module.exports = { mettreAJourStatut, livrer, confirmerReception };
