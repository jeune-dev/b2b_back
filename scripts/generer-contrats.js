'use strict';

/**
 * CONTRATS D'API — docs/CONTRAT-API-MOBILE.md et docs/CONTRAT-API-ADMIN.md.
 *
 *   npm run doc:contrats:capture   # suite de tests en capture (~40 min) puis génération
 *   npm run doc:contrats           # génération seule, à partir des captures existantes
 *
 * Tout vient du CODE, rien n'est recopié à la main :
 *   - routes : routeur Express réel (scripts/lister-routes.js) ;
 *   - corps, paramètres de requête : schémas Joi des middlewares `validate`
 *     (champ, type, obligatoire, contraintes, valeurs permises, défaut) ;
 *   - accès : espace (compte, entreprise, super admin), permission RBAC,
 *     fichier attendu, pagination, Idempotency-Key — lus sur les middlewares
 *     (`utils/contrat.js`) ;
 *   - description : commentaire placé au-dessus de la route dans son fichier ;
 *   - exemples : VRAIES requêtes et réponses capturées pendant les tests
 *     (src/__tests__/setup/routeHits.js), jetons et secrets masqués ;
 *   - erreurs : codes réellement observés pour chaque route ;
 *   - annexes : modèles Sequelize (entités) et config/enums.js (énumérations).
 */
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.test'), quiet: true });

const { MONTAGE, app } = require('./lister-routes.js');
const auth = require('../src/middlewares/auth.middleware.js');
const enums = require('../src/config/enums.js');
const models = require('../src/models/index.js');
const { COLONNES_SECRETES } = require('../src/models/user.model.js');

const RACINE = path.resolve(__dirname, '..');

// --capture : rejoue toute la suite de tests en enregistrant requêtes et réponses.
if (process.argv.includes('--capture')) {
  fs.rmSync(path.join(RACINE, 'tmp', 'contrat-captures'), { recursive: true, force: true });
  const { status } = require('child_process').spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--silent'], {
    cwd: RACINE, stdio: 'inherit', env: { ...process.env, CONTRAT_CAPTURE: '1' },
  });
  if (status) process.stdout.write('Attention : des tests ont échoué ; les contrats sont générés avec les captures obtenues.\n');
}
const DATE = new Date().toISOString().slice(0, 10);

// ── 1. Routes et chaîne de middlewares ────────────────────────────────────────

/** Routeur Express → fichier source (pour lire le commentaire des routes). */
const fichierDuRouteur = new Map();
for (const [fichier, mod] of Object.entries(require.cache)) {
  if (/[\\/]src[\\/]modules[\\/].+[\\/]route[\\/].+\.js$/.test(fichier) && mod.exports?.stack) fichierDuRouteur.set(mod.exports, fichier);
}

const sapplique = (montage, chemin) => !montage || montage === '/' || chemin === montage || chemin.startsWith(`${montage}/`);

function parcourir(pile, base, chaine, routes, fichier) {
  const locaux = [];
  for (const couche of pile) {
    const montage = couche[MONTAGE] || '';
    if (couche.route) {
      const avant = locaux.filter((l) => sapplique(l.montage, couche.route.path)).map((l) => l.handle);
      for (const m of Object.keys(couche.route.methods)) {
        if (m === '_all') continue;
        routes.push({
          methode: m.toUpperCase(),
          chemin: `${base}${couche.route.path}`.replace(/\/$/, '') || '/',
          sousChemin: couche.route.path,
          fichier,
          mws: [...chaine, ...avant, ...couche.route.stack.map((l) => l.handle)],
        });
      }
    } else if (couche.handle?.stack) {
      const avant = locaux.filter((l) => sapplique(l.montage, montage)).map((l) => l.handle);
      parcourir(couche.handle.stack, `${base}${montage}`, [...chaine, ...avant], routes, fichierDuRouteur.get(couche.handle) || fichier);
    } else {
      locaux.push({ montage, handle: couche.handle });
    }
  }
  return routes;
}

const ROUTES = parcourir(app.router.stack, '', [], [], null);

// ── 2. Commentaires des routes ────────────────────────────────────────────────

