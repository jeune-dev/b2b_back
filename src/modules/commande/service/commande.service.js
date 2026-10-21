'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Order, OrderVersion, OrderLine, OrderEvent, Company, User,
} = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { ConflictError, ForbiddenError, ValidationError } = require('../../../errors/AppError.js');
const { prochainNumero, pad } = require('../../../utils/compteur.js');
const { aujourdhui } = require('../../../utils/dates.js');
const { ordre, periode } = require('../../../utils/liste.js');
const escapeLike = require('../../../utils/escapeLike.js');
const { formatFcfa } = require('../../../utils/montants.js');
const { transactionAvecFichiers } = require('../../../database/transaction.js');
const C = require('./commun.js');
const L = require('./lignes.service.js');
const partenariats = require('../../partenaire/service/partenariat.service.js');
const parametres = require('../../parametres/service/parametres.service.js');
const droits = require('../../abonnement/service/droits.service.js');
const documents = require('../../document/service/document.service.js');
const modeles = require('../../modele/service/modele.service.js');
const email = require('../../../infrastructure/email.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');
const logger = require('../../../utils/logger.js');

/**
 * Bons de commande (§ 9) — création par l'acheteur, envoi, annulation,
 * consultation, historique (§ 20), échanges (commentaires, pièces jointes).
 *
 * « Il n'y a pas de panier classique » : l'acheteur choisit un fournisseur,
 * sélectionne produits et quantités ; Pro2Link génère le bon de commande
 * (numéro, acheteur, fournisseur, produits, quantités, prix, total, date,
 * conditions). Le bon reste un BROUILLON modifiable jusqu'à son envoi.
 */

// ── Lecture ─────────────────────────────────────────────────────────────────

/** Filtres communs des listes d'achats et de ventes. */
function filtres(f) {
  const conditions = [];
  if (f.status) conditions.push({ status: { [Op.in]: String(f.status).split(',') } });
  if (f.q) {
    const motif = `%${escapeLike(f.q)}%`;
    conditions.push({ [Op.or]: [{ number: { [Op.iLike]: motif } }, { buyer_reference: { [Op.iLike]: motif } }] });
  }
  const dates = periode(f.du ? new Date(`${f.du}T00:00:00Z`) : null, f.au ? new Date(`${f.au}T23:59:59.999Z`) : null);
  if (dates) conditions.push({ created_at: dates });
  // Synchronisation incrémentale du mobile (§ 23) : seulement ce qui a changé.
  if (f.modifie_depuis) conditions.push({ updated_at: { [Op.gt]: f.modifie_depuis } });
  return conditions;
}

function versApiListe(commande, cote) {
  const c = commande.toJSON();
  return { ...c, side: cote, actions: C.actionsPossibles(c.status, cote) };
}

/** § 18 — commandes de l'acheteur ; `a_traiter` : propositions à valider, livraisons à réceptionner. */
async function listerAchats(companyId, f, { limit, offset }) {
  const conditions = [{ buyer_company_id: companyId }, ...filtres(f)];
  if (f.supplier_id) conditions.push({ supplier_company_id: f.supplier_id });
  if (f.a_traiter) conditions.push({ status: { [Op.in]: ['brouillon', 'proposition_modifiee', 'livree'] } });
  const { rows, count } = await Order.findAndCountAll({
    where: { [Op.and]: conditions },
    include: C.INCLUDES_LISTE,
    order: ordre(f.tri, '-created_at'),
    limit,
    offset,
  });
  return { rows: rows.map((o) => versApiListe(o, 'acheteur')), count };
}

/** § 19 — commandes reçues par le fournisseur (jamais les brouillons du client). */
async function listerVentes(companyId, f, { limit, offset }) {
  const conditions = [{ supplier_company_id: companyId }, { status: { [Op.ne]: 'brouillon' } }, ...filtres(f)];
  if (f.client_id) conditions.push({ buyer_company_id: f.client_id });
  if (f.a_traiter) conditions.push({ status: { [Op.in]: ['envoyee', 'en_attente_validation', 'validee', 'en_preparation', 'prete', 'reception_confirmee'] } });
  const { rows, count } = await Order.findAndCountAll({
    where: { [Op.and]: conditions },
    include: C.INCLUDES_LISTE,
    order: ordre(f.tri, '-sent_at', { sent_at: ['sent_at'] }),
    limit,
    offset,
  });
  return { rows: rows.map((o) => versApiListe(o, 'fournisseur')), count };
}

