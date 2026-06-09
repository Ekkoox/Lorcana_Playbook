import { useState, useEffect } from 'react'

export default function App() {
  const [pageActive, setPageActive] = useState('accueil')
  const [texteImport, setTexteImport] = useState('')
  const [nomDeck, setNomDeck] = useState('')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState('')
  
  // Index du deck qu'on est en train de regarder (0 pour le premier, 1 pour le deuxième, etc.)
  const [indexDeckActif, setIndexDeckActif] = useState(0)

  // 1. Initialisation : On récupère la liste de TOUS les decks
  const [listeDecks, setListeDecks] = useState(() => {
    const decksSauvegardes = localStorage.getItem('lorcana_playbook_tous_les_decks')
    return decksSauvegardes ? JSON.parse(decksSauvegardes) : []
  })

  // 2. Sauvegarde automatique de la liste complète dès qu'elle change
  useEffect(() => {
    localStorage.setItem('lorcana_playbook_tous_les_decks', JSON.stringify(listeDecks))
  }, [listeDecks])

  const gererImportDeck = async () => {
    if (!texteImport.trim()) return
    if (!nomDeck.trim()) {
      setErreur("Donne un nom à ton deck avant de l'importer !")
      return
    }
    
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
        } catch (err) {
          console.error(err)
        }
      }
    }

    if (deckTemporaire.length === 0) {
      setErreur("Aucune carte valide n'a été trouvée.")
    } else {
      // On crée le nouvel objet Deck
      const nouveauDeck = {
        id: Date.now().toString(), // Génère un ID unique basé sur l'heure
        nom: nomDeck.trim(),
        cartes: deckTemporaire
      }

      // On l'ajoute à notre liste existante
      const nouvelleListe = [nouveauDeck, ...listeDecks]
      setListeDecks(nouvelleListe)
      
      // On sélectionne ce nouveau deck pour l'afficher
      setIndexDeckActif(0)
      
      // Nettoyage des champs et redirection vers la gestion
      setTexteImport('')
      setNomDeck('')
      setPageActive('mes-decks')
    }
    setChargement(false)
  }

  const supprimerDeck = (idSupprime) => {
    if (window.confirm("Voulez-vous vraiment supprimer ce deck ?")) {
      const nouvelleListe = listeDecks.filter(d => d.id !== idSupprime)
      setListeDecks(nouvelleListe)
      setIndexDeckActif(0)
      if (nouvelleListe.length === 0) {
        setPageActive('accueil')
      }
    }
  }

  const deckAffiche = listeDecks[indexDeckActif]
  const totalCartesDuDeck = deckAffiche ? deckAffiche.cartes.reduce((total, c) => total + c.quantite, 0) : 0

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col justify-between">
      
      {/* BARRE DE NAVIGATION */}
      <header className="w-full px-6 py-6 flex justify-between items-center">
        <button 
          onClick={() => setPageActive('accueil')} 
          className="border border-slate-800 px-4 py-2 rounded-xl text-sm font-medium tracking-wide text-slate-300 hover:border-amber-500 hover:text-white transition-all"
        >
          Lorcana Playbook
        </button>

        <div className="flex gap-3">
          <button className="border border-slate-800 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:border-slate-500 transition-all">Langue</button>
          <button className="border border-slate-800 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:border-slate-500 transition-all">Connexion</button>
        </div>
      </header>

      {/* ZONE CENTRALE */}
      <main className="flex-1 flex flex-col justify-center items-center px-6 py-12 w-full">
        
        {/* VUE 1 : ACCUEIL */}
        {pageActive === 'accueil' && (
          <div className="text-center">
            <h1 className="text-6xl sm:text-8xl font-black tracking-tight mb-16 uppercase bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent">
              Lorcana Playbook
            </h1>

            <div className="flex flex-col sm:flex-row gap-6 justify-center w-full max-w-md sm:max-w-none mx-auto">
              <button 
                onClick={() => setPageActive('importer')}
                className="border-2 border-slate-800 px-10 py-5 rounded-xl text-xl font-bold tracking-wide hover:border-amber-500 hover:text-amber-400 shadow-lg transition-all active:scale-95"
              >
                Importer un deck
              </button>
              
              <button 
                onClick={() => {
                  if (listeDecks.length > 0) setPageActive('mes-decks')
                }}
                disabled={listeDecks.length === 0}
                className={`border-2 border-slate-800 px-10 py-5 rounded-xl text-xl font-bold tracking-wide transition-all active:scale-95 ${
                  listeDecks.length > 0 
                    ? 'hover:border-purple-500 hover:text-purple-400 cursor-pointer' 
                    : 'opacity-30 cursor-not-allowed'
                }`}
              >
                Mes decks ({listeDecks.length})
              </button>
            </div>
          </div>
        )}

        {/* VUE 2 : CRÉATION / IMPORTATION */}
        {pageActive === 'importer' && (
          <div className="w-full max-w-2xl space-y-6">
            <button onClick={() => setPageActive('accueil')} className="text-slate-400 hover:text-amber-400 text-sm mb-2">← Retour</button>

            <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-900 shadow-xl space-y-4">
              <h2 className="text-xl font-bold">Ajouter un nouveau deck à votre collection</h2>
              
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Nom de votre Deck</label>
                <input 
                  type="text"
                  value={nomDeck}
                  onChange={(e) => setNomDeck(e.target.value)}
                  placeholder="Ex: Sapphire Emerald Tempo V2"
                  className="w-full p-3 bg-slate-950 border border-slate-900 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Liste au format texte</label>
                <textarea
                  value={texteImport}
                  onChange={(e) => setTexteImport(e.target.value)}
                  placeholder="4 Cinderella - Dream Come True&#10;3 Ink Geyser"
                  className="w-full h-40 p-4 bg-slate-950 border border-slate-900 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-sm resize-none"
                />
              </div>

              <button
                onClick={gererImportDeck}
                disabled={chargement}
                className="w-full py-3.5 border border-amber-500/20 hover:border-amber-500 bg-amber-500/5 hover:bg-amber-500 hover:text-slate-950 text-amber-400 font-extrabold rounded-xl transition-all disabled:opacity-50 text-sm"
              >
                {chargement ? "Vérification des cartes..." : "Sauvegarder ce deck"}
              </button>
              {erreur && <p className="text-red-400 text-sm text-center">{erreur}</p>}
            </div>
          </div>
        )}

        {/* VUE 3 : INTERFACE DE GESTION MULTI-DECKS */}
        {pageActive === 'mes-decks' && deckAffiche && (
          <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-8 items-start">
            
            {/* Colonne de gauche : Sélecteur de Decks */}
            <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-900 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-2 mb-4">Vos Decks ({listeDecks.length})</h3>
              {listeDecks.map((deck, idx) => (
                <button
                  key={deck.id}
                  onClick={() => setIndexDeckActif(idx)}
                  className={`w-full text-left p-3 rounded-xl text-sm font-medium transition-all flex justify-between items-center ${
                    idx === indexDeckActif 
                      ? 'bg-purple-500/10 border border-purple-500 text-purple-400' 
                      : 'border border-transparent hover:bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="truncate mr-2">{deck.nom}</span>
                  <span className="text-xs opacity-60 bg-slate-950 px-2 py-0.5 rounded-full">
                    {deck.cartes.reduce((acc, c) => acc + c.quantite, 0)}
                  </span>
                </button>
              ))}
              <hr className="border-slate-900 my-4" />
              <button 
                onClick={() => setPageActive('importer')}
                className="w-full p-3 border border-dashed border-slate-800 hover:border-slate-600 rounded-xl text-xs text-center text-slate-400 hover:text-white font-semibold transition-all"
              >
                + Importer un autre deck
              </button>
            </div>

            {/* Zone de droite (Prend 3 colonnes) : Contenu du deck sélectionné */}
            <div className="md:grid-cols-1 md:col-span-3 space-y-6">
              <div className="flex justify-between items-center border-b border-slate-900 pb-4">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight">{deckAffiche.nom}</h2>
                  <p className="text-sm text-slate-500">Contient {totalCartesDuDeck} cartes</p>
                </div>
                <button 
                  onClick={() => supprimerDeck(deckAffiche.id)}
                  className="text-xs text-red-400 hover:text-red-500 border border-red-950 hover:border-red-500 px-3 py-1.5 rounded-lg transition-all"
                >
                  Supprimer ce deck
                </button>
              </div>

              {/* Grille des cartes du deck sélectionné */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {deckAffiche.cartes.map((carte) => (
                  <div key={carte.id} className="bg-slate-900/60 p-3 rounded-xl border border-slate-900 flex flex-col justify-between relative group hover:border-purple-500 transition-all">
                    <div className="absolute -top-2 -right-2 bg-purple-500 text-white font-black px-2 py-0.5 rounded-full text-xs shadow-md">
                      x{carte.quantite}
                    </div>
                    <img src={carte.image_uris?.digital?.normal} alt={carte.name} className="w-full h-auto rounded-lg shadow-md mb-2" loading="lazy" />
                    <h4 className="font-bold text-xs leading-tight text-slate-200 line-clamp-1">{carte.name}</h4>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  )
}