const sources = new Map();
function commentaire(r) {
  if (!r.fichier) return '';
  if (!sources.has(r.fichier)) sources.set(r.fichier, fs.readFileSync(r.fichier, 'utf8').split('\n'));
  const lignes = sources.get(r.fichier);
  const motif = new RegExp(`router\\.${r.methode.toLowerCase()}\\(\\s*['"\`]${r.sousChemin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
  const i = lignes.findIndex((l) => motif.test(l));
  if (i < 0) return '';
  const bloc = [];
  for (let j = i - 1; j >= 0; j -= 1) {
    const l = lignes[j].trim();
    if (l.startsWith('//')) bloc.unshift(l.replace(/^\/\/\s?/, ''));
    else if (l.startsWith('*') || l.startsWith('/**') || l.endsWith('*/')) {
      const t = l.replace(/^\/\*\*\s?|\*\/$|^\*\s?/g, '').trim();
      if (t) bloc.unshift(t);
    } else break;
  }
  // Une ligne de ── titre de section ── n'est pas la description de la route.
  return bloc.filter((t) => !/^──/.test(t)).join(' ').replace(/\s+/g, ' ').trim();
}

// ── 3. Schémas Joi → tableaux de champs ───────────────────────────────────────

const echapper = (t) => String(t).replace(/\|/g, '\\|');

function typeJoi(d) {
  if (!d) return 'any';
  const regles = (d.rules || []).map((r) => r.name);
  if (d.type === 'string') {
    if (regles.includes('guid')) return 'string (uuid)';
    if (regles.includes('email')) return 'string (email)';
    if (regles.includes('isoDate')) return 'string (date ISO)';
    return 'string';
  }
  if (d.type === 'number') return regles.includes('integer') ? 'integer' : 'number';
  if (d.type === 'array') {
    const it = d.items?.[0];
    return `tableau de ${it ? typeJoi(it) : 'valeurs'}`;
  }
  if (d.type === 'alternatives') return (d.matches || []).map((m) => typeJoi(m.schema || m.then)).filter(Boolean).join(' ou ') || 'plusieurs formes';
  return d.type;
}

function contraintes(d) {
  const c = [];
  const valeurs = (d.allow || []).filter((v) => v !== null && v !== '');
  if (d.flags?.only && valeurs.length) c.push(`valeurs : ${valeurs.map((v) => `\`${v}\``).join(', ')}`);
  else if ((d.allow || []).includes(null)) c.push('`null` accepté');
  for (const r of d.rules || []) {
    const a = r.args || {};
    if (r.name === 'min') c.push(d.type === 'string' ? `min ${a.limit} car.` : d.type === 'array' ? `min ${a.limit} élément(s)` : `≥ ${a.limit}`);
    if (r.name === 'max') c.push(d.type === 'string' ? `max ${a.limit} car.` : d.type === 'array' ? `max ${a.limit} élément(s)` : `≤ ${a.limit}`);
    if (r.name === 'length') c.push(`exactement ${a.limit} ${d.type === 'array' ? 'élément(s)' : 'car.'}`);
    if (r.name === 'greater') c.push(`> ${a.limit}`);
    if (r.name === 'less') c.push(`< ${a.limit}`);
    if (r.name === 'pattern' && a.regex) c.push(String(a.regex).includes('\\d{4}-(0[1-9]') ? 'date `AAAA-MM-JJ`' : `format \`${a.regex}\``);
    if (r.name === 'precision') c.push(`${a.limit} décimale(s) max`);
    if (r.name === 'unique') c.push('sans doublon');
  }
  if (d.flags?.default !== undefined && typeof d.flags.default !== 'object') c.push(`défaut : \`${d.flags.default}\``);
  if ((d.whens || []).length) c.push('obligatoire ou interdit selon d’autres champs');
  if (d.flags?.description) c.push(d.flags.description);
  return c.join(' · ');
}

function lignesChamps(d, prefixe = '', lignes = []) {
  for (const [cle, s] of Object.entries(d.keys || {})) {
    if (s.flags?.presence === 'forbidden') continue;
    const nom = `${prefixe}${cle}`;
    lignes.push(`| \`${nom}\` | ${echapper(typeJoi(s))} | ${s.flags?.presence === 'required' ? '**oui**' : 'non'} | ${echapper(contraintes(s))} |`);
    if (s.type === 'object' && s.keys) lignesChamps(s, `${nom}.`, lignes);
    if (s.type === 'array' && s.items?.[0]?.type === 'object') lignesChamps(s.items[0], `${nom}[].`, lignes);
  }
  return lignes;
}

function reglesGlobales(d) {
  const libelles = {
    or: 'au moins un parmi', xor: 'exactement un parmi', and: 'tous ou aucun parmi', nand: 'pas tous à la fois parmi', oxor: 'au plus un parmi',
  };
  return (d.dependencies || []).map((dep) => {
    if (libelles[dep.rel]) return `${libelles[dep.rel]} ${dep.peers.map((p) => `\`${p}\``).join(', ')}`;
    if (dep.rel === 'with') return `\`${dep.key}\` exige ${dep.peers.map((p) => `\`${p}\``).join(', ')}`;
    if (dep.rel === 'without') return `\`${dep.key}\` exclut ${dep.peers.map((p) => `\`${p}\``).join(', ')}`;
    return null;
  }).filter(Boolean);
}

function tableauSchema(titre, schema) {
  const d = schema.describe();
  if (d.type !== 'object') return [`**${titre}** : ${typeJoi(d)}`];
  const lignes = lignesChamps(d);
  const regles = reglesGlobales(d);
  if (!lignes.length) return [`**${titre}** : aucun champ (objet vide \`{}\`).`];
  return [
    `**${titre}**`, '',
    '| Champ | Type | Obligatoire | Contraintes |', '|---|---|---|---|',
    ...lignes,
    ...(regles.length ? ['', `Règles globales : ${regles.join(' ; ')}.`] : []),
    (d.flags?.unknown ? '' : ''),
  ];
}

// ── 4. Captures des tests ─────────────────────────────────────────────────────

const captures = {};
const dossierCaptures = path.join(RACINE, 'tmp', 'contrat-captures');
if (fs.existsSync(dossierCaptures)) {
  for (const f of fs.readdirSync(dossierCaptures)) {
    const contenu = JSON.parse(fs.readFileSync(path.join(dossierCaptures, f), 'utf8'));
    for (const [route, c] of Object.entries(contenu)) {
      const cible = captures[route] || (captures[route] = { succes: null, erreurs: {} });
      if (c.succes && (!cible.succes || c.succes.taille > cible.succes.taille)) cible.succes = c.succes;
      for (const [e, n] of Object.entries(c.erreurs)) cible.erreurs[e] = (cible.erreurs[e] || 0) + n;
    }
  }
}

// ── 5. Description d'une route ────────────────────────────────────────────────

const LIBELLES_HTTP = {
  400: 'requête invalide', 401: 'non authentifié / identifiants invalides', 402: 'abonnement requis', 403: 'accès refusé',
  404: 'introuvable', 409: 'conflit d’état', 413: 'trop volumineux', 422: 'données invalides', 429: 'trop de requêtes', 503: 'service indisponible, réessayer',
};

