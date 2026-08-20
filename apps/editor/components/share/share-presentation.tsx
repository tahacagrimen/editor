'use client'

import type { BuildingNode, LevelNode } from '@pascal-app/core'
import { applySceneGraphToEditor, type SceneGraph, useTranslation } from '@pascal-app/editor'
import { SceneEnvironment, useViewer, Viewer } from '@pascal-app/viewer'
import { CameraControls } from '@react-three/drei'
import { Eye } from 'lucide-react'
import { useLayoutEffect, useMemo, useState } from 'react'
import type { ShareLocation } from '@/lib/share-location'
import type { SharePresentationMeta } from '@/lib/share-presentation-meta'
import { formatShareLevelStats, readShareLevels } from '@/lib/share-scene-levels'
import type { ShareSummary } from '@/lib/share-summary'
import { ShareFloorplan } from './share-floorplan'
import { ShareLocationPanel } from './share-location-panel'
import { ShareQuantitiesPanel } from './share-quantities-panel'
import { ShareSummaryPanel } from './share-summary-panel'

export type ShareViewState = {
  mode: '3d' | '2d'
  levelIdx: number
  tab: 'ozet' | 'metraj' | 'konum' | 'yorum'
}

type ShareTab = ShareViewState['tab']

const TABS: { id: ShareTab; label: string }[] = [
  { id: 'ozet', label: 'Summary' },
  { id: 'metraj', label: 'Quantities' },
  { id: 'konum', label: 'Location' },
  { id: 'yorum', label: 'Comments' },
]

function ShareCameraControls() {
  return (
    <CameraControls
      makeDefault
      maxDistance={500}
      maxPolarAngle={Math.PI / 2 - 0.05}
      minDistance={1}
      minPolarAngle={0}
    />
  )
}

