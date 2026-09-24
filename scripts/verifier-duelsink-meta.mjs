// Vérifie que notre conversion de la matrice Duels.ink est fidèle.
//   npm run verifier-meta                 → contrôles de cohérence sur toute la matrice
//   npm run verifier-meta Emerald/Steel   → en plus, détail d'une bicolorité à comparer
//                                           avec https://duels.ink/stats
//
// Ne touche pas à la base : lecture seule.

import { recupererMatriceMeta, convertirMatriceEnLignes } from '../lib/duelsink-meta.mjs'

const queue = process.env.DUELSINK_QUEUE || 'core-bo1'
const bicoloriteDemandee = process.argv[2] || null

const cleEre = (donnees) => {
  const ere = donnees?.meta?.eras?.currentEra
  return ere ? (ere.key || ere.eraKey || ere.id || null) : null
}

const sondage = await recupererMatriceMeta({ queue })
const ere = process.env.DUELSINK_ERA && process.env.DUELSINK_ERA !== 'auto'
  ? process.env.DUELSINK_ERA
  : cleEre(sondage.donnees)

const { donnees } = await recupererMatriceMeta({ queue, era: ere })
const lignes = convertirMatriceEnLignes(donnees)

console.log(`File : ${queue} · set : ${ere ?? 'tous'} · données du ${donnees.updatedAt}`)
console.log(`${donnees.matchups.length} matchups source → ${lignes.length} lignes produites`)
console.log(`${donnees.activity?.totalGames ?? '?'} parties analysées au total\n`)

// --- Contrôles de cohérence ---
const anomalies = []
const parCle = new Map()
for (const l of lignes) parCle.set(`${l.deck_encres}|${l.adversaire_encres}|${l.sur_le_play}`, l)

for (const m of donnees.matchups) {
  const a = m.colorsA.map(c => c[0].toUpperCase() + c.slice(1)).sort().join('/')
  const b = m.colorsB.map(c => c[0].toUpperCase() + c.slice(1)).sort().join('/')

  const total = parCle.get(`${a}|${b}|null`)
  const play = parCle.get(`${a}|${b}|true`)
  const draw = parCle.get(`${a}|${b}|false`)
  if (!total) continue

  // 1. play + draw doit reconstituer le total
  const sommeParties = (play?.parties || 0) + (draw?.parties || 0)
  if (sommeParties !== total.parties) {
    anomalies.push(`${a} vs ${b} : play+draw = ${sommeParties} ≠ total ${total.parties}`)
  }
  const sommeVictoires = (play?.victoires || 0) + (draw?.victoires || 0)
  if (Math.abs(sommeVictoires - total.victoires) > 1) {
    anomalies.push(`${a} vs ${b} : victoires play+draw = ${sommeVictoires} ≠ total ${total.victoires}`)
  }

  // 2. le taux recalculé doit retomber sur celui annoncé par l'API
  const tauxNotre = (total.victoires / total.parties) * 100
  if (Math.abs(tauxNotre - m.winRate) > 0.6) {
    anomalies.push(`${a} vs ${b} : taux ${tauxNotre.toFixed(2)}% ≠ API ${m.winRate}%`)
  }

  // 3. symétrie entre les deux points de vue
  if (a !== b) {
    const inverse = parCle.get(`${b}|${a}|null`)
    if (!inverse) anomalies.push(`${b} vs ${a} : point de vue manquant`)
    else if (inverse.parties !== total.parties) {
      anomalies.push(`${a}/${b} : volumes asymétriques (${total.parties} vs ${inverse.parties})`)
    }
  }

  // 4. aucune valeur absurde
  for (const l of [total, play, draw]) {
    if (!l) continue
    if (l.victoires < 0 || l.defaites < 0 || l.victoires > l.parties) {
      anomalies.push(`${l.deck_encres} vs ${l.adversaire_encres} : valeurs incohérentes`)
    }
  }
}

if (anomalies.length === 0) {
  console.log('✓ Cohérence vérifiée : play + draw = total, taux conformes à l\'API, points de vue symétriques.\n')
} else {
  console.log(`✗ ${anomalies.length} anomalie(s) :`)
  for (const a of anomalies.slice(0, 20)) console.log('  -', a)
  console.log()
}

// --- Détail d'une bicolorité, à comparer avec duels.ink/stats ---
if (bicoloriteDemandee) {
  const cible = bicoloriteDemandee.split('/').map(c => c.trim())
    .map(c => c[0].toUpperCase() + c.slice(1).toLowerCase()).sort().join('/')
  const siennes = lignes.filter(l => l.deck_encres === cible)
  if (siennes.length === 0) {
    console.log(`Aucune donnée pour « ${cible} ». Exemples disponibles :`)
    console.log('  ' + [...new Set(lignes.map(l => l.deck_encres))].slice(0, 8).join(', '))
  } else {
    console.log(`Détail de ${cible} — à comparer avec https://duels.ink/stats\n`)
    console.log('Adversaire               Total        On commence   On est second')
    const adversaires = [...new Set(siennes.map(l => l.adversaire_encres))]
    for (const adv of adversaires) {
      const t = parCle.get(`${cible}|${adv}|null`)
      const p = parCle.get(`${cible}|${adv}|true`)
      const d = parCle.get(`${cible}|${adv}|false`)
      const pct = (l) => (l && l.parties ? `${Math.round((l.victoires / l.parties) * 100)}% (${l.parties})` : '—')
      console.log(`${adv.padEnd(24)} ${pct(t).padEnd(12)} ${pct(p).padEnd(13)} ${pct(d)}`)
    }
  }
}
