'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  PartnershipInvitation, Partnership, Company, User, CompanyMember,
} = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { parametresEntreprise } = require('../../../config/parametres.js');
const { ConflictError, NotFoundError } = require('../../../errors/AppError.js');
const hashToken = require('../../../utils/hashToken.js');
const email = require('../../../infrastructure/email.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise } = require('../../notification/service/notification.service.js');
const logger = require('../../../utils/logger.js');

/**
 * Invitation d'un partenaire qui n'est PAS encore sur Pro2Link (§ 7
 * « rechercher ou enregistrer ses fournisseurs », § 29 « passer de WhatsApp +
 * appels + Excel à un fonctionnement centralisé »).
 *
 * L'entreprise invite par e-mail un fournisseur (ou un client). Le lien reçu
 * mène à l'inscription ; à la création de l'espace, le partenariat est créé
 * ACTIF (le lien prouve l'accord des deux parties). Si l'invité s'inscrit sans
 * le lien mais avec la même adresse, le partenariat est créé EN ATTENTE : il
 * l'accepte depuis son espace.
 */

const DUREE_JOURS = 30;

async function lister(companyId, { status } = {}, { limit, offset }) {
  const where = { company_id: companyId };
  if (status) where.status = status;
  return PartnershipInvitation.findAndCountAll({ where, order: [['created_at', 'DESC'], ['id', 'ASC']], limit, offset });
}

/**
 * Une entreprise déjà inscrite avec cette adresse (contact de l'entreprise ou
 * e-mail d'un de ses membres) : on ne l'invite pas, on lui envoie une demande
 * de partenariat (409 avec son identifiant).
 */
async function entrepriseInscrite(adresse, transaction) {
  const parContact = await Company.findOne({
    where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), adresse),
    attributes: ['id', 'name'],
    transaction,
  });
  if (parContact) return parContact;
  const membre = await User.findOne({
    where: sequelize.where(sequelize.fn('lower', sequelize.col('User.email')), adresse),
    attributes: ['id'],
    include: [{ model: CompanyMember, as: 'memberships', required: true, attributes: ['company_id'], include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }] }],
    transaction,
  });
  return membre?.memberships?.[0]?.company || null;
}

async function creer(acteur, companyId, donnees) {
  return sequelize.transaction(async (t) => {
    const deja = await entrepriseInscrite(donnees.email, t);
    if (deja) {
      if (deja.id === companyId) throw new ConflictError('Cette adresse appartient à votre propre entreprise.', 'PARTENAIRE_INVALIDE');
      throw new ConflictError(`${deja.name} est déjà sur Pro2Link : envoyez-lui une demande de partenariat depuis l’annuaire.`, 'ENTREPRISE_DEJA_INSCRITE', { company_id: deja.id });
    }
    const company = await Company.findByPk(companyId, { attributes: ['id', 'name'], transaction: t });
    // Une invitation en attente pour la même adresse est remplacée (nouveau lien).
    await PartnershipInvitation.update(
      { status: 'annulee' },
      { where: { company_id: companyId, email: donnees.email, status: 'en_attente' }, transaction: t }
    );
    const token = crypto.randomBytes(32).toString('base64url');
    const invitation = await PartnershipInvitation.create({
      company_id: companyId,
      relation: donnees.relation,
      email: donnees.email,
      company_name: donnees.company_name || null,
      contact_name: donnees.contact_name || null,
      message: donnees.message || null,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + DUREE_JOURS * 86400 * 1000),
      created_by: acteur.id,
    }, { transaction: t });
    await journaliser({
      action: 'partenariat.invitation', entityType: 'partnership_invitation', entityId: invitation.id, companyId,
      details: { email: donnees.email, relation: donnees.relation },
    }, t);
    t.afterCommit(() => {
      email.envoyerInvitationPartenaire({
        email: donnees.email, entreprise: company.name, relation: donnees.relation, message: donnees.message, token, jours: DUREE_JOURS,
      }).catch((err) => logger.warn('[partenaire] Envoi de l’invitation impossible', { error: err.message }));
    });
    // Le lien est aussi rendu à l'invitant : il peut le partager lui-même
    // (WhatsApp, SMS) — c'est son invitation.
    return { invitation, token, expires_in_days: DUREE_JOURS };
  });
}

