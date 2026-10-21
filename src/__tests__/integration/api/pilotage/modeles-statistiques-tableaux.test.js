'use strict';

const {
  api, relationCommerciale, commandeEnvoyee, commandeReceptionnee, factureEmise, nouvelleEntreprise, pngTest, compter, fermer, sequelize,
} = require('../../../setup/helpers.js');
const { aujourdhui } = require('../../../../utils/dates.js');

/**
 * § 15 modèles de documents, § 18 / § 19 tableaux de bord, § 21 statistiques
 * et exports.
 */

afterAll(fermer);

const binaire = (r, cb) => {
  const morceaux = [];
  r.on('data', (m) => morceaux.push(m));
  r.on('end', () => cb(null, Buffer.concat(morceaux)));
};

describe('§ 15 — modèles de documents', () => {
  test('import d’un papier à en-tête, aperçu PDF, version figée sur les documents émis, remplacement versionné', async () => {
    const rc = await relationCommerciale();
    const v1 = await api().post('/api/v1/modeles-documents').set(rc.acheteur.h)
      .field('type', 'bon_commande').field('accent_color', '#AA3300').field('margin_top', '120').field('legal_mentions', 'SARL au capital de 1 000 000 FCFA')
      .attach('fichier', await pngTest('#ffffff', 600), 'entete.png');
    expect(v1.status).toBe(201);
    expect(v1.body.data.template).toMatchObject({ type: 'bon_commande', version: 1, status: 'actif', margin_top: 120 });
    expect(v1.body.data.template.background_url).toBeTruthy();

    const apercu = await api().get(`/api/v1/modeles-documents/${v1.body.data.template.id}/apercu.pdf`).set(rc.acheteur.h).buffer(true).parse(binaire);
    expect(apercu.status).toBe(200);
    expect(apercu.body.subarray(0, 5).toString()).toBe('%PDF-');

    const commande = await commandeEnvoyee(rc);
    const [[ligne]] = await sequelize.query('SELECT template_id FROM orders WHERE id = :id', { replacements: { id: commande.id } });
    expect(ligne.template_id).toBe(v1.body.data.template.id);

    // Remplacement : v1 archivée, v2 active ; la commande déjà envoyée garde v1.
    const v2 = await api().post('/api/v1/modeles-documents').set(rc.acheteur.h).send({ type: 'bon_commande', accent_color: '#004488', keep_background: true });
    expect(v2.body.data.template).toMatchObject({ version: 2, status: 'actif', background_document_id: v1.body.data.template.background_document_id });
    const liste = await api().get('/api/v1/modeles-documents?type=bon_commande').set(rc.acheteur.h);
    expect(liste.body.data.templates.map((t) => [t.version, t.status])).toEqual([[2, 'actif'], [1, 'archive']]);
    const pdf = await api().get(`/api/v1/ventes/${commande.id}/bon-de-commande.pdf`).set(rc.fournisseur.h).buffer(true).parse(binaire);
    expect(pdf.status).toBe(200);

    // Archiver : retour au modèle standard ; réactiver une ancienne version.
    expect((await api().post(`/api/v1/modeles-documents/${v2.body.data.template.id}/archiver`).set(rc.acheteur.h).send({})).body.data.template.status).toBe('archive');
    const re = await api().post(`/api/v1/modeles-documents/${v1.body.data.template.id}/reactiver`).set(rc.acheteur.h).send({});
    expect(re.body.data.template.status).toBe('actif');
    // Le modèle (fond privé) n'est pas lisible par une autre entreprise.
    expect((await api().get(v1.body.data.template.background_url).set(rc.fournisseur.h)).status).toBe(403);
    expect((await api().get(`/api/v1/modeles-documents/${v1.body.data.template.id}`).set(rc.fournisseur.h)).status).toBe(403);
  });

  test('facture générée au modèle du fournisseur ; sans modèle, modèle standard', async () => {
    const rc = await relationCommerciale();
    await api().post('/api/v1/modeles-documents').set(rc.fournisseur.h).send({ type: 'facture', footer_text: 'Merci pour votre confiance' });
    const f = await factureEmise(rc);
    const [[ligne]] = await sequelize.query('SELECT template_id FROM invoices WHERE id = :id', { replacements: { id: f.id } });
    expect(ligne.template_id).toBeTruthy();
    const pdf = await api().get(`/api/v1/factures/${f.id}/pdf`).set(rc.fournisseur.h).buffer(true).parse(binaire);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    const autre = await relationCommerciale();
    const standard = await factureEmise(autre);
    expect((await sequelize.query('SELECT template_id FROM invoices WHERE id = :id', { replacements: { id: standard.id } }))[0][0].template_id).toBeNull();
  });

  test('validations : type requis, couleur, image seulement', async () => {
    const e = await nouvelleEntreprise();
    expect((await api().post('/api/v1/modeles-documents').set(e.h).send({ accent_color: '#000000' })).status).toBe(422);
    expect((await api().post('/api/v1/modeles-documents').set(e.h).send({ type: 'facture', accent_color: 'rouge' })).status).toBe(422);
    const pdf = await api().post('/api/v1/modeles-documents').set(e.h).field('type', 'facture').attach('fichier', Buffer.from('%PDF-1.4 xxxxxxxx'), 'x.pdf');
    expect(pdf.body.error.code).toBe('FORMAT_FICHIER_REFUSE');
  });
});

