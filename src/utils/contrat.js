'use strict';

/**
 * Description d'un middleware pour le CONTRAT D'API généré
 * (scripts/generer-contrats.js) : schéma Joi validé, permission exigée,
 * fichier attendu, pagination, idempotence. Simple propriété posée sur la
 * fonction — aucun effet sur l'exécution de la requête.
 *
 * @template {Function} F
 * @param {F} fn
 * @param {object} description
 * @returns {F}
 */
function decrire(fn, description) {
  Object.defineProperty(fn, 'contrat', { value: description, enumerable: false });
  return fn;
}

module.exports = { decrire };
