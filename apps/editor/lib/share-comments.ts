import type { AnyNodeId, CameraPose, CommentId, CommentThread } from '@pascal-app/core'
import { formatShareDate } from './share-format'

export type NumberedShareComment = {
  number: number
  thread: CommentThread
}

export type ShareCommentDraft = {
  position: [number, number, number]
  nodeId?: string
  offset?: [number, number, number]
  levelId?: string
  origin: '2d' | '3d'
  camera?: CameraPose
}

type ShareCommentInput = Omit<CommentThread, 'id' | 'createdAt' | 'replies'> &
  Partial<Pick<CommentThread, 'createdAt' | 'replies'>>

export function buildShareCommentInput(
  draft: ShareCommentDraft,
  author: string,
  body: string,
): ShareCommentInput | null {
  const name = author.trim()
  const text = body.trim()
  if (!(name && text)) return null

  return {
    anchor: {
      position: draft.position,
      ...(draft.nodeId && { nodeId: draft.nodeId as AnyNodeId }),
      ...(draft.offset && { offset: draft.offset }),
    },
    author: { name },
    body: text,
    ...(draft.levelId && { levelId: draft.levelId as AnyNodeId }),
    ...(draft.origin === '3d' && draft.camera ? { camera: draft.camera } : {}),
  }
}

/** A conflict retry reuses the exact client-generated id in `payload`. */
export async function postShareCommentWrite(
  url: string,
  payload: unknown,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let response: Response | null = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (response.status !== 409 || attempt === 1) return response
  }
  return response ?? new Response(null, { status: 500 })
}

/**
 * Pin numbers are document-wide and stable: filtering the visible level must
 * never renumber the same discussion differently in the scene and the list.
 */
export function numberShareComments(
  comments: Record<CommentId, CommentThread>,
): NumberedShareComment[] {
  return Object.values(comments)
    .sort((left, right) =>
      left.createdAt === right.createdAt
        ? left.id.localeCompare(right.id)
        : left.createdAt.localeCompare(right.createdAt),
    )
    .map((thread, index) => ({ number: index + 1, thread }))
}

export function visibleShareCommentPins(
  comments: NumberedShareComment[],
  levelId: string | null,
): NumberedShareComment[] {
  return comments.filter(({ thread }) => !thread.levelId || thread.levelId === levelId)
}

export function formatShareCommentTime(iso: string, locale: string): string {
  // Keep the parameter until the app's two locale sources are reconciled.
  void locale
  return (
    formatShareDate(iso, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }) ?? ''
  )
}

export function floorplanPointToWorld(
  point: { x: number; y: number },
  buildingPosition: readonly [number, number, number],
  buildingRotationY: number,
): [number, number, number] {
  const cos = Math.cos(buildingRotationY)
  const sin = Math.sin(buildingRotationY)
  return [
    buildingPosition[0] + point.x * cos + point.y * sin,
    0,
    buildingPosition[2] - point.x * sin + point.y * cos,
  ]
}

export function worldPointToFloorplan(
  point: readonly [number, number, number],
  buildingPosition: readonly [number, number, number],
  buildingRotationY: number,
): { x: number; y: number } {
  const dx = point[0] - buildingPosition[0]
  const dz = point[2] - buildingPosition[2]
  const cos = Math.cos(buildingRotationY)
  const sin = Math.sin(buildingRotationY)
  return {
    x: dx * cos - dz * sin,
    y: dx * sin + dz * cos,
  }
}
