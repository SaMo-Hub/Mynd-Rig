/**
 * Animations procédurales — générateurs de poses paramétrés.
 *
 * Chaque animation est une **fonction** `sample(t)` plutôt qu'une liste de
 * keyframes figées : les cycles (marche, course, idle) sont ainsi fluides et
 * bouclés par construction, et les amplitudes restent réglables en un chiffre.
 * `rigStore.loadAnimation()` les échantillonne ensuite en keyframes éditables.
 *
 * Conventions :
 * - Tout est exprimé en **unités locales** du personnage (256×279). Seuls
 *   `bodyX/bodyY` sont convertis en pixels écran à la sortie (× `viewScale`),
 *   parce que le store les stocke ainsi.
 * - `lift` = hauteur du corps, positif vers le haut.
 * - Pieds : `y = GROUND + lift - air`. Un pied posé (`air = 0`) reste donc au
 *   sol quand le corps monte ou descend — c'est ce qui fait plier les genoux.
 * - Bras : coordonnées polaires depuis l'épaule (`0°` = vers le bas,
 *   positif = vers la droite de l'écran).
 */
import { CHAR_CX, LIMBS, LIMB_BY_KEY, limbLength, type LimbDef } from './rigData'
import type { AnimationIconName } from '../ui/icons'

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/** Ligne de sol : position de repos des pieds. */
const GROUND = LIMB_BY_KEY['leg-left'].restTarget.y

export interface Vec2 {
  x: number
  y: number
}

/** Pose produite par un générateur (miroir de `Pose` côté store). */
export interface GeneratedPose {
  targets: Record<string, Vec2>
  bodyX: number
  bodyY: number
  bodyRot: number
  gazeX: number
  gazeY: number
}

export interface SampleCtx {
  /** Échelle de rendu, pour convertir les unités locales en pixels écran. */
  scale: number
  /** Attaches courantes (respecte un re-rigging manuel de l'utilisateur). */
  anchors: Record<string, Vec2>
}

/** Paires de membres triées par profondeur au rendu (voir `AnimationDef`). */
export type DepthSort = 'legs' | 'all'

/**
 * Réglages d'articulation d'un membre. Dans le store, `curve` / `bendDeg` sont
 * la forme (animable, `Pose.shape`) et `stretch` un réglage (`rigStore.stretch`).
 */
export interface LimbStyle {
  curve: number
  bendDeg: number
  stretch: boolean
}

export interface AnimationDef {
  id: string
  label: string
  /** Icône du menu, par nom — le dessin vit dans l'UI (`ui/icons.tsx`). */
  icon: AnimationIconName
  /** Une ligne, affichée dans le menu. */
  description: string
  duration: number
  /** Nombre de keyframes générées (l'interpolation du store est linéaire). */
  samples: number
  /** Cycle bouclé (marche, course…) vs. one-shot (saut). */
  loop: boolean
  /** Réglages d'articulation adaptés, appliqués au chargement. */
  style: LimbStyle
  /**
   * Surcharges par membre. Le rendu ne dessine pas un coude mais une seule
   * courbe lisse, donc la « rondeur » est le seul levier de silhouette : des
   * jambes de marcheur doivent rester droites là où des bras cartoon veulent
   * un arc franc. Sans cette surcharge, un réglage unique rate forcément l'un
   * des deux.
   */
  limbStyle?: Partial<Record<string, Partial<LimbStyle>>>
  /**
   * Tri par profondeur au rendu : dans chaque paire concernée, le membre dont
   * l'extrémité est la plus à droite passe devant le corps, l'autre reste
   * derrière et est assombri. Indispensable dès qu'une paire se croise — sans
   * ça, deux capsules identiques se confondent et le mouvement est illisible.
   *
   * - `'legs'` : jambes seules (marche — les bras y restent chacun de leur
   *   côté, les trier assombrirait en permanence le même bras).
   * - `'all'` : jambes et bras (course de profil, où les bras se croisent).
   */
  depthSort?: DepthSort
  /** @param t phase normalisée dans `[0, 1]`. */
  sample(t: number, ctx: SampleCtx): GeneratedPose
}

