/**
 * Composant à copier dans le **portfolio** (React / Next.js / Astro) pour y
 * embarquer l'éditeur de rig. Il ne fait pas partie de l'app : il vit ici pour
 * rester à jour avec elle, et se copie tel quel dans l'autre projet.
 *
 * Next.js : marquer le fichier `'use client'` n'est pas nécessaire — il n'y a
 * pas d'état, l'iframe est rendue côté serveur comme n'importe quelle balise.
 * Astro : `<MyndEditorEmbed client:visible />` évite de charger l'éditeur tant
 * qu'il n'est pas à l'écran (l'attribut `loading="lazy"` le fait déjà).
 *
 * Deux choses à savoir :
 *
 * 1. **Donne-lui une hauteur.** L'éditeur remplit son cadre ; une iframe sans
 *    hauteur explicite s'affiche à 150 px. Le ratio par défaut ci-dessous lui en
 *    donne une qui suit la largeur, avec un plancher pour le mobile.
 * 2. **Le doigt posé sur la scène pose le personnage**, il ne fait pas défiler
 *    la page. C'est voulu (`touch-action: none` sur le canvas) : sans cela, un
 *    glissé sur une main emporterait le portfolio. Prévois donc de la marge
 *    autour de l'iframe pour que le scroll reste facile sur mobile.
 */
export function MyndEditorEmbed({
  src = 'https://mynd-rig.vercel.app',
  title = 'Éditeur de rig Mynd — personnage 2D articulé',
  className = '',
}: {
  /** URL du site déployé. */
  src?: string
  title?: string
  className?: string
}) {
  return (
    <figure className={`mynd-embed ${className}`}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        // `allow-scripts` + `allow-same-origin` suffisent : l'éditeur ne fait ni
        // navigation, ni popup, ni formulaire. L'export JSON a besoin de
        // `allow-downloads`.
        sandbox="allow-scripts allow-same-origin allow-downloads"
        style={{
          display: 'block',
          width: '100%',
          height: 'min(72vh, 680px)',
          minHeight: 520,
          border: 0,
          borderRadius: 24,
          // Le fond de l'éditeur, pour que le cadre ne clignote pas en blanc
          // pendant le chargement.
          background: '#f4f6f8',
          colorScheme: 'light dark',
        }}
      />
      <figcaption
        style={{
          marginTop: 12,
          fontSize: 14,
          opacity: 0.6,
        }}
      >
        Pose le personnage à la main, charge une marche, une course, un saut —
        c’est le rig réel de l’application.{' '}
        <a href={src} target="_blank" rel="noreferrer">
          Ouvrir en plein écran
        </a>
      </figcaption>
    </figure>
  )
}
