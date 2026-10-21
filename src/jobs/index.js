'use strict';

const cron = require('node-cron');
const { executerJob } = require('./executerJob.js');
const { FUSEAU } = require('../utils/dates.js');
const echeances = require('../modules/facture/service/echeance.service.js');
const abonnements = require('../modules/abonnement/service/abonnement.service.js');
const { nettoyer } = require('./nettoyage.js');

/**
 * Tâches planifiées — démarrées par le seul worker leader (server.js),
 * chacune protégée par un verrou consultatif PostgreSQL (executerJob).
 * Heures exprimées dans le fuseau de l'application (APP_TIMEZONE).
 */

const TACHES = [
  // § 17 « échéance ou montant dû » — rappels avant échéance et factures en retard (le matin).
  { nom: 'echeances_factures', planification: '0 8 * * *', fn: () => echeances.traiterEcheances() },
  // § 25 — abonnements et essais échus → lecture seule.
  { nom: 'abonnements', planification: '0 1 * * *', fn: () => abonnements.expirerAbonnements() },
  // Données techniques échues, invitations expirées.
  { nom: 'nettoyage', planification: '30 3 * * *', fn: () => nettoyer() },
];

function demarrerJobs() {
  return TACHES.map(({ nom, planification, fn }) => cron.schedule(
    planification,
    () => executerJob(nom, fn),
    { timezone: FUSEAU, name: nom, noOverlap: true }
  ));
}

module.exports = { demarrerJobs, TACHES };
