'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `partnerships` — schéma défini par les migrations (src/migrations). */
const Partnership = sequelize.define('Partnership', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  buyer_company_id: { type: DataTypes.UUID, allowNull: false },
  supplier_company_id: { type: DataTypes.UUID, allowNull: false },
  status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'en_attente' },
  requested_by_company_id: { type: DataTypes.UUID, allowNull: false },
  requested_by: { type: DataTypes.UUID },
  request_message: { type: DataTypes.TEXT },
  responded_at: { type: DataTypes.DATE },
  responded_by: { type: DataTypes.UUID },
  payment_terms_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
  supplier_customer_code: { type: DataTypes.STRING(40) },
  buyer_notes: { type: DataTypes.TEXT },
  supplier_notes: { type: DataTypes.TEXT },
  suspended_by_company_id: { type: DataTypes.UUID },
  suspended_reason: { type: DataTypes.TEXT },
}, {
  tableName: 'partnerships',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Partnership;
