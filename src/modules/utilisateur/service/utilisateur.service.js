'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  CompanyMember, User, MemberInvitation, Company,
} = require('../../../models/index.js');
const { ROLES_ENTREPRISE } = require('../../../config/enums.js');
const { ConflictError, NotFoundError } = require('../../../errors/AppError.js');
const { chargerPourEntreprise } = require('../../../utils/acces.js');
const { ordre, rechercheTexte } = require('../../../utils/liste.js');
const invitations = require('../../auth/service/invitation.service.js');
const sessions = require('../../auth/service/session.service.js');
const droits = require('../../abonnement/service/droits.service.js');
const email = require('../../../infrastructure/email.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const logger = require('../../../utils/logger.js');

/**
 * Utilisateurs internes d'une entreprise (§ 5.3) : administrateur,
 * responsable achats, responsable commandes, comptable, réceptionnaire,
 * commercial. « Les permissions doivent dépendre du rôle » : le rôle est porté
 * par l'appartenance (`company_members.role_code`) et lu à chaque requête —
 * un changement de rôle s'applique immédiatement.
 *
 * Garde-fou : une entreprise garde TOUJOURS au moins un administrateur actif
 * (sinon plus personne ne pourrait gérer ses utilisateurs ni son abonnement).
 */

const ATTRIBUTS_UTILISATEUR = ['id', 'first_name', 'last_name', 'email', 'phone', 'job_title', 'status', 'last_login_at', 'totp_enabled_at'];

function versApi(membre) {
  const m = membre.toJSON();
  return { ...m, role_label: ROLES_ENTREPRISE[m.role_code] || m.role_code };
}

async function lister(companyId, filtres, { limit, offset }) {
  const where = { company_id: companyId };
  if (filtres.status) where.status = filtres.status;
  if (filtres.role) where.role_code = filtres.role;
  const texte = rechercheTexte(filtres.q, ['$user.first_name$', '$user.last_name$', '$user.email$', '$user.phone$']);
  if (texte) Object.assign(where, texte);
  const { rows, count } = await CompanyMember.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ATTRIBUTS_UTILISATEUR }],
    order: ordre(filtres.tri, 'created_at', { nom: ['user', 'last_name'] }),
    limit,
    offset,
  });
  return { rows: rows.map(versApi), count };
}

async function detail(id, companyId) {
  const membre = await chargerPourEntreprise(CompanyMember, id, companyId, {
    include: [{ model: User, as: 'user', attributes: ATTRIBUTS_UTILISATEUR }],
  }, 'Utilisateur');
  return versApi(membre);
}

/** Refuse une opération qui laisserait l'entreprise sans administrateur actif. */
async function garderUnAdministrateur(membre, t) {
  if (membre.role_code !== 'administrateur' || membre.status !== 'actif') return;
  const autres = await CompanyMember.count({
    where: { company_id: membre.company_id, role_code: 'administrateur', status: 'actif', id: { [Op.ne]: membre.id } },
    transaction: t,
  });
  if (autres < 1) {
    throw new ConflictError("L'entreprise doit garder au moins un administrateur actif.", 'DERNIER_ADMINISTRATEUR');
  }
}

/**
 * Sérialise les opérations sur les membres d'une entreprise (verrou de la
 * ligne entreprise) : deux administrateurs qui se rétrogradent mutuellement
 * au même instant ne peuvent pas laisser l'entreprise sans administrateur.
 */
async function verrouillerEntreprise(companyId, t) {
  await Company.findByPk(companyId, { attributes: ['id'], lock: t.LOCK.UPDATE, transaction: t });
}

