'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  User, Company, CompanyMember, Subscription, SubscriptionPlan, PasswordReset, MemberInvitation,
} = require('../../../models/index.js');
const { bcryptConfig, verrouillageConfig } = require('../../../config/security.js');
const bcrypt = require('../../../utils/motDePasse.js');
const { normaliserTelephone } = require('../../../utils/telephone.js');
const { aujourdhui, ajouterJours } = require('../../../utils/dates.js');
const {
  ConflictError, UnauthorizedError, ForbiddenError, BadRequestError,
} = require('../../../errors/AppError.js');
const sessions = require('./session.service.js');
const invitations = require('./invitation.service.js');
const mfa = require('./mfa.service.js');
const parametres = require('../../parametres/service/parametres.service.js');
const partenaires = require('../../partenaire/service/invitationPartenaire.service.js');
const droits = require('../../abonnement/service/droits.service.js');
const email = require('../../../infrastructure/email.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const logger = require('../../../utils/logger.js');
const { alerter, TYPES } = require('../../../infrastructure/alertes.service.js');
const { comparerTempsConstant } = require('../../../infrastructure/paiement/signature.js');

// Empreinte bcrypt factice (même coût que les vraies) : égalise le temps de
// réponse quand le compte n'existe pas (anti-énumération par chronométrage).
let empreinteFactice = null;
const EMPREINTE_FACTICE = () => {
  empreinteFactice ||= bcrypt.hash(crypto.randomBytes(16).toString('hex'), bcryptConfig.saltRounds);
  return empreinteFactice;
};

// Réponse UNIQUE pour « compte inconnu », « mauvais mot de passe » et « compte
// temporairement bloqué » : rien ne révèle qu'un compte existe. Le titulaire
// légitime se débloque par « mot de passe oublié ».
const MESSAGE_ECHEC = 'Identifiant ou mot de passe incorrect. Après plusieurs essais, le compte est bloqué 15 minutes (ou utilisez « mot de passe oublié »).';

/**
 * Traçage des connexions dans le journal d'audit : réussites et échecs, avec
 * le MOTIF de l'échec. L'identifiant tenté n'est jamais écrit en clair
 * (empreinte courte) ; l'IP et le navigateur viennent du contexte de la requête.
 */
const empreinteIdentifiant = (identifiant) => crypto.createHash('sha256')
  .update(String(identifiant || '').trim().toLowerCase()).digest('hex').slice(0, 16);

async function tracerConnexion(action, { user = null, identifiant, motif = null } = {}) {
  await journaliser({
    action,
    entityType: 'user',
    entityId: user?.id || null,
    // Un échec n'est pas imputé au titulaire du compte : l'auteur est inconnu.
    acteur: action === 'compte.connexion' ? user : { id: null, role_code: 'anonyme' },
    details: { ...(motif ? { motif } : {}), identifiant_empreinte: empreinteIdentifiant(identifiant) },
  }).catch((err) => logger.warn('[auth] Traçage de connexion impossible', { error: err.message }));
}

/** E-mail ou téléphone → clause de recherche d'utilisateur. */
function critereIdentifiant(identifiant) {
  const brut = String(identifiant || '').trim();
  // Motif ANCRÉ et borné (pas de retour arrière quadratique).
  if (/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(brut)) {
    return sequelize.where(sequelize.fn('lower', sequelize.col('email')), brut.toLowerCase());
  }
  const tel = normaliserTelephone(brut);
  return tel ? { phone: tel } : null;
}

/**
 * Inscription (§ 26 « création du compte, création de l'entreprise ») : compte,
 * entreprise, appartenance « administrateur » et abonnement d'essai (§ 25)
 * dans UNE transaction. Une invitation de partenariat (lien reçu par e-mail)
 * crée en même temps la relation avec l'entreprise qui a invité.
 */
async function inscrire(donnees, meta) {
  const { company: entreprise, invitation_token: jetonInvitation, ...compte } = donnees;
  const existe = await User.findOne({
    where: { [Op.or]: [sequelize.where(sequelize.fn('lower', sequelize.col('email')), compte.email), ...(compte.phone ? [{ phone: compte.phone }] : [])] },
    attributes: ['id', 'email', 'phone'],
  });
  if (existe) {
    throw new ConflictError(
      compte.phone && existe.phone === compte.phone ? 'Ce numéro de téléphone est déjà utilisé' : 'Cet e-mail est déjà utilisé',
      'COMPTE_EXISTANT'
    );
  }
  if (entreprise.ninea) {
    const nineaPris = await Company.findOne({ where: sequelize.where(sequelize.fn('upper', sequelize.col('ninea')), entreprise.ninea.toUpperCase()), attributes: ['id'] });
    if (nineaPris) throw new ConflictError('Une entreprise est déjà inscrite avec ce NINEA. Demandez à son administrateur de vous inviter.', 'NINEA_UTILISE');
  }

  const empreinte = await bcrypt.hash(compte.password, bcryptConfig.saltRounds);
  const essai = await parametres.plateforme('essai');

  return sequelize.transaction(async (t) => {
    const user = await User.create({
      role_code: 'utilisateur',
      first_name: compte.first_name,
      last_name: compte.last_name,
      email: compte.email,
      phone: compte.phone || null,
      job_title: compte.job_title || null,
      password_hash: empreinte,
    }, { transaction: t });

    const company = await Company.create({
      ...entreprise,
      email: entreprise.email || compte.email,
      phone: entreprise.phone || compte.phone || null,
      // § 6 « informations fiscales » : une entreprise assujettie facture la
      // TVA sénégalaise (18 %) par défaut ; le taux reste modifiable.
      default_tax_rate: entreprise.default_tax_rate ?? (entreprise.vat_registered ? 18 : 0),
      created_by: user.id,
    }, { transaction: t });

    await CompanyMember.create({ company_id: company.id, user_id: user.id, role_code: 'administrateur' }, { transaction: t });

    const plan = await SubscriptionPlan.findOne({ where: { code: essai.plan_code, status: 'actif' }, transaction: t });
    if (plan && essai.duree_jours > 0) {
      const debut = aujourdhui();
      const fin = ajouterJours(debut, essai.duree_jours);
      await Subscription.create({
        company_id: company.id, plan_id: plan.id, status: 'essai',
        current_period_start: debut, current_period_end: fin, trial_ends_at: fin,
      }, { transaction: t });
    } else {
      logger.warn('[auth] Forfait d’essai introuvable ou essai désactivé — entreprise créée sans abonnement', { plan: essai.plan_code });
    }

    await journaliser({
      action: 'entreprise.creation', entityType: 'company', entityId: company.id, companyId: company.id,
      acteur: user, details: { name: company.name, type: company.type, plan_essai: plan?.code || null },
    }, t);

    const partenariats = await partenaires.rattacherALInscription(company, user, jetonInvitation || null, t);
    const session = await sessions.ouvrirSession(user, meta, t);
    return { user, company, session, partenariats };
  });
}

/**
 * Connexion par téléphone ou e-mail, avec verrouillage après échecs
 * successifs (anti force brute) et réponses indiscernables pour un compte
 * inexistant.
 */
async function connecter({ identifiant, password }, meta) {
  const critere = critereIdentifiant(identifiant);
  const user = critere ? await User.findOne({ where: critere }) : null;

  if (!user) {
    await bcrypt.compare(password, await EMPREINTE_FACTICE());
    await tracerConnexion('compte.connexion_echec', { identifiant, motif: 'compte_inconnu' });
    throw new UnauthorizedError(MESSAGE_ECHEC, 'IDENTIFIANTS_INVALIDES');
  }

  if (user.locked_until && user.locked_until > new Date()) {
    // Même coût et même réponse qu'un mot de passe faux (anti-énumération).
    await bcrypt.compare(password, await EMPREINTE_FACTICE());
    await tracerConnexion('compte.connexion_echec', { user, identifiant, motif: 'compte_verrouille' });
    throw new UnauthorizedError(MESSAGE_ECHEC, 'IDENTIFIANTS_INVALIDES');
  }

  const valide = await bcrypt.compare(password, user.password_hash);
  if (!valide) {
    // Incrément ATOMIQUE en base : des essais parallèles ne se neutralisent pas.
    const [[ligne]] = await sequelize.query(
      `UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
              locked_until = CASE WHEN failed_login_attempts + 1 >= :max THEN now() + (:minutes || ' minutes')::interval ELSE locked_until END
        WHERE id = :id RETURNING failed_login_attempts`,
      { replacements: { id: user.id, max: verrouillageConfig.maxTentatives, minutes: String(verrouillageConfig.dureeMinutes) } }
    );
    if (ligne?.failed_login_attempts >= verrouillageConfig.maxTentatives) {
      await User.update({ failed_login_attempts: 0 }, { where: { id: user.id } });
      await journaliser({ action: 'compte.verrouillage', entityType: 'user', entityId: user.id, acteur: user, details: { motif: 'echecs_successifs' } });
      if (user.role_code === 'super_admin') {
        alerter(TYPES.VERROUILLAGE_SUPER_ADMIN, 'Compte super administrateur verrouillé après des mots de passe faux successifs', { utilisateurId: user.id });
      }
    }
    await tracerConnexion('compte.connexion_echec', { user, identifiant, motif: 'mot_de_passe' });
    throw new UnauthorizedError(MESSAGE_ECHEC, 'IDENTIFIANTS_INVALIDES');
  }

  // Statut annoncé seulement à qui connaît le mot de passe (anti-énumération).
  if (user.status !== 'actif') throw new ForbiddenError('Votre compte est désactivé. Contactez le support.', 'COMPTE_INACTIF');

  // Double authentification active : le mot de passe seul n'ouvre PAS de
  // session, seulement l'étape « code » (POST /auth/mfa).
  if (mfa.mfaActive(user)) {
    await tracerConnexion('compte.connexion_mot_de_passe_valide', { user, identifiant, motif: 'double_authentification_requise' });
    return { user, mfa: { jeton: mfa.emettreJetonMfa(user), expiresIn: mfa.DUREE_JETON_MFA } };
  }

  if (user.failed_login_attempts || user.locked_until) {
    await user.update({ failed_login_attempts: 0, locked_until: null });
  }
  const session = await sessions.ouvrirSession(user, meta);
  await tracerConnexion('compte.connexion', { user, identifiant });
  return { user, session };
}

/**
 * Mot de passe oublié : code à 6 chiffres par e-mail, durée paramétrable.
 * Réponse identique que le compte existe ou non.
 */
async function demanderReinitialisation({ identifiant }) {
  const critere = critereIdentifiant(identifiant);
  const user = critere ? await User.findOne({ where: critere, attributes: ['id', 'email', 'first_name', 'status', 'role_code'] }) : null;
  if (!user || user.status !== 'actif' || !user.email) return;
  // Super admin : AUCUNE réinitialisation par e-mail (une boîte mail
  // compromise ne doit pas suffire à prendre la plateforme). Accès rétabli
  // par un autre super admin. Réponse identique pour l'appelant.
  if (user.role_code === 'super_admin') {
    logger.warn('[auth] Réinitialisation par e-mail demandée pour un super admin — refusée', { utilisateurId: user.id });
    await journaliser({ action: 'compte.reinitialisation_refusee', entityType: 'user', entityId: user.id, acteur: { id: null, role_code: 'anonyme' }, details: { motif: 'super_admin' } });
    return;
  }

  const { duree_minutes: minutes } = await parametres.plateforme('otp');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await sequelize.transaction(async (t) => {
    await PasswordReset.update({ used_at: new Date() }, { where: { user_id: user.id, used_at: null }, transaction: t });
    await PasswordReset.create({
      user_id: user.id,
      otp_hash: crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${user.id}:${code}`).digest('hex'),
      expires_at: new Date(Date.now() + minutes * 60 * 1000),
    }, { transaction: t });
  });
  try {
    await email.envoyerCodeReinitialisation({ email: user.email, prenom: user.first_name, code, minutes });
  } catch (err) {
    logger.warn('[auth] Envoi du code de réinitialisation impossible', { error: err.message });
  }
}

async function reinitialiserMotDePasse({ identifiant, code, password }) {
  const critere = critereIdentifiant(identifiant);
  const user = critere ? await User.findOne({ where: critere }) : null;
  const refus = new BadRequestError('Code invalide ou expiré', 'CODE_INVALIDE');
  if (!user || user.role_code === 'super_admin') throw refus;

  const { tentatives_max: maxEssais } = await parametres.plateforme('otp');
  const demande = await PasswordReset.findOne({
    where: { user_id: user.id, used_at: null, expires_at: { [Op.gt]: new Date() } },
    order: [['created_at', 'DESC']],
  });
  if (!demande) throw refus;

  // L'essai est compté AVANT la comparaison, par UNE mise à jour
  // conditionnelle : des requêtes simultanées ne multiplient pas les essais.
  const [comptes] = await sequelize.query(
    `UPDATE password_resets SET attempts = attempts + 1
      WHERE id = :id AND used_at IS NULL AND attempts < :max RETURNING attempts`,
    { replacements: { id: demande.id, max: maxEssais } }
  );
  if (!comptes.length) throw refus;

  const attendu = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${user.id}:${code}`).digest('hex');
  if (!comparerTempsConstant(attendu, demande.otp_hash)) throw refus;

  const empreinte = await bcrypt.hash(password, bcryptConfig.saltRounds);
  await sequelize.transaction(async (t) => {
    // Consommation conditionnelle : un code ne sert qu'une fois, même sous concurrence.
    const [consomme] = await PasswordReset.update(
      { used_at: new Date() },
      { where: { id: demande.id, used_at: null }, transaction: t }
    );
    if (!consomme) throw refus;
    await user.update({ password_hash: empreinte, failed_login_attempts: 0, locked_until: null, must_change_password: false }, { transaction: t });
    // Toutes les sessions tombent : un voleur de session perd l'accès.
    await sessions.revoquerToutesLesSessions(user.id, t);
    await journaliser({ action: 'compte.reinitialisation_mot_de_passe', entityType: 'user', entityId: user.id, acteur: user }, t);
  });
}

/**
 * Activation d'une invitation de collaborateur (§ 5.3) par LIEN ou par CODE +
 * e-mail. Crée le compte avec le rôle choisi par l'administrateur de
 * l'entreprise.
 *
 * Un e-mail déjà associé à un compte : en V1, un compte appartient à UNE
 * entreprise. Un compte sans entreprise (ancien collaborateur retiré) est
 * rattaché à condition de prouver son mot de passe.
 */
async function activerInvitation({ token, code, email: adresse, password, phone }, meta) {
  const refus = () => new BadRequestError('Invitation invalide, expirée ou déjà utilisée', 'INVITATION_INVALIDE');

  // La recherche de l'invitation — et l'incrément du compteur d'essais en
  // cas de code faux — se fait dans SA PROPRE transaction, VALIDÉE avant de
  // répondre : sans cela, le refus annulerait aussi l'incrément et le
  // plafond de 5 essais ne s'appliquerait jamais.
  const invitationId = await sequelize.transaction(async (t) => {
    if (token) return (await invitations.parJeton(token, t))?.id || null;
    return (await invitations.parCode(adresse, code, t))?.id || null;
  });
  if (!invitationId) throw refus();

  try {
    return await activerAvecInvitation(invitationId, { password, phone }, meta, refus);
  } catch (err) {
    if (err.code === 'COMPTE_EXISTANT_MOT_DE_PASSE') {
      await MemberInvitation.increment('attempts', { where: { id: invitationId } });
    }
    throw err;
  }
}

async function activerAvecInvitation(invitationId, { password, phone }, meta, refus) {
  return sequelize.transaction(async (t) => {
    const invitation = await MemberInvitation.findByPk(invitationId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!invitations.estValide(invitation)) throw refus();

    const company = await Company.findByPk(invitation.company_id, { transaction: t });
    if (!company || company.status !== 'actif') throw new ForbiddenError("L'entreprise qui vous a invité n'est plus active.", 'ENTREPRISE_SUSPENDUE');
    await droits.verifierLimite(company.id, 'users', t);

    let user = await User.findOne({
      where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), invitation.email.toLowerCase()),
      transaction: t,
    });
    if (user) {
      if (user.role_code !== 'utilisateur') throw new ConflictError('Cet e-mail est associé à un compte d’un autre type.', 'EMAIL_UTILISE');
      const appartenance = await CompanyMember.findOne({ where: { user_id: user.id }, transaction: t });
      if (appartenance) {
        throw new ConflictError('Ce compte appartient déjà à une entreprise : un compte ne peut être rattaché qu’à une seule entreprise.', 'COMPTE_DEJA_RATTACHE');
      }
      if (!(await bcrypt.compare(password, user.password_hash))) {
        throw new UnauthorizedError('Un compte existe déjà pour cet e-mail : saisissez son mot de passe pour rejoindre l’entreprise.', 'COMPTE_EXISTANT_MOT_DE_PASSE');
      }
      if (user.status !== 'actif') throw new ForbiddenError('Votre compte est désactivé. Contactez le support.', 'COMPTE_INACTIF');
    } else {
      const telephone = phone || invitation.phone;
      if (telephone && await User.findOne({ where: { phone: telephone }, attributes: ['id'], transaction: t })) {
        throw new ConflictError('Ce numéro de téléphone est déjà utilisé par un autre compte.', 'TELEPHONE_UTILISE');
      }
      user = await User.create({
        role_code: 'utilisateur',
        first_name: invitation.first_name,
        last_name: invitation.last_name,
        email: invitation.email,
        phone: telephone || null,
        job_title: invitation.job_title,
        password_hash: await bcrypt.hash(password, bcryptConfig.saltRounds),
        // L'invitation reçue dans la boîte mail prouve la possession de l'adresse.
        email_verified_at: new Date(),
      }, { transaction: t });
    }

    await CompanyMember.create({
      company_id: company.id, user_id: user.id, role_code: invitation.role_code, invited_by: invitation.created_by,
    }, { transaction: t });
    await invitation.update({ used_at: new Date() }, { transaction: t });
    await journaliser({
      action: 'utilisateur.activation_invitation', entityType: 'user', entityId: user.id,
      companyId: company.id, acteur: user, details: { role: invitation.role_code },
    }, t);

    const session = await sessions.ouvrirSession(user, meta, t);
    return { user, session };
  });
}

module.exports = {
  inscrire, connecter, demanderReinitialisation, reinitialiserMotDePasse, activerInvitation, critereIdentifiant,
};
