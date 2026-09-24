// Télécharge les données françaises des cartes (LorcanaJSON) dans public/,
// pour les servir depuis le site et éviter le blocage CORS.
// Lancé automatiquement avant `npm run dev` et `npm run build`.
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const URL_SOURCE = 'https://lorcanajson.org/files/current/fr/allCards.json'
const URL_SOURCE_EN = 'https://lorcanajson.org/files/current/en/allCards.json'
const DOSSIER_PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const FICHIER_CIBLE = path.join(DOSSIER_PUBLIC, 'cartes-fr.json')
const FICHIER_SLUGS = path.join(DOSSIER_PUBLIC, 'cartes-slugs.json')
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

const forcer = process.argv.includes('--force')

if (!forcer && await fichierEstRecent()) {
  console.log('[cartes-fr] Données françaises déjà à jour (moins de 7 jours). Utilise --force pour retélécharger.')
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
        images: { thumbnail: c.images?.thumbnail, full: c.images?.full }
      }))
  }

  await mkdir(DOSSIER_PUBLIC, { recursive: true })
  await writeFile(FICHIER_CIBLE, JSON.stringify(allege))
  console.log(`[cartes-fr] OK : ${allege.cards.length} cartes enregistrées dans public/cartes-fr.json`)

  // Table de correspondance « slug anglais » → nom complet anglais, pour convertir
  // les listes Duels.ink (qui identifient les cartes par slug, ex. « be-prepared »)
  // en liste texte importable par le site.
  const reponseEn = await fetch(URL_SOURCE_EN)
  if (!reponseEn.ok) throw new Error(`HTTP ${reponseEn.status} (données anglaises)`)
  const donneesEn = await reponseEn.json()
  const slugs = {}
  for (const carte of donneesEn.cards || []) {
    if (!carte.fullName) continue
    if (`${carte.images?.thumbnail || ''}${carte.images?.full || ''}`.includes('/promo')) continue
    // Plusieurs graphies possibles du slug : nom complet, nom seul, nom simplifié
    for (const variante of [carte.fullName, carte.simpleName, carte.name]) {
      if (!variante) continue
      const slug = String(variante)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      if (slug && !slugs[slug]) slugs[slug] = carte.fullName
    }
  }
  await writeFile(FICHIER_SLUGS, JSON.stringify(slugs))
  console.log(`[cartes-fr] OK : ${Object.keys(slugs).length} slugs anglais enregistrés dans public/cartes-slugs.json`)
} catch (err) {
  if (await fichierExiste()) {
    console.warn(`[cartes-fr] Téléchargement impossible (${err.message}), on garde le fichier existant.`)
  } else {
    console.warn(`[cartes-fr] Téléchargement impossible (${err.message}) : les cartes resteront en anglais.`)
  }
}
