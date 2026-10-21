'use strict';

const {
  Joi, uuid, montant, dateIso, recherche, tri, pagination,
} = require('../../../validations/common.js');
const { codes, STATUT_COMMANDE, STATUT_APPROBATION } = require('../../../config/enums.js');
const { quantite } = require('../../catalogue/validation/catalogue.validation.js');

/**
 * Concurrence optimiste (§ 23) : révision affichée par le client, facultative.
 * Si elle est fournie et ne correspond plus, 409 COMMANDE_MODIFIEE.
 */
const revision = Joi.number().integer().min(1);
const commentaire = Joi.string().trim().max(2000);
const MAX_LIGNES = 500;

/** Ligne saisie par l'acheteur : produit désigné par son identifiant OU par sa référence (saisie rapide). */
const ligneAcheteur = Joi.object({
  product_id: uuid,
  reference: Joi.string().trim().min(1).max(60),
  quantity: quantite.greater(0).required(),
  comment: Joi.string().trim().max(500).allow('', null),
}).xor('product_id', 'reference')
  .messages({ 'object.xor': 'Chaque ligne désigne un produit par product_id OU par reference' });

const entete = {
  buyer_reference: Joi.string().trim().max(60).allow('', null),
  delivery_address: Joi.string().trim().max(1000).allow('', null),
  requested_delivery_date: dateIso.allow(null),
  conditions: Joi.string().trim().max(2000).allow('', null),
};

// § 9.1 — sélection d'un fournisseur, des produits et des quantités.
const creationSchema = Joi.object({
  supplier_id: uuid.required(),
  lines: Joi.array().items(ligneAcheteur).min(1).max(MAX_LIGNES).required(),
  ...entete,
});

const modificationSchema = Joi.object({
  ...entete,
  lines: Joi.array().items(ligneAcheteur).min(1).max(MAX_LIGNES),
  revision,
}).min(1);

const revisionSchema = Joi.object({ revision });

/** Import CSV : champs texte du multipart (le fichier est dans « fichier »). */
const importSchema = Joi.object({ supplier_id: uuid.required(), ...entete });

/** Décisions du circuit d'approbation interne. */
const approbationSchema = Joi.object({ comment: commentaire.allow('', null), revision });
const rejetApprobationSchema = Joi.object({ comment: commentaire.min(3).required(), revision });

const acceptationSchema = Joi.object({ revision, comment: commentaire.allow('', null) });

/**
 * § 10 — modification par le fournisseur : une saisie par ligne modifiée
 * (`line_no`) ou par produit ajouté (`product_id`, éventuellement en
 * remplacement d'une ligne).
 */
const saisieFournisseur = Joi.object({
  line_no: Joi.number().integer().min(1),
  product_id: uuid,
  quantity: quantite,
  unit_price: montant,
  unavailable: Joi.boolean(),
  substitute_for_line_no: Joi.number().integer().min(1),
  comment: Joi.string().trim().max(500).allow('', null),
}).xor('line_no', 'product_id')
  .messages({ 'object.xor': 'Chaque modification désigne soit une ligne existante (line_no), soit un produit à ajouter (product_id)' });

const propositionSchema = Joi.object({
  lines: Joi.array().items(saisieFournisseur).min(1).max(MAX_LIGNES).required(),
  comment: commentaire.allow('', null),
  revision,
});

/** Contre-proposition de l'acheteur : quantités (0 = retirer) et produits ajoutés. */
const saisieAcheteur = Joi.object({
  line_no: Joi.number().integer().min(1),
  product_id: uuid,
  quantity: quantite,
  comment: Joi.string().trim().max(500).allow('', null),
}).xor('line_no', 'product_id');

const demandeModificationSchema = Joi.object({
  comment: commentaire.min(3).required(),
  lines: Joi.array().items(saisieAcheteur).max(MAX_LIGNES),
  revision,
});

const motifSchema = Joi.object({ reason: Joi.string().trim().min(3).max(1000).required(), revision });

const statutSchema = Joi.object({
  status: Joi.string().valid('en_preparation', 'prete').required(),
  note: Joi.string().trim().max(1000).allow('', null),
  revision,
});

/** Champs multipart de la livraison (chaînes converties par Joi). */
const livraisonSchema = Joi.object({
  note: Joi.string().trim().max(1000).allow('', null),
  carrier: Joi.string().trim().max(120).allow('', null),
  revision,
});

/** Livraison (éventuellement partielle) : quantités expédiées par ligne de la commande validée. */
const expeditionSchema = Joi.object({
  lines: Joi.array().items(Joi.object({
    line_no: Joi.number().integer().min(1).required(),
    quantity: quantite.greater(0).required(),
  })).min(1).max(MAX_LIGNES).unique('line_no'),
  note: Joi.string().trim().max(1000).allow('', null),
  carrier: Joi.string().trim().max(120).allow('', null),
  revision,
});

const paramLivraison = Joi.object({ id: uuid.required(), livraisonId: uuid.required() });

const receptionSchema = Joi.object({
  lines: Joi.array().items(Joi.object({
    line_no: Joi.number().integer().min(1).required(),
    received_quantity: quantite.required(),
  })).max(MAX_LIGNES).unique('line_no'),
  note: Joi.string().trim().max(2000).allow('', null),
  with_reserves: Joi.boolean(),
  revision,
});

const commentaireSchema = Joi.object({ message: commentaire.min(1).required() });
const pieceJointeSchema = Joi.object({ description: Joi.string().trim().max(255).allow('', null) });
const pdfSchema = Joi.object({ version: Joi.number().integer().min(1) });

const filtres = {
  ...pagination,
  status: Joi.string().trim().max(300).pattern(new RegExp(`^(${codes(STATUT_COMMANDE).join('|')})(,(${codes(STATUT_COMMANDE).join('|')}))*$`))
    .messages({ 'string.pattern.base': '{{#label}} : un ou plusieurs statuts de commande séparés par des virgules' }),
  q: recherche,
  du: dateIso,
  au: dateIso,
  a_traiter: Joi.boolean(),
  // Synchronisation incrémentale (§ 23) : horodatage ISO de la dernière synchronisation.
  modifie_depuis: Joi.date().iso(),
};

const listeAchatsSchema = Joi.object({
  ...filtres,
  supplier_id: uuid,
  approbation: Joi.string().valid(...codes(STATUT_APPROBATION)),
  tri: tri(['created_at', 'sent_at', 'total', 'number', 'updated_at']),
});

const listeVentesSchema = Joi.object({
  ...filtres,
  client_id: uuid,
  tri: tri(['sent_at', 'created_at', 'total', 'number', 'updated_at']),
});

module.exports = {
  creationSchema, modificationSchema, revisionSchema, acceptationSchema, propositionSchema, demandeModificationSchema,
  motifSchema, statutSchema, livraisonSchema, receptionSchema, commentaireSchema, pieceJointeSchema, pdfSchema,
  listeAchatsSchema, listeVentesSchema, importSchema, approbationSchema, rejetApprobationSchema, expeditionSchema, paramLivraison,
};
