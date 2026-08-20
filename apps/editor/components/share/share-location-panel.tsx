'use client'

import { useTranslation } from '@pascal-app/editor'
import { ExternalLink, MapPin } from 'lucide-react'
import type { ShareLocation } from '@/lib/share-location'

function parcelViewBox(points: Array<[number, number]>): string {
  if (points.length === 0) return '-1 -1 2 2'
  const xs = points.map(([x]) => x)
  const ys = points.map(([, z]) => z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const span = Math.max(maxX - minX, maxY - minY, 1)
  const padding = span * 0.18
  return `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`
}

export function ShareLocationPanel({ location }: { location: ShareLocation }) {
  const t = useTranslation()
  const polygon = location.points.map(([x, z]) => `${x},${z}`).join(' ')

  return (
    <div className="min-w-0">
      <div
        aria-label={t('Parcel boundary map')}
        className="relative h-[260px] overflow-hidden border-border border-b-2 bg-muted"
        role="img"
      >
        <svg
          aria-hidden="true"
          className="size-full"
          preserveAspectRatio="xMidYMid meet"
          viewBox={parcelViewBox(location.points)}
        >
          <defs>
            <pattern height="12" id="share-map-grid" patternUnits="userSpaceOnUse" width="12">
              <path className="stroke-foreground/10" d="M 12 0 L 0 0 0 12" fill="none" />
            </pattern>
          </defs>
          <rect fill="url(#share-map-grid)" height="100%" width="100%" />
          {location.points.length >= 3 && (
            <polygon
              className="fill-primary/15 stroke-primary"
              points={polygon}
              strokeLinejoin="round"
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {location.points.length < 3 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <MapPin aria-hidden="true" className="size-8" strokeWidth={1.4} />
            <span className="text-xs">{t('Parcel boundary unavailable')}</span>
          </div>
        )}
        <span className="absolute bottom-3 left-3 border border-border bg-background/90 px-2 py-1 font-extrabold text-[10px] uppercase tracking-[0.08em] shadow-sm tabular-nums">
          {location.badge}
        </span>
      </div>

      <div className="border-border border-b-2 p-4">
        {location.rows.map((row) => (
          <div
            className="flex min-w-0 items-baseline gap-3 border-border border-t py-2"
            key={row.label}
          >
            <span className="min-w-0 flex-1 text-muted-foreground text-xs">{t(row.label)}</span>
            <span className="max-w-[68%] break-words text-right text-sm tabular-nums">
              {t(row.value)}
            </span>
          </div>
        ))}

        <a
          className="mt-3 inline-flex min-h-11 items-center gap-2 border border-border px-3 font-extrabold text-xs uppercase tracking-[0.05em] transition-colors hover:bg-accent"
          href={location.mapUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          {t('Open in maps')}
        </a>

        <p
          className={`mt-3 border px-2 py-2 text-[11px] leading-relaxed ${
            location.edited
              ? 'border-selected/40 bg-selected/10 text-selected'
              : 'border-warn-foreground/30 bg-warn text-warn-foreground'
          }`}
        >
          {t(location.warning)}
        </p>
      </div>
    </div>
  )
}
