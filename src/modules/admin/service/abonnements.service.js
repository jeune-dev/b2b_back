'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { Subscription, SubscriptionPlan, SubscriptionPayment, Company } = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { NotFoundError, ConflictError } = require('../../../errors/AppError.js');
const { ordre, periode } = require('../../../utils/liste.js');
const droits = require('../../abonnement/service/droits.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');

/**
 * Abonnements et paiements d'abonnement vus par le Super Admin (§ 5.4 « gérer
 * les abonnements, suspendre / réactiver des comptes », § 25).
 *
 * Toute transition d'un abonnement invalide le cache des droits de
 * l'entreprise : la garde d'écriture de l'espace entreprise applique le
 * nouvel état dès la requête suivante.
 */

const INCLUDE_PLAN = { model: SubscriptionPlan, as: 'plan', attributes: ['id', 'code', 'name', 'price', 'billing_period'] };
const INCLUDE_ENTREPRISE = { model: Company, as: 'company', attributes: ['id', 'name', 'type', 'phone', 'email', 'status'], paranoid: false };

async function lister(filtres, { limit, offset }) {
  const where = {};
  if (filtres.status) where.status = filtres.status;
  if (filtres.company_id) where.company_id = filtres.company_id;
  if (filtres.fin_avant) where.current_period_end = { [Op.lte]: filtres.fin_avant };
  const plan = filtres.plan ? { ...INCLUDE_PLAN, where: { code: filtres.plan }, required: true } : INCLUDE_PLAN;
  return Subscription.findAndCountAll({
    where,
    include: [plan, INCLUDE_ENTREPRISE],
    order: ordre(filtres.tri, '-created_at'),
    limit,
    offset,
  });
}

async function charger(id, options = {}) {
  const abonnement = await Subscription.findByPk(id, options);
  if (!abonnement) throw new NotFoundError('Abonnement introuvable');
  return abonnement;
}

async function detail(id) {
  const abonnement = await charger(id, { include: [INCLUDE_PLAN, INCLUDE_ENTREPRISE] });
  const paiements = await SubscriptionPayment.findAll({
    where: { subscription_id: id },
    attributes: { exclude: ['raw_payload'] },
    include: [{ model: SubscriptionPlan, as: 'plan', attributes: ['id', 'code', 'name'] }],
    order: [['created_at', 'DESC']],
  });
  return { ...abonnement.toJSON(), payments: paiements };
}

/** Transition d'un abonnement, verrouillée et journalisée ; l'entreprise est prévenue. */
async function transition(id, { depuis, vers, champs = {}, motif = null, titre, corps }) {
  let companyId;
  const resultat = await sequelize.transaction(async (t) => {
    const abonnement = await charger(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!depuis.includes(abonnement.status)) {
      throw new ConflictError(
        `Transition impossible : l'abonnement est « ${abonnement.status} ».`,
        'TRANSITION_INTERDITE',
        { statut: abonnement.status, attendu: depuis }
      );
    }
    companyId = abonnement.company_id;
    const avant = abonnement.status;
    const statut = typeof vers === 'function' ? vers(abonnement) : vers;
    await abonnement.update({ ...champs, status: statut }, { transaction: t });
    await journaliser({
      action: 'abonnement.changement_statut', entityType: 'subscription', entityId: id, companyId,
      details: { de: avant, a: statut, motif },
    }, t);
    await notifierEntreprise(t, companyId, P.ABONNEMENT_GERER, {
      type: 'abonnement', titre, corps, donnees: { subscription_id: id },
    });
    return abonnement;
  });
  await droits.invalider(companyId);
  return resultat;
}

/** Suspension (impayé, abus…) : l'espace passe en lecture seule. */
function suspendre(id, { reason }) {
  return transition(id, {
    depuis: ['essai', 'actif'],
    vers: 'suspendu',
    champs: { suspended_reason: reason },
    motif: reason,
    titre: 'Abonnement suspendu',
    corps: `Votre abonnement a été suspendu par l'administrateur : ${reason}. Votre espace est en lecture seule.`,
  });
}

/**
 * Levée de la suspension. Le statut antérieur n'est pas stocké : une période
 * qui ne dépasse pas la fin d'essai était un essai, sinon un abonnement payé.
 */
function reactiver(id) {
  return transition(id, {
    depuis: ['suspendu'],
    vers: (a) => (a.trial_ends_at && a.current_period_end <= a.trial_ends_at ? 'essai' : 'actif'),
    champs: { suspended_reason: null },
    titre: 'Abonnement rétabli',
    corps: 'La suspension de votre abonnement a été levée.',
  });
}

/** Annulation : l'abonnement sort de l'état « courant » ; un nouveau paiement en créera un nouveau. */
function annuler(id, { reason = null } = {}) {
  return transition(id, {
    depuis: ['essai', 'actif', 'suspendu'],
    vers: 'annule',
    champs: { cancelled_at: new Date() },
    motif: reason,
    titre: 'Abonnement annulé',
    corps: 'Votre abonnement a été annulé. Votre espace est en lecture seule jusqu’à une nouvelle souscription.',
  });
}

async function listerPaiements(filtres, { limit, offset }) {
  const where = {};
  if (filtres.status) where.status = filtres.status;
  if (filtres.provider) where.provider = filtres.provider;
  if (filtres.company_id) where.company_id = filtres.company_id;
  if (filtres.du || filtres.au) {
    where.created_at = periode(
      filtres.du ? new Date(`${filtres.du}T00:00:00Z`) : null,
      filtres.au ? new Date(`${filtres.au}T23:59:59.999Z`) : null
    );
  }
  return SubscriptionPayment.findAndCountAll({
    where,
    attributes: { exclude: ['raw_payload'] },
    include: [{ model: SubscriptionPlan, as: 'plan', attributes: ['id', 'code', 'name'] }, INCLUDE_ENTREPRISE],
    order: ordre(filtres.tri, '-created_at'),
    limit,
    offset,
  });
}

module.exports = { lister, detail, suspendre, reactiver, annuler, listerPaiements };
