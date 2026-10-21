'use strict';

const sequelize = require('../../../config/db.js');
const { Company } = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const C = require('./commun.js');
const { detail } = require('./commande.service.js');
const Livraisons = require('./livraison.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');

/**
 * Exécution de la commande validée (§ 12, § 13) :
 *   fournisseur : en préparation → prête → livraison(s) (module livraison) ;
 *   acheteur    : confirmation de réception (quantités reçues, réserves).
 * « Le fournisseur est principalement responsable de la mise à jour des
 * statuts opérationnels. L'acheteur est responsable de la confirmation de
 * réception. »
 */

const NOTIFICATIONS = Object.freeze({
  en_preparation: { type: 'commande_en_preparation', titre: 'Commande en préparation', corps: (n, f) => `${f} prépare votre commande ${n}.` },
  prete: { type: 'commande_prete', titre: 'Commande prête', corps: (n, f) => `Votre commande ${n} est prête chez ${f}.` },
});

const HORODATAGES = Object.freeze({ en_preparation: 'preparation_at', prete: 'ready_at' });

/** Changement de statut opérationnel par le fournisseur (en préparation, prête). */
async function changerStatut(t, commande, statut, { user, companyId, note = null }) {
  C.verifierStatut(commande, statut);
  const avant = commande.status;
  await commande.update({ status: statut, [HORODATAGES[statut]]: new Date() }, { transaction: t });
  await C.historiser(t, commande, {
    type: 'changement_statut', de: avant, vers: statut, acteur: user, companyId, cote: 'fournisseur', message: note,
  });
  await journaliser({ action: 'commande.changement_statut', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, de: avant, a: statut } }, t);
  const fournisseur = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
  const n = NOTIFICATIONS[statut];
  await notifierEntreprise(t, commande.buyer_company_id, P.ACHATS_LIRE, {
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
 * § 13 — « le fournisseur indique que la commande a été livrée » : tout le
 * reliquat part en une livraison (bon de livraison signé ou photo
 * facultatif). Les livraisons partielles passent par POST /ventes/:id/livraisons.
 */
function livrer(id, companyId, user, { note = null, carrier = null, revision }, fichier = null) {
  return Livraisons.expedier(id, companyId, user, { note, carrier, revision }, fichier);
}

/** § 13 — l'acheteur confirme la réception de toutes les livraisons en attente. */
function confirmerReception(id, companyId, user, donnees) {
  return Livraisons.confirmerReception(id, companyId, user, donnees);
}

module.exports = { mettreAJourStatut, livrer, confirmerReception };
