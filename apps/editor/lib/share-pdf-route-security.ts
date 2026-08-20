import type { NextRequest, NextResponse } from 'next/server'
import { guardSceneApiRequest, sceneApiJson } from './scene-api-security'
import { verifyShareAccess } from './share-access'
import { sharePasswordCookieName } from './share-password'
import { type ShareTokenPayload, sharePasswordHashMatches } from './share-token'

export async function authorizeSharePdf(
  request: NextRequest,
  token: string,
): Promise<{ ok: true; payload: ShareTokenPayload } | { ok: false; response: NextResponse }> {
  const guard = await guardSceneApiRequest(request, {
    skipAuth: true,
    rateLimit: { limit: 10, keyPrefix: 'share-pdf', ipOnly: true },
  })
  if (guard) return { ok: false, response: guard }

  const verified = await verifyShareAccess(token)
  if (!verified.ok) {
    return {
      ok: false,
      response: sceneApiJson(
        request,
        { error: verified.error },
        {
          status:
            verified.error === 'secret_missing' || verified.error === 'revocation_unavailable'
              ? 503
              : 403,
        },
      ),
    }
  }

  if (verified.payload.pwd) {
    const cookie = request.cookies.get(sharePasswordCookieName(verified.payload.sid, 'api'))?.value
    if (!cookie || !sharePasswordHashMatches(cookie, verified.payload.pwd)) {
      return {
        ok: false,
        response: sceneApiJson(request, { error: 'unauthorized' }, { status: 401 }),
      }
    }
  }
  return { ok: true, payload: verified.payload }
}
