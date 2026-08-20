import { describe, expect, test } from 'bun:test'
import { NextRequest, NextResponse } from 'next/server'
import {
  guardFailedSharePasswordAttempt,
  sharePasswordCookieName,
  sharePasswordCookieOptions,
  sharePasswordRateLimitOptions,
} from './share-password'

describe('share password session', () => {
  test('uses narrow HttpOnly cookie scopes and secure production cookies', () => {
    expect(sharePasswordCookieName('scene_1')).toBe('share_pwd_scene_1')
    expect(sharePasswordCookieName('scene_1', 'api')).toBe('share_api_pwd_scene_1')
    expect(sharePasswordCookieOptions('/share', { NODE_ENV: 'development' } as never)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/share',
      maxAge: 43_200,
    })
    expect(sharePasswordCookieOptions('/api/share', { NODE_ENV: 'production' } as never)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/share',
      maxAge: 43_200,
    })
  })

  test('limits only failed attempts to ten per IP each minute', async () => {
    expect(sharePasswordRateLimitOptions()).toEqual({
      limit: 10,
      windowMs: 60_000,
      keyPrefix: 'share-password',
      ipOnly: true,
    })

    const request = new NextRequest('http://localhost:3002/share/token/unlock', {
      headers: { 'x-forwarded-for': '203.0.113.4' },
    })
    let calls = 0
    const validate = async (_request: Request, options: unknown) => {
      calls += 1
      expect(options).toEqual(sharePasswordRateLimitOptions())
      return calls > 10 ? NextResponse.json({ error: 'rate_limited' }, { status: 429 }) : null
    }

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      expect(await guardFailedSharePasswordAttempt(request, validate)).toBeNull()
    }
    expect((await guardFailedSharePasswordAttempt(request, validate))?.status).toBe(429)
  })
})
