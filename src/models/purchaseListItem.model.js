'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `purchase_list_items` — schéma défini par les migrations (src/migrations). */
const PurchaseListItem = sequelize.define('PurchaseListItem', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  list_id: { type: DataTypes.UUID, allowNull: false },
  product_id: { type: DataTypes.UUID, allowNull: false },
  quantity: { type: DataTypes.DECIMAL(14, 3) },
  par_level: { type: DataTypes.DECIMAL(14, 3) },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'purchase_list_items',
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = PurchaseListItem;
