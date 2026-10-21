'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `credit_note_lines` — schéma défini par les migrations (src/migrations). */
const CreditNoteLine = sequelize.define('CreditNoteLine', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  credit_note_id: { type: DataTypes.UUID, allowNull: false },
  line_no: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.UUID },
  reference: { type: DataTypes.STRING(60) },
  name: { type: DataTypes.STRING(200), allowNull: false },
  unit: { type: DataTypes.STRING(12), allowNull: false },
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  unit_price: { type: DataTypes.BIGINT, allowNull: false },
  tax_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  line_subtotal: { type: DataTypes.BIGINT, allowNull: false },
  line_tax: { type: DataTypes.BIGINT, allowNull: false },
  line_total: { type: DataTypes.BIGINT, allowNull: false },
}, {
  tableName: 'credit_note_lines',
  createdAt: false,
  updatedAt: false,
});

module.exports = CreditNoteLine;
