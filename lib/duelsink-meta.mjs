// Matrice de matchups communautaire de Duels.ink (endpoint public /api/stats/meta),
// ouvert par Allan (Duels.ink) à notre demande. Conditions convenues :
// une récupération par jour maximum, mise en cache chez nous, et affichage du
// nombre de parties, de la date des données et d'un lien vers duels.ink/stats.
//
// Les lignes produites alimentent la même table meta_winrates que les statistiques
// personnelles, avec source = 'duelsink_meta' et user_id = null (donnée globale).

const BASE_DUELSINK = 'https://duels.ink'

// L'API renvoie les encres en minuscules ; nos identifiants sont capitalisés.
const encresCanoniques = (couleurs) => {
  if (!Array.isArray(couleurs) || couleurs.length === 0) return null
  return couleurs
    .map(c => String(c).charAt(0).toUpperCase() + String(c).slice(1).toLowerCase())
    .sort()
    .join('/')
}

export async function recupererMatriceMeta({ queue = 'core-bo1', era = null, periode = null, etag = null } = {}) {
  const params = new URLSearchParams({ queue })
  if (era) params.set('era', era)
  // « all_time » (défaut), « week:AAAA-MM-JJ » ou « weeks:... » — cf. doc Duels.ink
  if (periode) params.set('period', periode)

  const reponse = await fetch(`${BASE_DUELSINK}/api/stats/meta?${params}`, {
    headers: etag ? { 'If-None-Match': etag } : {},
  })

  // 304 : rien n'a changé depuis la dernière récupération, on ne refait rien
  if (reponse.status === 304) return { inchange: true }
  if (reponse.status === 429) {
    const attente = Number(reponse.headers.get('Retry-After') || 60)
    throw new Error(`Limite de débit atteinte, réessayer dans ${attente} s`)
  }
  if (!reponse.ok) {
    throw new Error(`Duels.ink a répondu ${reponse.status} : ${await reponse.text()}`)
  }

  return {
    inchange: false,
    donnees: await reponse.json(),
    etag: reponse.headers.get('ETag'),
  }
}

// Convertit la matrice en lignes meta_winrates.
//
// L'API écrit chaque paire une seule fois (colorsA trié avant colorsB) et ne
// documente le détail que du point de vue de A. On en déduit les quatre cases :
//   A sur le play    : firstPlayerGames / firstPlayerWinRate
//   A sur la draw    : le reste des parties de A
//   B sur le play    : les parties où A était sur la draw
//   B sur la draw    : les parties où A était sur le play
// Les nuls comptent dans `games` sans être attribués : l'écart est négligeable
// à ces volumes, mais les chiffres de B sont donc approchés à une nulle près.
export function convertirMatriceEnLignes(donnees, { source = 'duelsink_meta' } = {}) {
  const lignes = []
  const majLe = donnees?.updatedAt || new Date().toISOString()

  const ajouter = (deckEncres, advEncres, surLePlay, parties, victoires) => {
    if (!deckEncres || !advEncres || !parties || parties <= 0) return
    const v = Math.max(0, Math.min(parties, Math.round(victoires)))
    lignes.push({
      source,
      user_id: null,
      deck_encres: deckEncres,
      deck_ref: '*',
      adversaire_encres: advEncres,
      sur_le_play: surLePlay,
      victoires: v,
      defaites: parties - v,
      parties,
      maj_le: majLe,
    })
  }

  for (const matchup of donnees?.matchups || []) {
    const a = encresCanoniques(matchup.colorsA)
    const b = encresCanoniques(matchup.colorsB)
    if (!a || !b) continue

    const parties = Number(matchup.games) || 0
    if (parties <= 0) continue
    const victoiresA = Number(matchup.winsA) || 0

    const partiesAPlay = Number(matchup.firstPlayerGames) || 0
    const partiesADraw = Math.max(0, parties - partiesAPlay)
    const victoiresAPlay = matchup.firstPlayerWinRate == null
      ? 0
      : Math.round((Number(matchup.firstPlayerWinRate) / 100) * partiesAPlay)
    const victoiresADraw = Math.max(0, victoiresA - victoiresAPlay)

    // Point de vue de A
    ajouter(a, b, true, partiesAPlay, victoiresAPlay)
    ajouter(a, b, false, partiesADraw, victoiresADraw)
    ajouter(a, b, null, parties, victoiresA)

    // Point de vue de B (le miroir n'est écrit qu'une fois)
    if (b !== a) {
      ajouter(b, a, true, partiesADraw, partiesADraw - victoiresADraw)
      ajouter(b, a, false, partiesAPlay, partiesAPlay - victoiresAPlay)
      ajouter(b, a, null, parties, parties - victoiresA)
    }
  }

  return lignes
}

// Clé de l'ère (set) en cours, telle que Duels.ink la déclare dans sa réponse.
// Évite d'avoir à modifier une variable d'environnement à chaque nouveau set.
const cleEreCourante = (donnees) => {
  const ere = donnees?.meta?.eras?.currentEra
  if (!ere) return null
  return ere.key || ere.eraKey || ere.id || null
}

