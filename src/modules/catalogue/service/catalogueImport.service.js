'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Product, ProductCategory, Company,
} = require('../../../models/index.js');
const { UNITE, DISPONIBILITE } = require('../../../config/enums.js');
const { ForbiddenError, ValidationError } = require('../../../errors/AppError.js');
const {
  lireCsv, nombre, cle, colonnes,
} = require('../../../utils/csvLecture.js');
const { tableauCsv } = require('../../statistiques/service/csv.js');
const v = require('../validation/catalogue.validation.js');
const droits = require('../../abonnement/service/droits.service.js');
const stock = require('./stock.service.js');
const { clientsActifs } = require('./produit.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { synchroniser } = require('../../notification/service/notification.service.js');

/**
 * Import et export du catalogue en CSV (Excel, LibreOffice) : le fournisseur
 * met à jour des centaines de produits d'un coup.
 *
 *   - la RÉFÉRENCE identifie le produit : existante → mise à jour, nouvelle →
 *     création ; une cellule vide laisse le champ inchangé (mise à jour) ;
 *   - unités et disponibilités en code (« carton ») ou en libellé (« Carton ») ;
 *   - catégories par leur nom (créées si besoin) ;
 *   - TOUT OU RIEN : la moindre ligne invalide refuse l'import, chaque erreur
 *     cite sa ligne ; `simulation` vérifie et compte sans rien écrire ;
 *   - la limite de produits du forfait s'applique aux créations.
 * L'export produit exactement le format attendu par l'import.
 */

const MAX_LIGNES = 5000;

const COLONNES = Object.freeze([
  ['reference', 'Référence', ['reference', 'ref', 'code', 'sku', 'code_produit']],
  ['name', 'Nom', ['nom', 'name', 'designation', 'libelle', 'produit']],
  ['description', 'Description', ['description']],
  ['unit', 'Unité', ['unite', 'unit']],
  ['packaging', 'Conditionnement', ['conditionnement', 'packaging', 'emballage']],
  ['price', 'Prix HT', ['prix_ht', 'prix', 'price', 'prix_unitaire', 'pu_ht']],
  ['tax_rate', 'TVA %', ['tva', 'tva_pct', 'taux_tva', 'tax_rate']],
  ['category', 'Catégorie', ['categorie', 'category', 'famille']],
  ['availability', 'Disponibilité', ['disponibilite', 'availability']],
  ['stock_quantity', 'Stock', ['stock', 'stock_quantity', 'quantite_en_stock']],
  ['min_order_quantity', 'Minimum de commande', ['minimum_de_commande', 'minimum', 'min_order_quantity', 'qte_min']],
  ['order_multiple', 'Multiple de commande', ['multiple_de_commande', 'multiple', 'order_multiple']],
  ['max_order_quantity', 'Maximum par commande', ['maximum_par_commande', 'maximum', 'max_order_quantity', 'qte_max']],
  ['low_stock_threshold', "Seuil d'alerte stock", ['seuil_d_alerte_stock', 'seuil_alerte', 'seuil', 'low_stock_threshold']],
  ['is_active', 'Actif', ['actif', 'active', 'is_active']],
]);
const SYNONYMES = Object.fromEntries(COLONNES.map(([champ, , syn]) => [champ, syn]));
const NUMERIQUES = ['price', 'tax_rate', 'stock_quantity', 'min_order_quantity', 'order_multiple', 'max_order_quantity', 'low_stock_threshold'];

/** Code d'énumération depuis un code ou un libellé, sans accents ni casse. */
function code(enumeration, valeur) {
  const k = cle(valeur);
  return Object.keys(enumeration).find((c) => c === k || cle(enumeration[c]) === k) || null;
}

function booleen(valeur) {
  const k = cle(valeur);
  if (['oui', 'o', 'yes', 'y', '1', 'true', 'vrai', 'actif'].includes(k)) return true;
  if (['non', 'n', 'no', '0', 'false', 'faux', 'inactif'].includes(k)) return false;
  return undefined;
}

/** Une ligne du fichier → champs produit (seulement les cellules renseignées). */
function lireLigne(cellules, index, erreurs, libelle) {
  const brut = (champ) => (index[champ] === undefined ? undefined : cellules[index[champ]]);
  const champs = {};
  for (const [champ] of COLONNES) {
    const valeur = brut(champ);
    if (valeur === undefined || valeur === '') continue;
    if (NUMERIQUES.includes(champ)) {
      const n = nombre(valeur);
      if (Number.isNaN(n)) erreurs.push(`${libelle} : « ${valeur} » n'est pas un nombre (${champ})`);
      else champs[champ] = n;
    } else if (champ === 'unit') {
      const c = code(UNITE, valeur);
      if (!c) erreurs.push(`${libelle} : unité « ${valeur} » inconnue`);
      else champs.unit = c;
    } else if (champ === 'availability') {
      const c = code(DISPONIBILITE, valeur);
      if (!c) erreurs.push(`${libelle} : disponibilité « ${valeur} » inconnue`);
      else champs.availability = c;
    } else if (champ === 'is_active') {
      const b = booleen(valeur);
      if (b === undefined) erreurs.push(`${libelle} : « ${valeur} » pour Actif (oui / non attendu)`);
      else champs.is_active = b;
    } else {
      champs[champ] = valeur;
    }
  }
  return champs;
}

/**
 * Analyse le fichier, vérifie chaque ligne et calcule le plan d'import.
 * @returns {Promise<{ creations: object[], misesAJour: Array<{ produit: object, champs: object }>, categoriesACreer: string[] }>}
 */
async function analyser(companyId, fichier) {
  const lignes = lireCsv(fichier.buffer, { maxLignes: MAX_LIGNES + 1 });
  if (lignes.length < 2) throw new ValidationError('Données invalides', ['Le fichier doit contenir une ligne d’en-tête puis au moins un produit'], 'CSV_VIDE');
  const index = colonnes(lignes[0], SYNONYMES);
  if (index.reference === undefined) {
    throw new ValidationError('Données invalides', ['Colonne « Référence » introuvable dans l’en-tête (téléchargez le modèle d’import)'], 'IMPORT_INVALIDE');
  }
  const erreurs = [];
  const references = new Map();
  const saisies = lignes.slice(1).map((cellules, i) => {
    const libelle = `Ligne ${i + 2}`;
    const avant = erreurs.length;
    const champs = lireLigne(cellules, index, erreurs, libelle);
    // Cellule illisible : la ligne est déjà en erreur, inutile de la valider plus loin.
    const lisible = erreurs.length === avant;
    if (!champs.reference) erreurs.push(`${libelle} : référence manquante`);
    else if (references.has(champs.reference.toLowerCase())) erreurs.push(`${libelle} : référence « ${champs.reference} » déjà présente ligne ${references.get(champs.reference.toLowerCase())}`);
    else references.set(champs.reference.toLowerCase(), i + 2);
    return { libelle, champs, lisible };
  });

  const existants = new Map((await Product.findAll({
    where: { company_id: companyId, [Op.and]: [sequelize.where(sequelize.fn('lower', sequelize.col('reference')), { [Op.in]: [...references.keys()] })] },
  })).map((p) => [p.reference.toLowerCase(), p]));
  const categories = new Map((await ProductCategory.findAll({ where: { company_id: companyId }, attributes: ['id', 'name'] }))
    .map((c) => [c.name.toLowerCase(), c]));
  const company = await Company.findByPk(companyId, { attributes: ['default_tax_rate'] });

  const creations = [];
  const misesAJour = [];
  const categoriesACreer = new Set();
  for (const { libelle, champs, lisible } of saisies) {
    if (!champs.reference || !lisible) continue;
    const { category, ...donnees } = champs;
    if (category && !categories.has(category.toLowerCase())) categoriesACreer.add(category);
    const existant = existants.get(champs.reference.toLowerCase());
    // Même validation que l'API produit (bornes, formats, min ≤ max).
    const schema = existant ? v.modificationSchema : v.creationSchema;
    const candidat = existant
      ? { ...donnees }
      : { tax_rate: Number(company.default_tax_rate), ...donnees };
    delete candidat.is_active;
    if (existant) delete candidat.reference;
    const seulementStatut = existant && !Object.keys(candidat).length;
    // Référence seule (aucune autre cellule) : rien à mettre à jour.
    if (seulementStatut && donnees.is_active === undefined && !category) continue;
    if (!seulementStatut) {
      const { error } = schema.validate(candidat, { abortEarly: false });
      if (error) {
        for (const d of error.details) erreurs.push(`${libelle} : ${d.message.replace(/"/g, '')}`);
        continue;
      }
    }
    const plan = { ...candidat, ...(donnees.is_active !== undefined ? { is_active: donnees.is_active } : {}), category };
    if (existant) misesAJour.push({ produit: existant, champs: plan, libelle });
    else creations.push({ ...plan, libelle });
  }
  if (erreurs.length) throw new ValidationError('Données invalides', erreurs.slice(0, 100), 'IMPORT_INVALIDE');
  return { creations, misesAJour, categoriesACreer: [...categoriesACreer] };
}

/** Limite de produits du forfait : les créations ne doivent pas la franchir. */
async function verifierLimiteProduits(companyId, nombreCreations, t) {
  if (!nombreCreations) return;
  const etat = await droits.etat(companyId);
  droits.exigerActif(etat);
  const max = etat.plan?.max_products;
  if (max === null || max === undefined) return;
  const actuels = await droits.usage(companyId, 'products', t);
  if (actuels + nombreCreations > max) {
    throw new ForbiddenError(
      `Limite de votre forfait : ${max} produits (${actuels} existants + ${nombreCreations} à créer). Passez à un forfait supérieur.`,
      'LIMITE_ABONNEMENT',
      { ressource: 'products', max }
    );
  }
}

/**
 * Import du catalogue.
 * @param {{ simulation?: boolean }} options  simulation : rien n'est écrit
 * @returns {Promise<{ created: number, updated: number, categories_created: number, simulation: boolean }>}
 */
async function importer(companyId, user, fichier, { simulation = false } = {}) {
  const plan = await analyser(companyId, fichier);
  const resume = {
    created: plan.creations.length, updated: plan.misesAJour.length, categories_created: plan.categoriesACreer.length, simulation,
  };
  if (simulation) {
    await verifierLimiteProduits(companyId, plan.creations.length, null);
    return resume;
  }
  await sequelize.transaction(async (t) => {
    await Company.findByPk(companyId, { attributes: ['id'], lock: t.LOCK.UPDATE, transaction: t });
    await verifierLimiteProduits(companyId, plan.creations.length, t);
    const categories = new Map((await ProductCategory.findAll({ where: { company_id: companyId }, attributes: ['id', 'name'], transaction: t }))
      .map((c) => [c.name.toLowerCase(), c.id]));
    for (const nom of plan.categoriesACreer) {
      const c = await ProductCategory.create({ company_id: companyId, name: nom }, { transaction: t });
      categories.set(nom.toLowerCase(), c.id);
    }
    const categorie = (nom) => (nom ? { category_id: categories.get(nom.toLowerCase()) } : {});
    for (const { category, libelle, ...champs } of plan.creations) {
      const produit = await Product.create({ ...champs, ...categorie(category), company_id: companyId, created_by: user.id }, { transaction: t });
      await stock.tracerChangementFiche(t, produit, null, user);
      await stock.apresVariation(t, produit);
    }
    for (const { produit, champs: { category, ...champs } } of plan.misesAJour) {
      await produit.reload({ transaction: t, lock: t.LOCK.UPDATE });
      const avant = stock.estSuivi(produit) ? Number(produit.stock_quantity) : null;
      await produit.update({ ...champs, ...categorie(category) }, { transaction: t });
      if ('stock_quantity' in champs || 'low_stock_threshold' in champs) {
        await stock.tracerChangementFiche(t, produit, avant, user);
        await stock.apresVariation(t, produit);
      }
    }
    await journaliser({ action: 'produit.import', entityType: 'company', entityId: companyId, companyId, details: resume }, t);
    await synchroniser(t, [companyId, ...(await clientsActifs(companyId, t))], 'produit', { supplier_company_id: companyId, import: true });
  });
  return resume;
}

const nb = (v) => (v === null || v === undefined ? '' : Number(v));

/** Export du catalogue au format exact de l'import. */
async function exporter(companyId) {
  const produits = await Product.findAll({
    where: { company_id: companyId },
    include: [{ model: ProductCategory, as: 'category', attributes: ['name'] }],
    order: [['reference', 'ASC']],
  });
  return tableauCsv(COLONNES.map(([, titre]) => titre), produits.map((p) => [
    p.reference, p.name, p.description, p.unit, p.packaging, nb(p.price), nb(p.tax_rate), p.category?.name, p.availability,
    nb(p.stock_quantity), nb(p.min_order_quantity), nb(p.order_multiple), nb(p.max_order_quantity), nb(p.low_stock_threshold), p.is_active ? 'oui' : 'non',
  ]));
}

/** Modèle d'import vide (en-tête et une ligne d'exemple). */
function modele() {
  return tableauCsv(COLONNES.map(([, titre]) => titre), [
    ['RIZ-25', 'Riz brisé parfumé 25 kg', 'Sac de 25 kg', 'sac', '', 15000, 18, 'Céréales', 'disponible', 120, 1, '', 50, 20, 'oui'],
  ]);
}

module.exports = { importer, exporter, modele, COLONNES };