/**
 * Détail : en-tête, parties, version courante (et version validée si elle
 * diffère), facture, actions possibles pour l'appelant.
 */
async function detail(id, companyId, coteExige = null) {
  const { commande, cote } = await C.charger(id, companyId, { include: C.INCLUDES_DETAIL }, { cote: coteExige });
  const [courante, validee] = await Promise.all([
    C.version(commande.id, commande.current_version_no),
    commande.validated_version_no && commande.validated_version_no !== commande.current_version_no
      ? C.version(commande.id, commande.validated_version_no) : null,
  ]);
  return {
    ...commande.toJSON(),
    side: cote,
    actions: C.actionsPossibles(commande.status, cote),
    current_version: courante,
    validated_version: validee || (commande.validated_version_no ? courante : null),
  };
}

/** Toutes les versions (bon initial, propositions, contre-propositions) avec leurs lignes. */
async function versions(id, companyId, coteExige = null) {
  const { commande } = await C.charger(id, companyId, { attributes: ['id', 'buyer_company_id', 'supplier_company_id', 'status'] }, { cote: coteExige });
  return OrderVersion.findAll({
    where: { order_id: commande.id, status: { [Op.ne]: 'brouillon' } },
    include: [{ model: OrderLine, as: 'lines', separate: true, order: [['line_no', 'ASC']] }],
    order: [['version_no', 'ASC']],
  });
}

/** § 20 — historique : qui a fait quoi et à quel moment. */
async function historique(id, companyId, coteExige = null) {
  const { commande } = await C.charger(id, companyId, { attributes: ['id', 'buyer_company_id', 'supplier_company_id', 'status'] }, { cote: coteExige });
  return OrderEvent.findAll({
    where: { order_id: commande.id },
    include: [
      { model: User, as: 'actor', attributes: ['id', 'first_name', 'last_name'], paranoid: false },
      { model: Company, as: 'actorCompany', attributes: ['id', 'name'], paranoid: false },
    ],
    order: [['created_at', 'ASC'], ['id', 'ASC']],
  });
}

// ── Brouillon ───────────────────────────────────────────────────────────────

/** Numéro lisible et sans trou, par acheteur et par année : BC-2026-00042. */
async function nouveauNumero(companyId, t) {
  const annee = aujourdhui().slice(0, 4);
  const { order_prefix: prefixe } = await parametres.entreprise(companyId, t);
  const n = await prochainNumero(`company:${companyId}:order:${annee}`, t);
  return `${prefixe}-${annee}-${pad(n)}`;
}

const CHAMPS_ENTETE = ['buyer_reference', 'delivery_address', 'requested_delivery_date', 'conditions'];

/**
 * § 9.1 — création du bon de commande : fournisseur au partenariat ACTIF,
 * produits de SON catalogue, quantités. Statut brouillon ; l'acheteur
 * l'envoie quand sa sélection est terminée.
 */
async function creer(companyId, user, donnees) {
  return sequelize.transaction(async (t) => {
    const partenariat = await partenariats.exigerActif(companyId, donnees.supplier_id, t);
    const lignes = await L.lignesAcheteur(donnees.supplier_id, donnees.lines, t);
    const reglages = await parametres.entreprise(companyId, t);
    const commande = await Order.create({
      number: await nouveauNumero(companyId, t),
      buyer_company_id: companyId,
      supplier_company_id: donnees.supplier_id,
      partnership_id: partenariat.id,
      status: 'brouillon',
      ...Object.fromEntries(CHAMPS_ENTETE.map((c) => [c, donnees[c] ?? null])),
      conditions: donnees.conditions ?? reglages.default_order_conditions ?? null,
      created_by: user.id,
    }, { transaction: t });
    await L.creerVersion(t, commande, { numero: 1, cote: 'acheteur', auteur: user, statut: 'brouillon', lignes });
    await C.historiser(t, commande, { type: 'creation', vers: 'brouillon', versionNo: 1, acteur: user, companyId, cote: 'acheteur' });
    await journaliser({ action: 'commande.creation', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, fournisseur: donnees.supplier_id, total: commande.total } }, t);
    await C.apresChangement(t, commande);
    return commande.id;
  }).then((id) => detail(id, companyId));
}

