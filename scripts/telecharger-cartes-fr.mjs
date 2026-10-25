// Télécharge les données françaises des cartes (LorcanaJSON) dans public/,
// pour les servir depuis le site et éviter le blocage CORS.
// Lancé automatiquement avant `npm run dev` et `npm run build`.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const URL_SOURCE = 'https://lorcanajson.org/files/current/fr/allCards.json'
const DOSSIER_PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const FICHIER_CIBLE = path.join(DOSSIER_PUBLIC, 'cartes-fr.json')
// Une journée seulement : à la sortie d'un chapitre, LorcanaJSON publie les
// cartes au fil des jours (le chapitre 14 est passé de 111 à 256 cartes en
// vingt-quatre heures). Une fenêtre d'une semaine laissait le site afficher
// des cartes en anglais pendant des jours après leur parution en français.
const AGE_MAX_JOURS = 1

const fichierEstRecent = async () => {
  try {
    const infos = await stat(FICHIER_CIBLE)
    const ageJours = (Date.now() - infos.mtimeMs) / (1000 * 60 * 60 * 24)
    return ageJours < AGE_MAX_JOURS
  } catch {
    return false
  }
}

// Champs attendus dans le fichier mis en cache. Si l'un manque, c'est que le
// fichier date d'une version antérieure du script : on le retélécharge sans
// attendre l'expiration, pour éviter d'avoir à penser à `--force`.
const CHAMPS_REQUIS = ['fullName', 'name', 'version', 'story', 'color', 'cost', 'type']

const fichierAuBonFormat = async () => {
  try {
    const donnees = JSON.parse(await readFile(FICHIER_CIBLE, 'utf8'))
    const premiere = donnees?.cards?.[0]
    if (!premiere) return false
    return CHAMPS_REQUIS.every(champ => champ in premiere)
  } catch {
    return false
  }
}

const fichierExiste = async () => {
  try { await stat(FICHIER_CIBLE); return true } catch { return false }
}

const forcer = process.argv.includes('--force')

if (!forcer && await fichierEstRecent() && await fichierAuBonFormat()) {
  console.log('[cartes-fr] Données françaises déjà à jour (moins de 24 h). Utilise --force pour retélécharger.')
  process.exit(0)
}

console.log('[cartes-fr] Téléchargement des données françaises (LorcanaJSON)...')
try {
  const reponse = await fetch(URL_SOURCE)
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
  const donnees = await reponse.json()
  if (!Array.isArray(donnees.cards)) throw new Error('Format inattendu : champ "cards" absent')

  // On ne garde que les champs utiles pour alléger le fichier.
  // Les variantes promo sont exclues : elles partagent le set et le numéro de
  // leur carte d'origine et écraseraient la carte normale dans l'index
  // set|numéro (ex. « Le lapin blanc » promo 29/P3 vs « Akood et Emuti » 29/204).
  // Signature fiable : leur image vient de /images/fr/promoX/ au lieu de /setXX/.
  const estPromo = (c) => `${c.images?.thumbnail || ''}${c.images?.full || ''}`.includes('/promo')
  const allege = {
    cards: donnees.cards
      .filter(c => c.setCode != null && c.number != null && !estPromo(c))
      .map(c => ({
        setCode: c.setCode,
        number: c.number,
        fullName: c.fullName,
        simpleName: c.simpleName,
        // Champs de parenté, utilisés par le jeu Undercover pour apparier deux
        // cartes proches : même personnage, même film, ou même couleur et coût.
        name: c.name,
        version: c.version,
        story: c.story,
        color: c.color,
        cost: c.cost,
        type: c.type,
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
