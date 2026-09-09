import type { BuildingAssessmentProgress } from './building-consolidation'

export interface TheaterStartupState {
  graphicsReady: boolean
  geometry: BuildingAssessmentProgress
}

export function theaterStartupDisplay(state: TheaterStartupState, buildingsEnabled: boolean) {
  const { graphicsReady, geometry } = state
  if (!graphicsReady) {
    const navigation = geometry.total
      ? `Navigation coverage ${geometry.done.toLocaleString()} / ${geometry.total.toLocaleString()}`
      : 'Preparing navigation coverage'
    return { heading: 'STARTING GRAPHICS', detail: `Battlefield renderer · ${navigation}`, percent: null }
  }

  if (!buildingsEnabled) return { heading: 'PREPARING THEATER', detail: 'Finalizing navigation coverage', percent: geometry.total ? geometry.done / geometry.total * 100 : null }
  const noun = geometry.phase === 'assessing' ? 'buildings' : 'world sectors'
  return {
    heading: geometry.phase === 'assessing' ? 'ASSESSING BUILDINGS' : 'PREPARING THEATER',
    detail: `${geometry.done.toLocaleString()} / ${geometry.total ? geometry.total.toLocaleString() : '…'} ${noun}`,
    percent: geometry.total ? geometry.done / geometry.total * 100 : null,
  }
}
