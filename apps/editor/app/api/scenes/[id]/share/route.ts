import type { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  authorizeScene,
  guardSceneApiRequest,
  resolveActor,
  sceneApiJson,
  sceneApiPreflight,
} from '@/lib/scene-api-security'
import { getSceneOperations } from '@/lib/scene-store-server'
import { listManagedShareLinks, recordShareLink } from '@/lib/share-link-store'
import { createShareToken } from '@/lib/share-token'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

const MAX_TTL_SECONDS = 365 * 24 * 60 * 60
export const DEFAULT_SHARE_TTL_SECONDS = 7 * 24 * 60 * 60

const createShareSchema = z.object({
  /** Seconds until the link stops working. Omit for seven days; explicit 0 never expires. */
  ttlSeconds: z.number().int().nonnegative().max(MAX_TTL_SECONDS).optional(),
  allowComments: z.boolean().optional(),
  showCost: z.boolean().optional(),
  password: z.string().min(1).optional(),
})

export function OPTIONS(request: NextRequest) {
  return sceneApiPreflight(request)
}

/**
 * Mint a view-only link for a scene. Guarded by the ordinary scene-API auth:
 * handing out a share link is an owner action, and only the *use* of the link
 * is unauthenticated.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const guard = await guardSceneApiRequest(request)
  if (guard) return guard

  const { id } = await params
  const actor = await resolveActor(request)
  if (!(await canManageScene(actor, id))) {
    return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
  }

  let body: unknown = {}
  const raw = await request.text()
  if (raw.trim()) {
    try {
      body = JSON.parse(raw)
    } catch {
      return sceneApiJson(
        request,
        { error: 'invalid_request', details: 'body must be valid JSON' },
        { status: 400 },
      )
    }
  }

  const parsed = createShareSchema.safeParse(body)
  if (!parsed.success) {
    return sceneApiJson(
      request,
      { error: 'invalid_request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  // Refuse to mint a link to a scene that isn't there — a 404 now beats a
  // working-looking URL that 404s for whoever it was sent to.
  const operations = await getSceneOperations()
  const scene = await operations.loadStoredScene(id)
  if (!scene) return sceneApiJson(request, { error: 'not_found' }, { status: 404 })

  const minted = createShareToken(id, {
    ttlSeconds: parsed.data.ttlSeconds ?? DEFAULT_SHARE_TTL_SECONDS,
    allowComments: parsed.data.allowComments,
    showCost: parsed.data.showCost,
    password: parsed.data.password,
  })
  if (!minted) {
    // Same shape as the scene API's missing-token response: a deployment
    // configuration problem, not a client error.
    return sceneApiJson(request, { error: 'share_secret_required' }, { status: 503 })
  }

  let linkId: string | null
  try {
    linkId = await recordShareLink({
      token: minted.token,
      sceneId: id,
      createdBy: actor.type === 'user' ? actor.userId : null,
      expiresAt: minted.payload.exp ? new Date(minted.payload.exp * 1000) : null,
    })
  } catch (error) {
    console.error('[share-links] recording a new link failed:', error)
    return sceneApiJson(request, { error: 'share_link_store_failed' }, { status: 503 })
  }

  const requestUrl = new URL(request.url)
  const host =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || requestUrl.host
  const proto = request.headers.get('x-forwarded-proto') || requestUrl.protocol.replace(':', '')

  const url = new URL(`/share/${minted.token}`, `${proto}://${host}`)
  return sceneApiJson(request, {
    id: linkId,
    token: minted.token,
    url: url.toString(),
    expiresAt: minted.payload.exp ? new Date(minted.payload.exp * 1000).toISOString() : null,
  })
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const guard = await guardSceneApiRequest(request)
  if (guard) return guard

  const { id } = await params
  const actor = await resolveActor(request)
  if (!(await canManageScene(actor, id))) {
    return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
  }

  try {
    return sceneApiJson(request, { links: await listManagedShareLinks(id) })
  } catch (error) {
    console.error('[share-links] listing links failed:', error)
    return sceneApiJson(request, { error: 'share_link_store_failed' }, { status: 503 })
  }
}

async function canManageScene(actor: Awaited<ReturnType<typeof resolveActor>>, sceneId: string) {
  // SQLite is the no-account local mode. It has no revocation table, but link
  // creation must keep working with the signed-token authority it had before.
  if (!process.env.POSTGRES_URL) return true
  return authorizeScene(actor, sceneId, 'write')
}
