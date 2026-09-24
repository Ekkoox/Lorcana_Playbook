import { ENCRES } from '../lorcana'
import { PastilleEncre } from './PastilleEncre'

// Un matchup sous ce nombre de parties n'est pas statistiquement parlant :
// on l'affiche quand même, mais atténué et signalé.
const SEUIL_FIABILITE = 20

// Palette du taux de victoire : texte, fond de pastille et barre de remplissage
const styleWinrate = (taux) => {
  if (taux >= 60) return { texte: 'text-emerald-300', fond: 'bg-emerald-500/15 border-emerald-500/40', barre: '#10b981' }
  if (taux >= 52) return { texte: 'text-emerald-400', fond: 'bg-emerald-500/10 border-emerald-500/25', barre: '#34d399' }
  if (taux >= 48) return { texte: 'text-slate-200', fond: 'bg-slate-500/10 border-slate-500/30', barre: '#94a3b8' }
  if (taux >= 40) return { texte: 'text-amber-300', fond: 'bg-amber-500/10 border-amber-500/30', barre: '#f59e0b' }
  return { texte: 'text-red-300', fond: 'bg-red-500/10 border-red-500/30', barre: '#ef4444' }
}

// `lignes` : [{ adversaire_encres, victoires, defaites, parties }]
export const TableauWinrates = ({ titre, lignes = [], langue = 'fr' }) => {
  const tauxDe = (l) => (l.parties > 0 ? (l.victoires / l.parties) * 100 : 0)
  // Du meilleur au pire taux de victoire ; à égalité, le plus gros volume d'abord
  const triees = [...lignes].sort((a, b) => (tauxDe(b) - tauxDe(a)) || (b.parties - a.parties))
  const totalParties = triees.reduce((total, l) => total + l.parties, 0)

  return (
    <div className="panneau rounded-2xl p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-display font-bold text-base text-amber-300">{titre}</h4>
        <span className="text-[11px] font-bold text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded-full border border-slate-800">
          {totalParties} {langue === 'fr' ? 'parties' : 'games'}
        </span>
      </div>

      {triees.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-6 text-center">
          {langue === 'fr' ? 'Pas encore de données pour ce deck.' : 'No data for this deck yet.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {triees.map((ligne) => {
            const taux = Math.round(tauxDe(ligne))
            const fiable = ligne.parties >= SEUIL_FIABILITE
            const style = styleWinrate(taux)
            const encres = (ligne.adversaire_encres || '').split('/')
            return (
              <li
                key={ligne.adversaire_encres}
                className={`relative overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950/50 ${fiable ? '' : 'opacity-60'}`}
              >
                {/* Barre de remplissage proportionnelle au taux de victoire */}
                <div
                  className="absolute inset-y-0 left-0 pointer-events-none"
                  style={{ width: `${taux}%`, backgroundColor: style.barre, opacity: 0.14 }}
                  aria-hidden="true"
                />
                <div className="relative flex items-center gap-2 px-2.5 py-2">
                  <span className="flex gap-1 shrink-0">
                    {encres.map(id => <PastilleEncre key={id} id={id} taille="w-4 h-4" langue={langue} />)}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-slate-100">
                    {encres.map(id => ENCRES.find(e => e.id === id)?.nom[langue] || id).join(' / ')}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 tabular-nums shrink-0">
                    {ligne.repli && (
                      <span
                        className="mr-1 text-slate-600"
                        title={langue === 'fr' ? 'Chiffre de la bicolorité : pas assez de parties avec ce deck précis' : 'Ink-pair figure: not enough games with this exact deck'}
                      >≈</span>
                    )}
                    {ligne.victoires}-{ligne.defaites}{!fiable && <span title={langue === 'fr' ? 'Trop peu de parties pour être fiable' : 'Too few games to be reliable'}>*</span>}
                  </span>
                  <span className={`shrink-0 w-14 text-center text-sm font-black tabular-nums border rounded-md py-0.5 ${style.texte} ${style.fond}`}>
                    {taux}%
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-[10px] text-slate-500 italic">
        {langue === 'fr'
          ? `* moins de ${SEUIL_FIABILITE} parties — chiffre indicatif · ≈ chiffre de la bicolorité`
          : `* fewer than ${SEUIL_FIABILITE} games — indicative only · ≈ ink-pair figure`}
      </p>
    </div>
  )
}
