# Contrat d’API — Back-office Super Admin Pro2Link

> Généré depuis le code (routes réellement montées, schémas de validation Joi, middlewares d’accès, modèles), le 2026-10-21, par `node scripts/generer-contrats.js`. Les exemples sont de **vraies requêtes et réponses** de l’API, capturées pendant la suite de tests sur une base PostgreSQL de test (tableaux réduits à 2 éléments, textes longs tronqués par « … », jetons remplacés par `<jwt>`, secrets par `<masqué>`).

**Périmètre :** les 51 routes du back-office web : routes d’administration (`/admin/*`, rôle `super_admin`), plus la connexion (avec **double authentification obligatoire**), le compte connecté et les notifications de l’administrateur. L’application des entreprises est décrite dans `CONTRAT-API-MOBILE.md`.

## Mode d’emploi pour l’IA ou le développeur qui intègre

1. Lire d’abord la section **0. Conventions** : enveloppe, authentification, erreurs, pagination, types, fichiers, idempotence. Elle s’applique à **toutes** les routes.
2. Chaque section correspond à un menu du back-office.
3. Pour chaque écran, chercher la route dans le sommaire : accès (espace, permission), paramètres, corps (champs, types, obligatoire ou non, contraintes, valeurs permises), contenu de `data` en réponse, exemple réel, erreurs observées.
4. Les tableaux « Corps » sont **exhaustifs** : tout champ absent est **retiré silencieusement** par l’API (protection contre l’affectation de masse). Ne pas en inventer.
5. Les champs sont en **snake_case**, les montants en **FCFA entiers** (`350000`), les dates seules en `AAAA-MM-JJ`.
6. Ne pas coder en dur les énumérations (statuts, catégories, types) : les lire dans `GET /api/v1/referentiels` ; elles sont aussi listées en **annexe B**.
7. Afficher `message` des réponses (succès et erreurs) tel quel : il est rédigé pour l’utilisateur, en français.

## Sommaire

