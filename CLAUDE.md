# CLAUDE.md — Mynd

Projet ICAN. Personnage 2D **cut-out** riggé, jouable dans le navigateur, destiné à
être empaqueté en widget embarquable par des entreprises tierces (sans connaissances
techniques de leur côté). Assets fournis en pièces découpées : tête, bras, jambes,
yeux, bouches / expressions.

## Pile technique

- **Vite 6** + **React 19** + **TypeScript** (project references : `tsconfig.app.json`,
  `tsconfig.node.json`).
- **Tailwind CSS v4** via le plugin `@tailwindcss/vite` (pas de `tailwind.config` ni
  de PostCSS ; tout le thème est déclaré en CSS dans `src/index.css`).
- **Pixi.js v8** pour le rendu et le rig (WebGPU si dispo, sinon WebGL — Pixi choisit
  seul). Choix issu d'une recherche comparative : voir décision ci-dessous.

## Commandes

- `npm run dev` — serveur de dev (port 5173, bascule si occupé).
- `npm run build` — `tsc -b && vite build` (typecheck strict + build prod).
- `npm run preview` — sert le build.

### Voir une animation image par image

Une animation ne se juge pas dans le code. Le store expose `window.__rig` en
dev, donc le temps est pilotable de l'extérieur — `setTime(t)` place la pose
sans lancer la lecture :

```bash
npm run dev   # note le port réel (5173, 5175…)
node ~/.claude/skills/motion-designer/scripts/capture.mjs \
  --url http://localhost:5175 --out /tmp/walk --mode driver \
  --expose "window.__seek = (t) => window.__rig.setTime(t)" \
  --setup setup.js --duration 1.25 --frames 16 --selector canvas
```

`setup.js` charge le preset en cliquant dans l'UI (bouton « Animations » puis
l'item voulu). Sorties : `contact-sheet.png` (le déroulé) et `trail.png` (onion
skin — c'est là qu'on lit le spacing et le rebond du corps).

Note : `erasableSyntaxOnly` est activé → **pas** de « parameter properties »
(`constructor(private x)`) ni d'enums TS ; déclarer les champs explicitement.

## Architecture de l'éditeur de rig

L'app est un **éditeur de rig + animation** (poser, rigger, timeline, export).

- `src/rig/rigData.ts` — géométrie du personnage : `LIMBS` (attache, cible de
  repos, couleur, sens de pliage `bend`, `pinned`), constantes de l'espace local
  (256×279, = viewBox de `mascot-final.svg`). Les membres sont à **2 os (IK)**.
- `src/editor/rigStore.ts` — store d'état vanilla (singleton `rigStore`). Modèle de
  pose **basé sur la cible d'extrémité** (main/pied en coords locales), pas sur des
  rotations. Contient aussi anchors, keyframes, lecture, interpolation, export JSON.
  Pixi lit la pose en direct ; React ne s'abonne qu'aux changements structurels
  (via `src/editor/useRig.ts` + `useSyncExternalStore`). Exposé sur `window.__rig`
  en dev.
