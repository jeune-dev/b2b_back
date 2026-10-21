'use strict';

const { api, nouvelleEntreprise, emailUnique, compter, fermer, sequelize } = require('../../setup/helpers.js');
const { nettoyer } = require('../../../jobs/nettoyage.js');
const { executerJob } = require('../../../jobs/executerJob.js');
const { TACHES } = require('../../../jobs/index.js');
const metrics = require('../../../utils/metrics.js');

/**
 * Tâches planifiées : nettoyage des données techniques échues, expiration
 * des invitations de partenaires, exécution protégée par verrou consultatif.
 */

afterAll(fermer);

test('les tâches déclarées : échéances des factures, abonnements, nettoyage', () => {
  expect(TACHES.map((t) => t.nom)).toEqual(['echeances_factures', 'abonnements', 'nettoyage']);
});

test('nettoyage : jetons, clés, codes, invitations, notifications lues anciennes ; invitations partenaires expirées', async () => {
  const e = await nouvelleEntreprise();
  await sequelize.query(
    "INSERT INTO notifications (user_id, type, title, body, read_at, created_at) VALUES (:u, 'systeme', 'Ancienne', 'x', now() - interval '13 months', now() - interval '13 months')",
    { replacements: { u: e.user.id } }
  );
  const inv = await api().post('/api/v1/partenariats/invitations').set(e.h).send({ email: emailUnique('vieux'), relation: 'fournisseur' });
  await sequelize.query("UPDATE partnership_invitations SET expires_at = now() - interval '1 day' WHERE id = :id", { replacements: { id: inv.body.data.invitation.id } });

  const bilan = await nettoyer();
  expect(bilan.notifications).toBeGreaterThanOrEqual(1);
  expect(bilan.partnership_invitations_expirees).toBeGreaterThanOrEqual(1);
  expect(await compter('notifications', "user_id = :u AND title = 'Ancienne'", { u: e.user.id })).toBe(0);
  expect(await compter('partnership_invitations', "id = :id AND status = 'expiree'", { id: inv.body.data.invitation.id })).toBe(1);
});

test('executerJob : résultat compté ; une erreur est absorbée et comptée en échec', async () => {
  const ok = await executerJob('test_ok', async () => ({ fait: 1 }));
  expect(ok).toEqual({ fait: 1 });
  const ko = await executerJob('test_ko', async () => { throw new Error('panne simulée'); });
  expect(ko).toBeNull();
  const etat = metrics.instantane();
  expect(etat.jobs.test_ko.echecs).toBe(1);
});
