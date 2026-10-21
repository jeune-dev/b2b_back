'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `delivery_lines` — schéma défini par les migrations (src/migrations). */
const DeliveryLine = sequelize.define('DeliveryLine', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  delivery_id: { type: DataTypes.UUID, allowNull: false },
  line_no: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.UUID },
  reference: { type: DataTypes.STRING(60) },
  name: { type: DataTypes.STRING(200), allowNull: false },
  unit: { type: DataTypes.STRING(12), allowNull: false },
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  received_quantity: { type: DataTypes.DECIMAL(14, 3) },
}, {
  tableName: 'delivery_lines',
  createdAt: false,
  updatedAt: false,
});

module.exports = DeliveryLine;