- `src/editor/RigCanvas.tsx` — rendu Pixi. Membres **procéduraux** : `solveIK`
  (2 os égaux) place le genou/coude, dessiné en capsule à jointure arrondie
  (`stroke` cap/join `round`, couleur unie = SVG d'origine). Corps + visage =
  sprite `mascot-body.svg` posé par-dessus. Deux calques de membres,
  `backLimbs` (sous le corps, défaut) et `frontLimbs` (au-dessus du corps mais
  sous le visage) : voir le tri par profondeur en vue de profil plus bas. Poignées interactives en coords écran
  (taille constante), reprojetées chaque frame via `character.toGlobal`.
- **Découpage de la page** (refonte sur la DA de l'accueil iOS) : `App.tsx` pose
  quatre zones en cartes arrondies posées sur le fond, sans bandeaux ni bordures.
  Le contenu est rangé par sujet, pas par commodité :
  - `src/editor/EditorHeader.tsx` — identité, mode d'édition, thème, export
    (tout ce qui porte sur le **document**) ;
  - `src/editor/SceneToolbar.tsx` — outils de **pose**, en capsule de verre
    flottant sur la scène (pattern de la barre d'action de l'éditeur iOS) ;
  - `src/editor/Timeline.tsx` — le **temps** : transport (le bouton rond
    `action`), durée, règle, keyframes, playhead en rAF ;
  - `src/editor/ArticulationPanel.tsx` — les **réglages**.
- `src/ui/` — **le design system** (voir la section dédiée plus bas) : `Button`,
  `GlassSegmented`, `IconButton`, `Slider`, `Checkbox`, `NumberField`,
  `ThemeToggle`, `icons.tsx`, `MyndWordmark`, et `theme.ts` (lecture des tokens
  CSS par Pixi).
- `src/editor/SceneHint.tsx` — indice posé en bas de la scène (sélection
  courante, ou geste à faire). Il était dans la `Toolbar`, qu'il faisait passer
  sur deux lignes sur un écran de portable ; il parle de la scène, pas des
  outils.
- `src/editor/AnimationMenu.tsx` — popover « Animations » : charge un preset
  procédural. Avertit quand des keyframes existent (le chargement les remplace).
  Il s'ouvre **vers le haut** : son bouton vit dans la capsule flottante en bas
  de la scène, qui est en `overflow-hidden`.
- `src/editor/ArticulationPanel.tsx` — panneau latéral de réglage du pliage :
  **Rondeur** (`limbStyle.curve`, module la hauteur du bombement) et **Rotation
  du pli** (`limbStyle.bendDeg`, tourne la direction de courbure ; plage 0…180°,
  0° = pli naturel, 90° = bombement annulé — la perpendiculaire devient
  colinéaire à l'axe attache→extrémité —, 180° = pli inversé) et case
  **Autoriser l'étirement** (`limbStyle.stretch` : sans, la portée est bornée à
  2 segments ; avec, le membre s'allonge pour atteindre la cible). Par défaut lié
  (les 4 membres via `setAllStyle`, `styleLinked`), dépliable par membre
  (`setLimbStyle`). Ces réglages sont de la config (non animée par la timeline).

- **Pupilles** : `mascot-body.svg` ne contient plus que le blanc des yeux ; les
  pupilles (`pupil.svg`, disque + étincelles recentrés) sont 2 sprites mobiles
  posés au-dessus du visage. Le regard (`pose.gazeX/gazeY`, partagé, animable,
  borné à `GAZE_MAX`) se règle via une poignée verte ou le mode « Suivre curseur »
  (`followGaze`, écoute `globalpointermove`). Constantes dans `rigData.ts` (`EYES`,
  `EYE_MID`, `EYE_WHITE_R`, `PUPIL_R`, `GAZE_MAX`).

## Animations procédurales (`src/rig/animations.ts`)

Quatre presets — **Repos**, **Marche**, **Course**, **Saut** — définis comme des
**fonctions** `sample(t, ctx)` et non comme des keyframes figées : les cycles
sont bouclés par construction et les amplitudes se règlent en un chiffre.
`rigStore.loadAnimation(def)` les échantillonne en `samples + 1` keyframes
éditables (l'interpolation de la timeline étant linéaire, la fluidité vient de
la densité), applique le `style` d'articulation du preset et remplace les
keyframes existantes.

Conventions du modèle (invariants à respecter si on ajoute une animation) :

- Tout est en **unités locales** (256×279) ; seuls `bodyX/bodyY` sont convertis
  en pixels écran (× `viewScale`) car le store les stocke ainsi.
- `lift` = hauteur du corps, **positif vers le haut**.
- Pieds : `y = GROUND + lift - air`. Un pied posé (`air = 0`) reste au sol quand
  le corps monte/descend → les genoux plient tout seuls.
- **Contrainte de portée** : `GROUND - anchor.y == limbLength` pour les jambes,
  donc la jambe est *pile* tendue au repos. Il faut un `crouch` de base pour
  dégager de l'amplitude, et dès que `lift > 0` il faut `air ≥ lift` — sinon la
  cible sort de portée et `solveIK` la clampe silencieusement (l'animation perd
  son amplitude sans erreur).
- Bras : polaire depuis l'épaule, `0°` = vers le bas, positif = vers la droite.

Marche vs course : le corps est au plus **haut** au passing en marche (jambe
d'appui tendue) et au plus **bas** au mid-stance en course (la jambe encaisse) —
d'où le `+cos(2θ)` d'un côté et le `-cos(2θ)` de l'autre.

`style` s'applique aux 4 membres ; `limbStyle` (optionnel) surcharge par membre.
Utile parce que le rendu ne dessine pas un coude mais **une seule courbe lisse** :
la « rondeur » est donc le seul levier de silhouette, et des jambes de marcheur
la veulent basse (droites) là où des bras cartoon la veulent haute (arc franc).
Un preset qui définit `limbStyle` délie les curseurs du panneau (`styleLinked`).

### Vues de côté / trois-quarts (`profileFoot`, `depthSort`)

La **marche** est en trois-quarts et la **course** en vue de côté, toutes deux
vers la droite ; repos et saut restent de face. Le torse et le visage restent
forcément de face — il n'existe pas d'asset de profil — seuls les membres et
l'inclinaison vendent le point de vue :

- `profileFoot(p, …)`, partagé par les deux cycles : appui (pied planté qui part
  vers l'arrière, **linéairement** — un pied au sol qui accélère puis ralentit
  lit comme du patinage) sur `duty` du cycle, puis vol (retour vers l'avant,
  genou levé). `duty < 0.5` → phase de vol, c'est la course ; `> 0.5` → double
  appui, c'est la marche. Mais les deux jambes sont calées à un demi-cycle
  d'écart : plus `duty` s'éloigne de 0.5, moins leurs extrêmes coïncident et
  plus l'enjambée apparente se referme (d'où `WALK_DUTY = 0.54`).
- **Écarter ou converger les pieds** : les hanches sont écartées de 40 u. En
  course, `legConverge` rapproche les pieds de l'axe (sinon la vue de côté est
  trahie) — converger **coûte de la portée**, d'où le réglage partiel à 0,6. En
  marche c'est l'inverse : un `splay` constant écarte chaque pied vers son côté,
  sans quoi « jambe gauche en avant » place le pied gauche à *droite* du pied
  droit et un contact sur deux montre les jambes croisées en X.
- Les bras : en course ils balancent autour de la **verticale** (on annule
  `REST_ARM_*`, qui les écarte vers l'extérieur — juste de face, faux de
  profil) ; en marche ils gardent l'écartement de l'illustration de référence,
  avec un **retard différent pour chaque bras** — même retard des deux côtés et
  ils passent leur position moyenne au même instant, la silhouette se referme
  en anse de théière.
- `depthSort` active le **tri par profondeur** dans `RigCanvas` : dans chaque
  paire concernée, le membre dont l'extrémité a le plus grand `x` passe devant
  le corps (`frontLimbs`), l'autre reste derrière (`backLimbs`) et est assombri
  (`FAR_SHADE`). Sans ça, deux capsules identiques se confondent quand elles se
  rejoignent et le mouvement est illisible. `'all'` = bras et jambes (course, où
  les bras se croisent) ; `'legs'` = jambes seules (marche : trier les bras
  assombrirait le bras gauche en permanence, puisqu'il ne repasse jamais de
  l'autre côté).

Bornes de portée (marche) : `stride 42 + splay 20` demande 99,5 % de la portée
de la jambe au pire moment du cycle. Toucher à l'un de ces réglages sans
revérifier, c'est risquer le clamp silencieux de `solveIK`.

Comportements clés :
- **Extrémités épinglées** (`pinned`, les pieds) : restent fixes dans le monde
  quand le corps bouge/tourne → compensation de la cible locale dans
  `nudgeBody`/`setBodyRot` (utilise `rigStore.viewScale` écrit par le canvas).
- **Pliage** : rapprocher une extrémité de son attache plie le genou/coude (IK),
  au lieu de rétrécir. Un corps qui descend avec pieds épinglés → jambes qui
  plient (squat).

- `public/assets/` — visuels 2D découpés SVG : `mascot-final.svg` (référence
  assemblée), `mascot-body.svg` (corps+visage seul, dérivé, posé au-dessus des
  membres), `Bras */Jambe *.svg` (pièces d'origine, désormais non chargées — le
  rendu des membres est procédural).

## Design system — partagé avec l'app iOS

L'éditeur reprend **le DS de l'app Mynd iOS**, pour que le site et l'app aient la
même DA. Source de vérité : `~/Documents/GitHub/ICAN/MyndIOS/MyndApp/DESIGN_SYSTEM.md`
et `MyndApp/Sources/Theme.swift` — s'y référer avant d'inventer un style, et
**répercuter ici** toute évolution du DS iOS.

- **Tokens** : `src/index.css`. Les couleurs vivent en variables `--mynd-*` sur
  `:root` (port littéral de `Palette`), exposées à Tailwind par un bloc
  `@theme inline` → `bg-surface`, `text-ink-soft`, `border-border`,
  `rounded-card`, `shadow-card`… **Aucune valeur magique dans un composant.**
- **Thème** : clair / sombre « Nuit ardoise » comme l'app. Le défaut **suit le
  réglage système** ; `data-theme` sur `<html>` force l'un ou l'autre
  (`ThemeToggle`, mémorisé en `localStorage`) — utile pour juger le personnage
  sur les deux fonds. `@theme inline` est ce qui rend la bascule instantanée :
  les utilitaires pointent la variable, pas sa valeur.
- **Typographie** : **Google Sans Flex** variable (`public/fonts/`, woff2 104 Ko),
  en variante arrondie `font-variation-settings: "ROND" 100` et corps à 500 —
  exactement le réglage de `MyndFont`.
- **Rien ne se détache par un trait.** C'est *le* principe de la DA : les zones
  sont des cartes arrondies (`rounded-xl` = `Radius.xl`) séparées par du vide et
  une ombre douce, les contrôles sont des capsules, les rangées d'un panneau se
  distinguent par un lavis (`panel-row`) ou une surface (`surfaceElevated`).
  **Le seul contour de la page** est le liseré 2 px `neutral` des boutons ronds,
  celui du bouton recherche de la Home.
- **Composants** (`src/ui/`) — ports web des composants iOS, à réutiliser plutôt
  qu'à refaire : `Button` (= `MyndButton` : pilule, `primary`/`secondary`/`ghost`,
  `regular`/`compact`, ≥ 44 px, plus `active` pour l'état « en marche » d'un
  outil), **`GlassSegmented`** (ci-dessous), `IconButton` (les deux boutons ronds
  de la Home : `outline` = la recherche, `action` = le « + » flottant en verre
  teinté), `Slider` (= `PanelSlider` : piste 6, poignée pilule 22 × 10 blanche),
  `Checkbox` (= `NotesCheckbox` : remplissage qui « pop », coche qui se trace,
  décochage sec), `NumberField` (pilule pleine, sur le modèle du champ de
  recherche de la Home ; le contour 2 px de `MyndTextField` est réservé aux
  formulaires plein écran, qu'on n'a pas ici).
- **`GlassSegmented`** = le `GlassSegmentedPicker` de l'app (le sélecteur
  Liste / Carte du feed), avec **ses** animations : grab à 1,07, suivi du doigt,
  bascule au milieu, calage au ressort, et l'écrasement « jelly » (0,13 s à
  y 0,84 / x 1,10 puis retour bouncy). Trois couches superposées dans
  `glass-pill.css`, parce que les trois animations portent toutes sur
  `transform`. Les segments se partagent la piste à **égalité** (`basis-0`) : la
  bulle fait une demi-piste, elle ne coïnciderait plus sinon. Il prend la largeur
  qu'on lui donne, comme dans l'app.
