'use strict';

const { lireCsv, nombre, colonnes, cle } = require('../../../utils/csvLecture.js');
const T = require('../../../modules/catalogue/service/tarification.service.js');
const R = require('../../../modules/facture/service/rapprochement.service.js');
const { approbationsRequises, comptesComptables, COMPTES_SYSCOHADA } = require('../../../config/parametres.js');
const { codeTiers } = require('../../../modules/statistiques/service/comptabilite.service.js');
const { arrondir } = require('../../../modules/listeAchat/service/listeAchat.service.js');
const { disponibiliteDeduite, disponible } = require('../../../modules/catalogue/service/stock.service.js');
const { erreursQuantite } = require('../../../modules/commande/service/lignes.service.js');

/** Règles pures des fonctionnalités d'achat et de vente avancées. */

describe('lecture CSV', () => {
  test('séparateur détecté, guillemets, BOM, lignes vides, retours à la ligne dans un champ', () => {
    expect(lireCsv(Buffer.from('﻿a;b\n"x;y";"dit ""oui"""\n\n'))).toEqual([['a', 'b'], ['x;y', 'dit "oui"']]);
    expect(lireCsv(Buffer.from('a,b,c\r\n1,2,3'))).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(lireCsv(Buffer.from('a\tb\n"l1\nl2"\t3'))).toEqual([['a', 'b'], ['l1\nl2', '3']]);
    expect(lireCsv(Buffer.from('Référence;Qté', 'latin1'))).toEqual([['Référence', 'Qté']]);
  });

  test('guillemet non fermé et fichier trop long refusés', () => {
    expect(() => lireCsv(Buffer.from('"abc;1'))).toThrow(expect.objectContaining({ code: 'CSV_INVALIDE' }));
    expect(() => lireCsv(Buffer.from('a\nb\nc\n'), { maxLignes: 2 })).toThrow(expect.objectContaining({ code: 'FICHIER_TROP_LONG' }));
  });

  test('nombres à la française et à l’anglaise', () => {
    expect([nombre('2,5'), nombre('2.5'), nombre('1 250'), nombre('15000 FCFA'), nombre(''), nombre(null)]).toEqual([2.5, 2.5, 1250, 15000, null, null]);
    expect(Number.isNaN(nombre('douze'))).toBe(true);
  });

  test('en-têtes reconnus par synonymes, sans accents ni casse', () => {
    expect(cle(' Prix HT ')).toBe('prix_ht');
    expect(colonnes(['Réf', 'QUANTITÉ', 'Autre'], { reference: ['ref'], quantity: ['quantite'] })).toEqual({ reference: 0, quantity: 1 });
  });
});

describe('tarification', () => {
  const produit = { id: 'p', price: 15000 };
  const ctx = (o = {}) => ({ liste: null, prixListe: new Map(), paliers: new Map(), ...o });

  test('remise arrondie au franc', () => {
    expect(T.appliquerRemise(15000, 5)).toBe(14250);
    expect(T.appliquerRemise(999, 33.33)).toBe(666);
    expect(T.appliquerRemise(1000, 0)).toBe(1000);
  });

  test('prix catalogue, remise de liste, prix propre, palier le plus fort atteint', () => {
    expect(T.prixPour(produit, ctx(), 1)).toEqual({ base_unit_price: 15000, discount_percent: 0, unit_price: 15000 });
    expect(T.prixPour(produit, ctx({ liste: { discount_percent: 10 } }), 1).unit_price).toBe(13500);
    expect(T.prixPour(produit, ctx({ liste: { discount_percent: 10 }, prixListe: new Map([['p', 14000]]) }), 1).unit_price).toBe(14000);
    const paliers = new Map([['p', [{ min: 50, remise: 10 }, { min: 10, remise: 5 }]]]);
    expect(T.prixPour(produit, ctx({ paliers }), 9).discount_percent).toBe(0);
    expect(T.prixPour(produit, ctx({ paliers }), 10)).toEqual({ base_unit_price: 15000, discount_percent: 5, unit_price: 14250 });
    expect(T.prixPour(produit, ctx({ paliers }), 50).unit_price).toBe(13500);
  });
});

describe('règles de quantité', () => {
  const p = { name: 'Eau', min_order_quantity: 6, order_multiple: 6, max_order_quantity: 60 };
  test('minimum, multiple (en millièmes : 0,5 × 3 = 1,5), maximum', () => {
    expect(erreursQuantite(p, 12, 'L1')).toEqual([]);
    expect(erreursQuantite(p, 3, 'L1')).toHaveLength(2);
    expect(erreursQuantite(p, 66, 'L1')).toEqual(['L1 : quantité maximale par commande pour « Eau » : 60']);
    expect(erreursQuantite({ name: 'Vrac', min_order_quantity: 0.5, order_multiple: 0.5 }, 1.5, 'L1')).toEqual([]);
  });

  test('arrondi au-dessus au minimum puis au multiple (listes d’achat)', () => {
    expect(arrondir({ min_order_quantity: 6, order_multiple: 6 }, 13)).toBe(18);
    expect(arrondir({ min_order_quantity: 10, order_multiple: null }, 3)).toBe(10);
    expect(arrondir({ min_order_quantity: 1, order_multiple: 0.25 }, 1.1)).toBe(1.25);
  });
});

