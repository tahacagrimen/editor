import type { NextRequest, NextResponse } from 'next/server'
import {
  guardSceneApiRequest,
  type RequestRateLimitOptions,
  sceneApiJson,
} from '@/lib/scene-api-security'
import { verifyShareAccess } from '@/lib/share-access'
import { hashSharePassword, type ShareTokenPayload } from '@/lib/share-token'
import { SHARE_COMMENT_LIMITS } from './share-comment-write'

type ShareCommentAction = 'new-thread' | 'reply'

export function shareCommentRateLimitOptions(action: ShareCommentAction): RequestRateLimitOptions {
  return {
    limit:
      action === 'new-thread'
        ? SHARE_COMMENT_LIMITS.newThreadsPerMinute
        : SHARE_COMMENT_LIMITS.repliesPerMinute,
    keyPrefix: `share-comments:${action}`,
    ipOnly: true,
  }
}

export async function authorizeShareCommentWrite(
  request: NextRequest,
  token: string,
  action: ShareCommentAction,
): Promise<{ ok: true; payload: ShareTokenPayload } | { ok: false; response: NextResponse }> {
  const guard = await guardSceneApiRequest(request, {
    skipAuth: true,
    rateLimit: shareCommentRateLimitOptions(action),
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
  if (verified.payload.allowComments === false) {
    return {
      ok: false,
      response: sceneApiJson(request, { error: 'comments_disabled' }, { status: 403 }),
    }
  }

  if (verified.payload.pwd) {
    const cookie = request.cookies.get(`share_pwd_${verified.payload.sid}`)?.value
    if (!cookie || hashSharePassword(cookie) !== verified.payload.pwd) {
      return {
        ok: false,
        response: sceneApiJson(request, { error: 'unauthorized' }, { status: 401 }),
      }
    }
  }

  return { ok: true, payload: verified.payload }
}
