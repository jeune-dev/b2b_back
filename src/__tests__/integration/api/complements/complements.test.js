'use strict';

const {
  api, superAdmin, nouvelleEntreprise, relationCommerciale, creerProduit, commandeEnvoyee, factureEmise, pngTest, pdfTest,
  compter, fermer, sequelize,
} = require('../../../setup/helpers.js');
const { aujourdhui } = require('../../../../utils/dates.js');

/**
 * Compléments : routes de consultation et branches d'erreur des modules
 * (catégories, paiements, documents, produits, forfaits), pour que chaque
 * route de l'API soit exercée au moins une fois.
 */

afterAll(fermer);

describe('Catalogue — compléments', () => {
  test('catégories : liste avec compteur, renommage, suppression d’une catégorie vide', async () => {
    const f = await nouvelleEntreprise({ type: 'fournisseur' });
    const c = (await api().post('/api/v1/categories-produits').set(f.h).send({ name: 'Boissons', sort_order: 2 })).body.data.category;
    await creerProduit(f, { category_id: c.id });
    const liste = await api().get('/api/v1/categories-produits').set(f.h);
    expect(liste.body.data.categories[0]).toMatchObject({ name: 'Boissons', products_count: 1 });
    expect((await api().patch(`/api/v1/categories-produits/${c.id}`).set(f.h).send({ name: 'Boissons fraîches' })).body.data.category.name).toBe('Boissons fraîches');
    const vide = (await api().post('/api/v1/categories-produits').set(f.h).send({ name: 'Vide' })).body.data.category;
    expect((await api().delete(`/api/v1/categories-produits/${vide.id}`).set(f.h)).status).toBe(200);
    // Catégorie d'une autre entreprise : 403 ; référence inconnue dans un produit : 422.
    const autre = await nouvelleEntreprise({ type: 'fournisseur' });
    expect((await api().patch(`/api/v1/categories-produits/${c.id}`).set(autre.h).send({ name: 'X' })).status).toBe(403);
    expect((await api().post('/api/v1/produits').set(f.h).send({ reference: 'Z1', name: 'Z', unit: 'kg', price: 1, category_id: '3f1b8a1e-6c2a-4b8e-9f00-000000000000' })).status).toBe(422);
  });

  test('produit : détail, réactivation, suppression de la photo, double désactivation refusée', async () => {
    const f = await nouvelleEntreprise({ type: 'fournisseur' });
    const p = await creerProduit(f);
    expect((await api().get(`/api/v1/produits/${p.id}`).set(f.h)).body.data.product.id).toBe(p.id);
    await api().post(`/api/v1/produits/${p.id}/photo`).set(f.h).attach('fichier', await pngTest(), 'a.png');
    expect((await api().delete(`/api/v1/produits/${p.id}/photo`).set(f.h)).body.data.product.photo_document_id).toBeNull();
    await api().post(`/api/v1/produits/${p.id}/desactiver`).set(f.h).send({});
    expect((await api().post(`/api/v1/produits/${p.id}/desactiver`).set(f.h).send({})).body.error.code).toBe('STATUT_INCHANGE');
    expect((await api().post(`/api/v1/produits/${p.id}/activer`).set(f.h).send({})).body.data.product.is_active).toBe(true);
    const recherche = await api().get(`/api/v1/produits?q=${encodeURIComponent(p.reference)}&availability=disponible`).set(f.h);
    expect(recherche.body.data.items.map((x) => x.id)).toEqual([p.id]);
  });
});

