'use strict';

const {
  api, relationCommerciale, creerBrouillon, commandeEnvoyee, nouvelleEntreprise, creerProduit, compter, pdfTest, fermer,
} = require('../../../setup/helpers.js');

/**
 * Processus de commande (§ 9 à § 13) : bon de commande, envoi, traitement par
 * le fournisseur (accepter / modifier / refuser), validation, statuts,
 * livraison, réception — et toutes les règles qui les protègent.
 */

afterAll(fermer);

describe('§ 9 — création du bon de commande', () => {
  test('le brouillon est généré : numéro, parties, lignes figées, totaux HT / TVA / TTC calculés par le serveur', async () => {
    const rc = await relationCommerciale();
    const commande = await creerBrouillon(rc.acheteur, rc.fournisseur, [
      { product_id: rc.produits[0].id, quantity: 10 },
      { product_id: rc.produits[1].id, quantity: 2.5 },
    ], { buyer_reference: 'DA-2026-118', delivery_address: 'Entrepôt Rufisque' });

    expect(commande.number).toMatch(/^BC-\d{4}-\d{5}$/);
    expect(commande.status).toBe('brouillon');
    expect(commande.side).toBe('acheteur');
    expect(commande.actions).toEqual(expect.arrayContaining(['envoyer', 'modifier', 'annuler']));
    // 10 × 15 000 = 150 000 HT, TVA 18 % = 27 000 ; 2,5 × 2 500 = 6 250 HT sans TVA.
    expect(commande.subtotal).toBe(156250);
    expect(commande.tax_total).toBe(27000);
    expect(commande.total).toBe(183250);
    const lignes = commande.current_version.lines;
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatchObject({ line_no: 1, reference: rc.produits[0].reference, unit: 'sac', quantity: 10, unit_price: 15000, line_total: 177000 });
    expect(lignes[1]).toMatchObject({ quantity: 2.5, line_subtotal: 6250, line_tax: 0 });
  });

  test('un fournisseur SANS partenariat actif ne peut pas recevoir de commande (403 PARTENARIAT_INACTIF)', async () => {
    const acheteur = await nouvelleEntreprise({ type: 'acheteur' });
    const fournisseur = await nouvelleEntreprise({ type: 'fournisseur' });
    const produit = await creerProduit(fournisseur);
    const res = await api().post('/api/v1/achats').set(acheteur.h)
      .send({ supplier_id: fournisseur.companyId, lines: [{ product_id: produit.id, quantity: 1 }] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PARTENARIAT_INACTIF');
  });

  test('produits d’un AUTRE fournisseur, en rupture, en double ou sous le minimum : 422', async () => {
    const rc = await relationCommerciale();
    const autre = await nouvelleEntreprise({ type: 'fournisseur' });
    const etranger = await creerProduit(autre);
    const rupture = await creerProduit(rc.fournisseur, { availability: 'rupture' });
    const minimum = await creerProduit(rc.fournisseur, { min_order_quantity: 5 });

    const cas = [
      [{ product_id: etranger.id, quantity: 1 }],
      [{ product_id: rupture.id, quantity: 1 }],
      [{ product_id: rc.produits[0].id, quantity: 1 }, { product_id: rc.produits[0].id, quantity: 2 }],
      [{ product_id: minimum.id, quantity: 2 }],
    ];
    for (const lignes of cas) {
      const res = await api().post('/api/v1/achats').set(rc.acheteur.h).send({ supplier_id: rc.fournisseur.companyId, lines: lignes });
      expect(res.status).toBe(422);
    }
    const vide = await api().post('/api/v1/achats').set(rc.acheteur.h).send({ supplier_id: rc.fournisseur.companyId, lines: [] });
    expect(vide.status).toBe(422);
  });

  test('le brouillon est INVISIBLE pour le fournisseur, modifiable par l’acheteur, puis envoyé (notification au fournisseur)', async () => {
    const rc = await relationCommerciale();
    const brouillon = await creerBrouillon(rc.acheteur, rc.fournisseur, [{ product_id: rc.produits[0].id, quantity: 1 }]);
    expect((await api().get(`/api/v1/ventes/${brouillon.id}`).set(rc.fournisseur.h)).status).toBe(404);
    const liste = await api().get('/api/v1/ventes').set(rc.fournisseur.h);
    expect(liste.body.data.items.find((o) => o.id === brouillon.id)).toBeUndefined();

    const modif = await api().patch(`/api/v1/achats/${brouillon.id}`).set(rc.acheteur.h)
      .send({ lines: [{ product_id: rc.produits[0].id, quantity: 3 }], conditions: 'Livraison avant 10 h', revision: brouillon.revision });
    expect(modif.status).toBe(200);
    expect(modif.body.data.order.total).toBe(3 * 15000 * 1.18);

    const envoi = await api().post(`/api/v1/achats/${brouillon.id}/envoyer`).set(rc.acheteur.h).send({});
    expect(envoi.status).toBe(200);
    expect(envoi.body.data.order.status).toBe('envoyee');
    expect(envoi.body.data.order.sent_at).toBeTruthy();
    expect(await compter('notifications', "user_id = :u AND type = 'nouveau_bon_commande'", { u: rc.fournisseur.user.id })).toBe(1);

    const vue = await api().get(`/api/v1/ventes/${brouillon.id}`).set(rc.fournisseur.h);
    expect(vue.status).toBe(200);
    expect(vue.body.data.order.side).toBe('fournisseur');
    expect(vue.body.data.order.actions).toEqual(expect.arrayContaining(['accepter', 'proposer', 'refuser']));

    // Après envoi, le bon n'est plus modifiable par l'acheteur.
    const tardive = await api().patch(`/api/v1/achats/${brouillon.id}`).set(rc.acheteur.h).send({ conditions: 'x' });
    expect(tardive.status).toBe(409);
    expect(tardive.body.error.code).toBe('COMMANDE_NON_MODIFIABLE');
  });

  test('concurrence web / mobile : une révision périmée est refusée (409 COMMANDE_MODIFIEE)', async () => {
    const rc = await relationCommerciale();
    const brouillon = await creerBrouillon(rc.acheteur, rc.fournisseur, [{ product_id: rc.produits[0].id, quantity: 1 }]);
    await api().patch(`/api/v1/achats/${brouillon.id}`).set(rc.acheteur.h).send({ conditions: 'v2' });
    const res = await api().post(`/api/v1/achats/${brouillon.id}/envoyer`).set(rc.acheteur.h).send({ revision: brouillon.revision });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COMMANDE_MODIFIEE');
  });
});

describe('§ 10 / § 11 — traitement par le fournisseur et validation', () => {
  test('option 1 : accepter telle quelle → commande VALIDÉE, notification à l’acheteur', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeEnvoyee(rc);
    const prise = await api().post(`/api/v1/ventes/${commande.id}/prendre-en-charge`).set(rc.fournisseur.h).send({});
    expect(prise.body.data.order.status).toBe('en_attente_validation');
    const res = await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({ comment: 'OK pour demain' });
    expect(res.status).toBe(200);
    expect(res.body.data.order).toMatchObject({ status: 'validee', validated_version_no: 1 });
    expect(res.body.data.order.validated_version.status).toBe('acceptee');
    expect(await compter('notifications', "user_id = :u AND type = 'commande_acceptee'", { u: rc.acheteur.user.id })).toBe(1);
  });

  test('option 2 : proposition modifiée (quantité, indisponible, remplacement, prix) → l’acheteur accepte → validée sur la NOUVELLE version', async () => {
    const rc = await relationCommerciale();
    const substitut = await creerProduit(rc.fournisseur, { price: 2800, tax_rate: 0, unit: 'kg' });
    const commande = await commandeEnvoyee(rc);
    const prop = await api().post(`/api/v1/ventes/${commande.id}/proposer`).set(rc.fournisseur.h).send({
      comment: 'Stock partiel',
      lines: [
        { line_no: 1, quantity: 8, unit_price: 14500 },
        { line_no: 2, unavailable: true, comment: 'Rupture fournisseur' },
        { product_id: substitut.id, quantity: 4, substitute_for_line_no: 2 },
      ],
    });
    expect(prop.status).toBe(200);
    const o = prop.body.data.order;
    expect(o.status).toBe('proposition_modifiee');
    expect(o.current_version_no).toBe(2);
    const [l1, l2, l3] = o.current_version.lines;
    expect(l1).toMatchObject({ change_type: 'quantite_modifiee', quantity: 8, original_quantity: 10, unit_price: 14500, original_unit_price: 15000 });
    expect(l2).toMatchObject({ change_type: 'indisponible', quantity: 0, line_total: 0 });
    expect(l3).toMatchObject({ change_type: 'substitution', substitute_for_line_no: 2, line_no: 3, quantity: 4 });
    // 8 × 14 500 × 1,18 + 4 × 2 800 = 136 880 + 11 200.
    expect(o.total).toBe(148080);
    expect(await compter('notifications', "user_id = :u AND type = 'produit_indisponible'", { u: rc.acheteur.user.id })).toBe(1);

    // Le fournisseur ne peut pas valider sa propre proposition.
    const auto = await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});
    expect(auto.status).toBe(409);

    const acceptation = await api().post(`/api/v1/achats/${commande.id}/accepter-proposition`).set(rc.acheteur.h).send({});
    expect(acceptation.status).toBe(200);
    expect(acceptation.body.data.order).toMatchObject({ status: 'validee', validated_version_no: 2, total: 148080 });

    // § 11 — les deux parties ont la même version validée.
    const vueF = await api().get(`/api/v1/ventes/${commande.id}`).set(rc.fournisseur.h);
    expect(vueF.body.data.order.validated_version.lines).toEqual(acceptation.body.data.order.validated_version.lines);
    const versions = await api().get(`/api/v1/achats/${commande.id}/versions`).set(rc.acheteur.h);
    expect(versions.body.data.versions.map((v) => [v.version_no, v.status, v.proposed_by_side])).toEqual([
      [1, 'remplacee', 'acheteur'], [2, 'acceptee', 'fournisseur'],
    ]);
  });

  test('l’acheteur demande une nouvelle modification (contre-proposition) puis le fournisseur accepte', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeEnvoyee(rc);
    await api().post(`/api/v1/ventes/${commande.id}/proposer`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, quantity: 5 }] });
    const demande = await api().post(`/api/v1/achats/${commande.id}/demander-modification`).set(rc.acheteur.h)
      .send({ comment: 'Il nous faut au moins 7 sacs', lines: [{ line_no: 1, quantity: 7 }] });
    expect(demande.status).toBe(200);
    expect(demande.body.data.order).toMatchObject({ status: 'en_attente_validation', current_version_no: 3 });
    expect(demande.body.data.order.current_version.lines[0]).toMatchObject({ quantity: 7, change_type: 'quantite_modifiee' });
    // L'acheteur ne peut pas changer un prix.
    const prix = await api().post(`/api/v1/ventes/${commande.id}/proposer`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, quantity: 7 }] });
    expect(prix.status).toBe(422);
    const ok = await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});
    expect(ok.body.data.order).toMatchObject({ status: 'validee', validated_version_no: 3 });
  });

  test('refus de la proposition → commande annulée ; refus du fournisseur → refusée ; aucune proposition vide', async () => {
    const rc = await relationCommerciale();
    const c1 = await commandeEnvoyee(rc);
    const vide = await api().post(`/api/v1/ventes/${c1.id}/proposer`).set(rc.fournisseur.h)
      .send({ lines: [{ line_no: 1, unavailable: true }, { line_no: 2, unavailable: true }] });
    expect(vide.status).toBe(422);
    expect(vide.body.error.code).toBe('COMMANDE_VIDE');
    const inchange = await api().post(`/api/v1/ventes/${c1.id}/proposer`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, quantity: 10 }] });
    expect(inchange.body.error.code).toBe('AUCUNE_MODIFICATION');

    await api().post(`/api/v1/ventes/${c1.id}/proposer`).set(rc.fournisseur.h).send({ lines: [{ line_no: 1, quantity: 2 }] });
    const refus = await api().post(`/api/v1/achats/${c1.id}/refuser-proposition`).set(rc.acheteur.h).send({ reason: 'Quantité insuffisante' });
    expect(refus.body.data.order).toMatchObject({ status: 'annulee', cancelled_by_side: 'acheteur', cancellation_reason: 'Quantité insuffisante' });

    const c2 = await commandeEnvoyee(rc);
    const refusF = await api().post(`/api/v1/ventes/${c2.id}/refuser`).set(rc.fournisseur.h).send({ reason: 'Hors zone de livraison' });
    expect(refusF.body.data.order).toMatchObject({ status: 'refusee', refusal_reason: 'Hors zone de livraison' });
    const apres = await api().post(`/api/v1/ventes/${c2.id}/accepter`).set(rc.fournisseur.h).send({});
    expect(apres.status).toBe(409);
    expect(apres.body.error.code).toBe('TRANSITION_INVALIDE');
  });
});

