'use strict';

const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Subscription, SubscriptionPlan, SubscriptionPayment, Company, AuditLog,
} = require('../../../models/index.js');
const { FONCTIONNALITE } = require('../../../config/enums.js');
const {
  AppError, ConflictError, NotFoundError, ValidationError, ServiceIndisponibleError,
} = require('../../../errors/AppError.js');
const paydunya = require('../../../infrastructure/paiement/paydunya.provider.js');
const { prochainNumero, pad } = require('../../../utils/compteur.js');
const { aujourdhui, ajouterMois, debutMois, compacte, formatFr } = require('../../../utils/dates.js');
const cache = require('../../../utils/cache.js');
const logger = require('../../../utils/logger.js');
const droits = require('./droits.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise, destinatairesEntreprise, notifier } = require('../../notification/service/notification.service.js');
const { P } = require('../../../config/permissions.js');

/**
 * Abonnements SaaS (§ 25) : forfaits publics, souscription et renouvellement
 * par PayDunya (Wave, Orange Money, carte), activation par confirmation de
 * paiement, période d'essai, changement de forfait, expiration, suspension
 * et activation manuelle par le Super Admin.
 *
 * L'abonnement est payé à la PLATEFORME : les identifiants PayDunya sont ceux
 * de la plateforme (variables d'environnement).
 *
 * Un abonnement « courant » par entreprise (index unique partiel sur
 * essai / actif / suspendu) : un renouvellement PROLONGE ou MODIFIE la ligne
 * courante ; une nouvelle ligne n'est créée que lorsqu'il n'y en a plus
 * (expirée ou annulée), ce qui conserve l'historique des périodes passées.
 */

const COURANTS = ['essai', 'actif', 'suspendu'];
const CLE_PLANS_PUBLICS = 'abonnement:plans:publics';
const TTL_PLANS_S = 300;

/**
 * Identifiants PayDunya de la PLATEFORME, lus à l'appel (rotation de clés sans
 * redémarrage de code). Noms de variables du SDK officiel PayDunya.
 */
function identifiantsPlateforme() {
  const masterKey = process.env.PAYDUNYA_MASTER_KEY;
  const privateKey = process.env.PAYDUNYA_PRIVATE_KEY;
  const token = process.env.PAYDUNYA_TOKEN;
  if (!masterKey || !privateKey || !token) return null;
  return { master_key: masterKey, private_key: privateKey, token, mode: process.env.PAYDUNYA_MODE === 'live' ? 'live' : 'test' };
}

const sansSlash = (url) => String(url).replace(/\/$/, '');

// ── Formules publiques ─────────────────────────────────────────────────────

function planVersApi(plan) {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    price: Number(plan.price),
    currency: plan.currency,
    billing_period: plan.billing_period,
    limits: {
      max_users: plan.max_users,
      max_products: plan.max_products,
      max_partners: plan.max_partners,
      max_orders_per_month: plan.max_orders_per_month,
    },
    features: (plan.features || []).map((code) => ({ code, label: FONCTIONNALITE[code] || code })),
  };
}

/**
 * Forfaits actifs, dans l'ordre d'affichage. Mis en cache sous le préfixe
 * `abonnement:` : toute modification d'un forfait par le Super Admin invalide
 * `abonnement:*` et le nouveau prix est visible immédiatement (§ 25 « les
 * tarifs et forfaits seront définis ultérieurement » : rien n'est codé en dur).
 */
async function plansPublics() {
  const enCache = await cache.lire(CLE_PLANS_PUBLICS);
  if (enCache) return enCache;
  const plans = await SubscriptionPlan.findAll({ where: { status: 'actif' }, order: [['sort_order', 'ASC'], ['name', 'ASC']] });
  const resultat = plans.map(planVersApi);
  await cache.ecrire(CLE_PLANS_PUBLICS, resultat, TTL_PLANS_S);
  return resultat;
}

// ── Espace entreprise ──────────────────────────────────────────────────────

/**
 * État de l'abonnement et consommation des limites du forfait — les quatre
 * compteurs en UNE requête (mêmes requêtes que les contrôles de limite).
 */
