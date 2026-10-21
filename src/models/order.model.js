'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `orders` — schéma défini par les migrations (src/migrations). */
const Order = sequelize.define('Order', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  number: { type: DataTypes.STRING(40), allowNull: false },
  buyer_company_id: { type: DataTypes.UUID, allowNull: false },
  supplier_company_id: { type: DataTypes.UUID, allowNull: false },
  partnership_id: { type: DataTypes.UUID, allowNull: false },
  status: { type: DataTypes.STRING(25), allowNull: false, defaultValue: 'brouillon' },
  revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  current_version_no: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  validated_version_no: { type: DataTypes.INTEGER },
  buyer_reference: { type: DataTypes.STRING(60) },
  delivery_address: { type: DataTypes.TEXT },
  requested_delivery_date: { type: DataTypes.DATEONLY },
  conditions: { type: DataTypes.TEXT },
  currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'XOF' },
  subtotal: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  tax_total: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  total: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  lines_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  delivery_note: { type: DataTypes.TEXT },
  reception_note: { type: DataTypes.TEXT },
  reception_with_reserves: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  cancellation_reason: { type: DataTypes.TEXT },
  refusal_reason: { type: DataTypes.TEXT },
  cancelled_by_side: { type: DataTypes.STRING(12) },
  template_id: { type: DataTypes.UUID },
  created_by: { type: DataTypes.UUID },
  sent_at: { type: DataTypes.DATE },
  acknowledged_at: { type: DataTypes.DATE },
  validated_at: { type: DataTypes.DATE },
  preparation_at: { type: DataTypes.DATE },
  ready_at: { type: DataTypes.DATE },
  delivered_at: { type: DataTypes.DATE },
  received_at: { type: DataTypes.DATE },
  invoiced_at: { type: DataTypes.DATE },
  completed_at: { type: DataTypes.DATE },
  refused_at: { type: DataTypes.DATE },
  cancelled_at: { type: DataTypes.DATE },
}, {
  tableName: 'orders',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Order;
