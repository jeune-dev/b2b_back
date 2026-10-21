'use strict';

const crypto = require('crypto');
const sequelize = require('../../../config/db.js');
const {
  Document, Partnership, Order, Invoice, Payment, Product, DocumentTemplate, Company, Claim,
} = require('../../../models/index.js');
const storage = require('../../../infrastructure/storage.service.js');
const { preparerImage } = require('../../../infrastructure/image.service.js');
const { IMAGES } = require('../../../middlewares/upload.middleware.js');
const {
  NotFoundError, ForbiddenError, ConflictError,
} = require('../../../errors/AppError.js');
const { chargerPourEntreprise, chargerPartage } = require('../../../utils/acces.js');
const { journaliser } = require('../../audit/service/audit.service.js');

/**
 * Documents (§ 6 logo, § 8 photo produit, § 13 bon de livraison, § 14 facture
 * importée, § 15 modèles, § 16 preuve de paiement, pièces jointes de commande).
 *
 * Point d'entrée UNIQUE vers le stockage objet : tout fichier de l'application
 * a sa ligne `documents` (entreprise détentrice, contrepartie éventuelle,
 * ressource de rattachement, visibilité), ce qui rend le contrôle d'accès
 * uniforme (`verifierAcces`).
 */

/**
 * Enregistre un fichier reçu et crée sa ligne `documents`. À appeler dans une
 * transaction ouverte par `transactionAvecFichiers` (nettoyage du stockage si
 * la transaction échoue).
 *
 * @param {object} p
 * @param {string} p.companyId
 * @param {string|null} [p.partnerCompanyId]  contrepartie (visibilité « partenaire »)
 * @param {string} p.entityType
 * @param {string} p.entityId
 * @param {string} p.category
 * @param {'prive'|'partenaire'|'catalogue'|'public'} [p.visibility]
 * @param {{ buffer: Buffer, type: string, mime: string, nomOrigine?: string }} p.fichier
 * @param {string|null} [p.uploadedBy]
 * @param {import('sequelize').Transaction} t
 */
async function creerDocument({
  companyId, partnerCompanyId = null, entityType, entityId, category, visibility = 'prive', fichier, uploadedBy = null,
}, t) {
  const dossier = `companies/${companyId}/${entityType}`;
  let contenu = fichier.buffer;
  let cleMiniature = null;

  if (IMAGES.has(fichier.type)) {
    const { original, miniature } = await preparerImage(fichier.buffer, fichier.type);
    contenu = original;
    cleMiniature = await storage.enregistrer(miniature, `${dossier}/miniatures`, 'webp', 'image/webp');
    t?.clesStockees?.push(cleMiniature);
  }

  const cle = await storage.enregistrer(contenu, dossier, fichier.type, fichier.mime);
  t?.clesStockees?.push(cle);

  const document = await Document.create({
    company_id: companyId,
    partner_company_id: partnerCompanyId,
    entity_type: entityType,
    entity_id: entityId,
    category,
    visibility,
    storage_key: cle,
    thumbnail_key: cleMiniature,
    mime_type: fichier.mime,
    size_bytes: contenu.length,
    original_name: fichier.nomOrigine || null,
    checksum: crypto.createHash('sha256').update(contenu).digest('hex'),
    uploaded_by: uploadedBy,
  }, { transaction: t });

  await journaliser({
    action: `${entityType}.ajout_document`,
    entityType,
    entityId,
    companyId,
    details: { document_id: document.id, categorie: category, taille: contenu.length },
  }, t);

  return document;
}

/**
 * Peut-on lire ce document ?
 *   - l'entreprise qui le détient : toujours ;
 *   - « partenaire » : la contrepartie désignée (commande, facture, paiement) ;
 *   - « catalogue » : les clients liés par un partenariat ACTIF (photo produit) ;
 *   - « public » : toute entreprise connectée (logo de l'annuaire).
 */
async function verifierAcces(document, companyId) {
  if (!companyId) throw new ForbiddenError("Vous n'avez pas accès à ce document.", 'ACCES_DOCUMENT_REFUSE');
  if (document.company_id === companyId) return;
  if (document.visibility === 'public') return;
  if (document.visibility === 'partenaire' && document.partner_company_id === companyId) return;
  if (document.visibility === 'catalogue') {
    const lien = await Partnership.findOne({
      where: { supplier_company_id: document.company_id, buyer_company_id: companyId, status: 'actif' },
      attributes: ['id'],
    });
    if (lien) return;
  }
  throw new ForbiddenError("Vous n'avez pas accès à ce document.", 'ACCES_DOCUMENT_REFUSE');
}

