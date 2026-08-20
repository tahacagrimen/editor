import type { SceneGraph } from '@pascal-app/editor'
import { formatShareNumber } from './share-format'

export type ShareLevel = {
  id: string
  buildingId: string | null
  name: string
  order: number
  area: number | null
  height: number | null
}

function polygonArea(points: unknown): number {
  if (!Array.isArray(points) || points.length < 3) return 0
  let doubledArea = 0

  for (let index = 0; index < points.length; index++) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (!(Array.isArray(current) && Array.isArray(next))) return 0
    const [x1, y1] = current
    const [x2, y2] = next
    if (![x1, y1, x2, y2].every((value) => typeof value === 'number' && Number.isFinite(value))) {
      return 0
    }
    doubledArea += (x1 as number) * (y2 as number) - (x2 as number) * (y1 as number)
  }

  return Math.abs(doubledArea) / 2
}

function surfaceArea(node: Record<string, unknown>): number {
  const outer = polygonArea(node.polygon)
  if (outer <= 0) return 0
  const holes = Array.isArray(node.holes)
    ? node.holes.reduce((sum: number, hole) => sum + polygonArea(hole), 0)
    : 0
  return Math.max(0, outer - holes)
}

function readLevelArea(
  level: Record<string, unknown>,
  nodes: Record<string, unknown>,
): number | null {
  if (!Array.isArray(level.children)) return null

  const children = level.children
    .map((id) => (typeof id === 'string' ? nodes[id] : null))
    .filter((node): node is Record<string, unknown> => Boolean(node && typeof node === 'object'))
  const slabArea = children.reduce(
    (sum, node) => sum + (node.type === 'slab' && node.visible !== false ? surfaceArea(node) : 0),
    0,
  )
  if (slabArea > 0) return slabArea

  const roomArea = children.reduce(
    (sum, node) =>
      sum +
      (node.type === 'zone' && node.spaceRole === 'room' && node.visible !== false
        ? surfaceArea(node)
        : 0),
    0,
  )
  return roomArea > 0 ? roomArea : null
}

export function readShareLevels(scene: SceneGraph): ShareLevel[] {
  const levels: ShareLevel[] = []
  const visited = new Set<string>()
  const nodes = scene.nodes as Record<string, unknown>

  const visit = (nodeId: string, buildingId: string | null) => {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const value = nodes[nodeId]
    if (!(value && typeof value === 'object')) return
    const node = value as Record<string, unknown>
    const nextBuildingId =
      node.type === 'building' && typeof node.id === 'string' ? node.id : buildingId

    if (node.type === 'level' && typeof node.id === 'string') {
      const order = typeof node.level === 'number' && Number.isFinite(node.level) ? node.level : 0
      const name =
        typeof node.name === 'string' && node.name.trim().length > 0
          ? node.name
          : order === 0
            ? 'Ground level'
            : `Level ${order}`
      levels.push({
        id: node.id,
        buildingId: nextBuildingId,
        name,
        order,
        area: readLevelArea(node, nodes),
        height:
          typeof node.height === 'number' && Number.isFinite(node.height) ? node.height : null,
      })
    }

    if (!Array.isArray(node.children)) return
    for (const childId of node.children) {
      if (typeof childId === 'string') visit(childId, nextBuildingId)
    }
  }

  for (const rootNodeId of scene.rootNodeIds) visit(rootNodeId, null)
  return levels.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

export function formatShareLevelStats(level: ShareLevel): string | null {
  const values: string[] = []
  if (level.area !== null) values.push(`${formatShareNumber(level.area)} m²`)
  if (level.height !== null) values.push(`${formatShareNumber(level.height)} m`)
  return values.length > 0 ? values.join(' · ') : null
}
