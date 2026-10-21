'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `credit_note_allocations` — schéma défini par les migrations (src/migrations). */
const CreditNoteAllocation = sequelize.define('CreditNoteAllocation', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  credit_note_id: { type: DataTypes.UUID, allowNull: false },
  invoice_id: { type: DataTypes.UUID, allowNull: false },
  amount: { type: DataTypes.BIGINT, allowNull: false },
  cancelled_at: { type: DataTypes.DATE },
}, {
  tableName: 'credit_note_allocations',
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = CreditNoteAllocation;
