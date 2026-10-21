'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `price_list_items` — schéma défini par les migrations (src/migrations). */
const PriceListItem = sequelize.define('PriceListItem', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  price_list_id: { type: DataTypes.UUID, allowNull: false },
  product_id: { type: DataTypes.UUID, allowNull: false },
  price: { type: DataTypes.BIGINT, allowNull: false },
}, {
  tableName: 'price_list_items',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = PriceListItem;
