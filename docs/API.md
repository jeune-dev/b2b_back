# Référence de l'API — /api/v1

Générée depuis le routeur réel : `npm run doc:routes` (215 routes). Le détail
de chaque route (corps, réponses, permissions, exemples réels) est dans
[CONTRAT-API-MOBILE.md](CONTRAT-API-MOBILE.md) et
[CONTRAT-API-ADMIN.md](CONTRAT-API-ADMIN.md).

## Conventions

- **Authentification** : `Authorization: Bearer <access_token>` (15 min). Renouvellement : `POST /api/v1/auth/refresh` avec `refresh_token` (mobile, dans le corps) ou le cookie httpOnly `refresh_token` (web). Rotation à chaque appel.
- **Espaces** : routes entreprise (membre d'une entreprise active ; abonnement actif pour écrire — sinon **402 ABONNEMENT_REQUIS**, l'espace reste consultable), `/admin/*` (super admin, double authentification obligatoire). Chaque route exige une permission (`src/config/permissions.js`) dérivée du rôle interne.
- **Côtés d'une commande** : `/achats` = l'entreprise est l'acheteur, `/ventes` = l'entreprise est le fournisseur. Une même commande est visible des deux parties ; un **brouillon** reste invisible du fournisseur (404).
- **Accès horizontal** : ressource d'une autre entreprise → **403** ou **404**, jamais ses données.
- **Réponse** : `{ success, message, data }` ; listes : `data: { items, pagination: { page, limit, total, totalPages } }` ; `?page=` et `?limit=` (100 max) ; tri `?tri=champ` ou `?tri=-champ` (liste blanche).
- **Erreur** : `{ success: false, message, error: { code, message, details? }, requestId }` — codes HTTP : 400, 401, 402, 403, 404, 409 (état / transition), 413, 422 (validation), 429, 503 (réessayable, en-tête Retry-After).
- **Idempotence** : en-tête `Idempotency-Key` (8–128 car.) ; OBLIGATOIRE sur `POST /paiements` (sinon **422 IDEMPOTENCE_REQUISE**). Même clé + même requête → réponse rejouée (`Idempotent-Replayed: true`).
- **Concurrence** : une commande porte une `revision` ; envoyée avec une action de négociation, une révision dépassée donne **409 COMMANDE_MODIFIEE**.
- **Synchronisation** : `POST /evenements/ticket` puis flux SSE `GET /evenements/flux?ticket=…` ; listes filtrables par `modifie_depuis`.
- **Fichiers** : multipart, champ `fichier` ; type réel vérifié par signature binaire ; lecture via `GET /documents/:id/fichier` (`?taille=miniature`).
- **Montants** : FCFA entiers. **Dates** : `AAAA-MM-JJ`. **JSON** : snake_case.
- **Corrélation** : chaque réponse porte `X-Request-Id` (à citer au support).

## Règles métier à connaître côté client

