'use strict';

const {
  api, relationCommerciale, commandeReceptionnee, factureEmise, nouvelleEntreprise, collaborateur, pdfTest, compter, fermer, sequelize,
} = require('../../../setup/helpers.js');
const { relancesAutomatiques } = require('../../../../modules/facture/service/relance.service.js');
const { aujourdhui, ajouterJours } = require('../../../../utils/dates.js');

/**
 * Rapprochement commande / réception / facture (paiement bloqué en cas
 * d'écart), relances graduées des impayés, export comptable SYSCOHADA,
 * import / export du catalogue en CSV.
 *
 * Commande type réceptionnée : 10 sacs à 15 000 HT (TVA 18 %) + 4 kg à 2 500 = 187 000 TTC.
 */

afterAll(fermer);

const emettre = (rc, commande, corps = {}) => api().post('/api/v1/factures').set(rc.fournisseur.h).send({ order_id: commande.id, ...corps });
const lignesCsv = (texte) => texte.replace(/^﻿/, '').trim().split('\r\n').map((l) => l.split(';'));

describe('Rapprochement commande / réception / facture', () => {
  test('prix facturé au-delà de la tolérance → écart, paiement bloqué jusqu’à l’acceptation du client', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeReceptionnee(rc);
    const res = await emettre(rc, commande, { lines: [{ line_no: 1, unit_price: 16000 }] });
    expect(res.status).toBe(201);
    const facture = res.body.data.invoice;
    expect(facture).toMatchObject({ total: 198800, match_status: 'ecart', payment_blocked: true });
    expect(facture.match_details.ecarts).toEqual([{ line_no: 1, name: rc.produits[0].name, type: 'prix', attendu: 15000, facture: 16000 }]);
    expect(await compter('notifications', "user_id = :u AND type = 'facture_ecart'", { u: rc.acheteur.user.id })).toBe(1);

    // Paiement : jamais imputé sur une facture bloquée.
    const cible = await api().post('/api/v1/paiements').set(rc.fournisseur.h).send({
      partnership_id: rc.partenariat.id, amount: 50000, method: 'virement', paid_on: aujourdhui(), allocations: [{ invoice_id: facture.id, amount: 50000 }],
    });
    expect(cible.body.error.code).toBe('IMPUTATION_INVALIDE');
    const credit = await api().post('/api/v1/paiements').set(rc.fournisseur.h).send({ partnership_id: rc.partenariat.id, amount: 50000, method: 'virement', paid_on: aujourdhui() });
    expect(credit.body.data.payment.unallocated_amount).toBe(50000);
    expect((await api().get('/api/v1/factures?bloquees=true').set(rc.acheteur.h)).body.data.items.map((f) => f.id)).toEqual([facture.id]);

    // Le fournisseur ne décide pas pour son client.
    expect((await api().post(`/api/v1/factures/${facture.id}/accepter-ecart`).set(rc.fournisseur.h).send({})).status).toBe(403);
    const accepte = await api().post(`/api/v1/factures/${facture.id}/accepter-ecart`).set(rc.acheteur.h).send({ comment: 'Hausse convenue par téléphone' });
    expect(accepte.body.data.invoice).toMatchObject({ match_status: 'accepte', payment_blocked: false, amount_paid: 50000, status: 'partiellement_payee' });
    expect((await api().post(`/api/v1/factures/${facture.id}/accepter-ecart`).set(rc.acheteur.h).send({})).body.error.code).toBe('AUCUN_ECART');
  });

  test('tolérance respectée ou facturation inférieure : conforme ; quantité au-delà du reçu : écart ; contestation', async () => {
    const rc = await relationCommerciale();
    const dansTolerance = await emettre(rc, await commandeReceptionnee(rc), { lines: [{ line_no: 1, unit_price: 15200 }, { line_no: 2, quantity: 3 }] });
    expect(dansTolerance.body.data.invoice.match_status).toBe('conforme');

    const commande = await commandeReceptionnee(rc);
    const trop = await emettre(rc, commande, { lines: [{ line_no: 1, quantity: 12 }] });
    expect(trop.body.data.invoice.match_details.ecarts[0]).toMatchObject({ type: 'quantite', attendu: 10, facture: 12 });
    const conteste = await api().post(`/api/v1/factures/${trop.body.data.invoice.id}/contester`).set(rc.acheteur.h).send({ comment: 'Nous avons reçu 10 sacs' });
    expect(conteste.body.data.invoice).toMatchObject({ match_status: 'conteste', payment_blocked: true });
    expect(await compter('notifications', "user_id = :u AND type = 'facture_ecart'", { u: rc.fournisseur.user.id })).toBe(1);
    // Le fournisseur annule et émet une facture conforme.
    await api().post(`/api/v1/factures/${trop.body.data.invoice.id}/annuler`).set(rc.fournisseur.h).send({ reason: 'Quantité corrigée' });
    expect((await emettre(rc, commande)).body.data.invoice.match_status).toBe('conforme');
    expect((await emettre(rc, await commandeReceptionnee(rc), { lines: [{ line_no: 7, quantity: 1 }] })).body.error.code).toBe('LIGNES_INVALIDES');
  });

  test('facture transmise : total imprimé déclaré comparé au total calculé (lignes en JSON dans le multipart)', async () => {
    const rc = await relationCommerciale();
    const divergente = await api().post('/api/v1/factures').set(rc.fournisseur.h)
      .field('order_id', (await commandeReceptionnee(rc)).id).field('declared_total', '195000')
      .attach('fichier', pdfTest(), 'facture.pdf');
    expect(divergente.body.data.invoice).toMatchObject({ source: 'importee', match_status: 'ecart' });
    expect(divergente.body.data.invoice.match_details.ecarts).toEqual([{ type: 'total_document', attendu: 187000, facture: 195000 }]);

    const concordante = await api().post('/api/v1/factures').set(rc.fournisseur.h)
      .field('order_id', (await commandeReceptionnee(rc)).id).field('declared_total', '177000')
      .field('lines', JSON.stringify([{ line_no: 2, quantity: 0 }]))
      .attach('fichier', pdfTest(), 'facture.pdf');
    expect(concordante.body.data.invoice).toMatchObject({ total: 177000, match_status: 'conforme' });
    const malformee = await api().post('/api/v1/factures').set(rc.fournisseur.h)
      .field('order_id', (await commandeReceptionnee(rc)).id).field('lines', '[{oups').attach('fichier', pdfTest(), 'facture.pdf');
    expect(malformee.status).toBe(422);
  });
});