async function annuler(id, companyId) {
  await sequelize.transaction(async (t) => {
    const invitation = await PartnershipInvitation.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!invitation || invitation.company_id !== companyId) throw new NotFoundError('Invitation introuvable');
    if (invitation.status !== 'en_attente') throw new ConflictError(`Cette invitation est « ${invitation.status} ».`, 'INVITATION_CLOSE');
    await invitation.update({ status: 'annulee' }, { transaction: t });
    await journaliser({ action: 'partenariat.invitation_annulation', entityType: 'partnership_invitation', entityId: id, companyId }, t);
  });
}

const profilCompatible = (company, role) => (role === 'fournisseur'
  ? ['fournisseur', 'mixte'].includes(company.type)
  : ['acheteur', 'mixte'].includes(company.type));

/**
 * À l'inscription d'une entreprise : transforme ses invitations en
 * partenariats. Appelé dans la transaction de l'inscription.
 * @returns {Promise<Array<{ partnership_id: string, status: string, partner: string }>>}
 */
async function rattacherALInscription(nouvelle, user, jeton, t) {
  const adresses = [...new Set([user.email, nouvelle.email].filter(Boolean).map((a) => a.toLowerCase()))];
  const conditions = [{ status: 'en_attente', expires_at: { [Op.gt]: new Date() } }];
  const candidates = await PartnershipInvitation.findAll({
    where: {
      [Op.and]: [
        ...conditions,
        { [Op.or]: [...(jeton ? [{ token_hash: hashToken(jeton) }] : []), ...adresses.map((a) => sequelize.where(sequelize.fn('lower', sequelize.col('email')), a))] },
      ],
    },
    lock: t.LOCK.UPDATE,
    transaction: t,
  });
  const crees = [];
  for (const invitation of candidates) {
    const invitante = await Company.findByPk(invitation.company_id, { transaction: t });
    if (!invitante || invitante.status !== 'actif') continue;
    // `relation` : rôle de la NOUVELLE entreprise vis-à-vis de l'invitante.
    const roleInvitee = invitation.relation;
    const roleInvitante = roleInvitee === 'fournisseur' ? 'acheteur' : 'fournisseur';
    if (!profilCompatible(nouvelle, roleInvitee === 'fournisseur' ? 'fournisseur' : 'acheteur')
      || !profilCompatible(invitante, roleInvitante)) {
      logger.info('[partenaire] Invitation non rattachée : profils incompatibles', { invitation: invitation.id });
      continue;
    }
    const acheteur = roleInvitee === 'fournisseur' ? invitante : nouvelle;
    const fournisseur = roleInvitee === 'fournisseur' ? nouvelle : invitante;
    const parLien = Boolean(jeton) && invitation.token_hash === hashToken(jeton);
    const [partenariat] = await Partnership.findOrCreate({
      where: { buyer_company_id: acheteur.id, supplier_company_id: fournisseur.id },
      defaults: {
        status: parLien ? 'actif' : 'en_attente',
        requested_by_company_id: invitante.id,
        requested_by: invitation.created_by,
        request_message: invitation.message,
        responded_at: parLien ? new Date() : null,
        responded_by: parLien ? user.id : null,
        payment_terms_days: parametresEntreprise(fournisseur).default_payment_terms_days,
      },
      transaction: t,
    });
    await invitation.update({ status: 'acceptee', accepted_company_id: nouvelle.id, accepted_at: new Date() }, { transaction: t });
    await journaliser({
      action: 'partenariat.invitation_acceptee', entityType: 'partnership', entityId: partenariat.id, companyId: nouvelle.id,
      acteur: user, details: { invitation_id: invitation.id, par_lien: parLien },
    }, t);
    await notifierEntreprise(t, invitante.id, P.PARTENAIRES_LIRE, {
      type: 'partenariat',
      titre: `${nouvelle.name} a rejoint Pro2Link`,
      corps: parLien
        ? `${nouvelle.name} a accepté votre invitation : vous êtes désormais partenaires.`
        : `${nouvelle.name} s'est inscrite : votre demande de partenariat attend sa réponse.`,
      donnees: { partnership_id: partenariat.id },
    });
    crees.push({ partnership_id: partenariat.id, status: partenariat.status, partner: invitante.name });
  }
  return crees;
}

module.exports = { lister, creer, annuler, rattacherALInscription, DUREE_JOURS };
