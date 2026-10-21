'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.js');

/** Table `document_templates` — schéma défini par les migrations (src/migrations). */
const DocumentTemplate = sequelize.define('DocumentTemplate', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  company_id: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.STRING(15), allowNull: false },
  version: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'actif' },
  name: { type: DataTypes.STRING(120), allowNull: false },
  accent_color: { type: DataTypes.CHAR(7), allowNull: false, defaultValue: '#0F4C81' },
  header_text: { type: DataTypes.TEXT },
  footer_text: { type: DataTypes.TEXT },
  legal_mentions: { type: DataTypes.TEXT },
  show_logo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  background_document_id: { type: DataTypes.UUID },
  margin_top: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
  margin_bottom: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
  created_by: { type: DataTypes.UUID },
  archived_at: { type: DataTypes.DATE },
}, {
  tableName: 'document_templates',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = DocumentTemplate;
