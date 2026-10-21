'use strict';

const { Resend } = require('resend');
const logger = require('../utils/logger.js');
const { Disjoncteur } = require('../utils/circuitBreaker.js');
const escapeHtml = require('../utils/escapeHtml.js');

/**
 * E-mails transactionnels via Resend (même fournisseur que Widjila, Sign et
 * Immo) : code de réinitialisation, invitation d'un collaborateur, invitation
 * d'un partenaire, avis de nouveau bon de commande et de nouvelle facture.
 *
 * Initialisation paresseuse et tolérante : sans RESEND_API_KEY, l'envoi est
 * ignoré et journalisé — l'application reste utilisable en développement.
 * Le disjoncteur borne le temps d'attente si le fournisseur ne répond plus.
 */

let client = null;
let initialise = false;

function getClient() {
  if (initialise) return client;
  initialise = true;
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[email] RESEND_API_KEY non définie — envoi d’e-mails désactivé');
    return null;
  }
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

const disjoncteur = new Disjoncteur('resend', {
  libelle: "d'e-mail",
  delaiAppelMs: parseInt(process.env.EMAIL_TIMEOUT_MS || '10000', 10),
  estEchecDependance: (err) => !(err && err.statusCode && err.statusCode < 500),
});

const EXPEDITEUR = () => process.env.EMAIL_FROM || 'Pro2Link <no-reply@example.com>';
const NOM_PRODUIT = () => process.env.APP_NAME || 'Pro2Link';
const URL_APP = () => String(process.env.APP_PUBLIC_URL || '').replace(/\/$/, '');

function gabarit(titre, corpsHtml) {
  return `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;background:#f5f6f8;padding:24px;color:#1f2937">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:8px;padding:24px">
<h2 style="margin-top:0;color:#0F4C81">${escapeHtml(titre)}</h2>${corpsHtml}
<p style="color:#6b7280;font-size:12px;margin-top:32px">${escapeHtml(NOM_PRODUIT())} — message automatique, merci de ne pas y répondre.</p>
</div></body></html>`;
}

const bouton = (lien, texte) => (lien
  ? `<p><a href="${escapeHtml(lien)}" style="display:inline-block;background:#0F4C81;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(texte)}</a></p>`
  : '');

/**
 * @returns {Promise<{ envoye: boolean, id?: string, raison?: string }>}
 */
async function envoyer({ a, sujet, html, texte }) {
  const c = getClient();
  if (!c) return { envoye: false, raison: 'non_configure' };
  const reponse = await disjoncteur.executer(() => c.emails.send({ from: EXPEDITEUR(), to: a, subject: sujet, html, text: texte }));
  if (reponse?.error) {
    logger.warn('[email] Envoi refusé par le fournisseur', { error: reponse.error.message });
    return { envoye: false, raison: 'refuse' };
  }
  return { envoye: true, id: reponse?.data?.id };
}

async function envoyerCodeReinitialisation({ email, prenom, code, minutes }) {
  const titre = 'Réinitialisation de votre mot de passe';
  return envoyer({
    a: email,
    sujet: `${NOM_PRODUIT()} — ${titre}`,
    html: gabarit(titre, `<p>Bonjour ${escapeHtml(prenom)},</p>
<p>Votre code de réinitialisation :</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${escapeHtml(code)}</p>
<p>Il expire dans ${minutes} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`),
    texte: `Votre code de réinitialisation : ${code} (valable ${minutes} minutes).`,
  });
}

/** § 5.3 — un administrateur invite un collaborateur dans son entreprise. */
async function envoyerInvitationCollaborateur({ email, prenom, entreprise, role, code, token, jours }) {
  const titre = `Rejoignez ${entreprise} sur ${NOM_PRODUIT()}`;
  const lien = URL_APP() ? `${URL_APP()}/invitation?token=${encodeURIComponent(token)}` : null;
  return envoyer({
    a: email,
    sujet: titre,
    html: gabarit(titre, `<p>Bonjour ${escapeHtml(prenom)},</p>
<p>${escapeHtml(entreprise)} vous invite à rejoindre son espace ${escapeHtml(NOM_PRODUIT())} en tant que <strong>${escapeHtml(role)}</strong>.</p>
${bouton(lien, 'Activer mon compte')}
<p>Depuis l'application mobile, saisissez votre e-mail et ce code d'activation :</p>
<p style="font-size:22px;font-weight:bold;letter-spacing:4px">${escapeHtml(code)}</p>
<p>Cette invitation expire dans ${jours} jours.</p>`),
    texte: `${entreprise} vous invite sur ${NOM_PRODUIT()}. Code d'activation : ${code}${lien ? ` — ${lien}` : ''}`,
  });
}

/** § 7 — une entreprise invite un fournisseur ou un client qui n'est pas encore sur la plateforme. */
async function envoyerInvitationPartenaire({ email, entreprise, relation, message, token, jours }) {
  const role = relation === 'fournisseur' ? 'fournisseur' : 'client';
  const titre = `${entreprise} vous invite sur ${NOM_PRODUIT()}`;
  const lien = URL_APP() ? `${URL_APP()}/inscription?invitation=${encodeURIComponent(token)}` : null;
  return envoyer({
    a: email,
    sujet: titre,
    html: gabarit(titre, `<p>Bonjour,</p>
<p><strong>${escapeHtml(entreprise)}</strong> souhaite travailler avec vous comme <strong>${role}</strong> sur ${escapeHtml(NOM_PRODUIT())} : bons de commande, validation, livraisons, factures et paiements au même endroit.</p>
${message ? `<blockquote style="border-left:3px solid #d1d5db;margin:0;padding-left:12px;color:#4b5563">${escapeHtml(message)}</blockquote>` : ''}
${bouton(lien, 'Créer mon espace entreprise')}
<p>Cette invitation expire dans ${jours} jours.</p>`),
    texte: `${entreprise} vous invite sur ${NOM_PRODUIT()} comme ${role}.${lien ? ` Inscription : ${lien}` : ''}`,
  });
}

/**
 * Avis par e-mail à l'adresse de contact d'une entreprise pour un événement
 * important (nouveau bon de commande, nouvelle facture) — en complément des
 * notifications web et mobile.
 */
async function envoyerAvis({ email, titre, texte, lien }) {
  const url = lien && URL_APP() ? `${URL_APP()}${lien}` : null;
  return envoyer({
    a: email,
    sujet: `${NOM_PRODUIT()} — ${titre}`,
    html: gabarit(titre, `<p>${escapeHtml(texte)}</p>${bouton(url, 'Ouvrir dans Pro2Link')}`),
    texte: `${texte}${url ? ` — ${url}` : ''}`,
  });
}

module.exports = {
  envoyer, envoyerCodeReinitialisation, envoyerInvitationCollaborateur, envoyerInvitationPartenaire, envoyerAvis, disjoncteur,
};