// --- Petites fonctions utilitaires -----------------------------------------

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a: number, b: number, u: number): number => a + (b - a) * u
/** Progression normalisée à l'intérieur du segment `[a, b]`. */
const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a))
const easeOut = (u: number): number => 1 - (1 - u) ** 3
const easeInOut = (u: number): number =>
  u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2

/** Angle de repos du membre, en degrés (0° = vers le bas). */
function restAngle(l: LimbDef): number {
  return Math.atan2(l.restTarget.x - l.anchor.x, l.restTarget.y - l.anchor.y) / DEG
}

/** Position d'extrémité en polaire depuis l'attache courante. */
function reach(l: LimbDef, anchor: Vec2, angleDeg: number, extend: number): Vec2 {
  const len = limbLength(l) * clamp01(extend)
  const a = angleDeg * DEG
  return { x: anchor.x + Math.sin(a) * len, y: anchor.y + Math.cos(a) * len }
}

const ARM_L = LIMB_BY_KEY['arm-left']
const ARM_R = LIMB_BY_KEY['arm-right']
const REST_ARM_L = restAngle(ARM_L)
const REST_ARM_R = restAngle(ARM_R)

/** Squelette de pose : membres au repos, corps neutre. */
function basePose(): GeneratedPose {
  const targets: Record<string, Vec2> = {}
  for (const l of LIMBS) targets[l.key] = { ...l.restTarget }
  return { targets, bodyX: 0, bodyY: 0, bodyRot: 0, gazeX: 0, gazeY: 0 }
}

/**
 * Assemble une pose à partir de grandeurs lisibles.
 * `lift` en unités locales (positif = le corps monte) ; les pieds posés
 * (`air = 0`) restent au sol, donc les jambes plient toutes seules.
 */
function build(
  ctx: SampleCtx,
  p: {
    lift: number
    sway?: number
    rotDeg?: number
    /** Bras : écart depuis l'angle de repos (positif = vers la droite). */
    armLSwing: number
    armRSwing: number
    armLExtend: number
    armRExtend: number
    /** Jambes : décalage horizontal du pied et hauteur au-dessus du sol. */
    legLStride: number
    legRStride: number
    legLAir: number
    legRAir: number
    /**
     * Vue de profil : rapproche les pieds de l'axe du corps (0 = sous leur
     * hanche, 1 = sur l'axe). Les hanches sont écartées de 40 unités, ce qui
     * trahirait la vue de côté ; mais converger coûte de la portée, d'où le
     * réglage partiel.
     */
    legConverge?: number
    gazeX?: number
    gazeY?: number
  },
): GeneratedPose {
  const pose = basePose()
  const a = ctx.anchors
  const conv = p.legConverge ?? 0

  pose.targets['arm-left'] = reach(ARM_L, a['arm-left'], REST_ARM_L + p.armLSwing, p.armLExtend)
  pose.targets['arm-right'] = reach(ARM_R, a['arm-right'], REST_ARM_R + p.armRSwing, p.armRExtend)

  const legX = (key: string, stride: number): number => {
    const ax = a[key].x
    return ax + (CHAR_CX - ax) * conv + stride
  }
  pose.targets['leg-left'] = {
    x: legX('leg-left', p.legLStride),
    y: GROUND + p.lift - p.legLAir,
  }
  pose.targets['leg-right'] = {
    x: legX('leg-right', p.legRStride),
    y: GROUND + p.lift - p.legRAir,
  }

  // bodyX/bodyY sont en pixels écran côté store → conversion ici.
  pose.bodyX = (p.sway ?? 0) * ctx.scale
  pose.bodyY = -p.lift * ctx.scale
  pose.bodyRot = (p.rotDeg ?? 0) * DEG
  pose.gazeX = p.gazeX ?? 0
  pose.gazeY = p.gazeY ?? 0
  return pose
}

// --- Idle : respiration -----------------------------------------------------

/**
 * Presque immobile, mais jamais figé : le corps respire, les bras suivent avec
 * un léger retard (déphasage) et le regard dérive lentement. C'est ce décalage
 * entre les parties qui empêche l'effet « pantin bloqué ».
 */
