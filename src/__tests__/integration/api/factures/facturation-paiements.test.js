'use strict';

const {
  api, apiBrute, relationCommerciale, commandeEnvoyee, commandeReceptionnee, factureEmise, nouvelleEntreprise,
  compter, pdfTest, pngTest, fermer, sequelize,
} = require('../../../setup/helpers.js');
const { aujourdhui, ajouterJours } = require('../../../../utils/dates.js');
const echeances = require('../../../../modules/facture/service/echeance.service.js');

/**
 * Facturation (§ 14), paiements et dettes / créances (§ 16) : « le solde est
 * calculé à partir des factures et paiements enregistrés ».
 */

afterAll(fermer);

const binaire = (r, cb) => {
  const morceaux = [];
  r.on('data', (m) => morceaux.push(m));
  r.on('end', () => cb(null, Buffer.concat(morceaux)));
};

describe('§ 14 — facture', () => {
  test('générée après réception, sur les quantités REÇUES, échéance = délai du partenariat ; commande « facturée »', async () => {
    const rc = await relationCommerciale();
    await api().patch(`/api/v1/partenariats/${rc.partenariat.id}`).set(rc.fournisseur.h).send({ payment_terms_days: 15 });
    const commande = await commandeEnvoyee(rc);
    await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});
    const avant = await api().post('/api/v1/factures').set(rc.fournisseur.h).send({ order_id: commande.id });
    expect(avant.status).toBe(409);
    expect(avant.body.error.code).toBe('COMMANDE_NON_FACTURABLE');
    await api().post(`/api/v1/ventes/${commande.id}/livrer`).set(rc.fournisseur.h).send({});
    await api().post(`/api/v1/achats/${commande.id}/confirmer-reception`).set(rc.acheteur.h)
      .send({ lines: [{ line_no: 1, received_quantity: 8 }, { line_no: 2, received_quantity: 0 }] });

    const res = await api().post('/api/v1/factures').set(rc.fournisseur.h).send({ order_id: commande.id, note: 'Merci de votre confiance' });
    expect(res.status).toBe(201);
    const f = res.body.data.invoice;
    expect(f.number).toMatch(/^FAC-\d{4}-\d{5}$/);
    expect(f).toMatchObject({ status: 'emise', source: 'generee', direction: 'emise', issue_date: aujourdhui(), due_date: ajouterJours(aujourdhui(), 15) });
    // 8 sacs × 15 000 HT + 18 % ; la ligne non reçue n'est pas facturée.
    expect(f.lines).toHaveLength(1);
    expect(f).toMatchObject({ subtotal: 120000, tax_total: 21600, total: 141600, balance_due: 141600 });

    const cmd = await api().get(`/api/v1/achats/${commande.id}`).set(rc.acheteur.h);
    expect(cmd.body.data.order.status).toBe('facturee');
    expect(cmd.body.data.order.invoice).toMatchObject({ id: f.id, number: f.number });
    expect(await compter('notifications', "user_id = :u AND type = 'nouvelle_facture'", { u: rc.acheteur.user.id })).toBe(1);

    // Une seule facture par commande ; l'acheteur ne facture pas.
    expect((await api().post('/api/v1/factures').set(rc.fournisseur.h).send({ order_id: commande.id })).status).toBe(409);
    expect((await api().post('/api/v1/factures').set(rc.acheteur.h).send({ order_id: commande.id })).status).toBe(403);

    // L'acheteur la consulte et la télécharge (§ 14).
    const recues = await api().get('/api/v1/factures?sens=recues').set(rc.acheteur.h);
    expect(recues.body.data.items.map((i) => i.id)).toContain(f.id);
    const pdf = await api().get(`/api/v1/factures/${f.id}/pdf`).set(rc.acheteur.h).buffer(true).parse(binaire);
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('facture TRANSMISE : le fournisseur importe son propre PDF, servi tel quel', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeReceptionnee(rc);
    const res = await api().post('/api/v1/factures').set(rc.fournisseur.h)
      .field('order_id', commande.id).attach('fichier', pdfTest(), 'ma-facture.pdf');
    expect(res.status).toBe(201);
    expect(res.body.data.invoice.source).toBe('importee');
    expect(res.body.data.invoice.file.original_name).toBe('ma-facture.pdf');
    const pdf = await api().get(`/api/v1/factures/${res.body.data.invoice.id}/pdf`).set(rc.acheteur.h).buffer(true).parse(binaire);
    expect(pdf.status).toBe(200);
    expect(pdf.body.equals(pdfTest())).toBe(true);
  });

  test('annulation sans paiement : la commande revient à « réception confirmée » et peut être refacturée', async () => {
    const rc = await relationCommerciale();
    const f = await factureEmise(rc);
    const res = await api().post(`/api/v1/factures/${f.id}/annuler`).set(rc.fournisseur.h).send({ reason: 'Erreur de prix' });
    expect(res.body.data.invoice).toMatchObject({ status: 'annulee', balance_due: 0 });
    const cmd = await api().get(`/api/v1/ventes/${f.order_id}`).set(rc.fournisseur.h);
    expect(cmd.body.data.order.status).toBe('reception_confirmee');
    const nouvelle = await api().post('/api/v1/factures').set(rc.fournisseur.h).send({ order_id: f.order_id });
    expect(nouvelle.status).toBe(201);
    expect(nouvelle.body.data.invoice.number).not.toBe(f.number);
  });
});