- [0. Conventions communes](#0-conventions-communes)
- [1. Authentification](#1-authentification) — 4 route(s)
- [2. Compte connecté (profil, double authentification, sessions)](#2-compte-connecté-profil-double-authentification-sessions) — 10 route(s)
- [3. Notifications de l’administrateur](#3-notifications-de-ladministrateur) — 4 route(s)
- [4. Admin — Tableau de bord](#4-admin--tableau-de-bord) — 1 route(s)
- [5. Admin — Statistiques de la plateforme](#5-admin--statistiques-de-la-plateforme) — 1 route(s)
- [6. Admin — Entreprises](#6-admin--entreprises) — 5 route(s)
- [7. Admin — Abonnements](#7-admin--abonnements) — 5 route(s)
- [8. Admin — Paiements d’abonnement](#8-admin--paiements-dabonnement) — 1 route(s)
- [9. Admin — Utilisateurs et super admins](#9-admin--utilisateurs-et-super-admins) — 7 route(s)
- [10. Admin — Paramètres de la plateforme](#10-admin--paramètres-de-la-plateforme) — 2 route(s)
- [11. Admin — Notifications et diffusion](#11-admin--notifications-et-diffusion) — 2 route(s)
- [12. Admin — Journal d’audit](#12-admin--journal-daudit) — 1 route(s)
- [13. Admin — Rôles et permissions](#13-admin--rôles-et-permissions) — 1 route(s)
- [14. Admin — Plans d’abonnement](#14-admin--plans-dabonnement) — 7 route(s)
- [Annexe A — Entités (champs renvoyés)](#annexe-a--entités-champs-renvoyés)
- [Annexe B — Énumérations métier](#annexe-b--énumérations-métier)

## 0. Conventions communes

### URL de base

- Toutes les routes sont préfixées par **`/api/v1`** : `https://<domaine-api>/api/v1/...`.
- Santé : `GET /health/live` (processus vivant), `GET /health/ready` (API + base de données ; **503** si indisponible).
- Chaque réponse porte l’en-tête **`X-Request-Id`** : le joindre à tout signalement de bug.

### Enveloppe des réponses

Succès (200 ou 201) :
```json
{ "success": true, "message": "Texte lisible en français", "data": { … } }
```

Liste paginée :
```json
{ "success": true, "message": "Succès", "data": { "items": [ … ], "pagination": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 } } }
```

Erreur (4xx ou 5xx) :
```json
{ "success": false, "message": "Données invalides", "error": { "code": "DONNEES_INVALIDES", "message": "Données invalides", "details": ["\"amount\" is required"] }, "requestId": "…" }
```
Brancher la logique de l’interface sur **`error.code`** (stable), jamais sur le texte du message.

| Code | Signification | Conduite côté interface |
|---|---|---|
| 400 | Requête mal formée, fichier manquant ou refusé | Afficher `message` |
| 401 | Jeton absent, invalide, expiré ou révoqué ; identifiants faux | Rafraîchir **une** fois puis rejouer ; sinon écran de connexion |
| 402 | `ABONNEMENT_REQUIS` : abonnement échu ou suspendu — l’espace est en **lecture seule** | Proposer le renouvellement ; les lectures restent permises |
| 403 | Rôle, permission ou espace refusé ; ressource d’un autre compte | « Accès refusé » ; masquer l’action |
| 404 | Ressource introuvable | « Introuvable » ; revenir à la liste |
| 409 | Conflit : état incompatible (transition interdite, doublon, paiement en cours…) | Afficher `message`, recharger la ressource |
| 413 | Corps ou fichier trop volumineux | Alléger |
| 422 | Données invalides (`details` liste les champs) ; règle métier | Afficher près des champs |
| 429 | Trop de requêtes | Patienter (en-tête `Retry-After`) ; ne pas boucler |
| 503 | Service momentanément indisponible (ex. `PAIEMENT_NON_CONFIGURE`) | Réessayer après `Retry-After` |
| 500 | Erreur interne | Message générique + `requestId` |

### Authentification et sessions

1. `POST /api/v1/auth/connexion` avec `{ identifiant, password }` (`identifiant` = téléphone ou e-mail ; `device_name` et `platform` facultatifs nomment la session). Réponse : `access_token`, `refresh_token` (mobile), `user`.
   - Compte à **double authentification** (obligatoire pour le super admin, facultative sinon) : la réponse vaut `{ mfa_requis: true, mfa_token, expires_in }` (5 min) ; enchaîner `POST /api/v1/auth/mfa` avec `{ mfa_token, code }` (code TOTP à 6 chiffres) ou `{ mfa_token, code_secours }`.
2. Chaque appel envoie `Authorization: Bearer <access_token>`. Le jeton d’accès vit **15 minutes**.
3. Navigateur (toute requête portant un en-tête `Origin`) : le refresh token n’est **jamais** dans le corps de la réponse ; il est posé en cookie httpOnly `SameSite=Strict` nommé `refresh_token`. Toutes les requêtes d’authentification partent en `credentials: "include"`. À expiration (401) : `POST /api/v1/auth/refresh` **sans corps**, le cookie suffit. (Les exemples de ce contrat, capturés sans navigateur, montrent `refresh_token` dans `data` : ce champ est absent en web.) Le refresh token **tourne à chaque usage** : toujours conserver le **nouveau**. Réutiliser un ancien refresh token révoque toute la session (détection de vol). Mutualiser le rafraîchissement (une seule requête en vol).
4. Durée maximale d’une session : 90 jours (**12 heures** pour un super admin) — au-delà, nouvelle connexion.
5. `POST /api/v1/auth/deconnexion` révoque la session. Changer de mot de passe révoque les autres sessions.
6. Compte à mot de passe provisoire (`must_change_password`) : toute route répond **403 `CHANGEMENT_MOT_DE_PASSE_REQUIS`** sauf `GET /compte`, `POST /compte/mot-de-passe` et la déconnexion.
7. Compte bloqué après des échecs : **401 `IDENTIFIANTS_INVALIDES`**, même message qu’un mot de passe faux.

### Espaces et permissions

| Espace | Préfixe | Qui | Garde |
|---|---|---|---|
| Public | `/auth`, `/referentiels`, `/abonnement/plans` | tout le monde | limites de débit |
| Compte | `/compte`, `/notifications`, `/evenements` | tout compte connecté | — |
| Entreprise | `/tableau-de-bord`, `/achats`, `/ventes`, `/factures`, `/paiements`… | membre d’une entreprise active | abonnement actif pour **écrire** (sinon 402) |
| Super admin | `/admin/*` | rôle `super_admin` + double authentification | web uniquement |

Chaque route indique en plus sa **permission**, issue du **rôle interne** du membre (Administrateur, Responsable achats, Responsable commandes, Comptable, Réceptionnaire, Commercial). Une ressource d’une autre entreprise répond **403** ou **404** (jamais ses données) ; un bon de commande encore en **brouillon** est invisible du fournisseur (**404**).

### Pagination, tri, recherche

- `page` (défaut 1) et `limit` (défaut 20, **max 100**, ramené à 100 au-delà). Valeur non entière ou < 1 → **422 `PAGINATION_INVALIDE`**.
- Tri : `tri=champ` (croissant) ou `tri=-champ` (décroissant), parmi la **liste blanche** indiquée par route.
- Recherche texte : paramètre `q` quand la route le propose.

### Types et formats

| Type | Format JSON |
|---|---|
| Identifiants | UUID v4 (`string`) |
| Montants | **entier en FCFA** (`350000`) |
| Dates seules | `"AAAA-MM-JJ"` ; une date inexistante (`2026-02-30`) → 422 |
| Dates-heures | ISO 8601 UTC (`"2026-10-04T10:07:31.000Z"`) ; afficher en heure de Dakar (UTC+0) |
| Téléphones | E.164 (`+221771234567`) ; un numéro sénégalais à 9 chiffres est normalisé |
| Noms de champs | `snake_case` |

### Idempotence (double envoi)

En-tête `Idempotency-Key` (8 à 128 caractères, un UUID neuf par action utilisateur) :
- **obligatoire** sur l’enregistrement d’un paiement (`POST /paiements`) : sans lui, **422 `IDEMPOTENCE_REQUISE`** ;
- recommandé sur les créations marquées dans ce contrat.

Même clé + même requête → la réponse d’origine est **rejouée** (en-tête `Idempotent-Replayed: true`). Réessai après une coupure réseau : **réutiliser la même clé**.

### Envoi de fichiers (multipart)

Routes marquées **multipart** : `Content-Type: multipart/form-data`, fichier dans le champ indiqué (`fichier` en général). Le type est contrôlé sur le **contenu réel** du fichier (signature binaire), pas sur l’extension. Plafonds : images 10 Mo, PDF 15 Mo. Trop d’envois simultanés : **429 `TELEVERSEMENTS_SIMULTANES`** ; serveur saturé : **503 `TELEVERSEMENTS_SATURES`** (réessayer). Les champs texte d’un multipart sont des chaînes.

### Réponses non JSON

PDF (bons de commande, factures, aperçus de modèles) et exports CSV : à télécharger avec l’en-tête `Authorization` (un simple lien ne l’envoie pas), puis créer un `Blob`. Fichiers stockés : `GET /api/v1/documents/:id/fichier` (`?taille=miniature` pour une vignette) ou `GET /api/v1/documents/:id/lien` (lien signé temporaire).

### Synchronisation web / mobile (§ 23)

1. `POST /api/v1/evenements/ticket` → ticket valable 60 s.
2. `new EventSource('/api/v1/evenements/flux?ticket=…')` : flux Server-Sent Events.
3. Événements : `commande`, `facture`, `paiement`, `partenariat`, `produit`, `notification`. Chacun ne porte que des données de **navigation** (identifiant, statut, révision) : recharger la ressource par l’API.
4. Application en arrière-plan : notification **push** FCM.
5. Reprise après coupure : les listes acceptent `modifie_depuis` (date-heure) pour ne recharger que le changé.
6. Concurrence : un bon de commande porte une `revision` ; l’envoyer dans les actions de négociation. Révision dépassée → **409 `COMMANDE_MODIFIEE`** : recharger puis réessayer.

### Limitation de débit

Connexion et mot de passe oublié : 10 essais / 15 min ; routes authentifiées : 600 requêtes / 15 min par utilisateur ; administration : 600 / 15 min ; téléversements, PDF et exports limités à part. Au-delà : **429**.

### Spécificités super admin

- **Double authentification obligatoire.** Sans elle configurée, toute route répond **403 `MFA_REQUISE`** sauf le profil, le mot de passe et `POST /compte/mfa/initialiser` puis `/activer` (QR code `otpauth://` à scanner ; codes de secours affichés **une seule fois**). La désactiver : **403 `MFA_OBLIGATOIRE`**. Code faux, rejoué ou expiré : **401 `CODE_MFA_INVALIDE`** (blocage 15 min après 5 échecs).
- Un super admin n’appartient à aucune entreprise : les routes de l’espace entreprise lui répondent **403 `ESPACE_ENTREPRISE_REQUIS`**.
- **Mot de passe oublié** : désactivé pour un super admin (réponse neutre, aucun code envoyé). Un autre super admin rétablit l’accès : `POST /admin/utilisateurs/:id/reinitialiser-acces` (mot de passe provisoire, double authentification à reconfigurer).
- **Actions sensibles** (créer un super admin, réinitialiser un accès) : `current_password` de l’administrateur exigé (**401 `MOT_DE_PASSE_INCORRECT`** sinon). Désactiver le dernier super admin actif : **409 `DERNIER_SUPER_ADMIN`**.
- Session super admin : **12 h** maximum. Toutes les actions sont tracées dans le journal d’audit (immuable).

## 1. Authentification

| Méthode | Chemin | Accès |
|---|---|---|
| POST | `/api/v1/auth/connexion` | route publique (aucun jeton) |
| POST | `/api/v1/auth/mfa` | route publique (aucun jeton) |
| POST | `/api/v1/auth/refresh` | route publique (aucun jeton) |
| POST | `/api/v1/auth/deconnexion` | route publique (aucun jeton) |

#### `POST /api/v1/auth/connexion`

- **Accès :** route publique (aucun jeton)
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `identifiant` | string | **oui** | max 254 car. |
| `password` | string | **oui** | max 128 car. |
| `device_name` | string | non | `null` accepté · max 120 car. |
| `platform` | string | non | valeurs : `android`, `ios`, `web` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "identifiant": "nouveau.97c8946641@test.sn",
  "password": "<masqué>"
}
```

</details>

**Réponse 200 :** `data` contient `access_token`, `token_type`, `expires_in`, `user`, `refresh_token`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Connexion réussie",
  "data": {
    "access_token": "<masqué>",
    "token_type": "Bearer",
    "expires_in": "15m",
    "user": {
      "id": "5a7fb7f4-0527-4030-8365-964f5e158770",
      "role": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "nouveau.97c8946641@test.sn",
      "phone": "+221778364275",
      "status": "actif",
      "language": "fr",
      "must_change_password": false,
      "mfa_active": false,
      "mfa_a_configurer": false
    },
    "refresh_token": "<masqué>"
  }
}
```

</details>

**Erreurs observées :** 401 `IDENTIFIANTS_INVALIDES` · 403 `COMPTE_INACTIF`.

---

#### `POST /api/v1/auth/mfa`

Seconde étape de la connexion quand la double authentification est active.

- **Accès :** route publique (aucun jeton)
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `mfa_token` | string | **oui** | max 2048 car. |
| `code` | string | non | format `/^\d{6}$/` |
| `code_secours` | string | non | max 20 car. |
| `device_name` | string | non | `null` accepté · max 120 car. |
| `platform` | string | non | valeurs : `android`, `ios`, `web` |

Règles globales : exactement un parmi `code`, `code_secours`.


<details><summary>Exemple réel de requête</summary>

```json
{
  "mfa_token": "<masqué>",
  "code_secours": "<masqué>"
}
```

</details>

**Réponse 200 :** `data` contient `access_token`, `token_type`, `expires_in`, `user`, `refresh_token`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Connexion réussie",
  "data": {
    "access_token": "<masqué>",
    "token_type": "Bearer",
    "expires_in": "15m",
    "user": {
      "id": "1d5efbbb-b888-4cdc-9ef4-7f92fa928e03",
      "role": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.03924c8928@test.sn",
      "phone": "+221776563347",
      "status": "actif",
      "language": "fr",
      "must_change_password": false,
      "mfa_active": true,
      "mfa_a_configurer": false
    },
    "refresh_token": "<masqué>"
  }
}
```

</details>

**Erreurs observées :** 401 `CODE_MFA_INVALIDE` · 401 `JETON_MFA_INVALIDE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/auth/refresh`

- **Accès :** route publique (aucun jeton)
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `refresh_token` | string | non | `null` accepté · max 2048 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "refresh_token": "<masqué>"
}
```

</details>

**Réponse 200 :** `data` contient `access_token`, `token_type`, `expires_in`, `user`, `refresh_token`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Session renouvelée",
  "data": {
    "access_token": "<masqué>",
    "token_type": "Bearer",
    "expires_in": "15m",
    "user": {
      "id": "141fdc54-e423-4dad-aefa-42cc359d7b67",
      "role": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.87d4fc308a@test.sn",
      "phone": "+221776563264",
      "status": "actif",
      "language": "fr",
      "must_change_password": false,
      "mfa_active": false,
      "mfa_a_configurer": false
    },
    "refresh_token": "<masqué>"
  }
}
```

</details>

**Erreurs observées :** 401 `SESSION_INVALIDE`.

---

#### `POST /api/v1/auth/deconnexion`

- **Accès :** route publique (aucun jeton)
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `refresh_token` | string | non | `null` accepté · max 2048 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "refresh_token": "<masqué>"
}
```

</details>

**Réponse 200 :** `data` vaut `null`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Déconnexion réussie",
  "data": null
}
```

</details>

---

## 2. Compte connecté (profil, double authentification, sessions)

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/compte` | tout compte connecté |
| PATCH | `/api/v1/compte` | tout compte connecté |
| POST | `/api/v1/compte/mot-de-passe` | tout compte connecté |
| GET | `/api/v1/compte/sessions` | tout compte connecté |
| DELETE | `/api/v1/compte/sessions/:id` | tout compte connecté |
| POST | `/api/v1/compte/sessions/revoquer-toutes` | tout compte connecté |
| POST | `/api/v1/compte/mfa/initialiser` | tout compte connecté |
| POST | `/api/v1/compte/mfa/activer` | tout compte connecté |
| POST | `/api/v1/compte/mfa/desactiver` | tout compte connecté |
| POST | `/api/v1/compte/mfa/codes-secours` | tout compte connecté |

#### `GET /api/v1/compte`

Monté après `auth` (routes.js) : tout compte authentifié et actif.

- **Accès :** tout compte connecté
- **Format :** aucun corps

**Réponse 200 :** `data` contient `user`, `company`, `member`, `permissions`, `abonnement`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "user": {
      "id": "e4c56de8-c83f-47a2-aab7-2f880ddd12d3",
      "role_code": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.f8fbae19e9@test.sn",
      "phone": "+221776563360",
      "job_title": "Directrice des achats",
      "status": "actif",
      "email_verified_at": null,
      "must_change_password": false,
      "last_login_at": "2026-10-21T12:36:15.621Z",
      "language": "en",
      "totp_enabled_at": null,
      "created_at": "2026-10-21T12:36:15.452Z",
      "updated_at": "2026-10-21T12:36:15.621Z"
    },
    "company": {
      "id": "1a986bdb-918c-4780-9404-527c7ac81a01",
      "name": "Société bb62f3",
      "type": "mixte",
      "sector": "distribution",
      "city": "Dakar",
      "country": "SN",
      "currency": "XOF",
      "status": "actif",
      "logo_document_id": null,
      "vat_registered": true,
      "default_tax_rate": 18
    },
    "member": {
      "role": "administrateur",
      "role_label": "Administrateur"
    },
    "permissions": [
      "abonnement.gerer",
      "achats.approuver"
    ],
    "abonnement": {
      "abonnement": {
        "id": "59d9e47d-305a-4b8b-98c1-edfbb5bc8b73",
        "status": "essai",
        "current_period_end": "2026-11-20",
        "trial_ends_at": "2026-11-20"
      },
      "plan": {
        "code": "BUSINESS",
        "name": "Business",
        "max_users": 10,
        "max_products": 1000,
        "max_partners": 100,
        "max_orders_per_month": 1000,
        "features": [
          "modeles_documents",
          "statistiques"
        ]
      },
      "actif": true
    }
  }
}
```

</details>

---

#### `PATCH /api/v1/compte`

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `first_name` | string | non | min 1 car. · max 80 car. |
| `last_name` | string | non | min 1 car. · max 80 car. |
| `email` | string (email) | non | `null` accepté · max 254 car. |
| `phone` | string | non | `null` accepté · max 25 car. |
| `job_title` | string | non | `null` accepté · max 100 car. |
| `language` | string | non | valeurs : `fr`, `en` |
| `current_password` | string | non | max 128 car. |

Règles globales : au moins un parmi `first_name`, `last_name`, `email`, `phone`, `job_title`, `language`.


<details><summary>Exemple réel de requête</summary>

```json
{
  "job_title": "Directrice des achats",
  "language": "en"
}
```

</details>

**Réponse 200 :** `data` contient `user`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Profil mis à jour",
  "data": {
    "user": {
      "id": "e4c56de8-c83f-47a2-aab7-2f880ddd12d3",
      "role_code": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.f8fbae19e9@test.sn",
      "phone": "+221776563360",
      "job_title": "Directrice des achats",
      "status": "actif",
      "email_verified_at": null,
      "must_change_password": false,
      "last_login_at": "2026-10-21T12:36:15.476Z",
      "language": "en",
      "totp_enabled_at": null,
      "created_at": "2026-10-21T12:36:15.452Z",
      "updated_at": "2026-10-21T12:36:15.516Z"
    }
  }
}
```

</details>

**Erreurs observées :** 401 `MOT_DE_PASSE_INCORRECT` · 409 `EMAIL_UTILISE` · 422 `DONNEES_INVALIDES` · 422 `MOT_DE_PASSE_ACTUEL_REQUIS`.

---

#### `POST /api/v1/compte/mot-de-passe`

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `current_password` | string | **oui** | max 128 car. |
| `password` | string | **oui** | min 8 car. · max 128 car. · format `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/` |
| `password_confirmation` | any | **oui** | valeurs : `[object Object]` |
| `refresh_token` | string | non | `null` accepté · max 2048 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "current_password": "<masqué>",
  "password": "<masqué>",
  "password_confirmation": "<masqué>"
}
```

</details>

**Réponse 200 :** `data` contient `access_token`, `token_type`, `expires_in`, `refresh_token`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Mot de passe modifié. Les autres appareils ont été déconnectés.",
  "data": {
    "access_token": "<masqué>",
    "token_type": "Bearer",
    "expires_in": "15m",
    "refresh_token": "<masqué>"
  }
}
```

</details>

**Erreurs observées :** 401 `MOT_DE_PASSE_INCORRECT` · 422 `DONNEES_INVALIDES` · 422 `MOT_DE_PASSE_IDENTIQUE` · 422 `MOT_DE_PASSE_TROP_FAIBLE`.

---

#### `GET /api/v1/compte/sessions`

- **Accès :** tout compte connecté
- **Format :** aucun corps

**Réponse 200 :** `data` contient `sessions`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "sessions": [
      {
        "id": "163a36d4-5e59-4a8a-8e39-812abb5fd9e7",
        "device_name": "Téléphone",
        "platform": "android",
        "ip": "::ffff:127.0.0.1",
        "user_agent": null,
        "last_used_at": "2026-10-21T12:35:12.219Z",
        "created_at": "2026-10-21T12:35:12.219Z",
        "expires_at": "2026-11-20T12:35:12.000Z",
        "current": true
      },
      {
        "id": "410428b0-1f03-4906-a8dd-5c39b5ee7250",
        "device_name": "Tablette",
        "platform": "ios",
        "ip": "::ffff:127.0.0.1",
        "user_agent": null,
        "last_used_at": "2026-10-21T12:35:12.169Z",
        "created_at": "2026-10-21T12:35:12.169Z",
        "expires_at": "2026-11-20T12:35:12.000Z",
        "current": false
      }
    ]
  }
}
```

</details>

---

#### `DELETE /api/v1/compte/sessions/:id`

- **Accès :** tout compte connecté
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` vaut `null`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Session fermée",
  "data": null
}
```

</details>

**Erreurs observées :** 404 `RESSOURCE_INTROUVABLE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/compte/sessions/revoquer-toutes`

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` vaut `null`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Tous les appareils ont été déconnectés",
  "data": null
}
```

</details>

---

#### `POST /api/v1/compte/mfa/initialiser`

Double authentification TOTP (obligatoire pour le super admin).

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `current_password` | string | **oui** | max 128 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "current_password": "<masqué>"
}
```

</details>

**Réponse 200 :** `data` contient `secret`, `otpauth_url`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Scannez le QR code dans votre application d'authentification, puis confirmez avec un code.",
  "data": {
    "secret": "<masqué>",
    "otpauth_url": "<masqué>"
  }
}
```

</details>

**Erreurs observées :** 401 `MOT_DE_PASSE_INCORRECT` · 409 `MFA_DEJA_ACTIVE`.

---

#### `POST /api/v1/compte/mfa/activer`

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `code` | string | **oui** | format `/^\d{6}$/` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "code": "614034"
}
```

</details>

**Réponse 200 :** `data` contient `access_token`, `token_type`, `expires_in`, `codes_secours`, `refresh_token`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Double authentification activée. Conservez vos codes de secours : ils ne seront plus affichés.",
  "data": {
    "access_token": "<masqué>",
    "token_type": "Bearer",
    "expires_in": "15m",
    "codes_secours": [
      "<masqué>"
    ],
    "refresh_token": "<masqué>"
  }
}
```

</details>

**Erreurs observées :** 409 `MFA_NON_INITIALISEE` · 422 `CODE_MFA_INVALIDE`.

---

#### `POST /api/v1/compte/mfa/desactiver`

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `current_password` | string | **oui** | max 128 car. |
| `code` | string | non | format `/^\d{6}$/` |
| `code_secours` | string | non | max 20 car. |

Règles globales : exactement un parmi `code`, `code_secours`.


<details><summary>Exemple réel de requête</summary>

```json
{
  "current_password": "<masqué>",
  "code_secours": "<masqué>"
}
```

</details>

**Réponse 200 :** `data` vaut `null`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Double authentification désactivée",
  "data": null
}
```

</details>

**Erreurs observées :** 401 `CODE_MFA_INVALIDE` · 403 `MFA_OBLIGATOIRE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/compte/mfa/codes-secours`

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `current_password` | string | **oui** | max 128 car. |
| `code` | string | **oui** | format `/^\d{6}$/` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "current_password": "<masqué>",
  "code": "661819"
}
```

</details>

**Réponse 200 :** `data` contient `codes_secours`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Nouveaux codes de secours générés ; les anciens ne sont plus valables.",
  "data": {
    "codes_secours": [
      "<masqué>"
    ]
  }
}
```

</details>

---

## 3. Notifications de l’administrateur

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/notifications` | tout compte connecté |
| GET | `/api/v1/notifications/compteur` | tout compte connecté |
| POST | `/api/v1/notifications/tout-lire` | tout compte connecté |
| POST | `/api/v1/notifications/:id/lue` | tout compte connecté |

#### `GET /api/v1/notifications`

Notifications internes (§ 17) — monté pour TOUT compte authentifié (routes.js) : utilisateur d’entreprise (web et mobile, § 17) et super admin. Aucune permission : la portée est le compte lui-même (`user_id`), appliquée par le service à chaque requête.

- **Accès :** tout compte connecté
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `non_lues` | boolean | non |  |


Exemple de query string réelle : `?non_lues=true`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `type`, `title`, `body`, `data`, `read_at`, `created_at`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "18a3b390-02bb-4774-acbd-7069d8aa3f5f",
        "type": "nouveau_bon_commande",
        "title": "Nouveau bon de commande",
        "body": "Société e1a1c7 vous a envoyé le bon de commande BC-2026-00001 (187 000 FCFA).",
        "data": {
          "number": "BC-2026-00001",
          "order_id": "8c2b4447-10e0-4fbd-a44b-3d793c02f776"
        },
        "read_at": null,
        "created_at": "2026-10-21T12:36:13.581Z"
      },
      {
        "id": "2f1a3a31-a4da-424b-9aca-7e42c0cb61ff",
        "type": "partenariat",
        "title": "Demande de partenariat",
        "body": "Société e1a1c7 souhaite vous ajouter comme fournisseur.",
        "data": {
          "partnership_id": "60ff4d82-79eb-47ee-95fe-019b2d6c00ca"
        },
        "read_at": null,
        "created_at": "2026-10-21T12:36:13.285Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 2,
      "totalPages": 1
    }
  }
}
```

</details>

---

#### `GET /api/v1/notifications/compteur`

- **Accès :** tout compte connecté
- **Format :** aucun corps

**Réponse 200 :** `data` contient `non_lues`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "non_lues": 2
  }
}
```

</details>

---

#### `POST /api/v1/notifications/tout-lire`

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `marquees`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Notifications marquées comme lues",
  "data": {
    "marquees": 1
  }
}
```

</details>

---

#### `POST /api/v1/notifications/:id/lue`

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `notification`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Notification lue",
  "data": {
    "notification": {
      "id": "18a3b390-02bb-4774-acbd-7069d8aa3f5f",
      "type": "nouveau_bon_commande",
      "title": "Nouveau bon de commande",
      "body": "Société e1a1c7 vous a envoyé le bon de commande BC-2026-00001 (187 000 FCFA).",
      "data": {
        "number": "BC-2026-00001",
        "order_id": "8c2b4447-10e0-4fbd-a44b-3d793c02f776"
      },
      "read_at": "2026-10-21T12:36:13.704Z",
      "created_at": "2026-10-21T12:36:13.581Z"
    }
  }
}
```

</details>

**Erreurs observées :** 404 `RESSOURCE_INTROUVABLE` · 422 `DONNEES_INVALIDES`.

---

## 4. Admin — Tableau de bord

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/admin/dashboard` | super admin |

