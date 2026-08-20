import { describe, expect, test } from 'bun:test'
import type { CommentId, CommentThread } from '@pascal-app/core'
import {
  buildShareCommentInput,
  floorplanPointToWorld,
  numberShareComments,
  visibleShareCommentPins,
  worldPointToFloorplan,
} from './share-comments'

const thread = (id: string, createdAt: string, levelId?: string): CommentThread => ({
  id: id as CommentId,
  anchor: { position: [0, 0, 0] },
  author: { name: 'Ada' },
  body: id,
  createdAt,
  ...(levelId && { levelId: levelId as never }),
  replies: [],
})

describe('share comment numbering', () => {
  test('uses a stable document-wide order before filtering by level', () => {
    const comments = numberShareComments({
      ['comment_b' as CommentId]: thread('comment_b', '2026-01-02T00:00:00.000Z', 'level_2'),
      ['comment_a' as CommentId]: thread('comment_a', '2026-01-01T00:00:00.000Z', 'level_1'),
      ['comment_c' as CommentId]: thread('comment_c', '2026-01-03T00:00:00.000Z'),
    })

    expect(comments.map(({ number, thread: item }) => [number, item.id])).toEqual([
      [1, 'comment_a'],
      [2, 'comment_b'],
      [3, 'comment_c'],
    ])
    expect(visibleShareCommentPins(comments, 'level_2').map(({ number }) => number)).toEqual([2, 3])
  })
})

test('floorplan and world transforms round-trip for a rotated building', () => {
  const buildingPosition = [12, 0, -4] as const
  const world = floorplanPointToWorld({ x: 3, y: 7 }, buildingPosition, Math.PI / 3)
  const local = worldPointToFloorplan(world, buildingPosition, Math.PI / 3)
  expect(local.x).toBeCloseTo(3)
  expect(local.y).toBeCloseTo(7)
})

test('only a 3D draft carries its camera into the saved thread', () => {
  const camera = {
    position: [4, 5, 6],
    target: [1, 0, 2],
    projection: 'perspective' as const,
  }
  const base = { position: [1, 0, 2] as [number, number, number], camera }

  expect(buildShareCommentInput({ ...base, origin: '3d' }, ' Ada ', ' Not ')).toMatchObject({
    author: { name: 'Ada' },
    body: 'Not',
    camera,
  })
  expect(buildShareCommentInput({ ...base, origin: '2d' }, 'Ada', 'Not')).not.toHaveProperty(
    'camera',
  )
  expect(buildShareCommentInput({ ...base, origin: '3d' }, '', 'Not')).toBeNull()
  expect(buildShareCommentInput({ ...base, origin: '3d' }, 'Ada', '  ')).toBeNull()
})
