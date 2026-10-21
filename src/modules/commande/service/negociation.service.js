'use strict';

const sequelize = require('../../../config/db.js');
const { Company } = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { ConflictError } = require('../../../errors/AppError.js');
const { formatFcfa } = require('../../../utils/montants.js');
const C = require('./commun.js');
const L = require('./lignes.service.js');
const { detail } = require('./commande.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');

/**
 * Traitement par le fournisseur et validation (§ 10, § 11).
 *
 * À la réception du bon, le fournisseur :
 *   - l'ACCEPTE tel quel → la commande est validée ;
 *   - le MODIFIE (quantité, produit indisponible, produit de remplacement,
 *     prix) → une PROPOSITION est envoyée à l'acheteur ;
 *   - le REFUSE.
 * L'acheteur, face à une proposition :
 *   - l'ACCEPTE → la commande est AUTOMATIQUEMENT validée (§ 11) ;
 *   - la REFUSE → la commande est annulée ;
 *   - DEMANDE une nouvelle modification → contre-proposition, la commande
 *     repart en attente de validation chez le fournisseur.
 *
 * Chaque proposition est une version figée ; la version acceptée devient la
 * référence officielle, identique pour les deux parties (§ 11).
 */

async function nomDe(companyId, t) {
  return (await Company.findByPk(companyId, { attributes: ['name'], transaction: t })).name;
}

/** Version courante PROPOSÉE par le côté attendu (sinon : état périmé côté client). */
async function versionProposee(commande, cote, t) {
  const v = await C.version(commande.id, commande.current_version_no, t);
  if (!v || v.status !== 'proposee' || v.proposed_by_side !== cote) {
    throw new ConflictError('Aucune proposition en attente de votre réponse sur cette commande.', 'AUCUNE_PROPOSITION');
  }
  return v;
}

/** Validation commune : version acceptée, commande validée (§ 11). */
async function valider(t, commande, version, user) {
  await version.update({ status: 'acceptee', decided_at: new Date(), decided_by: user.id }, { transaction: t });
  await commande.update({ status: 'validee', validated_at: new Date(), validated_version_no: version.version_no }, { transaction: t });
}

/** § 10 — « Le fournisseur peut prendre en charge » : envoyée → en attente de validation. */
async function prendreEnCharge(id, companyId, user, { revision } = {}) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'fournisseur');
    C.verifierRevision(commande, revision);
    C.verifierStatut(commande, 'en_attente_validation');
    if (commande.status !== 'envoyee') {
      throw new ConflictError('La commande a déjà été prise en charge.', 'TRANSITION_INVALIDE');
    }
    await commande.update({ status: 'en_attente_validation', acknowledged_at: new Date() }, { transaction: t });
    await C.historiser(t, commande, { type: 'prise_en_charge', de: 'envoyee', vers: 'en_attente_validation', versionNo: commande.current_version_no, acteur: user, companyId, cote: 'fournisseur' });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

/** § 10 option 1 — le fournisseur accepte la commande telle quelle. */
async function accepter(id, companyId, user, { revision, comment = null } = {}) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'fournisseur');
    C.verifierRevision(commande, revision);
    C.verifierStatut(commande, 'validee');
    const version = await versionProposee(commande, 'acheteur', t);
    const avant = commande.status;
    await valider(t, commande, version, user);
    await C.historiser(t, commande, { type: 'acceptation', de: avant, vers: 'validee', versionNo: version.version_no, acteur: user, companyId, cote: 'fournisseur', message: comment });
    await journaliser({ action: 'commande.acceptation', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, version: version.version_no, total: commande.total } }, t);
    await notifierEntreprise(t, commande.buyer_company_id, P.ACHATS_LIRE, {
      type: 'commande_acceptee',
      titre: `Commande ${commande.number} acceptée`,
      corps: `${await nomDe(companyId, t)} a accepté votre commande ${commande.number} : elle est validée.`,
      donnees: { order_id: commande.id, number: commande.number },
    });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

/**
 * § 10 option 2 — proposition modifiée du fournisseur (quantités, produits
 * indisponibles, produits de remplacement, prix).
 */
