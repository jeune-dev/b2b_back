'use strict';

const {
  api, nouvelleEntreprise, collaborateur, relationCommerciale, commandeEnvoyee, emailUnique, telephoneUnique, nineaUnique,
  MOT_DE_PASSE, compter, pngTest, fermer, sequelize,
} = require('../../../setup/helpers.js');

/**
 * § 26 « création du compte, création de l'entreprise » ; § 5.3 utilisateurs
 * internes et rôles ; § 6 informations de l'entreprise ; § 24 sécurité.
 */

afterAll(fermer);

const corps = (surcharges = {}) => ({
  first_name: 'Fatou', last_name: 'Ba', email: emailUnique('inscr'), phone: telephoneUnique(),
  password: MOT_DE_PASSE, password_confirmation: MOT_DE_PASSE,
  company: { name: 'Boutique Sandaga', type: 'acheteur', ninea: nineaUnique() },
  ...surcharges,
});

describe('§ 26 — inscription : compte + entreprise + essai', () => {
  test('crée le compte, l’entreprise, l’administrateur et l’abonnement d’essai ; le mobile reçoit le refresh token', async () => {
    const res = await api().post('/api/v1/auth/inscription').send(corps());
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ role: 'utilisateur', first_name: 'Fatou' });
    expect(res.body.data.refresh_token).toBeTruthy();
    expect(res.body.data.company).toMatchObject({ name: 'Boutique Sandaga', type: 'acheteur' });
    const companyId = res.body.data.company.id;
    expect(await compter('company_members', "company_id = :c AND role_code = 'administrateur'", { c: companyId })).toBe(1);
    expect(await compter('subscriptions', "company_id = :c AND status = 'essai'", { c: companyId })).toBe(1);
    expect(await compter('audit_logs', "action = 'entreprise.creation' AND company_id = :c", { c: companyId })).toBe(1);

    const profil = await api().get('/api/v1/compte').set({ Authorization: `Bearer ${res.body.data.access_token}` });
    expect(profil.body.data.member).toMatchObject({ role: 'administrateur', role_label: 'Administrateur' });
    expect(profil.body.data.permissions).toEqual(expect.arrayContaining(['achats.gerer', 'utilisateurs.gerer']));
    expect(profil.body.data.abonnement).toMatchObject({ actif: true, plan: { code: 'BUSINESS' } });
  });

  test('client web (en-tête Origin) : refresh token en cookie httpOnly, jamais dans le corps', async () => {
    const res = await api().post('/api/v1/auth/inscription').set('Origin', 'http://localhost:5173').send(corps());
    expect(res.status).toBe(201);
    expect(res.body.data.refresh_token).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toMatch(/refresh_token=.*HttpOnly/i);
  });

  test('doublons refusés : e-mail, téléphone, NINEA ; validations (422)', async () => {
    const premier = corps();
    await api().post('/api/v1/auth/inscription').send(premier);
    const memeEmail = await api().post('/api/v1/auth/inscription').send(corps({ email: premier.email }));
    expect(memeEmail.status).toBe(409);
    expect(memeEmail.body.error.code).toBe('COMPTE_EXISTANT');
    const memeNinea = await api().post('/api/v1/auth/inscription').send(corps({ company: { name: 'Distribution Ndiaye', type: 'fournisseur', ninea: premier.company.ninea } }));
    expect(memeNinea.body.error.code).toBe('NINEA_UTILISE');
    for (const invalide of [
      corps({ password_confirmation: 'Autre1234' }),
      corps({ password: 'faible', password_confirmation: 'faible' }),
      corps({ company: { name: 'Sans type' } }),
      corps({ company: { name: 'X', type: 'grossiste' } }),
      corps({ email: 'pas-un-email' }),
    ]) {
      expect((await api().post('/api/v1/auth/inscription').send(invalide)).status).toBe(422);
    }
  });

  test('connexion par e-mail ou téléphone, rafraîchissement avec rotation, déconnexion', async () => {
    const e = await nouvelleEntreprise();
    const parTel = await api().post('/api/v1/auth/connexion').send({ identifiant: e.identifiants.phone, password: MOT_DE_PASSE });
    expect(parTel.status).toBe(200);
    const faux = await api().post('/api/v1/auth/connexion').send({ identifiant: e.identifiants.email, password: 'Mauvais123' });
    expect(faux.status).toBe(401);
    expect(faux.body.error.code).toBe('IDENTIFIANTS_INVALIDES');
    const inconnu = await api().post('/api/v1/auth/connexion').send({ identifiant: 'personne@nulle.part', password: 'Mauvais123' });
    expect(inconnu.body.error.code).toBe('IDENTIFIANTS_INVALIDES');

    const r1 = await api().post('/api/v1/auth/refresh').send({ refresh_token: e.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.data.refresh_token).not.toBe(e.refreshToken);
    const deco = await api().post('/api/v1/auth/deconnexion').send({ refresh_token: r1.body.data.refresh_token });
    expect(deco.status).toBe(200);
    expect((await api().post('/api/v1/auth/refresh').send({ refresh_token: r1.body.data.refresh_token })).status).toBe(401);
  });

  test('verrouillage après 5 échecs, mot de passe oublié neutre et réinitialisation par code', async () => {
    const e = await nouvelleEntreprise();
    for (let i = 0; i < 5; i += 1) await api().post('/api/v1/auth/connexion').send({ identifiant: e.identifiants.email, password: 'Mauvais123' });
    const bloque = await api().post('/api/v1/auth/connexion').send({ identifiant: e.identifiants.email, password: MOT_DE_PASSE });
    expect(bloque.status).toBe(401);

    const neutre = await api().post('/api/v1/auth/mot-de-passe-oublie').send({ identifiant: 'inconnu@nulle.part' });
    expect(neutre.status).toBe(200);
    await api().post('/api/v1/auth/mot-de-passe-oublie').send({ identifiant: e.identifiants.email });
    expect(await compter('password_resets', 'user_id = :u AND used_at IS NULL', { u: e.user.id })).toBe(1);
    const faux = await api().post('/api/v1/auth/reinitialiser-mot-de-passe').send({
      identifiant: e.identifiants.email, code: '000000', password: 'Nouveau123', password_confirmation: 'Nouveau123',
    });
    expect(faux.status).toBe(400);
    expect(faux.body.error.code).toBe('CODE_INVALIDE');
  });
});

