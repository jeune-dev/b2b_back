'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `product_price_tiers` — schéma défini par les migrations (src/migrations). */
const ProductPriceTier = sequelize.define('ProductPriceTier', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  product_id: { type: DataTypes.UUID, allowNull: false },
  min_quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  discount_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
}, {
  tableName: 'product_price_tiers',
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = ProductPriceTier;
