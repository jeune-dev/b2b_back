# Contrat d’API — Application Pro2Link (web et mobile, acheteurs et fournisseurs)

> Généré depuis le code (routes réellement montées, schémas de validation Joi, middlewares d’accès, modèles), le 2026-10-21, par `node scripts/generer-contrats.js`. Les exemples sont de **vraies requêtes et réponses** de l’API, capturées pendant la suite de tests sur une base PostgreSQL de test (tableaux réduits à 2 éléments, textes longs tronqués par « … », jetons remplacés par `<jwt>`, secrets par `<masqué>`).

**Périmètre :** les 134 routes utilisées par l’application web et mobile des entreprises : authentification, compte, notifications, référentiels, réseau de partenaires, catalogue, bons de commande (côté acheteur `/achats` et côté fournisseur `/ventes`), facturation, paiements, dettes et créances, tableaux de bord, statistiques, modèles de documents, abonnement et synchronisation temps réel. Le back-office super admin est décrit dans `CONTRAT-API-ADMIN.md` ; les webhooks (PayDunya) sont appelés par le fournisseur de paiement, jamais par l’application.

## Mode d’emploi pour l’IA ou le développeur qui intègre

1. Lire d’abord la section **0. Conventions** : enveloppe, authentification, erreurs, pagination, types, fichiers, idempotence. Elle s’applique à **toutes** les routes.
2. Puis **0 bis. Parcours**, qui enchaîne les appels dans le bon ordre.
3. Pour chaque écran, chercher la route dans le sommaire : accès (espace, permission), paramètres, corps (champs, types, obligatoire ou non, contraintes, valeurs permises), contenu de `data` en réponse, exemple réel, erreurs observées.
4. Les tableaux « Corps » sont **exhaustifs** : tout champ absent est **retiré silencieusement** par l’API (protection contre l’affectation de masse). Ne pas en inventer.
5. Les champs sont en **snake_case**, les montants en **FCFA entiers** (`350000`), les dates seules en `AAAA-MM-JJ`.
6. Ne pas coder en dur les énumérations (statuts, catégories, types) : les lire dans `GET /api/v1/referentiels` ; elles sont aussi listées en **annexe B**.
7. Afficher `message` des réponses (succès et erreurs) tel quel : il est rédigé pour l’utilisateur, en français.

## Sommaire

