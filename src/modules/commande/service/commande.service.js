'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Order, OrderVersion, OrderLine, OrderEvent, OrderApproval, Delivery, DeliveryLine, Company, User, Product,
} = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { EVENEMENTS_INTERNES_ACHETEUR } = require('../../../config/enums.js');
const { parametresEntreprise, approbationsRequises } = require('../../../config/parametres.js');
const {
  AppError, ConflictError, ForbiddenError, ValidationError,
} = require('../../../errors/AppError.js');
const { prochainNumero, pad } = require('../../../utils/compteur.js');
const { aujourdhui } = require('../../../utils/dates.js');
const { ordre, periode } = require('../../../utils/liste.js');
const escapeLike = require('../../../utils/escapeLike.js');
const { formatFcfa } = require('../../../utils/montants.js');
const {
  lireCsv, nombre, colonnes,
} = require('../../../utils/csvLecture.js');
const { transactionAvecFichiers } = require('../../../database/transaction.js');
const C = require('./commun.js');
const L = require('./lignes.service.js');
const partenariats = require('../../partenaire/service/partenariat.service.js');
const parametres = require('../../parametres/service/parametres.service.js');
const droits = require('../../abonnement/service/droits.service.js');
const documents = require('../../document/service/document.service.js');
const modeles = require('../../modele/service/modele.service.js');
const stock = require('../../catalogue/service/stock.service.js');
const email = require('../../../infrastructure/email.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifier, notifierEntreprise, destinatairesEntreprise } = require('../../notification/service/notification.service.js');
const logger = require('../../../utils/logger.js');

/**
 * Bons de commande (§ 9) — création par l'acheteur, envoi, annulation,
 * consultation, historique (§ 20), échanges (commentaires, pièces jointes).
 *
 * « Il n'y a pas de panier classique » : l'acheteur choisit un fournisseur,
 * sélectionne produits et quantités ; Pro2Link génère le bon de commande
 * (numéro, acheteur, fournisseur, produits, quantités, prix, total, date,
 * conditions). Le bon reste un BROUILLON modifiable jusqu'à son envoi.
 *
 * Avant de partir chez le fournisseur, le bon passe les contrôles :
 *   - montant minimum de commande du fournisseur ;
 *   - plafond de crédit et blocage en cas de factures échues (partenariat) ;
 *   - circuit d'APPROBATION interne de l'acheteur au-delà d'un seuil : le bon
 *     attend alors les approbations requises, puis part automatiquement.
 *
 * Saisie accélérée : recommander une commande passée, commander depuis une
 * liste d'achat, importer un fichier CSV (référence ; quantité).
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

/** Représentation d'une commande vue d'un côté (le circuit d'approbation reste interne à l'acheteur). */
function versApiCote(commande, cote) {
  const c = commande.toJSON ? commande.toJSON() : commande;
  const resultat = { ...c, side: cote, actions: C.actionsPossibles(c, cote) };
  if (cote === 'fournisseur') {
    for (const champ of ['approval_status', 'approvals_required', 'approval_round', 'approval_requested_at', 'approval_requested_by', 'approved_at', 'purchase_list_id', 'source_order_id']) {
      delete resultat[champ];
    }
  }
  return resultat;
}

/** § 18 — commandes de l'acheteur ; `a_traiter` : brouillons, propositions à valider, livraisons à réceptionner. */
async function listerAchats(companyId, f, { limit, offset }) {
  const conditions = [{ buyer_company_id: companyId }, ...filtres(f)];
  if (f.supplier_id) conditions.push({ supplier_company_id: f.supplier_id });
  if (f.a_traiter) conditions.push({ status: { [Op.in]: ['brouillon', 'proposition_modifiee', 'livree_partiellement', 'livree'] } });
  if (f.approbation) conditions.push({ approval_status: f.approbation });
  const { rows, count } = await Order.findAndCountAll({
    where: { [Op.and]: conditions },
    include: C.INCLUDES_LISTE,
    order: ordre(f.tri, '-created_at'),
    limit,
    offset,
  });
  return { rows: rows.map((o) => versApiCote(o, 'acheteur')), count };
}

/** § 19 — commandes reçues par le fournisseur (jamais les brouillons du client). */
async function listerVentes(companyId, f, { limit, offset }) {
  const conditions = [{ supplier_company_id: companyId }, { status: { [Op.ne]: 'brouillon' } }, ...filtres(f)];
  if (f.client_id) conditions.push({ buyer_company_id: f.client_id });
  if (f.a_traiter) conditions.push({ status: { [Op.in]: ['envoyee', 'en_attente_validation', 'validee', 'en_preparation', 'prete', 'livree_partiellement', 'reception_confirmee'] } });
  const { rows, count } = await Order.findAndCountAll({
    where: { [Op.and]: conditions },
    include: C.INCLUDES_LISTE,
    order: ordre(f.tri, '-sent_at', { sent_at: ['sent_at'] }),
    limit,
    offset,
  });
  return { rows: rows.map((o) => versApiCote(o, 'fournisseur')), count };
}

/**
 * Détail : en-tête, parties, version courante (et version validée si elle
 * diffère), livraisons, facture, actions possibles pour l'appelant ; côté
 * acheteur, les décisions d'approbation du tour en cours.
 */
async function detail(id, companyId, coteExige = null) {
  const { commande, cote } = await C.charger(id, companyId, { include: C.INCLUDES_DETAIL }, { cote: coteExige });
  const [courante, validee, livraisons, approbations] = await Promise.all([
    C.version(commande.id, commande.current_version_no),
    commande.validated_version_no && commande.validated_version_no !== commande.current_version_no
      ? C.version(commande.id, commande.validated_version_no) : null,
    commande.deliveries_count
      ? Delivery.findAll({ where: { order_id: commande.id }, include: [{ model: DeliveryLine, as: 'lines', separate: true, order: [['line_no', 'ASC']] }], order: [['delivery_no', 'ASC']] })
      : [],
    cote === 'acheteur' && commande.approval_round
      ? OrderApproval.findAll({
        where: { order_id: commande.id, round: commande.approval_round },
        include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name'], paranoid: false }],
        order: [['created_at', 'ASC']],
      })
      : null,
  ]);
  return {
    ...versApiCote(commande, cote),
    current_version: courante,
    validated_version: validee || (commande.validated_version_no ? courante : null),
    deliveries: livraisons,
    ...(approbations ? { approvals: approbations } : {}),
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

/**
 * § 20 — historique : qui a fait quoi et à quel moment. Le fournisseur ne
 * voit pas la vie interne du brouillon chez l'acheteur (création,
 * modifications, circuit d'approbation).
 */
async function historique(id, companyId, coteExige = null) {
  const { commande, cote } = await C.charger(id, companyId, { attributes: ['id', 'buyer_company_id', 'supplier_company_id', 'status'] }, { cote: coteExige });
  return OrderEvent.findAll({
    where: { order_id: commande.id, ...(cote === 'fournisseur' ? { type: { [Op.notIn]: EVENEMENTS_INTERNES_ACHETEUR } } : {}) },
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
 * produits de SON catalogue (par identifiant ou par référence), quantités,
 * au prix du client. Statut brouillon ; l'acheteur l'envoie quand sa
 * sélection est terminée.
 * @param {{ sourceOrderId?: string, purchaseListId?: string, origine?: string }} [provenance]
 */
async function creerDansTransaction(t, companyId, user, donnees, { sourceOrderId = null, purchaseListId = null, origine = null } = {}) {
  const partenariat = await partenariats.exigerActif(companyId, donnees.supplier_id, t);
  const lignes = await L.lignesAcheteur(donnees.supplier_id, companyId, donnees.lines, t);
  const reglages = await parametres.entreprise(companyId, t);
  const commande = await Order.create({
    number: await nouveauNumero(companyId, t),
    buyer_company_id: companyId,
    supplier_company_id: donnees.supplier_id,
    partnership_id: partenariat.id,
    status: 'brouillon',
    ...Object.fromEntries(CHAMPS_ENTETE.map((c) => [c, donnees[c] ?? null])),
    conditions: donnees.conditions ?? reglages.default_order_conditions ?? null,
    source_order_id: sourceOrderId,
    purchase_list_id: purchaseListId,
    created_by: user.id,
  }, { transaction: t });
  await L.creerVersion(t, commande, { numero: 1, cote: 'acheteur', auteur: user, statut: 'brouillon', lignes });
  await C.historiser(t, commande, {
    type: 'creation', vers: 'brouillon', versionNo: 1, acteur: user, companyId, cote: 'acheteur',
    details: origine ? { origine, source_order_id: sourceOrderId, purchase_list_id: purchaseListId } : null,
  });
  await journaliser({ action: 'commande.creation', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, fournisseur: donnees.supplier_id, total: commande.total, origine } }, t);
  await C.apresChangement(t, commande);
  return commande;
}

async function creer(companyId, user, donnees, provenance = {}) {
  const commande = await sequelize.transaction((t) => creerDansTransaction(t, companyId, user, donnees, provenance));
  return detail(commande.id, companyId);
}

/**
 * Modification du brouillon (en-tête et/ou lignes). Un bon soumis à
 * approbation, approuvé ou rejeté redevient « non soumis » : ce qui a été
 * approuvé n'est plus ce qui partirait.
 */
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
      const lignes = await L.lignesAcheteur(commande.supplier_company_id, companyId, donnees.lines, t);
      const version = await OrderVersion.findOne({ where: { order_id: commande.id, version_no: 1 }, transaction: t });
      await L.remplacerLignes(t, commande, version, lignes);
    }
    const approbationRetiree = commande.approval_status !== 'non_requise';
    if (approbationRetiree) await commande.update({ approval_status: 'non_requise', approved_at: null }, { transaction: t });
    await C.historiser(t, commande, {
      type: 'modification', versionNo: 1, acteur: user, companyId, cote: 'acheteur',
      details: { champs: [...Object.keys(entete), ...(donnees.lines ? ['lines'] : [])], approbation_retiree: approbationRetiree },
    });
    await C.apresChangement(t, commande);
  });
  return detail(id, companyId);
}

// ── Envoi ───────────────────────────────────────────────────────────────────

/**
 * Contrôles AVANT envoi (aucune écriture : un refus laisse la transaction
 * intacte) : statut, partenariat, forfait, contenu, minimum de commande du
 * fournisseur, plafond de crédit.
 */
async function controlesEnvoi(t, commande, companyId) {
  C.verifierStatut(commande, 'envoyee');
  const partenariat = await partenariats.exigerActif(companyId, commande.supplier_company_id, t);
  await droits.verifierLimite(companyId, 'orders_month', t);
  if (!commande.lines_count) throw new ValidationError('Données invalides', ['Le bon de commande ne contient aucun produit'], 'COMMANDE_VIDE');
  const fournisseur = await Company.findByPk(commande.supplier_company_id, { attributes: ['settings'], transaction: t });
  const minimum = parametresEntreprise(fournisseur).min_order_amount;
  if (minimum && Number(commande.subtotal) < minimum) {
    throw new ValidationError(
      'Données invalides',
      [`Montant minimum de commande chez ce fournisseur : ${formatFcfa(minimum)} HT (bon actuel : ${formatFcfa(commande.subtotal)} HT)`],
      'MINIMUM_COMMANDE'
    );
  }
  await partenariats.verifierCredit(partenariat, commande.total, t);
}

/**
 * Envoi effectif au fournisseur : le modèle de bon de commande de
 * l'acheteur (§ 15) est figé sur la commande, le fournisseur est notifié.
 * @returns {Promise<object>} éléments de l'avis e-mail (envoyé après COMMIT)
 */
async function executerEnvoi(t, commande, user, companyId) {
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
  await C.apresChangement(t, commande);
  return { email: fournisseur.email, number: commande.number, client: acheteur.name, id: commande.id, total: commande.total };
}

function avisEnvoi(resume) {
  if (!resume?.email) return;
  email.envoyerAvis({
    email: resume.email,
    titre: `Nouveau bon de commande ${resume.number}`,
    texte: `${resume.client} vous a envoyé le bon de commande ${resume.number} d'un montant de ${formatFcfa(resume.total)}.`,
    lien: `/ventes/${resume.id}`,
  }).catch((err) => logger.warn('[commande] Avis e-mail impossible', { error: err.message }));
}

/** Approbateurs possibles : permission achats.approuver, ni l'auteur ni le demandeur du bon. */
async function approbateurs(commande, demandeurId, t) {
  const tous = await destinatairesEntreprise(commande.buyer_company_id, P.ACHATS_APPROUVER, t);
  return tous.filter((d) => d.userId !== demandeurId && d.userId !== commande.created_by);
}

/** Soumission au circuit d'approbation interne (nouveau tour). */
async function soumettre(t, commande, user, companyId, requis) {
  if (commande.approval_status === 'en_attente') {
    throw new ConflictError('Ce bon de commande attend déjà les approbations requises.', 'APPROBATION_EN_COURS');
  }
  const candidats = await approbateurs(commande, user.id, t);
  if (candidats.length < requis) {
    throw new ConflictError(
      `Ce bon de commande (${formatFcfa(commande.total)}) exige ${requis} approbation(s), mais seulement ${candidats.length} autre(s) membre(s) peuvent approuver. Attribuez le droit d'approbation ou ajustez les seuils.`,
      'APPROBATEURS_INSUFFISANTS',
      { requises: requis, disponibles: candidats.length }
    );
  }
  await commande.update({
    approval_status: 'en_attente',
    approvals_required: requis,
    approval_round: commande.approval_round + 1,
    approval_requested_at: new Date(),
    approval_requested_by: user.id,
    approved_at: null,
  }, { transaction: t });
  await C.historiser(t, commande, {
    type: 'soumission_approbation', versionNo: 1, acteur: user, companyId, cote: 'acheteur',
    details: { requises: requis, total: commande.total, tour: commande.approval_round },
  });
  await journaliser({ action: 'commande.soumission_approbation', entityType: 'order', entityId: commande.id, companyId, details: { number: commande.number, total: commande.total, requises: requis } }, t);
  await notifier(t, {
    destinataires: candidats,
    companyId,
    type: 'approbation_requise',
    titre: `Approbation requise — ${commande.number}`,
    corps: `${user.first_name} ${user.last_name} demande votre approbation pour le bon de commande ${commande.number} (${formatFcfa(commande.total)}).`,
    donnees: { order_id: commande.id, number: commande.number },
  });
  await C.apresChangement(t, commande);
}

/**
 * § 9.1 « L'acheteur peut ensuite envoyer le bon de commande au
 * fournisseur ». Si son montant atteint un seuil d'approbation interne et
 * qu'il n'est pas encore approuvé, il est SOUMIS aux approbateurs : il partira
 * automatiquement à la dernière approbation.
 * @returns {Promise<{ commande: object, soumise: boolean }>}
 */
async function envoyer(id, companyId, user, { revision } = {}) {
  let resume = null;
  let soumise = false;
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'acheteur');
    C.verifierRevision(commande, revision);
    await controlesEnvoi(t, commande, companyId);
    const acheteur = await Company.findByPk(companyId, { attributes: ['settings'], transaction: t });
    const requis = approbationsRequises(parametresEntreprise(acheteur), commande.total);
    if (requis > 0 && commande.approval_status !== 'approuvee') {
      await soumettre(t, commande, user, companyId, requis);
      soumise = true;
      return;
    }
    resume = await executerEnvoi(t, commande, user, companyId);
  });
  avisEnvoi(resume);
  return { commande: await detail(id, companyId), soumise };
}

