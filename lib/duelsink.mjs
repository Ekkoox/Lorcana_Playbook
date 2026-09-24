// Import de l'historique de parties Duels.ink et agrégation en win rates.
// Utilisé par la fonction serveur Vercel (api/import-duelsink.js) et par le
// script local (scripts/importer-duelsink.mjs). Ne tourne JAMAIS côté navigateur :
// le jeton Duels.ink est un secret.

const BASE_DUELSINK = 'https://duels.ink'

// Duels.ink renvoie les couleurs en minuscules, ex. "amber/steel".
// On les normalise en une clé canonique triée : "Amber/Steel".
const CAPITALISE = (mot) => mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase()

export const normaliserEncres = (couleurs) => {
  if (!couleurs) return null
  const parties = String(couleurs)
    .split(/[/,+]/)
    .map(c => c.trim())
    .filter(Boolean)
    .map(CAPITALISE)
  if (parties.length === 0) return null
  return [...new Set(parties)].sort().join('/')
}

// Récupère l'historique page par page (pagination par curseur, cf. doc Duels.ink).
// `depuis` (ISO 8601) limite aux parties mises à jour après cette date.
export async function recupererHistorique({ token, depuis = null, limite = 250, maxPages = 40 }) {
  const parties = []
  let curseur = null
  let derniereMaj = depuis

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ format: 'json', limit: String(limite) })
    if (curseur) params.set('cursor', curseur)
    if (depuis) params.set('from', depuis)

    const reponse = await fetch(`${BASE_DUELSINK}/api/me/match-history?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    // Respect des limites de débit : on patiente puis on retente une fois
    if (reponse.status === 429) {
      const attente = Number(reponse.headers.get('Retry-After') || 5)
      await new Promise(r => setTimeout(r, (attente + 1) * 1000))
      page--
      continue
    }
    if (!reponse.ok) {
      throw new Error(`Duels.ink a répondu ${reponse.status} : ${await reponse.text()}`)
    }

    const donnees = await reponse.json()
    const lot = donnees.games || []
    parties.push(...lot)
    for (const p of lot) {
      if (!derniereMaj || (p.ended_at && p.ended_at > derniereMaj)) derniereMaj = p.ended_at
    }

    curseur = donnees.next_cursor
    if (!curseur) break
  }

  return { parties, derniereMaj }
}

// Ne garde que les parties exploitables pour des statistiques de matchup
export const partieExploitable = (partie, { classeesUniquement = false } = {}) => {
  if (partie.opp_is_bot || partie.mode === 'bot') return false
  if (partie.result !== 'win' && partie.result !== 'loss') return false // ni nul, ni abandon
  if (classeesUniquement && !partie.ranked) return false
  if (!partie.your_deck_colors || !partie.opp_deck_colors) return false
  if (typeof partie.went_first !== 'boolean') return false
  return true
}

// Duels.ink attribue un identifiant différent à chaque version d'un deck.
// Pour éviter des dizaines d'entrées quasi identiques, on regroupe les parties
// par CONTENU de liste : même liste = même deck.
export const signatureDecklist = (decklist) => {
  if (!Array.isArray(decklist) || decklist.length === 0) return null
  const texte = [...decklist]
    .map(c => `${c.cardId}:${c.count}`)
    .sort()
    .join('|')
  // Hachage court et stable (djb2), suffisant pour distinguer des listes
  let hash = 5381
  for (let i = 0; i < texte.length; i++) hash = ((hash * 33) ^ texte.charCodeAt(i)) >>> 0
  return `liste-${hash.toString(16)}`
}

// Proportion de cartes communes entre deux listes (0 à 1).
// Une carte présente en 4 exemplaires d'un côté et 2 de l'autre compte pour 2.
const similariteListes = (listeA, listeB) => {
  if (!listeA?.length || !listeB?.length) return 0
  const parCarteA = new Map(listeA.map(c => [c.cardId, c.count]))
  let commun = 0
  let totalA = 0
  let totalB = 0
  for (const c of listeA) totalA += c.count
  for (const c of listeB) {
    totalB += c.count
    const n = parCarteA.get(c.cardId)
    if (n) commun += Math.min(n, c.count)
  }
  const total = Math.max(totalA, totalB)
  return total > 0 ? commun / total : 0
}

// Un deck évolue carte par carte au fil des tests : deux listes proches sont
// donc le MÊME deck. On regroupe les listes qui partagent au moins ce seuil.
const SEUIL_SIMILARITE = 0.85

// Construit les groupes de listes et renvoie une table « signature → groupe ».
// Les listes les plus jouées servent de référence pour chaque groupe.
export function construireGroupesDecks(parties, options = {}) {
  const listesParSignature = new Map()
  for (const partie of parties) {
    if (!partieExploitable(partie, options)) continue
    const signature = signatureDecklist(partie.your_decklist)
    if (!signature) continue
    const entree = listesParSignature.get(signature)
    if (entree) {
      entree.parties++
      if (partie.ended_at && partie.ended_at > entree.derniere) entree.derniere = partie.ended_at
    } else {
      listesParSignature.set(signature, {
        signature,
        decklist: partie.your_decklist,
        encres: normaliserEncres(partie.your_deck_colors),
        parties: 1,
        derniere: partie.ended_at,
      })
    }
  }

  // De la liste la plus jouée à la moins jouée : les variantes rejoignent la principale
  const listes = [...listesParSignature.values()].sort((a, b) => b.parties - a.parties)
  const groupes = []
  const signatureVersGroupe = new Map()

  for (const liste of listes) {
    const groupe = groupes.find(
      g => g.encres === liste.encres && similariteListes(g.decklist, liste.decklist) >= SEUIL_SIMILARITE
    )
    if (groupe) {
      groupe.parties += liste.parties
      if (liste.derniere && liste.derniere > groupe.derniere) groupe.derniere = liste.derniere
      signatureVersGroupe.set(liste.signature, groupe.id)
    } else {
      const nouveau = { ...liste, id: liste.signature }
      groupes.push(nouveau)
      signatureVersGroupe.set(liste.signature, nouveau.id)
    }
  }

  return { groupes, signatureVersGroupe }
}

// Référence de deck utilisée dans les statistiques : le groupe de la liste
// jouée, sinon l'identifiant Duels.ink brut.
const referenceDeck = (partie, signatureVersGroupe) => {
  const signature = signatureDecklist(partie.your_decklist)
  if (signature && signatureVersGroupe?.has(signature)) return signatureVersGroupe.get(signature)
  return signature || partie.your_deck_id || null
}

// Agrège les parties en lignes prêtes pour la table meta_winrates.
// Chaque matchup produit trois lignes : on the play, on the draw, et le total
// (sur_le_play = null), pour que le front puisse afficher l'un ou l'autre sans recalcul.
export function agregerParties(parties, { userId, source = 'duelsink_perso', classeesUniquement = false, signatureVersGroupe = null } = {}) {
  const compteurs = new Map()

  const ajouter = (deckEncres, deckRef, advEncres, surLePlay, gagne) => {
    const cle = `${deckEncres}|${deckRef}|${advEncres}|${surLePlay}`
    const ligne = compteurs.get(cle) || {
      source,
      user_id: userId,
      deck_encres: deckEncres,
      deck_ref: deckRef,
      adversaire_encres: advEncres,
      sur_le_play: surLePlay,
      victoires: 0,
      defaites: 0,
      parties: 0,
    }
    if (gagne) ligne.victoires++
    else ligne.defaites++
    ligne.parties++
    compteurs.set(cle, ligne)
  }

  for (const partie of parties) {
    if (!partieExploitable(partie, { classeesUniquement })) continue
    const deckEncres = normaliserEncres(partie.your_deck_colors)
    const advEncres = normaliserEncres(partie.opp_deck_colors)
    if (!deckEncres || !advEncres) continue
    const gagne = partie.result === 'win'
    const deckRef = referenceDeck(partie, signatureVersGroupe)

    // Deux niveaux : la liste précise, et '*' = toutes listes de cette bicolorité
    for (const ref of deckRef ? [deckRef, '*'] : ['*']) {
      ajouter(deckEncres, ref, advEncres, partie.went_first, gagne)
      ajouter(deckEncres, ref, advEncres, null, gagne) // positions confondues
    }
  }

  return [...compteurs.values()].map(l => ({ ...l, maj_le: new Date().toISOString() }))
}

// Recense les decks distincts joués, avec leur liste la plus récente.
export function recenserDecks(groupes, { userId } = {}) {
  return [...groupes]
    .sort((a, b) => b.parties - a.parties)
    .map(groupe => ({
      user_id: userId,
      deck_id: groupe.id,
      // L'API ne renvoie pas le nom du deck : on garde les couleurs comme libellé
      nom: groupe.encres,
      encres: groupe.encres,
      parties: groupe.parties,
      derniere_partie: groupe.derniere || null,
      decklist: groupe.decklist || null,
      maj_le: new Date().toISOString(),
    }))
}

// Import complet : récupération, agrégation, écriture dans Supabase.
// Les agrégats sont recalculés depuis zéro pour cet utilisateur afin de rester
// exacts (une partie annulée côté Duels.ink ne laisse pas de résidu).
export async function importerDuelsInk({ supabase, token, userId, classeesUniquement = false }) {
  if (!token) throw new Error('Jeton Duels.ink manquant (API_KEY_DUEL_INK)')
  if (!userId) throw new Error('Identifiant utilisateur manquant')

  const { parties, derniereMaj } = await recupererHistorique({ token })
  const { groupes, signatureVersGroupe } = construireGroupesDecks(parties, { classeesUniquement })
  const lignes = agregerParties(parties, { userId, classeesUniquement, signatureVersGroupe })
  const decks = recenserDecks(groupes, { userId })

  // On remplace l'ensemble des lignes personnelles de ce joueur
  const { error: erreurSuppression } = await supabase
    .from('meta_winrates')
    .delete()
    .eq('source', 'duelsink_perso')
    .eq('user_id', userId)
  if (erreurSuppression) throw erreurSuppression

  if (lignes.length > 0) {
    const { error: erreurInsertion } = await supabase.from('meta_winrates').insert(lignes)
    if (erreurInsertion) throw erreurInsertion
  }

  const { error: erreurNettoyageDecks } = await supabase
    .from('duelsink_decks')
    .delete()
    .eq('user_id', userId)
  if (erreurNettoyageDecks) throw erreurNettoyageDecks

  if (decks.length > 0) {
    const { error: erreurDecks } = await supabase.from('duelsink_decks').insert(decks)
    if (erreurDecks) throw erreurDecks
  }

  const { error: erreurSync } = await supabase.from('duelsink_sync').upsert({
    user_id: userId,
    dernier_import: new Date().toISOString(),
    derniere_partie: derniereMaj,
    parties_importees: parties.length,
    maj_le: new Date().toISOString(),
  })
  if (erreurSync) throw erreurSync

  return { partiesRecuperees: parties.length, matchupsCalcules: lignes.length, decksRecenses: decks.length }
}
