'use strict';

const { Op } = require('sequelize');
const { Notification, CompanyMember, Role } = require('../../../models/index.js');
const push = require('../../../infrastructure/push.service.js');
const tempsReel = require('../../../infrastructure/tempsReel.service.js');
const logger = require('../../../utils/logger.js');

/**
 * Notifications (§ 17) : « disponibles sur Web et Mobile, avec des
 * notifications push sur mobile ».
 *
 * 1. La notification INTERNE est écrite dans la transaction de l'action qui la
 *    déclenche : une action annulée ne notifie personne, une action validée
 *    notifie toujours.
 * 2. Après le COMMIT : événement temps réel (web ouvert, § 23) et push FCM
 *    (mobile, iOS via APNs). Sans bloquer la réponse HTTP : une panne de
 *    Firebase ne fait jamais échouer une commande.
 *
 * Destinataires d'une entreprise : ses membres ACTIFS dont le rôle détient la
 * permission concernée (§ 5.3) — un réceptionnaire n'est pas dérangé par une
 * facture, un comptable n'est pas notifié d'une commande en préparation.
 */

/**
 * @param {import('sequelize').Transaction|null} t
 * @param {object} n
 * @param {Array<{ userId: string }>} n.destinataires
 * @param {string|null} n.companyId   entreprise du DESTINATAIRE
 * @param {string} n.type             (TYPE_NOTIFICATION)
 * @param {string} n.titre
 * @param {string} n.corps
 * @param {object} [n.donnees]        données de navigation pour le client (ids)
 */
async function notifier(t, { destinataires, companyId = null, type, titre, corps, donnees = {} }) {
  const uniques = [...new Set((destinataires || []).map((d) => d.userId).filter(Boolean))];
  if (!uniques.length) return [];
  const notifications = await Notification.bulkCreate(uniques.map((userId) => ({
    user_id: userId, company_id: companyId, type, title: titre.slice(0, 150), body: corps, data: donnees,
  })), { transaction: t, returning: true });

  const envoyer = () => {
    for (const n of notifications) {
      tempsReel.publier([n.user_id], 'notification', { notification_id: n.id, type, title: n.title, ...donnees });
      push.envoyerAUtilisateur(n.user_id, { titre, corps, donnees: { ...donnees, type, notification_id: n.id } })
        .catch((err) => logger.warn('[notification] Push en échec', { type, error: err.message }));
    }
  };
  if (t && typeof t.afterCommit === 'function') t.afterCommit(envoyer);
  else envoyer();
  return notifications;
}

/**
 * Membres actifs d'une entreprise ; si `permission` est donnée, seulement
 * ceux dont le rôle la détient. Une requête (jointure sur les rôles).
 * @param {string} companyId
 * @param {string|null} [permission]
 */
async function destinatairesEntreprise(companyId, permission = null, transaction = null) {
  const membres = await CompanyMember.findAll({
    where: { company_id: companyId, status: 'actif' },
    attributes: ['user_id'],
    include: permission ? [{
      model: Role, as: 'role', attributes: [], required: true, where: { permissions: { [Op.contains]: [permission] } },
    }] : [],
    transaction,
  });
  return membres.map((m) => ({ userId: m.user_id }));
}

/**
 * Notifie une entreprise (membres concernés) et publie l'événement de
 * synchronisation à TOUS ses membres actifs (écrans ouverts à rafraîchir).
 */
async function notifierEntreprise(t, companyId, permission, { type, titre, corps, donnees = {} }) {
  const destinataires = await destinatairesEntreprise(companyId, permission, t);
  return notifier(t, { destinataires, companyId, type, titre, corps, donnees });
}

/**
 * Événement de synchronisation (sans notification) vers tous les membres
 * actifs des entreprises citées, après COMMIT.
 * @param {import('sequelize').Transaction|null} t
 * @param {string[]} companyIds
 * @param {string} type         ressource : commande, facture, paiement, partenariat, produit
 * @param {object} donnees
 */
async function synchroniser(t, companyIds, type, donnees) {
  const membres = await CompanyMember.findAll({
    where: { company_id: [...new Set(companyIds.filter(Boolean))], status: 'actif' },
    attributes: ['user_id'],
    transaction: t,
  });
  const ids = membres.map((m) => m.user_id);
  const envoyer = () => tempsReel.publier(ids, type, donnees);
  if (t && typeof t.afterCommit === 'function') t.afterCommit(envoyer);
  else envoyer();
}

module.exports = { notifier, notifierEntreprise, destinatairesEntreprise, synchroniser };
