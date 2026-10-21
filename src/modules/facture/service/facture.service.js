'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../../../config/db.js');
const {
  Invoice, InvoiceLine, Order, Company, Partnership, PaymentAllocation, Payment,
} = require('../../../models/index.js');
const { P } = require('../../../config/permissions.js');
const { parametresEntreprise } = require('../../../config/parametres.js');
const { ConflictError, ValidationError } = require('../../../errors/AppError.js');
const { chargerPartage } = require('../../../utils/acces.js');
const { prochainNumero, pad } = require('../../../utils/compteur.js');
const { aujourdhui, ajouterJours, formatFr } = require('../../../utils/dates.js');
const { ordre, periode, rechercheTexte } = require('../../../utils/liste.js');
const { totaliser, formatFcfa } = require('../../../utils/montants.js');
const cache = require('../../../utils/cache.js');
const { transactionAvecFichiers } = require('../../../database/transaction.js');
const C = require('../../commande/service/commun.js');
const R = require('./rapprochement.service.js');
const parametres = require('../../parametres/service/parametres.service.js');
const documents = require('../../document/service/document.service.js');
const modeles = require('../../modele/service/modele.service.js');
const email = require('../../../infrastructure/email.service.js');
const { journaliser } = require('../../audit/service/audit.service.js');
const { notifierEntreprise, synchroniser } = require('../../notification/service/notification.service.js');
const logger = require('../../../utils/logger.js');

/**
 * Facturation (§ 14).
 *
 * « Après réception de la commande, le fournisseur transmet/génère la
 * facture. La facture est associée à la commande concernée. » :
 *   - GÉNÉRÉE par Pro2Link au modèle du fournisseur (§ 15), à partir de la
 *     version VALIDÉE de la commande et des quantités RÉCEPTIONNÉES ;
 *   - ou TRANSMISE : le fournisseur importe sa propre facture (PDF ou image),
 *     les montants restant ceux de la commande réceptionnée.
 * Une seule facture en vigueur par commande. L'échéance découle du délai de
 * paiement du partenariat (§ 16).
 *
 * Statut de paiement tenu à jour par le module paiement (imputations) :
 * émise → partiellement payée → payée ; « en retard » posé par la tâche
 * quotidienne quand l'échéance est passée.
 */

const INCLUDES = [
  { model: Company, as: 'supplier', attributes: ['id', 'name', 'city', 'logo_document_id'], paranoid: false },
  { model: Company, as: 'buyer', attributes: ['id', 'name', 'city', 'logo_document_id'], paranoid: false },
  { model: Order, as: 'order', attributes: ['id', 'number', 'buyer_reference', 'status'] },
];

function versApi(facture, companyId) {
  const f = facture.toJSON();
  const sens = f.supplier_company_id === companyId ? 'emise' : 'recue';
  return {
    ...f,
    direction: sens,
    balance_due: f.status === 'annulee' ? 0 : Number(f.total) - Number(f.amount_paid),
    // Écart de rapprochement non résolu : aucun paiement ne s'impute sur la facture.
    payment_blocked: f.status !== 'annulee' && R.estBloquee(f),
    pdf_url: `/api/v1/factures/${f.id}/pdf`,
  };
}

/**
 * Liste : `sens` « emises » (fournisseur) ou « recues » (acheteur) ; sans
 * sens, les deux (entreprise mixte).
 */
async function lister(companyId, f, { limit, offset }) {
  const conditions = [];
  if (f.sens === 'emises') conditions.push({ supplier_company_id: companyId });
  else if (f.sens === 'recues') conditions.push({ buyer_company_id: companyId });
  else conditions.push({ [Op.or]: [{ supplier_company_id: companyId }, { buyer_company_id: companyId }] });
  if (f.status) conditions.push({ status: { [Op.in]: String(f.status).split(',') } });
  if (f.partner_id) conditions.push({ [Op.or]: [{ supplier_company_id: f.partner_id }, { buyer_company_id: f.partner_id }] });
  if (f.impayees) conditions.push({ status: { [Op.in]: ['emise', 'partiellement_payee', 'en_retard'] } });
  if (f.bloquees) conditions.push({ match_status: { [Op.in]: ['ecart', 'conteste'] }, status: { [Op.ne]: 'annulee' } });
  const texte = rechercheTexte(f.q, ['number']);
  if (texte) conditions.push(texte);
  const dates = periode(f.du, f.au);
  if (dates) conditions.push({ issue_date: dates });
  if (f.modifie_depuis) conditions.push({ updated_at: { [Op.gt]: f.modifie_depuis } });
  const { rows, count } = await Invoice.findAndCountAll({
    where: { [Op.and]: conditions },
    include: INCLUDES,
    order: ordre(f.tri, '-issue_date'),
    limit,
    offset,
  });
  return { rows: rows.map((i) => versApi(i, companyId)), count };
}

