'use strict';

const {
  api, relationCommerciale, creerProduit, creerBrouillon, commandeEnvoyee, nouvelleEntreprise, compter, fermer,
} = require('../../../setup/helpers.js');

/**
 * Saisie accélérée des achats : lignes par référence, recommander en un
 * clic, import d'un bon de commande CSV, listes d'achat habituelles.
 */

afterAll(fermer);

const csv = (texte, encodage = 'utf8') => Buffer.from(texte, encodage);

describe('Saisie rapide par référence', () => {
  test('références fournisseur sans distinction de casse ; référence inconnue → 422', async () => {
    const rc = await relationCommerciale();
    const [p1, p2] = rc.produits;
    const res = await api().post('/api/v1/achats').set(rc.acheteur.h).send({
      supplier_id: rc.fournisseur.companyId,
      lines: [{ reference: p1.reference.toLowerCase(), quantity: 3 }, { product_id: p2.id, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order.current_version.lines.map((l) => l.product_id)).toEqual([p1.id, p2.id]);
    const inconnue = await api().post('/api/v1/achats').set(rc.acheteur.h).send({ supplier_id: rc.fournisseur.companyId, lines: [{ reference: 'NEXISTE-PAS', quantity: 1 }] });
    expect(inconnue.body.error.code).toBe('REFERENCE_INCONNUE');
    const lesDeux = await api().post('/api/v1/achats').set(rc.acheteur.h).send({ supplier_id: rc.fournisseur.companyId, lines: [{ reference: p1.reference, product_id: p1.id, quantity: 1 }] });
    expect(lesDeux.status).toBe(422);
  });
});

describe('Recommander en un clic', () => {
  test('nouveau brouillon aux prix actuels ; produits devenus indisponibles écartés et listés', async () => {
    const rc = await relationCommerciale();
    const [p1, p2] = rc.produits;
    const passee = await commandeEnvoyee(rc);
    await api().post(`/api/v1/ventes/${passee.id}/accepter`).set(rc.fournisseur.h).send({});
    // Entre-temps : hausse de prix sur p1, rupture sur p2.
    await api().patch(`/api/v1/produits/${p1.id}/prix`).set(rc.fournisseur.h).send({ price: 16000 });
    await api().patch(`/api/v1/produits/${p2.id}/disponibilite`).set(rc.fournisseur.h).send({ availability: 'rupture' });

    const res = await api().post(`/api/v1/achats/${passee.id}/recommander`).set(rc.acheteur.h).send({});
    expect(res.status).toBe(201);
    const nouvelle = res.body.data.order;
    expect(nouvelle).toMatchObject({ status: 'brouillon', source_order_id: passee.id });
    expect(nouvelle.current_version.lines).toHaveLength(1);
    expect(nouvelle.current_version.lines[0]).toMatchObject({ product_id: p1.id, quantity: 10, unit_price: 16000 });
    expect(res.body.data.skipped_lines).toEqual([expect.objectContaining({ name: p2.name, reason: 'produit indisponible' })]);
    expect(await compter('order_events', "order_id = :o AND type = 'creation' AND details->>'origine' = 'recommande'", { o: nouvelle.id })).toBe(1);

    // Plus rien de commandable → 409 avec le détail.
    await api().patch(`/api/v1/produits/${p1.id}/disponibilite`).set(rc.fournisseur.h).send({ availability: 'rupture' });
    const rien = await api().post(`/api/v1/achats/${passee.id}/recommander`).set(rc.acheteur.h).send({});
    expect(rien.body.error.code).toBe('RIEN_A_RECOMMANDER');
    expect(rien.body.error.details.lignes_ecartees).toHaveLength(2);
    // Commande d'un autre acheteur : refusée.
    const intrus = await nouvelleEntreprise({ type: 'acheteur' });
    expect((await api().post(`/api/v1/achats/${passee.id}/recommander`).set(intrus.h).send({})).status).toBe(403);
  });
});

describe('Import d’un bon de commande CSV', () => {
  test('avec en-tête (séparateur ;, décimales à la virgule), sans en-tête (séparateur ,), encodage Windows-1252', async () => {
    const rc = await relationCommerciale();
    const [p1, p2] = rc.produits;
    const avecEntete = await api().post('/api/v1/achats/import').set(rc.acheteur.h)
      .field('supplier_id', rc.fournisseur.companyId).field('buyer_reference', 'IMP-1')
      .attach('fichier', csv(`﻿Référence;Quantité;Commentaire\n${p1.reference};3;Urgent\n${p2.reference};"2,5";\n`), 'commande.csv');
    expect(avecEntete.status).toBe(201);
    expect(avecEntete.body.data.order).toMatchObject({ buyer_reference: 'IMP-1', status: 'brouillon', lines_count: 2 });
    expect(avecEntete.body.data.order.current_version.lines[1]).toMatchObject({ product_id: p2.id, quantity: 2.5 });
    expect(avecEntete.body.data.order.current_version.lines[0].comment).toBe('Urgent');

    const sansEntete = await api().post('/api/v1/achats/import').set(rc.acheteur.h)
      .field('supplier_id', rc.fournisseur.companyId)
      .attach('fichier', csv(`${p1.reference},4\n`), 'commande.csv');
    expect(sansEntete.status).toBe(201);

    const latin = await api().post('/api/v1/achats/import').set(rc.acheteur.h)
      .field('supplier_id', rc.fournisseur.companyId)
      .attach('fichier', csv(`Référence;Quantité;Commentaire\n${p1.reference};1;Livré à l'entrepôt\n`, 'latin1'), 'commande.csv');
    expect(latin.body.data.order.current_version.lines[0].comment).toBe("Livré à l'entrepôt");
  });

  test('tout ou rien : chaque erreur cite sa ligne du fichier ; fichier binaire refusé', async () => {
    const rc = await relationCommerciale();
    const [p1] = rc.produits;
    const res = await api().post('/api/v1/achats/import').set(rc.acheteur.h)
      .field('supplier_id', rc.fournisseur.companyId)
      .attach('fichier', csv(`reference;quantite\n${p1.reference};2\nINCONNUE;1\n${p1.reference};abc\n`), 'commande.csv');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IMPORT_INVALIDE');
    expect(res.body.error.details).toEqual(['Ligne 4 du fichier : quantité invalide « abc »']);

    const inconnue = await api().post('/api/v1/achats/import').set(rc.acheteur.h)
      .field('supplier_id', rc.fournisseur.companyId)
      .attach('fichier', csv(`reference;quantite\n${p1.reference};2\nINCONNUE;1\n`), 'commande.csv');
    expect(inconnue.body.error.details).toEqual(['Ligne 3 du fichier : référence « INCONNUE » introuvable dans le catalogue de ce fournisseur']);
    expect(await compter('orders', 'buyer_company_id = :b', { b: rc.acheteur.companyId })).toBe(0);

    const binaire = await api().post('/api/v1/achats/import').set(rc.acheteur.h)
      .field('supplier_id', rc.fournisseur.companyId)
      .attach('fichier', Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]), 'commande.csv');
    expect(binaire.body.error.code).toBe('FORMAT_FICHIER_REFUSE');
    expect((await api().post('/api/v1/achats/import').set(rc.acheteur.h).attach('fichier', csv('A;1'), 'c.csv')).status).toBe(422);
  });
});

describe('Listes d’achat habituelles', () => {
  test('création, stock cible arrondi au minimum / multiple, quantité imposée, produit écarté', async () => {
    const rc = await relationCommerciale();
    const [p1, p2] = rc.produits;
    const carton = await creerProduit(rc.fournisseur, { unit: 'carton', min_order_quantity: 6, order_multiple: 6, price: 9000, tax_rate: 0 });
    const creation = await api().post('/api/v1/listes-achat').set(rc.acheteur.h).send({
      supplier_id: rc.fournisseur.companyId,
      name: 'Commande de la semaine',
      items: [
        { product_id: p1.id, quantity: 5 },
        { reference: carton.reference, par_level: 20 },
        { product_id: p2.id, par_level: 10 },
      ],
    });
    expect(creation.status).toBe(201);
    const liste = creation.body.data.purchase_list;
    expect(liste.items).toHaveLength(3);
    expect(liste.items[1]).toMatchObject({ product_id: carton.id, par_level: 20, product: { orderable: true, price: 9000 } });

    await api().patch(`/api/v1/produits/${p2.id}/disponibilite`).set(rc.fournisseur.h).send({ availability: 'rupture' });
    const commande = await api().post(`/api/v1/listes-achat/${liste.id}/commander`).set(rc.acheteur.h).send({
      stocks: [{ product_id: carton.id, on_hand: 7 }],
      lines: [{ product_id: p1.id, quantity: 8 }],
      delivery_address: 'Entrepôt Rufisque',
    });
    expect(commande.status).toBe(201);
    const order = commande.body.data.order;
    expect(order).toMatchObject({ purchase_list_id: liste.id, delivery_address: 'Entrepôt Rufisque' });
    const lignes = Object.fromEntries(order.current_version.lines.map((l) => [l.product_id, l]));
    expect(Number(lignes[p1.id].quantity)).toBe(8);
    // Stock cible 20 − constaté 7 = 13, arrondi au multiple de 6 : 18.
    expect(Number(lignes[carton.id].quantity)).toBe(18);
    expect(lignes[carton.id].comment).toMatch(/Arrondi de 13 à 18/);
    expect(commande.body.data.skipped_lines).toEqual([expect.objectContaining({ product_id: p2.id, reason: 'produit indisponible' })]);
    expect((await api().get(`/api/v1/listes-achat/${liste.id}`).set(rc.acheteur.h)).body.data.purchase_list.last_ordered_at).toBeTruthy();

    // Stock déjà au niveau : rien à commander.
    const rien = await api().post(`/api/v1/listes-achat/${liste.id}/commander`).set(rc.acheteur.h).send({
      stocks: [{ product_id: carton.id, on_hand: 20 }], lines: [{ product_id: p1.id, quantity: 0 }],
    });
    expect(rien.body.error.code).toBe('RIEN_A_COMMANDER');
  });

  test('liste créée depuis une commande passée ; modification, suppression ; contrôles d’accès', async () => {
    const rc = await relationCommerciale();
    const passee = await creerBrouillon(rc.acheteur, rc.fournisseur, [{ product_id: rc.produits[0].id, quantity: 7 }]);
    const depuis = await api().post('/api/v1/listes-achat').set(rc.acheteur.h).send({ supplier_id: rc.fournisseur.companyId, name: 'Habituel', from_order_id: passee.id });
    expect(depuis.status).toBe(201);
    const liste = depuis.body.data.purchase_list;
    expect(liste.items).toEqual([expect.objectContaining({ product_id: rc.produits[0].id, quantity: 7 })]);
    expect((await api().post('/api/v1/listes-achat').set(rc.acheteur.h).send({ supplier_id: rc.fournisseur.companyId, name: 'habituel', items: [] })).body.error.code).toBe('LISTE_ACHAT_EXISTANTE');

    const modif = await api().patch(`/api/v1/listes-achat/${liste.id}`).set(rc.acheteur.h).send({ name: 'Habituel lundi', items: [{ product_id: rc.produits[1].id, quantity: 3 }] });
    expect(modif.body.data.purchase_list).toMatchObject({ name: 'Habituel lundi', items: [expect.objectContaining({ product_id: rc.produits[1].id })] });
    const doublon = await api().patch(`/api/v1/listes-achat/${liste.id}`).set(rc.acheteur.h).send({ items: [{ product_id: rc.produits[1].id, quantity: 3 }, { product_id: rc.produits[1].id, par_level: 2 }] });
    expect(doublon.body.error.code).toBe('LIGNES_INVALIDES');
    expect((await api().patch(`/api/v1/listes-achat/${liste.id}`).set(rc.acheteur.h).send({ items: [{ product_id: rc.produits[1].id }] })).status).toBe(422);

    const autre = await nouvelleEntreprise({ type: 'acheteur' });
    expect((await api().get(`/api/v1/listes-achat/${liste.id}`).set(autre.h)).status).toBe(403);
    const inconnu = await nouvelleEntreprise({ type: 'fournisseur' });
    expect((await api().post('/api/v1/listes-achat').set(rc.acheteur.h).send({ supplier_id: inconnu.companyId, name: 'X', items: [] })).body.error.code).toBe('PARTENARIAT_INACTIF');
    expect((await api().get('/api/v1/listes-achat').set(rc.fournisseur.h)).status).toBe(403);

    const toutes = await api().get(`/api/v1/listes-achat?supplier_id=${rc.fournisseur.companyId}`).set(rc.acheteur.h);
    expect(toutes.body.data.items[0]).toMatchObject({ id: liste.id, items_count: 1 });
    expect((await api().delete(`/api/v1/listes-achat/${liste.id}`).set(rc.acheteur.h)).status).toBe(200);
    expect((await api().get(`/api/v1/listes-achat/${liste.id}`).set(rc.acheteur.h)).status).toBe(404);
  });
});
