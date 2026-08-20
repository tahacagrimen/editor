import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'
import type { NextResponse } from 'next/server'
import { type RequestRateLimitOptions, validateRequestRateLimit } from './scene-api-security'

const SHARE_PASSWORD_MAX_AGE_SECONDS = 12 * 60 * 60

export function sharePasswordCookieName(sceneId: string, scope: 'page' | 'api' = 'page'): string {
  return scope === 'page' ? `share_pwd_${sceneId}` : `share_api_pwd_${sceneId}`
}

export function sharePasswordCookieOptions(
  path: '/share' | '/api/share',
  env: NodeJS.ProcessEnv = process.env,
): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path,
    maxAge: SHARE_PASSWORD_MAX_AGE_SECONDS,
  }
}

export function sharePasswordRateLimitOptions(): RequestRateLimitOptions {
  return {
    limit: 10,
    windowMs: 60_000,
    keyPrefix: 'share-password',
    ipOnly: true,
  }
}

export async function guardFailedSharePasswordAttempt(
  request: Request,
  validate: typeof validateRequestRateLimit = validateRequestRateLimit,
): Promise<NextResponse | null> {
  return validate(request, sharePasswordRateLimitOptions())
}
