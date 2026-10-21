# Analyse du cahier des charges — traçabilité vers le code

Cahier des charges : *Pro2Link — Plateforme B2B Web & Mobile* (acheteurs et
fournisseurs professionnels). Ce document relie chaque section (§) aux
modules, tables, routes et règles qui l'implémentent. Périmètre livré :
**backend seul** (API unique pour le web et le mobile).

## 1. Acteurs et espaces (§ 5, § 24)

| Acteur | Représentation | Espace |
|---|---|---|
| Entreprise acheteuse / fournisseur / mixte | `companies.type` ∈ `acheteur`, `fournisseur`, `mixte` | `/api/v1/*` (hors `/admin`) |
| Utilisateur interne (§ 5.3) | `company_members` (un compte = une entreprise) avec `role_code` | permissions du rôle interne |
| Administrateur Pro2Link (§ 5.4) | `users` de rôle plateforme `super_admin`, double authentification obligatoire | `/api/v1/admin/*` |

Rôles internes et permissions (`src/config/permissions.js`, synchronisés en base à chaque démarrage) :

| Rôle | Périmètre |
|---|---|
| Administrateur | tout l'espace entreprise (profil, utilisateurs, abonnement, modèles…) |
| Responsable achats | fournisseurs, catalogues, bons de commande, réception, consultation factures / paiements |
| Responsable commandes | catalogue produits, traitement des commandes reçues (accepter, modifier, statuts, livraison) |
| Comptable | factures (émission), paiements (enregistrement, confirmation), modèles de documents, statistiques |
| Réceptionnaire | consultation des achats et confirmation de réception |
| Commercial | clients, catalogue, commandes reçues, consultation factures / paiements |

Le menu des applications s'appuie sur `GET /compte` (permissions effectives) ;
l'API refuse toute action hors permission (**403 PERMISSION_REFUSEE**) et toute
action d'acheteur par une entreprise uniquement fournisseur, ou l'inverse
(**403 PROFIL_ENTREPRISE_INCOMPATIBLE**).

## 2. Traçabilité par section

