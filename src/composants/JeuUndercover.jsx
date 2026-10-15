import { useMemo, useState } from 'react'

// « Undercover » adapté à Lorcana, en jeu de table sur un seul appareil.
//
// Principe : tous les joueurs reçoivent la même carte, sauf un ou deux
// « undercover » qui reçoivent une AUTRE version du même personnage — assez
// proche pour que la différence ne saute pas aux yeux. Le « Mr White »
// optionnel n'a aucune carte et doit improviser.
//
// Chacun décrit sa carte en une phrase, puis le groupe vote. Les civils
// gagnent s'ils démasquent tous les infiltrés ; les infiltrés gagnent dès
// qu'ils sont aussi nombreux que les civils restants.

const JOUEURS_MIN = 3
const JOUEURS_MAX = 12

const melanger = (tableau) => {
  const copie = [...tableau]
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copie[i], copie[j]] = [copie[j], copie[i]]
  }
  return copie
}

const auHasard = (tableau) => tableau[Math.floor(Math.random() * tableau.length)]

// Déclarée hors du composant : une fonction définie pendant le rendu
// recréerait un composant à chaque passage et perdrait son état.
const VignetteCarte = ({ carte, taille = 'w-44', libelleMrWhite }) => (
  carte ? (
    <div className="text-center space-y-2">
      <img
        src={carte.images.thumbnail}
        alt={carte.fullName}
        className={`${taille} rounded-xl border border-white/15 shadow-2xl mx-auto`}
      />
      <p className="text-xs font-bold text-slate-300 max-w-[12rem] mx-auto leading-tight">{carte.fullName}</p>
    </div>
  ) : (
    <div className={`${taille} aspect-[5/7] rounded-xl border-2 border-dashed border-violet-500/40 bg-violet-500/5 flex items-center justify-center mx-auto`}>
      <span className="text-violet-300 font-display font-bold text-sm px-3 text-center">{libelleMrWhite}</span>
    </div>
  )
)

