'use strict';

/**
 * Énumérations métier — SOURCE UNIQUE.
 *
 * Utilisées par les modèles, les schémas Joi, les CHECK SQL des migrations et
 * la route publique `/referentiels` lue par le mobile et le web. Un test
 * (`enums.coherence.test.js`) vérifie que chaque CHECK en base accepte
 * exactement ces valeurs : toute évolution passe par une nouvelle migration.
 *
 * Les libellés affichables sont fournis à côté des codes (clients sans
 * traduction à maintenir).
 */

const def = (entrees) => Object.freeze(Object.fromEntries(entrees));

/** Rôles de la plateforme (`users.role_code`). */
const ROLES = def([
  ['super_admin', 'Super administrateur'],
  ['utilisateur', "Utilisateur d'entreprise"],
]);

/** Rôles internes d'une entreprise (§ 5.3, `company_members.role_code`). */
const ROLES_ENTREPRISE = def([
  ['administrateur', 'Administrateur'],
  ['responsable_achats', 'Responsable achats'],
  ['responsable_commandes', 'Responsable commandes'],
  ['comptable', 'Comptable'],
  ['receptionnaire', 'Réceptionnaire'],
  ['commercial', 'Commercial'],
]);

const STATUT_UTILISATEUR = def([
  ['actif', 'Actif'],
  ['inactif', 'Inactif'],
]);

const STATUT_ENTREPRISE = def([
  ['actif', 'Active'],
  ['suspendu', 'Suspendue'],
]);

const STATUT_MEMBRE = def([
  ['actif', 'Actif'],
  ['inactif', 'Désactivé'],
]);

/** § 5 — une entreprise achète, vend, ou les deux. */
const TYPE_ENTREPRISE = def([
  ['acheteur', 'Acheteur'],
  ['fournisseur', 'Fournisseur'],
  ['mixte', 'Acheteur et fournisseur'],
]);

/** Public cible de la page de garde du cahier des charges. */
const SECTEUR_ACTIVITE = def([
  ['commerce', 'Commerce'],
  ['grande_surface', 'Grande surface'],
  ['restaurant', 'Restaurant'],
  ['hotel', 'Hôtel'],
  ['distribution', 'Distribution'],
  ['grossiste', 'Grossiste'],
  ['industrie', 'Industrie'],
  ['agroalimentaire', 'Agroalimentaire'],
  ['services', 'Services'],
  ['btp', 'BTP'],
  ['sante', 'Santé'],
  ['autre', 'Autre'],
]);

/** § 6 « informations fiscales » — régimes fiscaux sénégalais. */
const REGIME_FISCAL = def([
  ['reel_normal', 'Réel normal'],
  ['reel_simplifie', 'Réel simplifié'],
  ['cgu', 'Contribution globale unique (CGU)'],
  ['exonere', 'Exonéré'],
]);

/** § 7 — relation acheteur ↔ fournisseur. */
const STATUT_PARTENARIAT = def([
  ['en_attente', 'En attente'],
  ['actif', 'Actif'],
  ['refuse', 'Refusé'],
  ['suspendu', 'Suspendu'],
]);

/** Sens d'une relation vu par l'entreprise connectée. */
const RELATION = def([
  ['fournisseur', 'Fournisseur'],
  ['client', 'Client'],
]);

const STATUT_INVITATION_PARTENAIRE = def([
  ['en_attente', 'En attente'],
  ['acceptee', 'Acceptée'],
  ['expiree', 'Expirée'],
  ['annulee', 'Annulée'],
]);

/** § 8 — unité de vente d'un produit. */
const UNITE = def([
  ['piece', 'Pièce'],
  ['carton', 'Carton'],
  ['paquet', 'Paquet'],
  ['sac', 'Sac'],
  ['boite', 'Boîte'],
  ['bouteille', 'Bouteille'],
  ['douzaine', 'Douzaine'],
  ['lot', 'Lot'],
  ['palette', 'Palette'],
  ['kg', 'Kilogramme'],
  ['g', 'Gramme'],
  ['tonne', 'Tonne'],
  ['litre', 'Litre'],
  ['ml', 'Millilitre'],
  ['metre', 'Mètre'],
  ['m2', 'Mètre carré'],
  ['m3', 'Mètre cube'],
  ['heure', 'Heure'],
  ['forfait', 'Forfait'],
  ['autre', 'Autre'],
]);

/** § 8 — disponibilité d'un produit. */
const DISPONIBILITE = def([
  ['disponible', 'Disponible'],
  ['stock_limite', 'Stock limité'],
  ['sur_commande', 'Sur commande'],
  ['rupture', 'Indisponible (rupture)'],
]);

/**
 * § 12 — statuts de la commande, dans l'ordre du parcours, plus les deux
 * issues négatives (refusée par le fournisseur, annulée).
 */