describe('stock', () => {
  const base = { stock_quantity: 10, stock_reserved: 0, low_stock_threshold: 3, availability: 'disponible' };
  test('disponibilité déduite : rupture, stock limité, retour à disponible ; « sur commande » respecté', () => {
    expect(disponible({ stock_quantity: '10.000', stock_reserved: '2.500' })).toBe(7.5);
    expect(disponibiliteDeduite({ ...base, stock_reserved: 10 })).toBe('rupture');
    expect(disponibiliteDeduite({ ...base, stock_reserved: 8 })).toBe('stock_limite');
    expect(disponibiliteDeduite({ ...base, availability: 'rupture' })).toBe('disponible');
    expect(disponibiliteDeduite({ ...base, stock_reserved: 10, availability: 'sur_commande' })).toBe('sur_commande');
    expect(disponibiliteDeduite({ ...base, stock_quantity: null, availability: 'rupture' })).toBe('rupture');
  });
});

describe('rapprochement à trois voies', () => {
  const commande = [
    { line_no: 1, product_id: 'a', name: 'A', unit: 'sac', quantity: 10, received_quantity: 8, unit_price: 1000, tax_rate: 18 },
    { line_no: 2, product_id: 'b', name: 'B', unit: 'kg', quantity: 5, received_quantity: 0, unit_price: 500, tax_rate: 0 },
  ];
  const attendues = R.lignesAttendues(commande);

  test('lignes attendues : quantités reçues, lignes non reçues écartées', () => {
    expect(attendues.map((l) => [l.order_line_no, l.quantity, l.line_total])).toEqual([[1, 8, 9440]]);
  });

  test('conforme dans la tolérance ou en faveur du client ; écart au-delà', () => {
    const tolerance = 2;
    const facturees = (saisies) => R.lignesFacturees(attendues, commande, saisies);
    expect(R.rapprocher(attendues, facturees([]), tolerance).statut).toBe('conforme');
    expect(R.rapprocher(attendues, facturees([{ line_no: 1, unit_price: 1020 }]), tolerance).statut).toBe('conforme');
    expect(R.rapprocher(attendues, facturees([{ line_no: 1, quantity: 5, unit_price: 900 }]), tolerance).statut).toBe('conforme');
    const prix = R.rapprocher(attendues, facturees([{ line_no: 1, unit_price: 1100 }]), tolerance);
    expect(prix.details.ecarts).toEqual([{ line_no: 1, name: 'A', type: 'prix', attendu: 1000, facture: 1100 }]);
    const nonRecue = R.rapprocher(attendues, facturees([{ line_no: 2, quantity: 1 }]), tolerance);
    expect(nonRecue.details.ecarts).toEqual([{ line_no: 2, name: 'B', type: 'non_receptionne', attendu: 0, facture: 1 }]);
    expect(R.rapprocher(attendues, facturees([]), tolerance, 20000).details.ecarts[0].type).toBe('total_document');
    expect(() => facturees([{ line_no: 9, quantity: 1 }])).toThrow(expect.objectContaining({ code: 'LIGNES_INVALIDES' }));
  });

  test('facture bloquée : écart ou contestation', () => {
    expect(['conforme', 'ecart', 'accepte', 'conteste'].map((m) => R.estBloquee({ match_status: m }))).toEqual([false, true, false, true]);
  });
});

describe('paramètres d’achat et de comptabilité', () => {
  test('approbations requises : palier le plus élevé atteint', () => {
    const r = { order_approval_levels: [{ min_total: 100000, approvals: 1 }, { min_total: 500000, approvals: 2 }] };
    expect([approbationsRequises(r, 99999), approbationsRequises(r, 100000), approbationsRequises(r, 750000), approbationsRequises({}, 1e9)]).toEqual([0, 1, 2, 0]);
  });

  test('comptes SYSCOHADA surchargeables ; code tiers dérivé du nom', () => {
    expect(comptesComptables({ accounting_accounts: { clients: '4111' } })).toEqual({ ...COMPTES_SYSCOHADA, clients: '4111' });
    expect(codeTiers('C', 'Épicerie Ndèye & Fils')).toBe('CEPICERIEND');
    expect(codeTiers('F', '', null)).toBe('FDIVERS');
    expect(codeTiers('C', 'X', 'CLI042')).toBe('CLI042');
  });
});
