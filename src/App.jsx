import { useState, useEffect } from 'react'

const ENCRES = [
  { id: 'Amber', nom: 'Ambre', color: 'bg-amber-500', text: 'text-black' },
  { id: 'Amethyst', nom: 'Améthyste', color: 'bg-purple-700', text: 'text-white' },
  { id: 'Emerald', nom: 'Émeraude', color: 'bg-emerald-600', text: 'text-white' },
  { id: 'Ruby', nom: 'Rubis', color: 'bg-red-600', text: 'text-white' },
  { id: 'Sapphire', nom: 'Saphir', color: 'bg-blue-600', text: 'text-white' },
  { id: 'Steel', nom: 'Acier', color: 'bg-slate-500', text: 'text-white' },
]

export default function App() {
  const [pageActive, setPageActive] = useState('accueil')
  const [texteImport, setTexteImport] = useState('')
  const [nomDeck, setNomDeck] = useState('')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState('')
  const [indexDeckActif, setIndexDeckActif] = useState(0)

  // LOGIQUE DE RECHERCHE & REMPLACEMENT VISUEL
  const [carteEnCoursEdition, setCarteEnCoursEdition] = useState(null)
  const [estUnAjoutPur, setEstUnAjoutPur] = useState(false) // 🔥 Nouveau : sait si on ajoute ou si on modifie
  const [rechercheTerme, setRechercheTerme] = useState('')
  const [resultatsRecherche, setResultatsRecherche] = useState([])
  const [quantiteEdition, setQuantiteEdition] = useState(4)
  const [rechercheChargement, setRechercheChargement] = useState(false)

  // Logique du Playbook
  const [sousVuePlaybook, setSousVuePlaybook] = useState('menu')
  const [adversaireEncres, setAdversaireEncres] = useState([])
  const [archetypeAdverse, setArchetypeAdverse] = useState('')
  const [lignesPlayTexte, setLignesPlayTexte] = useState('')
  const [mulliganCartes, setMulliganCartes] = useState(Array(7).fill(null))
  const [modaleIndexOuvert, setModaleIndexOuvert] = useState(null)

  // Stockage local
  const [listeDecks, setListeDecks] = useState(() => {
    const decksSauvegardes = localStorage.getItem('lorcana_playbook_tous_les_decks')
    return decksSauvegardes ? JSON.parse(decksSauvegardes) : []
  })

  const [strategies, setStrategies] = useState(() => {
    const stratSauvegardees = localStorage.getItem('lorcana_playbook_strategies')
    return stratSauvegardees ? JSON.parse(stratSauvegardees) : {}
  })

  useEffect(() => {
    localStorage.setItem('lorcana_playbook_tous_les_decks', JSON.stringify(listeDecks))
  }, [listeDecks])

  useEffect(() => {
    localStorage.setItem('lorcana_playbook_strategies', JSON.stringify(strategies))
  }, [strategies])

  // Recherche globale dans toute l'API Lorcast
  useEffect(() => {
    if (rechercheTerme.trim().length < 2) {
      setResultatsRecherche([])
      return
    }
    const delaiRecherche = setTimeout(async () => {
      setRechercheChargement(true)
      try {
        const params = new URLSearchParams({ q: `name:"${rechercheTerme}"` })
        const reponse = await fetch(`https://api.lorcast.com/v0/cards/search?${params.toString()}`)
        if (reponse.ok) {
          const donnees = await reponse.json()
          const res = Array.isArray(donnees) ? donnees : (donnees.results || donnees.data || [])
          setResultatsRecherche(res.slice(0, 20))
        }
      } catch (err) { console.error(err) }
      setRechercheChargement(false)
    }, 400)

    return () => clearTimeout(delaiRecherche)
  }, [rechercheTerme])

  const gererImportDeck = async () => {
    if (!texteImport.trim() || !nomDeck.trim()) return
    setChargement(true)
    setErreur('')

    const lignes = texteImport.split('\n')
    const deckTemporaire = []

    for (let ligne of lignes) {
      ligne = ligne.trim()
      if (!ligne) continue 
      const formatCorrespondance = ligne.match(/^(\d+)[xX]?\s+(.+)$/)

      if (formatCorrespondance) {
        const quantite = parseInt(formatCorrespondance[1], 10)
        let nomBrut = formatCorrespondance[2].trim().split('(')[0].trim()
        let requeteAPI = nomBrut.includes(' - ') 
          ? `name:"${nomBrut.split(' - ')[0].trim()}" version:"${nomBrut.split(' - ')[1].trim()}"`
          : `name:"${nomBrut}"`

        try {
          const params = new URLSearchParams({ q: requeteAPI })
          let reponse = await fetch(`https://api.lorcast.com/v0/cards/search?${params.toString()}`)
          if (!reponse.ok && nomBrut.includes(' - ')) {
            const paramsSecours = new URLSearchParams({ q: `name:"${nomBrut.split(' - ')[0].trim()}"` })
            reponse = await fetch(`https://api.lorcast.com/v0/cards/search?${paramsSecours.toString()}`)
          }
          if (reponse.ok) {
            const donnees = await reponse.json()
            const resultats = Array.isArray(donnees) ? donnees : (donnees.results || donnees.data || [])
            if (resultats.length > 0) {
              deckTemporaire.push({ ...resultats[0], quantite })
            }
          }
        } catch (err) { console.error(err) }
      }
    }

    if (deckTemporaire.length === 0) {
      setErreur("Aucune carte valide n'a été trouvée.")
    } else {
      const nouveauDeck = { id: Date.now().toString(), nom: nomDeck.trim(), cartes: deckTemporaire }
      setListeDecks([nouveauDeck, ...listeDecks])
      setIndexDeckActif(0)
      setTexteImport('')
      setNomDeck('')
      setPageActive('mes-decks')
    }
    setChargement(false)
  }

  const appliquerChangementCarteVisuel = (nouvelleCarte) => {
    if (!deckAffiche) return

    const copieListeDecks = [...listeDecks]
    let cartesModifiees = [...deckAffiche.cartes]

    // Étape 1 : Si on modifiait une carte existante, on retire son ancienne version
    if (!estUnAjoutPur && carteEnCoursEdition) {
      cartesModifiees = cartesModifiees.filter(c => c.id !== carteEnCoursEdition.id)
    }

    // Étape 2 : On injecte la nouvelle carte sélectionnée (ou la même avec un nouveau ratio)
    if (nouvelleCarte) {
      const indexExistante = cartesModifiees.findIndex(c => c.id === nouvelleCarte.id)
      if (indexExistante !== -1) {
        cartesModifiees[indexExistante].quantite = quantiteEdition
      } else {
        cartesModifiees.push({ ...nouvelleCarte, quantite: quantiteEdition })
      }
    }

    copieListeDecks[indexDeckActif] = { ...deckAffiche, cartes: cartesModifiees }
    setListeDecks(copieListeDecks)
    
    // Fermeture propre
    setCarteEnCoursEdition(null)
    setEstUnAjoutPur(false)
    setRechercheTerme('')
    setResultatsRecherche([])
  }

  const supprimerDeck = (idSupprime) => {
    if (window.confirm("Voulez-vous vraiment supprimer ce deck ?")) {
      const nouvelleListe = listeDecks.filter(d => d.id !== idSupprime)
      setListeDecks(nouvelleListe)
      setIndexDeckActif(0)
      if (nouvelleListe.length === 0) setPageActive('accueil')
    }
  }

  const supprimerPlaybook = (cleUnique, e) => {
    e.stopPropagation()
    if (window.confirm("Voulez-vous vraiment supprimer ce plan de jeu ?")) {
      const copieStrategies = { ...strategies }
      delete copieStrategies[cleUnique]
      setStrategies(copieStrategies)
    }
  }

  const extraireEncresDuDeck = (deck) => {
    if (!deck || !deck.cartes) return []
    const encrestrouvees = deck.cartes.map(c => c.ink)
    return [...new Set(encrestrouvees)]
  }

  const deckAffiche = listeDecks[indexDeckActif]
  const totalCartesDuDeck = deckAffiche ? deckAffiche.cartes.reduce((total, c) => total + c.quantite, 0) : 0
  const encresMonDeck = extraireEncresDuDeck(deckAffiche)

  const gererClicAdversaireEncre = (encreId) => {
    if (adversaireEncres.includes(encreId)) {
      setAdversaireEncres(adversaireEncres.filter(id => id !== encreId))
      setArchetypeAdverse('')
    } else {
      if (adversaireEncres.length >= 2) return
      setAdversaireEncres([...adversaireEncres, encreId])
    }
  }

  const genererCleStrategie = (archetypeNom) => {
    if (!deckAffiche || adversaireEncres.length !== 2) return ''
    const adversaireCle = [...adversaireEncres].sort().join('-')
    const nomSain = archetypeNom.replace(/\s+/g, '-').trim()
    return `${deckAffiche.id}_vs_${adversaireCle}__${nomSain}`
  }

  const chargerStrategie = (nomArchetype) => {
    setArchetypeAdverse(nomArchetype)
    const cle = genererCleStrategie(nomArchetype)
    if (strategies && strategies[cle]) {
      setLignesPlayTexte(strategies[cle].lignesPlay || '')
      setMulliganCartes(strategies[cle].mulliganCartes || Array(7).fill(null))
    } else {
      setLignesPlayTexte('')
      setMulliganCartes(Array(7).fill(null))
    }
  }

  const synchroniserStrategie = (nouvellesCartes, nouveauxLignesPlay) => {
    const cle = genererCleStrategie(archetypeAdverse)
    if (!cle) return

    setStrategies({
      ...strategies,
      [cle]: {
        mulliganCartes: nouvellesCartes,
        lignesPlay: nouveauxLignesPlay,
        adversaireEncres: adversaireEncres,
        archetypeAdverse: archetypeAdverse,
        cleUnique: cle
      }
    })
  }

  const selectionnerCarteMulligan = (carte) => {
    const copieMulligan = [...mulliganCartes]
    if (carte === null) {
      copieMulligan[modaleIndexOuvert] = null
    } else {
      const occurences = copieMulligan.filter(c => c && c.id === carte.id).length
      if (occurences >= 4) {
        alert("Règle des 4 exemplaires maximum atteinte pour cette carte !")
        return
      }
      copieMulligan[modaleIndexOuvert] = carte
    }
    setMulliganCartes(copieMulligan)
    synchroniserStrategie(copieMulligan, lignesPlayTexte)
    setModaleIndexOuvert(null)
  }

  const sauvegarderEtFermerPlaybook = () => {
    setAdversaireEncres([])
    setArchetypeAdverse('')
    setLignesPlayTexte('')
    setMulliganCartes(Array(7).fill(null))
    setSousVuePlaybook('menu')
    alert("Plan de jeu enregistré avec succès dans votre Playbook !")
  }

  const obtenerPlaybooksExistants = () => {
    if (!deckAffiche || !strategies) return []
    return Object.keys(strategies)
      .filter(cle => cle.startsWith(`${deckAffiche.id}_vs_`))
      .map(cle => strategies[cle])
      .filter(p => p && p.adversaireEncres && p.archetypeAdverse)
  }

  const playbooksExistants = obtenerPlaybooksExistants()

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col justify-between">
      
      {/* BARRE DE NAVIGATION */}
      <header className="w-full px-6 py-6 flex justify-between items-center">
        <button onClick={() => { setPageActive('accueil'); setAdversaireEncres([]); setArchetypeAdverse(''); setCarteEnCoursEdition(null) }} className="border border-slate-800 px-4 py-2 rounded-xl text-sm font-medium tracking-wide text-slate-300 hover:border-amber-500 hover:text-white transition-all">
          Lorcana Playbook
        </button>
        <div className="flex gap-3">
          <button className="border border-slate-800 px-4 py-2 rounded-xl text-sm font-medium text-slate-300">Langue</button>
          <button className="border border-slate-800 px-4 py-2 rounded-xl text-sm font-medium text-slate-300">Connexion</button>
        </div>
      </header>

      {/* ZONE CENTRALE */}
      <main className="flex-1 flex flex-col justify-center items-center px-6 py-12 w-full relative">
        
        {/* VUE 1 : ACCUEIL */}
        {pageActive === 'accueil' && (
          <div className="text-center">
            <h1 className="text-6xl sm:text-8xl font-black tracking-tight mb-16 uppercase bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent">Lorcana Playbook</h1>
            <div className="flex flex-col sm:flex-row gap-6 justify-center w-full max-w-md sm:max-w-none mx-auto">
              <button onClick={() => setPageActive('importer')} className="border-2 border-slate-800 px-10 py-5 rounded-xl text-xl font-bold tracking-wide hover:border-amber-500 hover:text-amber-400 shadow-lg transition-all active:scale-95">Importer un deck</button>
              <button onClick={() => { if (listeDecks.length > 0) setPageActive('mes-decks') }} disabled={listeDecks.length === 0} className={`border-2 border-slate-800 px-10 py-5 rounded-xl text-xl font-bold tracking-wide transition-all active:scale-95 ${listeDecks.length > 0 ? 'hover:border-purple-500 hover:text-purple-400 cursor-pointer' : 'opacity-30 cursor-not-allowed'}`}>
                Mes decks ({listeDecks.length})
              </button>
            </div>
          </div>
        )}

        {/* VUE 2 : IMPORTER */}
        {pageActive === 'importer' && (
          <div className="w-full max-w-2xl space-y-6">
            <button onClick={() => setPageActive('accueil')} className="text-slate-400 hover:text-amber-400 text-sm mb-2">← Retour</button>
            <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-900 shadow-xl space-y-4">
              <h2 className="text-xl font-bold">Ajouter un nouveau deck</h2>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Nom de votre Deck</label>
                <input type="text" value={nomDeck} onChange={(e) => setNomDeck(e.target.value)} placeholder="Ex: Sapphire Emerald Tempo" className="w-full p-3 bg-slate-950 border border-slate-900 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Liste au format texte</label>
                <textarea value={texteImport} onChange={(e) => setTexteImport(e.target.value)} placeholder="4 Cinderella - Dream Come True&#10;3 Ink Geyser" className="w-full h-40 p-4 bg-slate-950 border border-slate-900 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-sm resize-none" />
              </div>
              <button onClick={gererImportDeck} disabled={chargement} className="w-full py-3.5 border border-amber-500/20 hover:border-amber-500 bg-amber-500/5 hover:bg-amber-500 hover:text-slate-950 text-amber-400 font-extrabold rounded-xl transition-all text-sm">{chargement ? "Vérification..." : "Sauvegarder ce deck"}</button>
              {erreur && <p className="text-red-400 text-sm text-center">{erreur}</p>}
            </div>
          </div>
        )}

        {/* VUE 3 : BIBLIOTHÈQUE */}
        {pageActive === 'mes-decks' && deckAffiche && (
          <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-8 items-start">
            <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-900 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-2 mb-4">Vos Decks ({listeDecks.length})</h3>
              {listeDecks.map((deck, idx) => {
                const encresDuBouton = extraireEncresDuDeck(deck)
                return (
                  <button 
                    key={deck.id} 
                    onClick={() => { setIndexDeckActif(idx); setAdversaireEncres([]); setArchetypeAdverse(''); setCarteEnCoursEdition(null) }} 
                    className={`w-full text-left p-3 rounded-xl text-sm font-medium transition-all flex justify-between items-center ${idx === indexDeckActif ? 'bg-purple-500/10 border border-purple-500 text-purple-400' : 'border border-transparent hover:bg-slate-900 text-slate-400 hover:text-slate-200'}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="flex gap-1 shrink-0 bg-slate-950/60 p-1 rounded-md">
                        {encresDuBouton.filter(Boolean).map(encreId => {
                          const colorData = ENCRES.find(e => e.id === encreId)
                          return <span key={encreId} className={`w-2 h-2 rounded-full ${colorData?.color || 'bg-slate-600'}`} />
                        })}
                      </div>
                      <span className="truncate">{deck.nom}</span>
                    </div>
                    <span className="text-xs opacity-60 bg-slate-950 px-2 py-0.5 rounded-full">{deck.cartes.reduce((acc, c) => acc + c.quantite, 0)}</span>
                  </button>
                )
              })}
              <hr className="border-slate-900 my-4" />
              <button onClick={() => setPageActive('importer')} className="w-full p-3 border border-dashed border-slate-800 hover:border-slate-600 rounded-xl text-xs text-center text-slate-400 hover:text-white font-semibold transition-all">+ Importer un autre deck</button>
            </div>

            <div className="md:grid-cols-1 md:col-span-3 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-900 pb-4 gap-4">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight">{deckAffiche.nom}</h2>
                  <p className="text-sm text-slate-500">Contient {totalCartesDuDeck} cartes — Encres : {encresMonDeck.filter(Boolean).map(id => ENCRES.find(e => e.id === id)?.nom || id).join(' / ')}</p>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button onClick={() => { setSousVuePlaybook('menu'); setPageActive('playbook') }} className="flex-1 sm:flex-none bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-slate-950 font-black px-6 py-2.5 rounded-xl text-sm shadow-md transition-all active:scale-95">🎯 Faire mes plans de jeu</button>
                  <button onClick={() => supprimerDeck(deckAffiche.id)} className="text-xs text-red-400 hover:text-red-500 border border-red-950 hover:border-red-500 px-3 py-2 rounded-xl transition-all">Supprimer</button>
                </div>
              </div>

              {/* GRILLE DES CARTES DE TA COLLECTION */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-fadeIn">
                {deckAffiche.cartes.map((carte) => (
                  <div 
                    key={carte.id} 
                    onClick={() => { setCarteEnCoursEdition(carte); setQuantiteEdition(carte.quantite); setEstUnAjoutPur(false) }}
                    className="bg-slate-900/60 p-3 rounded-xl border border-slate-900 hover:border-amber-500/40 cursor-pointer flex flex-col justify-between relative group transition-all"
                  >
                    <div className="absolute -top-2 -right-2 bg-purple-500 text-white font-black px-2 py-0.5 rounded-full text-xs shadow-md">x{carte.quantite}</div>
                    <img src={carte.image_uris?.digital?.normal} alt={carte.name} className="w-full h-auto rounded-lg shadow-md mb-2" loading="lazy" />
                    <h4 className="font-bold text-xs leading-tight text-slate-200 line-clamp-1">{carte.name}</h4>
                    <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="bg-slate-950/90 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400">✏️ Modifier / Ratios</span>
                    </div>
                  </div>
                ))}

                {/* 🔥 NOUVELLE CASE VIRTUELLE PROPRE : Le bouton "+" en fin de grille pour ajouter une carte */}
                <button
                  onClick={() => { setCarteEnCoursEdition({ name: "Nouvelle Carte", image_uris: { digital: { normal: "" } } }); setQuantiteEdition(4); setEstUnAjoutPur(true) }}
                  className="w-full bg-slate-900/20 hover:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-800 hover:border-amber-500/40 flex flex-col justify-center items-center gap-2 text-slate-500 hover:text-amber-400 transition-all p-6 min-h-[220px] group"
                >
                  <span className="text-3xl font-light group-hover:scale-110 transition-transform">+</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Ajouter une carte</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VUE 4 : PLAYBOOK STRATÉGIQUE */}
        {pageActive === 'playbook' && deckAffiche && (
          <div className="w-full max-w-5xl space-y-8 animate-fadeIn">
            <button onClick={() => { setPageActive('mes-decks'); setAdversaireEncres([]); setArchetypeAdverse('') }} className="text-slate-400 hover:text-amber-400 text-sm">← Retour à mes decks</button>

            <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-900 shadow-xl space-y-6">
              {sousVuePlaybook === 'menu' && (
                <div className="space-y-6 py-4 animate-fadeIn">
                  <div className="text-center">
                    <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Bibliothèque Tactique</span>
                    <h2 className="text-4xl font-black mt-2">Playbook : {deckAffiche.nom}</h2>
                    <p className="text-sm text-slate-400 mt-2">Sélectionnez une stratégie existante pour la consulter/modifier, ou lancez-en une nouvelle.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto pt-6">
                    {playbooksExistants.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setAdversaireEncres(p.adversaireEncres)
                          setArchetypeAdverse(p.archetypeAdverse)
                          setLignesPlayTexte(p.lignesPlay || '')
                          setMulliganCartes(p.mulliganCartes || Array(7).fill(null))
                          setSousVuePlaybook('creer')
                        }}
                        className="p-5 bg-slate-900/90 border border-slate-800 rounded-xl hover:border-purple-500 text-left transition-all group flex flex-col justify-between shadow-md relative overflow-hidden"
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="text-xs font-bold uppercase text-slate-500 group-hover:text-purple-400">Modifier Plan #{idx+1}</span>
                          <div className="flex gap-1.5 bg-slate-950/60 px-2 py-1 rounded-lg border border-slate-800/40">
                            {p.adversaireEncres?.map(encreId => {
                              const encreData = ENCRES.find(e => e.id === encreId)
                              return <span key={encreId} className={`w-3 h-3 rounded-full ${encreData?.color || 'bg-slate-600'}`} />
                            })}
                          </div>
                          <button onClick={(e) => supprimerPlaybook(p.cleUnique, e)} className="text-slate-500 hover:text-red-400 p-1 rounded-lg hover:bg-slate-950 transition-colors z-10" title="Supprimer ce plan de jeu">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                        <span className="text-lg font-extrabold text-slate-100 mt-3 group-hover:text-purple-300 transition-colors">
                          vs {p.adversaireEncres?.map(id => ENCRES.find(e => e.id === id)?.nom || id).join(' / ')}
                        </span>
                        <span className="text-sm font-medium text-purple-400 italic mt-1">
                          Archétype : <span className="text-slate-300 font-semibold">{p.archetypeAdverse}</span>
                        </span>
                      </button>
                    ))}

                    <button onClick={() => { setAdversaireEncres([]); setArchetypeAdverse(''); setLignesPlayTexte(''); setMulliganCartes(Array(7).fill(null)); setSousVuePlaybook('creer') }} className="p-5 border-2 border-dashed border-slate-800 hover:border-amber-500 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-amber-400 transition-all font-bold gap-2 min-h-[140px]">
                      <span className="text-2xl">➕</span>Créer une nouvelle stratégie
                    </button>
                  </div>
                </div>
              )}

              {sousVuePlaybook === 'creer' && (
                <div className="space-y-6 animate-fadeIn">
                  <button onClick={() => { setSousVuePlaybook('menu'); setAdversaireEncres([]); setArchetypeAdverse('') }} className="text-xs text-purple-400 hover:underline">← Retourner à la liste des plans de jeu</button>
                  <div className="text-center">
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-500">Configuration Tactique</span>
                    <h2 className="text-2xl font-black mt-1">Feuille de Match : {deckAffiche.nom}</h2>
                  </div>

                  <div className="border-t border-slate-900 pt-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 text-center mb-4">1. Choix de la bicolorité adverse</h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                      {ENCRES.map((encre) => {
                        const estSelectionnee = adversaireEncres.includes(encre.id)
                        return <button key={encre.id} onClick={() => gererClicAdversaireEncre(encre.id)} className={`p-3 rounded-xl font-bold transition-all text-xs ${encre.color} ${encre.text} ${estSelectionnee ? 'ring-4 ring-white scale-105 opacity-100' : 'opacity-40 hover:opacity-80'}`}>{encre.nom}</button>
                      })}
                    </div>
                  </div>

                  {adversaireEncres.length === 2 && (
                    <div className="border-t border-slate-900 pt-6 space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 text-center">2. Quel type d'archétype est-ce ?</h3>
                      <div className="max-w-md mx-auto">
                        <input type="text" value={archetypeAdverse} onChange={(e) => chargerStrategie(e.target.value)} placeholder="Ex: Aggro, Contrôle, Midrange, Steelsong..." className="w-full text-center p-3 bg-slate-950 border border-slate-900 rounded-xl text-slate-200 focus:outline-none focus:border-purple-500 font-medium text-sm" />
                      </div>
                    </div>
                  )}

                  {adversaireEncres.length === 2 && archetypeAdverse.trim() !== '' && (
                    <div className="border-t border-slate-900 pt-6 space-y-8 animate-fadeIn">
                      <div className="bg-slate-950/60 p-4 rounded-xl border border-purple-900/30 text-center">
                        <p className="text-sm font-black text-amber-400">
                          {deckAffiche.nom} VS {adversaireEncres.filter(Boolean).map(id => ENCRES.find(e => e.id === id)?.nom || id).join(' / ')} ({archetypeAdverse})
                        </p>
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wider">🃏 Mulligan Optimal</h4>
                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                          {mulliganCartes.map((carte, index) => (
                            <button key={index} onClick={() => setModaleIndexOuvert(index)} className="w-full aspect-[3/4] bg-slate-950/80 rounded-xl border-2 border-dashed border-slate-800 hover:border-amber-500/50 flex flex-col justify-center items-center transition-all p-1 relative overflow-hidden group">
                              {carte ? (
                                <>
                                  <img src={carte.image_uris?.digital?.normal} alt={carte.name} className="w-full h-full object-cover rounded-lg" />
                                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-red-400">Modifier</div>
                                </>
                              ) : <span className="text-2xl text-slate-600 font-light group-hover:text-amber-400 transition-colors">+</span>}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3 border-t border-slate-900 pt-6">
                        <h4 className="font-bold text-purple-400 text-xs uppercase tracking-wider">🎯 Lignes de Play</h4>
                        <textarea value={lignesPlayTexte} onChange={(e) => { setLignesPlayTexte(e.target.value); synchroniserStrategie(mulliganCartes, e.target.value) }} placeholder="Écris tes lignes de jeu détaillées ici..." className="w-full h-32 p-4 bg-slate-950 border border-slate-900 rounded-xl text-sm text-slate-300 focus:outline-none focus:border-purple-500 resize-none" />
                      </div>
                      
                      <div className="pt-4 flex justify-end">
                        <button onClick={sauvegarderEtFermerPlaybook} className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg">💾 Enregistrer &amp; Fermer ce plan</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODALE RECHERCHE DE CARTES POUR LE MULLIGAN */}
        {modaleIndexOuvert !== null && deckAffiche && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
                <h3 className="font-bold text-base">Sélectionner pour l'emplacement #{modaleIndexOuvert + 1}</h3>
                <button onClick={() => setModaleIndexOuvert(null)} className="text-slate-400 hover:text-white font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-xl transition-all">Fermer</button>
              </div>
              <div className="p-6 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 bg-slate-900/60">
                <button onClick={() => selectionnerCarteMulligan(null)} className="bg-slate-950 rounded-xl border border-dashed border-red-900/50 hover:border-red-500 text-red-400 p-4 font-bold text-xs flex flex-col justify-center items-center aspect-[3/4] transition-all">❌ Vider cet emplacement</button>
                {deckAffiche.cartes.map((carte) => (
                  <button key={carte.id} onClick={() => selectionnerCarteMulligan(carte)} className="bg-slate-950 p-2 rounded-xl border border-slate-800 hover:border-purple-500 flex flex-col justify-between items-center transition-all text-left relative group aspect-[3/4]">
                    <img src={carte.image_uris?.digital?.normal} alt={carte.name} className="w-full h-auto rounded-lg shadow-md mb-1" />
                    <span className="text-[10px] font-bold text-slate-400 truncate w-full text-center">{carte.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MODALE GESTIONNAIRE DE CARTE VISUEL */}
        {carteEnCoursEdition !== null && deckAffiche && (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
              
              <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
                <div>
                  <h3 className="font-extrabold text-lg text-amber-400">
                    {estUnAjoutPur ? "➕ Ajouter une nouvelle carte" : "✏️ Gestionnaire de Ratio Visuel"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Modifie ou intègre proprement tes cartes sans casser ta base de données</p>
                </div>
                <button onClick={() => { setCarteEnCoursEdition(null); setEstUnAjoutPur(false); setRechercheTerme(''); setResultatsRecherche([]) }} className="bg-slate-800 hover:bg-slate-700 text-sm font-bold px-4 py-2 rounded-xl transition-all">Fermer</button>
              </div>

              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                
                {/* Colonne Gauche : Aperçu actuel ou Consignes d'ajout */}
                <div className="w-full md:w-1/3 p-6 bg-slate-950/30 border-r border-slate-800 flex flex-col items-center justify-between gap-4 overflow-y-auto">
                  <div className="text-center space-y-2">
                    <span className="text-[10px] font-bold bg-purple-500/10 border border-purple-500/30 text-purple-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {estUnAjoutPur ? "Sélection à droite" : "Cible d'édition"}
                    </span>
                    <h4 className="font-bold text-sm leading-tight text-slate-100">{carteEnCoursEdition.name}</h4>
                  </div>
                  
                  {carteEnCoursEdition.image_uris?.digital?.normal ? (
                    <img src={carteEnCoursEdition.image_uris?.digital?.normal} alt={carteEnCoursEdition.name} className="w-48 h-auto rounded-xl shadow-2xl border border-slate-800" />
                  ) : (
                    <div className="w-48 aspect-[3/4] bg-slate-950 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-center p-4 text-xs text-slate-600 font-semibold italic">
                      Utilise la recherche de droite pour sélectionner le visuel officiel...
                    </div>
                  )}
                  
                  {/* Panneau de configuration de quantité */}
                  <div className="w-full bg-slate-950/80 p-4 rounded-xl border border-slate-850 space-y-3 text-center">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Quantité désirée</label>
                    <div className="flex justify-center items-center gap-4">
                      <button onClick={() => setQuantiteEdition(Math.max(1, quantiteEdition - 1))} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold transition-all">-</button>
                      <span className="text-xl font-black text-white w-6">{quantiteEdition}</span>
                      <button onClick={() => setQuantiteEdition(Math.min(4, quantiteEdition + 1))} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold transition-all">+</button>
                    </div>
                    
                    {/* Les boutons d'actions s'adaptent selon le mode */}
                    <div className="flex gap-2 pt-2">
                      {!estUnAjoutPur ? (
                        <>
                          <button onClick={() => appliquerChangementCarteVisuel(carteEnCoursEdition)} className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-all">Enregistrer Ratio</button>
                          <button onClick={() => appliquerChangementCarteVisuel(null)} className="py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white font-bold text-xs transition-all">❌ Retirer</button>
                        </>
                      ) : (
                        <p className="text-[10px] text-slate-500 italic w-full">Trouve ta carte à droite pour l'injecter.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Colonne Droite : Moteur de Recherche Global */}
                <div className="flex-1 p-6 flex flex-col space-y-4 overflow-hidden">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                      {estUnAjoutPur ? "Chercher la carte à intégrer à votre collection" : "Chercher une carte pour remplacer celle de gauche"}
                    </label>
                    <input 
                      type="text"
                      value={rechercheTerme}
                      onChange={(e) => setRechercheTerme(e.target.value)}
                      placeholder="Tapez le nom d'un personnage, d'une action..."
                      className="w-full p-3.5 bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl text-sm outline-none font-medium text-slate-200"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto bg-slate-950/20 border border-slate-850 rounded-xl p-4">
                    {rechercheChargement ? (
                      <p className="text-center text-xs text-slate-500 py-12">Connexion à l'API Lorcana en cours...</p>
                    ) : resultatsRecherche.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {resultatsRecherche.map((card) => (
                          <div 
                            key={card.id}
                            onClick={() => appliquerChangementCarteVisuel(card)}
                            className="bg-slate-950 p-2 rounded-xl border border-slate-850 hover:border-purple-500 cursor-pointer flex flex-col justify-between group transition-all relative aspect-[3/4]"
                          >
                            <img src={card.image_uris?.digital?.normal} alt={card.name} className="w-full h-auto rounded-lg mb-1" />
                            <span className="text-[9px] font-bold text-slate-400 truncate text-center w-full">{card.name}</span>
                            <div className="absolute inset-0 bg-purple-900/20 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl transition-opacity">
                              <span className="bg-purple-600 text-[9px] font-black tracking-wider uppercase px-2 py-1 rounded-md shadow-md">
                                {estUnAjoutPur ? "➕ Injecter au deck" : "🔄 Remplacer"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-xs text-slate-600 py-12">
                        {rechercheTerme.trim().length < 2 ? "Entrez au moins 2 lettres pour lancer la recherche globale..." : "Aucune carte trouvée pour cette recherche."}
                      </p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

      </main>

      <footer className="w-full text-center py-4 text-xs text-slate-600">Lorcana Playbook Generator</footer>
    </div>
  )
}