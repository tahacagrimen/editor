'use client'

import { useTranslation } from '@pascal-app/editor'
import type { ReactNode } from 'react'
import type { ShareSummary, ShareZoningRow } from '@/lib/share-summary'

function zoningLabel(row: ShareZoningRow, t: (source: string) => string): string {
  switch (row.kind) {
    case 'footprint':
      return `${t('Footprint area')} (TAKS ${row.limitLabel})`
    case 'total-area':
      return `${t('Total construction')} (KAKS ${row.limitLabel})`
    case 'height':
      return `${t('Height')} (Hmax)`
    case 'floors':
      return t('Floor count')
  }
}

export function ShareSummaryPanel({ summary }: { summary: ShareSummary }) {
  const t = useTranslation()
  const stats = [
    {
      label: t('Total construction'),
      value: summary.stats.totalFloorArea,
      note: `m² ${t('gross')} · ${summary.stats.levelCount} ${t('floors')}`,
    },
    {
      label: t('Footprint area'),
      value: summary.stats.footprintArea,
      note: summary.stats.taks ? `m² · TAKS ${summary.stats.taks}` : 'm²',
    },
    {
      label: t('Site area'),
      value: summary.stats.siteArea,
      note:
        summary.stats.siteAreaSource === 'registered'
          ? `m² ${t('land registry area')}`
          : summary.stats.siteAreaSource === 'measured'
            ? `m² ${t('measured area')}`
            : 'm²',
    },
    {
      label: t('Height'),
      value: summary.stats.maxHeight,
      note: summary.stats.hmax ? `m · Hmax ${summary.stats.hmax}` : 'm',
    },
  ]

  return (
    <div>
      <div className="grid grid-cols-2">
        {stats.map((stat, index) => (
          <div
            className={`border-border border-b-2 p-4 ${index % 2 === 0 ? 'border-r-2' : ''}`}
            key={stat.label}
          >
            <p className="font-extrabold text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
              {stat.label}
            </p>
            <p className="mt-1.5 font-extrabold text-[28px] leading-none tabular-nums">
              {stat.value}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{stat.note}</p>
          </div>
        ))}
      </div>

      {summary.levels.length > 0 && (
        <SummarySection title={t('Levels')}>
          {summary.levels.map((level) => (
            <div
              className="flex min-w-0 items-baseline gap-2 border-border border-t py-2"
              key={level.id}
            >
              <span className="min-w-0 flex-1 break-words text-sm">{level.name}</span>
              {level.height && (
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {level.height}
                </span>
              )}
              {level.area && (
                <span className="min-w-[78px] shrink-0 text-right text-sm tabular-nums">
                  {level.area}
                </span>
              )}
            </div>
          ))}
        </SummarySection>
      )}

      {summary.parcelRows.length > 0 && (
        <SummarySection title={t('Site and zoning')}>
          {summary.parcelRows.map((row) => (
            <div
              className="flex min-w-0 items-baseline gap-3 border-border border-t py-2"
              key={row.label}
            >
              <span className="min-w-0 flex-1 text-muted-foreground text-xs">{t(row.label)}</span>
              <span className="max-w-[65%] break-words text-right text-sm tabular-nums">
                {row.value}
              </span>
            </div>
          ))}
        </SummarySection>
      )}

      {summary.zoningRows.length > 0 && (
        <SummarySection title={t('Zoning check')}>
          {summary.zoningRows.map((row) => {
            const exceeded = row.status === 'exceeded'
            return (
              <div
                className="flex min-w-0 flex-wrap items-baseline gap-2 border-border border-t py-2"
                key={row.kind}
              >
                <span className="min-w-[150px] flex-1 text-muted-foreground text-xs">
                  {zoningLabel(row, t)}
                </span>
                <span className="shrink-0 text-sm tabular-nums">{row.value}</span>
                <span
                  className={`min-w-[58px] shrink-0 border px-1.5 py-0.5 text-center font-extrabold text-[10px] uppercase tracking-[0.06em] ${
                    exceeded
                      ? 'border-destructive/30 bg-destructive/15 text-red-700 dark:text-red-400'
                      : 'border-border bg-muted text-foreground'
                  }`}
                >
                  {t(exceeded ? 'Exceeded' : 'Suitable')}
                </span>
              </div>
            )
          })}
        </SummarySection>
      )}
    </div>
  )
}

function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border border-b-2 p-4">
      <h2 className="mb-2.5 font-extrabold text-xs uppercase tracking-[0.08em]">{title}</h2>
      {children}
    </section>
  )
}