async function changerRole(acteur, id, companyId, { role_code: role }) {
  return sequelize.transaction(async (t) => {
    await verrouillerEntreprise(companyId, t);
    const membre = await chargerPourEntreprise(CompanyMember, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Utilisateur');
    if (membre.role_code === role) return detail(id, companyId);
    if (role !== 'administrateur') await garderUnAdministrateur(membre, t);
    const avant = membre.role_code;
    await membre.update({ role_code: role }, { transaction: t });
    await journaliser({
      action: 'utilisateur.changement_role', entityType: 'company_member', entityId: id, companyId,
      details: { user_id: membre.user_id, de: avant, a: role },
    }, t);
    return membre;
  }).then(() => detail(id, companyId));
}

/**
 * Désactivation : le compte perd l'accès à l'espace de l'entreprise à la
 * requête suivante et toutes ses sessions sont fermées. Les commandes,
 * factures et l'historique qu'il a produits sont conservés et restent
 * attribués (§ 20 « qui a fait quoi »).
 */
async function desactiver(acteur, id, companyId, { reason }) {
  await sequelize.transaction(async (t) => {
    await verrouillerEntreprise(companyId, t);
    const membre = await chargerPourEntreprise(CompanyMember, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Utilisateur');
    if (membre.user_id === acteur.id) throw new ConflictError('Vous ne pouvez pas désactiver votre propre compte.', 'ACTION_SUR_SOI_INTERDITE');
    if (membre.status === 'inactif') throw new ConflictError('Cet utilisateur est déjà désactivé.', 'DEJA_INACTIF');
    await garderUnAdministrateur(membre, t);
    await membre.update({ status: 'inactif' }, { transaction: t });
    await sessions.revoquerToutesLesSessions(membre.user_id, t);
    await journaliser({
      action: 'utilisateur.changement_statut', entityType: 'company_member', entityId: id, companyId,
      details: { user_id: membre.user_id, de: 'actif', a: 'inactif', motif: reason },
    }, t);
  });
  return detail(id, companyId);
}

async function reactiver(id, companyId) {
  await sequelize.transaction(async (t) => {
    const membre = await chargerPourEntreprise(CompanyMember, id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'Utilisateur');
    if (membre.status === 'actif') throw new ConflictError('Cet utilisateur est déjà actif.', 'DEJA_ACTIF');
    await droits.verifierLimite(companyId, 'users', t);
    await membre.update({ status: 'actif' }, { transaction: t });
    await journaliser({
      action: 'utilisateur.changement_statut', entityType: 'company_member', entityId: id, companyId,
      details: { user_id: membre.user_id, de: 'inactif', a: 'actif' },
    }, t);
  });
  return detail(id, companyId);
}

// ── Invitations ─────────────────────────────────────────────────────────────

async function listerInvitations(companyId, { status } = {}, { limit, offset }) {
  const where = { company_id: companyId };
  const maintenant = new Date();
  if (status === 'en_attente') Object.assign(where, { used_at: null, revoked_at: null, expires_at: { [Op.gt]: maintenant } });
  if (status === 'acceptee') where.used_at = { [Op.ne]: null };
  if (status === 'revoquee') where.revoked_at = { [Op.ne]: null };
  if (status === 'expiree') Object.assign(where, { used_at: null, revoked_at: null, expires_at: { [Op.lte]: maintenant } });
  const { rows, count } = await MemberInvitation.findAndCountAll({
    where, order: [['created_at', 'DESC'], ['id', 'ASC']], limit, offset,
  });
  return {
    rows: rows.map((i) => {
      let statut = 'en_attente';
      if (i.used_at) statut = 'acceptee';
      else if (i.revoked_at) statut = 'revoquee';
      else if (i.expires_at <= maintenant) statut = 'expiree';
      return { ...i.toJSON(), status: statut, role_label: ROLES_ENTREPRISE[i.role_code] };
    }),
    count,
  };
}

/** Envoi de l'invitation par e-mail, après COMMIT (jamais bloquant). */
function envoyerInvitation(t, { invitation, token, code, jours }, nomEntreprise) {
  t.afterCommit(() => {
    email.envoyerInvitationCollaborateur({
      email: invitation.email,
      prenom: invitation.first_name,
      entreprise: nomEntreprise,
      role: ROLES_ENTREPRISE[invitation.role_code],
      code,
      token,
      jours,
    }).catch((err) => logger.warn('[utilisateur] Envoi de l’invitation impossible', { error: err.message }));
  });
}

/**
 * Invitation d'un collaborateur. Le CODE d'activation est rendu UNE fois dans
 * la réponse : l'administrateur peut le transmettre lui-même (téléphone,
 * WhatsApp) si l'e-mail tarde.
 */
async function inviter(acteur, companyId, donnees) {
  return sequelize.transaction(async (t) => {
    await droits.verifierLimite(companyId, 'users', t);
    const company = await Company.findByPk(companyId, { attributes: ['id', 'name'], transaction: t });
    const existant = await User.findOne({
      where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), donnees.email),
      attributes: ['id'],
      include: [{ model: CompanyMember, as: 'memberships', attributes: ['company_id', 'status'], required: false }],
      transaction: t,
    });
    if (existant?.memberships?.length) {
      const ici = existant.memberships[0].company_id === companyId;
      throw new ConflictError(
        ici ? 'Cette personne fait déjà partie de votre entreprise.' : 'Cette personne utilise déjà Pro2Link pour une autre entreprise.',
        ici ? 'DEJA_MEMBRE' : 'COMPTE_DEJA_RATTACHE'
      );
    }
    const resultat = await invitations.creer(companyId, donnees, acteur.id, t);
    await journaliser({
      action: 'utilisateur.invitation', entityType: 'member_invitation', entityId: resultat.invitation.id, companyId,
      details: { email: donnees.email, role: donnees.role_code },
    }, t);
    envoyerInvitation(t, resultat, company.name);
    return {
      invitation: { ...resultat.invitation.toJSON(), status: 'en_attente', role_label: ROLES_ENTREPRISE[donnees.role_code] },
      code: resultat.code,
      expires_in_days: resultat.jours,
    };
  });
}

