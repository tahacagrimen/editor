import { describe, expect, test } from 'bun:test'
import type { SceneGraph } from '@pascal-app/editor'
import { buildSharePresentationMeta, formatShareDate } from './share-presentation-meta'

const emptyGraph = { nodes: {}, rootNodeIds: [] } as unknown as SceneGraph

describe('share presentation metadata', () => {
  test('formats dates explicitly in Turkish', () => {
    expect(formatShareDate('2026-08-18T12:00:00.000Z')).toBe('18 Ağu 2026')
  })

  test('derives the parcel, revision, owner, and urgent expiry lines', () => {
    const graph = {
      nodes: {
        site_1: {
          id: 'site_1',
          type: 'site',
          children: [],
          parcel: {
            il: 'İstanbul',
            ilce: 'Kadıköy',
            mahalle: 'Fikirtepe',
            ada: '214',
            parsel: '7',
          },
        },
      },
      rootNodeIds: ['site_1'],
    } as unknown as SceneGraph

    expect(
      buildSharePresentationMeta({
        name: 'Menart Villa',
        version: 12,
        updatedAt: '2026-08-18T12:00:00.000Z',
        graph,
        ownerName: 'Menart Mimarlık',
        expiresAtSeconds: Date.parse('2026-09-12T12:00:00.000Z') / 1000,
        nowMs: Date.parse('2026-09-11T00:00:00.000Z'),
      }),
    ).toEqual({
      name: 'Menart Villa',
      parcelLine: 'İstanbul / Kadıköy / Fikirtepe · Ada 214 / Parsel 7',
      revisionLine: 'Rev. 12 · 18 Ağu 2026',
      sharedByLine: 'Paylaşan: Menart Mimarlık',
      expiryLine: '12 Eyl 2026’ya kadar geçerli',
      expiryUrgent: true,
    })
  })

  test('omits metadata lines when their source data is absent', () => {
    expect(
      buildSharePresentationMeta({
        name: 'Untitled',
        version: 1,
        updatedAt: 'not-a-date',
        graph: emptyGraph,
      }),
    ).toEqual({
      name: 'Untitled',
      parcelLine: undefined,
      revisionLine: undefined,
      sharedByLine: undefined,
      expiryLine: undefined,
      expiryUrgent: undefined,
    })
  })
})
