'use strict';

const {
  Company, DocumentTemplate, Invoice, InvoiceLine, Order,
} = require('../../../models/index.js');
const { STATUT_COMMANDE, STATUT_FACTURE, UNITE } = require('../../../config/enums.js');
const { NotFoundError } = require('../../../errors/AppError.js');
const { generer } = require('../../../infrastructure/pdf.service.js');
const { formatFcfa, formatQuantite, enLettres } = require('../../../utils/montants.js');
const { formatFr, aujourdhui } = require('../../../utils/dates.js');
const { chargerPartage } = require('../../../utils/acces.js');
const logger = require('../../../utils/logger.js');
const documents = require('../../document/service/document.service.js');
const C = require('../../commande/service/commun.js');
const { modeleActif } = require('./modele.service.js');

/**
 * Rendu PDF des documents commerciaux (§ 9.1 bon de commande, § 14 facture,
 * § 15 modèles).
 *
 * Le document est produit À LA DEMANDE à partir de données FIGÉES (version de
 * commande, lignes de facture, version de modèle enregistrée sur le
 * document) : le réimprimer donne toujours le même contenu, sans stocker un
 * PDF à chaque événement. Le modèle est celui de l'ÉMETTEUR : l'acheteur
 * pour le bon de commande, le fournisseur pour la facture.
 */

const ATTRIBUTS = ['id', 'name', 'legal_name', 'address', 'city', 'country', 'phone', 'email', 'website', 'ninea', 'rccm',
  'tax_regime', 'vat_registered', 'bank_details', 'logo_document_id'];

/** Lit un fichier stocké sans jamais faire échouer le rendu (image manquante → document sans elle). */
async function contenuSur(documentId) {
  try {
    return await documents.lireContenu(documentId);
  } catch (err) {
    logger.warn('[rendu] Fichier de modèle illisible — rendu sans lui', { document_id: documentId, error: err.message });
    return null;
  }
}

function blocEntreprise(titre, c) {
  return {
    titre,
    nom: c.legal_name || c.name,
    lignes: [
      c.address && `${c.address}${c.city ? `, ${c.city}` : ''}`,
      !c.address && c.city,
      c.phone && `Tél. : ${c.phone}`,
      c.email,
      c.ninea && `NINEA : ${c.ninea}`,
      c.rccm && `RCCM : ${c.rccm}`,
    ],
  };
}

/**
 * Dessine un document commercial.
 * @param {object} p
 * @param {object|null} p.modele          version de modèle (null : modèle standard)
 * @param {object} p.emetteur, p.destinataire  entreprises
 */
