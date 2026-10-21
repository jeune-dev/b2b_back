# Pro2Link — API backend

Backend de la plateforme B2B **Pro2Link** (cahier des charges *Plateforme B2B
Web & Mobile*) : acheteurs et fournisseurs professionnels, catalogue, bons de
commande négociés, réception, facturation, paiements, dettes et créances,
notifications, tableaux de bord, abonnement SaaS et back-office Super Admin.
Une seule API sert l'application web et l'application mobile.

**Node.js 22 · Express 5 · PostgreSQL 16+ · Sequelize 6 · Joi · JWT · Redis · Cloudflare R2 · FCM · Resend · PayDunya**

Architecture identique à **Gestion Immo** (modules `route → controller → service`,
sécurité, supervision, déploiement).

| Document | Contenu |
|---|---|
| [docs/ANALYSE_CAHIER_DES_CHARGES.md](docs/ANALYSE_CAHIER_DES_CHARGES.md) | Traçabilité cahier des charges → modules, tables, routes, rôles |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | Règles d'écriture du code (accès multi-entreprise, transactions, audit, tests) |
| [docs/API.md](docs/API.md) | Référence des 172 routes, générée depuis le code |
| [docs/CONTRAT-API-ENTREPRISE.md](docs/CONTRAT-API-ENTREPRISE.md) | Contrat détaillé pour les applications web et mobile (exemples réels) |
| [docs/CONTRAT-API-ADMIN.md](docs/CONTRAT-API-ADMIN.md) | Contrat détaillé du back-office Super Admin |
| [docs/TESTS.md](docs/TESTS.md) | Stratégie de tests |
| [docs/EXPLOITATION.md](docs/EXPLOITATION.md) | Serveur, nginx, Redis, sauvegardes chiffrées, restauration |

---

## 1. Démarrage rapide (développement)

Prérequis : Node.js ≥ 20 (22 recommandé), PostgreSQL ≥ 14 (extension `pg_trgm`
disponible), Redis facultatif en développement.

```bash
npm ci
cp .env.example .env        # puis compléter (voir § 3) — npm run secrets:generer
npm run migrate             # schéma
npm run seed                # forfaits et paramètres de la plateforme
npm run init                # rôles + super admin (ADMIN_EMAIL / ADMIN_PASSWORD)
npm run dev                 # http://localhost:3000/health
```

Avec Docker (PostgreSQL + Redis + API) : `docker compose up --build`.

## 2. Structure

```
src/
  app.js, server.js, routes.js   application, démarrage/arrêt propre, registre des routes
  config/        sécurité, base, énumérations, permissions, transitions, paramètres
  middlewares/   auth, accès (rôles, permissions, profil acheteur/fournisseur),
                 abonnement, validation, pagination, idempotence, upload,
                 limites de débit, erreurs
  modules/<m>/   route · controller · service · validation (un dossier par domaine)
  models/        modèles Sequelize (reflet exact des migrations) + associations
  migrations/    schéma SQL : contraintes, CHECK, index partiels, audit immuable
  seeders/       forfaits, paramètres de la plateforme
  infrastructure/ stockage R2/disque, images, PDF, e-mail, push, temps réel (SSE), PayDunya
  jobs/          tâches planifiées (échéances de factures, abonnements, nettoyage)
  utils/         journalisation, cache, dates, montants, accès, chiffrement…
  __tests__/     unit/, integration/ (PostgreSQL réel), e2e/
deploy/          nginx, sauvegarde/restauration, déploiement, préparation du VPS
scripts/         référence des routes, contrats d'API, couverture des routes, secrets
```

Modules : `auth`, `compte`, `entreprise`, `utilisateur`, `partenaire`,
`catalogue`, `commande` (`/achats` et `/ventes`), `modele`, `facture`,
`paiement`, `situation`, `dashboard`, `statistiques`, `document`,
`notification`, `evenements`, `abonnement`, `parametres`, `referentiel`,
`audit`, `admin`, `webhook`.

