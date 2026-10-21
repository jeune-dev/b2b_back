'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `payments` — schéma défini par les migrations (src/migrations). */
const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  reference: { type: DataTypes.STRING(40), allowNull: false },
  supplier_company_id: { type: DataTypes.UUID, allowNull: false },
  buyer_company_id: { type: DataTypes.UUID, allowNull: false },
  partnership_id: { type: DataTypes.UUID, allowNull: false },
  amount: { type: DataTypes.BIGINT, allowNull: false },
  allocated_amount: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'XOF' },
  method: { type: DataTypes.STRING(15), allowNull: false },
  paid_on: { type: DataTypes.DATEONLY, allowNull: false },
  external_reference: { type: DataTypes.STRING(100) },
  note: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING(10), allowNull: false },
  recorded_by_side: { type: DataTypes.STRING(12), allowNull: false },
  recorded_by: { type: DataTypes.UUID },
  confirmed_at: { type: DataTypes.DATE },
  confirmed_by: { type: DataTypes.UUID },
  rejected_at: { type: DataTypes.DATE },
  rejection_reason: { type: DataTypes.TEXT },
  cancelled_at: { type: DataTypes.DATE },
  cancellation_reason: { type: DataTypes.TEXT },
  proof_document_id: { type: DataTypes.UUID },
}, {
  tableName: 'payments',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Payment;