async function rendre({
  modele, emetteur, destinataire, titre, numero, references, lignes, totaux = null, lettres = null, mentions = [], filigrane = null,
  tableau = null, signatures = false,
}) {
  const [fond, logo] = await Promise.all([
    modele?.background_document_id ? contenuSur(modele.background_document_id) : null,
    (!modele || modele.show_logo) && emetteur.logo_document_id ? contenuSur(emetteur.logo_document_id) : null,
  ]);
  const pied = [modele?.footer_text, modele?.legal_mentions].filter(Boolean).join(' — ')
    || [emetteur.legal_name || emetteur.name, emetteur.ninea && `NINEA ${emetteur.ninea}`, emetteur.rccm && `RCCM ${emetteur.rccm}`].filter(Boolean).join(' — ');

  return generer(async (doc, a) => {
    const haut = doc.y;
    if (logo) {
      try {
        doc.image(logo, doc.page.margins.left, haut, { fit: [140, 60] });
      } catch {
        // Logo illisible : ignoré, le document reste valable.
      }
    }
    doc.y = haut;
    a.titre(titre);
    doc.font('Helvetica-Bold').fontSize(11).text(`N° ${numero}`, { align: 'right' });
    doc.font('Helvetica').fontSize(9).text(`Édité le ${formatFr(aujourdhui())}`, { align: 'right' });
    if (filigrane) doc.fillColor(a.accent).font('Helvetica-Bold').fontSize(10).text(filigrane, { align: 'right' }).fillColor('#1f2937').font('Helvetica');
    doc.y = Math.max(doc.y, haut + 70);
    if (modele?.header_text) a.paragraphe(modele.header_text, { taille: 9 });
    doc.moveDown(0.5);
    // Le bon de commande est émis par l'acheteur ; facture, avoir et bon de livraison par le fournisseur.
    const [gauche, droite] = titre === 'BON DE COMMANDE' ? ['Acheteur', 'Fournisseur'] : ['Fournisseur', 'Client'];
    a.deuxColonnes(blocEntreprise(gauche, emetteur), blocEntreprise(droite, destinataire));
    a.sousTitre('Références');
    a.champs(references);
    doc.moveDown(0.5);
    if (tableau) {
      a.tableau(tableau.entetes, tableau.lignes, tableau.largeurs, tableau.alignements);
    } else {
      a.tableau(
        ['N°', 'Référence', 'Désignation', 'Unité', 'Qté', 'PU HT', 'TVA', 'Total HT'],
        lignes.map((l) => [
          l.line_no, l.reference || '', `${l.name}${l.note ? `\n${l.note}` : ''}`, UNITE[l.unit] || l.unit, formatQuantite(l.quantity),
          formatFcfa(l.unit_price), `${Number(l.tax_rate)} %`, formatFcfa(l.line_subtotal),
        ]),
        [4, 10, 28, 8, 7, 13, 6, 14],
        ['left', 'left', 'left', 'left', 'right', 'right', 'right', 'right']
      );
    }
    if (totaux) a.totaux(totaux);
    if (lettres) a.paragraphe(lettres, { taille: 9 });
    for (const m of mentions.filter(Boolean)) a.paragraphe(m, { taille: 9 });
    if (signatures) {
      doc.moveDown(1.5);
      a.deuxColonnes(
        { titre: 'Remis par (fournisseur)', nom: '', lignes: ['Nom et signature :'] },
        { titre: 'Reçu par (client)', nom: '', lignes: ['Nom, date et signature :'] }
      );
    }
  }, {
    titre: `${titre} ${numero}`,
    auteur: emetteur.name,
    accent: modele?.accent_color,
    fond,
    margeHaut: modele?.margin_top,
    margeBas: modele?.margin_bottom,
    pied,
  });
}

const paireTotaux = ({ subtotal, tax_total: tva, total }) => [
  ['Total HT', formatFcfa(subtotal)],
  ['TVA', formatFcfa(tva)],
  ['Total TTC', formatFcfa(total), true],
];

const nomFichier = (prefixe, numero) => `${prefixe}-${String(numero).replace(/[^A-Za-z0-9-]/g, '_')}.pdf`;

/**
 * § 9.1 — bon de commande. Version : celle demandée, sinon la version
 * validée (référence officielle, § 11), sinon la version courante.
 */
async function bonDeCommande(orderId, companyId, cote, versionDemandee) {
  const { commande } = await C.charger(orderId, companyId, {}, { cote });
  const numeroVersion = versionDemandee || commande.validated_version_no || commande.current_version_no;
  const version = await C.version(commande.id, numeroVersion);
  if (!version || (version.status === 'brouillon' && commande.buyer_company_id !== companyId)) throw new NotFoundError('Version introuvable');
  const [acheteur, fournisseur] = await Promise.all([
    Company.findByPk(commande.buyer_company_id, { attributes: ATTRIBUTS, paranoid: false }),
    Company.findByPk(commande.supplier_company_id, { attributes: ATTRIBUTS, paranoid: false }),
  ]);
  const modele = commande.template_id
    ? await DocumentTemplate.findByPk(commande.template_id)
    : await modeleActif(commande.buyer_company_id, 'bon_commande');
  const lignes = version.lines.map((l) => ({
    ...l.get({ plain: true }),
    note: l.change_type === 'indisponible' ? 'Indisponible' : (l.comment || null),
  }));
  const contenu = await rendre({
    modele,
    emetteur: acheteur,
    destinataire: fournisseur,
    titre: 'BON DE COMMANDE',
    numero: commande.number,
    filigrane: `${STATUT_COMMANDE[commande.status]}${commande.validated_version_no === version.version_no ? ' — version validée' : ` — version ${version.version_no}`}`,
    references: [
      ['Date', formatFr(commande.sent_at || commande.created_at)],
      ['Référence acheteur', commande.buyer_reference],
      ['Livraison souhaitée', commande.requested_delivery_date ? formatFr(commande.requested_delivery_date) : null],
      ['Adresse de livraison', commande.delivery_address],
      ['Conditions', commande.conditions],
    ],
    lignes,
    totaux: paireTotaux(version),
    lettres: `Arrêté le présent bon de commande à la somme de ${enLettres(version.total)} francs CFA.`,
  });
  return { nom: nomFichier('bon-de-commande', commande.number), contenu };
}

