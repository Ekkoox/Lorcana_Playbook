// Récapitulatif hebdomadaire d'une bicolorité : meilleurs et pires matchups de
// la semaine écoulée, avec l'écart par rapport à la semaine précédente.
//
// Passe par le serveur plutôt que par le navigateur pour ne pas exposer les
// utilisateurs aux limites de débit de Duels.ink et pour éviter tout souci
// d'origine croisée.
//
//   GET /api/fiche-hebdo?encres=Emerald/Steel

import { construireFicheHebdo } from '../lib/duelsink-meta.mjs'

export default async function handler(requete, reponse) {
  const { encres, queue } = requete.query || {}
  if (!encres) return reponse.status(400).json({ error: 'Paramètre « encres » manquant' })

  try {
    const fiche = await construireFicheHebdo({
      encres: String(encres),
      queue: queue ? String(queue) : (process.env.DUELSINK_QUEUE || 'core-bo1'),
    })
    // Les agrégats ne bougent qu'une fois par jour : on autorise une mise en cache
    reponse.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return reponse.status(200).json(fiche)
  } catch (err) {
    console.error('Fiche hebdomadaire impossible :', err)
    return reponse.status(500).json({ error: String(err.message || err) })
  }
}
