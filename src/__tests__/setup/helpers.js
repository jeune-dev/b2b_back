'use strict';

/**
 * Aides des tests d'intégration : entreprises, partenariats, produits et
 * commandes créés PAR L'API (mêmes chemins que le web et le mobile).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../app.js');
const sequelize = require('../../config/db.js');
const bcrypt = require('../../utils/motDePasse.js');
const totp = require('../../utils/totp.js');
const { encrypt } = require('../../utils/cryptoField.js');

/**
 * Routes de mouvement d'argent qui EXIGENT une Idempotency-Key : comme le
 * client, `api()` en pose une neuve à chaque appel. L'obligation elle-même
 * est vérifiée avec une requête brute (`apiBrute()`), sans clé.
 */
const ROUTES_IDEMPOTENCE_OBLIGATOIRE = /^\/api\/v1\/paiements$/;
const api = () => {
  const agent = request(app);
  const post = agent.post.bind(agent);
  agent.post = (url) => {
    const test = post(url);
    return ROUTES_IDEMPOTENCE_OBLIGATOIRE.test(String(url).split('?')[0]) ? test.set('Idempotency-Key', crypto.randomUUID()) : test;
  };
  return agent;
};
const apiBrute = () => request(app);
const MOT_DE_PASSE = 'MotDePasse1';

/**
 * Téléphone sénégalais UNIQUE dans la base du worker : compteur séquentiel
 * persistant, propre à la base (Jest recharge ce module pour chaque fichier,
 * la base du worker cumule les comptes de tous les fichiers).
 */
const FICHIER_COMPTEUR = path.resolve(__dirname, '..', '..', '..', 'tmp', `telephones-${process.env.DB_NAME || 'unit'}.txt`);
function telephoneUnique() {
  fs.mkdirSync(path.dirname(FICHIER_COMPTEUR), { recursive: true });
  let n;
  try {
    n = Number(fs.readFileSync(FICHIER_COMPTEUR, 'utf8'));
  } catch {
    n = NaN;
  }
  n = Number.isInteger(n) ? (n + 1) % 10_000_000 : crypto.randomInt(0, 10_000_000);
  fs.writeFileSync(FICHIER_COMPTEUR, String(n));
  return `+22177${String(n).padStart(7, '0')}`;
}
const emailUnique = (prefixe = 'user') => `${prefixe}.${crypto.randomBytes(5).toString('hex')}@test.sn`;
const nineaUnique = () => `${crypto.randomInt(100000000, 999999999)}`;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * Inscrit une entreprise (compte administrateur + entreprise + essai) et
 * renvoie sa session.
 * @param {{ type?: 'acheteur'|'fournisseur'|'mixte', company?: object }} [o]
 */
async function nouvelleEntreprise({ type = 'mixte', company = {}, ...surcharges } = {}) {
  const corps = {
    first_name: 'Awa', last_name: 'Diop', phone: telephoneUnique(), email: emailUnique('admin'),
    password: MOT_DE_PASSE, password_confirmation: MOT_DE_PASSE,
    company: {
      name: `Société ${crypto.randomBytes(3).toString('hex')}`, type, city: 'Dakar', sector: 'distribution', ninea: nineaUnique(),
      vat_registered: true, ...company,
    },
    ...surcharges,
  };
  const res = await api().post('/api/v1/auth/inscription').send(corps);
  if (res.status !== 201) throw new Error(`Inscription impossible : ${res.status} ${JSON.stringify(res.body)}`);
  return {
    token: res.body.data.access_token,
    refreshToken: res.body.data.refresh_token,
    user: res.body.data.user,
    companyId: res.body.data.company.id,
    company: res.body.data.company,
    identifiants: { phone: corps.phone, email: corps.email, password: MOT_DE_PASSE },
    h: bearer(res.body.data.access_token),
  };
}

/**
 * Super admin connecté par le VRAI parcours : mot de passe, puis code TOTP
 * (double authentification obligatoire pour ce rôle). `mfa: false` crée un
 * super admin qui ne l'a pas encore configurée.
 */
