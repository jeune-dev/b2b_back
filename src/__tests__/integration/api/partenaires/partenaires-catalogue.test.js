'use strict';

const {
  api, nouvelleEntreprise, partenaires, creerProduit, relationCommerciale, commandeEnvoyee, emailUnique, MOT_DE_PASSE,
  telephoneUnique, nineaUnique, compter, pngTest, fermer,
} = require('../../../setup/helpers.js');

/**
 * § 7 fournisseurs et clients (annuaire, demandes, invitations), § 8
 * catalogue produits et sa consultation par les clients.
 */

afterAll(fermer);

describe('§ 7 — annuaire et partenariats', () => {
  test('recherche d’un fournisseur dans l’annuaire, profil public, relation indiquée', async () => {
    const nom = `Grossiste Thiès ${Date.now()}`;
    const fournisseur = await nouvelleEntreprise({ type: 'fournisseur', company: { name: nom, city: 'Thiès' } });
    await nouvelleEntreprise({ type: 'fournisseur', company: { name: `Caché ${Date.now()}`, is_listed: false } });
    const acheteur = await nouvelleEntreprise({ type: 'acheteur' });
    const res = await api().get(`/api/v1/annuaire?type=fournisseur&q=${encodeURIComponent(nom)}`).set(acheteur.h);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    const fiche = res.body.data.items[0];
    expect(fiche).toMatchObject({ id: fournisseur.companyId, name: nom, city: 'Thiès', my_relation: { supplier: null, client: null } });
    expect(fiche.settings).toBeUndefined();
    expect(fiche.bank_details).toBeUndefined();
    const cache = await api().get('/api/v1/annuaire?q=Cach%C3%A9').set(acheteur.h);
    expect(cache.body.data.items.find((c) => c.name.startsWith('Caché'))).toBeUndefined();

    await partenaires(acheteur, fournisseur);
    const profil = await api().get(`/api/v1/annuaire/${fournisseur.companyId}`).set(acheteur.h);
    expect(profil.body.data.company.my_relation.supplier.status).toBe('actif');
  });

  test('demande → acceptation par l’AUTRE partie seulement ; notes privées ; conditions fixées par le fournisseur', async () => {
    const acheteur = await nouvelleEntreprise({ type: 'acheteur' });
    const fournisseur = await nouvelleEntreprise({ type: 'fournisseur' });
    const demande = await api().post('/api/v1/partenariats').set(acheteur.h)
      .send({ company_id: fournisseur.companyId, relation: 'fournisseur', message: 'Bonjour, nous souhaitons commander chez vous' });
    expect(demande.status).toBe(201);
    const p = demande.body.data.partnership;
    expect(p).toMatchObject({ status: 'en_attente', relation: 'fournisseur', requested_by_me: true });
    expect(await compter('notifications', "user_id = :u AND type = 'partenariat'", { u: fournisseur.user.id })).toBe(1);

    expect((await api().post(`/api/v1/partenariats/${p.id}/accepter`).set(acheteur.h).send({})).status).toBe(403);
    expect((await api().post('/api/v1/partenariats').set(acheteur.h).send({ company_id: fournisseur.companyId, relation: 'fournisseur' })).body.error.code).toBe('DEMANDE_EN_COURS');
    const ok = await api().post(`/api/v1/partenariats/${p.id}/accepter`).set(fournisseur.h).send({});
    expect(ok.body.data.partnership).toMatchObject({ status: 'actif', relation: 'client' });

    await api().patch(`/api/v1/partenariats/${p.id}`).set(acheteur.h).send({ notes: 'Livre vite, prix corrects' });
    await api().patch(`/api/v1/partenariats/${p.id}`).set(fournisseur.h).send({ notes: 'Bon payeur', payment_terms_days: 60, supplier_customer_code: 'CL-0042' });
    const vueA = (await api().get(`/api/v1/partenariats/${p.id}`).set(acheteur.h)).body.data.partnership;
    const vueF = (await api().get(`/api/v1/partenariats/${p.id}`).set(fournisseur.h)).body.data.partnership;
    expect(vueA).toMatchObject({ my_notes: 'Livre vite, prix corrects', payment_terms_days: 60, supplier_customer_code: 'CL-0042' });
    expect(vueF.my_notes).toBe('Bon payeur');
    expect(JSON.stringify(vueA)).not.toContain('Bon payeur');
    const interdit = await api().patch(`/api/v1/partenariats/${p.id}`).set(acheteur.h).send({ payment_terms_days: 90 });
    expect(interdit.body.error.code).toBe('CHAMP_RESERVE_FOURNISSEUR');

    const fournisseurs = await api().get('/api/v1/partenariats?relation=fournisseur').set(acheteur.h);
    expect(fournisseurs.body.data.items.map((x) => x.partner.id)).toEqual([fournisseur.companyId]);
    expect(fournisseurs.body.data.items[0].stats).toMatchObject({ balance: 0, orders_in_progress: 0 });
    const clients = await api().get('/api/v1/partenariats?relation=client').set(fournisseur.h);
    expect(clients.body.data.items.map((x) => x.partner.id)).toEqual([acheteur.companyId]);
  });

  test('profils incompatibles, soi-même, refus puis nouvelle demande ; acceptation automatique', async () => {
    const a1 = await nouvelleEntreprise({ type: 'acheteur' });
    const a2 = await nouvelleEntreprise({ type: 'acheteur' });
    expect((await api().post('/api/v1/partenariats').set(a1.h).send({ company_id: a2.companyId, relation: 'fournisseur' })).body.error.code).toBe('PROFIL_ENTREPRISE_INCOMPATIBLE');
    expect((await api().post('/api/v1/partenariats').set(a1.h).send({ company_id: a1.companyId, relation: 'fournisseur' })).status).toBe(422);

    const f = await nouvelleEntreprise({ type: 'fournisseur' });
    const d = await api().post('/api/v1/partenariats').set(a1.h).send({ company_id: f.companyId, relation: 'fournisseur' });
    await api().post(`/api/v1/partenariats/${d.body.data.partnership.id}/refuser`).set(f.h).send({ reason: 'Zone non desservie' });
    const encore = await api().post('/api/v1/partenariats').set(a1.h).send({ company_id: f.companyId, relation: 'fournisseur' });
    expect(encore.body.data.partnership.status).toBe('en_attente');

    const auto = await nouvelleEntreprise({ type: 'fournisseur' });
    await api().patch('/api/v1/entreprise/parametres').set(auto.h).send({ auto_accept_partnerships: true });
    const direct = await api().post('/api/v1/partenariats').set(a2.h).send({ company_id: auto.companyId, relation: 'fournisseur' });
    expect(direct.body.data.partnership.status).toBe('actif');
    // Le fournisseur peut aussi ajouter un client.
    const client = await api().post('/api/v1/partenariats').set(f.h).send({ company_id: a2.companyId, relation: 'client' });
    expect(client.body.data.partnership).toMatchObject({ status: 'en_attente', relation: 'client' });
  });

  test('suspension : plus de nouvelle commande ; seule la partie qui a suspendu réactive', async () => {
    const rc = await relationCommerciale();
    const s = await api().post(`/api/v1/partenariats/${rc.partenariat.id}/suspendre`).set(rc.fournisseur.h).send({ reason: 'Impayés' });
    expect(s.body.data.partnership).toMatchObject({ status: 'suspendu', suspended_by_me: true });
    const commande = await api().post('/api/v1/achats').set(rc.acheteur.h).send({ supplier_id: rc.fournisseur.companyId, lines: [{ product_id: rc.produits[0].id, quantity: 1 }] });
    expect(commande.body.error.code).toBe('PARTENARIAT_INACTIF');
    expect((await api().get(`/api/v1/catalogues/${rc.fournisseur.companyId}/produits`).set(rc.acheteur.h)).status).toBe(403);
    expect((await api().post(`/api/v1/partenariats/${rc.partenariat.id}/reactiver`).set(rc.acheteur.h).send({})).status).toBe(403);
    expect((await api().post(`/api/v1/partenariats/${rc.partenariat.id}/reactiver`).set(rc.fournisseur.h).send({})).body.data.partnership.status).toBe('actif');
  });

  test('un tiers n’accède pas au partenariat des autres (403)', async () => {
    const rc = await relationCommerciale();
    const tiers = await nouvelleEntreprise();
    expect((await api().get(`/api/v1/partenariats/${rc.partenariat.id}`).set(tiers.h)).status).toBe(403);
    expect((await api().get(`/api/v1/partenariats/${rc.partenariat.id}/releve`).set(tiers.h)).status).toBe(403);
  });
});