const IDLE: AnimationDef = {
  id: 'idle',
  label: 'Repos',
  icon: 'idle',
  description: 'Respiration légère, bras souples, regard qui dérive.',
  duration: 3.4,
  samples: 26,
  loop: true,
  style: { curve: 0.85, bendDeg: 0, stretch: false },
  sample(t, ctx) {
    const th = TAU * t
    const breath = Math.sin(th)
    // Le corps descend un peu à l'expiration → les genoux fléchissent.
    const lift = -1.6 + 1.6 * breath

    return build(ctx, {
      lift,
      rotDeg: 0.5 * Math.sin(th + 0.7),
      // Retard de 0.5 rad sur la respiration : les bras « suivent » le torse.
      armLSwing: -2.6 * Math.sin(th - 0.5),
      armRSwing: 2.6 * Math.sin(th - 0.5),
      armLExtend: 0.965 + 0.02 * breath,
      armRExtend: 0.965 + 0.02 * breath,
      legLStride: 0,
      legRStride: 0,
      legLAir: 0,
      legRAir: 0,
      // Dérive du regard à demi-fréquence : jamais synchrone avec le souffle.
      gazeX: 1.1 * Math.sin(th * 0.5),
      gazeY: 0.5 * Math.sin(th * 0.5 + 1.2),
    })
  },
}

// --- Trajectoire de pied vue de côté (marche et course) ---------------------

/**
 * Trajectoire d'un pied **vu de profil**, sur un cycle complet de la jambe.
 * Partagée par la marche et la course ; seul le `duty` change (> 0.5 → double
 * appui, marche ; < 0.5 → phase de vol, course).
 * `p` = phase de cette jambe dans `[0, 1)`.
 *
 * - `p < duty` : appui. Le pied est planté au sol et part vers l'arrière
 *   pendant que le corps le dépasse.
 * - `p ≥ duty` : vol. Il revient vers l'avant, genou levé.
 *
 * Les deux branches se rejoignent en `x = -stride, air = 0` et le cycle boucle
 * en `x = +stride, air = 0` — continu partout.
 */
function profileFoot(
  p: number,
  stride: number,
  airMax: number,
  duty: number,
): { x: number; air: number } {
  if (p < duty) {
    return { x: stride * (1 - 2 * (p / duty)), air: 0 }
  }
  const u = (p - duty) / (1 - duty)
  return {
    x: mix(-stride, stride, easeInOut(u)),
    air: airMax * Math.sin(Math.PI * u) ** 0.8,
  }
}

// --- Marche -----------------------------------------------------------------

/**
 * Fraction du cycle passée au sol par une jambe, en marche. > 0.5 → il y a un
 * **double appui** (jamais de phase de vol : c'est ce qui sépare la marche de
 * la course). Mais le calage des deux jambes est à un demi-cycle d'écart : plus
 * `duty` s'éloigne de 0.5, moins leurs extrêmes coïncident et plus l'écart des
 * pieds au contact se referme. 0.54 = juste assez de double appui pour le
 * poids, sans écraser l'enjambée.
 */
const WALK_DUTY = 0.54