#### `GET /api/v1/admin/dashboard`

Espace Super Admin (§ 5.4) — web uniquement. Monté dans routes.js derrière auth + limite admin + rôle super_admin ; chaque route exige EN PLUS sa permission `admin.*` (RBAC fin) : un futur rôle d'administration restreint (support, comptabilité) sera un sous-ensemble de ces permissions, sans route à réécrire.

- **Accès :** super admin — permission `admin.dashboard`
- **Format :** aucun corps

**Réponse 200 :** `data` contient `dashboard`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "dashboard": {
      "period": {
        "start": "2026-10-01",
        "end": "2026-10-31"
      },
      "companies": {
        "total": 125,
        "suspended": 0,
        "new_this_month": 125,
        "by_type": {
          "acheteur": 54,
          "fournisseur": 56,
          "mixte": 15
        }
      },
      "users": {
        "total": 135,
        "active_this_month": 135
      },
      "partnerships": 48,
      "products": 106,
      "orders": {
        "sent": 49,
        "validated": 30,
        "volume": 5330980
      },
      "invoices": {
        "count": 15,
        "amount": 2865660
      },
      "payments": 176000,
      "subscriptions": {
        "by_status": {
          "essai": 125
        },
        "by_plan": [
          {
            "code": "BUSINESS",
            "name": "Business",
            "count": 125
          }
        ],
        "mrr": 0
      },
      "generated_at": "2026-10-21T12:35:58.860Z"
    }
  }
}
```

</details>

---

## 5. Admin — Statistiques de la plateforme

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/admin/statistiques` | super admin |

#### `GET /api/v1/admin/statistiques`

- **Accès :** super admin — permission `admin.statistiques`
- **Format :** aucun corps

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |


**Réponse 200 :** `data` contient `statistics`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "statistics": {
      "period": {
        "start": "2025-11-01",
        "end": "2026-10-21"
      },
      "signups": [
        {
          "month": "2026-10",
          "type": "acheteur",
          "count": 51
        },
        {
          "month": "2026-10",
          "type": "fournisseur",
          "count": 51
        }
      ],
      "orders": [
        {
          "month": "2026-10",
          "count": 27,
          "amount": 4628360
        }
      ],
      "invoices": [
        {
          "month": "2026-09",
          "count": 1,
          "amount": 187000,
          "paid": 1000
        },
        {
          "month": "2026-10",
          "count": 21,
          "amount": 3522060,
          "paid": 840160
        }
      ]
    }
  }
}
```

</details>

---

## 6. Admin — Entreprises

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/admin/entreprises` | super admin |
| GET | `/api/v1/admin/entreprises/:id` | super admin |
| POST | `/api/v1/admin/entreprises/:id/suspendre` | super admin |
| POST | `/api/v1/admin/entreprises/:id/reactiver` | super admin |
| POST | `/api/v1/admin/entreprises/:companyId/abonnement/activer` | super admin |

#### `GET /api/v1/admin/entreprises`

- **Accès :** super admin — permission `admin.entreprises`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `q` | string | non | max 100 car. |
| `status` | string | non | valeurs : `actif`, `suspendu` |
| `type` | string | non | valeurs : `acheteur`, `fournisseur`, `mixte` |
| `sector` | string | non | valeurs : `commerce`, `grande_surface`, `restaurant`, `hotel`, `distribution`, `grossiste`, `industrie`, `agroalimentaire`, `services`, `btp`, `sante`, `autre` |
| `plan` | string | non | max 30 car. |
| `abonnement` | string | non | valeurs : `essai`, `actif`, `suspendu`, `expire`, `annule`, `aucun` |
| `tri` | string | non | valeurs : `created_at`, `-created_at`, `name`, `-name` |


Exemple de query string réelle : `?q=H%C3%B4tel%20Teranga%201792586172165&type=acheteur&abonnement=essai`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `name`, `legal_name`, `type`, `sector`, `description`, `address`, `city`, `country`, `phone`, `email`, `website`, `ninea`, `rccm`, `tax_regime`, `vat_registered`, `default_tax_rate`, `currency`, `logo_document_id`, `is_listed`, `status`, `suspended_reason`, `created_by`, `created_at`, `updated_at`, `deleted_at`, `members_count`, `partners_count`, `products_count`, `orders_count`, `subscription_status`, `plan_code`, `current_period_end`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "2b3b7584-89c9-4a57-b816-f7180b6cd06b",
        "name": "Hôtel Teranga 1792586172165",
        "legal_name": null,
        "type": "acheteur",
        "sector": "hotel",
        "description": null,
        "address": null,
        "city": "Dakar",
        "country": "SN",
        "phone": "+221778364302",
        "email": "admin.563206ea70@test.sn",
        "website": null,
        "ninea": "530345595",
        "rccm": null,
        "tax_regime": null,
        "vat_registered": true,
        "default_tax_rate": 18,
        "currency": "XOF",
        "logo_document_id": null,
        "is_listed": true,
        "status": "actif",
        "suspended_reason": null,
        "created_by": "95e4fe2e-cee0-4ebe-9815-e1e16d701e18",
        "created_at": "2026-10-21T12:36:12.212Z",
        "updated_at": "2026-10-21T12:36:12.212Z",
        "deleted_at": null,
        "members_count": 1,
        "partners_count": 0,
        "products_count": 0,
        "orders_count": 0,
        "subscription_status": "essai",
        "plan_code": "BUSINESS",
        "current_period_end": "2026-11-20"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

</details>

---

#### `GET /api/v1/admin/entreprises/:id`

