// Fonction serveur Vercel : importe la matrice de matchups communautaire de
// Duels.ink dans Supabase. Aucun jeton nécessaire (endpoint public), mais la
// clé service_role est requise pour écrire les lignes globales.
//
// Variables d'environnement :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (obligatoires)
//   DUELSINK_QUEUE  file de jeu, défaut 'core-bo1'
//   DUELSINK_ERA    ère de cartes : 'auto' (défaut, détecte le set courant),
//                   une clé précise comme 'set-13', ou 'tout' pour ne pas filtrer
//   CRON_SECRET     (optionnel) protège l'appel manuel

import { createClient } from '@supabase/supabase-js'
import { importerMatriceMeta } from '../lib/duelsink-meta.mjs'

export default async function handler(requete, reponse) {
  const secretAttendu = process.env.CRON_SECRET
  const estCronVercel = Boolean(requete.headers['x-vercel-cron'])
  if (secretAttendu && !estCronVercel) {
    const fourni = (requete.headers.authorization || '').replace('Bearer ', '')
    if (fourni !== secretAttendu) return reponse.status(401).json({ error: 'Non autorisé' })
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return reponse.status(500).json({ error: 'Configuration serveur incomplète' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    const resultat = await importerMatriceMeta({
      supabase,
      queue: process.env.DUELSINK_QUEUE || 'core-bo1',
      era: process.env.DUELSINK_ERA || 'auto',
    })
    return reponse.status(200).json({ ok: true, ...resultat })
  } catch (err) {
    console.error('Import de la matrice Duels.ink impossible :', err)
    return reponse.status(500).json({ error: String(err.message || err) })
  }
}