/**
 * Cycle de marche vu de **trois-quarts**, calé sur la pose de référence du
 * designer : grand pas en ciseaux (pieds écartés de 158 u au contact, contre
 * 26 u pour un simple balancement), jambes quasi tendues, bras très
 * ouverts et nettement arqués — l'un levé presque à l'horizontale pendant que
 * l'autre redescend. Le personnage avance vers la droite.
 *
 * Les quatre poses du walk cycle sont produites par la construction, pas
 * posées à la main : contact (pieds écartés, corps bas), recoil juste après,
 * passing (jambe libre sous le bassin, corps haut), puis l'inverse.
 *
 * Points qui portent le résultat :
 * - `profileFoot` avec un `duty` > 0.5 → **double appui**, jamais de phase de
 *   vol : c'est ce qui sépare une marche d'une course. Le pied planté recule
 *   *linéairement* pendant l'appui — un pied au sol qui accélère puis ralentit
 *   (ce que donne un simple sinus) lit comme du patinage.
 * - `crouch` porte toute l'amplitude : la jambe est *pile* tendue au repos
 *   (`GROUND - anchor.y == limbLength`), donc sans descente du bassin un pied
 *   ne peut pas s'écarter du tout — `solveIK` clamperait la cible en silence.
 *   `crouch = 13` avec un rebond de 9 est le réglage le plus haut qui tienne
 *   dans la portée (99,5 % demandés au pire moment) : le bassin ne descend que
 *   là où l'enjambée l'exige, et le personnage n'a pas l'air accroupi.
 * - Les bras sont en **opposition** avec les jambes. La pose de référence, elle,
 *   lève le bras du même côté que la jambe avancée : correct sur une
 *   illustration figée, faux dès que ça bouge.
 * - `depthSort: 'legs'` : au passing les deux jambes se rejoignent presque, et
 *   deux capsules de la même couleur superposées ne se distinguent plus. La
 *   jambe droite — la plus proche du spectateur dans cette vue — passe donc
 *   devant le corps, la gauche reste derrière et est assombrie. Les bras, eux,
 *   restent chacun de leur côté et ne sont pas triés : les trier assombrirait
 *   le bras gauche en permanence.
 */
const WALK: AnimationDef = {
  id: 'walk',
  label: 'Marche',
  icon: 'walk',
  description: 'Trois-quarts : grand pas en ciseaux, transfert de poids, bras ouverts.',
  duration: 1.25,
  samples: 28,
  loop: true,
  // Flèches relevées sur la pose de référence : 18 u au bras (corde de 90),
  // 4 à 6 u à la jambe (corde de 146). D'où deux rondeurs : bras arqués,
  // jambes droites — ce qui évite au passage que la jambe en vol, très
  // raccourcie donc très bombée, se referme en crochet.
  style: { curve: 0.5, bendDeg: 0, stretch: false },
  limbStyle: { 'leg-left': { curve: 0.3 }, 'leg-right': { curve: 0.3 } },
  depthSort: 'legs',
  sample(t, ctx) {
    const stride = 42 // course du pied d'avant en arrière, autour de sa hanche
    /**
     * Largeur de pas : chaque pied reste écarté vers l'extérieur de son côté.
     * Sans elle, « jambe gauche en avant » place le pied gauche à *droite* du
     * pied droit (les hanches sont écartées de 40 u) et un contact sur deux
     * montre les jambes croisées en X. À `splay = 20`, les pieds ne se croisent
     * plus jamais et l'enjambée reste celle de la référence (158 u d'écart).
     */
    const splay = 20
    const airMax = 18
    const crouch = 13
    const bob = 9
    /** Écartement moyen des bras, au-delà de leur angle de repos. */
    const ARM_SPREAD = 24
    const ARM_SWING = 28
    /**
     * Retard des bras sur les jambes, **différent pour chaque bras** : sans ce
     * drag tout part et s'arrête ensemble, et avec le même retard des deux
     * côtés les deux bras passent leur position moyenne au même instant — deux
     * membres identiques au même endroit, la silhouette se referme en anse de
     * théière. 60 ms d'écart suffisent à casser la symétrie.
     */
    const ARM_LAG_L = 0.04
    const ARM_LAG_R = 0.1
    /** Instant du transfert de poids sur la jambe gauche (milieu de son appui). */
    const WEIGHT = WALK_DUTY / 2

    const footL = profileFoot(t, stride, airMax, WALK_DUTY)
    const footR = profileFoot((t + 0.5) % 1, stride, airMax, WALK_DUTY)

    // Corps au plus bas juste **après** le contact (le recoil, où se joue la
    // masse) et au plus haut au passing — la signature de la marche, et
    // exactement l'inverse de la course.
    const lift = -crouch - bob * Math.cos(4 * Math.PI * (t - 0.06))

    // Transfert de poids : le corps se porte au-dessus du pied d'appui, à
    // gauche au milieu de l'appui gauche, à droite un demi-cycle plus tard.
    const weight = -Math.cos(TAU * (t - WEIGHT))

    // Balancier des bras, en opposition : l'un s'ouvre pendant que l'autre se
    // referme. Le bras qui monte se replie (portée 0.60 → arc marqué), celui
    // qui redescend se tend (0.84) — repris de la pose de référence.
    const swingL = Math.cos(TAU * (t - ARM_LAG_L))
    const swingR = Math.cos(TAU * (t - ARM_LAG_R))

    return build(ctx, {
      lift,
      sway: 5 * weight,
      rotDeg: 2 * weight,
      armLSwing: -(ARM_SPREAD - ARM_SWING * swingL),
      armRSwing: ARM_SPREAD + ARM_SWING * swingR,
      armLExtend: 0.72 + 0.12 * swingL,
      armRExtend: 0.72 - 0.12 * swingR,
      legLStride: footL.x - splay,
      legRStride: footR.x + splay,
      legLAir: footL.air,
      legRAir: footR.air,
      // Regard porté vers l'avant, qui reste accroché à l'horizon pendant que
      // le corps balance (contre-mouvement) et suit le rebond avec un retard.
      gazeX: 2 - 0.6 * weight,
      gazeY: -0.5 + 0.4 * Math.cos(4 * Math.PI * (t - 0.06) - 0.6),
    })
  },
}

