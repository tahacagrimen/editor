import { afterEach, beforeEach, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { __resetRedisForTests } from './redis'
import { authorizeSharePdf } from './share-pdf-route-security'
import { createShareToken } from './share-token'

const oldSecret = process.env.PASCAL_SHARE_LINK_SECRET
const oldRedis = process.env.REDIS_URL

beforeEach(() => {
  process.env.PASCAL_SHARE_LINK_SECRET = 'share-pdf-test-secret'
  delete process.env.REDIS_URL
  __resetRedisForTests()
})

afterEach(() => {
  if (oldSecret === undefined) delete process.env.PASCAL_SHARE_LINK_SECRET
  else process.env.PASCAL_SHARE_LINK_SECRET = oldSecret
  if (oldRedis === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = oldRedis
  __resetRedisForTests()
})

function request(cookie?: string) {
  return new NextRequest('http://localhost:3002/api/share/token/pdf', {
    headers: { host: 'localhost:3002', ...(cookie && { cookie }) },
  })
}

test('expired PDF tokens are rejected', async () => {
  const token = createShareToken('scene_1', { now: 1_000, ttlSeconds: 10 })?.token
  if (!token) throw new Error('token expected')
  const result = await authorizeSharePdf(request(), token)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.response.status).toBe(403)
})

test('password-protected PDF tokens require the share-page cookie', async () => {
  const created = createShareToken('scene_1', { password: 'secret' })
  if (!created) throw new Error('token expected')
  const denied = await authorizeSharePdf(request(), created.token)
  expect(denied.ok).toBe(false)
  if (!denied.ok) expect(denied.response.status).toBe(401)

  expect((await authorizeSharePdf(request('share_pwd_scene_1=secret'), created.token)).ok).toBe(
    true,
  )
})