async function chargerInvitation(id, companyId, t) {
  const invitation = await MemberInvitation.findByPk(id, { transaction: t, lock: t?.LOCK.UPDATE });
  if (!invitation) throw new NotFoundError('Invitation introuvable');
  if (invitation.company_id !== companyId) throw new NotFoundError('Invitation introuvable');
  return invitation;
}

/** Nouveaux secrets pour une invitation non utilisée (l'ancienne est révoquée). */
async function renvoyerInvitation(acteur, id, companyId) {
  return sequelize.transaction(async (t) => {
    const ancienne = await chargerInvitation(id, companyId, t);
    if (ancienne.used_at) throw new ConflictError('Cette invitation a déjà été acceptée.', 'INVITATION_UTILISEE');
    const company = await Company.findByPk(companyId, { attributes: ['id', 'name'], transaction: t });
    const resultat = await invitations.creer(companyId, ancienne.toJSON(), acteur.id, t);
    await journaliser({
      action: 'utilisateur.invitation_renvoi', entityType: 'member_invitation', entityId: resultat.invitation.id, companyId,
      details: { email: ancienne.email, remplace: ancienne.id },
    }, t);
    envoyerInvitation(t, resultat, company.name);
    return {
      invitation: { ...resultat.invitation.toJSON(), status: 'en_attente', role_label: ROLES_ENTREPRISE[resultat.invitation.role_code] },
      code: resultat.code,
      expires_in_days: resultat.jours,
    };
  });
}

async function revoquerInvitation(id, companyId) {
  await sequelize.transaction(async (t) => {
    const invitation = await chargerInvitation(id, companyId, t);
    if (invitation.used_at) throw new ConflictError('Cette invitation a déjà été acceptée.', 'INVITATION_UTILISEE');
    if (invitation.revoked_at) return;
    await invitation.update({ revoked_at: new Date() }, { transaction: t });
    await journaliser({ action: 'utilisateur.invitation_revocation', entityType: 'member_invitation', entityId: id, companyId, details: { email: invitation.email } }, t);
  });
}

module.exports = {
  lister, detail, changerRole, desactiver, reactiver, listerInvitations, inviter, renvoyerInvitation, revoquerInvitation,
};
