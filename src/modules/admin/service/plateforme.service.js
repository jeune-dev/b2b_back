'use strict';

const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  PlatformSetting, SubscriptionPlan, Role, AuditLog,
} = require('../../../models/index.js');
const { DEFAUTS_PLATEFORME, SCHEMAS_PLATEFORME } = require('../../../config/parametres.js');
const { TOUTES } = require('../../../config/permissions.js');
const { NotFoundError, ValidationError } = require('../../../errors/AppError.js');
const escapeLike = require('../../../utils/escapeLike.js');
const { invaliderPlateforme } = require('../../parametres/service/parametres.service.js');
const { journaliser, difference } = require('../../audit/service/audit.service.js');

/**
 * Réglages transverses de la plateforme (§ 5.4 « gérer les paramètres de la
 * plateforme »), diffusion de messages, journal d'audit (§ 24) et rôles.
 */

// ── Paramètres plateforme ──────────────────────────────────────────────────

/** Tous les paramètres connus : valeur effective (défauts + surcharge) et défaut. */
async function listerParametres() {
  const lignes = await PlatformSetting.findAll();
  const parCle = new Map(lignes.map((l) => [l.key, l]));
  return Object.keys(DEFAUTS_PLATEFORME).map((cle) => {
    const ligne = parCle.get(cle);
    return {
      key: cle,
      value: { ...DEFAUTS_PLATEFORME[cle], ...(ligne?.value || {}) },
      default: DEFAUTS_PLATEFORME[cle],
      customized: Boolean(ligne),
      description: ligne?.description ?? null,
      updated_by: ligne?.updated_by ?? null,
      updated_at: ligne?.updated_at ?? null,
    };
  });
}

/**
 * Modification d'un paramètre, validée par SON schéma (config/parametres.js) :
 * une clé inconnue n'existe pas (404), une valeur hors bornes est refusée
 * (422) — un réglage plateforme mal saisi toucherait toutes les entreprises.
 */
async function modifierParametre(admin, cle, corps) {
  const schema = SCHEMAS_PLATEFORME[cle];
  if (!schema) throw new NotFoundError('Paramètre inconnu');
  const { error, value } = schema.validate(corps, { abortEarly: false, stripUnknown: true, convert: true });
  if (error) throw new ValidationError('Données invalides', error.details.map((d) => d.message));
  if (cle === 'essai') {
    const plan = await SubscriptionPlan.findOne({ where: { code: value.plan_code, status: 'actif' }, attributes: ['id'] });
    if (!plan) throw new ValidationError('Données invalides', ["Le forfait d'essai doit être un forfait actif"], 'PLAN_INDISPONIBLE');
  }

  await sequelize.transaction(async (t) => {
    const existant = await PlatformSetting.findByPk(cle, { transaction: t, lock: t.LOCK.UPDATE });
    const avant = { ...DEFAUTS_PLATEFORME[cle], ...(existant?.value || {}) };
    if (existant) await existant.update({ value, updated_by: admin.id }, { transaction: t });
    else await PlatformSetting.create({ key: cle, value, updated_by: admin.id }, { transaction: t });
    await journaliser({
      action: 'parametre_plateforme.modification', entityType: 'platform_setting', entityId: cle,
      details: difference(avant, value, Object.keys(value)),
    }, t);
  });
  await invaliderPlateforme(cle);
  return (await listerParametres()).find((p) => p.key === cle);
}

// ── Notifications diffusées ────────────────────────────────────────────────

/**
 * Populations ciblées : par profil d'entreprise, ou seulement les
 * administrateurs d'entreprise (information commerciale, facturation).
 */
const CIBLES = Object.freeze({
  tous: "TRUE",
  acheteurs: "c.type IN ('acheteur', 'mixte')",
  fournisseurs: "c.type IN ('fournisseur', 'mixte')",
  administrateurs: "m.role_code = 'administrateur'",
});

/**
 * Message d'information à tous les membres actifs d'une population. UN seul
 * INSERT … SELECT écrit toutes les notifications : aucune boucle applicative,
 * quel que soit le nombre de comptes. Diffusion INTERNE (centre de
 * notifications web et mobile) : pas de push de masse depuis l'API.
 */
async function diffuser({ cible, titre, corps }) {
  return sequelize.transaction(async (t) => {
    const [{ nombre }] = await sequelize.query(
      `WITH inseres AS (
         INSERT INTO notifications (user_id, company_id, type, title, body, data)
         SELECT u.id, m.company_id, 'systeme', :titre, :corps, jsonb_build_object('diffusion', true, 'cible', CAST(:cible AS text))
           FROM users u
           JOIN company_members m ON m.user_id = u.id AND m.status = 'actif'
           JOIN companies c ON c.id = m.company_id AND c.status = 'actif' AND c.deleted_at IS NULL
          WHERE u.deleted_at IS NULL AND u.status = 'actif' AND ${CIBLES[cible]}
         RETURNING 1
       )
       SELECT count(*)::int AS nombre FROM inseres`,
      { replacements: { titre, corps, cible }, type: QueryTypes.SELECT, transaction: t }
    );
    await journaliser({
      action: 'admin.notification_diffusion', entityType: 'notification',
      details: { cible, titre, corps, destinataires: nombre },
    }, t);
    return { cible, destinataires: nombre };
  });
}

async function historiqueDiffusions({ limit, offset }) {
  return AuditLog.findAndCountAll({
    where: { action: 'admin.notification_diffusion' },
    attributes: ['id', 'user_id', 'details', 'created_at'],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
}

// ── Journal d'audit ────────────────────────────────────────────────────────

/** Consultation du journal (« qui a fait quoi, quand, sur quelle donnée »), du plus récent au plus ancien. */
async function journal(filtres, { limit, offset }) {
  const where = {};
  if (filtres.company_id) where.company_id = filtres.company_id;
  if (filtres.user_id) where.user_id = filtres.user_id;
  if (filtres.entity_type) where.entity_type = filtres.entity_type;
  if (filtres.entity_id) where.entity_id = filtres.entity_id;
  if (filtres.action) where.action = { [Op.like]: `${escapeLike(filtres.action)}%` };
  if (filtres.du || filtres.au) {
    where.created_at = {};
    if (filtres.du) where.created_at[Op.gte] = new Date(`${filtres.du}T00:00:00Z`);
    if (filtres.au) where.created_at[Op.lte] = new Date(`${filtres.au}T23:59:59.999Z`);
  }
  return AuditLog.findAndCountAll({
    where,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
}

// ── Rôles ──────────────────────────────────────────────────────────────────

/**
 * Rôles et permissions, en LECTURE SEULE : les rôles système sont
 * resynchronisés depuis le code (config/permissions.js) à chaque démarrage par
 * src/scripts/initialiser.js. L'évolution des droits passe par le code, revu
 * et testé, jamais par une saisie en production.
 */
async function roles() {
  const liste = await Role.findAll({ order: [['code', 'ASC']] });
  return { roles: liste, catalogue: TOUTES };
}

module.exports = {
  listerParametres, modifierParametre, diffuser, historiqueDiffusions, journal, roles, CIBLES,
};
