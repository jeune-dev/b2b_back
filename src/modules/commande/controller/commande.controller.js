'use strict';

const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok, created, paginated } = require('../../../utils/response.js');
const S = require('../service/commande.service.js');
const N = require('../service/negociation.service.js');
const X = require('../service/execution.service.js');
const Rendu = require('../../modele/service/rendu.service.js');

/**
 * Contrôleur commun aux routes /achats (côté acheteur) et /ventes (côté
 * fournisseur) : `req.cote`, posé par le routeur, impose le côté de
 * l'appelant sur chaque commande désignée.
 */

exports.listerAchats = asyncHandler(async (req, res) =>
  paginated(res, await S.listerAchats(req.companyId, req.query, req.pagination), req.pagination));

exports.listerVentes = asyncHandler(async (req, res) =>
  paginated(res, await S.listerVentes(req.companyId, req.query, req.pagination), req.pagination));

exports.detail = asyncHandler(async (req, res) => ok(res, { order: await S.detail(req.params.id, req.companyId, req.cote) }));

exports.versions = asyncHandler(async (req, res) => ok(res, { versions: await S.versions(req.params.id, req.companyId, req.cote) }));

exports.historique = asyncHandler(async (req, res) => ok(res, { events: await S.historique(req.params.id, req.companyId, req.cote) }));

exports.creer = asyncHandler(async (req, res) =>
  created(res, { order: await S.creer(req.companyId, req.user, req.body) }, 'Bon de commande créé'));

exports.modifier = asyncHandler(async (req, res) =>
  ok(res, { order: await S.modifierBrouillon(req.params.id, req.companyId, req.user, req.body) }, 'Bon de commande modifié'));

exports.envoyer = asyncHandler(async (req, res) =>
  ok(res, { order: await S.envoyer(req.params.id, req.companyId, req.user, req.body) }, 'Bon de commande envoyé au fournisseur'));

exports.annuler = asyncHandler(async (req, res) =>
  ok(res, { order: await S.annuler(req.params.id, req.companyId, req.user, req.body, req.cote) }, 'Commande annulée'));

exports.commenter = asyncHandler(async (req, res) =>
  created(res, { event: await S.commenter(req.params.id, req.companyId, req.user, req.body, req.cote) }, 'Message envoyé'));

exports.joindre = asyncHandler(async (req, res) =>
  created(res, { document: await S.joindre(req.params.id, req.companyId, req.user, req.fichier, req.body, req.cote) }, 'Pièce jointe ajoutée'));

exports.prendreEnCharge = asyncHandler(async (req, res) =>
  ok(res, { order: await N.prendreEnCharge(req.params.id, req.companyId, req.user, req.body) }, 'Commande prise en charge'));

exports.accepter = asyncHandler(async (req, res) =>
  ok(res, { order: await N.accepter(req.params.id, req.companyId, req.user, req.body) }, 'Commande acceptée et validée'));

exports.proposer = asyncHandler(async (req, res) =>
  ok(res, { order: await N.proposer(req.params.id, req.companyId, req.user, req.body) }, 'Proposition envoyée au client'));

exports.refuser = asyncHandler(async (req, res) =>
  ok(res, { order: await N.refuser(req.params.id, req.companyId, req.user, req.body) }, 'Commande refusée'));

exports.accepterProposition = asyncHandler(async (req, res) =>
  ok(res, { order: await N.accepterProposition(req.params.id, req.companyId, req.user, req.body) }, 'Proposition acceptée : commande validée'));

exports.refuserProposition = asyncHandler(async (req, res) =>
  ok(res, { order: await N.refuserProposition(req.params.id, req.companyId, req.user, req.body) }, 'Proposition refusée : commande annulée'));

exports.demanderModification = asyncHandler(async (req, res) =>
  ok(res, { order: await N.demanderModification(req.params.id, req.companyId, req.user, req.body) }, 'Demande de modification envoyée'));

exports.statut = asyncHandler(async (req, res) =>
  ok(res, { order: await X.mettreAJourStatut(req.params.id, req.companyId, req.user, req.body) }, 'Statut mis à jour'));

exports.livrer = asyncHandler(async (req, res) =>
  ok(res, { order: await X.livrer(req.params.id, req.companyId, req.user, req.body, req.fichier || null) }, 'Commande livrée'));

exports.confirmerReception = asyncHandler(async (req, res) =>
  ok(res, { order: await X.confirmerReception(req.params.id, req.companyId, req.user, req.body) }, 'Réception confirmée'));

/** § 9.1 / § 15 — bon de commande en PDF, au modèle de l'acheteur. */
exports.pdf = asyncHandler(async (req, res) => {
  const { nom, contenu } = await Rendu.bonDeCommande(req.params.id, req.companyId, req.cote, req.query.version);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nom}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(contenu);
});