- **Ressorts** : les `spring(response:dampingFraction:)` de SwiftUI n'ont pas
  d'équivalent CSS ; ils sont échantillonnés en courbes `linear()`
  (`--ease-settle`, `--ease-grab`, `--ease-bouncy` dans `index.css`), ce qui
  restitue le vrai dépassement plutôt qu'un `cubic-bezier` approchant.
- **Hiérarchie** : une seule action accentuée par zone — `Sauvegarder` dans
  l'en-tête, `Lire` dans la timeline ; tous les outils sont en `ghost`.
- **Pas d'emoji dans l'interface** : un emoji ne prend pas `currentColor` (il ne
  suit ni le thème ni l'état du bouton) et change de dessin d'un OS à l'autre.
  Toutes les icônes sont des tracés de `src/ui/icons.tsx`, en bouts **arrondis**
  — le langage de forme de la police et des membres en capsule. Une
  `AnimationDef` porte donc un **nom** d'icône (`icon: 'walk'`), pas un glyphe.
- **Couleurs de la scène Pixi** : lues sur les tokens CSS via `src/ui/theme.ts`
  (`tokenHex`), pas codées en dur — le canvas suit donc la bascule de thème
  (`onThemeChange`). Seule exception assumée : `--mynd-stage` est **neutre en
  clair** au lieu du `sky` de l'app, parce que le personnage est lui-même cyan
  et disparaîtrait dessus.
- ⚠️ **`resizeTo` de Pixi n'écoute que la fenêtre.** La scène change aussi de
  largeur quand on replie le panneau : le canvas restait alors à son ancienne
  taille (fond tronqué, personnage décentré). C'est le `ResizeObserver` de
  `layout()` qui appelle `app.renderer.resize(...)` — une seule voie pour les
  deux cas, ne pas réintroduire `resizeTo`.
- **Cadrage de la scène** : `SCENE_INSET_TOP` / `SCENE_INSET_BOTTOM`
  (`RigCanvas`) réservent la place de l'indice et de la capsule d'outils, qui
  flottent au-dessus du canvas. Le personnage est mis à l'échelle et centré
  **entre les deux** — sans quoi ses pieds passent sous la capsule et sa poignée
  de rotation sort par le haut.
- **Reduce Motion** : garde-fou global dans `index.css` (il couvre aussi les
  transitions en style inline, que `motion-reduce:` ne voit pas).

### Vérifier le rendu

Pas d'`ImageMagick` ni de Playwright installés dans le projet : capturer avec
`playwright-core` + le Chrome du système, depuis le répertoire de scratch.

```js
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
```

## Embarquer l'éditeur dans un autre site (iframe)

L'éditeur est fait pour être posé dans une page de portfolio, en **iframe**, et
y rester pleinement interactif. Ce que ça implique, et qui ne doit pas être
défait :

- **Le cadre commande, pas l'écran.** La largeur de référence est celle de
  l'iframe. `useMediaQuery` (`src/ui/useMediaQuery.ts`) fait réagir les mises en
  page : sous `lg` le panneau se replie de lui-même (un choix explicite de
  l'utilisateur prime jusqu'au prochain franchissement de seuil) et flotte
  au-dessus de la scène ; sous `md` la capsule d'outils et le bouton
  « Sauvegarder » passent en **icônes seules** ; sous `sm` le titre disparaît.
  Tout libellé masqué doit garder son `aria-label` — l'infobulle ne suffit pas.
- ⚠️ **Les marges de la scène sont mesurées, jamais devinées** (`measureInsets`
  dans `RigCanvas`) : le canvas lit la hauteur réelle des éléments marqués
  `data-scene-inset="top" | "bottom"` (l'indice, la capsule d'outils). Des
  constantes en dur écrasaient le personnage dès que le cadre se resserrait,
  puisque ces éléments changent de taille avec les breakpoints. Le
  `ResizeObserver` observe donc aussi ces deux éléments.
- **`touch-action: none` sur le canvas** : un doigt posé sur la scène pose le
  personnage, il ne fait pas défiler la page hôte. Sans cela, un glissé sur une
  main emporte le portfolio. En contrepartie, prévoir de la marge autour de
  l'iframe pour que le scroll reste facile sur mobile.
- **En-têtes** : `vercel.json` et `netlify.toml` posent
  `Content-Security-Policy: frame-ancestors` — c'est ce qui autorise l'embed
  (et le refuse ailleurs). **Y ajouter le domaine réel du portfolio** ; ne pas
  remettre `X-Frame-Options`, qui ne sait pas faire de liste d'hôtes.
- **Le composant à copier dans le site hôte** est `embed/MyndEditorEmbed.tsx`.
  Il ne fait pas partie de l'app : il vit dans le dépôt pour rester à jour avec
  elle, et se copie tel quel dans le projet du portfolio. Le piège classique est
  l'iframe sans hauteur explicite : elle s'affiche alors à 150 px.

## Décision technique (recherche comparative, juillet 2026)

Retenu : **rig custom sur Pixi.js v8 + ressort maison + Web Component/Shadow DOM** pour
la livraison. Motifs : MIT/gratuit (pas de licence à répercuter aux clients B2B),
bundle léger, contrôle total de la physique. Écartés : Spine (physique intégrée mais
licence commerciale de redistribution), Live2D (cœur propriétaire + flou licence widget
revendu), Rive (pas de vraie physique ressort de membres, WASM ~200 Ko), DragonBones
(abandonné depuis 2015). L'empaquetage Web Component reste à faire.

## Maintenance de ce fichier

Garde ce CLAUDE.md à jour. Dès qu'une nouvelle fonctionnalité, dépendance, partie
d'architecture, convention ou commande importante apparaît ou change, mets à jour la
section concernée du fichier. N'ajoute que des informations utiles et durables,
jamais de détails éphémères.
