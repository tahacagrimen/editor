import type { SceneGraph } from '@pascal-app/editor'
import { type I18nLocale, translate } from '@pascal-app/editor/i18n'
import { formatShareDate as formatShareDateValue } from './share-format'

const EXPIRY_WARNING_WINDOW_MS = 48 * 60 * 60 * 1000

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
  locale?: I18nLocale
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
  return formatShareDateValue(value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function buildSharePresentationMeta({
  name,
  version,
  updatedAt,
  graph,
  ownerName,
  expiresAtSeconds,
  nowMs = Date.now(),
  locale = 'tr',
}: ShareMetaInput): SharePresentationMeta {
  const t = (source: string) => translate(source, locale)
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
      ? `${parcel.il} / ${parcel.ilce} / ${parcel.mahalle} · ${t('Block')} ${parcel.ada} / ${t('Parcel')} ${parcel.parsel}`
      : undefined,
    revisionLine: updatedDate ? `${t('Rev.')} ${version} · ${updatedDate}` : undefined,
    sharedByLine: owner ? `${t('Shared by')}: ${owner}` : undefined,
    expiryLine: expiryDate ? `${t('Valid until')} ${expiryDate}` : undefined,
    expiryUrgent:
      expiresAtMs === null
        ? undefined
        : expiresAtMs > nowMs && expiresAtMs - nowMs < EXPIRY_WARNING_WINDOW_MS,
  }
}
