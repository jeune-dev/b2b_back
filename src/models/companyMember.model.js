'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `company_members` — schéma défini par les migrations (src/migrations). */
const CompanyMember = sequelize.define('CompanyMember', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  company_id: { type: DataTypes.UUID, allowNull: false },
  user_id: { type: DataTypes.UUID, allowNull: false },
  role_code: { type: DataTypes.STRING(40), allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'actif' },
  invited_by: { type: DataTypes.UUID },
}, {
  tableName: 'company_members',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = CompanyMember;
