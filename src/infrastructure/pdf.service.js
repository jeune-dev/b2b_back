'use strict';

const PDFDocument = require('pdfkit');

/**
 * Génération de PDF (bons de commande § 9, factures § 14) avec pdfkit — pur
 * JavaScript, sans navigateur embarqué (même choix que Widjila et Immo).
 *
 * Mise en page paramétrable par le MODÈLE de l'entreprise (§ 15) : couleur,
 * papier à en-tête (image de fond répétée sur chaque page), marges laissant
 * libre l'en-tête et le pied imprimés, texte de pied de page.
 *
 * Toutes les chaînes insérées viennent de la base : pdfkit les écrit comme du
 * texte, aucune interprétation (pas d'injection possible dans le document).
 */

const COULEURS = { texte: '#1f2937', gris: '#6b7280', trait: '#d1d5db', accent: '#0F4C81' };

/**
 * Construit un PDF en mémoire.
 * @param {(doc: PDFKit.PDFDocument, aides: object) => (void|Promise<void>)} dessiner
 * @param {object} [options]
 * @param {string} [options.titre]
 * @param {string} [options.auteur]
 * @param {string} [options.accent]       couleur d'accent (#RRGGBB)
 * @param {Buffer|null} [options.fond]    image de fond (papier à en-tête), chaque page
 * @param {number} [options.margeHaut]
 * @param {number} [options.margeBas]
 * @param {string|null} [options.pied]   texte de pied de page (mentions)
 * @returns {Promise<Buffer>}
 */
function generer(dessiner, options = {}) {
  const accent = options.accent || COULEURS.accent;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: options.margeHaut || 50, bottom: options.margeBas || 60, left: 50, right: 50 },
      info: { Title: options.titre || 'Document', Author: options.auteur || (process.env.APP_NAME || 'Pro2Link'), Producer: 'pdfkit' },
      bufferPages: true,
    });
    const morceaux = [];
    doc.on('data', (m) => morceaux.push(m));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);

    const poserFond = () => {
      if (!options.fond) return;
      const { x, y } = doc;
      doc.image(options.fond, 0, 0, { width: doc.page.width, height: doc.page.height });
      doc.x = x;
      doc.y = y;
    };
    try {
      poserFond();
    } catch (err) {
      // Image de fond illisible : le document est produit sans elle plutôt que pas du tout.
      options.fond = null;
    }
    doc.on('pageAdded', poserFond);

    Promise.resolve()
      .then(() => dessiner(doc, aides(doc, accent)))
      .then(() => {
        piedsDePage(doc, options.pied);
        doc.end();
      })
      .catch((err) => {
        doc.end();
        reject(err);
      });
  });
}

