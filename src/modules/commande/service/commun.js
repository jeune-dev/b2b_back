'use strict';

const {
  Order, OrderEvent, OrderVersion, OrderLine, Company, Invoice,
} = require('../../../models/index.js');
const { ConflictError } = require('../../../errors/AppError.js');
const { COMMANDE, verifierTransition } = require('../../../config/transitions.js');
const { chargerPartage } = require('../../../utils/acces.js');
const cache = require('../../../utils/cache.js');
const { synchroniser } = require('../../notification/service/notification.service.js');

/**
 * Briques communes du module commande : chargement avec contrôle d'accès
 * (acheteur / fournisseur), concurrence optimiste, historique (§ 20),
 * synchronisation web / mobile (§ 23) et actions possibles par statut.
 */

/** Un brouillon n'existe que pour l'acheteur (§ 9 : seul le bon ENVOYÉ parvient au fournisseur). */
const visiblePar = (commande, cote) => cote === 'acheteur' || commande.status !== 'brouillon';

/**
 * Charge une commande pour l'entreprise connectée.
 * @param {object} [o]
 * @param {'acheteur'|'fournisseur'|null} [o.cote]  côté exigé par l'action
 * @returns {Promise<{ commande: object, cote: 'acheteur'|'fournisseur' }>}
 */
async function charger(id, companyId, options = {}, { cote = null } = {}) {
  const { ressource, cote: sien } = await chargerPartage(Order, id, companyId, options, 'Commande', { cote, visiblePar });
  return { commande: ressource, cote: sien };
}

/** Charge et VERROUILLE la commande dans la transaction `t`. */
function chargerPourModifier(id, companyId, t, cote) {
  return charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, { cote });
}

/**
 * Concurrence optimiste (§ 23) : le client renvoie la `revision` qu'il
 * affichait. Si la commande a changé entre-temps (action faite sur un autre
 * appareil, par l'autre partie), l'action est refusée en 409 et le client
 * recharge la commande au lieu d'agir sur un état périmé.
 */
function verifierRevision(commande, revision) {
  if (revision !== undefined && revision !== null && Number(revision) !== commande.revision) {
    throw new ConflictError(
      'La commande a été modifiée entre-temps. Rechargez-la avant de continuer.',
      'COMMANDE_MODIFIEE',
      { revision_actuelle: commande.revision }
    );
  }
}

function verifierStatut(commande, vers) {
  verifierTransition(COMMANDE, commande.status, vers, `la commande ${commande.number}`);
}

/**
 * Ligne d'historique (§ 20) : qui (utilisateur, entreprise, côté), quoi
 * (type, statuts), quand — dans la transaction de l'action.
 */
async function historiser(t, commande, {
  type, de = null, vers = null, versionNo = null, acteur = null, companyId = null, cote = null, message = null, details = null,
}) {
  return OrderEvent.create({
    order_id: commande.id,
    type,
    from_status: de,
    to_status: vers,
    version_no: versionNo,
    actor_user_id: acteur?.id || null,
    actor_company_id: companyId,
    actor_side: cote,
    message,
    details,
  }, { transaction: t });
}

/**
 * Après toute modification : révision incrémentée, tableaux de bord des deux
 * entreprises invalidés et événement de synchronisation publié après COMMIT.
 */
async function apresChangement(t, commande) {
  await commande.increment('revision', { by: 1, transaction: t });
  await commande.reload({ transaction: t });
  const entreprises = [commande.buyer_company_id, commande.supplier_company_id];
  t.afterCommit(() => Promise.all(entreprises.map((id) => cache.invalider(`dashboard:*:${id}`))).catch(() => {}));
  // Le fournisseur n'est pas averti des modifications d'un brouillon.
  const destinataires = commande.status === 'brouillon' ? [commande.buyer_company_id] : entreprises;
  await synchroniser(t, destinataires, 'commande', {
    order_id: commande.id, number: commande.number, status: commande.status, revision: commande.revision,
  });
}

/**
 * Actions possibles pour l'entreprise connectée, selon le statut et son côté
 * (le client affiche les bons boutons ; le serveur revérifie à chaque action).
 */
const ACTIONS = Object.freeze({
  acheteur: {
    brouillon: ['modifier', 'envoyer', 'annuler'],
    envoyee: ['annuler', 'recommander'],
    en_attente_validation: ['annuler', 'recommander'],
    proposition_modifiee: ['accepter_proposition', 'refuser_proposition', 'demander_modification', 'annuler', 'recommander'],
    validee: ['annuler', 'recommander'],
    en_preparation: ['recommander'],
    prete: ['recommander'],
    livree_partiellement: ['receptionner', 'solder_reliquat', 'ouvrir_litige', 'recommander'],
    livree: ['confirmer_reception', 'ouvrir_litige', 'recommander'],
    reception_confirmee: ['ouvrir_litige', 'recommander'],
    facturee: ['ouvrir_litige', 'recommander'],
    terminee: ['ouvrir_litige', 'recommander'],
    refusee: ['recommander'],
    annulee: ['recommander'],
  },
  fournisseur: {
    envoyee: ['prendre_en_charge', 'accepter', 'proposer', 'refuser'],
    en_attente_validation: ['accepter', 'proposer', 'refuser'],
    validee: ['en_preparation', 'prete', 'livrer', 'annuler'],
    en_preparation: ['prete', 'livrer'],
    prete: ['livrer'],
    livree_partiellement: ['livrer', 'solder_reliquat'],
    reception_confirmee: ['facturer'],
  },
});

/** Brouillon soumis au circuit d'approbation : il attend une décision, il ne part pas. */
const ACTIONS_EN_APPROBATION = Object.freeze(['modifier', 'annuler', 'approuver', 'rejeter_approbation']);

/** @param {{ status: string, approval_status?: string }} commande */
function actionsPossibles(commande, cote) {
  if (cote === 'acheteur' && commande.status === 'brouillon' && commande.approval_status === 'en_attente') return ACTIONS_EN_APPROBATION;
  return ACTIONS[cote]?.[commande.status] || [];
}

const ATTRIBUTS_ENTREPRISE = ['id', 'name', 'legal_name', 'city', 'address', 'phone', 'email', 'ninea', 'rccm', 'logo_document_id'];

const INCLUDES_LISTE = [
  { model: Company, as: 'buyer', attributes: ['id', 'name', 'city', 'logo_document_id'], paranoid: false },
  { model: Company, as: 'supplier', attributes: ['id', 'name', 'city', 'logo_document_id'], paranoid: false },
];

const INCLUDES_DETAIL = [
  { model: Company, as: 'buyer', attributes: ATTRIBUTS_ENTREPRISE, paranoid: false },
  { model: Company, as: 'supplier', attributes: ATTRIBUTS_ENTREPRISE, paranoid: false },
  { model: Invoice, as: 'invoice', required: false, where: { status: ['emise', 'partiellement_payee', 'payee', 'en_retard'] }, attributes: ['id', 'number', 'status', 'total', 'amount_paid', 'due_date'] },
];

/** Version et ses lignes, en une requête. */
async function version(commandeId, numero, transaction) {
  return OrderVersion.findOne({
    where: { order_id: commandeId, version_no: numero },
    include: [{ model: OrderLine, as: 'lines', separate: true, order: [['line_no', 'ASC']] }],
    transaction,
  });
}

module.exports = {
  visiblePar, charger, chargerPourModifier, verifierRevision, verifierStatut, historiser, apresChangement,
  actionsPossibles, version, INCLUDES_LISTE, INCLUDES_DETAIL, ATTRIBUTS_ENTREPRISE,
};
