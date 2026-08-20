import { afterEach, expect, mock, test } from 'bun:test'

// `scene-api-security` is imported dynamically after `mock.module` so the mock
// takes effect — a static `import` is hoisted above `mock.module` and runs the
// real `./auth`, which builds on `getDatabase()` and needs `POSTGRES_URL`.
function loadSecurity(): Promise<typeof import('./scene-api-security')> {
  return import('./scene-api-security')
}

function stubAuth(getSession: () => Promise<unknown> = async () => null): void {
  mock.module('./auth', () => ({
    getAuth: () => ({ api: { getSession } }),
  }))
}

const OLD_ENV = { ...process.env }

afterEach(() => {
  restoreEnv('PASCAL_SCENE_API_ORIGINS')
  restoreEnv('PASCAL_SCENE_API_RATE_LIMIT')
})

function restoreEnv(key: keyof NodeJS.ProcessEnv): void {
  if (OLD_ENV[key] === undefined) delete process.env[key]
  else process.env[key] = OLD_ENV[key]
}

test('allows loopback scene API requests', async () => {
  stubAuth()
  const { guardSceneApiRequest } = await loadSecurity()
  const request = new Request('http://127.0.0.1:3000/api/scenes', {
    headers: { host: '127.0.0.1:3000' },
  })
  expect(await guardSceneApiRequest(request)).toBeNull()
})

test('fails open to an anonymous actor when auth cannot initialize', async () => {
  // `getAuth()` builds on `getDatabase()`, which throws without `POSTGRES_URL`
  // (the SQLite-only local setup). Resolving an actor must not 500 every
  // guarded route because the session lookup could not run.
  mock.module('./auth', () => ({
    getAuth: () => {
      throw new Error('POSTGRES_URL is not set')
    },
  }))
  const { resolveActor } = await loadSecurity()
  const request = new Request('http://localhost:3000/api/scenes', {
    headers: { host: 'localhost:3000' },
  })
  expect(await resolveActor(request)).toEqual({ type: 'anon' })
})

test('applies configured CORS origins for preflight', async () => {
  stubAuth()
  const { sceneApiPreflight } = await loadSecurity()
  process.env.PASCAL_SCENE_API_ORIGINS = 'https://app.example'
  const request = new Request('https://editor.example/api/scenes', {
    method: 'OPTIONS',
    headers: {
      host: 'editor.example',
      origin: 'https://app.example',
    },
  })

  const response = await sceneApiPreflight(request)

  expect(response.status).toBe(204)
  expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example')
})

test('supports an IP-only endpoint budget with rate-limit response headers', async () => {
  stubAuth(async () => ({ user: { id: 'signed-in-user' } }))
  const { validateRequestRateLimit } = await loadSecurity()
  const calls: unknown[][] = []
  const request = new Request('https://editor.example/api/share/token/comments', {
    headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
  })

  const response = await validateRequestRateLimit(
    request,
    { limit: 5, keyPrefix: 'share-comments:new', ipOnly: true },
    async (...args) => {
      calls.push(args)
      return { allowed: false, limit: 5, remaining: 0, retryAfter: 12, resetAt: 1_800_000 }
    },
  )

  expect(calls).toEqual([['share-comments:new:ip:203.0.113.9', 5, 60_000]])
  expect(response?.status).toBe(429)
  expect(response?.headers.get('retry-after')).toBe('12')
  expect(response?.headers.get('x-ratelimit-limit')).toBe('5')
})
