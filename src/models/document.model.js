'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `documents` — schéma défini par les migrations (src/migrations). */
const Document = sequelize.define('Document', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  company_id: { type: DataTypes.UUID },
  partner_company_id: { type: DataTypes.UUID },
  entity_type: { type: DataTypes.STRING(30), allowNull: false },
  entity_id: { type: DataTypes.UUID, allowNull: false },
  category: { type: DataTypes.STRING(20), allowNull: false },
  visibility: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'prive' },
  storage_key: { type: DataTypes.STRING(300), allowNull: false },
  thumbnail_key: { type: DataTypes.STRING(300) },
  mime_type: { type: DataTypes.STRING(100), allowNull: false },
  size_bytes: { type: DataTypes.BIGINT, allowNull: false },
  original_name: { type: DataTypes.STRING(255) },
  checksum: { type: DataTypes.CHAR(64) },
  uploaded_by: { type: DataTypes.UUID },
}, {
  tableName: 'documents',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true, deletedAt: 'deleted_at',
});

module.exports = Document;