async function superAdmin({ mfa = true } = {}) {
  const email = emailUnique('superadmin');
  const secret = totp.genererSecret();
  await sequelize.query(
    `INSERT INTO users (role_code, first_name, last_name, email, password_hash, totp_secret, totp_enabled_at)
     VALUES ('super_admin', 'Admin', 'Test', :email, :h, :secret, ${mfa ? 'now()' : 'NULL'})`,
    { replacements: { email, h: await bcrypt.hash(MOT_DE_PASSE, 4), secret: mfa ? encrypt(secret) : null } }
  );
  let res = await api().post('/api/v1/auth/connexion').send({ identifiant: email, password: MOT_DE_PASSE });
  if (mfa) {
    if (!res.body.data?.mfa_token) throw new Error(`Connexion super admin : ${res.status} ${JSON.stringify(res.body)}`);
    res = await api().post('/api/v1/auth/mfa').send({ mfa_token: res.body.data.mfa_token, code: totp.codePourPas(secret, totp.pasCourant()) });
  }
  if (!res.body.data?.access_token) throw new Error(`Connexion super admin : ${res.status} ${JSON.stringify(res.body)}`);
  return {
    token: res.body.data.access_token, h: bearer(res.body.data.access_token), user: res.body.data.user,
    refreshToken: res.body.data.refresh_token, email, secret: mfa ? secret : null,
  };
}

/** Code TOTP valide pour un secret (décalage en pas de 30 s). */
const codeTotp = (secret, decalage = 0) => totp.codePourPas(secret, totp.pasCourant() + decalage);

/** Partenariat ACTIF : l'acheteur ajoute le fournisseur, qui accepte. */
async function partenaires(acheteur, fournisseur) {
  const demande = await api().post('/api/v1/partenariats').set(acheteur.h).send({ company_id: fournisseur.companyId, relation: 'fournisseur' });
  if (demande.status !== 201) throw new Error(`Partenariat : ${demande.status} ${JSON.stringify(demande.body)}`);
  const id = demande.body.data.partnership.id;
  if (demande.body.data.partnership.status === 'actif') return demande.body.data.partnership;
  const acceptation = await api().post(`/api/v1/partenariats/${id}/accepter`).set(fournisseur.h).send({});
  if (acceptation.status !== 200) throw new Error(`Acceptation : ${acceptation.status} ${JSON.stringify(acceptation.body)}`);
  return acceptation.body.data.partnership;
}

