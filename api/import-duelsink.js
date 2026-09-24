// Cron quotidien : rafraîchit les statistiques personnelles de TOUS les joueurs
// ayant connecté leur compte Duels.ink depuis leur profil.
//
// Variables d'environnement :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (obligatoires)
//   CRON_SECRET                              (optionnel) protège l'appel manuel

import { clientAdmin } from '../lib/supabase-serveur.mjs'
import { importerDuelsInk } from '../lib/duelsink.mjs'

// Duels.ink demande d'espacer les requêtes : on traite les joueurs l'un après
// l'autre, avec une pause entre chacun.
const PAUSE_ENTRE_JOUEURS_MS = 1500

export default async function handler(requete, reponse) {
  const secretAttendu = process.env.CRON_SECRET
  const estCronVercel = Boolean(requete.headers['x-vercel-cron'])
  if (secretAttendu && !estCronVercel) {
    const fourni = (requete.headers.authorization || '').replace('Bearer ', '')
    if (fourni !== secretAttendu) return reponse.status(401).json({ error: 'Non autorisé' })
  }

  try {
    const supabase = clientAdmin()
    const { data: comptes, error } = await supabase
      .from('duelsink_comptes')
      .select('user_id, jeton')
    if (error) throw error

    const classeesUniquement = process.env.DUELSINK_CLASSEES_UNIQUEMENT === 'true'
    const rapport = { traites: 0, echecs: 0, details: [] }

    for (const compte of comptes || []) {
      try {
        const resultat = await importerDuelsInk({
          supabase,
          token: compte.jeton,
          userId: compte.user_id,
          classeesUniquement,
        })
        await supabase
          .from('duelsink_comptes')
          .update({ derniere_synchro: new Date().toISOString(), derniere_erreur: null })
          .eq('user_id', compte.user_id)
        rapport.traites++
        rapport.details.push({ user_id: compte.user_id, parties: resultat.partiesRecuperees })
      } catch (err) {
        // Un jeton révoqué ne doit pas interrompre les autres joueurs
        console.error(`Import impossible pour ${compte.user_id} :`, err)
        await supabase
          .from('duelsink_comptes')
          .update({ derniere_erreur: String(err.message || err).slice(0, 300) })
          .eq('user_id', compte.user_id)
        rapport.echecs++
      }
      await new Promise(resoudre => setTimeout(resoudre, PAUSE_ENTRE_JOUEURS_MS))
    }

    return reponse.status(200).json({ ok: true, ...rapport })
  } catch (err) {
    console.error('Cron Duels.ink impossible :', err)
    return reponse.status(500).json({ error: String(err.message || err) })
  }
}
