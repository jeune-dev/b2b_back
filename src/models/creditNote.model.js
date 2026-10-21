'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `credit_notes` — schéma défini par les migrations (src/migrations). */
const CreditNote = sequelize.define('CreditNote', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  number: { type: DataTypes.STRING(40), allowNull: false },
  supplier_company_id: { type: DataTypes.UUID, allowNull: false },
  buyer_company_id: { type: DataTypes.UUID, allowNull: false },
  partnership_id: { type: DataTypes.UUID, allowNull: false },
  order_id: { type: DataTypes.UUID },
  invoice_id: { type: DataTypes.UUID },
  claim_id: { type: DataTypes.UUID },
  status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'emis' },
  issue_date: { type: DataTypes.DATEONLY, allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: false },
  subtotal: { type: DataTypes.BIGINT, allowNull: false },
  tax_total: { type: DataTypes.BIGINT, allowNull: false },
  total: { type: DataTypes.BIGINT, allowNull: false },
  amount_allocated: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  template_id: { type: DataTypes.UUID },
  created_by: { type: DataTypes.UUID },
  cancelled_at: { type: DataTypes.DATE },
  cancellation_reason: { type: DataTypes.TEXT },
}, {
  tableName: 'credit_notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = CreditNote;
