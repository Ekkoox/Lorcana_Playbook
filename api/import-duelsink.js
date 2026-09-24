// Fonction serveur Vercel : importe l'historique Duels.ink dans Supabase.
// Le jeton et la clé service_role ne quittent jamais le serveur.
//
// Variables d'environnement nécessaires (Vercel → Settings → Environment Variables) :
//   API_KEY_DUEL_INK          jeton Duels.ink (read-only)
//   SUPABASE_URL              même URL que VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY clé service_role (SECRÈTE, jamais côté navigateur)
//   DUELSINK_USER_ID          identifiant Supabase du compte propriétaire des stats
//   CRON_SECRET               (optionnel) protège l'appel manuel

import { createClient } from '@supabase/supabase-js'
import { importerDuelsInk } from '../lib/duelsink.mjs'

export default async function handler(requete, reponse) {
  // Le cron Vercel s'authentifie tout seul ; un appel manuel doit fournir le secret
  const secretAttendu = process.env.CRON_SECRET
  const estCronVercel = Boolean(requete.headers['x-vercel-cron'])
  if (secretAttendu && !estCronVercel) {
    const fourni = (requete.headers.authorization || '').replace('Bearer ', '')
    if (fourni !== secretAttendu) {
      return reponse.status(401).json({ error: 'Non autorisé' })
    }
  }

  const { API_KEY_DUEL_INK, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DUELSINK_USER_ID } = process.env
  if (!API_KEY_DUEL_INK || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DUELSINK_USER_ID) {
    return reponse.status(500).json({ error: 'Configuration serveur incomplète' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    const resultat = await importerDuelsInk({
      supabase,
      token: API_KEY_DUEL_INK,
      userId: DUELSINK_USER_ID,
      classeesUniquement: process.env.DUELSINK_CLASSEES_UNIQUEMENT === 'true',
    })
    return reponse.status(200).json({ ok: true, ...resultat })
  } catch (err) {
    console.error('Import Duels.ink impossible :', err)
    return reponse.status(500).json({ error: String(err.message || err) })
  }
}
