'use strict';

const { Joi } = require('../../../validations/common.js');
const { champsEntreprise } = require('../../auth/validation/auth.validation.js');
const { schemaParametresEntreprise } = require('../../../config/parametres.js');

const modificationSchema = Joi.object(champsEntreprise).min(1);

const parametresSchema = schemaParametresEntreprise.min(1);

module.exports = { modificationSchema, parametresSchema };
