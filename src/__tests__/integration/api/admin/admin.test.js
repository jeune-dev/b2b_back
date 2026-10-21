'use strict';

const {
  api, superAdmin, nouvelleEntreprise, relationCommerciale, factureEmise, collaborateur, codeTotp, emailUnique, MOT_DE_PASSE,
  compter, fermer, sequelize,
} = require('../../../setup/helpers.js');

/**
 * § 5.4 — l'administrateur Pro2Link : entreprises, utilisateurs, abonnements,
 * suspension / réactivation, statistiques, paramètres.
 */

afterAll(fermer);

describe('Accès au back-office', () => {
  test('réservé au super admin, double authentification obligatoire', async () => {
    const e = await nouvelleEntreprise();
    const refus = await api().get('/api/v1/admin/dashboard').set(e.h);
    expect(refus.status).toBe(403);
    expect(refus.body.error.code).toBe('ROLE_INSUFFISANT');

    const sansMfa = await superAdmin({ mfa: false });
    const bloque = await api().get('/api/v1/admin/dashboard').set(sansMfa.h);
    expect(bloque.body.error.code).toBe('MFA_REQUISE');
    // Configuration de la double authentification puis accès.
    const init = await api().post('/api/v1/compte/mfa/initialiser').set(sansMfa.h).send({ current_password: MOT_DE_PASSE });
    expect(init.body.data.otpauth_url).toMatch(/^otpauth:\/\/totp\/Pro2Link/);
    const act = await api().post('/api/v1/compte/mfa/activer').set(sansMfa.h).send({ code: codeTotp(init.body.data.secret) });
    expect(act.body.data.codes_secours).toHaveLength(10);
    const ok = await api().get('/api/v1/admin/dashboard').set({ Authorization: `Bearer ${act.body.data.access_token}` });
    expect(ok.status).toBe(200);

    // Un super admin n'a pas d'espace entreprise.
    const admin = await superAdmin();
    expect((await api().get('/api/v1/achats').set(admin.h)).body.error.code).toBe('ESPACE_ENTREPRISE_REQUIS');
  });
});

describe('Entreprises', () => {
  test('tableau de bord et statistiques de la plateforme', async () => {
    const admin = await superAdmin();
    const rc = await relationCommerciale();
    await factureEmise(rc);
    await require('../../../../utils/cache.js').invalider('admin:*');
    const d = (await api().get('/api/v1/admin/dashboard').set(admin.h)).body.data.dashboard;
    expect(d.companies.total).toBeGreaterThanOrEqual(2);
    expect(d.orders.validated).toBeGreaterThanOrEqual(1);
    expect(d.invoices.count).toBeGreaterThanOrEqual(1);
    expect(d.subscriptions.by_status.essai).toBeGreaterThanOrEqual(2);
    const s = (await api().get('/api/v1/admin/statistiques').set(admin.h)).body.data.statistics;
    expect(s.signups.length).toBeGreaterThan(0);
    expect(s.orders.length).toBeGreaterThan(0);
  });

  test('liste filtrée, fiche (membres, abonnement, activité) sans données sensibles', async () => {
    const admin = await superAdmin();
    const nom = `Hôtel Teranga ${Date.now()}`;
    const e = await nouvelleEntreprise({ type: 'acheteur', company: { name: nom, sector: 'hotel', bank_details: 'IBAN SECRET' } });
    const liste = await api().get(`/api/v1/admin/entreprises?q=${encodeURIComponent(nom)}&type=acheteur&abonnement=essai`).set(admin.h);
    expect(liste.body.data.items).toHaveLength(1);
    expect(liste.body.data.items[0]).toMatchObject({ members_count: 1, subscription_status: 'essai', plan_code: 'BUSINESS' });
    expect(liste.body.data.items[0].bank_details).toBeUndefined();
    const fiche = (await api().get(`/api/v1/admin/entreprises/${e.companyId}`).set(admin.h)).body.data.company;
    expect(fiche.members[0].user.email).toBe(e.identifiants.email);
    expect(fiche.subscription.plan.code).toBe('BUSINESS');
    expect(fiche.bank_details).toBeUndefined();
    expect(JSON.stringify(fiche)).not.toContain('IBAN SECRET');
  });

  test('suspension : sessions fermées, accès refusé (ENTREPRISE_SUSPENDUE) ; réactivation notifiée', async () => {
    const admin = await superAdmin();
    const e = await nouvelleEntreprise();
    const membre = await collaborateur(e, 'comptable');
    const s = await api().post(`/api/v1/admin/entreprises/${e.companyId}/suspendre`).set(admin.h).send({ reason: 'Fraude suspectée' });
    expect(s.body.data.company.status).toBe('suspendu');
    // Jetons périmés : reconnexion, puis refus d'accès à l'espace.
    expect((await api().get('/api/v1/compte').set(membre.h)).status).toBe(401);
    const cnx = await api().post('/api/v1/auth/connexion').send({ identifiant: e.identifiants.email, password: MOT_DE_PASSE });
    const refus = await api().get('/api/v1/entreprise').set({ Authorization: `Bearer ${cnx.body.data.access_token}` });
    expect(refus.body.error.code).toBe('ENTREPRISE_SUSPENDUE');
    expect((await api().post(`/api/v1/admin/entreprises/${e.companyId}/suspendre`).set(admin.h).send({ reason: 'Encore' })).body.error.code).toBe('DEJA_SUSPENDU');

    await api().post(`/api/v1/admin/entreprises/${e.companyId}/reactiver`).set(admin.h).send({});
    expect((await api().get('/api/v1/entreprise').set({ Authorization: `Bearer ${cnx.body.data.access_token}` })).status).toBe(200);
    expect(await compter('notifications', "user_id = :u AND title = 'Entreprise réactivée'", { u: e.user.id })).toBe(1);
  });
});