- **Accès :** super admin — permission `admin.entreprises`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `company`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "company": {
      "id": "2b3b7584-89c9-4a57-b816-f7180b6cd06b",
      "name": "Hôtel Teranga 1792586172165",
      "legal_name": null,
      "type": "acheteur",
      "sector": "hotel",
      "description": null,
      "address": null,
      "city": "Dakar",
      "country": "SN",
      "phone": "+221778364302",
      "email": "admin.563206ea70@test.sn",
      "website": null,
      "ninea": "530345595",
      "rccm": null,
      "tax_regime": null,
      "vat_registered": true,
      "default_tax_rate": 18,
      "currency": "XOF",
      "logo_document_id": null,
      "is_listed": true,
      "status": "actif",
      "suspended_reason": null,
      "created_by": "95e4fe2e-cee0-4ebe-9815-e1e16d701e18",
      "created_at": "2026-10-21T12:36:12.212Z",
      "updated_at": "2026-10-21T12:36:12.212Z",
      "deleted_at": null,
      "members_count": 1,
      "partners_count": 0,
      "products_count": 0,
      "orders_count": 0,
      "subscription_status": "essai",
      "plan_code": "BUSINESS",
      "current_period_end": "2026-11-20",
      "settings_customized": false,
      "subscription": {
        "id": "a84542e2-7e36-4e6f-94ad-07c9257e883c",
        "company_id": "2b3b7584-89c9-4a57-b816-f7180b6cd06b",
        "plan_id": "c8d74d4b-e697-4c55-afac-e064699afbdb",
        "status": "essai",
        "started_at": "2026-10-21T12:36:12.233Z",
        "current_period_start": "2026-10-21",
        "current_period_end": "2026-11-20",
        "trial_ends_at": "2026-11-20",
        "cancelled_at": null,
        "suspended_reason": null,
        "created_at": "2026-10-21T12:36:12.235Z",
        "updated_at": "2026-10-21T12:36:12.235Z",
        "plan": {
          "id": "c8d74d4b-e697-4c55-afac-e064699afbdb",
          "code": "BUSINESS",
          "name": "Business",
          "price": 25000,
          "billing_period": "mensuel"
        }
      },
      "members": [
        {
          "id": "8742549f-69ce-46c0-ba47-cc183de6a868",
          "role_code": "administrateur",
          "status": "actif",
          "created_at": "2026-10-21T12:36:12.220Z",
          "user": {
            "id": "95e4fe2e-cee0-4ebe-9815-e1e16d701e18",
            "first_name": "Awa",
            "last_name": "Diop",
            "email": "admin.563206ea70@test.sn",
            "phone": "+221778364302",
            "status": "actif",
            "last_login_at": "2026-10-21T12:36:12.267Z"
          }
        }
      ],
      "activity": {
        "purchase_orders": 0,
        "sales_orders": 0,
        "invoices_issued": 0,
        "last_order_at": null
      }
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/entreprises/:id/suspendre`

- **Accès :** super admin — permission `admin.entreprises`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `reason` | string | **oui** | min 3 car. · max 1000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reason": "Fraude suspectée"
}
```

</details>

**Réponse 200 :** `data` contient `company`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Entreprise suspendue",
  "data": {
    "company": {
      "id": "868ba28b-8db8-4706-a938-274db118589e",
      "name": "Société 6ad5f4",
      "legal_name": null,
      "type": "mixte",
      "sector": "distribution",
      "description": null,
      "address": null,
      "city": "Dakar",
      "country": "SN",
      "phone": "+221778364305",
      "email": "admin.82ceb8597e@test.sn",
      "website": null,
      "ninea": "753415059",
      "rccm": null,
      "tax_regime": null,
      "vat_registered": true,
      "default_tax_rate": 18,
      "bank_details": null,
      "currency": "XOF",
      "logo_document_id": null,
      "is_listed": true,
      "settings": {},
      "status": "suspendu",
      "suspended_reason": "Fraude suspectée",
      "created_by": "e016ecf5-692c-4f9c-a346-a9e391d5d110",
      "created_at": "2026-10-21T12:36:13.782Z",
      "updated_at": "2026-10-21T12:36:13.943Z",
      "deleted_at": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `DEJA_SUSPENDU`.

---

#### `POST /api/v1/admin/entreprises/:id/reactiver`

- **Accès :** super admin — permission `admin.entreprises`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `company`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Entreprise réactivée",
  "data": {
    "company": {
      "id": "868ba28b-8db8-4706-a938-274db118589e",
      "name": "Société 6ad5f4",
      "legal_name": null,
      "type": "mixte",
      "sector": "distribution",
      "description": null,
      "address": null,
      "city": "Dakar",
      "country": "SN",
      "phone": "+221778364305",
      "email": "admin.82ceb8597e@test.sn",
      "website": null,
      "ninea": "753415059",
      "rccm": null,
      "tax_regime": null,
      "vat_registered": true,
      "default_tax_rate": 18,
      "bank_details": null,
      "currency": "XOF",
      "logo_document_id": null,
      "is_listed": true,
      "settings": {},
      "status": "actif",
      "suspended_reason": null,
      "created_by": "e016ecf5-692c-4f9c-a346-a9e391d5d110",
      "created_at": "2026-10-21T12:36:13.782Z",
      "updated_at": "2026-10-21T12:36:14.061Z",
      "deleted_at": null
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/entreprises/:companyId/abonnement/activer`

- **Accès :** super admin — permission `admin.abonnements`
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `companyId` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `plan_code` | string | **oui** | max 30 car. |
| `months` | integer | **oui** | ≥ 1 · ≤ 24 |
| `note` | string | non | `null` accepté · max 1000 car. |
| `amount` | integer | non | `null` accepté · ≥ 0 · ≤ 1000000000000 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "plan_code": "ESSENTIEL",
  "months": 3,
  "note": "Virement reçu",
  "amount": 25000
}
```

</details>

**Réponse 201 :** `data` contient `payment`, `subscription`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Abonnement activé",
  "data": {
    "payment": {
      "id": "93b497ae-ea7c-46f8-a318-54adddab40a7",
      "company_id": "8a236099-c8cd-4363-ba34-47eb39011557",
      "subscription_id": "7f82d92e-27a2-4d9c-9282-323356d8c69f",
      "plan_id": "694c328a-7df7-471a-8481-44f19bfcc653",
      "amount": 25000,
      "currency": "XOF",
      "months": 3,
      "provider": "manuel",
      "reference": "ABO-20261021-000002",
      "status": "confirme",
      "paid_at": "2026-10-21T12:36:22.014Z",
      "recorded_by": "792151dd-1a62-4e8e-8fbe-fabf1d749c0e",
      "note": "Virement reçu",
      "updated_at": "2026-10-21T12:36:22.014Z",
      "created_at": "2026-10-21T12:36:22.014Z",
      "provider_transaction_id": null,
      "checkout_url": null
    },
    "subscription": {
      "id": "7f82d92e-27a2-4d9c-9282-323356d8c69f",
      "company_id": "8a236099-c8cd-4363-ba34-47eb39011557",
      "plan_id": "694c328a-7df7-471a-8481-44f19bfcc653",
      "status": "actif",
      "started_at": "2026-10-21T12:36:21.950Z",
      "current_period_start": "2026-10-21",
      "current_period_end": "2027-01-21",
      "trial_ends_at": "2026-11-20",
      "cancelled_at": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T12:36:21.950Z",
      "updated_at": "2026-10-21T12:36:22.009Z"
    }
  }
}
```

</details>

---

## 7. Admin — Abonnements

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/admin/abonnements` | super admin |
| GET | `/api/v1/admin/abonnements/:id` | super admin |
| POST | `/api/v1/admin/abonnements/:id/suspendre` | super admin |
| POST | `/api/v1/admin/abonnements/:id/reactiver` | super admin |
| POST | `/api/v1/admin/abonnements/:id/annuler` | super admin |

#### `GET /api/v1/admin/abonnements`

- **Accès :** super admin — permission `admin.abonnements`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `status` | string | non | valeurs : `essai`, `actif`, `expire`, `suspendu`, `annule` |
| `plan` | string | non | max 30 car. |
| `company_id` | string (uuid) | non |  |
| `fin_avant` | string | non | date `AAAA-MM-JJ` |
| `tri` | string | non | valeurs : `created_at`, `-created_at`, `current_period_end`, `-current_period_end` |


Exemple de query string réelle : `?company_id=8a236099-c8cd-4363-ba34-47eb39011557`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `plan_id`, `status`, `started_at`, `current_period_start`, `current_period_end`, `trial_ends_at`, `cancelled_at`, `suspended_reason`, `created_at`, `updated_at`, `plan`, `company`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "7f82d92e-27a2-4d9c-9282-323356d8c69f",
        "company_id": "8a236099-c8cd-4363-ba34-47eb39011557",
        "plan_id": "694c328a-7df7-471a-8481-44f19bfcc653",
        "status": "annule",
        "started_at": "2026-10-21T12:36:21.950Z",
        "current_period_start": "2026-10-21",
        "current_period_end": "2027-01-21",
        "trial_ends_at": "2026-11-20",
        "cancelled_at": "2026-10-21T12:36:22.194Z",
        "suspended_reason": null,
        "created_at": "2026-10-21T12:36:21.950Z",
        "updated_at": "2026-10-21T12:36:22.197Z",
        "plan": {
          "id": "694c328a-7df7-471a-8481-44f19bfcc653",
          "code": "ESSENTIEL",
          "name": "Essentiel",
          "price": 10000,
          "billing_period": "mensuel"
        },
        "company": {
          "id": "8a236099-c8cd-4363-ba34-47eb39011557",
          "name": "Société 59ea96",
          "type": "mixte",
          "phone": "+221776563364",
          "email": "admin.b771b9529d@test.sn",
          "status": "actif"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

</details>

---

#### `GET /api/v1/admin/abonnements/:id`

- **Accès :** super admin — permission `admin.abonnements`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `subscription`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "subscription": {
      "id": "7f82d92e-27a2-4d9c-9282-323356d8c69f",
      "company_id": "8a236099-c8cd-4363-ba34-47eb39011557",
      "plan_id": "694c328a-7df7-471a-8481-44f19bfcc653",
      "status": "annule",
      "started_at": "2026-10-21T12:36:21.950Z",
      "current_period_start": "2026-10-21",
      "current_period_end": "2027-01-21",
      "trial_ends_at": "2026-11-20",
      "cancelled_at": "2026-10-21T12:36:22.194Z",
      "suspended_reason": null,
      "created_at": "2026-10-21T12:36:21.950Z",
      "updated_at": "2026-10-21T12:36:22.197Z",
      "plan": {
        "id": "694c328a-7df7-471a-8481-44f19bfcc653",
        "code": "ESSENTIEL",
        "name": "Essentiel",
        "price": 10000,
        "billing_period": "mensuel"
      },
      "company": {
        "id": "8a236099-c8cd-4363-ba34-47eb39011557",
        "name": "Société 59ea96",
        "type": "mixte",
        "phone": "+221776563364",
        "email": "admin.b771b9529d@test.sn",
        "status": "actif"
      },
      "payments": [
        {
          "id": "93b497ae-ea7c-46f8-a318-54adddab40a7",
          "company_id": "8a236099-c8cd-4363-ba34-47eb39011557",
          "subscription_id": "7f82d92e-27a2-4d9c-9282-323356d8c69f",
          "plan_id": "694c328a-7df7-471a-8481-44f19bfcc653",
          "amount": 25000,
          "currency": "XOF",
          "months": 3,
          "provider": "manuel",
          "reference": "ABO-20261021-000002",
          "provider_transaction_id": null,
          "status": "confirme",
          "checkout_url": null,
          "paid_at": "2026-10-21T12:36:22.014Z",
          "recorded_by": "792151dd-1a62-4e8e-8fbe-fabf1d749c0e",
          "note": "Virement reçu",
          "created_at": "2026-10-21T12:36:22.014Z",
          "updated_at": "2026-10-21T12:36:22.014Z",
          "plan": {
            "id": "694c328a-7df7-471a-8481-44f19bfcc653",
            "code": "ESSENTIEL",
            "name": "Essentiel"
          }
        }
      ]
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/abonnements/:id/suspendre`

- **Accès :** super admin — permission `admin.abonnements`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `reason` | string | **oui** | min 3 car. · max 1000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reason": "Litige de paiement"
}
```

</details>

**Réponse 200 :** `data` contient `subscription`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Abonnement suspendu",
  "data": {
    "subscription": {
      "id": "7f82d92e-27a2-4d9c-9282-323356d8c69f",
      "company_id": "8a236099-c8cd-4363-ba34-47eb39011557",
      "plan_id": "694c328a-7df7-471a-8481-44f19bfcc653",
      "status": "suspendu",
      "started_at": "2026-10-21T12:36:21.950Z",
      "current_period_start": "2026-10-21",
      "current_period_end": "2027-01-21",
      "trial_ends_at": "2026-11-20",
      "cancelled_at": null,
      "suspended_reason": "Litige de paiement",
      "created_at": "2026-10-21T12:36:21.950Z",
      "updated_at": "2026-10-21T12:36:22.061Z"
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/abonnements/:id/reactiver`

- **Accès :** super admin — permission `admin.abonnements`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `subscription`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Abonnement rétabli",
  "data": {
    "subscription": {
      "id": "7f82d92e-27a2-4d9c-9282-323356d8c69f",
      "company_id": "8a236099-c8cd-4363-ba34-47eb39011557",
      "plan_id": "694c328a-7df7-471a-8481-44f19bfcc653",
      "status": "actif",
      "started_at": "2026-10-21T12:36:21.950Z",
      "current_period_start": "2026-10-21",
      "current_period_end": "2027-01-21",
      "trial_ends_at": "2026-11-20",
      "cancelled_at": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T12:36:21.950Z",
      "updated_at": "2026-10-21T12:36:22.117Z"
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/abonnements/:id/annuler`

- **Accès :** super admin — permission `admin.abonnements`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `reason` | string | non | min 3 car. · max 1000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reason": "Fermeture"
}
```

</details>

**Réponse 200 :** `data` contient `subscription`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Abonnement annulé",
  "data": {
    "subscription": {
      "id": "7f82d92e-27a2-4d9c-9282-323356d8c69f",
      "company_id": "8a236099-c8cd-4363-ba34-47eb39011557",
      "plan_id": "694c328a-7df7-471a-8481-44f19bfcc653",
      "status": "annule",
      "started_at": "2026-10-21T12:36:21.950Z",
      "current_period_start": "2026-10-21",
      "current_period_end": "2027-01-21",
      "trial_ends_at": "2026-11-20",
      "cancelled_at": "2026-10-21T12:36:22.194Z",
      "suspended_reason": null,
      "created_at": "2026-10-21T12:36:21.950Z",
      "updated_at": "2026-10-21T12:36:22.197Z"
    }
  }
}
```

</details>

---

## 8. Admin — Paiements d’abonnement

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/admin/paiements-abonnements` | super admin |

#### `GET /api/v1/admin/paiements-abonnements`

- **Accès :** super admin — permission `admin.paiements`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `status` | string | non | valeurs : `initie`, `confirme`, `echoue`, `annule` |
| `provider` | string | non | valeurs : `paydunya`, `manuel` |
| `company_id` | string (uuid) | non |  |
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `tri` | string | non | valeurs : `created_at`, `-created_at`, `amount`, `-amount` |


Exemple de query string réelle : `?provider=manuel`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `subscription_id`, `plan_id`, `amount`, `currency`, `months`, `provider`, `reference`, `provider_transaction_id`, `status`, `checkout_url`, `paid_at`, `recorded_by`, `note`, `created_at`, `updated_at`, `plan`, `company`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "93b497ae-ea7c-46f8-a318-54adddab40a7",
        "company_id": "8a236099-c8cd-4363-ba34-47eb39011557",
        "subscription_id": "7f82d92e-27a2-4d9c-9282-323356d8c69f",
        "plan_id": "694c328a-7df7-471a-8481-44f19bfcc653",
        "amount": 25000,
        "currency": "XOF",
        "months": 3,
        "provider": "manuel",
        "reference": "ABO-20261021-000002",
        "provider_transaction_id": null,
        "status": "confirme",
        "checkout_url": null,
        "paid_at": "2026-10-21T12:36:22.014Z",
        "recorded_by": "792151dd-1a62-4e8e-8fbe-fabf1d749c0e",
        "note": "Virement reçu",
        "created_at": "2026-10-21T12:36:22.014Z",
        "updated_at": "2026-10-21T12:36:22.014Z",
        "plan": {
          "id": "694c328a-7df7-471a-8481-44f19bfcc653",
          "code": "ESSENTIEL",
          "name": "Essentiel"
        },
        "company": {
          "id": "8a236099-c8cd-4363-ba34-47eb39011557",
          "name": "Société 59ea96",
          "type": "mixte",
          "phone": "+221776563364",
          "email": "admin.b771b9529d@test.sn",
          "status": "actif"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

</details>

---

## 9. Admin — Utilisateurs et super admins

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/admin/utilisateurs` | super admin |
| POST | `/api/v1/admin/utilisateurs` | super admin |
| GET | `/api/v1/admin/utilisateurs/:id` | super admin |
| POST | `/api/v1/admin/utilisateurs/:id/desactiver` | super admin |
| POST | `/api/v1/admin/utilisateurs/:id/activer` | super admin |
| POST | `/api/v1/admin/utilisateurs/:id/deverrouiller` | super admin |
| POST | `/api/v1/admin/utilisateurs/:id/reinitialiser-acces` | super admin |

#### `GET /api/v1/admin/utilisateurs`

- **Accès :** super admin — permission `admin.utilisateurs`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `q` | string | non | max 100 car. |
| `role` | string | non | valeurs : `super_admin`, `utilisateur` |
| `status` | string | non | valeurs : `actif`, `inactif` |
| `verrouille` | boolean | non |  |
| `tri` | string | non | valeurs : `created_at`, `-created_at`, `last_name`, `-last_name`, `last_login_at`, `-last_login_at` |


Exemple de query string réelle : `?q=admin.8f3dea6c1e%40test.sn`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `role_code`, `first_name`, `last_name`, `email`, `phone`, `status`, `email_verified_at`, `must_change_password`, `last_login_at`, `language`, `created_at`, `updated_at`, `totp_enabled_at`, `is_locked`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "5c75762d-4eeb-4a35-8a77-a23728a47eca",
        "role_code": "utilisateur",
        "first_name": "Awa",
        "last_name": "Diop",
        "email": "admin.8f3dea6c1e@test.sn",
        "phone": "+221778364306",
        "status": "actif",
        "email_verified_at": null,
        "must_change_password": false,
        "last_login_at": "2026-10-21T12:36:14.209Z",
        "language": "fr",
        "created_at": "2026-10-21T12:36:14.181Z",
        "updated_at": "2026-10-21T12:36:14.209Z",
        "totp_enabled_at": null,
        "is_locked": false
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/utilisateurs`

- **Accès :** super admin — permission `admin.utilisateurs`
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `first_name` | string | **oui** | min 1 car. · max 80 car. |
| `last_name` | string | **oui** | min 1 car. · max 80 car. |
| `email` | string (email) | **oui** | max 254 car. |
| `phone` | string | non | `null` accepté · max 25 car. |
| `password` | string | **oui** | max 128 car. |
| `current_password` | string | **oui** | max 128 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "first_name": "Awa",
  "last_name": "Sow",
  "email": "admin.provisoire.86fdb6a91e@test.sn",
  "password": "<masqué>",
  "current_password": "<masqué>"
}
```

</details>

**Réponse 201 :** `data` contient `user`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Super administrateur créé",
  "data": {
    "user": {
      "id": "08d00937-e8f2-4604-9476-7e7fae430097",
      "role_code": "super_admin",
      "first_name": "Awa",
      "last_name": "Sow",
      "email": "admin.provisoire.86fdb6a91e@test.sn",
      "phone": null,
      "status": "actif",
      "email_verified_at": null,
      "must_change_password": true,
      "last_login_at": null,
      "language": "fr",
      "created_at": "2026-10-21T12:35:58.871Z",
      "updated_at": "2026-10-21T12:35:58.871Z",
      "totp_enabled_at": null,
      "is_locked": false
    }
  }
}
```

</details>

**Erreurs observées :** 401 `MOT_DE_PASSE_INCORRECT` · 422 `DONNEES_INVALIDES` · 422 `MOT_DE_PASSE_FAIBLE`.

---

#### `GET /api/v1/admin/utilisateurs/:id`

- **Accès :** super admin — permission `admin.utilisateurs`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `user`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "user": {
      "id": "5c75762d-4eeb-4a35-8a77-a23728a47eca",
      "role_code": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.8f3dea6c1e@test.sn",
      "phone": "+221778364306",
      "status": "actif",
      "email_verified_at": null,
      "must_change_password": false,
      "last_login_at": "2026-10-21T12:36:14.209Z",
      "language": "fr",
      "created_at": "2026-10-21T12:36:14.181Z",
      "updated_at": "2026-10-21T12:36:14.209Z",
      "totp_enabled_at": null,
      "is_locked": false,
      "memberships": [
        {
          "id": "e8d2f4df-1d7d-4054-a80d-abf657f416f8",
          "company_id": "0be47ac3-1302-4e08-bcf2-12d4c9ce66b8",
          "role_code": "administrateur",
          "status": "actif",
          "company": {
            "id": "0be47ac3-1302-4e08-bcf2-12d4c9ce66b8",
            "name": "Société c6cf88",
            "type": "mixte",
            "status": "actif"
          }
        }
      ],
      "active_sessions": 1
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/utilisateurs/:id/desactiver`

- **Accès :** super admin — permission `admin.utilisateurs`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `reason` | string | **oui** | min 3 car. · max 1000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reason": "Demande du client"
}
```

</details>

**Réponse 200 :** `data` contient `user`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Compte désactivé",
  "data": {
    "user": {
      "id": "5c75762d-4eeb-4a35-8a77-a23728a47eca",
      "role_code": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.8f3dea6c1e@test.sn",
      "phone": "+221778364306",
      "status": "inactif",
      "email_verified_at": null,
      "must_change_password": false,
      "last_login_at": "2026-10-21T12:36:14.209Z",
      "language": "fr",
      "created_at": "2026-10-21T12:36:14.181Z",
      "updated_at": "2026-10-21T12:36:14.282Z",
      "totp_enabled_at": null,
      "is_locked": false
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/utilisateurs/:id/activer`

- **Accès :** super admin — permission `admin.utilisateurs`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `user`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Compte activé",
  "data": {
    "user": {
      "id": "5c75762d-4eeb-4a35-8a77-a23728a47eca",
      "role_code": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.8f3dea6c1e@test.sn",
      "phone": "+221778364306",
      "status": "actif",
      "email_verified_at": null,
      "must_change_password": false,
      "last_login_at": "2026-10-21T12:36:14.209Z",
      "language": "fr",
      "created_at": "2026-10-21T12:36:14.181Z",
      "updated_at": "2026-10-21T12:36:14.326Z",
      "totp_enabled_at": null,
      "is_locked": false
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/utilisateurs/:id/deverrouiller`

- **Accès :** super admin — permission `admin.utilisateurs`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `user`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Compte déverrouillé",
  "data": {
    "user": {
      "id": "5c75762d-4eeb-4a35-8a77-a23728a47eca",
      "role_code": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.8f3dea6c1e@test.sn",
      "phone": "+221778364306",
      "status": "actif",
      "email_verified_at": null,
      "must_change_password": false,
      "last_login_at": "2026-10-21T12:36:14.209Z",
      "language": "fr",
      "created_at": "2026-10-21T12:36:14.181Z",
      "updated_at": "2026-10-21T12:36:14.481Z",
      "totp_enabled_at": null,
      "is_locked": false
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/utilisateurs/:id/reinitialiser-acces`

- **Accès :** super admin — permission `admin.utilisateurs`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `current_password` | string | **oui** | max 128 car. |
| `reason` | string | **oui** | min 3 car. · max 500 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "current_password": "<masqué>",
  "reason": "Téléphone perdu"
}
```

</details>

**Réponse 200 :** `data` contient `user`, `mot_de_passe_provisoire`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Accès réinitialisé : transmettez le mot de passe provisoire par un canal sûr (il ne sera plus affiché).",
  "data": {
    "user": {
      "id": "ec96ce32-5c0f-4360-8c64-d079c78ec2fe",
      "role_code": "super_admin",
      "first_name": "Admin",
      "last_name": "Test",
      "email": "superadmin.32514704f3@test.sn",
      "phone": null,
      "status": "actif",
      "email_verified_at": null,
      "must_change_password": true,
      "last_login_at": "2026-10-21T12:36:00.612Z",
      "language": "fr",
      "created_at": "2026-10-21T12:36:00.541Z",
      "updated_at": "2026-10-21T12:36:00.710Z",
      "totp_enabled_at": null,
      "is_locked": false
    },
    "mot_de_passe_provisoire": "7HnkieY9pfyAgiSCK$"
  }
}
```

</details>

**Erreurs observées :** 401 `MOT_DE_PASSE_INCORRECT` · 409 `ACTION_SUR_SOI`.

---

## 10. Admin — Paramètres de la plateforme

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/admin/parametres` | super admin |
| PUT | `/api/v1/admin/parametres/:cle` | super admin |

#### `GET /api/v1/admin/parametres`

§ 5.4 « gérer les paramètres de la plateforme » — le corps est validé par le schéma propre à la clé (service).

- **Accès :** super admin — permission `admin.parametres`
- **Format :** aucun corps

**Réponse 200 :** `data` contient `settings`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "settings": [
      {
        "key": "essai",
        "value": {
          "plan_code": "BUSINESS",
          "duree_jours": 30
        },
        "default": {
          "plan_code": "BUSINESS",
          "duree_jours": 30
        },
        "customized": true,
        "description": "Forfait et durée de la période d'essai offerte à l'inscription d'une entreprise",
        "updated_by": null,
        "updated_at": "2026-10-21T12:34:18.942Z"
      },
      {
        "key": "invitation",
        "value": {
          "duree_jours": 7
        },
        "default": {
          "duree_jours": 7
        },
        "customized": true,
        "description": "Durée de validité d'une invitation de collaborateur",
        "updated_by": null,
        "updated_at": "2026-10-21T12:34:18.948Z"
      }
    ]
  }
}
```

</details>

---

#### `PUT /api/v1/admin/parametres/:cle`

- **Accès :** super admin — permission `admin.parametres`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `cle` | string | **oui** | max 80 car. |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

<details><summary>Exemple réel de requête</summary>

```json
{
  "duree_jours": 10
}
```

</details>

**Réponse 200 :** `data` contient `setting`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Paramètre modifié",
  "data": {
    "setting": {
      "key": "invitation",
      "value": {
        "duree_jours": 10
      },
      "default": {
        "duree_jours": 7
      },
      "customized": true,
      "description": "Durée de validité d'une invitation de collaborateur",
      "updated_by": "5cfd9ca3-652a-4fb3-a250-ba1bbefbbc6b",
      "updated_at": "2026-10-21T12:36:10.991Z"
    }
  }
}
```

</details>

**Erreurs observées :** 404 `RESSOURCE_INTROUVABLE` · 422 `DONNEES_INVALIDES`.

---

## 11. Admin — Notifications et diffusion

| Méthode | Chemin | Accès |
|---|---|---|
| POST | `/api/v1/admin/notifications` | super admin |
| GET | `/api/v1/admin/notifications` | super admin |

#### `POST /api/v1/admin/notifications`

- **Accès :** super admin — permission `admin.notifications`
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `cible` | string | **oui** | valeurs : `tous`, `acheteurs`, `fournisseurs`, `administrateurs` |
| `titre` | string | **oui** | min 3 car. · max 150 car. |
| `corps` | string | **oui** | min 3 car. · max 2000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "cible": "fournisseurs",
  "titre": "Maintenance",
  "corps": "Le service sera interrompu dimanche de 2 h à 3 h."
}
```

</details>

**Réponse 201 :** `data` contient `diffusion`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Notification diffusée",
  "data": {
    "diffusion": {
      "cible": "fournisseurs",
      "destinataires": 98
    }
  }
}
```

</details>

---

#### `GET /api/v1/admin/notifications`

- **Accès :** super admin — permission `admin.notifications`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |


**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `user_id`, `details`, `created_at`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": 602,
        "user_id": "5cfd9ca3-652a-4fb3-a250-ba1bbefbbc6b",
        "details": {
          "cible": "fournisseurs",
          "corps": "Le service sera interrompu dimanche de 2 h à 3 h.",
          "titre": "Maintenance",
          "destinataires": 98
        },
        "created_at": "2026-10-21T12:36:11.267Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

</details>

---

## 12. Admin — Journal d’audit

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/admin/journal-audit` | super admin |

#### `GET /api/v1/admin/journal-audit`

§ 24 historique des actions ; rôles et permissions (lecture seule).

- **Accès :** super admin — permission `admin.audit`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `company_id` | string (uuid) | non |  |
| `user_id` | string (uuid) | non |  |
| `action` | string | non | max 80 car. |
| `entity_type` | string | non | max 40 car. |
| `entity_id` | string | non | max 64 car. |
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |


Exemple de query string réelle : `?company_id=cc0cb2a8-745a-4ffb-89c4-63e89b648d26&action=entreprise.`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `user_id`, `company_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `details`, `ip`, `user_agent`, `request_id`, `created_at`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": 601,
        "user_id": "9f1bdb3d-a2ff-4b6f-8149-3fd21b401810",
        "company_id": "cc0cb2a8-745a-4ffb-89c4-63e89b648d26",
        "actor_role": "utilisateur",
        "action": "entreprise.creation",
        "entity_type": "company",
        "entity_id": "cc0cb2a8-745a-4ffb-89c4-63e89b648d26",
        "details": {
          "name": "Société d428a1",
          "type": "acheteur",
          "plan_essai": "BUSINESS"
        },
        "ip": "::ffff:127.0.0.1",
        "user_agent": null,
        "request_id": "4320f7df-5c49-471f-a9fe-407d7336f15e",
        "created_at": "2026-10-21T12:36:11.190Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

</details>

---

## 13. Admin — Rôles et permissions

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/admin/roles` | super admin |

#### `GET /api/v1/admin/roles`

- **Accès :** super admin — permission `admin.roles`
- **Format :** aucun corps

**Réponse 200 :** `data` contient `roles`, `catalogue`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "roles": [
      {
        "code": "administrateur",
        "label": "Administrateur",
        "description": null,
        "permissions": [
          "dashboard.lire",
          "entreprise.gerer"
        ],
        "is_system": true,
        "created_at": "2026-10-21T12:34:20.422Z",
        "updated_at": "2026-10-21T12:34:20.422Z"
      },
      {
        "code": "commercial",
        "label": "Commercial",
        "description": null,
        "permissions": [
          "dashboard.lire",
          "partenaires.lire"
        ],
        "is_system": true,
        "created_at": "2026-10-21T12:34:20.434Z",
        "updated_at": "2026-10-21T12:34:20.434Z"
      }
    ],
    "catalogue": [
      "dashboard.lire",
      "entreprise.gerer"
    ]
  }
}
```

</details>

---

## 14. Admin — Plans d’abonnement

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/admin/plans` | super admin |
| POST | `/api/v1/admin/plans` | super admin |
| GET | `/api/v1/admin/plans/:id` | super admin |
| PATCH | `/api/v1/admin/plans/:id` | super admin |
| POST | `/api/v1/admin/plans/:id/activer` | super admin |
| POST | `/api/v1/admin/plans/:id/desactiver` | super admin |
| DELETE | `/api/v1/admin/plans/:id` | super admin |

#### `GET /api/v1/admin/plans`

- **Accès :** super admin — permission `admin.plans`
- **Format :** aucun corps

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `status` | string | non | valeurs : `actif`, `inactif` |


**Réponse 200 :** `data` contient `plans`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "plans": [
      {
        "id": "694c328a-7df7-471a-8481-44f19bfcc653",
        "code": "ESSENTIEL",
        "name": "Essentiel",
        "description": "Pour démarrer : commandes, factures et suivi des paiements.",
        "price": 10000,
        "currency": "XOF",
        "billing_period": "mensuel",
        "max_users": 3,
        "max_products": 100,
        "max_partners": 15,
        "max_orders_per_month": 100,
        "features": [],
        "status": "actif",
        "sort_order": 1,
        "created_at": "2026-10-21T12:34:18.694Z",
        "updated_at": "2026-10-21T12:34:18.694Z",
        "subscribers_count": 0
      },
      {
        "id": "c8d74d4b-e697-4c55-afac-e064699afbdb",
        "code": "BUSINESS",
        "name": "Business",
        "description": "Modèles de documents personnalisés, statistiques et exports.",
        "price": 25000,
        "currency": "XOF",
        "billing_period": "mensuel",
        "max_users": 10,
        "max_products": 1000,
        "max_partners": 100,
        "max_orders_per_month": 1000,
        "features": [
          "modeles_documents",
          "statistiques"
        ],
        "status": "actif",
        "sort_order": 2,
        "created_at": "2026-10-21T12:34:18.705Z",
        "updated_at": "2026-10-21T12:34:18.705Z",
        "subscribers_count": 146
      }
    ]
  }
}
```

</details>

---

#### `POST /api/v1/admin/plans`

- **Accès :** super admin — permission `admin.plans`
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `name` | string | **oui** | min 1 car. · max 80 car. |
| `description` | string | non | `null` accepté · max 2000 car. |
| `price` | integer | **oui** | ≥ 0 · ≤ 1000000000000 |
| `currency` | string | non | exactement 3 car. |
| `billing_period` | string | non | valeurs : `mensuel`, `annuel` |
| `max_users` | integer | non | `null` accepté · ≥ 1 · ≤ 1000000 |
| `max_products` | integer | non | `null` accepté · ≥ 1 · ≤ 1000000 |
| `max_partners` | integer | non | `null` accepté · ≥ 1 · ≤ 1000000 |
| `max_orders_per_month` | integer | non | `null` accepté · ≥ 1 · ≤ 1000000 |
| `features` | tableau de string | non | sans doublon · max 3 élément(s) |
| `sort_order` | integer | non | ≥ 0 · ≤ 10000 |
| `code` | string | **oui** | format `/^[A-Z][A-Z0-9_]{1,29}$/` |
| `status` | string | non | valeurs : `actif`, `inactif` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "code": "TEMP46935",
  "name": "Temporaire",
  "price": 1000,
  "status": "inactif"
}
```

