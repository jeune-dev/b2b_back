'use strict';

const {
  api, relationCommerciale, creerBrouillon, commandeEnvoyee, commandeReceptionnee, factureEmise, collaborateur, compter, fermer, sequelize,
} = require('../../../setup/helpers.js');

/**
 * Circuit d'approbation interne des bons de commande (seuils de montant,
 * approbateurs distincts de l'auteur) et plafond de crédit du client.
 */

afterAll(fermer);

const seuils = (acheteur, niveaux) => api().patch('/api/v1/entreprise/parametres').set(acheteur.h).send({ order_approval_levels: niveaux });

/** Bon de commande de 10 sacs (177 000 FCFA TTC) créé par un responsable achats. */
async function bonDeResponsable(rc) {
  const responsable = await collaborateur(rc.acheteur, 'responsable_achats');
  const res = await api().post('/api/v1/achats').set(responsable.h).send({ supplier_id: rc.fournisseur.companyId, lines: [{ product_id: rc.produits[0].id, quantity: 10 }] });
  return { responsable, commande: res.body.data.order };
}

describe('Circuit d’approbation interne', () => {
  test('au-delà du seuil : soumis, l’auteur ne peut pas approuver, l’approbation envoie automatiquement', async () => {
    const rc = await relationCommerciale();
    await seuils(rc.acheteur, [{ min_total: 100000, approvals: 1 }]);
    const { responsable, commande } = await bonDeResponsable(rc);

    const envoi = await api().post(`/api/v1/achats/${commande.id}/envoyer`).set(responsable.h).send({});
    expect(envoi.status).toBe(200);
    expect(envoi.body.data.submitted_for_approval).toBe(true);
    expect(envoi.body.data.order).toMatchObject({ status: 'brouillon', approval_status: 'en_attente', approvals_required: 1, actions: ['modifier', 'annuler', 'approuver', 'rejeter_approbation'] });
    expect(await compter('notifications', "user_id = :u AND type = 'approbation_requise'", { u: rc.acheteur.user.id })).toBe(1);
    // Rien n'est encore parti chez le fournisseur.
    expect((await api().get(`/api/v1/ventes/${commande.id}`).set(rc.fournisseur.h)).status).toBe(404);
    expect((await api().post(`/api/v1/achats/${commande.id}/envoyer`).set(responsable.h).send({})).body.error.code).toBe('APPROBATION_EN_COURS');

    // L'auteur ne s'approuve pas lui-même.
    expect((await api().post(`/api/v1/achats/${commande.id}/approuver`).set(responsable.h).send({})).body.error.code).toBe('APPROBATION_PAR_AUTEUR');

    const aTraiter = await api().get('/api/v1/achats/approbations').set(rc.acheteur.h);
    expect(aTraiter.body.data.items.map((o) => o.id)).toEqual([commande.id]);
    const approuve = await api().post(`/api/v1/achats/${commande.id}/approuver`).set(rc.acheteur.h).send({ comment: 'OK budget' });
    expect(approuve.status).toBe(200);
    expect(approuve.body.data.sent).toBe(true);
    expect(approuve.body.data.order).toMatchObject({ status: 'envoyee', approval_status: 'approuvee' });
    expect(approuve.body.data.order.approvals).toEqual([expect.objectContaining({ decision: 'approuvee', comment: 'OK budget' })]);
    expect(await compter('notifications', "user_id = :u AND type = 'commande_approuvee'", { u: responsable.user.id })).toBe(1);

    // Le fournisseur ne voit ni le circuit ni la vie du brouillon.
    const vue = await api().get(`/api/v1/ventes/${commande.id}`).set(rc.fournisseur.h);
    expect(vue.body.data.order).not.toHaveProperty('approval_status');
    const histo = await api().get(`/api/v1/ventes/${commande.id}/historique`).set(rc.fournisseur.h);
    expect(histo.body.data.events.map((e) => e.type)).toEqual(['envoi']);
    const histoAcheteur = await api().get(`/api/v1/achats/${commande.id}/historique`).set(rc.acheteur.h);
    expect(histoAcheteur.body.data.events.map((e) => e.type)).toEqual(['creation', 'soumission_approbation', 'approbation', 'envoi']);
  });

  test('deux approbations au palier supérieur ; rejet puis correction ; sous le seuil : envoi direct', async () => {
    const rc = await relationCommerciale();
    await seuils(rc.acheteur, [{ min_total: 100000, approvals: 1 }, { min_total: 150000, approvals: 2 }]);
    const { responsable, commande } = await bonDeResponsable(rc);
    const second = await collaborateur(rc.acheteur, 'responsable_achats');

    // Deux approbateurs possibles en plus de l'auteur : l'administrateur et le second responsable.
    await api().post(`/api/v1/achats/${commande.id}/envoyer`).set(responsable.h).send({});
    const premier = await api().post(`/api/v1/achats/${commande.id}/approuver`).set(rc.acheteur.h).send({});
    expect(premier.body.data).toMatchObject({ sent: false, order: { status: 'brouillon', approval_status: 'en_attente' } });
    expect((await api().post(`/api/v1/achats/${commande.id}/approuver`).set(rc.acheteur.h).send({})).body.error.code).toBe('DECISION_DEJA_PRISE');

    const rejet = await api().post(`/api/v1/achats/${commande.id}/rejeter-approbation`).set(second.h).send({ comment: 'Trop de sacs ce mois-ci' });
    expect(rejet.body.data.order.approval_status).toBe('rejetee');
    expect(await compter('notifications', "user_id = :u AND type = 'approbation_rejetee'", { u: responsable.user.id })).toBe(1);

    // Correction sous le seuil : plus d'approbation requise, l'envoi est direct.
    const corrige = await api().patch(`/api/v1/achats/${commande.id}`).set(responsable.h).send({ lines: [{ product_id: rc.produits[0].id, quantity: 4 }] });
    expect(corrige.body.data.order.approval_status).toBe('non_requise');
    const envoi = await api().post(`/api/v1/achats/${commande.id}/envoyer`).set(responsable.h).send({});
    expect(envoi.body.data).toMatchObject({ submitted_for_approval: false, order: { status: 'envoyee' } });
  });

  test('approbateurs insuffisants → 409 ; seuils invalides refusés ; réceptionnaire sans droit d’approuver', async () => {
    const rc = await relationCommerciale();
    expect((await seuils(rc.acheteur, [{ min_total: 1000, approvals: 4 }])).status).toBe(422);
    await seuils(rc.acheteur, [{ min_total: 1000, approvals: 2 }]);
    const brouillon = await creerBrouillon(rc.acheteur, rc.fournisseur, [{ product_id: rc.produits[0].id, quantity: 2 }]);
    const refus = await api().post(`/api/v1/achats/${brouillon.id}/envoyer`).set(rc.acheteur.h).send({});
    expect(refus.status).toBe(409);
    expect(refus.body.error).toMatchObject({ code: 'APPROBATEURS_INSUFFISANTS', details: { requises: 2, disponibles: 0 } });
    const recep = await collaborateur(rc.acheteur, 'receptionnaire');
    expect((await api().get('/api/v1/achats/approbations').set(recep.h)).status).toBe(403);
    expect((await api().post(`/api/v1/achats/${brouillon.id}/approuver`).set(rc.acheteur.h).send({})).body.error.code).toBe('AUCUNE_APPROBATION');
  });
});

