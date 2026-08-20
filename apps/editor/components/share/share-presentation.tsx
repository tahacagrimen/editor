'use client'

import {
  type AnyNode,
  type BuildingNode,
  type CameraPose,
  type CommentId,
  type CommentThread,
  generateCommentId,
  generateCommentReplyId,
  type LevelNode,
} from '@pascal-app/core'
import { applySceneGraphToEditor, type SceneGraph, useTranslation } from '@pascal-app/editor'
import { SceneEnvironment, useViewer, Viewer } from '@pascal-app/viewer'
import { CameraControls, type CameraControlsImpl } from '@react-three/drei'
import { Eye } from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'
import {
  buildShareCommentInput,
  numberShareComments,
  postShareCommentWrite,
  type ShareCommentDraft,
  visibleShareCommentPins,
} from '@/lib/share-comments'
import type { ShareLocation } from '@/lib/share-location'
import type { SharePresentationMeta } from '@/lib/share-presentation-meta'
import { formatShareLevelStats, readShareLevels } from '@/lib/share-scene-levels'
import type { ShareSummary } from '@/lib/share-summary'
import { ShareCommentPins3D, ShareCommentPlacement3D } from './share-comment-pins-3d'
import { ShareCommentsPanel } from './share-comments-panel'
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

function ShareCameraControls({
  controlsRef,
}: {
  controlsRef: React.RefObject<CameraControlsImpl | null>
}) {
  return (
    <CameraControls
      makeDefault
      maxDistance={500}
      maxPolarAngle={Math.PI / 2 - 0.05}
      minDistance={1}
      minPolarAngle={0}
      ref={controlsRef}
    />
  )
}

