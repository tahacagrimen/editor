import type { AnyNode, AnyNodeId, SiteNode } from '@pascal-app/core/schema'
import { readSiteBuildable } from '@pascal-app/core/site-setbacks'
import { readSiteZoning } from '@pascal-app/core/site-zoning'
import type { SceneGraph } from '@pascal-app/editor'
import { formatShareNumber } from './share-format'
import { readShareLevels } from './share-scene-levels'

export type ShareParcelRow = {
  label: 'Location' | 'Neighbourhood' | 'Block / parcel' | 'Sheet' | 'Quality' | 'Land area'
  value: string
}

export type ShareZoningRow = {
  kind: 'footprint' | 'total-area' | 'height' | 'floors'
  limitLabel?: string
  value: string
  status: 'ok' | 'exceeded'
}

export type ShareSummary = {
  stats: {
    totalFloorArea: string
    footprintArea: string
    siteArea: string
    maxHeight: string
    levelCount: number
    taks?: string
    hmax?: string
    siteAreaSource?: 'registered' | 'measured'
  }
  levels: Array<{
    id: string
    name: string
    height: string | null
    area: string | null
  }>
  parcelRows: ShareParcelRow[]
  zoningRows: ShareZoningRow[]
}

function number(value: number): string {
  return formatShareNumber(value)
}

function findSite(graph: SceneGraph): SiteNode | null {
  const nodes = graph.nodes as unknown as Record<AnyNodeId, AnyNode>
  for (const rootNodeId of graph.rootNodeIds as AnyNodeId[]) {
    const node = nodes[rootNodeId]
    if (node?.type === 'site') return node as SiteNode
  }
  return null
}

export function buildShareSummary(graph: SceneGraph): ShareSummary {
  const nodes = graph.nodes as unknown as Record<AnyNodeId, AnyNode>
  const site = findSite(graph)
  const zoningReading = readSiteZoning(nodes)
  const buildableReading = readSiteBuildable(site?.polygon?.points, site ?? undefined)
  const levels = readShareLevels(graph)
  const parcel = site?.parcel
  const zoning = site?.zoning
  const referenceArea = parcel?.registeredArea ?? buildableReading.parcelArea

  const parcelRows: ShareParcelRow[] = []
  if (parcel) {
    parcelRows.push(
      { label: 'Location', value: [parcel.il, parcel.ilce].filter(Boolean).join(' / ') },
      { label: 'Neighbourhood', value: parcel.mahalle },
      { label: 'Block / parcel', value: `${parcel.ada} / ${parcel.parsel}` },
    )
    if (parcel.pafta) parcelRows.push({ label: 'Sheet', value: parcel.pafta })
    if (parcel.nitelik) parcelRows.push({ label: 'Quality', value: parcel.nitelik })
    parcelRows.push({
      label: 'Land area',
      value: `${number(parcel.registeredArea ?? buildableReading.parcelArea)} m²`,
    })
  }

  const zoningRows: ShareZoningRow[] = []
  if (zoning?.taks !== undefined) {
    const limit = referenceArea * zoning.taks
    zoningRows.push({
      kind: 'footprint',
      limitLabel: number(zoning.taks),
      value: `${number(zoningReading.footprintArea)} / ${number(limit)} m²`,
      status: zoningReading.footprintArea > limit ? 'exceeded' : 'ok',
    })
  }
  if (zoning?.kaks !== undefined) {
    const limit = referenceArea * zoning.kaks
    zoningRows.push({
      kind: 'total-area',
      limitLabel: number(zoning.kaks),
      value: `${number(zoningReading.totalFloorArea)} / ${number(limit)} m²`,
      status: zoningReading.totalFloorArea > limit ? 'exceeded' : 'ok',
    })
  }
  if (zoning?.maxHeight !== undefined) {
    zoningRows.push({
      kind: 'height',
      value: `${number(zoningReading.maxHeight)} / ${number(zoning.maxHeight)} m`,
      status: zoningReading.maxHeight > zoning.maxHeight ? 'exceeded' : 'ok',
    })
  }
  if (zoning?.maxFloors !== undefined) {
    zoningRows.push({
      kind: 'floors',
      value: `${zoningReading.maxFloors} / ${zoning.maxFloors}`,
      status: zoningReading.maxFloors > zoning.maxFloors ? 'exceeded' : 'ok',
    })
  }

  return {
    stats: {
      totalFloorArea: number(zoningReading.totalFloorArea),
      footprintArea: number(zoningReading.footprintArea),
      siteArea: number(buildableReading.parcelArea),
      maxHeight: number(zoningReading.maxHeight),
      levelCount: zoningReading.maxFloors || levels.length,
      taks: zoning?.taks === undefined ? undefined : number(zoning.taks),
      hmax: zoning?.maxHeight === undefined ? undefined : number(zoning.maxHeight),
      siteAreaSource: parcel
        ? parcel.registeredArea === undefined
          ? 'measured'
          : 'registered'
        : undefined,
    },
    levels: levels.map((level) => ({
      id: level.id,
      name: level.name,
      height: level.height === null ? null : `${number(level.height)} m`,
      area: level.area === null ? null : `${number(level.area)} m²`,
    })),
    parcelRows,
    zoningRows,
  }
}
