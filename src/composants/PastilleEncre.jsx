import { ENCRES } from '../lorcana'

export const PastilleEncre = ({ id, taille = 'w-4 h-4', langue = 'fr' }) => {
  const encre = ENCRES.find(e => e.id === id)
  if (!encre) return null
  return (
    <span
      title={encre.nom[langue]}
      className={`${taille} rounded-full border border-white/40 inline-block shrink-0`}
      style={{ backgroundColor: encre.hex, boxShadow: `0 0 10px ${encre.hex}aa` }}
    />
  )
}
