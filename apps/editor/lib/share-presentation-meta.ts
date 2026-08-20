import type { SceneGraph } from '@pascal-app/editor'

const EXPIRY_WARNING_WINDOW_MS = 48 * 60 * 60 * 1000

const turkishDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export type SharePresentationMeta = {
  name: string
  parcelLine?: string
  revisionLine?: string
  sharedByLine?: string
  expiryLine?: string
  expiryUrgent?: boolean
}

type ShareMetaInput = {
  name: string
  version: number
  updatedAt: string
  graph: SceneGraph
  ownerName?: string | null
  expiresAtSeconds?: number
  nowMs?: number
}

type ParcelSummary = {
  il: string
  ilce: string
  mahalle: string
  ada: string
  parsel: string
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readParcelSummary(graph: SceneGraph): ParcelSummary | null {
  const visited = new Set<string>()
  const pending = [...graph.rootNodeIds]

  while (pending.length > 0) {
    const nodeId = pending.shift()
    if (!(nodeId && !visited.has(nodeId))) continue
    visited.add(nodeId)

    const value = graph.nodes[nodeId]
    if (!(value && typeof value === 'object')) continue
    const node = value as unknown as Record<string, unknown>

    if (node.type === 'site' && node.parcel && typeof node.parcel === 'object') {
      const parcel = node.parcel as Record<string, unknown>
      const il = nonEmptyString(parcel.il)
      const ilce = nonEmptyString(parcel.ilce)
      const mahalle = nonEmptyString(parcel.mahalle)
      const ada = nonEmptyString(parcel.ada)
      const parsel = nonEmptyString(parcel.parsel)

      if (il && ilce && mahalle && ada && parsel) {
        return { il, ilce, mahalle, ada, parsel }
      }
    }

    if (Array.isArray(node.children)) {
      for (const childId of node.children) {
        if (typeof childId === 'string') pending.push(childId)
      }
    }
  }

  return null
}

export function formatShareDate(value: string | number): string | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : turkishDateFormatter.format(date)
}

export function buildSharePresentationMeta({
  name,
  version,
  updatedAt,
  graph,
  ownerName,
  expiresAtSeconds,
  nowMs = Date.now(),
}: ShareMetaInput): SharePresentationMeta {
  const parcel = readParcelSummary(graph)
  const updatedDate = formatShareDate(updatedAt)
  const owner = nonEmptyString(ownerName)
  const expiresAtMs =
    typeof expiresAtSeconds === 'number' && Number.isFinite(expiresAtSeconds)
      ? expiresAtSeconds * 1000
      : null
  const expiryDate = expiresAtMs === null ? null : formatShareDate(expiresAtMs)

  return {
    name,
    parcelLine: parcel
      ? `${parcel.il} / ${parcel.ilce} / ${parcel.mahalle} · Ada ${parcel.ada} / Parsel ${parcel.parsel}`
      : undefined,
    revisionLine: updatedDate ? `Rev. ${version} · ${updatedDate}` : undefined,
    sharedByLine: owner ? `Paylaşan: ${owner}` : undefined,
    expiryLine: expiryDate ? `${expiryDate}’ya kadar geçerli` : undefined,
    expiryUrgent:
      expiresAtMs === null
        ? undefined
        : expiresAtMs > nowMs && expiresAtMs - nowMs < EXPIRY_WARNING_WINDOW_MS,
  }
}
