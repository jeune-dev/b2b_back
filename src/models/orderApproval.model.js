'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `order_approvals` — schéma défini par les migrations (src/migrations). */
const OrderApproval = sequelize.define('OrderApproval', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  order_id: { type: DataTypes.UUID, allowNull: false },
  round: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.UUID, allowNull: false },
  decision: { type: DataTypes.STRING(10), allowNull: false },
  comment: { type: DataTypes.TEXT },
  order_total: { type: DataTypes.BIGINT, allowNull: false },
}, {
  tableName: 'order_approvals',
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = OrderApproval;
