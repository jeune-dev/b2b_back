'use strict';

/**
 * Couverture des ROUTES : chaque route Express réellement appelée par un test
 * est enregistrée (méthode + motif complet, ex. `GET /api/v1/baux/:id`), puis
 * `scripts/couverture-routes.js` la compare à la liste réelle des routes de
 * l'application. On obtient ainsi la liste EXACTE des API testées et non
 * testées, au lieu d'une estimation.
 *
 * Exécuté après l'installation du framework (setupFilesAfterEnv).
 */
const fs = require('fs');
const path = require('path');
const { Route } = require('router');

const impacts = new Set();

/**
 * CONTRAT_CAPTURE=1 : enregistre aussi, par route, une VRAIE requête et sa
 * réponse 2xx (la plus complète) et les codes d'erreur observés — matière
 * des contrats d'API (scripts/generer-contrats.js → docs/CONTRAT-API-*.md).
 */
const CAPTURE = process.env.CONTRAT_CAPTURE === '1';
const captures = new Map(); // route → { succes, erreurs: { "422 CODE": n } }
const SENSIBLES = /^(password|password_confirmation|current_password|new_password|access_token|refresh_token|mfa_token|token|secret|totp_secret|otpauth_url|code_secours|recovery_codes|codes_secours|master_key|private_key|credentials)$/;
function nettoyer(v, cle = '') {
  if (SENSIBLES.test(cle) && v !== null && v !== undefined) return Array.isArray(v) ? ['<masqué>'] : '<masqué>';
  if (typeof v === 'string') {
    if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v)) return '<jwt>';
    return v.length > 300 ? `${v.slice(0, 300)}…` : v;
  }
  if (Array.isArray(v)) return v.slice(0, 2).map((x) => nettoyer(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nettoyer(x, k)]));
  return v;
}
function enregistrer(route, req, res, corps, typeContenu) {
  const c = captures.get(route) || { succes: null, erreurs: {} };
  captures.set(route, c);
  if (res.statusCode >= 400) {
    const cle = `${res.statusCode} ${corps?.error?.code || ''}`.trim();
    c.erreurs[cle] = (c.erreurs[cle] || 0) + 1;
    return;
  }
  const exemple = {
    statut: res.statusCode,
    typeContenu,
    requete: {
      requete: (req.originalUrl.split('?')[1] || '') || undefined,
      corps: req.is('multipart/form-data') ? '(multipart)' : nettoyer(req.corpsBrut),
      idempotence: Boolean(req.headers['idempotency-key']),
    },
    // Ce qui part réellement sur le réseau (toJSON des modèles, dates en ISO).
    reponse: corps === undefined ? undefined : nettoyer(JSON.parse(JSON.stringify(corps))),
  };
  const taille = JSON.stringify(exemple.reponse ?? '').length + (exemple.requete.corps ? 50 : 0);
  if (!c.succes || taille > c.succes.taille) c.succes = { ...exemple, taille };
}

if (!Route.prototype.__impactsInstalles) {
  const dispatchOrigine = Route.prototype.dispatch;
  Route.prototype.dispatch = function dispatch(req, res, done) {
    const route = `${req.method} ${req.baseUrl}${this.path}`;
    impacts.add(route);
    if (CAPTURE && !res.__capture) {
      res.__capture = true;
      req.corpsBrut = req.body && typeof req.body === 'object' ? JSON.parse(JSON.stringify(req.body)) : undefined;
      // JSON (res.json), PDF/CSV/fichiers (res.end, flux) : tout finit par res.end.
      const json = res.json.bind(res);
      res.json = (corps) => { res.__corps = corps; return json(corps); };
      const end = res.end.bind(res);
      res.end = (...args) => {
        if (!res.__enregistre) {
          res.__enregistre = true;
          const type = String(res.get('Content-Type') || '').split(';')[0];
          try { enregistrer(route, req, res, res.__corps, type); } catch { /* capture seulement */ }
        }
        return end(...args);
      };
    }
    return dispatchOrigine.call(this, req, res, done);
  };
  Route.prototype.__impactsInstalles = true;
}

afterAll(() => {
  if (CAPTURE && captures.size) {
    const dossierC = path.resolve(__dirname, '..', '..', '..', 'tmp', 'contrat-captures');
    fs.mkdirSync(dossierC, { recursive: true });
    fs.writeFileSync(path.join(dossierC, `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`), JSON.stringify(Object.fromEntries(captures)));
  }
  if (!impacts.size) return;
  const dossier = path.resolve(__dirname, '..', '..', '..', 'tmp', 'route-hits');
  fs.mkdirSync(dossier, { recursive: true });
  const fichier = path.join(dossier, `${process.env.JEST_WORKER_ID || 0}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(fichier, JSON.stringify([...impacts]));
});