async function charger(id, companyId, options = {}, cote = null) {
  return chargerPartage(Invoice, id, companyId, options, 'Facture', { cote });
}

async function detail(id, companyId) {
  const { ressource } = await charger(id, companyId, {
    include: [...INCLUDES, { model: InvoiceLine, as: 'lines', separate: true, order: [['line_no', 'ASC']] }],
  });
  const imputations = await PaymentAllocation.findAll({
    where: { invoice_id: id, cancelled_at: null },
    include: [{ model: Payment, as: 'payment', attributes: ['id', 'reference', 'method', 'paid_on', 'status', 'amount'] }],
    order: [['created_at', 'ASC']],
  });
  const fichier = ressource.file_document_id ? documents.versApi(await documents.charger(ressource.file_document_id)) : null;
  return { ...versApi(ressource, companyId), allocations: imputations, file: fichier };
}

/** Numéro lisible par fournisseur et par année : FAC-2026-00007. */
async function nouveauNumero(companyId, t) {
  const annee = aujourdhui().slice(0, 4);
  const { invoice_prefix: prefixe } = await parametres.entreprise(companyId, t);
  const n = await prochainNumero(`company:${companyId}:invoice:${annee}`, t);
  return `${prefixe}-${annee}-${pad(n)}`;
}

/** Lignes facturées numérotées de 1 à n (le lien à la ligne de commande sert au rapprochement). */
const numeroter = (lignes) => lignes.map((l, i) => {
  const copie = { ...l, line_no: i + 1 };
  delete copie.order_line_no;
  return copie;
});

/**
 * Lignes de facture attendues : version VALIDÉE de la commande, quantités
 * RÉCEPTIONNÉES (§ 13 : livraison partielle ou casse) ; une ligne sans
 * quantité reçue (indisponible, rien reçu) n'est pas facturée.
 */
function lignesFacture(lignesCommande) {
  return numeroter(R.lignesAttendues(lignesCommande));
}

/**
 * § 14 — émission de la facture d'une commande réceptionnée. `fichier` :
 * facture propre du fournisseur (transmise) ; sinon générée par Pro2Link.
 *
 * Par défaut la facture reprend les quantités reçues aux prix validés. Le
 * fournisseur peut préciser d'autres quantités ou prix (`lines`) : la
 * facture est alors RAPPROCHÉE de la commande et de la réception — au-delà
 * de la tolérance de l'acheteur, elle est émise « avec écart » et son
 * paiement est bloqué jusqu'à la décision de l'acheteur.
 */
