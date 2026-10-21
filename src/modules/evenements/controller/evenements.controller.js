'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const asyncHandler = require('../../../middlewares/asyncHandler.js');
const { ok } = require('../../../utils/response.js');
const { jwtConfig } = require('../../../config/security.js');
const { UnauthorizedError, ForbiddenError } = require('../../../errors/AppError.js');
const { chargerUtilisateur } = require('../../../middlewares/auth.middleware.js');
const tempsReel = require('../../../infrastructure/tempsReel.service.js');

/**
 * Flux temps réel (§ 23 « toutes les informations doivent rester
 * synchronisées »).
 *
 * Un navigateur ne peut pas poser d'en-tête Authorization sur un EventSource :
 * le client obtient d'abord un TICKET (jeton de 60 s, à usage du seul flux,
 * signé avec une clé DÉRIVÉE — il ne vaut jamais jeton d'accès), puis ouvre
 * `GET /evenements/flux?ticket=…`. Le ticket est masqué dans les journaux.
 */

const DUREE_TICKET_S = 60;
const cleTicket = () => crypto.createHmac('sha256', jwtConfig.secret).update('ticket-flux-evenements').digest();

exports.ticket = asyncHandler(async (req, res) => {
  const ticket = jwt.sign(
    { sub: req.user.id, typ: 'flux', tv: req.user.token_version },
    cleTicket(),
    { expiresIn: DUREE_TICKET_S, algorithm: jwtConfig.algorithme }
  );
  return ok(res, { ticket, expires_in: DUREE_TICKET_S, url: `/api/v1/evenements/flux?ticket=${encodeURIComponent(ticket)}` });
});

exports.flux = asyncHandler(async (req, res) => {
  let decode;
  try {
    decode = jwt.verify(String(req.query.ticket || ''), cleTicket(), { algorithms: [jwtConfig.algorithme] });
  } catch {
    throw new UnauthorizedError('Ticket de flux invalide ou expiré', 'TICKET_INVALIDE');
  }
  if (decode.typ !== 'flux') throw new UnauthorizedError('Ticket de flux invalide ou expiré', 'TICKET_INVALIDE');
  const utilisateur = await chargerUtilisateur(decode.sub, decode.tv);
  if (utilisateur.must_change_password) throw new ForbiddenError('Changez votre mot de passe provisoire.', 'CHANGEMENT_MOT_DE_PASSE_REQUIS');
  tempsReel.ouvrirFlux(utilisateur.id, req, res);
});
