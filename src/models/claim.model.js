'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `claims` — schéma défini par les migrations (src/migrations). */
const Claim = sequelize.define('Claim', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  number: { type: DataTypes.STRING(40), allowNull: false },
  order_id: { type: DataTypes.UUID, allowNull: false },
  buyer_company_id: { type: DataTypes.UUID, allowNull: false },
  supplier_company_id: { type: DataTypes.UUID, allowNull: false },
  partnership_id: { type: DataTypes.UUID, allowNull: false },
  delivery_id: { type: DataTypes.UUID },
  type: { type: DataTypes.STRING(20), allowNull: false },
  status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ouvert' },
  description: { type: DataTypes.TEXT, allowNull: false },
  subtotal: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  tax_total: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  total: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  response: { type: DataTypes.TEXT },
  restock: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  credit_note_id: { type: DataTypes.UUID },
  opened_by: { type: DataTypes.UUID },
  resolved_at: { type: DataTypes.DATE },
  resolved_by: { type: DataTypes.UUID },
}, {
  tableName: 'claims',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Claim;
