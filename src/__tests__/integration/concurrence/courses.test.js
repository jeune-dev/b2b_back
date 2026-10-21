'use strict';

const crypto = require('crypto');
const {
  api, relationCommerciale, commandeEnvoyee, commandeReceptionnee, factureEmise, nouvelleEntreprise, compter, fermer,
} = require('../../setup/helpers.js');
const { aujourdhui } = require('../../../utils/dates.js');

/**
 * Courses critiques (web et mobile agissant en même temps, double clic,
 * renvoi après coupure réseau — § 23) : verrous de ligne, index uniques et
 * idempotence garantissent qu'une action n'a lieu qu'une fois.
 */

afterAll(fermer);

test('acceptation et refus simultanés d’une même commande : une seule action l’emporte', async () => {
  const rc = await relationCommerciale();
  const commande = await commandeEnvoyee(rc);
  const [a, b] = await Promise.all([
    api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({}),
    api().post(`/api/v1/ventes/${commande.id}/refuser`).set(rc.fournisseur.h).send({ reason: 'Rupture' }),
  ]);
  expect([a.status, b.status].sort()).toEqual([200, 409]);
  expect(await compter('order_events', "order_id = :o AND type IN ('acceptation', 'refus')", { o: commande.id })).toBe(1);
});

test('deux factures simultanées pour la même commande : une seule est émise', async () => {
  const rc = await relationCommerciale();
  const commande = await commandeReceptionnee(rc);
  const reponses = await Promise.all([1, 2, 3].map(() => api().post('/api/v1/factures').set(rc.fournisseur.h).send({ order_id: commande.id })));
  expect(reponses.filter((r) => r.status === 201)).toHaveLength(1);
  expect(await compter('invoices', "order_id = :o AND status <> 'annulee'", { o: commande.id })).toBe(1);
});

test('même paiement renvoyé avec la même Idempotency-Key : un seul paiement, réponse rejouée', async () => {
  const rc = await relationCommerciale();
  await factureEmise(rc);
  const cle = crypto.randomUUID();
  const corps = { partnership_id: rc.partenariat.id, amount: 1000, method: 'especes', paid_on: aujourdhui() };
  const r1 = await api().post('/api/v1/paiements').set(rc.fournisseur.h).set('Idempotency-Key', cle).send(corps);
  const r2 = await api().post('/api/v1/paiements').set(rc.fournisseur.h).set('Idempotency-Key', cle).send(corps);
  expect(r1.status).toBe(201);
  expect(r2.status).toBe(201);
  expect(r2.headers['idempotent-replayed']).toBe('true');
  expect(r2.body.data.payment.id).toBe(r1.body.data.payment.id);
  expect(await compter('payments', 'partnership_id = :p', { p: rc.partenariat.id })).toBe(1);
  const autre = await api().post('/api/v1/paiements').set(rc.fournisseur.h).set('Idempotency-Key', cle).send({ ...corps, amount: 2000 });
  expect(autre.body.error.code).toBe('IDEMPOTENCE_REUTILISEE');
});

test('paiements simultanés sur une même facture : jamais plus que le total', async () => {
  const rc = await relationCommerciale();
  const f = await factureEmise(rc);
  const moitie = Math.ceil(f.total * 0.6);
  const reponses = await Promise.all([1, 2].map(() => api().post('/api/v1/paiements').set(rc.fournisseur.h)
    .send({ partnership_id: rc.partenariat.id, amount: moitie, method: 'especes', paid_on: aujourdhui(), allocations: [{ invoice_id: f.id, amount: moitie }] })));
  const reussis = reponses.filter((r) => r.status === 201);
  expect(reussis).toHaveLength(1);
  const facture = (await api().get(`/api/v1/factures/${f.id}`).set(rc.fournisseur.h)).body.data.invoice;
  expect(facture.amount_paid).toBeLessThanOrEqual(f.total);
});

test('numérotation sans doublon : bons de commande créés en parallèle', async () => {
  const rc = await relationCommerciale();
  const reponses = await Promise.all([1, 2, 3, 4, 5].map(() => api().post('/api/v1/achats').set(rc.acheteur.h)
    .send({ supplier_id: rc.fournisseur.companyId, lines: [{ product_id: rc.produits[0].id, quantity: 1 }] })));
  const numeros = reponses.map((r) => r.body.data.order.number);
  expect(new Set(numeros).size).toBe(5);
});

test('demandes de partenariat croisées simultanées : une seule relation', async () => {
  const a = await nouvelleEntreprise({ type: 'mixte' });
  const b = await nouvelleEntreprise({ type: 'mixte' });
  await Promise.all([
    api().post('/api/v1/partenariats').set(a.h).send({ company_id: b.companyId, relation: 'fournisseur' }),
    api().post('/api/v1/partenariats').set(b.h).send({ company_id: a.companyId, relation: 'client' }),
  ]);
  expect(await compter('partnerships', 'buyer_company_id = :a AND supplier_company_id = :b', { a: a.companyId, b: b.companyId })).toBe(1);
});