async function charger(id, options = {}) {
  const document = await Document.findByPk(id, options);
  if (!document) throw new NotFoundError('Document introuvable');
  return document;
}

/** Représentation d'API : jamais la clé de stockage elle-même. */
function versApi(document) {
  if (!document) return null;
  return {
    id: document.id,
    company_id: document.company_id,
    category: document.category,
    visibility: document.visibility,
    mime_type: document.mime_type,
    size_bytes: document.size_bytes,
    original_name: document.original_name,
    has_thumbnail: Boolean(document.thumbnail_key),
    created_at: document.created_at,
    url: `/api/v1/documents/${document.id}/fichier`,
  };
}

/**
 * Ressources dont on peut lister les documents : la ressource doit être
 * accessible à l'appelant (403 sinon), avec la même règle que son module.
 */
async function verifierRessource(entityType, entityId, companyId) {
  switch (entityType) {
    case 'order':
      await chargerPartage(Order, entityId, companyId, { attributes: ['id', 'buyer_company_id', 'supplier_company_id', 'status'] }, 'Commande', {
        visiblePar: (o, cote) => cote === 'acheteur' || o.status !== 'brouillon',
      });
      return;
    case 'invoice':
      await chargerPartage(Invoice, entityId, companyId, { attributes: ['id', 'buyer_company_id', 'supplier_company_id'] }, 'Facture');
      return;
    case 'payment':
      await chargerPartage(Payment, entityId, companyId, { attributes: ['id', 'buyer_company_id', 'supplier_company_id'] }, 'Paiement');
      return;
    case 'claim':
      await chargerPartage(Claim, entityId, companyId, { attributes: ['id', 'buyer_company_id', 'supplier_company_id'] }, 'Litige');
      return;
    case 'partnership':
      await chargerPartage(Partnership, entityId, companyId, { attributes: ['id', 'buyer_company_id', 'supplier_company_id'] }, 'Partenariat');
      return;
    case 'product': {
      const produit = await Product.findByPk(entityId, { attributes: ['id', 'company_id'] });
      if (!produit) throw new NotFoundError('Produit introuvable');
      if (produit.company_id !== companyId) {
        const lien = await Partnership.findOne({ where: { supplier_company_id: produit.company_id, buyer_company_id: companyId, status: 'actif' }, attributes: ['id'] });
        if (!lien) throw new ForbiddenError("Vous n'avez pas accès à cette ressource.", 'ACCES_AUTRE_ENTREPRISE');
      }
      return;
    }
    case 'document_template':
      await chargerPourEntreprise(DocumentTemplate, entityId, companyId, { attributes: ['id', 'company_id'] }, 'Modèle');
      return;
    case 'company':
      if (!(await Company.findByPk(entityId, { attributes: ['id'] }))) throw new NotFoundError('Entreprise introuvable');
      return;
    default:
      throw new NotFoundError('Ressource introuvable');
  }
}

/**
 * Documents visibles par l'appelant pour une ressource donnée, ou tous les
 * documents de son entreprise.
 */
async function lister(companyId, { entity_type: entityType, entity_id: entityId } = {}, { limit, offset }) {
  if (entityType) {
    await verifierRessource(entityType, entityId, companyId);
    const tous = await Document.findAll({
      where: { entity_type: entityType, entity_id: entityId },
      order: [['created_at', 'DESC'], ['id', 'ASC']],
    });
    const visibles = [];
    for (const d of tous) {
      try {
        await verifierAcces(d, companyId);
        visibles.push(d);
      } catch { /* document privé de l'autre partie : non listé */ }
    }
    return { rows: visibles.slice(offset, offset + limit).map(versApi), count: visibles.length };
  }
  const { rows, count } = await Document.findAndCountAll({
    where: { company_id: companyId },
    order: [['created_at', 'DESC'], ['id', 'ASC']],
    limit,
    offset,
  });
  return { rows: rows.map(versApi), count };
}

/** Extension de repli (nom de fichier) déduite du type MIME stocké. */
const EXTENSIONS = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
};

/**
 * En-tête Content-Disposition SÛR : le nom d'origine vient du client et
 * pourrait contenir guillemets, retours chariot (injection d'en-tête) ou
 * caractères non ASCII. Il est nettoyé, puis transmis deux fois : une version
 * ASCII de repli (`filename`) et la version exacte encodée RFC 5987.
 */
