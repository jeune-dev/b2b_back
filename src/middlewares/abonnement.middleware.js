'use strict';

const droits = require('../modules/abonnement/service/droits.service.js');

/**
 * Garde d'abonnement de l'espace entreprise (§ 25).
 *
 * Lecture (GET) toujours permise ; toute écriture exige un abonnement actif
 * (essai ou payé, non échu). Un abonnement expiré ou suspendu laisse
 * l'entreprise consulter ses commandes, factures et soldes, mais elle doit
 * renouveler pour agir. Monté sur chaque routeur de l'espace entreprise,
 * après `auth` et `requireEntreprise`.
 */
const exigerAbonnementPourEcrire = async (req, res, next) => {
  try {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    droits.exigerActif(await droits.etat(req.companyId));
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * La fonctionnalité doit être incluse dans le forfait de l'entreprise. En
 * lecture (GET, HEAD), un abonnement échu ou suspendu n'empêche pas la
 * consultation ; une écriture exige l'abonnement actif.
 */
const exigerFonctionnalite = (code) => async (req, res, next) => {
  try {
    const lecture = req.method === 'GET' || req.method === 'HEAD';
    await droits.exigerFonctionnalite(req.companyId, code, { lecture });
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { exigerAbonnementPourEcrire, exigerFonctionnalite };