/** Fraction du cycle passée au sol par une jambe, en course. < 0.5 → phase de vol. */
const RUN_DUTY = 0.36

/**
 * Course **vue de profil** (le personnage court vers la droite).
 *
 * Le torse et le visage restent de face — il n'existe pas d'asset de profil —
 * mais tout le reste lit comme une vue de côté : jambes qui alternent
 * avant/arrière sur le même axe, bras en opposition dans le même plan, buste
 * penché dans la direction de course.
 *
 * `depthSort: 'all'` fait trier les membres par profondeur au rendu, sans quoi
 * les deux jambes se confondent au croisement.
 *
 * Le corps est au plus **bas** au mid-stance (la jambe d'appui encaisse) et au
 * plus haut pendant la phase de vol — l'inverse de la marche.
 */
const RUN: AnimationDef = {
  id: 'run',
  label: 'Course',
  icon: 'run',
  description: 'Vue de profil, vers la droite : phase de vol, buste penché.',
  duration: 0.62,
  samples: 24,
  loop: true,
  style: { curve: 0.62, bendDeg: 0, stretch: false },
  depthSort: 'all',
  sample(t, ctx) {
    const th = TAU * t
    const stride = 24
    const airMax = 30
    const crouch = 11
    const bob = 5

    const footL = profileFoot(t, stride, airMax, RUN_DUTY)
    const footR = profileFoot((t + 0.5) % 1, stride, airMax, RUN_DUTY)

    // Minimum au mid-stance de chaque jambe (p = duty/2, puis un demi-cycle
    // plus loin) → fréquence double, calée sur le premier appui.
    const lift = -crouch - bob * Math.cos(4 * Math.PI * (t - RUN_DUTY / 2))

    // Bras : balancés autour de la verticale (on annule l'angle de repos, qui
    // écarte les bras vers l'extérieur — bon de face, faux de profil), en
    // opposition l'un avec l'autre et avec les jambes.
    const armSwing = 38 * Math.cos(th)

    return build(ctx, {
      lift,
      sway: 1.5 * Math.sin(2 * th),
      rotDeg: 9 + 1.5 * Math.sin(2 * th),
      armLSwing: -REST_ARM_L - armSwing,
      armRSwing: -REST_ARM_R + armSwing,
      armLExtend: 0.72,
      armRExtend: 0.72,
      legLStride: footL.x,
      legRStride: footR.x,
      legLAir: footL.air,
      legRAir: footR.air,
      legConverge: 0.6,
      gazeX: 1.6,
      gazeY: -0.8,
    })
  },
}

// --- Saut -------------------------------------------------------------------

/**
 * Saut one-shot, découpé en phases d'animation classiques : anticipation
 * (accroupissement), poussée, vol, atterrissage, absorption, retour au repos.
 * Le timing porte tout le poids ici — anticipation lente, poussée très courte,
 * temps de suspension au sommet, chute rapide.
 */
