'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `order_events` — schéma défini par les migrations (src/migrations). */
const OrderEvent = sequelize.define('OrderEvent', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  order_id: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.STRING(30), allowNull: false },
  from_status: { type: DataTypes.STRING(25) },
  to_status: { type: DataTypes.STRING(25) },
  version_no: { type: DataTypes.INTEGER },
  actor_user_id: { type: DataTypes.UUID },
  actor_company_id: { type: DataTypes.UUID },
  actor_side: { type: DataTypes.STRING(12) },
  message: { type: DataTypes.TEXT },
  details: { type: DataTypes.JSONB },
}, {
  tableName: 'order_events',
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = OrderEvent;
