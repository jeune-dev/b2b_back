'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `partnership_invitations` — schéma défini par les migrations (src/migrations). */
const PartnershipInvitation = sequelize.define('PartnershipInvitation', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  company_id: { type: DataTypes.UUID, allowNull: false },
  relation: { type: DataTypes.STRING(12), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false },
  company_name: { type: DataTypes.STRING(150) },
  contact_name: { type: DataTypes.STRING(160) },
  message: { type: DataTypes.TEXT },
  token_hash: { type: DataTypes.CHAR(64), allowNull: false },
  status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'en_attente' },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  accepted_company_id: { type: DataTypes.UUID },
  accepted_at: { type: DataTypes.DATE },
  created_by: { type: DataTypes.UUID },
}, {
  tableName: 'partnership_invitations',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

/** Les empreintes des secrets ne sortent jamais d'une réponse. */
PartnershipInvitation.prototype.toJSON = function toJSON() {
  const valeurs = { ...this.get({ plain: true }) };
  delete valeurs.token_hash;
  return valeurs;
};

module.exports = PartnershipInvitation;