async function etatCourant(companyId) {
  const etat = await droits.etat(companyId);
  const R = droits.REQUETES_USAGE;
  const [usage] = await sequelize.query(
    `SELECT (${R.users}) AS users, (${R.products}) AS products, (${R.partners}) AS partners, (${R.orders_month}) AS orders_month`
      .replace(/ AS n FROM/g, ' FROM'),
    {
      replacements: { companyId, debut: new Date(`${debutMois(aujourdhui())}T00:00:00Z`) },
      type: QueryTypes.SELECT,
    }
  );
  return {
    ...etat,
    usage: {
      users: { used: usage.users, max: etat.plan?.max_users ?? null },
      products: { used: usage.products, max: etat.plan?.max_products ?? null },
      partners: { used: usage.partners, max: etat.plan?.max_partners ?? null },
      orders_this_month: { used: usage.orders_month, max: etat.plan?.max_orders_per_month ?? null },
    },
  };
}

const ATTRIBUTS_PAIEMENT = { exclude: ['raw_payload'] };
const INCLUDE_PLAN = { model: SubscriptionPlan, as: 'plan', attributes: ['id', 'code', 'name'] };

async function historiquePaiements(companyId, filtres, { limit, offset }) {
  const where = { company_id: companyId };
  if (filtres.status) where.status = filtres.status;
  return SubscriptionPayment.findAndCountAll({
    where,
    attributes: ATTRIBUTS_PAIEMENT,
    include: [INCLUDE_PLAN],
    order: [['created_at', 'DESC'], ['id', 'ASC']],
    limit,
    offset,
  });
}

/** Référence lisible et unique : ABO-20260928-000042. */
async function nouvelleReference(transaction) {
  const n = await prochainNumero('plateforme:abonnement', transaction);
  return `ABO-${compacte(aujourdhui())}-${pad(n, 6)}`;
}

/**
 * Souscription, renouvellement ou changement de forfait payé en ligne (§ 25).
 *
 * La ligne de paiement est créée AVANT l'appel à PayDunya (transaction courte,
 * jamais ouverte pendant un appel réseau) : l'IPN peut arriver avant même la
 * réponse de PayDunya, elle doit trouver sa référence. Aucun abonnement n'est
 * modifié ici — seule l’IPN, facture relue chez PayDunya, active le forfait.
 */
async function souscrire(companyId, user, { plan_code: planCode, months, wallet = null }) {
  const identifiants = identifiantsPlateforme();
  const urlApi = process.env.API_PUBLIC_URL;
  const urlApp = process.env.APP_PUBLIC_URL;
  if (!identifiants || !urlApi || !urlApp) {
    throw new ServiceIndisponibleError(
      "Le paiement en ligne des abonnements n'est pas encore disponible. Contactez le support pour activer votre forfait.",
      'PAIEMENT_NON_CONFIGURE'
    );
  }
  const plan = await SubscriptionPlan.findOne({ where: { code: planCode, status: 'actif' } });
  if (!plan) throw new ValidationError('Données invalides', ['Forfait inconnu ou indisponible'], 'PLAN_INDISPONIBLE');
  const montant = Number(plan.price) * months;
  if (montant <= 0) {
    throw new ConflictError("Ce forfait sans frais est activé par l'administrateur, sans paiement.", 'PLAN_GRATUIT');
  }

  const paiement = await sequelize.transaction(async (t) => {
    const p = await SubscriptionPayment.create({
      company_id: companyId,
      plan_id: plan.id,
      amount: montant,
      currency: plan.currency,
      months,
      provider: 'paydunya',
      reference: await nouvelleReference(t),
      status: 'initie',
      recorded_by: user.id,
    }, { transaction: t });
    await journaliser({
      action: 'abonnement_paiement.creation', entityType: 'subscription_payment', entityId: p.id, companyId,
      details: { reference: p.reference, plan: plan.code, mois: months, montant },
    }, t);
    return p;
  });

  const retour = `${sansSlash(urlApp)}/abonnement/paiement`;
  let demande;
  try {
    demande = await paydunya.demanderPaiement({
      identifiants,
      reference: paiement.reference,
      montant,
      libelle: `Abonnement ${plan.name} — ${months} mois`,
      portefeuille: wallet,
      urlIpn: `${sansSlash(urlApi)}/api/v1/webhooks/abonnement/paydunya`,
      urlSucces: `${retour}/succes?reference=${encodeURIComponent(paiement.reference)}`,
      urlAnnulation: `${retour}/annule?reference=${encodeURIComponent(paiement.reference)}`,
    });
  } catch (err) {
    // La demande n'existe pas chez PayDunya : la ligne est close, une nouvelle
    // tentative créera une nouvelle référence.
    await paiement.update({ status: 'echoue', note: `Demande refusée par PayDunya : ${err.message}`.slice(0, 500) });
    logger.warn('[abonnement] Demande de paiement PayDunya impossible', { reference: paiement.reference, error: err.message });
    if (err instanceof AppError) throw err;
    throw new ServiceIndisponibleError(
      "Le service de paiement n'a pas pu créer la demande. Réessayez dans quelques instants.",
      'PAIEMENT_INDISPONIBLE'
    );
  }
  // Le jeton de facture est l'identifiant PayDunya du paiement : il permet de
  // retrouver la ligne même si une IPN ne renvoyait pas la référence.
  await paiement.update({ checkout_url: demande.urlPaiement, provider_transaction_id: `paydunya:${demande.jeton}` });
  const payment = paiement.toJSON();
  delete payment.raw_payload;
  return { payment, checkout_url: demande.urlPaiement };
}

