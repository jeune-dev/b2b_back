'use strict';

const http = require('http');
const {
  api, relationCommerciale, commandeEnvoyee, creerBrouillon, nouvelleEntreprise, collaborateur, MOT_DE_PASSE, pdfTest, compter, fermer,
} = require('../../../setup/helpers.js');
const app = require('../../../../app.js');

/**
 * § 17 notifications web et mobile ; § 23 synchronisation web / mobile ;
 * compte connecté (sessions, appareils push) ; documents partagés.
 */

let serveur;
let port;
beforeAll(async () => {
  serveur = http.createServer(app);
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  port = serveur.address().port;
});
afterAll(async () => {
  serveur.closeAllConnections?.();
  await new Promise((r) => serveur.close(r));
  await fermer();
});

/** Ouvre le flux SSE et attend un événement du type voulu. */
function attendreEvenement(url, type, delaiMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${url}`, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`Flux : ${res.statusCode}`)); return; }
      let tampon = '';
      res.on('data', (morceau) => {
        tampon += morceau.toString();
        const blocs = tampon.split('\n\n');
        tampon = blocs.pop();
        for (const bloc of blocs) {
          const evt = /^event: (.+)$/m.exec(bloc)?.[1];
          const data = /^data: (.+)$/m.exec(bloc)?.[1];
          if (evt === type) {
            req.destroy();
            resolve(JSON.parse(data));
          }
        }
      });
    });
    req.on('error', () => {});
    setTimeout(() => { req.destroy(); reject(new Error(`Aucun événement « ${type} »`)); }, delaiMs);
  });
}

describe('§ 17 — notifications', () => {
  test('nouveau bon de commande : notification du fournisseur, compteur, lecture, tout lire', async () => {
    const rc = await relationCommerciale();
    await commandeEnvoyee(rc);
    const compteur = await api().get('/api/v1/notifications/compteur').set(rc.fournisseur.h);
    expect(compteur.body.data.non_lues).toBeGreaterThanOrEqual(1);
    const liste = await api().get('/api/v1/notifications?non_lues=true').set(rc.fournisseur.h);
    const n = liste.body.data.items.find((x) => x.type === 'nouveau_bon_commande');
    expect(n.data.order_id).toBeTruthy();
    expect((await api().post(`/api/v1/notifications/${n.id}/lue`).set(rc.fournisseur.h).send({})).body.data.notification.read_at).toBeTruthy();
    // La notification d'un autre compte n'existe pas pour moi.
    expect((await api().post(`/api/v1/notifications/${n.id}/lue`).set(rc.acheteur.h).send({})).status).toBe(404);
    await api().post('/api/v1/notifications/tout-lire').set(rc.fournisseur.h).send({});
    expect((await api().get('/api/v1/notifications/compteur').set(rc.fournisseur.h)).body.data.non_lues).toBe(0);
  });

  test('notifications ciblées par rôle : le réceptionnaire n’est pas dérangé par un nouveau bon de commande reçu', async () => {
    const rc = await relationCommerciale();
    const recep = await collaborateur(rc.fournisseur, 'receptionnaire');
    await commandeEnvoyee(rc);
    expect(await compter('notifications', "user_id = :u AND type = 'nouveau_bon_commande'", { u: recep.user.id })).toBe(0);
    expect(await compter('notifications', "user_id = :u AND type = 'nouveau_bon_commande'", { u: rc.fournisseur.user.id })).toBe(1);
  });
});

describe('§ 23 — synchronisation temps réel', () => {
  test('ticket de flux, puis la commande envoyée apparaît immédiatement chez le fournisseur', async () => {
    const rc = await relationCommerciale();
    const ticket = await api().post('/api/v1/evenements/ticket').set(rc.fournisseur.h).send({});
    expect(ticket.status).toBe(200);
    expect(ticket.body.data.expires_in).toBe(60);
    const brouillon = await creerBrouillon(rc.acheteur, rc.fournisseur, [{ product_id: rc.produits[0].id, quantity: 2 }]);
    const attente = attendreEvenement(ticket.body.data.url, 'commande');
    await new Promise((r) => setTimeout(r, 200));
    await api().post(`/api/v1/achats/${brouillon.id}/envoyer`).set(rc.acheteur.h).send({});
    const evt = await attente;
    expect(evt).toMatchObject({ order_id: brouillon.id, status: 'envoyee', type: 'commande' });
  });

  test('ticket invalide ou jeton d’accès présenté comme ticket : 401', async () => {
    const e = await nouvelleEntreprise();
    expect((await api().get('/api/v1/evenements/flux?ticket=faux').set(e.h)).status).toBe(401);
    expect((await api().get(`/api/v1/evenements/flux?ticket=${e.token}`)).status).toBe(401);
    expect((await api().get('/api/v1/evenements/flux')).status).toBe(422);
  });
});

describe('Compte connecté', () => {
  test('profil, modification (e-mail sous mot de passe), sessions, appareil push, changement de mot de passe', async () => {
    const e = await nouvelleEntreprise();
    expect((await api().patch('/api/v1/compte').set(e.h).send({ email: `nouveau${Date.now()}@test.sn` })).body.error.code).toBe('MOT_DE_PASSE_ACTUEL_REQUIS');
    const modif = await api().patch('/api/v1/compte').set(e.h).send({ job_title: 'Directrice des achats', language: 'en' });
    expect(modif.body.data.user).toMatchObject({ job_title: 'Directrice des achats', language: 'en' });

    const appareil = await api().post('/api/v1/compte/appareils').set(e.h).send({ token: 'fcm-jeton-de-test-0123456789', platform: 'android' });
    expect(appareil.status).toBe(200);
    expect(await compter('device_tokens', 'user_id = :u', { u: e.user.id })).toBe(1);
    await api().delete('/api/v1/compte/appareils').set(e.h).send({ token: 'fcm-jeton-de-test-0123456789' });
    expect(await compter('device_tokens', 'user_id = :u', { u: e.user.id })).toBe(0);

    const sessions = await api().get('/api/v1/compte/sessions').set(e.h);
    expect(sessions.body.data.sessions.length).toBeGreaterThanOrEqual(1);
    const mdp = await api().post('/api/v1/compte/mot-de-passe').set(e.h)
      .send({ current_password: MOT_DE_PASSE, password: 'NouveauMdp2', password_confirmation: 'NouveauMdp2' });
    expect(mdp.status).toBe(200);
    expect((await api().get('/api/v1/compte').set(e.h)).status).toBe(401);
    const nouveau = { Authorization: `Bearer ${mdp.body.data.access_token}` };
    expect((await api().get('/api/v1/compte').set(nouveau)).status).toBe(200);
    await api().post('/api/v1/compte/sessions/revoquer-toutes').set(nouveau).send({});
    expect((await api().get('/api/v1/compte').set(nouveau)).status).toBe(401);
  });
});

describe('Documents partagés', () => {
  test('liste par ressource (visibilité respectée), lien temporaire, suppression d’une pièce jointe ; tiers refusé', async () => {
    const rc = await relationCommerciale();
    const commande = await commandeEnvoyee(rc);
    const pj = await api().post(`/api/v1/ventes/${commande.id}/pieces-jointes`).set(rc.fournisseur.h).attach('fichier', pdfTest(), 'fiche-technique.pdf');
    const liste = await api().get(`/api/v1/documents?entity_type=order&entity_id=${commande.id}`).set(rc.acheteur.h);
    expect(liste.body.data.items.map((d) => d.id)).toEqual([pj.body.data.document.id]);
    const lien = await api().get(`/api/v1/documents/${pj.body.data.document.id}/lien`).set(rc.acheteur.h);
    expect(lien.body.data.url).toContain(pj.body.data.document.id);
    // Seule l'entreprise qui a déposé la pièce la supprime.
    expect((await api().delete(`/api/v1/documents/${pj.body.data.document.id}`).set(rc.acheteur.h)).status).toBe(403);
    expect((await api().delete(`/api/v1/documents/${pj.body.data.document.id}`).set(rc.fournisseur.h)).status).toBe(200);

    const tiers = await nouvelleEntreprise();
    expect((await api().get(`/api/v1/documents?entity_type=order&entity_id=${commande.id}`).set(tiers.h)).status).toBe(403);
    const mesDocuments = await api().get('/api/v1/documents').set(rc.fournisseur.h);
    expect(mesDocuments.status).toBe(200);
  });
});