export async function importerMatriceMeta({ supabase, queue = 'core-bo1', era = 'auto', etag = null }) {
  let ereEffective = era

  // 'auto' (défaut) : on interroge une première fois sans filtre pour lire le set
  // courant, puis on relance la requête restreinte à ce set.
  if (!era || era === 'auto') {
    const sondage = await recupererMatriceMeta({ queue })
    ereEffective = sondage.inchange ? null : cleEreCourante(sondage.donnees)
  }

  const resultat = await recupererMatriceMeta({ queue, era: ereEffective, etag })
  if (resultat.inchange) return { inchange: true, lignesEcrites: 0 }

  const lignes = convertirMatriceEnLignes(resultat.donnees)

  // On remplace intégralement la matrice précédente
  const { error: erreurSuppression } = await supabase
    .from('meta_winrates')
    .delete()
    .eq('source', 'duelsink_meta')
    .is('user_id', null)
  if (erreurSuppression) throw erreurSuppression

  // Insertion par lots : la matrice fait plusieurs centaines de lignes
  const TAILLE_LOT = 500
  for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
    const { error } = await supabase.from('meta_winrates').insert(lignes.slice(i, i + TAILLE_LOT))
    if (error) throw error
  }

  return {
    inchange: false,
    ere: ereEffective,
    lignesEcrites: lignes.length,
    partiesTotales: resultat.donnees?.activity?.totalGames ?? null,
    donneesLe: resultat.donnees?.updatedAt ?? null,
    etag: resultat.etag,
  }
}


// --- Fiche hebdomadaire ---

// Matchups d'UNE bicolorité, ramenés à son point de vue.
// L'API n'écrit chaque paire qu'une fois : quand notre bicolorité est le côté B,
// on inverse les victoires.
export function matchupsDeLaBicolorite(donnees, encresCible) {
  const resultats = new Map()
  for (const matchup of donnees?.matchups || []) {
    const a = encresCanoniques(matchup.colorsA)
    const b = encresCanoniques(matchup.colorsB)
    if (!a || !b) continue
    const parties = Number(matchup.games) || 0
    if (parties <= 0) continue
    const victoiresA = Number(matchup.winsA) || 0

    if (a === encresCible) {
      resultats.set(b, { adversaire: b, parties, victoires: victoiresA })
    } else if (b === encresCible) {
      resultats.set(a, { adversaire: a, parties, victoires: parties - victoiresA })
    }
  }
  return [...resultats.values()].map(r => ({ ...r, taux: (r.victoires / r.parties) * 100 }))
}

// Les deux dernières semaines TERMINÉES, la plus récente d'abord.
//
// La semaine en cours n'est comptée que partiellement (deux jours de parties le
// mardi, par exemple) : la comparer à une semaine complète fausserait à la fois
// les taux et les écarts. On l'écarte donc, ainsi que les semaines vides.
const deuxDernieresSemaines = (donnees) => {
  const debutSemaineEnCours = donnees?.meta?.currentWeek?.startDate || null
  const semaines = [...(donnees?.meta?.availableWeeks || [])]
    .filter(s => s?.startDate && (s.totalGames == null || s.totalGames > 0))
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))

  const terminees = semaines.filter(s => s.startDate !== debutSemaineEnCours)
  // Repli : si l'API ne propose que la semaine en cours, on l'utilise quand même
  const retenues = terminees.length > 0 ? terminees : semaines
  return { semaine: retenues[0] || null, precedente: retenues[1] || null }
}

// Récapitulatif d'une bicolorité : meilleurs et pires matchups de la semaine,
// avec l'écart par rapport à la semaine précédente.
export async function construireFicheHebdo({ queue = 'core-bo1', encres, minParties = 20, nombre = 3 }) {
  if (!encres) throw new Error('Bicolorité manquante')

  const debut = Date.now()
  const sondage = await recupererMatriceMeta({ queue })
  const { semaine, precedente } = deuxDernieresSemaines(sondage.donnees)
  if (!semaine) throw new Error('Aucune semaine disponible pour cette file')
  console.log(`[fiche-hebdo] ${encres} : semaine ${semaine.startDate}, précédente ${precedente?.startDate ?? '—'}`)

  const donneesSemaine = (await recupererMatriceMeta({ queue, periode: `week:${semaine.startDate}` })).donnees
  const donneesPrecedente = precedente
    ? (await recupererMatriceMeta({ queue, periode: `week:${precedente.startDate}` })).donnees
    : null
  console.log(`[fiche-hebdo] données récupérées en ${Date.now() - debut} ms`)

  const actuels = matchupsDeLaBicolorite(donneesSemaine, encres)
  const anciens = new Map(
    (donneesPrecedente ? matchupsDeLaBicolorite(donneesPrecedente, encres) : []).map(m => [m.adversaire, m])
  )

  // On n'expose que les matchups suffisamment joués sur la semaine
  const lignes = actuels
    .filter(m => m.parties >= minParties)
    .map(m => {
      const avant = anciens.get(m.adversaire)
      return {
        adversaire: m.adversaire,
        parties: m.parties,
        victoires: m.victoires,
        taux: Math.round(m.taux * 10) / 10,
        // null quand le matchup n'existait pas la semaine précédente
        ecart: avant ? Math.round((m.taux - avant.taux) * 10) / 10 : null,
        partiesPrecedentes: avant?.parties ?? null,
      }
    })
    .sort((a, b) => b.taux - a.taux)

  return {
    encres,
    queue,
    semaine,
    semainePrecedente: precedente,
    partiesTotales: lignes.reduce((total, l) => total + l.parties, 0),
    favorables: lignes.slice(0, nombre),
    // Les pires, du plus mauvais au moins mauvais
    defavorables: lignes.slice(-nombre).reverse(),
    maj_le: donneesSemaine?.updatedAt || null,
  }
}
