'use strict';

const { NotFoundError, ForbiddenError, ValidationError } = require('../errors/AppError.js');

/**
 * Contrôle d'accès HORIZONTAL (§ 6 « les données d'une entreprise doivent être
 * séparées de celles des autres entreprises », § 24) — point de passage unique.
 *
 * Toute ressource désignée par un identifiant venant du client (paramètre de
 * route, champ du corps) est chargée PAR SON ID, puis son entreprise est
 * comparée à celle de l'appelant :
 *   - absente (ou supprimée logiquement) → 404 ;
 *   - présente mais d'une autre entreprise → 403 Forbidden.
 *
 * Les identifiants sont des UUID v4 aléatoires : distinguer 403 de 404 ne
 * permet pas d'énumérer les ressources d'autrui. Un changement d'ID dans une
 * requête ne peut donc JAMAIS atteindre les données d'une autre entreprise.
 *
 * Deux formes :
 *   - ressource PROPRE (produit, modèle, catégorie) : `company_id` ;
 *   - ressource PARTAGÉE entre deux entreprises (commande, facture, paiement,
 *     partenariat) : `buyer_company_id` / `supplier_company_id`. Le côté de
 *     l'appelant est rendu (`acheteur` ou `fournisseur`).
 */

/**
 * @template T
 * @param {import('sequelize').ModelStatic<T>} Modele
 * @param {string} id
 * @param {string} companyId        entreprise de l'appelant (req.companyId)
 * @param {object} [options]        options Sequelize (include, attributes, transaction, lock)
 * @param {string} [libelle]        nom lisible de la ressource pour le message
 * @returns {Promise<T>}
 */
async function chargerPourEntreprise(Modele, id, companyId, options = {}, libelle = 'Ressource') {
  const ressource = await Modele.findByPk(id, options);
  if (!ressource) throw new NotFoundError(`${libelle} introuvable`);
  if (ressource.company_id !== companyId) {
    throw new ForbiddenError("Vous n'avez pas accès à cette ressource.", 'ACCES_AUTRE_ENTREPRISE');
  }
  return ressource;
}

/**
 * Ressource partagée entre un acheteur et un fournisseur. Un brouillon de
 * commande n'existe pas pour le fournisseur (§ 9 : seul le bon ENVOYÉ lui
 * parvient) — l'appelant le précise par `visiblePar`.
 *
 * @param {object} [o]
 * @param {'acheteur'|'fournisseur'|null} [o.cote]  côté exigé (null : l'un ou l'autre)
 * @param {(ressource: any, cote: string) => boolean} [o.visiblePar]
 * @returns {Promise<{ ressource: any, cote: 'acheteur'|'fournisseur' }>}
 */
async function chargerPartage(Modele, id, companyId, options = {}, libelle = 'Ressource', { cote = null, visiblePar = null } = {}) {
  const ressource = await Modele.findByPk(id, options);
  if (!ressource) throw new NotFoundError(`${libelle} introuvable`);
  let sienne = null;
  if (ressource.buyer_company_id === companyId) sienne = 'acheteur';
  else if (ressource.supplier_company_id === companyId) sienne = 'fournisseur';
  if (!sienne || (visiblePar && !visiblePar(ressource, sienne))) {
    // Invisible pour ce côté (brouillon d'un autre) : la ressource n'existe pas pour lui.
    if (sienne) throw new NotFoundError(`${libelle} introuvable`);
    throw new ForbiddenError("Vous n'avez pas accès à cette ressource.", 'ACCES_AUTRE_ENTREPRISE');
  }
  if (cote && sienne !== cote) {
    throw new ForbiddenError(
      cote === 'acheteur' ? 'Cette action est réservée au client de la commande.' : 'Cette action est réservée au fournisseur.',
      'ACTION_RESERVEE_AUTRE_PARTIE',
      { cote_requis: cote }
    );
  }
  return { ressource, cote: sienne };
}

/**
 * Vérifie qu'une ressource RÉFÉRENCÉE dans un corps de requête (ex.
 * `category_id` d'un produit) appartient bien à la même entreprise. Une
 * référence inexistante est une donnée invalide (422) plutôt qu'une URL
 * fausse (404).
 */
async function verifierReference(Modele, id, companyId, libelle, options = {}) {
  if (id === null || id === undefined) return null;
  const ressource = await Modele.findByPk(id, options);
  if (!ressource) throw new ValidationError('Données invalides', [`${libelle} introuvable`]);
  if (ressource.company_id !== companyId) {
    throw new ForbiddenError("Vous n'avez pas accès à cette ressource.", 'ACCES_AUTRE_ENTREPRISE');
  }
  return ressource;
}

module.exports = { chargerPourEntreprise, chargerPartage, verifierReference };