function aides(doc, accent) {
  const largeur = () => doc.page.width - doc.page.margins.left - doc.page.margins.right;
  return {
    accent,
    titre(texte) {
      doc.fillColor(accent).fontSize(18).font('Helvetica-Bold').text(texte, { align: 'right' });
      doc.moveDown(0.3);
      doc.fillColor(COULEURS.texte).font('Helvetica').fontSize(10);
    },
    sousTitre(texte) {
      doc.moveDown(0.6);
      doc.fillColor(accent).fontSize(11).font('Helvetica-Bold').text(texte);
      const y = doc.y + 2;
      doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + largeur(), y).strokeColor(COULEURS.trait).stroke();
      doc.moveDown(0.4);
      doc.fillColor(COULEURS.texte).font('Helvetica').fontSize(10);
    },
    /** Lignes « Libellé : valeur » ; les valeurs vides sont omises. */
    champs(paires) {
      for (const [libelle, valeur] of paires) {
        if (valeur === undefined || valeur === null || valeur === '') continue;
        doc.font('Helvetica-Bold').text(`${libelle} : `, { continued: true }).font('Helvetica').text(String(valeur));
      }
    },
    /** Deux blocs côte à côte (émetteur / destinataire). */
    deuxColonnes(gauche, droite) {
      const y = doc.y;
      const moitie = largeur() / 2 - 10;
      const ecrire = (bloc, x) => {
        doc.x = x;
        doc.y = y;
        doc.fillColor(accent).font('Helvetica-Bold').fontSize(9).text(bloc.titre.toUpperCase(), x, y, { width: moitie });
        doc.fillColor(COULEURS.texte).font('Helvetica-Bold').fontSize(11).text(bloc.nom || '', { width: moitie });
        doc.font('Helvetica').fontSize(9);
        for (const l of bloc.lignes.filter(Boolean)) doc.text(l, { width: moitie });
        return doc.y;
      };
      const finGauche = ecrire(gauche, doc.page.margins.left);
      const finDroite = ecrire(droite, doc.page.margins.left + moitie + 20);
      doc.x = doc.page.margins.left;
      doc.y = Math.max(finGauche, finDroite) + 8;
      doc.fontSize(10);
    },
    paragraphe(texte, opts = {}) {
      doc.font('Helvetica').fontSize(opts.taille || 10).fillColor(opts.couleur || COULEURS.texte)
        .text(String(texte || ''), { align: opts.align || 'left' });
      doc.moveDown(0.4);
    },
    note(texte) {
      doc.fontSize(8).fillColor(COULEURS.gris).text(texte, { align: 'left' });
      doc.fillColor(COULEURS.texte).fontSize(10);
    },
    /** Tableau simple : entêtes + lignes (texte) ; alignement par colonne. */
    tableau(entetes, lignes, largeursRelatives, alignements = []) {
      const total = largeur();
      const somme = largeursRelatives.reduce((a, b) => a + b, 0);
      const colonnes = largeursRelatives.map((l) => (l / somme) * total);
      const ecrireLigne = (cellules, entete) => {
        doc.font(entete ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
        let hauteur = 0;
        cellules.forEach((c, i) => {
          hauteur = Math.max(hauteur, doc.heightOfString(String(c ?? ''), { width: colonnes[i] - 6 }));
        });
        if (doc.y + hauteur + 8 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        const yl = doc.y;
        if (entete) doc.rect(doc.page.margins.left, yl, total, hauteur + 6).fill(accent);
        let x = doc.page.margins.left;
        cellules.forEach((c, i) => {
          doc.font(entete ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(entete ? '#ffffff' : COULEURS.texte)
            .text(String(c ?? ''), x + 3, yl + 3, { width: colonnes[i] - 6, align: alignements[i] || 'left' });
          x += colonnes[i];
        });
        doc.y = yl + hauteur + 6;
        if (!entete) doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + total, doc.y).strokeColor(COULEURS.trait).stroke();
        doc.x = doc.page.margins.left;
      };
      ecrireLigne(entetes, true);
      lignes.forEach((l) => ecrireLigne(l, false));
      doc.moveDown(0.5);
      doc.fillColor(COULEURS.texte).fontSize(10);
    },
    /** Encadré des totaux, aligné à droite. */
    totaux(paires) {
      const larg = 220;
      const x = doc.page.margins.left + largeur() - larg;
      if (doc.y + paires.length * 16 + 10 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      for (const [libelle, valeur, fort] of paires) {
        const y = doc.y;
        doc.font(fort ? 'Helvetica-Bold' : 'Helvetica').fontSize(fort ? 11 : 9.5).fillColor(fort ? accent : COULEURS.texte);
        doc.text(libelle, x, y, { width: larg / 2 });
        doc.text(valeur, x + larg / 2, y, { width: larg / 2, align: 'right' });
        doc.y = y + (fort ? 16 : 14);
      }
      doc.x = doc.page.margins.left;
      doc.fillColor(COULEURS.texte).font('Helvetica').fontSize(10);
      doc.moveDown(0.5);
    },
    largeur,
  };
}

function piedsDePage(doc, texte) {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(pages.start + i);
    const bas = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const largeurUtile = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    if (texte) {
      doc.fontSize(7).fillColor(COULEURS.gris).text(String(texte).slice(0, 400), doc.page.margins.left, doc.page.height - 52, { align: 'center', width: largeurUtile });
    }
    doc.fontSize(8).fillColor(COULEURS.gris).text(
      `Page ${i + 1} / ${pages.count}`,
      doc.page.margins.left,
      doc.page.height - 30,
      { align: 'center', width: largeurUtile }
    );
    doc.page.margins.bottom = bas;
  }
}

module.exports = { generer, COULEURS };
