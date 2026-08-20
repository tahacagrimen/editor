import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasTranslation } from '@pascal-app/editor/i18n'

const appRoot = join(import.meta.dir, '..')
const shareFiles = [
  ...new Bun.Glob('components/share/**/*.tsx').scanSync(appRoot),
  'components/share-link-button.tsx',
  'components/scene-share-links-panel.tsx',
]

const dynamicSources = [
  'Summary',
  'Quantities',
  'Location',
  'Comments',
  'Address',
  'District',
  'Coordinate',
  'North angle',
  'Source',
  'TKGM parcel query',
  'Manual parcel record',
  'Land registry reference data — not a surveyed site plan.',
  'Edited by hand — no longer the registry outline.',
  'User-provided parcel boundary.',
  'Location',
  'Neighbourhood',
  'Block / parcel',
  'Sheet',
  'Quality',
  'Land area',
]

describe('Turkish share copy', () => {
  test('covers every literal and dynamic source string used by the share surfaces', () => {
    const sources = new Set(dynamicSources)
    for (const relativePath of shareFiles) {
      const source = readFileSync(join(appRoot, relativePath), 'utf8')
      for (const match of source.matchAll(/\bt\(\s*(['"])(.*?)\1/g)) sources.add(match[2]!)
      expect(source).not.toMatch(/\bt\(\s*`/)
    }

    expect([...sources].filter((source) => !hasTranslation(source))).toEqual([])
  })

  test('localizes the server-rendered share shell through the server-safe subpath', () => {
    const page = readFileSync(join(appRoot, 'app/share/[token]/page.tsx'), 'utf8')
    const meta = readFileSync(join(import.meta.dir, 'share-presentation-meta.ts'), 'utf8')
    expect(page).toContain("from '@pascal-app/editor/i18n'")
    expect(page).toContain('ServerLocalizedContent')
    expect(page).not.toContain("from '@/components/localized-content'")
    expect(meta).toContain("from '@pascal-app/editor/i18n'")
  })

  test('routes share numbers and dates through one locale authority', () => {
    const candidates = [
      ...new Bun.Glob('components/share/**/*.tsx').scanSync(appRoot),
      ...new Bun.Glob('lib/share-*.ts').scanSync(appRoot),
      'components/share-link-button.tsx',
      'components/scene-share-links-panel.tsx',
    ].filter((path) => !path.endsWith('.test.ts') && path !== 'lib/share-format.ts')

    const directIntlUsers = candidates.filter((relativePath) =>
      /Intl\.(?:NumberFormat|DateTimeFormat)/.test(
        readFileSync(join(appRoot, relativePath), 'utf8'),
      ),
    )
    expect(directIntlUsers).toEqual([])
  })
})
