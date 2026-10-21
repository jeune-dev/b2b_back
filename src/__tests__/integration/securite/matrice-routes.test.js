'use strict';

// Chargé AVANT l'application : lister-routes instrumente Express pour
// connaître les chemins de montage des routeurs.
const { listerRoutes } = require('../../../../scripts/lister-routes.js');
const { api, apiBrute, nouvelleEntreprise, superAdmin, relationCommerciale, fermer } = require('../../setup/helpers.js');

/**
 * Matrices de sécurité sur TOUTES les routes de l'API (§ 24 « sécurisation
 * des API ») : aucune route privée n'est joignable sans jeton, aucune route
 * d'administration n'est ouverte à une entreprise, aucune route d'entreprise
 * à un super admin, et un identifiant malformé n'atteint jamais la base.
 */

afterAll(fermer);

const PUBLIQUES = [
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/referentiels/,
  /^\/api\/v1\/abonnement\/plans/,
  /^\/api\/v1\/webhooks\//,
  /^\/api\/v1\/evenements\/flux/,
];

const routes = listerRoutes().filter((r) => r.chemin.startsWith('/api/v1/'));
const concret = (chemin) => chemin
  .replace(/:type\.csv/, 'commandes.csv')
  .replace(/:cle/, 'essai')
  .replace(/:[A-Za-z]+/g, '3f1b8a1e-6c2a-4b8e-9f00-000000000000')
  .replace(/\/$/, '');
const appeler = (agent, r) => agent[r.methode.toLowerCase()](concret(r.chemin));

describe('Matrice d’authentification', () => {
  test.each(routes.filter((r) => !PUBLIQUES.some((p) => p.test(r.chemin))).map((r) => [r.methode, r.chemin, r]))(
    '%s %s sans jeton → 401', async (methode, chemin, r) => {
      const res = await appeler(apiBrute(), r).send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toMatch(/^TOKEN_/);
    }
  );
});

describe('Matrice des espaces', () => {
  let entreprise;
  let admin;
  beforeAll(async () => {
    entreprise = await nouvelleEntreprise({ type: 'mixte' });
    admin = await superAdmin();
  });

  test.each(routes.filter((r) => r.chemin.startsWith('/api/v1/admin/')).map((r) => [r.methode, r.chemin, r]))(
    '%s %s refusé à une entreprise (403)', async (methode, chemin, r) => {
      const res = await appeler(api(), r).set(entreprise.h).send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ROLE_INSUFFISANT');
    }
  );

  const ESPACE = /^\/api\/v1\/(tableau-de-bord|entreprise|utilisateurs|annuaire|partenariats|produits|categories-produits|catalogues|listes-prix|listes-achat|achats|ventes|factures|avoirs|litiges|paiements|situation|statistiques|modeles-documents|documents|abonnement\/?$|abonnement\/(paiements|souscrire))/;
  test.each(routes.filter((r) => ESPACE.test(r.chemin)).map((r) => [r.methode, r.chemin, r]))(
    '%s %s refusé au super admin (403 ESPACE_ENTREPRISE_REQUIS)', async (methode, chemin, r) => {
      const res = await appeler(api(), r).set(admin.h).send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ESPACE_ENTREPRISE_REQUIS');
    }
  );
});

describe('Identifiants malformés et injections', () => {
  test('un :id non UUID est refusé à la validation (422) sur toutes les routes de l’espace entreprise', async () => {
    const e = await nouvelleEntreprise({ type: 'mixte' });
    const avecId = routes.filter((r) => /\/:id(\/|$)/.test(r.chemin) && !r.chemin.startsWith('/api/v1/admin') && !r.chemin.includes(':supplierId'));
    for (const r of avecId) {
      const url = r.chemin.replace(':id', "1'%20OR%201=1--").replace(/\/$/, '');
      const res = await api()[r.methode.toLowerCase()](url).set(e.h).send({});
      expect([404, 422]).toContain(res.status);
    }
  });

  test('tri et recherche : liste blanche de colonnes, jokers LIKE neutralisés', async () => {
    const rc = await relationCommerciale();
    expect((await api().get('/api/v1/achats?tri=password_hash').set(rc.acheteur.h)).status).toBe(422);
    expect((await api().get('/api/v1/produits?tri=-price;DROP TABLE users').set(rc.fournisseur.h)).status).toBe(422);
    const joker = await api().get('/api/v1/produits?q=%25').set(rc.fournisseur.h);
    expect(joker.body.data.items).toHaveLength(0);
    expect((await api().get('/api/v1/achats?limit=0').set(rc.acheteur.h)).status).toBe(422);
    const plafond = await api().get('/api/v1/achats?limit=100000').set(rc.acheteur.h);
    expect(plafond.body.data.pagination.limit).toBe(100);
  });

  test('affectation de masse ignorée : company_id, status, montants imposés par le client', async () => {
    const rc = await relationCommerciale();
    const res = await api().post('/api/v1/achats').set(rc.acheteur.h).send({
      supplier_id: rc.fournisseur.companyId, lines: [{ product_id: rc.produits[0].id, quantity: 1, unit_price: 1 }],
      status: 'validee', total: 1, buyer_company_id: rc.fournisseur.companyId,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order).toMatchObject({ status: 'brouillon', buyer_company_id: rc.acheteur.companyId, total: 17700 });
  });
});

describe('Sondes et en-têtes', () => {
  test('/health/live, /health/ready, 404 normalisé, en-têtes de sécurité, X-Request-Id', async () => {
    const live = await apiBrute().get('/health/live');
    expect(live.status).toBe(200);
    const ready = await apiBrute().get('/health/ready');
    expect(ready.body.db).toBe('connected');
    const absent = await apiBrute().get('/api/v1/nexiste-pas');
    expect(absent.status).toBe(404);
    expect(absent.body.error.code).toBe('ROUTE_INTROUVABLE');
    expect(absent.headers['x-request-id']).toBeTruthy();
    expect(absent.headers['content-security-policy']).toContain("default-src 'none'");
    expect(absent.headers['x-powered-by']).toBeUndefined();
    const metrics = await apiBrute().get('/metrics');
    expect(metrics.status).toBe(404);
    const json = await apiBrute().post('/api/v1/auth/connexion').set('Content-Type', 'application/json').send('{"identifiant":');
    expect(json.body.error.code).toBe('JSON_INVALIDE');
  });
});
