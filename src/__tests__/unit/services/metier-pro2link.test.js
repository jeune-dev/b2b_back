'use strict';

const { montantLigne, totaliser, enLettres, formatFcfa, formatQuantite } = require('../../../utils/montants.js');
const { COMMANDE, STATUTS_EN_COURS, STATUTS_CLOS, verifierTransition } = require('../../../config/transitions.js');
const { PERMISSIONS_PAR_ROLE, P } = require('../../../config/permissions.js');
const { ROLES_ENTREPRISE, STATUT_COMMANDE, codes } = require('../../../config/enums.js');
const { lignesFacture } = require('../../../modules/facture/service/facture.service.js');

/**
 * Règles métier pures de Pro2Link : calcul des lignes (FCFA entiers, TVA),
 * montant en lettres des factures, cycle de vie des commandes, matrice des
 * rôles internes, lignes de facture tirées des quantités réceptionnées.
 */

afterAll(() => require('../../../config/db.js').close());

describe('montants d’une ligne', () => {
  test.each([
    [{ quantite: 10, prixUnitaire: 15000, tauxTva: 18 }, { sousTotal: 150000, tva: 27000, total: 177000 }],
    [{ quantite: 2.5, prixUnitaire: 2500, tauxTva: 0 }, { sousTotal: 6250, tva: 0, total: 6250 }],
    // Arrondi au FCFA le plus proche, moitié vers le haut : 0,333 × 1 000 = 333 ; TVA 18 % = 59,94 → 60.
    [{ quantite: 0.333, prixUnitaire: 1000, tauxTva: 18 }, { sousTotal: 333, tva: 60, total: 393 }],
    [{ quantite: 1, prixUnitaire: 5, tauxTva: 10 }, { sousTotal: 5, tva: 1, total: 6 }],
    [{ quantite: 0, prixUnitaire: 9999, tauxTva: 18 }, { sousTotal: 0, tva: 0, total: 0 }],
    // Grandes valeurs : aucun flottant (BigInt).
    [{ quantite: 1000000, prixUnitaire: 999999999, tauxTva: 18 }, { sousTotal: 999999999000000, tva: 179999999820000, total: 1179999998820000 }],
  ])('%o → %o', (entree, attendu) => {
    expect(montantLigne(entree)).toEqual(attendu);
  });

  test('entrées invalides refusées', () => {
    expect(() => montantLigne({ quantite: -1, prixUnitaire: 10 })).toThrow(RangeError);
    expect(() => montantLigne({ quantite: 1, prixUnitaire: 10.5 })).toThrow(RangeError);
    expect(() => montantLigne({ quantite: 1, prixUnitaire: 10, tauxTva: 101 })).toThrow(RangeError);
  });

  test('totaux d’un ensemble de lignes', () => {
    expect(totaliser([{ line_subtotal: 100, line_tax: 18 }, { line_subtotal: 50, line_tax: 0 }])).toEqual({ subtotal: 150, tax_total: 18, total: 168 });
  });

  test('formats d’affichage', () => {
    expect(formatFcfa(1250000)).toBe('1 250 000 FCFA');
    expect(formatQuantite(2.5)).toBe('2,5');
    expect(formatQuantite(3)).toBe('3');
  });
});

describe('montant en lettres (factures)', () => {
  test.each([
    [0, 'zéro'], [1, 'un'], [16, 'seize'], [21, 'vingt et un'], [71, 'soixante et onze'], [80, 'quatre-vingts'],
    [81, 'quatre-vingt-un'], [99, 'quatre-vingt-dix-neuf'], [100, 'cent'], [200, 'deux cents'], [201, 'deux cent un'],
    [1000, 'mille'], [2000, 'deux mille'], [80000, 'quatre-vingt mille'], [200000, 'deux cent mille'],
    [1000000, 'un million'], [2500000, 'deux millions cinq cent mille'],
    [1250000, 'un million deux cent cinquante mille'], [177000, 'cent soixante-dix-sept mille'],
    [1000000000, 'un milliard'], [3001042, 'trois millions mille quarante-deux'],
  ])('%i → « %s »', (n, texte) => {
    expect(enLettres(n)).toBe(texte);
  });
  test('hors limites', () => {
    expect(() => enLettres(-1)).toThrow(RangeError);
    expect(() => enLettres(1e15)).toThrow(RangeError);
  });
});

