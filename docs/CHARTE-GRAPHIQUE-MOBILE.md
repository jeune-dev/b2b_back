# Charte graphique — Application mobile Pro2Link (Flutter)

Application des entreprises acheteuses et fournisseurs (même charte que le web, § 23 « les deux applications se ressemblent »). Ce document contient **tout** : palette, typographie, règles, couleur de chaque statut et le **code du thème prêt à copier** (section 7).

## 1. Palette

Palette retenue : **« Bleu Pro2Link et turquoise »**. Le bleu profond inspire la confiance qu’on attend d’un outil qui porte des commandes, des factures et des dettes entre entreprises — c’est aussi la couleur par défaut des bons de commande et factures PDF générés par l’API, l’application et les documents se ressemblent ; le turquoise évoque le **lien** entre acheteurs et fournisseurs et met en avant les actions de création.

| Rôle | Mode clair | Mode sombre | Dans le code |
|---|---|---|---|
| Primaire | `#0F4C81` | `#6BA6E0` | `colorScheme.primary` |
| Primaire (survol / appui) | `#0B3A63` | `#8AB9E8` | `context.palette.primaireSurvol` |
| Primaire teinte (fonds légers) | `#E6EFF8` | `#142C45` | `context.palette.primaireTeinte` |
| Texte sur primaire | `#FFFFFF` | `#08223A` | `colorScheme.onPrimary` |
| Secondaire (turquoise) | `#14B8A6` | `#14B8A6` | `colorScheme.secondary` |
| Secondaire (survol / appui) | `#0D9488` | `#2DD4BF` | `context.palette.secondaireSurvol` |
| Secondaire teinte | `#E0F7F4` | `#0F302D` | `context.palette.secondaireTeinte` |
| Texte sur secondaire | `#04302F` | `#04302F` | `colorScheme.onSecondary` |
| Fond des écrans | `#F7F8FA` | `#0E1621` | `context.palette.fond` |
| Surface (cartes, champs) | `#FFFFFF` | `#16202D` | `colorScheme.surface` |
| Surface alternative | `#F1F3F6` | `#1E2A3A` | `context.palette.surfaceAlt` |
| Bordure | `#E2E6EC` | `#2A3747` | `context.palette.bordure` |
| Bordure forte | `#CBD2DB` | `#3A4A5E` | `context.palette.bordureForte` |
| Contour des champs | `#848E9D` | `#66778C` | `context.palette.bordureChamp` |
| Texte principal | `#1F2937` | `#E6EAF0` | `colorScheme.onSurface` |
| Texte secondaire | `#6B7280` | `#A3AEBD` | `context.palette.texteSecondaire` |
| Texte discret (indications) | `#9CA3AF` | `#6B7686` | `context.palette.texteDiscret` |

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

Créer ces trois fichiers dans `lib/theme/` (vérifiés : `flutter analyze` sans erreur, rendu testé en clair et en sombre).

### Installation

```dart
import 'theme/app_theme.dart';

MaterialApp(
  theme: AppTheme.clair,
  darkTheme: AppTheme.sombre,
  themeMode: ThemeMode.system,
);
```

Police **Inter** : déclarer les fichiers dans `pubspec.yaml` (famille `Inter`) ou utiliser le paquet `google_fonts`. Sans elle, la police du système s’affiche.

### Utilisation dans les écrans

- Couleurs de marque : `Theme.of(context).colorScheme.primary` / `.secondary`.
- Autres couleurs (états, textes secondaires, bordures) : `context.palette.succes`, `context.palette.texteSecondaire`…
- Statut : `BadgeStatut(famille: FamilleStatut.commande, code: c.status, libelle: libelleDuReferentiel)`.
- Boutons : `FilledButton` = action principale (bleu) · `OutlinedButton` = secondaire · `FloatingActionButton` = création (turquoise).
- Montants : `TextStyle(fontFeatures: [FontFeature.tabularFigures()])`.

### `lib/theme/app_colors.dart`

