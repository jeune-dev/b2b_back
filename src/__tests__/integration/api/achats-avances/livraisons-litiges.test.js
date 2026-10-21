'use strict';

const {
  api, relationCommerciale, creerProduit, commandeEnvoyee, commandeReceptionnee, factureEmise, collaborateur, pngTest, compter, fermer,
} = require('../../../setup/helpers.js');

/**
 * Livraisons partielles (bons de livraison numérotés, réception livraison
 * par livraison, reliquat), bon de livraison PDF, retours et litiges avec
 * avoir, avoirs sur facture, soldes.
 *
 * Commande type : 10 sacs à 15 000 HT (TVA 18 %) + 4 kg à 2 500 (TVA 0) = 187 000 TTC.
 */

afterAll(fermer);

const binaire = (r, cb) => {
  const morceaux = [];
  r.on('data', (m) => morceaux.push(m));
  r.on('end', () => cb(null, Buffer.concat(morceaux)));
};

async function commandeValidee(rc) {
  const commande = await commandeEnvoyee(rc);
  await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});
  return commande;
}

describe('Livraisons partielles', () => {
  test('deux livraisons, réception de chacune, facture sur les quantités reçues cumulées', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeValidee(rc);

    const trop = await api().post(`/api/v1/ventes/${commande.id}/livraisons`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, quantity: 11 }] });
    expect(trop.body.error.code).toBe('LIVRAISON_INVALIDE');

    const l1 = await api().post(`/api/v1/ventes/${commande.id}/livraisons`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, quantity: 6 }], carrier: 'Camion 12' });
    expect(l1.status).toBe(201);
    expect(l1.body.data.order).toMatchObject({ status: 'livree_partiellement', deliveries_count: 1, actions: ['livrer', 'solder_reliquat'] });
    const bl1 = l1.body.data.order.deliveries[0];
    expect(bl1).toMatchObject({ delivery_no: 1, status: 'expediee', carrier: 'Camion 12' });
    expect(bl1.number).toMatch(/^BL-\d{4}-\d{5}$/);
    expect(await compter('notifications', "user_id = :u AND type = 'livraison_partielle'", { u: rc.acheteur.user.id })).toBe(1);

    // Réception de la 1re livraison : 5 reçus sur 6 → réserves ; la commande attend le reste.
    const r1 = await api().post(`/api/v1/achats/${commande.id}/livraisons/${bl1.id}/reception`).set(rc.acheteur.h)
      .send({ lines: [{ line_no: 1, received_quantity: 5 }], note: 'Un sac percé' });
    expect(r1.body.data.order.status).toBe('livree_partiellement');
    expect(r1.body.data.order.deliveries[0]).toMatchObject({ status: 'receptionnee', with_reserves: true });
    expect((await api().post(`/api/v1/achats/${commande.id}/livraisons/${bl1.id}/reception`).set(rc.acheteur.h).send({})).body.error.code).toBe('LIVRAISON_DEJA_RECEPTIONNEE');

    // Le reste en une livraison (sans lignes : tout le reliquat).
    const l2 = await api().post(`/api/v1/ventes/${commande.id}/livraisons`).set(rc.fournisseur.h).send({});
    expect(l2.body.data.order.status).toBe('livree');
    expect(l2.body.data.order.deliveries[1].lines.map((l) => [l.line_no, l.quantity])).toEqual([[1, 4], [2, 4]]);
    expect((await api().post(`/api/v1/ventes/${commande.id}/livraisons`).set(rc.fournisseur.h).send({})).status).toBe(409);

    const r2 = await api().post(`/api/v1/achats/${commande.id}/confirmer-reception`).set(rc.acheteur.h).send({});
    expect(r2.body.data.order).toMatchObject({ status: 'reception_confirmee', reception_with_reserves: true });
    const lignes = r2.body.data.order.validated_version.lines;
    expect(lignes.map((l) => [l.line_no, l.delivered_quantity, l.received_quantity])).toEqual([[1, 10, 9], [2, 4, 4]]);

    const facture = await factureEmise(rc, commande);
    expect(facture.total).toBe(9 * 15000 * 1.18 + 4 * 2500);

    // Bon de livraison PDF, vu des deux côtés ; liste des livraisons.
    for (const [cote, h] of [['ventes', rc.fournisseur.h], ['achats', rc.acheteur.h]]) {
      const pdf = await api().get(`/api/v1/${cote}/${commande.id}/livraisons/${bl1.id}/bon-de-livraison.pdf`).set(h).buffer(true).parse(binaire);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    }
    const liste = await api().get(`/api/v1/achats/${commande.id}/livraisons`).set(rc.acheteur.h);
    expect(liste.body.data.deliveries).toHaveLength(2);
  });

  test('reliquat soldé par l’acheteur : rien de plus à livrer ni à facturer ; bon de livraison signé joint', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeValidee(rc);
    expect((await api().post(`/api/v1/achats/${commande.id}/solder-reliquat`).set(rc.acheteur.h).send({ reason: 'Pas encore livré' })).body.error.code).toBe('TRANSITION_INVALIDE');
    const l1 = await api().post(`/api/v1/ventes/${commande.id}/livraisons`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, quantity: 6 }] });
    const bl = l1.body.data.order.deliveries[0];
    const signe = await api().post(`/api/v1/ventes/${commande.id}/livraisons/${bl.id}/document`).set(rc.fournisseur.h).attach('fichier', await pngTest(), 'bl-signe.png');
    expect(signe.status).toBe(201);
    expect(signe.body.data.deliveries[0].document_id).toBeTruthy();
    await api().post(`/api/v1/achats/${commande.id}/confirmer-reception`).set(rc.acheteur.h).send({});

    const solde = await api().post(`/api/v1/achats/${commande.id}/solder-reliquat`).set(rc.acheteur.h).send({ reason: 'Nous n’avons plus besoin du reste' });
    expect(solde.body.data.order).toMatchObject({ status: 'reception_confirmee', backorder_closed_by_side: 'acheteur' });
    expect(await compter('order_events', "order_id = :o AND type = 'reliquat_solde'", { o: commande.id })).toBe(1);
    const facture = await factureEmise(rc, commande);
    expect(facture.total).toBe(6 * 15000 * 1.18);
  });
});