describe('§ 18 / § 19 — tableaux de bord', () => {
  test('acheteur : commandes en cours, à réceptionner, montant dû ; fournisseur : à traiter, à facturer, créances', async () => {
    const rc = await relationCommerciale();
    await commandeEnvoyee(rc);
    const f = await factureEmise(rc);
    const livree = await commandeEnvoyee(rc);
    await api().post(`/api/v1/ventes/${livree.id}/accepter`).set(rc.fournisseur.h).send({});
    await api().post(`/api/v1/ventes/${livree.id}/livrer`).set(rc.fournisseur.h).send({});

    const a = (await api().get('/api/v1/tableau-de-bord').set(rc.acheteur.h)).body.data.dashboard;
    expect(a.supplier).toBeNull();
    expect(a.buyer.orders).toMatchObject({ awaiting_supplier: 1, to_receive: 1 });
    expect(a.buyer).toMatchObject({ suppliers: 1, amount_due: f.total });
    expect(a.buyer.top_suppliers_due[0].partner.id).toBe(rc.fournisseur.companyId);
    expect(a.recent_activity.length).toBeGreaterThan(0);
    expect(a.unread_notifications).toBeGreaterThan(0);

    const fo = (await api().get('/api/v1/tableau-de-bord').set(rc.fournisseur.h)).body.data.dashboard;
    expect(fo.buyer).toBeNull();
    expect(fo.supplier.orders).toMatchObject({ new: 1, to_process: 1, delivered_awaiting_reception: 1 });
    expect(fo.supplier).toMatchObject({ clients: 1, receivables: f.total, invoices_issued_this_month: { count: 1, amount: f.total } });
    expect(fo.supplier.top_clients_owing[0].partner.id).toBe(rc.acheteur.companyId);

    // Cache invalidé dès qu'une commande change.
    const nouvelle = await commandeEnvoyee(rc);
    const apres = (await api().get('/api/v1/tableau-de-bord').set(rc.fournisseur.h)).body.data.dashboard;
    expect(apres.supplier.orders.new).toBe(2);
    expect(nouvelle.id).toBeTruthy();
  });

  test('entreprise mixte : les deux sections', async () => {
    const e = await nouvelleEntreprise({ type: 'mixte' });
    const d = (await api().get('/api/v1/tableau-de-bord').set(e.h)).body.data.dashboard;
    expect(d.buyer).not.toBeNull();
    expect(d.supplier).not.toBeNull();
  });
});

describe('§ 21 — statistiques et exports', () => {
  test('achats et ventes : synthèse, par mois, par partenaire, produits ; mêmes chiffres des deux côtés', async () => {
    const rc = await relationCommerciale();
    const c = await commandeReceptionnee(rc);
    const achats = (await api().get('/api/v1/statistiques/achats').set(rc.acheteur.h)).body.data.statistics;
    const ventes = (await api().get('/api/v1/statistiques/ventes').set(rc.fournisseur.h)).body.data.statistics;
    expect(achats.summary).toMatchObject({ orders: 1, amount: c.total });
    expect(ventes.summary).toMatchObject({ orders: 1, amount: c.total });
    expect(achats.by_partner[0]).toMatchObject({ partner_id: rc.fournisseur.companyId, orders: 1 });
    expect(ventes.by_partner[0].partner_id).toBe(rc.acheteur.companyId);
    expect(achats.by_month).toHaveLength(1);
    expect(ventes.top_products.map((p) => p.reference)).toEqual(expect.arrayContaining([rc.produits[0].reference]));
    expect((await api().get('/api/v1/statistiques/achats?du=2026-05-01&au=2026-01-01').set(rc.acheteur.h)).status).toBe(422);
  });

  test('exports CSV (Excel FR : BOM, « ; ») des commandes, factures et paiements', async () => {
    const rc = await relationCommerciale();
    const f = await factureEmise(rc);
    await api().post('/api/v1/paiements').set(rc.fournisseur.h).send({ partnership_id: rc.partenariat.id, amount: 1000, method: 'especes', paid_on: aujourdhui() });
    for (const type of ['commandes', 'factures', 'paiements']) {
      const res = await api().get(`/api/v1/statistiques/exports/${type}.csv?sens=ventes`).set(rc.fournisseur.h);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text.charCodeAt(0)).toBe(0xFEFF);
      expect(res.text).toContain(';');
    }
    const factures = await api().get('/api/v1/statistiques/exports/factures.csv').set(rc.acheteur.h);
    expect(factures.text).toContain(f.number);
    expect((await api().get('/api/v1/statistiques/exports/clients.csv').set(rc.acheteur.h)).status).toBe(422);
    expect(await compter('invoices', 'id = :id', { id: f.id })).toBe(1);
  });
});