/**
 * Bon de livraison d'une livraison (§ 13) : quantités commandées, livrées
 * par CE bon, livrées au total ; cadres de signature. Gabarit du fournisseur
 * (son modèle de facture actif : même logo, mêmes couleurs).
 */
async function bonDeLivraison({ commande, livraison, lignesCommande }) {
  const [fournisseur, acheteur, modele] = await Promise.all([
    Company.findByPk(commande.supplier_company_id, { attributes: ATTRIBUTS, paranoid: false }),
    Company.findByPk(commande.buyer_company_id, { attributes: ATTRIBUTS, paranoid: false }),
    modeleActif(commande.supplier_company_id, 'facture'),
  ]);
  const commandees = new Map(lignesCommande.map((l) => [l.line_no, l]));
  const contenu = await rendre({
    modele,
    emetteur: fournisseur,
    destinataire: acheteur,
    titre: 'BON DE LIVRAISON',
    numero: livraison.number,
    filigrane: livraison.status === 'receptionnee'
      ? `Réceptionné le ${formatFr(aujourdhui(livraison.received_at))}`
      : `Livraison n° ${livraison.delivery_no}`,
    references: [
      ['Date de livraison', formatFr(aujourdhui(livraison.shipped_at))],
      ['Bon de commande', commande.number],
      ['Référence client', commande.buyer_reference],
      ['Adresse de livraison', commande.delivery_address],
      ['Transporteur', livraison.carrier],
      ['Note', livraison.note],
    ],
    lignes: [],
    tableau: {
      entetes: ['N°', 'Référence', 'Désignation', 'Unité', 'Commandé', 'Livré (ce bon)', 'Livré (total)'],
      lignes: livraison.lines.map((l) => {
        const c = commandees.get(l.line_no);
        return [l.line_no, l.reference || '', l.name, UNITE[l.unit] || l.unit, c ? formatQuantite(c.quantity) : '', formatQuantite(l.quantity), c ? formatQuantite(c.delivered_quantity) : ''];
      }),
      largeurs: [4, 12, 34, 9, 11, 13, 13],
      alignements: ['left', 'left', 'left', 'left', 'right', 'right', 'right'],
    },
    mentions: [livraison.reception_note && `Observations du client : ${livraison.reception_note}`],
    signatures: true,
  });
  return { nom: nomFichier('bon-de-livraison', livraison.number), contenu };
}

/** Avoir (note de crédit) du fournisseur, au modèle de ses factures. */
async function avoir(note, lignes) {
  const [fournisseur, acheteur, factureLiee, commande, modele] = await Promise.all([
    Company.findByPk(note.supplier_company_id, { attributes: ATTRIBUTS, paranoid: false }),
    Company.findByPk(note.buyer_company_id, { attributes: ATTRIBUTS, paranoid: false }),
    note.invoice_id ? Invoice.findByPk(note.invoice_id, { attributes: ['number'] }) : null,
    note.order_id ? Order.findByPk(note.order_id, { attributes: ['number'] }) : null,
    note.template_id ? DocumentTemplate.findByPk(note.template_id) : null,
  ]);
  const contenu = await rendre({
    modele,
    emetteur: fournisseur,
    destinataire: acheteur,
    titre: 'AVOIR',
    numero: note.number,
    filigrane: note.status === 'annule' ? 'ANNULÉ' : null,
    references: [
      ["Date de l'avoir", formatFr(note.issue_date)],
      ['Facture concernée', factureLiee?.number],
      ['Bon de commande', commande?.number],
      ['Motif', note.reason],
    ],
    lignes,
    totaux: paireTotaux(note),
    lettres: `Arrêté le présent avoir à la somme de ${enLettres(note.total)} francs CFA toutes taxes comprises, à déduire de vos règlements.`,
  });
  return { nom: nomFichier('avoir', note.number), contenu };
}

