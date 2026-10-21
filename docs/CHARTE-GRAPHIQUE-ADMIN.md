# Charte graphique — Applications web Pro2Link (back-office Super Admin et espace web des entreprises)

Interfaces web de Pro2Link : le back-office du super admin et l’espace web des entreprises (acheteurs et fournisseurs) — une seule charte, un seul thème. Ce document contient **tout** : palette, typographie, règles, couleur de chaque statut et le **code du thème prêt à copier** (section 7).

## 1. Palette

Palette retenue : **« Bleu Pro2Link et turquoise »**. Le bleu profond inspire la confiance qu’on attend d’un outil qui porte des commandes, des factures et des dettes entre entreprises — c’est aussi la couleur par défaut des bons de commande et factures PDF générés par l’API, l’application et les documents se ressemblent ; le turquoise évoque le **lien** entre acheteurs et fournisseurs et met en avant les actions de création.

| Rôle | Mode clair | Mode sombre | Dans le code |
|---|---|---|---|
| Primaire | `#0F4C81` | `#6BA6E0` | `--pl-primaire` |
| Primaire (survol / appui) | `#0B3A63` | `#8AB9E8` | `--pl-primaire-survol` |
| Primaire teinte (fonds légers) | `#E6EFF8` | `#142C45` | `--pl-primaire-teinte` |
| Texte sur primaire | `#FFFFFF` | `#08223A` | `--pl-sur-primaire` |
| Secondaire (turquoise) | `#14B8A6` | `#14B8A6` | `--pl-secondaire` |
| Secondaire (survol / appui) | `#0D9488` | `#2DD4BF` | `--pl-secondaire-survol` |
| Secondaire teinte | `#E0F7F4` | `#0F302D` | `--pl-secondaire-teinte` |
| Texte sur secondaire | `#04302F` | `#04302F` | `--pl-sur-secondaire` |
| Fond des écrans | `#F7F8FA` | `#0E1621` | `--pl-fond` |
| Surface (cartes, champs) | `#FFFFFF` | `#16202D` | `--pl-surface` |
| Surface alternative | `#F1F3F6` | `#1E2A3A` | `--pl-surface-alt` |
| Bordure | `#E2E6EC` | `#2A3747` | `--pl-bordure` |
| Bordure forte | `#CBD2DB` | `#3A4A5E` | `--pl-bordure-forte` |
| Contour des champs | `#848E9D` | `#66778C` | `--pl-bordure-champ` |
| Texte principal | `#1F2937` | `#E6EAF0` | `--pl-texte` |
| Texte secondaire | `#6B7280` | `#A3AEBD` | `--pl-texte-secondaire` |
| Texte discret (indications) | `#9CA3AF` | `#6B7686` | `--pl-texte-discret` |

### Couleurs d’état

| Ton | Texte (clair) | Fond (clair) | Texte (sombre) | Fond (sombre) |
|---|---|---|---|---|
| Succès | `#18763A` | `#E6F4EA` | `#4CC27A` | `#133222` |
| Avertissement | `#B45309` | `#FFF4E5` | `#FB923C` | `#3A2412` |
| Danger | `#C62828` | `#FDECEC` | `#F87171` | `#3B1717` |
| Info | `#0F4C81` | `#E6EFF8` | `#6BA6E0` | `#142C45` |
| Neutre | `#4B5563` | `#F1F3F6` | `#A3AEBD` | `#1E2A3A` |

## 2. Typographie

- Police : **Inter** (chiffres très lisibles pour les montants en FCFA) ; repli : system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif.
- Graisses : 400 (normal), 500 (moyen), 600 (titres, boutons, badges).
- Montants : chiffres à **largeur fixe** pour aligner les colonnes ; FCFA sans décimale, espace insécable entre les milliers : `4 250 000 FCFA`.

| Usage | Taille |
|---|---|
| Légende, badge | 12 px |
| Texte secondaire, libellés | 14 px |
| Texte courant | 16 px |
| Sous-titre | 18 px |
| Titre d’écran | 22 px |
| Grand titre | 28 px |
| Chiffre clé (tableau de bord) | 32 px |

## 3. Espacements et rayons

| Espacement | Valeur |
|---|---|
| xs | 4 px |
| sm | 8 px |
| md | 12 px |
| lg | 16 px |
| xl | 24 px |
| xxl | 32 px |