function acces(r) {
  const descr = r.mws.map((m) => m?.contrat).filter(Boolean);
  const authentifie = r.mws.includes(auth);
  const role = descr.find((d) => d.type === 'role');
  const espace = descr.find((d) => d.type === 'espace');
  const permission = descr.find((d) => d.type === 'permission');
  const profil = descr.find((d) => d.type === 'profil');
  let qui = 'route publique (aucun jeton)';
  if (authentifie) qui = 'tout compte connecté';
  if (espace?.espace === 'entreprise') qui = 'membre d’une entreprise active';
  if (profil) qui += ` — entreprise ${profil.profil === 'fournisseur' ? 'fournisseur ou mixte' : 'acheteuse ou mixte'}`;
  if (role) qui = role.roles.map((x) => (x === 'super_admin' ? 'super admin' : x)).join(', ');
  return {
    qui, permission: permission?.permission,
    validations: descr.filter((d) => d.type === 'validation'),
    fichier: descr.find((d) => d.type === 'fichier'),
    pagination: descr.find((d) => d.type === 'pagination'),
    idempotence: descr.find((d) => d.type === 'idempotence'),
    ecritureAbonnement: r.chemin.startsWith('/api/v1/') && espace?.espace === 'entreprise' && r.methode !== 'GET' && !r.chemin.startsWith('/api/v1/abonnement'),
  };
}