describe('Relances des factures impayées', () => {
  test('paliers J+3 / J+7 / J+15 : le palier atteint part une seule fois ; facture bloquée jamais relancée', async () => {
    const rc = await relationCommerciale();
    const facture = await factureEmise(rc);
    const echoir = (jours) => sequelize.query('UPDATE invoices SET issue_date = :e, due_date = :e WHERE id = :id', { replacements: { id: facture.id, e: ajouterJours(aujourdhui(), -jours) } });
    const relances = () => compter('invoice_reminders', "invoice_id = :id AND channel = 'auto'", { id: facture.id });

    await echoir(8);
    await relancesAutomatiques();
    expect(await compter('invoice_reminders', "invoice_id = :id AND level = 2 AND days_overdue = 8 AND amount_due = 187000", { id: facture.id })).toBe(1);
    await relancesAutomatiques();
    expect(await relances()).toBe(1);
    expect(await compter('notifications', "user_id = :u AND type = 'relance_facture'", { u: rc.acheteur.user.id })).toBe(1);

    await echoir(16);
    await relancesAutomatiques();
    expect(await relances()).toBe(2);
    const historique = await api().get(`/api/v1/factures/${facture.id}/relances`).set(rc.acheteur.h);
    expect(historique.body.data).toMatchObject({ reminders_count: 2 });
    expect(historique.body.data.reminders.map((r) => r.level)).toEqual([3, 2]);

    // Fournisseur qui désactive les relances : plus rien.
    const autre = await relationCommerciale();
    await api().patch('/api/v1/entreprise/parametres').set(autre.fournisseur.h).send({ dunning_enabled: false });
    const f2 = await factureEmise(autre);
    await sequelize.query('UPDATE invoices SET issue_date = :e, due_date = :e WHERE id = :id', { replacements: { id: f2.id, e: ajouterJours(aujourdhui(), -30) } });
    await relancesAutomatiques();
    expect(await compter('invoice_reminders', 'invoice_id = :id', { id: f2.id })).toBe(0);
  });

  test('relance manuelle : une par 24 h, réservée au fournisseur ; facture en écart refusée', async () => {
    const rc = await relationCommerciale();
    const facture = await factureEmise(rc);
    const res = await api().post(`/api/v1/factures/${facture.id}/relancer`).set(rc.fournisseur.h).send({});
    expect(res.status).toBe(201);
    expect(res.body.data.reminders[0]).toMatchObject({ channel: 'manuel', level: 0, sent_by: rc.fournisseur.user.id });
    expect((await api().post(`/api/v1/factures/${facture.id}/relancer`).set(rc.fournisseur.h).send({})).body.error.code).toBe('RELANCE_RECENTE');
    expect((await api().post(`/api/v1/factures/${facture.id}/relancer`).set(rc.acheteur.h).send({})).status).toBe(403);

    const bloquee = (await emettre(rc, await commandeReceptionnee(rc), { lines: [{ line_no: 1, unit_price: 20000 }] })).body.data.invoice;
    expect((await api().post(`/api/v1/factures/${bloquee.id}/relancer`).set(rc.fournisseur.h).send({})).body.error.code).toBe('FACTURE_BLOQUEE');
  });
});

