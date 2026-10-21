'use strict';

const {
  api, nouvelleEntreprise, superAdmin, relationCommerciale, creerProduit, collaborateur, expirerAbonnement, changerForfait,
  fermer, sequelize,
} = require('../../../setup/helpers.js');
const {
  PAYDUNYA_PLATEFORME, simulerFournisseurs, factureDe, ipn: ipnPaydunya, configurerPlateforme, retirerPlateforme, enFormulaire,
} = require('../../../setup/paydunyaSimule.js');
const AbonnementService = require('../../../../modules/abonnement/service/abonnement.service.js');
const { aujourdhui, ajouterMois } = require('../../../../utils/dates.js');

/**
 * § 25 Abonnement SaaS : création, choix d'un forfait, période d'essai,
 * renouvellement, changement de forfait, expiration, suspension.
 */

const ipn = (reference, montant, options = {}) => ipnPaydunya(reference, montant, options.statut || 'completed', { cles: PAYDUNYA_PLATEFORME, empreinteDe: options.empreinteDe });

async function abonnementCourant(companyId) {
  const [[ligne]] = await sequelize.query(
    `SELECT s.*, s.current_period_end::text AS fin, p.code AS plan_code FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.company_id = :companyId AND s.status IN ('essai', 'actif', 'suspendu')`,
    { replacements: { companyId } }
  );
  return ligne;
}

