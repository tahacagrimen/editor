'use client'

import {
  type AnyNode,
  type AnyNodeId,
  buildQuantityTakeoff,
  nodeRegistry,
  type PricedQuantityLine,
  type PricedQuantityTakeoff,
  QUANTITY_UNIT_SUFFIX,
  type QuantitiesContribution,
  type QuantityTakeoff,
  type QuantityUnit,
  quantityTakeoffToCsv,
  useScene,
} from '@pascal-app/core'
import {
  formatAreaLabel,
  formatLinearMeasurement,
  formatVolumeLabel,
  type LinearUnit,
  type MetricNotation,
} from './measurements'

/**
 * The editor's binding of the core takeoff to the live registry and scene.
 *
 * Core stays free of the registry singleton — it takes a lookup — so this is
 * the one place the two meet.
 */
type TakeoffScene = Pick<ReturnType<typeof useScene.getState>, 'nodes' | 'materials'>

export function takeoffForSubtree(
  rootId: AnyNodeId,
  scene: TakeoffScene = useScene.getState(),
): QuantityTakeoff {
  return buildQuantityTakeoff(
    scene.nodes as Readonly<Record<AnyNodeId, AnyNode>>,
    rootId,
    (kind) => nodeRegistry.get(kind)?.quantities as QuantitiesContribution<AnyNode> | undefined,
    scene.materials,
  )
}

/** Format a takeoff value for display in the user's chosen units. */
export function formatQuantity(
  value: number,
  quantityUnit: QuantityUnit,
  unit: LinearUnit,
  metricNotation: MetricNotation = 'meters',
  fractionDigits?: number,
): string {
  switch (quantityUnit) {
    case 'length':
      return formatLinearMeasurement(value, unit, metricNotation, fractionDigits ?? 2)
    case 'area':
      return formatAreaLabel(value, unit, fractionDigits ?? 1)
    case 'volume':
      return formatVolumeLabel(value, unit, fractionDigits ?? 1)
    default:
      // A tally is a whole number of things; rounding hides the float drift a
      // summed 1-per-node row can accumulate.
      return String(Math.round(value))
  }
}

const costFormatters = new Map<string, Intl.NumberFormat>()

/**
 * Format a monetary amount in the app's number locale.
 *
 * Seeded from `document.documentElement.lang` for the same reason every other
 * number readout is: the layout hardcodes `lang="tr"`, so costs render with a
 * Turkish decimal comma regardless of `useUiPreferences.locale`. Formatters are
 * cached — a takeoff panel rebuilds per keystroke, and `Intl.NumberFormat`
 * construction is not free.
 */
export function formatCost(amount: number, currency: string): string {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'tr'
  const key = `${lang}:${currency}`
  let formatter = costFormatters.get(key)
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(lang, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    } catch {
      // An unknown currency code throws; fall back to a plain amount + code.
      formatter = new Intl.NumberFormat(lang, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      return `${formatter.format(amount)} ${currency}`
    }
    costFormatters.set(key, formatter)
  }
  return formatter.format(amount)
}

const escapeCsv = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

/**
 * Serialize the same takeoff the panel displays.
 *
 * The ordinary editor export remains quantity-only. Read-only share links can
 * opt into the already-priced output; when cost visibility is off, the price
 * columns are absent rather than merely blank so the CSV mirrors the table.
 */
export function quantityDownloadCsv(
  takeoff: QuantityTakeoff | PricedQuantityTakeoff,
  options: { showCost?: boolean } = {},
): string {
  if (!options.showCost) return quantityTakeoffToCsv(takeoff)

  const lines = ['Category,Item,Group,Quantity,Unit,Count,Unit price,Currency,Cost']
  for (const section of takeoff.sections) {
    for (const rawLine of section.lines) {
      const line = rawLine as PricedQuantityLine
      lines.push(
        [
          escapeCsv(section.label),
          escapeCsv(line.label),
          escapeCsv(line.group ?? ''),
          String(Number.parseFloat(line.value.toFixed(6))),
          QUANTITY_UNIT_SUFFIX[line.unit],
          String(line.nodeCount),
          line.unitPrice ? String(line.unitPrice.amount) : '',
          escapeCsv(line.unitPrice?.currency ?? ''),
          line.cost === undefined ? '' : String(Number.parseFloat(line.cost.toFixed(6))),
        ].join(','),
      )
    }
  }
  return lines.join('\n')
}

/**
 * Hand the CSV to the browser as a download.
 *
 * The blob URL is revoked on the next tick rather than immediately — Safari
 * cancels an in-flight download when its URL is revoked in the same task.
 */
export function downloadQuantityCsv(
  takeoff: QuantityTakeoff | PricedQuantityTakeoff,
  filename = 'quantities.csv',
  options: { showCost?: boolean } = {},
): void {
  if (typeof document === 'undefined') return

  const blob = new Blob([quantityDownloadCsv(takeoff, options)], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