/**
 * Décision d'un approbateur. À la dernière approbation requise, le bon part
 * chez le fournisseur ; si un contrôle d'envoi échoue alors (plafond de
 * crédit atteint entre-temps…), le bon reste approuvé en brouillon et le
 * demandeur en est averti.
 */
async function decider(id, companyId, user, { decision, comment = null, revision }) {
  let resume = null;
  let refusEnvoi = null;
  await sequelize.transaction(async (t) => {
    const { commande } = await C.chargerPourModifier(id, companyId, t, 'acheteur');
    C.verifierRevision(commande, revision);
    if (commande.status !== 'brouillon' || commande.approval_status !== 'en_attente') {
      throw new ConflictError("Ce bon de commande n'attend aucune approbation.", 'AUCUNE_APPROBATION');
    }
    if (user.id === commande.approval_requested_by || user.id === commande.created_by) {
      throw new ForbiddenError("L'auteur d'un bon de commande ne peut pas l'approuver lui-même.", 'APPROBATION_PAR_AUTEUR');
    }
    const deja = await OrderApproval.findOne({ where: { order_id: id, round: commande.approval_round, user_id: user.id }, transaction: t });
    if (deja) throw new ConflictError('Vous avez déjà donné votre décision sur ce bon de commande.', 'DECISION_DEJA_PRISE');
    await OrderApproval.create({
      order_id: id, round: commande.approval_round, user_id: user.id, decision, comment, order_total: commande.total,
    }, { transaction: t });
    const demandeur = [{ userId: commande.approval_requested_by }];

    if (decision === 'rejetee') {
      await commande.update({ approval_status: 'rejetee' }, { transaction: t });
      await C.historiser(t, commande, { type: 'rejet_approbation', versionNo: 1, acteur: user, companyId, cote: 'acheteur', message: comment });
      await journaliser({ action: 'commande.rejet_approbation', entityType: 'order', entityId: id, companyId, details: { number: commande.number, motif: comment } }, t);
      await notifier(t, {
        destinataires: demandeur, companyId, type: 'approbation_rejetee',
        titre: `Approbation rejetée — ${commande.number}`,
        corps: `${user.first_name} ${user.last_name} a rejeté le bon de commande ${commande.number} : ${comment}`,
        donnees: { order_id: id, number: commande.number },
      });
      await C.apresChangement(t, commande);
      return;
    }

    const accordees = await OrderApproval.count({ where: { order_id: id, round: commande.approval_round, decision: 'approuvee' }, transaction: t });
    await C.historiser(t, commande, {
      type: 'approbation', versionNo: 1, acteur: user, companyId, cote: 'acheteur', message: comment,
      details: { accordees, requises: commande.approvals_required },
    });
    await journaliser({ action: 'commande.approbation', entityType: 'order', entityId: id, companyId, details: { number: commande.number, accordees, requises: commande.approvals_required } }, t);
    if (accordees < commande.approvals_required) {
      await C.apresChangement(t, commande);
      return;
    }
    await commande.update({ approval_status: 'approuvee', approved_at: new Date() }, { transaction: t });
    try {
      await controlesEnvoi(t, commande, companyId);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      refusEnvoi = err.message;
    }
    if (refusEnvoi) {
      await notifier(t, {
        destinataires: demandeur, companyId, type: 'commande_approuvee',
        titre: `Approuvé mais non envoyé — ${commande.number}`,
        corps: `Le bon de commande ${commande.number} est approuvé mais n'a pas pu partir : ${refusEnvoi}`,
        donnees: { order_id: id, number: commande.number },
      });
      await C.apresChangement(t, commande);
      return;
    }
    await notifier(t, {
      destinataires: demandeur, companyId, type: 'commande_approuvee',
      titre: `Commande approuvée — ${commande.number}`,
      corps: `Le bon de commande ${commande.number} est approuvé : il a été envoyé au fournisseur.`,
      donnees: { order_id: id, number: commande.number },
    });
    resume = await executerEnvoi(t, commande, user, companyId);
  });
  avisEnvoi(resume);
  return { commande: await detail(id, companyId), envoyee: Boolean(resume), refus_envoi: refusEnvoi };
}

