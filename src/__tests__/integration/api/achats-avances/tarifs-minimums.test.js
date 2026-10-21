'use strict';

const {
  api, relationCommerciale, nouvelleEntreprise, creerProduit, creerBrouillon, commandeEnvoyee, compter, fermer,
} = require('../../../setup/helpers.js');

/**
 * Tarifs propres à un client ou à un groupe de clients (listes de prix),
 * remises par paliers de quantité, minimum / multiple / maximum de commande
 * et montant minimum de commande du fournisseur.
 */

afterAll(fermer);

const affecter = (rc, priceListId) => api().patch(`/api/v1/partenariats/${rc.partenariat.id}`).set(rc.fournisseur.h).send({ price_list_id: priceListId });

describe('Listes de prix (tarif client / groupe de clients)', () => {
  test('prix propre + remise globale : le client voit SES prix au catalogue et commande à ces prix', async () => {
    const rc = await relationCommerciale();
    const [p1, p2] = rc.produits;
    const creation = await api().post('/api/v1/listes-prix').set(rc.fournisseur.h).send({
      name: 'Grossistes', discount_percent: 10, items: [{ product_id: p1.id, price: 14000 }],
    });
    expect(creation.status).toBe(201);
    const liste = creation.body.data.price_list;
    expect(liste).toMatchObject({ name: 'Grossistes', discount_percent: 10, clients: [] });
    expect(liste.items[0]).toMatchObject({ product_id: p1.id, price: 14000, product: { catalog_price: 15000 } });

    // Avant affectation : prix catalogue.
    const avant = await api().get(`/api/v1/catalogues/${rc.fournisseur.companyId}/produits`).set(rc.acheteur.h);
    expect(avant.body.data.items.find((p) => p.id === p1.id)).toMatchObject({ price: 15000, has_customer_price: false });

    expect((await affecter(rc, liste.id)).status).toBe(200);
    const catalogue = await api().get(`/api/v1/catalogues/${rc.fournisseur.companyId}/produits`).set(rc.acheteur.h);
    const vus = Object.fromEntries(catalogue.body.data.items.map((p) => [p.id, p]));
    expect(vus[p1.id]).toMatchObject({ price: 14000, catalog_price: 15000, has_customer_price: true });
    expect(vus[p2.id]).toMatchObject({ price: 2250, catalog_price: 2500 });
    // Données internes du fournisseur jamais montrées au client.
    expect(vus[p1.id]).not.toHaveProperty('stock_quantity');
    expect(vus[p1.id]).not.toHaveProperty('stock_reserved');

    const commande = await creerBrouillon(rc.acheteur, rc.fournisseur, [{ product_id: p1.id, quantity: 2 }, { product_id: p2.id, quantity: 4 }]);
    const lignes = commande.current_version.lines;
    expect(lignes[0]).toMatchObject({ unit_price: 14000, base_unit_price: 14000 });
    expect(lignes[1]).toMatchObject({ unit_price: 2250 });
    expect(commande.subtotal).toBe(2 * 14000 + 4 * 2250);

    // Le détail de la liste montre ses clients ; la liste n'est visible que du fournisseur.
    const detail = await api().get(`/api/v1/listes-prix/${liste.id}`).set(rc.fournisseur.h);
    expect(detail.body.data.price_list.clients).toHaveLength(1);
    const partenariatVuClient = await api().get(`/api/v1/partenariats/${rc.partenariat.id}`).set(rc.acheteur.h);
    expect(partenariatVuClient.body.data.partnership).not.toHaveProperty('price_list_id');
    expect((await api().get(`/api/v1/listes-prix/${liste.id}`).set(rc.acheteur.h)).status).toBe(403);
  });

  test('suppression : les clients reviennent au prix catalogue ; liste d’un autre fournisseur refusée ; client sans droit', async () => {
    const rc = await relationCommerciale();
    const liste = (await api().post('/api/v1/listes-prix').set(rc.fournisseur.h).send({ name: 'Hôtels', discount_percent: 5 })).body.data.price_list;
    await affecter(rc, liste.id);
    expect((await api().patch(`/api/v1/listes-prix/${liste.id}`).set(rc.fournisseur.h).send({ items: [{ product_id: rc.produits[1].id, price: 2000 }] })).body.data.price_list.items).toHaveLength(1);
    expect((await api().post('/api/v1/listes-prix').set(rc.fournisseur.h).send({ name: 'hôtels' })).body.error.code).toBe('LISTE_PRIX_EXISTANTE');
    expect((await api().delete(`/api/v1/listes-prix/${liste.id}`).set(rc.fournisseur.h)).status).toBe(200);
    expect(await compter('partnerships', 'id = :id AND price_list_id IS NULL', { id: rc.partenariat.id })).toBe(1);

    const autre = await nouvelleEntreprise({ type: 'fournisseur' });
    const etrangere = (await api().post('/api/v1/listes-prix').set(autre.h).send({ name: 'Autre' })).body.data.price_list;
    expect((await affecter(rc, etrangere.id)).body.error.code).toBe('LISTE_PRIX_INVALIDE');
    const parClient = await api().patch(`/api/v1/partenariats/${rc.partenariat.id}`).set(rc.acheteur.h).send({ price_list_id: null });
    expect(parClient.body.error.code).toBe('CHAMP_RESERVE_FOURNISSEUR');
    const produitEtranger = await creerProduit(autre);
    expect((await api().post('/api/v1/listes-prix').set(rc.fournisseur.h).send({ name: 'X', items: [{ product_id: produitEtranger.id, price: 1 }] })).body.error.code).toBe('PRODUIT_INVALIDE');
  });
});

