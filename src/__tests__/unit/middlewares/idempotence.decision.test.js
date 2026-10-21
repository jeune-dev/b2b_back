'use strict';

const idempotence = require('../../../middlewares/idempotence.middleware.js');

/**
 * Décision de conservation d'une réponse idempotente (double clic, renvoi
 * après coupure réseau mobile) — fonctions pures.
 */

// Les modules chargent le pool Sequelize (aucune connexion ouverte) : fermé en fin de suite.
afterAll(() => require('../../../config/db.js').close());

describe('idempotence — aConserver', () => {
  const { aConserver } = idempotence;

  test.each([200, 201, 204, 299])('succès %i : conservé et rejoué', (statut) => {
    expect(aConserver(statut, true, true)).toBe(true);
  });

  test.each([400, 404, 422])('refus définitif %i : conservé (la même requête recevra la même réponse)', (statut) => {
    expect(aConserver(statut, true, true)).toBe(true);
  });

  test.each([
    [401, 'session expirée'], [402, 'abonnement échu'], [403, 'droit retiré'], [409, 'conflit d’état'],
    [429, 'limite de débit'], [500, 'erreur serveur'], [502, 'passerelle'], [503, 'fournisseur indisponible'],
  ])('refus passager %i (%s) : clé LIBÉRÉE pour une nouvelle tentative', (statut) => {
    expect(aConserver(statut, true, true)).toBe(false);
  });

  test('réponse coupée (connexion fermée avant la fin) ou sans corps JSON capturé : clé libérée', () => {
    expect(aConserver(201, false, true)).toBe(false);
    expect(aConserver(201, true, false)).toBe(false);
  });

  test('redirections et statuts informatifs : jamais conservés', () => {
    expect(aConserver(302, true, true)).toBe(false);
    expect(aConserver(304, true, true)).toBe(false);
  });
});

describe('idempotence — middleware sans base (garde d’en-tête)', () => {
  const appeler = (mw, entetes, user = { id: 'u' }) => new Promise((resolve) => {
    mw({ headers: entetes, user, method: 'POST', baseUrl: '/x', path: '/', body: {} }, {}, resolve);
  });

  test('en-tête absent : passe si facultatif, 422 IDEMPOTENCE_REQUISE si obligatoire', async () => {
    expect(await appeler(idempotence(), {})).toBeUndefined();
    const err = await appeler(idempotence({ obligatoire: true }), {});
    expect(err).toMatchObject({ statusCode: 422, code: 'IDEMPOTENCE_REQUISE' });
  });

  test.each(['court', 'a'.repeat(129), 'clé avec espaces', 'cle/avec/slash', 'cle<script>'])('clé invalide « %s » → 422 IDEMPOTENCE_INVALIDE', async (cle) => {
    expect(await appeler(idempotence(), { 'idempotency-key': cle })).toMatchObject({ statusCode: 422, code: 'IDEMPOTENCE_INVALIDE' });
  });

  test('clé fournie sans utilisateur authentifié : ignorée (la garde d’authentification répond)', async () => {
    expect(await appeler(idempotence(), { 'idempotency-key': 'cle-valide-123' }, null)).toBeUndefined();
  });
});