describe('§ 12 / § 13 — statuts, livraison, réception', () => {
  test('préparation → prête → livrée (bon de livraison) → réception partielle avec réserves', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeEnvoyee(rc);
    await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});

    // L'acheteur ne fait pas avancer les statuts opérationnels.
    const interdit = await api().post(`/api/v1/ventes/${commande.id}/statut`).set(rc.acheteur.h).send({ status: 'prete' });
    expect(interdit.status).toBe(403);
    // Réception impossible avant livraison.
    const tot = await api().post(`/api/v1/achats/${commande.id}/confirmer-reception`).set(rc.acheteur.h).send({});
    expect(tot.status).toBe(409);

    for (const statut of ['en_preparation', 'prete']) {
      const r = await api().post(`/api/v1/ventes/${commande.id}/statut`).set(rc.fournisseur.h).send({ status: statut });
      expect(r.body.data.order.status).toBe(statut);
    }
    const livraison = await api().post(`/api/v1/ventes/${commande.id}/livrer`).set(rc.fournisseur.h)
      .field('note', 'Livré par camion 12').attach('fichier', pdfTest(), 'bl.pdf');
    expect(livraison.status).toBe(200);
    expect(livraison.body.data.order).toMatchObject({ status: 'livree', delivery_note: 'Livré par camion 12' });
    expect(await compter('documents', "entity_id = :o AND category = 'bon_livraison' AND visibility = 'partenaire'", { o: commande.id })).toBe(1);
    expect(await compter('notifications', "user_id = :u AND type = 'commande_livree'", { u: rc.acheteur.user.id })).toBe(1);

    const trop = await api().post(`/api/v1/achats/${commande.id}/confirmer-reception`).set(rc.acheteur.h)
      .send({ lines: [{ line_no: 1, received_quantity: 11 }] });
    expect(trop.status).toBe(422);
    const reception = await api().post(`/api/v1/achats/${commande.id}/confirmer-reception`).set(rc.acheteur.h)
      .send({ lines: [{ line_no: 1, received_quantity: 9 }], note: 'Un sac percé' });
    expect(reception.status).toBe(200);
    expect(reception.body.data.order).toMatchObject({ status: 'reception_confirmee', reception_with_reserves: true });
    expect(reception.body.data.order.validated_version.lines[0].received_quantity).toBe(9);
    expect(reception.body.data.order.validated_version.lines[1].received_quantity).toBe(4);
  });

  test('annulation : l’acheteur avant préparation ; le fournisseur seulement une commande validée', async () => {
    const rc = await relationCommerciale();
    const c1 = await commandeEnvoyee(rc);
    const avant = await api().post(`/api/v1/ventes/${c1.id}/annuler`).set(rc.fournisseur.h).send({ reason: 'Erreur' });
    expect(avant.status).toBe(403);
    const ok = await api().post(`/api/v1/achats/${c1.id}/annuler`).set(rc.acheteur.h).send({ reason: 'Plus besoin' });
    expect(ok.body.data.order.status).toBe('annulee');
    expect(await compter('notifications', "user_id = :u AND type = 'commande_annulee'", { u: rc.fournisseur.user.id })).toBe(1);

    const c2 = await commandeEnvoyee(rc);
    await api().post(`/api/v1/ventes/${c2.id}/accepter`).set(rc.fournisseur.h).send({});
    await api().post(`/api/v1/ventes/${c2.id}/statut`).set(rc.fournisseur.h).send({ status: 'en_preparation' });
    const tard = await api().post(`/api/v1/achats/${c2.id}/annuler`).set(rc.acheteur.h).send({ reason: 'Trop tard' });
    expect(tard.status).toBe(409);
  });

  test('§ 20 — historique complet : qui, quoi, quand ; échanges et pièces jointes', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeEnvoyee(rc);
    await api().post(`/api/v1/ventes/${commande.id}/commentaires`).set(rc.fournisseur.h).send({ message: 'Livraison possible jeudi ?' });
    const pj = await api().post(`/api/v1/achats/${commande.id}/pieces-jointes`).set(rc.acheteur.h)
      .field('description', 'Plan d’accès').attach('fichier', pdfTest(), 'plan.pdf');
    expect(pj.status).toBe(201);
    // La pièce jointe est lisible par le fournisseur (visibilité partenaire).
    const lecture = await api().get(`/api/v1/documents/${pj.body.data.document.id}/fichier`).set(rc.fournisseur.h);
    expect(lecture.status).toBe(200);
    await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(rc.fournisseur.h).send({});
    const h = await api().get(`/api/v1/achats/${commande.id}/historique`).set(rc.acheteur.h);
    expect(h.body.data.events.map((e) => e.type)).toEqual(['creation', 'envoi', 'commentaire', 'piece_jointe', 'acceptation']);
    const acceptation = h.body.data.events[4];
    expect(acceptation).toMatchObject({ actor_side: 'fournisseur', from_status: 'envoyee', to_status: 'validee' });
    expect(acceptation.actorCompany.id).toBe(rc.fournisseur.companyId);
    expect(acceptation.actor.first_name).toBeTruthy();
  });

  test('bon de commande PDF (acheteur et fournisseur)', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeEnvoyee(rc);
    for (const [qui, chemin] of [[rc.acheteur, 'achats'], [rc.fournisseur, 'ventes']]) {
      const res = await api().get(`/api/v1/${chemin}/${commande.id}/bon-de-commande.pdf`).set(qui.h).buffer(true).parse((r, cb) => {
        const morceaux = [];
        r.on('data', (m) => morceaux.push(m));
        r.on('end', () => cb(null, Buffer.concat(morceaux)));
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });
});