/** Bons de commande attendant MA décision (approbateur). */
async function aApprouver(companyId, user, { limit, offset }) {
  const where = {
    buyer_company_id: companyId,
    status: 'brouillon',
    approval_status: 'en_attente',
    approval_requested_by: { [Op.ne]: user.id },
    created_by: { [Op.ne]: user.id },
    [Op.and]: [sequelize.literal(`NOT EXISTS (SELECT 1 FROM order_approvals a WHERE a.order_id = "Order"."id" AND a.round = "Order"."approval_round" AND a.user_id = ${sequelize.escape(user.id)})`)],
  };
  const { rows, count } = await Order.findAndCountAll({
    where, include: C.INCLUDES_LISTE, order: [['approval_requested_at', 'ASC']], limit, offset,
  });
  return { rows: rows.map((o) => versApiCote(o, 'acheteur')), count };
}

// ── Saisie accélérée ────────────────────────────────────────────────────────

/**
 * Recommander en un clic : nouveau brouillon reprenant les produits et
 * quantités d'une commande passée (version validée, sinon courante), AUX
 * PRIX ACTUELS. Les produits devenus indisponibles, désactivés ou dont la
 * quantité ne respecte plus les règles du fournisseur sont écartés et listés.
 */
async function recommander(id, companyId, user) {
  const { commande } = await C.charger(id, companyId, {}, { cote: 'acheteur' });
  const version = await C.version(commande.id, commande.validated_version_no || commande.current_version_no);
  const lignes = version.lines.filter((l) => Number(l.quantity) > 0 && l.product_id);
  const produits = new Map((await Product.findAll({
    where: { id: { [Op.in]: lignes.map((l) => l.product_id) }, company_id: commande.supplier_company_id },
  })).map((p) => [p.id, p]));
  const ecartees = [];
  const saisies = [];
  for (const l of lignes) {
    const p = produits.get(l.product_id);
    let motif = null;
    if (!p || !p.is_active) motif = 'produit retiré du catalogue';
    else if (p.availability === 'rupture') motif = 'produit indisponible';
    else if (L.erreursQuantite(p, Number(l.quantity), 'Quantité').length) motif = L.erreursQuantite(p, Number(l.quantity), 'Quantité').join(' ; ');
    if (motif) ecartees.push({ line_no: l.line_no, reference: l.reference, name: l.name, quantity: Number(l.quantity), reason: motif });
    else saisies.push({ product_id: l.product_id, quantity: Number(l.quantity), comment: l.comment || null });
  }
  if (!saisies.length) {
    throw new ConflictError('Aucun produit de cette commande ne peut être recommandé aujourd’hui.', 'RIEN_A_RECOMMANDER', { lignes_ecartees: ecartees });
  }
  const nouvelle = await creer(companyId, user, {
    supplier_id: commande.supplier_company_id,
    lines: saisies,
    delivery_address: commande.delivery_address,
    conditions: commande.conditions,
  }, { sourceOrderId: commande.id, origine: 'recommande' });
  return { commande: nouvelle, lignes_ecartees: ecartees };
}

