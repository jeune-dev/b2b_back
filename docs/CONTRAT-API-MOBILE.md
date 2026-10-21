# Contrat d’API — Application mobile Pro2Link (entreprises acheteuses et fournisseurs)

> Généré depuis le code (routes réellement montées, schémas de validation Joi, middlewares d’accès, modèles), le 2026-10-21, par `node scripts/generer-contrats.js`. Les exemples sont de **vraies requêtes et réponses** de l’API, capturées pendant la suite de tests sur une base PostgreSQL de test (tableaux réduits à 2 éléments, textes longs tronqués par « … », jetons remplacés par `<jwt>`, secrets par `<masqué>`).

**Périmètre :** les 181 routes utilisées par l’application mobile des entreprises — et par leur espace web, qui appelle les mêmes routes (voir « Application web des entreprises » en section 0) : authentification, compte, notifications, référentiels, réseau de partenaires, catalogue (listes de prix, stock, import CSV), bons de commande (côté acheteur `/achats`, côté fournisseur `/ventes`, approbation interne, livraisons partielles), listes d’achat, litiges et avoirs, facturation et rapprochement, paiements, dettes et créances, tableaux de bord, statistiques et exports comptables, modèles de documents, abonnement et synchronisation temps réel. Le back-office super admin est décrit dans `CONTRAT-API-ADMIN.md` ; les webhooks (PayDunya) sont appelés par le fournisseur de paiement, jamais par l’application.

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
- [11. Catalogue — produits](#11-catalogue--produits) — 17 route(s)
- [12. Catalogue — catégories](#12-catalogue--catégories) — 4 route(s)
- [13. Catalogues des fournisseurs](#13-catalogues-des-fournisseurs) — 3 route(s)
- [14. Listes de prix (tarifs clients)](#14-listes-de-prix-tarifs-clients) — 5 route(s)
- [15. Listes d’achat habituelles](#15-listes-dachat-habituelles) — 6 route(s)
- [16. Achats — bons de commande (acheteur)](#16-achats--bons-de-commande-acheteur) — 24 route(s)
- [17. Ventes — commandes reçues (fournisseur)](#17-ventes--commandes-reçues-fournisseur) — 19 route(s)
- [18. Factures](#18-factures) — 9 route(s)
- [19. Avoirs](#19-avoirs) — 5 route(s)
- [20. Retours et litiges](#20-retours-et-litiges) — 7 route(s)
- [21. Paiements](#21-paiements) — 7 route(s)
- [22. Dettes, créances et relevés](#22-dettes-créances-et-relevés) — 2 route(s)
- [23. Statistiques et exports](#23-statistiques-et-exports) — 3 route(s)
- [24. Modèles de documents](#24-modèles-de-documents) — 6 route(s)
- [25. Documents et fichiers](#25-documents-et-fichiers) — 4 route(s)
- [26. Abonnement](#26-abonnement) — 3 route(s)
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

| Code | Signification | Conduite côté application |
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
3. À expiration (401) : `POST /api/v1/auth/refresh` avec `{ refresh_token }` dans le corps (application mobile : pas d’en-tête `Origin`, le refresh token arrive dans `data.refresh_token` ; le stocker dans le coffre sécurisé de l’appareil). Le refresh token **tourne à chaque usage** : toujours conserver le **nouveau**. Réutiliser un ancien refresh token révoque toute la session (détection de vol). Mutualiser le rafraîchissement (une seule requête en vol).
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

PDF (bons de commande, factures, aperçus de modèles) et exports CSV : à télécharger avec l’en-tête `Authorization` (un simple lien ne l’envoie pas), puis ouvrir avec le visualiseur du téléphone. Fichiers stockés : `GET /api/v1/documents/:id/fichier` (`?taille=miniature` pour une vignette) ou `GET /api/v1/documents/:id/lien` (lien signé temporaire).

### Synchronisation web / mobile (§ 23)

1. `POST /api/v1/evenements/ticket` → ticket valable 60 s.
2. `new EventSource('/api/v1/evenements/flux?ticket=…')` : flux Server-Sent Events.
3. Événements : `commande`, `facture`, `paiement`, `partenariat`, `produit`, `notification`. Chacun ne porte que des données de **navigation** (identifiant, statut, révision) : recharger la ressource par l’API.
4. Application en arrière-plan : notification **push** FCM.
5. Reprise après coupure : les listes acceptent `modifie_depuis` (date-heure) pour ne recharger que le changé.
6. Concurrence : un bon de commande porte une `revision` ; l’envoyer dans les actions de négociation. Révision dépassée → **409 `COMMANDE_MODIFIEE`** : recharger puis réessayer.

### Limitation de débit

Connexion et mot de passe oublié : 10 essais / 15 min ; routes authentifiées : 600 requêtes / 15 min par utilisateur ; téléversements, PDF et exports limités à part. Au-delà : **429**.

### Application web des entreprises

L’espace web des entreprises (§ 21) appelle EXACTEMENT les mêmes routes que le mobile. Une seule différence : dans un navigateur (requête portant un en-tête `Origin`), le refresh token n’est **jamais** dans le corps des réponses ; il est posé en cookie httpOnly `SameSite=Strict` (`refresh_token`), les appels d’authentification partent en `credentials: "include"` et `POST /api/v1/auth/refresh` s’appelle **sans corps**.

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
4. Consulter `GET /catalogues/:supplierId/produits` (SES prix : liste de prix, paliers) → créer un bon de commande `POST /achats` (brouillon) — ou plus vite : `POST /achats/:id/recommander`, `POST /listes-achat/:id/commander`, `POST /achats/import` (CSV) — → `POST /achats/:id/envoyer`.
5. Au-delà d’un seuil d’approbation, l’envoi SOUMET le bon (`submitted_for_approval: true`) : un approbateur `GET /achats/approbations` → `POST /achats/:id/approuver` (envoi automatique) ou `/rejeter-approbation`. Refus possibles à l’envoi : `MINIMUM_COMMANDE`, `PLAFOND_CREDIT_DEPASSE`, `RETARD_DE_PAIEMENT`.
6. Le fournisseur modifie ? Examiner la proposition (versions, écarts ligne à ligne) → `POST /achats/:id/accepter-proposition` ou `/refuser-proposition`.
7. Livraisons (une ou plusieurs) : `POST /achats/:id/livraisons/:livraisonId/reception` ou `POST /achats/:id/confirmer-reception` (quantités reçues, réserves) ; renoncer au reste : `/solder-reliquat`. Problème constaté : `POST /litiges` (photos : `/litiges/:id/pieces-jointes`).
8. Facture reçue : si `payment_blocked` (écart de rapprochement) → `POST /factures/:id/accepter-ecart` ou `/contester` ; sinon enregistrer un paiement `POST /paiements` (**Idempotency-Key**) → `GET /situation/dettes` (avoirs déduits).

### Fournisseur (§ 28)
1. Créer son catalogue (`POST /produits` ou `POST /produits/import` en CSV ; paliers de remise, minimum / multiple, stock `POST /produits/:id/stock`) ; tarifs clients : `POST /listes-prix` puis `PATCH /partenariats/:id` (`price_list_id`, `credit_limit`).
2. Recevoir la commande (`GET /ventes`, notification push + temps réel) → `POST /ventes/:id/accepter` (refusé en `STOCK_INSUFFISANT` si le stock suivi manque), `/refuser` ou `/proposer` (proposition modifiée : quantités, produit retiré ou remplacé, indisponibilité).
3. Préparer (`POST /ventes/:id/statut` : en préparation, prête) puis livrer : tout (`POST /ventes/:id/livrer`) ou en plusieurs fois (`POST /ventes/:id/livraisons`) ; bon de livraison PDF `GET …/livraisons/:livraisonId/bon-de-livraison.pdf`.
4. Émettre la facture (`POST /factures`, PDF selon son modèle de document) → confirmer le paiement déclaré par l’acheteur ; relancer un impayé `POST /factures/:id/relancer` ; litige reçu → `POST /litiges/:id/accepter` (avoir automatique) ou `/refuser`.
5. Suivi : `GET /tableau-de-bord`, `GET /situation/creances`, `GET /statistiques/ventes`, export comptable `GET /statistiques/exports/journal_ventes.csv`.

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
  "email": "nouveau-fournisseur.ca664097fd@test.sn",
  "phone": "+221778364243",
  "password": "<masqué>",
  "password_confirmation": "<masqué>",
  "company": {
    "name": "Laiterie du Fleuve",
    "type": "fournisseur",
    "ninea": "439217927"
  },
  "invitation_token": "VKA0_k--Pad6IVfwDYkIQs__Z5GB8Ej7XWbAxjHhR_Q"
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
      "id": "027d4173-cf5f-4538-8eed-6c7f6d809ccc",
      "role": "utilisateur",
      "first_name": "Mame",
      "last_name": "Diouf",
      "email": "nouveau-fournisseur.ca664097fd@test.sn",
      "phone": "+221778364243",
      "status": "actif",
      "language": "fr",
      "must_change_password": false,
      "mfa_active": false,
      "mfa_a_configurer": false
    },
    "company": {
      "id": "56d1d632-2583-4da7-a8a1-5195c0303c81",
      "name": "Laiterie du Fleuve",
      "type": "fournisseur"
    },
    "partnerships_created": [
      {
        "partnership_id": "f898855b-f3f6-4a4f-af5b-c71a6f9d67e0",
        "status": "actif",
        "partner": "Société a6cb34"
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
  "identifiant": "admin.87d4fc308a@test.sn"
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
  "identifiant": "admin.87d4fc308a@test.sn",
  "code": "482913",
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
  "code": "89963331",
  "email": "responsable_achats.b5bf90b59b@test.sn",
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
      "id": "205fd84d-fa40-432d-b9dc-304746c5fe8f",
      "role": "utilisateur",
      "first_name": "Moussa",
      "last_name": "Sow",
      "email": "responsable_achats.b5bf90b59b@test.sn",
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
      "statut_approbation": [
        {
          "code": "non_requise",
          "label": "Approbation non requise"
        },
        {
          "code": "en_attente",
          "label": "En attente d’approbation"
        }
      ],
      "decision_approbation": [
        {
          "code": "approuvee",
          "label": "Approuvée"
        },
        {
          "code": "rejetee",
          "label": "Rejetée"
        }
      ],
      "statut_livraison": [
        {
          "code": "expediee",
          "label": "Expédiée"
        },
        {
          "code": "receptionnee",
          "label": "Réceptionnée"
        }
      ],
      "type_litige": [
        {
          "code": "manquant",
          "label": "Produit manquant"
        },
        {
          "code": "endommage",
          "label": "Produit endommagé"
        }
      ],
      "statut_litige": [
        {
          "code": "ouvert",
          "label": "Ouvert"
        },
        {
          "code": "accepte",
          "label": "Accepté (avoir émis)"
        }
      ],
      "statut_avoir": [
        {
          "code": "emis",
          "label": "Émis"
        },
        {
          "code": "annule",
          "label": "Annulé"
        }
      ],
      "statut_rapprochement": [
        {
          "code": "conforme",
          "label": "Conforme"
        },
        {
          "code": "ecart",
          "label": "Écart à valider"
        }
      ],
      "type_mouvement_stock": [
        {
          "code": "entree",
          "label": "Entrée en stock"
        },
        {
          "code": "ajustement",
          "label": "Ajustement d’inventaire"
        }
      ],
      "canal_relance": [
        {
          "code": "auto",
          "label": "Automatique"
        },
        {
          "code": "manuel",
          "label": "Manuelle"
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
    "url": "/api/v1/evenements/flux?ticket=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmNjZkNDcwYy04NjEyLTQ2MTctYTdjMC0zMzk5YzM2YzA1MTYiLCJ0eXAiOiJmbHV4IiwidHYiOjAsImlhdCI6MTc5MjU4NjE3NSwiZXhwIjoxNzkyNTg2MjM1fQ.a2KoFbW4C2GVMKe74PvndWoskIS8C-j5dEIQ1BRqJyU"
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
        "id": "4a8f02e3-c6ee-4b2c-a28c-3cb2b56c9bc8",
        "name": "Société 973d94",
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
          "partially_delivered": 0,
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
            "partnership_id": "9b373c8c-c75a-4de8-9d8b-613b05752162",
            "partnership_status": "actif",
            "partner": {
              "id": "4ba1006f-f5f5-4e11-aeb0-c6f73e487649",
              "name": "Société 146cc9",
              "logo_url": null
            },
            "invoiced": 187000,
            "paid": 0,
            "credited": 0,
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
          "out_of_stock": 0,
          "low_stock": 0
        },
        "claims_to_handle": 0
      },
      "recent_activity": [
        {
          "id": 166,
          "type": "livraison",
          "from_status": "validee",
          "to_status": "livree",
          "message": null,
          "created_at": "2026-10-21T12:35:25.195Z",
          "actor_side": "fournisseur",
          "order_id": "427c1e62-f762-42cf-ac52-db8f3da06e64",
          "number": "BC-2026-00003",
          "order_status": "livree",
          "actor_company": "Société 973d94",
          "actor_name": "Awa Diop"
        },
        {
          "id": 165,
          "type": "acceptation",
          "from_status": "envoyee",
          "to_status": "validee",
          "message": null,
          "created_at": "2026-10-21T12:35:25.115Z",
          "actor_side": "fournisseur",
          "order_id": "427c1e62-f762-42cf-ac52-db8f3da06e64",
          "number": "BC-2026-00003",
          "order_status": "livree",
          "actor_company": "Société 973d94",
          "actor_name": "Awa Diop"
        }
      ],
      "generated_at": "2026-10-21T12:35:25.328Z",
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
      "id": "c4aab4a9-3e03-4961-b026-7ed4e7688ef2",
      "name": "Société 76ec6b",
      "legal_name": null,
      "type": "fournisseur",
      "sector": "distribution",
      "description": null,
      "address": null,
      "city": "Dakar",
      "country": "SN",
      "phone": "+221776563327",
      "email": "admin.19cf5162c3@test.sn",
      "website": null,
      "ninea": "180182600",
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
      "created_by": "3738267d-545e-4739-a531-6d9cf0b013db",
      "created_at": "2026-10-21T12:35:54.311Z",
      "updated_at": "2026-10-21T12:35:54.311Z",
      "deleted_at": null,
      "logo": null
    },
    "settings": {
      "order_prefix": "BC",
      "invoice_prefix": "FAC",
      "default_payment_terms_days": 30,
      "auto_accept_partnerships": false,
      "invoice_reminder_days_before": 3,
      "default_order_conditions": null,
      "order_approval_levels": [],
      "invoice_match_tolerance_percent": 2,
      "min_order_amount": null,
      "dunning_enabled": true,
      "dunning_days_after_due": [
        3,
        7
      ],
      "low_stock_alerts": true,
      "accounting_accounts": {}
    },
    "abonnement": {
      "abonnement": {
        "id": "789de9be-8d1a-4fbd-89e7-a347db2acd12",
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
      "id": "c4aab4a9-3e03-4961-b026-7ed4e7688ef2",
      "name": "Société 76ec6b",
      "legal_name": null,
      "type": "fournisseur",
      "sector": "distribution",
      "description": null,
      "address": "Km 4,5 Bd du Centenaire",
      "city": "Dakar",
      "country": "SN",
      "phone": "+221776563327",
      "email": "admin.19cf5162c3@test.sn",
      "website": null,
      "ninea": "180182600",
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
      "created_by": "3738267d-545e-4739-a531-6d9cf0b013db",
      "created_at": "2026-10-21T12:35:54.311Z",
      "updated_at": "2026-10-21T12:35:54.399Z",
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
| `order_approval_levels` | tableau de object | non | max 5 élément(s) · sans doublon |
| `order_approval_levels[].min_total` | integer | **oui** | ≥ 0 · ≤ 10000000000000 |
| `order_approval_levels[].approvals` | integer | **oui** | ≥ 1 · ≤ 3 |
| `invoice_match_tolerance_percent` | number | non | ≥ 0 · ≤ 50 · 2 décimale(s) max |
| `min_order_amount` | integer | non | `null` accepté · ≥ 1 · ≤ 10000000000000 |
| `dunning_enabled` | boolean | non |  |
| `dunning_days_after_due` | tableau de integer | non | min 1 élément(s) · max 6 élément(s) · sans doublon |
| `low_stock_alerts` | boolean | non |  |
| `accounting_accounts` | object | non |  |
| `accounting_accounts.clients` | string | non | format `/^[0-9A-Z]{2,12}$/` |
| `accounting_accounts.fournisseurs` | string | non | format `/^[0-9A-Z]{2,12}$/` |
| `accounting_accounts.ventes` | string | non | format `/^[0-9A-Z]{2,12}$/` |
| `accounting_accounts.achats` | string | non | format `/^[0-9A-Z]{2,12}$/` |
| `accounting_accounts.tva_collectee` | string | non | format `/^[0-9A-Z]{2,12}$/` |
| `accounting_accounts.tva_deductible` | string | non | format `/^[0-9A-Z]{2,12}$/` |
| `accounting_accounts.banque` | string | non | format `/^[0-9A-Z]{2,12}$/` |
| `accounting_accounts.caisse` | string | non | format `/^[0-9A-Z]{2,12}$/` |
| `accounting_accounts.mobile_money` | string | non | format `/^[0-9A-Z]{2,12}$/` |
| `accounting_accounts.rrr_obtenus` | string | non | format `/^[0-9A-Z]{2,12}$/` |
| `accounting_accounts.rrr_accordes` | string | non | format `/^[0-9A-Z]{2,12}$/` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "order_approval_levels": [
    {
      "min_total": 100000,
      "approvals": 1
    },
    {
      "min_total": 150000,
      "approvals": 2
    }
  ]
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
      "invoice_prefix": "FAC",
      "default_payment_terms_days": 30,
      "auto_accept_partnerships": false,
      "invoice_reminder_days_before": 3,
      "default_order_conditions": null,
      "order_approval_levels": [
        {
          "min_total": 100000,
          "approvals": 1
        },
        {
          "min_total": 150000,
          "approvals": 2
        }
      ],
      "invoice_match_tolerance_percent": 2,
      "min_order_amount": null,
      "dunning_enabled": true,
      "dunning_days_after_due": [
        3,
        7
      ],
      "low_stock_alerts": true,
      "accounting_accounts": {}
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
      "id": "cd767757-2b47-43d8-ae1f-a9fa0de82b91",
      "company_id": "c4aab4a9-3e03-4961-b026-7ed4e7688ef2",
      "category": "logo",
      "visibility": "public",
      "mime_type": "image/png",
      "size_bytes": 228,
      "original_name": "logo.png",
      "has_thumbnail": true,
      "created_at": "2026-10-21T12:35:54.508Z",
      "url": "/api/v1/documents/cd767757-2b47-43d8-ae1f-a9fa0de82b91/fichier"
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
        "id": "e6fc747a-815d-418c-af57-08a28f47f359",
        "company_id": "364d029c-9d5c-4f89-870a-dfcf55e3e111",
        "user_id": "22b66366-7ecf-4e68-8602-1b32977d6200",
        "role_code": "administrateur",
        "status": "actif",
        "invited_by": null,
        "created_at": "2026-10-21T12:35:52.457Z",
        "updated_at": "2026-10-21T12:35:52.457Z",
        "user": {
          "id": "22b66366-7ecf-4e68-8602-1b32977d6200",
          "first_name": "Awa",
          "last_name": "Diop",
          "email": "admin.a57474b6d9@test.sn",
          "phone": "+221776563323",
          "job_title": null,
          "status": "actif",
          "last_login_at": "2026-10-21T12:35:52.479Z",
          "totp_enabled_at": null
        },
        "role_label": "Administrateur"
      },
      {
        "id": "a901ed69-98d5-4594-aea4-887771979022",
        "company_id": "364d029c-9d5c-4f89-870a-dfcf55e3e111",
        "user_id": "e908d29c-dbdb-4b6e-812e-eeb757bd2149",
        "role_code": "receptionnaire",
        "status": "actif",
        "invited_by": "22b66366-7ecf-4e68-8602-1b32977d6200",
        "created_at": "2026-10-21T12:35:52.881Z",
        "updated_at": "2026-10-21T12:35:52.881Z",
        "user": {
          "id": "e908d29c-dbdb-4b6e-812e-eeb757bd2149",
          "first_name": "Moussa",
          "last_name": "Sow",
          "email": "receptionnaire.cbe8d4f61c@test.sn",
          "phone": null,
          "job_title": null,
          "status": "actif",
          "last_login_at": "2026-10-21T12:35:52.894Z",
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
        "id": "d7787a1d-7647-4a79-9728-c5342cfc88b5",
        "company_id": "e1014d47-69f2-4f71-a90c-5b3d82d89798",
        "email": "invite.f34abf6804@test.sn",
        "phone": "+221776563322",
        "first_name": "Ibou",
        "last_name": "Fall",
        "job_title": null,
        "role_code": "commercial",
        "expires_at": "2026-10-28T12:35:52.352Z",
        "attempts": 1,
        "used_at": null,
        "revoked_at": "2026-10-21T12:35:52.390Z",
        "created_by": "40e708fa-0da1-4a51-a5bd-cc20eab17d53",
        "created_at": "2026-10-21T12:35:52.352Z",
        "status": "revoquee",
        "role_label": "Commercial"
      },
      {
        "id": "bc46bbb6-333b-49d4-a0e1-98f7edbc740d",
        "company_id": "e1014d47-69f2-4f71-a90c-5b3d82d89798",
        "email": "invite.f34abf6804@test.sn",
        "phone": "+221776563322",
        "first_name": "Ibou",
        "last_name": "Fall",
        "job_title": null,
        "role_code": "commercial",
        "expires_at": "2026-10-28T12:35:52.303Z",
        "attempts": 1,
        "used_at": null,
        "revoked_at": "2026-10-21T12:35:52.350Z",
        "created_by": "40e708fa-0da1-4a51-a5bd-cc20eab17d53",
        "created_at": "2026-10-21T12:35:52.303Z",
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
  "email": "responsable_achats.b5bf90b59b@test.sn",
  "first_name": "Moussa",
  "last_name": "Sow",
  "role_code": "responsable_achats"
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
      "id": "9f11ba1b-0def-4e2b-8be5-084e33f41c74",
      "attempts": 0,
      "company_id": "00e7eb3f-a14c-4cac-a1c9-b800dfd47994",
      "email": "responsable_achats.b5bf90b59b@test.sn",
      "phone": null,
      "first_name": "Moussa",
      "last_name": "Sow",
      "job_title": null,
      "role_code": "responsable_achats",
      "expires_at": "2026-10-28T12:35:31.055Z",
      "created_by": "43ec280e-29b9-418c-ae0d-0b25dec8f0d5",
      "created_at": "2026-10-21T12:35:31.056Z",
      "used_at": null,
      "revoked_at": null,
      "status": "en_attente",
      "role_label": "Responsable achats"
    },
    "code": "89963331",
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
      "id": "d7787a1d-7647-4a79-9728-c5342cfc88b5",
      "attempts": 0,
      "company_id": "e1014d47-69f2-4f71-a90c-5b3d82d89798",
      "email": "invite.f34abf6804@test.sn",
      "phone": "+221776563322",
      "first_name": "Ibou",
      "last_name": "Fall",
      "job_title": null,
      "role_code": "commercial",
      "expires_at": "2026-10-28T12:35:52.352Z",
      "created_by": "40e708fa-0da1-4a51-a5bd-cc20eab17d53",
      "created_at": "2026-10-21T12:35:52.352Z",
      "used_at": null,
      "revoked_at": null,
      "status": "en_attente",
      "role_label": "Commercial"
    },
    "code": "98437445",
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
      "id": "b76be95c-24cf-4510-82ca-1e129632abbf",
      "company_id": "f0db9927-9913-4a32-bbeb-f08bcf069bf9",
      "user_id": "208869fb-8af7-41b2-a464-2ecf4d155e34",
      "role_code": "receptionnaire",
      "status": "actif",
      "invited_by": "e1183c1c-ca37-4984-8fc6-fd5a46827849",
      "created_at": "2026-10-21T12:36:22.353Z",
      "updated_at": "2026-10-21T12:36:22.353Z",
      "user": {
        "id": "208869fb-8af7-41b2-a464-2ecf4d155e34",
        "first_name": "Moussa",
        "last_name": "Sow",
        "email": "receptionnaire.eef737e4d6@test.sn",
        "phone": null,
        "job_title": null,
        "status": "actif",
        "last_login_at": "2026-10-21T12:36:22.369Z",
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
      "id": "a901ed69-98d5-4594-aea4-887771979022",
      "company_id": "364d029c-9d5c-4f89-870a-dfcf55e3e111",
      "user_id": "e908d29c-dbdb-4b6e-812e-eeb757bd2149",
      "role_code": "responsable_achats",
      "status": "actif",
      "invited_by": "22b66366-7ecf-4e68-8602-1b32977d6200",
      "created_at": "2026-10-21T12:35:52.881Z",
      "updated_at": "2026-10-21T12:35:53.019Z",
      "user": {
        "id": "e908d29c-dbdb-4b6e-812e-eeb757bd2149",
        "first_name": "Moussa",
        "last_name": "Sow",
        "email": "receptionnaire.cbe8d4f61c@test.sn",
        "phone": null,
        "job_title": null,
        "status": "actif",
        "last_login_at": "2026-10-21T12:35:52.894Z",
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
      "id": "4ed486b0-178c-4965-a101-31c5bee0382d",
      "company_id": "21630658-1adc-4519-a33c-084597140399",
      "user_id": "2193ef83-c5c0-4214-a04c-c274f6a3a662",
      "role_code": "comptable",
      "status": "inactif",
      "invited_by": "eab7f9e5-1654-4ff1-a490-b5b3f44ea793",
      "created_at": "2026-10-21T12:35:52.014Z",
      "updated_at": "2026-10-21T12:35:52.092Z",
      "user": {
        "id": "2193ef83-c5c0-4214-a04c-c274f6a3a662",
        "first_name": "Moussa",
        "last_name": "Sow",
        "email": "comptable.58cbd7711c@test.sn",
        "phone": null,
        "job_title": null,
        "status": "actif",
        "last_login_at": "2026-10-21T12:35:52.027Z",
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
      "id": "4ed486b0-178c-4965-a101-31c5bee0382d",
      "company_id": "21630658-1adc-4519-a33c-084597140399",
      "user_id": "2193ef83-c5c0-4214-a04c-c274f6a3a662",
      "role_code": "comptable",
      "status": "actif",
      "invited_by": "eab7f9e5-1654-4ff1-a490-b5b3f44ea793",
      "created_at": "2026-10-21T12:35:52.014Z",
      "updated_at": "2026-10-21T12:35:52.148Z",
      "user": {
        "id": "2193ef83-c5c0-4214-a04c-c274f6a3a662",
        "first_name": "Moussa",
        "last_name": "Sow",
        "email": "comptable.58cbd7711c@test.sn",
        "phone": null,
        "job_title": null,
        "status": "actif",
        "last_login_at": "2026-10-21T12:35:52.027Z",
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


Exemple de query string réelle : `?type=fournisseur&q=Grossiste%20Thi%C3%A8s%201792586152315`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `name`, `legal_name`, `type`, `sector`, `description`, `address`, `city`, `country`, `phone`, `email`, `website`, `ninea`, `rccm`, `logo_document_id`, `created_at`, `products_count`, `logo_url`, `my_relation`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "81e6f571-9699-4ea1-8239-18fad6e8b197",
        "name": "Grossiste Thiès 1792586152315",
        "legal_name": null,
        "type": "fournisseur",
        "sector": "distribution",
        "description": null,
        "address": null,
        "city": "Thiès",
        "country": "SN",
        "phone": "+221778364252",
        "email": "admin.d057488a57@test.sn",
        "website": null,
        "ninea": "176890543",
        "rccm": null,
        "logo_document_id": null,
        "created_at": "2026-10-21T12:35:52.335Z",
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
      "id": "81e6f571-9699-4ea1-8239-18fad6e8b197",
      "name": "Grossiste Thiès 1792586152315",
      "legal_name": null,
      "type": "fournisseur",
      "sector": "distribution",
      "description": null,
      "address": null,
      "city": "Thiès",
      "country": "SN",
      "phone": "+221778364252",
      "email": "admin.d057488a57@test.sn",
      "website": null,
      "ninea": "176890543",
      "rccm": null,
      "logo_document_id": null,
      "created_at": "2026-10-21T12:35:52.335Z",
      "products_count": 0,
      "logo_url": null,
      "my_relation": {
        "supplier": {
          "id": "eb8c6596-b972-41a0-8d1e-7ccc36b4c28e",
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

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `status`, `relation`, `partner`, `buyer_company_id`, `supplier_company_id`, `requested_by_me`, `request_message`, `responded_at`, `payment_terms_days`, `supplier_customer_code`, `credit_limit`, `block_on_overdue`, `my_notes`, `suspended_by_me`, `suspended_reason`, `created_at`, `updated_at`, `stats`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "a55fc44c-e2b8-4640-9a48-269207c5e26c",
        "status": "actif",
        "relation": "fournisseur",
        "partner": {
          "id": "1d1e053e-cad9-4f43-a768-aceb546bcac4",
          "name": "Société c437c4",
          "type": "fournisseur",
          "sector": "distribution",
          "city": "Dakar",
          "country": "SN",
          "phone": "+221778364256",
          "email": "admin.6494fe626b@test.sn",
          "logo_document_id": null,
          "status": "actif",
          "ninea": "538759222",
          "logo_url": null
        },
        "buyer_company_id": "e9bce6d2-16cc-44eb-9dbb-10b1dd81fe05",
        "supplier_company_id": "1d1e053e-cad9-4f43-a768-aceb546bcac4",
        "requested_by_me": true,
        "request_message": "Bonjour, nous souhaitons commander chez vous",
        "responded_at": "2026-10-21T12:35:52.843Z",
        "payment_terms_days": 60,
        "supplier_customer_code": "CL-0042",
        "credit_limit": null,
        "block_on_overdue": false,
        "my_notes": "Livre vite, prix corrects",
        "suspended_by_me": null,
        "suspended_reason": null,
        "created_at": "2026-10-21T12:35:52.758Z",
        "updated_at": "2026-10-21T12:35:52.924Z",
        "stats": {
          "orders_in_progress": 0,
          "invoiced_total": 0,
          "paid_total": 0,
          "credited_total": 0,
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
  "company_id": "1d1e053e-cad9-4f43-a768-aceb546bcac4",
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
      "id": "a55fc44c-e2b8-4640-9a48-269207c5e26c",
      "status": "en_attente",
      "relation": "fournisseur",
      "partner": {
        "id": "1d1e053e-cad9-4f43-a768-aceb546bcac4",
        "name": "Société c437c4",
        "type": "fournisseur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221778364256",
        "email": "admin.6494fe626b@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "538759222",
        "logo_url": null
      },
      "buyer_company_id": "e9bce6d2-16cc-44eb-9dbb-10b1dd81fe05",
      "supplier_company_id": "1d1e053e-cad9-4f43-a768-aceb546bcac4",
      "requested_by_me": true,
      "request_message": "Bonjour, nous souhaitons commander chez vous",
      "responded_at": null,
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "credit_limit": null,
      "block_on_overdue": false,
      "my_notes": null,
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T12:35:52.758Z",
      "updated_at": "2026-10-21T12:35:52.758Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "credited_total": 0,
        "balance": 0,
        "overdue_total": 0
      },
      "credit": {
        "limit": null,
        "exposure": 0,
        "available": null,
        "block_on_overdue": false,
        "overdue_invoices": 0
      }
    }
  }
}
```

</details>

**Erreurs observées :** 409 `DEMANDE_EN_COURS` · 422 `PARTENAIRE_INVALIDE` · 422 `PROFIL_ENTREPRISE_INCOMPATIBLE` · 503 `BASE_INDISPONIBLE`.

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
        "id": "eb8c4434-49ed-4033-abe5-630101659d3f",
        "company_id": "108708ac-4339-448d-8719-7da2ffc3633b",
        "relation": "fournisseur",
        "email": "nouveau-fournisseur.ca664097fd@test.sn",
        "company_name": "Laiterie du Fleuve",
        "contact_name": null,
        "message": "Rejoignez-nous",
        "status": "acceptee",
        "expires_at": "2026-11-20T12:35:50.901Z",
        "accepted_company_id": "56d1d632-2583-4da7-a8a1-5195c0303c81",
        "accepted_at": "2026-10-21T12:35:50.969Z",
        "created_by": "12340cb8-a7be-4278-8803-88cf0f6ff749",
        "created_at": "2026-10-21T12:35:50.902Z",
        "updated_at": "2026-10-21T12:35:50.969Z"
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
  "email": "nouveau-fournisseur.ca664097fd@test.sn",
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
      "id": "eb8c4434-49ed-4033-abe5-630101659d3f",
      "status": "en_attente",
      "company_id": "108708ac-4339-448d-8719-7da2ffc3633b",
      "relation": "fournisseur",
      "email": "nouveau-fournisseur.ca664097fd@test.sn",
      "company_name": "Laiterie du Fleuve",
      "contact_name": null,
      "message": "Rejoignez-nous",
      "expires_at": "2026-11-20T12:35:50.901Z",
      "created_by": "12340cb8-a7be-4278-8803-88cf0f6ff749",
      "updated_at": "2026-10-21T12:35:50.902Z",
      "created_at": "2026-10-21T12:35:50.902Z",
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
      "id": "a55fc44c-e2b8-4640-9a48-269207c5e26c",
      "status": "actif",
      "relation": "fournisseur",
      "partner": {
        "id": "1d1e053e-cad9-4f43-a768-aceb546bcac4",
        "name": "Société c437c4",
        "type": "fournisseur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221778364256",
        "email": "admin.6494fe626b@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "538759222",
        "logo_url": null
      },
      "buyer_company_id": "e9bce6d2-16cc-44eb-9dbb-10b1dd81fe05",
      "supplier_company_id": "1d1e053e-cad9-4f43-a768-aceb546bcac4",
      "requested_by_me": true,
      "request_message": "Bonjour, nous souhaitons commander chez vous",
      "responded_at": "2026-10-21T12:35:52.843Z",
      "payment_terms_days": 60,
      "supplier_customer_code": "CL-0042",
      "credit_limit": null,
      "block_on_overdue": false,
      "my_notes": "Livre vite, prix corrects",
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T12:35:52.758Z",
      "updated_at": "2026-10-21T12:35:52.924Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "credited_total": 0,
        "balance": 0,
        "overdue_total": 0
      },
      "credit": {
        "limit": null,
        "exposure": 0,
        "available": null,
        "block_on_overdue": false,
        "overdue_invoices": 0
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
| `price_list_id` | string (uuid) | non | `null` accepté |
| `credit_limit` | integer | non | `null` accepté · ≥ 0 · ≤ 10000000000000 |
| `block_on_overdue` | boolean | non |  |


<details><summary>Exemple réel de requête</summary>

```json
{
  "notes": "Bon payeur",
  "payment_terms_days": 60,
  "supplier_customer_code": "CL-0042"
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
      "id": "a55fc44c-e2b8-4640-9a48-269207c5e26c",
      "status": "actif",
      "relation": "client",
      "partner": {
        "id": "e9bce6d2-16cc-44eb-9dbb-10b1dd81fe05",
        "name": "Société 669ca3",
        "type": "acheteur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221778364255",
        "email": "admin.3f09cec1e5@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "805877137",
        "logo_url": null
      },
      "buyer_company_id": "e9bce6d2-16cc-44eb-9dbb-10b1dd81fe05",
      "supplier_company_id": "1d1e053e-cad9-4f43-a768-aceb546bcac4",
      "requested_by_me": false,
      "request_message": "Bonjour, nous souhaitons commander chez vous",
      "responded_at": "2026-10-21T12:35:52.843Z",
      "payment_terms_days": 60,
      "supplier_customer_code": "CL-0042",
      "credit_limit": null,
      "block_on_overdue": false,
      "price_list_id": null,
      "my_notes": "Bon payeur",
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T12:35:52.758Z",
      "updated_at": "2026-10-21T12:35:52.924Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "credited_total": 0,
        "balance": 0,
        "overdue_total": 0
      },
      "credit": {
        "limit": null,
        "exposure": 0,
        "available": null,
        "block_on_overdue": false,
        "overdue_invoices": 0
      }
    }
  }
}
```

</details>

**Erreurs observées :** 403 `CHAMP_RESERVE_FOURNISSEUR` · 422 `DONNEES_INVALIDES` · 422 `LISTE_PRIX_INVALIDE`.

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
      "id": "a55fc44c-e2b8-4640-9a48-269207c5e26c",
      "status": "actif",
      "relation": "client",
      "partner": {
        "id": "e9bce6d2-16cc-44eb-9dbb-10b1dd81fe05",
        "name": "Société 669ca3",
        "type": "acheteur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221778364255",
        "email": "admin.3f09cec1e5@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "805877137",
        "logo_url": null
      },
      "buyer_company_id": "e9bce6d2-16cc-44eb-9dbb-10b1dd81fe05",
      "supplier_company_id": "1d1e053e-cad9-4f43-a768-aceb546bcac4",
      "requested_by_me": false,
      "request_message": "Bonjour, nous souhaitons commander chez vous",
      "responded_at": "2026-10-21T12:35:52.843Z",
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "credit_limit": null,
      "block_on_overdue": false,
      "price_list_id": null,
      "my_notes": null,
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T12:35:52.758Z",
      "updated_at": "2026-10-21T12:35:52.849Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "credited_total": 0,
        "balance": 0,
        "overdue_total": 0
      },
      "credit": {
        "limit": null,
        "exposure": 0,
        "available": null,
        "block_on_overdue": false,
        "overdue_invoices": 0
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
      "id": "63189992-6832-4d30-9ebf-1e0f7a84eca5",
      "status": "refuse",
      "relation": "client",
      "partner": {
        "id": "39b03637-6973-4f1e-9a47-4dcfb1f18e20",
        "name": "Société 1fc2ec",
        "type": "acheteur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221778364246",
        "email": "admin.54f4143184@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "623643603",
        "logo_url": null
      },
      "buyer_company_id": "39b03637-6973-4f1e-9a47-4dcfb1f18e20",
      "supplier_company_id": "fe53e891-37b4-4586-a4ba-5890039a29f4",
      "requested_by_me": false,
      "request_message": null,
      "responded_at": "2026-10-21T12:35:51.707Z",
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "credit_limit": null,
      "block_on_overdue": false,
      "price_list_id": null,
      "my_notes": null,
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T12:35:51.669Z",
      "updated_at": "2026-10-21T12:35:51.711Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "credited_total": 0,
        "balance": 0,
        "overdue_total": 0
      },
      "credit": {
        "limit": null,
        "exposure": 0,
        "available": null,
        "block_on_overdue": false,
        "overdue_invoices": 0
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
      "id": "065c3d2c-21a6-455f-b366-e8358e02cfb2",
      "status": "suspendu",
      "relation": "client",
      "partner": {
        "id": "09a6e3ef-cc5c-4a6a-9444-f7fefb33f1b6",
        "name": "Société dbaa70",
        "type": "acheteur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221778364250",
        "email": "admin.3cac96d726@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "960784176",
        "logo_url": null
      },
      "buyer_company_id": "09a6e3ef-cc5c-4a6a-9444-f7fefb33f1b6",
      "supplier_company_id": "228a65e9-2b09-4a92-bf4a-ba64284d45cc",
      "requested_by_me": false,
      "request_message": null,
      "responded_at": "2026-10-21T12:35:52.099Z",
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "credit_limit": null,
      "block_on_overdue": false,
      "price_list_id": null,
      "my_notes": null,
      "suspended_by_me": true,
      "suspended_reason": "Impayés",
      "created_at": "2026-10-21T12:35:52.061Z",
      "updated_at": "2026-10-21T12:35:52.207Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "credited_total": 0,
        "balance": 0,
        "overdue_total": 0
      },
      "credit": {
        "limit": null,
        "exposure": 0,
        "available": null,
        "block_on_overdue": false,
        "overdue_invoices": 0
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
      "id": "065c3d2c-21a6-455f-b366-e8358e02cfb2",
      "status": "actif",
      "relation": "client",
      "partner": {
        "id": "09a6e3ef-cc5c-4a6a-9444-f7fefb33f1b6",
        "name": "Société dbaa70",
        "type": "acheteur",
        "sector": "distribution",
        "city": "Dakar",
        "country": "SN",
        "phone": "+221778364250",
        "email": "admin.3cac96d726@test.sn",
        "logo_document_id": null,
        "status": "actif",
        "ninea": "960784176",
        "logo_url": null
      },
      "buyer_company_id": "09a6e3ef-cc5c-4a6a-9444-f7fefb33f1b6",
      "supplier_company_id": "228a65e9-2b09-4a92-bf4a-ba64284d45cc",
      "requested_by_me": false,
      "request_message": null,
      "responded_at": "2026-10-21T12:35:52.099Z",
      "payment_terms_days": 30,
      "supplier_customer_code": null,
      "credit_limit": null,
      "block_on_overdue": false,
      "price_list_id": null,
      "my_notes": null,
      "suspended_by_me": null,
      "suspended_reason": null,
      "created_at": "2026-10-21T12:35:52.061Z",
      "updated_at": "2026-10-21T12:35:52.289Z",
      "stats": {
        "orders_in_progress": 0,
        "invoiced_total": 0,
        "paid_total": 0,
        "credited_total": 0,
        "balance": 0,
        "overdue_total": 0
      },
      "credit": {
        "limit": null,
        "exposure": 0,
        "available": null,
        "block_on_overdue": false,
        "overdue_invoices": 0
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
      "partnership_id": "1eca8550-5106-49bf-8621-b425f3dea87d",
      "side": "fournisseur",
      "buyer": {
        "id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
        "name": "Société 125a02"
      },
      "supplier": {
        "id": "ce2b7866-4e66-4282-aab1-eecb93736954",
        "name": "Société 164e26"
      },
      "period": {
        "start": null,
        "end": "2026-10-21"
      },
      "opening_balance": 0,
      "closing_balance": 151600,
      "total_debit": 187000,
      "total_credit": 35400,
      "lines": [
        {
          "type": "facture",
          "id": "59649210-a2e8-43dd-86e1-837291d50640",
          "reference": "FAC-2026-00001",
          "date": "2026-10-21",
          "debit": 187000,
          "credit": 0,
          "balance": 187000,
          "status": "partiellement_payee",
          "due_date": "2026-11-20"
        },
        {
          "type": "avoir",
          "id": "47a34dcf-a5e2-49ef-bb62-704f694ab131",
          "reference": "AV-2026-00001",
          "date": "2026-10-21",
          "debit": 0,
          "credit": 35400,
          "balance": 151600,
          "status": "emis",
          "due_date": null
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
| GET | `/api/v1/produits/export.csv` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/produits/import/modele.csv` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/produits/import` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/produits/stock/alertes` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/produits/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| PATCH | `/api/v1/produits/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| PATCH | `/api/v1/produits/:id/prix` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| PATCH | `/api/v1/produits/:id/disponibilite` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/produits/:id/activer` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/produits/:id/desactiver` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/produits/:id/photo` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| DELETE | `/api/v1/produits/:id/photo` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/produits/:id/stock` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/produits/:id/mouvements-stock` | membre d’une entreprise active — entreprise fournisseur ou mixte |
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

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `category_id`, `reference`, `name`, `description`, `unit`, `packaging`, `price`, `tax_rate`, `availability`, `stock_quantity`, `min_order_quantity`, `order_multiple`, `max_order_quantity`, `stock_reserved`, `low_stock_threshold`, `low_stock_notified_at`, `is_active`, `photo_document_id`, `created_by`, `created_at`, `updated_at`, `deleted_at`, `category`, `price_tiers`, `available_quantity`, `photo_url`, `photo_thumbnail_url`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "567f50fa-82af-4e25-8212-e9bf4275cb3e",
        "company_id": "8f703fad-0c38-4274-a060-3bac90f4a001",
        "category_id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
        "reference": "RIZ-25",
        "name": "Riz brisé bc42",
        "description": null,
        "unit": "sac",
        "packaging": "Sac de 25 kg",
        "price": 16500,
        "tax_rate": 18,
        "availability": "stock_limite",
        "stock_quantity": 12,
        "min_order_quantity": 1,
        "order_multiple": null,
        "max_order_quantity": null,
        "stock_reserved": 0,
        "low_stock_threshold": null,
        "low_stock_notified_at": null,
        "is_active": false,
        "photo_document_id": "6538c595-46ec-409b-abc4-bc7c38b1cfc5",
        "created_by": "dc35b12a-1517-4708-a376-c78765d78ebe",
        "created_at": "2026-10-21T12:35:49.632Z",
        "updated_at": "2026-10-21T12:35:49.852Z",
        "deleted_at": null,
        "category": {
          "id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
          "name": "Céréales"
        },
        "price_tiers": [],
        "available_quantity": 12,
        "photo_url": "/api/v1/documents/6538c595-46ec-409b-abc4-bc7c38b1cfc5/fichier",
        "photo_thumbnail_url": "/api/v1/documents/6538c595-46ec-409b-abc4-bc7c38b1cfc5/fichier?taille=miniature"
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
| `order_multiple` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `max_order_quantity` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `low_stock_threshold` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max |
| `price_tiers` | tableau de object | non | max 10 élément(s) · sans doublon |
| `price_tiers[].min_quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `price_tiers[].discount_percent` | number | **oui** | > 0 · < 100 · 2 décimale(s) max |


<details><summary>Exemple réel de requête</summary>

```json
{
  "reference": "RIZ-25",
  "name": "Riz brisé bc42",
  "unit": "sac",
  "price": 15000,
  "tax_rate": 18,
  "category_id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
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
      "id": "567f50fa-82af-4e25-8212-e9bf4275cb3e",
      "company_id": "8f703fad-0c38-4274-a060-3bac90f4a001",
      "category_id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
      "reference": "RIZ-25",
      "name": "Riz brisé bc42",
      "description": null,
      "unit": "sac",
      "packaging": "Sac de 25 kg",
      "price": 15000,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "stock_reserved": 0,
      "low_stock_threshold": null,
      "low_stock_notified_at": null,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "dc35b12a-1517-4708-a376-c78765d78ebe",
      "created_at": "2026-10-21T12:35:49.632Z",
      "updated_at": "2026-10-21T12:35:49.632Z",
      "deleted_at": null,
      "category": {
        "id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
        "name": "Céréales"
      },
      "price_tiers": [],
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `REFERENCE_UTILISEE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/produits/export.csv`

Import / export du catalogue (CSV Excel) : la référence identifie le produit.

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `catalogue.lire`
- **Format :** aucun corps

**Réponse 200 :** fichier `text/csv` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 403 `PERMISSION_REFUSEE`.

---

#### `GET /api/v1/produits/import/modele.csv`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Format :** aucun corps

**Réponse 200 :** fichier `text/csv` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

---

#### `POST /api/v1/produits/import`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative
- **Fichier :** champ `fichier` (**obligatoire**) — un fichier CSV (séparateur ; ou ,) exporté d’Excel ou de LibreOffice

**Champs du formulaire (multipart)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `simulation` | boolean | non | défaut : `false` |


**Réponse 200 :** `data` contient `import`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Catalogue importé : 1 produit(s) créé(s), 1 mis à jour",
  "data": {
    "import": {
      "created": 1,
      "updated": 1,
      "categories_created": 2,
      "simulation": false
    }
  }
}
```

</details>

**Erreurs observées :** 422 `IMPORT_INVALIDE`.

---

#### `GET /api/v1/produits/stock/alertes`

Produits en rupture ou sous leur seuil d'alerte.

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `catalogue.lire`
- **Format :** aucun corps

**Réponse 200 :** `data` contient `products`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "products": [
      {
        "id": "e7538708-d29d-4945-9b23-4641e8b9403e",
        "reference": "REF-7c07b7",
        "name": "Riz brisé f687",
        "unit": "sac",
        "stock_quantity": 20,
        "stock_reserved": 16,
        "low_stock_threshold": 5,
        "availability": "stock_limite",
        "is_active": true,
        "available_quantity": 4
      }
    ]
  }
}
```

</details>

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
      "id": "138fa294-5b47-497e-be5d-fd16524b00f7",
      "company_id": "6e7d5cac-98c1-4439-beb9-1dfbbc31437a",
      "category_id": "823987f3-b6bd-4c12-af2e-4b2203b5b8ed",
      "reference": "REF-2e761d",
      "name": "Riz brisé c917",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 16500,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "stock_reserved": 0,
      "low_stock_threshold": null,
      "low_stock_notified_at": null,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "cd3485f0-f711-43d2-9184-466fa0518640",
      "created_at": "2026-10-21T12:35:02.120Z",
      "updated_at": "2026-10-21T12:35:02.284Z",
      "deleted_at": null,
      "category": {
        "id": "823987f3-b6bd-4c12-af2e-4b2203b5b8ed",
        "name": "Céréales"
      },
      "price_tiers": [],
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
| `order_multiple` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `max_order_quantity` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `low_stock_threshold` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max |
| `price_tiers` | tableau de object | non | max 10 élément(s) · sans doublon |
| `price_tiers[].min_quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `price_tiers[].discount_percent` | number | **oui** | > 0 · < 100 · 2 décimale(s) max |


<details><summary>Exemple réel de requête</summary>

```json
{
  "stock_quantity": 14
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
      "id": "d8abc088-0726-46dc-9209-3fe4d2dbf704",
      "company_id": "3f9254ee-f005-4bf3-a788-1e423f47e211",
      "category_id": null,
      "reference": "REF-f2a10f",
      "name": "Riz brisé 0f22",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 15000,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": 14,
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "stock_reserved": 6,
      "low_stock_threshold": null,
      "low_stock_notified_at": null,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "a9c53588-ae80-454a-acf6-1a697e355ef0",
      "created_at": "2026-10-21T12:35:18.945Z",
      "updated_at": "2026-10-21T12:35:19.245Z",
      "deleted_at": null,
      "category": null,
      "price_tiers": [],
      "available_quantity": 8,
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 409 `STOCK_RESERVE` · 422 `DONNEES_INVALIDES`.

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
| `price_tiers` | tableau de object | non | max 10 élément(s) · sans doublon |
| `price_tiers[].min_quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `price_tiers[].discount_percent` | number | **oui** | > 0 · < 100 · 2 décimale(s) max |


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
      "id": "567f50fa-82af-4e25-8212-e9bf4275cb3e",
      "company_id": "8f703fad-0c38-4274-a060-3bac90f4a001",
      "category_id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
      "reference": "RIZ-25",
      "name": "Riz brisé bc42",
      "description": null,
      "unit": "sac",
      "packaging": "Sac de 25 kg",
      "price": 16500,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "stock_reserved": 0,
      "low_stock_threshold": null,
      "low_stock_notified_at": null,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "dc35b12a-1517-4708-a376-c78765d78ebe",
      "created_at": "2026-10-21T12:35:49.632Z",
      "updated_at": "2026-10-21T12:35:49.692Z",
      "deleted_at": null,
      "category": {
        "id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
        "name": "Céréales"
      },
      "price_tiers": [],
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
      "id": "567f50fa-82af-4e25-8212-e9bf4275cb3e",
      "company_id": "8f703fad-0c38-4274-a060-3bac90f4a001",
      "category_id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
      "reference": "RIZ-25",
      "name": "Riz brisé bc42",
      "description": null,
      "unit": "sac",
      "packaging": "Sac de 25 kg",
      "price": 16500,
      "tax_rate": 18,
      "availability": "stock_limite",
      "stock_quantity": 12,
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "stock_reserved": 0,
      "low_stock_threshold": null,
      "low_stock_notified_at": null,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "dc35b12a-1517-4708-a376-c78765d78ebe",
      "created_at": "2026-10-21T12:35:49.632Z",
      "updated_at": "2026-10-21T12:35:49.726Z",
      "deleted_at": null,
      "category": {
        "id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
        "name": "Céréales"
      },
      "price_tiers": [],
      "available_quantity": 12,
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
      "id": "4ca51c0a-5bd2-4296-82b4-e3ff5dc7de35",
      "company_id": "0569703d-92e6-47df-8c86-b680b8d5747c",
      "category_id": null,
      "reference": "REF-936cf7",
      "name": "Riz brisé 1d2e",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 15000,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "stock_reserved": 0,
      "low_stock_threshold": null,
      "low_stock_notified_at": null,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "c4e70618-5ce5-4098-9954-b6b14164b7ac",
      "created_at": "2026-10-21T12:35:45.426Z",
      "updated_at": "2026-10-21T12:35:45.644Z",
      "deleted_at": null,
      "category": null,
      "price_tiers": [],
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
      "id": "567f50fa-82af-4e25-8212-e9bf4275cb3e",
      "company_id": "8f703fad-0c38-4274-a060-3bac90f4a001",
      "category_id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
      "reference": "RIZ-25",
      "name": "Riz brisé bc42",
      "description": null,
      "unit": "sac",
      "packaging": "Sac de 25 kg",
      "price": 16500,
      "tax_rate": 18,
      "availability": "stock_limite",
      "stock_quantity": 12,
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "stock_reserved": 0,
      "low_stock_threshold": null,
      "low_stock_notified_at": null,
      "is_active": false,
      "photo_document_id": "6538c595-46ec-409b-abc4-bc7c38b1cfc5",
      "created_by": "dc35b12a-1517-4708-a376-c78765d78ebe",
      "created_at": "2026-10-21T12:35:49.632Z",
      "updated_at": "2026-10-21T12:35:49.852Z",
      "deleted_at": null,
      "category": {
        "id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
        "name": "Céréales"
      },
      "price_tiers": [],
      "available_quantity": 12,
      "photo_url": "/api/v1/documents/6538c595-46ec-409b-abc4-bc7c38b1cfc5/fichier",
      "photo_thumbnail_url": "/api/v1/documents/6538c595-46ec-409b-abc4-bc7c38b1cfc5/fichier?taille=miniature"
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
      "id": "567f50fa-82af-4e25-8212-e9bf4275cb3e",
      "company_id": "8f703fad-0c38-4274-a060-3bac90f4a001",
      "category_id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
      "reference": "RIZ-25",
      "name": "Riz brisé bc42",
      "description": null,
      "unit": "sac",
      "packaging": "Sac de 25 kg",
      "price": 16500,
      "tax_rate": 18,
      "availability": "stock_limite",
      "stock_quantity": 12,
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "stock_reserved": 0,
      "low_stock_threshold": null,
      "low_stock_notified_at": null,
      "is_active": true,
      "photo_document_id": "6538c595-46ec-409b-abc4-bc7c38b1cfc5",
      "created_by": "dc35b12a-1517-4708-a376-c78765d78ebe",
      "created_at": "2026-10-21T12:35:49.632Z",
      "updated_at": "2026-10-21T12:35:49.815Z",
      "deleted_at": null,
      "category": {
        "id": "94c5a1ae-ac9b-4e71-ab47-7a22566960e7",
        "name": "Céréales"
      },
      "price_tiers": [],
      "available_quantity": 12,
      "photo_url": "/api/v1/documents/6538c595-46ec-409b-abc4-bc7c38b1cfc5/fichier",
      "photo_thumbnail_url": "/api/v1/documents/6538c595-46ec-409b-abc4-bc7c38b1cfc5/fichier?taille=miniature"
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
      "id": "4ca51c0a-5bd2-4296-82b4-e3ff5dc7de35",
      "company_id": "0569703d-92e6-47df-8c86-b680b8d5747c",
      "category_id": null,
      "reference": "REF-936cf7",
      "name": "Riz brisé 1d2e",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 15000,
      "tax_rate": 18,
      "availability": "disponible",
      "stock_quantity": null,
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "stock_reserved": 0,
      "low_stock_threshold": null,
      "low_stock_notified_at": null,
      "is_active": true,
      "photo_document_id": null,
      "created_by": "c4e70618-5ce5-4098-9954-b6b14164b7ac",
      "created_at": "2026-10-21T12:35:45.426Z",
      "updated_at": "2026-10-21T12:35:45.546Z",
      "deleted_at": null,
      "category": null,
      "price_tiers": [],
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/produits/:id/stock`

Stock : entrée, inventaire, historique des mouvements.

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
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
| `type` | string | **oui** | valeurs : `entree`, `ajustement` |
| `quantity` | any | non | obligatoire ou interdit selon d’autres champs |
| `stock_quantity` | any | non | obligatoire ou interdit selon d’autres champs |
| `note` | string | non | `null` accepté · max 500 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "type": "entree",
  "quantity": 1
}
```

</details>

**Réponse 201 :** `data` contient `product`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Stock mis à jour",
  "data": {
    "product": {
      "id": "e7538708-d29d-4945-9b23-4641e8b9403e",
      "company_id": "83c50c5c-6df5-4f67-81f0-92ef3d6f8728",
      "category_id": null,
      "reference": "REF-7c07b7",
      "name": "Riz brisé f687",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 15000,
      "tax_rate": 18,
      "availability": "stock_limite",
      "stock_quantity": 21,
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "stock_reserved": 16,
      "low_stock_threshold": 5,
      "low_stock_notified_at": "2026-10-21T12:35:18.401Z",
      "is_active": true,
      "photo_document_id": null,
      "created_by": "e2a115b8-ffef-4deb-9476-c99e473f5b93",
      "created_at": "2026-10-21T12:35:18.107Z",
      "updated_at": "2026-10-21T12:35:18.536Z",
      "deleted_at": null,
      "category": null,
      "price_tiers": [],
      "available_quantity": 5,
      "photo_url": null,
      "photo_thumbnail_url": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `STATUT_INCHANGE` · 422 `DONNEES_INVALIDES` · 422 `STOCK_SOUS_RESERVE`.

---

#### `GET /api/v1/produits/:id/mouvements-stock`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `catalogue.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |


**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `product_id`, `type`, `quantity`, `stock_after`, `reserved_after`, `order_id`, `note`, `created_by`, `created_at`, `author`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": 11,
        "company_id": "521b9f0b-d34a-4f14-a165-730efcbd29a6",
        "product_id": "0387683a-2d1d-4a9b-8e43-8eeccbeec930",
        "type": "liberation",
        "quantity": -7,
        "stock_after": 25,
        "reserved_after": 0,
        "order_id": "e4b788af-8d30-4454-9218-a860198246c9",
        "note": "Reliquat soldé BC-2026-00001",
        "created_by": "28034812-412e-431d-b369-6cfd5bcebed4",
        "created_at": "2026-10-21T12:35:17.336Z",
        "author": {
          "id": "28034812-412e-431d-b369-6cfd5bcebed4",
          "first_name": "Awa",
          "last_name": "Diop"
        }
      },
      {
        "id": 10,
        "company_id": "521b9f0b-d34a-4f14-a165-730efcbd29a6",
        "product_id": "0387683a-2d1d-4a9b-8e43-8eeccbeec930",
        "type": "sortie",
        "quantity": -5,
        "stock_after": 25,
        "reserved_after": 7,
        "order_id": "e4b788af-8d30-4454-9218-a860198246c9",
        "note": "Livraison BC-2026-00001",
        "created_by": "28034812-412e-431d-b369-6cfd5bcebed4",
        "created_at": "2026-10-21T12:35:17.183Z",
        "author": {
          "id": "28034812-412e-431d-b369-6cfd5bcebed4",
          "first_name": "Awa",
          "last_name": "Diop"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 4,
      "totalPages": 1
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
        "id": "4931a882-3d2c-43fa-908a-e5c552071510",
        "company_id": "d4f29223-82e7-4f39-8c57-c09231ab6c36",
        "name": "Boissons",
        "sort_order": 2,
        "created_at": "2026-10-21T12:35:45.775Z",
        "updated_at": "2026-10-21T12:35:45.775Z",
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
      "id": "4931a882-3d2c-43fa-908a-e5c552071510",
      "name": "Boissons",
      "sort_order": 2,
      "company_id": "d4f29223-82e7-4f39-8c57-c09231ab6c36",
      "updated_at": "2026-10-21T12:35:45.775Z",
      "created_at": "2026-10-21T12:35:45.775Z"
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
      "id": "4931a882-3d2c-43fa-908a-e5c552071510",
      "company_id": "d4f29223-82e7-4f39-8c57-c09231ab6c36",
      "name": "Boissons fraîches",
      "sort_order": 2,
      "created_at": "2026-10-21T12:35:45.775Z",
      "updated_at": "2026-10-21T12:35:45.871Z"
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

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `category_id`, `reference`, `name`, `description`, `unit`, `packaging`, `price`, `tax_rate`, `availability`, `min_order_quantity`, `order_multiple`, `max_order_quantity`, `is_active`, `photo_document_id`, `created_at`, `updated_at`, `deleted_at`, `category`, `photo_url`, `photo_thumbnail_url`, `catalog_price`, `has_customer_price`, `price_tiers`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "ede33259-27a5-4c1c-bcf7-6ecf8ac653a5",
        "company_id": "7e5dab3b-730b-42c3-ad59-a4b09773c69c",
        "category_id": null,
        "reference": "REF-ddfaa5",
        "name": "Riz brisé b029",
        "description": null,
        "unit": "kg",
        "packaging": null,
        "price": 2500,
        "tax_rate": 0,
        "availability": "disponible",
        "min_order_quantity": 1,
        "order_multiple": null,
        "max_order_quantity": null,
        "is_active": true,
        "photo_document_id": null,
        "created_at": "2026-10-21T12:35:50.399Z",
        "updated_at": "2026-10-21T12:35:50.399Z",
        "deleted_at": null,
        "category": null,
        "photo_url": null,
        "photo_thumbnail_url": null,
        "catalog_price": 2500,
        "has_customer_price": false,
        "price_tiers": []
      },
      {
        "id": "4ea6f0cf-e487-4e98-95dc-ed829d570a07",
        "company_id": "7e5dab3b-730b-42c3-ad59-a4b09773c69c",
        "category_id": null,
        "reference": "REF-0fa4e1",
        "name": "Riz brisé 0506",
        "description": null,
        "unit": "sac",
        "packaging": null,
        "price": 15000,
        "tax_rate": 18,
        "availability": "disponible",
        "min_order_quantity": 1,
        "order_multiple": null,
        "max_order_quantity": null,
        "is_active": true,
        "photo_document_id": "f4edbfe0-ffa6-4ab5-a515-44e55c60ae56",
        "created_at": "2026-10-21T12:35:50.337Z",
        "updated_at": "2026-10-21T12:35:50.559Z",
        "deleted_at": null,
        "category": null,
        "photo_url": "/api/v1/documents/f4edbfe0-ffa6-4ab5-a515-44e55c60ae56/fichier",
        "photo_thumbnail_url": "/api/v1/documents/f4edbfe0-ffa6-4ab5-a515-44e55c60ae56/fichier?taille=miniature",
        "catalog_price": 15000,
        "has_customer_price": false,
        "price_tiers": []
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
      "id": "221d1691-e621-4b01-a453-8547e49a788c",
      "company_id": "3caa5bb5-bf39-4b42-b997-bb0855f256e8",
      "category_id": null,
      "reference": "REF-d55695",
      "name": "Riz brisé abd3",
      "description": null,
      "unit": "sac",
      "packaging": null,
      "price": 15000,
      "tax_rate": 18,
      "availability": "disponible",
      "min_order_quantity": 1,
      "order_multiple": null,
      "max_order_quantity": null,
      "is_active": true,
      "photo_document_id": null,
      "created_at": "2026-10-21T12:35:16.603Z",
      "updated_at": "2026-10-21T12:35:16.603Z",
      "deleted_at": null,
      "category": null,
      "photo_url": null,
      "photo_thumbnail_url": null,
      "catalog_price": 15000,
      "has_customer_price": false,
      "price_tiers": [
        {
          "min_quantity": 10,
          "discount_percent": 5,
          "unit_price": 14250
        },
        {
          "min_quantity": 50,
          "discount_percent": 10,
          "unit_price": 13500
        }
      ]
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

## 14. Listes de prix (tarifs clients)

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/listes-prix` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/listes-prix` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/listes-prix/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| PATCH | `/api/v1/listes-prix/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| DELETE | `/api/v1/listes-prix/:id` | membre d’une entreprise active — entreprise fournisseur ou mixte |

#### `GET /api/v1/listes-prix`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `catalogue.lire`
- **Format :** aucun corps

**Réponse 200 :** `data` contient `price_lists`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "price_lists": [
      {
        "id": "80835912-623c-409b-8ccc-f6ada14634c7",
        "company_id": "6c500693-7941-4cab-958c-cacb24834b81",
        "name": "Grossistes",
        "description": null,
        "discount_percent": 10,
        "is_active": true,
        "created_by": "77b82fc4-4398-4e18-8615-3d094cfce5a8",
        "created_at": "2026-10-21T12:39:03.104Z",
        "updated_at": "2026-10-21T12:39:03.104Z",
        "deleted_at": null,
        "clients_count": 1,
        "items_count": 1
      }
    ]
  }
}
```

</details>

---

#### `POST /api/v1/listes-prix`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `produits.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `name` | string | **oui** | min 1 car. · max 100 car. |
| `description` | string | non | `null` accepté · max 1000 car. |
| `discount_percent` | number | non | ≥ 0 · < 100 · 2 décimale(s) max |
| `is_active` | boolean | non |  |
| `items` | tableau de object | non | max 5000 élément(s) · sans doublon |
| `items[].product_id` | string (uuid) | **oui** |  |
| `items[].price` | integer | **oui** | ≥ 0 · ≤ 1000000000000 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "name": "Grossistes",
  "discount_percent": 10,
  "items": [
    {
      "product_id": "1f75e38b-d04c-4818-82d9-44c7e0537c29",
      "price": 14000
    }
  ]
}
```

</details>

**Réponse 201 :** `data` contient `price_list`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Liste de prix créée",
  "data": {
    "price_list": {
      "id": "ba26d6bb-4f61-4f1b-9a99-3e86f567fbc9",
      "company_id": "6fe2b108-22b1-4b4e-a506-3714149aef57",
      "name": "Grossistes",
      "description": null,
      "discount_percent": 10,
      "is_active": true,
      "created_by": "d8de764c-8bcd-433c-ac2b-e5df88d5b819",
      "created_at": "2026-10-21T12:35:18.427Z",
      "updated_at": "2026-10-21T12:35:18.427Z",
      "deleted_at": null,
      "clients_count": 0,
      "items": [
        {
          "product_id": "1f75e38b-d04c-4818-82d9-44c7e0537c29",
          "price": 14000,
          "product": {
            "id": "1f75e38b-d04c-4818-82d9-44c7e0537c29",
            "reference": "REF-224d61",
            "name": "Riz brisé 4474",
            "unit": "sac",
            "price": 15000,
            "is_active": true,
            "catalog_price": 15000
          }
        }
      ],
      "clients": []
    }
  }
}
```

</details>

**Erreurs observées :** 409 `LISTE_PRIX_EXISTANTE` · 422 `PRODUIT_INVALIDE`.

---

#### `GET /api/v1/listes-prix/:id`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `catalogue.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `price_list`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "price_list": {
      "id": "ba26d6bb-4f61-4f1b-9a99-3e86f567fbc9",
      "company_id": "6fe2b108-22b1-4b4e-a506-3714149aef57",
      "name": "Grossistes",
      "description": null,
      "discount_percent": 10,
      "is_active": true,
      "created_by": "d8de764c-8bcd-433c-ac2b-e5df88d5b819",
      "created_at": "2026-10-21T12:35:18.427Z",
      "updated_at": "2026-10-21T12:35:18.427Z",
      "deleted_at": null,
      "clients_count": 1,
      "items": [
        {
          "product_id": "1f75e38b-d04c-4818-82d9-44c7e0537c29",
          "price": 14000,
          "product": {
            "id": "1f75e38b-d04c-4818-82d9-44c7e0537c29",
            "reference": "REF-224d61",
            "name": "Riz brisé 4474",
            "unit": "sac",
            "price": 15000,
            "is_active": true,
            "catalog_price": 15000
          }
        }
      ],
      "clients": [
        {
          "partnership_id": "7b5e4b87-69fc-41c6-a08d-67113e49cca3",
          "status": "actif",
          "company": {
            "id": "086dacbd-1d41-4300-a43c-f8b299670114",
            "name": "Société db0077",
            "city": "Dakar"
          }
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `PATCH /api/v1/listes-prix/:id`

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
| `description` | string | non | `null` accepté · max 1000 car. |
| `discount_percent` | number | non | ≥ 0 · < 100 · 2 décimale(s) max |
| `is_active` | boolean | non |  |
| `items` | tableau de object | non | max 5000 élément(s) · sans doublon |
| `items[].product_id` | string (uuid) | **oui** |  |
| `items[].price` | integer | **oui** | ≥ 0 · ≤ 1000000000000 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "items": [
    {
      "product_id": "7ee3030e-eeae-4b9e-9522-f7087f583ecf",
      "price": 2000
    }
  ]
}
```

</details>

**Réponse 200 :** `data` contient `price_list`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Liste de prix modifiée",
  "data": {
    "price_list": {
      "id": "2214032a-ed76-4e10-b0e2-1c4b2b151279",
      "company_id": "e474c61c-a95e-4649-a60f-eba2d5b04a8d",
      "name": "Hôtels",
      "description": null,
      "discount_percent": 5,
      "is_active": true,
      "created_by": "a1d408e0-71a2-4fd0-88f5-858fa9886aef",
      "created_at": "2026-10-21T12:35:17.517Z",
      "updated_at": "2026-10-21T12:35:17.517Z",
      "deleted_at": null,
      "clients_count": 1,
      "items": [
        {
          "product_id": "7ee3030e-eeae-4b9e-9522-f7087f583ecf",
          "price": 2000,
          "product": {
            "id": "7ee3030e-eeae-4b9e-9522-f7087f583ecf",
            "reference": "REF-50a07c",
            "name": "Riz brisé 06a6",
            "unit": "kg",
            "price": 2500,
            "is_active": true,
            "catalog_price": 2500
          }
        }
      ],
      "clients": [
        {
          "partnership_id": "23102366-5dad-414f-aeaa-d444f3a3536b",
          "status": "actif",
          "company": {
            "id": "a2f1e884-74ee-464e-8ea8-e903a68c7c05",
            "name": "Société e644b6",
            "city": "Dakar"
          }
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `DELETE /api/v1/listes-prix/:id`

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
  "message": "Liste de prix supprimée : ses clients reviennent au prix catalogue",
  "data": null
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 15. Listes d’achat habituelles

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/listes-achat` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/listes-achat` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/listes-achat/:id` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| PATCH | `/api/v1/listes-achat/:id` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| DELETE | `/api/v1/listes-achat/:id` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/listes-achat/:id/commander` | membre d’une entreprise active — entreprise acheteuse ou mixte |

#### `GET /api/v1/listes-achat`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `supplier_id` | string (uuid) | non |  |
| `tri` | string | non | valeurs : `name`, `-name`, `created_at`, `-created_at`, `last_ordered_at`, `-last_ordered_at` |


Exemple de query string réelle : `?supplier_id=8c91132d-ff07-4ff3-a230-3fe8824f7eb0`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `supplier_company_id`, `name`, `notes`, `last_ordered_at`, `created_by`, `created_at`, `updated_at`, `deleted_at`, `items_count`, `supplier`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "a2a34c8f-7d3a-4638-ab29-d31b1c17b66b",
        "company_id": "aa041f3c-c6bc-4dd4-8d42-344cd8a1a857",
        "supplier_company_id": "8c91132d-ff07-4ff3-a230-3fe8824f7eb0",
        "name": "Habituel lundi",
        "notes": null,
        "last_ordered_at": null,
        "created_by": "792c94dd-0d7f-4212-8305-5fc46c079523",
        "created_at": "2026-10-21T12:35:33.195Z",
        "updated_at": "2026-10-21T12:35:33.266Z",
        "deleted_at": null,
        "items_count": 1,
        "supplier": {
          "id": "8c91132d-ff07-4ff3-a230-3fe8824f7eb0",
          "name": "Société 4e6771",
          "city": "Dakar",
          "logo_document_id": null
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

#### `POST /api/v1/listes-achat`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `supplier_id` | string (uuid) | **oui** |  |
| `name` | string | **oui** | min 1 car. · max 100 car. |
| `notes` | string | non | `null` accepté · max 2000 car. |
| `from_order_id` | string (uuid) | non |  |
| `items` | tableau de object | non | max 300 élément(s) |
| `items[].product_id` | string (uuid) | non |  |
| `items[].reference` | string | non | min 1 car. · max 60 car. |
| `items[].quantity` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `items[].par_level` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |

Règles globales : au plus un parmi `from_order_id`, `items`.


<details><summary>Exemple réel de requête</summary>

```json
{
  "supplier_id": "6882af12-c1d6-45fd-83fe-cc2750ccd3dd",
  "name": "Commande de la semaine",
  "items": [
    {
      "product_id": "bf4d9791-669c-49bb-9da3-18c0019878a7",
      "quantity": 5
    },
    {
      "reference": "REF-b9fb44",
      "par_level": 20
    }
  ]
}
```

</details>

**Réponse 201 :** `data` contient `purchase_list`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Liste d'achat créée",
  "data": {
    "purchase_list": {
      "id": "01f100ec-d51d-4311-ac6c-82a55811095d",
      "company_id": "dd91d09e-c13e-4d0f-bc7c-c264e16ff666",
      "supplier_company_id": "6882af12-c1d6-45fd-83fe-cc2750ccd3dd",
      "name": "Commande de la semaine",
      "notes": null,
      "last_ordered_at": null,
      "created_by": "62fc7afd-4297-4d3e-9cbc-fd4071923f18",
      "created_at": "2026-10-21T12:35:33.897Z",
      "updated_at": "2026-10-21T12:35:33.897Z",
      "deleted_at": null,
      "supplier": {
        "id": "6882af12-c1d6-45fd-83fe-cc2750ccd3dd",
        "name": "Société c049e0",
        "city": "Dakar",
        "logo_document_id": null
      },
      "items": [
        {
          "product_id": "bf4d9791-669c-49bb-9da3-18c0019878a7",
          "quantity": 5,
          "par_level": null,
          "sort_order": 0,
          "product": {
            "id": "bf4d9791-669c-49bb-9da3-18c0019878a7",
            "reference": "REF-6754c5",
            "name": "Riz brisé 263b",
            "unit": "sac",
            "availability": "disponible",
            "min_order_quantity": 1,
            "order_multiple": null,
            "orderable": true,
            "price": 15000
          }
        },
        {
          "product_id": "a047ce76-6168-45c6-9ff7-f06f5b08c534",
          "quantity": null,
          "par_level": 20,
          "sort_order": 1,
          "product": {
            "id": "a047ce76-6168-45c6-9ff7-f06f5b08c534",
            "reference": "REF-b9fb44",
            "name": "Riz brisé fb2e",
            "unit": "carton",
            "availability": "disponible",
            "min_order_quantity": 6,
            "order_multiple": 6,
            "orderable": true,
            "price": 9000
          }
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 403 `PARTENARIAT_INACTIF` · 409 `LISTE_ACHAT_EXISTANTE`.

---

#### `GET /api/v1/listes-achat/:id`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `purchase_list`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "purchase_list": {
      "id": "01f100ec-d51d-4311-ac6c-82a55811095d",
      "company_id": "dd91d09e-c13e-4d0f-bc7c-c264e16ff666",
      "supplier_company_id": "6882af12-c1d6-45fd-83fe-cc2750ccd3dd",
      "name": "Commande de la semaine",
      "notes": null,
      "last_ordered_at": "2026-10-21T12:35:34.051Z",
      "created_by": "62fc7afd-4297-4d3e-9cbc-fd4071923f18",
      "created_at": "2026-10-21T12:35:33.897Z",
      "updated_at": "2026-10-21T12:35:34.052Z",
      "deleted_at": null,
      "supplier": {
        "id": "6882af12-c1d6-45fd-83fe-cc2750ccd3dd",
        "name": "Société c049e0",
        "city": "Dakar",
        "logo_document_id": null
      },
      "items": [
        {
          "product_id": "bf4d9791-669c-49bb-9da3-18c0019878a7",
          "quantity": 5,
          "par_level": null,
          "sort_order": 0,
          "product": {
            "id": "bf4d9791-669c-49bb-9da3-18c0019878a7",
            "reference": "REF-6754c5",
            "name": "Riz brisé 263b",
            "unit": "sac",
            "availability": "disponible",
            "min_order_quantity": 1,
            "order_multiple": null,
            "orderable": true,
            "price": 15000
          }
        },
        {
          "product_id": "a047ce76-6168-45c6-9ff7-f06f5b08c534",
          "quantity": null,
          "par_level": 20,
          "sort_order": 1,
          "product": {
            "id": "a047ce76-6168-45c6-9ff7-f06f5b08c534",
            "reference": "REF-b9fb44",
            "name": "Riz brisé fb2e",
            "unit": "carton",
            "availability": "disponible",
            "min_order_quantity": 6,
            "order_multiple": 6,
            "orderable": true,
            "price": 9000
          }
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 404 `RESSOURCE_INTROUVABLE` · 422 `DONNEES_INVALIDES`.

---

#### `PATCH /api/v1/listes-achat/:id`

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
| `name` | string | non | min 1 car. · max 100 car. |
| `notes` | string | non | `null` accepté · max 2000 car. |
| `items` | tableau de object | non | max 300 élément(s) |
| `items[].product_id` | string (uuid) | non |  |
| `items[].reference` | string | non | min 1 car. · max 60 car. |
| `items[].quantity` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `items[].par_level` | number | non | `null` accepté · ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "name": "Habituel lundi",
  "items": [
    {
      "product_id": "faa55f66-9154-4fbd-81aa-9c6c2d2005f9",
      "quantity": 3
    }
  ]
}
```

</details>

**Réponse 200 :** `data` contient `purchase_list`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Liste d'achat modifiée",
  "data": {
    "purchase_list": {
      "id": "a2a34c8f-7d3a-4638-ab29-d31b1c17b66b",
      "company_id": "aa041f3c-c6bc-4dd4-8d42-344cd8a1a857",
      "supplier_company_id": "8c91132d-ff07-4ff3-a230-3fe8824f7eb0",
      "name": "Habituel lundi",
      "notes": null,
      "last_ordered_at": null,
      "created_by": "792c94dd-0d7f-4212-8305-5fc46c079523",
      "created_at": "2026-10-21T12:35:33.195Z",
      "updated_at": "2026-10-21T12:35:33.266Z",
      "deleted_at": null,
      "supplier": {
        "id": "8c91132d-ff07-4ff3-a230-3fe8824f7eb0",
        "name": "Société 4e6771",
        "city": "Dakar",
        "logo_document_id": null
      },
      "items": [
        {
          "product_id": "faa55f66-9154-4fbd-81aa-9c6c2d2005f9",
          "quantity": 3,
          "par_level": null,
          "sort_order": 0,
          "product": {
            "id": "faa55f66-9154-4fbd-81aa-9c6c2d2005f9",
            "reference": "REF-07a0d1",
            "name": "Riz brisé 73e3",
            "unit": "kg",
            "availability": "disponible",
            "min_order_quantity": 1,
            "order_multiple": null,
            "orderable": true,
            "price": 2500
          }
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES` · 422 `LIGNES_INVALIDES`.

---

#### `DELETE /api/v1/listes-achat/:id`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
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
  "message": "Liste d'achat supprimée",
  "data": null
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/listes-achat/:id/commander`

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
| `stocks` | tableau de object | non | max 300 élément(s) · sans doublon |
| `stocks[].product_id` | string (uuid) | **oui** |  |
| `stocks[].on_hand` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max |
| `lines` | tableau de object | non | max 300 élément(s) · sans doublon |
| `lines[].product_id` | string (uuid) | **oui** |  |
| `lines[].quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max |
| `buyer_reference` | string | non | `null` accepté · max 60 car. |
| `delivery_address` | string | non | `null` accepté · max 1000 car. |
| `requested_delivery_date` | string | non | `null` accepté · date `AAAA-MM-JJ` |
| `conditions` | string | non | `null` accepté · max 2000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "stocks": [
    {
      "product_id": "a047ce76-6168-45c6-9ff7-f06f5b08c534",
      "on_hand": 7
    }
  ],
  "lines": [
    {
      "product_id": "bf4d9791-669c-49bb-9da3-18c0019878a7",
      "quantity": 8
    }
  ],
  "delivery_address": "Entrepôt Rufisque"
}
```

</details>

**Réponse 201 :** `data` contient `order`, `skipped_lines`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Bon de commande créé (1 produit(s) écarté(s))",
  "data": {
    "order": {
      "id": "02487f28-ec57-4e96-9184-feba8709b4b4",
      "number": "BC-2026-00001",
      "buyer_company_id": "dd91d09e-c13e-4d0f-bc7c-c264e16ff666",
      "supplier_company_id": "6882af12-c1d6-45fd-83fe-cc2750ccd3dd",
      "partnership_id": "bd7e64ef-47a0-494c-98ed-9526c8b9a0d2",
      "status": "brouillon",
      "revision": 2,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": "Entrepôt Rufisque",
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 282000,
      "tax_total": 21600,
      "total": 303600,
      "lines_count": 2,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "62fc7afd-4297-4d3e-9cbc-fd4071923f18",
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
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": "01f100ec-d51d-4311-ac6c-82a55811095d",
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:34.002Z",
      "updated_at": "2026-10-21T12:35:34.027Z",
      "buyer": {
        "id": "dd91d09e-c13e-4d0f-bc7c-c264e16ff666",
        "name": "Société d03bcd",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364214",
        "email": "admin.097d4b3241@test.sn",
        "ninea": "235912630",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "6882af12-c1d6-45fd-83fe-cc2750ccd3dd",
        "name": "Société c049e0",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364215",
        "email": "admin.856d6dd245@test.sn",
        "ninea": "661481251",
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
        "id": "792bb12f-0de0-4900-af90-a4b17f59b177",
        "order_id": "02487f28-ec57-4e96-9184-feba8709b4b4",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "62fc7afd-4297-4d3e-9cbc-fd4071923f18",
        "status": "brouillon",
        "comment": null,
        "subtotal": 282000,
        "tax_total": 21600,
        "total": 303600,
        "lines_count": 2,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:35:34.008Z",
        "lines": [
          {
            "id": "c3686b07-a470-4eb8-a8ba-8aaefe0da08f",
            "order_id": "02487f28-ec57-4e96-9184-feba8709b4b4",
            "version_id": "792bb12f-0de0-4900-af90-a4b17f59b177",
            "line_no": 1,
            "product_id": "bf4d9791-669c-49bb-9da3-18c0019878a7",
            "reference": "REF-6754c5",
            "name": "Riz brisé 263b",
            "unit": "sac",
            "quantity": 8,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 120000,
            "line_tax": 21600,
            "line_total": 141600,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:34.011Z"
          },
          {
            "id": "bc1144a9-e77b-48a2-9463-2bf35da27cda",
            "order_id": "02487f28-ec57-4e96-9184-feba8709b4b4",
            "version_id": "792bb12f-0de0-4900-af90-a4b17f59b177",
            "line_no": 2,
            "product_id": "a047ce76-6168-45c6-9ff7-f06f5b08c534",
            "reference": "REF-b9fb44",
            "name": "Riz brisé fb2e",
            "unit": "carton",
            "quantity": 18,
            "unit_price": 9000,
            "tax_rate": 0,
            "line_subtotal": 162000,
            "line_tax": 0,
            "line_total": 162000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": "Arrondi de 13 à 18 (minimum / multiple du fournisseur)",
            "received_quantity": null,
            "base_unit_price": 9000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:34.011Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": []
    },
    "skipped_lines": [
      {
        "product_id": "7b7aaf63-ff8c-4de1-a9d6-a84565b00f11",
        "name": "Riz brisé b016",
        "reason": "produit indisponible"
      }
    ]
  }
}
```

</details>

**Erreurs observées :** 409 `RIEN_A_COMMANDER` · 422 `DONNEES_INVALIDES`.

---

## 16. Achats — bons de commande (acheteur)

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/achats` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/import` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/approbations` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/:id` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| PATCH | `/api/v1/achats/:id` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/:id/versions` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/:id/historique` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/:id/bon-de-commande.pdf` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/envoyer` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/approuver` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/rejeter-approbation` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/recommander` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/accepter-proposition` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/refuser-proposition` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/demander-modification` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/annuler` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/confirmer-reception` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/:id/livraisons` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/livraisons/:livraisonId/reception` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/achats/:id/livraisons/:livraisonId/bon-de-livraison.pdf` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/achats/:id/solder-reliquat` | membre d’une entreprise active — entreprise acheteuse ou mixte |
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
| `status` | string | non | max 300 car. · format `/^(brouillon\|envoyee\|en_attente_validation\|proposition_modifiee\|validee\|en_preparation\|prete\|livree_partiellement\|livree\|reception_confirmee\|facturee\|terminee\|refusee\|annulee)(,(brouillon\|envoyee\|en_attente_validation\|proposition_modifiee\|validee\|en_preparation\|prete\|livree_partiellement\|livree\|reception_confirmee\|facturee\|terminee\|refusee\|annulee))*$/` |
| `q` | string | non | max 100 car. |
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `a_traiter` | boolean | non |  |
| `modifie_depuis` | date | non |  |
| `supplier_id` | string (uuid) | non |  |
| `approbation` | string | non | valeurs : `non_requise`, `en_attente`, `approuvee`, `rejetee` |
| `tri` | string | non | valeurs : `created_at`, `-created_at`, `sent_at`, `-sent_at`, `total`, `-total`, `number`, `-number`, `updated_at`, `-updated_at` |


Exemple de query string réelle : `?status=envoyee,validee&tri=-created_at`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `number`, `buyer_company_id`, `supplier_company_id`, `partnership_id`, `status`, `revision`, `current_version_no`, `validated_version_no`, `buyer_reference`, `delivery_address`, `requested_delivery_date`, `conditions`, `currency`, `subtotal`, `tax_total`, `total`, `lines_count`, `delivery_note`, `reception_note`, `reception_with_reserves`, `cancellation_reason`, `refusal_reason`, `cancelled_by_side`, `template_id`, `created_by`, `sent_at`, `acknowledged_at`, `validated_at`, `preparation_at`, `ready_at`, `delivered_at`, `received_at`, `invoiced_at`, `completed_at`, `refused_at`, `cancelled_at`, `approval_status`, `approvals_required`, `approval_round`, `approval_requested_at`, `approval_requested_by`, `approved_at`, `source_order_id`, `purchase_list_id`, `deliveries_count`, `backorder_closed_at`, `backorder_closed_by_side`, `backorder_close_reason`, `created_at`, `updated_at`, `buyer`, `supplier`, `side`, `actions`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "22f4438c-46a7-40af-a5d8-47c22eb47a68",
        "number": "BC-2026-00002",
        "buyer_company_id": "aae2fc2b-16f1-41dd-98c0-671f020b1053",
        "supplier_company_id": "9880b336-fc6a-4593-8122-36b709efb162",
        "partnership_id": "94531513-22ec-41cc-bcca-2caea966c0a4",
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
        "created_by": "3362f87f-6edb-45d1-8e0f-1855fb92c787",
        "sent_at": "2026-10-21T12:34:47.545Z",
        "acknowledged_at": null,
        "validated_at": "2026-10-21T12:34:47.613Z",
        "preparation_at": null,
        "ready_at": null,
        "delivered_at": null,
        "received_at": null,
        "invoiced_at": null,
        "completed_at": null,
        "refused_at": null,
        "cancelled_at": null,
        "approval_status": "non_requise",
        "approvals_required": 0,
        "approval_round": 0,
        "approval_requested_at": null,
        "approval_requested_by": null,
        "approved_at": null,
        "source_order_id": null,
        "purchase_list_id": null,
        "deliveries_count": 0,
        "backorder_closed_at": null,
        "backorder_closed_by_side": null,
        "backorder_close_reason": null,
        "created_at": "2026-10-21T12:34:47.479Z",
        "updated_at": "2026-10-21T12:34:47.627Z",
        "buyer": {
          "id": "aae2fc2b-16f1-41dd-98c0-671f020b1053",
          "name": "Société 2a4bf9",
          "city": "Dakar",
          "logo_document_id": null
        },
        "supplier": {
          "id": "9880b336-fc6a-4593-8122-36b709efb162",
          "name": "Société cada41",
          "city": "Dakar",
          "logo_document_id": null
        },
        "side": "acheteur",
        "actions": [
          "annuler",
          "recommander"
        ]
      },
      {
        "id": "098212cd-28c9-437d-874f-679286412df3",
        "number": "BC-2026-00001",
        "buyer_company_id": "aae2fc2b-16f1-41dd-98c0-671f020b1053",
        "supplier_company_id": "9880b336-fc6a-4593-8122-36b709efb162",
        "partnership_id": "94531513-22ec-41cc-bcca-2caea966c0a4",
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
        "created_by": "3362f87f-6edb-45d1-8e0f-1855fb92c787",
        "sent_at": "2026-10-21T12:34:47.401Z",
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
        "approval_status": "non_requise",
        "approvals_required": 0,
        "approval_round": 0,
        "approval_requested_at": null,
        "approval_requested_by": null,
        "approved_at": null,
        "source_order_id": null,
        "purchase_list_id": null,
        "deliveries_count": 0,
        "backorder_closed_at": null,
        "backorder_closed_by_side": null,
        "backorder_close_reason": null,
        "created_at": "2026-10-21T12:34:47.304Z",
        "updated_at": "2026-10-21T12:34:47.420Z",
        "buyer": {
          "id": "aae2fc2b-16f1-41dd-98c0-671f020b1053",
          "name": "Société 2a4bf9",
          "city": "Dakar",
          "logo_document_id": null
        },
        "supplier": {
          "id": "9880b336-fc6a-4593-8122-36b709efb162",
          "name": "Société cada41",
          "city": "Dakar",
          "logo_document_id": null
        },
        "side": "acheteur",
        "actions": [
          "annuler",
          "recommander"
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
| `lines[].product_id` | string (uuid) | non |  |
| `lines[].reference` | string | non | min 1 car. · max 60 car. |
| `lines[].quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `lines[].comment` | string | non | `null` accepté · max 500 car. |
| `buyer_reference` | string | non | `null` accepté · max 60 car. |
| `delivery_address` | string | non | `null` accepté · max 1000 car. |
| `requested_delivery_date` | string | non | `null` accepté · date `AAAA-MM-JJ` |
| `conditions` | string | non | `null` accepté · max 2000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "supplier_id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
  "lines": [
    {
      "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
      "quantity": 3
    },
    {
      "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
      "id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
      "number": "BC-2026-00001",
      "buyer_company_id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
      "supplier_company_id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
      "partnership_id": "145d9d88-5dee-488e-8d17-41db80997dd8",
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
      "created_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
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
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:01.524Z",
      "updated_at": "2026-10-21T12:35:01.574Z",
      "buyer": {
        "id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364180",
        "email": "admin.48e97d9cc6@test.sn",
        "ninea": "892499584",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778364181",
        "email": "grossiste.59bfd6cdd7@test.sn",
        "ninea": "261517215",
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
        "id": "5ca9fa19-ecca-408b-8c73-8b7e80a9e549",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
        "status": "brouillon",
        "comment": null,
        "subtotal": 103500,
        "tax_total": 12960,
        "total": 116460,
        "lines_count": 3,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:35:01.533Z",
        "lines": [
          {
            "id": "5a20a847-36c3-4b5f-83ac-fae32d053533",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "5ca9fa19-ecca-408b-8c73-8b7e80a9e549",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.547Z"
          },
          {
            "id": "6e48715c-7d50-4647-a798-c98f9265afc8",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "5ca9fa19-ecca-408b-8c73-8b7e80a9e549",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.547Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": []
    }
  }
}
```

</details>

**Erreurs observées :** 403 `PARTENARIAT_INACTIF` · 403 `PERMISSION_REFUSEE` · 422 `DONNEES_INVALIDES` · 422 `LIGNES_INVALIDES` · 422 `PRODUIT_INVALIDE` · 422 `REFERENCE_INCONNUE`.

---

#### `POST /api/v1/achats/import`

Saisie accélérée : bon de commande importé d'un CSV « référence ; quantité ».

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative
- **Fichier :** champ `fichier` (**obligatoire**) — un fichier CSV (séparateur ; ou ,) exporté d’Excel ou de LibreOffice

**Champs du formulaire (multipart)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `supplier_id` | string (uuid) | **oui** |  |
| `buyer_reference` | string | non | `null` accepté · max 60 car. |
| `delivery_address` | string | non | `null` accepté · max 1000 car. |
| `requested_delivery_date` | string | non | `null` accepté · date `AAAA-MM-JJ` |
| `conditions` | string | non | `null` accepté · max 2000 car. |


**Réponse 201 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Bon de commande importé",
  "data": {
    "order": {
      "id": "4308aae9-e103-486d-b868-28f9bf2212c8",
      "number": "BC-2026-00001",
      "buyer_company_id": "cb49f0ad-7b34-427d-a2ec-34516fda618d",
      "supplier_company_id": "fa22c421-99fa-40c2-88a1-acd1ec9f6806",
      "partnership_id": "2c76083d-a0f2-4584-b094-ce26717f6afb",
      "status": "brouillon",
      "revision": 2,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": "IMP-1",
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 51250,
      "tax_total": 8100,
      "total": 59350,
      "lines_count": 2,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "0439053a-c9f6-4326-9100-3702a9ad6194",
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
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:35.963Z",
      "updated_at": "2026-10-21T12:35:36.021Z",
      "buyer": {
        "id": "cb49f0ad-7b34-427d-a2ec-34516fda618d",
        "name": "Société f3e7e9",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364219",
        "email": "admin.858f58a741@test.sn",
        "ninea": "746417580",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "fa22c421-99fa-40c2-88a1-acd1ec9f6806",
        "name": "Société fa92b4",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364220",
        "email": "admin.7fcbff7bcd@test.sn",
        "ninea": "368984830",
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
        "id": "4375010f-acf0-48cd-8453-6c7b512e2de3",
        "order_id": "4308aae9-e103-486d-b868-28f9bf2212c8",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "0439053a-c9f6-4326-9100-3702a9ad6194",
        "status": "brouillon",
        "comment": null,
        "subtotal": 51250,
        "tax_total": 8100,
        "total": 59350,
        "lines_count": 2,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:35:35.976Z",
        "lines": [
          {
            "id": "d331d4e7-8fb1-4870-970a-4f66192acb8d",
            "order_id": "4308aae9-e103-486d-b868-28f9bf2212c8",
            "version_id": "4375010f-acf0-48cd-8453-6c7b512e2de3",
            "line_no": 1,
            "product_id": "55c6b7ce-d608-4ea5-a196-b97abc015390",
            "reference": "REF-65d22d",
            "name": "Riz brisé 5f91",
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
            "comment": "Urgent",
            "received_quantity": null,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:35.984Z"
          },
          {
            "id": "35e5a52d-a4c7-4537-9be1-1ed6da0cc673",
            "order_id": "4308aae9-e103-486d-b868-28f9bf2212c8",
            "version_id": "4375010f-acf0-48cd-8453-6c7b512e2de3",
            "line_no": 2,
            "product_id": "242c7c68-1d8e-4093-9bef-974bb3b1edb0",
            "reference": "REF-f32b8e",
            "name": "Riz brisé aa2b",
            "unit": "kg",
            "quantity": 2.5,
            "unit_price": 2500,
            "tax_rate": 0,
            "line_subtotal": 6250,
            "line_tax": 0,
            "line_total": 6250,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:35.984Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": []
    }
  }
}
```

</details>

**Erreurs observées :** 400 `FORMAT_FICHIER_REFUSE` · 422 `DONNEES_INVALIDES` · 422 `IMPORT_INVALIDE` · 422 `REFERENCE_INCONNUE`.

---

#### `GET /api/v1/achats/approbations`

Circuit d'approbation interne : bons attendant MA décision.

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.approuver`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |


**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `number`, `buyer_company_id`, `supplier_company_id`, `partnership_id`, `status`, `revision`, `current_version_no`, `validated_version_no`, `buyer_reference`, `delivery_address`, `requested_delivery_date`, `conditions`, `currency`, `subtotal`, `tax_total`, `total`, `lines_count`, `delivery_note`, `reception_note`, `reception_with_reserves`, `cancellation_reason`, `refusal_reason`, `cancelled_by_side`, `template_id`, `created_by`, `sent_at`, `acknowledged_at`, `validated_at`, `preparation_at`, `ready_at`, `delivered_at`, `received_at`, `invoiced_at`, `completed_at`, `refused_at`, `cancelled_at`, `approval_status`, `approvals_required`, `approval_round`, `approval_requested_at`, `approval_requested_by`, `approved_at`, `source_order_id`, `purchase_list_id`, `deliveries_count`, `backorder_closed_at`, `backorder_closed_by_side`, `backorder_close_reason`, `created_at`, `updated_at`, `buyer`, `supplier`, `side`, `actions`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "be9eb6ef-2ec5-41a5-8e68-b8849cdfa57a",
        "number": "BC-2026-00001",
        "buyer_company_id": "00e7eb3f-a14c-4cac-a1c9-b800dfd47994",
        "supplier_company_id": "6fc8405c-da04-46ff-bdbf-74d356b33d70",
        "partnership_id": "f879a40a-b517-4305-9af5-23db32c8fcb0",
        "status": "brouillon",
        "revision": 3,
        "current_version_no": 1,
        "validated_version_no": null,
        "buyer_reference": null,
        "delivery_address": null,
        "requested_delivery_date": null,
        "conditions": null,
        "currency": "XOF",
        "subtotal": 150000,
        "tax_total": 27000,
        "total": 177000,
        "lines_count": 1,
        "delivery_note": null,
        "reception_note": null,
        "reception_with_reserves": false,
        "cancellation_reason": null,
        "refusal_reason": null,
        "cancelled_by_side": null,
        "template_id": null,
        "created_by": "205fd84d-fa40-432d-b9dc-304746c5fe8f",
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
        "approval_status": "en_attente",
        "approvals_required": 1,
        "approval_round": 1,
        "approval_requested_at": "2026-10-21T12:35:31.274Z",
        "approval_requested_by": "205fd84d-fa40-432d-b9dc-304746c5fe8f",
        "approved_at": null,
        "source_order_id": null,
        "purchase_list_id": null,
        "deliveries_count": 0,
        "backorder_closed_at": null,
        "backorder_closed_by_side": null,
        "backorder_close_reason": null,
        "created_at": "2026-10-21T12:35:31.160Z",
        "updated_at": "2026-10-21T12:35:31.288Z",
        "buyer": {
          "id": "00e7eb3f-a14c-4cac-a1c9-b800dfd47994",
          "name": "Société 98d654",
          "city": "Dakar",
          "logo_document_id": null
        },
        "supplier": {
          "id": "6fc8405c-da04-46ff-bdbf-74d356b33d70",
          "name": "Société 40f3e6",
          "city": "Dakar",
          "logo_document_id": null
        },
        "side": "acheteur",
        "actions": [
          "modifier",
          "annuler"
        ]
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

**Erreurs observées :** 403 `PERMISSION_REFUSEE`.

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
      "id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
      "number": "BC-2026-00001",
      "buyer_company_id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
      "supplier_company_id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
      "partnership_id": "145d9d88-5dee-488e-8d17-41db80997dd8",
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
      "created_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
      "sent_at": "2026-10-21T12:35:01.657Z",
      "acknowledged_at": "2026-10-21T12:35:01.785Z",
      "validated_at": "2026-10-21T12:35:01.973Z",
      "preparation_at": "2026-10-21T12:35:02.036Z",
      "ready_at": "2026-10-21T12:35:02.097Z",
      "delivered_at": "2026-10-21T12:35:02.232Z",
      "received_at": "2026-10-21T12:35:02.322Z",
      "invoiced_at": "2026-10-21T12:35:02.424Z",
      "completed_at": "2026-10-21T12:35:02.808Z",
      "refused_at": null,
      "cancelled_at": null,
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 1,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:01.524Z",
      "updated_at": "2026-10-21T12:35:02.820Z",
      "buyer": {
        "id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364180",
        "email": "admin.48e97d9cc6@test.sn",
        "ninea": "892499584",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778364181",
        "email": "grossiste.59bfd6cdd7@test.sn",
        "ninea": "261517215",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": {
        "id": "56d630d5-a6ee-4aa4-8876-5baf035a19df",
        "number": "FAC-2026-00001",
        "status": "payee",
        "total": 102960,
        "amount_paid": 102960,
        "due_date": "2026-11-20"
      },
      "side": "acheteur",
      "actions": [
        "ouvrir_litige",
        "recommander"
      ],
      "current_version": {
        "id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T12:35:01.971Z",
        "decided_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
        "created_at": "2026-10-21T12:35:01.884Z",
        "lines": [
          {
            "id": "b485d96a-578c-47c7-bf9c-bd8b4781cefe",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 3,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          },
          {
            "id": "84219df5-23c1-4b0b-ab15-a36775167495",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 40,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          }
        ]
      },
      "validated_version": {
        "id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T12:35:01.971Z",
        "decided_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
        "created_at": "2026-10-21T12:35:01.884Z",
        "lines": [
          {
            "id": "b485d96a-578c-47c7-bf9c-bd8b4781cefe",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 3,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          },
          {
            "id": "84219df5-23c1-4b0b-ab15-a36775167495",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 40,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          }
        ]
      },
      "deliveries": [
        {
          "id": "fc7175c4-b612-460c-8b8f-ca6cab212cda",
          "number": "BL-2026-00001",
          "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
          "supplier_company_id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
          "buyer_company_id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
          "delivery_no": 1,
          "status": "receptionnee",
          "note": "Livré à 9 h",
          "carrier": null,
          "shipped_at": "2026-10-21T12:35:02.184Z",
          "document_id": "9c49110b-36be-4fa3-adf4-a0e5ecfc30e5",
          "received_at": "2026-10-21T12:35:02.312Z",
          "received_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
          "reception_note": "Conforme",
          "with_reserves": false,
          "created_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
          "created_at": "2026-10-21T12:35:02.184Z",
          "updated_at": "2026-10-21T12:35:02.313Z",
          "lines": [
            {
              "id": "094a020a-ae31-4c8d-8f0f-9fc1c29b8906",
              "delivery_id": "fc7175c4-b612-460c-8b8f-ca6cab212cda",
              "line_no": 1,
              "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
              "reference": "HUILE-20L",
              "name": "Huile 20 L",
              "unit": "piece",
              "quantity": 3,
              "received_quantity": 3
            },
            {
              "id": "bdf84309-d453-474b-8c42-998fe8f29e47",
              "delivery_id": "fc7175c4-b612-460c-8b8f-ca6cab212cda",
              "line_no": 2,
              "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
              "reference": "OIGNON",
              "name": "Oignons",
              "unit": "kg",
              "quantity": 40,
              "received_quantity": 40
            }
          ]
        }
      ]
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
| `lines[].product_id` | string (uuid) | non |  |
| `lines[].reference` | string | non | min 1 car. · max 60 car. |
| `lines[].quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `lines[].comment` | string | non | `null` accepté · max 500 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "lines": [
    {
      "product_id": "202f7ee3-067a-4eed-b064-f62877731a0c",
      "quantity": 4
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
  "message": "Bon de commande modifié",
  "data": {
    "order": {
      "id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
      "number": "BC-2026-00001",
      "buyer_company_id": "b8d5dbd7-cc76-4a2f-85ff-8640447f8878",
      "supplier_company_id": "e113d4e9-6f36-4295-89ff-719e4639cec7",
      "partnership_id": "280b095c-6aa6-4039-9dec-b2ed1e029bfd",
      "status": "brouillon",
      "revision": 6,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 60000,
      "tax_total": 10800,
      "total": 70800,
      "lines_count": 1,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "84eb1836-ce6f-47d2-887e-3d3019d346f5",
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
      "approval_status": "non_requise",
      "approvals_required": 2,
      "approval_round": 1,
      "approval_requested_at": "2026-10-21T12:35:33.441Z",
      "approval_requested_by": "84eb1836-ce6f-47d2-887e-3d3019d346f5",
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:33.309Z",
      "updated_at": "2026-10-21T12:35:33.667Z",
      "buyer": {
        "id": "b8d5dbd7-cc76-4a2f-85ff-8640447f8878",
        "name": "Société 11578b",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563296",
        "email": "admin.add9e120af@test.sn",
        "ninea": "493941047",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "e113d4e9-6f36-4295-89ff-719e4639cec7",
        "name": "Société 31367f",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563297",
        "email": "admin.316078b6aa@test.sn",
        "ninea": "612475019",
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
        "id": "da5ac715-0924-4fdc-a6cb-e6643fdf043e",
        "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "84eb1836-ce6f-47d2-887e-3d3019d346f5",
        "status": "brouillon",
        "comment": null,
        "subtotal": 60000,
        "tax_total": 10800,
        "total": 70800,
        "lines_count": 1,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:35:33.313Z",
        "lines": [
          {
            "id": "aa8c955c-6b80-4645-ab60-2b3e98598ad8",
            "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
            "version_id": "da5ac715-0924-4fdc-a6cb-e6643fdf043e",
            "line_no": 1,
            "product_id": "202f7ee3-067a-4eed-b064-f62877731a0c",
            "reference": "REF-4d29df",
            "name": "Riz brisé ad66",
            "unit": "sac",
            "quantity": 4,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 60000,
            "line_tax": 10800,
            "line_total": 70800,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:33.651Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": [],
      "approvals": [
        {
          "id": "9c66f944-7d29-4766-ada3-7aa6e1103ba9",
          "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
          "round": 1,
          "user_id": "9fdddd87-533f-407f-a31b-a6aee2477569",
          "decision": "approuvee",
          "comment": null,
          "order_total": 177000,
          "created_at": "2026-10-21T12:35:33.500Z",
          "user": {
            "id": "9fdddd87-533f-407f-a31b-a6aee2477569",
            "first_name": "Awa",
            "last_name": "Diop"
          }
        },
        {
          "id": "26324f97-707c-4c17-8a66-e06b4d38716a",
          "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
          "round": 1,
          "user_id": "b06ec123-0686-4066-8b22-05b19d2428f7",
          "decision": "rejetee",
          "comment": "Trop de sacs ce mois-ci",
          "order_total": 177000,
          "created_at": "2026-10-21T12:35:33.579Z",
          "user": {
            "id": "b06ec123-0686-4066-8b22-05b19d2428f7",
            "first_name": "Moussa",
            "last_name": "Sow"
          }
        }
      ]
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
        "id": "9bb635b8-685d-4d76-98b5-8c365929f0fc",
        "order_id": "8f356289-55dd-46d7-b0a6-4f8bc27b59e8",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "59fb7a47-6e7a-4187-89c5-275bbfc800a7",
        "status": "remplacee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:34:48.853Z",
        "decided_by": "d09e2616-70d0-4525-b5bc-427761db7c3c",
        "created_at": "2026-10-21T12:34:48.686Z",
        "lines": [
          {
            "id": "35fac763-6e5e-49c8-ac29-e6918608d797",
            "order_id": "8f356289-55dd-46d7-b0a6-4f8bc27b59e8",
            "version_id": "9bb635b8-685d-4d76-98b5-8c365929f0fc",
            "line_no": 1,
            "product_id": "4485ce12-6fbe-49a5-bff5-70c3329ce66c",
            "reference": "REF-93cca7",
            "name": "Riz brisé 8f63",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:48.689Z"
          },
          {
            "id": "1b2303df-9eac-44c9-b1a9-b1f3fd770787",
            "order_id": "8f356289-55dd-46d7-b0a6-4f8bc27b59e8",
            "version_id": "9bb635b8-685d-4d76-98b5-8c365929f0fc",
            "line_no": 2,
            "product_id": "80c51188-a14e-4490-9ea6-3b7573dc540c",
            "reference": "REF-77f262",
            "name": "Riz brisé f199",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:48.689Z"
          }
        ]
      },
      {
        "id": "c0928747-e29b-4fc8-8013-f72acec8a46c",
        "order_id": "8f356289-55dd-46d7-b0a6-4f8bc27b59e8",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "d09e2616-70d0-4525-b5bc-427761db7c3c",
        "status": "acceptee",
        "comment": "Stock partiel",
        "subtotal": 127200,
        "tax_total": 20880,
        "total": 148080,
        "lines_count": 3,
        "decided_at": "2026-10-21T12:34:48.955Z",
        "decided_by": "59fb7a47-6e7a-4187-89c5-275bbfc800a7",
        "created_at": "2026-10-21T12:34:48.856Z",
        "lines": [
          {
            "id": "b8bf5e8e-5639-4449-a541-2414b3ed2e67",
            "order_id": "8f356289-55dd-46d7-b0a6-4f8bc27b59e8",
            "version_id": "c0928747-e29b-4fc8-8013-f72acec8a46c",
            "line_no": 1,
            "product_id": "4485ce12-6fbe-49a5-bff5-70c3329ce66c",
            "reference": "REF-93cca7",
            "name": "Riz brisé 8f63",
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
            "base_unit_price": 14500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:48.860Z"
          },
          {
            "id": "b1510509-8f49-4e3f-9ef1-f24a79b9cf6a",
            "order_id": "8f356289-55dd-46d7-b0a6-4f8bc27b59e8",
            "version_id": "c0928747-e29b-4fc8-8013-f72acec8a46c",
            "line_no": 2,
            "product_id": "80c51188-a14e-4490-9ea6-3b7573dc540c",
            "reference": "REF-77f262",
            "name": "Riz brisé f199",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:48.860Z"
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
        "id": 183,
        "order_id": "be9eb6ef-2ec5-41a5-8e68-b8849cdfa57a",
        "type": "creation",
        "from_status": null,
        "to_status": "brouillon",
        "version_no": 1,
        "actor_user_id": "205fd84d-fa40-432d-b9dc-304746c5fe8f",
        "actor_company_id": "00e7eb3f-a14c-4cac-a1c9-b800dfd47994",
        "actor_side": "acheteur",
        "message": null,
        "details": null,
        "created_at": "2026-10-21T12:35:31.195Z",
        "actor": {
          "id": "205fd84d-fa40-432d-b9dc-304746c5fe8f",
          "first_name": "Moussa",
          "last_name": "Sow"
        },
        "actorCompany": {
          "id": "00e7eb3f-a14c-4cac-a1c9-b800dfd47994",
          "name": "Société 98d654"
        }
      },
      {
        "id": 184,
        "order_id": "be9eb6ef-2ec5-41a5-8e68-b8849cdfa57a",
        "type": "soumission_approbation",
        "from_status": null,
        "to_status": null,
        "version_no": 1,
        "actor_user_id": "205fd84d-fa40-432d-b9dc-304746c5fe8f",
        "actor_company_id": "00e7eb3f-a14c-4cac-a1c9-b800dfd47994",
        "actor_side": "acheteur",
        "message": null,
        "details": {
          "tour": 1,
          "total": 177000,
          "requises": 1
        },
        "created_at": "2026-10-21T12:35:31.279Z",
        "actor": {
          "id": "205fd84d-fa40-432d-b9dc-304746c5fe8f",
          "first_name": "Moussa",
          "last_name": "Sow"
        },
        "actorCompany": {
          "id": "00e7eb3f-a14c-4cac-a1c9-b800dfd47994",
          "name": "Société 98d654"
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


**Réponse 200 :** `data` contient `order`, `submitted_for_approval`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Bon de commande envoyé au fournisseur",
  "data": {
    "order": {
      "id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
      "number": "BC-2026-00001",
      "buyer_company_id": "b8d5dbd7-cc76-4a2f-85ff-8640447f8878",
      "supplier_company_id": "e113d4e9-6f36-4295-89ff-719e4639cec7",
      "partnership_id": "280b095c-6aa6-4039-9dec-b2ed1e029bfd",
      "status": "envoyee",
      "revision": 7,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 60000,
      "tax_total": 10800,
      "total": 70800,
      "lines_count": 1,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "84eb1836-ce6f-47d2-887e-3d3019d346f5",
      "sent_at": "2026-10-21T12:35:33.725Z",
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
      "approval_status": "non_requise",
      "approvals_required": 2,
      "approval_round": 1,
      "approval_requested_at": "2026-10-21T12:35:33.441Z",
      "approval_requested_by": "84eb1836-ce6f-47d2-887e-3d3019d346f5",
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:33.309Z",
      "updated_at": "2026-10-21T12:35:33.742Z",
      "buyer": {
        "id": "b8d5dbd7-cc76-4a2f-85ff-8640447f8878",
        "name": "Société 11578b",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563296",
        "email": "admin.add9e120af@test.sn",
        "ninea": "493941047",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "e113d4e9-6f36-4295-89ff-719e4639cec7",
        "name": "Société 31367f",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563297",
        "email": "admin.316078b6aa@test.sn",
        "ninea": "612475019",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "annuler",
        "recommander"
      ],
      "current_version": {
        "id": "da5ac715-0924-4fdc-a6cb-e6643fdf043e",
        "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "84eb1836-ce6f-47d2-887e-3d3019d346f5",
        "status": "proposee",
        "comment": null,
        "subtotal": 60000,
        "tax_total": 10800,
        "total": 70800,
        "lines_count": 1,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:35:33.313Z",
        "lines": [
          {
            "id": "aa8c955c-6b80-4645-ab60-2b3e98598ad8",
            "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
            "version_id": "da5ac715-0924-4fdc-a6cb-e6643fdf043e",
            "line_no": 1,
            "product_id": "202f7ee3-067a-4eed-b064-f62877731a0c",
            "reference": "REF-4d29df",
            "name": "Riz brisé ad66",
            "unit": "sac",
            "quantity": 4,
            "unit_price": 15000,
            "tax_rate": 18,
            "line_subtotal": 60000,
            "line_tax": 10800,
            "line_total": 70800,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:33.651Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": [],
      "approvals": [
        {
          "id": "9c66f944-7d29-4766-ada3-7aa6e1103ba9",
          "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
          "round": 1,
          "user_id": "9fdddd87-533f-407f-a31b-a6aee2477569",
          "decision": "approuvee",
          "comment": null,
          "order_total": 177000,
          "created_at": "2026-10-21T12:35:33.500Z",
          "user": {
            "id": "9fdddd87-533f-407f-a31b-a6aee2477569",
            "first_name": "Awa",
            "last_name": "Diop"
          }
        },
        {
          "id": "26324f97-707c-4c17-8a66-e06b4d38716a",
          "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
          "round": 1,
          "user_id": "b06ec123-0686-4066-8b22-05b19d2428f7",
          "decision": "rejetee",
          "comment": "Trop de sacs ce mois-ci",
          "order_total": 177000,
          "created_at": "2026-10-21T12:35:33.579Z",
          "user": {
            "id": "b06ec123-0686-4066-8b22-05b19d2428f7",
            "first_name": "Moussa",
            "last_name": "Sow"
          }
        }
      ]
    },
    "submitted_for_approval": false
  }
}
```

</details>

**Erreurs observées :** 409 `APPROBATEURS_INSUFFISANTS` · 409 `APPROBATION_EN_COURS` · 409 `COMMANDE_MODIFIEE` · 409 `PLAFOND_CREDIT_DEPASSE` · 409 `RETARD_DE_PAIEMENT` · 422 `DONNEES_INVALIDES` · 422 `MINIMUM_COMMANDE`.

---

#### `POST /api/v1/achats/:id/approuver`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.approuver`
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
| `comment` | string | non | `null` accepté · max 2000 car. |
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "comment": "OK budget"
}
```

</details>

**Réponse 200 :** `data` contient `order`, `sent`, `send_error`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Bon de commande approuvé et envoyé au fournisseur",
  "data": {
    "order": {
      "id": "be9eb6ef-2ec5-41a5-8e68-b8849cdfa57a",
      "number": "BC-2026-00001",
      "buyer_company_id": "00e7eb3f-a14c-4cac-a1c9-b800dfd47994",
      "supplier_company_id": "6fc8405c-da04-46ff-bdbf-74d356b33d70",
      "partnership_id": "f879a40a-b517-4305-9af5-23db32c8fcb0",
      "status": "envoyee",
      "revision": 4,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 150000,
      "tax_total": 27000,
      "total": 177000,
      "lines_count": 1,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "205fd84d-fa40-432d-b9dc-304746c5fe8f",
      "sent_at": "2026-10-21T12:35:31.636Z",
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
      "approval_status": "approuvee",
      "approvals_required": 1,
      "approval_round": 1,
      "approval_requested_at": "2026-10-21T12:35:31.274Z",
      "approval_requested_by": "205fd84d-fa40-432d-b9dc-304746c5fe8f",
      "approved_at": "2026-10-21T12:35:31.588Z",
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:31.160Z",
      "updated_at": "2026-10-21T12:35:31.678Z",
      "buyer": {
        "id": "00e7eb3f-a14c-4cac-a1c9-b800dfd47994",
        "name": "Société 98d654",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563292",
        "email": "admin.bedfc477bc@test.sn",
        "ninea": "526258973",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "6fc8405c-da04-46ff-bdbf-74d356b33d70",
        "name": "Société 40f3e6",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563293",
        "email": "admin.6d8764bee2@test.sn",
        "ninea": "167062906",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "annuler",
        "recommander"
      ],
      "current_version": {
        "id": "2e83cb7f-8354-4253-bbd9-0c64dcc31f56",
        "order_id": "be9eb6ef-2ec5-41a5-8e68-b8849cdfa57a",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "205fd84d-fa40-432d-b9dc-304746c5fe8f",
        "status": "proposee",
        "comment": null,
        "subtotal": 150000,
        "tax_total": 27000,
        "total": 177000,
        "lines_count": 1,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:35:31.169Z",
        "lines": [
          {
            "id": "80e6f76f-7889-45c7-9d6e-2a707e19f73f",
            "order_id": "be9eb6ef-2ec5-41a5-8e68-b8849cdfa57a",
            "version_id": "2e83cb7f-8354-4253-bbd9-0c64dcc31f56",
            "line_no": 1,
            "product_id": "c6e831bd-25d9-42ff-9e05-3ea60e36a3ef",
            "reference": "REF-e79c05",
            "name": "Riz brisé 2f13",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:31.178Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": [],
      "approvals": [
        {
          "id": "5271481f-880a-4d33-af68-e21b3f1f1b8b",
          "order_id": "be9eb6ef-2ec5-41a5-8e68-b8849cdfa57a",
          "round": 1,
          "user_id": "43ec280e-29b9-418c-ae0d-0b25dec8f0d5",
          "decision": "approuvee",
          "comment": "OK budget",
          "order_total": 177000,
          "created_at": "2026-10-21T12:35:31.558Z",
          "user": {
            "id": "43ec280e-29b9-418c-ae0d-0b25dec8f0d5",
            "first_name": "Awa",
            "last_name": "Diop"
          }
        }
      ]
    },
    "sent": true,
    "send_error": null
  }
}
```

</details>

**Erreurs observées :** 403 `APPROBATION_PAR_AUTEUR` · 409 `AUCUNE_APPROBATION` · 409 `DECISION_DEJA_PRISE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/rejeter-approbation`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.approuver`
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
| `revision` | integer | non | ≥ 1 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "comment": "Trop de sacs ce mois-ci"
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Bon de commande rejeté : son auteur peut le corriger",
  "data": {
    "order": {
      "id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
      "number": "BC-2026-00001",
      "buyer_company_id": "b8d5dbd7-cc76-4a2f-85ff-8640447f8878",
      "supplier_company_id": "e113d4e9-6f36-4295-89ff-719e4639cec7",
      "partnership_id": "280b095c-6aa6-4039-9dec-b2ed1e029bfd",
      "status": "brouillon",
      "revision": 5,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 150000,
      "tax_total": 27000,
      "total": 177000,
      "lines_count": 1,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "84eb1836-ce6f-47d2-887e-3d3019d346f5",
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
      "approval_status": "rejetee",
      "approvals_required": 2,
      "approval_round": 1,
      "approval_requested_at": "2026-10-21T12:35:33.441Z",
      "approval_requested_by": "84eb1836-ce6f-47d2-887e-3d3019d346f5",
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:33.309Z",
      "updated_at": "2026-10-21T12:35:33.594Z",
      "buyer": {
        "id": "b8d5dbd7-cc76-4a2f-85ff-8640447f8878",
        "name": "Société 11578b",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563296",
        "email": "admin.add9e120af@test.sn",
        "ninea": "493941047",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "e113d4e9-6f36-4295-89ff-719e4639cec7",
        "name": "Société 31367f",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563297",
        "email": "admin.316078b6aa@test.sn",
        "ninea": "612475019",
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
        "id": "da5ac715-0924-4fdc-a6cb-e6643fdf043e",
        "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "84eb1836-ce6f-47d2-887e-3d3019d346f5",
        "status": "brouillon",
        "comment": null,
        "subtotal": 150000,
        "tax_total": 27000,
        "total": 177000,
        "lines_count": 1,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:35:33.313Z",
        "lines": [
          {
            "id": "f45fac3c-c96e-4cb2-88ec-29682d9573e9",
            "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
            "version_id": "da5ac715-0924-4fdc-a6cb-e6643fdf043e",
            "line_no": 1,
            "product_id": "202f7ee3-067a-4eed-b064-f62877731a0c",
            "reference": "REF-4d29df",
            "name": "Riz brisé ad66",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:33.315Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": [],
      "approvals": [
        {
          "id": "9c66f944-7d29-4766-ada3-7aa6e1103ba9",
          "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
          "round": 1,
          "user_id": "9fdddd87-533f-407f-a31b-a6aee2477569",
          "decision": "approuvee",
          "comment": null,
          "order_total": 177000,
          "created_at": "2026-10-21T12:35:33.500Z",
          "user": {
            "id": "9fdddd87-533f-407f-a31b-a6aee2477569",
            "first_name": "Awa",
            "last_name": "Diop"
          }
        },
        {
          "id": "26324f97-707c-4c17-8a66-e06b4d38716a",
          "order_id": "4a2dcad3-b6f1-42a7-8c8f-ab3b08759fd5",
          "round": 1,
          "user_id": "b06ec123-0686-4066-8b22-05b19d2428f7",
          "decision": "rejetee",
          "comment": "Trop de sacs ce mois-ci",
          "order_total": 177000,
          "created_at": "2026-10-21T12:35:33.579Z",
          "user": {
            "id": "b06ec123-0686-4066-8b22-05b19d2428f7",
            "first_name": "Moussa",
            "last_name": "Sow"
          }
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/recommander`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 201 :** `data` contient `order`, `skipped_lines`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Nouveau bon de commande créé (1 produit(s) écarté(s))",
  "data": {
    "order": {
      "id": "f401a46e-6988-4d57-95d4-85272f5a0024",
      "number": "BC-2026-00002",
      "buyer_company_id": "dc440b08-eb28-42ff-a659-4654aca341f2",
      "supplier_company_id": "ced81a52-1e64-411a-868a-c217e53056b1",
      "partnership_id": "a3cded18-ff63-4dd4-a343-8c4f912cf84d",
      "status": "brouillon",
      "revision": 2,
      "current_version_no": 1,
      "validated_version_no": null,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 160000,
      "tax_total": 28800,
      "total": 188800,
      "lines_count": 1,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "8c375fec-329a-481b-b37f-519d556ac159",
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
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": "2572d28e-86d6-42f8-95b1-0db079a4ea5f",
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:34.898Z",
      "updated_at": "2026-10-21T12:35:34.932Z",
      "buyer": {
        "id": "dc440b08-eb28-42ff-a659-4654aca341f2",
        "name": "Société 8378eb",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364216",
        "email": "admin.7588bc4b64@test.sn",
        "ninea": "778258796",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "ced81a52-1e64-411a-868a-c217e53056b1",
        "name": "Société 720e8c",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364217",
        "email": "admin.1e1656294c@test.sn",
        "ninea": "829125955",
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
        "id": "565d9d6b-006a-4336-a4b5-d2cc90532012",
        "order_id": "f401a46e-6988-4d57-95d4-85272f5a0024",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "8c375fec-329a-481b-b37f-519d556ac159",
        "status": "brouillon",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 28800,
        "total": 188800,
        "lines_count": 1,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:35:34.907Z",
        "lines": [
          {
            "id": "6baccb48-559f-4077-ad88-7729bea2a474",
            "order_id": "f401a46e-6988-4d57-95d4-85272f5a0024",
            "version_id": "565d9d6b-006a-4336-a4b5-d2cc90532012",
            "line_no": 1,
            "product_id": "a78305bd-df24-4407-a191-209925668a48",
            "reference": "REF-ff9b45",
            "name": "Riz brisé 3c82",
            "unit": "sac",
            "quantity": 10,
            "unit_price": 16000,
            "tax_rate": 18,
            "line_subtotal": 160000,
            "line_tax": 28800,
            "line_total": 188800,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": null,
            "base_unit_price": 16000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:34.912Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": []
    },
    "skipped_lines": [
      {
        "line_no": 2,
        "reference": "REF-aced54",
        "name": "Riz brisé 59d5",
        "quantity": 4,
        "reason": "produit indisponible"
      }
    ]
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 409 `RIEN_A_RECOMMANDER` · 422 `DONNEES_INVALIDES`.

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
      "id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
      "number": "BC-2026-00001",
      "buyer_company_id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
      "supplier_company_id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
      "partnership_id": "145d9d88-5dee-488e-8d17-41db80997dd8",
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
      "created_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
      "sent_at": "2026-10-21T12:35:01.657Z",
      "acknowledged_at": "2026-10-21T12:35:01.785Z",
      "validated_at": "2026-10-21T12:35:01.973Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:01.524Z",
      "updated_at": "2026-10-21T12:35:01.993Z",
      "buyer": {
        "id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364180",
        "email": "admin.48e97d9cc6@test.sn",
        "ninea": "892499584",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778364181",
        "email": "grossiste.59bfd6cdd7@test.sn",
        "ninea": "261517215",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "annuler",
        "recommander"
      ],
      "current_version": {
        "id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T12:35:01.971Z",
        "decided_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
        "created_at": "2026-10-21T12:35:01.884Z",
        "lines": [
          {
            "id": "b485d96a-578c-47c7-bf9c-bd8b4781cefe",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          },
          {
            "id": "84219df5-23c1-4b0b-ab15-a36775167495",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          }
        ]
      },
      "validated_version": {
        "id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T12:35:01.971Z",
        "decided_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
        "created_at": "2026-10-21T12:35:01.884Z",
        "lines": [
          {
            "id": "b485d96a-578c-47c7-bf9c-bd8b4781cefe",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          },
          {
            "id": "84219df5-23c1-4b0b-ab15-a36775167495",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          }
        ]
      },
      "deliveries": []
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
      "id": "6aa42306-d4b2-4657-aad0-23e773e5d293",
      "number": "BC-2026-00001",
      "buyer_company_id": "9d3cd913-49b3-43a1-a1a9-5279feb74507",
      "supplier_company_id": "31130ffa-b350-4af3-8db0-bfb8b2502fa3",
      "partnership_id": "d4d38ee4-1b82-4480-b2ac-474ca19e3172",
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
      "created_by": "89a92608-4c14-48af-b625-e8e2dd7e93fb",
      "sent_at": "2026-10-21T12:34:49.430Z",
      "acknowledged_at": "2026-10-21T12:34:49.546Z",
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": "2026-10-21T12:34:49.606Z",
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:34:49.357Z",
      "updated_at": "2026-10-21T12:34:49.621Z",
      "buyer": {
        "id": "9d3cd913-49b3-43a1-a1a9-5279feb74507",
        "name": "Société dc248e",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563233",
        "email": "admin.579c377345@test.sn",
        "ninea": "537637960",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "31130ffa-b350-4af3-8db0-bfb8b2502fa3",
        "name": "Société c2392d",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563234",
        "email": "admin.91d9c3dff8@test.sn",
        "ninea": "158141885",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "recommander"
      ],
      "current_version": {
        "id": "a4df1796-e022-4a3e-9b5b-8b234ad5e217",
        "order_id": "6aa42306-d4b2-4657-aad0-23e773e5d293",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "691dfa7d-7992-4716-b18a-1ba36926dee2",
        "status": "refusee",
        "comment": null,
        "subtotal": 40000,
        "tax_total": 5400,
        "total": 45400,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:34:49.604Z",
        "decided_by": "89a92608-4c14-48af-b625-e8e2dd7e93fb",
        "created_at": "2026-10-21T12:34:49.538Z",
        "lines": [
          {
            "id": "04334632-526e-4d14-9a0d-3ba4726d4215",
            "order_id": "6aa42306-d4b2-4657-aad0-23e773e5d293",
            "version_id": "a4df1796-e022-4a3e-9b5b-8b234ad5e217",
            "line_no": 1,
            "product_id": "9834f44e-3777-4ba8-9c53-4edec7fc7079",
            "reference": "REF-f32d5b",
            "name": "Riz brisé 22e8",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:49.540Z"
          },
          {
            "id": "6c7ad30b-7af0-4200-a982-dcc0336c2c7b",
            "order_id": "6aa42306-d4b2-4657-aad0-23e773e5d293",
            "version_id": "a4df1796-e022-4a3e-9b5b-8b234ad5e217",
            "line_no": 2,
            "product_id": "7330115b-f552-495a-a6e6-3a0fbb996ac4",
            "reference": "REF-fe2dc6",
            "name": "Riz brisé 7940",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:49.540Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": []
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
      "id": "650da8f1-9597-4532-add1-f973888c85d9",
      "number": "BC-2026-00001",
      "buyer_company_id": "e1536a45-c9cf-4cf4-a2b3-ab2f8b1ec7ed",
      "supplier_company_id": "8654cc5e-cc50-4cba-899b-6763c47c95e5",
      "partnership_id": "2f5e9489-2cec-4aa6-945a-bfd13176984b",
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
      "created_by": "b4e4d7d3-fa6d-4e6d-a0c4-74807f7a3c8a",
      "sent_at": "2026-10-21T12:34:48.091Z",
      "acknowledged_at": "2026-10-21T12:34:48.160Z",
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:34:48.016Z",
      "updated_at": "2026-10-21T12:34:48.242Z",
      "buyer": {
        "id": "e1536a45-c9cf-4cf4-a2b3-ab2f8b1ec7ed",
        "name": "Société 080c7d",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563229",
        "email": "admin.b5d46a1df6@test.sn",
        "ninea": "707016256",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "8654cc5e-cc50-4cba-899b-6763c47c95e5",
        "name": "Société 1f8d7c",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563230",
        "email": "admin.62ee8dca0e@test.sn",
        "ninea": "808490866",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "annuler",
        "recommander"
      ],
      "current_version": {
        "id": "b9658c9e-942b-4e92-a4ff-b3fa0541ddf3",
        "order_id": "650da8f1-9597-4532-add1-f973888c85d9",
        "version_no": 3,
        "proposed_by_side": "acheteur",
        "proposed_by": "b4e4d7d3-fa6d-4e6d-a0c4-74807f7a3c8a",
        "status": "proposee",
        "comment": "Il nous faut au moins 7 sacs",
        "subtotal": 115000,
        "tax_total": 18900,
        "total": 133900,
        "lines_count": 2,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:34:48.220Z",
        "lines": [
          {
            "id": "f6064f84-5599-4afc-9961-58ba60cf382b",
            "order_id": "650da8f1-9597-4532-add1-f973888c85d9",
            "version_id": "b9658c9e-942b-4e92-a4ff-b3fa0541ddf3",
            "line_no": 1,
            "product_id": "356a48f5-fcfc-4831-828a-b9637b787d60",
            "reference": "REF-10124e",
            "name": "Riz brisé 353a",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:48.222Z"
          },
          {
            "id": "d636e18c-c79c-4a68-b7b5-41cbdae9244f",
            "order_id": "650da8f1-9597-4532-add1-f973888c85d9",
            "version_id": "b9658c9e-942b-4e92-a4ff-b3fa0541ddf3",
            "line_no": 2,
            "product_id": "3882f7da-470a-4d46-ac3b-b24d5c895367",
            "reference": "REF-ac431b",
            "name": "Riz brisé 09cb",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:48.222Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": []
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
      "id": "e87a2d61-9428-428a-b598-4c6088092601",
      "number": "BC-2026-00001",
      "buyer_company_id": "bf33e505-c078-4a88-b5e8-4d7775597ad6",
      "supplier_company_id": "fe798030-09ab-48e9-9ffa-1b1368e24836",
      "partnership_id": "a00dfd51-4dca-4af3-9699-2cb5747a7b3d",
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
      "created_by": "e7036077-d2af-44aa-a834-749da1d6c3fc",
      "sent_at": "2026-10-21T12:34:51.937Z",
      "acknowledged_at": null,
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": "2026-10-21T12:34:52.034Z",
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:34:51.872Z",
      "updated_at": "2026-10-21T12:34:52.059Z",
      "buyer": {
        "id": "bf33e505-c078-4a88-b5e8-4d7775597ad6",
        "name": "Société e924a6",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563241",
        "email": "admin.5bd122882e@test.sn",
        "ninea": "335291146",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "fe798030-09ab-48e9-9ffa-1b1368e24836",
        "name": "Société 04c470",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563242",
        "email": "admin.c6a93a2808@test.sn",
        "ninea": "594248908",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "recommander"
      ],
      "current_version": {
        "id": "4ea21970-ff1b-440a-afbb-92f9b08a91ff",
        "order_id": "e87a2d61-9428-428a-b598-4c6088092601",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "e7036077-d2af-44aa-a834-749da1d6c3fc",
        "status": "refusee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:34:52.038Z",
        "decided_by": "e7036077-d2af-44aa-a834-749da1d6c3fc",
        "created_at": "2026-10-21T12:34:51.876Z",
        "lines": [
          {
            "id": "a8d1cd11-bc07-48b6-b770-136941ff5151",
            "order_id": "e87a2d61-9428-428a-b598-4c6088092601",
            "version_id": "4ea21970-ff1b-440a-afbb-92f9b08a91ff",
            "line_no": 1,
            "product_id": "8231e4d6-e531-4f8d-b5bf-84043903bfdf",
            "reference": "REF-20f756",
            "name": "Riz brisé d791",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:51.878Z"
          },
          {
            "id": "b4dbbae8-e6d8-48ab-8574-ef539c78d549",
            "order_id": "e87a2d61-9428-428a-b598-4c6088092601",
            "version_id": "4ea21970-ff1b-440a-afbb-92f9b08a91ff",
            "line_no": 2,
            "product_id": "06b06233-a199-468f-92a0-9fc6773e4e33",
            "reference": "REF-f8e64e",
            "name": "Riz brisé 5b8e",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:51.878Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": []
    }
  }
}
```

</details>

**Erreurs observées :** 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/confirmer-reception`

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


**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Réception confirmée",
  "data": {
    "order": {
      "id": "bdf2a220-7181-4520-be27-aff15e7802be",
      "number": "BC-2026-00001",
      "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
      "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
      "partnership_id": "083ddf40-4d17-46eb-9283-c5bef3de02d1",
      "status": "reception_confirmee",
      "revision": 8,
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
      "reception_with_reserves": true,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
      "sent_at": "2026-10-21T12:40:12.169Z",
      "acknowledged_at": null,
      "validated_at": "2026-10-21T12:40:12.291Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": "2026-10-21T12:40:12.843Z",
      "received_at": "2026-10-21T12:40:13.107Z",
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 2,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:40:12.032Z",
      "updated_at": "2026-10-21T12:40:13.150Z",
      "buyer": {
        "id": "398586f0-842f-4f3f-804f-191eb691067c",
        "name": "Société 18761c",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364352",
        "email": "admin.a4e3dff193@test.sn",
        "ninea": "359158260",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
        "name": "Société 94b998",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364353",
        "email": "admin.aff40f612c@test.sn",
        "ninea": "617083017",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "ouvrir_litige",
        "recommander"
      ],
      "current_version": {
        "id": "d110d54c-22be-435d-bb75-6e457b36a311",
        "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:40:12.286Z",
        "decided_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
        "created_at": "2026-10-21T12:40:12.042Z",
        "lines": [
          {
            "id": "39b63380-fb55-4a89-b8cd-033df338b1df",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 1,
            "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
            "reference": "REF-c87f18",
            "name": "Riz brisé ebd6",
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
            "received_quantity": 9,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 10,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          },
          {
            "id": "78150364-5efc-4503-808b-98bc2b995281",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 2,
            "product_id": "13fe9edd-82c5-4626-9a76-3b0a16a6d185",
            "reference": "REF-cb2a1d",
            "name": "Riz brisé 5edd",
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
            "received_quantity": 4,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 4,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          }
        ]
      },
      "validated_version": {
        "id": "d110d54c-22be-435d-bb75-6e457b36a311",
        "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:40:12.286Z",
        "decided_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
        "created_at": "2026-10-21T12:40:12.042Z",
        "lines": [
          {
            "id": "39b63380-fb55-4a89-b8cd-033df338b1df",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 1,
            "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
            "reference": "REF-c87f18",
            "name": "Riz brisé ebd6",
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
            "received_quantity": 9,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 10,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          },
          {
            "id": "78150364-5efc-4503-808b-98bc2b995281",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 2,
            "product_id": "13fe9edd-82c5-4626-9a76-3b0a16a6d185",
            "reference": "REF-cb2a1d",
            "name": "Riz brisé 5edd",
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
            "received_quantity": 4,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 4,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          }
        ]
      },
      "deliveries": [
        {
          "id": "d70c9ec6-bd70-4093-8e1a-c59b08834942",
          "number": "BL-2026-00001",
          "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
          "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
          "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
          "delivery_no": 1,
          "status": "receptionnee",
          "note": null,
          "carrier": "Camion 12",
          "shipped_at": "2026-10-21T12:40:12.445Z",
          "document_id": null,
          "received_at": "2026-10-21T12:40:12.603Z",
          "received_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
          "reception_note": "Un sac percé",
          "with_reserves": true,
          "created_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
          "created_at": "2026-10-21T12:40:12.445Z",
          "updated_at": "2026-10-21T12:40:12.604Z",
          "lines": [
            {
              "id": "eaf3d616-81e4-4fc3-b588-1a7a3836aeea",
              "delivery_id": "d70c9ec6-bd70-4093-8e1a-c59b08834942",
              "line_no": 1,
              "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
              "reference": "REF-c87f18",
              "name": "Riz brisé ebd6",
              "unit": "sac",
              "quantity": 6,
              "received_quantity": 5
            }
          ]
        },
        {
          "id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
          "number": "BL-2026-00002",
          "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
          "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
          "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
          "delivery_no": 2,
          "status": "receptionnee",
          "note": null,
          "carrier": null,
          "shipped_at": "2026-10-21T12:40:12.826Z",
          "document_id": null,
          "received_at": "2026-10-21T12:40:13.077Z",
          "received_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
          "reception_note": null,
          "with_reserves": false,
          "created_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
          "created_at": "2026-10-21T12:40:12.826Z",
          "updated_at": "2026-10-21T12:40:13.077Z",
          "lines": [
            {
              "id": "68cf4605-1d84-4934-9e40-f0d6ea7c5456",
              "delivery_id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
              "line_no": 1,
              "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
              "reference": "REF-c87f18",
              "name": "Riz brisé ebd6",
              "unit": "sac",
              "quantity": 4,
              "received_quantity": 4
            },
            {
              "id": "b6483bfd-7a00-45ef-88b4-654229b14479",
              "delivery_id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
              "line_no": 2,
              "product_id": "13fe9edd-82c5-4626-9a76-3b0a16a6d185",
              "reference": "REF-cb2a1d",
              "name": "Riz brisé 5edd",
              "unit": "kg",
              "quantity": 4,
              "received_quantity": 4
            }
          ]
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES` · 422 `RECEPTION_INVALIDE`.

---

#### `GET /api/v1/achats/:id/livraisons`

Livraisons partielles : réception livraison par livraison, bon de livraison, reliquat.

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `deliveries`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "deliveries": [
      {
        "id": "d70c9ec6-bd70-4093-8e1a-c59b08834942",
        "number": "BL-2026-00001",
        "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
        "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
        "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
        "delivery_no": 1,
        "status": "receptionnee",
        "note": null,
        "carrier": "Camion 12",
        "shipped_at": "2026-10-21T12:40:12.445Z",
        "document_id": null,
        "received_at": "2026-10-21T12:40:12.603Z",
        "received_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
        "reception_note": "Un sac percé",
        "with_reserves": true,
        "created_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
        "created_at": "2026-10-21T12:40:12.445Z",
        "updated_at": "2026-10-21T12:40:12.604Z",
        "lines": [
          {
            "id": "eaf3d616-81e4-4fc3-b588-1a7a3836aeea",
            "delivery_id": "d70c9ec6-bd70-4093-8e1a-c59b08834942",
            "line_no": 1,
            "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
            "reference": "REF-c87f18",
            "name": "Riz brisé ebd6",
            "unit": "sac",
            "quantity": 6,
            "received_quantity": 5
          }
        ]
      },
      {
        "id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
        "number": "BL-2026-00002",
        "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
        "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
        "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
        "delivery_no": 2,
        "status": "receptionnee",
        "note": null,
        "carrier": null,
        "shipped_at": "2026-10-21T12:40:12.826Z",
        "document_id": null,
        "received_at": "2026-10-21T12:40:13.077Z",
        "received_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
        "reception_note": null,
        "with_reserves": false,
        "created_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
        "created_at": "2026-10-21T12:40:12.826Z",
        "updated_at": "2026-10-21T12:40:13.077Z",
        "lines": [
          {
            "id": "68cf4605-1d84-4934-9e40-f0d6ea7c5456",
            "delivery_id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
            "line_no": 1,
            "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
            "reference": "REF-c87f18",
            "name": "Riz brisé ebd6",
            "unit": "sac",
            "quantity": 4,
            "received_quantity": 4
          },
          {
            "id": "b6483bfd-7a00-45ef-88b4-654229b14479",
            "delivery_id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
            "line_no": 2,
            "product_id": "13fe9edd-82c5-4626-9a76-3b0a16a6d185",
            "reference": "REF-cb2a1d",
            "name": "Riz brisé 5edd",
            "unit": "kg",
            "quantity": 4,
            "received_quantity": 4
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

#### `POST /api/v1/achats/:id/livraisons/:livraisonId/reception`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `reception.confirmer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |
| `livraisonId` | string (uuid) | **oui** |  |


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
  "lines": [
    {
      "line_no": 1,
      "received_quantity": 5
    }
  ],
  "note": "Un sac percé"
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Livraison réceptionnée",
  "data": {
    "order": {
      "id": "bdf2a220-7181-4520-be27-aff15e7802be",
      "number": "BC-2026-00001",
      "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
      "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
      "partnership_id": "083ddf40-4d17-46eb-9283-c5bef3de02d1",
      "status": "livree_partiellement",
      "revision": 6,
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
      "created_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
      "sent_at": "2026-10-21T12:40:12.169Z",
      "acknowledged_at": null,
      "validated_at": "2026-10-21T12:40:12.291Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 1,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:40:12.032Z",
      "updated_at": "2026-10-21T12:40:12.631Z",
      "buyer": {
        "id": "398586f0-842f-4f3f-804f-191eb691067c",
        "name": "Société 18761c",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364352",
        "email": "admin.a4e3dff193@test.sn",
        "ninea": "359158260",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
        "name": "Société 94b998",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364353",
        "email": "admin.aff40f612c@test.sn",
        "ninea": "617083017",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "receptionner",
        "solder_reliquat"
      ],
      "current_version": {
        "id": "d110d54c-22be-435d-bb75-6e457b36a311",
        "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:40:12.286Z",
        "decided_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
        "created_at": "2026-10-21T12:40:12.042Z",
        "lines": [
          {
            "id": "39b63380-fb55-4a89-b8cd-033df338b1df",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 1,
            "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
            "reference": "REF-c87f18",
            "name": "Riz brisé ebd6",
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
            "received_quantity": 5,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 6,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          },
          {
            "id": "78150364-5efc-4503-808b-98bc2b995281",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 2,
            "product_id": "13fe9edd-82c5-4626-9a76-3b0a16a6d185",
            "reference": "REF-cb2a1d",
            "name": "Riz brisé 5edd",
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
            "received_quantity": 0,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          }
        ]
      },
      "validated_version": {
        "id": "d110d54c-22be-435d-bb75-6e457b36a311",
        "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:40:12.286Z",
        "decided_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
        "created_at": "2026-10-21T12:40:12.042Z",
        "lines": [
          {
            "id": "39b63380-fb55-4a89-b8cd-033df338b1df",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 1,
            "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
            "reference": "REF-c87f18",
            "name": "Riz brisé ebd6",
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
            "received_quantity": 5,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 6,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          },
          {
            "id": "78150364-5efc-4503-808b-98bc2b995281",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 2,
            "product_id": "13fe9edd-82c5-4626-9a76-3b0a16a6d185",
            "reference": "REF-cb2a1d",
            "name": "Riz brisé 5edd",
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
            "received_quantity": 0,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          }
        ]
      },
      "deliveries": [
        {
          "id": "d70c9ec6-bd70-4093-8e1a-c59b08834942",
          "number": "BL-2026-00001",
          "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
          "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
          "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
          "delivery_no": 1,
          "status": "receptionnee",
          "note": null,
          "carrier": "Camion 12",
          "shipped_at": "2026-10-21T12:40:12.445Z",
          "document_id": null,
          "received_at": "2026-10-21T12:40:12.603Z",
          "received_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
          "reception_note": "Un sac percé",
          "with_reserves": true,
          "created_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
          "created_at": "2026-10-21T12:40:12.445Z",
          "updated_at": "2026-10-21T12:40:12.604Z",
          "lines": [
            {
              "id": "eaf3d616-81e4-4fc3-b588-1a7a3836aeea",
              "delivery_id": "d70c9ec6-bd70-4093-8e1a-c59b08834942",
              "line_no": 1,
              "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
              "reference": "REF-c87f18",
              "name": "Riz brisé ebd6",
              "unit": "sac",
              "quantity": 6,
              "received_quantity": 5
            }
          ]
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 409 `LIVRAISON_DEJA_RECEPTIONNEE` · 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/achats/:id/livraisons/:livraisonId/bon-de-livraison.pdf`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `achats.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |
| `livraisonId` | string (uuid) | **oui** |  |


**Réponse 200 :** fichier `application/pdf` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/achats/:id/solder-reliquat`

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
  "reason": "Nous n’avons plus besoin du reste"
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Reliquat soldé : le reste ne sera pas livré",
  "data": {
    "order": {
      "id": "9f4c0f42-07dc-4298-9aa5-346938d6d55d",
      "number": "BC-2026-00001",
      "buyer_company_id": "11c65ba5-cfb4-452d-ac4b-6016ad21e475",
      "supplier_company_id": "882fc070-ac6d-41c8-8edc-7c6f9979b2a8",
      "partnership_id": "79901a14-8fb6-48c4-b09d-e34ebfd7f905",
      "status": "reception_confirmee",
      "revision": 8,
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
      "reception_with_reserves": true,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "64e08059-7b3d-40b6-ab2b-83e4726c675a",
      "sent_at": "2026-10-21T12:40:14.590Z",
      "acknowledged_at": null,
      "validated_at": "2026-10-21T12:40:14.747Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": "2026-10-21T12:40:15.497Z",
      "received_at": "2026-10-21T12:40:15.528Z",
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "approval_status": "non_requise",
      "approvals_required": 0,
      "approval_round": 0,
      "approval_requested_at": null,
      "approval_requested_by": null,
      "approved_at": null,
      "source_order_id": null,
      "purchase_list_id": null,
      "deliveries_count": 1,
      "backorder_closed_at": "2026-10-21T12:40:15.491Z",
      "backorder_closed_by_side": "acheteur",
      "backorder_close_reason": "Nous n’avons plus besoin du reste",
      "created_at": "2026-10-21T12:40:14.415Z",
      "updated_at": "2026-10-21T12:40:15.553Z",
      "buyer": {
        "id": "11c65ba5-cfb4-452d-ac4b-6016ad21e475",
        "name": "Société 8b39f5",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364354",
        "email": "admin.cb5a130820@test.sn",
        "ninea": "316437835",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "882fc070-ac6d-41c8-8edc-7c6f9979b2a8",
        "name": "Société ddd669",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364355",
        "email": "admin.006d6ed457@test.sn",
        "ninea": "654333920",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "acheteur",
      "actions": [
        "ouvrir_litige",
        "recommander"
      ],
      "current_version": {
        "id": "a52a76ee-9ec0-47d2-8fc9-1214c205f1a0",
        "order_id": "9f4c0f42-07dc-4298-9aa5-346938d6d55d",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "64e08059-7b3d-40b6-ab2b-83e4726c675a",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:40:14.741Z",
        "decided_by": "ed8da53f-92f0-4490-83dd-ba2c04805d6e",
        "created_at": "2026-10-21T12:40:14.431Z",
        "lines": [
          {
            "id": "33c6bafc-b290-47ec-a501-f269e321bafb",
            "order_id": "9f4c0f42-07dc-4298-9aa5-346938d6d55d",
            "version_id": "a52a76ee-9ec0-47d2-8fc9-1214c205f1a0",
            "line_no": 1,
            "product_id": "1085a006-5538-4a45-8a2e-1f23573189d7",
            "reference": "REF-29ccef",
            "name": "Riz brisé 0908",
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
            "received_quantity": 6,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 6,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:14.439Z"
          },
          {
            "id": "b87d13ed-7425-4a14-b125-8d46935ed07d",
            "order_id": "9f4c0f42-07dc-4298-9aa5-346938d6d55d",
            "version_id": "a52a76ee-9ec0-47d2-8fc9-1214c205f1a0",
            "line_no": 2,
            "product_id": "c8700e88-1d17-4a17-becc-aec214347d74",
            "reference": "REF-960ee8",
            "name": "Riz brisé 26b3",
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
            "received_quantity": 0,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:14.439Z"
          }
        ]
      },
      "validated_version": {
        "id": "a52a76ee-9ec0-47d2-8fc9-1214c205f1a0",
        "order_id": "9f4c0f42-07dc-4298-9aa5-346938d6d55d",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "64e08059-7b3d-40b6-ab2b-83e4726c675a",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:40:14.741Z",
        "decided_by": "ed8da53f-92f0-4490-83dd-ba2c04805d6e",
        "created_at": "2026-10-21T12:40:14.431Z",
        "lines": [
          {
            "id": "33c6bafc-b290-47ec-a501-f269e321bafb",
            "order_id": "9f4c0f42-07dc-4298-9aa5-346938d6d55d",
            "version_id": "a52a76ee-9ec0-47d2-8fc9-1214c205f1a0",
            "line_no": 1,
            "product_id": "1085a006-5538-4a45-8a2e-1f23573189d7",
            "reference": "REF-29ccef",
            "name": "Riz brisé 0908",
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
            "received_quantity": 6,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 6,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:14.439Z"
          },
          {
            "id": "b87d13ed-7425-4a14-b125-8d46935ed07d",
            "order_id": "9f4c0f42-07dc-4298-9aa5-346938d6d55d",
            "version_id": "a52a76ee-9ec0-47d2-8fc9-1214c205f1a0",
            "line_no": 2,
            "product_id": "c8700e88-1d17-4a17-becc-aec214347d74",
            "reference": "REF-960ee8",
            "name": "Riz brisé 26b3",
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
            "received_quantity": 0,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:14.439Z"
          }
        ]
      },
      "deliveries": [
        {
          "id": "ec46e2e2-97df-49e6-95bf-ae4c83ed5029",
          "number": "BL-2026-00001",
          "order_id": "9f4c0f42-07dc-4298-9aa5-346938d6d55d",
          "supplier_company_id": "882fc070-ac6d-41c8-8edc-7c6f9979b2a8",
          "buyer_company_id": "11c65ba5-cfb4-452d-ac4b-6016ad21e475",
          "delivery_no": 1,
          "status": "receptionnee",
          "note": null,
          "carrier": null,
          "shipped_at": "2026-10-21T12:40:14.943Z",
          "document_id": "4aa88d19-c255-4254-b882-590da1c3b014",
          "received_at": "2026-10-21T12:40:15.327Z",
          "received_by": "64e08059-7b3d-40b6-ab2b-83e4726c675a",
          "reception_note": null,
          "with_reserves": false,
          "created_by": "ed8da53f-92f0-4490-83dd-ba2c04805d6e",
          "created_at": "2026-10-21T12:40:14.943Z",
          "updated_at": "2026-10-21T12:40:15.328Z",
          "lines": [
            {
              "id": "aca2beea-98ea-4d8f-a3c5-0539bad4a805",
              "delivery_id": "ec46e2e2-97df-49e6-95bf-ae4c83ed5029",
              "line_no": 1,
              "product_id": "1085a006-5538-4a45-8a2e-1f23573189d7",
              "reference": "REF-29ccef",
              "name": "Riz brisé 0908",
              "unit": "sac",
              "quantity": 6,
              "received_quantity": 6
            }
          ]
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES`.

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
      "id": 210,
      "order_id": "90b0a1bc-86ce-4a9c-ba23-42185d5483d8",
      "type": "commentaire",
      "from_status": null,
      "to_status": null,
      "version_no": null,
      "actor_user_id": "b420a4ad-6794-48f0-897b-c0324a52ed5b",
      "actor_company_id": "6c659756-f13f-4c30-8eaa-eebbcd791404",
      "actor_side": "acheteur",
      "message": "Livraison avant 10 h svp",
      "details": null,
      "created_at": "2026-10-21T12:36:24.146Z"
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
      "id": "12331294-408a-42eb-b215-350765c6ef8d",
      "company_id": "998134f3-484d-491b-8333-b3aced693d83",
      "category": "piece_jointe",
      "visibility": "partenaire",
      "mime_type": "application/pdf",
      "size_bytes": 69,
      "original_name": "plan.pdf",
      "has_thumbnail": false,
      "created_at": "2026-10-21T12:34:51.470Z",
      "url": "/api/v1/documents/12331294-408a-42eb-b215-350765c6ef8d/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `COMMANDE_CLOSE` · 422 `DONNEES_INVALIDES`.

---

## 17. Ventes — commandes reçues (fournisseur)

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
| GET | `/api/v1/ventes/:id/livraisons` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/livraisons` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/livraisons/:livraisonId/document` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/ventes/:id/livraisons/:livraisonId/bon-de-livraison.pdf` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/ventes/:id/solder-reliquat` | membre d’une entreprise active — entreprise fournisseur ou mixte |
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
| `status` | string | non | max 300 car. · format `/^(brouillon\|envoyee\|en_attente_validation\|proposition_modifiee\|validee\|en_preparation\|prete\|livree_partiellement\|livree\|reception_confirmee\|facturee\|terminee\|refusee\|annulee)(,(brouillon\|envoyee\|en_attente_validation\|proposition_modifiee\|validee\|en_preparation\|prete\|livree_partiellement\|livree\|reception_confirmee\|facturee\|terminee\|refusee\|annulee))*$/` |
| `q` | string | non | max 100 car. |
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `a_traiter` | boolean | non |  |
| `modifie_depuis` | date | non |  |
| `client_id` | string (uuid) | non |  |
| `tri` | string | non | valeurs : `sent_at`, `-sent_at`, `created_at`, `-created_at`, `total`, `-total`, `number`, `-number`, `updated_at`, `-updated_at` |


Exemple de query string réelle : `?a_traiter=true`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `number`, `buyer_company_id`, `supplier_company_id`, `partnership_id`, `status`, `revision`, `current_version_no`, `validated_version_no`, `buyer_reference`, `delivery_address`, `requested_delivery_date`, `conditions`, `currency`, `subtotal`, `tax_total`, `total`, `lines_count`, `delivery_note`, `reception_note`, `reception_with_reserves`, `cancellation_reason`, `refusal_reason`, `cancelled_by_side`, `template_id`, `created_by`, `sent_at`, `acknowledged_at`, `validated_at`, `preparation_at`, `ready_at`, `delivered_at`, `received_at`, `invoiced_at`, `completed_at`, `refused_at`, `cancelled_at`, `deliveries_count`, `backorder_closed_at`, `backorder_closed_by_side`, `backorder_close_reason`, `created_at`, `updated_at`, `buyer`, `supplier`, `side`, `actions`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "22f4438c-46a7-40af-a5d8-47c22eb47a68",
        "number": "BC-2026-00002",
        "buyer_company_id": "aae2fc2b-16f1-41dd-98c0-671f020b1053",
        "supplier_company_id": "9880b336-fc6a-4593-8122-36b709efb162",
        "partnership_id": "94531513-22ec-41cc-bcca-2caea966c0a4",
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
        "created_by": "3362f87f-6edb-45d1-8e0f-1855fb92c787",
        "sent_at": "2026-10-21T12:34:47.545Z",
        "acknowledged_at": null,
        "validated_at": "2026-10-21T12:34:47.613Z",
        "preparation_at": null,
        "ready_at": null,
        "delivered_at": null,
        "received_at": null,
        "invoiced_at": null,
        "completed_at": null,
        "refused_at": null,
        "cancelled_at": null,
        "deliveries_count": 0,
        "backorder_closed_at": null,
        "backorder_closed_by_side": null,
        "backorder_close_reason": null,
        "created_at": "2026-10-21T12:34:47.479Z",
        "updated_at": "2026-10-21T12:34:47.627Z",
        "buyer": {
          "id": "aae2fc2b-16f1-41dd-98c0-671f020b1053",
          "name": "Société 2a4bf9",
          "city": "Dakar",
          "logo_document_id": null
        },
        "supplier": {
          "id": "9880b336-fc6a-4593-8122-36b709efb162",
          "name": "Société cada41",
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
        "id": "098212cd-28c9-437d-874f-679286412df3",
        "number": "BC-2026-00001",
        "buyer_company_id": "aae2fc2b-16f1-41dd-98c0-671f020b1053",
        "supplier_company_id": "9880b336-fc6a-4593-8122-36b709efb162",
        "partnership_id": "94531513-22ec-41cc-bcca-2caea966c0a4",
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
        "created_by": "3362f87f-6edb-45d1-8e0f-1855fb92c787",
        "sent_at": "2026-10-21T12:34:47.401Z",
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
        "deliveries_count": 0,
        "backorder_closed_at": null,
        "backorder_closed_by_side": null,
        "backorder_close_reason": null,
        "created_at": "2026-10-21T12:34:47.304Z",
        "updated_at": "2026-10-21T12:34:47.420Z",
        "buyer": {
          "id": "aae2fc2b-16f1-41dd-98c0-671f020b1053",
          "name": "Société 2a4bf9",
          "city": "Dakar",
          "logo_document_id": null
        },
        "supplier": {
          "id": "9880b336-fc6a-4593-8122-36b709efb162",
          "name": "Société cada41",
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
      "id": "4937c25b-2a3e-4e52-a343-7ef13e517578",
      "number": "BC-2026-00001",
      "buyer_company_id": "70954be1-0374-49c6-ac61-1e346d83a01d",
      "supplier_company_id": "0b78210e-8bd4-49b1-bb79-b557a887277e",
      "partnership_id": "9025c1f4-2296-4005-83ca-cac287653fa4",
      "status": "reception_confirmee",
      "revision": 8,
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
      "created_by": "34fa0d24-120f-4df6-8849-302632233f5a",
      "sent_at": "2026-10-21T12:34:45.748Z",
      "acknowledged_at": null,
      "validated_at": "2026-10-21T12:34:45.836Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": "2026-10-21T12:34:45.933Z",
      "received_at": "2026-10-21T12:34:46.092Z",
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "deliveries_count": 1,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:34:45.619Z",
      "updated_at": "2026-10-21T12:34:46.341Z",
      "buyer": {
        "id": "70954be1-0374-49c6-ac61-1e346d83a01d",
        "name": "Société 02651a",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364159",
        "email": "admin.ea3e03d443@test.sn",
        "ninea": "713464999",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "0b78210e-8bd4-49b1-bb79-b557a887277e",
        "name": "Société 9282e6",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364160",
        "email": "admin.103eb1535d@test.sn",
        "ninea": "268048028",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [
        "facturer"
      ],
      "current_version": {
        "id": "bfeb9a6b-eafa-49fb-9bb9-170ab69693bb",
        "order_id": "4937c25b-2a3e-4e52-a343-7ef13e517578",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "34fa0d24-120f-4df6-8849-302632233f5a",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:34:45.833Z",
        "decided_by": "daddbe78-a786-46ef-b7c7-ba5a753a2151",
        "created_at": "2026-10-21T12:34:45.629Z",
        "lines": [
          {
            "id": "2092a3a8-6d2c-441d-9f5f-e777bb76307b",
            "order_id": "4937c25b-2a3e-4e52-a343-7ef13e517578",
            "version_id": "bfeb9a6b-eafa-49fb-9bb9-170ab69693bb",
            "line_no": 1,
            "product_id": "f7f49015-876a-4ec3-8c9a-62e45665face",
            "reference": "REF-1e1e6f",
            "name": "Riz brisé 3457",
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
            "received_quantity": 10,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 10,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:45.635Z"
          },
          {
            "id": "966ee7c8-3421-4fd8-923e-7d5538b5a43d",
            "order_id": "4937c25b-2a3e-4e52-a343-7ef13e517578",
            "version_id": "bfeb9a6b-eafa-49fb-9bb9-170ab69693bb",
            "line_no": 2,
            "product_id": "1d4d5d5c-262c-4186-8dad-1e5148ea6f85",
            "reference": "REF-a02ff4",
            "name": "Riz brisé 2286",
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
            "received_quantity": 4,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 4,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:45.635Z"
          }
        ]
      },
      "validated_version": {
        "id": "bfeb9a6b-eafa-49fb-9bb9-170ab69693bb",
        "order_id": "4937c25b-2a3e-4e52-a343-7ef13e517578",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "34fa0d24-120f-4df6-8849-302632233f5a",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:34:45.833Z",
        "decided_by": "daddbe78-a786-46ef-b7c7-ba5a753a2151",
        "created_at": "2026-10-21T12:34:45.629Z",
        "lines": [
          {
            "id": "2092a3a8-6d2c-441d-9f5f-e777bb76307b",
            "order_id": "4937c25b-2a3e-4e52-a343-7ef13e517578",
            "version_id": "bfeb9a6b-eafa-49fb-9bb9-170ab69693bb",
            "line_no": 1,
            "product_id": "f7f49015-876a-4ec3-8c9a-62e45665face",
            "reference": "REF-1e1e6f",
            "name": "Riz brisé 3457",
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
            "received_quantity": 10,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 10,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:45.635Z"
          },
          {
            "id": "966ee7c8-3421-4fd8-923e-7d5538b5a43d",
            "order_id": "4937c25b-2a3e-4e52-a343-7ef13e517578",
            "version_id": "bfeb9a6b-eafa-49fb-9bb9-170ab69693bb",
            "line_no": 2,
            "product_id": "1d4d5d5c-262c-4186-8dad-1e5148ea6f85",
            "reference": "REF-a02ff4",
            "name": "Riz brisé 2286",
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
            "received_quantity": 4,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 4,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:45.635Z"
          }
        ]
      },
      "deliveries": [
        {
          "id": "81269997-3bfc-46b8-b9d3-b12f2b7bd4c7",
          "number": "BL-2026-00001",
          "order_id": "4937c25b-2a3e-4e52-a343-7ef13e517578",
          "supplier_company_id": "0b78210e-8bd4-49b1-bb79-b557a887277e",
          "buyer_company_id": "70954be1-0374-49c6-ac61-1e346d83a01d",
          "delivery_no": 1,
          "status": "receptionnee",
          "note": null,
          "carrier": null,
          "shipped_at": "2026-10-21T12:34:45.910Z",
          "document_id": null,
          "received_at": "2026-10-21T12:34:46.066Z",
          "received_by": "34fa0d24-120f-4df6-8849-302632233f5a",
          "reception_note": null,
          "with_reserves": false,
          "created_by": "daddbe78-a786-46ef-b7c7-ba5a753a2151",
          "created_at": "2026-10-21T12:34:45.910Z",
          "updated_at": "2026-10-21T12:34:46.067Z",
          "lines": [
            {
              "id": "cdbe3687-7fd0-4cc6-9bad-fa688bacdb74",
              "delivery_id": "81269997-3bfc-46b8-b9d3-b12f2b7bd4c7",
              "line_no": 1,
              "product_id": "f7f49015-876a-4ec3-8c9a-62e45665face",
              "reference": "REF-1e1e6f",
              "name": "Riz brisé 3457",
              "unit": "sac",
              "quantity": 10,
              "received_quantity": 10
            },
            {
              "id": "332369f5-2eec-4fec-a67b-e61a5e4d9998",
              "delivery_id": "81269997-3bfc-46b8-b9d3-b12f2b7bd4c7",
              "line_no": 2,
              "product_id": "1d4d5d5c-262c-4186-8dad-1e5148ea6f85",
              "reference": "REF-a02ff4",
              "name": "Riz brisé 2286",
              "unit": "kg",
              "quantity": 4,
              "received_quantity": 4
            }
          ]
        }
      ]
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
        "id": "72cc08cc-e7db-4693-9e8b-96bf4b14645f",
        "order_id": "90b0a1bc-86ce-4a9c-ba23-42185d5483d8",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "b420a4ad-6794-48f0-897b-c0324a52ed5b",
        "status": "proposee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:36:24.011Z",
        "lines": [
          {
            "id": "bae3dfce-4d66-4a73-959f-e65d00f1d4e1",
            "order_id": "90b0a1bc-86ce-4a9c-ba23-42185d5483d8",
            "version_id": "72cc08cc-e7db-4693-9e8b-96bf4b14645f",
            "line_no": 1,
            "product_id": "585e278c-2e26-4633-9a9f-84ecdea82d13",
            "reference": "REF-a76c4c",
            "name": "Riz brisé 7f3a",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:36:24.015Z"
          },
          {
            "id": "f2879f42-49dd-4abc-a133-fd9baf1bbf69",
            "order_id": "90b0a1bc-86ce-4a9c-ba23-42185d5483d8",
            "version_id": "72cc08cc-e7db-4693-9e8b-96bf4b14645f",
            "line_no": 2,
            "product_id": "2a0d10de-078e-452f-8ffc-0e4268db0a0f",
            "reference": "REF-684564",
            "name": "Riz brisé 200d",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:36:24.015Z"
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
        "id": 209,
        "order_id": "90b0a1bc-86ce-4a9c-ba23-42185d5483d8",
        "type": "envoi",
        "from_status": "brouillon",
        "to_status": "envoyee",
        "version_no": 1,
        "actor_user_id": "b420a4ad-6794-48f0-897b-c0324a52ed5b",
        "actor_company_id": "6c659756-f13f-4c30-8eaa-eebbcd791404",
        "actor_side": "acheteur",
        "message": null,
        "details": null,
        "created_at": "2026-10-21T12:36:24.099Z",
        "actor": {
          "id": "b420a4ad-6794-48f0-897b-c0324a52ed5b",
          "first_name": "Awa",
          "last_name": "Diop"
        },
        "actorCompany": {
          "id": "6c659756-f13f-4c30-8eaa-eebbcd791404",
          "name": "Société 9293c6"
        }
      },
      {
        "id": 210,
        "order_id": "90b0a1bc-86ce-4a9c-ba23-42185d5483d8",
        "type": "commentaire",
        "from_status": null,
        "to_status": null,
        "version_no": null,
        "actor_user_id": "b420a4ad-6794-48f0-897b-c0324a52ed5b",
        "actor_company_id": "6c659756-f13f-4c30-8eaa-eebbcd791404",
        "actor_side": "acheteur",
        "message": "Livraison avant 10 h svp",
        "details": null,
        "created_at": "2026-10-21T12:36:24.146Z",
        "actor": {
          "id": "b420a4ad-6794-48f0-897b-c0324a52ed5b",
          "first_name": "Awa",
          "last_name": "Diop"
        },
        "actorCompany": {
          "id": "6c659756-f13f-4c30-8eaa-eebbcd791404",
          "name": "Société 9293c6"
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
      "id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
      "number": "BC-2026-00001",
      "buyer_company_id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
      "supplier_company_id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
      "partnership_id": "145d9d88-5dee-488e-8d17-41db80997dd8",
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
      "created_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
      "sent_at": "2026-10-21T12:35:01.657Z",
      "acknowledged_at": "2026-10-21T12:35:01.785Z",
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:01.524Z",
      "updated_at": "2026-10-21T12:35:01.794Z",
      "buyer": {
        "id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364180",
        "email": "admin.48e97d9cc6@test.sn",
        "ninea": "892499584",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778364181",
        "email": "grossiste.59bfd6cdd7@test.sn",
        "ninea": "261517215",
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
        "id": "5ca9fa19-ecca-408b-8c73-8b7e80a9e549",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
        "status": "proposee",
        "comment": null,
        "subtotal": 103500,
        "tax_total": 12960,
        "total": 116460,
        "lines_count": 3,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:35:01.533Z",
        "lines": [
          {
            "id": "5a20a847-36c3-4b5f-83ac-fae32d053533",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "5ca9fa19-ecca-408b-8c73-8b7e80a9e549",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.547Z"
          },
          {
            "id": "6e48715c-7d50-4647-a798-c98f9265afc8",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "5ca9fa19-ecca-408b-8c73-8b7e80a9e549",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.547Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": []
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
      "id": "650da8f1-9597-4532-add1-f973888c85d9",
      "number": "BC-2026-00001",
      "buyer_company_id": "e1536a45-c9cf-4cf4-a2b3-ab2f8b1ec7ed",
      "supplier_company_id": "8654cc5e-cc50-4cba-899b-6763c47c95e5",
      "partnership_id": "2f5e9489-2cec-4aa6-945a-bfd13176984b",
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
      "created_by": "b4e4d7d3-fa6d-4e6d-a0c4-74807f7a3c8a",
      "sent_at": "2026-10-21T12:34:48.091Z",
      "acknowledged_at": "2026-10-21T12:34:48.160Z",
      "validated_at": "2026-10-21T12:34:48.319Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:34:48.016Z",
      "updated_at": "2026-10-21T12:34:48.334Z",
      "buyer": {
        "id": "e1536a45-c9cf-4cf4-a2b3-ab2f8b1ec7ed",
        "name": "Société 080c7d",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563229",
        "email": "admin.b5d46a1df6@test.sn",
        "ninea": "707016256",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "8654cc5e-cc50-4cba-899b-6763c47c95e5",
        "name": "Société 1f8d7c",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563230",
        "email": "admin.62ee8dca0e@test.sn",
        "ninea": "808490866",
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
        "id": "b9658c9e-942b-4e92-a4ff-b3fa0541ddf3",
        "order_id": "650da8f1-9597-4532-add1-f973888c85d9",
        "version_no": 3,
        "proposed_by_side": "acheteur",
        "proposed_by": "b4e4d7d3-fa6d-4e6d-a0c4-74807f7a3c8a",
        "status": "acceptee",
        "comment": "Il nous faut au moins 7 sacs",
        "subtotal": 115000,
        "tax_total": 18900,
        "total": 133900,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:34:48.316Z",
        "decided_by": "5f68a1d9-723d-4900-af61-7cf90dcf6ff5",
        "created_at": "2026-10-21T12:34:48.220Z",
        "lines": [
          {
            "id": "f6064f84-5599-4afc-9961-58ba60cf382b",
            "order_id": "650da8f1-9597-4532-add1-f973888c85d9",
            "version_id": "b9658c9e-942b-4e92-a4ff-b3fa0541ddf3",
            "line_no": 1,
            "product_id": "356a48f5-fcfc-4831-828a-b9637b787d60",
            "reference": "REF-10124e",
            "name": "Riz brisé 353a",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:48.222Z"
          },
          {
            "id": "d636e18c-c79c-4a68-b7b5-41cbdae9244f",
            "order_id": "650da8f1-9597-4532-add1-f973888c85d9",
            "version_id": "b9658c9e-942b-4e92-a4ff-b3fa0541ddf3",
            "line_no": 2,
            "product_id": "3882f7da-470a-4d46-ac3b-b24d5c895367",
            "reference": "REF-ac431b",
            "name": "Riz brisé 09cb",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:48.222Z"
          }
        ]
      },
      "validated_version": {
        "id": "b9658c9e-942b-4e92-a4ff-b3fa0541ddf3",
        "order_id": "650da8f1-9597-4532-add1-f973888c85d9",
        "version_no": 3,
        "proposed_by_side": "acheteur",
        "proposed_by": "b4e4d7d3-fa6d-4e6d-a0c4-74807f7a3c8a",
        "status": "acceptee",
        "comment": "Il nous faut au moins 7 sacs",
        "subtotal": 115000,
        "tax_total": 18900,
        "total": 133900,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:34:48.316Z",
        "decided_by": "5f68a1d9-723d-4900-af61-7cf90dcf6ff5",
        "created_at": "2026-10-21T12:34:48.220Z",
        "lines": [
          {
            "id": "f6064f84-5599-4afc-9961-58ba60cf382b",
            "order_id": "650da8f1-9597-4532-add1-f973888c85d9",
            "version_id": "b9658c9e-942b-4e92-a4ff-b3fa0541ddf3",
            "line_no": 1,
            "product_id": "356a48f5-fcfc-4831-828a-b9637b787d60",
            "reference": "REF-10124e",
            "name": "Riz brisé 353a",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:48.222Z"
          },
          {
            "id": "d636e18c-c79c-4a68-b7b5-41cbdae9244f",
            "order_id": "650da8f1-9597-4532-add1-f973888c85d9",
            "version_id": "b9658c9e-942b-4e92-a4ff-b3fa0541ddf3",
            "line_no": 2,
            "product_id": "3882f7da-470a-4d46-ac3b-b24d5c895367",
            "reference": "REF-ac431b",
            "name": "Riz brisé 09cb",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:48.222Z"
          }
        ]
      },
      "deliveries": []
    }
  }
}
```

</details>

**Erreurs observées :** 403 `ACCES_AUTRE_ENTREPRISE` · 403 `PERMISSION_REFUSEE` · 409 `AUCUNE_PROPOSITION` · 409 `STOCK_INSUFFISANT` · 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES`.

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
      "id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
      "number": "BC-2026-00001",
      "buyer_company_id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
      "supplier_company_id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
      "partnership_id": "145d9d88-5dee-488e-8d17-41db80997dd8",
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
      "created_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
      "sent_at": "2026-10-21T12:35:01.657Z",
      "acknowledged_at": "2026-10-21T12:35:01.785Z",
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:01.524Z",
      "updated_at": "2026-10-21T12:35:01.915Z",
      "buyer": {
        "id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364180",
        "email": "admin.48e97d9cc6@test.sn",
        "ninea": "892499584",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778364181",
        "email": "grossiste.59bfd6cdd7@test.sn",
        "ninea": "261517215",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [],
      "current_version": {
        "id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
        "status": "proposee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": null,
        "decided_by": null,
        "created_at": "2026-10-21T12:35:01.884Z",
        "lines": [
          {
            "id": "b485d96a-578c-47c7-bf9c-bd8b4781cefe",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          },
          {
            "id": "84219df5-23c1-4b0b-ab15-a36775167495",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": []
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
      "id": "c6ea17e2-69f0-4e3a-94a0-c7c715de03b4",
      "number": "BC-2026-00002",
      "buyer_company_id": "9d3cd913-49b3-43a1-a1a9-5279feb74507",
      "supplier_company_id": "31130ffa-b350-4af3-8db0-bfb8b2502fa3",
      "partnership_id": "d4d38ee4-1b82-4480-b2ac-474ca19e3172",
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
      "created_by": "89a92608-4c14-48af-b625-e8e2dd7e93fb",
      "sent_at": "2026-10-21T12:34:49.730Z",
      "acknowledged_at": null,
      "validated_at": null,
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": "2026-10-21T12:34:49.793Z",
      "cancelled_at": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:34:49.665Z",
      "updated_at": "2026-10-21T12:34:49.807Z",
      "buyer": {
        "id": "9d3cd913-49b3-43a1-a1a9-5279feb74507",
        "name": "Société dc248e",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563233",
        "email": "admin.579c377345@test.sn",
        "ninea": "537637960",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "31130ffa-b350-4af3-8db0-bfb8b2502fa3",
        "name": "Société c2392d",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563234",
        "email": "admin.91d9c3dff8@test.sn",
        "ninea": "158141885",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [],
      "current_version": {
        "id": "cfff2883-2b4a-4243-ba60-3e46a77c5e1a",
        "order_id": "c6ea17e2-69f0-4e3a-94a0-c7c715de03b4",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "89a92608-4c14-48af-b625-e8e2dd7e93fb",
        "status": "refusee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:34:49.791Z",
        "decided_by": "691dfa7d-7992-4716-b18a-1ba36926dee2",
        "created_at": "2026-10-21T12:34:49.669Z",
        "lines": [
          {
            "id": "22bd4337-3d01-48e9-9071-4264191f80a5",
            "order_id": "c6ea17e2-69f0-4e3a-94a0-c7c715de03b4",
            "version_id": "cfff2883-2b4a-4243-ba60-3e46a77c5e1a",
            "line_no": 1,
            "product_id": "9834f44e-3777-4ba8-9c53-4edec7fc7079",
            "reference": "REF-f32d5b",
            "name": "Riz brisé 22e8",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:49.671Z"
          },
          {
            "id": "c0180f86-51a7-4d74-a595-a66de6623ee4",
            "order_id": "c6ea17e2-69f0-4e3a-94a0-c7c715de03b4",
            "version_id": "cfff2883-2b4a-4243-ba60-3e46a77c5e1a",
            "line_no": 2,
            "product_id": "7330115b-f552-495a-a6e6-3a0fbb996ac4",
            "reference": "REF-fe2dc6",
            "name": "Riz brisé 7940",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:34:49.671Z"
          }
        ]
      },
      "validated_version": null,
      "deliveries": []
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
      "id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
      "number": "BC-2026-00001",
      "buyer_company_id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
      "supplier_company_id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
      "partnership_id": "145d9d88-5dee-488e-8d17-41db80997dd8",
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
      "created_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
      "sent_at": "2026-10-21T12:35:01.657Z",
      "acknowledged_at": "2026-10-21T12:35:01.785Z",
      "validated_at": "2026-10-21T12:35:01.973Z",
      "preparation_at": "2026-10-21T12:35:02.036Z",
      "ready_at": "2026-10-21T12:35:02.097Z",
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:01.524Z",
      "updated_at": "2026-10-21T12:35:02.116Z",
      "buyer": {
        "id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364180",
        "email": "admin.48e97d9cc6@test.sn",
        "ninea": "892499584",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778364181",
        "email": "grossiste.59bfd6cdd7@test.sn",
        "ninea": "261517215",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [
        "livrer"
      ],
      "current_version": {
        "id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T12:35:01.971Z",
        "decided_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
        "created_at": "2026-10-21T12:35:01.884Z",
        "lines": [
          {
            "id": "b485d96a-578c-47c7-bf9c-bd8b4781cefe",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          },
          {
            "id": "84219df5-23c1-4b0b-ab15-a36775167495",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          }
        ]
      },
      "validated_version": {
        "id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T12:35:01.971Z",
        "decided_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
        "created_at": "2026-10-21T12:35:01.884Z",
        "lines": [
          {
            "id": "b485d96a-578c-47c7-bf9c-bd8b4781cefe",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          },
          {
            "id": "84219df5-23c1-4b0b-ab15-a36775167495",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          }
        ]
      },
      "deliveries": []
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/livrer`

§ 13 — livraison de tout le reste, avec bon de livraison facultatif (photo ou PDF).

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
| `carrier` | string | non | `null` accepté · max 120 car. |
| `revision` | integer | non | ≥ 1 |


**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Commande livrée",
  "data": {
    "order": {
      "id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
      "number": "BC-2026-00001",
      "buyer_company_id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
      "supplier_company_id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
      "partnership_id": "145d9d88-5dee-488e-8d17-41db80997dd8",
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
      "created_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
      "sent_at": "2026-10-21T12:35:01.657Z",
      "acknowledged_at": "2026-10-21T12:35:01.785Z",
      "validated_at": "2026-10-21T12:35:01.973Z",
      "preparation_at": "2026-10-21T12:35:02.036Z",
      "ready_at": "2026-10-21T12:35:02.097Z",
      "delivered_at": "2026-10-21T12:35:02.232Z",
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "deliveries_count": 1,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:01.524Z",
      "updated_at": "2026-10-21T12:35:02.248Z",
      "buyer": {
        "id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
        "name": "Restaurant Chez Fatou",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364180",
        "email": "admin.48e97d9cc6@test.sn",
        "ninea": "892499584",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
        "name": "Grossiste du Port",
        "legal_name": null,
        "city": null,
        "address": null,
        "phone": "+221778364181",
        "email": "grossiste.59bfd6cdd7@test.sn",
        "ninea": "261517215",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [],
      "current_version": {
        "id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T12:35:01.971Z",
        "decided_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
        "created_at": "2026-10-21T12:35:01.884Z",
        "lines": [
          {
            "id": "b485d96a-578c-47c7-bf9c-bd8b4781cefe",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 3,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          },
          {
            "id": "84219df5-23c1-4b0b-ab15-a36775167495",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 40,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          }
        ]
      },
      "validated_version": {
        "id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
        "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
        "version_no": 2,
        "proposed_by_side": "fournisseur",
        "proposed_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
        "status": "acceptee",
        "comment": "Plus d’ail cette semaine, 40 kg d’oignons seulement",
        "subtotal": 90000,
        "tax_total": 12960,
        "total": 102960,
        "lines_count": 3,
        "decided_at": "2026-10-21T12:35:01.971Z",
        "decided_by": "ffe873c0-8413-449b-bdd0-e4fcd3cc2ea0",
        "created_at": "2026-10-21T12:35:01.884Z",
        "lines": [
          {
            "id": "b485d96a-578c-47c7-bf9c-bd8b4781cefe",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 1,
            "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
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
            "base_unit_price": 24000,
            "discount_percent": 0,
            "delivered_quantity": 3,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          },
          {
            "id": "84219df5-23c1-4b0b-ab15-a36775167495",
            "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
            "version_id": "cb5c9162-548a-43d7-a62a-1e4b892f38d2",
            "line_no": 2,
            "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
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
            "base_unit_price": 450,
            "discount_percent": 0,
            "delivered_quantity": 40,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:01.887Z"
          }
        ]
      },
      "deliveries": [
        {
          "id": "fc7175c4-b612-460c-8b8f-ca6cab212cda",
          "number": "BL-2026-00001",
          "order_id": "e70172af-a9f7-4fb9-bc09-820379f8e3a2",
          "supplier_company_id": "660deee2-e9a1-4047-9c1f-8811fe95f3ae",
          "buyer_company_id": "aabe25a3-26e1-487d-9655-5198722d3eb3",
          "delivery_no": 1,
          "status": "expediee",
          "note": "Livré à 9 h",
          "carrier": null,
          "shipped_at": "2026-10-21T12:35:02.184Z",
          "document_id": "9c49110b-36be-4fa3-adf4-a0e5ecfc30e5",
          "received_at": null,
          "received_by": null,
          "reception_note": null,
          "with_reserves": false,
          "created_by": "78af5517-fe86-4d6b-88bc-ec3e7618dd4c",
          "created_at": "2026-10-21T12:35:02.184Z",
          "updated_at": "2026-10-21T12:35:02.222Z",
          "lines": [
            {
              "id": "094a020a-ae31-4c8d-8f0f-9fc1c29b8906",
              "delivery_id": "fc7175c4-b612-460c-8b8f-ca6cab212cda",
              "line_no": 1,
              "product_id": "9a0f191e-c533-48fd-a424-18e49d96b74f",
              "reference": "HUILE-20L",
              "name": "Huile 20 L",
              "unit": "piece",
              "quantity": 3,
              "received_quantity": null
            },
            {
              "id": "bdf84309-d453-474b-8c42-998fe8f29e47",
              "delivery_id": "fc7175c4-b612-460c-8b8f-ca6cab212cda",
              "line_no": 2,
              "product_id": "dbf8c7b4-ed6d-4201-b90e-cf6ea8873d8b",
              "reference": "OIGNON",
              "name": "Oignons",
              "unit": "kg",
              "quantity": 40,
              "received_quantity": null
            }
          ]
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/ventes/:id/livraisons`

Livraisons partielles successives (bons de livraison numérotés).

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `deliveries`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "deliveries": [
      {
        "id": "d70c9ec6-bd70-4093-8e1a-c59b08834942",
        "number": "BL-2026-00001",
        "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
        "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
        "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
        "delivery_no": 1,
        "status": "receptionnee",
        "note": null,
        "carrier": "Camion 12",
        "shipped_at": "2026-10-21T12:40:12.445Z",
        "document_id": null,
        "received_at": "2026-10-21T12:40:12.603Z",
        "received_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
        "reception_note": "Un sac percé",
        "with_reserves": true,
        "created_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
        "created_at": "2026-10-21T12:40:12.445Z",
        "updated_at": "2026-10-21T12:40:12.604Z",
        "lines": [
          {
            "id": "eaf3d616-81e4-4fc3-b588-1a7a3836aeea",
            "delivery_id": "d70c9ec6-bd70-4093-8e1a-c59b08834942",
            "line_no": 1,
            "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
            "reference": "REF-c87f18",
            "name": "Riz brisé ebd6",
            "unit": "sac",
            "quantity": 6,
            "received_quantity": 5
          }
        ]
      },
      {
        "id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
        "number": "BL-2026-00002",
        "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
        "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
        "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
        "delivery_no": 2,
        "status": "receptionnee",
        "note": null,
        "carrier": null,
        "shipped_at": "2026-10-21T12:40:12.826Z",
        "document_id": null,
        "received_at": "2026-10-21T12:40:13.077Z",
        "received_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
        "reception_note": null,
        "with_reserves": false,
        "created_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
        "created_at": "2026-10-21T12:40:12.826Z",
        "updated_at": "2026-10-21T12:40:13.077Z",
        "lines": [
          {
            "id": "68cf4605-1d84-4934-9e40-f0d6ea7c5456",
            "delivery_id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
            "line_no": 1,
            "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
            "reference": "REF-c87f18",
            "name": "Riz brisé ebd6",
            "unit": "sac",
            "quantity": 4,
            "received_quantity": 4
          },
          {
            "id": "b6483bfd-7a00-45ef-88b4-654229b14479",
            "delivery_id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
            "line_no": 2,
            "product_id": "13fe9edd-82c5-4626-9a76-3b0a16a6d185",
            "reference": "REF-cb2a1d",
            "name": "Riz brisé 5edd",
            "unit": "kg",
            "quantity": 4,
            "received_quantity": 4
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

#### `POST /api/v1/ventes/:id/livraisons`

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
| `lines` | tableau de object | non | min 1 élément(s) · max 500 élément(s) · sans doublon |
| `lines[].line_no` | integer | **oui** | ≥ 1 |
| `lines[].quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `note` | string | non | `null` accepté · max 1000 car. |
| `carrier` | string | non | `null` accepté · max 120 car. |
| `revision` | integer | non | ≥ 1 |


**Réponse 201 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Livraison enregistrée",
  "data": {
    "order": {
      "id": "bdf2a220-7181-4520-be27-aff15e7802be",
      "number": "BC-2026-00001",
      "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
      "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
      "partnership_id": "083ddf40-4d17-46eb-9283-c5bef3de02d1",
      "status": "livree",
      "revision": 7,
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
      "created_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
      "sent_at": "2026-10-21T12:40:12.169Z",
      "acknowledged_at": null,
      "validated_at": "2026-10-21T12:40:12.291Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": "2026-10-21T12:40:12.843Z",
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "deliveries_count": 2,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:40:12.032Z",
      "updated_at": "2026-10-21T12:40:12.883Z",
      "buyer": {
        "id": "398586f0-842f-4f3f-804f-191eb691067c",
        "name": "Société 18761c",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364352",
        "email": "admin.a4e3dff193@test.sn",
        "ninea": "359158260",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
        "name": "Société 94b998",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364353",
        "email": "admin.aff40f612c@test.sn",
        "ninea": "617083017",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [],
      "current_version": {
        "id": "d110d54c-22be-435d-bb75-6e457b36a311",
        "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:40:12.286Z",
        "decided_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
        "created_at": "2026-10-21T12:40:12.042Z",
        "lines": [
          {
            "id": "39b63380-fb55-4a89-b8cd-033df338b1df",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 1,
            "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
            "reference": "REF-c87f18",
            "name": "Riz brisé ebd6",
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
            "received_quantity": 5,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 10,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          },
          {
            "id": "78150364-5efc-4503-808b-98bc2b995281",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 2,
            "product_id": "13fe9edd-82c5-4626-9a76-3b0a16a6d185",
            "reference": "REF-cb2a1d",
            "name": "Riz brisé 5edd",
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
            "received_quantity": 0,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 4,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          }
        ]
      },
      "validated_version": {
        "id": "d110d54c-22be-435d-bb75-6e457b36a311",
        "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:40:12.286Z",
        "decided_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
        "created_at": "2026-10-21T12:40:12.042Z",
        "lines": [
          {
            "id": "39b63380-fb55-4a89-b8cd-033df338b1df",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 1,
            "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
            "reference": "REF-c87f18",
            "name": "Riz brisé ebd6",
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
            "received_quantity": 5,
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 10,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          },
          {
            "id": "78150364-5efc-4503-808b-98bc2b995281",
            "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
            "version_id": "d110d54c-22be-435d-bb75-6e457b36a311",
            "line_no": 2,
            "product_id": "13fe9edd-82c5-4626-9a76-3b0a16a6d185",
            "reference": "REF-cb2a1d",
            "name": "Riz brisé 5edd",
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
            "received_quantity": 0,
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 4,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:40:12.051Z"
          }
        ]
      },
      "deliveries": [
        {
          "id": "d70c9ec6-bd70-4093-8e1a-c59b08834942",
          "number": "BL-2026-00001",
          "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
          "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
          "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
          "delivery_no": 1,
          "status": "receptionnee",
          "note": null,
          "carrier": "Camion 12",
          "shipped_at": "2026-10-21T12:40:12.445Z",
          "document_id": null,
          "received_at": "2026-10-21T12:40:12.603Z",
          "received_by": "07449623-e647-4a28-8fa3-9056a54f16a9",
          "reception_note": "Un sac percé",
          "with_reserves": true,
          "created_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
          "created_at": "2026-10-21T12:40:12.445Z",
          "updated_at": "2026-10-21T12:40:12.604Z",
          "lines": [
            {
              "id": "eaf3d616-81e4-4fc3-b588-1a7a3836aeea",
              "delivery_id": "d70c9ec6-bd70-4093-8e1a-c59b08834942",
              "line_no": 1,
              "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
              "reference": "REF-c87f18",
              "name": "Riz brisé ebd6",
              "unit": "sac",
              "quantity": 6,
              "received_quantity": 5
            }
          ]
        },
        {
          "id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
          "number": "BL-2026-00002",
          "order_id": "bdf2a220-7181-4520-be27-aff15e7802be",
          "supplier_company_id": "0b7773b0-f1eb-4895-878a-96c95b0e8cc7",
          "buyer_company_id": "398586f0-842f-4f3f-804f-191eb691067c",
          "delivery_no": 2,
          "status": "expediee",
          "note": null,
          "carrier": null,
          "shipped_at": "2026-10-21T12:40:12.826Z",
          "document_id": null,
          "received_at": null,
          "received_by": null,
          "reception_note": null,
          "with_reserves": false,
          "created_by": "f3c6a211-d534-4474-ace6-280441bd4ef2",
          "created_at": "2026-10-21T12:40:12.826Z",
          "updated_at": "2026-10-21T12:40:12.826Z",
          "lines": [
            {
              "id": "68cf4605-1d84-4934-9e40-f0d6ea7c5456",
              "delivery_id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
              "line_no": 1,
              "product_id": "e3ed27da-95d2-4589-99c6-0a8cf33e21d9",
              "reference": "REF-c87f18",
              "name": "Riz brisé ebd6",
              "unit": "sac",
              "quantity": 4,
              "received_quantity": null
            },
            {
              "id": "b6483bfd-7a00-45ef-88b4-654229b14479",
              "delivery_id": "db74e78b-6aa5-4c7e-b682-ccb89b2a673a",
              "line_no": 2,
              "product_id": "13fe9edd-82c5-4626-9a76-3b0a16a6d185",
              "reference": "REF-cb2a1d",
              "name": "Riz brisé 5edd",
              "unit": "kg",
              "quantity": 4,
              "received_quantity": null
            }
          ]
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 409 `TRANSITION_INVALIDE` · 422 `DONNEES_INVALIDES` · 422 `LIVRAISON_INVALIDE`.

---

#### `POST /api/v1/ventes/:id/livraisons/:livraisonId/document`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.traiter`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative
- **Fichier :** champ `fichier` (**obligatoire**) — une image (JPEG, PNG, WebP) ou un PDF

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |
| `livraisonId` | string (uuid) | **oui** |  |


**Réponse 201 :** `data` contient `deliveries`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Bon de livraison joint",
  "data": {
    "deliveries": [
      {
        "id": "ec46e2e2-97df-49e6-95bf-ae4c83ed5029",
        "number": "BL-2026-00001",
        "order_id": "9f4c0f42-07dc-4298-9aa5-346938d6d55d",
        "supplier_company_id": "882fc070-ac6d-41c8-8edc-7c6f9979b2a8",
        "buyer_company_id": "11c65ba5-cfb4-452d-ac4b-6016ad21e475",
        "delivery_no": 1,
        "status": "expediee",
        "note": null,
        "carrier": null,
        "shipped_at": "2026-10-21T12:40:14.943Z",
        "document_id": "4aa88d19-c255-4254-b882-590da1c3b014",
        "received_at": null,
        "received_by": null,
        "reception_note": null,
        "with_reserves": false,
        "created_by": "ed8da53f-92f0-4490-83dd-ba2c04805d6e",
        "created_at": "2026-10-21T12:40:14.943Z",
        "updated_at": "2026-10-21T12:40:15.238Z",
        "lines": [
          {
            "id": "aca2beea-98ea-4d8f-a3c5-0539bad4a805",
            "delivery_id": "ec46e2e2-97df-49e6-95bf-ae4c83ed5029",
            "line_no": 1,
            "product_id": "1085a006-5538-4a45-8a2e-1f23573189d7",
            "reference": "REF-29ccef",
            "name": "Riz brisé 0908",
            "unit": "sac",
            "quantity": 6,
            "received_quantity": null
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

#### `GET /api/v1/ventes/:id/livraisons/:livraisonId/bon-de-livraison.pdf`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |
| `livraisonId` | string (uuid) | **oui** |  |


**Réponse 200 :** fichier `application/pdf` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/ventes/:id/solder-reliquat`

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
  "reason": "Fin de série"
}
```

</details>

**Réponse 200 :** `data` contient `order`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Reliquat soldé : le reste ne sera pas livré",
  "data": {
    "order": {
      "id": "e4b788af-8d30-4454-9218-a860198246c9",
      "number": "BC-2026-00001",
      "buyer_company_id": "4afa5048-f64c-49ec-98cd-6e0d631d960e",
      "supplier_company_id": "521b9f0b-d34a-4f14-a165-730efcbd29a6",
      "partnership_id": "fca2f761-d984-4859-a176-2079f19e9f0c",
      "status": "livree",
      "revision": 6,
      "current_version_no": 1,
      "validated_version_no": 1,
      "buyer_reference": null,
      "delivery_address": null,
      "requested_delivery_date": null,
      "conditions": null,
      "currency": "XOF",
      "subtotal": 12000,
      "tax_total": 0,
      "total": 12000,
      "lines_count": 1,
      "delivery_note": null,
      "reception_note": null,
      "reception_with_reserves": false,
      "cancellation_reason": null,
      "refusal_reason": null,
      "cancelled_by_side": null,
      "template_id": null,
      "created_by": "39b29388-849d-4bc5-ae18-3aab8fc58954",
      "sent_at": "2026-10-21T12:35:17.004Z",
      "acknowledged_at": null,
      "validated_at": "2026-10-21T12:35:17.081Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": "2026-10-21T12:35:17.341Z",
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": null,
      "deliveries_count": 1,
      "backorder_closed_at": "2026-10-21T12:35:17.339Z",
      "backorder_closed_by_side": "fournisseur",
      "backorder_close_reason": "Fin de série",
      "created_at": "2026-10-21T12:35:16.929Z",
      "updated_at": "2026-10-21T12:35:17.358Z",
      "buyer": {
        "id": "4afa5048-f64c-49ec-98cd-6e0d631d960e",
        "name": "Société bd765b",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364196",
        "email": "admin.591085e423@test.sn",
        "ninea": "391768079",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "521b9f0b-d34a-4f14-a165-730efcbd29a6",
        "name": "Société 741bc4",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221778364197",
        "email": "admin.ab499d2a53@test.sn",
        "ninea": "482015228",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [],
      "current_version": {
        "id": "227549fa-491e-486c-9d17-d1ee2d19f30e",
        "order_id": "e4b788af-8d30-4454-9218-a860198246c9",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "39b29388-849d-4bc5-ae18-3aab8fc58954",
        "status": "acceptee",
        "comment": null,
        "subtotal": 12000,
        "tax_total": 0,
        "total": 12000,
        "lines_count": 1,
        "decided_at": "2026-10-21T12:35:17.079Z",
        "decided_by": "28034812-412e-431d-b369-6cfd5bcebed4",
        "created_at": "2026-10-21T12:35:16.936Z",
        "lines": [
          {
            "id": "dbf5c9f1-30b9-4ab9-bd1d-5e3781848d96",
            "order_id": "e4b788af-8d30-4454-9218-a860198246c9",
            "version_id": "227549fa-491e-486c-9d17-d1ee2d19f30e",
            "line_no": 1,
            "product_id": "0387683a-2d1d-4a9b-8e43-8eeccbeec930",
            "reference": "REF-68460f",
            "name": "Riz brisé db0b",
            "unit": "sac",
            "quantity": 12,
            "unit_price": 1000,
            "tax_rate": 0,
            "line_subtotal": 12000,
            "line_tax": 0,
            "line_total": 12000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": 0,
            "base_unit_price": 1000,
            "discount_percent": 0,
            "delivered_quantity": 5,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:16.939Z"
          }
        ]
      },
      "validated_version": {
        "id": "227549fa-491e-486c-9d17-d1ee2d19f30e",
        "order_id": "e4b788af-8d30-4454-9218-a860198246c9",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "39b29388-849d-4bc5-ae18-3aab8fc58954",
        "status": "acceptee",
        "comment": null,
        "subtotal": 12000,
        "tax_total": 0,
        "total": 12000,
        "lines_count": 1,
        "decided_at": "2026-10-21T12:35:17.079Z",
        "decided_by": "28034812-412e-431d-b369-6cfd5bcebed4",
        "created_at": "2026-10-21T12:35:16.936Z",
        "lines": [
          {
            "id": "dbf5c9f1-30b9-4ab9-bd1d-5e3781848d96",
            "order_id": "e4b788af-8d30-4454-9218-a860198246c9",
            "version_id": "227549fa-491e-486c-9d17-d1ee2d19f30e",
            "line_no": 1,
            "product_id": "0387683a-2d1d-4a9b-8e43-8eeccbeec930",
            "reference": "REF-68460f",
            "name": "Riz brisé db0b",
            "unit": "sac",
            "quantity": 12,
            "unit_price": 1000,
            "tax_rate": 0,
            "line_subtotal": 12000,
            "line_tax": 0,
            "line_total": 12000,
            "change_type": "inchangee",
            "original_quantity": null,
            "original_unit_price": null,
            "substitute_for_line_no": null,
            "comment": null,
            "received_quantity": 0,
            "base_unit_price": 1000,
            "discount_percent": 0,
            "delivered_quantity": 5,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:16.939Z"
          }
        ]
      },
      "deliveries": [
        {
          "id": "7e4fb03b-8eda-4e4c-8796-f5f0ff8998af",
          "number": "BL-2026-00001",
          "order_id": "e4b788af-8d30-4454-9218-a860198246c9",
          "supplier_company_id": "521b9f0b-d34a-4f14-a165-730efcbd29a6",
          "buyer_company_id": "4afa5048-f64c-49ec-98cd-6e0d631d960e",
          "delivery_no": 1,
          "status": "expediee",
          "note": null,
          "carrier": null,
          "shipped_at": "2026-10-21T12:35:17.188Z",
          "document_id": null,
          "received_at": null,
          "received_by": null,
          "reception_note": null,
          "with_reserves": false,
          "created_by": "28034812-412e-431d-b369-6cfd5bcebed4",
          "created_at": "2026-10-21T12:35:17.189Z",
          "updated_at": "2026-10-21T12:35:17.189Z",
          "lines": [
            {
              "id": "a7634c12-9c85-48b5-ac3f-5e6383129627",
              "delivery_id": "7e4fb03b-8eda-4e4c-8796-f5f0ff8998af",
              "line_no": 1,
              "product_id": "0387683a-2d1d-4a9b-8e43-8eeccbeec930",
              "reference": "REF-68460f",
              "name": "Riz brisé db0b",
              "unit": "sac",
              "quantity": 5,
              "received_quantity": null
            }
          ]
        }
      ]
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
      "id": "eada48ab-741e-4ac9-865e-33a16b4a33c4",
      "number": "BC-2026-00001",
      "buyer_company_id": "3d43a6eb-8729-4cf5-9def-932cea2609ad",
      "supplier_company_id": "d1b54654-6574-49ca-a868-e5bc3f6ddd50",
      "partnership_id": "151396a4-bba0-4d9a-b425-90cfc0373e79",
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
      "created_by": "70206320-9666-4efb-97c9-d17dea3bc807",
      "sent_at": "2026-10-21T12:35:48.358Z",
      "acknowledged_at": null,
      "validated_at": "2026-10-21T12:35:48.504Z",
      "preparation_at": null,
      "ready_at": null,
      "delivered_at": null,
      "received_at": null,
      "invoiced_at": null,
      "completed_at": null,
      "refused_at": null,
      "cancelled_at": "2026-10-21T12:35:48.629Z",
      "deliveries_count": 0,
      "backorder_closed_at": null,
      "backorder_closed_by_side": null,
      "backorder_close_reason": null,
      "created_at": "2026-10-21T12:35:48.215Z",
      "updated_at": "2026-10-21T12:35:48.682Z",
      "buyer": {
        "id": "3d43a6eb-8729-4cf5-9def-932cea2609ad",
        "name": "Société 68422a",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563316",
        "email": "admin.a214c481b2@test.sn",
        "ninea": "885163151",
        "rccm": null,
        "logo_document_id": null
      },
      "supplier": {
        "id": "d1b54654-6574-49ca-a868-e5bc3f6ddd50",
        "name": "Société 658f80",
        "legal_name": null,
        "city": "Dakar",
        "address": null,
        "phone": "+221776563317",
        "email": "admin.dbe2a237e5@test.sn",
        "ninea": "338814506",
        "rccm": null,
        "logo_document_id": null
      },
      "invoice": null,
      "side": "fournisseur",
      "actions": [],
      "current_version": {
        "id": "b25e6569-24f0-4bad-93d7-54d2b5a12b64",
        "order_id": "eada48ab-741e-4ac9-865e-33a16b4a33c4",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "70206320-9666-4efb-97c9-d17dea3bc807",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:35:48.499Z",
        "decided_by": "a57bd4f1-ec9b-451c-b94c-6c2acc220c27",
        "created_at": "2026-10-21T12:35:48.225Z",
        "lines": [
          {
            "id": "75bfd4c5-9a58-45a3-9981-62c14c34708d",
            "order_id": "eada48ab-741e-4ac9-865e-33a16b4a33c4",
            "version_id": "b25e6569-24f0-4bad-93d7-54d2b5a12b64",
            "line_no": 1,
            "product_id": "f8476dc4-4ee4-4ef5-9b79-c597cef97040",
            "reference": "REF-2f9557",
            "name": "Riz brisé 98b4",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:48.230Z"
          },
          {
            "id": "daa90cf4-f3b8-49c2-b656-c89bae11ccac",
            "order_id": "eada48ab-741e-4ac9-865e-33a16b4a33c4",
            "version_id": "b25e6569-24f0-4bad-93d7-54d2b5a12b64",
            "line_no": 2,
            "product_id": "56ef872c-43ff-4eb0-aa7f-3dfdabfd41a6",
            "reference": "REF-7c697a",
            "name": "Riz brisé ecaa",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:48.230Z"
          }
        ]
      },
      "validated_version": {
        "id": "b25e6569-24f0-4bad-93d7-54d2b5a12b64",
        "order_id": "eada48ab-741e-4ac9-865e-33a16b4a33c4",
        "version_no": 1,
        "proposed_by_side": "acheteur",
        "proposed_by": "70206320-9666-4efb-97c9-d17dea3bc807",
        "status": "acceptee",
        "comment": null,
        "subtotal": 160000,
        "tax_total": 27000,
        "total": 187000,
        "lines_count": 2,
        "decided_at": "2026-10-21T12:35:48.499Z",
        "decided_by": "a57bd4f1-ec9b-451c-b94c-6c2acc220c27",
        "created_at": "2026-10-21T12:35:48.225Z",
        "lines": [
          {
            "id": "75bfd4c5-9a58-45a3-9981-62c14c34708d",
            "order_id": "eada48ab-741e-4ac9-865e-33a16b4a33c4",
            "version_id": "b25e6569-24f0-4bad-93d7-54d2b5a12b64",
            "line_no": 1,
            "product_id": "f8476dc4-4ee4-4ef5-9b79-c597cef97040",
            "reference": "REF-2f9557",
            "name": "Riz brisé 98b4",
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
            "base_unit_price": 15000,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:48.230Z"
          },
          {
            "id": "daa90cf4-f3b8-49c2-b656-c89bae11ccac",
            "order_id": "eada48ab-741e-4ac9-865e-33a16b4a33c4",
            "version_id": "b25e6569-24f0-4bad-93d7-54d2b5a12b64",
            "line_no": 2,
            "product_id": "56ef872c-43ff-4eb0-aa7f-3dfdabfd41a6",
            "reference": "REF-7c697a",
            "name": "Riz brisé ecaa",
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
            "base_unit_price": 2500,
            "discount_percent": 0,
            "delivered_quantity": 0,
            "stock_reserved": 0,
            "created_at": "2026-10-21T12:35:48.230Z"
          }
        ]
      },
      "deliveries": []
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
      "id": 39,
      "order_id": "5612022f-ecb6-44ba-89c4-57f8178b438c",
      "type": "commentaire",
      "from_status": null,
      "to_status": null,
      "version_no": null,
      "actor_user_id": "c03a3bc9-7d0d-4463-b68f-1c1b35566d06",
      "actor_company_id": "8d79cb42-4bb4-489b-a4b1-bb72dad840cd",
      "actor_side": "fournisseur",
      "message": "Livraison possible jeudi ?",
      "details": null,
      "created_at": "2026-10-21T12:34:51.400Z"
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
      "id": "d323714e-3080-4774-b3e6-0b33a4d940ec",
      "company_id": "6536e10d-a100-4d66-b2b8-a9d648208b23",
      "category": "piece_jointe",
      "visibility": "partenaire",
      "mime_type": "application/pdf",
      "size_bytes": 69,
      "original_name": "fiche-technique.pdf",
      "has_thumbnail": false,
      "created_at": "2026-10-21T12:36:14.448Z",
      "url": "/api/v1/documents/d323714e-3080-4774-b3e6-0b33a4d940ec/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 18. Factures

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/factures` | membre d’une entreprise active |
| POST | `/api/v1/factures` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/factures/:id` | membre d’une entreprise active |
| GET | `/api/v1/factures/:id/pdf` | membre d’une entreprise active |
| POST | `/api/v1/factures/:id/annuler` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/factures/:id/accepter-ecart` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/factures/:id/contester` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/factures/:id/relances` | membre d’une entreprise active |
| POST | `/api/v1/factures/:id/relancer` | membre d’une entreprise active — entreprise fournisseur ou mixte |

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
| `bloquees` | boolean | non |  |
| `q` | string | non | max 100 car. |
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `modifie_depuis` | date | non |  |
| `tri` | string | non | valeurs : `issue_date`, `-issue_date`, `due_date`, `-due_date`, `total`, `-total`, `number`, `-number`, `created_at`, `-created_at` |


Exemple de query string réelle : `?bloquees=true`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `number`, `supplier_company_id`, `buyer_company_id`, `partnership_id`, `order_id`, `status`, `source`, `issue_date`, `due_date`, `currency`, `subtotal`, `tax_total`, `total`, `amount_paid`, `template_id`, `file_document_id`, `note`, `due_soon_notified_at`, `overdue_notified_at`, `cancelled_at`, `cancellation_reason`, `amount_credited`, `match_status`, `match_details`, `match_decided_at`, `match_decided_by`, `match_comment`, `reminders_count`, `last_reminder_at`, `created_by`, `created_at`, `updated_at`, `supplier`, `buyer`, `order`, `direction`, `balance_due`, `payment_blocked`, `pdf_url`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "4cd6050a-072d-4048-939f-29d11d8763d0",
        "number": "FAC-2026-00001",
        "supplier_company_id": "c4895284-6be7-4339-85a5-f6605caac560",
        "buyer_company_id": "ed76075e-5692-4aa1-a4ac-82cfbed99496",
        "partnership_id": "e14ac02d-b6e0-4575-af5e-21b725f27925",
        "order_id": "e6b358db-53c0-4d83-8a32-a16439bf897a",
        "status": "emise",
        "source": "generee",
        "issue_date": "2026-10-21",
        "due_date": "2026-11-20",
        "currency": "XOF",
        "subtotal": 170000,
        "tax_total": 28800,
        "total": 198800,
        "amount_paid": 0,
        "template_id": null,
        "file_document_id": null,
        "note": null,
        "due_soon_notified_at": null,
        "overdue_notified_at": null,
        "cancelled_at": null,
        "cancellation_reason": null,
        "amount_credited": 0,
        "match_status": "ecart",
        "match_details": {
          "ecarts": [
            {
              "name": "Riz brisé 549b",
              "type": "prix",
              "attendu": 15000,
              "facture": 16000,
              "line_no": 1
            }
          ],
          "declared_total": null,
          "expected_total": 187000,
          "invoiced_total": 198800,
          "tolerance_percent": 2
        },
        "match_decided_at": null,
        "match_decided_by": null,
        "match_comment": null,
        "reminders_count": 0,
        "last_reminder_at": null,
        "created_by": "31e1158f-9b3f-4e9e-9759-ff7071f319c4",
        "created_at": "2026-10-21T12:34:58.793Z",
        "updated_at": "2026-10-21T12:34:58.793Z",
        "supplier": {
          "id": "c4895284-6be7-4339-85a5-f6605caac560",
          "name": "Société 5ae297",
          "city": "Dakar",
          "logo_document_id": null
        },
        "buyer": {
          "id": "ed76075e-5692-4aa1-a4ac-82cfbed99496",
          "name": "Société 3c8faf",
          "city": "Dakar",
          "logo_document_id": null
        },
        "order": {
          "id": "e6b358db-53c0-4d83-8a32-a16439bf897a",
          "number": "BC-2026-00001",
          "buyer_reference": null,
          "status": "facturee"
        },
        "direction": "recue",
        "balance_due": 198800,
        "payment_blocked": true,
        "pdf_url": "/api/v1/factures/4cd6050a-072d-4048-939f-29d11d8763d0/pdf"
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
| `lines` | tableau de object ou string | non |  |
| `declared_total` | integer | non | ≥ 0 · ≤ 1000000000000 |


**Réponse 201 :** `data` contient `invoice`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Facture émise avec un écart de rapprochement : son paiement attend la validation du client",
  "data": {
    "invoice": {
      "id": "dd241baf-0d46-4817-b17e-06a4e7286c2e",
      "number": "FAC-2026-00001",
      "supplier_company_id": "a431831c-e079-4ff4-bc34-59bcebc8c1e1",
      "buyer_company_id": "3fc78440-f4bd-4583-8bc0-d7f8d37780c7",
      "partnership_id": "3690e444-7f66-4dd6-8c86-6452b2c947fb",
      "order_id": "25140126-87a1-4658-bac2-75f5196f9a1e",
      "status": "emise",
      "source": "importee",
      "issue_date": "2026-10-21",
      "due_date": "2026-11-20",
      "currency": "XOF",
      "subtotal": 160000,
      "tax_total": 27000,
      "total": 187000,
      "amount_paid": 0,
      "template_id": null,
      "file_document_id": "cd06d489-e31c-4419-91f3-869147656365",
      "note": null,
      "due_soon_notified_at": null,
      "overdue_notified_at": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "amount_credited": 0,
      "match_status": "ecart",
      "match_details": {
        "ecarts": [
          {
            "type": "total_document",
            "attendu": 187000,
            "facture": 195000
          }
        ],
        "declared_total": 195000,
        "expected_total": 187000,
        "invoiced_total": 187000,
        "tolerance_percent": 2
      },
      "match_decided_at": null,
      "match_decided_by": null,
      "match_comment": null,
      "reminders_count": 0,
      "last_reminder_at": null,
      "created_by": "f2e9b1a2-42c5-40a0-b3ed-9aa2fa5032d8",
      "created_at": "2026-10-21T12:34:57.045Z",
      "updated_at": "2026-10-21T12:34:57.045Z",
      "supplier": {
        "id": "a431831c-e079-4ff4-bc34-59bcebc8c1e1",
        "name": "Société c4d0fb",
        "city": "Dakar",
        "logo_document_id": null
      },
      "buyer": {
        "id": "3fc78440-f4bd-4583-8bc0-d7f8d37780c7",
        "name": "Société 8eed9d",
        "city": "Dakar",
        "logo_document_id": null
      },
      "order": {
        "id": "25140126-87a1-4658-bac2-75f5196f9a1e",
        "number": "BC-2026-00001",
        "buyer_reference": null,
        "status": "facturee"
      },
      "lines": [
        {
          "id": "7400d9bf-4d3b-43d8-84a2-ebc0fb4464ed",
          "invoice_id": "dd241baf-0d46-4817-b17e-06a4e7286c2e",
          "line_no": 1,
          "product_id": "89a52415-30f4-4901-9a13-c90d1b172d3c",
          "reference": "REF-4d7330",
          "name": "Riz brisé 0392",
          "unit": "sac",
          "quantity": 10,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 150000,
          "line_tax": 27000,
          "line_total": 177000
        },
        {
          "id": "ea72cf76-5090-411b-96c5-ec34edd3139a",
          "invoice_id": "dd241baf-0d46-4817-b17e-06a4e7286c2e",
          "line_no": 2,
          "product_id": "5fcbc703-6593-4d1f-8be1-d55c28260311",
          "reference": "REF-348dea",
          "name": "Riz brisé f1bf",
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
      "balance_due": 187000,
      "payment_blocked": true,
      "pdf_url": "/api/v1/factures/dd241baf-0d46-4817-b17e-06a4e7286c2e/pdf",
      "allocations": [],
      "file": {
        "id": "cd06d489-e31c-4419-91f3-869147656365",
        "company_id": "a431831c-e079-4ff4-bc34-59bcebc8c1e1",
        "category": "facture",
        "visibility": "partenaire",
        "mime_type": "application/pdf",
        "size_bytes": 69,
        "original_name": "facture.pdf",
        "has_thumbnail": false,
        "created_at": "2026-10-21T12:34:57.025Z",
        "url": "/api/v1/documents/cd06d489-e31c-4419-91f3-869147656365/fichier"
      }
    }
  }
}
```

</details>

**Erreurs observées :** 403 `PERMISSION_REFUSEE` · 403 `PROFIL_ENTREPRISE_INCOMPATIBLE` · 409 `COMMANDE_NON_FACTURABLE` · 422 `DONNEES_INVALIDES` · 422 `LIGNES_INVALIDES`.

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
      "id": "b79719e5-4a4f-441b-84eb-39f86a54b0e2",
      "number": "FAC-2026-00001",
      "supplier_company_id": "5e872da6-c8b6-4150-bb9d-6bd3bf26b87d",
      "buyer_company_id": "b2bbae95-e2ea-4d1a-8640-7f36185ede46",
      "partnership_id": "cfa703c0-c82c-4975-8f3e-d0c108b1aa96",
      "order_id": "f073988d-41a4-4fd4-b3ec-a7d792aa7642",
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
      "amount_credited": 0,
      "match_status": "conforme",
      "match_details": {
        "ecarts": [],
        "declared_total": null,
        "expected_total": 187000,
        "invoiced_total": 187000,
        "tolerance_percent": 2
      },
      "match_decided_at": null,
      "match_decided_by": null,
      "match_comment": null,
      "reminders_count": 0,
      "last_reminder_at": null,
      "created_by": "ea085788-7526-4bef-a32e-b01572ee2663",
      "created_at": "2026-10-21T12:34:49.790Z",
      "updated_at": "2026-10-21T12:34:49.974Z",
      "supplier": {
        "id": "5e872da6-c8b6-4150-bb9d-6bd3bf26b87d",
        "name": "Société 7d2a29",
        "city": "Dakar",
        "logo_document_id": null
      },
      "buyer": {
        "id": "b2bbae95-e2ea-4d1a-8640-7f36185ede46",
        "name": "Société 4f405c",
        "city": "Dakar",
        "logo_document_id": null
      },
      "order": {
        "id": "f073988d-41a4-4fd4-b3ec-a7d792aa7642",
        "number": "BC-2026-00001",
        "buyer_reference": null,
        "status": "terminee"
      },
      "lines": [
        {
          "id": "5d16fb0a-e75a-4925-aad1-c018833de779",
          "invoice_id": "b79719e5-4a4f-441b-84eb-39f86a54b0e2",
          "line_no": 1,
          "product_id": "099c80c3-3582-4694-b641-df148575470c",
          "reference": "REF-72e787",
          "name": "Riz brisé f708",
          "unit": "sac",
          "quantity": 10,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 150000,
          "line_tax": 27000,
          "line_total": 177000
        },
        {
          "id": "d75f0d0a-b891-42ad-ba84-bd38fae6ce5d",
          "invoice_id": "b79719e5-4a4f-441b-84eb-39f86a54b0e2",
          "line_no": 2,
          "product_id": "97651759-ae99-4f51-8883-abedab7ce574",
          "reference": "REF-d07ff0",
          "name": "Riz brisé 41ec",
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
      "payment_blocked": false,
      "pdf_url": "/api/v1/factures/b79719e5-4a4f-441b-84eb-39f86a54b0e2/pdf",
      "allocations": [
        {
          "id": "f8167c45-109f-4bee-ac19-a347d1f121ce",
          "payment_id": "54758df6-ae19-437f-aa11-353e47de1246",
          "invoice_id": "b79719e5-4a4f-441b-84eb-39f86a54b0e2",
          "amount": 100000,
          "cancelled_at": null,
          "created_at": "2026-10-21T12:34:49.882Z",
          "payment": {
            "id": "54758df6-ae19-437f-aa11-353e47de1246",
            "reference": "PAI-2026-00001",
            "method": "wave",
            "paid_on": "2026-10-21",
            "status": "confirme",
            "amount": 100000
          }
        },
        {
          "id": "c2a41821-2959-47d3-b6a6-a3ff4df61aa5",
          "payment_id": "fe0a2769-e931-43f2-9b38-f1de9f8c8bfc",
          "invoice_id": "b79719e5-4a4f-441b-84eb-39f86a54b0e2",
          "amount": 87000,
          "cancelled_at": null,
          "created_at": "2026-10-21T12:34:49.967Z",
          "payment": {
            "id": "fe0a2769-e931-43f2-9b38-f1de9f8c8bfc",
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
  "reason": "Quantité corrigée"
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
      "id": "e6e2f5bc-0a71-4d46-8445-edbdf04c6ac4",
      "number": "FAC-2026-00002",
      "supplier_company_id": "2e3cbd7f-71a6-4a75-ae28-22c52fd1e639",
      "buyer_company_id": "3befb649-a868-4b1d-9e7b-126edfbc8ef7",
      "partnership_id": "367de2dd-f5a9-47c2-bfef-a62815ab00f3",
      "order_id": "d6e357ff-9c70-4a57-b886-460cb30904fe",
      "status": "annulee",
      "source": "generee",
      "issue_date": "2026-10-21",
      "due_date": "2026-11-20",
      "currency": "XOF",
      "subtotal": 190000,
      "tax_total": 32400,
      "total": 222400,
      "amount_paid": 0,
      "template_id": null,
      "file_document_id": null,
      "note": null,
      "due_soon_notified_at": null,
      "overdue_notified_at": null,
      "cancelled_at": "2026-10-21T12:35:00.935Z",
      "cancellation_reason": "Quantité corrigée",
      "amount_credited": 0,
      "match_status": "conteste",
      "match_details": {
        "ecarts": [
          {
            "name": "Riz brisé 7cbc",
            "type": "quantite",
            "attendu": 10,
            "facture": 12,
            "line_no": 1
          }
        ],
        "declared_total": null,
        "expected_total": 187000,
        "invoiced_total": 222400,
        "tolerance_percent": 2
      },
      "match_decided_at": "2026-10-21T12:35:00.881Z",
      "match_decided_by": "bc1503bf-4549-4a1e-9043-61021275e6f7",
      "match_comment": "Nous avons reçu 10 sacs",
      "reminders_count": 0,
      "last_reminder_at": null,
      "created_by": "d2877309-f8cd-467a-932c-3c9b5432bee1",
      "created_at": "2026-10-21T12:35:00.806Z",
      "updated_at": "2026-10-21T12:35:00.935Z",
      "supplier": {
        "id": "2e3cbd7f-71a6-4a75-ae28-22c52fd1e639",
        "name": "Société 96beb7",
        "city": "Dakar",
        "logo_document_id": null
      },
      "buyer": {
        "id": "3befb649-a868-4b1d-9e7b-126edfbc8ef7",
        "name": "Société bfe3c3",
        "city": "Dakar",
        "logo_document_id": null
      },
      "order": {
        "id": "d6e357ff-9c70-4a57-b886-460cb30904fe",
        "number": "BC-2026-00002",
        "buyer_reference": null,
        "status": "reception_confirmee"
      },
      "lines": [
        {
          "id": "53bd4507-f126-42e9-8f38-b3d392e3ac3e",
          "invoice_id": "e6e2f5bc-0a71-4d46-8445-edbdf04c6ac4",
          "line_no": 1,
          "product_id": "d742bdfd-d1dc-4564-ad71-6eb219d21add",
          "reference": "REF-8ed2ad",
          "name": "Riz brisé 7cbc",
          "unit": "sac",
          "quantity": 12,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 180000,
          "line_tax": 32400,
          "line_total": 212400
        },
        {
          "id": "9e054056-7736-49c5-8971-93a14a86ca53",
          "invoice_id": "e6e2f5bc-0a71-4d46-8445-edbdf04c6ac4",
          "line_no": 2,
          "product_id": "d5f22675-1d48-42f2-abec-ec469816d55f",
          "reference": "REF-8e5d5a",
          "name": "Riz brisé fa7a",
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
      "payment_blocked": false,
      "pdf_url": "/api/v1/factures/e6e2f5bc-0a71-4d46-8445-edbdf04c6ac4/pdf",
      "allocations": [],
      "file": null
    }
  }
}
```

</details>

**Erreurs observées :** 409 `FACTURE_PAYEE` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/factures/:id/accepter-ecart`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `paiements.enregistrer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `comment` | string | non | `null` accepté · max 1000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "comment": "Hausse convenue par téléphone"
}
```

</details>

**Réponse 200 :** `data` contient `invoice`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Écart accepté : la facture est payable",
  "data": {
    "invoice": {
      "id": "4cd6050a-072d-4048-939f-29d11d8763d0",
      "number": "FAC-2026-00001",
      "supplier_company_id": "c4895284-6be7-4339-85a5-f6605caac560",
      "buyer_company_id": "ed76075e-5692-4aa1-a4ac-82cfbed99496",
      "partnership_id": "e14ac02d-b6e0-4575-af5e-21b725f27925",
      "order_id": "e6b358db-53c0-4d83-8a32-a16439bf897a",
      "status": "partiellement_payee",
      "source": "generee",
      "issue_date": "2026-10-21",
      "due_date": "2026-11-20",
      "currency": "XOF",
      "subtotal": 170000,
      "tax_total": 28800,
      "total": 198800,
      "amount_paid": 50000,
      "template_id": null,
      "file_document_id": null,
      "note": null,
      "due_soon_notified_at": null,
      "overdue_notified_at": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "amount_credited": 0,
      "match_status": "accepte",
      "match_details": {
        "ecarts": [
          {
            "name": "Riz brisé 549b",
            "type": "prix",
            "attendu": 15000,
            "facture": 16000,
            "line_no": 1
          }
        ],
        "declared_total": null,
        "expected_total": 187000,
        "invoiced_total": 198800,
        "tolerance_percent": 2
      },
      "match_decided_at": "2026-10-21T12:34:59.246Z",
      "match_decided_by": "b935ef23-7f25-4a79-981e-d26597ce4fed",
      "match_comment": "Hausse convenue par téléphone",
      "reminders_count": 0,
      "last_reminder_at": null,
      "created_by": "31e1158f-9b3f-4e9e-9759-ff7071f319c4",
      "created_at": "2026-10-21T12:34:58.793Z",
      "updated_at": "2026-10-21T12:34:59.306Z",
      "supplier": {
        "id": "c4895284-6be7-4339-85a5-f6605caac560",
        "name": "Société 5ae297",
        "city": "Dakar",
        "logo_document_id": null
      },
      "buyer": {
        "id": "ed76075e-5692-4aa1-a4ac-82cfbed99496",
        "name": "Société 3c8faf",
        "city": "Dakar",
        "logo_document_id": null
      },
      "order": {
        "id": "e6b358db-53c0-4d83-8a32-a16439bf897a",
        "number": "BC-2026-00001",
        "buyer_reference": null,
        "status": "facturee"
      },
      "lines": [
        {
          "id": "fb8866b1-f09b-4b5b-8fa8-a80c36a32e37",
          "invoice_id": "4cd6050a-072d-4048-939f-29d11d8763d0",
          "line_no": 1,
          "product_id": "3ee23ca1-4019-4fcc-9ae9-25ef07ea0586",
          "reference": "REF-f59692",
          "name": "Riz brisé 549b",
          "unit": "sac",
          "quantity": 10,
          "unit_price": 16000,
          "tax_rate": 18,
          "line_subtotal": 160000,
          "line_tax": 28800,
          "line_total": 188800
        },
        {
          "id": "c40e791c-69d4-46bd-941e-446bad38feeb",
          "invoice_id": "4cd6050a-072d-4048-939f-29d11d8763d0",
          "line_no": 2,
          "product_id": "6b3e4a04-443c-4391-ba24-7ca014d27ede",
          "reference": "REF-83902f",
          "name": "Riz brisé 27f5",
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
      "balance_due": 148800,
      "payment_blocked": false,
      "pdf_url": "/api/v1/factures/4cd6050a-072d-4048-939f-29d11d8763d0/pdf",
      "allocations": [
        {
          "id": "52ab7c02-7b06-4815-8b9b-57a62fc4c101",
          "payment_id": "cd391c4f-27b5-49f1-942f-1b6050f52daf",
          "invoice_id": "4cd6050a-072d-4048-939f-29d11d8763d0",
          "amount": 50000,
          "cancelled_at": null,
          "created_at": "2026-10-21T12:34:59.267Z",
          "payment": {
            "id": "cd391c4f-27b5-49f1-942f-1b6050f52daf",
            "reference": "PAI-2026-00001",
            "method": "virement",
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

**Erreurs observées :** 403 `PROFIL_ENTREPRISE_INCOMPATIBLE` · 409 `AUCUN_ECART` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/factures/:id/contester`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `paiements.enregistrer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `comment` | string | **oui** | min 3 car. · max 1000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "comment": "Nous avons reçu 10 sacs"
}
```

</details>

**Réponse 200 :** `data` contient `invoice`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Facture contestée : le fournisseur est averti",
  "data": {
    "invoice": {
      "id": "e6e2f5bc-0a71-4d46-8445-edbdf04c6ac4",
      "number": "FAC-2026-00002",
      "supplier_company_id": "2e3cbd7f-71a6-4a75-ae28-22c52fd1e639",
      "buyer_company_id": "3befb649-a868-4b1d-9e7b-126edfbc8ef7",
      "partnership_id": "367de2dd-f5a9-47c2-bfef-a62815ab00f3",
      "order_id": "d6e357ff-9c70-4a57-b886-460cb30904fe",
      "status": "emise",
      "source": "generee",
      "issue_date": "2026-10-21",
      "due_date": "2026-11-20",
      "currency": "XOF",
      "subtotal": 190000,
      "tax_total": 32400,
      "total": 222400,
      "amount_paid": 0,
      "template_id": null,
      "file_document_id": null,
      "note": null,
      "due_soon_notified_at": null,
      "overdue_notified_at": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "amount_credited": 0,
      "match_status": "conteste",
      "match_details": {
        "ecarts": [
          {
            "name": "Riz brisé 7cbc",
            "type": "quantite",
            "attendu": 10,
            "facture": 12,
            "line_no": 1
          }
        ],
        "declared_total": null,
        "expected_total": 187000,
        "invoiced_total": 222400,
        "tolerance_percent": 2
      },
      "match_decided_at": "2026-10-21T12:35:00.881Z",
      "match_decided_by": "bc1503bf-4549-4a1e-9043-61021275e6f7",
      "match_comment": "Nous avons reçu 10 sacs",
      "reminders_count": 0,
      "last_reminder_at": null,
      "created_by": "d2877309-f8cd-467a-932c-3c9b5432bee1",
      "created_at": "2026-10-21T12:35:00.806Z",
      "updated_at": "2026-10-21T12:35:00.881Z",
      "supplier": {
        "id": "2e3cbd7f-71a6-4a75-ae28-22c52fd1e639",
        "name": "Société 96beb7",
        "city": "Dakar",
        "logo_document_id": null
      },
      "buyer": {
        "id": "3befb649-a868-4b1d-9e7b-126edfbc8ef7",
        "name": "Société bfe3c3",
        "city": "Dakar",
        "logo_document_id": null
      },
      "order": {
        "id": "d6e357ff-9c70-4a57-b886-460cb30904fe",
        "number": "BC-2026-00002",
        "buyer_reference": null,
        "status": "facturee"
      },
      "lines": [
        {
          "id": "53bd4507-f126-42e9-8f38-b3d392e3ac3e",
          "invoice_id": "e6e2f5bc-0a71-4d46-8445-edbdf04c6ac4",
          "line_no": 1,
          "product_id": "d742bdfd-d1dc-4564-ad71-6eb219d21add",
          "reference": "REF-8ed2ad",
          "name": "Riz brisé 7cbc",
          "unit": "sac",
          "quantity": 12,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 180000,
          "line_tax": 32400,
          "line_total": 212400
        },
        {
          "id": "9e054056-7736-49c5-8971-93a14a86ca53",
          "invoice_id": "e6e2f5bc-0a71-4d46-8445-edbdf04c6ac4",
          "line_no": 2,
          "product_id": "d5f22675-1d48-42f2-abec-ec469816d55f",
          "reference": "REF-8e5d5a",
          "name": "Riz brisé fa7a",
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
      "balance_due": 222400,
      "payment_blocked": true,
      "pdf_url": "/api/v1/factures/e6e2f5bc-0a71-4d46-8445-edbdf04c6ac4/pdf",
      "allocations": [],
      "file": null
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/factures/:id/relances`

Relances des impayés : historique (deux parties), relance manuelle (fournisseur).

- **Accès :** membre d’une entreprise active — permission `factures.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `reminders_count`, `last_reminder_at`, `reminders`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "reminders_count": 2,
    "last_reminder_at": "2026-10-21T12:35:03.486Z",
    "reminders": [
      {
        "id": 2,
        "invoice_id": "cd0caaff-4cdb-4558-9cfb-dd603c004eb7",
        "level": 3,
        "channel": "auto",
        "days_overdue": 16,
        "amount_due": 187000,
        "emailed": true,
        "sent_by": null,
        "created_at": "2026-10-21T12:35:03.487Z"
      },
      {
        "id": 1,
        "invoice_id": "cd0caaff-4cdb-4558-9cfb-dd603c004eb7",
        "level": 2,
        "channel": "auto",
        "days_overdue": 8,
        "amount_due": 187000,
        "emailed": true,
        "sent_by": null,
        "created_at": "2026-10-21T12:35:03.459Z"
      }
    ]
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/factures/:id/relancer`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `factures.emettre`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête :** aucun (envoyer `{}` ou rien).

**Réponse 201 :** `data` contient `reminders_count`, `last_reminder_at`, `reminders`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Relance envoyée au client",
  "data": {
    "reminders_count": 1,
    "last_reminder_at": "2026-10-21T12:35:04.948Z",
    "reminders": [
      {
        "id": 3,
        "invoice_id": "3b2d27b7-51fe-46aa-87bd-2dbd726ac23a",
        "level": 0,
        "channel": "manuel",
        "days_overdue": 0,
        "amount_due": 187000,
        "emailed": true,
        "sent_by": "fbd1c087-33b9-450c-aaca-e02e9c54b939",
        "created_at": "2026-10-21T12:35:04.953Z"
      }
    ]
  }
}
```

</details>

**Erreurs observées :** 403 `PROFIL_ENTREPRISE_INCOMPATIBLE` · 409 `FACTURE_BLOQUEE` · 409 `RELANCE_RECENTE` · 422 `DONNEES_INVALIDES`.

---

## 19. Avoirs

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/avoirs` | membre d’une entreprise active |
| POST | `/api/v1/avoirs` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| GET | `/api/v1/avoirs/:id` | membre d’une entreprise active |
| GET | `/api/v1/avoirs/:id/pdf` | membre d’une entreprise active |
| POST | `/api/v1/avoirs/:id/annuler` | membre d’une entreprise active — entreprise fournisseur ou mixte |

#### `GET /api/v1/avoirs`

- **Accès :** membre d’une entreprise active — permission `factures.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `sens` | string | non | valeurs : `emis`, `recus` |
| `status` | string | non | valeurs : `emis`, `annule` |
| `partner_id` | string (uuid) | non |  |
| `invoice_id` | string (uuid) | non |  |
| `q` | string | non | max 100 car. |
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `tri` | string | non | valeurs : `issue_date`, `-issue_date`, `total`, `-total`, `number`, `-number`, `created_at`, `-created_at` |


Exemple de query string réelle : `?sens=recus`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `number`, `supplier_company_id`, `buyer_company_id`, `partnership_id`, `order_id`, `invoice_id`, `claim_id`, `status`, `issue_date`, `reason`, `subtotal`, `tax_total`, `total`, `amount_allocated`, `template_id`, `created_by`, `cancelled_at`, `cancellation_reason`, `created_at`, `updated_at`, `supplier`, `buyer`, `order`, `invoice`, `direction`, `unallocated_amount`, `pdf_url`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "47a34dcf-a5e2-49ef-bb62-704f694ab131",
        "number": "AV-2026-00001",
        "supplier_company_id": "ce2b7866-4e66-4282-aab1-eecb93736954",
        "buyer_company_id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
        "partnership_id": "1eca8550-5106-49bf-8621-b425f3dea87d",
        "order_id": "4812125f-6813-4620-9f81-573589cbe79b",
        "invoice_id": "59649210-a2e8-43dd-86e1-837291d50640",
        "claim_id": "a7be2620-4ef6-480d-9491-a15326876a92",
        "status": "emis",
        "issue_date": "2026-10-21",
        "reason": "Litige LIT-2026-00001 — Deux sacs déchirés à l’arrivée",
        "subtotal": 30000,
        "tax_total": 5400,
        "total": 35400,
        "amount_allocated": 35400,
        "template_id": null,
        "created_by": "95024e01-386c-4d77-8e70-055604e06804",
        "cancelled_at": null,
        "cancellation_reason": null,
        "created_at": "2026-10-21T12:40:17.565Z",
        "updated_at": "2026-10-21T12:40:17.596Z",
        "supplier": {
          "id": "ce2b7866-4e66-4282-aab1-eecb93736954",
          "name": "Société 164e26",
          "logo_document_id": null
        },
        "buyer": {
          "id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
          "name": "Société 125a02",
          "logo_document_id": null
        },
        "order": {
          "id": "4812125f-6813-4620-9f81-573589cbe79b",
          "number": "BC-2026-00001"
        },
        "invoice": {
          "id": "59649210-a2e8-43dd-86e1-837291d50640",
          "number": "FAC-2026-00001"
        },
        "direction": "recu",
        "unallocated_amount": 0,
        "pdf_url": "/api/v1/avoirs/47a34dcf-a5e2-49ef-bb62-704f694ab131/pdf"
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

#### `POST /api/v1/avoirs`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `factures.emettre`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `invoice_id` | string (uuid) | **oui** |  |
| `reason` | string | **oui** | min 3 car. · max 1000 car. |
| `lines` | tableau de object | **oui** | min 1 élément(s) · max 500 élément(s) · sans doublon |
| `lines[].line_no` | integer | **oui** | ≥ 1 |
| `lines[].quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |


<details><summary>Exemple réel de requête</summary>

```json
{
  "invoice_id": "c13d43b9-8e95-460d-98a9-92f0ac7bbbdd",
  "reason": "Remise fidélité",
  "lines": [
    {
      "line_no": 2,
      "quantity": 4
    }
  ]
}
```

</details>

**Réponse 201 :** `data` contient `credit_note`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Avoir émis et transmis au client",
  "data": {
    "credit_note": {
      "id": "2b87b9cd-450b-40e2-a768-b8365973ffe7",
      "number": "AV-2026-00001",
      "supplier_company_id": "d325ac78-e567-499a-a80f-c87686a7e1c1",
      "buyer_company_id": "f32b93b5-9949-4cc1-8baa-db0d143d7b60",
      "partnership_id": "759f6c1b-efbe-4d6b-8453-b924cd23fbd3",
      "order_id": "599068a4-0256-42c3-8397-14574b43fba6",
      "invoice_id": "c13d43b9-8e95-460d-98a9-92f0ac7bbbdd",
      "claim_id": null,
      "status": "emis",
      "issue_date": "2026-10-21",
      "reason": "Remise fidélité",
      "subtotal": 10000,
      "tax_total": 0,
      "total": 10000,
      "amount_allocated": 10000,
      "template_id": null,
      "created_by": "b74430f0-50a7-419f-9934-ea4c16a47ce3",
      "cancelled_at": null,
      "cancellation_reason": null,
      "created_at": "2026-10-21T12:40:20.977Z",
      "updated_at": "2026-10-21T12:40:21.001Z",
      "supplier": {
        "id": "d325ac78-e567-499a-a80f-c87686a7e1c1",
        "name": "Société 6f5dcd",
        "logo_document_id": null
      },
      "buyer": {
        "id": "f32b93b5-9949-4cc1-8baa-db0d143d7b60",
        "name": "Société bd9b7c",
        "logo_document_id": null
      },
      "order": {
        "id": "599068a4-0256-42c3-8397-14574b43fba6",
        "number": "BC-2026-00001"
      },
      "invoice": {
        "id": "c13d43b9-8e95-460d-98a9-92f0ac7bbbdd",
        "number": "FAC-2026-00001"
      },
      "lines": [
        {
          "id": "42ddecbe-620e-4e5f-9323-2b4994cc5454",
          "credit_note_id": "2b87b9cd-450b-40e2-a768-b8365973ffe7",
          "line_no": 1,
          "product_id": "59ba1aa6-d2f9-4fb8-a894-2e0ec60312c3",
          "reference": "REF-994f8a",
          "name": "Riz brisé cb89",
          "unit": "kg",
          "quantity": 4,
          "unit_price": 2500,
          "tax_rate": 0,
          "line_subtotal": 10000,
          "line_tax": 0,
          "line_total": 10000
        }
      ],
      "direction": "emis",
      "unallocated_amount": 0,
      "pdf_url": "/api/v1/avoirs/2b87b9cd-450b-40e2-a768-b8365973ffe7/pdf",
      "allocations": [
        {
          "id": "cebb38d2-bcc4-4589-b3fd-9d12c4b4ab9e",
          "credit_note_id": "2b87b9cd-450b-40e2-a768-b8365973ffe7",
          "invoice_id": "c13d43b9-8e95-460d-98a9-92f0ac7bbbdd",
          "amount": 10000,
          "cancelled_at": null,
          "created_at": "2026-10-21T12:40:20.988Z",
          "invoice": {
            "id": "c13d43b9-8e95-460d-98a9-92f0ac7bbbdd",
            "number": "FAC-2026-00001",
            "total": 187000,
            "amount_paid": 10000,
            "status": "partiellement_payee"
          }
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 403 `PROFIL_ENTREPRISE_INCOMPATIBLE` · 422 `AVOIR_EXCESSIF` · 422 `LIGNES_INVALIDES`.

---

#### `GET /api/v1/avoirs/:id`

- **Accès :** membre d’une entreprise active — permission `factures.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `credit_note`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "credit_note": {
      "id": "47a34dcf-a5e2-49ef-bb62-704f694ab131",
      "number": "AV-2026-00001",
      "supplier_company_id": "ce2b7866-4e66-4282-aab1-eecb93736954",
      "buyer_company_id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
      "partnership_id": "1eca8550-5106-49bf-8621-b425f3dea87d",
      "order_id": "4812125f-6813-4620-9f81-573589cbe79b",
      "invoice_id": "59649210-a2e8-43dd-86e1-837291d50640",
      "claim_id": "a7be2620-4ef6-480d-9491-a15326876a92",
      "status": "emis",
      "issue_date": "2026-10-21",
      "reason": "Litige LIT-2026-00001 — Deux sacs déchirés à l’arrivée",
      "subtotal": 30000,
      "tax_total": 5400,
      "total": 35400,
      "amount_allocated": 35400,
      "template_id": null,
      "created_by": "95024e01-386c-4d77-8e70-055604e06804",
      "cancelled_at": null,
      "cancellation_reason": null,
      "created_at": "2026-10-21T12:40:17.565Z",
      "updated_at": "2026-10-21T12:40:17.596Z",
      "supplier": {
        "id": "ce2b7866-4e66-4282-aab1-eecb93736954",
        "name": "Société 164e26",
        "logo_document_id": null
      },
      "buyer": {
        "id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
        "name": "Société 125a02",
        "logo_document_id": null
      },
      "order": {
        "id": "4812125f-6813-4620-9f81-573589cbe79b",
        "number": "BC-2026-00001"
      },
      "invoice": {
        "id": "59649210-a2e8-43dd-86e1-837291d50640",
        "number": "FAC-2026-00001"
      },
      "lines": [
        {
          "id": "a89a1970-1d64-4c75-85f5-83465f6fc11e",
          "credit_note_id": "47a34dcf-a5e2-49ef-bb62-704f694ab131",
          "line_no": 1,
          "product_id": "b5b3653a-dd34-4088-a66d-1a74e3cbed5f",
          "reference": "REF-00ac06",
          "name": "Riz brisé 3bc9",
          "unit": "sac",
          "quantity": 2,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 30000,
          "line_tax": 5400,
          "line_total": 35400
        }
      ],
      "direction": "recu",
      "unallocated_amount": 0,
      "pdf_url": "/api/v1/avoirs/47a34dcf-a5e2-49ef-bb62-704f694ab131/pdf",
      "allocations": [
        {
          "id": "f279f051-41a5-4ab6-bba1-70e721108f59",
          "credit_note_id": "47a34dcf-a5e2-49ef-bb62-704f694ab131",
          "invoice_id": "59649210-a2e8-43dd-86e1-837291d50640",
          "amount": 35400,
          "cancelled_at": null,
          "created_at": "2026-10-21T12:40:17.580Z",
          "invoice": {
            "id": "59649210-a2e8-43dd-86e1-837291d50640",
            "number": "FAC-2026-00001",
            "total": 187000,
            "amount_paid": 35400,
            "status": "partiellement_payee"
          }
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `GET /api/v1/avoirs/:id/pdf`

- **Accès :** membre d’une entreprise active — permission `factures.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** fichier `application/pdf` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/avoirs/:id/annuler`

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
  "reason": "Erreur de saisie"
}
```

</details>

**Réponse 200 :** `data` contient `credit_note`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Avoir annulé",
  "data": {
    "credit_note": {
      "id": "47a34dcf-a5e2-49ef-bb62-704f694ab131",
      "number": "AV-2026-00001",
      "supplier_company_id": "ce2b7866-4e66-4282-aab1-eecb93736954",
      "buyer_company_id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
      "partnership_id": "1eca8550-5106-49bf-8621-b425f3dea87d",
      "order_id": "4812125f-6813-4620-9f81-573589cbe79b",
      "invoice_id": "59649210-a2e8-43dd-86e1-837291d50640",
      "claim_id": "a7be2620-4ef6-480d-9491-a15326876a92",
      "status": "annule",
      "issue_date": "2026-10-21",
      "reason": "Litige LIT-2026-00001 — Deux sacs déchirés à l’arrivée",
      "subtotal": 30000,
      "tax_total": 5400,
      "total": 35400,
      "amount_allocated": 0,
      "template_id": null,
      "created_by": "95024e01-386c-4d77-8e70-055604e06804",
      "cancelled_at": "2026-10-21T12:40:18.063Z",
      "cancellation_reason": "Erreur de saisie",
      "created_at": "2026-10-21T12:40:17.565Z",
      "updated_at": "2026-10-21T12:40:18.064Z",
      "supplier": {
        "id": "ce2b7866-4e66-4282-aab1-eecb93736954",
        "name": "Société 164e26",
        "logo_document_id": null
      },
      "buyer": {
        "id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
        "name": "Société 125a02",
        "logo_document_id": null
      },
      "order": {
        "id": "4812125f-6813-4620-9f81-573589cbe79b",
        "number": "BC-2026-00001"
      },
      "invoice": {
        "id": "59649210-a2e8-43dd-86e1-837291d50640",
        "number": "FAC-2026-00001"
      },
      "lines": [
        {
          "id": "a89a1970-1d64-4c75-85f5-83465f6fc11e",
          "credit_note_id": "47a34dcf-a5e2-49ef-bb62-704f694ab131",
          "line_no": 1,
          "product_id": "b5b3653a-dd34-4088-a66d-1a74e3cbed5f",
          "reference": "REF-00ac06",
          "name": "Riz brisé 3bc9",
          "unit": "sac",
          "quantity": 2,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 30000,
          "line_tax": 5400,
          "line_total": 35400
        }
      ],
      "direction": "emis",
      "unallocated_amount": 0,
      "pdf_url": "/api/v1/avoirs/47a34dcf-a5e2-49ef-bb62-704f694ab131/pdf",
      "allocations": []
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 20. Retours et litiges

| Méthode | Chemin | Accès |
|---|---|---|
| GET | `/api/v1/litiges` | membre d’une entreprise active |
| POST | `/api/v1/litiges` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| GET | `/api/v1/litiges/:id` | membre d’une entreprise active |
| POST | `/api/v1/litiges/:id/accepter` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/litiges/:id/refuser` | membre d’une entreprise active — entreprise fournisseur ou mixte |
| POST | `/api/v1/litiges/:id/annuler` | membre d’une entreprise active — entreprise acheteuse ou mixte |
| POST | `/api/v1/litiges/:id/pieces-jointes` | membre d’une entreprise active |

#### `GET /api/v1/litiges`

- **Accès :** membre d’une entreprise active — permission `achats.lire ou ventes.lire`
- **Format :** aucun corps
- **Pagination :** `page` (défaut 1), `limit` (défaut 20, max 100)

**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `page` | integer | non | ≥ 1 |
| `limit` | integer | non | ≥ 1 |
| `sens` | string | non | valeurs : `ouverts_par_moi`, `recus` |
| `status` | string | non | valeurs : `ouvert`, `accepte`, `refuse`, `annule` |
| `order_id` | string (uuid) | non |  |
| `tri` | string | non | valeurs : `created_at`, `-created_at`, `total`, `-total`, `number`, `-number` |


Exemple de query string réelle : `?order_id=31d1c098-9752-4eb4-a00f-1b67119354aa&status=ouvert`

**Réponse 200 :** liste paginée : `data.items` (tableau, vide dans l’exemple) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "totalPages": 1
    }
  }
}
```

</details>

---

#### `POST /api/v1/litiges`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `reception.confirmer ou achats.gerer`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative

**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `order_id` | string (uuid) | **oui** |  |
| `delivery_id` | string (uuid) | non | `null` accepté |
| `type` | string | **oui** | valeurs : `manquant`, `endommage`, `non_conforme`, `erreur_produit`, `perime`, `autre` |
| `description` | string | **oui** | min 5 car. · max 2000 car. |
| `lines` | tableau de object | **oui** | min 1 élément(s) · max 500 élément(s) · sans doublon |
| `lines[].line_no` | integer | **oui** | ≥ 1 |
| `lines[].quantity` | number | **oui** | ≥ 0 · ≤ 1000000000 · 3 décimale(s) max · > 0 |
| `lines[].comment` | string | non | `null` accepté · max 500 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "order_id": "4812125f-6813-4620-9f81-573589cbe79b",
  "type": "endommage",
  "description": "Deux sacs déchirés à l’arrivée",
  "lines": [
    {
      "line_no": 1,
      "quantity": 2,
      "comment": "Sacs 3 et 7"
    }
  ]
}
```

</details>

**Réponse 201 :** `data` contient `claim`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Litige ouvert : le fournisseur est averti",
  "data": {
    "claim": {
      "id": "a7be2620-4ef6-480d-9491-a15326876a92",
      "number": "LIT-2026-00001",
      "order_id": "4812125f-6813-4620-9f81-573589cbe79b",
      "buyer_company_id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
      "supplier_company_id": "ce2b7866-4e66-4282-aab1-eecb93736954",
      "partnership_id": "1eca8550-5106-49bf-8621-b425f3dea87d",
      "delivery_id": null,
      "type": "endommage",
      "status": "ouvert",
      "description": "Deux sacs déchirés à l’arrivée",
      "subtotal": 30000,
      "tax_total": 5400,
      "total": 35400,
      "response": null,
      "restock": false,
      "credit_note_id": null,
      "opened_by": "d3e5b69e-3431-49b1-9967-ae49d5117c8a",
      "resolved_at": null,
      "resolved_by": null,
      "created_at": "2026-10-21T12:40:17.293Z",
      "updated_at": "2026-10-21T12:40:17.293Z",
      "buyer": {
        "id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
        "name": "Société 125a02",
        "logo_document_id": null
      },
      "supplier": {
        "id": "ce2b7866-4e66-4282-aab1-eecb93736954",
        "name": "Société 164e26",
        "logo_document_id": null
      },
      "order": {
        "id": "4812125f-6813-4620-9f81-573589cbe79b",
        "number": "BC-2026-00001",
        "status": "facturee"
      },
      "delivery": null,
      "lines": [
        {
          "id": "2cf08d6f-d207-4010-ba8e-656e3555e30b",
          "claim_id": "a7be2620-4ef6-480d-9491-a15326876a92",
          "line_no": 1,
          "product_id": "b5b3653a-dd34-4088-a66d-1a74e3cbed5f",
          "reference": "REF-00ac06",
          "name": "Riz brisé 3bc9",
          "unit": "sac",
          "quantity": 2,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 30000,
          "line_tax": 5400,
          "line_total": 35400,
          "comment": "Sacs 3 et 7"
        }
      ],
      "side": "acheteur",
      "credit_note": null,
      "attachments": []
    }
  }
}
```

</details>

**Erreurs observées :** 409 `COMMANDE_NON_LIVREE` · 422 `LITIGE_INVALIDE`.

---

#### `GET /api/v1/litiges/:id`

- **Accès :** membre d’une entreprise active — permission `achats.lire ou ventes.lire`
- **Format :** aucun corps

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 200 :** `data` contient `claim`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "claim": {
      "id": "a7be2620-4ef6-480d-9491-a15326876a92",
      "number": "LIT-2026-00001",
      "order_id": "4812125f-6813-4620-9f81-573589cbe79b",
      "buyer_company_id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
      "supplier_company_id": "ce2b7866-4e66-4282-aab1-eecb93736954",
      "partnership_id": "1eca8550-5106-49bf-8621-b425f3dea87d",
      "delivery_id": null,
      "type": "endommage",
      "status": "ouvert",
      "description": "Deux sacs déchirés à l’arrivée",
      "subtotal": 30000,
      "tax_total": 5400,
      "total": 35400,
      "response": "Désolés, avoir émis",
      "restock": false,
      "credit_note_id": null,
      "opened_by": "d3e5b69e-3431-49b1-9967-ae49d5117c8a",
      "resolved_at": null,
      "resolved_by": null,
      "created_at": "2026-10-21T12:40:17.293Z",
      "updated_at": "2026-10-21T12:40:18.098Z",
      "buyer": {
        "id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
        "name": "Société 125a02",
        "logo_document_id": null
      },
      "supplier": {
        "id": "ce2b7866-4e66-4282-aab1-eecb93736954",
        "name": "Société 164e26",
        "logo_document_id": null
      },
      "order": {
        "id": "4812125f-6813-4620-9f81-573589cbe79b",
        "number": "BC-2026-00001",
        "status": "facturee"
      },
      "delivery": null,
      "lines": [
        {
          "id": "2cf08d6f-d207-4010-ba8e-656e3555e30b",
          "claim_id": "a7be2620-4ef6-480d-9491-a15326876a92",
          "line_no": 1,
          "product_id": "b5b3653a-dd34-4088-a66d-1a74e3cbed5f",
          "reference": "REF-00ac06",
          "name": "Riz brisé 3bc9",
          "unit": "sac",
          "quantity": 2,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 30000,
          "line_tax": 5400,
          "line_total": 35400,
          "comment": "Sacs 3 et 7"
        }
      ],
      "side": "acheteur",
      "credit_note": null,
      "attachments": [
        {
          "id": "99b193ac-3381-4164-9e29-f04a1f200272",
          "company_id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
          "category": "piece_jointe",
          "visibility": "partenaire",
          "mime_type": "image/png",
          "size_bytes": 99,
          "original_name": "sac.png",
          "has_thumbnail": true,
          "created_at": "2026-10-21T12:40:17.388Z",
          "url": "/api/v1/documents/99b193ac-3381-4164-9e29-f04a1f200272/fichier"
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/litiges/:id/accepter`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `factures.emettre`
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
| `response` | string | non | `null` accepté · max 2000 car. |
| `restock` | boolean | non | défaut : `false` |


<details><summary>Exemple réel de requête</summary>

```json
{
  "response": "Désolés, avoir émis"
}
```

</details>

**Réponse 200 :** `data` contient `claim`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Litige accepté : avoir émis",
  "data": {
    "claim": {
      "id": "a7be2620-4ef6-480d-9491-a15326876a92",
      "number": "LIT-2026-00001",
      "order_id": "4812125f-6813-4620-9f81-573589cbe79b",
      "buyer_company_id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
      "supplier_company_id": "ce2b7866-4e66-4282-aab1-eecb93736954",
      "partnership_id": "1eca8550-5106-49bf-8621-b425f3dea87d",
      "delivery_id": null,
      "type": "endommage",
      "status": "accepte",
      "description": "Deux sacs déchirés à l’arrivée",
      "subtotal": 30000,
      "tax_total": 5400,
      "total": 35400,
      "response": "Désolés, avoir émis",
      "restock": false,
      "credit_note_id": "47a34dcf-a5e2-49ef-bb62-704f694ab131",
      "opened_by": "d3e5b69e-3431-49b1-9967-ae49d5117c8a",
      "resolved_at": "2026-10-21T12:40:17.611Z",
      "resolved_by": "95024e01-386c-4d77-8e70-055604e06804",
      "created_at": "2026-10-21T12:40:17.293Z",
      "updated_at": "2026-10-21T12:40:17.611Z",
      "buyer": {
        "id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
        "name": "Société 125a02",
        "logo_document_id": null
      },
      "supplier": {
        "id": "ce2b7866-4e66-4282-aab1-eecb93736954",
        "name": "Société 164e26",
        "logo_document_id": null
      },
      "order": {
        "id": "4812125f-6813-4620-9f81-573589cbe79b",
        "number": "BC-2026-00001",
        "status": "facturee"
      },
      "delivery": null,
      "lines": [
        {
          "id": "2cf08d6f-d207-4010-ba8e-656e3555e30b",
          "claim_id": "a7be2620-4ef6-480d-9491-a15326876a92",
          "line_no": 1,
          "product_id": "b5b3653a-dd34-4088-a66d-1a74e3cbed5f",
          "reference": "REF-00ac06",
          "name": "Riz brisé 3bc9",
          "unit": "sac",
          "quantity": 2,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 30000,
          "line_tax": 5400,
          "line_total": 35400,
          "comment": "Sacs 3 et 7"
        }
      ],
      "side": "fournisseur",
      "credit_note": {
        "id": "47a34dcf-a5e2-49ef-bb62-704f694ab131",
        "number": "AV-2026-00001",
        "total": 35400,
        "status": "emis"
      },
      "attachments": [
        {
          "id": "99b193ac-3381-4164-9e29-f04a1f200272",
          "company_id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
          "category": "piece_jointe",
          "visibility": "partenaire",
          "mime_type": "image/png",
          "size_bytes": 99,
          "original_name": "sac.png",
          "has_thumbnail": true,
          "created_at": "2026-10-21T12:40:17.388Z",
          "url": "/api/v1/documents/99b193ac-3381-4164-9e29-f04a1f200272/fichier"
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 403 `PERMISSION_REFUSEE` · 409 `LITIGE_CLOS` · 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/litiges/:id/refuser`

- **Accès :** membre d’une entreprise active — entreprise fournisseur ou mixte — permission `ventes.traiter ou factures.emettre`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `application/json`

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Corps de la requête**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `response` | string | **oui** | min 3 car. · max 2000 car. |


<details><summary>Exemple réel de requête</summary>

```json
{
  "response": "Produit conforme au bon"
}
```

</details>

**Réponse 200 :** `data` contient `claim`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Litige refusé",
  "data": {
    "claim": {
      "id": "780b211e-4391-4aba-a974-ac7f395344ce",
      "number": "LIT-2026-00001",
      "order_id": "31d1c098-9752-4eb4-a00f-1b67119354aa",
      "buyer_company_id": "de5e9dc0-1bc5-4659-9266-4000fae9c315",
      "supplier_company_id": "31834370-9bb6-44e1-a9c4-488028fc34c4",
      "partnership_id": "94a801b6-6278-42d9-859a-1068362a3f1c",
      "delivery_id": null,
      "type": "non_conforme",
      "status": "refuse",
      "description": "Mauvaise qualité",
      "subtotal": 1000,
      "tax_total": 0,
      "total": 1000,
      "response": "Produit conforme au bon",
      "restock": false,
      "credit_note_id": null,
      "opened_by": "e037d09a-7578-4a6d-8f67-766262e05afb",
      "resolved_at": "2026-10-21T12:40:19.543Z",
      "resolved_by": "e19104db-f7c2-4493-b1f6-c41fa3f62f69",
      "created_at": "2026-10-21T12:40:19.474Z",
      "updated_at": "2026-10-21T12:40:19.544Z",
      "buyer": {
        "id": "de5e9dc0-1bc5-4659-9266-4000fae9c315",
        "name": "Société eddef2",
        "logo_document_id": null
      },
      "supplier": {
        "id": "31834370-9bb6-44e1-a9c4-488028fc34c4",
        "name": "Société 2d763d",
        "logo_document_id": null
      },
      "order": {
        "id": "31d1c098-9752-4eb4-a00f-1b67119354aa",
        "number": "BC-2026-00002",
        "status": "reception_confirmee"
      },
      "delivery": null,
      "lines": [
        {
          "id": "397c09ec-fdd1-4629-bd39-8b83ee0cd1df",
          "claim_id": "780b211e-4391-4aba-a974-ac7f395344ce",
          "line_no": 1,
          "product_id": "ceee9202-beb7-48ba-b62a-1062a6c52e0e",
          "reference": "REF-a9ba39",
          "name": "Riz brisé 1159",
          "unit": "sac",
          "quantity": 1,
          "unit_price": 1000,
          "tax_rate": 0,
          "line_subtotal": 1000,
          "line_tax": 0,
          "line_total": 1000,
          "comment": null
        }
      ],
      "side": "fournisseur",
      "credit_note": null,
      "attachments": []
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/litiges/:id/annuler`

- **Accès :** membre d’une entreprise active — entreprise acheteuse ou mixte — permission `reception.confirmer ou achats.gerer`
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


**Réponse 200 :** `data` contient `claim`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Litige retiré",
  "data": {
    "claim": {
      "id": "24efe560-3ad5-40b8-940f-ccdb9dd86abc",
      "number": "LIT-2026-00002",
      "order_id": "31d1c098-9752-4eb4-a00f-1b67119354aa",
      "buyer_company_id": "de5e9dc0-1bc5-4659-9266-4000fae9c315",
      "supplier_company_id": "31834370-9bb6-44e1-a9c4-488028fc34c4",
      "partnership_id": "94a801b6-6278-42d9-859a-1068362a3f1c",
      "delivery_id": null,
      "type": "non_conforme",
      "status": "annule",
      "description": "Mauvaise qualité",
      "subtotal": 1000,
      "tax_total": 0,
      "total": 1000,
      "response": null,
      "restock": false,
      "credit_note_id": null,
      "opened_by": "e037d09a-7578-4a6d-8f67-766262e05afb",
      "resolved_at": "2026-10-21T12:40:19.687Z",
      "resolved_by": "e037d09a-7578-4a6d-8f67-766262e05afb",
      "created_at": "2026-10-21T12:40:19.621Z",
      "updated_at": "2026-10-21T12:40:19.687Z",
      "buyer": {
        "id": "de5e9dc0-1bc5-4659-9266-4000fae9c315",
        "name": "Société eddef2",
        "logo_document_id": null
      },
      "supplier": {
        "id": "31834370-9bb6-44e1-a9c4-488028fc34c4",
        "name": "Société 2d763d",
        "logo_document_id": null
      },
      "order": {
        "id": "31d1c098-9752-4eb4-a00f-1b67119354aa",
        "number": "BC-2026-00002",
        "status": "reception_confirmee"
      },
      "delivery": null,
      "lines": [
        {
          "id": "b90a3187-190d-4544-b95d-ff5b91f19859",
          "claim_id": "24efe560-3ad5-40b8-940f-ccdb9dd86abc",
          "line_no": 1,
          "product_id": "ceee9202-beb7-48ba-b62a-1062a6c52e0e",
          "reference": "REF-a9ba39",
          "name": "Riz brisé 1159",
          "unit": "sac",
          "quantity": 1,
          "unit_price": 1000,
          "tax_rate": 0,
          "line_subtotal": 1000,
          "line_tax": 0,
          "line_total": 1000,
          "comment": null
        }
      ],
      "side": "acheteur",
      "credit_note": null,
      "attachments": []
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

#### `POST /api/v1/litiges/:id/pieces-jointes`

- **Accès :** membre d’une entreprise active — permission `documents.ecrire`
- **Abonnement :** écriture refusée (**402**) si l’abonnement est échu ou suspendu
- **Format :** `multipart/form-data`
- **En-tête `Idempotency-Key` :** recommandé (protège du double envoi) — UUID neuf par action, réutilisé tel quel pour une nouvelle tentative
- **Fichier :** champ `fichier` (**obligatoire**) — une image (JPEG, PNG, WebP) ou un PDF

**Paramètres de chemin**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `id` | string (uuid) | **oui** |  |


**Réponse 201 :** `data` contient `claim`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Pièce jointe ajoutée",
  "data": {
    "claim": {
      "id": "a7be2620-4ef6-480d-9491-a15326876a92",
      "number": "LIT-2026-00001",
      "order_id": "4812125f-6813-4620-9f81-573589cbe79b",
      "buyer_company_id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
      "supplier_company_id": "ce2b7866-4e66-4282-aab1-eecb93736954",
      "partnership_id": "1eca8550-5106-49bf-8621-b425f3dea87d",
      "delivery_id": null,
      "type": "endommage",
      "status": "ouvert",
      "description": "Deux sacs déchirés à l’arrivée",
      "subtotal": 30000,
      "tax_total": 5400,
      "total": 35400,
      "response": null,
      "restock": false,
      "credit_note_id": null,
      "opened_by": "d3e5b69e-3431-49b1-9967-ae49d5117c8a",
      "resolved_at": null,
      "resolved_by": null,
      "created_at": "2026-10-21T12:40:17.293Z",
      "updated_at": "2026-10-21T12:40:17.293Z",
      "buyer": {
        "id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
        "name": "Société 125a02",
        "logo_document_id": null
      },
      "supplier": {
        "id": "ce2b7866-4e66-4282-aab1-eecb93736954",
        "name": "Société 164e26",
        "logo_document_id": null
      },
      "order": {
        "id": "4812125f-6813-4620-9f81-573589cbe79b",
        "number": "BC-2026-00001",
        "status": "facturee"
      },
      "delivery": null,
      "lines": [
        {
          "id": "2cf08d6f-d207-4010-ba8e-656e3555e30b",
          "claim_id": "a7be2620-4ef6-480d-9491-a15326876a92",
          "line_no": 1,
          "product_id": "b5b3653a-dd34-4088-a66d-1a74e3cbed5f",
          "reference": "REF-00ac06",
          "name": "Riz brisé 3bc9",
          "unit": "sac",
          "quantity": 2,
          "unit_price": 15000,
          "tax_rate": 18,
          "line_subtotal": 30000,
          "line_tax": 5400,
          "line_total": 35400,
          "comment": "Sacs 3 et 7"
        }
      ],
      "side": "acheteur",
      "credit_note": null,
      "attachments": [
        {
          "id": "99b193ac-3381-4164-9e29-f04a1f200272",
          "company_id": "9d3051d6-3d81-49a1-bd0e-d2662e06f5ec",
          "category": "piece_jointe",
          "visibility": "partenaire",
          "mime_type": "image/png",
          "size_bytes": 99,
          "original_name": "sac.png",
          "has_thumbnail": true,
          "created_at": "2026-10-21T12:40:17.388Z",
          "url": "/api/v1/documents/99b193ac-3381-4164-9e29-f04a1f200272/fichier"
        }
      ]
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 21. Paiements

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


Exemple de query string réelle : `?sens=effectues&q=VIR-001&partnership_id=66f8e83c-b6d4-48e1-8802-79d451af555c`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `reference`, `supplier_company_id`, `buyer_company_id`, `partnership_id`, `amount`, `allocated_amount`, `currency`, `method`, `paid_on`, `external_reference`, `note`, `status`, `recorded_by_side`, `recorded_by`, `confirmed_at`, `confirmed_by`, `rejected_at`, `rejection_reason`, `cancelled_at`, `cancellation_reason`, `proof_document_id`, `created_at`, `updated_at`, `supplier`, `buyer`, `direction`, `unallocated_amount`, `proof_url`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "ad41aa9a-bf46-4fd3-bf80-226188e03753",
        "reference": "PAI-2026-00001",
        "supplier_company_id": "e1cb7a95-4344-4173-bac1-2dfcad190b6a",
        "buyer_company_id": "17353d06-9594-4499-bd14-e6c749ed2a60",
        "partnership_id": "66f8e83c-b6d4-48e1-8802-79d451af555c",
        "amount": 5000,
        "allocated_amount": 5000,
        "currency": "XOF",
        "method": "virement",
        "paid_on": "2026-10-21",
        "external_reference": "VIR-001",
        "note": null,
        "status": "confirme",
        "recorded_by_side": "fournisseur",
        "recorded_by": "e95638ef-ec84-44ac-b1b0-42a456f66583",
        "confirmed_at": "2026-10-21T12:35:44.967Z",
        "confirmed_by": "e95638ef-ec84-44ac-b1b0-42a456f66583",
        "rejected_at": null,
        "rejection_reason": null,
        "cancelled_at": null,
        "cancellation_reason": null,
        "proof_document_id": null,
        "created_at": "2026-10-21T12:35:44.968Z",
        "updated_at": "2026-10-21T12:35:45.000Z",
        "supplier": {
          "id": "e1cb7a95-4344-4173-bac1-2dfcad190b6a",
          "name": "Société 7628c9",
          "logo_document_id": null
        },
        "buyer": {
          "id": "17353d06-9594-4499-bd14-e6c749ed2a60",
          "name": "Société 886c8c",
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
  "partnership_id": "cfa703c0-c82c-4975-8f3e-d0c108b1aa96",
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
      "id": "54758df6-ae19-437f-aa11-353e47de1246",
      "reference": "PAI-2026-00001",
      "supplier_company_id": "5e872da6-c8b6-4150-bb9d-6bd3bf26b87d",
      "buyer_company_id": "b2bbae95-e2ea-4d1a-8640-7f36185ede46",
      "partnership_id": "cfa703c0-c82c-4975-8f3e-d0c108b1aa96",
      "amount": 100000,
      "allocated_amount": 100000,
      "currency": "XOF",
      "method": "wave",
      "paid_on": "2026-10-21",
      "external_reference": "TX-WAVE-1",
      "note": null,
      "status": "confirme",
      "recorded_by_side": "fournisseur",
      "recorded_by": "ea085788-7526-4bef-a32e-b01572ee2663",
      "confirmed_at": "2026-10-21T12:34:49.875Z",
      "confirmed_by": "ea085788-7526-4bef-a32e-b01572ee2663",
      "rejected_at": null,
      "rejection_reason": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "proof_document_id": null,
      "created_at": "2026-10-21T12:34:49.876Z",
      "updated_at": "2026-10-21T12:34:49.900Z",
      "supplier": {
        "id": "5e872da6-c8b6-4150-bb9d-6bd3bf26b87d",
        "name": "Société 7d2a29",
        "logo_document_id": null
      },
      "buyer": {
        "id": "b2bbae95-e2ea-4d1a-8640-7f36185ede46",
        "name": "Société 4f405c",
        "logo_document_id": null
      },
      "allocations": [
        {
          "id": "f8167c45-109f-4bee-ac19-a347d1f121ce",
          "payment_id": "54758df6-ae19-437f-aa11-353e47de1246",
          "invoice_id": "b79719e5-4a4f-441b-84eb-39f86a54b0e2",
          "amount": 100000,
          "cancelled_at": null,
          "created_at": "2026-10-21T12:34:49.882Z",
          "invoice": {
            "id": "b79719e5-4a4f-441b-84eb-39f86a54b0e2",
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
      "id": "919ff4b4-b4a8-489f-a4fb-d2692b84e048",
      "reference": "PAI-2026-00001",
      "supplier_company_id": "ea3f5dfb-06ab-436b-84f6-5b2b7a9a309a",
      "buyer_company_id": "c785938e-4bab-4452-8094-4a545a34af5c",
      "partnership_id": "94c6c74d-49df-483c-a5ee-eb2ef44a2853",
      "amount": 50000,
      "allocated_amount": 50000,
      "currency": "XOF",
      "method": "especes",
      "paid_on": "2026-10-21",
      "external_reference": null,
      "note": "Acompte",
      "status": "confirme",
      "recorded_by_side": "fournisseur",
      "recorded_by": "df4840ba-651b-42b2-a49a-60e12168d579",
      "confirmed_at": "2026-10-21T12:34:51.797Z",
      "confirmed_by": "df4840ba-651b-42b2-a49a-60e12168d579",
      "rejected_at": null,
      "rejection_reason": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "proof_document_id": null,
      "created_at": "2026-10-21T12:34:51.797Z",
      "updated_at": "2026-10-21T12:34:52.264Z",
      "supplier": {
        "id": "ea3f5dfb-06ab-436b-84f6-5b2b7a9a309a",
        "name": "Société 3769df",
        "logo_document_id": null
      },
      "buyer": {
        "id": "c785938e-4bab-4452-8094-4a545a34af5c",
        "name": "Société 3fbf0d",
        "logo_document_id": null
      },
      "allocations": [
        {
          "id": "b7ff7d3e-945f-4fe9-a9b0-493cfb757aba",
          "payment_id": "919ff4b4-b4a8-489f-a4fb-d2692b84e048",
          "invoice_id": "20600b0a-d096-4ce9-bb80-c1c6e90122ff",
          "amount": 50000,
          "cancelled_at": null,
          "created_at": "2026-10-21T12:34:52.252Z",
          "invoice": {
            "id": "20600b0a-d096-4ce9-bb80-c1c6e90122ff",
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
      "id": "b39fb4c7-74ad-474d-8d09-4c5a7d431e05",
      "reference": "PAI-2026-00001",
      "supplier_company_id": "4a0a1533-4eea-4fa8-8764-606863e98db8",
      "buyer_company_id": "7495cfa7-647b-46a1-b5a2-87b5fcb6feb3",
      "partnership_id": "4e7ffd72-52ca-4da1-959a-324e465bcbdc",
      "amount": 187000,
      "allocated_amount": 187000,
      "currency": "XOF",
      "method": "orange_money",
      "paid_on": "2026-10-21",
      "external_reference": null,
      "note": null,
      "status": "confirme",
      "recorded_by_side": "acheteur",
      "recorded_by": "9a11412b-1ad5-41d9-809c-4690738eed1b",
      "confirmed_at": "2026-10-21T12:34:54.294Z",
      "confirmed_by": "e73a51c6-546c-4594-a51d-b2f04ce81d8f",
      "rejected_at": null,
      "rejection_reason": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "proof_document_id": "88f39664-6a15-411f-a8cc-b45b9b6d61ef",
      "created_at": "2026-10-21T12:34:54.149Z",
      "updated_at": "2026-10-21T12:34:54.325Z",
      "supplier": {
        "id": "4a0a1533-4eea-4fa8-8764-606863e98db8",
        "name": "Société a4eeb4",
        "logo_document_id": null
      },
      "buyer": {
        "id": "7495cfa7-647b-46a1-b5a2-87b5fcb6feb3",
        "name": "Société 223a2d",
        "logo_document_id": null
      },
      "allocations": [
        {
          "id": "e07929d4-1f74-4e42-a245-b57f783f61b4",
          "payment_id": "b39fb4c7-74ad-474d-8d09-4c5a7d431e05",
          "invoice_id": "e465d4ef-2127-4fa2-92df-5e94e71722d1",
          "amount": 187000,
          "cancelled_at": null,
          "created_at": "2026-10-21T12:34:54.299Z",
          "invoice": {
            "id": "e465d4ef-2127-4fa2-92df-5e94e71722d1",
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
      "proof_url": "/api/v1/documents/88f39664-6a15-411f-a8cc-b45b9b6d61ef/fichier"
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
      "id": "5bdc061b-15a5-46f0-8b4f-4bc8ab7f3863",
      "reference": "PAI-2026-00002",
      "supplier_company_id": "4a0a1533-4eea-4fa8-8764-606863e98db8",
      "buyer_company_id": "7495cfa7-647b-46a1-b5a2-87b5fcb6feb3",
      "partnership_id": "4e7ffd72-52ca-4da1-959a-324e465bcbdc",
      "amount": 5000,
      "allocated_amount": 0,
      "currency": "XOF",
      "method": "especes",
      "paid_on": "2026-10-21",
      "external_reference": null,
      "note": null,
      "status": "rejete",
      "recorded_by_side": "acheteur",
      "recorded_by": "9a11412b-1ad5-41d9-809c-4690738eed1b",
      "confirmed_at": null,
      "confirmed_by": null,
      "rejected_at": "2026-10-21T12:34:54.443Z",
      "rejection_reason": "Non reçu",
      "cancelled_at": null,
      "cancellation_reason": null,
      "proof_document_id": null,
      "created_at": "2026-10-21T12:34:54.400Z",
      "updated_at": "2026-10-21T12:34:54.444Z",
      "supplier": {
        "id": "4a0a1533-4eea-4fa8-8764-606863e98db8",
        "name": "Société a4eeb4",
        "logo_document_id": null
      },
      "buyer": {
        "id": "7495cfa7-647b-46a1-b5a2-87b5fcb6feb3",
        "name": "Société 223a2d",
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
      "id": "ff6d74e4-f7bb-4c6d-879d-2326a38b8099",
      "reference": "PAI-2026-00001",
      "supplier_company_id": "20c9a93b-9ee0-4ea1-9511-8320f9441f07",
      "buyer_company_id": "685c3755-4ed6-475c-a837-bf8d0a782fc3",
      "partnership_id": "8b23804d-4ea0-46ac-bc5f-0f1a20baf992",
      "amount": 187000,
      "allocated_amount": 0,
      "currency": "XOF",
      "method": "cheque",
      "paid_on": "2026-10-21",
      "external_reference": null,
      "note": null,
      "status": "annule",
      "recorded_by_side": "fournisseur",
      "recorded_by": "01ac5e5d-a174-4ec3-8492-07b424181e29",
      "confirmed_at": "2026-10-21T12:34:53.168Z",
      "confirmed_by": "01ac5e5d-a174-4ec3-8492-07b424181e29",
      "rejected_at": null,
      "rejection_reason": null,
      "cancelled_at": "2026-10-21T12:34:53.349Z",
      "cancellation_reason": "Chèque sans provision",
      "proof_document_id": null,
      "created_at": "2026-10-21T12:34:53.169Z",
      "updated_at": "2026-10-21T12:34:53.349Z",
      "supplier": {
        "id": "20c9a93b-9ee0-4ea1-9511-8320f9441f07",
        "name": "Société 782dee",
        "logo_document_id": null
      },
      "buyer": {
        "id": "685c3755-4ed6-475c-a837-bf8d0a782fc3",
        "name": "Société 04dadd",
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
      "id": "b39fb4c7-74ad-474d-8d09-4c5a7d431e05",
      "reference": "PAI-2026-00001",
      "supplier_company_id": "4a0a1533-4eea-4fa8-8764-606863e98db8",
      "buyer_company_id": "7495cfa7-647b-46a1-b5a2-87b5fcb6feb3",
      "partnership_id": "4e7ffd72-52ca-4da1-959a-324e465bcbdc",
      "amount": 187000,
      "allocated_amount": 0,
      "currency": "XOF",
      "method": "orange_money",
      "paid_on": "2026-10-21",
      "external_reference": null,
      "note": null,
      "status": "declare",
      "recorded_by_side": "acheteur",
      "recorded_by": "9a11412b-1ad5-41d9-809c-4690738eed1b",
      "confirmed_at": null,
      "confirmed_by": null,
      "rejected_at": null,
      "rejection_reason": null,
      "cancelled_at": null,
      "cancellation_reason": null,
      "proof_document_id": "88f39664-6a15-411f-a8cc-b45b9b6d61ef",
      "created_at": "2026-10-21T12:34:54.149Z",
      "updated_at": "2026-10-21T12:34:54.231Z",
      "supplier": {
        "id": "4a0a1533-4eea-4fa8-8764-606863e98db8",
        "name": "Société a4eeb4",
        "logo_document_id": null
      },
      "buyer": {
        "id": "7495cfa7-647b-46a1-b5a2-87b5fcb6feb3",
        "name": "Société 223a2d",
        "logo_document_id": null
      },
      "allocations": [],
      "direction": "effectue",
      "unallocated_amount": 187000,
      "proof_url": "/api/v1/documents/88f39664-6a15-411f-a8cc-b45b9b6d61ef/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 409 `PAIEMENT_CLOS` · 422 `DONNEES_INVALIDES`.

---

## 22. Dettes, créances et relevés

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
        "credited": 0,
        "balance": 187000,
        "overdue": 0,
        "declared_pending": 0,
        "partners_with_balance": 1
      },
      "partners": [
        {
          "partnership_id": "dd2d43e0-5826-40c5-a960-829835dd2083",
          "partnership_status": "actif",
          "partner": {
            "id": "c711be40-dd5b-482b-8c8c-33b6d4afe96f",
            "name": "Société 3d0eda",
            "logo_url": null
          },
          "invoiced": 374000,
          "paid": 187000,
          "credited": 0,
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
        "credited": 0,
        "balance": 187000,
        "overdue": 0,
        "declared_pending": 0,
        "partners_with_balance": 1
      },
      "partners": [
        {
          "partnership_id": "dd2d43e0-5826-40c5-a960-829835dd2083",
          "partnership_status": "actif",
          "partner": {
            "id": "231a6cca-ec45-4bcd-b0ea-dd9e586e3881",
            "name": "Société 046398",
            "logo_url": null
          },
          "invoiced": 374000,
          "paid": 187000,
          "credited": 0,
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

## 23. Statistiques et exports

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
          "partner_id": "d0d3b084-5397-418f-a552-d5b863039e83",
          "partner_name": "Société 925672",
          "orders": 1,
          "amount": 187000,
          "average_order": 187000
        }
      ],
      "top_products": [
        {
          "product_id": "8a17a084-4ab8-4537-9aba-0be5a1b83615",
          "reference": "REF-2ff584",
          "name": "Riz brisé 9617",
          "unit": "sac",
          "quantity": 10,
          "amount": 150000,
          "orders": 1
        },
        {
          "product_id": "b05b9e87-539c-49be-8d1f-1d636813b1fb",
          "reference": "REF-6cdae3",
          "name": "Riz brisé 3cc5",
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
          "partner_id": "f75b3bbf-ef98-4ad3-afe4-0a9e46706a65",
          "partner_name": "Société b151bd",
          "orders": 1,
          "amount": 187000,
          "average_order": 187000
        }
      ],
      "top_products": [
        {
          "product_id": "8a17a084-4ab8-4537-9aba-0be5a1b83615",
          "reference": "REF-2ff584",
          "name": "Riz brisé 9617",
          "unit": "sac",
          "quantity": 10,
          "amount": 150000,
          "orders": 1
        },
        {
          "product_id": "b05b9e87-539c-49be-8d1f-1d636813b1fb",
          "reference": "REF-6cdae3",
          "name": "Riz brisé 3cc5",
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
| `type` | string | **oui** | valeurs : `commandes`, `factures`, `paiements`, `journal_ventes`, `journal_achats`, `journal_tresorerie` |


**Paramètres de requête (query string)**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `du` | string | non | date `AAAA-MM-JJ` |
| `au` | string | non | date `AAAA-MM-JJ` |
| `sens` | string | non | valeurs : `achats`, `ventes` |


**Réponse 200 :** fichier `text/csv` (pas de JSON) — télécharger avec l’en-tête `Authorization`.

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 24. Modèles de documents

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
        "id": "2d9f57d6-02e6-4d31-96e1-078f40903128",
        "company_id": "eef7c254-59b7-4a89-bb65-6b216d62b0c1",
        "type": "bon_commande",
        "version": 2,
        "status": "actif",
        "name": "Modèle de bon de commande",
        "accent_color": "#004488",
        "header_text": null,
        "footer_text": null,
        "legal_mentions": null,
        "show_logo": true,
        "background_document_id": "d2084f85-ab8c-4905-8d9a-b72150731ae8",
        "margin_top": 50,
        "margin_bottom": 60,
        "created_by": "faf741ac-9a02-4819-842f-68c67391c5b2",
        "archived_at": null,
        "created_at": "2026-10-21T12:35:27.976Z",
        "updated_at": "2026-10-21T12:35:27.976Z",
        "background_url": "/api/v1/documents/d2084f85-ab8c-4905-8d9a-b72150731ae8/fichier"
      },
      {
        "id": "17a0aba0-61ee-4c48-b339-e4dfac0b3a38",
        "company_id": "eef7c254-59b7-4a89-bb65-6b216d62b0c1",
        "type": "bon_commande",
        "version": 1,
        "status": "archive",
        "name": "Modèle de bon de commande",
        "accent_color": "#AA3300",
        "header_text": null,
        "footer_text": null,
        "legal_mentions": "SARL au capital de 1 000 000 FCFA",
        "show_logo": true,
        "background_document_id": "d2084f85-ab8c-4905-8d9a-b72150731ae8",
        "margin_top": 120,
        "margin_bottom": 60,
        "created_by": "faf741ac-9a02-4819-842f-68c67391c5b2",
        "archived_at": "2026-10-21T12:35:27.972Z",
        "created_at": "2026-10-21T12:35:27.641Z",
        "updated_at": "2026-10-21T12:35:27.973Z",
        "background_url": "/api/v1/documents/d2084f85-ab8c-4905-8d9a-b72150731ae8/fichier"
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
      "id": "17a0aba0-61ee-4c48-b339-e4dfac0b3a38",
      "show_logo": true,
      "margin_bottom": 60,
      "accent_color": "#AA3300",
      "legal_mentions": "SARL au capital de 1 000 000 FCFA",
      "margin_top": 120,
      "name": "Modèle de bon de commande",
      "company_id": "eef7c254-59b7-4a89-bb65-6b216d62b0c1",
      "type": "bon_commande",
      "version": 1,
      "status": "actif",
      "background_document_id": "d2084f85-ab8c-4905-8d9a-b72150731ae8",
      "created_by": "faf741ac-9a02-4819-842f-68c67391c5b2",
      "updated_at": "2026-10-21T12:35:27.718Z",
      "created_at": "2026-10-21T12:35:27.641Z",
      "header_text": null,
      "footer_text": null,
      "archived_at": null,
      "background_url": "/api/v1/documents/d2084f85-ab8c-4905-8d9a-b72150731ae8/fichier"
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
      "id": "06f8e366-b27a-4cf3-9b0f-88dcc3cbb2ce",
      "company_id": "23bc029c-0198-4097-a02d-53f328e6980e",
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
      "created_by": "056e6fa7-0e89-478b-a41c-16b18c23bd06",
      "archived_at": null,
      "created_at": "2026-10-21T12:36:23.586Z",
      "updated_at": "2026-10-21T12:36:23.586Z",
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
      "id": "2d9f57d6-02e6-4d31-96e1-078f40903128",
      "company_id": "eef7c254-59b7-4a89-bb65-6b216d62b0c1",
      "type": "bon_commande",
      "version": 2,
      "status": "archive",
      "name": "Modèle de bon de commande",
      "accent_color": "#004488",
      "header_text": null,
      "footer_text": null,
      "legal_mentions": null,
      "show_logo": true,
      "background_document_id": "d2084f85-ab8c-4905-8d9a-b72150731ae8",
      "margin_top": 50,
      "margin_bottom": 60,
      "created_by": "faf741ac-9a02-4819-842f-68c67391c5b2",
      "archived_at": "2026-10-21T12:35:28.104Z",
      "created_at": "2026-10-21T12:35:27.976Z",
      "updated_at": "2026-10-21T12:35:28.104Z",
      "background_url": "/api/v1/documents/d2084f85-ab8c-4905-8d9a-b72150731ae8/fichier"
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
      "id": "17a0aba0-61ee-4c48-b339-e4dfac0b3a38",
      "company_id": "eef7c254-59b7-4a89-bb65-6b216d62b0c1",
      "type": "bon_commande",
      "version": 1,
      "status": "actif",
      "name": "Modèle de bon de commande",
      "accent_color": "#AA3300",
      "header_text": null,
      "footer_text": null,
      "legal_mentions": "SARL au capital de 1 000 000 FCFA",
      "show_logo": true,
      "background_document_id": "d2084f85-ab8c-4905-8d9a-b72150731ae8",
      "margin_top": 120,
      "margin_bottom": 60,
      "created_by": "faf741ac-9a02-4819-842f-68c67391c5b2",
      "archived_at": null,
      "created_at": "2026-10-21T12:35:27.641Z",
      "updated_at": "2026-10-21T12:35:28.135Z",
      "background_url": "/api/v1/documents/d2084f85-ab8c-4905-8d9a-b72150731ae8/fichier"
    }
  }
}
```

</details>

**Erreurs observées :** 422 `DONNEES_INVALIDES`.

---

## 25. Documents et fichiers

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
| `entity_type` | string | non | valeurs : `company`, `product`, `order`, `claim`, `invoice`, `payment`, `document_template`, `partnership` |
| `entity_id` | string (uuid) | non |  |

Règles globales : tous ou aucun parmi `entity_type`, `entity_id`.


Exemple de query string réelle : `?entity_type=order&entity_id=ceeaf2e9-6af8-41ad-8f20-b729e2437397`

**Réponse 200 :** liste paginée : `data.items` (tableau ; chaque élément contient `id`, `company_id`, `category`, `visibility`, `mime_type`, `size_bytes`, `original_name`, `has_thumbnail`, `created_at`, `url`) et `data.pagination`.

<details><summary>Exemple réel de réponse</summary>

```json
{
  "success": true,
  "message": "Succès",
  "data": {
    "items": [
      {
        "id": "d323714e-3080-4774-b3e6-0b33a4d940ec",
        "company_id": "6536e10d-a100-4d66-b2b8-a9d648208b23",
        "category": "piece_jointe",
        "visibility": "partenaire",
        "mime_type": "application/pdf",
        "size_bytes": 69,
        "original_name": "fiche-technique.pdf",
        "has_thumbnail": false,
        "created_at": "2026-10-21T12:36:14.448Z",
        "url": "/api/v1/documents/d323714e-3080-4774-b3e6-0b33a4d940ec/fichier"
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
    "url": "/api/v1/documents/d323714e-3080-4774-b3e6-0b33a4d940ec/fichier",
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

## 26. Abonnement

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
        "id": "afbf1387-35f3-4bf3-9803-f3fd09658aef",
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
        "id": "355bdd00-e360-4464-9655-bad7d7498c72",
        "company_id": "8c90c2ab-8c6a-4674-b940-1215a6b63054",
        "subscription_id": null,
        "plan_id": "1940d453-1786-4947-94a6-ddbefc456122",
        "amount": 60000,
        "currency": "XOF",
        "months": 1,
        "provider": "paydunya",
        "reference": "ABO-20261021-000004",
        "provider_transaction_id": "paydunya:test_5b8e935625",
        "status": "echoue",
        "checkout_url": "https://app.paydunya.com/sandbox-checkout/invoice/test_5b8e935625",
        "paid_at": null,
        "recorded_by": "b8052174-cba7-4d38-9ffd-cd2297814435",
        "note": "Montant reçu (1000) différent du montant demandé (60000).",
        "created_at": "2026-10-21T12:36:23.099Z",
        "updated_at": "2026-10-21T12:36:23.144Z",
        "plan": {
          "id": "1940d453-1786-4947-94a6-ddbefc456122",
          "code": "ENTREPRISE",
          "name": "Entreprise"
        }
      },
      {
        "id": "7718a30b-ddd0-4efc-81d4-6cc3a41d7326",
        "company_id": "8c90c2ab-8c6a-4674-b940-1215a6b63054",
        "subscription_id": "5fe9d836-f550-40aa-bae3-b87d8ba26c8b",
        "plan_id": "1940d453-1786-4947-94a6-ddbefc456122",
        "amount": 120000,
        "currency": "XOF",
        "months": 2,
        "provider": "paydunya",
        "reference": "ABO-20261021-000003",
        "provider_transaction_id": "paydunya:test_bf1372f1a0",
        "status": "confirme",
        "checkout_url": "https://app.paydunya.com/sandbox-checkout/invoice/test_bf1372f1a0",
        "paid_at": "2026-10-21T12:36:22.989Z",
        "recorded_by": "b8052174-cba7-4d38-9ffd-cd2297814435",
        "note": null,
        "created_at": "2026-10-21T12:36:22.907Z",
        "updated_at": "2026-10-21T12:36:22.990Z",
        "plan": {
          "id": "1940d453-1786-4947-94a6-ddbefc456122",
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
      "id": "7718a30b-ddd0-4efc-81d4-6cc3a41d7326",
      "company_id": "8c90c2ab-8c6a-4674-b940-1215a6b63054",
      "plan_id": "1940d453-1786-4947-94a6-ddbefc456122",
      "amount": 120000,
      "currency": "XOF",
      "months": 2,
      "provider": "paydunya",
      "reference": "ABO-20261021-000003",
      "status": "initie",
      "recorded_by": "b8052174-cba7-4d38-9ffd-cd2297814435",
      "updated_at": "2026-10-21T12:36:22.920Z",
      "created_at": "2026-10-21T12:36:22.907Z",
      "subscription_id": null,
      "provider_transaction_id": "paydunya:test_bf1372f1a0",
      "checkout_url": "https://app.paydunya.com/sandbox-checkout/invoice/test_bf1372f1a0",
      "paid_at": null,
      "note": null
    },
    "checkout_url": "https://app.paydunya.com/sandbox-checkout/invoice/test_bf1372f1a0"
  }
}
```

</details>

**Erreurs observées :** 422 `PLAN_INDISPONIBLE` · 503 `PAIEMENT_NON_CONFIGURE`.

---

## Annexe A — Entités (champs renvoyés)

Champs de chaque entité tels que renvoyés par l’API (les secrets — mots de passe, clés, jetons — ne sont jamais renvoyés). Les réponses de détail ajoutent souvent des **relations incluses** (ex. `buyer`, `supplier`, `lines`) : leur forme exacte figure dans les exemples réels de chaque route.

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

