import { createClient } from '@supabase/supabase-js'

// Les clés viennent du fichier .env (voir .env.example).
// Si elles ne sont pas renseignées, le site fonctionne en mode local uniquement
// (pas de connexion, sauvegarde dans le navigateur comme avant).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