### Cycle d'un bon de commande (§ 9 à § 14)

```
brouillon → envoyee → en_attente_validation ⇄ proposition_modifiee → validee
  → en_preparation → prete → livree → reception_confirmee → facturee → terminee
                                         (refusee / annulee selon l'étape)
```

Chaque proposition du fournisseur est une **version** (lignes, écarts,
commentaires) ; chaque action est inscrite dans l'**historique** visible des
deux parties ; les deux applications sont tenues à jour en temps réel (SSE +
push).

## 3. Configuration

Toutes les variables sont décrites dans **`.env.example`**. Obligatoires :

| Variable | Rôle |
|---|---|
| `DB_*` | Connexion PostgreSQL (rôle applicatif) ; `DB_ADMIN_*` pour les migrations ; `DB_SSL_CA` si base distante TLS |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Secrets distincts, ≥ 32 caractères en production |
| `APP_ENC_KEY` | Clé AES-256 (base64, 32 octets) : secrets de double authentification |
| `INVITATION_SECRET` | HMAC des codes d'invitation (collaborateurs, partenaires) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Super admin initial (politique : 12+ car., 4 classes) |
| `CORS_ORIGIN` | Origines des applications web (`*` refusé en production) |
| `API_PUBLIC_URL`, `APP_PUBLIC_URL` | URL du webhook PayDunya, liens des e-mails |

Recommandées en production : `REDIS_URL` (limites de débit partagées, cache,
**diffusion temps réel entre processus**), `R2_*` (stockage objet),
`RESEND_API_KEY` (e-mails), `FIREBASE_SERVICE_ACCOUNT_JSON` (push),
`PAYDUNYA_*` (paiement des abonnements), `METRICS_TOKEN`. Sans elles
l'application fonctionne en mode dégradé explicite (disque local, pas
d'e-mail ni de push) et le journalise au démarrage.

L'application **refuse de démarrer** en production si un secret manque, si les
secrets JWT sont identiques ou trop courts, ou si `CORS_ORIGIN=*`.

## 4. Base de données

```bash
npm run migrate          # applique les migrations (idempotent)
npm run migrate:status
npm run migrate:undo     # annule la dernière
npm run seed             # seeders de référence (idempotents, jamais d'écrasement)
npm run init             # synchronise les rôles/permissions du code + super admin
```

Le schéma n'est **jamais** modifié par `sequelize.sync()` : les migrations sont
la seule source de vérité. Invariants garantis par la base : montants positifs,
une facture active par commande, imputations plafonnées au paiement et à la
facture, un modèle actif par type, un compte dans une seule entreprise,
journal d'audit en ajout seul (voir `src/migrations`).

## 5. Tests

Les tests d'intégration utilisent une **vraie base PostgreSQL** définie dans
`.env.test` (`DB_NAME` contenant « test ») ; elle est recréée à chaque
exécution (une base clonée par worker).

```bash
npm test                      # tout (unit + integration + e2e)
npm run test:coverage         # avec couverture (seuils bloquants)
npm run test:routes           # routes appelées par les tests (172 / 172)
npm run test:ordre-aleatoire  # preuve d'indépendance des tests
```

36 fichiers / 906 tests : authentification, double authentification et
sessions, inscription et collaborateurs, isolation entre entreprises,
permissions de chaque rôle interne, partenariats et catalogue, cycle complet
des commandes (propositions, versions, révisions concurrentes), facturation
(générée et importée), paiements (déclaration, confirmation, imputation,
idempotence), dettes / créances, modèles de documents, statistiques et
exports, tableaux de bord, notifications et temps réel, abonnement et
limites de forfait, administration, tâches planifiées, courses critiques,
parcours § 28 de bout en bout. Détail : [docs/TESTS.md](docs/TESTS.md).

### Contrats d'API