describe('Paiements et factures — consultation', () => {
  test('listes filtrées : sens, statut, partenaire, période ; détail d’un paiement', async () => {
    const rc = await relationCommerciale();
    const f = await factureEmise(rc);
    const p = (await api().post('/api/v1/paiements').set(rc.fournisseur.h).send({
      partnership_id: rc.partenariat.id, amount: 5000, method: 'virement', paid_on: aujourdhui(), external_reference: 'VIR-001',
    })).body.data.payment;
    const recus = await api().get(`/api/v1/paiements?sens=recus&method=virement&partner_id=${rc.acheteur.companyId}&du=${aujourdhui()}`).set(rc.fournisseur.h);
    expect(recus.body.data.items.map((x) => x.id)).toEqual([p.id]);
    const effectues = await api().get(`/api/v1/paiements?sens=effectues&q=VIR-001&partnership_id=${rc.partenariat.id}`).set(rc.acheteur.h);
    expect(effectues.body.data.items[0]).toMatchObject({ id: p.id, direction: 'effectue' });
    expect((await api().get(`/api/v1/paiements/${p.id}`).set(rc.acheteur.h)).body.data.payment.allocations).toHaveLength(1);
    expect((await api().get('/api/v1/paiements?status=declare').set(rc.fournisseur.h)).body.data.items).toHaveLength(0);

    const impayees = await api().get(`/api/v1/factures?impayees=true&partner_id=${rc.fournisseur.companyId}&q=${encodeURIComponent(f.number)}`).set(rc.acheteur.h);
    expect(impayees.body.data.items.map((x) => x.id)).toEqual([f.id]);
    expect((await api().get('/api/v1/factures?status=payee').set(rc.acheteur.h)).body.data.items).toHaveLength(0);
    const tiers = await nouvelleEntreprise();
    expect((await api().get(`/api/v1/paiements/${p.id}`).set(tiers.h)).status).toBe(403);
    expect((await api().get(`/api/v1/factures/${f.id}`).set(tiers.h)).status).toBe(403);
  });

  test('paiement déclaré retiré par l’acheteur ; un fournisseur n’annule pas une déclaration ; paiement clos', async () => {
    const rc = await relationCommerciale();
    const decl = (await api().post('/api/v1/paiements').set(rc.acheteur.h).send({ partnership_id: rc.partenariat.id, amount: 1000, method: 'especes', paid_on: aujourdhui() })).body.data.payment;
    expect((await api().post(`/api/v1/paiements/${decl.id}/annuler`).set(rc.fournisseur.h).send({ reason: 'Inconnu' })).status).toBe(403);
    expect((await api().post(`/api/v1/paiements/${decl.id}/annuler`).set(rc.acheteur.h).send({ reason: 'Saisi deux fois' })).body.data.payment.status).toBe('annule');
    expect((await api().post(`/api/v1/paiements/${decl.id}/annuler`).set(rc.acheteur.h).send({ reason: 'Encore' })).status).toBe(409);
    expect((await api().post(`/api/v1/paiements/${decl.id}/preuve`).set(rc.acheteur.h).attach('fichier', pdfTest(), 'p.pdf')).body.error.code).toBe('PAIEMENT_CLOS');
    expect((await api().post(`/api/v1/paiements/${decl.id}/confirmer`).set(rc.fournisseur.h).send({})).status).toBe(409);
    // Un partenariat en attente n'accepte aucun paiement.
    const a = await nouvelleEntreprise({ type: 'acheteur' });
    const f = await nouvelleEntreprise({ type: 'fournisseur' });
    const enAttente = (await api().post('/api/v1/partenariats').set(a.h).send({ company_id: f.companyId, relation: 'fournisseur' })).body.data.partnership;
    expect((await api().post('/api/v1/paiements').set(f.h).send({ partnership_id: enAttente.id, amount: 10, method: 'especes', paid_on: aujourdhui() })).body.error.code).toBe('PARTENARIAT_INACTIF');
  });
});

describe('Documents — protections', () => {
  test('pièce probante non supprimable ; pièce d’une commande close conservée', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeEnvoyee(rc);
    await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});
    const livraison = await api().post(`/api/v1/ventes/${commande.id}/livrer`).set(rc.fournisseur.h).attach('fichier', pdfTest(), 'bl.pdf');
    expect(livraison.status).toBe(200);
    const [[bl]] = await sequelize.query("SELECT id FROM documents WHERE entity_id = :o AND category = 'bon_livraison'", { replacements: { o: commande.id } });
    expect((await api().delete(`/api/v1/documents/${bl.id}`).set(rc.fournisseur.h)).body.error.code).toBe('DOCUMENT_PROTEGE');

    const c2 = await commandeEnvoyee(rc);
    const pj = (await api().post(`/api/v1/achats/${c2.id}/pieces-jointes`).set(rc.acheteur.h).attach('fichier', pdfTest(), 'x.pdf')).body.data.document;
    await api().post(`/api/v1/achats/${c2.id}/annuler`).set(rc.acheteur.h).send({ reason: 'Erreur' });
    expect((await api().delete(`/api/v1/documents/${pj.id}`).set(rc.acheteur.h)).body.error.code).toBe('DOCUMENT_PROTEGE');
    expect((await api().post(`/api/v1/achats/${c2.id}/pieces-jointes`).set(rc.acheteur.h).attach('fichier', pdfTest(), 'y.pdf')).body.error.code).toBe('COMMANDE_CLOSE');
    expect((await api().get(`/api/v1/documents/${pj.id}/fichier?taille=miniature`).set(rc.fournisseur.h)).status).toBe(200);
  });
});