| Rayon | Valeur |
|---|---|
| Petit | 6 px |
| Boutons, champs | 8 px |
| Cartes | 12 px |
| Feuilles, modales | 16 px |
| Badges (pilule) | 999 px |

## 4. Règles d’utilisation

1. **Un seul bouton principal (bleu plein) par écran.** Les autres actions : contour ou texte.
2. **Le turquoise n’est jamais un état.** Il sert à mettre en avant (créer un bon de commande, ajouter un produit, inviter un partenaire). Un état (« À valider », « Payée ») utilise les couleurs d’état de la section 1.
3. **Sur le turquoise, le texte est toujours foncé** (`#04302F`), jamais blanc.
4. **Un statut n’est jamais une couleur seule** : toujours le **libellé**, et une icône si possible (environ 1 homme sur 12 distingue mal le rouge du vert).
5. **Les libellés de statut viennent de l’API** (`GET /api/v1/referentiels`) : ne pas les réécrire. La charte ne donne que la **couleur** de chaque code ; un code inconnu (ajouté plus tard côté API) s’affiche en *Neutre*.
6. **Jamais de couleur en dur** dans les écrans : toujours passer par le thème (le mode sombre suit alors tout seul).
7. **Champs de saisie** : contour *Contour des champs* (contraste ≥ 3:1), pour qu’un champ reste repérable par tous.

## 5. Couleur de chaque statut de l’API

Code renvoyé dans le champ `status` → ton à appliquer (couleurs du ton : section 1).

Les familles reprennent EXACTEMENT les énumérations de l’API (`GET /api/v1/referentiels`, clé en minuscules : `statut_commande`, `statut_facture`…). Lignes de proposition, versions et approbations utilisent le même composant de badge que les commandes.

**Bon de commande** (`commande`)

| Code | Ton |
|---|---|
| `brouillon` | Neutre |
| `envoyee` | Info |
| `en_attente_validation` | Avertissement |
| `proposition_modifiee` | Avertissement |
| `validee` | Info |
| `en_preparation` | Info |
| `prete` | Info |
| `livree_partiellement` | Avertissement |
| `livree` | Info |
| `reception_confirmee` | Succès |
| `facturee` | Info |
| `terminee` | Succès |
| `refusee` | Danger |
| `annulee` | Neutre |

**Version de commande (proposition)** (`version`)

| Code | Ton |
|---|---|
| `brouillon` | Neutre |
| `proposee` | Avertissement |
| `acceptee` | Succès |
| `refusee` | Danger |
| `remplacee` | Neutre |

**Ligne modifiée dans une proposition** (`changementLigne`)

| Code | Ton |
|---|---|
| `inchangee` | Neutre |
| `quantite_modifiee` | Avertissement |
| `prix_modifie` | Avertissement |
| `indisponible` | Danger |
| `ajoutee` | Info |
| `substitution` | Info |

**Approbation interne** (`approbation`)

| Code | Ton |
|---|---|
| `non_requise` | Neutre |
| `en_attente` | Avertissement |
| `approuvee` | Succès |
| `rejetee` | Danger |

**Livraison (bon de livraison)** (`livraison`)

| Code | Ton |
|---|---|
| `expediee` | Info |
| `receptionnee` | Succès |

**Facture** (`facture`)

| Code | Ton |
|---|---|
| `emise` | Info |
| `partiellement_payee` | Avertissement |
| `payee` | Succès |
| `en_retard` | Danger |
| `annulee` | Neutre |

**Rapprochement commande / réception / facture** (`rapprochement`)

| Code | Ton |
|---|---|
| `conforme` | Succès |
| `ecart` | Avertissement |
| `accepte` | Info |
| `conteste` | Danger |

**Paiement** (`paiement`)

| Code | Ton |
|---|---|
| `declare` | Avertissement |
| `confirme` | Succès |
| `rejete` | Danger |
| `annule` | Neutre |

**Avoir** (`avoir`)

| Code | Ton |
|---|---|
| `emis` | Info |
| `annule` | Neutre |

**Litige** (`litige`)

| Code | Ton |
|---|---|
| `ouvert` | Avertissement |
| `accepte` | Succès |
| `refuse` | Danger |
| `annule` | Neutre |

**Partenariat** (`partenariat`)

| Code | Ton |
|---|---|
| `en_attente` | Avertissement |
| `actif` | Succès |
| `refuse` | Danger |
| `suspendu` | Danger |

