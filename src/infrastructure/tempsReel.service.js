'use strict';

const { EventEmitter } = require('events');
const redisClient = require('../config/redis.js');
const logger = require('../utils/logger.js');
const metrics = require('../utils/metrics.js');

/**
 * Synchronisation temps réel web / mobile (§ 23 : « un fournisseur reçoit une
 * commande sur mobile → elle apparaît immédiatement sur son interface Web »).
 *
 * Flux Server-Sent Events par utilisateur connecté. Chaque changement validé
 * (COMMIT) d'une commande, facture, paiement ou partenariat publie un
 * événement léger (type, identifiant, statut, révision) : le client recharge
 * la ressource par l'API — la donnée ne transite jamais par ce canal, le
 * contrôle d'accès reste celui de l'API.
 *
 * En cluster PM2 (plusieurs processus), la diffusion passe par Redis
 * (publication / abonnement) : un événement publié par le processus qui a
 * traité la requête parvient aux connexions ouvertes sur TOUS les processus.
 * Sans Redis (développement, processus unique) : émetteur local.
 *
 * Le mobile en arrière-plan reçoit en plus une notification push (§ 17).
 */

const CANAL = 'pro2link:evenements';
const local = new EventEmitter();
local.setMaxListeners(0);

/** userId → Set de réponses SSE ouvertes. */
const connexions = new Map();
let abonne = null;

function distribuer(evenement) {
  for (const userId of evenement.destinataires || []) {
    const ouvertes = connexions.get(userId);
    if (!ouvertes) continue;
    const ligne = `event: ${evenement.type}\ndata: ${JSON.stringify(evenement.donnees || {})}\n\n`;
    for (const res of ouvertes) {
      try {
        res.write(ligne);
      } catch (err) {
        logger.debug('[temps-reel] Écriture impossible sur un flux', { error: err.message });
      }
    }
  }
}

function demarrerAbonnement() {
  if (abonne || !redisClient || typeof redisClient.duplicate !== 'function') return;
  // Une connexion abonnée ne peut plus envoyer d'autres commandes : connexion dédiée.
  abonne = redisClient.duplicate({ enableOfflineQueue: true });
  abonne.on('error', (err) => logger.warn('[temps-reel] Abonnement Redis en erreur', { error: err.message }));
  abonne.subscribe(CANAL).catch((err) => logger.warn('[temps-reel] Abonnement Redis impossible', { error: err.message }));
  abonne.on('message', (canal, message) => {
    if (canal !== CANAL) return;
    try {
      distribuer(JSON.parse(message));
    } catch (err) {
      logger.warn('[temps-reel] Message illisible', { error: err.message });
    }
  });
}

/**
 * Publie un événement vers des utilisateurs. Ne lève jamais : la
 * synchronisation est un confort, la donnée est déjà en base.
 * @param {string[]} destinataires  identifiants d'utilisateurs
 * @param {string} type             ex. `commande`, `facture`, `notification`
 * @param {object} donnees          données de NAVIGATION (ids, statut, révision)
 */
function publier(destinataires, type, donnees = {}) {
  const uniques = [...new Set((destinataires || []).filter(Boolean))];
  if (!uniques.length) return;
  const evenement = { destinataires: uniques, type, donnees: { ...donnees, type, emis_le: new Date().toISOString() } };
  metrics.incrementer(`temps_reel.publie.${type}`);
  if (redisClient && redisClient.status === 'ready') {
    redisClient.publish(CANAL, JSON.stringify(evenement)).catch((err) => {
      logger.warn('[temps-reel] Publication Redis impossible — diffusion locale', { error: err.message });
      distribuer(evenement);
    });
    return;
  }
  local.emit('evenement', evenement);
}

local.on('evenement', distribuer);

/**
 * Ouvre un flux SSE pour un utilisateur. Le flux est fermé par le client ou à
 * l'arrêt du processus ; un commentaire « ping » toutes les 25 s traverse les
 * proxys qui coupent les connexions inactives (nginx : 60 s).
 */
function ouvrirFlux(userId, req, res) {
  demarrerAbonnement();
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // nginx : pas de mise en tampon, sinon les événements arrivent par paquets.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`event: connecte\ndata: ${JSON.stringify({ user_id: userId })}\n\n`);

  if (!connexions.has(userId)) connexions.set(userId, new Set());
  connexions.get(userId).add(res);
  metrics.incrementer('temps_reel.connexions');

  const battement = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(battement);
    }
  }, 25_000);
  battement.unref();

  const fermer = () => {
    clearInterval(battement);
    const ouvertes = connexions.get(userId);
    if (ouvertes) {
      ouvertes.delete(res);
      if (!ouvertes.size) connexions.delete(userId);
    }
  };
  req.on('close', fermer);
  res.on('close', fermer);
}

module.exports = { publier, ouvrirFlux, distribuer };
