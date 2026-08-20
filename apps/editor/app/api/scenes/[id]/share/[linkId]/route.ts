import type { NextRequest } from 'next/server'
import {
  authorizeScene,
  guardSceneApiRequest,
  resolveActor,
  sceneApiJson,
  sceneApiPreflight,
} from '@/lib/scene-api-security'
import { revokeManagedShareLink } from '@/lib/share-link-store'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string; linkId: string }> }

export function OPTIONS(request: NextRequest) {
  return sceneApiPreflight(request)
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const guard = await guardSceneApiRequest(request)
  if (guard) return guard

  const { id, linkId } = await params
  const actor = await resolveActor(request)
  if (!process.env.POSTGRES_URL || !(await authorizeScene(actor, id, 'write'))) {
    return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
  }

  try {
    const revoked = await revokeManagedShareLink(id, linkId)
    if (!revoked) return sceneApiJson(request, { error: 'not_found' }, { status: 404 })
    return sceneApiJson(request, { ok: true })
  } catch (error) {
    console.error('[share-links] revoking a link failed:', error)
    return sceneApiJson(request, { error: 'share_link_store_failed' }, { status: 503 })
  }
}
