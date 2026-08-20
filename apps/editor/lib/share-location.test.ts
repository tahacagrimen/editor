import { describe, expect, test } from 'bun:test'
import { SiteNode } from '@pascal-app/core/schema'
import type { SceneGraph } from '@pascal-app/editor'
import { buildShareLocation } from './share-location'

function graph(site: ReturnType<typeof SiteNode.parse>): SceneGraph {
  return {
    nodes: { [site.id]: site },
    rootNodeIds: [site.id],
  } as unknown as SceneGraph
}

describe('buildShareLocation', () => {
  test('derives Turkish coordinates and map metadata from the saved parcel only', () => {
    const site = SiteNode.parse({
      id: 'site_1',
      latitude: 40.9944,
      longitude: 29.0472,
      northOffset: 18,
      polygon: {
        type: 'polygon',
        points: [
          [0, 0],
          [20, 0],
          [16, 14],
          [0, 10],
        ],
      },
      parcel: {
        source: 'tkgm',
        il: 'İstanbul',
        ilce: 'Kadıköy',
        mahalle: 'Fikirtepe',
        mahalleId: 1,
        ada: '214',
        parsel: '7',
        fetchedAt: '2026-08-20T00:00:00.000Z',
      },
    })

    const location = buildShareLocation(graph(site))

    expect(location).toMatchObject({
      badge: 'TKGM · Ada 214 / Parsel 7',
      edited: false,
      warning: 'Land registry reference data — not a surveyed site plan.',
    })
    expect(location?.rows).toContainEqual({
      label: 'Coordinate',
      value: '40,9944 · 29,0472',
    })
    expect(location?.rows).toContainEqual({ label: 'North angle', value: '18°' })
    expect(location?.mapUrl).toContain('query=40.9944%2C29.0472')
    expect(location?.points).toEqual(site.polygon.points)
  })

  test('switches the provenance warning after a user edits the outline', () => {
    const site = SiteNode.parse({
      id: 'site_1',
      parcel: {
        source: 'tkgm',
        il: 'İstanbul',
        ilce: 'Kadıköy',
        mahalle: 'Fikirtepe',
        mahalleId: 1,
        ada: '214',
        parsel: '7',
        fetchedAt: '2026-08-20T00:00:00.000Z',
        edited: true,
      },
    })

    expect(buildShareLocation(graph(site))?.warning).toBe(
      'Edited by hand — no longer the registry outline.',
    )
  })

  test('omits the whole location model when no parcel is stored', () => {
    expect(buildShareLocation(graph(SiteNode.parse({ id: 'site_1' })))).toBeNull()
  })
})
