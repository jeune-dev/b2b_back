'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `invoices` — schéma défini par les migrations (src/migrations). */
const Invoice = sequelize.define('Invoice', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  number: { type: DataTypes.STRING(40), allowNull: false },
  supplier_company_id: { type: DataTypes.UUID, allowNull: false },
  buyer_company_id: { type: DataTypes.UUID, allowNull: false },
  partnership_id: { type: DataTypes.UUID, allowNull: false },
  order_id: { type: DataTypes.UUID, allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'emise' },
  source: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'generee' },
  issue_date: { type: DataTypes.DATEONLY, allowNull: false },
  due_date: { type: DataTypes.DATEONLY, allowNull: false },
  currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'XOF' },
  subtotal: { type: DataTypes.BIGINT, allowNull: false },
  tax_total: { type: DataTypes.BIGINT, allowNull: false },
  total: { type: DataTypes.BIGINT, allowNull: false },
  amount_paid: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  template_id: { type: DataTypes.UUID },
  file_document_id: { type: DataTypes.UUID },
  note: { type: DataTypes.TEXT },
  due_soon_notified_at: { type: DataTypes.DATE },
  overdue_notified_at: { type: DataTypes.DATE },
  cancelled_at: { type: DataTypes.DATE },
  cancellation_reason: { type: DataTypes.TEXT },
  created_by: { type: DataTypes.UUID },
}, {
  tableName: 'invoices',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Invoice;
