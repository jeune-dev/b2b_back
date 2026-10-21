'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `products` — schéma défini par les migrations (src/migrations). */
const Product = sequelize.define('Product', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  company_id: { type: DataTypes.UUID, allowNull: false },
  category_id: { type: DataTypes.UUID },
  reference: { type: DataTypes.STRING(60), allowNull: false },
  name: { type: DataTypes.STRING(200), allowNull: false },
  description: { type: DataTypes.TEXT },
  unit: { type: DataTypes.STRING(12), allowNull: false },
  packaging: { type: DataTypes.STRING(100) },
  price: { type: DataTypes.BIGINT, allowNull: false },
  tax_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  availability: { type: DataTypes.STRING(15), allowNull: false, defaultValue: 'disponible' },
  stock_quantity: { type: DataTypes.DECIMAL(14, 3) },
  min_order_quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 1 },
  order_multiple: { type: DataTypes.DECIMAL(14, 3) },
  max_order_quantity: { type: DataTypes.DECIMAL(14, 3) },
  stock_reserved: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  low_stock_threshold: { type: DataTypes.DECIMAL(14, 3) },
  low_stock_notified_at: { type: DataTypes.DATE },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  photo_document_id: { type: DataTypes.UUID },
  created_by: { type: DataTypes.UUID },
}, {
  tableName: 'products',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true, deletedAt: 'deleted_at',
});

module.exports = Product;
