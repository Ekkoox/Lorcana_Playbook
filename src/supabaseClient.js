import { createClient } from '@supabase/supabase-js'

// Tu remplaceras ces deux variables par les vraies clés de ton tableau de bord Supabase
const supabaseUrl = 'TON_SUPABASE_URL'
const supabaseAnonKey = 'TA_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)