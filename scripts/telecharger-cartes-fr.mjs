// Télécharge les données françaises des cartes (LorcanaJSON) dans public/,
// pour les servir depuis le site et éviter le blocage CORS.
// Lancé automatiquement avant `npm run dev` et `npm run build`.
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const URL_SOURCE = 'https://lorcanajson.org/files/current/fr/allCards.json'
const DOSSIER_PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const FICHIER_CIBLE = path.join(DOSSIER_PUBLIC, 'cartes-fr.json')
const AGE_MAX_JOURS = 7

const fichierEstRecent = async () => {
  try {
    const infos = await stat(FICHIER_CIBLE)
    const ageJours = (Date.now() - infos.mtimeMs) / (1000 * 60 * 60 * 24)
    return ageJours < AGE_MAX_JOURS
  } catch {
    return false
  }
}

const fichierExiste = async () => {
  try { await stat(FICHIER_CIBLE); return true } catch { return false }
}

if (await fichierEstRecent()) {
  console.log('[cartes-fr] Données françaises déjà à jour (moins de 7 jours).')
  process.exit(0)
}

console.log('[cartes-fr] Téléchargement des données françaises (LorcanaJSON)...')
try {
  const reponse = await fetch(URL_SOURCE)
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
  const donnees = await reponse.json()
  if (!Array.isArray(donnees.cards)) throw new Error('Format inattendu : champ "cards" absent')

  // On ne garde que les champs utiles pour alléger le fichier
  const allege = {
    cards: donnees.cards
      .filter(c => c.setCode != null && c.number != null)
      .map(c => ({
        setCode: c.setCode,
        number: c.number,
        fullName: c.fullName,
        simpleName: c.simpleName,
        images: { thumbnail: c.images?.thumbnail, full: c.images?.full }
      }))
  }

  await mkdir(DOSSIER_PUBLIC, { recursive: true })
  await writeFile(FICHIER_CIBLE, JSON.stringify(allege))
  console.log(`[cartes-fr] OK : ${allege.cards.length} cartes enregistrées dans public/cartes-fr.json`)
} catch (err) {
  if (await fichierExiste()) {
    console.warn(`[cartes-fr] Téléchargement impossible (${err.message}), on garde le fichier existant.`)
  } else {
    console.warn(`[cartes-fr] Téléchargement impossible (${err.message}) : les cartes resteront en anglais.`)
  }
}