const JUMP: AnimationDef = {
  id: 'jump',
  label: 'Saut',
  icon: 'jump',
  description: 'One-shot : anticipation, poussée, suspension, réception amortie.',
  duration: 1.45,
  samples: 42,
  loop: false,
  style: { curve: 0.8, bendDeg: 0, stretch: false },
  sample(t, ctx) {
    const CROUCH = 24 // profondeur de l'accroupissement
    const PEAK = 50 // hauteur du saut
    const LAND = 17 // absorption à la réception
    const TUCK = 15 // repli des jambes sous le corps en vol

    let lift = 0
    let tuck = 0
    let armSwing = 0 // écartement symétrique des bras
    let armExtend = 0.95
    let rotDeg = 0

    if (t < 0.18) {
      // Immobile, prêt.
      lift = 0
    } else if (t < 0.4) {
      // Anticipation : on descend, les bras se resserrent vers le bas.
      const u = easeInOut(seg(t, 0.18, 0.4))
      lift = mix(0, -CROUCH, u)
      armSwing = mix(0, -24, u)
      armExtend = mix(0.95, 0.86, u)
      rotDeg = mix(0, 3, u)
    } else if (t < 0.5) {
      // Poussée : courte et explosive, les bras fouettent vers le haut. On
      // remonte jusqu'à `lift = 0`, pieds encore au sol, jambes tendues.
      // `easeInOut` plutôt qu'`easeOut` : le pic de vitesse est deux fois plus
      // faible, ce qui évite que les bras « sautent » d'une frame à l'autre.
      const u = easeInOut(seg(t, 0.4, 0.5))
      lift = mix(-CROUCH, 0, u)
      armSwing = mix(-24, 62, u)
      armExtend = mix(0.86, 0.99, u)
      rotDeg = mix(3, -2, u)
    } else if (t < 0.84) {
      // Vol. L'exposant < 1 aplatit le sommet : c'est le temps de suspension.
      // `tuck` suit la même cloche → les jambes se replient au décollage et se
      // retendent d'elles-mêmes pour la réception, sans rupture aux bornes.
      const u = seg(t, 0.5, 0.84)
      lift = PEAK * Math.sin(Math.PI * u) ** 0.75
      tuck = TUCK * Math.sin(Math.PI * u) ** 0.7
      armSwing = mix(62, 28, easeOut(u))
      armExtend = mix(0.99, 0.94, u)
      rotDeg = mix(-2, 2, u)
    } else if (t < 0.92) {
      // Réception : le corps encaisse.
      const u = easeOut(seg(t, 0.84, 0.92))
      lift = mix(0, -LAND, u)
      armSwing = mix(28, -14, u)
      armExtend = mix(0.94, 0.88, u)
      rotDeg = mix(2, 4, u)
    } else {
      // Retour au repos.
      const u = easeOut(seg(t, 0.92, 1))
      lift = mix(-LAND, 0, u)
      armSwing = mix(-14, 0, u)
      armExtend = mix(0.88, 0.95, u)
      rotDeg = mix(4, 0, u)
    }

    // Pieds : `air = lift + tuck` → ils restent collés au sol tant que `tuck`
    // vaut 0 (accroupissement, poussée, réception) et ne suivent le corps que
    // pendant le vol. Sans ce couplage, les jambes dépassent leur longueur.
    const air = lift + tuck

    return build(ctx, {
      lift,
      rotDeg,
      armLSwing: -armSwing,
      armRSwing: armSwing,
      armLExtend: armExtend,
      armRExtend: armExtend,
      legLStride: 0,
      legRStride: 0,
      legLAir: air,
      legRAir: air,
      // Regard vers le haut en montée, vers le bas à l'accroupissement.
      gazeY: -2.2 * clamp01(lift / PEAK) + 1.2 * clamp01(-lift / CROUCH),
    })
  },
}

export const ANIMATIONS: AnimationDef[] = [IDLE, WALK, RUN, JUMP]