</details>

**Réponse 201 :** `data` contient `plan`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Plan créé",
  "data": {
    "plan": {
      "id": "9b842af5-e26b-49a7-a387-922b44fd179d",
      "currency": "XOF",
      "billing_period": "mensuel",
      "features": [],
      "sort_order": 0,
      "code": "TEMP46935",
      "name": "Temporaire",
      "price": 1000,
      "status": "inactif",
      "updated_at": "2026-10-21T12:35:46.958Z",
      "created_at": "2026-10-21T12:35:46.958Z",
      "description": null,
      "max_users": null,
      "max_products": null,
      "max_partners": null,
      "max_orders_per_month": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `CODE_UTILISE`.

---

#### `GET /api/v1/admin/plans/:id`

- **Accès :** super admin — permission `admin.plans`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `plan`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "plan": {
      "id": "9b842af5-e26b-49a7-a387-922b44fd179d",
      "code": "TEMP46935",
      "name": "Temporaire",
      "description": null,
      "price": 1000,
      "currency": "XOF",
      "billing_period": "mensuel",
      "max_users": null,
      "max_products": null,
      "max_partners": null,
      "max_orders_per_month": null,
      "features": [],
      "status": "inactif",
      "sort_order": 0,
      "created_at": "2026-10-21T12:35:46.958Z",
      "updated_at": "2026-10-21T12:35:46.958Z",
      "subscribers_count": 0
    }
  }
}
```

</details>

---

#### `PATCH /api/v1/admin/plans/:id`

- **Accès :** super admin — permission `admin.plans`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `name` | string | non | min 1 car. · max 80 car. |
| `description` | string | non | `null` accepté · max 2000 car. |
| `price` | integer | non | ≥ 0 · ≤ 1000000000000 |
| `currency` | string | non | exactement 3 car. |
| `billing_period` | string | non | valeurs : `mensuel`, `annuel` |
| `max_users` | integer | non | `null` accepté · ≥ 1 · ≤ 1000000 |
| `max_products` | integer | non | `null` accepté · ≥ 1 · ≤ 1000000 |
| `max_partners` | integer | non | `null` accepté · ≥ 1 · ≤ 1000000 |
| `max_orders_per_month` | integer | non | `null` accepté · ≥ 1 · ≤ 1000000 |
| `features` | tableau de string | non | sans doublon · max 3 élément(s) |
| `sort_order` | integer | non | ≥ 0 · ≤ 10000 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "price": 7500,
  "max_orders_per_month": 50
}
```

