import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { POST } from '@/app/share/[token]/unlock/route'
import { __resetRedisForTests } from './redis'
import { createShareToken, hashSharePassword } from './share-token'

const previousSecret = process.env.PASCAL_SHARE_LINK_SECRET
const previousRedis = process.env.REDIS_URL
const previousPostgres = process.env.POSTGRES_URL

beforeEach(() => {
  process.env.PASCAL_SHARE_LINK_SECRET = 'share-password-route-test-secret'
  delete process.env.REDIS_URL
  delete process.env.POSTGRES_URL
  __resetRedisForTests()
})

afterEach(() => {
  if (previousSecret === undefined) delete process.env.PASCAL_SHARE_LINK_SECRET
  else process.env.PASCAL_SHARE_LINK_SECRET = previousSecret
  if (previousRedis === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = previousRedis
  if (previousPostgres === undefined) delete process.env.POSTGRES_URL
  else process.env.POSTGRES_URL = previousPostgres
  __resetRedisForTests()
})

function request(token: string, password: string) {
  const body = new URLSearchParams({ password })
  return new NextRequest(`http://localhost:3002/share/${token}/unlock`, {
    method: 'POST',
    headers: {
      host: 'localhost:3002',
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': '203.0.113.4',
    },
    body,
  })
}

describe('share password unlock route', () => {
  test('a wrong password redirects to the error state without setting a cookie', async () => {
    const created = createShareToken('scene_1', { password: 'correct' })
    if (!created) throw new Error('token expected')

    const response = await POST(request(created.token, 'wrong'), {
      params: Promise.resolve({ token: created.token }),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toEndWith('?e=1')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  test('stores only the hash in narrow HttpOnly cookies', async () => {
    const created = createShareToken('scene_1', { password: 'correct' })
    const credential = hashSharePassword('correct')
    if (!(created && credential)) throw new Error('token and credential expected')

    const response = await POST(request(created.token, 'correct'), {
      params: Promise.resolve({ token: created.token }),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).not.toContain('?e=1')
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies.some((cookie) => cookie.includes(`share_pwd_scene_1=${credential}`))).toBe(true)
    expect(cookies.some((cookie) => cookie.includes(`share_api_pwd_scene_1=${credential}`))).toBe(
      true,
    )
    expect(cookies.every((cookie) => cookie.includes('HttpOnly'))).toBe(true)
    expect(cookies.every((cookie) => cookie.includes('SameSite=lax'))).toBe(true)
    expect(cookies.some((cookie) => cookie.includes('Path=/share;'))).toBe(true)
    expect(cookies.some((cookie) => cookie.includes('Path=/api/share;'))).toBe(true)
    expect(cookies.join(';')).not.toContain('correct')
  })
})
