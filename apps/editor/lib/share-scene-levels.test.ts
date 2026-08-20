import { describe, expect, test } from 'bun:test'
import type { SceneGraph } from '@pascal-app/editor'
import { formatShareLevelStats, readShareLevels } from './share-scene-levels'

describe('shared scene levels', () => {
  test('derives sorted level cards with slab area and storey height', () => {
    const graph = {
      nodes: {
        building_1: {
          id: 'building_1',
          type: 'building',
          children: ['level_1', 'level_0'],
        },
        level_0: {
          id: 'level_0',
          type: 'level',
          name: 'Zemin Kat',
          level: 0,
          height: 2.5,
          children: ['slab_1'],
        },
        level_1: {
          id: 'level_1',
          type: 'level',
          name: '1. Kat',
          level: 1,
          height: 2.9,
          children: [],
        },
        slab_1: {
          id: 'slab_1',
          type: 'slab',
          polygon: [
            [0, 0],
            [10, 0],
            [10, 8],
            [0, 8],
          ],
          holes: [
            [
              [0, 0],
              [2, 0],
              [2, 1],
              [0, 1],
            ],
          ],
        },
      },
      rootNodeIds: ['building_1'],
    } as unknown as SceneGraph

    const levels = readShareLevels(graph)
    expect(levels.map(({ id }) => id)).toEqual(['level_0', 'level_1'])
    expect(levels[0]).toMatchObject({ area: 78, buildingId: 'building_1', height: 2.5 })
    expect(formatShareLevelStats(levels[0]!)).toBe('78,00 m² · 2,50 m')
  })

  test('falls back to room polygons when a level has no slab', () => {
    const graph = {
      nodes: {
        level_0: {
          id: 'level_0',
          type: 'level',
          level: 0,
          children: ['zone_1'],
        },
        zone_1: {
          id: 'zone_1',
          type: 'zone',
          spaceRole: 'room',
          polygon: [
            [0, 0],
            [5, 0],
            [5, 4],
            [0, 4],
          ],
        },
      },
      rootNodeIds: ['level_0'],
    } as unknown as SceneGraph

    expect(readShareLevels(graph)[0]?.area).toBe(20)
  })
})
