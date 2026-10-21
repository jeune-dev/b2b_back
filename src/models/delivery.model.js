'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `deliveries` — schéma défini par les migrations (src/migrations). */
const Delivery = sequelize.define('Delivery', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  number: { type: DataTypes.STRING(40), allowNull: false },
  order_id: { type: DataTypes.UUID, allowNull: false },
  supplier_company_id: { type: DataTypes.UUID, allowNull: false },
  buyer_company_id: { type: DataTypes.UUID, allowNull: false },
  delivery_no: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING(15), allowNull: false, defaultValue: 'expediee' },
  note: { type: DataTypes.TEXT },
  carrier: { type: DataTypes.STRING(120) },
  shipped_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  document_id: { type: DataTypes.UUID },
  received_at: { type: DataTypes.DATE },
  received_by: { type: DataTypes.UUID },
  reception_note: { type: DataTypes.TEXT },
  with_reserves: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  created_by: { type: DataTypes.UUID },
}, {
  tableName: 'deliveries',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Delivery;
