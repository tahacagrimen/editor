import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  type AnyNodeId,
  BuildingNode,
  LevelNode,
  SiteNode,
  SlabNode,
} from '@pascal-app/core'
import type { SceneGraph } from '@pascal-app/editor'
import { buildShareSummary } from './share-summary'

function graph(nodes: AnyNode[], rootNodeIds: string[]): SceneGraph {
  return {
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<AnyNodeId, AnyNode>,
    rootNodeIds: rootNodeIds as AnyNodeId[],
  } as unknown as SceneGraph
}

describe('share summary', () => {
  test('derives stats, parcel facts, and textual zoning status from core readings', () => {
    const site = SiteNode.parse({
      id: 'site_1',
      children: ['building_1'],
      polygon: {
        type: 'polygon',
        points: [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 20],
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
        registeredArea: 400,
        fetchedAt: '2026-08-20T00:00:00.000Z',
      },
      zoning: { taks: 0.2, kaks: 0.3, maxHeight: 5, maxFloors: 1 },
    })
    const building = BuildingNode.parse({
      id: 'building_1',
      parentId: site.id,
      children: ['level_0', 'level_1'],
    })
    const level0 = LevelNode.parse({
      id: 'level_0',
      parentId: building.id,
      level: 0,
      height: 3,
      children: ['slab_0'],
    })
    const level1 = LevelNode.parse({
      id: 'level_1',
      parentId: building.id,
      level: 1,
      height: 3,
      children: ['slab_1'],
    })
    const slabInput = {
      polygon: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    }
    const slab0 = SlabNode.parse({ ...slabInput, id: 'slab_0', parentId: level0.id })
    const slab1 = SlabNode.parse({ ...slabInput, id: 'slab_1', parentId: level1.id })

    const summary = buildShareSummary(
      graph([site, building, level0, level1, slab0, slab1], [site.id]),
    )

    expect(summary.stats).toMatchObject({
      footprintArea: '100,00',
      totalFloorArea: '200,00',
      siteArea: '400,00',
      maxHeight: '6,00',
      levelCount: 2,
    })
    expect(summary.parcelRows).toContainEqual({ label: 'Block / parcel', value: '214 / 7' })
    expect(summary.zoningRows.map(({ status }) => status)).toEqual([
      'exceeded',
      'exceeded',
      'exceeded',
      'exceeded',
    ])
  })

  test('keeps parcel and zoning blocks empty when the scene has neither', () => {
    const level = LevelNode.parse({ id: 'level_0', level: 0, height: 2.5 })
    const summary = buildShareSummary(graph([level], [level.id]))

    expect(summary.stats).toMatchObject({ levelCount: 1, siteArea: '0,00' })
    expect(summary.levels).toHaveLength(1)
    expect(summary.parcelRows).toEqual([])
    expect(summary.zoningRows).toEqual([])
  })
})