describe('Export comptable SYSCOHADA', () => {
  test('journaux des ventes, des achats et de trésorerie : écritures équilibrées, comptes et tiers', async () => {
    const rc = await relationCommerciale();
    await api().patch(`/api/v1/partenariats/${rc.partenariat.id}`).set(rc.fournisseur.h).send({ supplier_customer_code: 'CLI042' });
    const facture = await factureEmise(rc);
    await api().post('/api/v1/avoirs').set(rc.fournisseur.h).send({ invoice_id: facture.id, reason: 'Remise', lines: [{ line_no: 2, quantity: 4 }] });
    await api().post('/api/v1/paiements').set(rc.fournisseur.h).send({ partnership_id: rc.partenariat.id, amount: 100000, method: 'especes', paid_on: aujourdhui() });
    await api().post('/api/v1/paiements').set(rc.fournisseur.h).send({ partnership_id: rc.partenariat.id, amount: 20000, method: 'wave', paid_on: aujourdhui() });

    const equilibre = (lignes) => {
      const debit = lignes.reduce((s, l) => s + Number(l[6]), 0);
      const credit = lignes.reduce((s, l) => s + Number(l[7]), 0);
      expect(debit).toBe(credit);
    };
    const ventes = await api().get('/api/v1/statistiques/exports/journal_ventes.csv').set(rc.fournisseur.h);
    expect(ventes.status).toBe(200);
    const [entete, ...lignesVentes] = lignesCsv(ventes.text);
    expect(entete).toEqual(['Journal', 'Date', 'Pièce', 'Compte', 'Compte tiers', 'Libellé', 'Débit', 'Crédit', 'Échéance']);
    equilibre(lignesVentes);
    expect(lignesVentes.map((l) => [l[2], l[3], l[4], Number(l[6]), Number(l[7])])).toEqual([
      [facture.number, '411100', 'CLI042', 187000, 0],
      [facture.number, '701100', '', 0, 160000],
      [facture.number, '443100', '', 0, 27000],
      [expect.stringMatching(/^AV-/), '701900', '', 10000, 0],
      [expect.stringMatching(/^AV-/), '411100', 'CLI042', 0, 10000],
    ]);

    const achats = lignesCsv((await api().get('/api/v1/statistiques/exports/journal_achats.csv').set(rc.acheteur.h)).text).slice(1);
    equilibre(achats);
    expect(achats.map((l) => l[3])).toEqual(['601100', '445200', '401100', '401100', '601900']);

    const tresorerie = lignesCsv((await api().get('/api/v1/statistiques/exports/journal_tresorerie.csv').set(rc.fournisseur.h)).text).slice(1);
    equilibre(tresorerie);
    expect(tresorerie.map((l) => [l[0], l[3]])).toEqual([['CA', '571100'], ['CA', '411100'], ['MM', '585000'], ['MM', '411100']]);

    // Comptes surchargés par l'entreprise.
    await api().patch('/api/v1/entreprise/parametres').set(rc.fournisseur.h).send({ accounting_accounts: { clients: '4111' } });
    await api().patch('/api/v1/entreprise/parametres').set(rc.fournisseur.h).send({ accounting_accounts: { ventes: '7011' } });
    const perso = lignesCsv((await api().get('/api/v1/statistiques/exports/journal_ventes.csv').set(rc.fournisseur.h)).text).slice(1);
    expect(perso.slice(0, 2).map((l) => l[3])).toEqual(['4111', '7011']);
    expect((await api().patch('/api/v1/entreprise/parametres').set(rc.fournisseur.h).send({ accounting_accounts: { clients: '41 1' } })).status).toBe(422);
  });
});

