'use strict';

const { Joi, dateIso } = require('../../../validations/common.js');

const periode = {
  du: dateIso,
  au: dateIso,
};

/** Période bornée : au plus 3 ans, `au` postérieur à `du`. */
const periodeSchema = Joi.object(periode).custom((v, aide) => {
  if (v.du && v.au) {
    if (v.au < v.du) return aide.message('« au » doit être postérieur à « du »');
    if ((new Date(v.au) - new Date(v.du)) / 86400000 > 3 * 366) return aide.message('Période limitée à 3 ans');
  }
  return v;
});

const exportParam = Joi.object({ type: Joi.string().valid('commandes', 'factures', 'paiements').required() });

const exportSchema = Joi.object({
  ...periode,
  sens: Joi.string().valid('achats', 'ventes'),
});

module.exports = { periodeSchema, exportParam, exportSchema };
