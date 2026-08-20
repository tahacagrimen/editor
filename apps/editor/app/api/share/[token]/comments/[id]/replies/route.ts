import { normalizeComments } from '@pascal-app/core/schema'
import type { NextRequest } from 'next/server'
import { sceneApiJson, sceneApiPreflight } from '@/lib/scene-api-security'
import { getSceneOperations } from '@/lib/scene-store-server'
import { authorizeShareCommentWrite } from '@/lib/share-comment-route-security'
import { appendShareCommentReply, shareCommentReplySchema } from '@/lib/share-comment-write'
import { replaceShareComments } from '@/lib/share-graph'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ token: string; id: string }> }

export function OPTIONS(request: NextRequest) {
  return sceneApiPreflight(request)
}

/** Append one anonymous reply; parent authorship/body/resolution are immutable. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { token, id } = await params
  const access = await authorizeShareCommentWrite(request, token, 'reply')
  if (!access.ok) return access.response

  const parsed = shareCommentReplySchema.safeParse(await readJson(request))
  if (!parsed.success) {
    return sceneApiJson(
      request,
      { error: 'invalid_reply', details: parsed.error.issues },
      { status: 422 },
    )
  }

  const operations = await getSceneOperations()
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scene = await operations.loadStoredScene(access.payload.sid)
    if (!scene) return sceneApiJson(request, { error: 'not_found' }, { status: 404 })

    const result = appendShareCommentReply(
      normalizeComments(scene.graph.comments),
      id as `comment_${string}`,
      parsed.data,
    )
    if (!result.ok) {
      const status = result.error === 'thread_not_found' ? 404 : 422
      return sceneApiJson(request, { error: result.error }, { status })
    }
    if (!result.created) {
      return sceneApiJson(
        request,
        { id: parsed.data.id, version: scene.version, created: false },
        { status: 200 },
      )
    }

    try {
      const meta = await operations.saveScene({
        id: scene.id,
        name: scene.name,
        projectId: scene.projectId,
        ownerId: scene.ownerId,
        graph: replaceShareComments(
          scene.graph as Record<string, unknown>,
          result.comments,
        ) as never,
        thumbnailUrl: scene.thumbnailUrl,
        expectedVersion: scene.version,
        operation: 'share-comment:reply',
        saveMode: 'draft',
      })
      return sceneApiJson(
        request,
        { id: parsed.data.id, version: meta.version, created: true },
        { status: 201 },
      )
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'version_conflict' && attempt < 3) continue
      if (code === 'too_large') {
        return sceneApiJson(request, { error: 'too_large' }, { status: 413 })
      }
      return sceneApiJson(request, { error: 'store_error' }, { status: 500 })
    }
  }

  return sceneApiJson(request, { error: 'version_conflict' }, { status: 409 })
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
