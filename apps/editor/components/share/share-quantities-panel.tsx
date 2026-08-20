'use client'

import {
  type AnyNodeId,
  type PricedQuantityLine,
  priceQuantityTakeoff,
  useScene,
} from '@pascal-app/core'
import { useTranslation } from '@pascal-app/editor'
import { downloadQuantityCsv, takeoffForSubtree } from '@pascal-app/editor/quantities'
import { Download } from 'lucide-react'
import { useMemo } from 'react'
import { formatShareMoney, formatShareQuantity } from '@/lib/share-format'

function titleCaseEnum(value: string): string {
  return value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function downloadName(levelName: string | null): string {
  const stem = (levelName ?? 'level')
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .toLocaleLowerCase('tr-TR')
  return `${stem || 'level'}-metraj.csv`
}

export function ShareQuantitiesPanel({
  selectedLevelId,
  selectedLevelName,
  selectedLevelArea,
  showCost,
}: {
  selectedLevelId: string | null
  selectedLevelName: string | null
  selectedLevelArea: number | null
  showCost: boolean
}) {
  const t = useTranslation()
  const nodes = useScene((state) => state.nodes)
  const materials = useScene((state) => state.materials)
  const unitPrices = useScene((state) => state.unitPrices)

  const takeoff = useMemo(
    () =>
      selectedLevelId
        ? takeoffForSubtree(selectedLevelId as AnyNodeId, { materials, nodes })
        : null,
    [materials, nodes, selectedLevelId],
  )
  const priced = useMemo(
    () => (takeoff ? priceQuantityTakeoff(takeoff, unitPrices) : null),
    [takeoff, unitPrices],
  )
  const hasRows = (priced?.sections.length ?? 0) > 0
  const levelLabel = selectedLevelName ? t(selectedLevelName) : t('Selected level')

  const downloadCsv = () => {
    if (!priced) return
    downloadQuantityCsv(priced, downloadName(selectedLevelName), { showCost })
  }

  return (
    <div className="min-w-0">
      <div className="flex min-h-14 items-center gap-3 border-border border-b-2 px-4 py-2.5">
        <p className="min-w-0 flex-1 break-words text-muted-foreground text-xs">
          <span className="text-foreground">{levelLabel}</span> · {t('live quantities')}
        </p>
        <button
          aria-label={t('Export quantities as CSV')}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 border border-border px-3 font-extrabold text-[11px] uppercase tracking-[0.06em] transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!hasRows}
          onClick={downloadCsv}
          type="button"
        >
          <Download aria-hidden="true" className="size-3.5" />
          CSV
        </button>
      </div>

      {!selectedLevelId ? (
        <p className="border-border border-b-2 px-4 py-5 text-muted-foreground text-sm">
          {t('Select a level to measure it.')}
        </p>
      ) : !hasRows ? (
        <p className="border-border border-b-2 px-4 py-5 text-muted-foreground text-sm">
          {t('Nothing to measure on this level yet.')}
        </p>
      ) : (
        <>
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[520px] w-full border-collapse text-sm tabular-nums">
              <thead>
                <tr className="border-border border-b">
                  <th className="px-4 py-3 text-left font-extrabold text-[10px] uppercase tracking-[0.06em]">
                    {t('Takeoff item')}
                  </th>
                  <th className="px-4 py-3 text-right font-extrabold text-[10px] uppercase tracking-[0.06em]">
                    {t('Quantity')}
                  </th>
                  {showCost && (
                    <>
                      <th className="px-4 py-3 text-right font-extrabold text-[10px] uppercase tracking-[0.06em]">
                        {t('Unit price')}
                      </th>
                      <th className="px-4 py-3 text-right font-extrabold text-[10px] uppercase tracking-[0.06em]">
                        {t('Amount')}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {priced?.sections.map((section) => (
                  <QuantitySectionRows
                    key={section.kind}
                    lines={section.lines}
                    sectionLabel={t(section.label)}
                    showCost={showCost}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-border border-b-2 bg-accent px-4 py-3">
            {showCost ? (
              priced?.totals.length ? (
                priced.totals.map((total) => (
                  <div className="flex items-baseline gap-3" key={total.currency}>
                    <span className="min-w-0 flex-1 font-extrabold text-xs uppercase tracking-[0.06em]">
                      {levelLabel} {t('total')}
                    </span>
                    <span className="shrink-0 font-extrabold text-lg tabular-nums">
                      {formatShareMoney(total.cost, total.currency)}
                    </span>
                  </div>
                ))
              ) : (
                <TotalLine label={`${levelLabel} ${t('total')}`} value="—" />
              )
            ) : (
              <TotalLine
                label={levelLabel}
                value={
                  selectedLevelArea === null ? '—' : formatShareQuantity(selectedLevelArea, 'area')
                }
              />
            )}
          </div>
        </>
      )}

      <p className="border-border border-b-2 px-4 py-3 text-[11.5px] text-muted-foreground leading-relaxed">
        {t(
          'Quantities belong to the selected level and exclude hidden items. Wall face area is gross — openings are not subtracted. Unit prices are estimates, not quotations.',
        )}
      </p>
    </div>
  )
}

function QuantitySectionRows({
  sectionLabel,
  lines,
  showCost,
  t,
}: {
  sectionLabel: string
  lines: PricedQuantityLine[]
  showCost: boolean
  t: (source: string) => string
}) {
  return (
    <>
      <tr className="border-border border-b bg-muted/60">
        <th
          className="px-4 py-2 text-left font-extrabold text-[10px] uppercase tracking-[0.08em]"
          colSpan={showCost ? 4 : 2}
        >
          {sectionLabel}
        </th>
      </tr>
      {lines.map((line) => {
        const label = line.group
          ? `${t(titleCaseEnum(line.group))} · ${t(line.label)}`
          : t(line.label)
        return (
          <tr className="border-border border-b" key={`${line.key}-${line.group ?? ''}`}>
            <td className="max-w-64 px-4 py-2.5 text-muted-foreground">{label}</td>
            <td className="whitespace-nowrap px-4 py-2.5 text-right">
              {formatShareQuantity(line.value, line.unit)}
            </td>
            {showCost && (
              <>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  {line.unitPrice
                    ? formatShareMoney(line.unitPrice.amount, line.unitPrice.currency)
                    : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  {line.unitPrice && line.cost !== undefined
                    ? formatShareMoney(line.cost, line.unitPrice.currency)
                    : '—'}
                </td>
              </>
            )}
          </tr>
        )
      })}
    </>
  )
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="min-w-0 flex-1 font-extrabold text-xs uppercase tracking-[0.06em]">
        {label}
      </span>
      <span className="shrink-0 font-extrabold text-lg tabular-nums">{value}</span>
    </div>
  )
}
