'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `invoice_reminders` — schéma défini par les migrations (src/migrations). */
const InvoiceReminder = sequelize.define('InvoiceReminder', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  invoice_id: { type: DataTypes.UUID, allowNull: false },
  level: { type: DataTypes.SMALLINT, allowNull: false },
  channel: { type: DataTypes.STRING(10), allowNull: false },
  days_overdue: { type: DataTypes.INTEGER, allowNull: false },
  amount_due: { type: DataTypes.BIGINT, allowNull: false },
  emailed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sent_by: { type: DataTypes.UUID },
}, {
  tableName: 'invoice_reminders',
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = InvoiceReminder;
