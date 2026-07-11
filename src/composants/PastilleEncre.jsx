import { ENCRES, ENCRE_BLIND } from '../lorcana'

export const PastilleEncre = ({ id, taille = 'w-4 h-4', langue = 'fr' }) => {
  // Pastille « ? » pour les matchups Blind (bicolorité adverse inconnue)
  if (id === ENCRE_BLIND) {
    return (
      <span
        title={langue === 'fr' ? 'Bicolorité inconnue' : 'Unknown inks'}
        className={`${taille} rounded-full border border-dashed border-white/50 bg-slate-800 text-slate-300 inline-flex items-center justify-center shrink-0 text-[9px] font-black leading-none`}
      >
        ?
      </span>
    )
  }
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