describe('§ 7 — inviter une entreprise qui n’est pas encore sur Pro2Link', () => {
  test('lien d’invitation → l’invitée s’inscrit → partenariat ACTIF immédiatement ; l’invitant est notifié', async () => {
    const acheteur = await nouvelleEntreprise({ type: 'acheteur' });
    const email = emailUnique('nouveau-fournisseur');
    const inv = await api().post('/api/v1/partenariats/invitations').set(acheteur.h)
      .send({ email, relation: 'fournisseur', company_name: 'Laiterie du Fleuve', message: 'Rejoignez-nous' });
    expect(inv.status).toBe(201);
    expect(inv.body.data.token).toBeTruthy();
    expect(inv.body.data.invitation.token_hash).toBeUndefined();

    const inscription = await api().post('/api/v1/auth/inscription').send({
      first_name: 'Mame', last_name: 'Diouf', email, phone: telephoneUnique(), password: MOT_DE_PASSE, password_confirmation: MOT_DE_PASSE,
      company: { name: 'Laiterie du Fleuve', type: 'fournisseur', ninea: nineaUnique() },
      invitation_token: inv.body.data.token,
    });
    expect(inscription.status).toBe(201);
    expect(inscription.body.data.partnerships_created).toEqual([expect.objectContaining({ status: 'actif' })]);
    const liste = await api().get('/api/v1/partenariats/invitations').set(acheteur.h);
    expect(liste.body.data.items[0].status).toBe('acceptee');
    expect(await compter('notifications', "user_id = :u AND type = 'partenariat'", { u: acheteur.user.id })).toBe(1);
  });

  test('inscription SANS le lien mais avec la même adresse : partenariat en attente ; adresse déjà inscrite : 409', async () => {
    const fournisseur = await nouvelleEntreprise({ type: 'fournisseur' });
    const email = emailUnique('client');
    await api().post('/api/v1/partenariats/invitations').set(fournisseur.h).send({ email, relation: 'client' });
    const ins = await api().post('/api/v1/auth/inscription').send({
      first_name: 'A', last_name: 'B', email, password: MOT_DE_PASSE, password_confirmation: MOT_DE_PASSE,
      company: { name: 'Restaurant Le Lagon', type: 'acheteur', sector: 'restaurant' },
    });
    expect(ins.body.data.partnerships_created).toEqual([expect.objectContaining({ status: 'en_attente' })]);

    const deja = await api().post('/api/v1/partenariats/invitations').set(fournisseur.h).send({ email, relation: 'client' });
    expect(deja.status).toBe(409);
    expect(deja.body.error.code).toBe('ENTREPRISE_DEJA_INSCRITE');
    expect(deja.body.error.details.company_id).toBe(ins.body.data.company.id);
  });

  test('annulation d’une invitation en attente', async () => {
    const e = await nouvelleEntreprise();
    const inv = await api().post('/api/v1/partenariats/invitations').set(e.h).send({ email: emailUnique('x'), relation: 'fournisseur' });
    expect((await api().delete(`/api/v1/partenariats/invitations/${inv.body.data.invitation.id}`).set(e.h)).status).toBe(200);
    expect((await api().delete(`/api/v1/partenariats/invitations/${inv.body.data.invitation.id}`).set(e.h)).body.error.code).toBe('INVITATION_CLOSE');
  });
});