const STATUT_COMMANDE = def([
  ['brouillon', 'Brouillon'],
  ['envoyee', 'Bon de commande envoyé'],
  ['en_attente_validation', 'En attente de validation'],
  ['proposition_modifiee', 'Proposition modifiée'],
  ['validee', 'Commande validée'],
  ['en_preparation', 'En préparation'],
  ['prete', 'Prête'],
  ['livree', 'Livrée'],
  ['reception_confirmee', 'Réception confirmée'],
  ['facturee', 'Facturée'],
  ['terminee', 'Terminée'],
  ['refusee', 'Refusée'],
  ['annulee', 'Annulée'],
]);

/** Côté d'une commande : qui propose, qui agit. */
const COTE = def([
  ['acheteur', 'Acheteur'],
  ['fournisseur', 'Fournisseur'],
]);

/** § 10 — version d'une commande (bon initial, proposition, contre-proposition). */
const STATUT_VERSION = def([
  ['brouillon', 'Brouillon'],
  ['proposee', 'Proposée'],
  ['acceptee', 'Acceptée'],
  ['refusee', 'Refusée'],
  ['remplacee', 'Remplacée'],
]);

/** § 10 « modifier une quantité, supprimer un produit indisponible, proposer un autre produit ». */
const CHANGEMENT_LIGNE = def([
  ['inchangee', 'Inchangée'],
  ['quantite_modifiee', 'Quantité modifiée'],
  ['prix_modifie', 'Prix modifié'],
  ['indisponible', 'Indisponible'],
  ['ajoutee', 'Produit ajouté'],
  ['substitution', 'Produit de remplacement'],
]);

/** § 20 — historique et traçabilité de la commande. */
const EVENEMENT_COMMANDE = def([
  ['creation', 'Création de la commande'],
  ['modification', 'Modification du brouillon'],
  ['envoi', 'Envoi au fournisseur'],
  ['prise_en_charge', 'Prise en charge par le fournisseur'],
  ['acceptation', 'Acceptation par le fournisseur'],
  ['proposition', 'Proposition modifiée du fournisseur'],
  ['demande_modification', 'Demande de modification du client'],
  ['acceptation_proposition', 'Acceptation de la proposition'],
  ['refus_proposition', 'Refus de la proposition'],
  ['refus', 'Refus du fournisseur'],
  ['annulation', 'Annulation'],
  ['validation', 'Validation de la commande'],
  ['changement_statut', 'Changement de statut'],
  ['livraison', 'Livraison'],
  ['reception', 'Confirmation de réception'],
  ['facturation', 'Génération de la facture'],
  ['annulation_facture', 'Annulation de la facture'],
  ['paiement', 'Paiement'],
  ['cloture', 'Commande terminée'],
  ['piece_jointe', 'Pièce jointe'],
  ['commentaire', 'Commentaire'],
]);

/** § 14, § 16 — facture. */
const STATUT_FACTURE = def([
  ['emise', 'Émise'],
  ['partiellement_payee', 'Partiellement payée'],
  ['payee', 'Payée'],
  ['en_retard', 'En retard'],
  ['annulee', 'Annulée'],
]);

/** Origine du document de facture : généré par Pro2Link ou importé par le fournisseur. */
const SOURCE_FACTURE = def([
  ['generee', 'Générée par Pro2Link'],
  ['importee', 'Importée par le fournisseur'],
]);

const MODE_PAIEMENT = def([
  ['especes', 'Espèces'],
  ['virement', 'Virement bancaire'],
  ['cheque', 'Chèque'],
  ['wave', 'Wave'],
  ['orange_money', 'Orange Money'],
  ['free_money', 'Free Money'],
  ['carte', 'Carte bancaire'],
  ['effet', 'Effet de commerce'],
  ['autre', 'Autre'],
]);

/**
 * § 16 — paiement. Le fournisseur ENREGISTRE un paiement reçu (confirmé
 * d'emblée) ; l'acheteur peut DÉCLARER un paiement effectué, que le
 * fournisseur confirme ou rejette : le solde d'un acheteur ne baisse jamais
 * sur sa seule parole.
 */
const STATUT_PAIEMENT = def([
  ['declare', 'Déclaré par le client'],
  ['confirme', 'Confirmé'],
  ['rejete', 'Rejeté'],
  ['annule', 'Annulé'],
]);

/** § 15 — modèles de documents. */
const TYPE_MODELE_DOCUMENT = def([
  ['bon_commande', 'Bon de commande'],
  ['facture', 'Facture'],
]);

const STATUT_MODELE_DOCUMENT = def([
  ['actif', 'Actif'],
  ['archive', 'Archivé'],
]);

const CATEGORIE_DOCUMENT = def([
  ['logo', 'Logo'],
  ['photo', 'Photo'],
  ['bon_commande', 'Bon de commande'],
  ['bon_livraison', 'Bon de livraison'],
  ['facture', 'Facture'],
  ['preuve_paiement', 'Preuve de paiement'],
  ['modele', 'Modèle de document'],
  ['piece_jointe', 'Pièce jointe'],
  ['autre', 'Autre'],
]);

