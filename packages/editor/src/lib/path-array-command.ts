import {
  type AnyNode,
  type AnyNodeId,
  cloneNodesInto,
  collectSubtree,
  runAsSingleSceneHistoryStep,
  useScene,
  type WallNode,
  type FenceNode,
} from '@pascal-app/core'
import { type ArrayCommand, type Vector3, translateNodeGeometry } from './array-duplicate'
import { rotateNodeGeometry } from './polar-array-command'

export function runPathArrayCommand(
  command: ArrayCommand,
  nodeIds: AnyNodeId[],
  pathNode: AnyNode
): { createdIds: AnyNodeId[]; copies: number } | null {
  const scene = useScene.getState()
  if (scene.readOnly) return null

  const count = command.count
  if (count < 1) return null

  // Collect points of the path
  const points: Vector3[] = []

  if (pathNode.type === 'wall' || pathNode.type === 'fence') {
    const node = pathNode as WallNode | FenceNode
    points.push([node.start[0], 0, node.start[1]])
    points.push([node.end[0], 0, node.end[1]])
  } else if ('polygon' in pathNode && Array.isArray(pathNode.polygon)) {
    // For slab/ceiling/zone, we could use the polygon. Let's just use the first edge for now or all points
    const polygon = pathNode.polygon as [number, number][]
    for (const p of polygon) {
      points.push([p[0], 0, p[1]])
    }
  }

  if (points.length < 2) return null

  // Calculate total length
  let totalLength = 0
  const segments: { start: Vector3; end: Vector3; length: number }[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    const end = points[i + 1]
    if (!start || !end) continue
    const length = Math.hypot(end[0] - start[0], end[2] - start[2])
    segments.push({ start, end, length })
    totalLength += length
  }

  if (totalLength === 0) return null

  const stepDistance = command.kind === 'repeat'
    ? totalLength / count
    : totalLength / count // Usually path array just evenly distributes 'count' items along the path

  const sources: Array<{ root: AnyNode; descendants: AnyNode[] }> = []
  for (const id of nodeIds) {
    const subtree = collectSubtree(scene.nodes, id)
    if (subtree) sources.push(subtree)
  }
  if (sources.length === 0) return null

  // Determine starting point (e.g. centroid of selected nodes)
  let centroidX = 0
  let centroidZ = 0
  let validNodes = 0
  for (const { root } of sources) {
    if ('position' in root && Array.isArray(root.position)) {
      centroidX += root.position[0]
      centroidZ += root.position[2]
      validNodes++
    }
  }
  if (validNodes > 0) {
    centroidX /= validNodes
    centroidZ /= validNodes
  } else {
    // Fallback to origin
  }

  const createdIds: AnyNodeId[] = []

  runAsSingleSceneHistoryStep(useScene, () => {
    // How many copies? count?
    const numCopies = command.kind === 'repeat' ? count : (count - 1)
    
    for (let i = 1; i <= numCopies; i++) {
      const distanceAlongPath = stepDistance * i
      
      // Find the point on the path
      let traveled = 0
      let pointOnPath: Vector3 | null = null
      let angleRad = 0

      for (const segment of segments) {
        if (traveled + segment.length >= distanceAlongPath) {
          const t = (distanceAlongPath - traveled) / segment.length
          pointOnPath = [
            segment.start[0] + (segment.end[0] - segment.start[0]) * t,
            segment.start[1],
            segment.start[2] + (segment.end[2] - segment.start[2]) * t,
          ]
          angleRad = -Math.atan2(segment.end[2] - segment.start[2], segment.end[0] - segment.start[0])
          break
        }
        traveled += segment.length
      }

      if (!pointOnPath) {
        // Exceeded path, use last point
        const lastSegment = segments[segments.length - 1]
        if (!lastSegment) break
        pointOnPath = lastSegment.end
        angleRad = -Math.atan2(lastSegment.end[2] - lastSegment.start[2], lastSegment.end[0] - lastSegment.start[0])
      }

      // Offset from original centroid to new point
      const offset: Vector3 = [
        pointOnPath[0] - centroidX,
        0,
        pointOnPath[2] - centroidZ,
      ]

      for (const { root, descendants } of sources) {
        const parentId = (root as any).parentId
        let newRoot = translateNodeGeometry(root, offset)
        // Optionally rotate to align with path (might be too complex, let's keep it simple or just rotate by angleRad)
        // newRoot = rotateNodeGeometry(newRoot, pointOnPath, angleRad)
        
        const cloned = cloneNodesInto([newRoot, ...descendants], {
          rootId: root.id,
          ...(parentId ? { parentId } : {}),
        })
        useScene
          .getState()
          .createNodes(
            cloned.nodes.map((node, index) =>
              index === 0 && parentId ? { node, parentId } : { node },
            ),
          )
        createdIds.push(cloned.rootId)
      }
    }
  })

  return { createdIds, copies: createdIds.length }
}
