// Import de la matrice communautaire Duels.ink, lancé à la main :
//   npm run duelsink-meta

import { createClient } from '@supabase/supabase-js'
import { importerMatriceMeta } from '../lib/duelsink-meta.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const { SUPABASE_SERVICE_ROLE_KEY, DUELSINK_QUEUE, DUELSINK_ERA } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[duelsink-meta] Variables manquantes dans .env : SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

try {
  const queue = DUELSINK_QUEUE || 'core-bo1'
  console.log(`[duelsink-meta] Récupération de la matrice communautaire (${queue}${DUELSINK_ERA ? `, ${DUELSINK_ERA}` : ''})...`)
  const resultat = await importerMatriceMeta({ supabase, queue, era: DUELSINK_ERA || 'auto' })
  if (resultat.inchange) {
    console.log('[duelsink-meta] Données inchangées depuis la dernière récupération.')
  } else {
    console.log(`[duelsink-meta] OK : ${resultat.lignesEcrites} lignes écrites (set ${resultat.ere ?? 'tous'}), ${resultat.partiesTotales ?? '?'} parties analysées, données du ${resultat.donneesLe ?? '?'}.`)
  }
} catch (err) {
  console.error('[duelsink-meta] Échec :', err.message || err)
  process.exit(1)
}
