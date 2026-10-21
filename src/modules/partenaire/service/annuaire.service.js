'use strict';

const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const { Company } = require('../../../models/index.js');
const { NotFoundError } = require('../../../errors/AppError.js');
const { ordre, rechercheTexte } = require('../../../utils/liste.js');

/**
 * Annuaire des entreprises (§ 7 « rechercher un fournisseur », « consulter son
 * profil »).
 *
 * Seules les entreprises ACTIVES ayant choisi d'être visibles (`is_listed`)
 * apparaissent, avec leurs informations PUBLIQUES : aucun utilisateur, aucun
 * paramètre, aucune coordonnée bancaire. Chaque ligne indique la relation
 * existante avec l'entreprise connectée (une requête, sous-requêtes indexées).
 */

const PUBLICS = ['id', 'name', 'legal_name', 'type', 'sector', 'description', 'address', 'city', 'country',
  'phone', 'email', 'website', 'ninea', 'rccm', 'logo_document_id', 'created_at'];

const relation = (alias) => [
  [sequelize.literal(`(SELECT json_build_object('id', p.id, 'status', p.status) FROM partnerships p
     WHERE p.buyer_company_id = :moi AND p.supplier_company_id = "${alias}"."id")`), 'as_supplier'],
  [sequelize.literal(`(SELECT json_build_object('id', p.id, 'status', p.status) FROM partnerships p
     WHERE p.supplier_company_id = :moi AND p.buyer_company_id = "${alias}"."id")`), 'as_client'],
  [sequelize.literal(`(SELECT count(*)::int FROM products pr WHERE pr.company_id = "${alias}"."id" AND pr.is_active AND pr.deleted_at IS NULL)`), 'products_count'],
];

function versApi(company) {
  const c = company.toJSON();
  return {
    ...c,
    logo_url: c.logo_document_id ? `/api/v1/documents/${c.logo_document_id}/fichier` : null,
    // Ce que l'entreprise annuaire est POUR MOI : mon fournisseur, mon client.
    my_relation: {
      supplier: c.as_supplier || null,
      client: c.as_client || null,
    },
    as_supplier: undefined,
    as_client: undefined,
  };
}

/**
 * @param {{ q?: string, type?: 'fournisseur'|'acheteur', sector?: string, city?: string, tri?: string }} filtres
 */
async function rechercher(companyId, filtres, { limit, offset }) {
  const conditions = [{ status: 'actif', is_listed: true, id: { [Op.ne]: companyId } }];
  if (filtres.type === 'fournisseur') conditions.push({ type: { [Op.in]: ['fournisseur', 'mixte'] } });
  if (filtres.type === 'acheteur') conditions.push({ type: { [Op.in]: ['acheteur', 'mixte'] } });
  if (filtres.sector) conditions.push({ sector: filtres.sector });
  if (filtres.city) conditions.push({ city: { [Op.iLike]: filtres.city } });
  const texte = rechercheTexte(filtres.q, ['name', 'legal_name', 'city', 'ninea']);
  if (texte) conditions.push(texte);
  const { rows, count } = await Company.findAndCountAll({
    where: { [Op.and]: conditions },
    attributes: [...PUBLICS, ...relation('Company')],
    replacements: { moi: companyId },
    order: ordre(filtres.tri, 'name'),
    limit,
    offset,
  });
  return { rows: rows.map(versApi), count };
}

/** Profil public. Une entreprise non listée reste visible de ses partenaires. */
async function profil(id, companyId) {
  const company = await Company.findOne({
    where: { id, status: 'actif' },
    attributes: [...PUBLICS, 'is_listed', ...relation('Company')],
    replacements: { moi: companyId },
  });
  if (!company) throw new NotFoundError('Entreprise introuvable');
  const donnees = versApi(company);
  if (!company.is_listed && !donnees.my_relation.supplier && !donnees.my_relation.client && id !== companyId) {
    throw new NotFoundError('Entreprise introuvable');
  }
  delete donnees.is_listed;
  return donnees;
}

module.exports = { rechercher, profil };