function resumeData(rep) {
  const data = rep?.data;
  if (data === null || data === undefined) return '`data` vaut `null`.';
  if (Array.isArray(data)) return `\`data\` est un tableau${data[0] && typeof data[0] === 'object' ? ` d’objets (${Object.keys(data[0]).map((k) => `\`${k}\``).join(', ')})` : ''}.`;
  if (typeof data !== 'object') return `\`data\` vaut une valeur simple (${typeof data}).`;
  if (Array.isArray(data.items) && data.pagination) {
    const el = data.items[0];
    return `liste paginée : \`data.items\` (tableau${el ? ` ; chaque élément contient ${Object.keys(el).map((k) => `\`${k}\``).join(', ')}` : ', vide dans l’exemple'}) et \`data.pagination\`.`;
  }
  return `\`data\` contient ${Object.keys(data).map((k) => `\`${k}\``).join(', ')}.`;
}

const captureDe = (r) => captures[`${r.methode} ${r.chemin}`] || captures[`${r.methode} ${r.chemin}/`];

function sectionRoute(r) {
  const a = acces(r);
  const cap = captureDe(r);
  const description = commentaire(r);
  const multipart = Boolean(a.fichier);
  const out = [`#### \`${r.methode} ${r.chemin}\``, ''];
  if (description) out.push(description, '');
  out.push(`- **Accès :** ${a.qui}${a.permission ? ` — permission \`${a.permission}\`` : ''}`);
  if (a.ecritureAbonnement) out.push('- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu');
  out.push(`- **Format :** ${multipart ? '`multipart/form-data`' : r.methode === 'GET' || r.methode === 'DELETE' ? 'aucun corps' : '`application/json`'}`);
  if (a.idempotence) out.push(`- **En-tête \`Idempotency-Key\` :** ${a.idempotence.obligatoire ? '**OBLIGATOIRE** (sinon 422 `IDEMPOTENCE_REQUISE`)' : 'recommandé (protège du double envoi)'} — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative`);
  if (a.pagination) out.push(`- **Pagination :** \`page\` (défaut 1), \`limit\` (défaut ${a.pagination.defaut}, max ${a.pagination.max})`);
  if (a.fichier) out.push(`- **Fichier :** champ \`${a.fichier.champ}\`${a.fichier.obligatoire ? ' (**obligatoire**)' : ' (facultatif)'} — ${a.fichier.formats}`);
  out.push('');

  for (const v of a.validations) {
    const titre = { body: multipart ? 'Champs du formulaire (multipart)' : 'Corps de la requête', query: 'Paramètres de requête (query string)', params: 'Paramètres de chemin' }[v.source] || v.source;
    out.push(...tableauSchema(titre, v.schema), '');
  }
  if (!a.validations.some((v) => v.source === 'body') && !['GET', 'DELETE'].includes(r.methode) && !multipart) out.push('**Corps de la requête :** aucun (envoyer `{}` ou rien).', '');

  const ex = cap?.succes;
  if (ex) {
    if (ex.requete?.corps && ex.requete.corps !== '(multipart)' && Object.keys(ex.requete.corps).length) {
      out.push('<details><summary>Exemple réel de requête</summary>', '', '```json', JSON.stringify(ex.requete.corps, null, 2), '```', '', '</details>', '');
    }
    if (ex.requete?.requete) out.push(`Exemple de query string réelle : \`?${ex.requete.requete}\``, '');
    if (ex.reponse !== undefined) {
      out.push(`**Réponse ${ex.statut} :** ${resumeData(ex.reponse)}`, '');
      out.push('<details><summary>Exemple réel de réponse</summary>', '', '```json', JSON.stringify(ex.reponse, null, 2), '```', '', '</details>', '');
    } else {
      out.push(`**Réponse ${ex.statut} :** fichier \`${ex.typeContenu || 'binaire'}\` (pas de JSON) — télécharger avec l’en-tête \`Authorization\`.`, '');
    }
  } else {
    out.push('**Réponse :** enveloppe standard `{ success, message, data }` (pas d’exemple capturé pour cette route).', '');
  }

  const erreurs = Object.keys(cap?.erreurs || {})
    .sort((x, y) => Number(x.split(' ')[0]) - Number(y.split(' ')[0]) || x.localeCompare(y))
    .map((e) => { const [s, code] = e.split(' '); return `${s}${code ? ` \`${code}\`` : ''}${!code && LIBELLES_HTTP[s] ? ` ${LIBELLES_HTTP[s]}` : ''}`; });
  if (erreurs.length) out.push(`**Erreurs observées :** ${erreurs.join(' · ')}.`, '');
  out.push('---', '');
  return out.join('\n');
}

// ── 6. Annexes ────────────────────────────────────────────────────────────────

function typeModele(attr) {
  const t = attr.type;
  const cle = t?.key || t?.constructor?.key || String(t);
  if (cle === 'ENUM') return `enum(${t.values.map((v) => `\`${v}\``).join(', ')})`;
  if (cle === 'STRING') return `string${t._length ? `(${t._length})` : ''}`;
  if (cle === 'UUID') return 'string (uuid)';
  if (cle === 'DATEONLY') return 'string (date AAAA-MM-JJ)';
  if (cle === 'DATE') return 'string (date-heure ISO 8601)';
  if (cle === 'BIGINT') return 'integer (FCFA)';
  if (cle === 'INTEGER') return 'integer';
  if (cle === 'DECIMAL') return 'string (décimal)';
  if (cle === 'BOOLEAN') return 'boolean';
  if (cle === 'JSONB' || cle === 'JSON') return 'objet / tableau JSON';
  if (cle === 'ARRAY') return 'tableau';
  if (cle === 'TEXT') return 'string';
  if (cle === 'VIRTUAL') return 'calculé';
  return String(cle).toLowerCase();
}

const MODELES_INTERNES = new Set(['Counter', 'IdempotencyKey', 'PasswordReset', 'RentReminder', 'RefreshToken', 'DeviceToken']);
const SECRETS = new Set([...(COLONNES_SECRETES || []), 'password_hash', 'credentials', 'credentials_encrypted', 'token_hash', 'code_hash']);

function annexeEntites(exclus) {
  const out = ['## Annexe A — Entités (champs renvoyés)', '',
    'Champs de chaque entité tels que renvoyés par l’API (les secrets — mots de passe, clés, jetons — ne sont jamais renvoyés). Les réponses de détail ajoutent souvent des **relations incluses** (ex. `buyer`, `supplier`, `lines`) : leur forme exacte figure dans les exemples réels de chaque route.', ''];
  for (const nom of Object.keys(models).filter((n) => models[n]?.rawAttributes && !MODELES_INTERNES.has(n) && !exclus.has(n)).sort()) {
    const m = models[nom];
    out.push(`### ${nom}`, '', `Table \`${m.getTableName()}\`.`, '', '| Champ | Type | Nullable | Défaut |', '|---|---|---|---|');
    for (const [champ, attr] of Object.entries(m.rawAttributes)) {
      if (SECRETS.has(champ) || /(_hash|_secret|_encrypted)$/.test(champ)) continue;
      const defaut = attr.defaultValue;
      const d = defaut === undefined || typeof defaut === 'object' || typeof defaut === 'function' ? '' : String(defaut);
      out.push(`| \`${champ}\` | ${echapper(typeModele(attr))} | ${attr.allowNull === false ? 'non' : 'oui'} | ${echapper(d)} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

function annexeEnums(exclus) {
  const out = ['## Annexe B — Énumérations métier', '',
    'Codes acceptés et renvoyés par l’API, avec leur libellé d’affichage. La même liste est servie par `GET /api/v1/referentiels` : la lire au démarrage plutôt que de la coder en dur.', ''];
  for (const [nom, valeur] of Object.entries(enums)) {
    if (!valeur || typeof valeur !== 'object' || exclus.has(nom)) continue;
    out.push(`### \`${nom}\``, '', '| Code | Libellé |', '|---|---|');
    for (const [code, libelle] of Object.entries(valeur)) out.push(`| \`${code}\` | ${echapper(libelle)} |`);
    out.push('');
  }
  return out.join('\n');
}

// ── 7. Assemblage ─────────────────────────────────────────────────────────────

const ancre = (t) => t.toLowerCase().replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');

function document({ titre, intro, conventions, parcours, sections, exclusModeles, exclusEnums }) {
  const lignesSommaire = ['- [0. Conventions communes](#0-conventions-communes)'];
  if (parcours) lignesSommaire.push('- [0 bis. Parcours de l’application](#0-bis-parcours-de-lapplication)');
  sections.forEach((s, i) => lignesSommaire.push(`- [${i + 1}. ${s.titre}](#${ancre(`${i + 1}. ${s.titre}`)}) — ${s.routes.length} route(s)`));
  lignesSommaire.push('- [Annexe A — Entités (champs renvoyés)](#annexe-a--entités-champs-renvoyés)', '- [Annexe B — Énumérations métier](#annexe-b--énumérations-métier)');
  const total = sections.reduce((n, s) => n + s.routes.length, 0);
  const corps = sections.map((s, i) => [
    `## ${i + 1}. ${s.titre}`, '', ...(s.intro ? [s.intro, ''] : []),
    '| Méthode | Chemin | Accès |', '|---|---|---|',
    ...s.routes.map((r) => `| ${r.methode} | \`${r.chemin}\` | ${acces(r).qui} |`), '',
    ...s.routes.map(sectionRoute),
  ].join('\n'));
  return [
    `# ${titre}`, '',
    `> Généré depuis le code (routes réellement montées, schémas de validation Joi, middlewares d’accès, modèles), le ${DATE}, par \`node scripts/generer-contrats.js\`. Les exemples sont de **vraies requêtes et réponses** de l’API, capturées pendant la suite de tests sur une base PostgreSQL de test (tableaux réduits à 2 éléments, textes longs tronqués par « … », jetons remplacés par \`<jwt>\`, secrets par \`<masqué>\`).`, '',
    intro.replace('{TOTAL}', total), '',
    '## Mode d’emploi pour l’IA ou le développeur qui intègre', '',
    '1. Lire d’abord la section **0. Conventions** : enveloppe, authentification, erreurs, pagination, types, fichiers, idempotence. Elle s’applique à **toutes** les routes.',
    parcours ? '2. Puis **0 bis. Parcours**, qui enchaîne les appels dans le bon ordre.' : '2. Chaque section correspond à un menu du back-office.',
    '3. Pour chaque écran, chercher la route dans le sommaire : accès (espace, permission), paramètres, corps (champs, types, obligatoire ou non, contraintes, valeurs permises), contenu de `data` en réponse, exemple réel, erreurs observées.',
    '4. Les tableaux « Corps » sont **exhaustifs** : tout champ absent est **retiré silencieusement** par l’API (protection contre l’affectation de masse). Ne pas en inventer.',
    '5. Les champs sont en **snake_case**, les montants en **FCFA entiers** (`350000`), les dates seules en `AAAA-MM-JJ`.',
    '6. Ne pas coder en dur les énumérations (statuts, catégories, types) : les lire dans `GET /api/v1/referentiels` ; elles sont aussi listées en **annexe B**.',
    '7. Afficher `message` des réponses (succès et erreurs) tel quel : il est rédigé pour l’utilisateur, en français.', '',
    '## Sommaire', '', ...lignesSommaire, '',
    conventions, '',
    ...(parcours ? [parcours, ''] : []),
    ...corps,
    annexeEntites(exclusModeles), '',
    annexeEnums(exclusEnums), '',
  ].join('\n');
}

// ── 8. Conventions (texte commun) ─────────────────────────────────────────────

const CONVENTIONS = (web) => `## 0. Conventions communes

### URL de base

- Toutes les routes sont préfixées par **\`/api/v1\`** : \`https://<domaine-api>/api/v1/...\`.
- Santé : \`GET /health/live\` (processus vivant), \`GET /health/ready\` (API + base de données ; **503** si indisponible).
- Chaque réponse porte l’en-tête **\`X-Request-Id\`** : le joindre à tout signalement de bug.

### Enveloppe des réponses

Succès (200 ou 201) :
\`\`\`json
{ "success": true, "message": "Texte lisible en français", "data": { … } }
\`\`\`

Liste paginée :
\`\`\`json
{ "success": true, "message": "Succès", "data": { "items": [ … ], "pagination": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 } } }
\`\`\`

Erreur (4xx ou 5xx) :
\`\`\`json
{ "success": false, "message": "Données invalides", "error": { "code": "DONNEES_INVALIDES", "message": "Données invalides", "details": ["\\"amount\\" is required"] }, "requestId": "…" }
\`\`\`
Brancher la logique de l’interface sur **\`error.code\`** (stable), jamais sur le texte du message.

| Code | Signification | Conduite côté ${web ? 'interface' : 'application'} |
|---|---|---|
| 400 | Requête mal formée, fichier manquant ou refusé | Afficher \`message\` |
| 401 | Jeton absent, invalide, expiré ou révoqué ; identifiants faux | Rafraîchir **une** fois puis rejouer ; sinon écran de connexion |
| 402 | \`ABONNEMENT_REQUIS\` : abonnement échu ou suspendu — l’espace est en **lecture seule** | Proposer le renouvellement ; les lectures restent permises |
| 403 | Rôle, permission ou espace refusé ; ressource d’un autre compte | « Accès refusé » ; masquer l’action |
| 404 | Ressource introuvable | « Introuvable » ; revenir à la liste |
| 409 | Conflit : état incompatible (transition interdite, doublon, paiement en cours…) | Afficher \`message\`, recharger la ressource |
| 413 | Corps ou fichier trop volumineux | Alléger |
| 422 | Données invalides (\`details\` liste les champs) ; règle métier | Afficher près des champs |
| 429 | Trop de requêtes | Patienter (en-tête \`Retry-After\`) ; ne pas boucler |
| 503 | Service momentanément indisponible (ex. \`PAIEMENT_NON_CONFIGURE\`) | Réessayer après \`Retry-After\` |
| 500 | Erreur interne | Message générique + \`requestId\` |

### Authentification et sessions

1. \`POST /api/v1/auth/connexion\` avec \`{ identifiant, password }\` (\`identifiant\` = téléphone ou e-mail ; \`device_name\` et \`platform\` facultatifs nomment la session). Réponse : \`access_token\`, \`refresh_token\` (mobile), \`user\`.
   - Compte à **double authentification** (obligatoire pour le super admin, facultative sinon) : la réponse vaut \`{ mfa_requis: true, mfa_token, expires_in }\` (5 min) ; enchaîner \`POST /api/v1/auth/mfa\` avec \`{ mfa_token, code }\` (code TOTP à 6 chiffres) ou \`{ mfa_token, code_secours }\`.
2. Chaque appel envoie \`Authorization: Bearer <access_token>\`. Le jeton d’accès vit **15 minutes**.
3. ${web
    ? 'Navigateur (toute requête portant un en-tête `Origin`) : le refresh token n’est **jamais** dans le corps de la réponse ; il est posé en cookie httpOnly `SameSite=Strict` nommé `refresh_token`. Toutes les requêtes d’authentification partent en `credentials: "include"`. À expiration (401) : `POST /api/v1/auth/refresh` **sans corps**, le cookie suffit. (Les exemples de ce contrat, capturés sans navigateur, montrent `refresh_token` dans `data` : ce champ est absent en web.)'
    : 'À expiration (401) : `POST /api/v1/auth/refresh` avec `{ refresh_token }` dans le corps (application mobile : pas d’en-tête `Origin`, le refresh token arrive dans `data.refresh_token` ; le stocker dans le coffre sécurisé de l’appareil).'} Le refresh token **tourne à chaque usage** : toujours conserver le **nouveau**. Réutiliser un ancien refresh token révoque toute la session (détection de vol). Mutualiser le rafraîchissement (une seule requête en vol).
4. Durée maximale d’une session : 90 jours (**12 heures** pour un super admin) — au-delà, nouvelle connexion.
5. \`POST /api/v1/auth/deconnexion\` révoque la session. Changer de mot de passe révoque les autres sessions.
6. Compte à mot de passe provisoire (\`must_change_password\`) : toute route répond **403 \`CHANGEMENT_MOT_DE_PASSE_REQUIS\`** sauf \`GET /compte\`, \`POST /compte/mot-de-passe\` et la déconnexion.
7. Compte bloqué après des échecs : **401 \`IDENTIFIANTS_INVALIDES\`**, même message qu’un mot de passe faux.

### Espaces et permissions

| Espace | Préfixe | Qui | Garde |
|---|---|---|---|
| Public | \`/auth\`, \`/referentiels\`, \`/abonnement/plans\` | tout le monde | limites de débit |
| Compte | \`/compte\`, \`/notifications\`, \`/evenements\` | tout compte connecté | — |
| Entreprise | \`/tableau-de-bord\`, \`/achats\`, \`/ventes\`, \`/factures\`, \`/paiements\`… | membre d’une entreprise active | abonnement actif pour **écrire** (sinon 402) |
| Super admin | \`/admin/*\` | rôle \`super_admin\` + double authentification | web uniquement |

Chaque route indique en plus sa **permission**, issue du **rôle interne** du membre (Administrateur, Responsable achats, Responsable commandes, Comptable, Réceptionnaire, Commercial). Une ressource d’une autre entreprise répond **403** ou **404** (jamais ses données) ; un bon de commande encore en **brouillon** est invisible du fournisseur (**404**).

### Pagination, tri, recherche

- \`page\` (défaut 1) et \`limit\` (défaut 20, **max 100**, ramené à 100 au-delà). Valeur non entière ou < 1 → **422 \`PAGINATION_INVALIDE\`**.
- Tri : \`tri=champ\` (croissant) ou \`tri=-champ\` (décroissant), parmi la **liste blanche** indiquée par route.
- Recherche texte : paramètre \`q\` quand la route le propose.

### Types et formats

| Type | Format JSON |
|---|---|
| Identifiants | UUID v4 (\`string\`) |
| Montants | **entier en FCFA** (\`350000\`) |
| Dates seules | \`"AAAA-MM-JJ"\` ; une date inexistante (\`2026-02-30\`) → 422 |
| Dates-heures | ISO 8601 UTC (\`"2026-10-04T10:07:31.000Z"\`) ; afficher en heure de Dakar (UTC+0) |
| Téléphones | E.164 (\`+221771234567\`) ; un numéro sénégalais à 9 chiffres est normalisé |
| Noms de champs | \`snake_case\` |

### Idempotence (double envoi)

En-tête \`Idempotency-Key\` (8 à 128 caractères, un UUID neuf par action utilisateur) :
- **obligatoire** sur l’enregistrement d’un paiement (\`POST /paiements\`) : sans lui, **422 \`IDEMPOTENCE_REQUISE\`** ;
- recommandé sur les créations marquées dans ce contrat.

Même clé + même requête → la réponse d’origine est **rejouée** (en-tête \`Idempotent-Replayed: true\`). Réessai après une coupure réseau : **réutiliser la même clé**.

### Envoi de fichiers (multipart)

Routes marquées **multipart** : \`Content-Type: multipart/form-data\`, fichier dans le champ indiqué (\`fichier\` en général). Le type est contrôlé sur le **contenu réel** du fichier (signature binaire), pas sur l’extension. Plafonds : images 10 Mo, PDF 15 Mo. Trop d’envois simultanés : **429 \`TELEVERSEMENTS_SIMULTANES\`** ; serveur saturé : **503 \`TELEVERSEMENTS_SATURES\`** (réessayer). Les champs texte d’un multipart sont des chaînes.

### Réponses non JSON

PDF (bons de commande, factures, aperçus de modèles) et exports CSV : à télécharger avec l’en-tête \`Authorization\` (un simple lien ne l’envoie pas), puis ${web ? 'créer un `Blob`' : 'ouvrir avec le visualiseur du téléphone'}. Fichiers stockés : \`GET /api/v1/documents/:id/fichier\` (\`?taille=miniature\` pour une vignette) ou \`GET /api/v1/documents/:id/lien\` (lien signé temporaire).

### Synchronisation web / mobile (§ 23)

1. \`POST /api/v1/evenements/ticket\` → ticket valable 60 s.
2. \`new EventSource('/api/v1/evenements/flux?ticket=…')\` : flux Server-Sent Events.
3. Événements : \`commande\`, \`facture\`, \`paiement\`, \`partenariat\`, \`produit\`, \`notification\`. Chacun ne porte que des données de **navigation** (identifiant, statut, révision) : recharger la ressource par l’API.
4. Application en arrière-plan : notification **push** FCM.
5. Reprise après coupure : les listes acceptent \`modifie_depuis\` (date-heure) pour ne recharger que le changé.
6. Concurrence : un bon de commande porte une \`revision\` ; l’envoyer dans les actions de négociation. Révision dépassée → **409 \`COMMANDE_MODIFIEE\`** : recharger puis réessayer.

### Limitation de débit

Connexion et mot de passe oublié : 10 essais / 15 min ; routes authentifiées : 600 requêtes / 15 min par utilisateur${web ? ' ; administration : 600 / 15 min' : ''} ; téléversements, PDF et exports limités à part. Au-delà : **429**.`;

// ── 9. Découpage des deux contrats ────────────────────────────────────────────

const routes = ROUTES.filter((r) => r.chemin.startsWith('/api/v1/'));
const seg = (r, n) => r.chemin.split('/')[n];
const prendre = (filtre) => routes.filter(filtre);
const sectionsPar = (liste, n, titres, prefixeTitre = '') => {
  const groupes = new Map();
  for (const r of liste) {
    const s = seg(r, n);
    if (!groupes.has(s)) groupes.set(s, []);
    groupes.get(s).push(r);
  }
  return [...groupes].map(([s, rs]) => ({ titre: `${prefixeTitre}${titres[s] || s}`, routes: rs }));
};

const TITRES_ENTREPRISE = {
  'tableau-de-bord': 'Tableau de bord', entreprise: 'Mon entreprise (profil, paramètres, logo)', utilisateurs: 'Utilisateurs internes et rôles',
  annuaire: 'Annuaire des entreprises', partenariats: 'Partenariats acheteur / fournisseur', produits: 'Catalogue — produits',
  'categories-produits': 'Catalogue — catégories', catalogues: 'Catalogues des fournisseurs', achats: 'Achats — bons de commande (acheteur)',
  ventes: 'Ventes — commandes reçues (fournisseur)', factures: 'Factures', paiements: 'Paiements', situation: 'Dettes, créances et relevés',
  statistiques: 'Statistiques et exports', 'modeles-documents': 'Modèles de documents', documents: 'Documents et fichiers',
  abonnement: 'Abonnement', evenements: 'Synchronisation temps réel (web / mobile)',
};
const TITRES_ADMIN = {
  dashboard: 'Tableau de bord', 'tableau-de-bord': 'Tableau de bord', statistiques: 'Statistiques de la plateforme', entreprises: 'Entreprises',
  abonnements: 'Abonnements', 'paiements-abonnements': 'Paiements d’abonnement', utilisateurs: 'Utilisateurs et super admins',
  parametres: 'Paramètres de la plateforme', notifications: 'Notifications et diffusion', 'journal-audit': 'Journal d’audit',
  roles: 'Rôles et permissions', plans: 'Plans d’abonnement',
};

const AUTH_ADMIN = /^\/api\/v1\/auth\/(connexion|mfa|refresh|deconnexion)$/;
const entreprise = {
  titre: 'Contrat d’API — Application Pro2Link (web et mobile, acheteurs et fournisseurs)',
  intro: '**Périmètre :** les {TOTAL} routes utilisées par l’application web et mobile des entreprises : authentification, compte, notifications, référentiels, réseau de partenaires, catalogue, bons de commande (côté acheteur `/achats` et côté fournisseur `/ventes`), facturation, paiements, dettes et créances, tableaux de bord, statistiques, modèles de documents, abonnement et synchronisation temps réel. Le back-office super admin est décrit dans `CONTRAT-API-ADMIN.md` ; les webhooks (PayDunya) sont appelés par le fournisseur de paiement, jamais par l’application.',
  conventions: CONVENTIONS(true),
  parcours: `## 0 bis. Parcours de l’application

### Démarrage
1. \`GET /api/v1/referentiels\` : énumérations et libellés (statuts, unités, secteurs, rôles internes) — à mettre en cache.
2. Mobile : jetons en stockage sécurisé (Keychain / Keystore) ; si un refresh token existe, \`POST /api/v1/auth/refresh\`. Web : cookie httpOnly.
3. \`GET /api/v1/compte\` : profil, entreprise, type (\`acheteur\`, \`fournisseur\` ou \`mixte\`), rôle interne et **permissions** → n’afficher que les actions permises.
4. Notifications push (mobile) : \`POST /api/v1/compte/appareils\` avec le jeton FCM ; à la déconnexion, \`DELETE /api/v1/compte/appareils\`.
5. Temps réel : \`POST /api/v1/evenements/ticket\` puis \`EventSource('/api/v1/evenements/flux?ticket=…')\`.

### Acheteur (§ 28)
1. Inscription \`POST /auth/inscription\` (compte administrateur + entreprise + essai gratuit) → connexion.
2. Inviter ses collaborateurs (\`POST /utilisateurs/invitations\`) avec un rôle interne.
3. Réseau : chercher dans \`GET /annuaire\` et demander un partenariat, ou inviter un fournisseur absent de la plateforme.
4. Consulter \`GET /catalogues/:supplierId/produits\` → créer un bon de commande \`POST /achats\` (brouillon) → \`POST /achats/:id/envoyer\`.
5. Le fournisseur modifie ? Examiner la proposition (versions, écarts ligne à ligne) → \`POST /achats/:id/accepter-proposition\` ou \`/refuser-proposition\`.
6. À la livraison : \`POST /achats/:id/confirmer-reception\` (quantités reçues, réserves éventuelles).
7. Facture reçue → enregistrer un paiement \`POST /paiements\` (**Idempotency-Key**) → \`GET /situation/dettes\`.

### Fournisseur (§ 28)
1. Créer son catalogue (\`POST /produits\`, catégories, photos).
2. Recevoir la commande (\`GET /ventes\`, notification push + temps réel) → \`POST /ventes/:id/accepter\`, \`/refuser\` ou \`/proposer\` (proposition modifiée : quantités, produit retiré ou remplacé, indisponibilité).
3. Préparer (\`POST /ventes/:id/statut\` : en préparation, prête) puis livrer (\`POST /ventes/:id/livrer\`, bon de livraison en pièce jointe).
4. Émettre la facture (\`POST /factures\`, PDF selon son modèle de document) → confirmer le paiement déclaré par l’acheteur.
5. Suivi : \`GET /tableau-de-bord\`, \`GET /situation/creances\`, \`GET /statistiques/ventes\`.`,
  sections: [
    { titre: 'Authentification', routes: prendre((r) => seg(r, 3) === 'auth') },
    { titre: 'Compte connecté (profil, sécurité, sessions, appareils)', routes: prendre((r) => seg(r, 3) === 'compte') },
    { titre: 'Démarrage et contenus publics', routes: prendre((r) => seg(r, 3) === 'referentiels' || r.chemin.startsWith('/api/v1/abonnement/plans')) },
    { titre: 'Notifications', routes: prendre((r) => seg(r, 3) === 'notifications') },
    ...sectionsPar(prendre((r) => TITRES_ENTREPRISE[seg(r, 3)] && !r.chemin.startsWith('/api/v1/abonnement/plans')), 3, TITRES_ENTREPRISE),
  ],
  exclusModeles: new Set(['AuditLog', 'PlatformSetting', 'Role', 'IdempotencyKey', 'Counter']),
  exclusEnums: new Set(),
};

const admin = {
  titre: 'Contrat d’API — Back-office Super Admin Pro2Link',
  intro: '**Périmètre :** les {TOTAL} routes du back-office web : routes d’administration (`/admin/*`, rôle `super_admin`), plus la connexion (avec **double authentification obligatoire**), le compte connecté et les notifications de l’administrateur. L’application des entreprises est décrite dans `CONTRAT-API-ENTREPRISE.md`.',
  conventions: `${CONVENTIONS(true)}

### Spécificités super admin

- **Double authentification obligatoire.** Sans elle configurée, toute route répond **403 \`MFA_REQUISE\`** sauf le profil, le mot de passe et \`POST /compte/mfa/initialiser\` puis \`/activer\` (QR code \`otpauth://\` à scanner ; codes de secours affichés **une seule fois**). La désactiver : **403 \`MFA_OBLIGATOIRE\`**. Code faux, rejoué ou expiré : **401 \`CODE_MFA_INVALIDE\`** (blocage 15 min après 5 échecs).
- Un super admin n’appartient à aucune entreprise : les routes de l’espace entreprise lui répondent **403 \`ESPACE_ENTREPRISE_REQUIS\`**.
- **Mot de passe oublié** : désactivé pour un super admin (réponse neutre, aucun code envoyé). Un autre super admin rétablit l’accès : \`POST /admin/utilisateurs/:id/reinitialiser-acces\` (mot de passe provisoire, double authentification à reconfigurer).
- **Actions sensibles** (créer un super admin, réinitialiser un accès) : \`current_password\` de l’administrateur exigé (**401 \`MOT_DE_PASSE_INCORRECT\`** sinon). Désactiver le dernier super admin actif : **409 \`DERNIER_SUPER_ADMIN\`**.
- Session super admin : **12 h** maximum. Toutes les actions sont tracées dans le journal d’audit (immuable).`,
  parcours: null,
  sections: [
    { titre: 'Authentification', routes: prendre((r) => AUTH_ADMIN.test(r.chemin)) },
    { titre: 'Compte connecté (profil, double authentification, sessions)', routes: prendre((r) => seg(r, 3) === 'compte' && !r.chemin.includes('/appareils')) },
    { titre: 'Notifications de l’administrateur', routes: prendre((r) => seg(r, 3) === 'notifications') },
    ...sectionsPar(prendre((r) => seg(r, 3) === 'admin'), 4, TITRES_ADMIN, 'Admin — '),
  ],
  exclusModeles: new Set(),
  exclusEnums: new Set(),
};

for (const [fichier, contrat] of [['CONTRAT-API-ENTREPRISE.md', entreprise], ['CONTRAT-API-ADMIN.md', admin]]) {
  contrat.sections = contrat.sections.filter((s) => s.routes.length);
  fs.writeFileSync(path.join(RACINE, 'docs', fichier), document(contrat));
  const n = contrat.sections.reduce((t, s) => t + s.routes.length, 0);
  const sansExemple = contrat.sections.flatMap((s) => s.routes).filter((r) => !captureDe(r)?.succes);
  process.stdout.write(`docs/${fichier} : ${n} routes, ${n - sansExemple.length} avec exemple réel${sansExemple.length ? ` (sans : ${sansExemple.map((r) => `${r.methode} ${r.chemin}`).join(', ')})` : ''}\n`);
}

// Routes couvertes par aucun contrat (hors webhooks, appelés par les fournisseurs).
const couvertes = new Set([...entreprise.sections, ...admin.sections].flatMap((s) => s.routes));
const oubliees = routes.filter((r) => !couvertes.has(r) && seg(r, 3) !== 'webhooks');
if (oubliees.length) process.stdout.write(`Routes dans AUCUN contrat : ${oubliees.map((r) => `${r.methode} ${r.chemin}`).join(', ')}\n`);
require('../src/config/db.js').close();
