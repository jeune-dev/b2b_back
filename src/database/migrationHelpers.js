'use strict';

/**
 * Aides d'écriture des migrations SQL.
 *
 * Placé HORS de src/migrations : sequelize-cli exécute tout fichier .js de ce
 * dossier comme une migration.
 */

/** `CHECK (col IN ('a','b'))` à partir d'une énumération de config/enums.js. */
const dans = (colonne, enumeration) => {
  const valeurs = Array.isArray(enumeration) ? enumeration : Object.keys(enumeration);
  return `CHECK (${colonne} IN (${valeurs.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')}))`;
};

/**
 * Remplace la contrainte CHECK d'énumération d'une colonne (nom attribué par
 * PostgreSQL à un CHECK de colonne : `<table>_<colonne>_check`) — quand une
 * énumération de config/enums.js gagne des valeurs.
 */
const remplacerCheck = (table, colonne, enumeration) => [
  `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_${colonne}_check`,
  `ALTER TABLE ${table} ADD CONSTRAINT ${table}_${colonne}_check ${dans(colonne, enumeration)}`,
];

/** Colonnes d'horodatage standard. */
const HORODATAGE = `
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()`;

/** Exécute une liste d'instructions SQL dans une transaction. */
async function executer(queryInterface, instructions) {
  await queryInterface.sequelize.transaction(async (transaction) => {
    for (const sql of instructions) {
      await queryInterface.sequelize.query(sql, { transaction });
    }
  });
}

module.exports = { dans, remplacerCheck, HORODATAGE, executer };
