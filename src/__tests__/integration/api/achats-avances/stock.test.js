'use strict';

const {
  api, relationCommerciale, creerProduit, commandeEnvoyee, compter, fermer, sequelize,
} = require('../../../setup/helpers.js');

/**
 * Stock du fournisseur : entrées, inventaire, réservation à la validation,
 * sortie à la livraison, libération à l'annulation, disponibilité suivie,
 * alerte de stock bas.
 */

afterAll(fermer);

const produit = (rc, id) => api().get(`/api/v1/produits/${id}`).set(rc.fournisseur.h).then((r) => r.body.data.product);

describe('Stock suivi', () => {
  test('entrée → réservation à la validation → sortie à la livraison ; mouvements tracés', async () => {
    const rc = await relationCommerciale();
    const p = await creerProduit(rc.fournisseur, { price: 1000, tax_rate: 0 });
    const entree = await api().post(`/api/v1/produits/${p.id}/stock`).set(rc.fournisseur.h).send({ type: 'entree', quantity: 30, note: 'Arrivage' });
    expect(entree.status).toBe(201);
    expect(Number(entree.body.data.product.stock_quantity)).toBe(30);
    expect(entree.body.data.product.available_quantity).toBe(30);

    const commande = await commandeEnvoyee(rc, [{ product_id: p.id, quantity: 12 }]);
    await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});
    expect(await produit(rc, p.id)).toMatchObject({ available_quantity: 18 });

    await api().post(`/api/v1/ventes/${commande.id}/livraisons`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, quantity: 5 }] });
    let fiche = await produit(rc, p.id);
    expect(Number(fiche.stock_quantity)).toBe(25);
    expect(Number(fiche.stock_reserved)).toBe(7);

    // Reliquat soldé : la réservation restante est libérée.
    await api().post(`/api/v1/ventes/${commande.id}/solder-reliquat`).set(rc.fournisseur.h).send({ reason: 'Fin de série' });
    fiche = await produit(rc, p.id);
    expect(Number(fiche.stock_reserved)).toBe(0);
    expect(fiche.available_quantity).toBe(25);

    const mouvements = await api().get(`/api/v1/produits/${p.id}/mouvements-stock`).set(rc.fournisseur.h);
    expect(mouvements.body.data.items.map((m) => m.type)).toEqual(['liberation', 'sortie', 'reservation', 'entree']);
    expect(Number(mouvements.body.data.items[1].quantity)).toBe(-5);
    expect(mouvements.body.data.items[1].order_id).toBe(commande.id);
  });

  test('stock insuffisant : la validation est refusée (409) ; le fournisseur propose une quantité réduite', async () => {
    const rc = await relationCommerciale();
    const p = await creerProduit(rc.fournisseur, { stock_quantity: 4 });
    const commande = await commandeEnvoyee(rc, [{ product_id: p.id, quantity: 10 }]);
    const refus = await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});
    expect(refus.status).toBe(409);
    expect(refus.body.error.code).toBe('STOCK_INSUFFISANT');
    expect(refus.body.error.details.lignes[0]).toMatchObject({ line_no: 1, demande: 10, disponible: 4 });
    await api().post(`/api/v1/ventes/${commande.id}/proposer`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, quantity: 4 }] });
    const validee = await api().post(`/api/v1/achats/${commande.id}/accepter-proposition`).set(rc.acheteur.h).send({});
    expect(validee.body.data.order.status).toBe('validee');
    // Plus rien de disponible : rupture affichée aux clients.
    expect((await produit(rc, p.id)).availability).toBe('rupture');

    // Annulation par le fournisseur d'une commande validée : réservation libérée.
    await api().post(`/api/v1/ventes/${commande.id}/annuler`).set(rc.fournisseur.h).send({ reason: 'Camion en panne' });
    const fiche = await produit(rc, p.id);
    expect(Number(fiche.stock_reserved)).toBe(0);
    expect(fiche.availability).toBe('disponible');
  });

  test('alerte de stock bas : une notification par franchissement du seuil ; liste des alertes', async () => {
    const rc = await relationCommerciale();
    const p = await creerProduit(rc.fournisseur, { stock_quantity: 20, low_stock_threshold: 5 });
    const commande = await commandeEnvoyee(rc, [{ product_id: p.id, quantity: 16 }]);
    await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});
    const notifs = () => compter('notifications', "user_id = :u AND type = 'stock_bas'", { u: rc.fournisseur.user.id });
    expect(await notifs()).toBe(1);
    expect((await produit(rc, p.id)).availability).toBe('stock_limite');
    const alertes = await api().get('/api/v1/produits/stock/alertes').set(rc.fournisseur.h);
    expect(alertes.body.data.products.map((a) => a.id)).toContain(p.id);

    // Toujours sous le seuil : pas de nouvelle alerte ; remonté au-dessus puis redescendu : nouvelle alerte.
    await api().post(`/api/v1/produits/${p.id}/stock`).set(rc.fournisseur.h).send({ type: 'entree', quantity: 1 });
    expect(await notifs()).toBe(1);
    await api().post(`/api/v1/produits/${p.id}/stock`).set(rc.fournisseur.h).send({ type: 'entree', quantity: 20 });
    expect((await produit(rc, p.id)).availability).toBe('disponible');
    await api().post(`/api/v1/produits/${p.id}/stock`).set(rc.fournisseur.h).send({ type: 'ajustement', stock_quantity: 18 });
    expect(await notifs()).toBe(2);
  });

  test('inventaire sous la réservation refusé ; arrêt du suivi impossible pendant une réservation', async () => {
    const rc = await relationCommerciale();
    const p = await creerProduit(rc.fournisseur, { stock_quantity: 10 });
    const commande = await commandeEnvoyee(rc, [{ product_id: p.id, quantity: 6 }]);
    await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});
    const bas = await api().post(`/api/v1/produits/${p.id}/stock`).set(rc.fournisseur.h).send({ type: 'ajustement', stock_quantity: 3 });
    expect(bas.body.error.code).toBe('STOCK_SOUS_RESERVE');
    const arret = await api().patch(`/api/v1/produits/${p.id}`).set(rc.fournisseur.h).send({ stock_quantity: null });
    expect(arret.body.error.code).toBe('STOCK_RESERVE');
    expect((await api().post(`/api/v1/produits/${p.id}/stock`).set(rc.fournisseur.h).send({ type: 'entree' })).status).toBe(422);
    expect((await api().post(`/api/v1/produits/${p.id}/stock`).set(rc.fournisseur.h).send({ type: 'ajustement', stock_quantity: 10 })).body.error.code).toBe('STATUT_INCHANGE');
    // La fiche produit modifie le stock : la variation est tracée comme un ajustement.
    await api().patch(`/api/v1/produits/${p.id}`).set(rc.fournisseur.h).send({ stock_quantity: 14 });
    const [[{ n }]] = await sequelize.query("SELECT count(*)::int AS n FROM stock_movements WHERE product_id = :p AND type = 'ajustement' AND quantity = 4", { replacements: { p: p.id } });
    expect(n).toBe(1);
  });

  test('client et autre fournisseur : aucun accès au stock', async () => {
    const rc = await relationCommerciale();
    const [p] = rc.produits;
    expect((await api().post(`/api/v1/produits/${p.id}/stock`).set(rc.acheteur.h).send({ type: 'entree', quantity: 1 })).status).toBe(403);
    expect((await api().get(`/api/v1/produits/${p.id}/mouvements-stock`).set(rc.acheteur.h)).status).toBe(403);
  });
});