async function emettre(companyId, user, donnees, fichier = null) {
  let avis;
  const id = await transactionAvecFichiers(async (t) => {
    const { commande } = await C.chargerPourModifier(donnees.order_id, companyId, t, 'fournisseur');
    C.verifierRevision(commande, donnees.revision);
    if (commande.status !== 'reception_confirmee') {
      throw new ConflictError(
        commande.status === 'facturee' || commande.status === 'terminee'
          ? 'Cette commande est déjà facturée.'
          : 'La facture est établie après la confirmation de réception par le client (§ 13).',
        'COMMANDE_NON_FACTURABLE',
        { statut: commande.status }
      );
    }
    const version = await C.version(commande.id, commande.validated_version_no, t);
    const attendues = R.lignesAttendues(version.lines);
    const facturees = R.lignesFacturees(attendues, version.lines, donnees.lines);
    if (!facturees.length) throw new ValidationError('Données invalides', ['Aucune quantité réceptionnée à facturer'], 'FACTURE_VIDE');
    const lignes = numeroter(facturees);
    const totaux = totaliser(lignes);
    const acheteur = await Company.findByPk(commande.buyer_company_id, { attributes: ['settings'], transaction: t });
    const rapprochement = R.rapprocher(
      attendues, facturees, Number(parametresEntreprise(acheteur).invoice_match_tolerance_percent), fichier ? donnees.declared_total ?? null : null
    );
    const partenariat = await Partnership.findByPk(commande.partnership_id, { attributes: ['payment_terms_days'], transaction: t });
    const emission = donnees.issue_date || aujourdhui();
    const echeance = donnees.due_date || ajouterJours(emission, partenariat.payment_terms_days);
    if (echeance < emission) throw new ValidationError('Données invalides', ["L'échéance ne peut pas précéder la date de facture"], 'ECHEANCE_INVALIDE');
    const modele = fichier ? null : await modeles.modeleActif(companyId, 'facture', t);

    // Facture transmise : le fichier est enregistré d'abord (la facture importée
    // exige son document, contrainte invoices_import_ck).
    const factureId = crypto.randomUUID();
    const document = fichier ? await documents.creerDocument({
      companyId, partnerCompanyId: commande.buyer_company_id, entityType: 'invoice', entityId: factureId,
      category: 'facture', visibility: 'partenaire', fichier, uploadedBy: user.id,
    }, t) : null;
    const facture = await Invoice.create({
      id: factureId,
      number: await nouveauNumero(companyId, t),
      supplier_company_id: companyId,
      buyer_company_id: commande.buyer_company_id,
      partnership_id: commande.partnership_id,
      order_id: commande.id,
      status: 'emise',
      source: fichier ? 'importee' : 'generee',
      issue_date: emission,
      due_date: echeance,
      ...totaux,
      template_id: modele?.id || null,
      file_document_id: document?.id || null,
      note: donnees.note || null,
      match_status: rapprochement.statut,
      match_details: rapprochement.details,
      created_by: user.id,
    }, { transaction: t });
    await InvoiceLine.bulkCreate(lignes.map((l) => ({ ...l, invoice_id: facture.id })), { transaction: t });

    await commande.update({ status: 'facturee', invoiced_at: new Date() }, { transaction: t });
    await C.historiser(t, commande, {
      type: 'facturation', de: 'reception_confirmee', vers: 'facturee', acteur: user, companyId, cote: 'fournisseur',
      details: { invoice_id: facture.id, number: facture.number, total: facture.total },
    });
    await C.apresChangement(t, commande);
    // Avoirs, acompte ou trop-perçu antérieurs du client : imputés sur la
    // nouvelle facture (§ 16) — sauf facture bloquée par un écart.
    await imputerToutCredit(commande.partnership_id, t, user);
    await facture.reload({ transaction: t });
    await journaliser({
      action: 'facture.creation', entityType: 'invoice', entityId: facture.id, companyId,
      details: {
        number: facture.number, commande: commande.number, total: facture.total, source: facture.source, echeance, rapprochement: rapprochement.statut,
      },
    }, t);
    if (rapprochement.statut === 'ecart') {
      await notifierEntreprise(t, commande.buyer_company_id, P.PAIEMENTS_ENREGISTRER, {
        type: 'facture_ecart',
        titre: `Écart de facturation — ${facture.number}`,
        corps: `La facture ${facture.number} ne correspond pas à la commande ${commande.number} et à sa réception (${rapprochement.details.ecarts.length} écart(s)). Son paiement est bloqué : acceptez l'écart ou contestez la facture.`,
        donnees: { invoice_id: facture.id, order_id: commande.id, number: facture.number },
      });
    }
    const [fournisseur, client] = await Promise.all([
      Company.findByPk(companyId, { attributes: ['name'], transaction: t }),
      Company.findByPk(commande.buyer_company_id, { attributes: ['email'], transaction: t }),
    ]);
    await notifierEntreprise(t, commande.buyer_company_id, P.FACTURES_LIRE, {
      type: 'nouvelle_facture',
      titre: `Nouvelle facture ${facture.number}`,
      corps: `${fournisseur.name} vous a transmis la facture ${facture.number} (${formatFcfa(facture.total)}) pour la commande ${commande.number}, à régler avant le ${formatFr(echeance)}.`,
      donnees: { invoice_id: facture.id, order_id: commande.id, number: facture.number },
    });
    await synchroniser(t, [companyId, commande.buyer_company_id], 'facture', { invoice_id: facture.id, status: 'emise' });
    avis = { email: client.email, fournisseur: fournisseur.name, number: facture.number, total: facture.total, id: facture.id, echeance };
    return facture.id;
  });
  if (avis.email) {
    email.envoyerAvis({
      email: avis.email,
      titre: `Nouvelle facture ${avis.number}`,
      texte: `${avis.fournisseur} vous a transmis la facture ${avis.number} d'un montant de ${formatFcfa(avis.total)}, à régler avant le ${formatFr(avis.echeance)}.`,
      lien: `/factures/${avis.id}`,
    }).catch((err) => logger.warn('[facture] Avis e-mail impossible', { error: err.message }));
  }
  return detail(id, companyId);
}