export default function JeuUndercover({ langue, t, cartesFr, onFermer }) {
  // Groupes de cartes partageant le même personnage : « Mickey Mouse - Brave
  // petit tailleur » et « Mickey Mouse - Détective » forment une paire idéale.
  // Trois façons d'apparier les deux cartes, de la plus subtile à la plus large.
  // On les propose toutes pour éviter la lassitude : avec le seul mode
  // « même personnage », chaque partie ressemblait à la précédente.
  const familles = useMemo(() => {
    if (!cartesFr) return { personnage: [], film: [], couleurCout: [] }

    // Dédoublonnage par nom complet : les réimpressions figurent plusieurs fois
    // dans les données (Ariel - Collectionneuse intrépide y est trois fois), et
    // sans cela civils et undercover pouvaient recevoir la carte identique.
    const uniques = new Map()
    for (const carte of cartesFr.values()) {
      const nomComplet = String(carte?.fullName || '')
      if (!nomComplet || !carte?.images?.thumbnail || !carte?.name) continue
      if (!uniques.has(nomComplet)) uniques.set(nomComplet, carte)
    }
    const cartes = [...uniques.values()]

    const regrouper = (cle) => {
      const groupes = new Map()
      for (const carte of cartes) {
        const valeur = cle(carte)
        if (!valeur) continue
        if (!groupes.has(valeur)) groupes.set(valeur, [])
        groupes.get(valeur).push(carte)
      }
      return groupes
    }

    // Même personnage : deux versions du même nom (« Mufasa - Souverain du
    // Rocher des Lions » contre « Mufasa - Roi de la Terre des Lions »)
    const personnage = [...regrouper(c => c.name).values()].filter(g => g.length >= 2)

    // Même film, personnage différent : Ariel contre Ursula. Il faut au moins
    // deux personnages distincts, sinon on retombe sur le mode précédent.
    const film = [...regrouper(c => c.story).values()]
      .filter(groupe => new Set(groupe.map(c => c.name)).size >= 2)

    // Même couleur, même coût, même type : parenté de jeu plutôt que d'univers
    const couleurCout = [...regrouper(c => (c.color && c.cost != null && c.type ? `${c.color}|${c.cost}|${c.type}` : null)).values()]
      .filter(groupe => new Set(groupe.map(c => c.name)).size >= 2)

    return { personnage, film, couleurCout }
  }, [cartesFr])

  // Tire deux cartes d'une même famille. Pour « film » et « couleurCout » on
  // impose deux personnages différents, sinon le tirage reviendrait à « même
  // personnage » sans le dire.
  const tirerPaire = (mode) => {
    const modesPossibles = ['personnage', 'film', 'couleurCout'].filter(m => familles[m]?.length > 0)
    if (modesPossibles.length === 0) return null
    const modeRetenu = mode === 'hasard' || !modesPossibles.includes(mode)
      ? auHasard(modesPossibles)
      : mode

    const groupe = auHasard(familles[modeRetenu])
    const melange = melanger(groupe)
    const premiere = melange[0]
    const seconde = modeRetenu === 'personnage'
      ? melange.find(c => c.fullName !== premiere.fullName)
      : melange.find(c => c.name !== premiere.name)
    if (!seconde) return null
    return { carteCivils: premiere, carteUndercover: seconde, mode: modeRetenu }
  }

  const [etape, setEtape] = useState('config')
  const [nbJoueurs, setNbJoueurs] = useState(4)
  const [noms, setNoms] = useState(() => Array.from({ length: JOUEURS_MAX }, () => ''))
  const [nbUndercover, setNbUndercover] = useState(1)
  const [avecMrWhite, setAvecMrWhite] = useState(false)
  const [modeAppariement, setModeAppariement] = useState('hasard')
  // Mode effectivement tiré pour la manche en cours, révélé à la fin
  const [modeTire, setModeTire] = useState(null)

  const [joueurs, setJoueurs] = useState([])
  const [indexDistribution, setIndexDistribution] = useState(0)
  const [carteVisible, setCarteVisible] = useState(false)
  const [premierJoueur, setPremierJoueur] = useState(0)
  const [dernierElimine, setDernierElimine] = useState(null)
  const [resultat, setResultat] = useState(null)
  // Consultation en cours de partie : on choisit son nom, puis on révèle.
  // En deux temps pour que l'appareil puisse changer de mains entre les deux.
  const [revisionJoueur, setRevisionJoueur] = useState(null)
  const [revisionVisible, setRevisionVisible] = useState(false)

  // Les infiltrés doivent rester minoritaires, sinon ils gagnent d'emblée
  const nbInfiltres = nbUndercover + (avecMrWhite ? 1 : 0)
  const maxUndercover = Math.max(1, Math.ceil(nbJoueurs / 2) - 1 - (avecMrWhite ? 1 : 0))
  const cartesPretes = familles.personnage.length > 0 || familles.film.length > 0 || familles.couleurCout.length > 0
  const configValide = cartesPretes && nbInfiltres < nbJoueurs - nbInfiltres

  const nomJoueur = (index) => noms[index]?.trim() || `${t('undercoverJoueur')} ${index + 1}`

  const ajusterNom = (index, valeur) => {
    setNoms(precedent => {
      const copie = [...precedent]
      copie[index] = valeur
      return copie
    })
  }

  const ajusterNbJoueurs = (valeur) => {
    const total = Math.min(JOUEURS_MAX, Math.max(JOUEURS_MIN, valeur))
    setNbJoueurs(total)
    const maxPossible = Math.max(1, Math.ceil(total / 2) - 1 - (avecMrWhite ? 1 : 0))
    if (nbUndercover > maxPossible) setNbUndercover(maxPossible)
  }

  const basculerMrWhite = () => {
    const actif = !avecMrWhite
    setAvecMrWhite(actif)
    const maxPossible = Math.max(1, Math.ceil(nbJoueurs / 2) - 1 - (actif ? 1 : 0))
    if (nbUndercover > maxPossible) setNbUndercover(maxPossible)
  }

  const distribuer = () => {
    if (!configValide) return
    const paire = tirerPaire(modeAppariement)
    if (!paire) return
    const { carteCivils, carteUndercover, mode } = paire
    setModeTire(mode)

    const roles = melanger([
      ...Array.from({ length: nbUndercover }, () => 'undercover'),
      ...(avecMrWhite ? ['mrwhite'] : []),
      ...Array.from({ length: nbJoueurs - nbInfiltres }, () => 'civil'),
    ])

    setJoueurs(roles.map((role, index) => ({
      nom: nomJoueur(index),
      role,
      carte: role === 'undercover' ? carteUndercover : role === 'mrwhite' ? null : carteCivils,
      elimine: false,
    })))
    setPremierJoueur(Math.floor(Math.random() * nbJoueurs))
    setIndexDistribution(0)
    setCarteVisible(false)
    setDernierElimine(null)
    setResultat(null)
    setRevisionJoueur(null)
    setRevisionVisible(false)
    setEtape('distribution')
  }

  const joueurSuivant = () => {
    setCarteVisible(false)
    if (indexDistribution + 1 >= joueurs.length) setEtape('partie')
    else setIndexDistribution(indexDistribution + 1)
  }

  // Les civils gagnent quand il ne reste aucun infiltré ; les infiltrés gagnent
  // dès qu'ils égalent le nombre de civils encore en jeu.
  const verdict = (liste) => {
    const enJeu = liste.filter(j => !j.elimine)
    const infiltres = enJeu.filter(j => j.role !== 'civil').length
    const civils = enJeu.length - infiltres
    if (infiltres === 0) return 'civils'
    if (infiltres >= civils) return 'infiltres'
    return null
  }

  const eliminer = (index) => {
    const liste = joueurs.map((joueur, i) => (i === index ? { ...joueur, elimine: true } : joueur))
    setJoueurs(liste)
    setDernierElimine(liste[index])
    const issue = verdict(liste)
    if (issue) {
      setResultat(issue)
      setEtape('fin')
    }
  }

  const libelleRole = (role) =>
    role === 'undercover' ? t('undercoverRoleUndercover')
      : role === 'mrwhite' ? t('undercoverRoleMrWhite')
        : t('undercoverRoleCivil')

  const couleurRole = (role) =>
    role === 'undercover' ? 'text-red-400 border-red-500/40 bg-red-500/10'
      : role === 'mrwhite' ? 'text-violet-300 border-violet-500/40 bg-violet-500/10'
        : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'

  const enJeu = joueurs.filter(j => !j.elimine)

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="panneau bg-slate-950/95 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">

        <div className="p-5 border-b border-white/5 flex justify-between items-center gap-3">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-lg text-amber-400 truncate">{t('undercoverTitre')}</h3>
            <p className="text-[11px] text-slate-500">{t('undercoverSousTitre')}</p>
          </div>
          <button onClick={onFermer} className="btn-ghost text-sm font-bold px-4 py-2 rounded-xl shrink-0">{t('fermer')}</button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">

          {/* --- Réglages de la partie --- */}
          {etape === 'config' && (
            <div className="space-y-6">
              <p className="text-sm text-slate-400 leading-relaxed">{t('undercoverRegles')}</p>

              {!cartesPretes ? (
                <p className="text-sm text-red-400 font-bold">{t('undercoverCartesIndispo')}</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">{t('undercoverJoueurs')}</label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => ajusterNbJoueurs(nbJoueurs - 1)} className="btn-ghost w-10 h-10 rounded-xl font-bold text-lg">−</button>
                      <span className="font-display font-black text-2xl w-10 text-center text-slate-100">{nbJoueurs}</span>
                      <button onClick={() => ajusterNbJoueurs(nbJoueurs + 1)} className="btn-ghost w-10 h-10 rounded-xl font-bold text-lg">+</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Array.from({ length: nbJoueurs }, (_, index) => (
                      <input
                        key={index}
                        type="text"
                        value={noms[index]}
                        onChange={(e) => ajusterNom(index, e.target.value)}
                        placeholder={`${t('undercoverJoueur')} ${index + 1}`}
                        maxLength={16}
                        className="p-2.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-sm outline-none text-slate-200"
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap items-end gap-6">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">{t('undercoverNbUndercover')}</label>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setNbUndercover(Math.max(1, nbUndercover - 1))} className="btn-ghost w-10 h-10 rounded-xl font-bold text-lg">−</button>
                        <span className="font-display font-black text-2xl w-8 text-center text-slate-100">{nbUndercover}</span>
                        <button onClick={() => setNbUndercover(Math.min(maxUndercover, nbUndercover + 1))} className="btn-ghost w-10 h-10 rounded-xl font-bold text-lg">+</button>
                      </div>
                    </div>

                    <button
                      onClick={basculerMrWhite}
                      className={`px-4 py-3 rounded-xl text-xs font-bold border transition ${avecMrWhite ? 'text-violet-300 border-violet-500/50 bg-violet-500/10' : 'btn-ghost'}`}
                    >
                      {t('undercoverMrWhite')}
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">{t('undercoverMrWhiteAide')}</p>

                  {/* Nature de la parenté entre les deux cartes */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">{t('undercoverMode')}</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'hasard', libelle: t('undercoverModeHasard') },
                        { id: 'personnage', libelle: t('undercoverModePersonnage') },
                        { id: 'film', libelle: t('undercoverModeFilm') },
                        { id: 'couleurCout', libelle: t('undercoverModeCouleurCout') },
                      ].map(option => (
                        <button
                          key={option.id}
                          onClick={() => setModeAppariement(option.id)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                            modeAppariement === option.id
                              ? 'text-amber-300 border-amber-500/50 bg-amber-500/10'
                              : 'btn-ghost'
                          }`}
                        >
                          {option.libelle}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{t(`undercoverAide_${modeAppariement}`)}</p>
                  </div>

                  <button onClick={distribuer} disabled={!configValide} className="btn-or w-full py-3 rounded-xl font-bold disabled:opacity-40">
                    {t('undercoverLancer')}
                  </button>
                  {!configValide && <p className="text-[11px] text-red-400">{t('undercoverTropInfiltres')}</p>}
                </>
              )}
            </div>
          )}

          {/* --- Distribution : l'appareil passe de main en main --- */}
          {etape === 'distribution' && joueurs[indexDistribution] && (
            <div className="text-center space-y-6 py-4">
              <p className="text-xs font-bold uppercase tracking-[3px] text-amber-400">{t('undercoverPasse')}</p>
              <p className="font-display font-black text-3xl text-slate-100">{joueurs[indexDistribution].nom}</p>

              {!carteVisible ? (
                <button onClick={() => setCarteVisible(true)} className="btn-or px-8 py-4 rounded-xl font-bold">
                  {t('undercoverVoirCarte')}
                </button>
              ) : (
                <div className="space-y-5">
                  <VignetteCarte carte={joueurs[indexDistribution].carte} libelleMrWhite={t('undercoverRoleMrWhite')} />
                  {!joueurs[indexDistribution].carte && (
                    <p className="text-xs text-violet-300 font-bold max-w-sm mx-auto">{t('undercoverTuEsMrWhite')}</p>
                  )}
                  <button onClick={joueurSuivant} className="btn-ghost px-6 py-3 rounded-xl font-bold text-sm">
                    {t('undercoverSuivant')}
                  </button>
                </div>
              )}

              <p className="text-[11px] text-slate-600">{indexDistribution + 1} / {joueurs.length}</p>
            </div>
          )}

          {/* --- Tour de table et votes --- */}
          {etape === 'partie' && (
            <div className="space-y-5">
              <div className="panneau rounded-xl p-4 space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  {joueurs[premierJoueur]?.nom} {t('undercoverCommence')}
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">{t('undercoverConsigne')}</p>
              </div>

              {dernierElimine && (
                <div className="flex items-center gap-4 panneau rounded-xl p-4">
                  <VignetteCarte carte={dernierElimine.carte} taille="w-20" libelleMrWhite={t('undercoverRoleMrWhite')} />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-100">{dernierElimine.nom}</p>
                    <span className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${couleurRole(dernierElimine.role)}`}>
                      {libelleRole(dernierElimine.role)}
                    </span>
                  </div>
                </div>
              )}

              {/* Revoir sa carte sans la montrer aux autres */}
              <div className="panneau rounded-xl p-4">
                {revisionJoueur === null ? (
                  <button
                    onClick={() => setRevisionJoueur('choix')}
                    className="btn-ghost px-4 py-2 rounded-xl text-xs font-bold"
                  >
                    {t('undercoverRevoir')}
                  </button>
                ) : revisionJoueur === 'choix' ? (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-400">{t('undercoverRevoirQui')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {joueurs.map((joueur, index) => (
                        !joueur.elimine && (
                          <button
                            key={index}
                            onClick={() => { setRevisionJoueur(index); setRevisionVisible(false) }}
                            className="btn-ghost p-2.5 rounded-xl text-sm font-bold"
                          >
                            {joueur.nom}
                          </button>
                        )
                      ))}
                    </div>
                    <button onClick={() => setRevisionJoueur(null)} className="btn-ghost px-4 py-2 rounded-xl text-xs font-bold">
                      {t('undercoverAnnuler')}
                    </button>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <p className="text-xs font-bold uppercase tracking-[3px] text-amber-400">
                      {t('undercoverPasse')} {joueurs[revisionJoueur]?.nom}
                    </p>
                    {revisionVisible ? (
                      <>
                        <VignetteCarte
                          carte={joueurs[revisionJoueur]?.carte}
                          taille="w-36"
                          libelleMrWhite={t('undercoverRoleMrWhite')}
                        />
                        <button
                          onClick={() => { setRevisionJoueur(null); setRevisionVisible(false) }}
                          className="btn-or px-6 py-2.5 rounded-xl text-sm font-bold"
                        >
                          {t('undercoverMasquer')}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setRevisionVisible(true)} className="btn-or px-6 py-3 rounded-xl font-bold">
                        {t('undercoverVoirCarte')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{t('undercoverEliminer')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {joueurs.map((joueur, index) => (
                    <button
                      key={index}
                      onClick={() => eliminer(index)}
                      disabled={joueur.elimine}
                      className={`p-3 rounded-xl text-sm font-bold border transition ${
                        joueur.elimine
                          ? 'border-slate-800 bg-slate-900/50 text-slate-600 line-through'
                          : 'btn-ghost hover:border-red-500/50'
                      }`}
                    >
                      {joueur.nom}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-600">
                {enJeu.length} {langue === 'fr' ? 'encore en jeu' : 'still in play'}
              </p>
            </div>
          )}

          {/* --- Fin de partie : tout est révélé --- */}
          {etape === 'fin' && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <p className={`font-display font-black text-2xl ${resultat === 'civils' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {resultat === 'civils' ? t('undercoverVictoireCivils') : t('undercoverVictoireInfiltres')}
                </p>
                {modeTire && (
                  <p className="text-[11px] text-slate-500">
                    {t('undercoverLienUtilise')} {t(`undercoverMode${modeTire === 'personnage' ? 'Personnage' : modeTire === 'film' ? 'Film' : 'CouleurCout'}`)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {joueurs.map((joueur, index) => (
                  <div key={index} className={`panneau rounded-xl p-3 text-center space-y-2 ${joueur.elimine ? 'opacity-50' : ''}`}>
                    <VignetteCarte carte={joueur.carte} taille="w-24" libelleMrWhite={t('undercoverRoleMrWhite')} />
                    <p className="font-bold text-sm text-slate-100 truncate">{joueur.nom}</p>
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${couleurRole(joueur.role)}`}>
                      {libelleRole(joueur.role)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 flex-wrap">
                <button onClick={distribuer} className="btn-or px-6 py-3 rounded-xl font-bold flex-1">{t('undercoverRejouer')}</button>
                <button onClick={() => setEtape('config')} className="btn-ghost px-6 py-3 rounded-xl font-bold text-sm">{t('undercoverReconfigurer')}</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
