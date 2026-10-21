# Conventions de développement

Architecture identique à **Gestion Immo** (modules `route → controller → service → model`,
socle Express 5 / Sequelize / Joi / winston / JWT / R2 / Resend / FCM / PM2 / Docker).
Lire aussi `docs/ANALYSE_CAHIER_DES_CHARGES.md`.

## 1. Arborescence d'un module

```
src/modules/<module>/
  route/<module>.route.js            routes de l'espace entreprise (ou admin)
  controller/<module>.controller.js  mince : lit req, appelle le service, répond
  service/<module>.service.js        TOUTE la logique métier et l'accès aux données
  validation/<module>.validation.js  schémas Joi
```

Les routeurs sont montés dans `src/routes.js`, qui applique la garde de
l'espace : `espaceEntreprise` (auth, limite de débit, `requireEntreprise`,
`exigerAbonnementPourEcrire`) ou `espaceAdmin` (auth, limite de débit,
`requireRole('super_admin')`). Un routeur de module n'applique donc QUE
`requirePermission(P.X)` / `requireProfil('acheteur' | 'fournisseur')` +
`validate(...)` + `paginate()` / `idempotence()` / `recevoirFichier()`.
`requirePermission(P.A, P.B)` accepte l'UNE des permissions citées.

Le module `commande` sert deux routeurs sur les mêmes services : `/achats`
(côté acheteur, `req.cote = 'acheteur'`) et `/ventes` (côté fournisseur).

## 2. Contrôle d'accès (multi-entreprise) — non négociable

- Contexte posé par l'authentification : `req.companyId`, `req.companyType`,
  `req.memberRole` (rôle interne), `req.permissions`.
- Tout identifiant venant du client passe par `utils/acces.js` :
  - `chargerPourEntreprise(Modele, id, req.companyId, options, 'Libellé')` —
    ressource PROPRE à l'entreprise (produit, modèle, utilisateur…) : 404 si
    absente, 403 si autre entreprise ;
  - `chargerPartage(Modele, id, req.companyId, options, 'Libellé', { cote, visiblePar })` —
    ressource PARTAGÉE acheteur / fournisseur (commande, facture, paiement) :
    l'entreprise doit être l'une des deux parties ; un brouillon est invisible
    du fournisseur (404) ;
  - `verifierReference(...)` pour un id référencé dans le corps (422 si absent,
    403 si autre entreprise).
- Toute requête de liste filtre `company_id` (ou `buyer_company_id` /
  `supplier_company_id` selon le côté). Jamais de requête sur un id seul.
- Jamais de `company_id`, `status`, `amount_paid`, `revision`… accepté du
  client pour s'appliquer tel quel : Joi (`stripUnknown`) les retire.

## 3. Services

- Signature : `(companyId, ...)` ou `(id, companyId, donnees)` ; l'utilisateur
  (`req.user`) est passé quand il faut l'enregistrer (`created_by`, historique).
- Écritures dans `sequelize.transaction(async (t) => …)` ;
  `transactionAvecFichiers` (src/database/transaction.js) dès qu'un fichier est stocké.
- Verrou de ligne (`lock: t.LOCK.UPDATE`) avant toute transition de statut.
- Bons de commande : chaque changement de contenu crée une **version**
  (`order_versions` + `order_lines`), chaque action un **événement**
  (`order_events`) ; `revision` incrémentée → concurrence optimiste
  (409 `COMMANDE_MODIFIEE`).
- Journal d'audit dans la MÊME transaction :
  `journaliser({ action: '<ressource>.<action>', entityType, entityId, companyId, details }, t)`.
- Notifications : `notifierEntreprise(t, companyId, P.PERMISSION, { type, titre, corps, donnees })`
  (les membres qui détiennent la permission) ou `notifier(t, { destinataires, … })` —
  écrites dans la transaction, push + temps réel après COMMIT.
- Synchronisation web / mobile : `synchroniser(t, [companyIds], 'commande', { id, status, revision })`
  (événement SSE après COMMIT, données de navigation seulement).
- Suppression : logique (`paranoid`) ou statut `annule(e)` ; jamais de DELETE
  physique d'une donnée financière.
