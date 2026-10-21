'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `member_invitations` — schéma défini par les migrations (src/migrations). */
const MemberInvitation = sequelize.define('MemberInvitation', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  company_id: { type: DataTypes.UUID, allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false },
  phone: { type: DataTypes.STRING(20) },
  first_name: { type: DataTypes.STRING(80), allowNull: false },
  last_name: { type: DataTypes.STRING(80), allowNull: false },
  job_title: { type: DataTypes.STRING(100) },
  role_code: { type: DataTypes.STRING(40), allowNull: false },
  token_hash: { type: DataTypes.CHAR(64), allowNull: false },
  code_hash: { type: DataTypes.CHAR(64), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  attempts: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
  used_at: { type: DataTypes.DATE },
  revoked_at: { type: DataTypes.DATE },
  created_by: { type: DataTypes.UUID },
}, {
  tableName: 'member_invitations',
  createdAt: 'created_at',
  updatedAt: false,
});

/** Les empreintes des secrets ne sortent jamais d'une réponse. */
MemberInvitation.prototype.toJSON = function toJSON() {
  const valeurs = { ...this.get({ plain: true }) };
  delete valeurs.token_hash;
  delete valeurs.code_hash;
  return valeurs;
};

module.exports = MemberInvitation;