describe('§ 6 — l’entreprise', () => {
  test('fiche, modification (NINEA, RCCM, fiscalité), paramètres et logo public', async () => {
    const e = await nouvelleEntreprise({ type: 'fournisseur' });
    const fiche = await api().get('/api/v1/entreprise').set(e.h);
    expect(fiche.status).toBe(200);
    expect(fiche.body.data.settings).toMatchObject({ order_prefix: 'BC', invoice_prefix: 'FAC', default_payment_terms_days: 30 });
    expect(fiche.body.data.company.default_tax_rate).toBe(18);

    const modif = await api().patch('/api/v1/entreprise').set(e.h).send({
      rccm: 'SN-DKR-2024-B-1234', tax_regime: 'reel_normal', bank_details: 'CBAO SN012 01001 00000000000 12', address: 'Km 4,5 Bd du Centenaire',
    });
    expect(modif.status).toBe(200);
    expect(modif.body.data.company.rccm).toBe('SN-DKR-2024-B-1234');
    const params = await api().patch('/api/v1/entreprise/parametres').set(e.h).send({ invoice_prefix: 'fv', default_payment_terms_days: 45 });
    expect(params.body.data.settings).toMatchObject({ invoice_prefix: 'FV', default_payment_terms_days: 45 });
    expect((await api().patch('/api/v1/entreprise/parametres').set(e.h).send({ invoice_prefix: '9X' })).status).toBe(422);

    const logo = await api().post('/api/v1/entreprise/logo').set(e.h).attach('fichier', await pngTest('#00f', 64), 'logo.png');
    expect(logo.status).toBe(201);
    // Un logo est public : une autre entreprise le lit (annuaire, documents).
    const autre = await nouvelleEntreprise();
    expect((await api().get(logo.body.data.logo.url).set(autre.h)).status).toBe(200);
    expect((await api().delete('/api/v1/entreprise/logo').set(e.h)).status).toBe(200);
  });

  test('NINEA déjà pris et changement de profil incompatible refusés (409)', async () => {
    const a = await nouvelleEntreprise();
    const b = await nouvelleEntreprise();
    const [[{ ninea }]] = await sequelize.query('SELECT ninea FROM companies WHERE id = :id', { replacements: { id: a.companyId } });
    expect((await api().patch('/api/v1/entreprise').set(b.h).send({ ninea })).body.error.code).toBe('NINEA_UTILISE');

    const rc = await relationCommerciale();
    const res = await api().patch('/api/v1/entreprise').set(rc.fournisseur.h).send({ type: 'acheteur' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TYPE_ENTREPRISE_INCOMPATIBLE');
    expect((await api().patch('/api/v1/entreprise').set(rc.fournisseur.h).send({ type: 'mixte' })).status).toBe(200);
  });
});

describe('§ 5.3 — utilisateurs internes et rôles', () => {
  test('invitation (code rendu une fois), activation, permissions par rôle appliquées immédiatement', async () => {
    const rc = await relationCommerciale();
    const recep = await collaborateur(rc.acheteur, 'receptionnaire');
    const profil = await api().get('/api/v1/compte').set(recep.h);
    expect(profil.body.data.member.role).toBe('receptionnaire');
    expect(profil.body.data.company.id).toBe(rc.acheteur.companyId);

    // Le réceptionnaire voit les achats mais ne passe pas commande.
    expect((await api().get('/api/v1/achats').set(recep.h)).status).toBe(200);
    const creation = await api().post('/api/v1/achats').set(recep.h).send({ supplier_id: rc.fournisseur.companyId, lines: [{ product_id: rc.produits[0].id, quantity: 1 }] });
    expect(creation.status).toBe(403);
    expect(creation.body.error.code).toBe('PERMISSION_REFUSEE');
    expect((await api().get('/api/v1/utilisateurs').set(recep.h)).status).toBe(403);

    // Promu responsable achats : il commande dès la requête suivante.
    const liste = await api().get('/api/v1/utilisateurs').set(rc.acheteur.h);
    const membre = liste.body.data.items.find((m) => m.user.id === recep.user.id);
    const promu = await api().patch(`/api/v1/utilisateurs/${membre.id}`).set(rc.acheteur.h).send({ role_code: 'responsable_achats' });
    expect(promu.body.data.member).toMatchObject({ role_code: 'responsable_achats', role_label: 'Responsable achats' });
    const ok = await api().post('/api/v1/achats').set(recep.h).send({ supplier_id: rc.fournisseur.companyId, lines: [{ product_id: rc.produits[0].id, quantity: 1 }] });
    expect(ok.status).toBe(201);
    // § 20 — l'auteur est tracé.
    expect(ok.body.data.order.created_by).toBe(recep.user.id);
  });

  test('le réceptionnaire confirme la réception ; le commercial du fournisseur traite la commande', async () => {
    const rc = await relationCommerciale();
    const recep = await collaborateur(rc.acheteur, 'receptionnaire');
    const commercial = await collaborateur(rc.fournisseur, 'commercial');
    const comptable = await collaborateur(rc.fournisseur, 'comptable');
    const commande = await commandeEnvoyee(rc);
    expect((await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(comptable.h).send({})).status).toBe(403);
    expect((await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(commercial.h).send({})).status).toBe(200);
    await api().post(`/api/v1/ventes/${commande.id}/livrer`).set(commercial.h).send({});
    // La livraison est notifiée au réceptionnaire (permission de réception).
    expect(await compter('notifications', "user_id = :u AND type = 'commande_livree'", { u: recep.user.id })).toBe(1);
    expect((await api().post(`/api/v1/achats/${commande.id}/confirmer-reception`).set(recep.h).send({})).status).toBe(200);
    // Seul le comptable (ou l'administrateur) facture.
    expect((await api().post('/api/v1/factures').set(commercial.h).send({ order_id: commande.id })).status).toBe(403);
    expect((await api().post('/api/v1/factures').set(comptable.h).send({ order_id: commande.id })).status).toBe(201);
  });

  test('dernier administrateur protégé ; désactivation ferme les sessions ; invitation déjà membre refusée', async () => {
    const e = await nouvelleEntreprise();
    const liste = await api().get('/api/v1/utilisateurs').set(e.h);
    const moi = liste.body.data.items[0];
    const retrograde = await api().patch(`/api/v1/utilisateurs/${moi.id}`).set(e.h).send({ role_code: 'comptable' });
    expect(retrograde.status).toBe(409);
    expect(retrograde.body.error.code).toBe('DERNIER_ADMINISTRATEUR');
    expect((await api().post(`/api/v1/utilisateurs/${moi.id}/desactiver`).set(e.h).send({ reason: 'Test' })).body.error.code).toBe('ACTION_SUR_SOI_INTERDITE');

    const compta = await collaborateur(e, 'comptable');
    const membres = await api().get('/api/v1/utilisateurs?role=comptable').set(e.h);
    const id = membres.body.data.items[0].id;
    const desac = await api().post(`/api/v1/utilisateurs/${id}/desactiver`).set(e.h).send({ reason: 'Départ' });
    expect(desac.body.data.member.status).toBe('inactif');
    expect((await api().get('/api/v1/compte').set(compta.h)).status).toBe(401);
    expect((await api().post(`/api/v1/utilisateurs/${id}/reactiver`).set(e.h).send({})).body.data.member.status).toBe('actif');

    const deja = await api().post('/api/v1/utilisateurs/invitations').set(e.h)
      .send({ email: compta.email, first_name: 'X', last_name: 'Y', role_code: 'commercial' });
    expect(deja.status).toBe(409);
    expect(deja.body.error.code).toBe('DEJA_MEMBRE');
  });

  test('invitation : lien (jeton) ou code ; code faux décompté ; révocation ; renvoi', async () => {
    const e = await nouvelleEntreprise();
    const email = emailUnique('invite');
    const inv = await api().post('/api/v1/utilisateurs/invitations').set(e.h)
      .send({ email, first_name: 'Ibou', last_name: 'Fall', role_code: 'commercial', phone: telephoneUnique() });
    expect(inv.status).toBe(201);
    expect(inv.body.data.code).toMatch(/^\d{8}$/);
    expect(inv.body.data.invitation.token_hash).toBeUndefined();

    const faux = await api().post('/api/v1/auth/invitation/activation').send({ code: '00000000', email, password: MOT_DE_PASSE, password_confirmation: MOT_DE_PASSE });
    expect(faux.body.error.code).toBe('INVITATION_INVALIDE');
    const [[{ attempts }]] = await sequelize.query('SELECT attempts FROM member_invitations WHERE id = :id', { replacements: { id: inv.body.data.invitation.id } });
    expect(attempts).toBe(1);

    const renvoi = await api().post(`/api/v1/utilisateurs/invitations/${inv.body.data.invitation.id}/renvoyer`).set(e.h).send({});
    expect(renvoi.status).toBe(201);
    // L'ancien code ne vaut plus rien.
    const ancien = await api().post('/api/v1/auth/invitation/activation').send({ code: inv.body.data.code, email, password: MOT_DE_PASSE, password_confirmation: MOT_DE_PASSE });
    expect(ancien.status).toBe(400);
    await api().delete(`/api/v1/utilisateurs/invitations/${renvoi.body.data.invitation.id}`).set(e.h);
    const revoquee = await api().post('/api/v1/auth/invitation/activation').send({ code: renvoi.body.data.code, email, password: MOT_DE_PASSE, password_confirmation: MOT_DE_PASSE });
    expect(revoquee.status).toBe(400);
    const etat = await api().get('/api/v1/utilisateurs/invitations?status=revoquee').set(e.h);
    expect(etat.body.data.items.length).toBeGreaterThanOrEqual(2);
  });

  test('une personne déjà rattachée à une autre entreprise ne peut pas être invitée (409)', async () => {
    const a = await nouvelleEntreprise();
    const b = await nouvelleEntreprise();
    const res = await api().post('/api/v1/utilisateurs/invitations').set(b.h)
      .send({ email: a.identifiants.email, first_name: 'A', last_name: 'B', role_code: 'comptable' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COMPTE_DEJA_RATTACHE');
  });
});
