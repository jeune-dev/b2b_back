'use strict';

const {
  api, nouvelleEntreprise, collaborateur, emailUnique, telephoneUnique, nineaUnique, MOT_DE_PASSE, pdfTest, compter, fermer,
} = require('../setup/helpers.js');
const { aujourdhui } = require('../../utils/dates.js');

/**
 * § 28 — PARCOURS GLOBAL de Pro2Link, de bout en bout, comme le feraient le
 * web et le mobile :
 *
 *   Acheteur : sélectionne un fournisseur → consulte les produits → choisit
 *   produits et quantités → bon de commande généré → envoi → attente.
 *   Fournisseur : reçoit → vérifie → modifie → proposition envoyée.
 *   Acheteur : reçoit la proposition → accepte → commande validée.
 *   Fournisseur : prépare → met à jour le statut → livre.
 *   Acheteur : réceptionne → confirme la réception.
 *   Fournisseur : génère la facture → l'acheteur la reçoit → le paiement est
 *   enregistré → le solde dû est mis à jour.
 *
 * § 29 — à la fin, chaque entreprise sait : ce qu'elle a commandé, ce qui est
 * en cours, ce qu'elle a reçu, ce qu'elle doit, ce qu'elle a payé, avec qui
 * elle travaille.
 */

afterAll(fermer);