describe('Utilisateurs', () => {
  test('liste, fiche avec appartenance, désactivation / activation, déverrouillage', async () => {
    const admin = await superAdmin();
    const e = await nouvelleEntreprise();
    const liste = await api().get(`/api/v1/admin/utilisateurs?q=${encodeURIComponent(e.identifiants.email)}`).set(admin.h);
    expect(liste.body.data.items).toHaveLength(1);
    expect(liste.body.data.items[0].password_hash).toBeUndefined();
    const fiche = (await api().get(`/api/v1/admin/utilisateurs/${e.user.id}`).set(admin.h)).body.data.user;
    expect(fiche.memberships[0]).toMatchObject({ company_id: e.companyId, role_code: 'administrateur' });

    await api().post(`/api/v1/admin/utilisateurs/${e.user.id}/desactiver`).set(admin.h).send({ reason: 'Demande du client' });
    const cnx = await api().post('/api/v1/auth/connexion').send({ identifiant: e.identifiants.email, password: MOT_DE_PASSE });
    expect(cnx.body.error.code).toBe('COMPTE_INACTIF');
    await api().post(`/api/v1/admin/utilisateurs/${e.user.id}/activer`).set(admin.h).send({});
    for (let i = 0; i < 5; i += 1) await api().post('/api/v1/auth/connexion').send({ identifiant: e.identifiants.email, password: 'Mauvais123' });
    const verrou = (await api().get(`/api/v1/admin/utilisateurs?verrouille=true&q=${encodeURIComponent(e.identifiants.email)}`).set(admin.h)).body.data.items;
    expect(verrou).toHaveLength(1);
    await api().post(`/api/v1/admin/utilisateurs/${e.user.id}/deverrouiller`).set(admin.h).send({});
    expect((await api().post('/api/v1/auth/connexion').send({ identifiant: e.identifiants.email, password: MOT_DE_PASSE })).status).toBe(200);
  });

  test('création d’un autre super admin (mot de passe de l’acteur, politique renforcée) et réinitialisation d’accès', async () => {
    const admin = await superAdmin();
    const email = emailUnique('admin2');
    const faible = await api().post('/api/v1/admin/utilisateurs').set(admin.h)
      .send({ first_name: 'A', last_name: 'B', email, password: 'Faible123', current_password: MOT_DE_PASSE });
    expect(faible.status).toBe(422);
    const res = await api().post('/api/v1/admin/utilisateurs').set(admin.h)
      .send({ first_name: 'Admin', last_name: 'Deux', email, password: 'Sup3r#Robuste!2026', current_password: MOT_DE_PASSE });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role_code: 'super_admin', must_change_password: true });
    const reinit = await api().post(`/api/v1/admin/utilisateurs/${res.body.data.user.id}/reinitialiser-acces`).set(admin.h)
      .send({ current_password: MOT_DE_PASSE, reason: 'Téléphone perdu' });
    expect(reinit.body.data.mot_de_passe_provisoire).toBeTruthy();
  });
});