```dart
import 'package:flutter/material.dart';

/// Couleurs de la charte Pro2Link — palette « Bleu Pro2Link et turquoise ».
///
/// Valeurs reprises de `cette charte` (source unique) : ne pas
/// modifier une couleur ici sans la modifier là-bas (et côté back-office).
///
/// Dans les écrans, préférer `Theme.of(context).colorScheme` et l'extension
/// [AppPalette] (`context.palette`) : elles basculent seules en mode sombre.
abstract final class AppColors {
  // ── Marque ────────────────────────────────────────────────────────────────
  static const primaire = Color(0xFF0F4C81);
  static const primaireSurvol = Color(0xFF0B3A63);
  static const primaireTeinte = Color(0xFFE6EFF8);
  static const surPrimaire = Color(0xFFFFFFFF);

  static const secondaire = Color(0xFF14B8A6);
  static const secondaireSurvol = Color(0xFF0D9488);
  static const secondaireTeinte = Color(0xFFE0F7F4);

  /// Texte sur le turquoise : TOUJOURS foncé, jamais blanc (contraste 2,5:1).
  static const surSecondaire = Color(0xFF04302F);

  // ── Neutres (mode clair) ──────────────────────────────────────────────────
  static const fond = Color(0xFFF7F8FA);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceAlt = Color(0xFFF1F3F6);
  static const bordure = Color(0xFFE2E6EC);
  static const bordureForte = Color(0xFFCBD2DB);

  /// Contour des champs de saisie (contraste ≥ 3:1, repérable par tous).
  static const bordureChamp = Color(0xFF848E9D);
  static const texte = Color(0xFF1F2937);
  static const texteSecondaire = Color(0xFF6B7280);
  static const texteDiscret = Color(0xFF9CA3AF);

  // ── États (mode clair) ────────────────────────────────────────────────────
  static const succes = Color(0xFF18763A);
  static const succesFond = Color(0xFFE6F4EA);
  static const avertissement = Color(0xFFB45309);
  static const avertissementFond = Color(0xFFFFF4E5);
  static const danger = Color(0xFFC62828);
  static const dangerFond = Color(0xFFFDECEC);
  static const info = Color(0xFF0F4C81);
  static const infoFond = Color(0xFFE6EFF8);
  static const neutre = Color(0xFF4B5563);
  static const neutreFond = Color(0xFFF1F3F6);

  // ── Mode sombre ───────────────────────────────────────────────────────────
  static const sombrePrimaire = Color(0xFF6BA6E0);
  static const sombrePrimaireSurvol = Color(0xFF8AB9E8);
  static const sombrePrimaireTeinte = Color(0xFF142C45);
  static const sombreSurPrimaire = Color(0xFF08223A);
  static const sombreSecondaireSurvol = Color(0xFF2DD4BF);
  static const sombreSecondaireTeinte = Color(0xFF0F302D);
  static const sombreFond = Color(0xFF0E1621);
  static const sombreSurface = Color(0xFF16202D);
  static const sombreSurfaceAlt = Color(0xFF1E2A3A);
  static const sombreBordure = Color(0xFF2A3747);
  static const sombreBordureForte = Color(0xFF3A4A5E);
  static const sombreBordureChamp = Color(0xFF66778C);
  static const sombreTexte = Color(0xFFE6EAF0);
  static const sombreTexteSecondaire = Color(0xFFA3AEBD);
  static const sombreTexteDiscret = Color(0xFF6B7686);
  static const sombreSucces = Color(0xFF4CC27A);
  static const sombreSuccesFond = Color(0xFF133222);
  static const sombreAvertissement = Color(0xFFFB923C);
  static const sombreAvertissementFond = Color(0xFF3A2412);
  static const sombreDanger = Color(0xFFF87171);
  static const sombreDangerFond = Color(0xFF3B1717);
  static const sombreNeutre = Color(0xFFA3AEBD);
  static const sombreNeutreFond = Color(0xFF1E2A3A);
}

/// Couleurs hors `ColorScheme` (états, textes secondaires, bordures), en clair
/// et en sombre. Accès : `context.palette.succes`.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.fond,
    required this.surfaceAlt,
    required this.bordure,
    required this.bordureForte,
    required this.bordureChamp,
    required this.texte,
    required this.texteSecondaire,
    required this.texteDiscret,
    required this.primaireTeinte,
    required this.secondaireTeinte,
    required this.succes,
    required this.succesFond,
    required this.avertissement,
    required this.avertissementFond,
    required this.danger,
    required this.dangerFond,
    required this.info,
    required this.infoFond,
    required this.neutre,
    required this.neutreFond,
  });

  final Color fond;
  final Color surfaceAlt;
  final Color bordure;
  final Color bordureForte;
  final Color bordureChamp;
  final Color texte;
  final Color texteSecondaire;
  final Color texteDiscret;
  final Color primaireTeinte;
  final Color secondaireTeinte;
  final Color succes;
  final Color succesFond;
  final Color avertissement;
  final Color avertissementFond;
  final Color danger;
  final Color dangerFond;
  final Color info;
  final Color infoFond;
  final Color neutre;
  final Color neutreFond;

  static const clair = AppPalette(
    fond: AppColors.fond,
    surfaceAlt: AppColors.surfaceAlt,
    bordure: AppColors.bordure,
    bordureForte: AppColors.bordureForte,
    bordureChamp: AppColors.bordureChamp,
    texte: AppColors.texte,
    texteSecondaire: AppColors.texteSecondaire,
    texteDiscret: AppColors.texteDiscret,
    primaireTeinte: AppColors.primaireTeinte,
    secondaireTeinte: AppColors.secondaireTeinte,
    succes: AppColors.succes,
    succesFond: AppColors.succesFond,
    avertissement: AppColors.avertissement,
    avertissementFond: AppColors.avertissementFond,
    danger: AppColors.danger,
    dangerFond: AppColors.dangerFond,
    info: AppColors.info,
    infoFond: AppColors.infoFond,
    neutre: AppColors.neutre,
    neutreFond: AppColors.neutreFond,
  );

  static const sombre = AppPalette(
    fond: AppColors.sombreFond,
    surfaceAlt: AppColors.sombreSurfaceAlt,
    bordure: AppColors.sombreBordure,
    bordureForte: AppColors.sombreBordureForte,
    bordureChamp: AppColors.sombreBordureChamp,
    texte: AppColors.sombreTexte,
    texteSecondaire: AppColors.sombreTexteSecondaire,
    texteDiscret: AppColors.sombreTexteDiscret,
    primaireTeinte: AppColors.sombrePrimaireTeinte,
    secondaireTeinte: AppColors.sombreSecondaireTeinte,
    succes: AppColors.sombreSucces,
    succesFond: AppColors.sombreSuccesFond,
    avertissement: AppColors.sombreAvertissement,
    avertissementFond: AppColors.sombreAvertissementFond,
    danger: AppColors.sombreDanger,
    dangerFond: AppColors.sombreDangerFond,
    info: AppColors.sombrePrimaire,
    infoFond: AppColors.sombrePrimaireTeinte,
    neutre: AppColors.sombreNeutre,
    neutreFond: AppColors.sombreNeutreFond,
  );

  @override
  AppPalette copyWith({
    Color? fond,
    Color? surfaceAlt,
    Color? bordure,
    Color? bordureForte,
    Color? bordureChamp,
    Color? texte,
    Color? texteSecondaire,
    Color? texteDiscret,
    Color? primaireTeinte,
    Color? secondaireTeinte,
    Color? succes,
    Color? succesFond,
    Color? avertissement,
    Color? avertissementFond,
    Color? danger,
    Color? dangerFond,
    Color? info,
    Color? infoFond,
    Color? neutre,
    Color? neutreFond,
  }) {
    return AppPalette(
      fond: fond ?? this.fond,
      surfaceAlt: surfaceAlt ?? this.surfaceAlt,
      bordure: bordure ?? this.bordure,
      bordureForte: bordureForte ?? this.bordureForte,
      bordureChamp: bordureChamp ?? this.bordureChamp,
      texte: texte ?? this.texte,
      texteSecondaire: texteSecondaire ?? this.texteSecondaire,
      texteDiscret: texteDiscret ?? this.texteDiscret,
      primaireTeinte: primaireTeinte ?? this.primaireTeinte,
      secondaireTeinte: secondaireTeinte ?? this.secondaireTeinte,
      succes: succes ?? this.succes,
      succesFond: succesFond ?? this.succesFond,
      avertissement: avertissement ?? this.avertissement,
      avertissementFond: avertissementFond ?? this.avertissementFond,
      danger: danger ?? this.danger,
      dangerFond: dangerFond ?? this.dangerFond,
      info: info ?? this.info,
      infoFond: infoFond ?? this.infoFond,
      neutre: neutre ?? this.neutre,
      neutreFond: neutreFond ?? this.neutreFond,
    );
  }

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    Color m(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppPalette(
      fond: m(fond, other.fond),
      surfaceAlt: m(surfaceAlt, other.surfaceAlt),
      bordure: m(bordure, other.bordure),
      bordureForte: m(bordureForte, other.bordureForte),
      bordureChamp: m(bordureChamp, other.bordureChamp),
      texte: m(texte, other.texte),
      texteSecondaire: m(texteSecondaire, other.texteSecondaire),
      texteDiscret: m(texteDiscret, other.texteDiscret),
      primaireTeinte: m(primaireTeinte, other.primaireTeinte),
      secondaireTeinte: m(secondaireTeinte, other.secondaireTeinte),
      succes: m(succes, other.succes),
      succesFond: m(succesFond, other.succesFond),
      avertissement: m(avertissement, other.avertissement),
      avertissementFond: m(avertissementFond, other.avertissementFond),
      danger: m(danger, other.danger),
      dangerFond: m(dangerFond, other.dangerFond),
      info: m(info, other.info),
      infoFond: m(infoFond, other.infoFond),
      neutre: m(neutre, other.neutre),
      neutreFond: m(neutreFond, other.neutreFond),
    );
  }
}

extension AppPaletteContext on BuildContext {
  /// Couleurs de la charte pour le mode (clair / sombre) en cours.
  AppPalette get palette => Theme.of(this).extension<AppPalette>()!;
}
```