/** Synonymes d'en-têtes du CSV de commande (normalisés). */
const COLONNES_IMPORT = {
  reference: ['reference', 'ref', 'code', 'code_produit', 'article', 'sku'],
  quantity: ['quantite', 'qte', 'qty', 'quantity', 'nombre'],
  comment: ['commentaire', 'comment', 'note', 'remarque'],
};

/**
 * Import d'un bon de commande depuis un CSV « référence ; quantité
 * [; commentaire] » (en-tête facultatif). Tout ou rien : la moindre ligne
 * invalide refuse l'import, chaque erreur cite sa ligne du fichier.
 */
async function importer(companyId, user, donnees, fichier) {
  const lignesCsv = lireCsv(fichier.buffer, { maxLignes: 500 });
  if (!lignesCsv.length) throw new ValidationError('Données invalides', ['Le fichier est vide'], 'CSV_VIDE');
  const index = colonnes(lignesCsv[0], COLONNES_IMPORT);
  const avecEntete = index.reference !== undefined && index.quantity !== undefined;
  const col = avecEntete ? index : { reference: 0, quantity: 1, comment: 2 };
  const donneesLignes = avecEntete ? lignesCsv.slice(1) : lignesCsv;
  const decalage = avecEntete ? 2 : 1;
  const erreurs = [];
  const saisies = donneesLignes.map((cellules, i) => {
    const reference = cellules[col.reference];
    const quantite = nombre(cellules[col.quantity]);
    if (!reference) erreurs.push(`Ligne ${i + decalage} du fichier : référence manquante`);
    if (quantite === null || Number.isNaN(quantite) || quantite <= 0) erreurs.push(`Ligne ${i + decalage} du fichier : quantité invalide « ${cellules[col.quantity] ?? ''} »`);
    return { reference, quantity: quantite, comment: col.comment !== undefined ? cellules[col.comment] || null : null };
  });
  if (!saisies.length) erreurs.push('Aucune ligne de commande dans le fichier');
  if (erreurs.length) throw new ValidationError('Données invalides', erreurs.slice(0, 50), 'IMPORT_INVALIDE');
  try {
    return await creer(companyId, user, { ...donnees, lines: saisies }, { origine: 'import_csv' });
  } catch (err) {
    // « Ligne N » des contrôles de lignes → numéro de ligne DU FICHIER.
    if (err instanceof ValidationError && Array.isArray(err.details)) {
      err.details = err.details.map((d) => String(d).replace(/^Ligne (\d+)/, (_, n) => `Ligne ${Number(n) + decalage - 1} du fichier`));
    }
    throw err;
  }
}

// ── Vie de la commande ──────────────────────────────────────────────────────

/**
 * Annulation.
 *   - Acheteur : tant que la commande n'est pas en préparation (brouillon,
 *     envoyée, en négociation, validée).
 *   - Fournisseur : une commande VALIDÉE qu'il ne peut plus honorer (avant
 *     préparation) ; avant validation, il la refuse.
 * L'autre partie est notifiée ; le motif est conservé ; le stock réservé à la
 * validation est libéré.
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
    if (avant === 'validee') {
      const validee = await C.version(commande.id, commande.validated_version_no, t);
      await stock.liberer(t, commande, validee.lines, user, `Annulation ${commande.number}`);
    }
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
  listerAchats, listerVentes, detail, versions, historique, versApiCote,
  creer, creerDansTransaction, modifierBrouillon, envoyer, decider, aApprouver, recommander, importer,
  annuler, commenter, joindre,
};