describe('Retours et litiges', () => {
  test('litige accepté → avoir imputé sur la facture ; soldes et relevé à jour ; PDF de l’avoir', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeReceptionnee(rc);
    const facture = await factureEmise(rc, commande);
    expect(facture.total).toBe(187000);

    const excessif = await api().post('/api/v1/litiges').set(rc.acheteur.h).send({ order_id: commande.id, type: 'endommage', description: 'Sacs abîmés', lines: [{ line_no: 1, quantity: 11 }] });
    expect(excessif.body.error.code).toBe('LITIGE_INVALIDE');
    const ouvert = await api().post('/api/v1/litiges').set(rc.acheteur.h).send({
      order_id: commande.id, type: 'endommage', description: 'Deux sacs déchirés à l’arrivée', lines: [{ line_no: 1, quantity: 2, comment: 'Sacs 3 et 7' }],
    });
    expect(ouvert.status).toBe(201);
    const litige = ouvert.body.data.claim;
    expect(litige).toMatchObject({ status: 'ouvert', total: 35400, side: 'acheteur' });
    expect(litige.number).toMatch(/^LIT-\d{4}-\d{5}$/);
    expect(await compter('notifications', "user_id = :u AND type = 'litige'", { u: rc.fournisseur.user.id })).toBe(1);

    const photo = await api().post(`/api/v1/litiges/${litige.id}/pieces-jointes`).set(rc.acheteur.h).attach('fichier', await pngTest(), 'sac.png');
    expect(photo.body.data.claim.attachments).toHaveLength(1);
    const vuFournisseur = await api().get(`/api/v1/litiges/${litige.id}`).set(rc.fournisseur.h);
    expect(vuFournisseur.body.data.claim).toMatchObject({ side: 'fournisseur', attachments: [expect.objectContaining({ category: 'piece_jointe' })] });

    // Le commercial traite les ventes mais n'émet pas d'avoir.
    const commercial = await collaborateur(rc.fournisseur, 'commercial');
    expect((await api().post(`/api/v1/litiges/${litige.id}/accepter`).set(commercial.h).send({})).status).toBe(403);

    const accepte = await api().post(`/api/v1/litiges/${litige.id}/accepter`).set(rc.fournisseur.h).send({ response: 'Désolés, avoir émis' });
    expect(accepte.body.data.claim).toMatchObject({ status: 'accepte', credit_note: { total: 35400, status: 'emis' } });
    const avoirId = accepte.body.data.claim.credit_note.id;

    const f = (await api().get(`/api/v1/factures/${facture.id}`).set(rc.acheteur.h)).body.data.invoice;
    expect(f).toMatchObject({ amount_paid: 35400, amount_credited: 35400, balance_due: 151600, status: 'partiellement_payee' });
    const dettes = (await api().get('/api/v1/situation/dettes').set(rc.acheteur.h)).body.data;
    expect(dettes.payables.totals).toMatchObject({ invoiced: 187000, credited: 35400, balance: 151600 });
    const releve = (await api().get(`/api/v1/partenariats/${rc.partenariat.id}/releve`).set(rc.fournisseur.h)).body.data.statement;
    expect(releve.lines.map((l) => [l.type, l.debit, l.credit])).toEqual([['facture', 187000, 0], ['avoir', 0, 35400]]);
    expect(releve.closing_balance).toBe(151600);

    const pdf = await api().get(`/api/v1/avoirs/${avoirId}/pdf`).set(rc.acheteur.h).buffer(true).parse(binaire);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await api().get('/api/v1/avoirs?sens=recus').set(rc.acheteur.h)).body.data.items).toHaveLength(1);

    // Au plus le reçu non encore contesté : 10 reçus − 2 en litige = 8.
    const encore = await api().post('/api/v1/litiges').set(rc.acheteur.h).send({ order_id: commande.id, type: 'manquant', description: 'Manquants', lines: [{ line_no: 1, quantity: 9 }] });
    expect(encore.body.error.code).toBe('LITIGE_INVALIDE');

    // Annulation de l'avoir : facture de nouveau due, litige rouvert.
    const annule = await api().post(`/api/v1/avoirs/${avoirId}/annuler`).set(rc.fournisseur.h).send({ reason: 'Erreur de saisie' });
    expect(annule.body.data.credit_note.status).toBe('annule');
    expect((await api().get(`/api/v1/factures/${facture.id}`).set(rc.acheteur.h)).body.data.invoice).toMatchObject({ amount_paid: 0, amount_credited: 0, status: 'emise' });
    expect((await api().get(`/api/v1/litiges/${litige.id}`).set(rc.acheteur.h)).body.data.claim).toMatchObject({ status: 'ouvert', credit_note: null });
  });

  test('litige refusé, litige retiré ; commande non livrée refusée ; avoir avant facture imputé à l’émission ; retour en stock', async () => {
    const rc = await relationCommerciale();
    const suivi = await creerProduit(rc.fournisseur, { stock_quantity: 50, price: 1000, tax_rate: 0 });
    const enCours = await commandeEnvoyee(rc);
    expect((await api().post('/api/v1/litiges').set(rc.acheteur.h).send({ order_id: enCours.id, type: 'manquant', description: 'Rien reçu', lines: [{ line_no: 1, quantity: 1 }] })).body.error.code).toBe('COMMANDE_NON_LIVREE');

    const commande = await commandeReceptionnee(rc, [{ product_id: suivi.id, quantity: 10 }]);
    const ouvrir = (quantite) => api().post('/api/v1/litiges').set(rc.acheteur.h).send({ order_id: commande.id, type: 'non_conforme', description: 'Mauvaise qualité', lines: [{ line_no: 1, quantity: quantite }] });

    const r1 = (await ouvrir(1)).body.data.claim;
    const refuse = await api().post(`/api/v1/litiges/${r1.id}/refuser`).set(rc.fournisseur.h).send({ response: 'Produit conforme au bon' });
    expect(refuse.body.data.claim.status).toBe('refuse');
    expect((await api().post(`/api/v1/litiges/${r1.id}/accepter`).set(rc.fournisseur.h).send({})).body.error.code).toBe('LITIGE_CLOS');

    const r2 = (await ouvrir(1)).body.data.claim;
    expect((await api().post(`/api/v1/litiges/${r2.id}/annuler`).set(rc.acheteur.h).send({})).body.data.claim.status).toBe('annule');

    // Accepté AVANT la facture, avec reprise de la marchandise.
    const r3 = (await ouvrir(3)).body.data.claim;
    const accepte = await api().post(`/api/v1/litiges/${r3.id}/accepter`).set(rc.fournisseur.h).send({ restock: true });
    expect(accepte.body.data.claim.credit_note).toMatchObject({ total: 3000 });
    const produit = (await api().get(`/api/v1/produits/${suivi.id}`).set(rc.fournisseur.h)).body.data.product;
    expect(Number(produit.stock_quantity)).toBe(43); // 50 − 10 livrés + 3 repris

    const facture = await factureEmise(rc, commande);
    expect(facture).toMatchObject({ total: 10000, amount_paid: 3000, amount_credited: 3000, balance_due: 7000 });
    const creances = (await api().get('/api/v1/situation/creances').set(rc.fournisseur.h)).body.data;
    expect(creances.receivables.totals).toMatchObject({ balance: 7000, credited: 3000 });

    const histo = await api().get(`/api/v1/achats/${commande.id}/historique`).set(rc.acheteur.h);
    expect(histo.body.data.events.map((e) => e.type).filter((t) => ['litige', 'avoir'].includes(t))).toEqual(['litige', 'litige', 'litige', 'litige', 'litige', 'avoir']);
    const liste = await api().get(`/api/v1/litiges?order_id=${commande.id}&status=ouvert`).set(rc.fournisseur.h);
    expect(liste.body.data.items).toHaveLength(0);
  });

  test('avoir sur facture (geste commercial) ; jamais au-delà du montant facturé', async () => {
    const rc = await relationCommerciale();
    const facture = await factureEmise(rc);
    const emis = await api().post('/api/v1/avoirs').set(rc.fournisseur.h).send({ invoice_id: facture.id, reason: 'Remise fidélité', lines: [{ line_no: 2, quantity: 4 }] });
    expect(emis.status).toBe(201);
    expect(emis.body.data.credit_note).toMatchObject({ total: 10000, amount_allocated: 10000, direction: 'emis' });
    expect(emis.body.data.credit_note.number).toMatch(/^AV-\d{4}-\d{5}$/);
    const excessif = await api().post('/api/v1/avoirs').set(rc.fournisseur.h).send({ invoice_id: facture.id, reason: 'Trop', lines: [{ line_no: 1, quantity: 10 }, { line_no: 2, quantity: 4 }] });
    expect(excessif.body.error.code).toBe('AVOIR_EXCESSIF');
    expect((await api().post('/api/v1/avoirs').set(rc.fournisseur.h).send({ invoice_id: facture.id, reason: 'Erreur de ligne', lines: [{ line_no: 9, quantity: 1 }] })).body.error.code).toBe('LIGNES_INVALIDES');
    expect((await api().post('/api/v1/avoirs').set(rc.acheteur.h).send({ invoice_id: facture.id, reason: 'Moi', lines: [{ line_no: 2, quantity: 1 }] })).status).toBe(403);
    // Facture avec avoir imputé : elle ne s'annule plus.
    expect((await api().post(`/api/v1/factures/${facture.id}/annuler`).set(rc.fournisseur.h).send({ reason: 'Erreur' })).body.error.code).toBe('FACTURE_PAYEE');
  });
});