describe('Remises par paliers de quantité', () => {
  test('le palier atteint s’applique ; la quantité modifiée suit les paliers ; un prix négocié est conservé', async () => {
    const rc = await relationCommerciale();
    const [p1] = rc.produits;
    const maj = await api().patch(`/api/v1/produits/${p1.id}/prix`).set(rc.fournisseur.h).send({
      price: 15000, price_tiers: [{ min_quantity: 10, discount_percent: 5 }, { min_quantity: 50, discount_percent: 10 }],
    });
    expect(maj.body.data.product.price_tiers).toEqual([{ min_quantity: 10, discount_percent: 5 }, { min_quantity: 50, discount_percent: 10 }]);
    const vu = await api().get(`/api/v1/catalogues/${rc.fournisseur.companyId}/produits/${p1.id}`).set(rc.acheteur.h);
    expect(vu.body.data.product.price_tiers).toEqual([
      { min_quantity: 10, discount_percent: 5, unit_price: 14250 },
      { min_quantity: 50, discount_percent: 10, unit_price: 13500 },
    ]);

    const commande = await commandeEnvoyee(rc, [{ product_id: p1.id, quantity: 12 }]);
    expect(commande.current_version.lines[0]).toMatchObject({ unit_price: 14250, base_unit_price: 15000, discount_percent: 5 });

    // Le fournisseur porte la quantité à 60 : palier 10 % appliqué.
    const prop = await api().post(`/api/v1/ventes/${commande.id}/proposer`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, quantity: 60 }] });
    expect(prop.body.data.order.current_version.lines[0]).toMatchObject({ quantity: 60, unit_price: 13500, discount_percent: 10, change_type: 'quantite_modifiee' });

    // Prix négocié par le fournisseur : conservé quand l'acheteur change la quantité.
    const c2 = await commandeEnvoyee(rc, [{ product_id: p1.id, quantity: 12 }]);
    await api().post(`/api/v1/ventes/${c2.id}/proposer`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, unit_price: 13000 }] });
    const contre = await api().post(`/api/v1/achats/${c2.id}/demander-modification`).set(rc.acheteur.h).send({ comment: 'Un peu plus', lines: [{ line_no: 1, quantity: 20 }] });
    expect(contre.body.data.order.current_version.lines[0]).toMatchObject({ quantity: 20, unit_price: 13000 });
  });

  test('paliers invalides refusés (doublons, remise ≥ 100 %)', async () => {
    const rc = await relationCommerciale();
    const res = await api().patch(`/api/v1/produits/${rc.produits[0].id}`).set(rc.fournisseur.h)
      .send({ price_tiers: [{ min_quantity: 5, discount_percent: 5 }, { min_quantity: 5, discount_percent: 8 }] });
    expect(res.status).toBe(422);
    expect((await api().patch(`/api/v1/produits/${rc.produits[0].id}`).set(rc.fournisseur.h).send({ price_tiers: [{ min_quantity: 5, discount_percent: 100 }] })).status).toBe(422);
  });
});

describe('Minimum, multiple et maximum de commande', () => {
  test('règles de quantité par produit, contrôlées à la saisie du client', async () => {
    const rc = await relationCommerciale();
    const p = await creerProduit(rc.fournisseur, { min_order_quantity: 12, order_multiple: 6, max_order_quantity: 120 });
    const essai = (quantity) => api().post('/api/v1/achats').set(rc.acheteur.h).send({ supplier_id: rc.fournisseur.companyId, lines: [{ product_id: p.id, quantity }] });
    const tropPeu = await essai(6);
    expect(tropPeu.body.error.code).toBe('LIGNES_INVALIDES');
    expect(tropPeu.body.error.details.join(' ')).toMatch(/minimale/);
    expect((await essai(15)).body.error.details.join(' ')).toMatch(/multiples de 6/);
    expect((await essai(126)).body.error.details.join(' ')).toMatch(/maximale/);
    expect((await essai(18)).status).toBe(201);
    // Maximum inférieur au minimum : refusé à la fiche produit.
    expect((await api().patch(`/api/v1/produits/${p.id}`).set(rc.fournisseur.h).send({ min_order_quantity: 50, max_order_quantity: 10 })).status).toBe(422);
  });

  test('montant minimum de commande du fournisseur, vérifié à l’envoi', async () => {
    const rc = await relationCommerciale();
    await api().patch('/api/v1/entreprise/parametres').set(rc.fournisseur.h).send({ min_order_amount: 50000 });
    const petit = await creerBrouillon(rc.acheteur, rc.fournisseur, [{ product_id: rc.produits[0].id, quantity: 2 }]);
    const refus = await api().post(`/api/v1/achats/${petit.id}/envoyer`).set(rc.acheteur.h).send({});
    expect(refus.status).toBe(422);
    expect(refus.body.error.code).toBe('MINIMUM_COMMANDE');
    await api().patch(`/api/v1/achats/${petit.id}`).set(rc.acheteur.h).send({ lines: [{ product_id: rc.produits[0].id, quantity: 4 }] });
    expect((await api().post(`/api/v1/achats/${petit.id}/envoyer`).set(rc.acheteur.h).send({})).body.data.order.status).toBe('envoyee');
  });
});
