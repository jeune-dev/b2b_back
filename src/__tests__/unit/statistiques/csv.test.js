'use strict';

const { versCsv, cellule, BOM } = require('../../../modules/statistiques/service/csv.js');

/**
 * Export CSV (§ 21) — fonctions pures : BOM UTF-8, séparateur
 * « ; », fins de ligne CRLF, échappement RFC 4180 et neutralisation de
 * l'injection de formules (OWASP « CSV injection »).
 */

describe('cellule', () => {
  test('valeurs vides et nombres', () => {
    expect(cellule(null)).toBe('');
    expect(cellule(undefined)).toBe('');
    expect(cellule(0)).toBe('0');
    expect(cellule(350000)).toBe('350000');
    // Un montant NÉGATIF reste un nombre : jamais préfixé.
    expect(cellule(-30000)).toBe('-30000');
    expect(cellule(12.5)).toBe('12.5');
    expect(cellule(true)).toBe('true');
  });

  test.each([
    ['=1+1', "'=1+1"],
    ['+221771234567', "'+221771234567"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\t=cmd', "'\t=cmd"],
    ['=HYPERLINK("http://x";"y")', "\"'=HYPERLINK(\"\"http://x\"\";\"\"y\"\")\""],
  ])('formule neutralisée : %j → %j', (entree, sortie) => {
    expect(cellule(entree)).toBe(sortie);
  });

  test('retour chariot en tête : neutralisé ET mis entre guillemets', () => {
    expect(cellule('\r=1')).toBe("\"'\r=1\"");
  });

  test('texte ordinaire intact ; accents conservés', () => {
    expect(cellule('Résidence Almadies')).toBe('Résidence Almadies');
    expect(cellule('a=b')).toBe('a=b');
    expect(cellule('Café 2+2')).toBe('Café 2+2');
  });

  test('séparateur, guillemets, sauts de ligne, espaces de bord → entre guillemets, guillemets doublés', () => {
    expect(cellule('a;b')).toBe('"a;b"');
    expect(cellule('dit "bonjour"')).toBe('"dit ""bonjour"""');
    expect(cellule('ligne1\nligne2')).toBe('"ligne1\nligne2"');
    expect(cellule(' espace')).toBe('" espace"');
    expect(cellule('fin ')).toBe('"fin "');
  });
});

describe('versCsv', () => {
  test('BOM, sections (titre, en-têtes, lignes, ligne vide), CRLF', () => {
    const csv = versCsv([
      { titre: 'Synthèse', entetes: ['Rubrique', 'Montant'], lignes: [['Ventes', 1000], ['Dépenses', -200]] },
      { titre: 'Vide', entetes: ['A'], lignes: [] },
    ]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(BOM).toBe('﻿');
    expect(csv.slice(1)).toBe('Synthèse\r\nRubrique;Montant\r\nVentes;1000\r\nDépenses;-200\r\n\r\nVide\r\nA\r\n');
    expect(csv).not.toMatch(/[^\r]\n/);
  });

  test('aucune section : BOM seul', () => {
    expect(versCsv([])).toBe(BOM);
  });
});
