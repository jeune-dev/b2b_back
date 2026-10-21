'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `companies` — schéma défini par les migrations (src/migrations). */
const Company = sequelize.define('Company', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  name: { type: DataTypes.STRING(150), allowNull: false },
  legal_name: { type: DataTypes.STRING(200) },
  type: { type: DataTypes.STRING(12), allowNull: false },
  sector: { type: DataTypes.STRING(20) },
  description: { type: DataTypes.TEXT },
  address: { type: DataTypes.STRING(255) },
  city: { type: DataTypes.STRING(100) },
  country: { type: DataTypes.CHAR(2), allowNull: false, defaultValue: 'SN' },
  phone: { type: DataTypes.STRING(20) },
  email: { type: DataTypes.STRING(254) },
  website: { type: DataTypes.STRING(255) },
  ninea: { type: DataTypes.STRING(30) },
  rccm: { type: DataTypes.STRING(60) },
  tax_regime: { type: DataTypes.STRING(20) },
  vat_registered: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  default_tax_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  bank_details: { type: DataTypes.TEXT },
  currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'XOF' },
  logo_document_id: { type: DataTypes.UUID },
  is_listed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'actif' },
  suspended_reason: { type: DataTypes.TEXT },
  created_by: { type: DataTypes.UUID },
}, {
  tableName: 'companies',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true, deletedAt: 'deleted_at',
});

module.exports = Company;
