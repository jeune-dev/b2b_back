'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `product_categories` — schéma défini par les migrations (src/migrations). */
const ProductCategory = sequelize.define('ProductCategory', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  company_id: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'product_categories',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ProductCategory;
