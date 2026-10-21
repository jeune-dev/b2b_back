'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `order_versions` — schéma défini par les migrations (src/migrations). */
const OrderVersion = sequelize.define('OrderVersion', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  order_id: { type: DataTypes.UUID, allowNull: false },
  version_no: { type: DataTypes.INTEGER, allowNull: false },
  proposed_by_side: { type: DataTypes.STRING(12), allowNull: false },
  proposed_by: { type: DataTypes.UUID },
  status: { type: DataTypes.STRING(12), allowNull: false },
  comment: { type: DataTypes.TEXT },
  subtotal: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  tax_total: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  total: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  lines_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  decided_at: { type: DataTypes.DATE },
  decided_by: { type: DataTypes.UUID },
}, {
  tableName: 'order_versions',
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = OrderVersion;