async function proposer(id, companyId, user, { lines, comment = null, revision }) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'fournisseur');
    C.verifierRevision(commande, revision);
    C.verifierStatut(commande, 'proposition_modifiee');
    const courante = await versionProposee(commande, 'acheteur', t);
    const nouvelles = await L.lignesModifiees(
      commande.supplier_company_id, courante.lines.map((l) => l.get({ plain: true })), lines, 'fournisseur', t
    );
    const avant = commande.status;
    await courante.update({ status: 'remplacee', decided_at: new Date(), decided_by: user.id }, { transaction: t });
    const version = await L.creerVersion(t, commande, {
      numero: courante.version_no + 1, cote: 'fournisseur', auteur: user, statut: 'proposee', commentaire: comment, lignes: nouvelles,
    });
    await commande.update({ status: 'proposition_modifiee', acknowledged_at: commande.acknowledged_at || new Date() }, { transaction: t });
    const indisponibles = nouvelles.filter((l) => l.change_type === 'indisponible').map((l) => l.name);
    await C.historiser(t, commande, {
      type: 'proposition', de: avant, vers: 'proposition_modifiee', versionNo: version.version_no, acteur: user, companyId, cote: 'fournisseur', message: comment,
      details: { changements: nouvelles.filter((l) => l.change_type !== 'inchangee').map((l) => ({ line_no: l.line_no, name: l.name, change_type: l.change_type })), total: commande.total },
    });
    await journaliser({ action: 'commande.proposition', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, version: version.version_no, total: commande.total } }, t);
    const nom = await nomDe(companyId, t);
    await notifierEntreprise(t, commande.buyer_company_id, P.ACHATS_LIRE, {
      type: indisponibles.length ? 'produit_indisponible' : 'proposition_recue',
      titre: `Proposition reçue — ${commande.number}`,
      corps: `${nom} propose une version modifiée de votre commande ${commande.number} (${formatFcfa(commande.total)})`
        + `${indisponibles.length ? ` — indisponible : ${indisponibles.join(', ').slice(0, 200)}` : ''}. Acceptez, refusez ou demandez une modification.`,
      donnees: { order_id: commande.id, number: commande.number, version_no: version.version_no },
    });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

/** Le fournisseur refuse la commande (aucun produit ne peut être fourni, client bloqué…). */
async function refuser(id, companyId, user, { reason, revision }) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'fournisseur');
    C.verifierRevision(commande, revision);
    C.verifierStatut(commande, 'refusee');
    const version = await versionProposee(commande, 'acheteur', t);
    const avant = commande.status;
    await version.update({ status: 'refusee', decided_at: new Date(), decided_by: user.id }, { transaction: t });
    await commande.update({ status: 'refusee', refused_at: new Date(), refusal_reason: reason }, { transaction: t });
    await C.historiser(t, commande, { type: 'refus', de: avant, vers: 'refusee', versionNo: version.version_no, acteur: user, companyId, cote: 'fournisseur', message: reason });
    await journaliser({ action: 'commande.refus', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, motif: reason } }, t);
    await notifierEntreprise(t, commande.buyer_company_id, P.ACHATS_LIRE, {
      type: 'commande_refusee',
      titre: `Commande ${commande.number} refusée`,
      corps: `${await nomDe(companyId, t)} a refusé votre commande ${commande.number} : ${reason}`,
      donnees: { order_id: commande.id, number: commande.number },
    });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

