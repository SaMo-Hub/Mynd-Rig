import { useSyncExternalStore } from 'react'
import { rigStore } from './rigStore'

/**
 * S'abonne aux changements structurels du store (mode, sélection, keyframes,
 * play/pause…). Retourne le store lui-même ; le compteur de version force le
 * re-render. Ne pas utiliser pour lire la pose par frame (Pixi/rAF s'en charge).
 */
export function useRig() {
  useSyncExternalStore(rigStore.subscribe, rigStore.getSnapshot, rigStore.getSnapshot)
  return rigStore
}
