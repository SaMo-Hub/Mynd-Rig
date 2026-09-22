import { useEffect, useState } from 'react'

/**
 * Suit une media query. L'éditeur étant destiné à vivre **dans une iframe**, sa
 * largeur n'est pas celle de l'écran mais celle du cadre qu'on lui donne : les
 * mises en page doivent donc réagir à la requête, pas être décidées une fois au
 * montage.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}