| Situation | Réponse |
|---|---|
| Action non permise par le rôle interne (ex. réceptionnaire qui crée une commande) | **403 PERMISSION_REFUSEE** |
| Action d'acheteur par une entreprise uniquement fournisseur (ou l'inverse) | **403 PROFIL_ENTREPRISE_INCOMPATIBLE** |
| Super admin sur une route d'entreprise | **403 ESPACE_ENTREPRISE_REQUIS** |
| Commande à un fournisseur sans partenariat actif (ou suspendu) ; paiement hors partenariat | **403 PARTENARIAT_INACTIF** ; **409 PARTENARIAT_INACTIF** |
| Transition de statut non prévue (ex. livrer une commande non validée) | **409 TRANSITION_INVALIDE** |
| Action réservée à l'autre partie (ex. l'acheteur confirme sa propre proposition) | **403 ACTION_RESERVEE_AUTRE_PARTIE** |
| Commande modifiée entre-temps (révision dépassée) | **409 COMMANDE_MODIFIEE** — recharger |
| Limite du forfait (utilisateurs, produits, partenaires, commandes / mois) | **403 LIMITE_ABONNEMENT** |
| Fonctionnalité hors forfait (modèles de documents, statistiques, exports) | **403 FONCTIONNALITE_NON_INCLUSE** |
| Bon de commande sous le montant minimum du fournisseur | **422 MINIMUM_COMMANDE** |
| Encours + commande au-delà du plafond de crédit ; facture échue avec blocage activé | **409 PLAFOND_CREDIT_DEPASSE** ; **409 RETARD_DE_PAIEMENT** |
| Envoi d'un bon au-delà d'un seuil d'approbation | 200, `submitted_for_approval: true` (le bon part à la dernière approbation) |
| Approbation par l'auteur du bon ; approbateurs trop peu nombreux | **403 APPROBATION_PAR_AUTEUR** ; **409 APPROBATEURS_INSUFFISANTS** |
| Quantité hors minimum / multiple / maximum du produit | **422 LIGNES_INVALIDES** (détail par ligne) |
| Validation d'une commande au-delà du stock suivi disponible | **409 STOCK_INSUFFISANT** (détail par ligne) |
| Livraison au-delà du reste à livrer ; plus rien à livrer | **422 LIVRAISON_INVALIDE** ; **409 RIEN_A_LIVRER** |
| Litige au-delà de la quantité reçue non contestée ; commande non livrée | **422 LITIGE_INVALIDE** ; **409 COMMANDE_NON_LIVREE** |
| Facture en écart de rapprochement : paiement ou relance | imputation refusée (**422 IMPUTATION_INVALIDE**), `payment_blocked: true` ; **409 FACTURE_BLOQUEE** |
| Avoirs d'une facture au-delà de son montant | **422 AVOIR_EXCESSIF** |
| Relance manuelle moins de 24 h après la précédente | **409 RELANCE_RECENTE** |
| Import CSV invalide (commande ou catalogue) | **422 IMPORT_INVALIDE** (une erreur par ligne du fichier, rien n'est écrit) |
| Abonnement échu ou suspendu, toute écriture | **402 ABONNEMENT_REQUIS** |
| Retirer le dernier administrateur de l'entreprise | **409 DERNIER_ADMINISTRATEUR** |
| Supprimer une catégorie qui contient des produits | **409 CATEGORIE_NON_VIDE** |
| Référence produit déjà utilisée dans l'entreprise | **409 REFERENCE_UTILISEE** |
| Annuler une facture sur laquelle des paiements sont imputés | **409 FACTURE_PAYEE** |
| Confirmer / rejeter un paiement déjà traité | **409 PAIEMENT_CLOS** |
| Ticket de flux temps réel invalide ou expiré (60 s) | **401 TICKET_INVALIDE** |
| Connexion d'un compte à double authentification | 200 `{ mfa_requis: true, mfa_token }` puis `POST /auth/mfa` |
| Compte à mot de passe provisoire | **403 CHANGEMENT_MOT_DE_PASSE_REQUIS** sauf `GET /compte`, `POST /compte/mot-de-passe`, déconnexion |
| Téléversements simultanés / serveur saturé | **429 TELEVERSEMENTS_SIMULTANES** / **503 TELEVERSEMENTS_SATURES** |
| Paiement d'abonnement sans PayDunya configuré | **503 PAIEMENT_NON_CONFIGURE** |

## Routes

### supervision

| Méthode | Chemin |
|---|---|
| GET | `/health/live` |
| GET | `/health` |
| GET | `/health/ready` |
| GET | `/metrics` |

### auth

| Méthode | Chemin |
|---|---|
| POST | `/api/v1/auth/inscription` |
| POST | `/api/v1/auth/connexion` |
| POST | `/api/v1/auth/mfa` |
| POST | `/api/v1/auth/refresh` |
| POST | `/api/v1/auth/deconnexion` |
| POST | `/api/v1/auth/mot-de-passe-oublie` |
| POST | `/api/v1/auth/reinitialiser-mot-de-passe` |
| POST | `/api/v1/auth/invitation/activation` |

### referentiels

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/referentiels/` |

### abonnement

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/abonnement/plans/` |

### webhooks

| Méthode | Chemin |
|---|---|
| POST | `/api/v1/webhooks/abonnement/paydunya` |

### compte

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/compte/` |
| PATCH | `/api/v1/compte/` |
| POST | `/api/v1/compte/mot-de-passe` |
| GET | `/api/v1/compte/sessions` |
| DELETE | `/api/v1/compte/sessions/:id` |
| POST | `/api/v1/compte/sessions/revoquer-toutes` |
| POST | `/api/v1/compte/appareils` |
| POST | `/api/v1/compte/mfa/initialiser` |
| POST | `/api/v1/compte/mfa/activer` |
| POST | `/api/v1/compte/mfa/desactiver` |
| POST | `/api/v1/compte/mfa/codes-secours` |
| DELETE | `/api/v1/compte/appareils` |

### notifications

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/notifications/` |
| GET | `/api/v1/notifications/compteur` |
| POST | `/api/v1/notifications/tout-lire` |
| POST | `/api/v1/notifications/:id/lue` |

### evenements

| Méthode | Chemin |
|---|---|
| POST | `/api/v1/evenements/ticket` |
| GET | `/api/v1/evenements/flux` |

### tableau-de-bord

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/tableau-de-bord/` |

### entreprise

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/entreprise/` |
| PATCH | `/api/v1/entreprise/` |
| PATCH | `/api/v1/entreprise/parametres` |
| POST | `/api/v1/entreprise/logo` |
| DELETE | `/api/v1/entreprise/logo` |

### utilisateurs

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/utilisateurs/` |
| GET | `/api/v1/utilisateurs/invitations` |
| POST | `/api/v1/utilisateurs/invitations` |
| POST | `/api/v1/utilisateurs/invitations/:id/renvoyer` |
| DELETE | `/api/v1/utilisateurs/invitations/:id` |
| GET | `/api/v1/utilisateurs/:id` |
| PATCH | `/api/v1/utilisateurs/:id` |
| POST | `/api/v1/utilisateurs/:id/desactiver` |
| POST | `/api/v1/utilisateurs/:id/reactiver` |

### annuaire

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/annuaire/` |
| GET | `/api/v1/annuaire/:id` |

### partenariats

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/partenariats/` |
| POST | `/api/v1/partenariats/` |
| GET | `/api/v1/partenariats/invitations` |
| POST | `/api/v1/partenariats/invitations` |
| DELETE | `/api/v1/partenariats/invitations/:id` |
| GET | `/api/v1/partenariats/:id` |
| PATCH | `/api/v1/partenariats/:id` |
| POST | `/api/v1/partenariats/:id/accepter` |
| POST | `/api/v1/partenariats/:id/refuser` |
| POST | `/api/v1/partenariats/:id/suspendre` |
| POST | `/api/v1/partenariats/:id/reactiver` |
| GET | `/api/v1/partenariats/:id/releve` |

### produits

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/produits/` |
| POST | `/api/v1/produits/` |
| GET | `/api/v1/produits/export.csv` |
| GET | `/api/v1/produits/import/modele.csv` |
| POST | `/api/v1/produits/import` |
| GET | `/api/v1/produits/stock/alertes` |
| GET | `/api/v1/produits/:id` |
| PATCH | `/api/v1/produits/:id` |
| PATCH | `/api/v1/produits/:id/prix` |
| PATCH | `/api/v1/produits/:id/disponibilite` |
| POST | `/api/v1/produits/:id/activer` |
| POST | `/api/v1/produits/:id/desactiver` |
| POST | `/api/v1/produits/:id/photo` |
| DELETE | `/api/v1/produits/:id/photo` |
| POST | `/api/v1/produits/:id/stock` |
| GET | `/api/v1/produits/:id/mouvements-stock` |
| DELETE | `/api/v1/produits/:id` |

### categories-produits

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/categories-produits/` |
| POST | `/api/v1/categories-produits/` |
| PATCH | `/api/v1/categories-produits/:id` |
| DELETE | `/api/v1/categories-produits/:id` |

### catalogues

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/catalogues/:supplierId/produits` |
| GET | `/api/v1/catalogues/:supplierId/produits/:id` |
| GET | `/api/v1/catalogues/:supplierId/categories` |

### listes-prix

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/listes-prix/` |
| POST | `/api/v1/listes-prix/` |
| GET | `/api/v1/listes-prix/:id` |
| PATCH | `/api/v1/listes-prix/:id` |
| DELETE | `/api/v1/listes-prix/:id` |

### listes-achat

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/listes-achat/` |
| POST | `/api/v1/listes-achat/` |
| GET | `/api/v1/listes-achat/:id` |
| PATCH | `/api/v1/listes-achat/:id` |
| DELETE | `/api/v1/listes-achat/:id` |
| POST | `/api/v1/listes-achat/:id/commander` |

### achats

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/achats/` |
| POST | `/api/v1/achats/` |
| POST | `/api/v1/achats/import` |
| GET | `/api/v1/achats/approbations` |
| GET | `/api/v1/achats/:id` |
| PATCH | `/api/v1/achats/:id` |
| GET | `/api/v1/achats/:id/versions` |
| GET | `/api/v1/achats/:id/historique` |
| GET | `/api/v1/achats/:id/bon-de-commande.pdf` |
| POST | `/api/v1/achats/:id/envoyer` |
| POST | `/api/v1/achats/:id/approuver` |
| POST | `/api/v1/achats/:id/rejeter-approbation` |
| POST | `/api/v1/achats/:id/recommander` |
| POST | `/api/v1/achats/:id/accepter-proposition` |
| POST | `/api/v1/achats/:id/refuser-proposition` |
| POST | `/api/v1/achats/:id/demander-modification` |
| POST | `/api/v1/achats/:id/annuler` |
| POST | `/api/v1/achats/:id/confirmer-reception` |
| GET | `/api/v1/achats/:id/livraisons` |
| POST | `/api/v1/achats/:id/livraisons/:livraisonId/reception` |
| GET | `/api/v1/achats/:id/livraisons/:livraisonId/bon-de-livraison.pdf` |
| POST | `/api/v1/achats/:id/solder-reliquat` |
| POST | `/api/v1/achats/:id/commentaires` |
| POST | `/api/v1/achats/:id/pieces-jointes` |

### ventes

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/ventes/` |
| GET | `/api/v1/ventes/:id` |
| GET | `/api/v1/ventes/:id/versions` |
| GET | `/api/v1/ventes/:id/historique` |
| GET | `/api/v1/ventes/:id/bon-de-commande.pdf` |
| POST | `/api/v1/ventes/:id/prendre-en-charge` |
| POST | `/api/v1/ventes/:id/accepter` |
| POST | `/api/v1/ventes/:id/proposer` |
| POST | `/api/v1/ventes/:id/refuser` |
| POST | `/api/v1/ventes/:id/statut` |
| POST | `/api/v1/ventes/:id/livrer` |
| GET | `/api/v1/ventes/:id/livraisons` |
| POST | `/api/v1/ventes/:id/livraisons` |
| POST | `/api/v1/ventes/:id/livraisons/:livraisonId/document` |
| GET | `/api/v1/ventes/:id/livraisons/:livraisonId/bon-de-livraison.pdf` |
| POST | `/api/v1/ventes/:id/solder-reliquat` |
| POST | `/api/v1/ventes/:id/annuler` |
| POST | `/api/v1/ventes/:id/commentaires` |
| POST | `/api/v1/ventes/:id/pieces-jointes` |

### factures

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/factures/` |
| POST | `/api/v1/factures/` |
| GET | `/api/v1/factures/:id` |
| GET | `/api/v1/factures/:id/pdf` |
| POST | `/api/v1/factures/:id/annuler` |
| POST | `/api/v1/factures/:id/accepter-ecart` |
| POST | `/api/v1/factures/:id/contester` |
| GET | `/api/v1/factures/:id/relances` |
| POST | `/api/v1/factures/:id/relancer` |

### avoirs

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/avoirs/` |
| POST | `/api/v1/avoirs/` |
| GET | `/api/v1/avoirs/:id` |
| GET | `/api/v1/avoirs/:id/pdf` |
| POST | `/api/v1/avoirs/:id/annuler` |

### litiges

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/litiges/` |
| POST | `/api/v1/litiges/` |
| GET | `/api/v1/litiges/:id` |
| POST | `/api/v1/litiges/:id/accepter` |
| POST | `/api/v1/litiges/:id/refuser` |
| POST | `/api/v1/litiges/:id/annuler` |
| POST | `/api/v1/litiges/:id/pieces-jointes` |

### paiements

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/paiements/` |
| POST | `/api/v1/paiements/` |
| GET | `/api/v1/paiements/:id` |
| POST | `/api/v1/paiements/:id/confirmer` |
| POST | `/api/v1/paiements/:id/rejeter` |
| POST | `/api/v1/paiements/:id/annuler` |
| POST | `/api/v1/paiements/:id/preuve` |

### situation

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/situation/dettes` |
| GET | `/api/v1/situation/creances` |

### statistiques

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/statistiques/achats` |
| GET | `/api/v1/statistiques/ventes` |
| GET | `/api/v1/statistiques/exports/:type.csv` |

### modeles-documents

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/modeles-documents/` |
| POST | `/api/v1/modeles-documents/` |
| GET | `/api/v1/modeles-documents/:id` |
| GET | `/api/v1/modeles-documents/:id/apercu.pdf` |
| POST | `/api/v1/modeles-documents/:id/archiver` |
| POST | `/api/v1/modeles-documents/:id/reactiver` |

### documents

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/documents/` |
| GET | `/api/v1/documents/:id/fichier` |
| GET | `/api/v1/documents/:id/lien` |
| DELETE | `/api/v1/documents/:id` |

### abonnement

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/abonnement/` |
| GET | `/api/v1/abonnement/paiements` |
| POST | `/api/v1/abonnement/souscrire` |

### admin/dashboard

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/admin/dashboard` |

### admin/statistiques

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/admin/statistiques` |

### admin/entreprises

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/admin/entreprises` |
| GET | `/api/v1/admin/entreprises/:id` |
| POST | `/api/v1/admin/entreprises/:id/suspendre` |
| POST | `/api/v1/admin/entreprises/:id/reactiver` |
| POST | `/api/v1/admin/entreprises/:companyId/abonnement/activer` |

### admin/abonnements

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/admin/abonnements` |
| GET | `/api/v1/admin/abonnements/:id` |
| POST | `/api/v1/admin/abonnements/:id/suspendre` |
| POST | `/api/v1/admin/abonnements/:id/reactiver` |
| POST | `/api/v1/admin/abonnements/:id/annuler` |

### admin/paiements-abonnements

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/admin/paiements-abonnements` |

### admin/utilisateurs

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/admin/utilisateurs` |
| POST | `/api/v1/admin/utilisateurs` |
| GET | `/api/v1/admin/utilisateurs/:id` |
| POST | `/api/v1/admin/utilisateurs/:id/desactiver` |
| POST | `/api/v1/admin/utilisateurs/:id/activer` |
| POST | `/api/v1/admin/utilisateurs/:id/deverrouiller` |
| POST | `/api/v1/admin/utilisateurs/:id/reinitialiser-acces` |

### admin/parametres

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/admin/parametres` |
| PUT | `/api/v1/admin/parametres/:cle` |

### admin/notifications

| Méthode | Chemin |
|---|---|
| POST | `/api/v1/admin/notifications` |
| GET | `/api/v1/admin/notifications` |

### admin/journal-audit

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/admin/journal-audit` |

### admin/roles

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/admin/roles` |

### admin/plans

| Méthode | Chemin |
|---|---|
| GET | `/api/v1/admin/plans` |
| POST | `/api/v1/admin/plans` |
| GET | `/api/v1/admin/plans/:id` |
| PATCH | `/api/v1/admin/plans/:id` |
| POST | `/api/v1/admin/plans/:id/activer` |
| POST | `/api/v1/admin/plans/:id/desactiver` |
| DELETE | `/api/v1/admin/plans/:id` |