/** Ressources auxquelles un document peut être rattaché. */
const ENTITE_DOCUMENT = def([
  ['company', 'Entreprise'],
  ['product', 'Produit'],
  ['order', 'Commande'],
  ['invoice', 'Facture'],
  ['payment', 'Paiement'],
  ['document_template', 'Modèle de document'],
  ['partnership', 'Partenariat'],
]);

/**
 * Qui peut lire un document :
 *   prive      — l'entreprise qui le détient seulement ;
 *   partenaire — l'entreprise ET la contrepartie de la ressource (commande,
 *                facture, paiement) ;
 *   catalogue  — l'entreprise et ses clients au partenariat actif (photo produit) ;
 *   public     — toute entreprise connectée (logo, annuaire).
 */
const VISIBILITE_DOCUMENT = def([
  ['prive', 'Privé'],
  ['partenaire', 'Partagé avec le partenaire'],
  ['catalogue', 'Visible des clients'],
  ['public', 'Public (annuaire)'],
]);

const TYPE_NOTIFICATION = def([
  ['nouveau_bon_commande', 'Nouveau bon de commande'],
  ['commande_acceptee', 'Commande acceptée'],
  ['commande_modifiee', 'Commande modifiée'],
  ['proposition_recue', 'Proposition reçue'],
  ['proposition_acceptee', 'Proposition acceptée'],
  ['proposition_refusee', 'Proposition refusée'],
  ['modification_demandee', 'Modification demandée'],
  ['produit_indisponible', 'Produit indisponible'],
  ['commande_refusee', 'Commande refusée'],
  ['commande_annulee', 'Commande annulée'],
  ['commande_en_preparation', 'Commande en préparation'],
  ['commande_prete', 'Commande prête'],
  ['commande_livree', 'Commande livrée'],
  ['reception_confirmee', 'Réception confirmée'],
  ['nouvelle_facture', 'Nouvelle facture'],
  ['facture_annulee', 'Facture annulée'],
  ['paiement_enregistre', 'Paiement enregistré'],
  ['paiement_declare', 'Paiement déclaré'],
  ['paiement_rejete', 'Paiement rejeté'],
  ['echeance', 'Échéance ou montant dû'],
  ['partenariat', 'Partenariat'],
  ['commentaire', 'Nouveau message'],
  ['abonnement', 'Abonnement'],
  ['systeme', 'Information'],
]);

const STATUT_ABONNEMENT = def([
  ['essai', "Période d'essai"],
  ['actif', 'Actif'],
  ['expire', 'Expiré'],
  ['suspendu', 'Suspendu'],
  ['annule', 'Annulé'],
]);

const PERIODE_FACTURATION = def([
  ['mensuel', 'Mensuelle'],
  ['annuel', 'Annuelle'],
]);

const STATUT_PLAN = def([
  ['actif', 'Actif'],
  ['inactif', 'Inactif'],
]);

const STATUT_PAIEMENT_ABONNEMENT = def([
  ['initie', 'Initié'],
  ['confirme', 'Confirmé'],
  ['echoue', 'Échoué'],
  ['annule', 'Annulé'],
]);

/** Fonctionnalités activables par forfait (§ 25). */
const FONCTIONNALITE = def([
  ['modeles_documents', 'Modèles de documents personnalisés'],
  ['statistiques', 'Statistiques'],
  ['exports', 'Exports CSV'],
]);

/** Portefeuille choisi au moment de payer un abonnement. */
const PORTEFEUILLE = def([
  ['wave', 'Wave'],
  ['orange_money', 'Orange Money'],
]);

const PLATEFORME_APPAREIL = def([
  ['android', 'Android'],
  ['ios', 'iOS'],
  ['web', 'Web'],
]);

/** Codes seuls, pour les CHECK SQL et Joi. */
const codes = (enumeration) => Object.keys(enumeration);

module.exports = {
  ROLES, ROLES_ENTREPRISE, STATUT_UTILISATEUR, STATUT_ENTREPRISE, STATUT_MEMBRE,
  TYPE_ENTREPRISE, SECTEUR_ACTIVITE, REGIME_FISCAL,
  STATUT_PARTENARIAT, RELATION, STATUT_INVITATION_PARTENAIRE,
  UNITE, DISPONIBILITE,
  STATUT_COMMANDE, COTE, STATUT_VERSION, CHANGEMENT_LIGNE, EVENEMENT_COMMANDE,
  STATUT_FACTURE, SOURCE_FACTURE, MODE_PAIEMENT, STATUT_PAIEMENT,
  TYPE_MODELE_DOCUMENT, STATUT_MODELE_DOCUMENT,
  CATEGORIE_DOCUMENT, ENTITE_DOCUMENT, VISIBILITE_DOCUMENT,
  TYPE_NOTIFICATION,
  STATUT_ABONNEMENT, PERIODE_FACTURATION, STATUT_PLAN, STATUT_PAIEMENT_ABONNEMENT, FONCTIONNALITE, PORTEFEUILLE,
  PLATEFORME_APPAREIL,
  codes,
};
