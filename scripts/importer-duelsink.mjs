// Import Duels.ink lancé à la main depuis ton ordinateur :
//   npm run duelsink
// Lit les variables du fichier .env (Node 22+ via --env-file).

import { createClient } from '@supabase/supabase-js'
import { importerDuelsInk } from '../lib/duelsink.mjs'

const {
  API_KEY_DUEL_INK,
  SUPABASE_SERVICE_ROLE_KEY,
  DUELSINK_USER_ID,
  DUELSINK_CLASSEES_UNIQUEMENT,
} = process.env
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL

const manquantes = Object.entries({
  API_KEY_DUEL_INK,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  DUELSINK_USER_ID,
}).filter(([, valeur]) => !valeur).map(([nom]) => nom)

if (manquantes.length > 0) {
  console.error(`[duelsink] Variables manquantes dans .env : ${manquantes.join(', ')}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

try {
  console.log('[duelsink] Récupération de ton historique de parties...')
  const resultat = await importerDuelsInk({
    supabase,
    token: API_KEY_DUEL_INK,
    userId: DUELSINK_USER_ID,
    classeesUniquement: DUELSINK_CLASSEES_UNIQUEMENT === 'true',
  })
  console.log(`[duelsink] OK : ${resultat.partiesRecuperees} parties récupérées, ${resultat.matchupsCalcules} lignes de matchup, ${resultat.decksRecenses} decks recensés.`)
} catch (err) {
  console.error('[duelsink] Échec :', err.message || err)
  process.exit(1)
}