describe('Plafond de crédit et retards de paiement', () => {
  test('encours (factures dues + commandes engagées) + nouvelle commande au-delà du plafond → 409', async () => {
    const rc = await relationCommerciale();
    const fixer = (corps) => api().patch(`/api/v1/partenariats/${rc.partenariat.id}`).set(rc.fournisseur.h).send(corps);
    expect((await fixer({ credit_limit: 300000 })).body.data.partnership.credit_limit).toBe(300000);
    await commandeEnvoyee(rc, [{ product_id: rc.produits[0].id, quantity: 10 }]); // 177 000 engagés

    const detail = await api().get(`/api/v1/partenariats/${rc.partenariat.id}`).set(rc.acheteur.h);
    expect(detail.body.data.partnership.credit).toMatchObject({ limit: 300000, exposure: 177000, available: 123000 });

    const second = await creerBrouillon(rc.acheteur, rc.fournisseur, [{ product_id: rc.produits[0].id, quantity: 10 }]);
    const refus = await api().post(`/api/v1/achats/${second.id}/envoyer`).set(rc.acheteur.h).send({});
    expect(refus.status).toBe(409);
    expect(refus.body.error).toMatchObject({ code: 'PLAFOND_CREDIT_DEPASSE', details: { limit: 300000, exposure: 177000, order_total: 177000 } });
    await fixer({ credit_limit: null });
    expect((await api().post(`/api/v1/achats/${second.id}/envoyer`).set(rc.acheteur.h).send({})).status).toBe(200);
    // Le client ne fixe pas son propre plafond.
    expect((await api().patch(`/api/v1/partenariats/${rc.partenariat.id}`).set(rc.acheteur.h).send({ credit_limit: 1e9 })).body.error.code).toBe('CHAMP_RESERVE_FOURNISSEUR');
  });

  test('blocage en cas de facture échue', async () => {
    const rc = await relationCommerciale();
    await api().patch(`/api/v1/partenariats/${rc.partenariat.id}`).set(rc.fournisseur.h).send({ block_on_overdue: true });
    const facture = await factureEmise(rc, await commandeReceptionnee(rc));
    await sequelize.query("UPDATE invoices SET issue_date = '2025-01-01', due_date = '2025-01-31' WHERE id = :id", { replacements: { id: facture.id } });
    const brouillon = await creerBrouillon(rc.acheteur, rc.fournisseur, [{ product_id: rc.produits[0].id, quantity: 1 }]);
    const refus = await api().post(`/api/v1/achats/${brouillon.id}/envoyer`).set(rc.acheteur.h).send({});
    expect(refus.body.error).toMatchObject({ code: 'RETARD_DE_PAIEMENT', details: { overdue_invoices: 1 } });
  });
});