/** Modification du brouillon (en-tête et/ou lignes). */
async function modifierBrouillon(id, companyId, user, donnees) {
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'acheteur');
    C.verifierRevision(commande, donnees.revision);
    if (commande.status !== 'brouillon') {
      throw new ConflictError('Seul un bon de commande en brouillon peut être modifié. Après envoi, demandez une modification au fournisseur.', 'COMMANDE_NON_MODIFIABLE');
    }
    const entete = Object.fromEntries(CHAMPS_ENTETE.filter((c) => c in donnees).map((c) => [c, donnees[c]]));
    if (Object.keys(entete).length) await commande.update(entete, { transaction: t });
    if (donnees.lines) {
      const lignes = await L.lignesAcheteur(commande.supplier_company_id, donnees.lines, t);
      const version = await OrderVersion.findOne({ where: { order_id: commande.id, version_no: 1 }, transaction: t });
      await L.remplacerLignes(t, commande, version, lignes);
    }
    await C.historiser(t, commande, { type: 'modification', versionNo: 1, acteur: user, companyId, cote: 'acheteur', details: { champs: [...Object.keys(entete), ...(donnees.lines ? ['lines'] : [])] } });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

/**
 * § 9.1 « L'acheteur peut ensuite envoyer le bon de commande au
 * fournisseur ». Le modèle de bon de commande de l'acheteur (§ 15) est figé
 * sur la commande ; la limite mensuelle du forfait s'applique ici.
 */
async function envoyer(id, companyId, user, { revision } = {}) {
  let resume;
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'acheteur');
    C.verifierRevision(commande, revision);
    C.verifierStatut(commande, 'envoyee');
    await partenariats.exigerActif(companyId, commande.supplier_company_id, t);
    await droits.verifierLimite(companyId, 'orders_month', t);
    if (!commande.lines_count) throw new ValidationError('Données invalides', ['Le bon de commande ne contient aucun produit'], 'COMMANDE_VIDE');

    const modele = await modeles.modeleActif(companyId, 'bon_commande', t);
    await OrderVersion.update({ status: 'proposee' }, { where: { order_id: commande.id, version_no: 1 }, transaction: t });
    await commande.update({ status: 'envoyee', sent_at: new Date(), template_id: modele?.id || null }, { transaction: t });
    await C.historiser(t, commande, { type: 'envoi', de: 'brouillon', vers: 'envoyee', versionNo: 1, acteur: user, companyId, cote: 'acheteur' });
    await journaliser({ action: 'commande.envoi', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, total: commande.total } }, t);

    const acheteur = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    const fournisseur = await Company.findByPk(commande.supplier_company_id, { attributes: ['email'], transaction: t });
    await notifierEntreprise(t, commande.supplier_company_id, P.VENTES_LIRE, {
      type: 'nouveau_bon_commande',
      titre: 'Nouveau bon de commande',
      corps: `${acheteur.name} vous a envoyé le bon de commande ${commande.number} (${formatFcfa(commande.total)}).`,
      donnees: { order_id: commande.id, number: commande.number },
    });
    resume = { email: fournisseur.email, number: commande.number, client: acheteur.name, id: commande.id, total: commande.total };
    await C.apresChangement(t, commande);
  });
  if (resume.email) {
    email.envoyerAvis({
      email: resume.email,
      titre: `Nouveau bon de commande ${resume.number}`,
      texte: `${resume.client} vous a envoyé le bon de commande ${resume.number} d'un montant de ${formatFcfa(resume.total)}.`,
      lien: `/ventes/${resume.id}`,
    }).catch((err) => logger.warn('[commande] Avis e-mail impossible', { error: err.message }));
  }
  return detail(id, companyId);
}

/**
 * Annulation.
 *   - Acheteur : tant que la commande n'est pas en préparation (brouillon,
 *     envoyée, en négociation, validée).
 *   - Fournisseur : une commande VALIDÉE qu'il ne peut plus honorer (avant
 *     préparation) ; avant validation, il la refuse.
 * L'autre partie est notifiée ; le motif est conservé.
 */
