import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { guardSceneApiRequest, sceneApiJson } from '@/lib/scene-api-security'
import { verifyShareAccess } from '@/lib/share-access'
import {
  guardFailedSharePasswordAttempt,
  sharePasswordCookieName,
  sharePasswordCookieOptions,
} from '@/lib/share-password'
import { hashSharePassword, sharePasswordHashMatches } from '@/lib/share-token'

type RouteParams = { params: Promise<{ token: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const originGuard = await guardSceneApiRequest(request, {
    skipAuth: true,
    skipRateLimit: true,
  })
  if (originGuard) return originGuard

  const { token } = await params
  const access = await verifyShareAccess(token)
  if (!access.ok || !access.payload.pwd) {
    return sceneApiJson(request, { error: 'invalid_share' }, { status: 403 })
  }

  let password = ''
  try {
    const formData = await request.formData()
    const value = formData.get('password')
    if (typeof value === 'string') password = value
  } catch {
    // A malformed form is an unsuccessful attempt and uses the same budget.
  }

  const credential = hashSharePassword(password)
  if (!credential || !sharePasswordHashMatches(credential, access.payload.pwd)) {
    const rateLimit = await guardFailedSharePasswordAttempt(request)
    if (rateLimit) return rateLimit
    return NextResponse.redirect(shareUrl(request, token, '1'), 303)
  }

  const response = NextResponse.redirect(shareUrl(request, token), 303)
  response.cookies.set(
    sharePasswordCookieName(access.payload.sid),
    credential,
    sharePasswordCookieOptions('/share'),
  )
  // Visitor APIs live outside /share, so give only that namespace the same
  // opaque credential instead of leaking it to every editor request.
  response.cookies.set(
    sharePasswordCookieName(access.payload.sid, 'api'),
    credential,
    sharePasswordCookieOptions('/api/share'),
  )
  return response
}

function shareUrl(request: Request, token: string, error?: string): URL {
  const url = new URL(`/share/${encodeURIComponent(token)}`, request.url)
  if (error) url.searchParams.set('e', error)
  return url
}
