'use strict';

const crypto = require('crypto');
const { MemberInvitation } = require('../../../models/index.js');
const hashToken = require('../../../utils/hashToken.js');
const parametres = require('../../parametres/service/parametres.service.js');
const { comparerTempsConstant } = require('../../../infrastructure/paiement/signature.js');

/**
 * Invitation d'un collaborateur dans une entreprise (§ 5.3 « une entreprise
 * peut créer plusieurs utilisateurs avec différents rôles »).
 *
 * Deux secrets à usage unique, jamais stockés en clair :
 *   - un JETON long (lien d'activation envoyé par e-mail) — empreinte SHA-256 ;
 *   - un CODE à 8 chiffres (saisie manuelle sur le mobile) — HMAC lié à
 *     l'invitation : 10^8 combinaisons, 5 essais par invitation, et le code
 *     seul ne suffit pas (l'e-mail invité est exigé).
 */

const secret = () => process.env.INVITATION_SECRET || process.env.JWT_SECRET;
const MAX_ESSAIS = 5;

function empreinteCode(email, code) {
  return crypto.createHmac('sha256', secret()).update(`${String(email).toLowerCase()}:${code}`).digest('hex');
}

/**
 * Crée une invitation (et révoque les précédentes non utilisées pour le même
 * e-mail dans la même entreprise).
 * @returns {Promise<{ invitation: object, token: string, code: string, jours: number }>}
 */
async function creer(companyId, donnees, auteurId, transaction) {
  const { duree_jours: jours } = await parametres.plateforme('invitation');
  const token = crypto.randomBytes(32).toString('base64url');
  const code = String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');

  await MemberInvitation.update(
    { revoked_at: new Date() },
    { where: { company_id: companyId, email: donnees.email, used_at: null, revoked_at: null }, transaction }
  );
  const invitation = await MemberInvitation.create({
    company_id: companyId,
    email: donnees.email,
    phone: donnees.phone || null,
    first_name: donnees.first_name,
    last_name: donnees.last_name,
    job_title: donnees.job_title || null,
    role_code: donnees.role_code,
    token_hash: hashToken(token),
    code_hash: empreinteCode(donnees.email, code),
    expires_at: new Date(Date.now() + jours * 86400 * 1000),
    created_by: auteurId,
  }, { transaction });
  return { invitation, token, code, jours };
}

const estValide = (inv) => Boolean(inv) && !inv.used_at && !inv.revoked_at && inv.expires_at > new Date() && inv.attempts < MAX_ESSAIS;

/** Invitation valide correspondant à un jeton de lien, ou null. */
async function parJeton(token, transaction) {
  const inv = await MemberInvitation.findOne({ where: { token_hash: hashToken(token) }, transaction, lock: transaction?.LOCK.UPDATE });
  return estValide(inv) ? inv : null;
}

/**
 * Invitation valide pour (e-mail, code), ou null. Chaque échec consomme un
 * essai sur les invitations candidates de cet e-mail.
 */
async function parCode(email, code, transaction) {
  const candidates = await MemberInvitation.findAll({
    where: { email: String(email).toLowerCase(), used_at: null, revoked_at: null },
    transaction,
    lock: transaction?.LOCK.UPDATE,
  });
  const valides = candidates.filter(estValide);
  const trouvee = valides.find((inv) => comparerTempsConstant(inv.code_hash, empreinteCode(inv.email, code)));
  if (!trouvee && valides.length) {
    await MemberInvitation.increment('attempts', { where: { id: valides.map((v) => v.id) }, transaction });
  }
  return trouvee || null;
}

module.exports = { creer, parJeton, parCode, empreinteCode, estValide, MAX_ESSAIS };