describe('§ 16 — paiements et soldes', () => {
  test('Idempotency-Key obligatoire ; paiement partiel puis solde → facture payée, commande TERMINÉE', async () => {
    const rc = await relationCommerciale();
    const f = await factureEmise(rc);
    const sansCle = await apiBrute().post('/api/v1/paiements').set(rc.fournisseur.h)
      .send({ partnership_id: rc.partenariat.id, amount: 1000, method: 'especes', paid_on: aujourdhui() });
    expect(sansCle.status).toBe(422);
    expect(sansCle.body.error.code).toBe('IDEMPOTENCE_REQUISE');

    const p1 = await api().post('/api/v1/paiements').set(rc.fournisseur.h)
      .send({ partnership_id: rc.partenariat.id, amount: 100000, method: 'wave', paid_on: aujourdhui(), external_reference: 'TX-WAVE-1' });
    expect(p1.status).toBe(201);
    expect(p1.body.data.payment).toMatchObject({ status: 'confirme', direction: 'recu', allocated_amount: 100000, unallocated_amount: 0 });
    expect(p1.body.data.payment.reference).toMatch(/^PAI-\d{4}-\d{5}$/);
    let facture = (await api().get(`/api/v1/factures/${f.id}`).set(rc.acheteur.h)).body.data.invoice;
    expect(facture).toMatchObject({ status: 'partiellement_payee', amount_paid: 100000, balance_due: f.total - 100000 });

    const reste = f.total - 100000;
    await api().post('/api/v1/paiements').set(rc.fournisseur.h)
      .send({ partnership_id: rc.partenariat.id, amount: reste, method: 'virement', paid_on: aujourdhui(), allocations: [{ invoice_id: f.id, amount: reste }] });
    facture = (await api().get(`/api/v1/factures/${f.id}`).set(rc.acheteur.h)).body.data.invoice;
    expect(facture).toMatchObject({ status: 'payee', balance_due: 0 });
    expect(facture.allocations).toHaveLength(2);
    const cmd = await api().get(`/api/v1/achats/${f.order_id}`).set(rc.acheteur.h);
    expect(cmd.body.data.order.status).toBe('terminee');
    const h = await api().get(`/api/v1/achats/${f.order_id}/historique`).set(rc.acheteur.h);
    expect(h.body.data.events.map((e) => e.type)).toEqual(expect.arrayContaining(['facturation', 'paiement', 'cloture']));
    expect(await compter('notifications', "user_id = :u AND type = 'paiement_enregistre'", { u: rc.acheteur.user.id })).toBe(2);
  });

  test('paiement DÉCLARÉ par l’acheteur : hors solde tant que le fournisseur ne l’a pas confirmé ; rejet possible', async () => {
    const rc = await relationCommerciale();
    const f = await factureEmise(rc);
    const decl = await api().post('/api/v1/paiements').set(rc.acheteur.h)
      .send({ partnership_id: rc.partenariat.id, amount: f.total, method: 'orange_money', paid_on: aujourdhui() });
    expect(decl.body.data.payment).toMatchObject({ status: 'declare', direction: 'effectue', allocated_amount: 0 });
    expect(await compter('notifications', "user_id = :u AND type = 'paiement_declare'", { u: rc.fournisseur.user.id })).toBe(1);
    const dettes = await api().get('/api/v1/situation/dettes').set(rc.acheteur.h);
    expect(dettes.body.data.payables.totals).toMatchObject({ balance: f.total, declared_pending: f.total });

    // Preuve jointe par l'acheteur, visible du fournisseur.
    const preuve = await api().post(`/api/v1/paiements/${decl.body.data.payment.id}/preuve`).set(rc.acheteur.h).attach('fichier', await pngTest(), 'capture.png');
    expect(preuve.status).toBe(201);
    expect((await api().get(preuve.body.data.payment.proof_url).set(rc.fournisseur.h)).status).toBe(200);

    // L'acheteur ne confirme pas lui-même ; le fournisseur confirme.
    expect((await api().post(`/api/v1/paiements/${decl.body.data.payment.id}/confirmer`).set(rc.acheteur.h).send({})).status).toBe(403);
    const conf = await api().post(`/api/v1/paiements/${decl.body.data.payment.id}/confirmer`).set(rc.fournisseur.h).send({});
    expect(conf.body.data.payment).toMatchObject({ status: 'confirme', allocated_amount: f.total });
    expect((await api().get(`/api/v1/factures/${f.id}`).set(rc.acheteur.h)).body.data.invoice.status).toBe('payee');

    const autre = await api().post('/api/v1/paiements').set(rc.acheteur.h)
      .send({ partnership_id: rc.partenariat.id, amount: 5000, method: 'especes', paid_on: aujourdhui() });
    const rejet = await api().post(`/api/v1/paiements/${autre.body.data.payment.id}/rejeter`).set(rc.fournisseur.h).send({ reason: 'Non reçu' });
    expect(rejet.body.data.payment.status).toBe('rejete');
  });

  test('annulation d’un paiement : imputations levées, facture de nouveau due, commande « facturée »', async () => {
    const rc = await relationCommerciale();
    const f = await factureEmise(rc);
    const p = await api().post('/api/v1/paiements').set(rc.fournisseur.h)
      .send({ partnership_id: rc.partenariat.id, amount: f.total, method: 'cheque', paid_on: aujourdhui() });
    expect((await api().get(`/api/v1/achats/${f.order_id}`).set(rc.acheteur.h)).body.data.order.status).toBe('terminee');
    // Seul le fournisseur annule un paiement confirmé ; une facture payée ne s'annule pas.
    expect((await api().post(`/api/v1/paiements/${p.body.data.payment.id}/annuler`).set(rc.acheteur.h).send({ reason: 'x x x' })).status).toBe(403);
    expect((await api().post(`/api/v1/factures/${f.id}/annuler`).set(rc.fournisseur.h).send({ reason: 'Erreur' })).body.error.code).toBe('FACTURE_PAYEE');

    const annul = await api().post(`/api/v1/paiements/${p.body.data.payment.id}/annuler`).set(rc.fournisseur.h).send({ reason: 'Chèque sans provision' });
    expect(annul.body.data.payment).toMatchObject({ status: 'annule', allocated_amount: 0 });
    const facture = (await api().get(`/api/v1/factures/${f.id}`).set(rc.fournisseur.h)).body.data.invoice;
    expect(facture).toMatchObject({ status: 'emise', amount_paid: 0 });
    expect((await api().get(`/api/v1/achats/${f.order_id}`).set(rc.acheteur.h)).body.data.order.status).toBe('facturee');
  });

  test('acompte : un trop-perçu reste en crédit et s’impute sur la facture suivante', async () => {
    const rc = await relationCommerciale();
    const acompte = await api().post('/api/v1/paiements').set(rc.fournisseur.h)
      .send({ partnership_id: rc.partenariat.id, amount: 50000, method: 'especes', paid_on: aujourdhui(), note: 'Acompte' });
    expect(acompte.body.data.payment).toMatchObject({ allocated_amount: 0, unallocated_amount: 50000 });
    const creances = await api().get('/api/v1/situation/creances').set(rc.fournisseur.h);
    expect(creances.body.data.receivables.totals.balance).toBe(-50000);

    const f = await factureEmise(rc);
    expect(f).toMatchObject({ status: 'partiellement_payee', amount_paid: 50000, balance_due: f.total - 50000 });
    const p = await api().get(`/api/v1/paiements/${acompte.body.data.payment.id}`).set(rc.acheteur.h);
    expect(p.body.data.payment.unallocated_amount).toBe(0);
  });

  test('imputations invalides : facture d’un autre partenaire ou montant excessif → 422', async () => {
    const rc = await relationCommerciale();
    const f = await factureEmise(rc);
    const autre = await relationCommerciale();
    const fAutre = await factureEmise(autre);
    const cas = [
      { amount: 1000, allocations: [{ invoice_id: fAutre.id, amount: 1000 }] },
      { amount: f.total + 10, allocations: [{ invoice_id: f.id, amount: f.total + 10 }] },
      { amount: 1000, allocations: [{ invoice_id: f.id, amount: 2000 }] },
    ];
    for (const c of cas) {
      const res = await api().post('/api/v1/paiements').set(rc.fournisseur.h)
        .send({ partnership_id: rc.partenariat.id, method: 'especes', paid_on: aujourdhui(), ...c });
      expect(res.status).toBe(422);
    }
    const futur = await api().post('/api/v1/paiements').set(rc.fournisseur.h)
      .send({ partnership_id: rc.partenariat.id, amount: 10, method: 'especes', paid_on: ajouterJours(aujourdhui(), 3) });
    expect(futur.status).toBe(422);
    // Un tiers n'enregistre rien sur un partenariat qui n'est pas le sien.
    const tiers = await nouvelleEntreprise();
    const intrus = await api().post('/api/v1/paiements').set(tiers.h)
      .send({ partnership_id: rc.partenariat.id, amount: 10, method: 'especes', paid_on: aujourdhui() });
    expect(intrus.status).toBe(403);
  });

  test('dettes, créances et relevé : mêmes chiffres des deux côtés', async () => {
    const rc = await relationCommerciale();
    const f1 = await factureEmise(rc);
    const f2 = await factureEmise(rc);
    await api().post('/api/v1/paiements').set(rc.fournisseur.h)
      .send({ partnership_id: rc.partenariat.id, amount: f1.total, method: 'virement', paid_on: aujourdhui() });

    const dettes = (await api().get('/api/v1/situation/dettes').set(rc.acheteur.h)).body.data.payables;
    const creances = (await api().get('/api/v1/situation/creances').set(rc.fournisseur.h)).body.data.receivables;
    expect(dettes.totals).toMatchObject({ invoiced: f1.total + f2.total, paid: f1.total, balance: f2.total });
    expect(creances.totals).toMatchObject({ invoiced: f1.total + f2.total, paid: f1.total, balance: f2.total });
    expect(dettes.partners[0]).toMatchObject({ partner: { id: rc.fournisseur.companyId }, open_invoices: 1, paid_invoices: 1 });
    expect(creances.partners[0].partner.id).toBe(rc.acheteur.companyId);

    const releve = (await api().get(`/api/v1/partenariats/${rc.partenariat.id}/releve`).set(rc.acheteur.h)).body.data.statement;
    expect(releve).toMatchObject({ opening_balance: 0, closing_balance: f2.total, total_debit: f1.total + f2.total, total_credit: f1.total });
    expect(releve.lines.map((l) => l.type)).toEqual(['facture', 'facture', 'paiement']);
  });

  test('tâche quotidienne : rappel avant échéance puis facture EN RETARD, notifiés une seule fois', async () => {
    const rc = await relationCommerciale();
    const f = await factureEmise(rc);
    await sequelize.query('UPDATE invoices SET due_date = :d WHERE id = :id', { replacements: { d: ajouterJours(aujourdhui(), 2), id: f.id } });
    expect(await echeances.rappelsAvantEcheance()).toBeGreaterThanOrEqual(1);
    await echeances.rappelsAvantEcheance();
    expect(await compter('notifications', "user_id = :u AND type = 'echeance'", { u: rc.acheteur.user.id })).toBe(1);

    await sequelize.query("UPDATE invoices SET issue_date = issue_date - 30, due_date = :d WHERE id = :id", { replacements: { d: ajouterJours(aujourdhui(), -1), id: f.id } });
    expect(await echeances.marquerEnRetard()).toBeGreaterThanOrEqual(1);
    const facture = (await api().get(`/api/v1/factures/${f.id}`).set(rc.acheteur.h)).body.data.invoice;
    expect(facture.status).toBe('en_retard');
    expect(await compter('notifications', "user_id = :u AND type = 'echeance'", { u: rc.fournisseur.user.id })).toBe(1);
    const dettes = (await api().get('/api/v1/situation/dettes').set(rc.acheteur.h)).body.data.payables;
    expect(dettes.totals.overdue).toBe(f.total);
    // Un paiement partiel laisse la facture « en retard ».
    await api().post('/api/v1/paiements').set(rc.fournisseur.h).send({ partnership_id: rc.partenariat.id, amount: 1000, method: 'especes', paid_on: aujourdhui() });
    expect((await api().get(`/api/v1/factures/${f.id}`).set(rc.acheteur.h)).body.data.invoice.status).toBe('en_retard');
  });
});
