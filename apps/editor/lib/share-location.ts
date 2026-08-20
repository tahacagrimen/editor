import type { AnyNode, SiteNode } from '@pascal-app/core/schema'
import type { SceneGraph } from '@pascal-app/editor'
import { formatShareNumber } from './share-format'

export type ShareLocation = {
  points: Array<[number, number]>
  badge: string
  rows: Array<{
    label: 'Address' | 'District' | 'Coordinate' | 'North angle' | 'Source'
    value: string
  }>
  mapUrl: string
  warning:
    | 'Land registry reference data — not a surveyed site plan.'
    | 'Edited by hand — no longer the registry outline.'
    | 'User-provided parcel boundary.'
  edited: boolean
}

function findParcelSite(graph: SceneGraph): SiteNode | null {
  const nodes = graph.nodes as unknown as Record<string, AnyNode>
  for (const rootId of graph.rootNodeIds) {
    const node = nodes[rootId]
    if (node?.type === 'site' && node.parcel) return node as SiteNode
  }
  return null
}

function addressFor(site: SiteNode): string {
  const parcel = site.parcel!
  return `${parcel.mahalle} Mah. ${parcel.ada} Ada ${parcel.parsel} Parsel`
}

export function buildShareLocation(graph: SceneGraph): ShareLocation | null {
  const site = findParcelSite(graph)
  if (!site?.parcel) return null

  const parcel = site.parcel
  const hasCoordinates = typeof site.latitude === 'number' && typeof site.longitude === 'number'
  const address = addressFor(site)
  const rows: ShareLocation['rows'] = [
    { label: 'Address', value: address },
    { label: 'District', value: `${parcel.ilce} / ${parcel.il}` },
  ]
  if (hasCoordinates) {
    rows.push({
      label: 'Coordinate',
      value: `${formatShareNumber(site.latitude!, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      })} · ${formatShareNumber(site.longitude!, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      })}`,
    })
  }
  rows.push(
    {
      label: 'North angle',
      value: `${formatShareNumber(site.northOffset ?? 0, { maximumFractionDigits: 2 })}°`,
    },
    {
      label: 'Source',
      value: parcel.source === 'tkgm' ? 'TKGM parcel query' : 'Manual parcel record',
    },
  )

  const mapQuery = hasCoordinates ? `${site.latitude},${site.longitude}` : address
  return {
    points: (site.polygon?.points ?? []).map(([x, z]) => [x, z]),
    badge: `${parcel.source === 'tkgm' ? 'TKGM' : 'Manual'} · Ada ${parcel.ada} / Parsel ${parcel.parsel}`,
    rows,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`,
    warning: parcel.edited
      ? 'Edited by hand — no longer the registry outline.'
      : parcel.source === 'tkgm'
        ? 'Land registry reference data — not a surveyed site plan.'
        : 'User-provided parcel boundary.',
    edited: parcel.edited,
  }
}