describe('Séparation des données (§ 6, § 24)', () => {
  test('une entreprise tierce ne voit ni ne touche les commandes des autres (403) ; côté imposé par la route', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeEnvoyee(rc);
    const tiers = await nouvelleEntreprise({ type: 'mixte' });
    for (const url of [`/api/v1/achats/${commande.id}`, `/api/v1/ventes/${commande.id}`, `/api/v1/achats/${commande.id}/historique`]) {
      const res = await api().get(url).set(tiers.h);
      expect(res.status).toBe(403);
    }
    const action = await api().post(`/api/v1/ventes/${commande.id}/accepter`).set(tiers.h).send({});
    expect(action.status).toBe(403);
    // Le fournisseur n'accède pas à la commande par la route des achats.
    const mauvaisCote = await api().get(`/api/v1/achats/${commande.id}`).set(rc.fournisseur.h);
    expect(mauvaisCote.status).toBe(403);
    // Un identifiant malformé est refusé à la validation.
    expect((await api().get('/api/v1/achats/pas-un-uuid').set(rc.acheteur.h)).status).toBe(422);
  });

  test('profil : une entreprise uniquement acheteuse n’a pas d’espace ventes, ni de catalogue', async () => {
    const acheteur = await nouvelleEntreprise({ type: 'acheteur' });
    const ventes = await api().get('/api/v1/ventes').set(acheteur.h);
    expect(ventes.status).toBe(403);
    expect(ventes.body.error.code).toBe('PROFIL_ENTREPRISE_INCOMPATIBLE');
    expect((await api().post('/api/v1/produits').set(acheteur.h).send({ reference: 'X', name: 'X', unit: 'kg', price: 1 })).status).toBe(403);
  });

  test('listes filtrées : statut multiple, recherche, synchronisation incrémentale', async () => {
    const rc = await relationCommerciale();
    const c1 = await commandeEnvoyee(rc);
    const avant = new Date().toISOString();
    const c2 = await commandeEnvoyee(rc);
    await api().post(`/api/v1/ventes/${c2.id}/accepter`).set(rc.fournisseur.h).send({});
    const parStatut = await api().get('/api/v1/achats?status=envoyee,validee&tri=-created_at').set(rc.acheteur.h);
    expect(parStatut.body.data.items.map((o) => o.id)).toEqual([c2.id, c1.id]);
    const recherche = await api().get(`/api/v1/ventes?q=${encodeURIComponent(c1.number)}`).set(rc.fournisseur.h);
    expect(recherche.body.data.items.map((o) => o.id)).toEqual([c1.id]);
    const sync = await api().get(`/api/v1/achats?modifie_depuis=${encodeURIComponent(avant)}`).set(rc.acheteur.h);
    expect(sync.body.data.items.map((o) => o.id)).toEqual([c2.id]);
    const aTraiter = await api().get('/api/v1/ventes?a_traiter=true').set(rc.fournisseur.h);
    expect(aTraiter.body.data.pagination.total).toBe(2);
  });
});
