'use strict';

/**
 * Calculs monétaires en FCFA ENTIERS.
 *
 * Le franc CFA n'a pas de subdivision en usage : tout montant est un entier.
 * Aucun calcul financier ne passe par des flottants sans arrondi explicite :
 * les quantités (jusqu'à 3 décimales : 2,5 kg) et les taux de TVA (2
 * décimales) sont convertis en entiers, et les produits se font en BigInt —
 * un prix de 10^12 FCFA multiplié par une quantité dépasserait 2^53.
 */

/** Arrondi « au plus proche, moitié vers le haut » d'une division entière positive. */
function diviserArrondi(numerateur, denominateur) {
  const q = numerateur / denominateur;
  const r = numerateur % denominateur;
  return r * 2n >= denominateur ? q + 1n : q;
}

/**
 * Montants d'une ligne de commande ou de facture.
 * @param {{ quantite: number, prixUnitaire: number, tauxTva?: number }} l
 * @returns {{ sousTotal: number, tva: number, total: number }}
 */
function montantLigne({ quantite, prixUnitaire, tauxTva = 0 }) {
  if (!Number.isFinite(quantite) || quantite < 0) throw new RangeError('Quantité invalide.');
  if (!Number.isInteger(prixUnitaire) || prixUnitaire < 0) throw new RangeError('Prix unitaire invalide.');
  if (!Number.isFinite(tauxTva) || tauxTva < 0 || tauxTva > 100) throw new RangeError('Taux de TVA invalide.');
  const milli = BigInt(Math.round(quantite * 1000));
  const sousTotal = diviserArrondi(milli * BigInt(prixUnitaire), 1000n);
  const pointsDeBase = BigInt(Math.round(tauxTva * 100));
  const tva = diviserArrondi(sousTotal * pointsDeBase, 10000n);
  return { sousTotal: Number(sousTotal), tva: Number(tva), total: Number(sousTotal + tva) };
}

/**
 * Totaux d'un ensemble de lignes déjà calculées.
 * @param {Array<{ line_subtotal: number, line_tax: number }>} lignes
 */
function totaliser(lignes) {
  const sousTotal = lignes.reduce((s, l) => s + Number(l.line_subtotal), 0);
  const tva = lignes.reduce((s, l) => s + Number(l.line_tax), 0);
  return { subtotal: sousTotal, tax_total: tva, total: sousTotal + tva };
}

/**
 * Répartit `total` proportionnellement aux `poids`, en entiers, de sorte que la
 * somme des parts soit EXACTEMENT `total` (méthode du plus fort reste).
 *
 * @param {number} total   montant entier ≥ 0
 * @param {number[]} poids poids ≥ 0, au moins un strictement positif
 * @returns {number[]} parts entières, même ordre que `poids`
 */
function repartirProportionnellement(total, poids) {
  if (!Number.isInteger(total) || total < 0) throw new RangeError('Le total doit être un entier positif.');
  if (!Array.isArray(poids) || poids.length === 0) throw new RangeError('Aucun poids de répartition.');
  if (poids.some((p) => !Number.isFinite(p) || p < 0)) throw new RangeError('Poids de répartition invalide.');
  const somme = poids.reduce((a, b) => a + b, 0);
  if (somme <= 0) throw new RangeError('La somme des poids doit être strictement positive.');

  const brutes = poids.map((p) => (total * p) / somme);
  const parts = brutes.map((b) => Math.floor(b));
  let reste = total - parts.reduce((a, b) => a + b, 0);

  const ordre = brutes
    .map((b, i) => ({ i, fraction: b - Math.floor(b) }))
    .sort((a, b) => (b.fraction - a.fraction) || (a.i - b.i));

  for (let k = 0; reste > 0; k = (k + 1) % ordre.length) {
    parts[ordre[k].i] += 1;
    reste -= 1;
  }
  return parts;
}

/** Arrondi à l'entier le plus proche, en refusant les valeurs non finies. */
function entier(valeur) {
  const n = Number(valeur);
  if (!Number.isFinite(n)) throw new RangeError('Montant invalide.');
  return Math.round(n);
}

/** « 350 000 FCFA » — espace comme séparateur de milliers. */
function formatFcfa(montant) {
  const n = Math.round(Number(montant) || 0);
  const signe = n < 0 ? '-' : '';
  const chiffres = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${signe}${chiffres} FCFA`;
}

/** « 2,5 » — quantité lisible (décimales utiles seulement, virgule française). */
function formatQuantite(q) {
  const n = Number(q) || 0;
  return (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)))).replace('.', ',');
}

// ── Montant en lettres (mention d'usage sur les factures au Sénégal) ────────

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** 0 à 99, orthographe traditionnelle (« vingt et un », « soixante et onze »). */
function moinsDeCent(n) {
  if (n < 20) return UNITES[n];
  if (n < 70) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return DIZAINES[d];
    return u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]}-${UNITES[u]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${UNITES[n - 60]}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${UNITES[n - 80]}`;
}

/**
 * 1 à 999. « cents » et « quatre-vingts » ne prennent un s qu'en fin de
 * nombre : « deux cents », mais « deux cent mille ».
 */
function moinsDeMille(n, finDeNombre = true) {
  const c = Math.floor(n / 100);
  const reste = n % 100;
  let texte = '';
  if (c > 0) {
    texte = c === 1 ? 'cent' : `${UNITES[c]} cent`;
    if (c > 1 && reste === 0 && finDeNombre) texte += 's';
  }
  if (reste > 0) {
    const fin = reste === 80 && !finDeNombre ? 'quatre-vingt' : moinsDeCent(reste);
    texte = texte ? `${texte} ${fin}` : fin;
  }
  return texte;
}

/**
 * Montant entier en toutes lettres : 1 250 000 → « un million deux cent
 * cinquante mille ».
 * @param {number} montant entier ≥ 0, < 10^15
 */
function enLettres(montant) {
  let n = Math.round(Number(montant));
  if (!Number.isFinite(n) || n < 0 || n >= 1e15) throw new RangeError('Montant hors limites.');
  if (n === 0) return 'zéro';
  const groupes = [
    [1e12, 'billion', 'billions'],
    [1e9, 'milliard', 'milliards'],
    [1e6, 'million', 'millions'],
  ];
  const morceaux = [];
  for (const [valeur, singulier, pluriel] of groupes) {
    const q = Math.floor(n / valeur);
    if (q > 0) {
      morceaux.push(`${moinsDeMille(q, true)} ${q > 1 ? pluriel : singulier}`);
      n -= q * valeur;
    }
  }
  const milliers = Math.floor(n / 1000);
  if (milliers > 0) {
    morceaux.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`);
    n -= milliers * 1000;
  }
  if (n > 0) morceaux.push(moinsDeMille(n, true));
  return morceaux.join(' ');
}

module.exports = {
  montantLigne, totaliser, repartirProportionnellement, entier, formatFcfa, formatQuantite, enLettres,
};