### `lib/theme/app_theme.dart`

```dart
import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Thème Material 3 de l'application (clair et sombre).
///
/// ```dart
/// MaterialApp(
///   theme: AppTheme.clair,
///   darkTheme: AppTheme.sombre,
///   themeMode: ThemeMode.system,
/// )
/// ```
///
/// Police : Inter (chiffres lisibles, montants en FCFA). L'ajouter dans
/// `pubspec.yaml` (assets `fonts/Inter-*.ttf`, famille « Inter ») ou via le
/// paquet `google_fonts`. Sans elle, la police du système est utilisée.
abstract final class AppTheme {
  static const police = 'Inter';

  // Espacements et rayons (section 3 de la charte).
  static const espaceXs = 4.0;
  static const espaceSm = 8.0;
  static const espaceMd = 12.0;
  static const espaceLg = 16.0;
  static const espaceXl = 24.0;
  static const espaceXxl = 32.0;
  static const rayonPetit = 6.0;
  static const rayon = 8.0;
  static const rayonCarte = 12.0;
  static const rayonFeuille = 16.0;

  static final ThemeData clair = _construire(
    Brightness.light,
    const ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.primaire,
      onPrimary: AppColors.surPrimaire,
      primaryContainer: AppColors.primaireTeinte,
      onPrimaryContainer: AppColors.primaireSurvol,
      secondary: AppColors.secondaire,
      onSecondary: AppColors.surSecondaire,
      secondaryContainer: AppColors.secondaireTeinte,
      onSecondaryContainer: AppColors.surSecondaire,
      tertiary: AppColors.succes,
      onTertiary: Color(0xFFFFFFFF),
      error: AppColors.danger,
      onError: Color(0xFFFFFFFF),
      errorContainer: AppColors.dangerFond,
      onErrorContainer: AppColors.danger,
      surface: AppColors.surface,
      onSurface: AppColors.texte,
      onSurfaceVariant: AppColors.texteSecondaire,
      surfaceContainerLowest: AppColors.surface,
      surfaceContainerLow: AppColors.fond,
      surfaceContainer: AppColors.surfaceAlt,
      surfaceContainerHigh: AppColors.surfaceAlt,
      surfaceContainerHighest: AppColors.bordure,
      outline: AppColors.bordureForte,
      outlineVariant: AppColors.bordure,
      shadow: Color(0xFF000000),
      scrim: Color(0xFF000000),
      inverseSurface: AppColors.texte,
      onInverseSurface: AppColors.surface,
      inversePrimary: AppColors.sombrePrimaire,
    ),
    AppPalette.clair,
  );

  static final ThemeData sombre = _construire(
    Brightness.dark,
    const ColorScheme(
      brightness: Brightness.dark,
      primary: AppColors.sombrePrimaire,
      onPrimary: AppColors.sombreSurPrimaire,
      primaryContainer: AppColors.sombrePrimaireTeinte,
      onPrimaryContainer: AppColors.sombreTexte,
      secondary: AppColors.secondaire,
      onSecondary: AppColors.surSecondaire,
      secondaryContainer: AppColors.sombreSecondaireTeinte,
      onSecondaryContainer: AppColors.secondaire,
      tertiary: AppColors.sombreSucces,
      onTertiary: AppColors.sombreFond,
      error: AppColors.sombreDanger,
      onError: AppColors.sombreFond,
      errorContainer: AppColors.sombreDangerFond,
      onErrorContainer: AppColors.sombreDanger,
      surface: AppColors.sombreSurface,
      onSurface: AppColors.sombreTexte,
      onSurfaceVariant: AppColors.sombreTexteSecondaire,
      surfaceContainerLowest: AppColors.sombreFond,
      surfaceContainerLow: AppColors.sombreFond,
      surfaceContainer: AppColors.sombreSurface,
      surfaceContainerHigh: AppColors.sombreSurfaceAlt,
      surfaceContainerHighest: AppColors.sombreBordure,
      outline: AppColors.sombreBordureForte,
      outlineVariant: AppColors.sombreBordure,
      shadow: Color(0xFF000000),
      scrim: Color(0xFF000000),
      inverseSurface: AppColors.sombreTexte,
      onInverseSurface: AppColors.sombreFond,
      inversePrimary: AppColors.primaire,
    ),
    AppPalette.sombre,
  );

  static ThemeData _construire(Brightness luminosite, ColorScheme cs, AppPalette p) {
    final base = ThemeData(useMaterial3: true, brightness: luminosite, colorScheme: cs, fontFamily: police);
    final texte = base.textTheme.apply(bodyColor: p.texte, displayColor: p.texte);
    final rayonControle = BorderRadius.circular(rayon);

    return base.copyWith(
      scaffoldBackgroundColor: p.fond,
      extensions: [p],
      textTheme: texte.copyWith(
        headlineMedium: texte.headlineMedium?.copyWith(fontSize: 28, fontWeight: FontWeight.w600),
        titleLarge: texte.titleLarge?.copyWith(fontSize: 22, fontWeight: FontWeight.w600),
        titleMedium: texte.titleMedium?.copyWith(fontSize: 18, fontWeight: FontWeight.w500),
        bodyLarge: texte.bodyLarge?.copyWith(fontSize: 16),
        bodyMedium: texte.bodyMedium?.copyWith(fontSize: 14, color: p.texteSecondaire),
        labelLarge: texte.labelLarge?.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
        bodySmall: texte.bodySmall?.copyWith(fontSize: 12, color: p.texteSecondaire),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: luminosite == Brightness.light ? cs.primary : cs.surface,
        foregroundColor: luminosite == Brightness.light ? cs.onPrimary : cs.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: cs.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(rayonCarte), side: BorderSide(color: p.bordure)),
      ),
      // Bouton principal (UN par écran) : bleu.
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: cs.primary,
          foregroundColor: cs.onPrimary,
          minimumSize: const Size(64, 48),
          shape: RoundedRectangleBorder(borderRadius: rayonControle),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      // Bouton secondaire : contour bleu.
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: cs.primary,
          side: BorderSide(color: cs.primary),
          minimumSize: const Size(64, 48),
          shape: RoundedRectangleBorder(borderRadius: rayonControle),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: cs.primary)),
      // Action mise en avant (« Nouveau bon de commande ») : turquoise, texte foncé.
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: cs.secondary,
        foregroundColor: cs.onSecondary,
        elevation: 2,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: cs.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: espaceLg, vertical: espaceMd),
        border: OutlineInputBorder(borderRadius: rayonControle, borderSide: BorderSide(color: p.bordureChamp)),
        enabledBorder: OutlineInputBorder(borderRadius: rayonControle, borderSide: BorderSide(color: p.bordureChamp)),
        focusedBorder: OutlineInputBorder(borderRadius: rayonControle, borderSide: BorderSide(color: cs.primary, width: 2)),
        errorBorder: OutlineInputBorder(borderRadius: rayonControle, borderSide: BorderSide(color: cs.error)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: rayonControle, borderSide: BorderSide(color: cs.error, width: 2)),
        labelStyle: TextStyle(color: p.texteSecondaire),
        hintStyle: TextStyle(color: p.texteDiscret),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: p.surfaceAlt,
        selectedColor: p.primaireTeinte,
        side: BorderSide(color: p.bordure),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: cs.surface,
        indicatorColor: p.primaireTeinte,
        iconTheme: WidgetStateProperty.resolveWith(
          (etats) => IconThemeData(color: etats.contains(WidgetState.selected) ? cs.primary : p.texteSecondaire),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (etats) => TextStyle(
            fontSize: 12,
            fontWeight: etats.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w400,
            color: etats.contains(WidgetState.selected) ? cs.primary : p.texteSecondaire,
          ),
        ),
      ),
      dividerTheme: DividerThemeData(color: p.bordure, thickness: 1, space: 1),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: cs.inverseSurface,
        contentTextStyle: TextStyle(color: cs.onInverseSurface),
        shape: RoundedRectangleBorder(borderRadius: rayonControle),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: cs.primary),
    );
  }
}
```

### `lib/theme/statuts.dart`

```dart
import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Ton visuel d'un statut.
enum TonStatut { succes, avertissement, danger, info, neutre }