describe('Forfaits, paramètres, diffusion, journal, rôles', () => {
  test('forfaits : création, modification, désactivation ; le forfait d’essai est protégé', async () => {
    const admin = await superAdmin();
    const code = `PROMO${Date.now() % 100000}`;
    const cree = await api().post('/api/v1/admin/plans').set(admin.h)
      .send({ code, name: 'Promo', price: 5000, max_users: 2, features: ['exports'] });
    expect(cree.status).toBe(201);
    const id = cree.body.data.plan.id;
    expect((await api().patch(`/api/v1/admin/plans/${id}`).set(admin.h).send({ price: 7500, max_orders_per_month: 50 })).body.data.plan).toMatchObject({ price: 7500, max_orders_per_month: 50 });
    expect((await api().post(`/api/v1/admin/plans/${id}/desactiver`).set(admin.h).send({})).body.data.plan.status).toBe('inactif');
    const publics = await api().get('/api/v1/abonnement/plans');
    expect(publics.body.data.plans.find((p) => p.code === code)).toBeUndefined();
    expect((await api().delete(`/api/v1/admin/plans/${id}`).set(admin.h)).status).toBe(200);

    const [[essai]] = await sequelize.query("SELECT id FROM subscription_plans WHERE code = 'BUSINESS'");
    expect((await api().post(`/api/v1/admin/plans/${essai.id}/desactiver`).set(admin.h).send({})).body.error.code).toBe('PLAN_ESSAI');
    expect((await api().get('/api/v1/admin/plans').set(admin.h)).body.data.plans.length).toBeGreaterThanOrEqual(3);
  });

  test('paramètres plateforme validés par clé ; diffusion ciblée ; journal d’audit ; rôles', async () => {
    const admin = await superAdmin();
    const params = await api().get('/api/v1/admin/parametres').set(admin.h);
    expect(params.body.data.settings.map((p) => p.key)).toEqual(['essai', 'invitation', 'otp', 'paiement']);
    expect((await api().put('/api/v1/admin/parametres/invitation').set(admin.h).send({ duree_jours: 99 })).status).toBe(422);
    expect((await api().put('/api/v1/admin/parametres/inconnu').set(admin.h).send({})).status).toBe(404);
    const ok = await api().put('/api/v1/admin/parametres/invitation').set(admin.h).send({ duree_jours: 10 });
    expect(ok.body.data.setting).toMatchObject({ value: { duree_jours: 10 }, customized: true });
    await api().put('/api/v1/admin/parametres/invitation').set(admin.h).send({ duree_jours: 7 });

    const fournisseur = await nouvelleEntreprise({ type: 'fournisseur' });
    const acheteur = await nouvelleEntreprise({ type: 'acheteur' });
    const diff = await api().post('/api/v1/admin/notifications').set(admin.h).send({ cible: 'fournisseurs', titre: 'Maintenance', corps: 'Le service sera interrompu dimanche de 2 h à 3 h.' });
    expect(diff.body.data.diffusion.destinataires).toBeGreaterThanOrEqual(1);
    expect(await compter('notifications', "user_id = :u AND title = 'Maintenance'", { u: fournisseur.user.id })).toBe(1);
    expect(await compter('notifications', "user_id = :u AND title = 'Maintenance'", { u: acheteur.user.id })).toBe(0);
    expect((await api().get('/api/v1/admin/notifications').set(admin.h)).body.data.items.length).toBeGreaterThanOrEqual(1);

    const journal = await api().get(`/api/v1/admin/journal-audit?company_id=${acheteur.companyId}&action=entreprise.`).set(admin.h);
    expect(journal.body.data.items.map((l) => l.action)).toContain('entreprise.creation');
    const roles = (await api().get('/api/v1/admin/roles').set(admin.h)).body.data;
    expect(roles.roles.map((r) => r.code)).toEqual(expect.arrayContaining(['administrateur', 'comptable', 'super_admin', 'utilisateur']));
  });

  test('journal d’audit en ajout seul : modification et suppression refusées par la base', async () => {
    const e = await nouvelleEntreprise();
    await expect(sequelize.query("UPDATE audit_logs SET action = 'falsifie' WHERE company_id = :c", { replacements: { c: e.companyId } })).rejects.toThrow();
    await expect(sequelize.query('DELETE FROM audit_logs WHERE company_id = :c', { replacements: { c: e.companyId } })).rejects.toThrow();
  });
});