/** Données d'une facture prêtes pour le rendu. */
async function rendreFacture(facture) {
  const [fournisseur, acheteur, lignes, commande] = await Promise.all([
    Company.findByPk(facture.supplier_company_id, { attributes: ATTRIBUTS, paranoid: false }),
    Company.findByPk(facture.buyer_company_id, { attributes: ATTRIBUTS, paranoid: false }),
    InvoiceLine.findAll({ where: { invoice_id: facture.id }, order: [['line_no', 'ASC']] }),
    Order.findByPk(facture.order_id, { attributes: ['number', 'buyer_reference'] }),
  ]);
  const modele = facture.template_id ? await DocumentTemplate.findByPk(facture.template_id) : null;
  const reste = Number(facture.total) - Number(facture.amount_paid);
  return rendre({
    modele,
    emetteur: fournisseur,
    destinataire: acheteur,
    titre: 'FACTURE',
    numero: facture.number,
    filigrane: facture.status === 'annulee' ? 'ANNULÉE' : STATUT_FACTURE[facture.status],
    references: [
      ['Date de facture', formatFr(facture.issue_date)],
      ['Échéance', formatFr(facture.due_date)],
      ['Bon de commande', commande?.number],
      ['Référence client', commande?.buyer_reference],
    ],
    lignes: lignes.map((l) => l.get({ plain: true })),
    totaux: [
      ...paireTotaux(facture),
      ...(Number(facture.amount_paid) > 0 ? [['Déjà réglé', formatFcfa(facture.amount_paid)], ['Reste à payer', formatFcfa(reste), true]] : []),
    ],
    lettres: `Arrêtée la présente facture à la somme de ${enLettres(facture.total)} francs CFA toutes taxes comprises.`,
    mentions: [
      facture.note,
      fournisseur.bank_details && `Règlement : ${fournisseur.bank_details}`,
      !fournisseur.vat_registered && 'TVA non applicable (entreprise non assujettie).',
    ],
  });
}

/** § 14 — facture au format PDF (générée) ; une facture importée est servie telle quelle. */
async function facture(invoiceId, companyId) {
  const { ressource } = await chargerPartage(Invoice, invoiceId, companyId, {}, 'Facture');
  if (ressource.source === 'importee') return { importee: ressource.file_document_id };
  return { nom: nomFichier('facture', ressource.number), contenu: await rendreFacture(ressource) };
}

/** Aperçu d'un modèle avec des données d'exemple (§ 15 : vérifier avant d'utiliser). */
async function apercu(modeleId, companyId) {
  const modele = await DocumentTemplate.findByPk(modeleId);
  if (!modele || modele.company_id !== companyId) throw new NotFoundError('Modèle introuvable');
  const emetteur = await Company.findByPk(companyId, { attributes: ATTRIBUTS });
  const exemple = {
    name: 'Entreprise partenaire (exemple)', address: 'Zone industrielle', city: 'Dakar', phone: '+221 33 800 00 00', ninea: '000000000',
  };
  const lignes = [
    { line_no: 1, reference: 'REF-001', name: 'Produit exemple A', unit: 'carton', quantity: 10, unit_price: 12500, tax_rate: 18, line_subtotal: 125000 },
    { line_no: 2, reference: 'REF-002', name: 'Produit exemple B', unit: 'kg', quantity: 2.5, unit_price: 3000, tax_rate: 18, line_subtotal: 7500 },
  ];
  const estFacture = modele.type === 'facture';
  const contenu = await rendre({
    modele,
    emetteur,
    destinataire: exemple,
    titre: estFacture ? 'FACTURE' : 'BON DE COMMANDE',
    numero: estFacture ? 'FAC-0000-00000' : 'BC-0000-00000',
    filigrane: 'APERÇU — document sans valeur',
    references: [['Date', formatFr(aujourdhui())]],
    lignes,
    totaux: paireTotaux({ subtotal: 132500, tax_total: 23850, total: 156350 }),
    lettres: `Arrêté à la somme de ${enLettres(156350)} francs CFA.`,
    mentions: [estFacture && emetteur.bank_details && `Règlement : ${emetteur.bank_details}`],
  });
  return { nom: nomFichier('apercu', `${modele.type}-v${modele.version}`), contenu };
}

module.exports = {
  bonDeCommande, bonDeLivraison, avoir, facture, rendreFacture, apercu,
};