| § | Exigence | Implémentation |
|---|---|---|
| 6 | Espace propre par entreprise : nom, logo, adresse, téléphone, e-mail, NINEA, RCCM, informations fiscales, utilisateurs, rôles | module `entreprise` (`GET/PATCH /entreprise`, `/entreprise/logo`, `/entreprise/parametres`) ; table `companies` (NINEA unique, régime fiscal, secteur) ; module `utilisateur` (invitations, rôles, désactivation) ; isolation : `req.companyId` + `utils/acces.js` sur toute requête |
| 7 | Rechercher / ajouter un fournisseur, gérer ses clients, profil, historique, factures, montants dus | module `partenaire` : annuaire (`/annuaire`), partenariats (`/partenariats` : demande, acceptation, refus, suspension, réactivation, acceptation automatique paramétrable), invitation d'une entreprise absente de la plateforme (rattachée à son inscription), relevé par partenaire (`/partenariats/:id/releve`) ; tables `partnerships`, `partnership_invitations` |
| 8 | Catalogue : nom, référence, description, photo, unité, prix, disponibilité, catégorie ; ajouter, modifier, désactiver, changer prix / disponibilité ; l'acheteur consulte ses fournisseurs | module `catalogue` : `/produits` (+ `/prix`, `/disponibilite`, `/activer`, `/desactiver`, `/photo`), `/categories-produits`, `/catalogues/:supplierId/*` (réservé aux partenaires actifs) ; tables `products`, `product_categories` ; référence unique par entreprise |
| 9 | Bon de commande sans panier : produits + quantités → numéro, parties, prix, total, date, conditions ; envoi | module `commande` (`/achats`) : brouillon `POST /achats`, prix figés depuis le catalogue, totaux HT / TVA / TTC en FCFA (BigInt), numéro `BC-AAAA-NNNNN` (préfixe paramétrable), montant en lettres sur le PDF, conditions par défaut de l'entreprise ; `POST /achats/:id/envoyer` ; PDF `GET /achats/:id/bon-de-commande.pdf` |
| 10 | Fournisseur : accepter, ou modifier (quantité, retrait, substitution, indisponibilité) → proposition ; acheteur : accepter, refuser, redemander | `/ventes/:id/prendre-en-charge`, `/accepter`, `/proposer` (modifications ligne à ligne : quantité, retrait, ajout / substitution, indisponibilité, commentaire), `/refuser` ; côté acheteur `/achats/:id/accepter-proposition`, `/refuser-proposition`, `/demander-modification` |
| 11 | Validation automatique à l'acceptation ; version validée commune, référence officielle | chaque proposition crée une **version** (`order_versions`, `order_lines`) ; l’acceptation fige la version proposée (statut `acceptee`, les précédentes `remplacee`) : c’est la version commune de référence ; écarts consultables `GET /achats/:id/versions` |
| 12 | Statuts Brouillon → … → Terminée ; fournisseur = statuts opérationnels, acheteur = réception | `config/transitions.js` (table des transitions + qui peut agir), `STATUT_COMMANDE` (plus `refusee`, `annulee`) ; `POST /ventes/:id/statut` (en préparation, prête) ; concurrence optimiste par `revision` (**409 COMMANDE_MODIFIEE**) |
| 13 | Livraison déclarée par le fournisseur, réception confirmée par l'acheteur, puis facturation | `POST /ventes/:id/livrer` (bon de livraison en pièce jointe possible) → notification acheteur → `POST /achats/:id/confirmer-reception` (quantités reçues, réserves) → statut `reception_confirmee` |
| 14 | Facture associée à la commande, notification, consultation, téléchargement, historique | module `facture` : `POST /factures` (générée depuis la version validée et les quantités reçues, ou **importée** en PDF), `GET /factures/:id/pdf`, une seule facture active par commande ; commande `facturee` puis `terminee` au solde |
| 15 | Modèles de bon de commande et de facture importés, sinon standard ; remplaçables | module `modele` : `/modeles-documents` (versionnés, un actif par type, archivage → retour au standard), aperçu PDF ; table `document_templates` ; rendu `rendu.service.js` (logo, couleurs, marges, fond, pied de page) |
| 16 | Dettes (acheteur) et créances (fournisseur) par partenaire, factures payées / en attente, paiements, solde | module `paiement` (déclaration par l'acheteur, enregistrement / confirmation / rejet / annulation, preuve, imputation FIFO sur les factures, excédent conservé en crédit et imputé sur les factures suivantes) ; module `situation` : `/situation/dettes`, `/situation/creances`, relevé chronologique ; solde = factures − paiements confirmés |
| 17 | Notifications web et mobile (+ push) sur tous les événements listés, échéance / montant dû | module `notification` (in-app, compteur, lu / tout lire), push FCM (`device_tokens`), destinataires choisis par **permission** dans l'entreprise ; tâche `echeances_factures` (rappel avant échéance, passage en retard) |
| 18 | Tableau de bord acheteur | module `dashboard` (`GET /tableau-de-bord`, bloc `buyer`) : commandes en cours / à réceptionner, fournisseurs, factures, montants dus, paiements, dernières activités, notifications non lues |
| 19 | Tableau de bord fournisseur | même route, bloc `supplier` : nouvelles commandes, à traiter, en préparation, livrées, factures émises, paiements reçus, créances par client, activité commerciale |
| 20 | Historique de chaque commande : qui, quoi, quand, vu des deux parties | `order_events` (création, envoi, proposition, acceptation, statuts, livraison, réception, facture, paiement, commentaires) : `GET /achats/:id/historique` ; journal d'audit immuable (`audit_logs`, déclencheur ajout seul) |
| 21–22 | Sections web et fonctionnalités mobiles | une seule API : chaque section correspond à un groupe de routes (voir `docs/API.md`) ; réponses légères et paginées pour le mobile |
| 23 | Synchronisation web / mobile immédiate | flux Server-Sent Events (`/evenements/ticket` + `/evenements/flux`) publié après COMMIT, diffusé via Redis entre processus ; push FCM en arrière-plan ; filtre `modifie_depuis` sur les listes |
| 24 | Authentification, rôles, permissions, séparation, API sécurisée, historique | JWT 15 min + refresh tournant (détection de réutilisation), double authentification TOTP, verrouillage après échecs, limites de débit, helmet, CORS strict, validation Joi, contrôle de propriété systématique, audit |
| 25 | Abonnement : création, forfait, essai, renouvellement, changement, expiration, suspension | module `abonnement` : forfaits (`subscription_plans` : limites utilisateurs / produits / partenaires / commandes par mois, fonctionnalités), essai automatique à l'inscription, souscription PayDunya + IPN, activation manuelle par l'admin, tâche `abonnements` (expiration → lecture seule, **402**) ; admin : suspension / réactivation / annulation |
| 26 | MVP | intégralement couvert (voir § 3) |
| 27 | Évolutions futures | hors périmètre ; l'architecture les accueille (paiement en ligne : fournisseur PayDunya déjà intégré pour les abonnements) |
| 28 | Parcours global | test de bout en bout `src/__tests__/e2e/parcours-global.test.js` |
| 5.4 | Administration Pro2Link | module `admin` : entreprises (suspendre / réactiver), utilisateurs et super admins, abonnements et paiements, forfaits, paramètres de la plateforme, diffusion de notifications, journal d'audit, statistiques |

## 3. MVP (§ 26) — vérification

| Élément | Route(s) |
|---|---|
| Création du compte et de l'entreprise | `POST /auth/inscription` (compte administrateur + entreprise + essai) |
| Ajout de fournisseurs / gestion des clients | `/annuaire`, `/partenariats`, `/partenariats/invitations` |
| Consultation des produits / gestion des produits | `/catalogues/:supplierId/produits`, `/produits` |
| Bon de commande, envoi | `POST /achats`, `POST /achats/:id/envoyer` |
| Réception, acceptation ou modification, proposition | `/ventes/:id/accepter`, `/ventes/:id/proposer` |
| Acceptation de la proposition | `/achats/:id/accepter-proposition` |
| Statuts, suivi | `/ventes/:id/statut`, `/ventes/:id/livrer`, `/achats/:id/historique` |
| Confirmation de réception | `/achats/:id/confirmer-reception` |
| Facturation, réception de la facture | `POST /factures`, `GET /factures` |
| Paiements, montants dus, créances | `/paiements`, `/situation/dettes`, `/situation/creances` |
| Authentification, notifications, documents, modèles, synchronisation, rôles, administration | `/auth`, `/notifications`, `/documents`, `/modeles-documents`, `/evenements`, `/utilisateurs`, `/admin/*` |

## 4. Modèle de données (30 tables)

| Domaine | Tables |
|---|---|
| Socle | `roles`, `users`, `refresh_tokens`, `password_resets`, `device_tokens`, `platform_settings`, `idempotency_keys`, `counters`, `audit_logs`, `notifications`, `documents` |
| Entreprises | `companies`, `company_members`, `member_invitations` |
| Abonnement | `subscription_plans`, `subscriptions`, `subscription_payments` |
| Réseau et catalogue | `partnerships`, `partnership_invitations`, `product_categories`, `products` |
| Commandes | `orders`, `order_versions`, `order_lines`, `order_events` |
| Facturation et paiements | `document_templates`, `invoices`, `invoice_lines`, `payments`, `payment_allocations` |

Les invariants sont garantis par la base (CHECK, UNIQUE, index partiels,
clés étrangères) : montants positifs, une facture active par commande, une
imputation ne dépasse ni le paiement ni la facture, un modèle actif par type et
par entreprise, un compte rattaché à une seule entreprise, journal d'audit en
ajout seul. Les énumérations de `config/enums.js` sont comparées aux CHECK SQL
par un test dédié.

## 5. Choix et hypothèses

- **Une entreprise peut être acheteuse ET fournisseur** (`mixte`) : les deux
  côtés d'une commande sont servis par `/achats` et `/ventes`.
- **Partenariat préalable** : on ne commande qu'à un fournisseur partenaire
  actif (relation acceptée par les deux parties ; acceptation automatique
  paramétrable). Le catalogue n'est visible que des partenaires.
- **Paiements entre entreprises** : enregistrés (espèces, virement, chèque, Wave, Orange Money,
  mobile money…) avec preuve, pas encaissés par la plateforme (§ 27 : paiement
  en ligne = évolution). Le paiement déclaré par l'acheteur ne compte qu'une
  fois **confirmé** par le fournisseur ; celui enregistré par le fournisseur
  est confirmé d'emblée.
- **Tarifs** (§ 25 : « définis ultérieurement ») : trois forfaits de départ
  (Essentiel, Business, Entreprise) modifiables par le super admin ; essai de
  30 jours paramétrable.
- **Montants** en FCFA entiers ; TVA par ligne (taux du produit).