describe('Abonnements', () => {
  let fournisseurs;

  beforeAll(() => {
    configurerPlateforme();
    fournisseurs = simulerFournisseurs();
  });

  afterAll(async () => {
    fournisseurs.restaurer();
    retirerPlateforme();
    await fermer();
  });

  test('forfaits publics (sans authentification) et référentiels', async () => {
    const res = await api().get('/api/v1/abonnement/plans');
    expect(res.status).toBe(200);
    const codes = res.body.data.plans.map((p) => p.code);
    // Ordre d'affichage des forfaits livrés (d'autres tests peuvent en créer).
    expect(codes.filter((c) => ['ESSENTIEL', 'BUSINESS', 'ENTREPRISE'].includes(c))).toEqual(['ESSENTIEL', 'BUSINESS', 'ENTREPRISE']);
    const business = res.body.data.plans.find((p) => p.code === 'BUSINESS');
    expect(business).toMatchObject({ currency: 'XOF', limits: { max_users: 10 } });
    expect(business.features).toContainEqual({ code: 'statistiques', label: 'Statistiques' });

    const ref = await api().get('/api/v1/referentiels');
    expect(ref.headers['cache-control']).toBe('public, max-age=3600');
    expect(ref.body.data.enumerations.statut_commande).toContainEqual({ code: 'proposition_modifiee', label: 'Proposition modifiée' });
    expect(ref.body.data.enumerations.roles_entreprise.map((r) => r.code)).toEqual(
      ['administrateur', 'responsable_achats', 'responsable_commandes', 'comptable', 'receptionnaire', 'commercial']
    );
  });

  test('état et consommation des limites du forfait', async () => {
    const e = await nouvelleEntreprise({ type: 'fournisseur' });
    await creerProduit(e);
    const res = await api().get('/api/v1/abonnement').set(e.h);
    expect(res.body.data.abonnement).toMatchObject({ actif: true, abonnement: { status: 'essai' }, plan: { code: 'BUSINESS' } });
    expect(res.body.data.abonnement.usage).toMatchObject({ users: { used: 1, max: 10 }, products: { used: 1, max: 1000 } });
  });

  test('souscription PayDunya → IPN relue → abonnement ACTIF ; IPN rejouée sans effet ; montant faux refusé', async () => {
    const e = await nouvelleEntreprise();
    const sous = await api().post('/api/v1/abonnement/souscrire').set(e.h).set('Idempotency-Key', `abo-${Date.now()}`).send({ plan_code: 'ENTREPRISE', months: 2, wallet: 'wave' });
    expect(sous.status).toBe(201);
    expect(sous.body.data.checkout_url).toMatch(/paydunya/);
    const reference = sous.body.data.payment.reference;
    expect(factureDe(reference).channels).toEqual(['wave-senegal']);

    const corps = ipn(reference, 120000);
    const r1 = await api().post('/api/v1/webhooks/abonnement/paydunya').type('form').send(enFormulaire(corps));
    expect(r1.status).toBe(200);
    const abo = await abonnementCourant(e.companyId);
    expect(abo).toMatchObject({ status: 'actif', plan_code: 'ENTREPRISE', fin: ajouterMois(aujourdhui(), 2) });
    const r2 = await api().post('/api/v1/webhooks/abonnement/paydunya').type('form').send(enFormulaire(corps));
    expect(r2.status).toBe(200);
    expect((await abonnementCourant(e.companyId)).fin).toBe(ajouterMois(aujourdhui(), 2));

    const autre = await api().post('/api/v1/abonnement/souscrire').set(e.h).send({ plan_code: 'ENTREPRISE', months: 1 });
    const faux = await api().post('/api/v1/webhooks/abonnement/paydunya').type('form').send(enFormulaire(ipn(autre.body.data.payment.reference, 1000)));
    expect(faux.status).toBe(400);
    const forge = await api().post('/api/v1/webhooks/abonnement/paydunya').send(ipn(autre.body.data.payment.reference, 60000, { empreinteDe: 'cle-volee' }));
    expect(forge.status).toBe(400);
    const historique = await api().get('/api/v1/abonnement/paiements').set(e.h);
    expect(historique.body.data.items.map((p) => p.status)).toEqual(expect.arrayContaining(['confirme', 'echoue']));
  });

  test('PayDunya non configuré : 503 PAIEMENT_NON_CONFIGURE ; forfait inconnu : 422', async () => {
    const e = await nouvelleEntreprise();
    retirerPlateforme();
    const res = await api().post('/api/v1/abonnement/souscrire').set(e.h).send({ plan_code: 'BUSINESS', months: 1 });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PAIEMENT_NON_CONFIGURE');
    configurerPlateforme();
    expect((await api().post('/api/v1/abonnement/souscrire').set(e.h).send({ plan_code: 'INCONNU', months: 1 })).status).toBe(422);
  });

  test('abonnement échu : LECTURE SEULE (402 sur toute écriture), consultation et souscription possibles ; tâche d’expiration', async () => {
    const rc = await relationCommerciale();
    await expirerAbonnement(rc.acheteur.companyId);
    const ecriture = await api().post('/api/v1/achats').set(rc.acheteur.h).send({ supplier_id: rc.fournisseur.companyId, lines: [{ product_id: rc.produits[0].id, quantity: 1 }] });
    expect(ecriture.status).toBe(402);
    expect(ecriture.body.error.code).toBe('ABONNEMENT_REQUIS');
    expect((await api().get('/api/v1/achats').set(rc.acheteur.h)).status).toBe(200);
    expect((await api().get('/api/v1/situation/dettes').set(rc.acheteur.h)).status).toBe(200);
    expect((await api().post('/api/v1/abonnement/souscrire').set(rc.acheteur.h).send({ plan_code: 'BUSINESS', months: 1 })).status).toBe(201);

    const nombre = await AbonnementService.expirerAbonnements();
    expect(nombre).toBeGreaterThanOrEqual(1);
    const [[s]] = await sequelize.query('SELECT status FROM subscriptions WHERE company_id = :c ORDER BY created_at DESC LIMIT 1', { replacements: { c: rc.acheteur.companyId } });
    expect(s.status).toBe('expire');
  });

  test('limites et fonctionnalités du forfait : utilisateurs, statistiques, modèles (ESSENTIEL)', async () => {
    const e = await nouvelleEntreprise({ type: 'mixte' });
    await changerForfait(e.companyId, 'ESSENTIEL');
    await collaborateur(e, 'comptable');
    await collaborateur(e, 'commercial');
    const trop = await api().post('/api/v1/utilisateurs/invitations').set(e.h).send({ email: `x${Date.now()}@test.sn`, first_name: 'A', last_name: 'B', role_code: 'commercial' });
    expect(trop.status).toBe(403);
    expect(trop.body.error).toMatchObject({ code: 'LIMITE_ABONNEMENT', details: { ressource: 'users', max: 3 } });
    const stats = await api().get('/api/v1/statistiques/achats').set(e.h);
    expect(stats.status).toBe(403);
    expect(stats.body.error.code).toBe('FONCTIONNALITE_NON_INCLUSE');
    expect((await api().get('/api/v1/modeles-documents').set(e.h)).body.error.code).toBe('FONCTIONNALITE_NON_INCLUSE');
  });

  test('activation manuelle par le Super Admin (paiement hors ligne) ; suspension → lecture seule', async () => {
    const admin = await superAdmin();
    const e = await nouvelleEntreprise();
    const act = await api().post(`/api/v1/admin/entreprises/${e.companyId}/abonnement/activer`).set(admin.h)
      .send({ plan_code: 'ESSENTIEL', months: 3, note: 'Virement reçu', amount: 25000 });
    expect(act.status).toBe(201);
    expect(act.body.data.payment).toMatchObject({ provider: 'manuel', status: 'confirme', amount: 25000 });
    const abo = await abonnementCourant(e.companyId);
    expect(abo).toMatchObject({ status: 'actif', plan_code: 'ESSENTIEL' });

    const susp = await api().post(`/api/v1/admin/abonnements/${abo.id}/suspendre`).set(admin.h).send({ reason: 'Litige de paiement' });
    expect(susp.body.data.subscription.status).toBe('suspendu');
    expect((await api().patch('/api/v1/entreprise').set(e.h).send({ city: 'Saint-Louis' })).status).toBe(402);
    const react = await api().post(`/api/v1/admin/abonnements/${abo.id}/reactiver`).set(admin.h).send({});
    expect(react.body.data.subscription.status).toBe('actif');
    expect((await api().patch('/api/v1/entreprise').set(e.h).send({ city: 'Saint-Louis' })).status).toBe(200);
    const annul = await api().post(`/api/v1/admin/abonnements/${abo.id}/annuler`).set(admin.h).send({ reason: 'Fermeture' });
    expect(annul.body.data.subscription.status).toBe('annule');
    const liste = await api().get(`/api/v1/admin/abonnements?company_id=${e.companyId}`).set(admin.h);
    expect(liste.body.data.items).toHaveLength(1);
    expect((await api().get(`/api/v1/admin/abonnements/${abo.id}`).set(admin.h)).body.data.subscription.payments).toHaveLength(1);
    expect((await api().get('/api/v1/admin/paiements-abonnements?provider=manuel').set(admin.h)).status).toBe(200);
  });
});