/// Famille de statuts renvoyés par l'API (champ `status`).
enum FamilleStatut {
  commande,
  version,
  changementLigne,
  approbation,
  livraison,
  facture,
  rapprochement,
  paiement,
  avoir,
  litige,
  partenariat,
  invitationPartenaire,
  disponibilite,
  modeleDocument,
  abonnement,
  paiementAbonnement,
  entreprise,
  membre,
  plan,
}

/// Ton de chaque code de statut de l'API (section 5 de la charte).
///
/// Les LIBELLÉS à afficher viennent de `GET /api/v1/referentiels` : ne pas les
/// réécrire dans l'application.
const Map<FamilleStatut, Map<String, TonStatut>> tonsDesStatuts = {
  FamilleStatut.commande: {
    'brouillon': TonStatut.neutre,
    'envoyee': TonStatut.info,
    'en_attente_validation': TonStatut.avertissement,
    'proposition_modifiee': TonStatut.avertissement,
    'validee': TonStatut.info,
    'en_preparation': TonStatut.info,
    'prete': TonStatut.info,
    'livree_partiellement': TonStatut.avertissement,
    'livree': TonStatut.info,
    'reception_confirmee': TonStatut.succes,
    'facturee': TonStatut.info,
    'terminee': TonStatut.succes,
    'refusee': TonStatut.danger,
    'annulee': TonStatut.neutre,
  },
  FamilleStatut.version: {
    'brouillon': TonStatut.neutre,
    'proposee': TonStatut.avertissement,
    'acceptee': TonStatut.succes,
    'refusee': TonStatut.danger,
    'remplacee': TonStatut.neutre,
  },
  FamilleStatut.changementLigne: {
    'inchangee': TonStatut.neutre,
    'quantite_modifiee': TonStatut.avertissement,
    'prix_modifie': TonStatut.avertissement,
    'indisponible': TonStatut.danger,
    'ajoutee': TonStatut.info,
    'substitution': TonStatut.info,
  },
  FamilleStatut.approbation: {
    'non_requise': TonStatut.neutre,
    'en_attente': TonStatut.avertissement,
    'approuvee': TonStatut.succes,
    'rejetee': TonStatut.danger,
  },
  FamilleStatut.livraison: {
    'expediee': TonStatut.info,
    'receptionnee': TonStatut.succes,
  },
  FamilleStatut.facture: {
    'emise': TonStatut.info,
    'partiellement_payee': TonStatut.avertissement,
    'payee': TonStatut.succes,
    'en_retard': TonStatut.danger,
    'annulee': TonStatut.neutre,
  },
  FamilleStatut.rapprochement: {
    'conforme': TonStatut.succes,
    'ecart': TonStatut.avertissement,
    'accepte': TonStatut.info,
    'conteste': TonStatut.danger,
  },
  FamilleStatut.paiement: {
    'declare': TonStatut.avertissement,
    'confirme': TonStatut.succes,
    'rejete': TonStatut.danger,
    'annule': TonStatut.neutre,
  },
  FamilleStatut.avoir: {
    'emis': TonStatut.info,
    'annule': TonStatut.neutre,
  },
  FamilleStatut.litige: {
    'ouvert': TonStatut.avertissement,
    'accepte': TonStatut.succes,
    'refuse': TonStatut.danger,
    'annule': TonStatut.neutre,
  },
  FamilleStatut.partenariat: {
    'en_attente': TonStatut.avertissement,
    'actif': TonStatut.succes,
    'refuse': TonStatut.danger,
    'suspendu': TonStatut.danger,
  },
  FamilleStatut.invitationPartenaire: {
    'en_attente': TonStatut.avertissement,
    'acceptee': TonStatut.succes,
    'expiree': TonStatut.neutre,
    'annulee': TonStatut.neutre,
  },
  FamilleStatut.disponibilite: {
    'disponible': TonStatut.succes,
    'stock_limite': TonStatut.avertissement,
    'sur_commande': TonStatut.info,
    'rupture': TonStatut.danger,
  },
  FamilleStatut.modeleDocument: {
    'actif': TonStatut.succes,
    'archive': TonStatut.neutre,
  },
  FamilleStatut.abonnement: {
    'essai': TonStatut.info,
    'actif': TonStatut.succes,
    'expire': TonStatut.danger,
    'suspendu': TonStatut.danger,
    'annule': TonStatut.neutre,
  },
  FamilleStatut.paiementAbonnement: {
    'initie': TonStatut.neutre,
    'confirme': TonStatut.succes,
    'echoue': TonStatut.danger,
    'annule': TonStatut.neutre,
  },
  FamilleStatut.entreprise: {
    'actif': TonStatut.succes,
    'suspendu': TonStatut.danger,
  },
  FamilleStatut.membre: {
    'actif': TonStatut.succes,
    'inactif': TonStatut.neutre,
  },
  FamilleStatut.plan: {
    'actif': TonStatut.succes,
    'inactif': TonStatut.neutre,
  },
};