async function creerProduit(fournisseur, surcharges = {}) {
  const res = await api().post('/api/v1/produits').set(fournisseur.h).send({
    reference: `REF-${crypto.randomBytes(3).toString('hex')}`, name: `Riz brisé ${crypto.randomBytes(2).toString('hex')}`,
    unit: 'sac', price: 15000, tax_rate: 18, ...surcharges,
  });
  if (res.status !== 201) throw new Error(`Produit : ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.product;
}

/** Acheteur et fournisseur partenaires, deux produits au catalogue. */
async function relationCommerciale() {
  const acheteur = await nouvelleEntreprise({ type: 'acheteur' });
  const fournisseur = await nouvelleEntreprise({ type: 'fournisseur' });
  const partenariat = await partenaires(acheteur, fournisseur);
  const p1 = await creerProduit(fournisseur, { price: 15000, tax_rate: 18, unit: 'sac' });
  const p2 = await creerProduit(fournisseur, { price: 2500, tax_rate: 0, unit: 'kg' });
  return { acheteur, fournisseur, partenariat, produits: [p1, p2] };
}

async function creerBrouillon(acheteur, fournisseur, lignes, surcharges = {}) {
  const res = await api().post('/api/v1/achats').set(acheteur.h).send({ supplier_id: fournisseur.companyId, lines: lignes, ...surcharges });
  if (res.status !== 201) throw new Error(`Commande : ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.order;
}

/** Bon de commande ENVOYÉ (10 sacs + 4 kg). */
async function commandeEnvoyee(rc, lignes = null) {
  const brouillon = await creerBrouillon(rc.acheteur, rc.fournisseur, lignes || [
    { product_id: rc.produits[0].id, quantity: 10 },
    { product_id: rc.produits[1].id, quantity: 4 },
  ]);
  const res = await api().post(`/api/v1/achats/${brouillon.id}/envoyer`).set(rc.acheteur.h).send({});
  if (res.status !== 200) throw new Error(`Envoi : ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.order;
}

/** Commande validée (acceptée telle quelle), livrée puis réceptionnée. */
async function commandeReceptionnee(rc, lignes = null) {
  const commande = await commandeEnvoyee(rc, lignes);
  const etapes = [
    [rc.fournisseur, `/api/v1/ventes/${commande.id}/accepter`, {}],
    [rc.fournisseur, `/api/v1/ventes/${commande.id}/livrer`, {}],
    [rc.acheteur, `/api/v1/achats/${commande.id}/confirmer-reception`, {}],
  ];
  let derniere;
  for (const [qui, url, corps] of etapes) {
    derniere = await api().post(url).set(qui.h).send(corps);
    if (derniere.status !== 200) throw new Error(`${url} : ${derniere.status} ${JSON.stringify(derniere.body)}`);
  }
  return derniere.body.data.order;
}

async function factureEmise(rc, commande = null) {
  const c = commande || await commandeReceptionnee(rc);
  const res = await api().post('/api/v1/factures').set(rc.fournisseur.h).send({ order_id: c.id });
  if (res.status !== 201) throw new Error(`Facture : ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.invoice;
}

/** Image PNG valide minimale (téléversements). */
async function pngTest(couleur = '#f00', taille = 12) {
  const sharp = require('sharp');
  return sharp({ create: { width: taille, height: taille, channels: 3, background: couleur } }).png().toBuffer();
}

/** PDF minimal valide (signature %PDF-). */
const pdfTest = () => Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

/** Abonnement échu → espace en lecture seule (§ 25). */
async function expirerAbonnement(companyId) {
  await sequelize.query("UPDATE subscriptions SET current_period_start = '2019-12-01', current_period_end = '2020-01-01' WHERE company_id = :c", { replacements: { c: companyId } });
  await require('../../modules/abonnement/service/droits.service.js').invalider(companyId);
}

/** Change le forfait courant de l'entreprise (limites, fonctionnalités). */
async function changerForfait(companyId, code) {
  await sequelize.query(
    'UPDATE subscriptions SET plan_id = (SELECT id FROM subscription_plans WHERE code = :code) WHERE company_id = :c',
    { replacements: { c: companyId, code } }
  );
  await require('../../modules/abonnement/service/droits.service.js').invalider(companyId);
}

/** Nombre de lignes d'une table répondant à une condition SQL paramétrée. */
async function compter(table, condition = 'TRUE', replacements = {}) {
  const [[{ n }]] = await sequelize.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${condition}`, { replacements });
  return n;
}

/**
 * Collaborateur invité avec un rôle, activé par code : renvoie sa session.
 */
async function collaborateur(admin, role) {
  const email = emailUnique(role);
  const inv = await api().post('/api/v1/utilisateurs/invitations').set(admin.h)
    .send({ email, first_name: 'Moussa', last_name: 'Sow', role_code: role });
  if (inv.status !== 201) throw new Error(`Invitation : ${inv.status} ${JSON.stringify(inv.body)}`);
  const res = await api().post('/api/v1/auth/invitation/activation').send({
    code: inv.body.data.code, email, password: MOT_DE_PASSE, password_confirmation: MOT_DE_PASSE,
  });
  if (res.status !== 201) throw new Error(`Activation : ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.data.access_token, h: bearer(res.body.data.access_token), user: res.body.data.user, email, invitation: inv.body.data.invitation };
}

async function fermer() {
  await sequelize.close();
}

module.exports = {
  api, apiBrute, bearer, MOT_DE_PASSE, telephoneUnique, emailUnique, nineaUnique,
  nouvelleEntreprise, superAdmin, codeTotp, partenaires, creerProduit, relationCommerciale,
  creerBrouillon, commandeEnvoyee, commandeReceptionnee, factureEmise, pngTest, pdfTest,
  expirerAbonnement, changerForfait, compter, collaborateur, fermer, sequelize,
};
