'use strict';

const router = require('express').Router();
const ctrl = require('../controller/evenements.controller.js');
const auth = require('../../../middlewares/auth.middleware.js');
const validate = require('../../../middlewares/validate.middleware.js');
const { authenticatedRateLimit } = require('../../../middlewares/rateLimit.middleware.js');
const { Joi } = require('../../../validations/common.js');

// § 23 — synchronisation web / mobile en temps réel (Server-Sent Events).
router.post('/ticket', auth, authenticatedRateLimit, ctrl.ticket);
// Authentifié par le ticket (un EventSource ne porte pas d'en-tête Authorization).
router.get('/flux', authenticatedRateLimit, validate(Joi.object({ ticket: Joi.string().max(2048).required() }), 'query'), ctrl.flux);

module.exports = router;
