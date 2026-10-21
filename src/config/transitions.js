'use strict';

const { ConflictError } = require('../errors/AppError.js');

/**
 * Tables de transitions des workflows (§ 10 à § 14, § 28).
 *
 * Une transition absente de la table est refusée par `verifierTransition` avec
 * un 409 et un code stable : le client sait qu'il affichait un état périmé
 * (web et mobile modifiant la même commande, § 23).
 */

/**
 * Commande — clé : statut de départ ; valeur : statuts d'arrivée permis.
 * QUI peut déclencher chaque transition est vérifié par le service de la
 * commande (§ 12 : le fournisseur fait avancer les statuts opérationnels,
 * l'acheteur confirme la réception).
 */
const COMMANDE = Object.freeze({
  brouillon: ['envoyee', 'annulee'],
  envoyee: ['en_attente_validation', 'validee', 'proposition_modifiee', 'refusee', 'annulee'],
  en_attente_validation: ['validee', 'proposition_modifiee', 'refusee', 'annulee'],
  proposition_modifiee: ['validee', 'en_attente_validation', 'annulee'],
  validee: ['en_preparation', 'prete', 'livree', 'annulee'],
  en_preparation: ['prete', 'livree'],
  prete: ['livree'],
  livree: ['reception_confirmee'],
  reception_confirmee: ['facturee'],
  // Annulation de la facture : retour à « réception confirmée ».
  facturee: ['terminee', 'reception_confirmee'],
  // Paiement annulé après solde complet : la facture redevient due.
  terminee: ['facturee'],
  refusee: [],
  annulee: [],
});

/** Statuts « en cours » (ni brouillon, ni close). */
const STATUTS_EN_COURS = Object.freeze([
  'envoyee', 'en_attente_validation', 'proposition_modifiee', 'validee', 'en_preparation', 'prete', 'livree', 'reception_confirmee',
]);

/** Statuts clos. */
const STATUTS_CLOS = Object.freeze(['terminee', 'refusee', 'annulee']);

/**
 * @param {Record<string, string[]>} table
 * @param {string} de
 * @param {string} vers
 * @param {string} libelle  — ressource, pour le message d'erreur
 */
function verifierTransition(table, de, vers, libelle) {
  if (de === vers) {
    throw new ConflictError(`${libelle} est déjà au statut « ${vers} ».`, 'TRANSITION_INVALIDE');
  }
  const permises = table[de] || [];
  if (!permises.includes(vers)) {
    throw new ConflictError(
      `Transition impossible pour ${libelle} : « ${de} » → « ${vers} ».`,
      'TRANSITION_INVALIDE',
      { statutActuel: de, statutsPossibles: permises }
    );
  }
}

module.exports = {
  COMMANDE, STATUTS_EN_COURS, STATUTS_CLOS, verifierTransition,
};
