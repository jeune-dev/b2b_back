'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `stock_movements` — schéma défini par les migrations (src/migrations). */
const StockMovement = sequelize.define('StockMovement', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  company_id: { type: DataTypes.UUID, allowNull: false },
  product_id: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.STRING(15), allowNull: false },
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  stock_after: { type: DataTypes.DECIMAL(14, 3) },
  reserved_after: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  order_id: { type: DataTypes.UUID },
  note: { type: DataTypes.TEXT },
  created_by: { type: DataTypes.UUID },
}, {
  tableName: 'stock_movements',
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = StockMovement;
