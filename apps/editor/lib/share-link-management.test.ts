import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SHARE_TTL_SECONDS } from '../app/api/scenes/[id]/share/route'
import {
  isShareLinkRevoked,
  listManagedShareLinks,
  recordShareLink,
  revokeManagedShareLink,
} from './share-link-store'

const previousPostgres = process.env.POSTGRES_URL

beforeEach(() => {
  delete process.env.POSTGRES_URL
})

afterEach(() => {
  if (previousPostgres === undefined) delete process.env.POSTGRES_URL
  else process.env.POSTGRES_URL = previousPostgres
})

describe('share-link management without Postgres', () => {
  test('new callers receive a seven-day expiry by default', () => {
    expect(DEFAULT_SHARE_TTL_SECONDS).toBe(7 * 24 * 60 * 60)
  })

  test('the revocation list becomes a no-op while signed links keep working', async () => {
    expect(await isShareLinkRevoked('signed.token')).toBe(false)
    expect(await listManagedShareLinks('scene_1')).toEqual([])
    expect(await revokeManagedShareLink('scene_1', 'share_1')).toBe(false)
    expect(
      await recordShareLink({
        token: 'signed.token',
        sceneId: 'scene_1',
        createdBy: null,
        expiresAt: null,
      }),
    ).toBeNull()
  })
})

test('management and every visitor surface share the revocation boundary', () => {
  const root = join(import.meta.dir, '..')
  const store = readFileSync(join(import.meta.dir, 'share-link-store.ts'), 'utf8')
  const listRoute = readFileSync(join(root, 'app/api/scenes/[id]/share/route.ts'), 'utf8')
  const revokeRoute = readFileSync(
    join(root, 'app/api/scenes/[id]/share/[linkId]/route.ts'),
    'utf8',
  )
  const page = readFileSync(join(root, 'app/share/[token]/page.tsx'), 'utf8')
  const comments = readFileSync(join(import.meta.dir, 'share-comment-route-security.ts'), 'utf8')
  const pdf = readFileSync(join(import.meta.dir, 'share-pdf-route-security.ts'), 'utf8')

  expect(store).toContain('tokenHash: shareTokenHash(input.token)')
  expect(store).not.toContain('token: input.token')
  for (const route of [listRoute, revokeRoute]) {
    expect(route).toContain('guardSceneApiRequest(request)')
    expect(route).toContain('authorizeScene(')
  }
  for (const visitor of [page, comments, pdf]) {
    expect(visitor).toContain('verifyShareAccess')
  }
})
