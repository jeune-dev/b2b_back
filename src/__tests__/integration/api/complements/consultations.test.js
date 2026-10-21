'use strict';

const {
  api, relationCommerciale, commandeEnvoyee, collaborateur, fermer,
} = require('../../../setup/helpers.js');

/**
 * Consultations en cas nominal : fiche d'un collaborateur, fiche produit du
 * catalogue d'un fournisseur, échanges sur une commande (§ 20) vus des deux
 * côtés, versions et historique côté fournisseur, détail d'un modèle.
 */

afterAll(fermer);

describe('Consultations — cas nominaux', () => {
  test('fiche d’un collaborateur : rôle et utilisateur ; autre entreprise : jamais ses données', async () => {
    const rc = await relationCommerciale();
    const recep = await collaborateur(rc.acheteur, 'receptionnaire');
    const membre = (await api().get('/api/v1/utilisateurs').set(rc.acheteur.h)).body.data.items.find((m) => m.user.id === recep.user.id);
    const fiche = await api().get(`/api/v1/utilisateurs/${membre.id}`).set(rc.acheteur.h);
    expect(fiche.status).toBe(200);
    expect(fiche.body.data.member).toMatchObject({ id: membre.id, role_code: 'receptionnaire' });
    expect([403, 404]).toContain((await api().get(`/api/v1/utilisateurs/${membre.id}`).set(rc.fournisseur.h)).status);
  });

  test('fiche produit du catalogue d’un fournisseur partenaire', async () => {
    const rc = await relationCommerciale();
    const [p1] = rc.produits;
    const res = await api().get(`/api/v1/catalogues/${rc.fournisseur.companyId}/produits/${p1.id}`).set(rc.acheteur.h);
    expect(res.status).toBe(200);
    expect(res.body.data.product).toMatchObject({ id: p1.id, reference: p1.reference, price: 15000 });
  });

  test('échange sur une commande : message de l’acheteur, versions et historique côté fournisseur', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeEnvoyee(rc);
    const msg = await api().post(`/api/v1/achats/${commande.id}/commentaires`).set(rc.acheteur.h).send({ message: 'Livraison avant 10 h svp' });
    expect(msg.status).toBe(201);
    expect(msg.body.data.event).toMatchObject({ order_id: commande.id });
    expect((await api().post(`/api/v1/achats/${commande.id}/commentaires`).set(rc.acheteur.h).send({ message: '' })).status).toBe(422);

    const versions = await api().get(`/api/v1/ventes/${commande.id}/versions`).set(rc.fournisseur.h);
    expect(versions.status).toBe(200);
    expect(versions.body.data.versions.length).toBeGreaterThanOrEqual(1);
    const historique = await api().get(`/api/v1/ventes/${commande.id}/historique`).set(rc.fournisseur.h);
    expect(historique.status).toBe(200);
    expect(JSON.stringify(historique.body.data.events)).toContain('Livraison avant 10 h svp');
  });

  test('détail d’un modèle de document', async () => {
    const rc = await relationCommerciale();
    const cree = await api().post('/api/v1/modeles-documents').set(rc.acheteur.h).send({ type: 'facture', accent_color: '#004488' });
    expect(cree.status).toBe(201);
    const res = await api().get(`/api/v1/modeles-documents/${cree.body.data.template.id}`).set(rc.acheteur.h);
    expect(res.status).toBe(200);
    expect(res.body.data.template).toMatchObject({ id: cree.body.data.template.id, type: 'facture' });
  });
});