describe('Import / export du catalogue (CSV)', () => {
  test('export au format d’import ; import : mise à jour, création, catégorie créée, stock suivi ; simulation', async () => {
    const rc = await relationCommerciale();
    const [p1] = rc.produits;
    const exporte = await api().get('/api/v1/produits/export.csv').set(rc.fournisseur.h);
    const [entete, ...produits] = lignesCsv(exporte.text);
    expect(entete.slice(0, 6)).toEqual(['Référence', 'Nom', 'Description', 'Unité', 'Conditionnement', 'Prix HT']);
    expect(produits).toHaveLength(2);
    expect((await api().get('/api/v1/produits/import/modele.csv').set(rc.fournisseur.h)).text).toMatch(/RIZ-25/);

    const fichier = Buffer.from([
      'Référence;Nom;Unité;Prix HT;TVA %;Catégorie;Stock;Multiple de commande;Actif',
      `${p1.reference};;;"16 500";;Céréales;;;`,
      'HUILE-5L;Huile 5 litres;Bouteille;4500;18;Épicerie;40;6;oui',
    ].join('\n'), 'utf8');
    const simulation = await api().post('/api/v1/produits/import').set(rc.fournisseur.h).field('simulation', 'true').attach('fichier', fichier, 'catalogue.csv');
    expect(simulation.body.data.import).toEqual({ created: 1, updated: 1, categories_created: 2, simulation: true });
    expect(await compter('products', "company_id = :c AND reference = 'HUILE-5L'", { c: rc.fournisseur.companyId })).toBe(0);

    const reel = await api().post('/api/v1/produits/import').set(rc.fournisseur.h).attach('fichier', fichier, 'catalogue.csv');
    expect(reel.status).toBe(200);
    expect(reel.body.data.import).toMatchObject({ created: 1, updated: 1, simulation: false });
    const maj = (await api().get(`/api/v1/produits/${p1.id}`).set(rc.fournisseur.h)).body.data.product;
    expect(maj).toMatchObject({ price: 16500, category: { name: 'Céréales' } });
    const cree = (await api().get('/api/v1/produits?q=HUILE').set(rc.fournisseur.h)).body.data.items[0];
    expect(cree).toMatchObject({ unit: 'bouteille', price: 4500, available_quantity: 40, category: { name: 'Épicerie' } });
    expect(Number(cree.order_multiple)).toBe(6);
    expect(await compter('stock_movements', "product_id = :p AND type = 'ajustement'", { p: cree.id })).toBe(1);
  });

  test('tout ou rien : erreurs ligne par ligne ; réservé au fournisseur', async () => {
    const rc = await relationCommerciale();
    const fichier = Buffer.from([
      'Référence;Nom;Unité;Prix HT',
      'A1;Produit A;palette-geante;1000',
      'A2;Produit B;kg;douze',
      'A2;Produit B bis;kg;12',
      ';Sans référence;kg;5',
    ].join('\n'));
    const res = await api().post('/api/v1/produits/import').set(rc.fournisseur.h).attach('fichier', fichier, 'catalogue.csv');
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      'Ligne 2 : unité « palette-geante » inconnue',
      'Ligne 3 : « douze » n\'est pas un nombre (price)',
      'Ligne 4 : référence « A2 » déjà présente ligne 3',
      'Ligne 5 : référence manquante',
    ]);
    expect((await api().post('/api/v1/produits/import').set(rc.fournisseur.h).attach('fichier', Buffer.from('Nom;Prix\nX;1'), 'c.csv')).body.error.code).toBe('IMPORT_INVALIDE');
    expect((await api().post('/api/v1/produits/import').set(rc.acheteur.h).attach('fichier', fichier, 'c.csv')).status).toBe(403);
    const comptable = await collaborateur(rc.fournisseur, 'comptable');
    expect((await api().get('/api/v1/produits/export.csv').set(comptable.h)).status).toBe(403);
    const vide = await nouvelleEntreprise({ type: 'fournisseur' });
    expect(lignesCsv((await api().get('/api/v1/produits/export.csv').set(vide.h)).text)).toHaveLength(1);
  });
});
