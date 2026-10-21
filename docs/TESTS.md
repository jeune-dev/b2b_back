# Stratégie de tests

Objectif : prouver que le backend est **fiable, sécurisé et conforme au cahier
des charges** — pas seulement qu'il répond 200. Chaque test vérifie le statut
HTTP, **le contenu de la réponse, l'état de la base et les effets de bord**
(montants, statuts, versions et historique des commandes, imputations des
paiements, journal d'audit, notifications, événements temps réel, fichiers).

État de référence : **43 fichiers, 1 062 tests, 219 routes sur 219 appelées**,
couverture ≈ 92 % des instructions, 78 % des branches, 92 % des fonctions,
94 % des lignes (seuils bloquants dans `jest.config.js`).

## 1. Organisation

```
src/__tests__/
  setup/              env.js (base par worker), globalSetup.js (migrations + seeders,
                      clonage), helpers.js (création par l'API : entreprises,
                      partenariats, produits, commandes, factures, collaborateurs),
                      paydunyaSimule.js, routeHits.js (couverture des routes)
  unit/               sans base de données
    services/         règles métier pures (montants, transitions, lignes modifiées…)
    utils/ middlewares/ infrastructure/ config/ validations/ models/ statistiques/
  integration/        API HTTP réelle (supertest) + vraie base PostgreSQL
    api/<domaine>/    auth, compte, partenaires-catalogue, commandes,
                      facturation-paiements, pilotage (modèles, statistiques,
                      tableaux de bord), notifications-temps-reel, abonnement,
                      admin, compléments, achats-avances (tarifs et minimums,
                      stock, saisie rapide et listes d'achat, approbation et crédit,
                      livraisons partielles et litiges, rapprochement / relances /
                      exports comptables / import du catalogue)
    securite/         matrices sur TOUTES les routes (authentification, espaces,
                      identifiants malformés, tri / recherche, affectation de masse)
    postgres/         cohérence énumérations ↔ CHECK, rôles SQL, audit immuable
    concurrence/      courses critiques (acceptation / refus simultanés, factures
                      en double, paiements simultanés, numérotation, partenariats croisés)
    jobs/             échéances de factures, expiration des abonnements, nettoyage
  e2e/                parcours complets : § 28 (de l'annuaire au solde à zéro),
                      compte et sécurité
```

## 2. Commandes

| Commande | Rôle |
|---|---|
| `npm test` | Toute la suite (unit + integration + e2e), en parallèle |
| `npm run test:unit` | Tests unitaires seuls (aucune base) |
| `npm run test:integration` | API, sécurité, PostgreSQL, concurrence, tâches |
| `npm run test:e2e` | Parcours de bout en bout |
| `npm run test:coverage` | Toute la suite avec couverture (`coverage/`) |
| `npm run test:routes` | Après une exécution : routes testées / non testées (`coverage/routes.md`) |
| `npm run test:serie` | Exécution séquentielle (diagnostic) |
| `npm run test:ordre-aleatoire` | Ordre des tests aléatoire (preuve d'indépendance) |
| `npx jest --runTestsByPath <fichiers>` | Fichiers précis |

`JEST_WORKERS=<n>` règle le parallélisme (2 par défaut : postes à mémoire limitée).

## 3. Base de données de test

- `.env.test` (jamais `.env`) ; `DB_NAME` **doit contenir « test »**, sinon la
  suite refuse de démarrer — la base de production ne peut pas être touchée.
- `globalSetup` reconstruit la base **modèle** exactement comme un déploiement
  (migrations, seeders, rôles), puis en **clone une par worker**
  (`CREATE DATABASE … TEMPLATE`) : l'exécution parallèle est isolée.
- L'application se connecte avec un rôle SQL aux droits minimaux, comme en
  production (`DB_USER` ≠ `DB_ADMIN_USER`).
- Aucun test ne dépend d'un autre : chacun crée ses propres entreprises,
  partenariats et produits via l'API (téléphones, e-mails et NINEA uniques).
- Seuls les appels SORTANTS vers des tiers sont simulés (PayDunya, FCM,
  Resend). Base, transactions, fichiers, PDF, flux SSE : réels.

## 4. Ce que couvre chaque niveau

| Niveau | Garanties |
|---|---|
| Unitaire | montants (BigInt, TVA, arrondi au franc, montant en lettres), table des transitions, lignes modifiées d'une proposition, dates, validations Joi, normalisation d'erreurs, chiffrement, TOTP, stockage, images, PDF, CSV, garde-fous de démarrage en production |
| API | pour chaque route : nominal, 401/402/403/404/409/422, permissions de chaque rôle interne, profil acheteur / fournisseur, pagination, filtres, tri, règles métier en succès et en échec, effets en base |
| Sécurité | toutes les routes LUES sur le routeur : sans jeton → 401 ; super admin hors de l'admin et entreprise dans l'admin → 403 ; identifiant non UUID → 422 (jamais 500) ; tri hors liste blanche refusé ; champs imposés par le client ignorés |
| PostgreSQL | énumérations comparées aux CHECK ; rôle applicatif sans droit DDL ; journal d'audit non modifiable |
| Concurrence | actions simultanées sur une commande, factures en double, paiements simultanés plafonnés, idempotence, numérotation, partenariats croisés |
| Achats avancés | prix client (liste, paliers) au catalogue et dans les lignes ; minimum / multiple / maximum ; réservation et sortie de stock, alertes ; références, recommander, import CSV (lignes du fichier citées), listes d'achat (arrondis) ; approbation (auteur exclu, envoi automatique, rejet, palier double) ; plafond de crédit et retards ; livraisons partielles, reliquat, BL PDF ; litiges → avoirs imputés, soldes et relevés ; écart de rapprochement bloquant le paiement ; relances une fois par palier ; journaux comptables équilibrés ; import / export du catalogue |
| E2E | § 28 complet (annuaire → partenariat → catalogue → bon de commande → proposition modifiée → acceptation → statuts → livraison → réception → facture → paiement → solde nul), compte et sécurité |

Une route ajoutée demain est **automatiquement** soumise aux matrices de
sécurité ; `npm run test:routes` signale toute route jamais appelée.

## 5. Contrats d'API

`npm run doc:contrats:capture` rejoue la suite en enregistrant une vraie
requête et sa réponse par route (`CONTRAT_CAPTURE=1`), puis régénère
`docs/CONTRAT-API-MOBILE.md` et `docs/CONTRAT-API-ADMIN.md`.

## 6. Règles d'écriture

- Tester le comportement observable (réponse + base), pas l'implémentation.
- Un test qui révèle un bug : **on corrige le backend**, jamais le test.
- Toujours au moins un cas d'échec par règle métier.
- Noms de tests en français, décrivant la règle (§ du cahier des charges).
- Aucune attente arbitraire (`sleep`) : les courses sont provoquées par `Promise.all`.