test('§ 28 — du fournisseur trouvé dans l’annuaire jusqu’au solde à zéro', async () => {
  // ── Mise en place : deux entreprises, l'une invite l'autre ────────────────
  const restaurant = await nouvelleEntreprise({ type: 'acheteur', company: { name: 'Restaurant Chez Fatou', sector: 'restaurant' } });
  const emailGrossiste = emailUnique('grossiste');
  const invitation = await api().post('/api/v1/partenariats/invitations').set(restaurant.h)
    .send({ email: emailGrossiste, relation: 'fournisseur', company_name: 'Grossiste du Port' });
  const inscription = await api().post('/api/v1/auth/inscription').send({
    first_name: 'Ousmane', last_name: 'Fall', email: emailGrossiste, phone: telephoneUnique(), password: MOT_DE_PASSE, password_confirmation: MOT_DE_PASSE,
    company: { name: 'Grossiste du Port', type: 'fournisseur', ninea: nineaUnique(), vat_registered: true, bank_details: 'Wave 77 000 00 00' },
    invitation_token: invitation.body.data.token, platform: 'android',
  });
  expect(inscription.status).toBe(201);
  const grossiste = { h: { Authorization: `Bearer ${inscription.body.data.access_token}` }, companyId: inscription.body.data.company.id };
  const partnershipId = inscription.body.data.partnerships_created[0].partnership_id;
  // Le fournisseur travaille sur mobile, avec un commercial.
  const commercial = await collaborateur(grossiste, 'commercial');

  // Catalogue (§ 8).
  const huile = (await api().post('/api/v1/produits').set(commercial.h).send({ reference: 'HUILE-20L', name: 'Huile 20 L', unit: 'piece', packaging: 'Bidon de 20 L', price: 24000, tax_rate: 18 })).body.data.product;
  const oignon = (await api().post('/api/v1/produits').set(commercial.h).send({ reference: 'OIGNON', name: 'Oignons', unit: 'kg', price: 450, tax_rate: 0 })).body.data.product;
  const ail = (await api().post('/api/v1/produits').set(commercial.h).send({ reference: 'AIL', name: 'Ail', unit: 'kg', price: 1800, tax_rate: 0 })).body.data.product;

  // ── Acheteur : consulte, sélectionne, génère le bon, l'envoie (§ 9) ───────
  const catalogue = await api().get(`/api/v1/catalogues/${grossiste.companyId}/produits`).set(restaurant.h);
  expect(catalogue.body.data.items.map((p) => p.reference).sort()).toEqual(['AIL', 'HUILE-20L', 'OIGNON']);
  const bon = (await api().post('/api/v1/achats').set(restaurant.h).send({
    supplier_id: grossiste.companyId,
    lines: [{ product_id: huile.id, quantity: 3 }, { product_id: oignon.id, quantity: 50 }, { product_id: ail.id, quantity: 5 }],
    delivery_address: 'Restaurant Chez Fatou, Plateau', requested_delivery_date: aujourdhui(),
  })).body.data.order;
  await api().post(`/api/v1/achats/${bon.id}/envoyer`).set(restaurant.h).send({ revision: bon.revision });

  // ── Fournisseur : reçoit, vérifie, modifie (§ 10) ─────────────────────────
  const recue = (await api().get('/api/v1/ventes?a_traiter=true').set(commercial.h)).body.data.items.find((o) => o.id === bon.id);
  expect(recue.status).toBe('envoyee');
  await api().post(`/api/v1/ventes/${bon.id}/prendre-en-charge`).set(commercial.h).send({});
  const proposition = await api().post(`/api/v1/ventes/${bon.id}/proposer`).set(commercial.h).send({
    comment: 'Plus d’ail cette semaine, 40 kg d’oignons seulement',
    lines: [{ line_no: 2, quantity: 40 }, { line_no: 3, unavailable: true }],
  });
  expect(proposition.body.data.order.status).toBe('proposition_modifiee');

  // ── Acheteur : reçoit la proposition, l'accepte → validée (§ 11) ──────────
  expect(await compter('notifications', "user_id = :u AND type = 'produit_indisponible'", { u: restaurant.user.id })).toBe(1);
  const validee = (await api().post(`/api/v1/achats/${bon.id}/accepter-proposition`).set(restaurant.h).send({})).body.data.order;
  expect(validee).toMatchObject({ status: 'validee', validated_version_no: 2 });
  // 3 × 24 000 × 1,18 + 40 × 450 = 84 960 + 18 000.
  expect(validee.total).toBe(102960);

  // ── Fournisseur : prépare, met à jour, livre (§ 12, § 13) ────────────────
  await api().post(`/api/v1/ventes/${bon.id}/statut`).set(commercial.h).send({ status: 'en_preparation' });
  await api().post(`/api/v1/ventes/${bon.id}/statut`).set(commercial.h).send({ status: 'prete' });
  await api().post(`/api/v1/ventes/${bon.id}/livrer`).set(commercial.h).field('note', 'Livré à 9 h').attach('fichier', pdfTest(), 'bl.pdf');

  // ── Acheteur : réceptionne, confirme (§ 13) ──────────────────────────────
  const recep = await api().post(`/api/v1/achats/${bon.id}/confirmer-reception`).set(restaurant.h).send({ note: 'Conforme' });
  expect(recep.body.data.order).toMatchObject({ status: 'reception_confirmee', reception_with_reserves: false });

  // ── Fournisseur : facture ; l'acheteur la reçoit (§ 14) ──────────────────
  const facture = (await api().post('/api/v1/factures').set(grossiste.h).send({ order_id: bon.id })).body.data.invoice;
  expect(facture).toMatchObject({ total: 102960, status: 'emise' });
  expect((await api().get('/api/v1/factures?sens=recues').set(restaurant.h)).body.data.items[0].id).toBe(facture.id);

  // ── Paiement : déclaré par l'acheteur, confirmé par le fournisseur (§ 16) ─
  const decl = (await api().post('/api/v1/paiements').set(restaurant.h).send({
    partnership_id: partnershipId, amount: 102960, method: 'wave', paid_on: aujourdhui(), external_reference: 'WAVE-TX-778899',
  })).body.data.payment;
  await api().post(`/api/v1/paiements/${decl.id}/confirmer`).set(grossiste.h).send({});

  // ── § 29 — chaque entreprise sait où elle en est ─────────────────────────
  const commande = (await api().get(`/api/v1/achats/${bon.id}`).set(restaurant.h)).body.data.order;
  expect(commande.status).toBe('terminee');
  const dettes = (await api().get('/api/v1/situation/dettes').set(restaurant.h)).body.data.payables.totals;
  const creances = (await api().get('/api/v1/situation/creances').set(grossiste.h)).body.data.receivables.totals;
  expect(dettes).toMatchObject({ invoiced: 102960, paid: 102960, balance: 0 });
  expect(creances).toMatchObject({ invoiced: 102960, paid: 102960, balance: 0 });
  const historique = (await api().get(`/api/v1/achats/${bon.id}/historique`).set(restaurant.h)).body.data.events.map((e) => e.type);
  expect(historique).toEqual([
    'creation', 'envoi', 'prise_en_charge', 'proposition', 'acceptation_proposition', 'validation',
    'changement_statut', 'changement_statut', 'livraison', 'reception', 'facturation', 'paiement', 'cloture',
  ]);
  const tableau = (await api().get('/api/v1/tableau-de-bord').set(restaurant.h)).body.data.dashboard;
  expect(tableau.buyer).toMatchObject({ suppliers: 1, amount_due: 0 });
  expect(tableau.buyer.orders.in_progress).toBe(0);
});