- Transitions : table `COMMANDE` de `config/transitions.js` + `verifierTransition`.
- Numérotation : `prochainNumero(\`company:${companyId}:order:${annee}\`, t)` + `pad()`
  (préfixes `order_prefix` / `invoice_prefix` des paramètres de l'entreprise).
- Limites du forfait : `droits.verifierLimite(companyId, 'products', t)` DANS la
  transaction de création ; fonctionnalités : `droits.exigerFonctionnalite(...)`.
- Prix d'une ligne : TOUJOURS `catalogue/service/tarification.service.js`
  (liste de prix du client, paliers) — jamais `product.price` directement.
- Stock : TOUJOURS `catalogue/service/stock.service.js` (réservation, sortie,
  libération, retour, mouvement tracé) — jamais un `update` direct de
  `stock_quantity` / `stock_reserved`.
- Argent dû : une facture se règle par `payment_allocations` ET
  `credit_note_allocations` ; `factures.recalculerStatut` est le seul point
  de mise à jour d'`amount_paid` / `amount_credited` ; une facture en écart de
  rapprochement (`match_status` ∈ ecart, conteste) ne reçoit aucune imputation.
- Erreurs : `throw new ConflictError(message, 'CODE_STABLE')` etc. (`errors/AppError.js`).
  Le code est en MAJUSCULES, stable, documenté.

## 4. Requêtes et performance

- Listes : `findAndCountAll` + `include` (jointures en une requête) +
  `distinct: true` si un `include` est `hasMany` + `order: ordre(req.query.tri, défaut)`.
- Agrégats (tableaux de bord, statistiques, dettes / créances) : une requête SQL
  (`sequelize.query` + `replacements` nommés, jamais de concaténation de valeurs
  client) ; `QueryTypes.SELECT`. Tableau de bord mis en cache (Redis, invalidé
  par les écritures).
- Jamais de requête dans une boucle sur des lignes (N+1).
- Montants : FCFA entiers (`BIGINT`) ; `utils/montants.js` (`montantLigne`,
  `totaliser` en BigInt — quantités décimales × prix unitaire, arrondi au franc).
- Dates métier : chaînes `AAAA-MM-JJ`, `utils/dates.js` (`aujourdhui()` dans le fuseau).

## 5. Contrôleurs et réponses

```js
exports.lister = asyncHandler(async (req, res) =>
  paginated(res, await S.lister(req.companyId, req.query, req.pagination), req.pagination));
exports.detail = asyncHandler(async (req, res) => ok(res, { product: await S.detail(req.params.id, req.companyId) }));
exports.creer  = asyncHandler(async (req, res) => created(res, { product: await S.creer(req.companyId, req.user, req.body) }, 'Produit créé'));
```

JSON en `snake_case`. Enveloppe : `{ success, message, data }` ; listes :
`data: { items, pagination }`. Les erreurs ne sont JAMAIS formatées à la main.

## 6. Validation

`validations/common.js` : `uuid`, `telephone` (normalisé E.164), `email`,
`montant`, `montantPositif`, `dateIso`, `tri([...])`, `recherche`, `pagination`,
`paramId`. Toute chaîne est bornée (`max`). Les énumérations viennent de
`config/enums.js` (`codes(ENUM)`).

## 7. Fichiers

Route : `recevoirFichier('image' | 'justificatif' | 'document')` (pose
`req.fichier`) ; service : `documents.creerDocument({...}, t)` dans
`transactionAvecFichiers`. Le document porte `company_id`, éventuellement
`partner_company_id` et une `visibility` (privé ou partagé avec le partenaire).
Toute nouvelle route multipart est ajoutée à la regex de `deploy/nginx.conf`.

## 8. Tests

Jest + supertest sur une vraie base PostgreSQL (`src/__tests__/integration`),
aides dans `src/__tests__/setup/helpers.js`. Chaque module teste au minimum :
parcours nominal, validation (422), accès d'une AUTRE entreprise (403/404),
permission du rôle interne (403), ressource absente (404), règles métier et
transitions interdites (409). Voir `docs/TESTS.md`.

## 9. Style

Commentaires en français, expliquant le POURQUOI (règle du cahier des charges
citée par son §). Pas de TODO, pas de code mort, pas de donnée fictive.