export function SharePresentation({
  initialScene,
  location,
  meta,
  summary,
  allowComments = true,
  showCost = true,
}: {
  initialScene: SceneGraph
  location: ShareLocation | null
  meta: SharePresentationMeta
  summary: ShareSummary
  allowComments?: boolean
  showCost?: boolean
}) {
  const t = useTranslation()
  const [viewState, setViewState] = useState<ShareViewState>({
    mode: '3d',
    levelIdx: 0,
    tab: 'ozet',
  })

  const levels = useMemo(() => readShareLevels(initialScene), [initialScene])
  const levelIdx = levels.length === 0 ? 0 : Math.min(viewState.levelIdx, levels.length - 1)
  const selectedLevel = levels[levelIdx] ?? null
  const commentCount = Object.keys(initialScene.comments ?? {}).length
  const metadataLines = [meta.parcelLine, meta.revisionLine, meta.sharedByLine].filter(
    (line): line is string => Boolean(line),
  )
  const tabs = location ? TABS : TABS.filter((tab) => tab.id !== 'konum')

  // Viewer is store-backed. Hydrating the server-provided graph is the only
  // scene write on this page; presentation state remains local and no save,
  // collaboration, history, or editor command surface is mounted.
  useLayoutEffect(() => {
    applySceneGraphToEditor(initialScene)
  }, [initialScene])

  useLayoutEffect(() => {
    useViewer.getState().setSelection({
      buildingId: selectedLevel?.buildingId
        ? (selectedLevel.buildingId as BuildingNode['id'])
        : null,
      levelId: selectedLevel ? (selectedLevel.id as LevelNode['id']) : null,
      selectedIds: [],
      zoneId: null,
    })
  }, [selectedLevel])

  const selectTab = (tab: ShareTab) => {
    setViewState((current) => ({ ...current, tab }))
  }

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-20 border-border border-b-2 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3">
          <div className="flex items-baseline gap-1.5 font-extrabold tracking-tight">
            <span>MENART</span>
            <span className="text-primary">3D</span>
          </div>
          <div className="min-w-0 flex-1" />
          <span className="inline-flex min-h-9 shrink-0 items-center gap-1.5 border border-border px-2 text-[11px] font-extrabold uppercase tracking-[0.08em]">
            <Eye aria-hidden="true" className="size-3.5" />
            {t('Read only')}
          </span>
        </div>
        <div className="mx-auto min-w-0 max-w-[1440px] px-4 pb-1">
          <h1 className="min-w-0 break-words font-extrabold text-xl leading-tight tracking-tight [text-wrap:pretty]">
            {meta.name}
          </h1>
        </div>
        <ShareMetadataLines
          expiryLine={meta.expiryLine}
          expiryUrgent={meta.expiryUrgent}
          lines={metadataLines}
        />
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-wrap items-start">
        <section className="min-w-0 flex-[1_1_460px] border-border border-b-2 min-[860px]:border-r-2">
          <div className="flex min-w-0 items-stretch border-border border-b-2">
            {(['3d', '2d'] as const).map((mode) => {
              const selected = viewState.mode === mode
              return (
                <button
                  aria-pressed={selected}
                  className={`min-h-12 shrink-0 px-4 text-left font-extrabold text-xs uppercase tracking-[0.04em] transition-colors ${
                    selected
                      ? 'bg-foreground text-background'
                      : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  key={mode}
                  onClick={() => setViewState((current) => ({ ...current, mode }))}
                  type="button"
                >
                  {t(mode === '3d' ? '3D model' : 'Floor plan')}
                </button>
              )
            })}
          </div>

          <div
            className="relative h-[clamp(300px,50vh,560px)] min-w-0 overflow-hidden bg-muted"
            data-level-id={selectedLevel?.id}
          >
            <div
              aria-hidden={viewState.mode !== '3d'}
              className={`absolute inset-0 ${viewState.mode === '3d' ? 'block' : 'hidden'}`}
            >
              <Viewer
                defaultRender={{ shading: 'solid' }}
                renderContext="viewer"
                selectionManager="custom"
              >
                <SceneEnvironment />
                <ShareCameraControls />
              </Viewer>
            </div>

            <div
              aria-hidden={viewState.mode !== '2d'}
              className={`absolute inset-0 ${viewState.mode === '2d' ? 'block' : 'hidden'}`}
            >
              <ShareFloorplan
                active={viewState.mode === '2d'}
                graph={initialScene}
                levelId={selectedLevel?.id ?? null}
              />
            </div>

            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
              <span className="border border-border bg-background/90 px-2 py-1 font-extrabold text-[10px] uppercase tracking-[0.08em] shadow-sm">
                {viewState.mode === '3d'
                  ? `${t('View')} · ${t('3D')}`
                  : `${t('View')} · ${selectedLevel?.name ?? t('Floor plan')}`}
              </span>
              <span className="border border-border bg-background/90 px-2 py-1 font-extrabold text-[10px] uppercase tracking-[0.08em] shadow-sm">
                {viewState.mode === '3d' ? t('North ↑') : '1:100'}
              </span>
            </div>
          </div>

          {levels.length > 1 && (
            <div className="flex max-w-full overflow-x-auto border-border border-t-2">
              {levels.map((level, index) => {
                const selected = index === levelIdx
                const stats = formatShareLevelStats(level)
                return (
                  <button
                    aria-pressed={selected}
                    className={`min-h-14 min-w-36 shrink-0 border-border border-r px-4 py-2 text-left text-xs transition-colors ${
                      selected
                        ? 'border-b-[3px] border-b-primary bg-accent font-extrabold text-foreground'
                        : 'border-b-[3px] border-b-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                    }`}
                    key={level.id}
                    onClick={() => setViewState((current) => ({ ...current, levelIdx: index }))}
                    type="button"
                  >
                    <span className="block">{level.name}</span>
                    {stats && (
                      <span className="mt-0.5 block whitespace-nowrap font-normal text-[11px] text-muted-foreground tabular-nums">
                        {stats}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 flex-[1_1_400px]">
          <div
            aria-label={t('Shared scene details')}
            className="flex max-w-full overflow-x-auto border-border border-b-2"
            role="tablist"
          >
            {tabs.map((tab) => {
              const selected = viewState.tab === tab.id
              return (
                <button
                  aria-controls={`share-tab-panel-${tab.id}`}
                  aria-selected={selected}
                  className={`min-h-12 shrink-0 border-b-2 px-4 text-left font-extrabold text-xs uppercase tracking-[0.04em] transition-colors ${
                    selected
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  }`}
                  id={`share-tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {t(tab.label)}
                  {tab.id === 'yorum' && commentCount > 0 ? <>&nbsp;{commentCount}</> : null}
                </button>
              )
            })}
          </div>

          <ShareTabPanel
            allowComments={allowComments}
            commentCount={commentCount}
            selectedLevelId={selectedLevel?.id ?? null}
            selectedLevelArea={selectedLevel?.area ?? null}
            selectedLevelName={selectedLevel?.name ?? null}
            showCost={showCost}
            summary={summary}
            tab={viewState.tab}
            location={location}
          />
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1440px] flex-wrap gap-x-4 gap-y-1 border-border border-t-2 px-4 py-4 text-muted-foreground text-xs tabular-nums">
        <span className="break-words font-extrabold text-foreground">{meta.name}</span>
        {metadataLines.map((line) => (
          <span key={line}>{line}</span>
        ))}
        {meta.expiryLine && (
          <span
            className={meta.expiryUrgent ? 'font-extrabold text-red-700 dark:text-red-400' : ''}
          >
            {meta.expiryLine}
          </span>
        )}
        <span>{t('View-only share link · editing is disabled')}</span>
        <a
          className="text-primary hover:underline"
          href="https://draw.menartmimarlik.com/"
          rel="noreferrer"
          target="_blank"
        >
          {t('Made with Menart 3D')}
        </a>
      </footer>
    </div>
  )
}

function ShareMetadataLines({
  lines,
  expiryLine,
  expiryUrgent,
}: {
  lines: string[]
  expiryLine?: string
  expiryUrgent?: boolean
}) {
  if (lines.length === 0 && !expiryLine) return null

  return (
    <div className="mx-auto flex max-w-[1440px] flex-wrap gap-x-3.5 gap-y-1 px-4 pb-2.5 text-[11.5px] text-muted-foreground tabular-nums">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
      {expiryLine && (
        <span className={expiryUrgent ? 'font-extrabold text-red-700 dark:text-red-400' : ''}>
          {expiryLine}
        </span>
      )}
    </div>
  )
}

function ShareTabPanel({
  tab,
  selectedLevelName,
  selectedLevelId,
  selectedLevelArea,
  showCost,
  summary,
  location,
  commentCount,
  allowComments,
}: {
  tab: ShareTab
  selectedLevelName: string | null
  selectedLevelId: string | null
  selectedLevelArea: number | null
  showCost: boolean
  summary: ShareSummary
  location: ShareLocation | null
  commentCount: number
  allowComments: boolean
}) {
  const t = useTranslation()

  return (
    <div
      aria-labelledby={`share-tab-${tab}`}
      className="min-h-72 min-w-0"
      data-level-id={selectedLevelId ?? undefined}
      id={`share-tab-panel-${tab}`}
      role="tabpanel"
    >
      {tab === 'ozet' && <ShareSummaryPanel summary={summary} />}

      {tab === 'metraj' && (
        <ShareQuantitiesPanel
          selectedLevelArea={selectedLevelArea}
          selectedLevelId={selectedLevelId}
          selectedLevelName={selectedLevelName}
          showCost={showCost}
        />
      )}

      {tab === 'konum' && location && <ShareLocationPanel location={location} />}

      {tab === 'yorum' && (
        <div className="p-4">
          <p className="text-muted-foreground text-sm">
            {allowComments
              ? commentCount > 0
                ? t('Comments are available for this scene.')
                : t('No comments yet.')
              : t('This link is closed to comments. You can only view it.')}
          </p>
        </div>
      )}
    </div>
  )
}