**Invitation d’un partenaire** (`invitationPartenaire`)

| Code | Ton |
|---|---|
| `en_attente` | Avertissement |
| `acceptee` | Succès |
| `expiree` | Neutre |
| `annulee` | Neutre |

**Disponibilité d’un produit** (`disponibilite`)

| Code | Ton |
|---|---|
| `disponible` | Succès |
| `stock_limite` | Avertissement |
| `sur_commande` | Info |
| `rupture` | Danger |

**Modèle de document** (`modeleDocument`)

| Code | Ton |
|---|---|
| `actif` | Succès |
| `archive` | Neutre |

**Abonnement** (`abonnement`)

| Code | Ton |
|---|---|
| `essai` | Info |
| `actif` | Succès |
| `expire` | Danger |
| `suspendu` | Danger |
| `annule` | Neutre |

**Paiement d’abonnement** (`paiementAbonnement`)

| Code | Ton |
|---|---|
| `initie` | Neutre |
| `confirme` | Succès |
| `echoue` | Danger |
| `annule` | Neutre |

**Entreprise** (`entreprise`)

| Code | Ton |
|---|---|
| `actif` | Succès |
| `suspendu` | Danger |

**Utilisateur de l’entreprise** (`membre`)

| Code | Ton |
|---|---|
| `actif` | Succès |
| `inactif` | Neutre |

**Plan d’abonnement** (`plan`)

| Code | Ton |
|---|---|
| `actif` | Succès |
| `inactif` | Neutre |

## 6. Accessibilité (contrôlée)

Tous les couples texte / fond respectent le niveau **WCAG AA** (contraste ≥ 4,5:1), en clair comme en sombre (contrôlés par calcul) : texte blanc sur bleu **8,9:1**, bleu sur fond d’écran **8,3:1**, texte foncé sur turquoise **5,7:1**, bleu clair sur fond sombre **7,1:1**, « En retard » **4,9:1**, « À valider » (avertissement) **4,6:1**, « Payée » (succès) **5,0:1**, texte secondaire **4,8:1**. Les contours de champ dépassent **3:1** (3,3:1 en clair, 3,6:1 en sombre). Le turquoise ne porte **jamais** de texte blanc (2,5:1 : illisible).

## 7. Code du thème

Vérifié : `statuts.ts` compile en TypeScript strict ; le préréglage Tailwind se charge.

### Installation

1. Créer `src/theme/theme.css` (ci-dessous) et l’importer **une fois**, à la racine de l’application, avant les autres styles.
2. N’utiliser que les variables `--pl-*` : `background: var(--pl-primaire); color: var(--pl-sur-primaire);`.
3. Composants prêts : `.pl-btn--primaire`, `.pl-btn--secondaire`, `.pl-btn--contour`, `.pl-btn--danger`, `.pl-carte`, `.pl-champ`, `.pl-badge`, `.pl-montant`.
4. Mode sombre : automatique (préférence du système), ou forcé avec `<html data-theme="dark">` / `"light"`.
5. Statut : `<span class="pl-badge" data-ton={tonDe('commande', c.status)}>{libelle}</span>`.
6. Graphiques (Chart.js…) : `couleurCalculee('primaire')` renvoie la couleur réelle du mode en cours.

Exemple :

```html
<button class="pl-btn pl-btn--primaire">Envoyer le bon de commande</button>
<button class="pl-btn pl-btn--secondaire">Nouveau bon de commande</button>
<span class="pl-badge" data-ton="danger">En retard</span>
<td class="pl-montant">12 400 000</td>
```

### `src/theme/theme.css`