/// Ton d'un code (neutre si le code est inconnu : nouvelle valeur côté API).
TonStatut tonDe(FamilleStatut famille, String code) => tonsDesStatuts[famille]?[code] ?? TonStatut.neutre;

/// Couleurs (texte, fond) d'un ton, pour le mode en cours.
({Color texte, Color fond}) couleursDuTon(BuildContext context, TonStatut ton) {
  final p = context.palette;
  return switch (ton) {
    TonStatut.succes => (texte: p.succes, fond: p.succesFond),
    TonStatut.avertissement => (texte: p.avertissement, fond: p.avertissementFond),
    TonStatut.danger => (texte: p.danger, fond: p.dangerFond),
    TonStatut.info => (texte: p.info, fond: p.infoFond),
    TonStatut.neutre => (texte: p.neutre, fond: p.neutreFond),
  };
}

const _icones = {
  TonStatut.succes: Icons.check_circle_outline,
  TonStatut.avertissement: Icons.schedule,
  TonStatut.danger: Icons.error_outline,
  TonStatut.info: Icons.info_outline,
  TonStatut.neutre: Icons.circle_outlined,
};

/// Badge de statut : icône + LIBELLÉ + couleur (jamais la couleur seule).
///
/// ```dart
/// BadgeStatut(famille: FamilleStatut.commande, code: c.status, libelle: referentiels.libelle('statut_commande', c.status))
/// ```
class BadgeStatut extends StatelessWidget {
  const BadgeStatut({super.key, required this.famille, required this.code, required this.libelle});

  final FamilleStatut famille;
  final String code;
  final String libelle;

  @override
  Widget build(BuildContext context) {
    final ton = tonDe(famille, code);
    final c = couleursDuTon(context, ton);
    return Semantics(
      label: libelle,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: c.fond, borderRadius: BorderRadius.circular(999)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(_icones[ton], size: 14, color: c.texte),
            const SizedBox(width: 4),
            Text(libelle, style: TextStyle(color: c.texte, fontSize: 12, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
```