Générés depuis le code (routes, schémas Joi, accès) avec de vraies requêtes et
réponses capturées pendant les tests : `npm run doc:contrats:capture` (suite
complète + génération) ou `npm run doc:contrats` (génération seule).

## 6. Production

### Docker (recommandé)

```bash
cp .env.example .env && nano .env      # NODE_ENV=production, secrets, domaines
docker compose -f docker-compose.prod.yml up -d --build
```

Au démarrage du conteneur (`docker-entrypoint.sh`) : attente de PostgreSQL →
migrations → seeders → rôles/super admin → API. Une migration en échec empêche
le démarrage (le healthcheck reste rouge, l'ancienne version continue de servir).

- PostgreSQL et Redis ne sont publiés sur aucun port ; l'API seulement sur `127.0.0.1:3000`.
- Conteneur API en lecture seule, sans capacités, utilisateur non root.
- Journaux JSON avec rotation ; `restart: unless-stopped`.

### VPS (Ubuntu)

Procédure complète : **[docs/EXPLOITATION.md](docs/EXPLOITATION.md)**.

1. `sudo bash deploy/setup-server.sh` (Docker, UFW, fail2ban, nginx, certbot, age, rclone).
2. `.env` depuis `.env.example` (`chmod 600`), dont `REDIS_PASSWORD` (obligatoire),
   `BACKUP_AGE_RECIPIENT` et `BACKUP_RCLONE_REMOTE`.
3. nginx : `deploy/nginx.conf` (adapter le domaine) et `deploy/nginx-proxy.conf`
   (dans `/etc/nginx/snippets/pro2link-proxy.conf`), puis
   `certbot certonly --nginx -d api.exemple.sn`. Le flux temps réel
   `/api/v1/evenements/flux` y est configuré sans mise en tampon.
4. `deploy/deploy.sh` (pull, sauvegarde, build, redémarrage, vérification `/health`).
5. Sauvegardes : cron quotidien sur `deploy/backup-postgres.sh` — base + fichiers,
   **chiffrées** (age), empreinte SHA-256, **copie hors site** vérifiée (rclone) ;
   test mensuel `deploy/test-restauration.sh`.

Alternative sans Docker : PM2 (`ecosystem.config.js`, un worker par cœur, tâches
planifiées sur le worker 0 seulement — Redis requis pour le temps réel entre
workers) après `npm ci --omit=dev && npm run migrate && npm run seed && npm run init`.

### Supervision

- `GET /health/live` (processus, public), `GET /health` et `/health/ready` (base, stockage, Redis — réservés à l'hôte par nginx).
- `GET /metrics` (JSON ou `?format=prometheus`) avec `Authorization: Bearer $METRICS_TOKEN`.
- Chaque réponse et chaque ligne de journal portent `X-Request-Id`.

### À faire avant la mise en service (hors code)

- **Forfaits** : les tarifs de départ (Essentiel 10 000, Business 25 000,
  Entreprise 60 000 FCFA / mois) sont modifiables par le Super Admin — le
  cahier des charges (§ 25) les laisse à définir.
- **PayDunya** : compte Business de la plateforme et clés `PAYDUNYA_*` (mode
  `test` d'abord) pour le paiement des abonnements ; renseigner l'URL de
  notification `API_PUBLIC_URL/api/v1/webhooks/abonnement/paydunya`.
- **Firebase** (push mobile) et **Resend** (domaine d'envoi vérifié).

## 7. Tâches planifiées

| Tâche | Quand | Rôle |
|---|---|---|
| echeances_factures | 08:00 | rappels avant échéance (J-n paramétrable), factures en retard (§ 17) |
| abonnements | 01:00 | essais / abonnements échus → lecture seule (§ 25) |
| nettoyage | 03:30 | jetons, clés d'idempotence, codes, invitations et notifications échus |

Chaque tâche est protégée par un verrou consultatif PostgreSQL (jamais deux exécutions simultanées).
