import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { __resetRedisForTests } from './redis'
import {
  authorizeShareCommentWrite,
  shareCommentRateLimitOptions,
} from './share-comment-route-security'
import { createShareToken, hashSharePassword } from './share-token'

const previousSecret = process.env.PASCAL_SHARE_LINK_SECRET
const previousRedis = process.env.REDIS_URL
const previousPostgres = process.env.POSTGRES_URL

beforeEach(() => {
  process.env.PASCAL_SHARE_LINK_SECRET = 'share-comment-route-test-secret'
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

function request(cookie?: string) {
  return new NextRequest('http://localhost:3002/api/share/token/comments', {
    method: 'POST',
    headers: {
      host: 'localhost:3002',
      ...(cookie && { cookie }),
    },
  })
}

describe('share comment route authorization', () => {
  test('uses separate IP-only minute budgets for new threads and replies', () => {
    expect(shareCommentRateLimitOptions('new-thread')).toEqual({
      limit: 5,
      keyPrefix: 'share-comments:new-thread',
      ipOnly: true,
    })
    expect(shareCommentRateLimitOptions('reply')).toEqual({
      limit: 15,
      keyPrefix: 'share-comments:reply',
      ipOnly: true,
    })
  })

  test('both field-level write actions reject a comments-disabled token', async () => {
    const token = createShareToken('scene_1', { allowComments: false })?.token
    if (!token) throw new Error('token expected')

    for (const action of ['new-thread', 'reply'] as const) {
      const result = await authorizeShareCommentWrite(request(), token, action)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.response.status).toBe(403)
    }
  })

  test('a protected token requires the same signed password cookie as the share page', async () => {
    const created = createShareToken('scene_1', { allowComments: true, password: 'correct' })
    if (!created) throw new Error('token expected')

    const denied = await authorizeShareCommentWrite(request(), created.token, 'new-thread')
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.response.status).toBe(401)

    const credential = hashSharePassword('correct')
    if (!credential) throw new Error('credential expected')

    const plaintext = await authorizeShareCommentWrite(
      request('share_api_pwd_scene_1=correct'),
      created.token,
      'new-thread',
    )
    expect(plaintext.ok).toBe(false)

    const allowed = await authorizeShareCommentWrite(
      request(`share_api_pwd_scene_1=${credential}`),
      created.token,
      'new-thread',
    )
    expect(allowed.ok).toBe(true)
  })
})
