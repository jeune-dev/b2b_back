'use strict';

const { ValidationError } = require('../errors/AppError.js');

/**
 * Lecture des fichiers CSV importés (bon de commande, catalogue), tels que
 * les produisent Excel, LibreOffice ou Google Sheets en français :
 *   - encodage UTF-8 (avec ou sans BOM) ou Windows-1252 (Excel « CSV ») ;
 *   - séparateur `;`, `,` ou tabulation, détecté sur la première ligne ;
 *   - champs entre guillemets (RFC 4180), guillemets doublés, retours à la
 *     ligne dans un champ ;
 *   - lignes vides ignorées, cellules débarrassées de leurs espaces.
 */

const MAX_LIGNES_DEFAUT = 5000;

function decoder(buffer) {
  const utf8 = buffer.toString('utf8');
  // Octets invalides en UTF-8 : fichier Windows-1252 (latin1 en est un sur-ensemble pour les lettres françaises).
  const texte = utf8.includes('�') ? buffer.toString('latin1') : utf8;
  return texte.replace(/^﻿/, '');
}

function separateurDe(premiereLigne) {
  const compte = (c) => premiereLigne.split(c).length - 1;
  const candidats = [[';', compte(';')], ['\t', compte('\t')], [',', compte(',')]];
  candidats.sort((a, b) => b[1] - a[1]);
  return candidats[0][1] > 0 ? candidats[0][0] : ';';
}

/**
 * @param {Buffer} buffer
 * @param {{ maxLignes?: number }} [o]
 * @returns {string[][]} lignes non vides, cellules nettoyées
 */
function lireCsv(buffer, { maxLignes = MAX_LIGNES_DEFAUT } = {}) {
  const texte = decoder(buffer);
  const separateur = separateurDe(texte.split(/\r?\n/, 1)[0] || '');
  const lignes = [];
  let ligne = [];
  let cellule = '';
  let entreGuillemets = false;
  const finCellule = () => { ligne.push(cellule.trim()); cellule = ''; };
  const finLigne = () => {
    finCellule();
    if (ligne.some((c) => c !== '')) lignes.push(ligne);
    ligne = [];
    if (lignes.length > maxLignes) {
      throw new ValidationError('Données invalides', [`Fichier trop long : ${maxLignes} lignes au maximum`], 'FICHIER_TROP_LONG');
    }
  };
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { cellule += '"'; i += 1; } else if (c === '"') entreGuillemets = false;
      else cellule += c;
    } else if (c === '"' && cellule.trim() === '') {
      entreGuillemets = true;
      cellule = '';
    } else if (c === separateur) finCellule();
    else if (c === '\n') finLigne();
    else if (c !== '\r') cellule += c;
  }
  if (entreGuillemets) throw new ValidationError('Données invalides', ['Fichier CSV mal formé : guillemet non fermé'], 'CSV_INVALIDE');
  if (cellule !== '' || ligne.length) finLigne();
  return lignes;
}

/** Nombre écrit à la française (« 2,5 », « 1 250 ») ou à l'anglaise (« 2.5 »). */
function nombre(texte) {
  if (texte === undefined || texte === null || String(texte).trim() === '') return null;
  const brut = String(texte).replace(/[\s  ]/g, '').replace(/FCFA|F$/i, '');
  const normalise = /,\d{1,3}$/.test(brut) && !brut.includes('.') ? brut.replace(',', '.') : brut.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(normalise)) return NaN;
  return Number(normalise);
}

/** Clé d'en-tête comparable : minuscules, sans accents ni espaces superflus. */
const cle = (texte) => String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Associe les colonnes d'un en-tête aux champs attendus (synonymes acceptés).
 * @param {string[]} entete
 * @param {Record<string, string[]>} champs  champ → synonymes (clés normalisées)
 * @returns {Record<string, number>} champ → index de colonne
 */
function colonnes(entete, champs) {
  const index = {};
  entete.forEach((titre, i) => {
    const k = cle(titre);
    for (const [champ, synonymes] of Object.entries(champs)) {
      if (index[champ] === undefined && synonymes.includes(k)) index[champ] = i;
    }
  });
  return index;
}

module.exports = {
  lireCsv, nombre, cle, colonnes, MAX_LIGNES_DEFAUT,
};