describe('Commandes — compléments', () => {
  test('commentaire impossible sur un brouillon ; versions sans le brouillon ; fournisseur ne commente pas via /achats', async () => {
    const rc = await relationCommerciale();
    const brouillon = (await api().post('/api/v1/achats').set(rc.acheteur.h).send({ supplier_id: rc.fournisseur.companyId, lines: [{ product_id: rc.produits[0].id, quantity: 1 }] })).body.data.order;
    expect((await api().post(`/api/v1/achats/${brouillon.id}/commentaires`).set(rc.acheteur.h).send({ message: 'Test' })).body.error.code).toBe('COMMANDE_NON_ENVOYEE');
    expect((await api().get(`/api/v1/achats/${brouillon.id}/versions`).set(rc.acheteur.h)).body.data.versions).toEqual([]);
    expect((await api().post(`/api/v1/achats/${brouillon.id}/annuler`).set(rc.acheteur.h).send({ reason: 'Abandon' })).body.data.order.status).toBe('annulee');
    // Le fournisseur n'est pas notifié de l'abandon d'un brouillon qu'il n'a jamais vu.
    expect(await compter('notifications', "user_id = :u AND type = 'commande_annulee'", { u: rc.fournisseur.user.id })).toBe(0);
    const c = await commandeEnvoyee(rc);
    expect((await api().post(`/api/v1/ventes/${c.id}/prendre-en-charge`).set(rc.fournisseur.h).send({})).status).toBe(200);
    expect((await api().post(`/api/v1/ventes/${c.id}/prendre-en-charge`).set(rc.fournisseur.h).send({})).status).toBe(409);
    const pdfVersion = await api().get(`/api/v1/achats/${c.id}/bon-de-commande.pdf?version=9`).set(rc.acheteur.h);
    expect(pdfVersion.status).toBe(404);
  });

  test('le fournisseur annule une commande validée qu’il ne peut plus honorer (client notifié)', async () => {
    const rc = await relationCommerciale();
    const c = await commandeEnvoyee(rc);
    await api().post(`/api/v1/ventes/${c.id}/accepter`).set(rc.fournisseur.h).send({});
    const res = await api().post(`/api/v1/ventes/${c.id}/annuler`).set(rc.fournisseur.h).send({ reason: 'Camion en panne' });
    expect(res.body.data.order).toMatchObject({ status: 'annulee', cancelled_by_side: 'fournisseur' });
    expect(await compter('notifications', "user_id = :u AND type = 'commande_annulee'", { u: rc.acheteur.user.id })).toBe(1);
  });
});

describe('Administration — forfaits', () => {
  test('détail et réactivation d’un forfait', async () => {
    const admin = await superAdmin();
    const code = `TEMP${Date.now() % 100000}`;
    const p = (await api().post('/api/v1/admin/plans').set(admin.h).send({ code, name: 'Temporaire', price: 1000, status: 'inactif' })).body.data.plan;
    expect((await api().get(`/api/v1/admin/plans/${p.id}`).set(admin.h)).body.data.plan).toMatchObject({ code, subscribers_count: 0 });
    expect((await api().post(`/api/v1/admin/plans/${p.id}/activer`).set(admin.h).send({})).body.data.plan.status).toBe('actif');
    expect((await api().post(`/api/v1/admin/plans/${p.id}/activer`).set(admin.h).send({})).body.error.code).toBe('STATUT_INCHANGE');
    expect((await api().post('/api/v1/admin/plans').set(admin.h).send({ code, name: 'Doublon', price: 1 })).body.error.code).toBe('CODE_UTILISE');
  });
});
