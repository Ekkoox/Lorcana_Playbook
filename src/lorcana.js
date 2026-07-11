// Encres, couleurs et données de cartes (Lorcast, LorcanaJSON, Dreamborn).
export const ENCRES = [
  { id: 'Amber', nom: { fr: 'Ambre', en: 'Amber' }, color: 'bg-amber-500', border: 'border-amber-500', text: 'text-black', hex: '#f59e0b' },
  { id: 'Amethyst', nom: { fr: 'Améthyste', en: 'Amethyst' }, color: 'bg-purple-700', border: 'border-purple-700', text: 'text-white', hex: '#9333ea' },
  { id: 'Emerald', nom: { fr: 'Émeraude', en: 'Emerald' }, color: 'bg-emerald-600', border: 'border-emerald-600', text: 'text-white', hex: '#10b981' },
  { id: 'Ruby', nom: { fr: 'Rubis', en: 'Ruby' }, color: 'bg-red-600', border: 'border-red-600', text: 'text-white', hex: '#ef4444' },
  { id: 'Sapphire', nom: { fr: 'Saphir', en: 'Sapphire' }, color: 'bg-blue-600', border: 'border-blue-600', text: 'text-white', hex: '#3b82f6' },
  { id: 'Steel', nom: { fr: 'Acier', en: 'Steel' }, color: 'bg-slate-500', border: 'border-slate-500', text: 'text-white', hex: '#94a3b8' },
]

// Matchup « Blind » : la bicolorité adverse est inconnue
export const ENCRE_BLIND = 'Blind'

// Une impression est « classique » si elle vient d'un set principal numéroté ;
// les codes P1, P2, P3, D23, C2, DIS, Q1... sont des promos / éditions spéciales.
export const estCartePromo = (carte) => !/^\d+$/.test(String(carte?.set?.code || ''))

// Parmi une liste d'impressions Lorcast, garde une seule carte par nom+version
// en préférant toujours l'impression classique à la promo.
export const choisirImpressionsClassiques = (resultats, normaliser) => {
  const parCarte = new Map()
  for (const carte of resultats) {
    const cle = `${normaliser(carte.name)}|${normaliser(carte.version || '')}`
    const existante = parCarte.get(cle)
    if (!existante) {
      parCarte.set(cle, carte)
    } else if (estCartePromo(existante) && !estCartePromo(carte)) {
      parCarte.set(cle, carte)
    }
  }
  return [...parCarte.values()]
}

// Couleur hexadécimale d'une encre (gris ardoise par défaut, y compris pour Blind)
export const couleurEncre = (id) => ENCRES.find(e => e.id === id)?.hex || '#475569'

// Dégradé CSS à partir d'une liste d'encres (1 ou 2 couleurs)
export const degradeEncres = (ids = [], angle = 135, alpha = '') => {
  const couleurs = (ids.length ? ids : ['Steel']).map(id => `${couleurEncre(id)}${alpha}`)
  const [c1, c2] = [couleurs[0], couleurs[1] || couleurs[0]]
  return `linear-gradient(${angle}deg, ${c1}, ${c2})`
}

// Pastille d'encre lumineuse


// --- Données françaises officielles des cartes (LorcanaJSON) ---
// L'API Lorcast ne fournit que les cartes en anglais : on récupère donc
// les noms et visuels français depuis Lorcan aJSON, indexés par set + numéro.
// Le fichier est téléchargé dans public/ par scripts/telecharger-cartes-fr.mjs
// (lancé avant `npm run dev` / `npm run build`) car lorcanajson.org bloque le CORS.
const URL_CARTES_FR = '/cartes-fr.json'
let promesseCartesFr = null

export const chargerCartesFr = () => {
  if (!promesseCartesFr) {
    promesseCartesFr = fetch(URL_CARTES_FR)
      .then(reponse => {
        if (!reponse.ok) throw new Error(`Fichier cartes FR introuvable (HTTP ${reponse.status})`)
        const typeContenu = reponse.headers.get('content-type') || ''
        if (!typeContenu.includes('json')) throw new Error('Fichier cartes FR absent : lancez `npm run cartes-fr`')
        return reponse.json()
      })
      .then(donnees => {
        const index = new Map()
        for (const carteFr of donnees.cards || []) {
          if (carteFr.setCode == null || carteFr.number == null) continue
          // On ne garde que les champs utiles pour limiter la mémoire
          index.set(`${carteFr.setCode}|${carteFr.number}`, {
            fullName: carteFr.fullName,
            simpleName: carteFr.simpleName,
            setCode: carteFr.setCode,
            number: carteFr.number,
            images: { thumbnail: carteFr.images?.thumbnail, full: carteFr.images?.full }
          })
        }
        return index
      })
      .catch(err => {
        promesseCartesFr = null // permet de retenter plus tard en cas d'échec réseau
        throw err
      })
  }
  return promesseCartesFr
}

// Compare des noms sans tenir compte des accents ni de la casse
export const normaliserTexte = (texte) =>
  (texte || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Image française de secours (Dreamborn) pour les cartes pas encore dans LorcanaJSON,
// typiquement le dernier chapitre sorti. URL construite depuis set + numéro.
export const imageFrDreamborn = (carte) => {
  const codeSet = carte?.set?.code
  const numero = parseInt(carte?.collector_number, 10)
  if (!codeSet || Number.isNaN(numero) || !/^\d+$/.test(String(codeSet))) return null
  return `https://cdn.dreamborn.ink/images/fr/cards/${String(codeSet).padStart(3, '0')}-${String(numero).padStart(3, '0')}`
}

// Réécrit l'URL d'une image de carte vers le proxy même-origine (voir vite.config.js) :
// les CDN de cartes n'envoient pas d'en-têtes CORS, et html2canvas ne peut dessiner
// que des images même-origine (ou CORS) lors de l'export du plan en PNG.
export const urlImagePourExport = (url) => {
  if (!url) return url
  try {
    const u = new URL(url, window.location.origin)
    if (u.origin === window.location.origin) return url
    if (u.hostname === 'cards.lorcast.io') return `/img-lorcast${u.pathname}${u.search}`
    if (u.hostname === 'cdn.dreamborn.ink') return `/img-dreamborn${u.pathname}${u.search}`
    if (u.hostname === 'api.lorcana.ravensburger.com') return `/img-ravensburger${u.pathname}${u.search}`
    return url
  } catch {
    return url
  }
}

// Clé "setCode|numéro" d'une carte Lorcast, pour la faire correspondre aux données FR
export const cleCarteFr = (carte) => {
  const codeSet = carte?.set?.code
  const numero = parseInt(carte?.collector_number, 10)
  if (!codeSet || Number.isNaN(numero)) return null
  return `${codeSet}|${numero}`
}
