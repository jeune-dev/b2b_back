'use strict';

/**
 * URL d'une requête, débarrassée des SECRETS qu'elle peut porter — pour les
 * journaux d'accès (morgan) et d'erreurs (reprise de Widjila).
 *
 * Le jeton d'une invitation (collaborateur ou partenaire) EST son propre
 * secret ; un ticket du flux temps réel aussi. Les journaux les conserveraient
 * en clair pour toute leur durée de rétention. On masque la valeur, pas la
 * route : le journal garde son utilité.
 */
const MOTIFS = [
  [/(\/activation\/)[^/?#]+/g, '$1[masqué]'],
  [/([?&](?:token|ticket|invitation|refreshToken|refresh_token|otp|code|signature)=)[^&#]*/gi, '$1[masqué]'],
];

/**
 * @param {string} url
 * @returns {string}
 */
function masquerUrl(url) {
  let resultat = String(url || '');
  for (const [motif, remplacement] of MOTIFS) resultat = resultat.replace(motif, remplacement);
  return resultat;
}

module.exports = masquerUrl;