```css
/*
 * Charte Pro2Link — palette « Bleu Pro2Link et turquoise ».
 * Valeurs reprises de cette charte (source unique).
 *
 * Importer UNE fois à la racine de l'application (avant tout autre style) :
 *   import './theme.css';
 * Puis n'utiliser QUE ces variables (jamais de couleur en dur) :
 *   color: var(--pl-texte); background: var(--pl-primaire);
 *
 * Mode sombre : automatique selon le système, ou forcé avec
 *   <html data-theme="dark">  /  <html data-theme="light">
 */

:root {
  /* ── Marque ─────────────────────────────────────────────── */
  --pl-primaire: #0F4C81;
  --pl-primaire-survol: #0B3A63;
  --pl-primaire-teinte: #E6EFF8;
  --pl-sur-primaire: #FFFFFF;
  --pl-secondaire: #14B8A6;
  --pl-secondaire-survol: #0D9488;
  --pl-secondaire-teinte: #E0F7F4;
  --pl-sur-secondaire: #04302F; /* texte sur le turquoise : toujours foncé */

  /* ── Neutres ────────────────────────────────────────────── */
  --pl-fond: #F7F8FA;
  --pl-surface: #FFFFFF;
  --pl-surface-alt: #F1F3F6;
  --pl-bordure: #E2E6EC;
  --pl-bordure-forte: #CBD2DB;
  --pl-bordure-champ: #848E9D; /* contour des champs : contraste ≥ 3:1 */
  --pl-texte: #1F2937;
  --pl-texte-secondaire: #6B7280;
  --pl-texte-discret: #9CA3AF;

  /* ── États ──────────────────────────────────────────────── */
  --pl-succes: #18763A;
  --pl-succes-fond: #E6F4EA;
  --pl-avertissement: #B45309;
  --pl-avertissement-fond: #FFF4E5;
  --pl-danger: #C62828;
  --pl-danger-fond: #FDECEC;
  --pl-info: #0F4C81;
  --pl-info-fond: #E6EFF8;
  --pl-neutre: #4B5563;
  --pl-neutre-fond: #F1F3F6;

  /* ── Typographie ────────────────────────────────────────── */
  --pl-police: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --pl-taille-legende: 12px;
  --pl-taille-petit: 14px;
  --pl-taille-corps: 16px;
  --pl-taille-sous-titre: 18px;
  --pl-taille-titre: 22px;
  --pl-taille-grand-titre: 28px;
  --pl-taille-chiffre-cle: 32px;

  /* ── Espacements et rayons ──────────────────────────────── */
  --pl-espace-xs: 4px;
  --pl-espace-sm: 8px;
  --pl-espace-md: 12px;
  --pl-espace-lg: 16px;
  --pl-espace-xl: 24px;
  --pl-espace-xxl: 32px;
  --pl-rayon-petit: 6px;
  --pl-rayon: 8px;
  --pl-rayon-carte: 12px;
  --pl-rayon-feuille: 16px;
  --pl-rayon-pilule: 999px;

  --pl-focus: 0 0 0 3px rgba(15, 76, 129, 0.35);
  color-scheme: light;
}

/* Mode sombre : préférence du système, sauf choix explicite « light ». */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --pl-primaire: #6BA6E0;
    --pl-primaire-survol: #8AB9E8;
    --pl-primaire-teinte: #142C45;
    --pl-sur-primaire: #08223A;
    --pl-secondaire-survol: #2DD4BF;
    --pl-secondaire-teinte: #0F302D;
    --pl-fond: #0E1621;
    --pl-surface: #16202D;
    --pl-surface-alt: #1E2A3A;
    --pl-bordure: #2A3747;
    --pl-bordure-forte: #3A4A5E;
    --pl-bordure-champ: #66778C;
    --pl-texte: #E6EAF0;
    --pl-texte-secondaire: #A3AEBD;
    --pl-texte-discret: #6B7686;
    --pl-succes: #4CC27A;
    --pl-succes-fond: #133222;
    --pl-avertissement: #FB923C;
    --pl-avertissement-fond: #3A2412;
    --pl-danger: #F87171;
    --pl-danger-fond: #3B1717;
    --pl-info: #6BA6E0;
    --pl-info-fond: #142C45;
    --pl-neutre: #A3AEBD;
    --pl-neutre-fond: #1E2A3A;
    --pl-focus: 0 0 0 3px rgba(107, 166, 224, 0.4);
    color-scheme: dark;
  }
}

:root[data-theme="dark"] {
  --pl-primaire: #6BA6E0;
  --pl-primaire-survol: #8AB9E8;
  --pl-primaire-teinte: #142C45;
  --pl-sur-primaire: #08223A;
  --pl-secondaire-survol: #2DD4BF;
  --pl-secondaire-teinte: #0F302D;
  --pl-fond: #0E1621;
  --pl-surface: #16202D;
  --pl-surface-alt: #1E2A3A;
  --pl-bordure: #2A3747;
  --pl-bordure-forte: #3A4A5E;
  --pl-bordure-champ: #66778C;
  --pl-texte: #E6EAF0;
  --pl-texte-secondaire: #A3AEBD;
  --pl-texte-discret: #6B7686;
  --pl-succes: #4CC27A;
  --pl-succes-fond: #133222;
  --pl-avertissement: #FB923C;
  --pl-avertissement-fond: #3A2412;
  --pl-danger: #F87171;
  --pl-danger-fond: #3B1717;
  --pl-info: #6BA6E0;
  --pl-info-fond: #142C45;
  --pl-neutre: #A3AEBD;
  --pl-neutre-fond: #1E2A3A;
  --pl-focus: 0 0 0 3px rgba(107, 166, 224, 0.4);
  color-scheme: dark;
}

/* ── Base ─────────────────────────────────────────────────── */
body {
  margin: 0;
  background: var(--pl-fond);
  color: var(--pl-texte);
  font-family: var(--pl-police);
  font-size: var(--pl-taille-corps);
  line-height: 1.5;
}

/* Montants : chiffres de largeur fixe, colonnes alignées. */
.pl-montant { font-variant-numeric: tabular-nums; white-space: nowrap; }

/* ── Composants de base (facultatifs, prêts à l'emploi) ─────── */
.pl-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--pl-espace-sm);
  min-height: 40px; padding: 0 var(--pl-espace-lg);
  border-radius: var(--pl-rayon); border: 1px solid transparent;
  font: 600 var(--pl-taille-petit)/1 var(--pl-police); cursor: pointer;
  transition: background-color .15s, border-color .15s;
}
.pl-btn:focus-visible { outline: none; box-shadow: var(--pl-focus); }
.pl-btn:disabled { opacity: .55; cursor: not-allowed; }

/* UN bouton principal par écran. */
.pl-btn--primaire { background: var(--pl-primaire); color: var(--pl-sur-primaire); }
.pl-btn--primaire:hover:not(:disabled) { background: var(--pl-primaire-survol); }
/* Mise en avant (création) — jamais pour un état. */
.pl-btn--secondaire { background: var(--pl-secondaire); color: var(--pl-sur-secondaire); }
.pl-btn--secondaire:hover:not(:disabled) { background: var(--pl-secondaire-survol); }
.pl-btn--contour { background: transparent; color: var(--pl-primaire); border-color: var(--pl-primaire); }
.pl-btn--contour:hover:not(:disabled) { background: var(--pl-primaire-teinte); }
.pl-btn--danger { background: var(--pl-danger); color: #FFFFFF; }

.pl-carte {
  background: var(--pl-surface);
  border: 1px solid var(--pl-bordure);
  border-radius: var(--pl-rayon-carte);
  padding: var(--pl-espace-lg) var(--pl-espace-xl);
}

.pl-champ {
  width: 100%; box-sizing: border-box; min-height: 40px; padding: 0 var(--pl-espace-md);
  background: var(--pl-surface); color: var(--pl-texte);
  border: 1px solid var(--pl-bordure-champ); border-radius: var(--pl-rayon);
  font: inherit;
}
.pl-champ::placeholder { color: var(--pl-texte-discret); }
.pl-champ:focus { outline: none; border-color: var(--pl-primaire); box-shadow: var(--pl-focus); }
.pl-champ[aria-invalid="true"] { border-color: var(--pl-danger); }

/* Badge de statut : <span class="pl-badge" data-ton="danger">En retard</span>
   (ton donné par statuts.ts › tonDe). Toujours avec le LIBELLÉ. */
.pl-badge {
  display: inline-flex; align-items: center; gap: var(--pl-espace-xs);
  padding: 2px 10px; border-radius: var(--pl-rayon-pilule);
  font-size: var(--pl-taille-legende); font-weight: 600; white-space: nowrap;
  color: var(--pl-neutre); background: var(--pl-neutre-fond);
}
.pl-badge[data-ton="succes"] { color: var(--pl-succes); background: var(--pl-succes-fond); }
.pl-badge[data-ton="avertissement"] { color: var(--pl-avertissement); background: var(--pl-avertissement-fond); }
.pl-badge[data-ton="danger"] { color: var(--pl-danger); background: var(--pl-danger-fond); }
.pl-badge[data-ton="info"] { color: var(--pl-info); background: var(--pl-info-fond); }
.pl-badge[data-ton="neutre"] { color: var(--pl-neutre); background: var(--pl-neutre-fond); }
```

