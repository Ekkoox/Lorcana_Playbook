// Synchronisation à la demande, déclenchée par un joueur depuis le site.
// Le joueur s'authentifie avec sa session Supabase ; on récupère SON jeton
// Duels.ink côté serveur (jamais exposé au navigateur) et on importe ses parties.

import { clientAdmin, utilisateurDeLaRequete } from '../lib/supabase-serveur.mjs'
import { importerDuelsInk } from '../lib/duelsink.mjs'

export default async function handler(requete, reponse) {
  if (requete.method !== 'POST') {
    return reponse.status(405).json({ error: 'Méthode non autorisée' })
  }

  try {
    const utilisateur = await utilisateurDeLaRequete(requete)
    if (!utilisateur) return reponse.status(401).json({ error: 'Non authentifié' })

    const supabase = clientAdmin()
    const { data: compte, error } = await supabase
      .from('duelsink_comptes')
      .select('jeton')
      .eq('user_id', utilisateur.id)
      .maybeSingle()
    if (error) throw error
    if (!compte?.jeton) {
      return reponse.status(400).json({ error: 'Aucun compte Duels.ink connecté' })
    }

    const resultat = await importerDuelsInk({
      supabase,
      token: compte.jeton,
      userId: utilisateur.id,
      classeesUniquement: process.env.DUELSINK_CLASSEES_UNIQUEMENT === 'true',
    })

    await supabase
      .from('duelsink_comptes')
      .update({ derniere_synchro: new Date().toISOString(), derniere_erreur: null })
      .eq('user_id', utilisateur.id)

    return reponse.status(200).json({ ok: true, ...resultat })
  } catch (err) {
    console.error('Synchronisation Duels.ink impossible :', err)
    const message = String(err.message || err)
    // Un jeton révoqué ou expiré doit être signalé au joueur
    const utilisateur = await utilisateurDeLaRequete(requete).catch(() => null)
    if (utilisateur) {
      try {
        await clientAdmin()
          .from('duelsink_comptes')
          .update({ derniere_erreur: message.slice(0, 300) })
          .eq('user_id', utilisateur.id)
      } catch { /* on n'écrase pas l'erreur d'origine */ }
    }
    return reponse.status(500).json({ error: message })
  }
}