</details>

**Réponse 200 :** `data` contient `plan`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Plan modifié",
  "data": {
    "plan": {
      "id": "fd3a1ee3-b694-43d3-a44f-73dcc9573afb",
      "code": "PROMO71653",
      "name": "Promo",
      "description": null,
      "price": 7500,
      "currency": "XOF",
      "billing_period": "mensuel",
      "max_users": 2,
      "max_products": null,
      "max_partners": null,
      "max_orders_per_month": 50,
      "features": [
        "exports"
      ],
      "status": "actif",
      "sort_order": 0,
      "created_at": "2026-10-21T12:36:11.702Z",
      "updated_at": "2026-10-21T12:36:11.775Z"
    }
  }
}
```

</details>

---

#### `POST /api/v1/admin/plans/:id/activer`

- **Accès :** super admin — permission `admin.plans`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `plan`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Plan activé",
  "data": {
    "plan": {
      "id": "9b842af5-e26b-49a7-a387-922b44fd179d",
      "code": "TEMP46935",
      "name": "Temporaire",
      "description": null,
      "price": 1000,
      "currency": "XOF",
      "billing_period": "mensuel",
      "max_users": null,
      "max_products": null,
      "max_partners": null,
      "max_orders_per_month": null,
      "features": [],
      "status": "actif",
      "sort_order": 0,
      "created_at": "2026-10-21T12:35:46.958Z",
      "updated_at": "2026-10-21T12:35:47.016Z"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `STATUT_INCHANGE`.

---

#### `POST /api/v1/admin/plans/:id/desactiver`

- **Accès :** super admin — permission `admin.plans`
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `plan`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Plan désactivé",
  "data": {
    "plan": {
      "id": "fd3a1ee3-b694-43d3-a44f-73dcc9573afb",
      "code": "PROMO71653",
      "name": "Promo",
      "description": null,
      "price": 7500,
      "currency": "XOF",
      "billing_period": "mensuel",
      "max_users": 2,
      "max_products": null,
      "max_partners": null,
      "max_orders_per_month": 50,
      "features": [
        "exports"
      ],
      "status": "inactif",
      "sort_order": 0,
      "created_at": "2026-10-21T12:36:11.702Z",
      "updated_at": "2026-10-21T12:36:11.832Z"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `PLAN_ESSAI`.

---

#### `DELETE /api/v1/admin/plans/:id`

- **Accès :** super admin — permission `admin.plans`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` vaut `null`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Plan supprimé",
  "data": null
}
```

</details>

---

## Annexe A — Entités (champs renvoyés)

Champs de chaque entité tels que renvoyés par l’API (les secrets — mots de passe, clés, jetons — ne sont jamais renvoyés). Les réponses de détail ajoutent souvent des **relations incluses** (ex. `buyer`, `supplier`, `lines`) : leur forme exacte figure dans les exemples réels de chaque route.

### AuditLog

Table `audit_logs`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | integer (FCFA) | oui |  |
| `user_id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | oui |  |
| `actor_role` | string(40) | oui |  |
| `action` | string(80) | non |  |
| `entity_type` | string(40) | oui |  |
| `entity_id` | string(64) | oui |  |
| `details` | objet / tableau JSON | oui |  |
| `ip` | string(64) | oui |  |
| `user_agent` | string(300) | oui |  |
| `request_id` | string(128) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### Claim

Table `claims`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `number` | string(40) | non |  |
| `order_id` | string (uuid) | non |  |
| `buyer_company_id` | string (uuid) | non |  |
| `supplier_company_id` | string (uuid) | non |  |
| `partnership_id` | string (uuid) | non |  |
| `delivery_id` | string (uuid) | oui |  |
| `type` | string(20) | non |  |
| `status` | string(10) | non | ouvert |
| `description` | string | non |  |
| `subtotal` | integer (FCFA) | non | 0 |
| `tax_total` | integer (FCFA) | non | 0 |
| `total` | integer (FCFA) | non | 0 |
| `response` | string | oui |  |
| `restock` | boolean | non | false |
| `credit_note_id` | string (uuid) | oui |  |
| `opened_by` | string (uuid) | oui |  |
| `resolved_at` | string (date-heure ISO 8601) | oui |  |
| `resolved_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### ClaimLine

Table `claim_lines`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `claim_id` | string (uuid) | non |  |
| `line_no` | integer | non |  |
| `product_id` | string (uuid) | oui |  |
| `reference` | string(60) | oui |  |
| `name` | string(200) | non |  |
| `unit` | string(12) | non |  |
| `quantity` | string (décimal) | non |  |
| `unit_price` | integer (FCFA) | non |  |
| `tax_rate` | string (décimal) | non | 0 |
| `line_subtotal` | integer (FCFA) | non |  |
| `line_tax` | integer (FCFA) | non |  |
| `line_total` | integer (FCFA) | non |  |
| `comment` | string(500) | oui |  |

### Company

Table `companies`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `name` | string(150) | non |  |
| `legal_name` | string(200) | oui |  |
| `type` | string(12) | non |  |
| `sector` | string(20) | oui |  |
| `description` | string | oui |  |
| `address` | string(255) | oui |  |
| `city` | string(100) | oui |  |
| `country` | char | non | SN |
| `phone` | string(20) | oui |  |
| `email` | string(254) | oui |  |
| `website` | string(255) | oui |  |
| `ninea` | string(30) | oui |  |
| `rccm` | string(60) | oui |  |
| `tax_regime` | string(20) | oui |  |
| `vat_registered` | boolean | non | false |
| `default_tax_rate` | string (décimal) | non | 0 |
| `bank_details` | string | oui |  |
| `currency` | char | non | XOF |
| `logo_document_id` | string (uuid) | oui |  |
| `is_listed` | boolean | non | true |
| `settings` | objet / tableau JSON | non |  |
| `status` | string(20) | non | actif |
| `suspended_reason` | string | oui |  |
| `created_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### CompanyMember

Table `company_members`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | non |  |
| `user_id` | string (uuid) | non |  |
| `role_code` | string(40) | non |  |
| `status` | string(20) | non | actif |
| `invited_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### CreditNote

Table `credit_notes`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `number` | string(40) | non |  |
| `supplier_company_id` | string (uuid) | non |  |
| `buyer_company_id` | string (uuid) | non |  |
| `partnership_id` | string (uuid) | non |  |
| `order_id` | string (uuid) | oui |  |
| `invoice_id` | string (uuid) | oui |  |
| `claim_id` | string (uuid) | oui |  |
| `status` | string(10) | non | emis |
| `issue_date` | string (date AAAA-MM-JJ) | non |  |
| `reason` | string | non |  |
| `subtotal` | integer (FCFA) | non |  |
| `tax_total` | integer (FCFA) | non |  |
| `total` | integer (FCFA) | non |  |
| `amount_allocated` | integer (FCFA) | non | 0 |
| `template_id` | string (uuid) | oui |  |
| `created_by` | string (uuid) | oui |  |
| `cancelled_at` | string (date-heure ISO 8601) | oui |  |
| `cancellation_reason` | string | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### CreditNoteAllocation

Table `credit_note_allocations`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `credit_note_id` | string (uuid) | non |  |
| `invoice_id` | string (uuid) | non |  |
| `amount` | integer (FCFA) | non |  |
| `cancelled_at` | string (date-heure ISO 8601) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### CreditNoteLine

Table `credit_note_lines`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `credit_note_id` | string (uuid) | non |  |
| `line_no` | integer | non |  |
| `product_id` | string (uuid) | oui |  |
| `reference` | string(60) | oui |  |
| `name` | string(200) | non |  |
| `unit` | string(12) | non |  |
| `quantity` | string (décimal) | non |  |
| `unit_price` | integer (FCFA) | non |  |
| `tax_rate` | string (décimal) | non | 0 |
| `line_subtotal` | integer (FCFA) | non |  |
| `line_tax` | integer (FCFA) | non |  |
| `line_total` | integer (FCFA) | non |  |

### Delivery

Table `deliveries`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `number` | string(40) | non |  |
| `order_id` | string (uuid) | non |  |
| `supplier_company_id` | string (uuid) | non |  |
| `buyer_company_id` | string (uuid) | non |  |
| `delivery_no` | integer | non |  |
| `status` | string(15) | non | expediee |
| `note` | string | oui |  |
| `carrier` | string(120) | oui |  |
| `shipped_at` | string (date-heure ISO 8601) | non |  |
| `document_id` | string (uuid) | oui |  |
| `received_at` | string (date-heure ISO 8601) | oui |  |
| `received_by` | string (uuid) | oui |  |
| `reception_note` | string | oui |  |
| `with_reserves` | boolean | non | false |
| `created_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### DeliveryLine

Table `delivery_lines`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `delivery_id` | string (uuid) | non |  |
| `line_no` | integer | non |  |
| `product_id` | string (uuid) | oui |  |
| `reference` | string(60) | oui |  |
| `name` | string(200) | non |  |
| `unit` | string(12) | non |  |
| `quantity` | string (décimal) | non |  |
| `received_quantity` | string (décimal) | oui |  |

### Document

Table `documents`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | oui |  |
| `partner_company_id` | string (uuid) | oui |  |
| `entity_type` | string(30) | non |  |
| `entity_id` | string (uuid) | non |  |
| `category` | string(20) | non |  |
| `visibility` | string(12) | non | prive |
| `storage_key` | string(300) | non |  |
| `thumbnail_key` | string(300) | oui |  |
| `mime_type` | string(100) | non |  |
| `size_bytes` | integer (FCFA) | non |  |
| `original_name` | string(255) | oui |  |
| `checksum` | char | oui |  |
| `uploaded_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### DocumentTemplate

Table `document_templates`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | non |  |
| `type` | string(15) | non |  |
| `version` | integer | non |  |
| `status` | string(10) | non | actif |
| `name` | string(120) | non |  |
| `accent_color` | char | non | #0F4C81 |
| `header_text` | string | oui |  |
| `footer_text` | string | oui |  |
| `legal_mentions` | string | oui |  |
| `show_logo` | boolean | non | true |
| `background_document_id` | string (uuid) | oui |  |
| `margin_top` | integer | non | 50 |
| `margin_bottom` | integer | non | 60 |
| `created_by` | string (uuid) | oui |  |
| `archived_at` | string (date-heure ISO 8601) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### Invoice

Table `invoices`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `number` | string(40) | non |  |
| `supplier_company_id` | string (uuid) | non |  |
| `buyer_company_id` | string (uuid) | non |  |
| `partnership_id` | string (uuid) | non |  |
| `order_id` | string (uuid) | non |  |
| `status` | string(20) | non | emise |
| `source` | string(10) | non | generee |
| `issue_date` | string (date AAAA-MM-JJ) | non |  |
| `due_date` | string (date AAAA-MM-JJ) | non |  |
| `currency` | char | non | XOF |
| `subtotal` | integer (FCFA) | non |  |
| `tax_total` | integer (FCFA) | non |  |
| `total` | integer (FCFA) | non |  |
| `amount_paid` | integer (FCFA) | non | 0 |
| `template_id` | string (uuid) | oui |  |
| `file_document_id` | string (uuid) | oui |  |
| `note` | string | oui |  |
| `due_soon_notified_at` | string (date-heure ISO 8601) | oui |  |
| `overdue_notified_at` | string (date-heure ISO 8601) | oui |  |
| `cancelled_at` | string (date-heure ISO 8601) | oui |  |
| `cancellation_reason` | string | oui |  |
| `amount_credited` | integer (FCFA) | non | 0 |
| `match_status` | string(10) | non | conforme |
| `match_details` | objet / tableau JSON | oui |  |
| `match_decided_at` | string (date-heure ISO 8601) | oui |  |
| `match_decided_by` | string (uuid) | oui |  |
| `match_comment` | string | oui |  |
| `reminders_count` | integer | non | 0 |
| `last_reminder_at` | string (date-heure ISO 8601) | oui |  |
| `created_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### InvoiceLine

Table `invoice_lines`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `invoice_id` | string (uuid) | non |  |
| `line_no` | integer | non |  |
| `product_id` | string (uuid) | oui |  |
| `reference` | string(60) | oui |  |
| `name` | string(200) | non |  |
| `unit` | string(12) | non |  |
| `quantity` | string (décimal) | non |  |
| `unit_price` | integer (FCFA) | non |  |
| `tax_rate` | string (décimal) | non | 0 |
| `line_subtotal` | integer (FCFA) | non |  |
| `line_tax` | integer (FCFA) | non |  |
| `line_total` | integer (FCFA) | non |  |

### InvoiceReminder