/**
 * Annulation d'une facture émise par erreur : seulement sans paiement imputé
 * (sinon : annuler d'abord les paiements). La commande revient à
 * « réception confirmée » : une facture corrigée peut être émise.
 */
async function annuler(id, companyId, user, { reason }) {
  await sequelize.transaction(async (t) => {
    const { ressource: facture } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'fournisseur');
    if (facture.status === 'annulee') throw new ConflictError('Cette facture est déjà annulée.', 'STATUT_INCHANGE');
    const imputations = await PaymentAllocation.count({ where: { invoice_id: id, cancelled_at: null }, transaction: t });
    if (imputations || Number(facture.amount_paid) > 0) {
      throw new ConflictError('Des paiements ou des avoirs sont imputés sur cette facture : annulez-les avant d’annuler la facture.', 'FACTURE_PAYEE');
    }
    await facture.update({ status: 'annulee', cancelled_at: new Date(), cancellation_reason: reason }, { transaction: t });
    const commande = await Order.findByPk(facture.order_id, { transaction: t, lock: t.LOCK.UPDATE });
    C.verifierStatut(commande, 'reception_confirmee');
    await commande.update({ status: 'reception_confirmee', invoiced_at: null }, { transaction: t });
    await C.historiser(t, commande, {
      type: 'annulation_facture', de: 'facturee', vers: 'reception_confirmee', acteur: user, companyId, cote: 'fournisseur', message: reason,
      details: { invoice_id: facture.id, number: facture.number },
    });
    await C.apresChangement(t, commande);
    await journaliser({ action: 'facture.annulation', entityType: 'invoice', entityId: id, companyId, details: { number: facture.number, motif: reason } }, t);
    const fournisseur = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await notifierEntreprise(t, facture.buyer_company_id, P.FACTURES_LIRE, {
      type: 'facture_annulee',
      titre: `Facture ${facture.number} annulée`,
      corps: `${fournisseur.name} a annulé la facture ${facture.number} : ${reason}`,
      donnees: { invoice_id: facture.id, order_id: facture.order_id },
    });
    await synchroniser(t, [companyId, facture.buyer_company_id], 'facture', { invoice_id: facture.id, status: 'annulee' });
  });
  return detail(id, companyId);
}

/**
 * Statut d'une facture après un changement d'imputation (module paiement),
 * dans la transaction du paiement. La commande suit : facture soldée →
 * commande TERMINÉE (§ 12, dernier statut) ; de nouveau due → « facturée ».
 */