async function annuler(id, companyId, user, { reason, revision }, coteExige = null) {
  await sequelize.transaction(async (t) => {
    const { commande, cote } = await C.chargerPourModifier(id, companyId, t, coteExige);
    C.verifierRevision(commande, revision);
    if (cote === 'fournisseur' && commande.status !== 'validee') {
      throw new ForbiddenError('Avant validation, le fournisseur refuse la commande plutôt que de l’annuler.', 'ACTION_RESERVEE_AUTRE_PARTIE');
    }
    C.verifierStatut(commande, 'annulee');
    const avant = commande.status;
    await commande.update({ status: 'annulee', cancelled_at: new Date(), cancellation_reason: reason, cancelled_by_side: cote }, { transaction: t });
    await OrderVersion.update({ status: 'refusee', decided_at: new Date(), decided_by: user.id }, {
      where: { order_id: commande.id, version_no: commande.current_version_no, status: 'proposee' }, transaction: t,
    });
    await C.historiser(t, commande, { type: 'annulation', de: avant, vers: 'annulee', acteur: user, companyId, cote, message: reason });
    await journaliser({ action: 'commande.annulation', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, de: avant, motif: reason } }, t);
    if (avant !== 'brouillon') {
      const autre = cote === 'acheteur' ? commande.supplier_company_id : commande.buyer_company_id;
      const moi = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
      await notifierEntreprise(t, autre, cote === 'acheteur' ? P.VENTES_LIRE : P.ACHATS_LIRE, {
        type: 'commande_annulee',
        titre: `Commande ${commande.number} annulée`,
        corps: `${moi.name} a annulé la commande ${commande.number} : ${reason}`,
        donnees: { order_id: commande.id, number: commande.number },
      });
    }
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

/** Message échangé sur une commande (« faciliter les échanges », § 3). */
async function commenter(id, companyId, user, { message }, coteExige = null) {
  return sequelize.transaction(async (t) => {
    const { commande, cote } = await C.chargerPourModifier(id, companyId, t, coteExige);
    if (commande.status === 'brouillon') throw new ConflictError('Envoyez d’abord le bon de commande pour échanger avec le fournisseur.', 'COMMANDE_NON_ENVOYEE');
    const evenement = await C.historiser(t, commande, { type: 'commentaire', acteur: user, companyId, cote, message });
    const autre = cote === 'acheteur' ? commande.supplier_company_id : commande.buyer_company_id;
    const moi = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await notifierEntreprise(t, autre, cote === 'acheteur' ? P.VENTES_LIRE : P.ACHATS_LIRE, {
      type: 'commentaire',
      titre: `Message sur la commande ${commande.number}`,
      corps: `${moi.name} : ${message.slice(0, 200)}`,
      donnees: { order_id: commande.id, number: commande.number },
    });
    await C.apresChangement(t, commande);
    return evenement;
  });
}

/**
 * Pièce jointe partagée avec l'autre partie (cahier des charges, bon de
 * livraison complémentaire, photo d'un produit reçu…).
 */
async function joindre(id, companyId, user, fichier, { description = null } = {}, coteExige = null) {
  return transactionAvecFichiers(async (t) => {
    const { commande, cote } = await C.chargerPourModifier(id, companyId, t, coteExige);
    if (['annulee', 'refusee', 'terminee'].includes(commande.status)) {
      throw new ConflictError('Cette commande est close.', 'COMMANDE_CLOSE');
    }
    const autre = cote === 'acheteur' ? commande.supplier_company_id : commande.buyer_company_id;
    const document = await documents.creerDocument({
      companyId,
      partnerCompanyId: autre,
      entityType: 'order',
      entityId: commande.id,
      category: 'piece_jointe',
      // Le brouillon n'est pas encore partagé : il le sera à l'envoi.
      visibility: 'partenaire',
      fichier,
      uploadedBy: user.id,
    }, t);
    await C.historiser(t, commande, { type: 'piece_jointe', acteur: user, companyId, cote, message: description, details: { document_id: document.id, nom: document.original_name } });
    await C.apresChangement(t, commande);
    return documents.versApi(document);
  });
}

module.exports = {
  listerAchats, listerVentes, detail, versions, historique,
  creer, modifierBrouillon, envoyer, annuler, commenter, joindre,
};