describe('§ 8 — catalogue', () => {
  test('ajouter, modifier, prix et disponibilité tracés, désactiver, référence unique, catégories', async () => {
    const f = await nouvelleEntreprise({ type: 'fournisseur' });
    const cat = await api().post('/api/v1/categories-produits').set(f.h).send({ name: 'Céréales' });
    expect(cat.status).toBe(201);
    expect((await api().post('/api/v1/categories-produits').set(f.h).send({ name: 'céréales' })).body.error.code).toBe('CATEGORIE_EXISTANTE');
    const p = await creerProduit(f, { reference: 'RIZ-25', category_id: cat.body.data.category.id, packaging: 'Sac de 25 kg' });
    expect(p).toMatchObject({ reference: 'RIZ-25', availability: 'disponible', is_active: true, category: { name: 'Céréales' } });
    expect((await api().post('/api/v1/produits').set(f.h).send({ reference: 'riz-25', name: 'Doublon', unit: 'sac', price: 1 })).body.error.code).toBe('REFERENCE_UTILISEE');

    const prix = await api().patch(`/api/v1/produits/${p.id}/prix`).set(f.h).send({ price: 16500 });
    expect(prix.body.data.product.price).toBe(16500);
    const dispo = await api().patch(`/api/v1/produits/${p.id}/disponibilite`).set(f.h).send({ availability: 'stock_limite', stock_quantity: 12 });
    expect(dispo.body.data.product.availability).toBe('stock_limite');
    expect(await compter('audit_logs', "entity_id = :id AND action = 'produit.modification_prix'", { id: p.id })).toBe(1);
    expect(await compter('audit_logs', "entity_id = :id AND action = 'produit.modification_disponibilite'", { id: p.id })).toBe(1);

    const photo = await api().post(`/api/v1/produits/${p.id}/photo`).set(f.h).attach('fichier', await pngTest('#0f0', 80), 'riz.png');
    expect(photo.body.data.product.photo_url).toBeTruthy();
    const desac = await api().post(`/api/v1/produits/${p.id}/desactiver`).set(f.h).send({});
    expect(desac.body.data.product.is_active).toBe(false);
    const filtre = await api().get('/api/v1/produits?is_active=false').set(f.h);
    expect(filtre.body.data.items.map((x) => x.id)).toEqual([p.id]);
    expect((await api().delete(`/api/v1/categories-produits/${cat.body.data.category.id}`).set(f.h)).body.error.code).toBe('CATEGORIE_NON_VIDE');
  });

  test('l’acheteur consulte le catalogue ACTIF de ses fournisseurs, sans stock interne ; photo lisible ; sinon 403', async () => {
    const rc = await relationCommerciale();
    const cache = await creerProduit(rc.fournisseur, { stock_quantity: 40 });
    await api().post(`/api/v1/produits/${cache.id}/desactiver`).set(rc.fournisseur.h).send({});
    const photo = await api().post(`/api/v1/produits/${rc.produits[0].id}/photo`).set(rc.fournisseur.h).attach('fichier', await pngTest(), 'p.png');

    const res = await api().get(`/api/v1/catalogues/${rc.fournisseur.companyId}/produits?tri=price`).set(rc.acheteur.h);
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((p) => p.id)).toEqual([rc.produits[1].id, rc.produits[0].id]);
    expect(res.body.data.items[0].stock_quantity).toBeUndefined();
    expect((await api().get(photo.body.data.product.photo_thumbnail_url).set(rc.acheteur.h)).status).toBe(200);
    expect((await api().get(`/api/v1/catalogues/${rc.fournisseur.companyId}/produits/${cache.id}`).set(rc.acheteur.h)).status).toBe(404);
    expect((await api().get(`/api/v1/catalogues/${rc.fournisseur.companyId}/categories`).set(rc.acheteur.h)).status).toBe(200);

    const tiers = await nouvelleEntreprise({ type: 'acheteur' });
    expect((await api().get(`/api/v1/catalogues/${rc.fournisseur.companyId}/produits`).set(tiers.h)).status).toBe(403);
    expect((await api().get(photo.body.data.product.photo_url).set(tiers.h)).status).toBe(403);
    // Un fournisseur ne lit ni ne modifie les produits d'un autre.
    const concurrent = await nouvelleEntreprise({ type: 'fournisseur' });
    expect((await api().patch(`/api/v1/produits/${rc.produits[0].id}`).set(concurrent.h).send({ price: 1 })).status).toBe(403);
  });

  test('un produit supprimé ne casse pas les commandes passées (instantané des lignes)', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeEnvoyee(rc);
    await api().patch(`/api/v1/produits/${rc.produits[0].id}`).set(rc.fournisseur.h).send({ name: 'Nouveau nom', price: 99999 });
    expect((await api().delete(`/api/v1/produits/${rc.produits[0].id}`).set(rc.fournisseur.h)).status).toBe(200);
    const vue = await api().get(`/api/v1/achats/${commande.id}`).set(rc.acheteur.h);
    expect(vue.body.data.order.current_version.lines[0]).toMatchObject({ name: rc.produits[0].name, unit_price: 15000 });
    expect(await compter('products', 'id = :id AND deleted_at IS NOT NULL', { id: rc.produits[0].id })).toBe(1);
  });
});
