import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const appRoot = join(import.meta.dir, '..')
const routePath = join(appRoot, 'app/share/[token]/page.tsx')
const presentationPath = join(appRoot, 'components/share/share-presentation.tsx')

describe('share presentation shell', () => {
  test('the share route mounts its purpose-built presentation, not the editor', () => {
    const route = readFileSync(routePath, 'utf8')

    expect(route).toContain('<SharePresentation')
    expect(route).not.toContain('<Editor')
  })

  test('presentation state stays local and does not need a read-only lease', () => {
    const presentation = readFileSync(presentationPath, 'utf8')

    expect(presentation).toContain('useState<ShareViewState>')
    expect(presentation).not.toContain('useScene')
    expect(presentation).not.toContain('acquireSceneReadOnlyLease')
  })

  test('mobile overflow is contained and theme-unsafe chrome is absent', () => {
    const presentation = readFileSync(presentationPath, 'utf8')

    expect(presentation).toContain('flex-wrap')
    expect(presentation.match(/overflow-x-auto/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(presentation.match(/min-h-12/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(presentation).not.toContain('bg-white/10')
    expect(presentation).not.toContain('text-white')
  })

  test('the identity header stays visible and lets long project names wrap', () => {
    const presentation = readFileSync(presentationPath, 'utf8')

    expect(presentation).toContain('sticky top-0')
    expect(presentation).toContain('break-words')
    expect(presentation).toContain("t('Read only')")
    expect(presentation).toContain('meta.expiryLine')
    expect(presentation).toContain('dark:text-red-400')
  })
})