### `src/theme/tailwind.preset.js` (si le projet utilise Tailwind)

```js
/**
 * Préréglage Tailwind CSS (v3) de la charte Pro2Link.
 *
 * Les couleurs pointent vers les variables de theme.css : le mode sombre
 * fonctionne sans aucune classe `dark:`.
 *
 *   // tailwind.config.js
 *   module.exports = {
 *     presets: [require('./theme/tailwind.preset.js')],
 *     content: ['./src/**\/*.{js,jsx,ts,tsx,vue,html}'],
 *   };
 *
 * Exemples : `bg-primaire text-sur-primaire`, `bg-secondaire text-sur-secondaire`,
 * `text-texte-secondaire`, `border-bordure`, `bg-danger-fond text-danger`, `rounded-carte`.
 *
 * Tailwind v4 : copier plutôt le bloc @theme de la fin de ce fichier dans le CSS.
 */
const v = (nom) => `var(--pl-${nom})`;

module.exports = {
  theme: {
    extend: {
      colors: {
        primaire: { DEFAULT: v('primaire'), survol: v('primaire-survol'), teinte: v('primaire-teinte') },
        'sur-primaire': v('sur-primaire'),
        secondaire: { DEFAULT: v('secondaire'), survol: v('secondaire-survol'), teinte: v('secondaire-teinte') },
        'sur-secondaire': v('sur-secondaire'),
        fond: v('fond'),
        surface: { DEFAULT: v('surface'), alt: v('surface-alt') },
        bordure: { DEFAULT: v('bordure'), forte: v('bordure-forte'), champ: v('bordure-champ') },
        texte: { DEFAULT: v('texte'), secondaire: v('texte-secondaire'), discret: v('texte-discret') },
        succes: { DEFAULT: v('succes'), fond: v('succes-fond') },
        avertissement: { DEFAULT: v('avertissement'), fond: v('avertissement-fond') },
        danger: { DEFAULT: v('danger'), fond: v('danger-fond') },
        info: { DEFAULT: v('info'), fond: v('info-fond') },
        neutre: { DEFAULT: v('neutre'), fond: v('neutre-fond') },
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      fontSize: {
        legende: '12px', petit: '14px', corps: '16px', 'sous-titre': '18px', titre: '22px', 'grand-titre': '28px', 'chiffre-cle': '32px',
      },
      borderRadius: { petit: '6px', DEFAULT: '8px', carte: '12px', feuille: '16px', pilule: '999px' },
      spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', xxl: '32px' },
      boxShadow: { focus: v('focus') },
    },
  },
};

/*
 * ── Tailwind v4 (à coller dans le CSS principal, après @import "tailwindcss";
 *    et l'import de theme.css) ─────────────────────────────────────────────
 *
 * @theme inline {
 *   --color-primaire: var(--pl-primaire);
 *   --color-primaire-survol: var(--pl-primaire-survol);
 *   --color-primaire-teinte: var(--pl-primaire-teinte);
 *   --color-sur-primaire: var(--pl-sur-primaire);
 *   --color-secondaire: var(--pl-secondaire);
 *   --color-secondaire-survol: var(--pl-secondaire-survol);
 *   --color-secondaire-teinte: var(--pl-secondaire-teinte);
 *   --color-sur-secondaire: var(--pl-sur-secondaire);
 *   --color-fond: var(--pl-fond);
 *   --color-surface: var(--pl-surface);
 *   --color-surface-alt: var(--pl-surface-alt);
 *   --color-bordure: var(--pl-bordure);
 *   --color-bordure-forte: var(--pl-bordure-forte);
 *   --color-bordure-champ: var(--pl-bordure-champ);
 *   --color-texte: var(--pl-texte);
 *   --color-texte-secondaire: var(--pl-texte-secondaire);
 *   --color-texte-discret: var(--pl-texte-discret);
 *   --color-succes: var(--pl-succes);
 *   --color-succes-fond: var(--pl-succes-fond);
 *   --color-avertissement: var(--pl-avertissement);
 *   --color-avertissement-fond: var(--pl-avertissement-fond);
 *   --color-danger: var(--pl-danger);
 *   --color-danger-fond: var(--pl-danger-fond);
 *   --color-info: var(--pl-info);
 *   --color-info-fond: var(--pl-info-fond);
 *   --color-neutre: var(--pl-neutre);
 *   --color-neutre-fond: var(--pl-neutre-fond);
 *   --font-sans: var(--pl-police);
 *   --radius-carte: 12px;
 * }
 */
```