describe('cycle de vie de la commande (§ 12)', () => {
  test('chaque statut a sa table ; en cours et clos se partagent les statuts sans recouvrement', () => {
    expect(Object.keys(COMMANDE).sort()).toEqual(codes(STATUT_COMMANDE).sort());
    expect(STATUTS_EN_COURS.filter((s) => STATUTS_CLOS.includes(s))).toEqual([]);
    for (const cibles of Object.values(COMMANDE)) for (const c of cibles) expect(codes(STATUT_COMMANDE)).toContain(c);
  });
  test.each([
    ['brouillon', 'envoyee', true], ['envoyee', 'validee', true], ['envoyee', 'proposition_modifiee', true],
    ['proposition_modifiee', 'validee', true], ['proposition_modifiee', 'en_attente_validation', true],
    ['validee', 'livree', true], ['livree', 'reception_confirmee', true], ['reception_confirmee', 'facturee', true],
    ['facturee', 'terminee', true], ['terminee', 'facturee', true],
    ['brouillon', 'validee', false], ['validee', 'reception_confirmee', false], ['livree', 'annulee', false],
    ['refusee', 'validee', false], ['annulee', 'envoyee', false], ['en_preparation', 'annulee', false],
  ])('%s → %s : %s', (de, vers, permise) => {
    const appel = () => verifierTransition(COMMANDE, de, vers, 'la commande');
    if (permise) expect(appel).not.toThrow();
    else expect(appel).toThrow(expect.objectContaining({ statusCode: 409, code: 'TRANSITION_INVALIDE' }));
  });
  test('même statut : refus explicite', () => {
    expect(() => verifierTransition(COMMANDE, 'validee', 'validee', 'la commande')).toThrow(/déjà au statut/);
  });
});

describe('rôles internes (§ 5.3)', () => {
  test('chaque rôle interne a ses permissions ; l’administrateur a tout l’espace entreprise', () => {
    for (const role of codes(ROLES_ENTREPRISE)) expect(PERMISSIONS_PAR_ROLE[role].length).toBeGreaterThan(0);
    expect(PERMISSIONS_PAR_ROLE.administrateur).toEqual(expect.arrayContaining([P.UTILISATEURS_GERER, P.ACHATS_GERER, P.VENTES_TRAITER, P.FACTURES_EMETTRE]));
    expect(PERMISSIONS_PAR_ROLE.administrateur.some((p) => p.startsWith('admin.'))).toBe(false);
  });
  test('moindre privilège : le réceptionnaire confirme les réceptions mais ne commande, ne vend ni ne facture', () => {
    const r = PERMISSIONS_PAR_ROLE.receptionnaire;
    expect(r).toContain(P.RECEPTION_CONFIRMER);
    for (const p of [P.ACHATS_GERER, P.VENTES_TRAITER, P.FACTURES_EMETTRE, P.PAIEMENTS_ENREGISTRER, P.UTILISATEURS_GERER]) expect(r).not.toContain(p);
    expect(PERMISSIONS_PAR_ROLE.comptable).toEqual(expect.arrayContaining([P.FACTURES_EMETTRE, P.PAIEMENTS_ENREGISTRER]));
    expect(PERMISSIONS_PAR_ROLE.commercial).not.toContain(P.FACTURES_EMETTRE);
    expect(PERMISSIONS_PAR_ROLE.utilisateur).toEqual([]);
  });
});

describe('lignes de facture (§ 14)', () => {
  test('quantités réceptionnées ; lignes sans quantité reçue écartées ; numérotation continue', () => {
    const lignes = lignesFacture([
      { line_no: 1, product_id: 'a', reference: 'A', name: 'A', unit: 'sac', quantity: 10, received_quantity: 8, unit_price: 15000, tax_rate: 18 },
      { line_no: 2, product_id: 'b', reference: 'B', name: 'B', unit: 'kg', quantity: 4, received_quantity: 0, unit_price: 2500, tax_rate: 0 },
      { line_no: 3, product_id: 'c', reference: 'C', name: 'C', unit: 'kg', quantity: 0, received_quantity: null, unit_price: 100, tax_rate: 0 },
      { line_no: 4, product_id: 'd', reference: 'D', name: 'D', unit: 'lot', quantity: 2, received_quantity: null, unit_price: 1000, tax_rate: 18 },
    ]);
    expect(lignes.map((l) => [l.line_no, l.reference, l.quantity, l.line_total])).toEqual([[1, 'A', 8, 141600], [2, 'D', 2, 2360]]);
  });
});
