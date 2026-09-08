import type { FeatureCollection } from 'geojson'
export type FilterSpecification = unknown[]
export interface LayerSpecification { id: string; type: string; source?: string; 'source-layer'?: string; filter?: unknown[]; layout?: Record<string, unknown>; paint?: Record<string, unknown>; minzoom?: number; maxzoom?: number }
export interface StyleSpecification { version: number; sources: Record<string, { type: string; data?: FeatureCollection | string; [key: string]: unknown }>; layers: LayerSpecification[]; [key: string]: unknown }