async function recalculerStatut(facture, t, acteur = null) {
  // Réglé = paiements imputés + avoirs imputés (amount_credited : part des avoirs).
  const [[{ paye, credite }]] = await sequelize.query(
    `SELECT
       (SELECT coalesce(sum(amount), 0) FROM payment_allocations WHERE invoice_id = :id AND cancelled_at IS NULL)::bigint AS paye,
       (SELECT coalesce(sum(amount), 0) FROM credit_note_allocations WHERE invoice_id = :id AND cancelled_at IS NULL)::bigint AS credite`,
    { replacements: { id: facture.id }, transaction: t }
  );
  const montantPaye = Number(paye) + Number(credite);
  let statut;
  if (montantPaye >= Number(facture.total)) statut = 'payee';
  else if (facture.due_date < aujourdhui()) statut = 'en_retard';
  else statut = montantPaye > 0 ? 'partiellement_payee' : 'emise';
  await facture.update({ amount_paid: montantPaye, amount_credited: Number(credite), status: statut }, { transaction: t });

  const commande = await Order.findByPk(facture.order_id, { transaction: t, lock: t.LOCK.UPDATE });
  const vers = statut === 'payee' ? 'terminee' : 'facturee';
  if (commande && commande.status !== vers && ['facturee', 'terminee'].includes(commande.status)) {
    C.verifierStatut(commande, vers);
    const avant = commande.status;
    await commande.update({ status: vers, completed_at: vers === 'terminee' ? new Date() : null }, { transaction: t });
    await C.historiser(t, commande, {
      type: vers === 'terminee' ? 'cloture' : 'paiement', de: avant, vers, acteur, companyId: null,
      details: { invoice_id: facture.id, amount_paid: montantPaye },
    });
    await C.apresChangement(t, commande);
  }
  t.afterCommit(() => Promise.all([facture.supplier_company_id, facture.buyer_company_id].map((c) => cache.invalider(`dashboard:*:${c}`))).catch(() => {}));
  return statut;
}

/**
 * Avoirs puis acomptes disponibles d'un partenariat, imputés sur ses factures
 * ouvertes et non bloquées. Chargés à l'appel : ces modules dépendent
 * eux-mêmes de celui-ci.
 */
async function imputerToutCredit(partnershipId, t, acteur) {
  await require('../../avoir/service/avoir.service.js').imputerAvoirs(partnershipId, t, acteur);
  await require('../../paiement/service/paiement.service.js').imputerCredits(partnershipId, t, acteur);
}

/**
 * Décision de l'acheteur sur une facture en écart :
 *   - ACCEPTER l'écart : la facture devient payable (crédits disponibles imputés) ;
 *   - CONTESTER : la facture reste bloquée ; le fournisseur l'annule et en émet une conforme.
 */
async function deciderEcart(id, companyId, user, { decision, comment = null }) {
  await sequelize.transaction(async (t) => {
    const { ressource: facture } = await charger(id, companyId, { transaction: t, lock: t.LOCK.UPDATE }, 'acheteur');
    if (facture.status === 'annulee' || !R.estBloquee(facture)) {
      throw new ConflictError("Cette facture n'est pas en écart de rapprochement.", 'AUCUN_ECART');
    }
    if (decision === 'conteste' && facture.match_status === 'conteste') {
      throw new ConflictError('Cette facture est déjà contestée.', 'STATUT_INCHANGE');
    }
    const statut = decision === 'accepte' ? 'accepte' : 'conteste';
    await facture.update({
      match_status: statut, match_decided_at: new Date(), match_decided_by: user.id, match_comment: comment,
    }, { transaction: t });
    if (statut === 'accepte') await imputerToutCredit(facture.partnership_id, t, user);
    await journaliser({ action: `facture.ecart_${statut}`, entityType: 'invoice', entityId: id, companyId, details: { number: facture.number, commentaire: comment } }, t);
    const client = await Company.findByPk(companyId, { attributes: ['name'], transaction: t });
    await notifierEntreprise(t, facture.supplier_company_id, P.FACTURES_EMETTRE, {
      type: 'facture_ecart',
      titre: `${statut === 'accepte' ? 'Écart accepté' : 'Facture contestée'} — ${facture.number}`,
      corps: statut === 'accepte'
        ? `${client.name} a accepté l'écart de la facture ${facture.number} : elle est payable.`
        : `${client.name} conteste la facture ${facture.number}${comment ? ` : ${comment}` : ''}. Annulez-la et émettez une facture conforme.`,
      donnees: { invoice_id: id, order_id: facture.order_id },
    });
    await synchroniser(t, [facture.supplier_company_id, facture.buyer_company_id], 'facture', { invoice_id: id, status: facture.status, match_status: statut });
  });
  return detail(id, companyId);
}

module.exports = {
  lister, detail, charger, emettre, annuler, recalculerStatut, versApi, lignesFacture, deciderEcart, imputerToutCredit,
};