Table `invoice_reminders`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | integer (FCFA) | oui |  |
| `invoice_id` | string (uuid) | non |  |
| `level` | smallint | non |  |
| `channel` | string(10) | non |  |
| `days_overdue` | integer | non |  |
| `amount_due` | integer (FCFA) | non |  |
| `emailed` | boolean | non | false |
| `sent_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### MemberInvitation

Table `member_invitations`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | non |  |
| `email` | string(254) | non |  |
| `phone` | string(20) | oui |  |
| `first_name` | string(80) | non |  |
| `last_name` | string(80) | non |  |
| `job_title` | string(100) | oui |  |
| `role_code` | string(40) | non |  |
| `expires_at` | string (date-heure ISO 8601) | non |  |
| `attempts` | smallint | non | 0 |
| `used_at` | string (date-heure ISO 8601) | oui |  |
| `revoked_at` | string (date-heure ISO 8601) | oui |  |
| `created_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### Notification

Table `notifications`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `user_id` | string (uuid) | non |  |
| `company_id` | string (uuid) | oui |  |
| `type` | string(30) | non |  |
| `title` | string(150) | non |  |
| `body` | string | non |  |
| `data` | objet / tableau JSON | non |  |
| `read_at` | string (date-heure ISO 8601) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### Order

Table `orders`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `number` | string(40) | non |  |
| `buyer_company_id` | string (uuid) | non |  |
| `supplier_company_id` | string (uuid) | non |  |
| `partnership_id` | string (uuid) | non |  |
| `status` | string(25) | non | brouillon |
| `revision` | integer | non | 1 |
| `current_version_no` | integer | non | 1 |
| `validated_version_no` | integer | oui |  |
| `buyer_reference` | string(60) | oui |  |
| `delivery_address` | string | oui |  |
| `requested_delivery_date` | string (date AAAA-MM-JJ) | oui |  |
| `conditions` | string | oui |  |
| `currency` | char | non | XOF |
| `subtotal` | integer (FCFA) | non | 0 |
| `tax_total` | integer (FCFA) | non | 0 |
| `total` | integer (FCFA) | non | 0 |
| `lines_count` | integer | non | 0 |
| `delivery_note` | string | oui |  |
| `reception_note` | string | oui |  |
| `reception_with_reserves` | boolean | non | false |
| `cancellation_reason` | string | oui |  |
| `refusal_reason` | string | oui |  |
| `cancelled_by_side` | string(12) | oui |  |
| `template_id` | string (uuid) | oui |  |
| `created_by` | string (uuid) | oui |  |
| `sent_at` | string (date-heure ISO 8601) | oui |  |
| `acknowledged_at` | string (date-heure ISO 8601) | oui |  |
| `validated_at` | string (date-heure ISO 8601) | oui |  |
| `preparation_at` | string (date-heure ISO 8601) | oui |  |
| `ready_at` | string (date-heure ISO 8601) | oui |  |
| `delivered_at` | string (date-heure ISO 8601) | oui |  |
| `received_at` | string (date-heure ISO 8601) | oui |  |
| `invoiced_at` | string (date-heure ISO 8601) | oui |  |
| `completed_at` | string (date-heure ISO 8601) | oui |  |
| `refused_at` | string (date-heure ISO 8601) | oui |  |
| `cancelled_at` | string (date-heure ISO 8601) | oui |  |
| `approval_status` | string(12) | non | non_requise |
| `approvals_required` | smallint | non | 0 |
| `approval_round` | integer | non | 0 |
| `approval_requested_at` | string (date-heure ISO 8601) | oui |  |
| `approval_requested_by` | string (uuid) | oui |  |
| `approved_at` | string (date-heure ISO 8601) | oui |  |
| `source_order_id` | string (uuid) | oui |  |
| `purchase_list_id` | string (uuid) | oui |  |
| `deliveries_count` | integer | non | 0 |
| `backorder_closed_at` | string (date-heure ISO 8601) | oui |  |
| `backorder_closed_by_side` | string(12) | oui |  |
| `backorder_close_reason` | string | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### OrderApproval

Table `order_approvals`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `order_id` | string (uuid) | non |  |
| `round` | integer | non |  |
| `user_id` | string (uuid) | non |  |
| `decision` | string(10) | non |  |
| `comment` | string | oui |  |
| `order_total` | integer (FCFA) | non |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### OrderEvent

Table `order_events`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | integer (FCFA) | oui |  |
| `order_id` | string (uuid) | non |  |
| `type` | string(30) | non |  |
| `from_status` | string(25) | oui |  |
| `to_status` | string(25) | oui |  |
| `version_no` | integer | oui |  |
| `actor_user_id` | string (uuid) | oui |  |
| `actor_company_id` | string (uuid) | oui |  |
| `actor_side` | string(12) | oui |  |
| `message` | string | oui |  |
| `details` | objet / tableau JSON | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### OrderLine

Table `order_lines`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `order_id` | string (uuid) | non |  |
| `version_id` | string (uuid) | non |  |
| `line_no` | integer | non |  |
| `product_id` | string (uuid) | oui |  |
| `reference` | string(60) | oui |  |
| `name` | string(200) | non |  |
| `unit` | string(12) | non |  |
| `quantity` | string (décimal) | non |  |
| `unit_price` | integer (FCFA) | non |  |
| `tax_rate` | string (décimal) | non | 0 |
| `line_subtotal` | integer (FCFA) | non |  |
| `line_tax` | integer (FCFA) | non |  |
| `line_total` | integer (FCFA) | non |  |
| `change_type` | string(20) | non | inchangee |
| `original_quantity` | string (décimal) | oui |  |
| `original_unit_price` | integer (FCFA) | oui |  |
| `substitute_for_line_no` | integer | oui |  |
| `comment` | string(500) | oui |  |
| `received_quantity` | string (décimal) | oui |  |
| `base_unit_price` | integer (FCFA) | oui |  |
| `discount_percent` | string (décimal) | non | 0 |
| `delivered_quantity` | string (décimal) | non | 0 |
| `stock_reserved` | string (décimal) | non | 0 |
| `created_at` | string (date-heure ISO 8601) | non |  |

### OrderVersion

Table `order_versions`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `order_id` | string (uuid) | non |  |
| `version_no` | integer | non |  |
| `proposed_by_side` | string(12) | non |  |
| `proposed_by` | string (uuid) | oui |  |
| `status` | string(12) | non |  |
| `comment` | string | oui |  |
| `subtotal` | integer (FCFA) | non | 0 |
| `tax_total` | integer (FCFA) | non | 0 |
| `total` | integer (FCFA) | non | 0 |
| `lines_count` | integer | non | 0 |
| `decided_at` | string (date-heure ISO 8601) | oui |  |
| `decided_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### Partnership

Table `partnerships`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `buyer_company_id` | string (uuid) | non |  |
| `supplier_company_id` | string (uuid) | non |  |
| `status` | string(12) | non | en_attente |
| `requested_by_company_id` | string (uuid) | non |  |
| `requested_by` | string (uuid) | oui |  |
| `request_message` | string | oui |  |
| `responded_at` | string (date-heure ISO 8601) | oui |  |
| `responded_by` | string (uuid) | oui |  |
| `payment_terms_days` | integer | non | 30 |
| `supplier_customer_code` | string(40) | oui |  |
| `buyer_notes` | string | oui |  |
| `supplier_notes` | string | oui |  |
| `suspended_by_company_id` | string (uuid) | oui |  |
| `suspended_reason` | string | oui |  |
| `price_list_id` | string (uuid) | oui |  |
| `credit_limit` | integer (FCFA) | oui |  |
| `block_on_overdue` | boolean | non | false |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### PartnershipInvitation

Table `partnership_invitations`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | non |  |
| `relation` | string(12) | non |  |
| `email` | string(254) | non |  |
| `company_name` | string(150) | oui |  |
| `contact_name` | string(160) | oui |  |
| `message` | string | oui |  |
| `status` | string(12) | non | en_attente |
| `expires_at` | string (date-heure ISO 8601) | non |  |
| `accepted_company_id` | string (uuid) | oui |  |
| `accepted_at` | string (date-heure ISO 8601) | oui |  |
| `created_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### Payment

Table `payments`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `reference` | string(40) | non |  |
| `supplier_company_id` | string (uuid) | non |  |
| `buyer_company_id` | string (uuid) | non |  |
| `partnership_id` | string (uuid) | non |  |
| `amount` | integer (FCFA) | non |  |
| `allocated_amount` | integer (FCFA) | non | 0 |
| `currency` | char | non | XOF |
| `method` | string(15) | non |  |
| `paid_on` | string (date AAAA-MM-JJ) | non |  |
| `external_reference` | string(100) | oui |  |
| `note` | string | oui |  |
| `status` | string(10) | non |  |
| `recorded_by_side` | string(12) | non |  |
| `recorded_by` | string (uuid) | oui |  |
| `confirmed_at` | string (date-heure ISO 8601) | oui |  |
| `confirmed_by` | string (uuid) | oui |  |
| `rejected_at` | string (date-heure ISO 8601) | oui |  |
| `rejection_reason` | string | oui |  |
| `cancelled_at` | string (date-heure ISO 8601) | oui |  |
| `cancellation_reason` | string | oui |  |
| `proof_document_id` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### PaymentAllocation

Table `payment_allocations`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `payment_id` | string (uuid) | non |  |
| `invoice_id` | string (uuid) | non |  |
| `amount` | integer (FCFA) | non |  |
| `cancelled_at` | string (date-heure ISO 8601) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### PlatformSetting

Table `platform_settings`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `key` | string(80) | oui |  |
| `value` | objet / tableau JSON | non |  |
| `description` | string | oui |  |
| `updated_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### PriceList

Table `price_lists`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | non |  |
| `name` | string(100) | non |  |
| `description` | string | oui |  |
| `discount_percent` | string (décimal) | non | 0 |
| `is_active` | boolean | non | true |
| `created_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### PriceListItem

Table `price_list_items`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `price_list_id` | string (uuid) | non |  |
| `product_id` | string (uuid) | non |  |
| `price` | integer (FCFA) | non |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### Product

Table `products`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | non |  |
| `category_id` | string (uuid) | oui |  |
| `reference` | string(60) | non |  |
| `name` | string(200) | non |  |
| `description` | string | oui |  |
| `unit` | string(12) | non |  |
| `packaging` | string(100) | oui |  |
| `price` | integer (FCFA) | non |  |
| `tax_rate` | string (décimal) | non | 0 |
| `availability` | string(15) | non | disponible |
| `stock_quantity` | string (décimal) | oui |  |
| `min_order_quantity` | string (décimal) | non | 1 |
| `order_multiple` | string (décimal) | oui |  |
| `max_order_quantity` | string (décimal) | oui |  |
| `stock_reserved` | string (décimal) | non | 0 |
| `low_stock_threshold` | string (décimal) | oui |  |
| `low_stock_notified_at` | string (date-heure ISO 8601) | oui |  |
| `is_active` | boolean | non | true |
| `photo_document_id` | string (uuid) | oui |  |
| `created_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### ProductCategory

Table `product_categories`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | non |  |
| `name` | string(100) | non |  |
| `sort_order` | integer | non | 0 |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### ProductPriceTier

Table `product_price_tiers`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `product_id` | string (uuid) | non |  |
| `min_quantity` | string (décimal) | non |  |
| `discount_percent` | string (décimal) | non |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### PurchaseList

Table `purchase_lists`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | non |  |
| `supplier_company_id` | string (uuid) | non |  |
| `name` | string(100) | non |  |
| `notes` | string | oui |  |
| `last_ordered_at` | string (date-heure ISO 8601) | oui |  |
| `created_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### PurchaseListItem

Table `purchase_list_items`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `list_id` | string (uuid) | non |  |
| `product_id` | string (uuid) | non |  |
| `quantity` | string (décimal) | oui |  |
| `par_level` | string (décimal) | oui |  |
| `sort_order` | integer | non | 0 |
| `created_at` | string (date-heure ISO 8601) | non |  |

### Role

Table `roles`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `code` | string(40) | oui |  |
| `label` | string(100) | non |  |
| `description` | string | oui |  |
| `permissions` | tableau | non |  |
| `is_system` | boolean | non | false |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### StockMovement

Table `stock_movements`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | integer (FCFA) | oui |  |
| `company_id` | string (uuid) | non |  |
| `product_id` | string (uuid) | non |  |
| `type` | string(15) | non |  |
| `quantity` | string (décimal) | non |  |
| `stock_after` | string (décimal) | oui |  |
| `reserved_after` | string (décimal) | non |  |
| `order_id` | string (uuid) | oui |  |
| `note` | string | oui |  |
| `created_by` | string (uuid) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |

### Subscription

Table `subscriptions`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | non |  |
| `plan_id` | string (uuid) | non |  |
| `status` | string(12) | non |  |
| `started_at` | string (date-heure ISO 8601) | non |  |
| `current_period_start` | string (date AAAA-MM-JJ) | non |  |
| `current_period_end` | string (date AAAA-MM-JJ) | non |  |
| `trial_ends_at` | string (date AAAA-MM-JJ) | oui |  |
| `cancelled_at` | string (date-heure ISO 8601) | oui |  |
| `suspended_reason` | string | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### SubscriptionPayment

Table `subscription_payments`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `company_id` | string (uuid) | non |  |
| `subscription_id` | string (uuid) | oui |  |
| `plan_id` | string (uuid) | non |  |
| `amount` | integer (FCFA) | non |  |
| `currency` | char | non | XOF |
| `months` | smallint | non | 1 |
| `provider` | string(20) | non |  |
| `reference` | string(64) | non |  |
| `provider_transaction_id` | string(128) | oui |  |
| `status` | string(10) | non | initie |
| `checkout_url` | string | oui |  |
| `paid_at` | string (date-heure ISO 8601) | oui |  |
| `recorded_by` | string (uuid) | oui |  |
| `note` | string | oui |  |
| `raw_payload` | objet / tableau JSON | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### SubscriptionPlan

Table `subscription_plans`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `code` | string(30) | non |  |
| `name` | string(80) | non |  |
| `description` | string | oui |  |
| `price` | integer (FCFA) | non |  |
| `currency` | char | non | XOF |
| `billing_period` | string(10) | non | mensuel |
| `max_users` | integer | oui |  |
| `max_products` | integer | oui |  |
| `max_partners` | integer | oui |  |
| `max_orders_per_month` | integer | oui |  |
| `features` | tableau | non |  |
| `status` | string(10) | non | actif |
| `sort_order` | integer | non | 0 |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

