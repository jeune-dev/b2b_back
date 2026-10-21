'use strict';

const { User, MemberInvitation, PartnershipInvitation } = require('../../../models/index.js');
const { COLONNES_SECRETES } = require('../../../models/user.model.js');
const { encrypt, decrypt } = require('../../../utils/cryptoField.js');

/**
 * § 24 « chiffrement des données sensibles » et non-divulgation des secrets :
 * vérifié sur des instances construites en mémoire (aucune base).
 */

describe('User.toJSON', () => {
  test('ne sérialise jamais empreinte, version de jeton, compteur, verrouillage, suppression', () => {
    const user = User.build({
      role_code: 'utilisateur', first_name: 'A', last_name: 'B', email: 'a@b.sn', password_hash: '$2b$12$secret',
      token_version: 7, failed_login_attempts: 3, locked_until: new Date(), deleted_at: new Date(),
    });
    const json = user.toJSON();
    for (const cle of ['password_hash', 'token_version', 'failed_login_attempts', 'locked_until', 'deleted_at']) expect(json).not.toHaveProperty(cle);
    expect(json).toMatchObject({ first_name: 'A', email: 'a@b.sn', role_code: 'utilisateur' });
    expect(JSON.stringify(user)).not.toContain('$2b$12$secret');
    // La valeur reste lisible côté serveur (comparaison bcrypt).
    expect(user.password_hash).toBe('$2b$12$secret');
  });

  test('liste des colonnes secrètes exportée et complète', () => {
    expect(COLONNES_SECRETES).toEqual(expect.arrayContaining(['password_hash', 'token_version', 'failed_login_attempts', 'locked_until']));
  });
});

describe('invitations : empreintes des secrets jamais sérialisées', () => {
  test('collaborateur et partenaire', () => {
    const inv = MemberInvitation.build({ email: 'a@b.sn', token_hash: 'x'.repeat(64), code_hash: 'y'.repeat(64) });
    expect(inv.toJSON()).not.toHaveProperty('token_hash');
    expect(inv.toJSON()).not.toHaveProperty('code_hash');
    const p = PartnershipInvitation.build({ email: 'a@b.sn', token_hash: 'z'.repeat(64) });
    expect(JSON.stringify(p)).not.toContain('zzzz');
  });
});

describe('chiffrement des champs sensibles', () => {
  test('secret TOTP chiffré au repos, relu en clair', () => {
    const user = User.build({ role_code: 'utilisateur', first_name: 'A', last_name: 'B', email: 'a@b.sn', password_hash: 'x', totp_secret: 'JBSWY3DPEHPK3PXP' });
    expect(user.getDataValue('totp_secret')).toMatch(/^v1:/);
    expect(user.totp_secret).toBe('JBSWY3DPEHPK3PXP');
    expect(decrypt(encrypt('abc'))).toBe('abc');
  });
});
