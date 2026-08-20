import { describe, expect, test } from 'bun:test'
import { verifyShareAccess } from './share-access'
import { shareTokenHash } from './share-link-store'
import { createShareToken } from './share-token'

const env = { PASCAL_SHARE_LINK_SECRET: 'share-access-test-secret' } as NodeJS.ProcessEnv
const now = Date.UTC(2026, 7, 20)

describe('share revocation overlay', () => {
  test('hashes the whole token without retaining its plaintext', () => {
    const token = 'header.signature'
    expect(shareTokenHash(token)).toHaveLength(64)
    expect(shareTokenHash(token)).not.toContain(token)
    expect(shareTokenHash(token)).toBe(shareTokenHash(token))
  })

  test('rejects a revoked signed token without changing pure token verification', async () => {
    const created = createShareToken('scene_1', { env, now })
    if (!created) throw new Error('token expected')
    const result = await verifyShareAccess(created.token, {
      tokenOptions: { env, now },
      revoked: async () => true,
    })
    expect(result).toEqual({ ok: false, error: 'revoked' })
  })

  test('keeps signed links working when the revocation backend is disabled', async () => {
    const created = createShareToken('scene_1', { env, now })
    if (!created) throw new Error('token expected')
    const result = await verifyShareAccess(created.token, {
      tokenOptions: { env, now },
      revoked: async () => false,
    })
    expect(result).toEqual({ ok: true, payload: created.payload })
  })

  test('fails closed when a configured revocation backend is unavailable', async () => {
    const created = createShareToken('scene_1', { env, now })
    if (!created) throw new Error('token expected')
    const result = await verifyShareAccess(created.token, {
      tokenOptions: { env, now },
      revoked: async () => {
        throw new Error('database down')
      },
    })
    expect(result).toEqual({ ok: false, error: 'revocation_unavailable' })
  })
})