### User

Table `users`.

| Champ | Type | Nullable | Défaut |
|---|---|---|---|
| `id` | string (uuid) | oui |  |
| `role_code` | string(40) | non |  |
| `first_name` | string(80) | non |  |
| `last_name` | string(80) | non |  |
| `email` | string(254) | oui |  |
| `phone` | string(20) | oui |  |
| `job_title` | string(100) | oui |  |
| `status` | string(20) | non | actif |
| `email_verified_at` | string (date-heure ISO 8601) | oui |  |
| `must_change_password` | boolean | non | false |
| `last_login_at` | string (date-heure ISO 8601) | oui |  |
| `language` | string(5) | non | fr |
| `totp_enabled_at` | string (date-heure ISO 8601) | oui |  |
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |


## Annexe B — Énumérations métier

Codes acceptés et renvoyés par l’API, avec leur libellé d’affichage. La même liste est servie par `GET /api/v1/referentiels` : la lire au démarrage plutôt que de la coder en dur.

### `ROLES`

| Code | Libellé |
|---|---|
| `super_admin` | Super administrateur |
| `utilisateur` | Utilisateur d'entreprise |

### `ROLES_ENTREPRISE`

| Code | Libellé |
|---|---|
| `administrateur` | Administrateur |
| `responsable_achats` | Responsable achats |
| `responsable_commandes` | Responsable commandes |
| `comptable` | Comptable |
| `receptionnaire` | Réceptionnaire |
| `commercial` | Commercial |

### `STATUT_UTILISATEUR`

| Code | Libellé |
|---|---|
| `actif` | Actif |
| `inactif` | Inactif |

### `STATUT_ENTREPRISE`

| Code | Libellé |
|---|---|
| `actif` | Active |
| `suspendu` | Suspendue |

### `STATUT_MEMBRE`

| Code | Libellé |
|---|---|
| `actif` | Actif |
| `inactif` | Désactivé |

### `TYPE_ENTREPRISE`

| Code | Libellé |
|---|---|
| `acheteur` | Acheteur |
| `fournisseur` | Fournisseur |
| `mixte` | Acheteur et fournisseur |

### `SECTEUR_ACTIVITE`

| Code | Libellé |
|---|---|
| `commerce` | Commerce |
| `grande_surface` | Grande surface |
| `restaurant` | Restaurant |
| `hotel` | Hôtel |
| `distribution` | Distribution |
| `grossiste` | Grossiste |
| `industrie` | Industrie |
| `agroalimentaire` | Agroalimentaire |
| `services` | Services |
| `btp` | BTP |
| `sante` | Santé |
| `autre` | Autre |

### `REGIME_FISCAL`

| Code | Libellé |
|---|---|
| `reel_normal` | Réel normal |
| `reel_simplifie` | Réel simplifié |
| `cgu` | Contribution globale unique (CGU) |
| `exonere` | Exonéré |

### `STATUT_PARTENARIAT`

| Code | Libellé |
|---|---|
| `en_attente` | En attente |
| `actif` | Actif |
| `refuse` | Refusé |
| `suspendu` | Suspendu |

### `RELATION`

| Code | Libellé |
|---|---|
| `fournisseur` | Fournisseur |
| `client` | Client |

### `STATUT_INVITATION_PARTENAIRE`

| Code | Libellé |
|---|---|
| `en_attente` | En attente |
| `acceptee` | Acceptée |
| `expiree` | Expirée |
| `annulee` | Annulée |

### `UNITE`

| Code | Libellé |
|---|---|
| `piece` | Pièce |
| `carton` | Carton |
| `paquet` | Paquet |
| `sac` | Sac |
| `boite` | Boîte |
| `bouteille` | Bouteille |
| `douzaine` | Douzaine |
| `lot` | Lot |
| `palette` | Palette |
| `kg` | Kilogramme |
| `g` | Gramme |
| `tonne` | Tonne |
| `litre` | Litre |
| `ml` | Millilitre |
| `metre` | Mètre |
| `m2` | Mètre carré |
| `m3` | Mètre cube |
| `heure` | Heure |
| `forfait` | Forfait |
| `autre` | Autre |

### `DISPONIBILITE`

| Code | Libellé |
|---|---|
| `disponible` | Disponible |
| `stock_limite` | Stock limité |
| `sur_commande` | Sur commande |
| `rupture` | Indisponible (rupture) |

### `STATUT_COMMANDE`

| Code | Libellé |
|---|---|
| `brouillon` | Brouillon |
| `envoyee` | Bon de commande envoyé |
| `en_attente_validation` | En attente de validation |
| `proposition_modifiee` | Proposition modifiée |
| `validee` | Commande validée |
| `en_preparation` | En préparation |
| `prete` | Prête |
| `livree_partiellement` | Livrée partiellement |
| `livree` | Livrée |
| `reception_confirmee` | Réception confirmée |
| `facturee` | Facturée |
| `terminee` | Terminée |
| `refusee` | Refusée |
| `annulee` | Annulée |

### `COTE`

| Code | Libellé |
|---|---|
| `acheteur` | Acheteur |
| `fournisseur` | Fournisseur |

### `STATUT_VERSION`

| Code | Libellé |
|---|---|
| `brouillon` | Brouillon |
| `proposee` | Proposée |
| `acceptee` | Acceptée |
| `refusee` | Refusée |
| `remplacee` | Remplacée |

### `CHANGEMENT_LIGNE`

| Code | Libellé |
|---|---|
| `inchangee` | Inchangée |
| `quantite_modifiee` | Quantité modifiée |
| `prix_modifie` | Prix modifié |
| `indisponible` | Indisponible |
| `ajoutee` | Produit ajouté |
| `substitution` | Produit de remplacement |

### `EVENEMENT_COMMANDE`

| Code | Libellé |
|---|---|
| `creation` | Création de la commande |
| `modification` | Modification du brouillon |
| `envoi` | Envoi au fournisseur |
| `prise_en_charge` | Prise en charge par le fournisseur |
| `acceptation` | Acceptation par le fournisseur |
| `proposition` | Proposition modifiée du fournisseur |
| `demande_modification` | Demande de modification du client |
| `acceptation_proposition` | Acceptation de la proposition |
| `refus_proposition` | Refus de la proposition |
| `refus` | Refus du fournisseur |
| `annulation` | Annulation |
| `validation` | Validation de la commande |
| `changement_statut` | Changement de statut |
| `livraison` | Livraison |
| `reception` | Confirmation de réception |
| `facturation` | Génération de la facture |
| `annulation_facture` | Annulation de la facture |
| `paiement` | Paiement |
| `cloture` | Commande terminée |
| `piece_jointe` | Pièce jointe |
| `commentaire` | Commentaire |
| `soumission_approbation` | Soumission à approbation interne |
| `approbation` | Approbation interne |
| `rejet_approbation` | Rejet de l’approbation interne |
| `livraison_partielle` | Livraison partielle |
| `reception_partielle` | Réception d’une livraison |
| `reliquat_solde` | Reliquat soldé |
| `litige` | Litige |
| `avoir` | Avoir |

### `EVENEMENTS_INTERNES_ACHETEUR`

| Code | Libellé |
|---|---|
| `0` | creation |
| `1` | modification |
| `2` | soumission_approbation |
| `3` | approbation |
| `4` | rejet_approbation |

### `STATUT_APPROBATION`

| Code | Libellé |
|---|---|
| `non_requise` | Approbation non requise |
| `en_attente` | En attente d’approbation |
| `approuvee` | Approuvée |
| `rejetee` | Rejetée |

### `DECISION_APPROBATION`

| Code | Libellé |
|---|---|
| `approuvee` | Approuvée |
| `rejetee` | Rejetée |

### `STATUT_LIVRAISON`

| Code | Libellé |
|---|---|
| `expediee` | Expédiée |
| `receptionnee` | Réceptionnée |

### `TYPE_LITIGE`

| Code | Libellé |
|---|---|
| `manquant` | Produit manquant |
| `endommage` | Produit endommagé |
| `non_conforme` | Produit non conforme |
| `erreur_produit` | Erreur de produit |
| `perime` | Produit périmé |
| `autre` | Autre |

### `STATUT_LITIGE`

| Code | Libellé |
|---|---|
| `ouvert` | Ouvert |
| `accepte` | Accepté (avoir émis) |
| `refuse` | Refusé |
| `annule` | Annulé |

### `STATUT_AVOIR`

| Code | Libellé |
|---|---|
| `emis` | Émis |
| `annule` | Annulé |

### `STATUT_RAPPROCHEMENT`

| Code | Libellé |
|---|---|
| `conforme` | Conforme |
| `ecart` | Écart à valider |
| `accepte` | Écart accepté |
| `conteste` | Contestée |

### `TYPE_MOUVEMENT_STOCK`

| Code | Libellé |
|---|---|
| `entree` | Entrée en stock |
| `ajustement` | Ajustement d’inventaire |
| `reservation` | Réservation (commande validée) |
| `liberation` | Libération de réservation |
| `sortie` | Sortie (livraison) |
| `retour` | Retour client |

### `CANAL_RELANCE`

| Code | Libellé |
|---|---|
| `auto` | Automatique |
| `manuel` | Manuelle |

### `STATUT_FACTURE`

| Code | Libellé |
|---|---|
| `emise` | Émise |
| `partiellement_payee` | Partiellement payée |
| `payee` | Payée |
| `en_retard` | En retard |
| `annulee` | Annulée |

### `SOURCE_FACTURE`

| Code | Libellé |
|---|---|
| `generee` | Générée par Pro2Link |
| `importee` | Importée par le fournisseur |

### `MODE_PAIEMENT`

| Code | Libellé |
|---|---|
| `especes` | Espèces |
| `virement` | Virement bancaire |
| `cheque` | Chèque |
| `wave` | Wave |
| `orange_money` | Orange Money |
| `free_money` | Free Money |
| `carte` | Carte bancaire |
| `effet` | Effet de commerce |
| `autre` | Autre |

### `STATUT_PAIEMENT`

| Code | Libellé |
|---|---|
| `declare` | Déclaré par le client |
| `confirme` | Confirmé |
| `rejete` | Rejeté |
| `annule` | Annulé |

### `TYPE_MODELE_DOCUMENT`

| Code | Libellé |
|---|---|
| `bon_commande` | Bon de commande |
| `facture` | Facture |

### `STATUT_MODELE_DOCUMENT`

| Code | Libellé |
|---|---|
| `actif` | Actif |
| `archive` | Archivé |

### `CATEGORIE_DOCUMENT`

| Code | Libellé |
|---|---|
| `logo` | Logo |
| `photo` | Photo |
| `bon_commande` | Bon de commande |
| `bon_livraison` | Bon de livraison |
| `facture` | Facture |
| `preuve_paiement` | Preuve de paiement |
| `modele` | Modèle de document |
| `piece_jointe` | Pièce jointe |
| `autre` | Autre |

### `ENTITE_DOCUMENT`

| Code | Libellé |
|---|---|
| `company` | Entreprise |
| `product` | Produit |
| `order` | Commande |
| `claim` | Litige |
| `invoice` | Facture |
| `payment` | Paiement |
| `document_template` | Modèle de document |
| `partnership` | Partenariat |

### `VISIBILITE_DOCUMENT`

| Code | Libellé |
|---|---|
| `prive` | Privé |
| `partenaire` | Partagé avec le partenaire |
| `catalogue` | Visible des clients |
| `public` | Public (annuaire) |

### `TYPE_NOTIFICATION`

| Code | Libellé |
|---|---|
| `nouveau_bon_commande` | Nouveau bon de commande |
| `commande_acceptee` | Commande acceptée |
| `commande_modifiee` | Commande modifiée |
| `proposition_recue` | Proposition reçue |
| `proposition_acceptee` | Proposition acceptée |
| `proposition_refusee` | Proposition refusée |
| `modification_demandee` | Modification demandée |
| `produit_indisponible` | Produit indisponible |
| `commande_refusee` | Commande refusée |
| `commande_annulee` | Commande annulée |
| `commande_en_preparation` | Commande en préparation |
| `commande_prete` | Commande prête |
| `commande_livree` | Commande livrée |
| `reception_confirmee` | Réception confirmée |
| `nouvelle_facture` | Nouvelle facture |
| `facture_annulee` | Facture annulée |
| `paiement_enregistre` | Paiement enregistré |
| `paiement_declare` | Paiement déclaré |
| `paiement_rejete` | Paiement rejeté |
| `echeance` | Échéance ou montant dû |
| `partenariat` | Partenariat |
| `commentaire` | Nouveau message |
| `abonnement` | Abonnement |
| `approbation_requise` | Approbation requise |
| `commande_approuvee` | Commande approuvée |
| `approbation_rejetee` | Approbation rejetée |
| `livraison_partielle` | Livraison partielle |
| `litige` | Litige |
| `avoir` | Avoir |
| `facture_ecart` | Écart de facturation |
| `relance_facture` | Relance de facture |
| `stock_bas` | Stock bas |
| `systeme` | Information |

### `STATUT_ABONNEMENT`

| Code | Libellé |
|---|---|
| `essai` | Période d'essai |
| `actif` | Actif |
| `expire` | Expiré |
| `suspendu` | Suspendu |
| `annule` | Annulé |

### `PERIODE_FACTURATION`

| Code | Libellé |
|---|---|
| `mensuel` | Mensuelle |
| `annuel` | Annuelle |

### `STATUT_PLAN`

| Code | Libellé |
|---|---|
| `actif` | Actif |
| `inactif` | Inactif |

### `STATUT_PAIEMENT_ABONNEMENT`

| Code | Libellé |
|---|---|
| `initie` | Initié |
| `confirme` | Confirmé |
| `echoue` | Échoué |
| `annule` | Annulé |

### `FONCTIONNALITE`

| Code | Libellé |
|---|---|
| `modeles_documents` | Modèles de documents personnalisés |
| `statistiques` | Statistiques |
| `exports` | Exports CSV |

### `PORTEFEUILLE`

| Code | Libellé |
|---|---|
| `wave` | Wave |
| `orange_money` | Orange Money |

### `PLATEFORME_APPAREIL`

| Code | Libellé |
|---|---|
| `android` | Android |
| `ios` | iOS |
| `web` | Web |