// ── Activation ─────────────────────────────────────────────────────────────

/**
 * Applique `mois` payés du forfait `plan` à l'abonnement de l'entreprise,
 * dans la transaction du paiement :
 *   - même forfait, abonnement payé en cours → la période est PROLONGÉE à
 *     partir de max(aujourd'hui, fin actuelle) : payer en avance ne fait
 *     perdre aucun jour ;
 *   - autre forfait (§ 25 « changement de forfait »), ou sortie de l'essai → le nouveau forfait
 *     démarre aujourd'hui (changement de limites immédiat) ;
 *   - plus d'abonnement courant (expiré, annulé, jamais souscrit) → NOUVELLE
 *     ligne, l'ancienne reste dans l'historique.
 * Un abonnement SUSPENDU par l'administrateur reste suspendu : le paiement est
 * crédité (période) mais la levée d'une sanction relève de l'administrateur.
 */
async function appliquerPaiement(companyId, plan, mois, t) {
  const jour = aujourdhui();
  // Verrou sur l'entreprise : deux confirmations simultanées (IPN + activation
  // manuelle) sont sérialisées et ne créent jamais deux abonnements courants.
  await Company.findByPk(companyId, { attributes: ['id'], lock: t.LOCK.UPDATE, transaction: t });
  const courant = await Subscription.findOne({
    where: { company_id: companyId, status: { [Op.in]: COURANTS } },
    lock: t.LOCK.UPDATE,
    transaction: t,
  });

  if (!courant) {
    const cree = await Subscription.create({
      company_id: companyId,
      plan_id: plan.id,
      status: 'actif',
      started_at: new Date(),
      current_period_start: jour,
      current_period_end: ajouterMois(jour, mois),
    }, { transaction: t });
    return { abonnement: cree, avant: null };
  }

  const avant = { status: courant.status, plan_id: courant.plan_id, current_period_end: courant.current_period_end };
  const statut = courant.status === 'suspendu' ? 'suspendu' : 'actif';
  if (courant.plan_id === plan.id && courant.status !== 'essai') {
    const echu = courant.current_period_end < jour;
    await courant.update({
      status: statut,
      current_period_start: echu ? jour : courant.current_period_start,
      current_period_end: ajouterMois(echu ? jour : courant.current_period_end, mois),
    }, { transaction: t });
  } else {
    await courant.update({
      plan_id: plan.id,
      status: statut,
      current_period_start: jour,
      current_period_end: ajouterMois(jour, mois),
    }, { transaction: t });
  }
  return { abonnement: courant, avant };
}

async function notifierActivation(t, companyId, plan, abonnement) {
  await notifierEntreprise(t, companyId, P.ABONNEMENT_GERER, {
    type: 'abonnement',
    titre: 'Abonnement activé',
    corps: `Votre forfait ${plan.name} est actif jusqu'au ${formatFr(abonnement.current_period_end)}.`,
    donnees: { subscription_id: abonnement.id },
  });
}

/**
 * IPN PayDunya d'un paiement d'abonnement (§ 25). Appelée par le module webhook.
 *
 * - Authenticité : empreinte de la clé principale de la PLATEFORME, puis
 *   facture RELUE chez PayDunya — statut, montant et référence ne sont jamais
 *   lus dans le corps de l'IPN ; une IPN forgée ou rejouée n'a aucun effet.
 * - Idempotente : ligne verrouillée, une confirmation reçue deux fois n'est
 *   appliquée qu'une fois.
 * - Montant contrôlé : un montant différent de celui demandé ne crédite rien.
 *
 * @returns {Promise<{ ok: boolean, deja?: boolean, motif?: string, statut?: string }>}
 */