function dispositionInline(document, miniature) {
  const extension = miniature ? 'webp' : (EXTENSIONS[document.mime_type] || 'bin');
  let nom = String(document.original_name || '')
    .replace(/["\\\u0000-\u001f\u007f]/g, '')
    .replace(/[/]/g, '_')
    .trim()
    .slice(0, 150);
  if (!nom) nom = `document-${document.id}.${extension}`;
  if (miniature) nom = `miniature-${nom.replace(/\.[^.]*$/, '')}.webp`;
  const ascii = nom.replace(/[^\x20-\x7e]/g, '_');
  const encode = encodeURIComponent(nom).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encode}`;
}

/**
 * Ouvre le fichier d'un document après contrôle d'accès. La miniature est
 * servie si elle est demandée et existe ; sinon l'original.
 */
async function ouvrirFichier(id, companyId, { miniature = false } = {}) {
  const document = await charger(id);
  await verifierAcces(document, companyId);
  const servirMiniature = miniature && Boolean(document.thumbnail_key);
  const objet = await storage.ouvrir(servirMiniature ? document.thumbnail_key : document.storage_key);
  if (!objet) throw new NotFoundError('Fichier introuvable dans le stockage', 'FICHIER_INTROUVABLE');
  return {
    objet,
    mime: servirMiniature ? 'image/webp' : document.mime_type,
    disposition: dispositionInline(document, servirMiniature),
  };
}

/** Contenu complet d'un document (génération de PDF : logo, fond de modèle). */
async function lireContenu(documentId) {
  if (!documentId) return null;
  const document = await Document.findByPk(documentId, { attributes: ['id', 'storage_key'] });
  if (!document) return null;
  return storage.lire(document.storage_key);
}

const DUREE_LIEN_S = 300;

/**
 * Lien de téléchargement direct : URL signée R2 de 5 minutes, ou (stockage
 * disque) la route de flux authentifiée, qui applique le même contrôle.
 */
async function lienTemporaire(id, companyId, { miniature = false } = {}) {
  const document = await charger(id);
  await verifierAcces(document, companyId);
  const servirMiniature = miniature && Boolean(document.thumbnail_key);
  const url = await storage.urlTemporaire(servirMiniature ? document.thumbnail_key : document.storage_key, DUREE_LIEN_S);
  if (url) return { url, expires_in: DUREE_LIEN_S };
  return {
    url: `/api/v1/documents/${document.id}/fichier${servirMiniature ? '?taille=miniature' : ''}`,
    expires_in: null,
  };
}

/**
 * Catégories supprimables depuis /documents : une pièce jointe ajoutée à une
 * commande. Le logo, la photo d'un produit et le fond d'un modèle se
 * remplacent par LEUR module ; une facture importée, un bon de livraison ou
 * une preuve de paiement sont des pièces probantes : jamais supprimés.
 */
const CATEGORIES_SUPPRIMABLES = Object.freeze(['piece_jointe', 'autre']);

/** Suppression LOGIQUE (paranoid) : la ligne reste traçable, l'objet est conservé. */
async function supprimer(id, companyId) {
  return sequelize.transaction(async (t) => {
    const document = await chargerPourEntreprise(Document, id, companyId, { lock: t.LOCK.UPDATE, transaction: t }, 'Document');
    if (!CATEGORIES_SUPPRIMABLES.includes(document.category)) {
      throw new ConflictError('Ce document ne peut pas être supprimé ici : il est géré par sa ressource ou constitue une pièce probante.', 'DOCUMENT_PROTEGE', { category: document.category });
    }
    if (document.entity_type === 'order') {
      const commande = await Order.findByPk(document.entity_id, { attributes: ['status'], transaction: t });
      if (commande && ['terminee', 'facturee', 'annulee', 'refusee'].includes(commande.status)) {
        throw new ConflictError('La commande est close : ses pièces jointes sont conservées.', 'DOCUMENT_PROTEGE');
      }
    }
    await document.destroy({ transaction: t });
    await journaliser({
      action: 'document.suppression', entityType: 'document', entityId: document.id, companyId,
      details: { categorie: document.category, rattachement: document.entity_type, rattachement_id: document.entity_id, nom: document.original_name },
    }, t);
  });
}

module.exports = {
  creerDocument, verifierAcces, charger, versApi, lister, ouvrirFichier, lireContenu,
  lienTemporaire, supprimer, CATEGORIES_SUPPRIMABLES,
};