/** § 11 — l'acheteur accepte la proposition : la commande est automatiquement validée. */
async function accepterProposition(id, companyId, user, { revision } = {}) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'acheteur');
    C.verifierRevision(commande, revision);
    C.verifierStatut(commande, 'validee');
    const version = await versionProposee(commande, 'fournisseur', t);
    await valider(t, commande, version, user);
    await C.historiser(t, commande, { type: 'acceptation_proposition', de: 'proposition_modifiee', vers: 'validee', versionNo: version.version_no, acteur: user, companyId, cote: 'acheteur' });
    await C.historiser(t, commande, { type: 'validation', vers: 'validee', versionNo: version.version_no, companyId, details: { total: commande.total } });
    await journaliser({ action: 'commande.validation', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, version: version.version_no, total: commande.total } }, t);
    await notifierEntreprise(t, commande.supplier_company_id, P.VENTES_LIRE, {
      type: 'proposition_acceptee',
      titre: `Proposition acceptée — ${commande.number}`,
      corps: `${await nomDe(companyId, t)} a accepté votre proposition : la commande ${commande.number} est validée (${formatFcfa(commande.total)}).`,
      donnees: { order_id: commande.id, number: commande.number },
    });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

/** L'acheteur refuse la proposition : la commande est annulée. */
async function refuserProposition(id, companyId, user, { reason, revision }) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'acheteur');
    C.verifierRevision(commande, revision);
    C.verifierStatut(commande, 'annulee');
    const version = await versionProposee(commande, 'fournisseur', t);
    await version.update({ status: 'refusee', decided_at: new Date(), decided_by: user.id }, { transaction: t });
    await commande.update({ status: 'annulee', cancelled_at: new Date(), cancellation_reason: reason, cancelled_by_side: 'acheteur' }, { transaction: t });
    await C.historiser(t, commande, { type: 'refus_proposition', de: 'proposition_modifiee', vers: 'annulee', versionNo: version.version_no, acteur: user, companyId, cote: 'acheteur', message: reason });
    await journaliser({ action: 'commande.refus_proposition', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, motif: reason } }, t);
    await notifierEntreprise(t, commande.supplier_company_id, P.VENTES_LIRE, {
      type: 'proposition_refusee',
      titre: `Proposition refusée — ${commande.number}`,
      corps: `${await nomDe(companyId, t)} a refusé votre proposition pour la commande ${commande.number} : ${reason}`,
      donnees: { order_id: commande.id, number: commande.number },
    });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

/**
 * L'acheteur demande une nouvelle modification : contre-proposition (lignes
 * facultatives — sans elles, la proposition du fournisseur est renvoyée avec
 * le commentaire de l'acheteur). Retour « en attente de validation ».
 */
async function demanderModification(id, companyId, user, { lines = [], comment, revision }) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'acheteur');
    C.verifierRevision(commande, revision);
    C.verifierStatut(commande, 'en_attente_validation');
    const courante = await versionProposee(commande, 'fournisseur', t);
    const simples = courante.lines.map((l) => l.get({ plain: true }));
    const nouvelles = lines.length
      ? await L.lignesModifiees(commande.supplier_company_id, simples, lines, 'acheteur', t)
      : simples.map((l) => ({ ...l, change_type: l.change_type === 'indisponible' ? 'indisponible' : 'inchangee', original_quantity: null, original_unit_price: null }));
    await courante.update({ status: 'remplacee', decided_at: new Date(), decided_by: user.id }, { transaction: t });
    const version = await L.creerVersion(t, commande, {
      numero: courante.version_no + 1, cote: 'acheteur', auteur: user, statut: 'proposee', commentaire: comment, lignes: nouvelles,
    });
    await commande.update({ status: 'en_attente_validation' }, { transaction: t });
    await C.historiser(t, commande, { type: 'demande_modification', de: 'proposition_modifiee', vers: 'en_attente_validation', versionNo: version.version_no, acteur: user, companyId, cote: 'acheteur', message: comment });
    await journaliser({ action: 'commande.demande_modification', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, version: version.version_no } }, t);
    await notifierEntreprise(t, commande.supplier_company_id, P.VENTES_LIRE, {
      type: 'modification_demandee',
      titre: `Modification demandée — ${commande.number}`,
      corps: `${await nomDe(companyId, t)} demande une nouvelle modification de la commande ${commande.number} : ${comment.slice(0, 200)}`,
      donnees: { order_id: commande.id, number: commande.number, version_no: version.version_no },
    });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

module.exports = {
  prendreEnCharge, accepter, proposer, refuser, accepterProposition, refuserProposition, demanderModification,
};
