// Clients Supabase côté serveur, partagés par les fonctions Vercel.
import { createClient } from '@supabase/supabase-js'

// Client administrateur : contourne le RLS, réservé au serveur.
export const clientAdmin = () => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Configuration serveur incomplète (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

// Identifie l'utilisateur à partir du jeton de session envoyé par le site.
// Renvoie null si l'en-tête est absent ou le jeton invalide.
export const utilisateurDeLaRequete = async (requete) => {
  const entete = requete.headers.authorization || ''
  const jetonSession = entete.startsWith('Bearer ') ? entete.slice(7) : null
  if (!jetonSession) return null

  const { SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY } = process.env
  const cleAnon = SUPABASE_ANON_KEY || VITE_SUPABASE_ANON_KEY
  if (!SUPABASE_URL || !cleAnon) return null

  const client = createClient(SUPABASE_URL, cleAnon, { auth: { persistSession: false } })
  const { data, error } = await client.auth.getUser(jetonSession)
  if (error || !data?.user) return null
  return data.user
}