- [0. Conventions communes](#0-conventions-communes)
- [0 bis. Parcours de l’application](#0-bis-parcours-de-lapplication)
- [1. Authentification](#1-authentification) — 8 route(s)
- [2. Compte connecté (profil, sécurité, sessions, appareils)](#2-compte-connecté-profil-sécurité-sessions-appareils) — 12 route(s)
- [3. Démarrage et contenus publics](#3-démarrage-et-contenus-publics) — 2 route(s)
- [4. Notifications](#4-notifications) — 4 route(s)
- [5. Synchronisation temps réel (web / mobile)](#5-synchronisation-temps-réel-web--mobile) — 2 route(s)
- [6. Tableau de bord](#6-tableau-de-bord) — 1 route(s)
- [7. Mon entreprise (profil, paramètres, logo)](#7-mon-entreprise-profil-paramètres-logo) — 5 route(s)
- [8. Utilisateurs internes et rôles](#8-utilisateurs-internes-et-rôles) — 9 route(s)
- [9. Annuaire des entreprises](#9-annuaire-des-entreprises) — 2 route(s)
- [10. Partenariats acheteur / fournisseur](#10-partenariats-acheteur--fournisseur) — 12 route(s)
- [11. Catalogue — produits](#11-catalogue--produits) — 11 route(s)
- [12. Catalogue — catégories](#12-catalogue--catégories) — 4 route(s)
- [13. Catalogues des fournisseurs](#13-catalogues-des-fournisseurs) — 3 route(s)
- [14. Achats — bons de commande (acheteur)](#14-achats--bons-de-commande-acheteur) — 15 route(s)
- [15. Ventes — commandes reçues (fournisseur)](#15-ventes--commandes-reçues-fournisseur) — 14 route(s)
- [16. Factures](#16-factures) — 5 route(s)
- [17. Paiements](#17-paiements) — 7 route(s)
- [18. Dettes, créances et relevés](#18-dettes-créances-et-relevés) — 2 route(s)
- [19. Statistiques et exports](#19-statistiques-et-exports) — 3 route(s)
- [20. Modèles de documents](#20-modèles-de-documents) — 6 route(s)
- [21. Documents et fichiers](#21-documents-et-fichiers) — 4 route(s)
- [22. Abonnement](#22-abonnement) — 3 route(s)
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

## 0 bis. Parcours de l’application

### Démarrage
1. `GET /api/v1/referentiels` : énumérations et libellés (statuts, unités, secteurs, rôles internes) — à mettre en cache.
2. Mobile : jetons en stockage sécurisé (Keychain / Keystore) ; si un refresh token existe, `POST /api/v1/auth/refresh`. Web : cookie httpOnly.
3. `GET /api/v1/compte` : profil, entreprise, type (`acheteur`, `fournisseur` ou `mixte`), rôle interne et **permissions** → n’afficher que les actions permises.
4. Notifications push (mobile) : `POST /api/v1/compte/appareils` avec le jeton FCM ; à la déconnexion, `DELETE /api/v1/compte/appareils`.
5. Temps réel : `POST /api/v1/evenements/ticket` puis `EventSource('/api/v1/evenements/flux?ticket=…')`.

### Acheteur (§ 28)
1. Inscription `POST /auth/inscription` (compte administrateur + entreprise + essai gratuit) → connexion.
2. Inviter ses collaborateurs (`POST /utilisateurs/invitations`) avec un rôle interne.
3. Réseau : chercher dans `GET /annuaire` et demander un partenariat, ou inviter un fournisseur absent de la plateforme.
4. Consulter `GET /catalogues/:supplierId/produits` → créer un bon de commande `POST /achats` (brouillon) → `POST /achats/:id/envoyer`.
5. Le fournisseur modifie ? Examiner la proposition (versions, écarts ligne à ligne) → `POST /achats/:id/accepter-proposition` ou `/refuser-proposition`.
6. À la livraison : `POST /achats/:id/confirmer-reception` (quantités reçues, réserves éventuelles).
7. Facture reçue → enregistrer un paiement `POST /paiements` (**Idempotency-Key**) → `GET /situation/dettes`.

### Fournisseur (§ 28)
1. Créer son catalogue (`POST /produits`, catégories, photos).
2. Recevoir la commande (`GET /ventes`, notification push + temps réel) → `POST /ventes/:id/accepter`, `/refuser` ou `/proposer` (proposition modifiée : quantités, produit retiré ou remplacé, indisponibilité).
3. Préparer (`POST /ventes/:id/statut` : en préparation, prête) puis livrer (`POST /ventes/:id/livrer`, bon de livraison en pièce jointe).
4. Émettre la facture (`POST /factures`, PDF selon son modèle de document) → confirmer le paiement déclaré par l’acheteur.
5. Suivi : `GET /tableau-de-bord`, `GET /situation/creances`, `GET /statistiques/ventes`.

## 1. Authentification

| Méthode | Chemin | Accès |
|---|---|---|
| POST | `/api/v1/auth/inscription` | route publique (aucun jeton) |
| POST | `/api/v1/auth/connexion` | route publique (aucun jeton) |
| POST | `/api/v1/auth/mfa` | route publique (aucun jeton) |
| POST | `/api/v1/auth/refresh` | route publique (aucun jeton) |
| POST | `/api/v1/auth/deconnexion` | route publique (aucun jeton) |
| POST | `/api/v1/auth/mot-de-passe-oublie` | route publique (aucun jeton) |
| POST | `/api/v1/auth/reinitialiser-mot-de-passe` | route publique (aucun jeton) |
| POST | `/api/v1/auth/invitation/activation` | route publique (aucun jeton) |

#### `POST /api/v1/auth/inscription`

§ 26 — création du compte et de l'entreprise. Routes publiques, toutes limitées en débit.

- **Accès :** route publique (aucun jeton)
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `first_name` | string | **oui** | min 1 car. · max 80 car. |
| `last_name` | string | **oui** | min 1 car. · max 80 car. |
| `email` | string (email) | **oui** | max 254 car. |
| `phone` | string | non | max 25 car. |
| `job_title` | string | non | `null` accepté · max 100 car. |
| `password` | string | **oui** | min 8 car. · max 128 car. · format `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/` |
| `password_confirmation` | any | **oui** | valeurs : `[object Object]` |
| `company` | object | **oui** |  |
| `company.name` | string | **oui** | min 2 car. · max 150 car. |
| `company.legal_name` | string | non | `null` accepté · max 200 car. |
| `company.type` | string | **oui** | valeurs : `acheteur`, `fournisseur`, `mixte` |
| `company.sector` | string | non | valeurs : `commerce`, `grande_surface`, `restaurant`, `hotel`, `distribution`, `grossiste`, `industrie`, `agroalimentaire`, `services`, `btp`, `sante`, `autre` |
| `company.description` | string | non | `null` accepté · max 2000 car. |
| `company.address` | string | non | `null` accepté · max 255 car. |
| `company.city` | string | non | `null` accepté · max 100 car. |
| `company.country` | string | non | exactement 2 car. |
| `company.phone` | string | non | `null` accepté · max 25 car. |
| `company.email` | string (email) | non | `null` accepté · max 254 car. |
| `company.website` | string | non | `null` accepté · max 255 car. |
| `company.ninea` | string | non | `null` accepté · format `/^[A-Z0-9 ]{5,30}$/` |
| `company.rccm` | string | non | `null` accepté · format `/^[A-Z0-9 ./-]{5,60}$/` |
| `company.tax_regime` | string | non | valeurs : `reel_normal`, `reel_simplifie`, `cgu`, `exonere` |
| `company.vat_registered` | boolean | non |  |
| `company.default_tax_rate` | number | non | ≥ 0 · ≤ 100 · 2 décimale(s) max |
| `company.bank_details` | string | non | `null` accepté · max 1000 car. |
| `company.is_listed` | boolean | non |  |
| `invitation_token` | string | non | max 200 car. |
| `device_name` | string | non | `null` accepté · max 120 car. |
| `platform` | string | non | valeurs : `android`, `ios`, `web` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "first_name": "Mame",
  "last_name": "Diouf",
  "email": "nouveau-fournisseur.461ef29de4@test.sn",
  "phone": "+221776562474",
  "password": "<masqué>",
  "password_confirmation": "<masqué>",
  "company": {
    "name": "Laiterie du Fleuve",
    "type": "fournisseur",
    "ninea": "741124911"
  },
  "invitation_token": "6ku5bkB_l5Vsl59Ihf8mR1YJNMIJeqs8-hL05UICU88"
}
```

</details>

**Réponse 201 :** `data` contient `access_token`, `token_type`, `expires_in`, `user`, `company`, `partnerships_created`, `refresh_token`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Compte et entreprise créés",
  "data": {
    "access_token": "<masqué>",
    "token_type": "Bearer",
    "expires_in": "15m",
    "user": {
      "id": "a4f4a366-06f1-4bac-8e5c-ddaa2187412e",
      "role": "utilisateur",
      "first_name": "Mame",
      "last_name": "Diouf",
      "email": "nouveau-fournisseur.461ef29de4@test.sn",
      "phone": "+221776562474",
      "status": "actif",
      "language": "fr",
      "must_change_password": false,
      "mfa_active": false,
      "mfa_a_configurer": false
    },
    "company": {
      "id": "9bec126f-955a-4ef6-b850-59349b6f4cf2",
      "name": "Laiterie du Fleuve",
      "type": "fournisseur"
    },
    "partnerships_created": [
      {
        "partnership_id": "0f1c48b6-b0a0-4cae-9f61-4aa79f5f8552",
        "status": "actif",
        "partner": "Société fb629f"
      }
    ],
    "refresh_token": "<masqué>"
  }
}
```

</details>

**Erreurs observées :** 409 `COMPTE_EXISTANT` · 409 `NINEA_UTILISE` · 422 `DONNEES_INVALIDES`.

---

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
  "identifiant": "nouveau.06befdd157@test.sn",
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
      "id": "70d57d3c-7f7a-4102-8913-26e9f69a1648",
      "role": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "nouveau.06befdd157@test.sn",
      "phone": "+221778363378",
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
  "code": "286518"
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
      "id": "a72bbc65-3448-4d8f-92db-eddc3f579659",
      "role": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.0c29697256@test.sn",
      "phone": "+221778363395",
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
      "id": "29d1c996-031a-40e8-8b1a-46e0bfd96259",
      "role": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.e5c5d7035c@test.sn",
      "phone": "+221776562424",
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

#### `POST /api/v1/auth/mot-de-passe-oublie`

- **Accès :** route publique (aucun jeton)
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `identifiant` | string | **oui** | max 254 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "identifiant": "inconnu@nulle.part"
}
```

</details>

**Réponse 200 :** `data` vaut `null`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Si un compte correspond, un code de réinitialisation a été envoyé.",
  "data": null
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/auth/reinitialiser-mot-de-passe`

- **Accès :** route publique (aucun jeton)
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `identifiant` | string | **oui** | max 254 car. |
| `code` | string | **oui** | format `/^\d{6}$/` |
| `password` | string | **oui** | min 8 car. · max 128 car. · format `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/` |
| `password_confirmation` | any | **oui** | valeurs : `[object Object]` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "identifiant": "+221776562511",
  "code": "653198",
  "password": "<masqué>",
  "password_confirmation": "<masqué>"
}
```

</details>

**Réponse 200 :** `data` vaut `null`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Mot de passe réinitialisé. Vous pouvez vous connecter.",
  "data": null
}
```

</details>

**Erreurs observées :** 400 `CODE_INVALIDE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/auth/invitation/activation`

§ 5.3 — activation d'un compte collaborateur (lien ou code reçu par e-mail). Limité par IP ET par e-mail ciblé (force brute du code à 8 chiffres).

- **Accès :** route publique (aucun jeton)
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `token` | string | non | max 200 car. |
| `code` | string | non | format `/^\d{8}$/` |
| `email` | string (email) | non | max 254 car. |
| `phone` | string | non | max 25 car. |
| `password` | string | **oui** | min 8 car. · max 128 car. · format `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/` |
| `password_confirmation` | any | **oui** | valeurs : `[object Object]` |
| `device_name` | string | non | `null` accepté · max 120 car. |
| `platform` | string | non | valeurs : `android`, `ios`, `web` |

Règles globales : exactement un parmi `token`, `code` ; `code` exige `email`.


<details><summary>Exemple réel de requête</summary>

```json
{
  "code": "76256818",
  "email": "receptionnaire.23210290b1@test.sn",
  "password": "<masqué>",
  "password_confirmation": "<masqué>"
}
```

</details>

**Réponse 201 :** `data` contient `access_token`, `token_type`, `expires_in`, `user`, `refresh_token`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Compte activé : bienvenue dans votre entreprise",
  "data": {
    "access_token": "<masqué>",
    "token_type": "Bearer",
    "expires_in": "15m",
    "user": {
      "id": "05e4ed66-3b72-4d4d-9044-952d404a0dca",
      "role": "utilisateur",
      "first_name": "Moussa",
      "last_name": "Sow",
      "email": "receptionnaire.23210290b1@test.sn",
      "phone": null,
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

**Erreurs observées :** 400 `INVITATION_INVALIDE`.

---

## 2. Compte connecté (profil, sécurité, sessions, appareils)

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/compte` | tout compte connecté |
| PATCH | `/api/v1/compte` | tout compte connecté |
| POST | `/api/v1/compte/mot-de-passe` | tout compte connecté |
| GET | `/api/v1/compte/sessions` | tout compte connecté |
| DELETE | `/api/v1/compte/sessions/:id` | tout compte connecté |
| POST | `/api/v1/compte/sessions/revoquer-toutes` | tout compte connecté |
| POST | `/api/v1/compte/appareils` | tout compte connecté |
| POST | `/api/v1/compte/mfa/initialiser` | tout compte connecté |
| POST | `/api/v1/compte/mfa/activer` | tout compte connecté |
| POST | `/api/v1/compte/mfa/desactiver` | tout compte connecté |
| POST | `/api/v1/compte/mfa/codes-secours` | tout compte connecté |
| DELETE | `/api/v1/compte/appareils` | tout compte connecté |

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
      "id": "52c4eef0-0605-4bfa-9e29-0b3100365b7f",
      "role_code": "utilisateur",
      "first_name": "Moussa",
      "last_name": "Sow",
      "email": "receptionnaire.a9a730a5a3@test.sn",
      "phone": null,
      "job_title": null,
      "status": "actif",
      "email_verified_at": "2026-10-21T11:14:57.188Z",
      "must_change_password": false,
      "last_login_at": "2026-10-21T11:14:57.211Z",
      "language": "fr",
      "totp_enabled_at": null,
      "created_at": "2026-10-21T11:14:57.189Z",
      "updated_at": "2026-10-21T11:14:57.211Z"
    },
    "company": {
      "id": "c9084d68-d1a4-45d5-940e-a835c99d30b9",
      "name": "Société 076bf8",
      "type": "acheteur",
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
      "role": "receptionnaire",
      "role_label": "Réceptionnaire"
    },
    "permissions": [
      "achats.lire",
      "catalogue.lire"
    ],
    "abonnement": {
      "abonnement": {
        "id": "098cfb7c-1790-4fa3-a089-95b2f060ed0b",
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
      "id": "db6ab715-0df5-404b-9e78-8f69dd1c9db1",
      "role_code": "utilisateur",
      "first_name": "Awa",
      "last_name": "Diop",
      "email": "admin.960cd11b69@test.sn",
      "phone": "+221776562496",
      "job_title": "Directrice des achats",
      "status": "actif",
      "email_verified_at": null,
      "must_change_password": false,
      "last_login_at": "2026-10-21T11:15:40.590Z",
      "language": "en",
      "totp_enabled_at": null,
      "created_at": "2026-10-21T11:15:40.489Z",
      "updated_at": "2026-10-21T11:15:40.679Z"
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
        "id": "38272d3f-98db-44f2-b199-38bc1eed6e34",
        "device_name": "Téléphone",
        "platform": "android",
        "ip": "::ffff:127.0.0.1",
        "user_agent": null,
        "last_used_at": "2026-10-21T11:15:46.179Z",
        "created_at": "2026-10-21T11:15:46.179Z",
        "expires_at": "2026-11-20T11:15:46.000Z",
        "current": true
      },
      {
        "id": "af35b7f8-2473-4df4-bbf5-2a6c21470009",
        "device_name": "Tablette",
        "platform": "ios",
        "ip": "::ffff:127.0.0.1",
        "user_agent": null,
        "last_used_at": "2026-10-21T11:15:46.143Z",
        "created_at": "2026-10-21T11:15:46.144Z",
        "expires_at": "2026-11-20T11:15:46.000Z",
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

#### `POST /api/v1/compte/appareils`

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `token` | string | **oui** | min 10 car. · max 512 car. |
| `platform` | string | **oui** | valeurs : `android`, `ios`, `web` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "token": "<masqué>",
  "platform": "android"
}
```

</details>

**Réponse 200 :** `data` vaut `null`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Appareil enregistré pour les notifications",
  "data": null
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

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
  "code": "031400"
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
  "code": "746393"
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

#### `DELETE /api/v1/compte/appareils`

- **Accès :** tout compte connecté
- **Format :** aucun corps

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `token` | string | **oui** | min 10 car. · max 512 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "token": "<masqué>"
}
```

</details>

**Réponse 200 :** `data` vaut `null`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Appareil retiré",
  "data": null
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 3. Démarrage et contenus publics

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/referentiels` | route publique (aucun jeton) |
| GET | `/api/v1/abonnement/plans` | route publique (aucun jeton) |

#### `GET /api/v1/referentiels`

Public (routes.js) : aucune donnée personnelle, uniquement des codes et libellés.

- **Accès :** route publique (aucun jeton)
- **Format :** aucun corps

**Réponse 200 :** `data` contient `enumerations`, `correspondances`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "enumerations": {
      "roles": [
        {
          "code": "super_admin",
          "label": "Super administrateur"
        },
        {
          "code": "utilisateur",
          "label": "Utilisateur d'entreprise"
        }
      ],
      "roles_entreprise": [
        {
          "code": "administrateur",
          "label": "Administrateur"
        },
        {
          "code": "responsable_achats",
          "label": "Responsable achats"
        }
      ],
      "statut_utilisateur": [
        {
          "code": "actif",
          "label": "Actif"
        },
        {
          "code": "inactif",
          "label": "Inactif"
        }
      ],
      "statut_entreprise": [
        {
          "code": "actif",
          "label": "Active"
        },
        {
          "code": "suspendu",
          "label": "Suspendue"
        }
      ],
      "statut_membre": [
        {
          "code": "actif",
          "label": "Actif"
        },
        {
          "code": "inactif",
          "label": "Désactivé"
        }
      ],
      "type_entreprise": [
        {
          "code": "acheteur",
          "label": "Acheteur"
        },
        {
          "code": "fournisseur",
          "label": "Fournisseur"
        }
      ],
      "secteur_activite": [
        {
          "code": "commerce",
          "label": "Commerce"
        },
        {
          "code": "grande_surface",
          "label": "Grande surface"
        }
      ],
      "regime_fiscal": [
        {
          "code": "reel_normal",
          "label": "Réel normal"
        },
        {
          "code": "reel_simplifie",
          "label": "Réel simplifié"
        }
      ],
      "statut_partenariat": [
        {
          "code": "en_attente",
          "label": "En attente"
        },
        {
          "code": "actif",
          "label": "Actif"
        }
      ],
      "relation": [
        {
          "code": "fournisseur",
          "label": "Fournisseur"
        },
        {
          "code": "client",
          "label": "Client"
        }
      ],
      "statut_invitation_partenaire": [
        {
          "code": "en_attente",
          "label": "En attente"
        },
        {
          "code": "acceptee",
          "label": "Acceptée"
        }
      ],
      "unite": [
        {
          "code": "piece",
          "label": "Pièce"
        },
        {
          "code": "carton",
          "label": "Carton"
        }
      ],
      "disponibilite": [
        {
          "code": "disponible",
          "label": "Disponible"
        },
        {
          "code": "stock_limite",
          "label": "Stock limité"
        }
      ],
      "statut_commande": [
        {
          "code": "brouillon",
          "label": "Brouillon"
        },
        {
          "code": "envoyee",
          "label": "Bon de commande envoyé"
        }
      ],
      "cote": [
        {
          "code": "acheteur",
          "label": "Acheteur"
        },
        {
          "code": "fournisseur",
          "label": "Fournisseur"
        }
      ],
      "statut_version": [
        {
          "code": "brouillon",
          "label": "Brouillon"
        },
        {
          "code": "proposee",
          "label": "Proposée"
        }
      ],
      "changement_ligne": [
        {
          "code": "inchangee",
          "label": "Inchangée"
        },
        {
          "code": "quantite_modifiee",
          "label": "Quantité modifiée"
        }
      ],
      "evenement_commande": [
        {
          "code": "creation",
          "label": "Création de la commande"
        },
        {
          "code": "modification",
          "label": "Modification du brouillon"
        }
      ],
      "statut_facture": [
        {
          "code": "emise",
          "label": "Émise"
        },
        {
          "code": "partiellement_payee",
          "label": "Partiellement payée"
        }
      ],
      "source_facture": [
        {
          "code": "generee",
          "label": "Générée par Pro2Link"
        },
        {
          "code": "importee",
          "label": "Importée par le fournisseur"
        }
      ],
      "mode_paiement": [
        {
          "code": "especes",
          "label": "Espèces"
        },
        {
          "code": "virement",
          "label": "Virement bancaire"
        }
      ],
      "statut_paiement": [
        {
          "code": "declare",
          "label": "Déclaré par le client"
        },
        {
          "code": "confirme",
          "label": "Confirmé"
        }
      ],
      "type_modele_document": [
        {
          "code": "bon_commande",
          "label": "Bon de commande"
        },
        {
          "code": "facture",
          "label": "Facture"
        }
      ],
      "statut_modele_document": [
        {
          "code": "actif",
          "label": "Actif"
        },
        {
          "code": "archive",
          "label": "Archivé"
        }
      ],
      "categorie_document": [
        {
          "code": "logo",
          "label": "Logo"
        },
        {
          "code": "photo",
          "label": "Photo"
        }
      ],
      "entite_document": [
        {
          "code": "company",
          "label": "Entreprise"
        },
        {
          "code": "product",
          "label": "Produit"
        }
      ],
      "visibilite_document": [
        {
          "code": "prive",
          "label": "Privé"
        },
        {
          "code": "partenaire",
          "label": "Partagé avec le partenaire"
        }
      ],
      "type_notification": [
        {
          "code": "nouveau_bon_commande",
          "label": "Nouveau bon de commande"
        },
        {
          "code": "commande_acceptee",
          "label": "Commande acceptée"
        }
      ],
      "statut_abonnement": [
        {
          "code": "essai",
          "label": "Période d'essai"
        },
        {
          "code": "actif",
          "label": "Actif"
        }
      ],
      "periode_facturation": [
        {
          "code": "mensuel",
          "label": "Mensuelle"
        },
        {
          "code": "annuel",
          "label": "Annuelle"
        }
      ],
      "statut_plan": [
        {
          "code": "actif",
          "label": "Actif"
        },
        {
          "code": "inactif",
          "label": "Inactif"
        }
      ],
      "statut_paiement_abonnement": [
        {
          "code": "initie",
          "label": "Initié"
        },
        {
          "code": "confirme",
          "label": "Confirmé"
        }
      ],
      "fonctionnalite": [
        {
          "code": "modeles_documents",
          "label": "Modèles de documents personnalisés"
        },
        {
          "code": "statistiques",
          "label": "Statistiques"
        }
      ],
      "portefeuille": [
        {
          "code": "wave",
          "label": "Wave"
        },
        {
          "code": "orange_money",
          "label": "Orange Money"
        }
      ],
      "plateforme_appareil": [
        {
          "code": "android",
          "label": "Android"
        },
        {
          "code": "ios",
          "label": "iOS"
        }
      ]
    },
    "correspondances": {}
  }
}
```

</details>

---

#### `GET /api/v1/abonnement/plans`

Public (routes.js) : la page de tarifs et l'inscription affichent les formules sans compte (§ 25).

- **Accès :** route publique (aucun jeton)
- **Format :** aucun corps

**Réponse 200 :** `data` contient `plans`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "plans": [
      {
        "code": "ESSENTIEL",
        "name": "Essentiel",
        "description": "Pour démarrer : commandes, factures et suivi des paiements.",
        "price": 10000,
        "currency": "XOF",
        "billing_period": "mensuel",
        "limits": {
          "max_users": 3,
          "max_products": 100,
          "max_partners": 15,
          "max_orders_per_month": 100
        },
        "features": []
      },
      {
        "code": "BUSINESS",
        "name": "Business",
        "description": "Modèles de documents personnalisés, statistiques et exports.",
        "price": 25000,
        "currency": "XOF",
        "billing_period": "mensuel",
        "limits": {
          "max_users": 10,
          "max_products": 1000,
          "max_partners": 100,
          "max_orders_per_month": 1000
        },
        "features": [
          {
            "code": "modeles_documents",
            "label": "Modèles de documents personnalisés"
          },
          {
            "code": "statistiques",
            "label": "Statistiques"
          }
        ]
      }
    ]
  }
}
```

</details>

---

## 4. Notifications

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
        "id": "6c689b58-bdea-419b-aab3-e3676edb2119",
        "type": "nouveau_bon_commande",
        "title": "Nouveau bon de commande",
        "body": "Société 3cffa8 vous a envoyé le bon de commande BC-2026-00001 (187 000 FCFA).",
        "data": {
          "number": "BC-2026-00001",
          "order_id": "060e5b0b-1125-43ce-afba-6bf744ea390b"
        },
        "read_at": null,
        "created_at": "2026-10-21T11:15:42.552Z"
      },
      {
        "id": "3e234eb7-8b2f-44c8-846e-ac11674e44d4",
        "type": "partenariat",
        "title": "Demande de partenariat",
        "body": "Société 3cffa8 souhaite vous ajouter comme fournisseur.",
        "data": {
          "partnership_id": "9ac9a794-3993-4b50-b7f6-3d87564acc61"
        },
        "read_at": null,
        "created_at": "2026-10-21T11:15:42.219Z"
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
      "id": "6c689b58-bdea-419b-aab3-e3676edb2119",
      "type": "nouveau_bon_commande",
      "title": "Nouveau bon de commande",
      "body": "Société 3cffa8 vous a envoyé le bon de commande BC-2026-00001 (187 000 FCFA).",
      "data": {
        "number": "BC-2026-00001",
        "order_id": "060e5b0b-1125-43ce-afba-6bf744ea390b"
      },
      "read_at": "2026-10-21T11:15:42.694Z",
      "created_at": "2026-10-21T11:15:42.552Z"
    }
  }
}
```

</details>

**Erreurs observées :** 404 `RESSOURCE_INTROUVABLE` · 422 `DONNEES_INVALIDES`.

---

## 5. Synchronisation temps réel (web / mobile)

| Méthode | Chemin | Accès |
|---|---|---|
| POST | `/api/v1/evenements/ticket` | tout compte connecté |
| GET | `/api/v1/evenements/flux` | route publique (aucun jeton) |

#### `POST /api/v1/evenements/ticket`

§ 23 — synchronisation web / mobile en temps réel (Server-Sent Events).

- **Accès :** tout compte connecté
- **Format :** `application/json`

**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `ticket`, `expires_in`, `url`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "ticket": "<jwt>",
    "expires_in": 60,
    "url": "/api/v1/evenements/flux?ticket=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NThlMWY5My03YWFmLTRlYTItOGZkYy1hODY0YjM4Zjk1MGQiLCJ0eXAiOiJmbHV4IiwidHYiOjAsImlhdCI6MTc5MjU4MTM0MywiZXhwIjoxNzkyNTgxNDAzfQ.O4AtTJXs6IfKW1NFgveL8aVjV0d_kFNOypoNgkknlk8"
  }
}
```

</details>

**Erreurs observées :** 401 `TOKEN_MANQUANT`.

---

#### `GET /api/v1/evenements/flux`

Authentifié par le ticket (un EventSource ne porte pas d'en-tête Authorization).

- **Accès :** route publique (aucun jeton)
- **Format :** aucun corps

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `ticket` | string | **oui** | max 2048 car. |


**Réponse :** enveloppe standard `{ success, message, data }` (pas d’exemple capturé pour cette route).

**Erreurs observées :** 401 `TICKET_INVALIDE` · 422 `DONNEES_INVALIDES`.

---

## 6. Tableau de bord

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/tableau-de-bord` | membre d’une entreprise active |

#### `GET /api/v1/tableau-de-bord`

§ 18 / § 19 — tableau de bord acheteur et/ou fournisseur (selon le profil de l'entreprise).

- **Accès :** membre d’une entreprise active — permission `dashboard.lire`
- **Format :** aucun corps

**Réponse 200 :** `data` contient `dashboard`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "dashboard": {
      "company": {
        "id": "98f429ff-4579-4a0b-afc2-d09f49016a02",
        "name": "Société 6bfa6d",
        "type": "fournisseur"
      },
      "buyer": null,
      "supplier": {
        "orders": {
          "new": 1,
          "to_process": 1,
          "awaiting_client": 0,
          "validated": 0,
          "in_preparation": 0,
          "ready": 0,
          "delivered_awaiting_reception": 1,
          "to_invoice": 0
        },
        "clients": 1,
        "partnership_requests": 0,
        "invoices_issued_this_month": {
          "count": 1,
          "amount": 187000
        },
        "payments_received_this_month": 0,
        "payments_to_confirm": 0,
        "receivables": 187000,
        "overdue": 0,
        "top_clients_owing": [
          {
            "partnership_id": "bed8854b-a170-447e-8094-5c2ac6de582f",
            "partnership_status": "actif",
            "partner": {
              "id": "a3daf555-9f25-4700-8fd8-2f9665ed7a7c",
              "name": "Société 31436c",
              "logo_url": null
            },
            "invoiced": 187000,
            "paid": 0,
            "balance": 187000,
            "open_amount": 187000,
            "overdue": 0,
            "declared_pending": 0,
            "open_invoices": 1,
            "paid_invoices": 0,
            "next_due_date": "2026-11-20",
            "last_payment_on": null
          }
        ],
        "sales": {
          "this_month": 374000,
          "previous_month": 0
        },
        "catalog": {
          "active_products": 2,
          "out_of_stock": 0
        }
      },
      "recent_activity": [
        {
          "id": 124,
          "type": "livraison",
          "from_status": "validee",
          "to_status": "livree",
          "message": null,
          "created_at": "2026-10-21T11:14:43.940Z",
          "actor_side": "fournisseur",
          "order_id": "765cd5f2-2799-444c-98e4-1b4f06c90dba",
          "number": "BC-2026-00003",
          "order_status": "livree",
          "actor_company": "Société 6bfa6d",
          "actor_name": "Awa Diop"
        },
        {
          "id": 123,
          "type": "acceptation",
          "from_status": "envoyee",
          "to_status": "validee",
          "message": null,
          "created_at": "2026-10-21T11:14:43.878Z",
          "actor_side": "fournisseur",
          "order_id": "765cd5f2-2799-444c-98e4-1b4f06c90dba",
          "number": "BC-2026-00003",
          "order_status": "livree",
          "actor_company": "Société 6bfa6d",
          "actor_name": "Awa Diop"
        }
      ],
      "generated_at": "2026-10-21T11:14:44.130Z",
      "unread_notifications": 5
    }
  }
}
```

</details>

---

## 7. Mon entreprise (profil, paramètres, logo)

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/entreprise` | membre d’une entreprise active |
| PATCH | `/api/v1/entreprise` | membre d’une entreprise active |
| PATCH | `/api/v1/entreprise/parametres` | membre d’une entreprise active |
| POST | `/api/v1/entreprise/logo` | membre d’une entreprise active |
| DELETE | `/api/v1/entreprise/logo` | membre d’une entreprise active |

#### `GET /api/v1/entreprise`

§ 6 — fiche de l'entreprise : lisible par tout membre, modifiable par l'administrateur.

- **Accès :** membre d’une entreprise active
- **Format :** aucun corps

**Réponse 200 :** `data` contient `company`, `settings`, `abonnement`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "company": {
      "id": "1e66e0ef-6185-4021-b036-a4c4d465dada",
      "name": "Société 86e274",
      "legal_name": null,
      "type": "fournisseur",
      "sector": "distribution",
      "description": null,
      "address": null,
      "city": "Dakar",
      "country": "SN",
      "phone": "+221776562448",
      "email": "admin.831df669a8@test.sn",
      "website": null,
      "ninea": "224468268",
      "rccm": null,
      "tax_regime": null,
      "vat_registered": true,
      "default_tax_rate": 18,
      "bank_details": null,
      "currency": "XOF",
      "logo_document_id": null,
      "is_listed": true,
      "status": "actif",
      "suspended_reason": null,
      "created_by": "6ce7b030-7629-4186-8c82-cf76b4a65a11",
      "created_at": "2026-10-21T11:14:58.391Z",
      "updated_at": "2026-10-21T11:14:58.391Z",
      "deleted_at": null,
      "logo": null
    },
    "settings": {
      "order_prefix": "BC",
      "invoice_prefix": "FAC",
      "default_payment_terms_days": 30,
      "auto_accept_partnerships": false,
      "invoice_reminder_days_before": 3,
      "default_order_conditions": null
    },
    "abonnement": {
      "abonnement": {
        "id": "4b610020-a176-41be-821a-b44e96da8135",
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

#### `PATCH /api/v1/entreprise`

- **Accès :** membre d’une entreprise active — permission `entreprise.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `name` | string | non | min 2 car. · max 150 car. |
| `legal_name` | string | non | `null` accepté · max 200 car. |
| `type` | string | non | valeurs : `acheteur`, `fournisseur`, `mixte` |
| `sector` | string | non | valeurs : `commerce`, `grande_surface`, `restaurant`, `hotel`, `distribution`, `grossiste`, `industrie`, `agroalimentaire`, `services`, `btp`, `sante`, `autre` |
| `description` | string | non | `null` accepté · max 2000 car. |
| `address` | string | non | `null` accepté · max 255 car. |
| `city` | string | non | `null` accepté · max 100 car. |
| `country` | string | non | exactement 2 car. |
| `phone` | string | non | `null` accepté · max 25 car. |
| `email` | string (email) | non | `null` accepté · max 254 car. |
| `website` | string | non | `null` accepté · max 255 car. |
| `ninea` | string | non | `null` accepté · format `/^[A-Z0-9 ]{5,30}$/` |
| `rccm` | string | non | `null` accepté · format `/^[A-Z0-9 ./-]{5,60}$/` |
| `tax_regime` | string | non | valeurs : `reel_normal`, `reel_simplifie`, `cgu`, `exonere` |
| `vat_registered` | boolean | non |  |
| `default_tax_rate` | number | non | ≥ 0 · ≤ 100 · 2 décimale(s) max |
| `bank_details` | string | non | `null` accepté · max 1000 car. |
| `is_listed` | boolean | non |  |


<details><summary>Exemple réel de requête</summary>

```json
{
  "rccm": "SN-DKR-2024-B-1234",
  "tax_regime": "reel_normal",
  "bank_details": "CBAO SN012 01001 00000000000 12",
  "address": "Km 4,5 Bd du Centenaire"
}
```

</details>

**Réponse 200 :** `data` contient `company`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Entreprise mise à jour",
  "data": {
    "company": {
      "id": "1e66e0ef-6185-4021-b036-a4c4d465dada",
      "name": "Société 86e274",
      "legal_name": null,
      "type": "fournisseur",
      "sector": "distribution",
      "description": null,
      "address": "Km 4,5 Bd du Centenaire",
      "city": "Dakar",
      "country": "SN",
      "phone": "+221776562448",
      "email": "admin.831df669a8@test.sn",
      "website": null,
      "ninea": "224468268",
      "rccm": "SN-DKR-2024-B-1234",
      "tax_regime": "reel_normal",
      "vat_registered": true,
      "default_tax_rate": 18,
      "bank_details": "CBAO SN012 01001 00000000000 12",
      "currency": "XOF",
      "logo_document_id": null,
      "is_listed": true,
      "settings": {},
      "status": "actif",
      "suspended_reason": null,
      "created_by": "6ce7b030-7629-4186-8c82-cf76b4a65a11",
      "created_at": "2026-10-21T11:14:58.391Z",
      "updated_at": "2026-10-21T11:14:58.481Z",
      "deleted_at": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `NINEA_UTILISE` · 409 `TYPE_ENTREPRISE_INCOMPATIBLE`.

---

#### `PATCH /api/v1/entreprise/parametres`

- **Accès :** membre d’une entreprise active — permission `entreprise.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `order_prefix` | string | non | format `/^[A-Z][A-Z0-9]{0,7}$/` |
| `invoice_prefix` | string | non | format `/^[A-Z][A-Z0-9]{0,7}$/` |
| `default_payment_terms_days` | integer | non | ≥ 0 · ≤ 365 |
| `auto_accept_partnerships` | boolean | non |  |
| `invoice_reminder_days_before` | integer | non | ≥ 0 · ≤ 60 |
| `default_order_conditions` | string | non | `null` accepté · max 2000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "invoice_prefix": "fv",
  "default_payment_terms_days": 45
}
```

</details>

**Réponse 200 :** `data` contient `settings`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Paramètres enregistrés",
  "data": {
    "settings": {
      "order_prefix": "BC",
      "invoice_prefix": "FV",
      "default_payment_terms_days": 45,
      "auto_accept_partnerships": false,
      "invoice_reminder_days_before": 3,
      "default_order_conditions": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/entreprise/logo`

- **Accès :** membre d’une entreprise active — permission `entreprise.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **Fichier :** champ `fichier` (**obligatoire**) — une image JPEG, PNG ou WebP

**Réponse 201 :** `data` contient `logo`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Logo enregistré",
  "data": {
    "logo": {
      "id": "ab9c490b-4756-4fda-b0e1-7106937eaa10",
      "company_id": "1e66e0ef-6185-4021-b036-a4c4d465dada",
      "category": "logo",
      "visibility": "public",
      "mime_type": "image/png",
      "size_bytes": 228,
      "original_name": "logo.png",
      "has_thumbnail": true,
      "created_at": "2026-10-21T11:14:58.585Z",
      "url": "/api/v1/documents/ab9c490b-4756-4fda-b0e1-7106937eaa10/fichier"
    }
  }
}
```

</details>

---

#### `DELETE /api/v1/entreprise/logo`

- **Accès :** membre d’une entreprise active — permission `entreprise.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** aucun corps

**Réponse 200 :** `data` vaut `null`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Logo supprimé",
  "data": null
}
```

</details>

---

## 8. Utilisateurs internes et rôles

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/utilisateurs` | membre d’une entreprise active |
| GET | `/api/v1/utilisateurs/invitations` | membre d’une entreprise active |
| POST | `/api/v1/utilisateurs/invitations` | membre d’une entreprise active |
| POST | `/api/v1/utilisateurs/invitations/:id/renvoyer` | membre d’une entreprise active |
| DELETE | `/api/v1/utilisateurs/invitations/:id` | membre d’une entreprise active |
| GET | `/api/v1/utilisateurs/:id` | membre d’une entreprise active |
| PATCH | `/api/v1/utilisateurs/:id` | membre d’une entreprise active |
| POST | `/api/v1/utilisateurs/:id/desactiver` | membre d’une entreprise active |
| POST | `/api/v1/utilisateurs/:id/reactiver` | membre d’une entreprise active |

#### `GET /api/v1/utilisateurs`

- **Accès :** membre d’une entreprise active — permission `utilisateurs.gerer`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `q` | string | non | max 100 car. |
| `role` | string | non | valeurs : `administrateur`, `responsable_achats`, `responsable_commandes`, `comptable`, `receptionnaire`, `commercial` |
| `status` | string | non | valeurs : `actif`, `inactif` |
| `tri` | string | non | valeurs : `created_at`, `-created_at`, `nom`, `-nom` |


**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `user_id`, `role_code`, `status`, `invited_by`, `created_at`, `updated_at`, `user`, `role_label`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "54ab8278-b139-42a2-8952-bddc406a6c67",
        "company_id": "c9084d68-d1a4-45d5-940e-a835c99d30b9",
        "user_id": "79ef3221-7a7b-4d10-a4e8-a5bb71a35caf",
        "role_code": "administrateur",
        "status": "actif",
        "invited_by": null,
        "created_at": "2026-10-21T11:14:56.818Z",
        "updated_at": "2026-10-21T11:14:56.818Z",
        "user": {
          "id": "79ef3221-7a7b-4d10-a4e8-a5bb71a35caf",
          "first_name": "Awa",
          "last_name": "Diop",
          "email": "admin.befee3e280@test.sn",
          "phone": "+221776562441",
          "job_title": null,
          "status": "actif",
          "last_login_at": "2026-10-21T11:14:56.844Z",
          "totp_enabled_at": null
        },
        "role_label": "Administrateur"
      },
      {
        "id": "c86516cb-0927-4e93-abe0-f7529623b7f9",
        "company_id": "c9084d68-d1a4-45d5-940e-a835c99d30b9",
        "user_id": "52c4eef0-0605-4bfa-9e29-0b3100365b7f",
        "role_code": "receptionnaire",
        "status": "actif",
        "invited_by": "79ef3221-7a7b-4d10-a4e8-a5bb71a35caf",
        "created_at": "2026-10-21T11:14:57.194Z",
        "updated_at": "2026-10-21T11:14:57.194Z",
        "user": {
          "id": "52c4eef0-0605-4bfa-9e29-0b3100365b7f",
          "first_name": "Moussa",
          "last_name": "Sow",
          "email": "receptionnaire.a9a730a5a3@test.sn",
          "phone": null,
          "job_title": null,
          "status": "actif",
          "last_login_at": "2026-10-21T11:14:57.211Z",
          "totp_enabled_at": null
        },
        "role_label": "Réceptionnaire"
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

**Erreurs observées :** 403 `PERMISSION_REFUSEE`.

---

#### `GET /api/v1/utilisateurs/invitations`

- **Accès :** membre d’une entreprise active — permission `utilisateurs.gerer`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `status` | string | non | valeurs : `en_attente`, `acceptee`, `revoquee`, `expiree` |


Exemple de query string réelle : `?status=revoquee`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `email`, `phone`, `first_name`, `last_name`, `job_title`, `role_code`, `expires_at`, `attempts`, `used_at`, `revoked_at`, `created_by`, `created_at`, `status`, `role_label`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "95801819-a290-4256-91f3-ad5137ab0ff8",
        "company_id": "5b5192f1-e927-4a67-b3be-8d78e93659d5",
        "email": "invite.fc019b72d0@test.sn",
        "phone": "+221776562436",
        "first_name": "Ibou",
        "last_name": "Fall",
        "job_title": null,
        "role_code": "commercial",
        "expires_at": "2026-10-28T11:14:55.148Z",
        "attempts": 1,
        "used_at": null,
        "revoked_at": "2026-10-21T11:14:55.196Z",
        "created_by": "1d0dc730-f815-45c2-a9cc-ecd13d3c6784",
        "created_at": "2026-10-21T11:14:55.149Z",
        "status": "revoquee",
        "role_label": "Commercial"
      },
      {
        "id": "f339b143-6b2f-4104-b461-9da1955e979a",
        "company_id": "5b5192f1-e927-4a67-b3be-8d78e93659d5",
        "email": "invite.fc019b72d0@test.sn",
        "phone": "+221776562436",
        "first_name": "Ibou",
        "last_name": "Fall",
        "job_title": null,
        "role_code": "commercial",
        "expires_at": "2026-10-28T11:14:55.085Z",
        "attempts": 1,
        "used_at": null,
        "revoked_at": "2026-10-21T11:14:55.145Z",
        "created_by": "1d0dc730-f815-45c2-a9cc-ecd13d3c6784",
        "created_at": "2026-10-21T11:14:55.086Z",
        "status": "revoquee",
        "role_label": "Commercial"
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

#### `POST /api/v1/utilisateurs/invitations`

- **Accès :** membre d’une entreprise active — permission `utilisateurs.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `email` | string (email) | **oui** | max 254 car. |
| `first_name` | string | **oui** | min 1 car. · max 80 car. |
| `last_name` | string | **oui** | min 1 car. · max 80 car. |
| `phone` | string | non | `null` accepté · max 25 car. |
| `job_title` | string | non | `null` accepté · max 100 car. |
| `role_code` | string | **oui** | valeurs : `administrateur`, `responsable_achats`, `responsable_commandes`, `comptable`, `receptionnaire`, `commercial` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "email": "receptionnaire.23210290b1@test.sn",
  "first_name": "Moussa",
  "last_name": "Sow",
  "role_code": "receptionnaire"
}
```

</details>

**Réponse 201 :** `data` contient `invitation`, `code`, `expires_in_days`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Invitation envoyée",
  "data": {
    "invitation": {
      "id": "ebbc32c7-9ca1-48df-84e3-c1073c644926",
      "attempts": 0,
      "company_id": "3906bc80-f140-4b48-b1fc-e31f53cd8daa",
      "email": "receptionnaire.23210290b1@test.sn",
      "phone": null,
      "first_name": "Moussa",
      "last_name": "Sow",
      "job_title": null,
      "role_code": "receptionnaire",
      "expires_at": "2026-10-28T11:14:55.930Z",
      "created_by": "cb874300-a182-4b6c-b1dd-03551b528724",
      "created_at": "2026-10-21T11:14:55.930Z",
      "used_at": null,
      "revoked_at": null,
      "status": "en_attente",
      "role_label": "Réceptionnaire"
    },
    "code": "76256818",
    "expires_in_days": 7
  }
}
```

</details>

**Erreurs observées :** 403 `LIMITE_ABONNEMENT` · 409 `COMPTE_DEJA_RATTACHE` · 409 `DEJA_MEMBRE`.

---

#### `POST /api/v1/utilisateurs/invitations/:id/renvoyer`

- **Accès :** membre d’une entreprise active — permission `utilisateurs.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 201 :** `data` contient `invitation`, `code`, `expires_in_days`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Invitation renvoyée",
  "data": {
    "invitation": {
      "id": "95801819-a290-4256-91f3-ad5137ab0ff8",
      "attempts": 0,
      "company_id": "5b5192f1-e927-4a67-b3be-8d78e93659d5",
      "email": "invite.fc019b72d0@test.sn",
      "phone": "+221776562436",
      "first_name": "Ibou",
      "last_name": "Fall",
      "job_title": null,
      "role_code": "commercial",
      "expires_at": "2026-10-28T11:14:55.148Z",
      "created_by": "1d0dc730-f815-45c2-a9cc-ecd13d3c6784",
      "created_at": "2026-10-21T11:14:55.149Z",
      "used_at": null,
      "revoked_at": null,
      "status": "en_attente",
      "role_label": "Commercial"
    },
    "code": "29592581",
    "expires_in_days": 7
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `DELETE /api/v1/utilisateurs/invitations/:id`

- **Accès :** membre d’une entreprise active — permission `utilisateurs.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
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
  "message": "Invitation annulée",
  "data": null
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/utilisateurs/:id`

- **Accès :** membre d’une entreprise active — permission `utilisateurs.gerer`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `member`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "member": {
      "id": "b0a7ab5f-b30e-4ab8-9140-21bbe3209787",
      "company_id": "534ffb8b-5ec3-4784-8aca-6a8661d1a723",
      "user_id": "4dc96fa2-ede3-4edb-88d9-9c59134c07fa",
      "role_code": "receptionnaire",
      "status": "actif",
      "invited_by": "f2bed9f6-4bb5-4c67-9e2b-77da3754ef93",
      "created_at": "2026-10-21T11:17:42.994Z",
      "updated_at": "2026-10-21T11:17:42.994Z",
      "user": {
        "id": "4dc96fa2-ede3-4edb-88d9-9c59134c07fa",
        "first_name": "Moussa",
        "last_name": "Sow",
        "email": "receptionnaire.c8067acc54@test.sn",
        "phone": null,
        "job_title": null,
        "status": "actif",
        "last_login_at": "2026-10-21T11:17:43.010Z",
        "totp_enabled_at": null
      },
      "role_label": "Réceptionnaire"
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 422 `DONNEES_INVALIDES`.

---

#### `PATCH /api/v1/utilisateurs/:id`

- **Accès :** membre d’une entreprise active — permission `utilisateurs.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `role_code` | string | **oui** | valeurs : `administrateur`, `responsable_achats`, `responsable_commandes`, `comptable`, `receptionnaire`, `commercial` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "role_code": "responsable_achats"
}
```

</details>

**Réponse 200 :** `data` contient `member`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Rôle modifié",
  "data": {
    "member": {
      "id": "c86516cb-0927-4e93-abe0-f7529623b7f9",
      "company_id": "c9084d68-d1a4-45d5-940e-a835c99d30b9",
      "user_id": "52c4eef0-0605-4bfa-9e29-0b3100365b7f",
      "role_code": "responsable_achats",
      "status": "actif",
      "invited_by": "79ef3221-7a7b-4d10-a4e8-a5bb71a35caf",
      "created_at": "2026-10-21T11:14:57.194Z",
      "updated_at": "2026-10-21T11:14:57.363Z",
      "user": {
        "id": "52c4eef0-0605-4bfa-9e29-0b3100365b7f",
        "first_name": "Moussa",
        "last_name": "Sow",
        "email": "receptionnaire.a9a730a5a3@test.sn",
        "phone": null,
        "job_title": null,
        "status": "actif",
        "last_login_at": "2026-10-21T11:14:57.211Z",
        "totp_enabled_at": null
      },
      "role_label": "Responsable achats"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `DERNIER_ADMINISTRATEUR` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/utilisateurs/:id/desactiver`

- **Accès :** membre d’une entreprise active — permission `utilisateurs.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `reason` | string | **oui** | min 3 car. · max 500 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reason": "Départ"
}
```

</details>

**Réponse 200 :** `data` contient `member`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Utilisateur désactivé",
  "data": {
    "member": {
      "id": "09613ecb-7d56-4bf3-8991-01bdfe997a4a",
      "company_id": "b010fd91-6321-49ea-8029-7bcaf9f427df",
      "user_id": "31c15552-a381-469b-be72-c2666aa9c3e1",
      "role_code": "comptable",
      "status": "inactif",
      "invited_by": "d90bbe21-1108-4d06-8fd8-f8e20d33f249",
      "created_at": "2026-10-21T11:14:57.668Z",
      "updated_at": "2026-10-21T11:14:57.759Z",
      "user": {
        "id": "31c15552-a381-469b-be72-c2666aa9c3e1",
        "first_name": "Moussa",
        "last_name": "Sow",
        "email": "comptable.5dc8ba803e@test.sn",
        "phone": null,
        "job_title": null,
        "status": "actif",
        "last_login_at": "2026-10-21T11:14:57.708Z",
        "totp_enabled_at": null
      },
      "role_label": "Comptable"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `ACTION_SUR_SOI_INTERDITE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/utilisateurs/:id/reactiver`

- **Accès :** membre d’une entreprise active — permission `utilisateurs.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `member`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Utilisateur réactivé",
  "data": {
    "member": {
      "id": "09613ecb-7d56-4bf3-8991-01bdfe997a4a",
      "company_id": "b010fd91-6321-49ea-8029-7bcaf9f427df",
      "user_id": "31c15552-a381-469b-be72-c2666aa9c3e1",
      "role_code": "comptable",
      "status": "actif",
      "invited_by": "d90bbe21-1108-4d06-8fd8-f8e20d33f249",
      "created_at": "2026-10-21T11:14:57.668Z",
      "updated_at": "2026-10-21T11:14:57.819Z",
      "user": {
        "id": "31c15552-a381-469b-be72-c2666aa9c3e1",
        "first_name": "Moussa",
        "last_name": "Sow",
        "email": "comptable.5dc8ba803e@test.sn",
        "phone": null,
        "job_title": null,
        "status": "actif",
        "last_login_at": "2026-10-21T11:14:57.708Z",
        "totp_enabled_at": null
      },
      "role_label": "Comptable"
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 9. Annuaire des entreprises

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/annuaire` | membre d’une entreprise active |
| GET | `/api/v1/annuaire/:id` | membre d’une entreprise active |

#### `GET /api/v1/annuaire`

§ 7 — rechercher un fournisseur (ou un client) parmi les entreprises inscrites, consulter son profil.

- **Accès :** membre d’une entreprise active — permission `partenaires.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `q` | string | non | max 100 car. |
| `type` | string | non | valeurs : `fournisseur`, `acheteur` |
| `sector` | string | non | valeurs : `commerce`, `grande_surface`, `restaurant`, `hotel`, `distribution`, `grossiste`, `industrie`, `agroalimentaire`, `services`, `btp`, `sante`, `autre` |
| `city` | string | non | max 100 car. |
| `tri` | string | non | valeurs : `name`, `-name`, `city`, `-city`, `created_at`, `-created_at` |


Exemple de query string réelle : `?type=fournisseur&q=Grossiste%20Thi%C3%A8s%201792581305146`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `name`, `legal_name`, `type`, `sector`, `description`, `address`, `city`, `country`, `phone`, `email`, `website`, `ninea`, `rccm`, `logo_document_id`, `created_at`, `products_count`, `logo_url`, `my_relation`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "8a0109da-7ba9-4b4e-ab0b-d09c26084bf0",
        "name": "Grossiste Thiès 1792581305146",
        "legal_name": null,
        "type": "fournisseur",
        "sector": "distribution",
        "description": null,
        "address": null,
        "city": "Thiès",
        "country": "SN",
        "phone": "+221776562458",
        "email": "admin.364ebb0978@test.sn",
        "website": null,
        "ninea": "446089274",
        "rccm": null,
        "logo_document_id": null,
        "created_at": "2026-10-21T11:15:05.170Z",
        "products_count": 0,
        "logo_url": null,
        "my_relation": {
          "supplier": null,
          "client": null
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

#### `GET /api/v1/annuaire/:id`

- **Accès :** membre d’une entreprise active — permission `partenaires.lire`
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
      "id": "8a0109da-7ba9-4b4e-ab0b-d09c26084bf0",
      "name": "Grossiste Thiès 1792581305146",
      "legal_name": null,
      "type": "fournisseur",
      "sector": "distribution",
      "description": null,
      "address": null,
      "city": "Thiès",
      "country": "SN",
      "phone": "+221776562458",
      "email": "admin.364ebb0978@test.sn",
      "website": null,
      "ninea": "446089274",
      "rccm": null,
      "logo_document_id": null,
      "created_at": "2026-10-21T11:15:05.170Z",
      "products_count": 0,
      "logo_url": null,
      "my_relation": {
        "supplier": {
          "id": "2c10f90b-a89e-473b-b8d4-01e5c9b3c7ad",
          "status": "actif"
        },
        "client": null
      }
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 10. Partenariats acheteur / fournisseur

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/partenariats` | membre d’une entreprise active |
| POST | `/api/v1/partenariats` | membre d’une entreprise active |
| GET | `/api/v1/partenariats/invitations` | membre d’une entreprise active |
| POST | `/api/v1/partenariats/invitations` | membre d’une entreprise active |
| DELETE | `/api/v1/partenariats/invitations/:id` | membre d’une entreprise active |
| GET | `/api/v1/partenariats/:id` | membre d’une entreprise active |
| PATCH | `/api/v1/partenariats/:id` | membre d’une entreprise active |
| POST | `/api/v1/partenariats/:id/accepter` | membre d’une entreprise active |
| POST | `/api/v1/partenariats/:id/refuser` | membre d’une entreprise active |
| POST | `/api/v1/partenariats/:id/suspendre` | membre d’une entreprise active |
| POST | `/api/v1/partenariats/:id/reactiver` | membre d’une entreprise active |
| GET | `/api/v1/partenariats/:id/releve` | membre d’une entreprise active |

#### `GET /api/v1/partenariats`

- **Accès :** membre d’une entreprise active — permission `partenaires.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `relation` | string | non | valeurs : `fournisseur`, `client` |
| `status` | string | non | valeurs : `en_attente`, `actif`, `refuse`, `suspendu` |
| `q` | string | non | max 100 car. |


Exemple de query string réelle : `?relation=fournisseur`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `status`, `relation`, `partner`, `buyer_company_id`, `supplier_company_id`, `requested_by_me`, `request_message`, `responded_at`, `payment_terms_days`, `supplier_customer_code`, `my_notes`, `suspended_by_me`, `suspended_reason`, `created_at`, `updated_at`, `stats`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "a378faa5-39ae-4e13-9d2a-ed2f5931f0e2",
        "status": "actif",
        "relation": "fournisseur",
        "partner": {
          "id": "c1cdd989-54c2-4438-94a6-cf824dc3f99a",
          "name": "Société dcd23b",
          "type": "fournisseur",
          "sector": "distribution",
          "city": "Dakar",
          "country": "SN",
          "phone": "+221776562451",
          "email": "admin.4409b20ba7@test.sn",
          "logo_document_id": null,
          "status": "actif",
          "ninea": "941971164",
          "logo_url": null
        },
        "buyer_company_id": "3d663eb5-2e34-4b98-b524-e3ea7903e36c",
        "supplier_company_id": "c1cdd989-54c2-4438-94a6-cf824dc3f99a",
        "requested_by_me": true,
        "request_message": "Bonjour, nous souhaitons commander chez vous",
        "responded_at": "2026-10-21T11:15:03.685Z",
        "payment_terms_days": 60,
        "supplier_customer_code": "CL-0042",
        "my_notes": "Livre vite, prix corrects",
        "suspended_by_me": null,
        "suspended_reason": null,
        "created_at": "2026-10-21T11:15:03.507Z",
        "updated_at": "2026-10-21T11:15:03.789Z",
        "stats": {
          "orders_in_progress": 0,
          "invoiced_total": 0,
          "paid_total": 0,
          "balance": 0,
          "overdue_total": 0
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

#### `POST /api/v1/partenariats`

- **Accès :** membre d’une entreprise active — permission `partenaires.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `company_id` | string (uuid) | **oui** |  |
| `relation` | string | **oui** | valeurs : `fournisseur`, `client` |
| `message` | string | non | `null` accepté · max 1000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "company_id": "c1cdd989-54c2-4438-94a6-cf824dc3f99a",
  "relation": "fournisseur",
  "message": "Bonjour, nous souhaitons commander chez vous"
}
```

</details>

**Réponse 201 :** `data` contient `partnership`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Demande de partenariat envoyée",
  "data": {
    "partnership": {
      "id": "a378faa5-39ae-4e13-9d2a-ed2f5931f0e2",
      "status": "en_attente",
      "relation": "fournisseur",
      "partner": {
        "id": "c1cdd989-54c2-4438-94a6-cf824dc3f99a",
        "name": "Société dcd23b",
        "type": "fournisseur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221776562451",
        "email": "admin.4409b20ba7@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "941971164",
        "logo_url": null
      },
      "buyer_company_id": "3d663eb5-2e34-4b98-b524-e3ea7903e36c",
      "supplier_company_id": "c1cdd989-54c2-4438-94a6-cf824dc3f99a",
      "requested_by_me": true,
      "request_message": "Bonjour, nous souhaitons commander chez vous",
      "responded_at": null,
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "my_notes": null,
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T11:15:03.507Z",
      "updated_at": "2026-10-21T11:15:03.507Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "balance": 0,
        "overdue_total": 0
      }
    }
  }
}
```

</details>

**Erreurs observées :** 409 `DEMANDE_EN_COURS` · 422 `PARTENAIRE_INVALIDE` · 422 `PROFIL_ENTREPRISE_INCOMPATIBLE`.

---

#### `GET /api/v1/partenariats/invitations`

Invitation d'une entreprise qui n'est pas encore sur Pro2Link (lien d'inscription par e-mail).

- **Accès :** membre d’une entreprise active — permission `partenaires.gerer`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `status` | string | non | valeurs : `en_attente`, `acceptee`, `expiree`, `annulee` |


**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `relation`, `email`, `company_name`, `contact_name`, `message`, `status`, `expires_at`, `accepted_company_id`, `accepted_at`, `created_by`, `created_at`, `updated_at`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "4c1df979-dbb5-4f67-a2db-0dbaf5071013",
        "company_id": "0d877fa4-a769-4d1a-a6c7-132e8934c3a9",
        "relation": "fournisseur",
        "email": "nouveau-fournisseur.461ef29de4@test.sn",
        "company_name": "Laiterie du Fleuve",
        "contact_name": null,
        "message": "Rejoignez-nous",
        "status": "acceptee",
        "expires_at": "2026-11-20T11:15:08.811Z",
        "accepted_company_id": "9bec126f-955a-4ef6-b850-59349b6f4cf2",
        "accepted_at": "2026-10-21T11:15:08.890Z",
        "created_by": "6337c9da-40ac-40e7-b722-66a28294cde3",
        "created_at": "2026-10-21T11:15:08.811Z",
        "updated_at": "2026-10-21T11:15:08.891Z"
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

#### `POST /api/v1/partenariats/invitations`

- **Accès :** membre d’une entreprise active — permission `partenaires.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `email` | string (email) | **oui** | max 254 car. |
| `relation` | string | **oui** | valeurs : `fournisseur`, `client` |
| `company_name` | string | non | `null` accepté · max 150 car. |
| `contact_name` | string | non | `null` accepté · max 160 car. |
| `message` | string | non | `null` accepté · max 1000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "email": "nouveau-fournisseur.461ef29de4@test.sn",
  "relation": "fournisseur",
  "company_name": "Laiterie du Fleuve",
  "message": "Rejoignez-nous"
}
```

</details>

**Réponse 201 :** `data` contient `invitation`, `token`, `expires_in_days`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Invitation envoyée",
  "data": {
    "invitation": {
      "id": "4c1df979-dbb5-4f67-a2db-0dbaf5071013",
      "status": "en_attente",
      "company_id": "0d877fa4-a769-4d1a-a6c7-132e8934c3a9",
      "relation": "fournisseur",
      "email": "nouveau-fournisseur.461ef29de4@test.sn",
      "company_name": "Laiterie du Fleuve",
      "contact_name": null,
      "message": "Rejoignez-nous",
      "expires_at": "2026-11-20T11:15:08.811Z",
      "created_by": "6337c9da-40ac-40e7-b722-66a28294cde3",
      "updated_at": "2026-10-21T11:15:08.811Z",
      "created_at": "2026-10-21T11:15:08.811Z",
      "accepted_company_id": null,
      "accepted_at": null
    },
    "token": "<masqué>",
    "expires_in_days": 30
  }
}
```

</details>

**Erreurs observées :** 409 `ENTREPRISE_DEJA_INSCRITE`.

---

#### `DELETE /api/v1/partenariats/invitations/:id`

- **Accès :** membre d’une entreprise active — permission `partenaires.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
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
  "message": "Invitation annulée",
  "data": null
}
```

</details>

**Erreurs observées :** 409 `INVITATION_CLOSE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/partenariats/:id`

- **Accès :** membre d’une entreprise active — permission `partenaires.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `partnership`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "partnership": {
      "id": "a378faa5-39ae-4e13-9d2a-ed2f5931f0e2",
      "status": "actif",
      "relation": "fournisseur",
      "partner": {
        "id": "c1cdd989-54c2-4438-94a6-cf824dc3f99a",
        "name": "Société dcd23b",
        "type": "fournisseur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221776562451",
        "email": "admin.4409b20ba7@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "941971164",
        "logo_url": null
      },
      "buyer_company_id": "3d663eb5-2e34-4b98-b524-e3ea7903e36c",
      "supplier_company_id": "c1cdd989-54c2-4438-94a6-cf824dc3f99a",
      "requested_by_me": true,
      "request_message": "Bonjour, nous souhaitons commander chez vous",
      "responded_at": "2026-10-21T11:15:03.685Z",
      "payment_terms_days": 60,
      "supplier_customer_code": "CL-0042",
      "my_notes": "Livre vite, prix corrects",
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T11:15:03.507Z",
      "updated_at": "2026-10-21T11:15:03.789Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "balance": 0,
        "overdue_total": 0
      }
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 422 `DONNEES_INVALIDES`.

---

#### `PATCH /api/v1/partenariats/:id`

- **Accès :** membre d’une entreprise active — permission `partenaires.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `notes` | string | non | `null` accepté · max 5000 car. |
| `payment_terms_days` | integer | non | ≥ 0 · ≤ 365 |
| `supplier_customer_code` | string | non | `null` accepté · max 40 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "notes": "Livre vite, prix corrects"
}
```

</details>

**Réponse 200 :** `data` contient `partnership`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Partenariat mis à jour",
  "data": {
    "partnership": {
      "id": "a378faa5-39ae-4e13-9d2a-ed2f5931f0e2",
      "status": "actif",
      "relation": "fournisseur",
      "partner": {
        "id": "c1cdd989-54c2-4438-94a6-cf824dc3f99a",
        "name": "Société dcd23b",
        "type": "fournisseur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221776562451",
        "email": "admin.4409b20ba7@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "941971164",
        "logo_url": null
      },
      "buyer_company_id": "3d663eb5-2e34-4b98-b524-e3ea7903e36c",
      "supplier_company_id": "c1cdd989-54c2-4438-94a6-cf824dc3f99a",
      "requested_by_me": true,
      "request_message": "Bonjour, nous souhaitons commander chez vous",
      "responded_at": "2026-10-21T11:15:03.685Z",
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "my_notes": "Livre vite, prix corrects",
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T11:15:03.507Z",
      "updated_at": "2026-10-21T11:15:03.749Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "balance": 0,
        "overdue_total": 0
      }
    }
  }
}
```

</details>

**Erreurs observées :** 403 `CHAMP_RESERVE_FOURNISSEUR` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/partenariats/:id/accepter`

- **Accès :** membre d’une entreprise active — permission `partenaires.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `partnership`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Partenariat accepté",
  "data": {
    "partnership": {
      "id": "a378faa5-39ae-4e13-9d2a-ed2f5931f0e2",
      "status": "actif",
      "relation": "client",
      "partner": {
        "id": "3d663eb5-2e34-4b98-b524-e3ea7903e36c",
        "name": "Société ac9b76",
        "type": "acheteur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221776562450",
        "email": "admin.755ba6c38b@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "379873133",
        "logo_url": null
      },
      "buyer_company_id": "3d663eb5-2e34-4b98-b524-e3ea7903e36c",
      "supplier_company_id": "c1cdd989-54c2-4438-94a6-cf824dc3f99a",
      "requested_by_me": false,
      "request_message": "Bonjour, nous souhaitons commander chez vous",
      "responded_at": "2026-10-21T11:15:03.685Z",
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "my_notes": null,
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T11:15:03.507Z",
      "updated_at": "2026-10-21T11:15:03.695Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "balance": 0,
        "overdue_total": 0
      }
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACTION_RESERVEE_AUTRE_PARTIE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/partenariats/:id/refuser`

- **Accès :** membre d’une entreprise active — permission `partenaires.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `reason` | string | non | `null` accepté · max 1000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reason": "Zone non desservie"
}
```

</details>

**Réponse 200 :** `data` contient `partnership`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Demande refusée",
  "data": {
    "partnership": {
      "id": "c861b597-6f04-4a2d-974c-1e409a12c17f",
      "status": "refuse",
      "relation": "client",
      "partner": {
        "id": "8bd3572d-bff2-4b94-ae77-042eb61a7deb",
        "name": "Société 48d2c5",
        "type": "acheteur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221776562454",
        "email": "admin.7a8851da23@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "748143353",
        "logo_url": null
      },
      "buyer_company_id": "8bd3572d-bff2-4b94-ae77-042eb61a7deb",
      "supplier_company_id": "558e9039-d450-498f-8697-95fb4113ee00",
      "requested_by_me": false,
      "request_message": null,
      "responded_at": "2026-10-21T11:15:04.835Z",
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "my_notes": null,
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T11:15:04.783Z",
      "updated_at": "2026-10-21T11:15:04.839Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "balance": 0,
        "overdue_total": 0
      }
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/partenariats/:id/suspendre`

- **Accès :** membre d’une entreprise active — permission `partenaires.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
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
  "reason": "Impayés"
}
```

</details>

**Réponse 200 :** `data` contient `partnership`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Partenariat suspendu",
  "data": {
    "partnership": {
      "id": "16b55f84-d485-4bac-836e-60fc0074da67",
      "status": "suspendu",
      "relation": "client",
      "partner": {
        "id": "7184ad92-5bb5-49e7-923a-ebbc2099367a",
        "name": "Société d88f34",
        "type": "acheteur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221776562452",
        "email": "admin.983a20ec4d@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "106707695",
        "logo_url": null
      },
      "buyer_company_id": "7184ad92-5bb5-49e7-923a-ebbc2099367a",
      "supplier_company_id": "9c44068d-17f8-4de1-85fc-a9019bfae65c",
      "requested_by_me": false,
      "request_message": null,
      "responded_at": "2026-10-21T11:15:04.213Z",
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "my_notes": null,
      "suspended_by_me": true,
      "suspended_reason": "Impayés",
      "created_at": "2026-10-21T11:15:04.163Z",
      "updated_at": "2026-10-21T11:15:04.375Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "balance": 0,
        "overdue_total": 0
      }
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/partenariats/:id/reactiver`

- **Accès :** membre d’une entreprise active — permission `partenaires.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `partnership`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Partenariat réactivé",
  "data": {
    "partnership": {
      "id": "16b55f84-d485-4bac-836e-60fc0074da67",
      "status": "actif",
      "relation": "client",
      "partner": {
        "id": "7184ad92-5bb5-49e7-923a-ebbc2099367a",
        "name": "Société d88f34",
        "type": "acheteur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221776562452",
        "email": "admin.983a20ec4d@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "106707695",
        "logo_url": null
      },
      "buyer_company_id": "7184ad92-5bb5-49e7-923a-ebbc2099367a",
      "supplier_company_id": "9c44068d-17f8-4de1-85fc-a9019bfae65c",
      "requested_by_me": false,
      "request_message": null,
      "responded_at": "2026-10-21T11:15:04.213Z",
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "my_notes": null,
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T11:15:04.163Z",
      "updated_at": "2026-10-21T11:15:04.492Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "balance": 0,
        "overdue_total": 0
      }
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACTION_RESERVEE_AUTRE_PARTIE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/partenariats/:id/releve`

§ 16 — relevé de compte : factures et paiements, solde progressif.

- **Accès :** membre d’une entreprise active — permission `factures.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |


**Réponse 200 :** `data` contient `statement`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "statement": {
      "partnership_id": "5bf16e8b-b0ad-4459-a247-90bf797f4ddf",
      "side": "acheteur",
      "buyer": {
        "id": "b571272e-b40d-4923-b03d-8cd86d236397",
        "name": "Société 11b286"
      },
      "supplier": {
        "id": "10665ca6-e973-4d92-abad-6b1ce8f761b9",
        "name": "Société 2be338"
      },
      "period": {
        "start": null,
        "end": "2026-10-21"
      },
      "opening_balance": 0,
      "closing_balance": 187000,
      "total_debit": 374000,
      "total_credit": 187000,
      "lines": [
        {
          "type": "facture",
          "id": "9a3e6d22-2fee-47ac-80ea-284d14490ecb",
          "reference": "FAC-2026-00001",
          "date": "2026-10-21",
          "debit": 187000,
          "credit": 0,
          "balance": 187000,
          "status": "payee",
          "due_date": "2026-11-20"
        },
        {
          "type": "facture",
          "id": "2aea1f9a-2277-495a-95d1-ab0543223171",
          "reference": "FAC-2026-00002",
          "date": "2026-10-21",
          "debit": 187000,
          "credit": 0,
          "balance": 374000,
          "status": "emise",
          "due_date": "2026-11-20"
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 422 `DONNEES_INVALIDES`.

---

## 11. Catalogue — produits

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/produits` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/produits` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/produits/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| PATCH | `/api/v1/produits/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| PATCH | `/api/v1/produits/:id/prix` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| PATCH | `/api/v1/produits/:id/disponibilite` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/produits/:id/activer` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/produits/:id/desactiver` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/produits/:id/photo` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| DELETE | `/api/v1/produits/:id/photo` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| DELETE | `/api/v1/produits/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |

#### `GET /api/v1/produits`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `catalogue.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `q` | string | non | max 100 car. |
| `category_id` | string (uuid) | non |  |
| `availability` | string | non | valeurs : `disponible`, `stock_limite`, `sur_commande`, `rupture` |
| `tri` | string | non | valeurs : `name`, `-name`, `reference`, `-reference`, `price`, `-price`, `created_at`, `-created_at`, `updated_at`, `-updated_at` |
| `is_active` | boolean | non |  |


Exemple de query string réelle : `?is_active=false`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `category_id`, `reference`, `name`, `description`, `unit`, `packaging`, `price`, `tax_rate`, `availability`, `stock_quantity`, `min_order_quantity`, `is_active`, `photo_document_id`, `created_by`, `created_at`, `updated_at`, `deleted_at`, `category`, `photo_url`, `photo_thumbnail_url`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "35bc5d37-eb0d-4b51-8486-2e3c91740793",
        "company_id": "43da493f-cac7-4d08-9d77-e4a8f73c6549",
        "category_id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
        "reference": "RIZ-25",
        "name": "Riz brisé cf1d",
        "description": null,
        "unit": "sac",
        "packaging": "Sac de 25 kg",
        "price": 16500,
        "tax_rate": 18,
        "availability": "stock_limite",
        "stock_quantity": 12,
        "min_order_quantity": 1,
        "is_active": false,
        "photo_document_id": "657a190f-5c99-4466-82a2-5f1f368074ab",
        "created_by": "a76353b6-3873-480a-aa16-2a8c30ec6522",
        "created_at": "2026-10-21T11:15:07.794Z",
        "updated_at": "2026-10-21T11:15:08.131Z",
        "deleted_at": null,
        "category": {
          "id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
          "name": "Céréales"
        },
        "photo_url": "/api/v1/documents/657a190f-5c99-4466-82a2-5f1f368074ab/fichier",
        "photo_thumbnail_url": "/api/v1/documents/657a190f-5c99-4466-82a2-5f1f368074ab/fichier?taille=miniature"
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

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/produits`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `category_id` | string (uuid) | non | `null` accepté |
| `reference` | string | **oui** | min 1 car. · max 60 car. · format `/^[\w./ -]+$/u` |
| `name` | string | **oui** | min 1 car. · max 200 car. |
| `description` | string | non | `null` accepté · max 5000 car. |
| `unit` | string | **oui** | valeurs : `piece`, `carton`, `paquet`, `sac`, `boite`, `bouteille`, `douzaine`, `lot`, `palette`, `kg`, `g`, `tonne`, `litre`, `ml`, `metre`, `m2`, `m3`, `heure`, `forfait`, `autre` |
| `packaging` | string | non | `null` accepté · max 100 car. |
| `price` | integer | **oui** | ≥ 0 · ≤ 1000000000000 |
| `tax_rate` | number | non | ≥ 0 · ≤ 100 · 2 décimale(s) max |
| `availability` | string | non | valeurs : `disponible`, `stock_limite`, `sur_commande`, `rupture` |
| `stock_quantity` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max |
| `min_order_quantity` | number | non | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reference": "RIZ-25",
  "name": "Riz brisé cf1d",
  "unit": "sac",
  "price": 15000,
  "tax_rate": 18,
  "category_id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
  "packaging": "Sac de 25 kg"
}
```

</details>

**Réponse 201 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Produit ajouté",
  "data": {
    "product": {
      "id": "35bc5d37-eb0d-4b51-8486-2e3c91740793",
      "company_id": "43da493f-cac7-4d08-9d77-e4a8f73c6549",
      "category_id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
      "reference": "RIZ-25",
      "name": "Riz brisé cf1d",
      "description": null,
      "unit": "sac",
      "packaging": "Sac de 25 kg",
      "price": 15000,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "a76353b6-3873-480a-aa16-2a8c30ec6522",
      "created_at": "2026-10-21T11:15:07.794Z",
      "updated_at": "2026-10-21T11:15:07.794Z",
      "deleted_at": null,
      "category": {
        "id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
        "name": "Céréales"
      },
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `REFERENCE_UTILISEE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/produits/:id`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `catalogue.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "product": {
      "id": "54f974a7-40d2-4570-9ac5-afe3b387aecc",
      "company_id": "8886479a-0a4c-49cf-b13b-d619d048a4c5",
      "category_id": null,
      "reference": "REF-f51fff",
      "name": "Riz brisé 2aaa",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 15000,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "54629870-22f5-4230-b8cb-a803d185bad8",
      "created_at": "2026-10-21T11:14:49.058Z",
      "updated_at": "2026-10-21T11:14:49.058Z",
      "deleted_at": null,
      "category": null,
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `PATCH /api/v1/produits/:id`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `category_id` | string (uuid) | non | `null` accepté |
| `reference` | string | non | min 1 car. · max 60 car. · format `/^[\w./ -]+$/u` |
| `name` | string | non | min 1 car. · max 200 car. |
| `description` | string | non | `null` accepté · max 5000 car. |
| `unit` | string | non | valeurs : `piece`, `carton`, `paquet`, `sac`, `boite`, `bouteille`, `douzaine`, `lot`, `palette`, `kg`, `g`, `tonne`, `litre`, `ml`, `metre`, `m2`, `m3`, `heure`, `forfait`, `autre` |
| `packaging` | string | non | `null` accepté · max 100 car. |
| `price` | integer | non | ≥ 0 · ≤ 1000000000000 |
| `tax_rate` | number | non | ≥ 0 · ≤ 100 · 2 décimale(s) max |
| `availability` | string | non | valeurs : `disponible`, `stock_limite`, `sur_commande`, `rupture` |
| `stock_quantity` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max |
| `min_order_quantity` | number | non | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "name": "Nouveau nom",
  "price": 99999
}
```

</details>

**Réponse 200 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Produit modifié",
  "data": {
    "product": {
      "id": "878e4430-61a9-4fb3-8874-0bc419fd8812",
      "company_id": "c6f3f935-62b5-4c68-94ad-71fd009fb408",
      "category_id": null,
      "reference": "REF-dc9c4a",
      "name": "Nouveau nom",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 99999,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "4ce3c00b-6944-4d2e-ba1d-bc0685ef8297",
      "created_at": "2026-10-21T11:15:07.242Z",
      "updated_at": "2026-10-21T11:15:07.544Z",
      "deleted_at": null,
      "category": null,
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 422 `DONNEES_INVALIDES`.

---

#### `PATCH /api/v1/produits/:id/prix`

Raccourcis mobiles : « modifier son prix », « modifier sa disponibilité ».

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `price` | integer | **oui** | ≥ 0 · ≤ 1000000000000 |
| `tax_rate` | number | non | ≥ 0 · ≤ 100 · 2 décimale(s) max |


<details><summary>Exemple réel de requête</summary>

```json
{
  "price": 16500
}
```

</details>

**Réponse 200 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Produit modifié",
  "data": {
    "product": {
      "id": "35bc5d37-eb0d-4b51-8486-2e3c91740793",
      "company_id": "43da493f-cac7-4d08-9d77-e4a8f73c6549",
      "category_id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
      "reference": "RIZ-25",
      "name": "Riz brisé cf1d",
      "description": null,
      "unit": "sac",
      "packaging": "Sac de 25 kg",
      "price": 16500,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "a76353b6-3873-480a-aa16-2a8c30ec6522",
      "created_at": "2026-10-21T11:15:07.794Z",
      "updated_at": "2026-10-21T11:15:07.864Z",
      "deleted_at": null,
      "category": {
        "id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
        "name": "Céréales"
      },
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `PATCH /api/v1/produits/:id/disponibilite`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `availability` | string | **oui** | valeurs : `disponible`, `stock_limite`, `sur_commande`, `rupture` |
| `stock_quantity` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max |


<details><summary>Exemple réel de requête</summary>

```json
{
  "availability": "stock_limite",
  "stock_quantity": 12
}
```

</details>

**Réponse 200 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Produit modifié",
  "data": {
    "product": {
      "id": "35bc5d37-eb0d-4b51-8486-2e3c91740793",
      "company_id": "43da493f-cac7-4d08-9d77-e4a8f73c6549",
      "category_id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
      "reference": "RIZ-25",
      "name": "Riz brisé cf1d",
      "description": null,
      "unit": "sac",
      "packaging": "Sac de 25 kg",
      "price": 16500,
      "tax_rate": 18,
      "availability": "stock_limite",
      "stock_quantity": 12,
      "min_order_quantity": 1,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "a76353b6-3873-480a-aa16-2a8c30ec6522",
      "created_at": "2026-10-21T11:15:07.794Z",
      "updated_at": "2026-10-21T11:15:07.910Z",
      "deleted_at": null,
      "category": {
        "id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
        "name": "Céréales"
      },
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/produits/:id/activer`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Produit activé",
  "data": {
    "product": {
      "id": "54f974a7-40d2-4570-9ac5-afe3b387aecc",
      "company_id": "8886479a-0a4c-49cf-b13b-d619d048a4c5",
      "category_id": null,
      "reference": "REF-f51fff",
      "name": "Riz brisé 2aaa",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 15000,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "54629870-22f5-4230-b8cb-a803d185bad8",
      "created_at": "2026-10-21T11:14:49.058Z",
      "updated_at": "2026-10-21T11:14:49.431Z",
      "deleted_at": null,
      "category": null,
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/produits/:id/desactiver`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Produit désactivé",
  "data": {
    "product": {
      "id": "35bc5d37-eb0d-4b51-8486-2e3c91740793",
      "company_id": "43da493f-cac7-4d08-9d77-e4a8f73c6549",
      "category_id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
      "reference": "RIZ-25",
      "name": "Riz brisé cf1d",
      "description": null,
      "unit": "sac",
      "packaging": "Sac de 25 kg",
      "price": 16500,
      "tax_rate": 18,
      "availability": "stock_limite",
      "stock_quantity": 12,
      "min_order_quantity": 1,
      "is_active": false,
      "photo_document_id": "657a190f-5c99-4466-82a2-5f1f368074ab",
      "created_by": "a76353b6-3873-480a-aa16-2a8c30ec6522",
      "created_at": "2026-10-21T11:15:07.794Z",
      "updated_at": "2026-10-21T11:15:08.131Z",
      "deleted_at": null,
      "category": {
        "id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
        "name": "Céréales"
      },
      "photo_url": "/api/v1/documents/657a190f-5c99-4466-82a2-5f1f368074ab/fichier",
      "photo_thumbnail_url": "/api/v1/documents/657a190f-5c99-4466-82a2-5f1f368074ab/fichier?taille=miniature"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `STATUT_INCHANGE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/produits/:id/photo`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **Fichier :** champ `fichier` (**obligatoire**) — une image JPEG, PNG ou WebP

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 201 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Photo enregistrée",
  "data": {
    "product": {
      "id": "35bc5d37-eb0d-4b51-8486-2e3c91740793",
      "company_id": "43da493f-cac7-4d08-9d77-e4a8f73c6549",
      "category_id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
      "reference": "RIZ-25",
      "name": "Riz brisé cf1d",
      "description": null,
      "unit": "sac",
      "packaging": "Sac de 25 kg",
      "price": 16500,
      "tax_rate": 18,
      "availability": "stock_limite",
      "stock_quantity": 12,
      "min_order_quantity": 1,
      "is_active": true,
      "photo_document_id": "657a190f-5c99-4466-82a2-5f1f368074ab",
      "created_by": "a76353b6-3873-480a-aa16-2a8c30ec6522",
      "created_at": "2026-10-21T11:15:07.794Z",
      "updated_at": "2026-10-21T11:15:08.101Z",
      "deleted_at": null,
      "category": {
        "id": "ffe59a98-fd2b-4f94-a817-a3dbd5c73af0",
        "name": "Céréales"
      },
      "photo_url": "/api/v1/documents/657a190f-5c99-4466-82a2-5f1f368074ab/fichier",
      "photo_thumbnail_url": "/api/v1/documents/657a190f-5c99-4466-82a2-5f1f368074ab/fichier?taille=miniature"
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `DELETE /api/v1/produits/:id/photo`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Photo supprimée",
  "data": {
    "product": {
      "id": "54f974a7-40d2-4570-9ac5-afe3b387aecc",
      "company_id": "8886479a-0a4c-49cf-b13b-d619d048a4c5",
      "category_id": null,
      "reference": "REF-f51fff",
      "name": "Riz brisé 2aaa",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 15000,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "54629870-22f5-4230-b8cb-a803d185bad8",
      "created_at": "2026-10-21T11:14:49.058Z",
      "updated_at": "2026-10-21T11:14:49.336Z",
      "deleted_at": null,
      "category": null,
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `DELETE /api/v1/produits/:id`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
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
  "message": "Produit supprimé",
  "data": null
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 12. Catalogue — catégories

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/categories-produits` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/categories-produits` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| PATCH | `/api/v1/categories-produits/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| DELETE | `/api/v1/categories-produits/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |

#### `GET /api/v1/categories-produits`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `catalogue.lire`
- **Format :** aucun corps

**Réponse 200 :** `data` contient `categories`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "categories": [
      {
        "id": "3e675baf-09b7-4f96-a1ba-9215a09cc789",
        "company_id": "8f14b65c-d065-4d14-bb19-c5f1590486ab",
        "name": "Boissons",
        "sort_order": 2,
        "created_at": "2026-10-21T11:14:48.710Z",
        "updated_at": "2026-10-21T11:14:48.710Z",
        "products_count": 1
      }
    ]
  }
}
```

</details>

---

#### `POST /api/v1/categories-produits`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `name` | string | **oui** | min 1 car. · max 100 car. |
| `sort_order` | integer | non | ≥ 0 · ≤ 10000 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "name": "Boissons",
  "sort_order": 2
}
```

</details>

**Réponse 201 :** `data` contient `category`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Catégorie créée",
  "data": {
    "category": {
      "id": "3e675baf-09b7-4f96-a1ba-9215a09cc789",
      "name": "Boissons",
      "sort_order": 2,
      "company_id": "8f14b65c-d065-4d14-bb19-c5f1590486ab",
      "updated_at": "2026-10-21T11:14:48.710Z",
      "created_at": "2026-10-21T11:14:48.710Z"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `CATEGORIE_EXISTANTE`.

---

#### `PATCH /api/v1/categories-produits/:id`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `name` | string | non | min 1 car. · max 100 car. |
| `sort_order` | integer | non | ≥ 0 · ≤ 10000 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "name": "Boissons fraîches"
}
```

</details>

**Réponse 200 :** `data` contient `category`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Catégorie modifiée",
  "data": {
    "category": {
      "id": "3e675baf-09b7-4f96-a1ba-9215a09cc789",
      "company_id": "8f14b65c-d065-4d14-bb19-c5f1590486ab",
      "name": "Boissons fraîches",
      "sort_order": 2,
      "created_at": "2026-10-21T11:14:48.710Z",
      "updated_at": "2026-10-21T11:14:48.799Z"
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 422 `DONNEES_INVALIDES`.

---

#### `DELETE /api/v1/categories-produits/:id`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
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
  "message": "Catégorie supprimée",
  "data": null
}
```

</details>

**Erreurs observées :** 409 `CATEGORIE_NON_VIDE` · 422 `DONNEES_INVALIDES`.

---

## 13. Catalogues des fournisseurs

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/catalogues/:supplierId/produits` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/catalogues/:supplierId/produits/:id` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/catalogues/:supplierId/categories` | membre d’une entreprise active — entreprise acheteuse ou mixte |

#### `GET /api/v1/catalogues/:supplierId/produits`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `catalogue.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `supplierId` | string (uuid) | **oui** |  |


**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `q` | string | non | max 100 car. |
| `category_id` | string (uuid) | non |  |
| `availability` | string | non | valeurs : `disponible`, `stock_limite`, `sur_commande`, `rupture` |
| `tri` | string | non | valeurs : `name`, `-name`, `reference`, `-reference`, `price`, `-price`, `created_at`, `-created_at`, `updated_at`, `-updated_at` |


Exemple de query string réelle : `?tri=price`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `category_id`, `reference`, `name`, `description`, `unit`, `packaging`, `price`, `tax_rate`, `availability`, `min_order_quantity`, `is_active`, `photo_document_id`, `created_at`, `updated_at`, `deleted_at`, `category`, `photo_url`, `photo_thumbnail_url`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "94f0864b-55be-457a-9e86-c36470b78bb6",
        "company_id": "eda85520-7203-46f2-a2b0-2d5bfa28a782",
        "category_id": null,
        "reference": "REF-676d75",
        "name": "Riz brisé 9fc2",
        "description": null,
        "unit": "kg",
        "packaging": null,
        "price": 2500,
        "tax_rate": 0,
        "availability": "disponible",
        "min_order_quantity": 1,
        "is_active": true,
        "photo_document_id": null,
        "created_at": "2026-10-21T11:15:06.369Z",
        "updated_at": "2026-10-21T11:15:06.369Z",
        "deleted_at": null,
        "category": null,
        "photo_url": null,
        "photo_thumbnail_url": null
      },
      {
        "id": "03552d0b-8fb3-449f-94cc-87a628d958aa",
        "company_id": "eda85520-7203-46f2-a2b0-2d5bfa28a782",
        "category_id": null,
        "reference": "REF-9fbe63",
        "name": "Riz brisé 0078",
        "description": null,
        "unit": "sac",
        "packaging": null,
        "price": 15000,
        "tax_rate": 18,
        "availability": "disponible",
        "min_order_quantity": 1,
        "is_active": true,
        "photo_document_id": "b80dde04-b690-4aca-9d2c-9b3fa85080cd",
        "created_at": "2026-10-21T11:15:06.322Z",
        "updated_at": "2026-10-21T11:15:06.519Z",
        "deleted_at": null,
        "category": null,
        "photo_url": "/api/v1/documents/b80dde04-b690-4aca-9d2c-9b3fa85080cd/fichier",
        "photo_thumbnail_url": "/api/v1/documents/b80dde04-b690-4aca-9d2c-9b3fa85080cd/fichier?taille=miniature"
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

**Erreurs observées :** 403 `PARTENARIAT_INACTIF`.

---

#### `GET /api/v1/catalogues/:supplierId/produits/:id`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `catalogue.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `supplierId` | string (uuid) | **oui** |  |
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "product": {
      "id": "786aac2b-daea-4985-bc85-2063d3ea2dab",
      "company_id": "0237a222-22af-44cb-8d62-ba72aa277373",
      "category_id": null,
      "reference": "REF-1d5b7c",
      "name": "Riz brisé 0a77",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 15000,
      "tax_rate": 18,
      "availability": "disponible",
      "min_order_quantity": 1,
      "is_active": true,
      "photo_document_id": null,
      "created_at": "2026-10-21T11:17:43.348Z",
      "updated_at": "2026-10-21T11:17:43.348Z",
      "deleted_at": null,
      "category": null,
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 404 `RESSOURCE_INTROUVABLE`.

---

#### `GET /api/v1/catalogues/:supplierId/categories`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `catalogue.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `supplierId` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `categories`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "categories": []
  }
}
```

</details>

---

## 14. Achats — bons de commande (acheteur)

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/achats` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/:id` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| PATCH | `/api/v1/achats/:id` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/:id/versions` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/:id/historique` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/:id/bon-de-commande.pdf` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/envoyer` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/accepter-proposition` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/refuser-proposition` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/demander-modification` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/annuler` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/confirmer-reception` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/commentaires` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/pieces-jointes` | membre d’une entreprise active — entreprise acheteuse ou mixte |

#### `GET /api/v1/achats`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `status` | string | non | max 300 car. · format `/^(brouillon\|envoyee\|en_attente_validation\|proposition_modifiee\|validee\|en_preparation\|prete\|livree\|reception_confirmee\|facturee\|terminee\|refusee\|annulee)(,(brouillon\|envoyee\|en_attente_validation\|proposition_modifiee\|validee\|en_preparation\|prete\|livree\|reception_confirmee\|facturee\|terminee\|refusee\|annulee))*$/` |
| `q` | string | non | max 100 car. |
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `a_traiter` | boolean | non |  |
| `modifie_depuis` | date | non |  |
| `supplier_id` | string (uuid) | non |  |
| `tri` | string | non | valeurs : `created_at`, `-created_at`, `sent_at`, `-sent_at`, `total`, `-total`, `number`, `-number`, `updated_at`, `-updated_at` |


Exemple de query string réelle : `?status=envoyee,validee&tri=-created_at`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `number`, `buyer_company_id`, `supplier_company_id`, `partnership_id`, `status`, `revision`, `current_version_no`, `validated_version_no`, `buyer_reference`, `delivery_address`, `requested_delivery_date`, `conditions`, `currency`, `subtotal`, `tax_total`, `total`, `lines_count`, `delivery_note`, `reception_note`, `reception_with_reserves`, `cancellation_reason`, `refusal_reason`, `cancelled_by_side`, `template_id`, `created_by`, `sent_at`, `acknowledged_at`, `validated_at`, `preparation_at`, `ready_at`, `delivered_at`, `received_at`, `invoiced_at`, `completed_at`, `refused_at`, `cancelled_at`, `created_at`, `updated_at`, `buyer`, `supplier`, `side`, `actions`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "6e536e89-3ab5-4cd9-92c4-034bfd78dc07",
        "number": "BC-2026-00002",
        "buyer_company_id": "575dc847-59f1-4de7-a175-97808c518ab2",
        "supplier_company_id": "b1c160c9-3c5c-45d1-93e5-f822e4ffee14",
        "partnership_id": "20f55737-2e17-46d6-9a76-1a87ca6e0326",
        "status": "validee",
        "revision": 4,
        "current_version_no": 1,
        "validated_version_no": 1,
        "buyer_reference": null,
        "delivery_address": null,
        "requested_delivery_date": null,
        "conditions": null,
        "currency": "XOF",
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "delivery_note": null,
        "reception_note": null,
        "reception_with_reserves": false,
        "cancellation_reason": null,
        "refusal_reason": null,
        "cancelled_by_side": null,
        "template_id": null,
        "created_by": "fe3197b8-e6c1-4c98-b8f1-ea3666360d26",
        "sent_at": "2026-10-21T11:14:25.908Z",
        "acknowledged_at": null,
        "validated_at": "2026-10-21T11:14:25.984Z",
        "preparation_at": null,
        "ready_at": null,
        "delivered_at": null,
        "received_at": null,
        "invoiced_at": null,
        "completed_at": null,
        "refused_at": null,
        "cancelled_at": null,
        "created_at": "2026-10-21T11:14:25.829Z",
        "updated_at": "2026-10-21T11:14:26.002Z",
        "buyer": {
          "id": "575dc847-59f1-4de7-a175-97808c518ab2",
          "name": "Société e2d7da",
          "city": "Dakar",
          "logo_document_id": null
        },
        "supplier": {
          "id": "b1c160c9-3c5c-45d1-93e5-f822e4ffee14",
          "name": "Société 7bccc1",
          "city": "Dakar",
          "logo_document_id": null
        },
        "side": "acheteur",
        "actions": [
          "annuler"
        ]
      },
      {
        "id": "5db238aa-5caf-48be-b127-873dee8de5ce",
        "number": "BC-2026-00001",
        "buyer_company_id": "575dc847-59f1-4de7-a175-97808c518ab2",
        "supplier_company_id": "b1c160c9-3c5c-45d1-93e5-f822e4ffee14",
        "partnership_id": "20f55737-2e17-46d6-9a76-1a87ca6e0326",
        "status": "envoyee",
        "revision": 3,
        "current_version_no": 1,
        "validated_version_no": null,
        "buyer_reference": null,
        "delivery_address": null,
        "requested_delivery_date": null,
        "conditions": null,
        "currency": "XOF",
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "delivery_note": null,
        "reception_note": null,
        "reception_with_reserves": false,
        "cancellation_reason": null,
        "refusal_reason": null,
        "cancelled_by_side": null,
        "template_id": null,
        "created_by": "fe3197b8-e6c1-4c98-b8f1-ea3666360d26",
        "sent_at": "2026-10-21T11:14:25.752Z",
        "acknowledged_at": null,
        "validated_at": null,
        "preparation_at": null,
        "ready_at": null,
        "delivered_at": null,
        "received_at": null,
        "invoiced_at": null,
        "completed_at": null,
        "refused_at": null,
        "cancelled_at": null,
        "created_at": "2026-10-21T11:14:25.668Z",
        "updated_at": "2026-10-21T11:14:25.773Z",
        "buyer": {
          "id": "575dc847-59f1-4de7-a175-97808c518ab2",
          "name": "Société e2d7da",
          "city": "Dakar",
          "logo_document_id": null
        },
        "supplier": {
          "id": "b1c160c9-3c5c-45d1-93e5-f822e4ffee14",
          "name": "Société 7bccc1",
          "city": "Dakar",
          "logo_document_id": null
        },
        "side": "acheteur",
        "actions": [
          "annuler"
        ]
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

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats`

Idempotence : un double envoi depuis le mobile ne crée pas deux bons de commande.

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `supplier_id` | string (uuid) | **oui** |  |
| `lines` | tableau de object | **oui** | min 1 élément(s) · max 500 élément(s) |
| `lines[].product_id` | string (uuid) | **oui** |  |
| `lines[].quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `lines[].comment` | string | non | `null` accepté · max 500 car. |
| `buyer_reference` | string | non | `null` accepté · max 60 car. |
| `delivery_address` | string | non | `null` accepté · max 1000 car. |
| `requested_delivery_date` | string | non | `null` accepté · date `AAAA-MM-JJ` |
| `conditions` | string | non | `null` accepté · max 2000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "supplier_id": "af268fde-5d53-4e93-ba82-669e68266203",
  "lines": [
    {
      "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
      "quantity": 3
    },
    {
      "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
      "quantity": 50
    }
  ],
  "delivery_address": "Restaurant Chez Fatou, Plateau",
  "requested_delivery_date": "2026-10-21"
}
```

</details>

**Réponse 201 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Bon de commande créé",
  "data": {
    "order": {
      "id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
      "number": "BC-2026-00001",
      "buyer_company_id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
      "supplier_company_id": "af268fde-5d53-4e93-ba82-669e68266203",
      "partnership_id": "de9971af-777e-4c8e-bf63-2095154d8c2b",
      "status": "brouillon",
      "revision": 2,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": "Restaurant Chez Fatou, Plateau",
      "requested_delivery_date": "2026-10-21",
      "conditions": null,
      "currency": "XOF",
      "subtotal": 103500,
      "tax_total": 12960,
      "total": 116460,
      "lines_count": 3,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
      "sent_at": null,
      "acknowledged_at": null,
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:15:09.051Z",
      "updated_at": "2026-10-21T11:15:09.117Z",
      "buyer": {
        "id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778363353",
        "email": "admin.5c9a3f293d@test.sn",
        "ninea": "826181532",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "af268fde-5d53-4e93-ba82-669e68266203",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778363354",
        "email": "grossiste.ecf11055c9@test.sn",
        "ninea": "763516394",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "modifier",
        "envoyer"
      ],
      "current_version": {
        "id": "3e84cfc6-e768-4bff-a4f4-1e9967fcf0e9",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "status": "brouillon",
        "comment": null,
        "subtotal": 103500,
        "tax_total": 12960,
        "total": 116460,
        "lines_count": 3,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T11:15:09.065Z",
        "lines": [
          {
            "id": "8c4ca76d-9c32-478f-b6bb-b7e375d34e23",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "3e84cfc6-e768-4bff-a4f4-1e9967fcf0e9",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.082Z"
          },
          {
            "id": "2853b2e0-3fa1-499b-87bb-38f5e875bd49",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "3e84cfc6-e768-4bff-a4f4-1e9967fcf0e9",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 50,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 22500,
            "line_tax": 0,
            "line_total": 22500,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.082Z"
          }
        ]
      },
      "validated_version": null
    }
  }
}
```

</details>

**Erreurs observées :** 403 `PARTENARIAT_INACTIF` · 403 `PERMISSION_REFUSEE` · 422 `DONNEES_INVALIDES` · 422 `LIGNES_INVALIDES` · 422 `PRODUIT_INVALIDE`.

---

#### `GET /api/v1/achats/:id`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "order": {
      "id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
      "number": "BC-2026-00001",
      "buyer_company_id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
      "supplier_company_id": "af268fde-5d53-4e93-ba82-669e68266203",
      "partnership_id": "de9971af-777e-4c8e-bf63-2095154d8c2b",
      "status": "terminee",
      "revision": 12,
      "current_version_no": 2,
      "validated_version_no": 2,
      "buyer_reference": null,
      "delivery_address": "Restaurant Chez Fatou, Plateau",
      "requested_delivery_date": "2026-10-21",
      "conditions": null,
      "currency": "XOF",
      "subtotal": 90000,
      "tax_total": 12960,
      "total": 102960,
      "lines_count": 3,
      "delivery_note": "Livré à 9 h",
      "reception_note": "Conforme",
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
      "sent_at": "2026-10-21T11:15:09.216Z",
      "acknowledged_at": "2026-10-21T11:15:09.349Z",
      "validated_at": "2026-10-21T11:15:09.571Z",
      "preparation_at": "2026-10-21T11:15:09.652Z",
      "ready_at": "2026-10-21T11:15:09.728Z",
      "delivered_at": "2026-10-21T11:15:09.826Z",
      "received_at": "2026-10-21T11:15:09.913Z",
      "invoiced_at": "2026-10-21T11:15:10.034Z",
      "completed_at": "2026-10-21T11:15:10.312Z",
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:15:09.051Z",
      "updated_at": "2026-10-21T11:15:10.319Z",
      "buyer": {
        "id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778363353",
        "email": "admin.5c9a3f293d@test.sn",
        "ninea": "826181532",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "af268fde-5d53-4e93-ba82-669e68266203",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778363354",
        "email": "grossiste.ecf11055c9@test.sn",
        "ninea": "763516394",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": {
        "id": "0d1d4c0f-189f-4049-b624-dfcbb20a5136",
        "number": "FAC-2026-00001",
        "status": "payee",
        "total": 102960,
        "amount_paid": 102960,
        "due_date": "2026-11-20"
      },
      "side": "acheteur",
      "actions": [],
      "current_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:15:09.568Z",
        "decided_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": 3,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": 40,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      },
      "validated_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:15:09.568Z",
        "decided_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": 3,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": 40,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      }
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 422 `DONNEES_INVALIDES`.

---

#### `PATCH /api/v1/achats/:id`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `buyer_reference` | string | non | `null` accepté · max 60 car. |
| `delivery_address` | string | non | `null` accepté · max 1000 car. |
| `requested_delivery_date` | string | non | `null` accepté · date `AAAA-MM-JJ` |
| `conditions` | string | non | `null` accepté · max 2000 car. |
| `lines` | tableau de object | non | min 1 élément(s) · max 500 élément(s) |
| `lines[].product_id` | string (uuid) | **oui** |  |
| `lines[].quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `lines[].comment` | string | non | `null` accepté · max 500 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "lines": [
    {
      "product_id": "77e25dce-545c-4375-a375-2908f4d269b0",
      "quantity": 3
    }
  ],
  "conditions": "Livraison avant 10 h",
  "revision": 2
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Bon de commande modifié",
  "data": {
    "order": {
      "id": "7fcff52f-fa63-4104-aea8-d88cafb37f3f",
      "number": "BC-2026-00001",
      "buyer_company_id": "1b7f0c6d-4b35-4e36-b956-ba2db2645875",
      "supplier_company_id": "0cf60172-4a56-46c7-883c-98e0ae539216",
      "partnership_id": "9682d9af-3f09-4fe1-9181-a0e0724e3243",
      "status": "brouillon",
      "revision": 3,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": "Livraison avant 10 h",
      "currency": "XOF",
      "subtotal": 45000,
      "tax_total": 8100,
      "total": 53100,
      "lines_count": 1,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "9980fa6f-7691-4b7e-a9c5-976180dd5a89",
      "sent_at": null,
      "acknowledged_at": null,
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:14:19.413Z",
      "updated_at": "2026-10-21T11:14:19.657Z",
      "buyer": {
        "id": "1b7f0c6d-4b35-4e36-b956-ba2db2645875",
        "name": "Société ba6002",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562375",
        "email": "admin.84d034b842@test.sn",
        "ninea": "331966187",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "0cf60172-4a56-46c7-883c-98e0ae539216",
        "name": "Société a52e91",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562376",
        "email": "admin.297e3fd346@test.sn",
        "ninea": "105818277",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "modifier",
        "envoyer"
      ],
      "current_version": {
        "id": "3d1f6b2e-46b6-4202-8a10-c9849a0487dd",
        "order_id": "7fcff52f-fa63-4104-aea8-d88cafb37f3f",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "9980fa6f-7691-4b7e-a9c5-976180dd5a89",
        "status": "brouillon",
        "comment": null,
        "subtotal": 45000,
        "tax_total": 8100,
        "total": 53100,
        "lines_count": 1,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T11:14:19.420Z",
        "lines": [
          {
            "id": "5a94c921-22d1-4f5c-b04a-3fc9cc16149c",
            "order_id": "7fcff52f-fa63-4104-aea8-d88cafb37f3f",
            "version_id": "3d1f6b2e-46b6-4202-8a10-c9849a0487dd",
            "line_no": 1,
            "product_id": "77e25dce-545c-4375-a375-2908f4d269b0",
            "reference": "REF-ef6433",
            "name": "Riz brisé 939a",
            "unit": "sac",
            "quantity": 3,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 45000,
            "line_tax": 8100,
            "line_total": 53100,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:19.621Z"
          }
        ]
      },
      "validated_version": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `COMMANDE_NON_MODIFIABLE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/achats/:id/versions`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `versions`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "versions": [
      {
        "id": "a954eae3-2623-4eb5-a657-0f147085918e",
        "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "52f85298-2086-472f-b75b-fb6bf6734204",
        "status": "remplacee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T11:14:23.110Z",
        "decided_by": "e3c2b94d-80b3-4e53-b2c6-b48adc84e2dc",
        "created_at": "2026-10-21T11:14:22.952Z",
        "lines": [
          {
            "id": "495025fc-2e40-4e5f-bf40-1a50c69c4bbc",
            "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
            "version_id": "a954eae3-2623-4eb5-a657-0f147085918e",
            "line_no": 1,
            "product_id": "fa23d27e-2b57-484d-84cb-40032bc4d15d",
            "reference": "REF-0a653c",
            "name": "Riz brisé bdea",
            "unit": "sac",
            "quantity": 10,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 150000,
            "line_tax": 27000,
            "line_total": 177000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:22.954Z"
          },
          {
            "id": "163c87bd-3ea9-45a9-b3b9-62a6cd74aa2c",
            "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
            "version_id": "a954eae3-2623-4eb5-a657-0f147085918e",
            "line_no": 2,
            "product_id": "9aef5615-7db7-46cb-be9a-b63e73bcdc08",
            "reference": "REF-b87e7b",
            "name": "Riz brisé 8e62",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:22.954Z"
          }
        ]
      },
      {
        "id": "2f30900c-c379-4d76-9235-293f7de59189",
        "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "e3c2b94d-80b3-4e53-b2c6-b48adc84e2dc",
        "status": "acceptee",
        "comment": "Stock partiel",
        "subtotal": 127200,
        "tax_total": 20880,
        "total": 148080,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:14:23.228Z",
        "decided_by": "52f85298-2086-472f-b75b-fb6bf6734204",
        "created_at": "2026-10-21T11:14:23.113Z",
        "lines": [
          {
            "id": "d5e7ec47-4dae-4982-a01c-0ce329ec887b",
            "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
            "version_id": "2f30900c-c379-4d76-9235-293f7de59189",
            "line_no": 1,
            "product_id": "fa23d27e-2b57-484d-84cb-40032bc4d15d",
            "reference": "REF-0a653c",
            "name": "Riz brisé bdea",
            "unit": "sac",
            "quantity": 8,
            "unit_price": 14500,
            "tax_rate": 18,
            "line_subtotal": 116000,
            "line_tax": 20880,
            "line_total": 136880,
            "change_type": "quantite_modifiee",
            "original_quantity": 10,
            "original_unit_price": 15000,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:23.116Z"
          },
          {
            "id": "545e8b24-d943-4e99-8778-1b5807f85d95",
            "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
            "version_id": "2f30900c-c379-4d76-9235-293f7de59189",
            "line_no": 2,
            "product_id": "9aef5615-7db7-46cb-be9a-b63e73bcdc08",
            "reference": "REF-b87e7b",
            "name": "Riz brisé 8e62",
            "unit": "kg",
            "quantity": 0,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 0,
            "line_tax": 0,
            "line_total": 0,
            "change_type": "indisponible",
            "original_quantity": 4,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": "Rupture fournisseur",
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:23.116Z"
          }
        ]
      }
    ]
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/achats/:id/historique`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `events`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "events": [
      {
        "id": 127,
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "type": "creation",
        "from_status": null,
        "to_status": "brouillon",
        "version_no": 1,
        "actor_user_id": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "actor_company_id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
        "actor_side": "acheteur",
        "message": null,
        "details": null,
        "created_at": "2026-10-21T11:15:09.103Z",
        "actor": {
          "id": "979fff62-0c0f-4589-b3d6-f4179511059f",
          "first_name": "Awa",
          "last_name": "Diop"
        },
        "actorCompany": {
          "id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
          "name": "Restaurant Chez Fatou"
        }
      },
      {
        "id": 128,
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "type": "envoi",
        "from_status": "brouillon",
        "to_status": "envoyee",
        "version_no": 1,
        "actor_user_id": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "actor_company_id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
        "actor_side": "acheteur",
        "message": null,
        "details": null,
        "created_at": "2026-10-21T11:15:09.220Z",
        "actor": {
          "id": "979fff62-0c0f-4589-b3d6-f4179511059f",
          "first_name": "Awa",
          "last_name": "Diop"
        },
        "actorCompany": {
          "id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
          "name": "Restaurant Chez Fatou"
        }
      }
    ]
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/achats/:id/bon-de-commande.pdf`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `version` | integer | non | ≥ 1 |


**Réponse 200 :** fichier `application/pdf` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 404 `RESSOURCE_INTROUVABLE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/envoyer`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `revision` | integer | non | ≥ 1 |


**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Bon de commande envoyé au fournisseur",
  "data": {
    "order": {
      "id": "e7527f17-8d4b-4c6d-b0d0-a4f597aa5d90",
      "number": "BC-2026-00001",
      "buyer_company_id": "d3b0ece0-3535-46cf-8fe7-0d4ffe225f73",
      "supplier_company_id": "d7e20ee2-a3b4-49b3-999e-e6c67d908467",
      "partnership_id": "4284c76b-28df-40e6-9601-47edcc078c74",
      "status": "envoyee",
      "revision": 3,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 160000,
      "tax_total": 27000,
      "total": 187000,
      "lines_count": 2,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": "54448a80-2e44-4f1d-a5f2-da75055a5771",
      "created_by": "40837794-fae0-45b2-8cc7-018dafe25d1e",
      "sent_at": "2026-10-21T11:14:40.049Z",
      "acknowledged_at": null,
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:14:39.978Z",
      "updated_at": "2026-10-21T11:14:40.068Z",
      "buyer": {
        "id": "d3b0ece0-3535-46cf-8fe7-0d4ffe225f73",
        "name": "Société 6fd5a1",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778363343",
        "email": "admin.cbc6379448@test.sn",
        "ninea": "223518335",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "d7e20ee2-a3b4-49b3-999e-e6c67d908467",
        "name": "Société 099583",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778363344",
        "email": "admin.94f5728b13@test.sn",
        "ninea": "706158411",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "annuler"
      ],
      "current_version": {
        "id": "a3cda372-f7d0-408c-9ece-102a82b27ef6",
        "order_id": "e7527f17-8d4b-4c6d-b0d0-a4f597aa5d90",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "40837794-fae0-45b2-8cc7-018dafe25d1e",
        "status": "proposee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T11:14:39.983Z",
        "lines": [
          {
            "id": "dedaa3f1-827d-41a4-9ef8-a8a84abd3188",
            "order_id": "e7527f17-8d4b-4c6d-b0d0-a4f597aa5d90",
            "version_id": "a3cda372-f7d0-408c-9ece-102a82b27ef6",
            "line_no": 1,
            "product_id": "197c5de1-57ee-4075-8b29-3c73288d4591",
            "reference": "REF-149630",
            "name": "Riz brisé 1687",
            "unit": "sac",
            "quantity": 10,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 150000,
            "line_tax": 27000,
            "line_total": 177000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:39.985Z"
          },
          {
            "id": "35fffb7b-de92-4e5c-8382-0893b70ae27f",
            "order_id": "e7527f17-8d4b-4c6d-b0d0-a4f597aa5d90",
            "version_id": "a3cda372-f7d0-408c-9ece-102a82b27ef6",
            "line_no": 2,
            "product_id": "a7445bc2-8706-430b-b315-38fdf6701386",
            "reference": "REF-892772",
            "name": "Riz brisé 6845",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:39.985Z"
          }
        ]
      },
      "validated_version": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `COMMANDE_MODIFIEE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/accepter-proposition`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `revision` | integer | non | ≥ 1 |


**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Proposition acceptée : commande validée",
  "data": {
    "order": {
      "id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
      "number": "BC-2026-00001",
      "buyer_company_id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
      "supplier_company_id": "af268fde-5d53-4e93-ba82-669e68266203",
      "partnership_id": "de9971af-777e-4c8e-bf63-2095154d8c2b",
      "status": "validee",
      "revision": 6,
      "current_version_no": 2,
      "validated_version_no": 2,
      "buyer_reference": null,
      "delivery_address": "Restaurant Chez Fatou, Plateau",
      "requested_delivery_date": "2026-10-21",
      "conditions": null,
      "currency": "XOF",
      "subtotal": 90000,
      "tax_total": 12960,
      "total": 102960,
      "lines_count": 3,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
      "sent_at": "2026-10-21T11:15:09.216Z",
      "acknowledged_at": "2026-10-21T11:15:09.349Z",
      "validated_at": "2026-10-21T11:15:09.571Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:15:09.051Z",
      "updated_at": "2026-10-21T11:15:09.597Z",
      "buyer": {
        "id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778363353",
        "email": "admin.5c9a3f293d@test.sn",
        "ninea": "826181532",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "af268fde-5d53-4e93-ba82-669e68266203",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778363354",
        "email": "grossiste.ecf11055c9@test.sn",
        "ninea": "763516394",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "annuler"
      ],
      "current_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:15:09.568Z",
        "decided_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      },
      "validated_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:15:09.568Z",
        "decided_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      }
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/refuser-proposition`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `reason` | string | **oui** | min 3 car. · max 1000 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reason": "Quantité insuffisante"
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Proposition refusée : commande annulée",
  "data": {
    "order": {
      "id": "48f517e4-c15f-4e7f-a1b9-c8eb3c921e9d",
      "number": "BC-2026-00001",
      "buyer_company_id": "0e3b1dbb-e147-4ae2-af9b-12db78a35297",
      "supplier_company_id": "1fe5a97d-d989-46c7-9d70-6fe0c0614df2",
      "partnership_id": "ff27f337-4b4c-490a-b4f2-daf271543b6a",
      "status": "annulee",
      "revision": 5,
      "current_version_no": 2,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 40000,
      "tax_total": 5400,
      "total": 45400,
      "lines_count": 2,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": "Quantité insuffisante",
      "refusal_reason": null,
      "cancelled_by_side": "acheteur",
      "template_id": null,
      "created_by": "f900907c-a643-438c-a85b-db69341c5fe7",
      "sent_at": "2026-10-21T11:14:22.095Z",
      "acknowledged_at": "2026-10-21T11:14:22.226Z",
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": "2026-10-21T11:14:22.296Z",
      "created_at": "2026-10-21T11:14:22.010Z",
      "updated_at": "2026-10-21T11:14:22.312Z",
      "buyer": {
        "id": "0e3b1dbb-e147-4ae2-af9b-12db78a35297",
        "name": "Société 902e41",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562386",
        "email": "admin.cd75c5079e@test.sn",
        "ninea": "660473380",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "1fe5a97d-d989-46c7-9d70-6fe0c0614df2",
        "name": "Société 914c0f",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562387",
        "email": "admin.dfc746f7a7@test.sn",
        "ninea": "670922911",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [],
      "current_version": {
        "id": "e7d01328-a7a9-4e40-a7cd-e9fb2de796c3",
        "order_id": "48f517e4-c15f-4e7f-a1b9-c8eb3c921e9d",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "2dc87040-688e-454e-ba3a-b6c0c60bc7f9",
        "status": "refusee",
        "comment": null,
        "subtotal": 40000,
        "tax_total": 5400,
        "total": 45400,
        "lines_count": 2,
        "decided_at": "2026-10-21T11:14:22.293Z",
        "decided_by": "f900907c-a643-438c-a85b-db69341c5fe7",
        "created_at": "2026-10-21T11:14:22.217Z",
        "lines": [
          {
            "id": "bad51194-de91-4393-a9b9-f1887e4238df",
            "order_id": "48f517e4-c15f-4e7f-a1b9-c8eb3c921e9d",
            "version_id": "e7d01328-a7a9-4e40-a7cd-e9fb2de796c3",
            "line_no": 1,
            "product_id": "8a7c1d94-1666-41be-be30-eee4ff89f4b0",
            "reference": "REF-e1cbeb",
            "name": "Riz brisé 2a86",
            "unit": "sac",
            "quantity": 2,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 30000,
            "line_tax": 5400,
            "line_total": 35400,
            "change_type": "quantite_modifiee",
            "original_quantity": 10,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:22.220Z"
          },
          {
            "id": "68ff6bc1-3de5-4395-8364-4a4dfe4cc68d",
            "order_id": "48f517e4-c15f-4e7f-a1b9-c8eb3c921e9d",
            "version_id": "e7d01328-a7a9-4e40-a7cd-e9fb2de796c3",
            "line_no": 2,
            "product_id": "f9d3b8e5-c56d-4e0d-95e7-34fab2019266",
            "reference": "REF-991a87",
            "name": "Riz brisé d26d",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:22.220Z"
          }
        ]
      },
      "validated_version": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/demander-modification`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `comment` | string | **oui** | max 2000 car. · min 3 car. |
| `lines` | tableau de object | non | max 500 élément(s) |
| `lines[].line_no` | integer | non | ≥ 1 |
| `lines[].product_id` | string (uuid) | non |  |
| `lines[].quantity` | number | non | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max |
| `lines[].comment` | string | non | `null` accepté · max 500 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "comment": "Il nous faut au moins 7 sacs",
  "lines": [
    {
      "line_no": 1,
      "quantity": 7
    }
  ]
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Demande de modification envoyée",
  "data": {
    "order": {
      "id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
      "number": "BC-2026-00001",
      "buyer_company_id": "d67c3a2c-bec5-42a8-8b0a-1fb83ad74fb9",
      "supplier_company_id": "fd4e0640-dc35-4e96-84cf-3bfd2fb2fe14",
      "partnership_id": "cb1619e5-cbea-4d3b-8ca0-966a26ff448b",
      "status": "en_attente_validation",
      "revision": 5,
      "current_version_no": 3,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 115000,
      "tax_total": 18900,
      "total": 133900,
      "lines_count": 2,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "22362569-1e1d-4185-abd3-e060f0aac0bd",
      "sent_at": "2026-10-21T11:14:24.264Z",
      "acknowledged_at": "2026-10-21T11:14:24.354Z",
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:14:24.182Z",
      "updated_at": "2026-10-21T11:14:24.467Z",
      "buyer": {
        "id": "d67c3a2c-bec5-42a8-8b0a-1fb83ad74fb9",
        "name": "Société e8d1e3",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562392",
        "email": "admin.6bb9b4c298@test.sn",
        "ninea": "315441692",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "fd4e0640-dc35-4e96-84cf-3bfd2fb2fe14",
        "name": "Société 39ea37",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562393",
        "email": "admin.3e5f350d93@test.sn",
        "ninea": "788032004",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "annuler"
      ],
      "current_version": {
        "id": "7e2a28f6-32e7-4314-83e6-234aee277183",
        "order_id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
        "version_no": 3,
        "proposed_by_side": "acheteur",
        "proposed_by": "22362569-1e1d-4185-abd3-e060f0aac0bd",
        "status": "proposee",
        "comment": "Il nous faut au moins 7 sacs",
        "subtotal": 115000,
        "tax_total": 18900,
        "total": 133900,
        "lines_count": 2,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T11:14:24.436Z",
        "lines": [
          {
            "id": "09147881-9cd9-4dfa-801f-2a2078c8bbd6",
            "order_id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
            "version_id": "7e2a28f6-32e7-4314-83e6-234aee277183",
            "line_no": 1,
            "product_id": "dbd2d8bc-76c3-455d-b208-2fea91d4ba44",
            "reference": "REF-488399",
            "name": "Riz brisé 3925",
            "unit": "sac",
            "quantity": 7,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 105000,
            "line_tax": 18900,
            "line_total": 123900,
            "change_type": "quantite_modifiee",
            "original_quantity": 5,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:24.439Z"
          },
          {
            "id": "f051bbd4-5922-4720-b7d7-c25804c06851",
            "order_id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
            "version_id": "7e2a28f6-32e7-4314-83e6-234aee277183",
            "line_no": 2,
            "product_id": "1f311ade-fca3-4a40-94a9-3822ba88d6ea",
            "reference": "REF-3ec7ed",
            "name": "Riz brisé 2d69",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:24.439Z"
          }
        ]
      },
      "validated_version": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/annuler`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `reason` | string | **oui** | min 3 car. · max 1000 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reason": "Plus besoin"
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Commande annulée",
  "data": {
    "order": {
      "id": "fb657e27-4b8d-4108-97c1-533ecc0351ab",
      "number": "BC-2026-00001",
      "buyer_company_id": "6306a2b1-ac1c-43d0-b85e-4986ebf6d47a",
      "supplier_company_id": "7b566201-8444-4a20-a6e9-4fa6df668b61",
      "partnership_id": "015c29b0-ed88-4972-bb78-ba193e102d6d",
      "status": "annulee",
      "revision": 4,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 160000,
      "tax_total": 27000,
      "total": 187000,
      "lines_count": 2,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": "Plus besoin",
      "refusal_reason": null,
      "cancelled_by_side": "acheteur",
      "template_id": null,
      "created_by": "406d6e50-f028-4f09-b6c5-0d92baf0ef3e",
      "sent_at": "2026-10-21T11:14:16.229Z",
      "acknowledged_at": null,
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": "2026-10-21T11:14:16.337Z",
      "created_at": "2026-10-21T11:14:16.132Z",
      "updated_at": "2026-10-21T11:14:16.366Z",
      "buyer": {
        "id": "6306a2b1-ac1c-43d0-b85e-4986ebf6d47a",
        "name": "Société d4fdc6",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562369",
        "email": "admin.457291b272@test.sn",
        "ninea": "349598870",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "7b566201-8444-4a20-a6e9-4fa6df668b61",
        "name": "Société 08d13a",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562370",
        "email": "admin.ff45074e81@test.sn",
        "ninea": "476475619",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [],
      "current_version": {
        "id": "447b120b-057a-4995-999d-8591de415512",
        "order_id": "fb657e27-4b8d-4108-97c1-533ecc0351ab",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "406d6e50-f028-4f09-b6c5-0d92baf0ef3e",
        "status": "refusee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T11:14:16.343Z",
        "decided_by": "406d6e50-f028-4f09-b6c5-0d92baf0ef3e",
        "created_at": "2026-10-21T11:14:16.139Z",
        "lines": [
          {
            "id": "6629523c-1d69-47ba-8bdb-699e4362df39",
            "order_id": "fb657e27-4b8d-4108-97c1-533ecc0351ab",
            "version_id": "447b120b-057a-4995-999d-8591de415512",
            "line_no": 1,
            "product_id": "346ee8d0-9451-4a62-a8e4-7704072358b1",
            "reference": "REF-df7b88",
            "name": "Riz brisé b3a1",
            "unit": "sac",
            "quantity": 10,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 150000,
            "line_tax": 27000,
            "line_total": 177000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:16.145Z"
          },
          {
            "id": "ac1aa995-f191-409f-9955-0b2336d0e6ea",
            "order_id": "fb657e27-4b8d-4108-97c1-533ecc0351ab",
            "version_id": "447b120b-057a-4995-999d-8591de415512",
            "line_no": 2,
            "product_id": "b4a9ba77-303e-49db-bada-03a565f32e98",
            "reference": "REF-aae5e5",
            "name": "Riz brisé 0a73",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:16.145Z"
          }
        ]
      },
      "validated_version": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/confirmer-reception`

§ 13 — confirmation de réception : responsable achats ou réceptionnaire.

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `reception.confirmer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `lines` | tableau de object | non | max 500 élément(s) · sans doublon |
| `lines[].line_no` | integer | **oui** | ≥ 1 |
| `lines[].received_quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max |
| `note` | string | non | `null` accepté · max 2000 car. |
| `with_reserves` | boolean | non |  |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "note": "Conforme"
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Réception confirmée",
  "data": {
    "order": {
      "id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
      "number": "BC-2026-00001",
      "buyer_company_id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
      "supplier_company_id": "af268fde-5d53-4e93-ba82-669e68266203",
      "partnership_id": "de9971af-777e-4c8e-bf63-2095154d8c2b",
      "status": "reception_confirmee",
      "revision": 10,
      "current_version_no": 2,
      "validated_version_no": 2,
      "buyer_reference": null,
      "delivery_address": "Restaurant Chez Fatou, Plateau",
      "requested_delivery_date": "2026-10-21",
      "conditions": null,
      "currency": "XOF",
      "subtotal": 90000,
      "tax_total": 12960,
      "total": 102960,
      "lines_count": 3,
      "delivery_note": "Livré à 9 h",
      "reception_note": "Conforme",
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
      "sent_at": "2026-10-21T11:15:09.216Z",
      "acknowledged_at": "2026-10-21T11:15:09.349Z",
      "validated_at": "2026-10-21T11:15:09.571Z",
      "preparation_at": "2026-10-21T11:15:09.652Z",
      "ready_at": "2026-10-21T11:15:09.728Z",
      "delivered_at": "2026-10-21T11:15:09.826Z",
      "received_at": "2026-10-21T11:15:09.913Z",
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:15:09.051Z",
      "updated_at": "2026-10-21T11:15:09.934Z",
      "buyer": {
        "id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778363353",
        "email": "admin.5c9a3f293d@test.sn",
        "ninea": "826181532",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "af268fde-5d53-4e93-ba82-669e68266203",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778363354",
        "email": "grossiste.ecf11055c9@test.sn",
        "ninea": "763516394",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [],
      "current_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:15:09.568Z",
        "decided_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": 3,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": 40,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      },
      "validated_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:15:09.568Z",
        "decided_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": 3,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": 40,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      }
    }
  }
}
```

</details>

**Erreurs observées :** 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES` · 422 `RECEPTION_INVALIDE`.

---

#### `POST /api/v1/achats/:id/commentaires`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.lire`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `message` | string | **oui** | max 2000 car. · min 1 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "message": "Livraison avant 10 h svp"
}
```

</details>

**Réponse 201 :** `data` contient `event`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Message envoyé",
  "data": {
    "event": {
      "id": 3,
      "order_id": "7dfdad80-4de0-412f-9310-b010daefbdd4",
      "type": "commentaire",
      "from_status": null,
      "to_status": null,
      "version_no": null,
      "actor_user_id": "439a61bc-2533-43d4-ae42-5282b5f5d058",
      "actor_company_id": "2b512c85-e916-4ed4-ad14-daa410f28b7f",
      "actor_side": "acheteur",
      "message": "Livraison avant 10 h svp",
      "details": null,
      "created_at": "2026-10-21T11:17:43.917Z"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `COMMANDE_NON_ENVOYEE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/pieces-jointes`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `documents.ecrire`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative
- **Fichier :** champ `fichier` (**obligatoire**) — un PDF ou une image

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Champs du formulaire (multipart)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `description` | string | non | `null` accepté · max 255 car. |


**Réponse 201 :** `data` contient `document`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Pièce jointe ajoutée",
  "data": {
    "document": {
      "id": "2809a01b-8049-4dd5-94f8-b35e6216f210",
      "company_id": "c5684ba6-6ba0-4f17-be05-5c6ab95abeff",
      "category": "piece_jointe",
      "visibility": "partenaire",
      "mime_type": "application/pdf",
      "size_bytes": 69,
      "original_name": "plan.pdf",
      "has_thumbnail": false,
      "created_at": "2026-10-21T11:14:15.511Z",
      "url": "/api/v1/documents/2809a01b-8049-4dd5-94f8-b35e6216f210/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `COMMANDE_CLOSE` · 422 `DONNEES_INVALIDES`.

---

## 15. Ventes — commandes reçues (fournisseur)

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/ventes` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/ventes/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/ventes/:id/versions` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/ventes/:id/historique` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/ventes/:id/bon-de-commande.pdf` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/prendre-en-charge` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/accepter` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/proposer` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/refuser` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/statut` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/livrer` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/annuler` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/commentaires` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/pieces-jointes` | membre d’une entreprise active — entreprise fournisseur ou mixte |

#### `GET /api/v1/ventes`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `status` | string | non | max 300 car. · format `/^(brouillon\|envoyee\|en_attente_validation\|proposition_modifiee\|validee\|en_preparation\|prete\|livree\|reception_confirmee\|facturee\|terminee\|refusee\|annulee)(,(brouillon\|envoyee\|en_attente_validation\|proposition_modifiee\|validee\|en_preparation\|prete\|livree\|reception_confirmee\|facturee\|terminee\|refusee\|annulee))*$/` |
| `q` | string | non | max 100 car. |
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `a_traiter` | boolean | non |  |
| `modifie_depuis` | date | non |  |
| `client_id` | string (uuid) | non |  |
| `tri` | string | non | valeurs : `sent_at`, `-sent_at`, `created_at`, `-created_at`, `total`, `-total`, `number`, `-number`, `updated_at`, `-updated_at` |


Exemple de query string réelle : `?a_traiter=true`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `number`, `buyer_company_id`, `supplier_company_id`, `partnership_id`, `status`, `revision`, `current_version_no`, `validated_version_no`, `buyer_reference`, `delivery_address`, `requested_delivery_date`, `conditions`, `currency`, `subtotal`, `tax_total`, `total`, `lines_count`, `delivery_note`, `reception_note`, `reception_with_reserves`, `cancellation_reason`, `refusal_reason`, `cancelled_by_side`, `template_id`, `created_by`, `sent_at`, `acknowledged_at`, `validated_at`, `preparation_at`, `ready_at`, `delivered_at`, `received_at`, `invoiced_at`, `completed_at`, `refused_at`, `cancelled_at`, `created_at`, `updated_at`, `buyer`, `supplier`, `side`, `actions`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "6e536e89-3ab5-4cd9-92c4-034bfd78dc07",
        "number": "BC-2026-00002",
        "buyer_company_id": "575dc847-59f1-4de7-a175-97808c518ab2",
        "supplier_company_id": "b1c160c9-3c5c-45d1-93e5-f822e4ffee14",
        "partnership_id": "20f55737-2e17-46d6-9a76-1a87ca6e0326",
        "status": "validee",
        "revision": 4,
        "current_version_no": 1,
        "validated_version_no": 1,
        "buyer_reference": null,
        "delivery_address": null,
        "requested_delivery_date": null,
        "conditions": null,
        "currency": "XOF",
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "delivery_note": null,
        "reception_note": null,
        "reception_with_reserves": false,
        "cancellation_reason": null,
        "refusal_reason": null,
        "cancelled_by_side": null,
        "template_id": null,
        "created_by": "fe3197b8-e6c1-4c98-b8f1-ea3666360d26",
        "sent_at": "2026-10-21T11:14:25.908Z",
        "acknowledged_at": null,
        "validated_at": "2026-10-21T11:14:25.984Z",
        "preparation_at": null,
        "ready_at": null,
        "delivered_at": null,
        "received_at": null,
        "invoiced_at": null,
        "completed_at": null,
        "refused_at": null,
        "cancelled_at": null,
        "created_at": "2026-10-21T11:14:25.829Z",
        "updated_at": "2026-10-21T11:14:26.002Z",
        "buyer": {
          "id": "575dc847-59f1-4de7-a175-97808c518ab2",
          "name": "Société e2d7da",
          "city": "Dakar",
          "logo_document_id": null
        },
        "supplier": {
          "id": "b1c160c9-3c5c-45d1-93e5-f822e4ffee14",
          "name": "Société 7bccc1",
          "city": "Dakar",
          "logo_document_id": null
        },
        "side": "fournisseur",
        "actions": [
          "en_preparation",
          "prete"
        ]
      },
      {
        "id": "5db238aa-5caf-48be-b127-873dee8de5ce",
        "number": "BC-2026-00001",
        "buyer_company_id": "575dc847-59f1-4de7-a175-97808c518ab2",
        "supplier_company_id": "b1c160c9-3c5c-45d1-93e5-f822e4ffee14",
        "partnership_id": "20f55737-2e17-46d6-9a76-1a87ca6e0326",
        "status": "envoyee",
        "revision": 3,
        "current_version_no": 1,
        "validated_version_no": null,
        "buyer_reference": null,
        "delivery_address": null,
        "requested_delivery_date": null,
        "conditions": null,
        "currency": "XOF",
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "delivery_note": null,
        "reception_note": null,
        "reception_with_reserves": false,
        "cancellation_reason": null,
        "refusal_reason": null,
        "cancelled_by_side": null,
        "template_id": null,
        "created_by": "fe3197b8-e6c1-4c98-b8f1-ea3666360d26",
        "sent_at": "2026-10-21T11:14:25.752Z",
        "acknowledged_at": null,
        "validated_at": null,
        "preparation_at": null,
        "ready_at": null,
        "delivered_at": null,
        "received_at": null,
        "invoiced_at": null,
        "completed_at": null,
        "refused_at": null,
        "cancelled_at": null,
        "created_at": "2026-10-21T11:14:25.668Z",
        "updated_at": "2026-10-21T11:14:25.773Z",
        "buyer": {
          "id": "575dc847-59f1-4de7-a175-97808c518ab2",
          "name": "Société e2d7da",
          "city": "Dakar",
          "logo_document_id": null
        },
        "supplier": {
          "id": "b1c160c9-3c5c-45d1-93e5-f822e4ffee14",
          "name": "Société 7bccc1",
          "city": "Dakar",
          "logo_document_id": null
        },
        "side": "fournisseur",
        "actions": [
          "prendre_en_charge",
          "accepter"
        ]
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

#### `GET /api/v1/ventes/:id`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "order": {
      "id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
      "number": "BC-2026-00001",
      "buyer_company_id": "070732dc-6386-4e38-b0d0-af4ef1e5f130",
      "supplier_company_id": "7861a4c0-687b-4d79-bf96-369ea894cd1c",
      "partnership_id": "d6717701-34e0-41d9-9778-cf857c31d9c3",
      "status": "validee",
      "revision": 5,
      "current_version_no": 2,
      "validated_version_no": 2,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 127200,
      "tax_total": 20880,
      "total": 148080,
      "lines_count": 3,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "52f85298-2086-472f-b75b-fb6bf6734204",
      "sent_at": "2026-10-21T11:14:23.028Z",
      "acknowledged_at": "2026-10-21T11:14:23.125Z",
      "validated_at": "2026-10-21T11:14:23.231Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:14:22.946Z",
      "updated_at": "2026-10-21T11:14:23.253Z",
      "buyer": {
        "id": "070732dc-6386-4e38-b0d0-af4ef1e5f130",
        "name": "Société 94028e",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562388",
        "email": "admin.968924ff39@test.sn",
        "ninea": "427686831",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "7861a4c0-687b-4d79-bf96-369ea894cd1c",
        "name": "Société 882580",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562389",
        "email": "admin.c8ff2b4234@test.sn",
        "ninea": "863721709",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [
        "en_preparation",
        "prete"
      ],
      "current_version": {
        "id": "2f30900c-c379-4d76-9235-293f7de59189",
        "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "e3c2b94d-80b3-4e53-b2c6-b48adc84e2dc",
        "status": "acceptee",
        "comment": "Stock partiel",
        "subtotal": 127200,
        "tax_total": 20880,
        "total": 148080,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:14:23.228Z",
        "decided_by": "52f85298-2086-472f-b75b-fb6bf6734204",
        "created_at": "2026-10-21T11:14:23.113Z",
        "lines": [
          {
            "id": "d5e7ec47-4dae-4982-a01c-0ce329ec887b",
            "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
            "version_id": "2f30900c-c379-4d76-9235-293f7de59189",
            "line_no": 1,
            "product_id": "fa23d27e-2b57-484d-84cb-40032bc4d15d",
            "reference": "REF-0a653c",
            "name": "Riz brisé bdea",
            "unit": "sac",
            "quantity": 8,
            "unit_price": 14500,
            "tax_rate": 18,
            "line_subtotal": 116000,
            "line_tax": 20880,
            "line_total": 136880,
            "change_type": "quantite_modifiee",
            "original_quantity": 10,
            "original_unit_price": 15000,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:23.116Z"
          },
          {
            "id": "545e8b24-d943-4e99-8778-1b5807f85d95",
            "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
            "version_id": "2f30900c-c379-4d76-9235-293f7de59189",
            "line_no": 2,
            "product_id": "9aef5615-7db7-46cb-be9a-b63e73bcdc08",
            "reference": "REF-b87e7b",
            "name": "Riz brisé 8e62",
            "unit": "kg",
            "quantity": 0,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 0,
            "line_tax": 0,
            "line_total": 0,
            "change_type": "indisponible",
            "original_quantity": 4,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": "Rupture fournisseur",
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:23.116Z"
          }
        ]
      },
      "validated_version": {
        "id": "2f30900c-c379-4d76-9235-293f7de59189",
        "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "e3c2b94d-80b3-4e53-b2c6-b48adc84e2dc",
        "status": "acceptee",
        "comment": "Stock partiel",
        "subtotal": 127200,
        "tax_total": 20880,
        "total": 148080,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:14:23.228Z",
        "decided_by": "52f85298-2086-472f-b75b-fb6bf6734204",
        "created_at": "2026-10-21T11:14:23.113Z",
        "lines": [
          {
            "id": "d5e7ec47-4dae-4982-a01c-0ce329ec887b",
            "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
            "version_id": "2f30900c-c379-4d76-9235-293f7de59189",
            "line_no": 1,
            "product_id": "fa23d27e-2b57-484d-84cb-40032bc4d15d",
            "reference": "REF-0a653c",
            "name": "Riz brisé bdea",
            "unit": "sac",
            "quantity": 8,
            "unit_price": 14500,
            "tax_rate": 18,
            "line_subtotal": 116000,
            "line_tax": 20880,
            "line_total": 136880,
            "change_type": "quantite_modifiee",
            "original_quantity": 10,
            "original_unit_price": 15000,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:23.116Z"
          },
          {
            "id": "545e8b24-d943-4e99-8778-1b5807f85d95",
            "order_id": "c7527882-9f18-4882-bda5-03dd0954f8c0",
            "version_id": "2f30900c-c379-4d76-9235-293f7de59189",
            "line_no": 2,
            "product_id": "9aef5615-7db7-46cb-be9a-b63e73bcdc08",
            "reference": "REF-b87e7b",
            "name": "Riz brisé 8e62",
            "unit": "kg",
            "quantity": 0,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 0,
            "line_tax": 0,
            "line_total": 0,
            "change_type": "indisponible",
            "original_quantity": 4,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": "Rupture fournisseur",
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:23.116Z"
          }
        ]
      }
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 404 `RESSOURCE_INTROUVABLE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/ventes/:id/versions`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `versions`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "versions": [
      {
        "id": "8eae8980-140b-4a64-b1cb-667fa67ae85b",
        "order_id": "7dfdad80-4de0-412f-9310-b010daefbdd4",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "439a61bc-2533-43d4-ae42-5282b5f5d058",
        "status": "proposee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T11:17:43.714Z",
        "lines": [
          {
            "id": "ea0693ac-9b5b-4a37-aa01-cc83804b85c9",
            "order_id": "7dfdad80-4de0-412f-9310-b010daefbdd4",
            "version_id": "8eae8980-140b-4a64-b1cb-667fa67ae85b",
            "line_no": 1,
            "product_id": "35a09806-6bca-40df-821f-90ca4d842366",
            "reference": "REF-af8cb4",
            "name": "Riz brisé a2bb",
            "unit": "sac",
            "quantity": 10,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 150000,
            "line_tax": 27000,
            "line_total": 177000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:17:43.723Z"
          },
          {
            "id": "d5dea7ec-f0a9-4fb1-85e5-b5e567d43924",
            "order_id": "7dfdad80-4de0-412f-9310-b010daefbdd4",
            "version_id": "8eae8980-140b-4a64-b1cb-667fa67ae85b",
            "line_no": 2,
            "product_id": "8c101035-2d0f-4780-9278-6278786707d1",
            "reference": "REF-081812",
            "name": "Riz brisé e5ec",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:17:43.723Z"
          }
        ]
      }
    ]
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/ventes/:id/historique`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `events`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "events": [
      {
        "id": 1,
        "order_id": "7dfdad80-4de0-412f-9310-b010daefbdd4",
        "type": "creation",
        "from_status": null,
        "to_status": "brouillon",
        "version_no": 1,
        "actor_user_id": "439a61bc-2533-43d4-ae42-5282b5f5d058",
        "actor_company_id": "2b512c85-e916-4ed4-ad14-daa410f28b7f",
        "actor_side": "acheteur",
        "message": null,
        "details": null,
        "created_at": "2026-10-21T11:17:43.745Z",
        "actor": {
          "id": "439a61bc-2533-43d4-ae42-5282b5f5d058",
          "first_name": "Awa",
          "last_name": "Diop"
        },
        "actorCompany": {
          "id": "2b512c85-e916-4ed4-ad14-daa410f28b7f",
          "name": "Société 471976"
        }
      },
      {
        "id": 2,
        "order_id": "7dfdad80-4de0-412f-9310-b010daefbdd4",
        "type": "envoi",
        "from_status": "brouillon",
        "to_status": "envoyee",
        "version_no": 1,
        "actor_user_id": "439a61bc-2533-43d4-ae42-5282b5f5d058",
        "actor_company_id": "2b512c85-e916-4ed4-ad14-daa410f28b7f",
        "actor_side": "acheteur",
        "message": null,
        "details": null,
        "created_at": "2026-10-21T11:17:43.842Z",
        "actor": {
          "id": "439a61bc-2533-43d4-ae42-5282b5f5d058",
          "first_name": "Awa",
          "last_name": "Diop"
        },
        "actorCompany": {
          "id": "2b512c85-e916-4ed4-ad14-daa410f28b7f",
          "name": "Société 471976"
        }
      }
    ]
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/ventes/:id/bon-de-commande.pdf`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `version` | integer | non | ≥ 1 |


**Réponse 200 :** fichier `application/pdf` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/prendre-en-charge`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.traiter`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `revision` | integer | non | ≥ 1 |


**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Commande prise en charge",
  "data": {
    "order": {
      "id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
      "number": "BC-2026-00001",
      "buyer_company_id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
      "supplier_company_id": "af268fde-5d53-4e93-ba82-669e68266203",
      "partnership_id": "de9971af-777e-4c8e-bf63-2095154d8c2b",
      "status": "en_attente_validation",
      "revision": 4,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": "Restaurant Chez Fatou, Plateau",
      "requested_delivery_date": "2026-10-21",
      "conditions": null,
      "currency": "XOF",
      "subtotal": 103500,
      "tax_total": 12960,
      "total": 116460,
      "lines_count": 3,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
      "sent_at": "2026-10-21T11:15:09.216Z",
      "acknowledged_at": "2026-10-21T11:15:09.349Z",
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:15:09.051Z",
      "updated_at": "2026-10-21T11:15:09.360Z",
      "buyer": {
        "id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778363353",
        "email": "admin.5c9a3f293d@test.sn",
        "ninea": "826181532",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "af268fde-5d53-4e93-ba82-669e68266203",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778363354",
        "email": "grossiste.ecf11055c9@test.sn",
        "ninea": "763516394",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [
        "accepter",
        "proposer"
      ],
      "current_version": {
        "id": "3e84cfc6-e768-4bff-a4f4-1e9967fcf0e9",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "status": "proposee",
        "comment": null,
        "subtotal": 103500,
        "tax_total": 12960,
        "total": 116460,
        "lines_count": 3,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T11:15:09.065Z",
        "lines": [
          {
            "id": "8c4ca76d-9c32-478f-b6bb-b7e375d34e23",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "3e84cfc6-e768-4bff-a4f4-1e9967fcf0e9",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.082Z"
          },
          {
            "id": "2853b2e0-3fa1-499b-87bb-38f5e875bd49",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "3e84cfc6-e768-4bff-a4f4-1e9967fcf0e9",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 50,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 22500,
            "line_tax": 0,
            "line_total": 22500,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.082Z"
          }
        ]
      },
      "validated_version": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/accepter`

§ 10 option 1 — accepter telle quelle ; option 2 — proposer une version modifiée.

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.traiter`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `revision` | integer | non | ≥ 1 |
| `comment` | string | non | `null` accepté · max 2000 car. |


**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Commande acceptée et validée",
  "data": {
    "order": {
      "id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
      "number": "BC-2026-00001",
      "buyer_company_id": "d67c3a2c-bec5-42a8-8b0a-1fb83ad74fb9",
      "supplier_company_id": "fd4e0640-dc35-4e96-84cf-3bfd2fb2fe14",
      "partnership_id": "cb1619e5-cbea-4d3b-8ca0-966a26ff448b",
      "status": "validee",
      "revision": 6,
      "current_version_no": 3,
      "validated_version_no": 3,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 115000,
      "tax_total": 18900,
      "total": 133900,
      "lines_count": 2,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "22362569-1e1d-4185-abd3-e060f0aac0bd",
      "sent_at": "2026-10-21T11:14:24.264Z",
      "acknowledged_at": "2026-10-21T11:14:24.354Z",
      "validated_at": "2026-10-21T11:14:24.561Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:14:24.182Z",
      "updated_at": "2026-10-21T11:14:24.584Z",
      "buyer": {
        "id": "d67c3a2c-bec5-42a8-8b0a-1fb83ad74fb9",
        "name": "Société e8d1e3",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562392",
        "email": "admin.6bb9b4c298@test.sn",
        "ninea": "315441692",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "fd4e0640-dc35-4e96-84cf-3bfd2fb2fe14",
        "name": "Société 39ea37",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562393",
        "email": "admin.3e5f350d93@test.sn",
        "ninea": "788032004",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [
        "en_preparation",
        "prete"
      ],
      "current_version": {
        "id": "7e2a28f6-32e7-4314-83e6-234aee277183",
        "order_id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
        "version_no": 3,
        "proposed_by_side": "acheteur",
        "proposed_by": "22362569-1e1d-4185-abd3-e060f0aac0bd",
        "status": "acceptee",
        "comment": "Il nous faut au moins 7 sacs",
        "subtotal": 115000,
        "tax_total": 18900,
        "total": 133900,
        "lines_count": 2,
        "decided_at": "2026-10-21T11:14:24.559Z",
        "decided_by": "db2a3c28-d922-40f2-aed8-3c2e39e4ddcf",
        "created_at": "2026-10-21T11:14:24.436Z",
        "lines": [
          {
            "id": "09147881-9cd9-4dfa-801f-2a2078c8bbd6",
            "order_id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
            "version_id": "7e2a28f6-32e7-4314-83e6-234aee277183",
            "line_no": 1,
            "product_id": "dbd2d8bc-76c3-455d-b208-2fea91d4ba44",
            "reference": "REF-488399",
            "name": "Riz brisé 3925",
            "unit": "sac",
            "quantity": 7,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 105000,
            "line_tax": 18900,
            "line_total": 123900,
            "change_type": "quantite_modifiee",
            "original_quantity": 5,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:24.439Z"
          },
          {
            "id": "f051bbd4-5922-4720-b7d7-c25804c06851",
            "order_id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
            "version_id": "7e2a28f6-32e7-4314-83e6-234aee277183",
            "line_no": 2,
            "product_id": "1f311ade-fca3-4a40-94a9-3822ba88d6ea",
            "reference": "REF-3ec7ed",
            "name": "Riz brisé 2d69",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:24.439Z"
          }
        ]
      },
      "validated_version": {
        "id": "7e2a28f6-32e7-4314-83e6-234aee277183",
        "order_id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
        "version_no": 3,
        "proposed_by_side": "acheteur",
        "proposed_by": "22362569-1e1d-4185-abd3-e060f0aac0bd",
        "status": "acceptee",
        "comment": "Il nous faut au moins 7 sacs",
        "subtotal": 115000,
        "tax_total": 18900,
        "total": 133900,
        "lines_count": 2,
        "decided_at": "2026-10-21T11:14:24.559Z",
        "decided_by": "db2a3c28-d922-40f2-aed8-3c2e39e4ddcf",
        "created_at": "2026-10-21T11:14:24.436Z",
        "lines": [
          {
            "id": "09147881-9cd9-4dfa-801f-2a2078c8bbd6",
            "order_id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
            "version_id": "7e2a28f6-32e7-4314-83e6-234aee277183",
            "line_no": 1,
            "product_id": "dbd2d8bc-76c3-455d-b208-2fea91d4ba44",
            "reference": "REF-488399",
            "name": "Riz brisé 3925",
            "unit": "sac",
            "quantity": 7,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 105000,
            "line_tax": 18900,
            "line_total": 123900,
            "change_type": "quantite_modifiee",
            "original_quantity": 5,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:24.439Z"
          },
          {
            "id": "f051bbd4-5922-4720-b7d7-c25804c06851",
            "order_id": "9a00a9ad-514b-40b0-a83b-0da2c8cdb1a3",
            "version_id": "7e2a28f6-32e7-4314-83e6-234aee277183",
            "line_no": 2,
            "product_id": "1f311ade-fca3-4a40-94a9-3822ba88d6ea",
            "reference": "REF-3ec7ed",
            "name": "Riz brisé 2d69",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:24.439Z"
          }
        ]
      }
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 403 `PERMISSION_REFUSEE` · 409 `AUCUNE_PROPOSITION` · 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/proposer`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.traiter`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `lines` | tableau de object | **oui** | min 1 élément(s) · max 500 élément(s) |
| `lines[].line_no` | integer | non | ≥ 1 |
| `lines[].product_id` | string (uuid) | non |  |
| `lines[].quantity` | number | non | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max |
| `lines[].unit_price` | integer | non | ≥ 0 · ≤ 1000000000000 |
| `lines[].unavailable` | boolean | non |  |
| `lines[].substitute_for_line_no` | integer | non | ≥ 1 |
| `lines[].comment` | string | non | `null` accepté · max 500 car. |
| `comment` | string | non | `null` accepté · max 2000 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
  "lines": [
    {
      "line_no": 2,
      "quantity": 40
    },
    {
      "line_no": 3,
      "unavailable": true
    }
  ]
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Proposition envoyée au client",
  "data": {
    "order": {
      "id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
      "number": "BC-2026-00001",
      "buyer_company_id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
      "supplier_company_id": "af268fde-5d53-4e93-ba82-669e68266203",
      "partnership_id": "de9971af-777e-4c8e-bf63-2095154d8c2b",
      "status": "proposition_modifiee",
      "revision": 5,
      "current_version_no": 2,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": "Restaurant Chez Fatou, Plateau",
      "requested_delivery_date": "2026-10-21",
      "conditions": null,
      "currency": "XOF",
      "subtotal": 90000,
      "tax_total": 12960,
      "total": 102960,
      "lines_count": 3,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
      "sent_at": "2026-10-21T11:15:09.216Z",
      "acknowledged_at": "2026-10-21T11:15:09.349Z",
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:15:09.051Z",
      "updated_at": "2026-10-21T11:15:09.496Z",
      "buyer": {
        "id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778363353",
        "email": "admin.5c9a3f293d@test.sn",
        "ninea": "826181532",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "af268fde-5d53-4e93-ba82-669e68266203",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778363354",
        "email": "grossiste.ecf11055c9@test.sn",
        "ninea": "763516394",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [],
      "current_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "proposee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      },
      "validated_version": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `AUCUNE_MODIFICATION` · 422 `COMMANDE_VIDE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/refuser`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.traiter`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `reason` | string | **oui** | min 3 car. · max 1000 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reason": "Hors zone de livraison"
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Commande refusée",
  "data": {
    "order": {
      "id": "5fe8b6cd-4ef5-4e34-aef6-5c9e4d90a3fe",
      "number": "BC-2026-00002",
      "buyer_company_id": "0e3b1dbb-e147-4ae2-af9b-12db78a35297",
      "supplier_company_id": "1fe5a97d-d989-46c7-9d70-6fe0c0614df2",
      "partnership_id": "ff27f337-4b4c-490a-b4f2-daf271543b6a",
      "status": "refusee",
      "revision": 4,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 160000,
      "tax_total": 27000,
      "total": 187000,
      "lines_count": 2,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": "Hors zone de livraison",
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "f900907c-a643-438c-a85b-db69341c5fe7",
      "sent_at": "2026-10-21T11:14:22.438Z",
      "acknowledged_at": null,
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": "2026-10-21T11:14:22.512Z",
      "cancelled_at": null,
      "created_at": "2026-10-21T11:14:22.364Z",
      "updated_at": "2026-10-21T11:14:22.532Z",
      "buyer": {
        "id": "0e3b1dbb-e147-4ae2-af9b-12db78a35297",
        "name": "Société 902e41",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562386",
        "email": "admin.cd75c5079e@test.sn",
        "ninea": "660473380",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "1fe5a97d-d989-46c7-9d70-6fe0c0614df2",
        "name": "Société 914c0f",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562387",
        "email": "admin.dfc746f7a7@test.sn",
        "ninea": "670922911",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [],
      "current_version": {
        "id": "dd2bff1b-baf8-4592-97e2-1ec2fddad8fc",
        "order_id": "5fe8b6cd-4ef5-4e34-aef6-5c9e4d90a3fe",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "f900907c-a643-438c-a85b-db69341c5fe7",
        "status": "refusee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T11:14:22.509Z",
        "decided_by": "2dc87040-688e-454e-ba3a-b6c0c60bc7f9",
        "created_at": "2026-10-21T11:14:22.369Z",
        "lines": [
          {
            "id": "ed706d09-1812-4661-8c26-08d122354e12",
            "order_id": "5fe8b6cd-4ef5-4e34-aef6-5c9e4d90a3fe",
            "version_id": "dd2bff1b-baf8-4592-97e2-1ec2fddad8fc",
            "line_no": 1,
            "product_id": "8a7c1d94-1666-41be-be30-eee4ff89f4b0",
            "reference": "REF-e1cbeb",
            "name": "Riz brisé 2a86",
            "unit": "sac",
            "quantity": 10,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 150000,
            "line_tax": 27000,
            "line_total": 177000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:22.373Z"
          },
          {
            "id": "82bd2e7a-3e82-40b1-a303-2eec0378beaa",
            "order_id": "5fe8b6cd-4ef5-4e34-aef6-5c9e4d90a3fe",
            "version_id": "dd2bff1b-baf8-4592-97e2-1ec2fddad8fc",
            "line_no": 2,
            "product_id": "f9d3b8e5-c56d-4e0d-95e7-34fab2019266",
            "reference": "REF-991a87",
            "name": "Riz brisé d26d",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:22.373Z"
          }
        ]
      },
      "validated_version": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/statut`

§ 12 — statuts opérationnels : en préparation, prête.

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.traiter`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `status` | string | **oui** | valeurs : `en_preparation`, `prete` |
| `note` | string | non | `null` accepté · max 1000 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "status": "prete"
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Statut mis à jour",
  "data": {
    "order": {
      "id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
      "number": "BC-2026-00001",
      "buyer_company_id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
      "supplier_company_id": "af268fde-5d53-4e93-ba82-669e68266203",
      "partnership_id": "de9971af-777e-4c8e-bf63-2095154d8c2b",
      "status": "prete",
      "revision": 8,
      "current_version_no": 2,
      "validated_version_no": 2,
      "buyer_reference": null,
      "delivery_address": "Restaurant Chez Fatou, Plateau",
      "requested_delivery_date": "2026-10-21",
      "conditions": null,
      "currency": "XOF",
      "subtotal": 90000,
      "tax_total": 12960,
      "total": 102960,
      "lines_count": 3,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
      "sent_at": "2026-10-21T11:15:09.216Z",
      "acknowledged_at": "2026-10-21T11:15:09.349Z",
      "validated_at": "2026-10-21T11:15:09.571Z",
      "preparation_at": "2026-10-21T11:15:09.652Z",
      "ready_at": "2026-10-21T11:15:09.728Z",
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:15:09.051Z",
      "updated_at": "2026-10-21T11:15:09.747Z",
      "buyer": {
        "id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778363353",
        "email": "admin.5c9a3f293d@test.sn",
        "ninea": "826181532",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "af268fde-5d53-4e93-ba82-669e68266203",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778363354",
        "email": "grossiste.ecf11055c9@test.sn",
        "ninea": "763516394",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [
        "livrer"
      ],
      "current_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:15:09.568Z",
        "decided_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      },
      "validated_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:15:09.568Z",
        "decided_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      }
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/livrer`

§ 13 — livraison, avec bon de livraison facultatif (photo ou PDF).

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.traiter`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative
- **Fichier :** champ `fichier` (facultatif) — une image (JPEG, PNG, WebP) ou un PDF

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Champs du formulaire (multipart)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `note` | string | non | `null` accepté · max 1000 car. |
| `revision` | integer | non | ≥ 1 |


**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Commande livrée",
  "data": {
    "order": {
      "id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
      "number": "BC-2026-00001",
      "buyer_company_id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
      "supplier_company_id": "af268fde-5d53-4e93-ba82-669e68266203",
      "partnership_id": "de9971af-777e-4c8e-bf63-2095154d8c2b",
      "status": "livree",
      "revision": 9,
      "current_version_no": 2,
      "validated_version_no": 2,
      "buyer_reference": null,
      "delivery_address": "Restaurant Chez Fatou, Plateau",
      "requested_delivery_date": "2026-10-21",
      "conditions": null,
      "currency": "XOF",
      "subtotal": 90000,
      "tax_total": 12960,
      "total": 102960,
      "lines_count": 3,
      "delivery_note": "Livré à 9 h",
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
      "sent_at": "2026-10-21T11:15:09.216Z",
      "acknowledged_at": "2026-10-21T11:15:09.349Z",
      "validated_at": "2026-10-21T11:15:09.571Z",
      "preparation_at": "2026-10-21T11:15:09.652Z",
      "ready_at": "2026-10-21T11:15:09.728Z",
      "delivered_at": "2026-10-21T11:15:09.826Z",
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "created_at": "2026-10-21T11:15:09.051Z",
      "updated_at": "2026-10-21T11:15:09.845Z",
      "buyer": {
        "id": "b759f293-976c-44fd-b9a9-b66e924f02f1",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778363353",
        "email": "admin.5c9a3f293d@test.sn",
        "ninea": "826181532",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "af268fde-5d53-4e93-ba82-669e68266203",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778363354",
        "email": "grossiste.ecf11055c9@test.sn",
        "ninea": "763516394",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [],
      "current_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:15:09.568Z",
        "decided_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      },
      "validated_version": {
        "id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
        "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "ebd7f16f-a5a8-4132-922a-459db15350f7",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T11:15:09.568Z",
        "decided_by": "979fff62-0c0f-4589-b3d6-f4179511059f",
        "created_at": "2026-10-21T11:15:09.460Z",
        "lines": [
          {
            "id": "7086d0aa-6f51-433d-ab58-ff05261c92fe",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 1,
            "product_id": "d24f77bb-5daa-4638-8a9e-77dda096a996",
            "reference": "HUILE-20L",
            "name": "Huile 20 L",
            "unit": "piece",
            "quantity": 3,
            "unit_price": 24000,
            "tax_rate": 18,
            "line_subtotal": 72000,
            "line_tax": 12960,
            "line_total": 84960,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          },
          {
            "id": "c5f51045-250e-4f63-aca6-6876b313da68",
            "order_id": "2f13a3ae-6e2b-4a67-8ce1-6fb8c060332e",
            "version_id": "6c6c2802-ae50-4a55-9280-af9bb3dc6579",
            "line_no": 2,
            "product_id": "cdb2ba2c-3c36-4939-b7ed-510f35c3088a",
            "reference": "OIGNON",
            "name": "Oignons",
            "unit": "kg",
            "quantity": 40,
            "unit_price": 450,
            "tax_rate": 0,
            "line_subtotal": 18000,
            "line_tax": 0,
            "line_total": 18000,
            "change_type": "quantite_modifiee",
            "original_quantity": 50,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:15:09.464Z"
          }
        ]
      }
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/annuler`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.traiter`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `reason` | string | **oui** | min 3 car. · max 1000 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reason": "Camion en panne"
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Commande annulée",
  "data": {
    "order": {
      "id": "270af1c2-cdc0-4095-afad-4c75d151403c",
      "number": "BC-2026-00001",
      "buyer_company_id": "6675ec55-ef99-44b7-bb28-70667767eee4",
      "supplier_company_id": "7bd04c6e-ac3b-4346-b7f5-065ecb4e4662",
      "partnership_id": "f6e8c278-77c3-4086-a780-7a7660181d30",
      "status": "annulee",
      "revision": 5,
      "current_version_no": 1,
      "validated_version_no": 1,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 160000,
      "tax_total": 27000,
      "total": 187000,
      "lines_count": 2,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": "Camion en panne",
      "refusal_reason": null,
      "cancelled_by_side": "fournisseur",
      "template_id": null,
      "created_by": "b98342a1-14e2-45d1-ade5-947e57598b38",
      "sent_at": "2026-10-21T11:14:47.685Z",
      "acknowledged_at": null,
      "validated_at": "2026-10-21T11:14:47.765Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": "2026-10-21T11:14:47.830Z",
      "created_at": "2026-10-21T11:14:47.567Z",
      "updated_at": "2026-10-21T11:14:47.849Z",
      "buyer": {
        "id": "6675ec55-ef99-44b7-bb28-70667767eee4",
        "name": "Société 04b7fd",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562416",
        "email": "admin.05cfc4167b@test.sn",
        "ninea": "250890672",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "7bd04c6e-ac3b-4346-b7f5-065ecb4e4662",
        "name": "Société 4ddd05",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776562417",
        "email": "admin.3a98a0e51f@test.sn",
        "ninea": "711018645",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [],
      "current_version": {
        "id": "15ecaf79-2f35-48c3-80e7-19603e8957e4",
        "order_id": "270af1c2-cdc0-4095-afad-4c75d151403c",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "b98342a1-14e2-45d1-ade5-947e57598b38",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T11:14:47.762Z",
        "decided_by": "af393f14-ab5b-4271-b1b8-70bf42865ecc",
        "created_at": "2026-10-21T11:14:47.575Z",
        "lines": [
          {
            "id": "59410c1d-706e-48a3-b51c-1aac57a135ce",
            "order_id": "270af1c2-cdc0-4095-afad-4c75d151403c",
            "version_id": "15ecaf79-2f35-48c3-80e7-19603e8957e4",
            "line_no": 1,
            "product_id": "1f170c61-292a-4372-8300-055593058557",
            "reference": "REF-64e399",
            "name": "Riz brisé 9777",
            "unit": "sac",
            "quantity": 10,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 150000,
            "line_tax": 27000,
            "line_total": 177000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:47.582Z"
          },
          {
            "id": "04115531-1678-42f1-95c8-2ac50904dfae",
            "order_id": "270af1c2-cdc0-4095-afad-4c75d151403c",
            "version_id": "15ecaf79-2f35-48c3-80e7-19603e8957e4",
            "line_no": 2,
            "product_id": "670c4ae7-a280-4804-a728-62fb2ae28dcb",
            "reference": "REF-2df3e3",
            "name": "Riz brisé 3139",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:47.582Z"
          }
        ]
      },
      "validated_version": {
        "id": "15ecaf79-2f35-48c3-80e7-19603e8957e4",
        "order_id": "270af1c2-cdc0-4095-afad-4c75d151403c",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "b98342a1-14e2-45d1-ade5-947e57598b38",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T11:14:47.762Z",
        "decided_by": "af393f14-ab5b-4271-b1b8-70bf42865ecc",
        "created_at": "2026-10-21T11:14:47.575Z",
        "lines": [
          {
            "id": "59410c1d-706e-48a3-b51c-1aac57a135ce",
            "order_id": "270af1c2-cdc0-4095-afad-4c75d151403c",
            "version_id": "15ecaf79-2f35-48c3-80e7-19603e8957e4",
            "line_no": 1,
            "product_id": "1f170c61-292a-4372-8300-055593058557",
            "reference": "REF-64e399",
            "name": "Riz brisé 9777",
            "unit": "sac",
            "quantity": 10,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 150000,
            "line_tax": 27000,
            "line_total": 177000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:47.582Z"
          },
          {
            "id": "04115531-1678-42f1-95c8-2ac50904dfae",
            "order_id": "270af1c2-cdc0-4095-afad-4c75d151403c",
            "version_id": "15ecaf79-2f35-48c3-80e7-19603e8957e4",
            "line_no": 2,
            "product_id": "670c4ae7-a280-4804-a728-62fb2ae28dcb",
            "reference": "REF-2df3e3",
            "name": "Riz brisé 3139",
            "unit": "kg",
            "quantity": 4,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 10000,
            "line_tax": 0,
            "line_total": 10000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "created_at": "2026-10-21T11:14:47.582Z"
          }
        ]
      }
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACTION_RESERVEE_AUTRE_PARTIE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/commentaires`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.lire`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `message` | string | **oui** | max 2000 car. · min 1 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "message": "Livraison possible jeudi ?"
}
```

</details>

**Réponse 201 :** `data` contient `event`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Message envoyé",
  "data": {
    "event": {
      "id": 3,
      "order_id": "466f417e-9702-4c1f-bdd1-76c30c58d7e1",
      "type": "commentaire",
      "from_status": null,
      "to_status": null,
      "version_no": null,
      "actor_user_id": "60921f18-e4b1-450d-ab95-669c2733f96b",
      "actor_company_id": "9b9e0219-9fbd-4b0f-889d-9f9eefc069f8",
      "actor_side": "fournisseur",
      "message": "Livraison possible jeudi ?",
      "details": null,
      "created_at": "2026-10-21T11:14:15.420Z"
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/pieces-jointes`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `documents.ecrire`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative
- **Fichier :** champ `fichier` (**obligatoire**) — un PDF ou une image

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Champs du formulaire (multipart)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `description` | string | non | `null` accepté · max 255 car. |


**Réponse 201 :** `data` contient `document`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Pièce jointe ajoutée",
  "data": {
    "document": {
      "id": "020b4515-9b62-4385-b83c-f20cfe61d065",
      "company_id": "0aff92a7-d4e3-4f7f-a75a-3e7a55818c29",
      "category": "piece_jointe",
      "visibility": "partenaire",
      "mime_type": "application/pdf",
      "size_bytes": 69,
      "original_name": "fiche-technique.pdf",
      "has_thumbnail": false,
      "created_at": "2026-10-21T11:15:44.325Z",
      "url": "/api/v1/documents/020b4515-9b62-4385-b83c-f20cfe61d065/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 16. Factures

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/factures` | membre d’une entreprise active |
| POST | `/api/v1/factures` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/factures/:id` | membre d’une entreprise active |
| GET | `/api/v1/factures/:id/pdf` | membre d’une entreprise active |
| POST | `/api/v1/factures/:id/annuler` | membre d’une entreprise active — entreprise fournisseur ou mixte |

#### `GET /api/v1/factures`

- **Accès :** membre d’une entreprise active — permission `factures.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `sens` | string | non | valeurs : `emises`, `recues` |
| `status` | string | non | max 200 car. · format `/^(emise\|partiellement_payee\|payee\|en_retard\|annulee)(,(emise\|partiellement_payee\|payee\|en_retard\|annulee))*$/` |
| `partner_id` | string (uuid) | non |  |
| `impayees` | boolean | non |  |
| `q` | string | non | max 100 car. |
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `modifie_depuis` | date | non |  |
| `tri` | string | non | valeurs : `issue_date`, `-issue_date`, `due_date`, `-due_date`, `total`, `-total`, `number`, `-number`, `created_at`, `-created_at` |


Exemple de query string réelle : `?sens=recues`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `number`, `supplier_company_id`, `buyer_company_id`, `partnership_id`, `order_id`, `status`, `source`, `issue_date`, `due_date`, `currency`, `subtotal`, `tax_total`, `total`, `amount_paid`, `template_id`, `file_document_id`, `note`, `due_soon_notified_at`, `overdue_notified_at`, `cancelled_at`, `cancellation_reason`, `created_by`, `created_at`, `updated_at`, `supplier`, `buyer`, `order`, `direction`, `balance_due`, `pdf_url`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "fb5caa54-dfe3-4f9c-98d7-56c661bfc8dd",
        "number": "FAC-2026-00001",
        "supplier_company_id": "05465084-4b2b-444d-8522-6ff988f0941f",
        "buyer_company_id": "360a3720-f3a5-41c3-b260-99fd22bbb4c7",
        "partnership_id": "39313abf-1674-4b40-9d74-4e45afabc79f",
        "order_id": "1dbecdb7-eabc-416a-8fa1-dd8b94cb97b3",
        "status": "emise",
        "source": "generee",
        "issue_date": "2026-10-21",
        "due_date": "2026-11-05",
        "currency": "XOF",
        "subtotal": 120000,
        "tax_total": 21600,
        "total": 141600,
        "amount_paid": 0,
        "template_id": null,
        "file_document_id": null,
        "note": "Merci de votre confiance",
        "due_soon_notified_at": null,
        "overdue_notified_at": null,
        "cancelled_at": null,
        "cancellation_reason": null,
        "created_by": "dc6675eb-b573-4f59-b7e9-0e5962625c20",
        "created_at": "2026-10-21T11:14:22.298Z",
        "updated_at": "2026-10-21T11:14:22.298Z",
        "supplier": {
          "id": "05465084-4b2b-444d-8522-6ff988f0941f",
          "name": "Société 3e8593",
          "city": "Dakar",
          "logo_document_id": null
        },
        "buyer": {
          "id": "360a3720-f3a5-41c3-b260-99fd22bbb4c7",
          "name": "Société dd43b4",
          "city": "Dakar",
          "logo_document_id": null
        },
        "order": {
          "id": "1dbecdb7-eabc-416a-8fa1-dd8b94cb97b3",
          "number": "BC-2026-00001",
          "buyer_reference": null,
          "status": "facturee"
        },
        "direction": "recue",
        "balance_due": 141600,
        "pdf_url": "/api/v1/factures/fb5caa54-dfe3-4f9c-98d7-56c661bfc8dd/pdf"
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

#### `POST /api/v1/factures`

Facture générée (JSON) ou transmise (multipart avec le fichier du fournisseur, champ « fichier »).

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `factures.emettre`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative
- **Fichier :** champ `fichier` (facultatif) — une image (JPEG, PNG, WebP) ou un PDF

**Champs du formulaire (multipart)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `order_id` | string (uuid) | **oui** |  |
| `issue_date` | string | non | date `AAAA-MM-JJ` |
| `due_date` | string | non | date `AAAA-MM-JJ` |
| `note` | string | non | `null` accepté · max 2000 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "order_id": "e3a618f6-6216-4339-b41a-aac60cfede3b"
}
```

</details>

**Réponse 201 :** `data` contient `invoice`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Facture émise et transmise au client",
  "data": {
    "invoice": {
      "id": "00c54c6e-8b43-4907-964f-9be1a0866b0c",
      "number": "FAC-2026-00001",
      "supplier_company_id": "711fb121-7abf-42f2-a6dd-726ac748edd4",
      "buyer_company_id": "32cdb705-80a7-44fd-b753-1ba1346d2336",
      "partnership_id": "055e7a94-d403-422f-8899-eace46c18762",
      "order_id": "e3a618f6-6216-4339-b41a-aac60cfede3b",
      "status": "partiellement_payee",
      "source": "generee",
      "issue_date": "2026-10-21",
      "due_date": "2026-11-20",
      "currency": "XOF",
      "subtotal": 160000,
      "tax_total": 27000,
      "total": 187000,
      "amount_paid": 50000,
      "template_id": null,
      "file_document_id": null,
      "note": null,
      "due_soon_notified_at": null,
      "overdue_notified_at": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "created_by": "d10f1fba-4c03-46d2-ac35-87560cdf4058",
      "created_at": "2026-10-21T11:14:25.534Z",
      "updated_at": "2026-10-21T11:14:25.583Z",
      "supplier": {
        "id": "711fb121-7abf-42f2-a6dd-726ac748edd4",
        "name": "Société c8bfa6",
        "city": "Dakar",
        "logo_document_id": null
      },
      "buyer": {
        "id": "32cdb705-80a7-44fd-b753-1ba1346d2336",
        "name": "Société 615b00",
        "city": "Dakar",
        "logo_document_id": null
      },
      "order": {
        "id": "e3a618f6-6216-4339-b41a-aac60cfede3b",
        "number": "BC-2026-00001",
        "buyer_reference": null,
        "status": "facturee"
      },
      "lines": [
        {
          "id": "9fa4a9d9-c5c9-4f22-ae76-979755f251a2",
          "invoice_id": "00c54c6e-8b43-4907-964f-9be1a0866b0c",
          "line_no": 1,
          "product_id": "5a925f64-344a-4b11-aa29-f0f6bf9299f1",
          "reference": "REF-c3ebf4",
          "name": "Riz brisé 4979",
          "unit": "sac",
          "quantity": 10,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 150000,
          "line_tax": 27000,
          "line_total": 177000
        },
        {
          "id": "669aa997-419c-4d48-8e13-9a01a3061be8",
          "invoice_id": "00c54c6e-8b43-4907-964f-9be1a0866b0c",
          "line_no": 2,
          "product_id": "1675dc84-7d27-49ac-8144-ea53b3b04fbe",
          "reference": "REF-1368de",
          "name": "Riz brisé 6116",
          "unit": "kg",
          "quantity": 4,
          "unit_price": 2500,
          "tax_rate": 0,
          "line_subtotal": 10000,
          "line_tax": 0,
          "line_total": 10000
        }
      ],
      "direction": "emise",
      "balance_due": 137000,
      "pdf_url": "/api/v1/factures/00c54c6e-8b43-4907-964f-9be1a0866b0c/pdf",
      "allocations": [
        {
          "id": "39c1a6ca-87e8-46df-8d23-e2711c0fbdf9",
          "payment_id": "3cb5c9aa-9773-4fe8-b99d-d075550b8489",
          "invoice_id": "00c54c6e-8b43-4907-964f-9be1a0866b0c",
          "amount": 50000,
          "cancelled_at": null,
          "created_at": "2026-10-21T11:14:25.565Z",
          "payment": {
            "id": "3cb5c9aa-9773-4fe8-b99d-d075550b8489",
            "reference": "PAI-2026-00001",
            "method": "especes",
            "paid_on": "2026-10-21",
            "status": "confirme",
            "amount": 50000
          }
        }
      ],
      "file": null
    }
  }
}
```

</details>

**Erreurs observées :** 403 `PERMISSION_REFUSEE` · 403 `PROFIL_ENTREPRISE_INCOMPATIBLE` · 409 `COMMANDE_NON_FACTURABLE`.

---

#### `GET /api/v1/factures/:id`

- **Accès :** membre d’une entreprise active — permission `factures.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `invoice`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "invoice": {
      "id": "0a9e1ef1-eeba-4b9c-85bf-5fc19d732501",
      "number": "FAC-2026-00001",
      "supplier_company_id": "21c9045b-2e05-41dc-9b6f-b713ffdaf109",
      "buyer_company_id": "6acc3fd7-05d9-421f-b3a7-f142503d32b7",
      "partnership_id": "4e0c2f18-03c2-4744-a86f-e1a4b9b2f973",
      "order_id": "93c7306c-dade-4003-b518-22d5e4b3cdf4",
      "status": "payee",
      "source": "generee",
      "issue_date": "2026-10-21",
      "due_date": "2026-11-20",
      "currency": "XOF",
      "subtotal": 160000,
      "tax_total": 27000,
      "total": 187000,
      "amount_paid": 187000,
      "template_id": null,
      "file_document_id": null,
      "note": null,
      "due_soon_notified_at": null,
      "overdue_notified_at": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "created_by": "db530fa6-f972-4c85-a0b9-85b2923dfa1f",
      "created_at": "2026-10-21T11:14:27.873Z",
      "updated_at": "2026-10-21T11:14:28.131Z",
      "supplier": {
        "id": "21c9045b-2e05-41dc-9b6f-b713ffdaf109",
        "name": "Société b385e3",
        "city": "Dakar",
        "logo_document_id": null
      },
      "buyer": {
        "id": "6acc3fd7-05d9-421f-b3a7-f142503d32b7",
        "name": "Société 015c73",
        "city": "Dakar",
        "logo_document_id": null
      },
      "order": {
        "id": "93c7306c-dade-4003-b518-22d5e4b3cdf4",
        "number": "BC-2026-00001",
        "buyer_reference": null,
        "status": "terminee"
      },
      "lines": [
        {
          "id": "26b7cd9f-be43-49a2-90b0-7749be916384",
          "invoice_id": "0a9e1ef1-eeba-4b9c-85bf-5fc19d732501",
          "line_no": 1,
          "product_id": "fcd7e2de-b9f5-4ad0-935a-6571dff67f31",
          "reference": "REF-a57989",
          "name": "Riz brisé e9b3",
          "unit": "sac",
          "quantity": 10,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 150000,
          "line_tax": 27000,
          "line_total": 177000
        },
        {
          "id": "4694dee4-0678-4a07-8645-98b8a65599e2",
          "invoice_id": "0a9e1ef1-eeba-4b9c-85bf-5fc19d732501",
          "line_no": 2,
          "product_id": "bd056fbd-1318-4edb-8996-23f56b9ad4de",
          "reference": "REF-9f7412",
          "name": "Riz brisé d76e",
          "unit": "kg",
          "quantity": 4,
          "unit_price": 2500,
          "tax_rate": 0,
          "line_subtotal": 10000,
          "line_tax": 0,
          "line_total": 10000
        }
      ],
      "direction": "recue",
      "balance_due": 0,
      "pdf_url": "/api/v1/factures/0a9e1ef1-eeba-4b9c-85bf-5fc19d732501/pdf",
      "allocations": [
        {
          "id": "0dfee451-e01b-428f-ae33-4b7947276bcc",
          "payment_id": "261ef558-16f8-44ea-8981-15ed06dfe8df",
          "invoice_id": "0a9e1ef1-eeba-4b9c-85bf-5fc19d732501",
          "amount": 100000,
          "cancelled_at": null,
          "created_at": "2026-10-21T11:14:27.993Z",
          "payment": {
            "id": "261ef558-16f8-44ea-8981-15ed06dfe8df",
            "reference": "PAI-2026-00001",
            "method": "wave",
            "paid_on": "2026-10-21",
            "status": "confirme",
            "amount": 100000
          }
        },
        {
          "id": "c78356c1-dd60-4da1-b322-fc700650e603",
          "payment_id": "3d8f648a-edd0-424c-a3d3-31f1585d76e7",
          "invoice_id": "0a9e1ef1-eeba-4b9c-85bf-5fc19d732501",
          "amount": 87000,
          "cancelled_at": null,
          "created_at": "2026-10-21T11:14:28.117Z",
          "payment": {
            "id": "3d8f648a-edd0-424c-a3d3-31f1585d76e7",
            "reference": "PAI-2026-00002",
            "method": "virement",
            "paid_on": "2026-10-21",
            "status": "confirme",
            "amount": 87000
          }
        }
      ],
      "file": null
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/factures/:id/pdf`

- **Accès :** membre d’une entreprise active — permission `factures.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** fichier `application/pdf` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/factures/:id/annuler`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `factures.emettre`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
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
  "reason": "Erreur de prix"
}
```

</details>

**Réponse 200 :** `data` contient `invoice`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Facture annulée",
  "data": {
    "invoice": {
      "id": "ad4723e7-5993-4736-af6e-4f1650c8780b",
      "number": "FAC-2026-00001",
      "supplier_company_id": "a4d336d5-8cce-4651-a5c3-e11401950c3b",
      "buyer_company_id": "3b9406d8-0825-42dc-b0c2-94883cca6449",
      "partnership_id": "0dc5df32-f077-44ee-9cd9-04ac7add85a0",
      "order_id": "18fbd1ff-bfa9-452b-a046-28cf8b036695",
      "status": "annulee",
      "source": "generee",
      "issue_date": "2026-10-21",
      "due_date": "2026-11-20",
      "currency": "XOF",
      "subtotal": 160000,
      "tax_total": 27000,
      "total": 187000,
      "amount_paid": 0,
      "template_id": null,
      "file_document_id": null,
      "note": null,
      "due_soon_notified_at": null,
      "overdue_notified_at": null,
      "cancelled_at": "2026-10-21T11:14:24.513Z",
      "cancellation_reason": "Erreur de prix",
      "created_by": "733f0c95-86c5-464a-9e79-2f254be3feab",
      "created_at": "2026-10-21T11:14:24.414Z",
      "updated_at": "2026-10-21T11:14:24.514Z",
      "supplier": {
        "id": "a4d336d5-8cce-4651-a5c3-e11401950c3b",
        "name": "Société 51d7e2",
        "city": "Dakar",
        "logo_document_id": null
      },
      "buyer": {
        "id": "3b9406d8-0825-42dc-b0c2-94883cca6449",
        "name": "Société 3a65c3",
        "city": "Dakar",
        "logo_document_id": null
      },
      "order": {
        "id": "18fbd1ff-bfa9-452b-a046-28cf8b036695",
        "number": "BC-2026-00001",
        "buyer_reference": null,
        "status": "reception_confirmee"
      },
      "lines": [
        {
          "id": "db4761ce-f745-459b-82d5-87f668e1ff0a",
          "invoice_id": "ad4723e7-5993-4736-af6e-4f1650c8780b",
          "line_no": 1,
          "product_id": "2e83c227-73ea-4965-b23d-38fe33ad1482",
          "reference": "REF-bb0bac",
          "name": "Riz brisé 5f74",
          "unit": "sac",
          "quantity": 10,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 150000,
          "line_tax": 27000,
          "line_total": 177000
        },
        {
          "id": "445c48be-44bd-4cfe-93e6-2b5d19ded530",
          "invoice_id": "ad4723e7-5993-4736-af6e-4f1650c8780b",
          "line_no": 2,
          "product_id": "b3dd9ae9-8283-4823-98d3-c93a9d044123",
          "reference": "REF-100294",
          "name": "Riz brisé 7acf",
          "unit": "kg",
          "quantity": 4,
          "unit_price": 2500,
          "tax_rate": 0,
          "line_subtotal": 10000,
          "line_tax": 0,
          "line_total": 10000
        }
      ],
      "direction": "emise",
      "balance_due": 0,
      "pdf_url": "/api/v1/factures/ad4723e7-5993-4736-af6e-4f1650c8780b/pdf",
      "allocations": [],
      "file": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `FACTURE_PAYEE` · 422 `DONNEES_INVALIDES`.

---

## 17. Paiements

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/paiements` | membre d’une entreprise active |
| POST | `/api/v1/paiements` | membre d’une entreprise active |
| GET | `/api/v1/paiements/:id` | membre d’une entreprise active |
| POST | `/api/v1/paiements/:id/confirmer` | membre d’une entreprise active |
| POST | `/api/v1/paiements/:id/rejeter` | membre d’une entreprise active |
| POST | `/api/v1/paiements/:id/annuler` | membre d’une entreprise active |
| POST | `/api/v1/paiements/:id/preuve` | membre d’une entreprise active |

#### `GET /api/v1/paiements`

- **Accès :** membre d’une entreprise active — permission `paiements.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `sens` | string | non | valeurs : `recus`, `effectues` |
| `status` | string | non | valeurs : `declare`, `confirme`, `rejete`, `annule` |
| `method` | string | non | valeurs : `especes`, `virement`, `cheque`, `wave`, `orange_money`, `free_money`, `carte`, `effet`, `autre` |
| `partner_id` | string (uuid) | non |  |
| `partnership_id` | string (uuid) | non |  |
| `q` | string | non | max 100 car. |
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `modifie_depuis` | date | non |  |
| `tri` | string | non | valeurs : `paid_on`, `-paid_on`, `amount`, `-amount`, `created_at`, `-created_at` |


Exemple de query string réelle : `?sens=effectues&q=VIR-001&partnership_id=218ab6fb-581d-424b-ab20-589c7b22f775`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `reference`, `supplier_company_id`, `buyer_company_id`, `partnership_id`, `amount`, `allocated_amount`, `currency`, `method`, `paid_on`, `external_reference`, `note`, `status`, `recorded_by_side`, `recorded_by`, `confirmed_at`, `confirmed_by`, `rejected_at`, `rejection_reason`, `cancelled_at`, `cancellation_reason`, `proof_document_id`, `created_at`, `updated_at`, `supplier`, `buyer`, `direction`, `unallocated_amount`, `proof_url`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "804b82e9-0adb-485e-8266-d7e83e1c5a56",
        "reference": "PAI-2026-00001",
        "supplier_company_id": "06dbf588-b67a-4b29-a90f-3d7ba1b8be28",
        "buyer_company_id": "2ee4a434-216b-4493-a70d-e861da98aae5",
        "partnership_id": "218ab6fb-581d-424b-ab20-589c7b22f775",
        "amount": 5000,
        "allocated_amount": 5000,
        "currency": "XOF",
        "method": "virement",
        "paid_on": "2026-10-21",
        "external_reference": "VIR-001",
        "note": null,
        "status": "confirme",
        "recorded_by_side": "fournisseur",
        "recorded_by": "8b8ed33e-4d3b-4396-8f9b-3b7694590e4a",
        "confirmed_at": "2026-10-21T11:14:46.705Z",
        "confirmed_by": "8b8ed33e-4d3b-4396-8f9b-3b7694590e4a",
        "rejected_at": null,
        "rejection_reason": null,
        "cancelled_at": null,
        "cancellation_reason": null,
        "proof_document_id": null,
        "created_at": "2026-10-21T11:14:46.707Z",
        "updated_at": "2026-10-21T11:14:46.743Z",
        "supplier": {
          "id": "06dbf588-b67a-4b29-a90f-3d7ba1b8be28",
          "name": "Société 079c89",
          "logo_document_id": null
        },
        "buyer": {
          "id": "2ee4a434-216b-4493-a70d-e861da98aae5",
          "name": "Société f89163",
          "logo_document_id": null
        },
        "direction": "effectue",
        "unallocated_amount": 0,
        "proof_url": null
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

#### `POST /api/v1/paiements`

Mouvement d'argent : Idempotency-Key OBLIGATOIRE (double clic, renvoi après coupure réseau).

- **Accès :** membre d’une entreprise active — permission `paiements.enregistrer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** **OBLIGATOIRE** (sinon 422 `IDEMPOTENCE_REQUISE`) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `partnership_id` | string (uuid) | **oui** |  |
| `amount` | integer | **oui** | ≥ 1 · ≤ 1000000000000 |
| `method` | string | **oui** | valeurs : `especes`, `virement`, `cheque`, `wave`, `orange_money`, `free_money`, `carte`, `effet`, `autre` |
| `paid_on` | string | **oui** | date `AAAA-MM-JJ` |
| `external_reference` | string | non | `null` accepté · max 100 car. |
| `note` | string | non | `null` accepté · max 2000 car. |
| `allocations` | tableau de object | non | max 200 élément(s) · sans doublon |
| `allocations[].invoice_id` | string (uuid) | **oui** |  |
| `allocations[].amount` | integer | **oui** | ≥ 1 · ≤ 1000000000000 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "partnership_id": "4e0c2f18-03c2-4744-a86f-e1a4b9b2f973",
  "amount": 100000,
  "method": "wave",
  "paid_on": "2026-10-21",
  "external_reference": "TX-WAVE-1"
}
```

</details>

**Réponse 201 :** `data` contient `payment`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Paiement enregistré",
  "data": {
    "payment": {
      "id": "261ef558-16f8-44ea-8981-15ed06dfe8df",
      "reference": "PAI-2026-00001",
      "supplier_company_id": "21c9045b-2e05-41dc-9b6f-b713ffdaf109",
      "buyer_company_id": "6acc3fd7-05d9-421f-b3a7-f142503d32b7",
      "partnership_id": "4e0c2f18-03c2-4744-a86f-e1a4b9b2f973",
      "amount": 100000,
      "allocated_amount": 100000,
      "currency": "XOF",
      "method": "wave",
      "paid_on": "2026-10-21",
      "external_reference": "TX-WAVE-1",
      "note": null,
      "status": "confirme",
      "recorded_by_side": "fournisseur",
      "recorded_by": "db530fa6-f972-4c85-a0b9-85b2923dfa1f",
      "confirmed_at": "2026-10-21T11:14:27.983Z",
      "confirmed_by": "db530fa6-f972-4c85-a0b9-85b2923dfa1f",
      "rejected_at": null,
      "rejection_reason": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "proof_document_id": null,
      "created_at": "2026-10-21T11:14:27.984Z",
      "updated_at": "2026-10-21T11:14:28.014Z",
      "supplier": {
        "id": "21c9045b-2e05-41dc-9b6f-b713ffdaf109",
        "name": "Société b385e3",
        "logo_document_id": null
      },
      "buyer": {
        "id": "6acc3fd7-05d9-421f-b3a7-f142503d32b7",
        "name": "Société 015c73",
        "logo_document_id": null
      },
      "allocations": [
        {
          "id": "0dfee451-e01b-428f-ae33-4b7947276bcc",
          "payment_id": "261ef558-16f8-44ea-8981-15ed06dfe8df",
          "invoice_id": "0a9e1ef1-eeba-4b9c-85bf-5fc19d732501",
          "amount": 100000,
          "cancelled_at": null,
          "created_at": "2026-10-21T11:14:27.993Z",
          "invoice": {
            "id": "0a9e1ef1-eeba-4b9c-85bf-5fc19d732501",
            "number": "FAC-2026-00001",
            "total": 187000,
            "amount_paid": 100000,
            "status": "partiellement_payee",
            "due_date": "2026-11-20"
          }
        }
      ],
      "direction": "recu",
      "unallocated_amount": 0,
      "proof_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 409 `PARTENARIAT_INACTIF` · 422 `DONNEES_INVALIDES` · 422 `IDEMPOTENCE_REQUISE` · 422 `IDEMPOTENCE_REUTILISEE` · 422 `IMPUTATION_INVALIDE`.

---

#### `GET /api/v1/paiements/:id`

- **Accès :** membre d’une entreprise active — permission `paiements.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `payment`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "payment": {
      "id": "3cb5c9aa-9773-4fe8-b99d-d075550b8489",
      "reference": "PAI-2026-00001",
      "supplier_company_id": "711fb121-7abf-42f2-a6dd-726ac748edd4",
      "buyer_company_id": "32cdb705-80a7-44fd-b753-1ba1346d2336",
      "partnership_id": "055e7a94-d403-422f-8899-eace46c18762",
      "amount": 50000,
      "allocated_amount": 50000,
      "currency": "XOF",
      "method": "especes",
      "paid_on": "2026-10-21",
      "external_reference": null,
      "note": "Acompte",
      "status": "confirme",
      "recorded_by_side": "fournisseur",
      "recorded_by": "d10f1fba-4c03-46d2-ac35-87560cdf4058",
      "confirmed_at": "2026-10-21T11:14:25.060Z",
      "confirmed_by": "d10f1fba-4c03-46d2-ac35-87560cdf4058",
      "rejected_at": null,
      "rejection_reason": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "proof_document_id": null,
      "created_at": "2026-10-21T11:14:25.061Z",
      "updated_at": "2026-10-21T11:14:25.590Z",
      "supplier": {
        "id": "711fb121-7abf-42f2-a6dd-726ac748edd4",
        "name": "Société c8bfa6",
        "logo_document_id": null
      },
      "buyer": {
        "id": "32cdb705-80a7-44fd-b753-1ba1346d2336",
        "name": "Société 615b00",
        "logo_document_id": null
      },
      "allocations": [
        {
          "id": "39c1a6ca-87e8-46df-8d23-e2711c0fbdf9",
          "payment_id": "3cb5c9aa-9773-4fe8-b99d-d075550b8489",
          "invoice_id": "00c54c6e-8b43-4907-964f-9be1a0866b0c",
          "amount": 50000,
          "cancelled_at": null,
          "created_at": "2026-10-21T11:14:25.565Z",
          "invoice": {
            "id": "00c54c6e-8b43-4907-964f-9be1a0866b0c",
            "number": "FAC-2026-00001",
            "total": 187000,
            "amount_paid": 50000,
            "status": "partiellement_payee",
            "due_date": "2026-11-20"
          }
        }
      ],
      "direction": "effectue",
      "unallocated_amount": 0,
      "proof_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/paiements/:id/confirmer`

- **Accès :** membre d’une entreprise active — permission `paiements.enregistrer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `allocations` | tableau de object | non | max 200 élément(s) · sans doublon |
| `allocations[].invoice_id` | string (uuid) | **oui** |  |
| `allocations[].amount` | integer | **oui** | ≥ 1 · ≤ 1000000000000 |


**Réponse 200 :** `data` contient `payment`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Paiement confirmé",
  "data": {
    "payment": {
      "id": "5dbde388-1121-40fc-a983-7cc374188b6c",
      "reference": "PAI-2026-00001",
      "supplier_company_id": "9539dd09-9eb1-423f-8bed-4a0bbe77f006",
      "buyer_company_id": "1447099a-091c-46aa-ab0c-4092005c5a51",
      "partnership_id": "00f59315-55f3-4320-995f-953438595a33",
      "amount": 187000,
      "allocated_amount": 187000,
      "currency": "XOF",
      "method": "orange_money",
      "paid_on": "2026-10-21",
      "external_reference": null,
      "note": null,
      "status": "confirme",
      "recorded_by_side": "acheteur",
      "recorded_by": "c62be01e-c6ab-4615-bf8b-0fb8b7b87df9",
      "confirmed_at": "2026-10-21T11:14:26.763Z",
      "confirmed_by": "89ba7e43-0a15-4786-a462-59460c0ad3bc",
      "rejected_at": null,
      "rejection_reason": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "proof_document_id": "c5efc96f-1c1a-4f92-8275-e955f491b7b9",
      "created_at": "2026-10-21T11:14:26.476Z",
      "updated_at": "2026-10-21T11:14:26.830Z",
      "supplier": {
        "id": "9539dd09-9eb1-423f-8bed-4a0bbe77f006",
        "name": "Société 1879ff",
        "logo_document_id": null
      },
      "buyer": {
        "id": "1447099a-091c-46aa-ab0c-4092005c5a51",
        "name": "Société 4485a1",
        "logo_document_id": null
      },
      "allocations": [
        {
          "id": "0f6a33c4-6db9-4197-a631-40b4b643bac9",
          "payment_id": "5dbde388-1121-40fc-a983-7cc374188b6c",
          "invoice_id": "034634e0-319d-4021-9167-910a2c300fd3",
          "amount": 187000,
          "cancelled_at": null,
          "created_at": "2026-10-21T11:14:26.772Z",
          "invoice": {
            "id": "034634e0-319d-4021-9167-910a2c300fd3",
            "number": "FAC-2026-00001",
            "total": 187000,
            "amount_paid": 187000,
            "status": "payee",
            "due_date": "2026-11-20"
          }
        }
      ],
      "direction": "recu",
      "unallocated_amount": 0,
      "proof_url": "/api/v1/documents/c5efc96f-1c1a-4f92-8275-e955f491b7b9/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACTION_RESERVEE_AUTRE_PARTIE` · 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/paiements/:id/rejeter`

- **Accès :** membre d’une entreprise active — permission `paiements.enregistrer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
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
  "reason": "Non reçu"
}
```

</details>

**Réponse 200 :** `data` contient `payment`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Paiement rejeté",
  "data": {
    "payment": {
      "id": "db6f04b9-2f28-44f6-9b29-406a36dfb90a",
      "reference": "PAI-2026-00002",
      "supplier_company_id": "9539dd09-9eb1-423f-8bed-4a0bbe77f006",
      "buyer_company_id": "1447099a-091c-46aa-ab0c-4092005c5a51",
      "partnership_id": "00f59315-55f3-4320-995f-953438595a33",
      "amount": 5000,
      "allocated_amount": 0,
      "currency": "XOF",
      "method": "especes",
      "paid_on": "2026-10-21",
      "external_reference": null,
      "note": null,
      "status": "rejete",
      "recorded_by_side": "acheteur",
      "recorded_by": "c62be01e-c6ab-4615-bf8b-0fb8b7b87df9",
      "confirmed_at": null,
      "confirmed_by": null,
      "rejected_at": "2026-10-21T11:14:27.006Z",
      "rejection_reason": "Non reçu",
      "cancelled_at": null,
      "cancellation_reason": null,
      "proof_document_id": null,
      "created_at": "2026-10-21T11:14:26.952Z",
      "updated_at": "2026-10-21T11:14:27.006Z",
      "supplier": {
        "id": "9539dd09-9eb1-423f-8bed-4a0bbe77f006",
        "name": "Société 1879ff",
        "logo_document_id": null
      },
      "buyer": {
        "id": "1447099a-091c-46aa-ab0c-4092005c5a51",
        "name": "Société 4485a1",
        "logo_document_id": null
      },
      "allocations": [],
      "direction": "recu",
      "unallocated_amount": 5000,
      "proof_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/paiements/:id/annuler`

- **Accès :** membre d’une entreprise active — permission `paiements.enregistrer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
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
  "reason": "Chèque sans provision"
}
```

</details>

**Réponse 200 :** `data` contient `payment`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Paiement annulé",
  "data": {
    "payment": {
      "id": "66d6b798-15f3-41b5-a87f-d7c26f2e2a54",
      "reference": "PAI-2026-00001",
      "supplier_company_id": "d76eaff5-f141-44f2-b917-3bdae69270ab",
      "buyer_company_id": "98601675-4c32-4e63-994e-52f0872fce9c",
      "partnership_id": "3b2d17f8-5d3b-46f8-8d5e-a237e0d4d47e",
      "amount": 187000,
      "allocated_amount": 0,
      "currency": "XOF",
      "method": "cheque",
      "paid_on": "2026-10-21",
      "external_reference": null,
      "note": null,
      "status": "annule",
      "recorded_by_side": "fournisseur",
      "recorded_by": "f0c9a94d-4b68-4175-8887-513fbbc2c37b",
      "confirmed_at": "2026-10-21T11:14:31.473Z",
      "confirmed_by": "f0c9a94d-4b68-4175-8887-513fbbc2c37b",
      "rejected_at": null,
      "rejection_reason": null,
      "cancelled_at": "2026-10-21T11:14:31.643Z",
      "cancellation_reason": "Chèque sans provision",
      "proof_document_id": null,
      "created_at": "2026-10-21T11:14:31.474Z",
      "updated_at": "2026-10-21T11:14:31.644Z",
      "supplier": {
        "id": "d76eaff5-f141-44f2-b917-3bdae69270ab",
        "name": "Société 1bc1f5",
        "logo_document_id": null
      },
      "buyer": {
        "id": "98601675-4c32-4e63-994e-52f0872fce9c",
        "name": "Société 4b2bf0",
        "logo_document_id": null
      },
      "allocations": [],
      "direction": "recu",
      "unallocated_amount": 187000,
      "proof_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACTION_RESERVEE_AUTRE_PARTIE` · 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/paiements/:id/preuve`

- **Accès :** membre d’une entreprise active — permission `paiements.enregistrer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **Fichier :** champ `fichier` (**obligatoire**) — une image (JPEG, PNG, WebP) ou un PDF

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 201 :** `data` contient `payment`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Preuve de paiement ajoutée",
  "data": {
    "payment": {
      "id": "5dbde388-1121-40fc-a983-7cc374188b6c",
      "reference": "PAI-2026-00001",
      "supplier_company_id": "9539dd09-9eb1-423f-8bed-4a0bbe77f006",
      "buyer_company_id": "1447099a-091c-46aa-ab0c-4092005c5a51",
      "partnership_id": "00f59315-55f3-4320-995f-953438595a33",
      "amount": 187000,
      "allocated_amount": 0,
      "currency": "XOF",
      "method": "orange_money",
      "paid_on": "2026-10-21",
      "external_reference": null,
      "note": null,
      "status": "declare",
      "recorded_by_side": "acheteur",
      "recorded_by": "c62be01e-c6ab-4615-bf8b-0fb8b7b87df9",
      "confirmed_at": null,
      "confirmed_by": null,
      "rejected_at": null,
      "rejection_reason": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "proof_document_id": "c5efc96f-1c1a-4f92-8275-e955f491b7b9",
      "created_at": "2026-10-21T11:14:26.476Z",
      "updated_at": "2026-10-21T11:14:26.661Z",
      "supplier": {
        "id": "9539dd09-9eb1-423f-8bed-4a0bbe77f006",
        "name": "Société 1879ff",
        "logo_document_id": null
      },
      "buyer": {
        "id": "1447099a-091c-46aa-ab0c-4092005c5a51",
        "name": "Société 4485a1",
        "logo_document_id": null
      },
      "allocations": [],
      "direction": "effectue",
      "unallocated_amount": 187000,
      "proof_url": "/api/v1/documents/c5efc96f-1c1a-4f92-8275-e955f491b7b9/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `PAIEMENT_CLOS` · 422 `DONNEES_INVALIDES`.

---

## 18. Dettes, créances et relevés

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/situation/dettes` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/situation/creances` | membre d’une entreprise active — entreprise fournisseur ou mixte |

#### `GET /api/v1/situation/dettes`

§ 16 — dettes (ce que je dois à mes fournisseurs) et créances (ce que mes clients me doivent).

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `factures.lire`
- **Format :** aucun corps

**Réponse 200 :** `data` contient `payables`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "payables": {
      "totals": {
        "invoiced": 374000,
        "paid": 187000,
        "balance": 187000,
        "overdue": 0,
        "declared_pending": 0,
        "partners_with_balance": 1
      },
      "partners": [
        {
          "partnership_id": "5bf16e8b-b0ad-4459-a247-90bf797f4ddf",
          "partnership_status": "actif",
          "partner": {
            "id": "10665ca6-e973-4d92-abad-6b1ce8f761b9",
            "name": "Société 2be338",
            "logo_url": null
          },
          "invoiced": 374000,
          "paid": 187000,
          "balance": 187000,
          "open_amount": 187000,
          "overdue": 0,
          "declared_pending": 0,
          "open_invoices": 1,
          "paid_invoices": 1,
          "next_due_date": "2026-11-20",
          "last_payment_on": "2026-10-21"
        }
      ]
    }
  }
}
```

</details>

---

#### `GET /api/v1/situation/creances`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `factures.lire`
- **Format :** aucun corps

**Réponse 200 :** `data` contient `receivables`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "receivables": {
      "totals": {
        "invoiced": 374000,
        "paid": 187000,
        "balance": 187000,
        "overdue": 0,
        "declared_pending": 0,
        "partners_with_balance": 1
      },
      "partners": [
        {
          "partnership_id": "5bf16e8b-b0ad-4459-a247-90bf797f4ddf",
          "partnership_status": "actif",
          "partner": {
            "id": "b571272e-b40d-4923-b03d-8cd86d236397",
            "name": "Société 11b286",
            "logo_url": null
          },
          "invoiced": 374000,
          "paid": 187000,
          "balance": 187000,
          "open_amount": 187000,
          "overdue": 0,
          "declared_pending": 0,
          "open_invoices": 1,
          "paid_invoices": 1,
          "next_due_date": "2026-11-20",
          "last_payment_on": "2026-10-21"
        }
      ]
    }
  }
}
```

</details>

---

## 19. Statistiques et exports

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/statistiques/achats` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/statistiques/ventes` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/statistiques/exports/:type.csv` | membre d’une entreprise active |

#### `GET /api/v1/statistiques/achats`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `statistiques.lire`
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
      "summary": {
        "orders": 1,
        "amount": 187000,
        "average_order": 187000,
        "cancelled_or_refused": 0,
        "negotiated_orders": 0,
        "invoiced": 0,
        "paid": 0,
        "avg_validation_hours": 0
      },
      "by_month": [
        {
          "month": "2026-10",
          "orders": 1,
          "amount": 187000
        }
      ],
      "by_partner": [
        {
          "partner_id": "087d45ff-cd10-4672-96d8-6b2e9167769a",
          "partner_name": "Société f90643",
          "orders": 1,
          "amount": 187000,
          "average_order": 187000
        }
      ],
      "top_products": [
        {
          "product_id": "e8b1c983-40f9-483b-9cec-6ac5d8cbd1fe",
          "reference": "REF-7c1fdf",
          "name": "Riz brisé 328c",
          "unit": "sac",
          "quantity": 10,
          "amount": 150000,
          "orders": 1
        },
        {
          "product_id": "df9666eb-6cf9-4e44-9c7a-02fce84df15e",
          "reference": "REF-54c8ff",
          "name": "Riz brisé 88f1",
          "unit": "kg",
          "quantity": 4,
          "amount": 10000,
          "orders": 1
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 403 `FONCTIONNALITE_NON_INCLUSE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/statistiques/ventes`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `statistiques.lire`
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
      "summary": {
        "orders": 1,
        "amount": 187000,
        "average_order": 187000,
        "cancelled_or_refused": 0,
        "negotiated_orders": 0,
        "invoiced": 0,
        "paid": 0,
        "avg_validation_hours": 0
      },
      "by_month": [
        {
          "month": "2026-10",
          "orders": 1,
          "amount": 187000
        }
      ],
      "by_partner": [
        {
          "partner_id": "78c4a09d-8f49-4435-a2dd-7b604b2e5027",
          "partner_name": "Société c972e5",
          "orders": 1,
          "amount": 187000,
          "average_order": 187000
        }
      ],
      "top_products": [
        {
          "product_id": "e8b1c983-40f9-483b-9cec-6ac5d8cbd1fe",
          "reference": "REF-7c1fdf",
          "name": "Riz brisé 328c",
          "unit": "sac",
          "quantity": 10,
          "amount": 150000,
          "orders": 1
        },
        {
          "product_id": "df9666eb-6cf9-4e44-9c7a-02fce84df15e",
          "reference": "REF-54c8ff",
          "name": "Riz brisé 88f1",
          "unit": "kg",
          "quantity": 4,
          "amount": 10000,
          "orders": 1
        }
      ]
    }
  }
}
```

</details>

---

#### `GET /api/v1/statistiques/exports/:type.csv`

- **Accès :** membre d’une entreprise active — permission `statistiques.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `type` | string | **oui** | valeurs : `commandes`, `factures`, `paiements` |


**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `sens` | string | non | valeurs : `achats`, `ventes` |


Exemple de query string réelle : `?sens=ventes`

**Réponse 200 :** fichier `text/csv` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 20. Modèles de documents

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/modeles-documents` | membre d’une entreprise active |
| POST | `/api/v1/modeles-documents` | membre d’une entreprise active |
| GET | `/api/v1/modeles-documents/:id` | membre d’une entreprise active |
| GET | `/api/v1/modeles-documents/:id/apercu.pdf` | membre d’une entreprise active |
| POST | `/api/v1/modeles-documents/:id/archiver` | membre d’une entreprise active |
| POST | `/api/v1/modeles-documents/:id/reactiver` | membre d’une entreprise active |

#### `GET /api/v1/modeles-documents`

- **Accès :** membre d’une entreprise active — permission `modeles.gerer`
- **Format :** aucun corps

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `type` | string | non | valeurs : `bon_commande`, `facture` |
| `status` | string | non | valeurs : `actif`, `archive` |


Exemple de query string réelle : `?type=bon_commande`

**Réponse 200 :** `data` contient `templates`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "templates": [
      {
        "id": "48594717-19ba-4f5c-b58e-c725bff9f03e",
        "company_id": "d3b0ece0-3535-46cf-8fe7-0d4ffe225f73",
        "type": "bon_commande",
        "version": 2,
        "status": "actif",
        "name": "Modèle de bon de commande",
        "accent_color": "#004488",
        "header_text": null,
        "footer_text": null,
        "legal_mentions": null,
        "show_logo": true,
        "background_document_id": "864f1aaf-aaa4-4fdc-8d2f-54135b9ff934",
        "margin_top": 50,
        "margin_bottom": 60,
        "created_by": "40837794-fae0-45b2-8cc7-018dafe25d1e",
        "archived_at": null,
        "created_at": "2026-10-21T11:14:40.115Z",
        "updated_at": "2026-10-21T11:14:40.115Z",
        "background_url": "/api/v1/documents/864f1aaf-aaa4-4fdc-8d2f-54135b9ff934/fichier"
      },
      {
        "id": "54448a80-2e44-4f1d-a5f2-da75055a5771",
        "company_id": "d3b0ece0-3535-46cf-8fe7-0d4ffe225f73",
        "type": "bon_commande",
        "version": 1,
        "status": "archive",
        "name": "Modèle de bon de commande",
        "accent_color": "#AA3300",
        "header_text": null,
        "footer_text": null,
        "legal_mentions": "SARL au capital de 1 000 000 FCFA",
        "show_logo": true,
        "background_document_id": "864f1aaf-aaa4-4fdc-8d2f-54135b9ff934",
        "margin_top": 120,
        "margin_bottom": 60,
        "created_by": "40837794-fae0-45b2-8cc7-018dafe25d1e",
        "archived_at": "2026-10-21T11:14:40.111Z",
        "created_at": "2026-10-21T11:14:39.795Z",
        "updated_at": "2026-10-21T11:14:40.112Z",
        "background_url": "/api/v1/documents/864f1aaf-aaa4-4fdc-8d2f-54135b9ff934/fichier"
      }
    ]
  }
}
```

</details>

---

#### `POST /api/v1/modeles-documents`

Papier à en-tête facultatif : image A4 (JPEG, PNG ou WebP), champ « fichier ».

- **Accès :** membre d’une entreprise active — permission `modeles.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **Fichier :** champ `fichier` (facultatif) — une image JPEG, PNG ou WebP

**Champs du formulaire (multipart)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `type` | string | **oui** | valeurs : `bon_commande`, `facture` |
| `name` | string | non | min 2 car. · max 120 car. |
| `accent_color` | string | non | format `/^#[0-9A-Fa-f]{6}$/` |
| `header_text` | string | non | `null` accepté · max 1000 car. |
| `footer_text` | string | non | `null` accepté · max 500 car. |
| `legal_mentions` | string | non | `null` accepté · max 1000 car. |
| `show_logo` | boolean | non |  |
| `margin_top` | integer | non | ≥ 20 · ≤ 300 |
| `margin_bottom` | integer | non | ≥ 20 · ≤ 300 |
| `keep_background` | boolean | non |  |


**Réponse 201 :** `data` contient `template`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Modèle enregistré : il sera utilisé pour vos prochains documents",
  "data": {
    "template": {
      "id": "54448a80-2e44-4f1d-a5f2-da75055a5771",
      "show_logo": true,
      "margin_bottom": 60,
      "accent_color": "#AA3300",
      "legal_mentions": "SARL au capital de 1 000 000 FCFA",
      "margin_top": 120,
      "name": "Modèle de bon de commande",
      "company_id": "d3b0ece0-3535-46cf-8fe7-0d4ffe225f73",
      "type": "bon_commande",
      "version": 1,
      "status": "actif",
      "background_document_id": "864f1aaf-aaa4-4fdc-8d2f-54135b9ff934",
      "created_by": "40837794-fae0-45b2-8cc7-018dafe25d1e",
      "updated_at": "2026-10-21T11:14:39.876Z",
      "created_at": "2026-10-21T11:14:39.795Z",
      "header_text": null,
      "footer_text": null,
      "archived_at": null,
      "background_url": "/api/v1/documents/864f1aaf-aaa4-4fdc-8d2f-54135b9ff934/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 400 `FORMAT_FICHIER_REFUSE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/modeles-documents/:id`

- **Accès :** membre d’une entreprise active — permission `modeles.gerer`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `template`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "template": {
      "id": "81223bb7-1d62-41d7-8f6c-ebf6449aa330",
      "company_id": "c9e624e1-a744-4fba-b283-2750a4ad3355",
      "type": "facture",
      "version": 1,
      "status": "actif",
      "name": "Modèle de facture",
      "accent_color": "#004488",
      "header_text": null,
      "footer_text": null,
      "legal_mentions": null,
      "show_logo": true,
      "background_document_id": null,
      "margin_top": 50,
      "margin_bottom": 60,
      "created_by": "a59cef23-595a-4d1c-a469-3f3a744a6ac1",
      "archived_at": null,
      "created_at": "2026-10-21T11:17:44.340Z",
      "updated_at": "2026-10-21T11:17:44.340Z",
      "background_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/modeles-documents/:id/apercu.pdf`

- **Accès :** membre d’une entreprise active — permission `modeles.gerer`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** fichier `application/pdf` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/modeles-documents/:id/archiver`

- **Accès :** membre d’une entreprise active — permission `modeles.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `template`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Modèle archivé : le modèle standard s’applique",
  "data": {
    "template": {
      "id": "48594717-19ba-4f5c-b58e-c725bff9f03e",
      "company_id": "d3b0ece0-3535-46cf-8fe7-0d4ffe225f73",
      "type": "bon_commande",
      "version": 2,
      "status": "archive",
      "name": "Modèle de bon de commande",
      "accent_color": "#004488",
      "header_text": null,
      "footer_text": null,
      "legal_mentions": null,
      "show_logo": true,
      "background_document_id": "864f1aaf-aaa4-4fdc-8d2f-54135b9ff934",
      "margin_top": 50,
      "margin_bottom": 60,
      "created_by": "40837794-fae0-45b2-8cc7-018dafe25d1e",
      "archived_at": "2026-10-21T11:14:40.277Z",
      "created_at": "2026-10-21T11:14:40.115Z",
      "updated_at": "2026-10-21T11:14:40.277Z",
      "background_url": "/api/v1/documents/864f1aaf-aaa4-4fdc-8d2f-54135b9ff934/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/modeles-documents/:id/reactiver`

- **Accès :** membre d’une entreprise active — permission `modeles.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 200 :** `data` contient `template`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Modèle réactivé",
  "data": {
    "template": {
      "id": "54448a80-2e44-4f1d-a5f2-da75055a5771",
      "company_id": "d3b0ece0-3535-46cf-8fe7-0d4ffe225f73",
      "type": "bon_commande",
      "version": 1,
      "status": "actif",
      "name": "Modèle de bon de commande",
      "accent_color": "#AA3300",
      "header_text": null,
      "footer_text": null,
      "legal_mentions": "SARL au capital de 1 000 000 FCFA",
      "show_logo": true,
      "background_document_id": "864f1aaf-aaa4-4fdc-8d2f-54135b9ff934",
      "margin_top": 120,
      "margin_bottom": 60,
      "created_by": "40837794-fae0-45b2-8cc7-018dafe25d1e",
      "archived_at": null,
      "created_at": "2026-10-21T11:14:39.795Z",
      "updated_at": "2026-10-21T11:14:40.311Z",
      "background_url": "/api/v1/documents/864f1aaf-aaa4-4fdc-8d2f-54135b9ff934/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 21. Documents et fichiers

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/documents` | membre d’une entreprise active |
| GET | `/api/v1/documents/:id/fichier` | membre d’une entreprise active |
| GET | `/api/v1/documents/:id/lien` | membre d’une entreprise active |
| DELETE | `/api/v1/documents/:id` | membre d’une entreprise active |

#### `GET /api/v1/documents`

- **Accès :** membre d’une entreprise active — permission `documents.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `entity_type` | string | non | valeurs : `company`, `product`, `order`, `invoice`, `payment`, `document_template`, `partnership` |
| `entity_id` | string (uuid) | non |  |

Règles globales : tous ou aucun parmi `entity_type`, `entity_id`.


Exemple de query string réelle : `?entity_type=order&entity_id=7d3aa6fb-03ca-4958-9044-35a06633ef8e`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `category`, `visibility`, `mime_type`, `size_bytes`, `original_name`, `has_thumbnail`, `created_at`, `url`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "020b4515-9b62-4385-b83c-f20cfe61d065",
        "company_id": "0aff92a7-d4e3-4f7f-a75a-3e7a55818c29",
        "category": "piece_jointe",
        "visibility": "partenaire",
        "mime_type": "application/pdf",
        "size_bytes": 69,
        "original_name": "fiche-technique.pdf",
        "has_thumbnail": false,
        "created_at": "2026-10-21T11:15:44.325Z",
        "url": "/api/v1/documents/020b4515-9b62-4385-b83c-f20cfe61d065/fichier"
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

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE`.

---

#### `GET /api/v1/documents/:id/fichier`

- **Accès :** membre d’une entreprise active — permission `documents.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `taille` | string | non | valeurs : `miniature`, `originale` |


**Réponse 200 :** fichier `application/pdf` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 403 `ACCES_DOCUMENT_REFUSE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/documents/:id/lien`

- **Accès :** membre d’une entreprise active — permission `documents.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `taille` | string | non | valeurs : `miniature`, `originale` |


**Réponse 200 :** `data` contient `url`, `expires_in`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "url": "/api/v1/documents/020b4515-9b62-4385-b83c-f20cfe61d065/fichier",
    "expires_in": null
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `DELETE /api/v1/documents/:id`

- **Accès :** membre d’une entreprise active — permission `documents.ecrire`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
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
  "message": "Document supprimé",
  "data": null
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 409 `DOCUMENT_PROTEGE` · 422 `DONNEES_INVALIDES`.

---

## 22. Abonnement

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/abonnement` | membre d’une entreprise active |
| GET | `/api/v1/abonnement/paiements` | membre d’une entreprise active |
| POST | `/api/v1/abonnement/souscrire` | membre d’une entreprise active |

#### `GET /api/v1/abonnement`

Monté dans l'espace entreprise (routes.js). La consultation reste possible abonnement échu (lecture seule, § 25) ; la souscription est le moyen d'en sortir.

- **Accès :** membre d’une entreprise active — permission `abonnement.gerer`
- **Format :** aucun corps

**Réponse 200 :** `data` contient `abonnement`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "abonnement": {
      "abonnement": {
        "id": "32755d7a-0491-47e9-a9d3-95d75412d204",
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
      "actif": true,
      "usage": {
        "users": {
          "used": 1,
          "max": 10
        },
        "products": {
          "used": 1,
          "max": 1000
        },
        "partners": {
          "used": 0,
          "max": 100
        },
        "orders_this_month": {
          "used": 0,
          "max": 1000
        }
      }
    }
  }
}
```

</details>

---

#### `GET /api/v1/abonnement/paiements`

- **Accès :** membre d’une entreprise active — permission `abonnement.gerer`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `status` | string | non | valeurs : `initie`, `confirme`, `echoue`, `annule` |


**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `subscription_id`, `plan_id`, `amount`, `currency`, `months`, `provider`, `reference`, `provider_transaction_id`, `status`, `checkout_url`, `paid_at`, `recorded_by`, `note`, `created_at`, `updated_at`, `plan`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "c8872a20-ee6b-452c-999d-ee75a6544b5e",
        "company_id": "ed786e20-aa21-4649-a038-2ac004ca3e0b",
        "subscription_id": null,
        "plan_id": "33f1d9d0-da41-47b4-9665-2560daa74a8b",
        "amount": 60000,
        "currency": "XOF",
        "months": 1,
        "provider": "paydunya",
        "reference": "ABO-20261021-000004",
        "provider_transaction_id": "paydunya:test_2e100fdc30",
        "status": "echoue",
        "checkout_url": "https://app.paydunya.com/sandbox-checkout/invoice/test_2e100fdc30",
        "paid_at": null,
        "recorded_by": "254dfcc4-b29b-4a1c-95cf-3cb4ec218551",
        "note": "Montant reçu (1000) différent du montant demandé (60000).",
        "created_at": "2026-10-21T11:14:16.836Z",
        "updated_at": "2026-10-21T11:14:16.864Z",
        "plan": {
          "id": "33f1d9d0-da41-47b4-9665-2560daa74a8b",
          "code": "ENTREPRISE",
          "name": "Entreprise"
        }
      },
      {
        "id": "26c64adb-011c-4fab-b30e-280edbb6e2f5",
        "company_id": "ed786e20-aa21-4649-a038-2ac004ca3e0b",
        "subscription_id": "b6a09251-229b-4b71-9577-6ece67a5b5af",
        "plan_id": "33f1d9d0-da41-47b4-9665-2560daa74a8b",
        "amount": 120000,
        "currency": "XOF",
        "months": 2,
        "provider": "paydunya",
        "reference": "ABO-20261021-000003",
        "provider_transaction_id": "paydunya:test_f0ceb7f15e",
        "status": "confirme",
        "checkout_url": "https://app.paydunya.com/sandbox-checkout/invoice/test_f0ceb7f15e",
        "paid_at": "2026-10-21T11:14:16.777Z",
        "recorded_by": "254dfcc4-b29b-4a1c-95cf-3cb4ec218551",
        "note": null,
        "created_at": "2026-10-21T11:14:16.724Z",
        "updated_at": "2026-10-21T11:14:16.778Z",
        "plan": {
          "id": "33f1d9d0-da41-47b4-9665-2560daa74a8b",
          "code": "ENTREPRISE",
          "name": "Entreprise"
        }
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

#### `POST /api/v1/abonnement/souscrire`

Idempotence : un double clic ne crée pas deux demandes de paiement.

- **Accès :** membre d’une entreprise active — permission `abonnement.gerer`
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `plan_code` | string | **oui** | max 30 car. |
| `months` | integer | **oui** | ≥ 1 · ≤ 12 |
| `wallet` | string | non | valeurs : `wave`, `orange_money` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "plan_code": "ENTREPRISE",
  "months": 2,
  "wallet": "wave"
}
```

</details>

**Réponse 201 :** `data` contient `payment`, `checkout_url`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Demande de paiement créée",
  "data": {
    "payment": {
      "id": "26c64adb-011c-4fab-b30e-280edbb6e2f5",
      "company_id": "ed786e20-aa21-4649-a038-2ac004ca3e0b",
      "plan_id": "33f1d9d0-da41-47b4-9665-2560daa74a8b",
      "amount": 120000,
      "currency": "XOF",
      "months": 2,
      "provider": "paydunya",
      "reference": "ABO-20261021-000003",
      "status": "initie",
      "recorded_by": "254dfcc4-b29b-4a1c-95cf-3cb4ec218551",
      "updated_at": "2026-10-21T11:14:16.733Z",
      "created_at": "2026-10-21T11:14:16.724Z",
      "subscription_id": null,
      "provider_transaction_id": "paydunya:test_f0ceb7f15e",
      "checkout_url": "https://app.paydunya.com/sandbox-checkout/invoice/test_f0ceb7f15e",
      "paid_at": null,
      "note": null
    },
    "checkout_url": "https://app.paydunya.com/sandbox-checkout/invoice/test_f0ceb7f15e"
  }
}
```

</details>

**Erreurs observées :** 422 `PLAN_INDISPONIBLE` · 503 `PAIEMENT_NON_CONFIGURE`.

---

## Annexe A — Entités (champs renvoyés)

Champs de chaque entité tels que renvoyés par l’API (les secrets — mots de passe, clés, jetons — ne sont jamais renvoyés). Les réponses de détail ajoutent souvent des **relations incluses** (ex. `buyer`, `supplier`, `lines`) : leur forme exacte figure dans les exemples réels de chaque route.

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
| `created_at` | string (date-heure ISO 8601) | non |  |
| `updated_at` | string (date-heure ISO 8601) | non |  |

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