async function traiterIpnPaydunya(corps) {
  const identifiants = identifiantsPlateforme();
  if (!identifiants) {
    logger.warn('[abonnement] IPN reçue alors que PayDunya plateforme n’est pas configuré');
    return { ok: false, motif: 'non_configure' };
  }
  let ipn;
  try {
    ipn = await paydunya.verifierIpn(identifiants, corps);
  } catch (err) {
    // PayDunya injoignable : notification non acquittée (503) pour être renvoyée.
    logger.warn('[abonnement] Relecture de la facture PayDunya impossible', { error: err.message });
    throw new ServiceIndisponibleError('Vérification du paiement momentanément impossible', 'FOURNISSEUR_INDISPONIBLE');
  }
  if (!ipn.valide) return { ok: false, motif: ipn.motif };
  if (ipn.evenement === 'ignore') return { ok: true, statut: 'ignore' };
  const charge = ipn.facture;

  let companyId = null;
  const resultat = await sequelize.transaction(async (t) => {
    const paiement = await SubscriptionPayment.findOne({
      where: ipn.reference
        ? { reference: ipn.reference, provider: 'paydunya' }
        : { provider_transaction_id: ipn.idFournisseur, provider: 'paydunya' },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!paiement) {
      logger.warn('[abonnement] IPN pour une référence inconnue', { reference: ipn.reference });
      return { ok: false, motif: 'reference_inconnue' };
    }
    // La facture relue doit être celle créée pour CE paiement.
    if (paiement.provider_transaction_id && paiement.provider_transaction_id !== ipn.idFournisseur) {
      logger.error('[abonnement] Facture PayDunya étrangère à ce paiement — refusée', { reference: paiement.reference });
      return { ok: false, motif: 'facture_incoherente' };
    }
    // Paiement réellement encaissé après un échec ou une annulation (le
    // client a finalement payé sur la même demande) : la confirmation,
    // relue chez PayDunya, est appliquée — sinon il aurait payé sans être
    // activé. Seul « confirme » est définitif (idempotence). La reprise
    // est journalisée à part (`reprise_apres`).
    const statutAvant = paiement.status;
    const reprise = ['echoue', 'annule'].includes(statutAvant) && ipn.evenement === 'confirme';
    if (statutAvant !== 'initie' && !reprise) return { ok: true, deja: true, statut: statutAvant };
    if (reprise) {
      logger.warn('[abonnement] Confirmation PayDunya reçue pour un paiement échoué ou annulé — traitement', {
        reference: paiement.reference, statut: statutAvant,
      });
    }
    companyId = paiement.company_id;

    if (ipn.evenement === 'annule') {
      await paiement.update({ status: 'annule', raw_payload: charge }, { transaction: t });
      await journaliser({
        action: 'abonnement_paiement.changement_statut', entityType: 'subscription_payment', entityId: paiement.id,
        companyId, details: { reference: paiement.reference, statut: 'annule' },
      }, t);
      return { ok: true, statut: 'annule' };
    }

    if (ipn.montant !== Number(paiement.amount)) {
      await paiement.update({
        status: 'echoue',
        raw_payload: charge,
        note: `Montant reçu (${ipn.montant}) différent du montant demandé (${paiement.amount}).`,
      }, { transaction: t });
      logger.error('[abonnement] IPN PayDunya : montant incorrect, paiement refusé', {
        reference: paiement.reference, attendu: Number(paiement.amount), recu: ipn.montant,
      });
      await journaliser({
        action: 'abonnement_paiement.changement_statut', entityType: 'subscription_payment', entityId: paiement.id,
        companyId, details: { reference: paiement.reference, statut: 'echoue', motif: 'montant_incorrect', recu: ipn.montant },
      }, t);
      return { ok: false, motif: 'montant_incorrect' };
    }

    const plan = await SubscriptionPlan.findByPk(paiement.plan_id, { transaction: t });
    const { abonnement, avant } = await appliquerPaiement(companyId, plan, paiement.months, t);
    await paiement.update({
      status: 'confirme',
      paid_at: new Date(),
      provider_transaction_id: ipn.idFournisseur,
      raw_payload: charge,
      subscription_id: abonnement.id,
    }, { transaction: t });
    await journaliser({
      action: 'abonnement.paiement', entityType: 'subscription', entityId: abonnement.id, companyId,
      details: {
        reference: paiement.reference, plan: plan.code, mois: paiement.months, montant: Number(paiement.amount),
        avant, fin_periode: abonnement.current_period_end,
        ...(reprise ? { reprise_apres: statutAvant } : {}),
      },
    }, t);
    await notifierActivation(t, companyId, plan, abonnement);
    return { ok: true, statut: 'confirme', ...(reprise ? { reprise_apres: statutAvant } : {}) };
  });

  if (companyId) await droits.invalider(companyId);
  return resultat;
}

/**
 * Activation manuelle par le Super Admin (paiement reçu hors ligne, geste
 * commercial) : même logique d'activation qu'une IPN, tracée par une ligne de
 * paiement `manuel` confirmée et enregistrée par l'administrateur.
 */
async function activerManuellement(adminUser, companyId, { plan_code: planCode, months, note = null, amount = null }) {
  const company = await Company.findByPk(companyId, { attributes: ['id'] });
  if (!company) throw new NotFoundError('Entreprise introuvable');
  const plan = await SubscriptionPlan.findOne({ where: { code: planCode, status: 'actif' } });
  if (!plan) throw new ValidationError('Données invalides', ['Forfait inconnu ou indisponible'], 'PLAN_INDISPONIBLE');
  const montant = amount ?? Number(plan.price) * months;

  const resultat = await sequelize.transaction(async (t) => {
    const { abonnement, avant } = await appliquerPaiement(companyId, plan, months, t);
    const paiement = await SubscriptionPayment.create({
      company_id: companyId,
      subscription_id: abonnement.id,
      plan_id: plan.id,
      amount: montant,
      currency: plan.currency,
      months,
      provider: 'manuel',
      reference: await nouvelleReference(t),
      status: 'confirme',
      paid_at: new Date(),
      recorded_by: adminUser.id,
      note,
    }, { transaction: t });
    await journaliser({
      action: 'abonnement.paiement', entityType: 'subscription', entityId: abonnement.id, companyId,
      details: {
        mode: 'manuel', reference: paiement.reference, plan: plan.code, mois: months, montant, note,
        avant, fin_periode: abonnement.current_period_end,
      },
    }, t);
    await notifierActivation(t, companyId, plan, abonnement);
    const payment = paiement.toJSON();
    delete payment.raw_payload;
    return { payment, subscription: abonnement };
  });
  await droits.invalider(companyId);
  return resultat;
}

// ── Expiration (job quotidien) ─────────────────────────────────────────────

/**
 * Passe à « expiré » tout abonnement d'essai ou payé dont la période est
 * échue (§ 25 « expiration »). L'espace passe en lecture seule (droits.service) :
 * l'entreprise consulte toujours ses données, mais doit renouveler pour agir.
 *
 * Une seule requête UPDATE … RETURNING pour toutes les lignes, une seule pour
 * les membres des espaces concernés, un seul INSERT pour le journal d'audit ;
 * puis une notification par entreprise.
 *
 * @returns {Promise<number>} nombre d'abonnements expirés
 */
async function expirerAbonnements(jour = aujourdhui()) {
  const entreprises = [];
  const nombre = await sequelize.transaction(async (t) => {
    const [lignes] = await sequelize.query(
      `UPDATE subscriptions SET status = 'expire', updated_at = now()
        WHERE status IN ('essai', 'actif') AND current_period_end < :jour
        RETURNING id, company_id, current_period_end`,
      { replacements: { jour }, transaction: t }
    );
    if (!lignes.length) return 0;

    const companyIds = [...new Set(lignes.map((l) => l.company_id))];

    // Journal groupé : même contenu que journaliser(), écrit en un INSERT
    // (tâche planifiée, aucun contexte de requête : acteur « systeme »).
    await AuditLog.bulkCreate(lignes.map((l) => ({
      company_id: l.company_id,
      actor_role: 'systeme',
      action: 'abonnement.changement_statut',
      entity_type: 'subscription',
      entity_id: l.id,
      details: { statut: 'expire', motif: 'fin_de_periode', fin_periode: l.current_period_end },
    })), { transaction: t });

    for (const l of lignes) {
      await notifier(t, {
        destinataires: await destinatairesEntreprise(l.company_id, P.ABONNEMENT_GERER, t),
        companyId: l.company_id,
        type: 'abonnement',
        titre: 'Abonnement expiré',
        corps: `Votre abonnement a expiré le ${formatFr(l.current_period_end)}. Votre espace est en lecture seule : renouvelez votre forfait pour continuer à commander, vendre et facturer.`,
        donnees: { subscription_id: l.id },
      });
    }
    entreprises.push(...companyIds);
    return lignes.length;
  });

  for (const companyId of entreprises) await droits.invalider(companyId);
  if (nombre) logger.info(`[abonnement] ${nombre} abonnement(s) expiré(s)`);
  return nombre;
}

module.exports = {
  plansPublics, planVersApi, etatCourant, historiquePaiements, souscrire,
  traiterIpnPaydunya, activerManuellement, expirerAbonnements,
  identifiantsPlateforme,
};
