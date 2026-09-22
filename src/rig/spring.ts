/**
 * Ressort amorti angulaire — cœur de la physique secondaire du rig.
 *
 * Modèle « jiggle bone » : un membre pivote autour de son articulation
 * (épaule, hanche) et est ramené vers un angle de repos par une force de
 * rappel proportionnelle à l'écart (stiffness), freinée par un amortissement
 * (damping). Léger, stable, sans moteur physique externe.
 */
export interface SpringConfig {
  /** Raideur : force de rappel vers l'angle de repos. Plus haut = plus rigide. */
  stiffness: number
  /** Amortissement : freine la vitesse. Plus haut = s'arrête plus vite. */
  damping: number
  /** Masse : inertie du membre. Plus haut = plus lent à réagir. */
  mass: number
}

export const DEFAULT_SPRING: SpringConfig = {
  stiffness: 120,
  damping: 14,
  mass: 1,
}

/** État mutable d'un ressort angulaire, en radians. */
export class AngularSpring {
  /** Angle courant (rad). */
  value = 0
  /** Vitesse angulaire (rad/s). */
  velocity = 0
  /** Angle de repos visé (rad). */
  target = 0

  private cfg: SpringConfig

  constructor(cfg: SpringConfig = DEFAULT_SPRING) {
    this.cfg = cfg
  }

  /**
   * Avance la simulation de `dt` secondes.
   * @returns le nouvel angle
   */
  step(dt: number): number {
    const { stiffness, damping, mass } = this.cfg
    const restoring = -stiffness * (this.value - this.target)
    const friction = -damping * this.velocity
    const acceleration = (restoring + friction) / mass
    this.velocity += acceleration * dt
    this.value += this.velocity * dt
    return this.value
  }

  /** Applique une impulsion instantanée (ex. le corps bouge → le membre suit). */
  kick(impulse: number): void {
    this.velocity += impulse
  }

  setConfig(cfg: Partial<SpringConfig>): void {
    this.cfg = { ...this.cfg, ...cfg }
  }
}
