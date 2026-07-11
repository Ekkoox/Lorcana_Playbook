import { useState, useEffect, useRef } from 'react'
import html2canvas from 'html2canvas'
import imageHero from './assets/hero.png'
import { supabase } from './supabaseClient'
import { TRADS } from './traductions'
import {
  ENCRES,
  couleurEncre,
  degradeEncres,
  chargerCartesFr,
  normaliserTexte,
  imageFrDreamborn,
  urlImagePourExport,
  cleCarteFr,
  ENCRE_BLIND,
  estCartePromo,
  choisirImpressionsClassiques,
} from './lorcana'
import { PastilleEncre } from './composants/PastilleEncre'

export default function App() {

  const [pageActive, setPageActive] = useState('accueil')
  const [texteImport, setTexteImport] = useState('')
  const [nomDeck, setNomDeck] = useState('')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState('')
  const [indexDeckActif, setIndexDeckActif] = useState(0)

  const [langue, setLangue] = useState(() => localStorage.getItem('lorcana_playbook_langue') || 'fr')
  const t = (cleTexte) => TRADS[langue][cleTexte] || TRADS['fr'][cleTexte]

  const [carteEnCoursEdition, setCarteEnCoursEdition] = useState(null)
  const [estUnAjoutPur, setEstUnAjoutPur] = useState(false)
  const [rechercheTerme, setRechercheTerme] = useState('')
  const [resultatsRecherche, setResultatsRecherche] = useState([])
  const [quantiteEdition, setQuantiteEdition] = useState(4)
  const [rechercheChargement, setRechercheChargement] = useState(false)

  const [sousVuePlaybook, setSousVuePlaybook] = useState('menu')
  const [positionJoueur, setPositionJoueur] = useState('commence') // 'commence' ou 'second'
  const [adversaireEncres, setAdversaireEncres] = useState([])
  const [archetypeAdverse, setArchetypeAdverse] = useState('')
  const [lignesPlayTexte, setLignesPlayTexte] = useState('')
  const [mulliganCartes, setMulliganCartes] = useState(Array(7).fill(null))
  const [toursPlaybook, setToursPlaybook] = useState([
    { tour: 1, cartesOptimales: [], note: '' },
    { tour: 2, cartesOptimales: [], note: '' },
    { tour: 3, cartesOptimales: [], note: '' },
  ])
  const [tourPlaybookEnSelection, setTourPlaybookEnSelection] = useState(null)
  const [modaleIndexOuvert, setModaleIndexOuvert] = useState(null)
  const [derniereSauvegarde, setDerniereSauvegarde] = useState(null)
  const [exportImageEnCours, setExportImageEnCours] = useState(false)
  const refExportPlan = useRef(null)

  const carteNeutreMulligan = {
    id: 'neutral-mulligan',
    name: 'Encre',
    ink: 'Neutral',
    isNeutral: true,
  }

  const [listeDecks, setListeDecks] = useState(() => {
    const decksSauvegardes = localStorage.getItem('lorcana_playbook_tous_les_decks')
    return decksSauvegardes ? JSON.parse(decksSauvegardes) : []
  })

  const [strategies, setStrategies] = useState(() => {
    const stratSauvegardees = localStorage.getItem('lorcana_playbook_strategies')
    return stratSauvegardees ? JSON.parse(stratSauvegardees) : {}
  })

  useEffect(() => { localStorage.setItem('lorcana_playbook_tous_les_decks', JSON.stringify(listeDecks)) }, [listeDecks])
  useEffect(() => { localStorage.setItem('lorcana_playbook_strategies', JSON.stringify(strategies)) }, [strategies])
  useEffect(() => { localStorage.setItem('lorcana_playbook_langue', langue) }, [langue])

  // --- Connexion Discord + sauvegarde cloud (Supabase) ---
  const [session, setSession] = useState(null)
  const [donneesCloudPretes, setDonneesCloudPretes] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: abonnement } = supabase.auth.onAuthStateChange((_evenement, nouvelleSession) => {
      setSession(nouvelleSession)
      if (!nouvelleSession) setDonneesCloudPretes(false)
    })
    return () => abonnement.subscription.unsubscribe()
  }, [])

  // --- Profil & RGPD ---
  const [profilOuvert, setProfilOuvert] = useState(false)
  const [pseudoEdition, setPseudoEdition] = useState('')
  const [messageProfil, setMessageProfil] = useState('')

  const pseudoAffiche = session?.user
    ? (session.user.user_metadata?.pseudo_personnalise || session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Joueur')
    : ''

  const ouvrirProfil = () => {
    setPseudoEdition(pseudoAffiche)
    setMessageProfil('')
    setProfilOuvert(true)
  }

  const enregistrerPseudo = async () => {
    if (!supabase || !pseudoEdition.trim()) return
    const { data, error } = await supabase.auth.updateUser({
      data: { pseudo_personnalise: pseudoEdition.trim() },
    })
    if (error) { console.error(error); return }
    if (data?.user) setSession(s => (s ? { ...s, user: data.user } : s))
    setMessageProfil(t('pseudoEnregistre'))
  }

  // Droit à la portabilité : export JSON de toutes les données de l'utilisateur
  const exporterMesDonnees = () => {
    const donnees = {
      exporte_le: new Date().toISOString(),
      profil: {
        pseudo: pseudoAffiche,
        email: session?.user?.email || null,
        identifiant: session?.user?.id || null,
        compte_cree_le: session?.user?.created_at || null,
      },
      decks: listeDecks,
      strategies,
    }
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' })
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(blob)
    lien.download = 'loremasters-mes-donnees.json'
    lien.click()
    URL.revokeObjectURL(lien.href)
  }

  // Droit à l'effacement : suppression du compte + de toutes les données (cloud et locales)
  const supprimerMonCompte = async () => {
    if (!supabase || !session?.user) return
    if (!window.confirm(t('supprimerConfirme1'))) return
    if (!window.confirm(t('supprimerConfirme2'))) return
    const { error } = await supabase.rpc('supprimer_mon_compte')
    if (error) {
      console.error(error)
      alert(t('suppressionErreur'))
      return
    }
    localStorage.removeItem('lorcana_playbook_tous_les_decks')
    localStorage.removeItem('lorcana_playbook_strategies')
    setListeDecks([])
    setStrategies({})
    setProfilOuvert(false)
    setPageActive('accueil')
    await supabase.auth.signOut()
  }

  const seConnecterAvecDiscord = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: window.location.origin },
    })
    if (error) console.error('Connexion Discord impossible :', error)
  }

  const seDeconnecter = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  // Au login : on charge les données cloud ; à la toute première connexion,
  // on migre automatiquement ce qui existe déjà dans le navigateur.
  useEffect(() => {
    if (!supabase || !session?.user) return
    let annule = false
    const charger = async () => {
      const { data, error } = await supabase
        .from('donnees_utilisateur')
        .select('decks, strategies')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (annule) return
      if (error) { console.error('Chargement cloud impossible :', error); return }
      if (data) {
        setListeDecks(Array.isArray(data.decks) ? data.decks : [])
        setStrategies(data.strategies && typeof data.strategies === 'object' ? data.strategies : {})
        setIndexDeckActif(0)
      } else {
        const { error: erreurInsertion } = await supabase
          .from('donnees_utilisateur')
          .insert({ user_id: session.user.id, decks: listeDecks, strategies })
        if (erreurInsertion) { console.error('Migration locale vers le cloud impossible :', erreurInsertion); return }
      }
      if (!annule) setDonneesCloudPretes(true)
    }
    charger()
    return () => { annule = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  // Sauvegarde cloud automatique (debouncée) dès qu'un deck ou une stratégie change
  useEffect(() => {
    if (!supabase || !session?.user || !donneesCloudPretes) return
    const minuteur = setTimeout(async () => {
      const { error } = await supabase
        .from('donnees_utilisateur')
        .upsert({ user_id: session.user.id, decks: listeDecks, strategies, maj_le: new Date().toISOString() })
      if (error) console.error('Sauvegarde cloud impossible :', error)
    }, 1000)
    return () => clearTimeout(minuteur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listeDecks, strategies, session?.user?.id, donneesCloudPretes])

  // Dictionnaire des cartes françaises, chargé dès que le site passe en français
  const [cartesFr, setCartesFr] = useState(null)

  useEffect(() => {
    if (langue !== 'fr' || cartesFr) return
    let annule = false
    chargerCartesFr()
      .then(index => { if (!annule) setCartesFr(index) })
      .catch(err => console.error('Impossible de charger les données françaises des cartes :', err))
    return () => { annule = true }
  }, [langue, cartesFr])

  const trouverCarteFr = (carte) => {
    if (!cartesFr || !carte) return null
    const cle = cleCarteFr(carte)
    return cle ? (cartesFr.get(cle) || null) : null
  }

  useEffect(() => {
    const termeSaisi = rechercheTerme.trim()
    const delaiRecherche = setTimeout(async () => {
      if (termeSaisi.length < 2) {
        setResultatsRecherche([])
        setRechercheChargement(false)
        return
      }
      setRechercheChargement(true)
      let resultats = []
      try {
        const params = new URLSearchParams({ q: `name:"${termeSaisi}"`, unique: 'prints' })
        const reponse = await fetch(`https://api.lorcast.com/v0/cards/search?${params.toString()}`)
        if (reponse.ok) {
          const donnees = await reponse.json()
          const impressions = Array.isArray(donnees) ? donnees : (donnees.results || donnees.data || [])
          // Une seule carte par nom+version, impression classique de préférence (jamais promo)
          resultats = choisirImpressionsClassiques(impressions, normaliserTexte).filter(c => !estCartePromo(c))
        }
      } catch (err) { console.error(err) }

      // En français, on cherche aussi par nom français (LorcanaJSON),
      // puis on récupère la carte Lorcast équivalente (set + numéro) pour le deck.
      if (langue === 'fr' && cartesFr) {
        try {
          const terme = normaliserTexte(rechercheTerme)
          const clesPresentes = new Set(resultats.map(cleCarteFr).filter(Boolean))
          const correspondancesFr = []
          for (const [cle, carteFr] of cartesFr) {
            if (clesPresentes.has(cle)) continue
            if (normaliserTexte(carteFr.fullName).includes(terme) || normaliserTexte(carteFr.simpleName).includes(terme)) {
              correspondancesFr.push(carteFr)
              if (correspondancesFr.length >= 10) break
            }
          }
          const equivalentes = await Promise.all(correspondancesFr.map(async (carteFr) => {
            try {
              const rep = await fetch(`https://api.lorcast.com/v0/cards/${carteFr.setCode}/${carteFr.number}`)
              if (rep.ok) return await rep.json()
            } catch (err) { console.error(err) }
            return null
          }))
          const signatures = new Set(resultats.map(c => `${normaliserTexte(c.name)}|${normaliserTexte(c.version || '')}`))
          for (const carte of equivalentes) {
            if (!carte) continue
            const signature = `${normaliserTexte(carte.name)}|${normaliserTexte(carte.version || '')}`
            if (signatures.has(signature)) continue
            signatures.add(signature)
            resultats.push(carte)
          }
        } catch (err) { console.error(err) }
      }

      setResultatsRecherche(resultats.slice(0, 20))
      setRechercheChargement(false)
    }, termeSaisi.length < 2 ? 0 : 400)
    return () => clearTimeout(delaiRecherche)
  }, [rechercheTerme, langue, cartesFr])

  // Retrouve une carte Lorcast à partir d'un nom français exact (listes de deck en français)
  const chercherCarteViaNomFr = async (nomBrut) => {
    try {
      const index = await chargerCartesFr()
      const terme = normaliserTexte(nomBrut)
      for (const carteFr of index.values()) {
        if (normaliserTexte(carteFr.fullName) === terme || normaliserTexte(carteFr.simpleName) === terme) {
          const rep = await fetch(`https://api.lorcast.com/v0/cards/${carteFr.setCode}/${carteFr.number}`)
          if (rep.ok) return await rep.json()
        }
      }
    } catch (err) { console.error(err) }
    return null
  }

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
          const params = new URLSearchParams({ q: requeteAPI, unique: 'prints' })
          let reponse = await fetch(`https://api.lorcast.com/v0/cards/search?${params.toString()}`)
          if (!reponse.ok && nomBrut.includes(' - ')) {
            const paramsSecours = new URLSearchParams({ q: `name:"${nomBrut.split(' - ')[0].trim()}"`, unique: 'prints' })
            reponse = await fetch(`https://api.lorcast.com/v0/cards/search?${paramsSecours.toString()}`)
          }
          let carteTrouvee = null
          if (reponse.ok) {
            const donnees = await reponse.json()
            const impressions = Array.isArray(donnees) ? donnees : (donnees.results || donnees.data || [])
            // On importe uniquement l'impression classique (jamais les promos)
            const resultats = choisirImpressionsClassiques(impressions, normaliserTexte)
            carteTrouvee = resultats.find(c => !estCartePromo(c)) || resultats[0] || null
          }
          // Liste écrite avec des noms français ? On tente la correspondance FR.
          if (!carteTrouvee && langue === 'fr') {
            carteTrouvee = await chercherCarteViaNomFr(nomBrut)
          }
          if (carteTrouvee) {
            deckTemporaire.push({ ...carteTrouvee, quantite })
          }
        } catch (err) { console.error(err) }
      }
    }

    if (deckTemporaire.length === 0) {
      setErreur(t('erreurImport'))
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

    if (!estUnAjoutPur && carteEnCoursEdition) {
      cartesModifiees = cartesModifiees.filter(c => c.id !== carteEnCoursEdition.id)
    }

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
    setCarteEnCoursEdition(null)
    setEstUnAjoutPur(false)
    setRechercheTerme('')
    setResultatsRecherche([])
  }

  const ajusterQuantiteCarteDeck = (carteId, variation, e) => {
    e.stopPropagation()
    if (!deckAffiche) return

    const copieListeDecks = [...listeDecks]
    const cartesModifiees = deckAffiche.cartes
      .map(carte => {
        if (carte.id !== carteId) return carte
        return { ...carte, quantite: Math.max(0, (carte.quantite || 0) + variation) }
      })
      .filter(carte => carte.quantite > 0)

    copieListeDecks[indexDeckActif] = { ...deckAffiche, cartes: cartesModifiees }
    setListeDecks(copieListeDecks)
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
    return [...new Set(encrestrouvees)].filter(Boolean)
  }

  const deckAffiche = listeDecks[indexDeckActif]
  const totalCartesDuDeck = deckAffiche ? deckAffiche.cartes.reduce((total, c) => total + c.quantite, 0) : 0
  const encresMonDeck = extraireEncresDuDeck(deckAffiche)
  const cartesTrieesParCout = deckAffiche
    ? [...deckAffiche.cartes].sort((carteA, carteB) => {
        const coutA = Number.isFinite(Number(carteA.cost)) ? Number(carteA.cost) : 1
        const coutB = Number.isFinite(Number(carteB.cost)) ? Number(carteB.cost) : 1
        if (coutA !== coutB) return coutA - coutB
        return (carteA.name || '').localeCompare(carteB.name || '')
      })
    : []

  const regleNbCartesValide = totalCartesDuDeck >= 60
  const regleNbEncresValide = encresMonDeck.length <= 2
  const regleExemplairesValide = deckAffiche ? deckAffiche.cartes.every(c => c.quantite <= 4) : true
  const deckEstParfaitementValide = regleNbCartesValide && regleNbEncresValide && regleExemplairesValide

  const distributionCouts = (() => {
    const totaux = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, '7+': 0 }
    if (deckAffiche && deckAffiche.cartes) {
      deckAffiche.cartes.forEach(c => {
        const cost = c.cost || 1
        const qte = c.quantite || 0
        if (cost >= 7) {
          totaux['7+'] += qte
        } else {
          totaux[cost] += qte
        }
      })
    }
    return totaux
  })()
  
  const maxCartesSurUnCout = Math.max(...Object.values(distributionCouts), 1)

  const gererClicAdversaireEncre = (encreId) => {
    // « Blind » : bicolorité adverse inconnue — exclusif avec le choix des encres
    if (encreId === ENCRE_BLIND) {
      if (adversaireEncres.includes(ENCRE_BLIND)) {
        setAdversaireEncres([])
        setArchetypeAdverse('')
      } else {
        // En blind, pas d'archétype à saisir : on passe directement au choix de position
        setAdversaireEncres([ENCRE_BLIND])
        setArchetypeAdverse('Blind')
        setSousVuePlaybook('position')
      }
      return
    }
    if (adversaireEncres.includes(ENCRE_BLIND)) {
      setAdversaireEncres([encreId])
      setArchetypeAdverse('')
      return
    }
    if (adversaireEncres.includes(encreId)) {
      setAdversaireEncres(adversaireEncres.filter(id => id !== encreId))
      setArchetypeAdverse('')
    } else {
      if (adversaireEncres.length >= 2) return
      setAdversaireEncres([...adversaireEncres, encreId])
    }
  }

  const selectionAdverseValide = adversaireEncres.length === 2 || adversaireEncres.includes(ENCRE_BLIND)

  // FUSION : La clé est globale pour le Matchup, elle n'inclut plus la position
  const genererCleStrategie = (archetypeNom) => {
    if (!deckAffiche || !selectionAdverseValide) return ''
    const adversaireCle = [...adversaireEncres].sort().join('-')
    const nomSain = archetypeNom.replace(/\s+/g, '-').trim()
    return `${deckAffiche.id}_vs_${adversaireCle}__${nomSain}`
  }

  // Charger les données de la sous-position sélectionnée dans le même playbook
  const chargerDonneesPosition = (cleMatchup, position) => {
    const playbookGlobal = strategies[cleMatchup]
    const donneesPos = playbookGlobal?.positions?.[position]

    if (donneesPos) {
      setLignesPlayTexte(donneesPos.lignesPlay || '')
      setMulliganCartes(donneesPos.mulliganCartes || Array(7).fill(null))
      setToursPlaybook(normaliserToursPlaybook(donneesPos.toursPlaybook || [
        { tour: 1, cartesOptimales: [], note: '' },
        { tour: 2, cartesOptimales: [], note: '' },
        { tour: 3, cartesOptimales: [], note: '' },
      ]))
    } else {
      setLignesPlayTexte('')
      setMulliganCartes(Array(7).fill(null))
      setToursPlaybook(normaliserToursPlaybook([
        { tour: 1, cartesOptimales: [], note: '' },
        { tour: 2, cartesOptimales: [], note: '' },
        { tour: 3, cartesOptimales: [], note: '' },
      ]))
    }
  }

  const choisirPositionJoueur = (position) => {
    setPositionJoueur(position)
    const cle = genererCleStrategie(archetypeAdverse)
    if (cle) {
      chargerDonneesPosition(cle, position)
    }
    setSousVuePlaybook('creer')
  }

  // Synchronisation imbriquée dans le même Playbook — sauvegarde automatique
  // à chaque modification (le state est ensuite persisté en localStorage par l'effet dédié)
  const synchroniserStrategie = (nouvellesCartes, nouveauxToursPlaybook, nouveauxLignesPlay) => {
    const cle = genererCleStrategie(archetypeAdverse)
    if (!cle) return

    setStrategies(precedentes => {
      const playbookPreexistant = precedentes[cle] || {
        adversaireEncres: adversaireEncres,
        archetypeAdverse: archetypeAdverse,
        cleUnique: cle,
        positions: {}
      }

      return {
        ...precedentes,
        [cle]: {
          ...playbookPreexistant,
          positions: {
            ...playbookPreexistant.positions,
            [positionJoueur]: {
              mulliganCartes: nouvellesCartes,
              toursPlaybook: nouveauxToursPlaybook,
              lignesPlay: nouveauxLignesPlay,
            }
          }
        }
      }
    })
    // eslint-disable-next-line react-hooks/purity -- appelé uniquement depuis des gestionnaires d'événements
    setDerniereSauvegarde(Date.now())
  }

  const normaliserToursPlaybook = (tours) => {
    return [...tours].map((tour, index) => ({
      ...tour,
      tour: index + 1,
    }))
  }

  // Le séquenceur est plafonné à 10 tours : le tour 10 représente « 10 et plus »
  const MAX_TOURS_PLAYBOOK = 10
  const libelleTour = (numeroTour) => (numeroTour >= MAX_TOURS_PLAYBOOK ? `${MAX_TOURS_PLAYBOOK}+` : numeroTour)

  const ajouterTourPlaybook = () => {
    if (toursPlaybook.length >= MAX_TOURS_PLAYBOOK) return
    const toursOrdonnes = normaliserToursPlaybook(toursPlaybook)
    const nouveauxTours = [...toursOrdonnes, { tour: toursOrdonnes.length + 1, cartesOptimales: [], note: '' }]
    setToursPlaybook(nouveauxTours)
    synchroniserStrategie(mulliganCartes, nouveauxTours, lignesPlayTexte)
  }

  const resetSequencerPlaybook = () => {
    const toursParDefaut = [
      { tour: 1, cartesOptimales: [], note: '' },
      { tour: 2, cartesOptimales: [], note: '' },
      { tour: 3, cartesOptimales: [], note: '' },
    ]
    setToursPlaybook(toursParDefaut)
    synchroniserStrategie(mulliganCartes, toursParDefaut, lignesPlayTexte)
    setTourPlaybookEnSelection(null)
  }

  const deplacerTourPlaybook = (tourNumero, direction) => {
    const indexActuel = toursPlaybook.findIndex(tour => tour.tour === tourNumero)
    const indexCible = indexActuel + direction
    if (indexActuel === -1 || indexCible < 0 || indexCible >= toursPlaybook.length) return

    const toursEchanges = [...toursPlaybook]
    const temp = toursEchanges[indexActuel]
    toursEchanges[indexActuel] = toursEchanges[indexCible]
    toursEchanges[indexCible] = temp

    const toursRenumerotes = normaliserToursPlaybook(toursEchanges)
    setToursPlaybook(toursRenumerotes)
    synchroniserStrategie(mulliganCartes, toursRenumerotes, lignesPlayTexte)
  }

  const ouvrirSelectionCarteTour = (tourNumero) => {
    setTourPlaybookEnSelection(tourNumero)
  }

  const obtenirOccurencesCarteDansTours = (carteId) => {
    return toursPlaybook.reduce((total, tour) => {
      return total + (tour.cartesOptimales || []).filter(carte => carte?.id === carteId).length
    }, 0)
  }

  const ajouterCarteAuTourPlaybook = (tourNumero, carte) => {
    if (!carte || !deckAffiche) return

    const quantiteDansDeck = deckAffiche.cartes.find(c => c.id === carte.id)?.quantite || 0
    const quantiteDejaAffectee = obtenirOccurencesCarteDansTours(carte.id)

    if (quantiteDejaAffectee >= quantiteDansDeck) {
      alert("Toutes les copies de cette carte sont déjà utilisées dans les tours.")
      return
    }

    const nouveauxTours = toursPlaybook.map(tour => {
      if (tour.tour !== tourNumero) return tour
      return {
        ...tour,
        cartesOptimales: [...(tour.cartesOptimales || []), carte],
      }
    })

    setToursPlaybook(nouveauxTours)
    synchroniserStrategie(mulliganCartes, nouveauxTours, lignesPlayTexte)
    setTourPlaybookEnSelection(null)
  }

  const retirerCarteDuTourPlaybook = (tourNumero, carteId) => {
    const nouveauxTours = toursPlaybook.map(tour => {
      if (tour.tour !== tourNumero) return tour
      const indexCarte = (tour.cartesOptimales || []).findIndex(carte => carte?.id === carteId)
      if (indexCarte === -1) return tour
      const cartesOptimales = [...tour.cartesOptimales]
      cartesOptimales.splice(indexCarte, 1)
      return { ...tour, cartesOptimales }
    })

    setToursPlaybook(nouveauxTours)
    synchroniserStrategie(mulliganCartes, nouveauxTours, lignesPlayTexte)
  }

  const retirerTourPlaybook = (tourASupprimer) => {
    const nouveauxTours = normaliserToursPlaybook(toursPlaybook.filter(tour => tour.tour !== tourASupprimer))
    setToursPlaybook(nouveauxTours)
    synchroniserStrategie(mulliganCartes, nouveauxTours, lignesPlayTexte)
  }

  const modifierNoteTourPlaybook = (tourASModifier, nouvelleNote) => {
    const nouveauxTours = toursPlaybook.map(tour => (
      tour.tour === tourASModifier ? { ...tour, note: nouvelleNote } : tour
    ))
    setToursPlaybook(nouveauxTours)
    synchroniserStrategie(mulliganCartes, nouveauxTours, lignesPlayTexte)
  }

  const selectionnerCarteMulligan = (carte) => {
    const copieMulligan = [...mulliganCartes]
    if (carte === null) {
      copieMulligan[modaleIndexOuvert] = null
    } else if (carte.isNeutral || carte.id === 'neutral-mulligan') {
      copieMulligan[modaleIndexOuvert] = carteNeutreMulligan
    } else {
      const quantiteDansDeck = deckAffiche?.cartes.find(c => c.id === carte.id)?.quantite || 0
      const occurencesDansMulligan = copieMulligan.filter((c, index) => index !== modaleIndexOuvert && c && c.id === carte.id).length
      if (occurencesDansMulligan >= quantiteDansDeck) {
        alert("Tu as déjà mis toutes les copies disponibles de cette carte dans le mulligan !")
        return
      }
      const occurences = copieMulligan.filter(c => c && c.id === carte.id).length
      if (occurences >= 4) {
        alert("Règle des 4 exemplaires maximum atteinte pour cette carte !")
        return
      }
      copieMulligan[modaleIndexOuvert] = carte
    }
    setMulliganCartes(copieMulligan)
    synchroniserStrategie(copieMulligan, toursPlaybook, lignesPlayTexte)
    setModaleIndexOuvert(null)
  }

  const resetMulliganPlaybook = () => {
    const mulliganVide = Array(7).fill(null)
    setMulliganCartes(mulliganVide)
    synchroniserStrategie(mulliganVide, toursPlaybook, lignesPlayTexte)
    setModaleIndexOuvert(null)
  }

  const sauvegarderEtFermerPlaybook = () => {
    setAdversaireEncres([])
    setArchetypeAdverse('')
    setLignesPlayTexte('')
    setMulliganCartes(Array(7).fill(null))
    setToursPlaybook([
      { tour: 1, cartesOptimales: [], note: '' },
      { tour: 2, cartesOptimales: [], note: '' },
      { tour: 3, cartesOptimales: [], note: '' },
    ])
    setSousVuePlaybook('menu')
    setTourPlaybookEnSelection(null)
    setDerniereSauvegarde(null)
  }

  // --- Export du plan de jeu en image PNG partageable ---
  const telechargerImagePlan = () => {
    if (!exportImageEnCours) setExportImageEnCours(true)
  }

  useEffect(() => {
    if (!exportImageEnCours || !refExportPlan.current) return
    let annule = false

    const generer = async () => {
      try {
        // On attend que toutes les images du rendu d'export soient chargées (ou en échec).
        // Deux passes : la seconde couvre les images de repli chargées après un onError.
        const attendreImages = () => Promise.all(
          Array.from(refExportPlan.current.querySelectorAll('img')).map(img => new Promise(resoudre => {
            if (img.complete) return resoudre()
            img.addEventListener('load', resoudre, { once: true })
            img.addEventListener('error', resoudre, { once: true })
            setTimeout(resoudre, 5000)
          }))
        )
        await attendreImages()
        await new Promise(resoudre => setTimeout(resoudre, 300))
        await attendreImages()
        if (annule) return

        const canvas = await html2canvas(refExportPlan.current, {
          useCORS: true,
          backgroundColor: '#020617',
          scale: 2,
          logging: false,
        })
        if (annule) return

        const nomFichier = `plan-${deckAffiche?.nom || 'deck'}-vs-${archetypeAdverse || 'adversaire'}-${positionJoueur}`
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-').toLowerCase()
        const lien = document.createElement('a')
        lien.download = `${nomFichier}.png`
        lien.href = canvas.toDataURL('image/png')
        lien.click()
      } catch (err) {
        console.error('Export image du plan impossible :', err)
        alert(t('exportErreur'))
      }
      if (!annule) setExportImageEnCours(false)
    }

    generer()
    return () => { annule = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportImageEnCours])

  const playbooksExistants = (() => {
    if (!deckAffiche || !strategies) return []
    return Object.keys(strategies)
      .filter(cle => cle.startsWith(`${deckAffiche.id}_vs_`))
      .map(cle => strategies[cle])
      .filter(p => p && p.adversaireEncres && p.archetypeAdverse)
  })()

  const extraireInfosCarteLocale = (carte) => {
    if (!carte) return { name: '', image: '' }
    if (carte.isNeutral || carte.id === 'neutral-mulligan') {
      return {
        name: langue === 'fr' ? 'Encre' : 'Ink',
        image: ''
      }
    }
    const imageAnglaise = carte.image_uris?.digital?.normal
    if (langue === 'fr') {
      const carteFr = trouverCarteFr(carte)
      return {
        name: carteFr?.fullName || carte.name,
        // LorcanaJSON d'abord ; sinon Dreamborn (sets trop récents) ; sinon l'anglais
        image: carteFr?.images?.thumbnail || carteFr?.images?.full || imageFrDreamborn(carte) || imageAnglaise,
        imageSecours: imageAnglaise
      }
    }
    return {
      name: carte.name,
      image: imageAnglaise
    }
  }

  // Si une image française de secours (Dreamborn) n'existe pas (404), on repasse en anglais
  const gererErreurImage = (e, imageSecours) => {
    if (imageSecours && e.currentTarget.src !== imageSecours) {
      e.currentTarget.src = imageSecours
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col justify-between relative overflow-x-clip">

      {/* HALOS D'AMBIANCE : teintés par les encres du deck actif (et du deck adverse en matchup) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute w-[45rem] h-[45rem] rounded-full blur-[160px] opacity-[0.08] -top-40 -left-40 transition-colors duration-1000"
          style={{ backgroundColor: couleurEncre(encresMonDeck[0] || 'Amber') }}
        />
        <div
          className="absolute w-[45rem] h-[45rem] rounded-full blur-[160px] opacity-[0.08] -bottom-40 -right-40 transition-colors duration-1000"
          style={{ backgroundColor: couleurEncre(adversaireEncres[0] || encresMonDeck[1] || 'Amethyst') }}
        />
      </div>

      {/* Grain de papier par-dessus le fond */}
      <div className="texture-bruit" aria-hidden="true" />

      {/* BARRE DE NAVIGATION */}
      <header className="w-full px-6 py-4 flex justify-between items-center sticky top-0 z-40 bg-slate-950/70 backdrop-blur-md border-b border-white/5">
        <button
          onClick={() => { setPageActive('accueil'); setAdversaireEncres([]); setArchetypeAdverse(''); setCarteEnCoursEdition(null) }}
          className="flex items-center gap-3 group"
        >
          <svg className="w-7 h-7 -rotate-6 group-hover:rotate-0 transition-transform" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <defs>
              <linearGradient id="plumeOr" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fde68a" />
                <stop offset="0.55" stopColor="#f59e0b" />
                <stop offset="1" stopColor="#b45309" />
              </linearGradient>
            </defs>
            <g stroke="url(#plumeOr)">
              <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
              <path d="M16 8 2 22" />
              <path d="M17.5 15H9" />
            </g>
          </svg>
          <span className="font-display font-bold text-xl tracking-wide text-slate-100 group-hover:text-amber-300 transition-colors">{t('accueilTitre')}</span>
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => setLangue(langue === 'fr' ? 'en' : 'fr')}
            className="btn-ghost px-4 py-2 rounded-xl text-sm font-bold"
          >
            {t('langueBouton')}
          </button>
          {supabase && (
            session?.user ? (
              <div className="flex items-center gap-2">
                <button onClick={ouvrirProfil} className="flex items-center gap-2 btn-ghost px-3 py-2 rounded-xl" title={t('profilTitre')}>
                  {session.user.user_metadata?.avatar_url && (
                    <img src={session.user.user_metadata.avatar_url} alt="" className="w-6 h-6 rounded-full border border-white/20" />
                  )}
                  <span className="text-sm font-bold text-slate-200 max-w-32 truncate">{pseudoAffiche}</span>
                </button>
                <button onClick={seDeconnecter} className="btn-ghost px-3 py-2 rounded-xl text-sm font-medium" title={t('deconnexion')}>
                  ⏻
                </button>
              </div>
            ) : (
              <button onClick={seConnecterAvecDiscord} className="btn-ghost px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                {t('connexion')}
              </button>
            )
          )}
        </div>
      </header>

      {/* ZONE CENTRALE */}
      <main className="flex-1 flex flex-col justify-center items-center px-6 py-12 w-full relative">
        
        {pageActive === 'accueil' && (
          <div className="text-center relative w-full max-w-4xl animate-fadeIn">
            {/* Image hero en fond, fondue dans la nuit */}
            <div
              className="absolute inset-x-0 -top-24 h-[28rem] pointer-events-none opacity-40"
              style={{
                backgroundImage: `url(${imageHero})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center 30%',
                maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 75%)',
                WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 75%)',
              }}
              aria-hidden="true"
            />
            <div className="relative">
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-400/90 mb-6">{langue === 'fr' ? 'Ton grimoire de stratégie Lorcana' : 'Your Lorcana strategy grimoire'}</p>
              <h1 className="font-display text-6xl sm:text-8xl font-black tracking-tight titre-dore pb-4">{t('accueilTitre')}</h1>
              <hr className="filet-dore w-56 mx-auto my-8" />
              <p className="text-slate-400 max-w-xl mx-auto mb-12 text-sm sm:text-base leading-relaxed">
                {langue === 'fr'
                  ? 'Importe tes decks, prépare tes mulligans et déroule tes plans de jeu matchup par matchup.'
                  : 'Import your decks, plan your mulligans and map out your game plans matchup by matchup.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-5 justify-center w-full max-w-md sm:max-w-none mx-auto">
                <button onClick={() => setPageActive('importer')} className="btn-or px-10 py-4 rounded-2xl text-lg tracking-wide">{t('boutonImporter')}</button>
                <button
                  onClick={() => { if (listeDecks.length > 0) setPageActive('mes-decks') }}
                  disabled={listeDecks.length === 0}
                  className={`btn-ghost px-10 py-4 rounded-2xl text-lg font-bold tracking-wide ${listeDecks.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  {t('boutonMesDecks')} ({listeDecks.length})
                </button>
              </div>
            </div>
          </div>
        )}

        {pageActive === 'importer' && (
          <div className="w-full max-w-2xl space-y-6">
            <button onClick={() => setPageActive('accueil')} className="text-slate-400 hover:text-amber-400 text-sm mb-2">Retour</button>
            <div className="panneau p-6 rounded-2xl space-y-4">
              <h2 className="text-xl font-bold">{t('nouveauDeckTitre')}</h2>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{t('nomDeckLabel')}</label>
                <input type="text" value={nomDeck} onChange={(e) => setNomDeck(e.target.value)} placeholder="Ex: Sapphire Emerald Tempo" className="w-full p-3 bg-slate-950 border border-slate-900 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{t('listeTexteLabel')}</label>
                <textarea value={texteImport} onChange={(e) => setTexteImport(e.target.value)} placeholder="4 Cinderella - Dream Come True&#10;3 Ink Geyser" className="w-full h-40 p-4 bg-slate-950 border border-slate-900 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-sm resize-none" />
              </div>
              <button onClick={gererImportDeck} disabled={chargement} className="w-full py-3.5 btn-or rounded-xl text-sm">{chargement ? "..." : t('boutonAjouterDeck')}</button>
              {erreur && <p className="text-red-400 text-sm text-center">{erreur}</p>}
            </div>
          </div>
        )}

        {pageActive === 'mes-decks' && deckAffiche && (
          <div className="w-full max-w-[1500px] grid grid-cols-1 md:grid-cols-4 gap-8 items-start">
            
            <div className="space-y-6">
              <div className="panneau p-4 rounded-2xl space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-2 mb-4">{t('vosDecks')} ({listeDecks.length})</h3>
                {listeDecks.map((deck, idx) => {
                  const encresDuBouton = extraireEncresDuDeck(deck)
                  return (
                    <button 
                      key={deck.id} 
                      onClick={() => { setIndexDeckActif(idx); setAdversaireEncres([]); setArchetypeAdverse(''); setCarteEnCoursEdition(null) }} 
                      className={`w-full text-left p-3 rounded-xl text-sm font-medium transition-all flex justify-between items-center ${idx === indexDeckActif ? 'bg-purple-500/10 border border-purple-500 text-purple-400' : 'border border-transparent hover:bg-slate-900 text-slate-400 hover:text-slate-200'}`}
                      style={idx === indexDeckActif ? { background: degradeEncres(encresDuBouton, 90, '1f') } : undefined}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div className="flex gap-1 shrink-0 bg-slate-950/60 p-1 rounded-md">
                          {encresDuBouton.map(encreId => (
                            <PastilleEncre key={encreId} id={encreId} taille="w-2.5 h-2.5" langue={langue} />
                          ))}
                        </div>
                        <span className="truncate">{deck.nom}</span>
                      </div>
                      <span className="text-xs opacity-60 bg-slate-950 px-2 py-0.5 rounded-full">{deck.cartes.reduce((acc, c) => acc + c.quantite, 0)}</span>
                    </button>
                  )
                })}
                <hr className="border-slate-900 my-4" />
                <button onClick={() => setPageActive('importer')} className="w-full p-3 border border-dashed border-slate-800 hover:border-slate-600 rounded-xl text-xs text-center text-slate-400 hover:text-white font-semibold transition-all">{t('importAutre')}</button>
              </div>

              <div className="panneau p-4 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('reglesTitre')}</h4>
                  <span className={`w-2.5 h-2.5 rounded-full ${deckEstParfaitementValide ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40">
                    <span className="text-slate-400">{t('regleCartes')}</span>
                    <span className={`font-bold ${regleNbCartesValide ? 'text-emerald-400' : 'text-amber-500'}`}>{totalCartesDuDeck}/60</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40">
                    <span className="text-slate-400">{t('regleEncres')}</span>
                    <span className={`font-bold ${regleNbEncresValide ? 'text-emerald-400' : 'text-red-400'}`}>{encresMonDeck.length}/2</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40">
                    <span className="text-slate-400">{t('regleMaxExemplaires')}</span>
                    <span className={`font-bold ${regleExemplairesValide ? 'text-emerald-400' : 'text-red-400'}`}>{regleExemplairesValide ? 'OK' : 'Exonéré'}</span>
                  </div>
                </div>
              </div>

              <div className="panneau p-4 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('manaCurve')}</h4>
                <div className="flex items-end justify-between pt-6 px-1 h-28 bg-slate-950/40 rounded-xl border border-slate-900">
                  {Object.entries(distributionCouts).map(([cout, quantite]) => {
                    const hauteurPourcent = (quantite / maxCartesSurUnCout) * 100
                    return (
                      <div key={cout} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                        <div className="absolute -top-7 scale-0 group-hover:scale-100 bg-slate-900 border border-slate-800 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xl transition-all z-20 pointer-events-none text-amber-400">
                          {quantite}
                        </div>
                        <div 
                          style={{ height: `${Math.max(hauteurPourcent, quantite > 0 ? 8 : 2)}%` }} 
                          className={`w-4/5 rounded-t-sm transition-all duration-500 ${quantite > 0 ? 'bg-linear-to-t from-purple-600 to-indigo-400 group-hover:to-indigo-300' : 'bg-slate-900'}`}
                        />
                        <span className="text-[10px] text-slate-500 font-bold mt-1.5">
                          {cout}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="md:grid-cols-1 md:col-span-3 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-900 pb-4 gap-4">
                <div>
                  <h2 className="text-3xl font-display font-extrabold tracking-tight">{deckAffiche.nom}</h2>
                  <div className="h-1 w-24 rounded-full mt-2" style={{ background: degradeEncres(encresMonDeck, 90) }} />
                  <p className="text-sm text-slate-500 flex items-center gap-2 flex-wrap">
                    <span>{t('contient')} {totalCartesDuDeck} {t('cartes')} — {t('encres')} :</span>
                    {encresMonDeck.map(id => <PastilleEncre key={id} id={id} taille="w-3.5 h-3.5" langue={langue} />)}
                    <span>{encresMonDeck.map(id => ENCRES.find(e => e.id === id)?.nom[langue] || id).join(' / ')}</span>
                  </p>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button onClick={() => { setSousVuePlaybook('menu'); setPageActive('playbook') }} className="flex-1 sm:flex-none btn-or px-6 py-2.5 rounded-xl text-sm">{t('plansJeu')}</button>
                  <button onClick={() => supprimerDeck(deckAffiche.id)} className="text-xs text-red-400 hover:text-red-500 border border-red-950 hover:border-red-500 px-3 py-2 rounded-xl transition-all">{t('supprimer')}</button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-fadeIn">
                {cartesTrieesParCout.map((carte) => {
                  const { name, image, imageSecours } = extraireInfosCarteLocale(carte)
                  const couleurEncre = ENCRES.find(e => e.id === carte.ink)
                  return (
                    <div 
                      key={carte.id} 
                      onClick={() => { setCarteEnCoursEdition(carte); setQuantiteEdition(carte.quantite); setEstUnAjoutPur(false) }}
                      className={`bg-slate-900/60 p-3 rounded-xl border ${couleurEncre ? couleurEncre.border + '/20' : 'border-slate-900'} hover:border-amber-500/40 cursor-pointer flex flex-col justify-between relative group transition-all`}
                    >
                      <div className="absolute -top-2 -right-2 bg-purple-500 text-white font-black px-2 py-0.5 rounded-full text-xs shadow-md">x{carte.quantite}</div>
                      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                        <button
                          type="button"
                          onClick={(e) => ajusterQuantiteCarteDeck(carte.id, -1, e)}
                          className="pointer-events-auto w-8 h-8 rounded-lg bg-slate-950/90 border border-red-500/30 text-red-400 font-black text-sm shadow-lg hover:bg-red-500 hover:text-white transition-all"
                          title="Retirer 1"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={(e) => ajusterQuantiteCarteDeck(carte.id, 1, e)}
                          className="pointer-events-auto w-8 h-8 rounded-lg bg-slate-950/90 border border-emerald-500/30 text-emerald-400 font-black text-sm shadow-lg hover:bg-emerald-500 hover:text-slate-950 transition-all"
                          title="Ajouter 1"
                        >
                          +
                        </button>
                      </div>
                      <img src={image} alt={name} onError={(e) => gererErreurImage(e, imageSecours)} className="w-full h-auto rounded-lg shadow-md mb-2" loading="lazy" />
                      <h4 className="font-bold text-xs leading-tight text-slate-200 line-clamp-1">{name}</h4>
                      <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                        <span className="bg-slate-950/90 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400">{t('modifierListe')}</span>
                      </div>
                    </div>
                  )
                })}

                <button
                  onClick={() => { setCarteEnCoursEdition({ name: "Nouvelle Carte", image_uris: { digital: { normal: "" } } }); setQuantiteEdition(4); setEstUnAjoutPur(true) }}
                  className="w-full bg-slate-900/20 hover:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-800 hover:border-amber-500/40 flex flex-col justify-center items-center gap-2 text-slate-500 hover:text-amber-400 transition-all p-6 min-h-55 group"
                >
                  <span className="text-3xl font-light group-hover:scale-110 transition-transform">+</span>
                  <span className="text-xs font-bold uppercase tracking-wider">{t('ajouterCarte')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VUE 4 : PLAYBOOK STRATÉGIQUE */}
        {pageActive === 'playbook' && deckAffiche && (
          <div className="w-full max-w-[1500px] space-y-8 animate-fadeIn">
            <button onClick={() => { setPageActive('mes-decks'); setAdversaireEncres([]); setArchetypeAdverse('') }} className="text-slate-400 hover:text-amber-400 text-sm">{t('retourDecks')}</button>

            <div className="panneau p-6 rounded-2xl space-y-6">
              
              {/* SOUS-VUE A : LA BIBLIOTHÈQUE DES MATCHUPS UNIQUE */}
              {sousVuePlaybook === 'menu' && (
                <div className="space-y-6 py-4 animate-fadeIn">
                  <div className="text-center">
                    <span className="text-xs font-bold uppercase tracking-widest text-purple-400">{t('biblioTactique')}</span>
                    <h2 className="text-4xl font-display font-black mt-2">Playbook : {deckAffiche.nom}</h2>
                    <p className="text-sm text-slate-400 mt-2">{t('hubDesc')}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto pt-6">
                    {playbooksExistants.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setAdversaireEncres(p.adversaireEncres)
                          setArchetypeAdverse(p.archetypeAdverse)
                          // On envoie d'abord vers la sélection de position
                          setSousVuePlaybook('position')
                        }}
                        className="p-5 bg-slate-900/90 border border-slate-800 rounded-xl hover:border-purple-500 text-left transition-all group flex flex-col justify-between shadow-md relative overflow-hidden"
                      >
                        {/* Liseré coloré aux encres du deck adverse */}
                        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: degradeEncres(p.adversaireEncres || [], 90) }} />
                        <div className="absolute inset-0 pointer-events-none" style={{ background: degradeEncres(p.adversaireEncres || [], 135, '14') }} />
                        <div className="flex justify-between items-center w-full">
                          <span className="text-xs font-bold uppercase text-slate-500 group-hover:text-purple-400">{t('modifierPlan')} #{idx+1}</span>
                          <div className="flex gap-1.5 bg-slate-950/60 px-2 py-1 rounded-lg border border-slate-800/40">
                            {p.adversaireEncres?.map(encreId => (
                              <PastilleEncre key={encreId} id={encreId} taille="w-3.5 h-3.5" langue={langue} />
                            ))}
                          </div>
                          <button onClick={(e) => supprimerPlaybook(p.cleUnique, e)} className="text-slate-500 hover:text-red-400 p-1 rounded-lg hover:bg-slate-950 transition-colors z-10" title="Supprimer">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                        <span className="text-lg font-extrabold text-slate-100 mt-3 group-hover:text-purple-300 transition-colors">
                          vs {p.adversaireEncres?.map(id => ENCRES.find(e => e.id === id)?.nom[langue] || id).join(' / ')}
                        </span>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-sm font-medium text-purple-400 italic">
                            {p.archetypeAdverse === 'Blind'
                              ? <span className="text-slate-300 font-semibold">{langue === 'fr' ? 'Bicolorité inconnue' : 'Unknown inks'}</span>
                              : <>{t('archetype')} : <span className="text-slate-300 font-semibold">{p.archetypeAdverse}</span></>}
                          </span>
                          <span className="text-[10px] bg-slate-950 px-2 py-1 rounded-md text-slate-500 font-bold border border-slate-850">
                            {Object.keys(p.positions || {}).length} configurations
                          </span>
                        </div>
                      </button>
                    ))}

                    <button onClick={() => { setAdversaireEncres([]); setArchetypeAdverse(''); setLignesPlayTexte(''); setMulliganCartes(Array(7).fill(null)); setSousVuePlaybook('setup-matchup') }} className="p-5 border-2 border-dashed border-slate-800 hover:border-amber-500 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-amber-400 transition-all font-bold gap-2 min-h-35">
                      Ajouter {t('creerNouvelleStrat')}
                    </button>
                  </div>
                </div>
              )}

              {/* SOUS-VUE B : CRÉATION INIT DE L'ARCHÉTYPE ADVERSE */}
              {sousVuePlaybook === 'setup-matchup' && (
                <div className="space-y-6 animate-fadeIn">
                  <button onClick={() => setSousVuePlaybook('menu')} className="text-xs text-purple-400 hover:underline">{t('retourIndex')}</button>
                  <div className="text-center">
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-500">{t('configTactique')}</span>
                    <h2 className="text-2xl font-display font-black mt-1">{t('feuilleMatch')} : {deckAffiche.nom}</h2>
                  </div>

                  <div className="border-t border-slate-900 pt-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 text-center mb-4">{t('choixBicolo')}</h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-7">
                      {ENCRES.map((encre) => {
                        const estSelectionnee = adversaireEncres.includes(encre.id)
                        return (
                          <button
                            key={encre.id}
                            onClick={() => gererClicAdversaireEncre(encre.id)}
                            className={`p-3 rounded-xl font-bold transition-all text-xs ${encre.color} ${encre.text} ${estSelectionnee ? 'ring-2 ring-white/80 scale-105 opacity-100' : 'opacity-40 hover:opacity-80'}`}
                            style={estSelectionnee ? { boxShadow: `0 0 24px ${encre.hex}cc` } : undefined}
                          >
                            {encre.nom[langue]}
                          </button>
                        )
                      })}
                      {/* Matchup à l'aveugle : la bicolorité adverse est inconnue */}
                      <button
                        onClick={() => gererClicAdversaireEncre(ENCRE_BLIND)}
                        className={`p-3 rounded-xl font-bold transition-all text-xs bg-slate-900 text-slate-200 border-2 border-dashed ${adversaireEncres.includes(ENCRE_BLIND) ? 'border-white/80 ring-2 ring-white/60 scale-105 opacity-100' : 'border-slate-600 opacity-50 hover:opacity-90'}`}
                        title={langue === 'fr' ? 'Deck adverse inconnu' : 'Unknown opponent deck'}
                      >
                        Blind
                      </button>
                    </div>
                  </div>

                  {selectionAdverseValide && !adversaireEncres.includes(ENCRE_BLIND) && (
                    <div className="border-t border-slate-900 pt-6 space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 text-center">{t('choixArchetype')}</h3>
                      <div className="max-w-md mx-auto">
                        <input 
                          type="text" 
                          value={archetypeAdverse} 
                          onChange={(e) => setArchetypeAdverse(e.target.value)} 
                          onKeyDown={(e) => { if(e.key === 'Enter' && archetypeAdverse.trim() !== '') setSousVuePlaybook('position') }}
                          placeholder={t('placeholderArchetype')} 
                          className="w-full text-center p-3 bg-slate-950 border border-slate-900 rounded-xl text-slate-200 focus:outline-none focus:border-purple-500 font-medium text-sm" 
                        />
                      </div>
                      {archetypeAdverse.trim() !== '' && (
                        <div className="flex justify-center pt-2">
                          <button onClick={() => setSousVuePlaybook('position')} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider">Étape Suivante</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SOUS-VUE C : LE HUB DE POSITION (COMMENCE OU SECOND) */}
              {sousVuePlaybook === 'position' && (
                <div className="space-y-6 py-4 animate-fadeIn">
                  <button onClick={() => setSousVuePlaybook('menu')} className="text-xs text-purple-400 hover:underline">{t('retourIndex')}</button>
                  <div className="text-center">
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-500">Configuration Tactique</span>
                    <h2 className="text-2xl font-display font-black mt-1 flex items-center justify-center gap-2 flex-wrap">
                      <span>vs</span>
                      {adversaireEncres.map(id => <PastilleEncre key={id} id={id} taille="w-5 h-5" langue={langue} />)}
                      <span>{adversaireEncres.map(id => ENCRES.find(e => e.id === id)?.nom[langue] || id).join(' / ')}{archetypeAdverse !== 'Blind' ? ` (${archetypeAdverse})` : ''}</span>
                    </h2>
                    <p className="text-sm text-slate-400 mt-2">{t('choixPositionTour')}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto pt-6">
                    <button
                      onClick={() => choisirPositionJoueur('commence')}
                      className="p-5 rounded-xl border border-slate-800 bg-slate-900/90 text-slate-300 hover:border-amber-500 transition-all group flex flex-col justify-between"
                    >
                      <div>
                        <span className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Position 1</span>
                        <span className="text-xl font-black group-hover:text-amber-400 transition-colors">{t('joueurCommence')}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-4 italic">
                        {strategies[genererCleStrategie(archetypeAdverse)]?.positions?.commence ? 'Modifiable (Déjà configuré)' : 'Vide (À configurer)'}
                      </span>
                    </button>

                    <button
                      onClick={() => choisirPositionJoueur('second')}
                      className="p-5 rounded-xl border border-slate-800 bg-slate-900/90 text-slate-300 hover:border-purple-500 transition-all group flex flex-col justify-between"
                    >
                      <div>
                        <span className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Position 2</span>
                        <span className="text-xl font-black group-hover:text-purple-400 transition-colors">{t('joueurSecond')}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-4 italic">
                        {strategies[genererCleStrategie(archetypeAdverse)]?.positions?.second ? 'Modifiable (Déjà configuré)' : 'Vide (À configurer)'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* SOUS-VUE D : LE SEQCUNCEUR ET MULLIGAN PROPREMENT DITS */}
              {sousVuePlaybook === 'creer' && <div className="space-y-6 animate-fadeIn">
                  <button onClick={() => { setSousVuePlaybook('position'); setTourPlaybookEnSelection(null) }} className="text-xs text-purple-400 hover:underline">Changer de position (Retour)</button>
                  <div className="text-center">
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-500">Séquenceur stratégique</span>
                    <h2 className="text-2xl font-display font-black mt-1">Mode : {positionJoueur === 'second' ? t('joueurSecond') : t('joueurCommence')}</h2>
                  </div>

                  <div className="border-t border-slate-900 pt-6 space-y-8 animate-fadeIn">
                    {/* BANDEAU VS BICOLORE : mes encres à gauche, encres adverses à droite */}
                    <div className="relative flex items-stretch rounded-2xl overflow-hidden border border-slate-800 bg-slate-950/70 shadow-xl">
                      <div
                        className="flex-1 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-center gap-3 text-center sm:text-left"
                        style={{ background: `linear-gradient(115deg, ${couleurEncre(encresMonDeck[0])}38 0%, ${couleurEncre(encresMonDeck[1] || encresMonDeck[0])}22 60%, transparent 100%)` }}
                      >
                        <div className="flex gap-1.5">
                          {encresMonDeck.map(id => <PastilleEncre key={id} id={id} langue={langue} />)}
                        </div>
                        <div>
                          <p className="font-black text-white leading-tight">{deckAffiche.nom}</p>
                          <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-0.5">
                            {encresMonDeck.map(id => ENCRES.find(e => e.id === id)?.nom[langue] || id).join(' / ')} — {positionJoueur === 'second' ? t('joueurSecond') : t('joueurCommence')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center px-1 sm:px-3 z-10">
                        <span className="font-black italic text-sm sm:text-base bg-slate-950 border border-slate-700 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-slate-200 shadow-[0_0_18px_rgba(0,0,0,0.8)]">VS</span>
                      </div>

                      <div
                        className="flex-1 p-4 sm:p-5 flex flex-col sm:flex-row-reverse items-center justify-center gap-3 text-center sm:text-right"
                        style={{ background: `linear-gradient(245deg, ${couleurEncre(adversaireEncres[0])}52 0%, ${couleurEncre(adversaireEncres[1] || adversaireEncres[0])}33 60%, transparent 100%)` }}
                      >
                        <div className="flex gap-1.5">
                          {adversaireEncres.map(id => <PastilleEncre key={id} id={id} taille="w-5 h-5" langue={langue} />)}
                        </div>
                        <div>
                          <p className="font-black text-white leading-tight">{archetypeAdverse}</p>
                          <p className="text-[10px] uppercase tracking-widest text-slate-300 mt-0.5">
                            {adversaireEncres.includes(ENCRE_BLIND)
                              ? (langue === 'fr' ? 'Bicolorité inconnue' : 'Unknown inks')
                              : adversaireEncres.map(id => ENCRES.find(e => e.id === id)?.nom[langue] || id).join(' / ')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wider">{t('mulliganOptimal')}</h4>
                        <button
                          type="button"
                          onClick={resetMulliganPlaybook}
                          className="text-xs bg-slate-900/60 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 text-slate-300 hover:text-red-300 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Reset mulligan
                        </button>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                        {mulliganCartes.map((carte, index) => {
                          const infosMulligan = extraireInfosCarteLocale(carte)
                          return (
                            <button key={index} onClick={() => setModaleIndexOuvert(index)} className="w-full aspect-3/4 bg-slate-950/80 rounded-xl border-2 border-dashed border-slate-800 hover:border-amber-500/50 flex flex-col justify-center items-center transition-all p-1 relative overflow-hidden group">
                              {carte?.isNeutral ? (
                                <div className="w-full h-full rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center gap-3 text-center px-2">
                                  <div className="w-12 h-12 rounded-full border border-slate-700 bg-slate-950 flex items-center justify-center">
                                    <span className="w-4 h-4 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 shadow-md" />
                                  </div>
                                  <div className="space-y-1">
                                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-300">{langue === 'fr' ? 'Encre' : 'Ink'}</span>
                                    <span className="block text-[9px] text-slate-500">{langue === 'fr' ? 'Marque encre uniquement' : 'Ink mark only'}</span>
                                  </div>
                                </div>
                              ) : carte ? (
                                <>
                                  <img src={infosMulligan.image} alt={infosMulligan.name} onError={(e) => gererErreurImage(e, infosMulligan.imageSecours)} className="w-full h-full object-cover rounded-lg" />
                                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-red-400">{langue === 'fr' ? 'Modifier' : 'Edit'}</div>
                                </>
                              ) : <span className="text-2xl text-slate-600 font-light group-hover:text-amber-400 transition-colors">+</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="space-y-4 border-t border-slate-900 pt-6">
                      <div className="flex justify-between items-center gap-3 flex-wrap">
                        <h4 className="font-bold text-purple-400 text-xs uppercase tracking-wider">
                          Séquenceur de Jeu Tour par Tour
                        </h4>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={resetSequencerPlaybook}
                            className="text-xs bg-slate-900/60 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 text-slate-300 hover:text-red-300 px-3 py-1.5 rounded-lg transition-all"
                          >
                            Reset séquenceur
                          </button>
                          <button
                            onClick={ajouterTourPlaybook}
                            disabled={toursPlaybook.length >= MAX_TOURS_PLAYBOOK}
                            className="text-xs bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-purple-900/40"
                            title={toursPlaybook.length >= MAX_TOURS_PLAYBOOK ? (langue === 'fr' ? 'Maximum 10 tours (le tour 10 couvre les tours suivants)' : 'Maximum 10 turns (turn 10 covers later turns)') : undefined}
                          >
                            + Ajouter un Tour
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4 max-h-125 overflow-y-auto pr-2 custom-scrollbar">
                        {toursPlaybook.map((tourData) => (
                          <div key={tourData.tour} className="bg-slate-950/40 border border-slate-900 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-start md:items-center relative group hover:border-purple-500/20 transition-all">
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="w-12 h-12 rounded-xl bg-purple-600/10 border border-purple-500/30 flex flex-col items-center justify-center text-center">
                                <span className="text-[10px] text-purple-400 uppercase font-bold leading-none">Tour</span>
                                <span className="text-lg font-black text-white">{libelleTour(tourData.tour)}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  onClick={() => deplacerTourPlaybook(tourData.tour, -1)}
                                  disabled={tourData.tour === 1}
                                  className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-purple-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Monter ce tour"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deplacerTourPlaybook(tourData.tour, 1)}
                                  disabled={tourData.tour === toursPlaybook.length}
                                  className="w-8 h-8 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-purple-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Descendre ce tour"
                                >
                                  ↓
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-4 items-center min-w-70">
                              {(tourData.cartesOptimales || []).map((carteTour, indexCarteTour) => {
                                const infosTour = extraireInfosCarteLocale(carteTour)
                                return (
                                  <div
                                    key={`${tourData.tour}-${carteTour?.id || indexCarteTour}`}
                                    onClick={() => retirerCarteDuTourPlaybook(tourData.tour, carteTour.id)}
                                      className="h-32 xl:h-44 aspect-3/4 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden relative group/card cursor-pointer"
                                  >
                                    <div className="absolute inset-0 bg-red-900/80 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity text-[9px] font-bold text-white">
                                      Retirer
                                    </div>
                                    {infosTour.image ? (
                                      <img src={infosTour.image} alt={infosTour.name} onError={(e) => gererErreurImage(e, infosTour.imageSecours)} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-500">Vide</div>
                                    )}
                                    <span className="text-[8px] absolute bottom-1 left-0 right-0 text-center bg-black/60 truncate px-1">{infosTour.name || 'Carte'}</span>
                                  </div>
                                )
                              })}

                              <button
                                onClick={() => ouvrirSelectionCarteTour(tourData.tour)}
                                className="h-32 xl:h-44 aspect-3/4 border-2 border-dashed border-slate-850 hover:border-purple-500/40 rounded-lg flex items-center justify-center text-slate-600 hover:text-purple-400 transition-colors text-3xl font-light"
                                title="Lier une carte clé à ce tour"
                              >
                                +
                              </button>
                            </div>

                            <div className="flex-1 w-full">
                              <input
                                type="text"
                                value={tourData.note}
                                onChange={(e) => modifierNoteTourPlaybook(tourData.tour, e.target.value)}
                                placeholder="Objectif de ce tour (ex: Développer le board, Lore à fond...)"
                                className="w-full bg-slate-950/60 border border-slate-900 focus:border-purple-500/50 rounded-lg p-2.5 text-xs text-slate-300 outline-none transition-all"
                              />
                            </div>

                            <button
                              onClick={() => retirerTourPlaybook(tourData.tour)}
                              className="md:absolute md:top-4 md:right-4 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all text-xs"
                            >
                              Supprimer
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="pt-4 flex justify-between items-center gap-4 flex-wrap">
                      <span className="text-[11px] text-slate-500 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${derniereSauvegarde ? 'bg-emerald-500' : 'bg-slate-600'} ${derniereSauvegarde ? 'animate-pulse' : ''}`} />
                        {derniereSauvegarde
                          ? `${t('sauvegardeA')} ${new Date(derniereSauvegarde).toLocaleTimeString(langue === 'fr' ? 'fr-FR' : 'en-GB')}`
                          : t('sauvegardeAuto')}
                      </span>
                      <div className="flex gap-3 flex-wrap">
                        <button
                          onClick={telechargerImagePlan}
                          disabled={exportImageEnCours}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-wait text-white font-bold px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg"
                        >
                          {exportImageEnCours ? t('exportEnCours') : `📸 ${t('exporterImage')}`}
                        </button>
                        <button onClick={sauvegarderEtFermerPlaybook} className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg">{t('enregistrerFermer')}</button>
                      </div>
                    </div>
                  </div>
                </div>}
            </div>
          </div>
        )}

        {/* RENDU HORS ÉCRAN POUR L'EXPORT IMAGE DU PLAN (styles inline uniquement : html2canvas ne supporte pas les couleurs oklch de Tailwind v4) */}
        {exportImageEnCours && deckAffiche && (
          <div style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
            {/* Police Arial : html2canvas décale le texte vers le bas avec les polices système (system-ui) sur macOS */}
            <div ref={refExportPlan} style={{ width: '1500px', padding: '48px', backgroundColor: '#020617', color: '#f1f5f9', fontFamily: 'Arial, Helvetica, sans-serif' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                <span style={{ fontSize: '14px', letterSpacing: '4px', textTransform: 'uppercase', color: '#f59e0b', fontWeight: 800 }}>Loremasters — {t('feuilleMatch')}</span>
                <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>{positionJoueur === 'second' ? t('joueurSecond') : t('joueurCommence')}</span>
              </div>

              {/* Bandeau VS */}
              <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: '20px', overflow: 'hidden', border: '1px solid #1e293b', backgroundColor: '#0b1120', marginBottom: '36px' }}>
                <div style={{ flex: 1, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: '14px', background: `linear-gradient(115deg, ${couleurEncre(encresMonDeck[0])}40 0%, ${couleurEncre(encresMonDeck[1] || encresMonDeck[0])}26 60%, rgba(0,0,0,0) 100%)` }}>
                  <span style={{ display: 'flex', gap: '6px' }}>
                    {encresMonDeck.map(id => <span key={id} style={{ width: '18px', height: '18px', borderRadius: '9999px', backgroundColor: couleurEncre(id), border: '1px solid rgba(255,255,255,0.45)', display: 'inline-block' }} />)}
                  </span>
                  <span>
                    <span style={{ display: 'block', fontWeight: 900, fontSize: '26px', lineHeight: 1.1 }}>{deckAffiche.nom}</span>
                    <span style={{ display: 'block', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '3px', color: '#94a3b8', marginTop: '4px' }}>{encresMonDeck.map(id => ENCRES.find(e => e.id === id)?.nom[langue] || id).join(' / ')}</span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px' }}>
                  {/* Centrage par line-height : html2canvas rend mal align-items sur du texte */}
                  <span style={{ fontWeight: 900, fontStyle: 'italic', fontSize: '16px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '9999px', width: '56px', height: '56px', lineHeight: '54px', textAlign: 'center', display: 'block' }}>VS</span>
                </div>
                <div style={{ flex: 1, padding: '24px 28px', display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: '14px', textAlign: 'right', background: `linear-gradient(245deg, ${couleurEncre(adversaireEncres[0])}52 0%, ${couleurEncre(adversaireEncres[1] || adversaireEncres[0])}33 60%, rgba(0,0,0,0) 100%)` }}>
                  <span style={{ display: 'flex', gap: '6px' }}>
                    {adversaireEncres.map(id => <span key={id} style={{ width: '18px', height: '18px', borderRadius: '9999px', backgroundColor: couleurEncre(id), border: '1px solid rgba(255,255,255,0.45)', display: 'inline-block' }} />)}
                  </span>
                  <span>
                    <span style={{ display: 'block', fontWeight: 900, fontSize: '26px', lineHeight: 1.1 }}>{archetypeAdverse}</span>
                    <span style={{ display: 'block', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '3px', color: '#cbd5e1', marginTop: '4px' }}>{adversaireEncres.includes(ENCRE_BLIND) ? (langue === 'fr' ? 'Bicolorité inconnue' : 'Unknown inks') : adversaireEncres.map(id => ENCRES.find(e => e.id === id)?.nom[langue] || id).join(' / ')}</span>
                  </span>
                </div>
              </div>

              {/* Mulligan optimal */}
              <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '3px', color: '#f59e0b', marginBottom: '14px' }}>{t('mulliganOptimal')}</div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '40px' }}>
                {mulliganCartes.map((carte, index) => {
                  const infos = extraireInfosCarteLocale(carte)
                  return (
                    <div key={index} style={{ width: '186px', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#0f172a', border: carte ? '1px solid #1e293b' : '2px dashed #1e293b', padding: '8px', textAlign: 'center' }}>
                      {carte && infos.image ? (
                        <>
                          <img
                            src={urlImagePourExport(infos.image)}
                            alt={infos.name}
                            data-secours={urlImagePourExport(infos.imageSecours) || ''}
                            onError={(e) => { const secours = e.currentTarget.dataset.secours; if (secours && e.currentTarget.src !== secours) e.currentTarget.src = secours }}
                            style={{ width: '100%', display: 'block', borderRadius: '8px' }}
                          />
                          <div style={{ fontSize: '11px', lineHeight: '15px', height: '21px', fontWeight: 700, color: '#94a3b8', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{infos.name}</div>
                        </>
                      ) : (
                        <div style={{ height: '236px', lineHeight: '236px', textAlign: 'center', color: carte?.isNeutral ? '#f59e0b' : '#334155', fontWeight: 800, fontSize: carte?.isNeutral ? '14px' : '24px', textTransform: 'uppercase', letterSpacing: '2px' }}>
                          {carte?.isNeutral ? (langue === 'fr' ? 'Encre' : 'Ink') : '—'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Séquenceur tour par tour */}
              <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '3px', color: '#a78bfa', marginBottom: '14px' }}>Séquenceur de Jeu Tour par Tour</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {toursPlaybook.map((tourData) => (
                  <div key={tourData.tour} style={{ display: 'flex', alignItems: 'center', gap: '18px', backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px 20px' }}>
                    {/* Centrage par line-height : html2canvas rend mal les flex centrés verticalement */}
                    <div style={{ width: '64px', height: '64px', borderRadius: '12px', backgroundColor: 'rgba(147,51,234,0.12)', border: '1px solid rgba(147,51,234,0.4)', flexShrink: 0, textAlign: 'center', paddingTop: '11px', boxSizing: 'border-box' }}>
                      <span style={{ display: 'block', fontSize: '10px', lineHeight: '14px', color: '#a78bfa', textTransform: 'uppercase', fontWeight: 800 }}>Tour</span>
                      <span style={{ display: 'block', fontSize: '22px', lineHeight: '26px', fontWeight: 900 }}>{libelleTour(tourData.tour)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                      {(tourData.cartesOptimales || []).map((carteTour, indexCarteTour) => {
                        const infosTour = extraireInfosCarteLocale(carteTour)
                        return infosTour.image ? (
                          <img
                            key={indexCarteTour}
                            src={urlImagePourExport(infosTour.image)}
                            alt={infosTour.name}
                            data-secours={urlImagePourExport(infosTour.imageSecours) || ''}
                            onError={(e) => { const secours = e.currentTarget.dataset.secours; if (secours && e.currentTarget.src !== secours) e.currentTarget.src = secours }}
                            style={{ height: '150px', width: 'auto', borderRadius: '8px', display: 'block' }}
                          />
                        ) : (
                          <div key={indexCarteTour} style={{ height: '150px', width: '108px', lineHeight: '148px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#f59e0b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
                            {langue === 'fr' ? 'Encre' : 'Ink'}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ flex: 1, fontSize: '15px', color: tourData.note ? '#e2e8f0' : '#475569', fontStyle: tourData.note ? 'normal' : 'italic' }}>
                      {tourData.note || '—'}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '36px', textAlign: 'center', fontSize: '12px', color: '#475569', fontWeight: 600 }}>Lormasters by Ekkox</div>
            </div>
          </div>
        )}

        {/* MODALE PROFIL & DONNÉES PERSONNELLES (RGPD) */}
        {profilOuvert && session?.user && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
            <div className="panneau bg-slate-950/90 rounded-2xl w-full max-w-lg flex flex-col overflow-hidden shadow-2xl">
              <div className="p-5 border-b border-white/5 flex justify-between items-center">
                <h3 className="font-display font-bold text-lg text-amber-400">{t('profilTitre')}</h3>
                <button onClick={() => setProfilOuvert(false)} className="btn-ghost text-sm font-bold px-4 py-2 rounded-xl">{t('fermer')}</button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-4">
                  {session.user.user_metadata?.avatar_url && (
                    <img src={session.user.user_metadata.avatar_url} alt="" className="w-14 h-14 rounded-full border border-white/20" />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-slate-100 truncate">{pseudoAffiche}</p>
                    <p className="text-xs text-slate-500 truncate">{session.user.email}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">{t('pseudoLabel')}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pseudoEdition}
                      onChange={(e) => { setPseudoEdition(e.target.value); setMessageProfil('') }}
                      maxLength={32}
                      className="flex-1 p-3 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-sm outline-none text-slate-200"
                    />
                    <button onClick={enregistrerPseudo} disabled={!pseudoEdition.trim()} className="btn-or px-5 rounded-xl text-sm">{t('enregistrerProfil')}</button>
                  </div>
                  <p className="text-[11px] text-slate-500">{t('pseudoAide')}</p>
                  {messageProfil && <p className="text-xs text-emerald-400 font-bold">{messageProfil}</p>}
                </div>

                <hr className="filet-dore" />

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('rgpdTitre')}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{t('rgpdTexte')}</p>
                  <button onClick={exporterMesDonnees} className="w-full btn-ghost px-4 py-3 rounded-xl text-sm font-bold">
                    ⬇ {t('exporterDonnees')}
                  </button>
                  <button onClick={supprimerMonCompte} className="w-full px-4 py-3 rounded-xl text-sm font-bold border border-red-900/60 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 transition-all">
                    {t('supprimerCompte')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODALE RECHERCHE DE CARTES POUR LE MULLIGAN */}
        {modaleIndexOuvert !== null && deckAffiche && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
                <h3 className="font-bold text-base">{t('emplacement')} #{modaleIndexOuvert + 1}</h3>
                <button onClick={() => setModaleIndexOuvert(null)} className="text-slate-400 hover:text-white font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-xl transition-all">{t('fermer')}</button>
              </div>
              <div className="p-6 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 bg-slate-900/60">
                <button onClick={() => selectionnerCarteMulligan(carteNeutreMulligan)} className="bg-slate-950 rounded-xl border border-slate-800 hover:border-amber-500 text-amber-400 p-4 font-bold text-xs flex flex-col justify-center items-center aspect-3/4 transition-all">
                  <div className="w-12 h-12 rounded-full border border-slate-700 bg-slate-900 flex items-center justify-center mb-3">
                    <span className="w-4 h-4 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 shadow-md" />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-slate-300">{langue === 'fr' ? 'Encre' : 'Ink'}</span>
                </button>
                <button onClick={() => selectionnerCarteMulligan(null)} className="bg-slate-950 rounded-xl border border-dashed border-red-900/50 hover:border-red-500 text-red-400 p-4 font-bold text-xs flex flex-col justify-center items-center aspect-3/4 transition-all">{t('viderEmplacement')}</button>
                {cartesTrieesParCout.map((carte) => {
                  const itemMulligan = extraireInfosCarteLocale(carte)
                  return (
                    <button key={carte.id} onClick={() => selectionnerCarteMulligan(carte)} className="bg-slate-950 p-2 rounded-xl border border-slate-800 hover:border-purple-500 flex flex-col justify-between items-center transition-all text-left relative group aspect-3/4">
                      <img src={itemMulligan.image} alt={itemMulligan.name} onError={(e) => gererErreurImage(e, itemMulligan.imageSecours)} className="w-full h-auto rounded-lg shadow-md mb-1" />
                      <span className="text-[10px] font-bold text-slate-400 truncate w-full text-center">{itemMulligan.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* MODALE SELECTION DE CARTES POUR LE SÉQUENCEUR */}
        {tourPlaybookEnSelection !== null && deckAffiche && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
                <h3 className="font-bold text-base">Ajouter une carte au Tour #{libelleTour(tourPlaybookEnSelection)}</h3>
                <button onClick={() => setTourPlaybookEnSelection(null)} className="text-slate-400 hover:text-white font-bold text-sm bg-slate-800 px-3 py-1.5 rounded-xl transition-all">{t('fermer')}</button>
              </div>
              <div className="p-6 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 flex-1 bg-slate-900/60">
                {cartesTrieesParCout.map((carte) => {
                  const infosCarte = extraireInfosCarteLocale(carte)
                  const dejaUtilisee = obtenirOccurencesCarteDansTours(carte.id) >= (deckAffiche.cartes.find(c => c.id === carte.id)?.quantite || 0)
                  return (
                    <button
                      key={carte.id}
                      onClick={() => ajouterCarteAuTourPlaybook(tourPlaybookEnSelection, carte)}
                      disabled={dejaUtilisee}
                      className={`bg-slate-950 p-2 rounded-xl border border-slate-800 flex flex-col justify-between items-center transition-all text-left relative group aspect-3/4 ${dejaUtilisee ? 'opacity-30 cursor-not-allowed' : 'hover:border-purple-500 cursor-pointer'}`}
                    >
                      <img src={infosCarte.image} alt={infosCarte.name} onError={(e) => gererErreurImage(e, infosCarte.imageSecours)} className="w-full h-auto rounded-lg shadow-md mb-1" />
                      <span className="text-[10px] font-bold text-slate-400 truncate w-full text-center">{infosCarte.name}</span>
                      <div className="absolute inset-0 bg-purple-900/20 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl transition-opacity">
                        <span className="bg-purple-600 text-[9px] font-black tracking-wider uppercase px-2 py-1 rounded-md shadow-md">
                          Ajouter
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* MODALE GESTIONNAIRE DE CARTE VISUEL */}
        {carteEnCoursEdition !== null && deckAffiche && (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl xl:max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
              
              <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
                <div>
                  <h3 className="font-extrabold text-lg text-amber-400">
                    {estUnAjoutPur ? t('ajouterCarte') : t('gestionRatio')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{t('modifDesc')}</p>
                </div>
                <button onClick={() => { setCarteEnCoursEdition(null); setEstUnAjoutPur(false); setRechercheTerme(''); setResultatsRecherche([]) }} className="bg-slate-800 hover:bg-slate-700 text-sm font-bold px-4 py-2 rounded-xl transition-all">{t('fermer')}</button>
              </div>

              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                
                <div className="w-full md:w-1/3 p-6 bg-slate-950/30 border-r border-slate-800 flex flex-col items-center justify-between gap-4 overflow-y-auto">
                  <div className="text-center space-y-2">
                    <span className="text-[10px] font-bold bg-purple-500/10 border border-purple-500/30 text-purple-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {estUnAjoutPur ? t('selectionDroite') : t('cibleEdition')}
                    </span>
                    <h4 className="font-bold text-sm leading-tight text-slate-100">{extraireInfosCarteLocale(carteEnCoursEdition).name || carteEnCoursEdition.name}</h4>
                  </div>
                  
                  {extraireInfosCarteLocale(carteEnCoursEdition).image ? (
                    <img src={extraireInfosCarteLocale(carteEnCoursEdition).image} alt={carteEnCoursEdition.name} onError={(e) => gererErreurImage(e, extraireInfosCarteLocale(carteEnCoursEdition).imageSecours)} className="w-48 h-auto rounded-xl shadow-2xl border border-slate-800" />
                  ) : (
                    <div className="w-48 aspect-3/4 bg-slate-950 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-center p-4 text-xs text-slate-600 font-semibold italic">
                      {t('visuelApi')}
                    </div>
                  )}
                  
                  <div className="w-full bg-slate-950/80 p-4 rounded-xl border border-slate-850 space-y-3 text-center">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">{t('quantiteDesiree')}</label>
                    <div className="flex justify-center items-center gap-4">
                      <button onClick={() => setQuantiteEdition(Math.max(1, quantiteEdition - 1))} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold transition-all">-</button>
                      <span className="text-xl font-black text-white w-6">{quantiteEdition}</span>
                      <button onClick={() => setQuantiteEdition(Math.min(4, quantiteEdition + 1))} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold transition-all">+</button>
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      {!estUnAjoutPur ? (
                        <>
                          <button onClick={() => appliquerChangementCarteVisuel(carteEnCoursEdition)} className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-all">{t('enregistrerRatio')}</button>
                          <button onClick={() => appliquerChangementCarteVisuel(null)} className="py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white font-bold text-xs transition-all">{t('retirer')}</button>
                        </>
                      ) : (
                        <p className="text-[10px] text-slate-500 italic w-full">{langue === 'fr' ? 'Sélectionnez une carte à droite...' : 'Select a card on the right...'}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-6 flex flex-col space-y-4 overflow-hidden">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">{t('consigneRecherche')}</label>
                    <input type="text" value={rechercheTerme} onChange={(e) => setRechercheTerme(e.target.value)} placeholder={t('placeholderRecherche')} className="w-full p-3.5 bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl text-sm outline-none font-medium text-slate-200" />
                  </div>

                  <div className="flex-1 overflow-y-auto bg-slate-950/20 border border-slate-850 rounded-xl p-4">
                    {rechercheChargement ? (
                      <p className="text-center text-xs text-slate-500 py-12">{t('apiConnexion')}</p>
                    ) : resultatsRecherche.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                        {resultatsRecherche.map((card) => {
                          const resultLocale = extraireInfosCarteLocale(card)
                          return (
                            <div key={card.id} onClick={() => appliquerChangementCarteVisuel(card)} className="bg-slate-950 p-2 rounded-xl border border-slate-850 hover:border-purple-500 cursor-pointer flex flex-col justify-between group transition-all relative aspect-3/4">
                              <img src={resultLocale.image} alt={resultLocale.name} onError={(e) => gererErreurImage(e, resultLocale.imageSecours)} className="w-full h-auto rounded-lg mb-1" />
                              <span className="text-[9px] font-bold text-slate-400 truncate text-center w-full">{resultLocale.name}</span>
                              <div className="absolute inset-0 bg-purple-900/20 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl transition-opacity">
                                <span className="bg-purple-600 text-[9px] font-black tracking-wider uppercase px-2 py-1 rounded-md shadow-md">
                                  {estUnAjoutPur ? t('injecter') : t('remplacer')}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-center text-xs text-slate-600 py-12">
                        {rechercheTerme.trim().length < 2 ? t('rechercheConsigneVide') : t('aucunResultat')}
                      </p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

      </main>

      <footer className="w-full py-6">
        <hr className="filet-dore w-40 mx-auto mb-4" />
        <p className="text-center text-xs text-slate-500 font-display italic tracking-wider">Loremasters <span className="text-slate-600">by Ekkox</span></p>
      </footer>
    </div>
  )
}