### `src/theme/statuts.ts`

```ts
/**
 * Ton visuel de chaque statut renvoyé par l'API (section 5 de la charte).
 *
 *   import { tonDe } from './theme/statuts';
 *   <span className="pl-badge" data-ton={tonDe('commande', c.status)}>{libelle}</span>
 *
 * Les LIBELLÉS viennent de `GET /api/v1/referentiels` : ne pas les réécrire ici.
 * Afficher TOUJOURS le libellé avec la couleur (daltonisme, lecteurs d'écran).
 */

export type TonStatut = 'succes' | 'avertissement' | 'danger' | 'info' | 'neutre';

export const TONS_DES_STATUTS = {
  commande: { brouillon: 'neutre', envoyee: 'info', en_attente_validation: 'avertissement', proposition_modifiee: 'avertissement', validee: 'info', en_preparation: 'info', prete: 'info', livree_partiellement: 'avertissement', livree: 'info', reception_confirmee: 'succes', facturee: 'info', terminee: 'succes', refusee: 'danger', annulee: 'neutre' },
  version: { brouillon: 'neutre', proposee: 'avertissement', acceptee: 'succes', refusee: 'danger', remplacee: 'neutre' },
  changementLigne: { inchangee: 'neutre', quantite_modifiee: 'avertissement', prix_modifie: 'avertissement', indisponible: 'danger', ajoutee: 'info', substitution: 'info' },
  approbation: { non_requise: 'neutre', en_attente: 'avertissement', approuvee: 'succes', rejetee: 'danger' },
  livraison: { expediee: 'info', receptionnee: 'succes' },
  facture: { emise: 'info', partiellement_payee: 'avertissement', payee: 'succes', en_retard: 'danger', annulee: 'neutre' },
  rapprochement: { conforme: 'succes', ecart: 'avertissement', accepte: 'info', conteste: 'danger' },
  paiement: { declare: 'avertissement', confirme: 'succes', rejete: 'danger', annule: 'neutre' },
  avoir: { emis: 'info', annule: 'neutre' },
  litige: { ouvert: 'avertissement', accepte: 'succes', refuse: 'danger', annule: 'neutre' },
  partenariat: { en_attente: 'avertissement', actif: 'succes', refuse: 'danger', suspendu: 'danger' },
  invitationPartenaire: { en_attente: 'avertissement', acceptee: 'succes', expiree: 'neutre', annulee: 'neutre' },
  disponibilite: { disponible: 'succes', stock_limite: 'avertissement', sur_commande: 'info', rupture: 'danger' },
  modeleDocument: { actif: 'succes', archive: 'neutre' },
  abonnement: { essai: 'info', actif: 'succes', expire: 'danger', suspendu: 'danger', annule: 'neutre' },
  paiementAbonnement: { initie: 'neutre', confirme: 'succes', echoue: 'danger', annule: 'neutre' },
  entreprise: { actif: 'succes', suspendu: 'danger' },
  membre: { actif: 'succes', inactif: 'neutre' },
  plan: { actif: 'succes', inactif: 'neutre' },
} as const satisfies Record<string, Record<string, TonStatut>>;

export type FamilleStatut = keyof typeof TONS_DES_STATUTS;

/** Ton d'un code ; `neutre` pour un code inconnu (nouvelle valeur côté API). */
export function tonDe(famille: FamilleStatut, code: string | null | undefined): TonStatut {
  const tons = TONS_DES_STATUTS[famille] as Record<string, TonStatut>;
  return (code && tons[code]) || 'neutre';
}

/** Variables CSS (texte, fond) d'un ton — pour un style en ligne ou un graphique. */
export function couleursDuTon(ton: TonStatut): { texte: string; fond: string } {
  return { texte: `var(--pl-${ton})`, fond: `var(--pl-${ton}-fond)` };
}

/**
 * Couleurs RÉELLES (hex) — pour les bibliothèques qui n'acceptent pas les
 * variables CSS (Chart.js, export PDF…). Lit la valeur calculée du mode en cours.
 */
export function couleurCalculee(nomVariable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--pl-${nomVariable}`).trim();
}
```

