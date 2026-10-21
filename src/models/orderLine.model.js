'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `order_lines` — schéma défini par les migrations (src/migrations). */
const OrderLine = sequelize.define('OrderLine', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  order_id: { type: DataTypes.UUID, allowNull: false },
  version_id: { type: DataTypes.UUID, allowNull: false },
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
  change_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'inchangee' },
  original_quantity: { type: DataTypes.DECIMAL(14, 3) },
  original_unit_price: { type: DataTypes.BIGINT },
  substitute_for_line_no: { type: DataTypes.INTEGER },
  comment: { type: DataTypes.STRING(500) },
  received_quantity: { type: DataTypes.DECIMAL(14, 3) },
}, {
  tableName: 'order_lines',
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = OrderLine;