export function SharePresentation({
  initialScene,
  location,
  meta,
  summary,
  token,
  allowComments = true,
  showCost = true,
}: {
  initialScene: SceneGraph
  location: ShareLocation | null
  meta: SharePresentationMeta
  summary: ShareSummary
  token: string
  allowComments?: boolean
  showCost?: boolean
}) {
  const t = useTranslation()
  const [viewState, setViewState] = useState<ShareViewState>({
    mode: '3d',
    levelIdx: 0,
    tab: 'ozet',
  })
  const [comments, setComments] = useState<Record<CommentId, CommentThread>>(
    () => (initialScene.comments ?? {}) as Record<CommentId, CommentThread>,
  )
  const [placingComment, setPlacingComment] = useState(false)
  const [commentDraft, setCommentDraft] = useState<ShareCommentDraft | null>(null)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [savingComment, setSavingComment] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const controlsRef = useRef<CameraControlsImpl | null>(null)

  const levels = useMemo(() => readShareLevels(initialScene), [initialScene])
  const levelIdx = levels.length === 0 ? 0 : Math.min(viewState.levelIdx, levels.length - 1)
  const selectedLevel = levels[levelIdx] ?? null
  const numberedComments = useMemo(() => numberShareComments(comments), [comments])
  const visibleCommentPins = useMemo(
    () => visibleShareCommentPins(numberedComments, selectedLevel?.id ?? null),
    [numberedComments, selectedLevel?.id],
  )
  const commentCount = numberedComments.length
  const sceneNodes = initialScene.nodes as unknown as Record<string, AnyNode>
  const nodeKinds = useMemo(() => Object.values(sceneNodes).map((node) => node.type), [sceneNodes])
  const levelNames = useMemo(
    () => Object.fromEntries(levels.map((level) => [level.id, level.name])),
    [levels],
  )
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

  const performCommentWrite = useCallback(
    async (path: string, payload: unknown) => {
      setSavingComment(true)
      setCommentError(null)
      try {
        const response = await postShareCommentWrite(
          `/api/share/${encodeURIComponent(token)}/comments${path}`,
          payload,
        )
        if (!response.ok) throw new Error(`comment_save_${response.status}`)
        return true
      } catch {
        setCommentError(t('Your comment could not be saved. Please try again.'))
        return false
      } finally {
        setSavingComment(false)
      }
    },
    [t, token],
  )

  const dropComment = useCallback(
    (draft: Omit<ShareCommentDraft, 'origin'> & { camera: CameraPose }) => {
      setCommentDraft({ ...draft, origin: '3d' })
      setPlacingComment(false)
      setActiveCommentId(null)
      setViewState((current) => ({ ...current, tab: 'yorum' }))
    },
    [],
  )

  const dropFloorplanComment = useCallback(
    (position: [number, number, number]) => {
      setCommentDraft({
        position,
        ...(selectedLevel && { levelId: selectedLevel.id }),
        origin: '2d',
      })
      setPlacingComment(false)
      setActiveCommentId(null)
      setViewState((current) => ({ ...current, tab: 'yorum' }))
    },
    [selectedLevel],
  )

  const submitComment = async (author: string, body: string) => {
    if (!commentDraft) return false
    const input = buildShareCommentInput(commentDraft, author, body)
    if (!input) return false
    const id = generateCommentId()
    const createdAt = new Date().toISOString()
    const saved = await performCommentWrite('', {
      id,
      anchor: input.anchor,
      name: input.author.name,
      body: input.body,
      ...(input.levelId && { levelId: input.levelId }),
      ...(input.camera && { camera: input.camera }),
    })
    if (!saved) return false
    setComments((current) => ({
      ...current,
      [id]: { ...input, id, createdAt, replies: [] },
    }))
    setCommentDraft(null)
    setActiveCommentId(id)
    return true
  }

  const replyToComment = async (id: string, author: string, body: string) => {
    if (!(author.trim() && body.trim())) return false
    const replyId = generateCommentReplyId()
    const name = author.trim()
    const text = body.trim()
    const saved = await performCommentWrite(`/${encodeURIComponent(id)}/replies`, {
      id: replyId,
      name,
      body: text,
    })
    if (!saved) return false
    setComments((current) => {
      const thread = current[id as CommentId]
      if (!thread) return current
      return {
        ...current,
        [id]: {
          ...thread,
          replies: [
            ...thread.replies,
            {
              id: replyId,
              author: { name },
              body: text,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }
    })
    return true
  }

  const focusComment = useCallback(
    (id: string) => {
      const item = numberedComments.find(({ thread }) => thread.id === id)
      if (!item) return
      const { thread } = item
      const nextLevelIdx = thread.levelId
        ? levels.findIndex((level) => level.id === thread.levelId)
        : -1
      setActiveCommentId(id)
      setViewState((current) => ({
        ...current,
        tab: 'yorum',
        ...(nextLevelIdx >= 0 ? { levelIdx: nextLevelIdx } : {}),
        ...(thread.camera ? { mode: '3d' as const } : {}),
      }))
      window.requestAnimationFrame(() => {
        document.getElementById(`share-comment-${id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        })
        if (thread.camera && controlsRef.current) {
          const [px, py, pz] = thread.camera.position
          const [tx, ty, tz] = thread.camera.target
          void controlsRef.current.setLookAt(px, py, pz, tx, ty, tz, true)
        } else if (controlsRef.current && viewState.mode === '3d') {
          const position = controlsRef.current.getPosition(new Vector3(), false)
          const target = controlsRef.current.getTarget(new Vector3(), false)
          const [tx, ty, tz] = thread.anchor.position
          void controlsRef.current.setLookAt(
            tx + position.x - target.x,
            ty + position.y - target.y,
            tz + position.z - target.z,
            tx,
            ty,
            tz,
            true,
          )
        }
      })
    },
    [levels, numberedComments, viewState.mode],
  )

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
            className={`relative h-[clamp(300px,50vh,560px)] min-w-0 overflow-hidden bg-muted ${
              placingComment ? 'cursor-crosshair' : ''
            }`}
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
                <ShareCameraControls controlsRef={controlsRef} />
                <ShareCommentPins3D
                  activeId={activeCommentId}
                  comments={visibleCommentPins}
                  draftPosition={commentDraft?.origin === '3d' ? commentDraft.position : null}
                  nodes={sceneNodes}
                  onPinClick={focusComment}
                />
                {allowComments && placingComment && viewState.mode === '3d' && (
                  <ShareCommentPlacement3D
                    controls={controlsRef}
                    levelId={selectedLevel?.id ?? null}
                    nodeKinds={nodeKinds}
                    nodes={sceneNodes}
                    onDrop={dropComment}
                  />
                )}
              </Viewer>
            </div>

            <div
              aria-hidden={viewState.mode !== '2d'}
              className={`absolute inset-0 ${viewState.mode === '2d' ? 'block' : 'hidden'}`}
            >
              <ShareFloorplan
                active={viewState.mode === '2d'}
                activeCommentId={activeCommentId}
                comments={visibleCommentPins}
                draftPosition={commentDraft?.origin === '2d' ? commentDraft.position : null}
                graph={initialScene}
                levelId={selectedLevel?.id ?? null}
                onDropComment={dropFloorplanComment}
                onPinClick={focusComment}
                placementEnabled={allowComments && placingComment && viewState.mode === '2d'}
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
            commentsPanel={
              <ShareCommentsPanel
                activeId={activeCommentId}
                allowComments={allowComments}
                comments={numberedComments}
                draft={commentDraft}
                error={commentError}
                levelNames={levelNames}
                locale="tr-TR"
                onCancelDraft={() => setCommentDraft(null)}
                onFocus={focusComment}
                onReply={replyToComment}
                onStartPlacing={() => {
                  setCommentDraft(null)
                  setActiveCommentId(null)
                  setPlacingComment((current) => !current)
                }}
                onSubmitDraft={submitComment}
                placing={placingComment}
                saving={savingComment}
              />
            }
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
  commentsPanel,
}: {
  tab: ShareTab
  selectedLevelName: string | null
  selectedLevelId: string | null
  selectedLevelArea: number | null
  showCost: boolean
  summary: ShareSummary
  location: ShareLocation | null
  commentsPanel: React.ReactNode
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

      {tab === 'yorum' && commentsPanel}
    </div>
  )
}
