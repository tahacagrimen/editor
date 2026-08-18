import {
  type AnyNode,
  type AnyNodeId,
  cloneNodesInto,
  collectSubtree,
  runAsSingleSceneHistoryStep,
  useScene,
} from '@pascal-app/core'
import { type ArrayCommand, type Vector3 } from './array-duplicate'

function rotateVector(v: Vector3, center: Vector3, angleRad: number): Vector3 {
  const dx = v[0] - center[0]
  const dz = v[2] - center[2]
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return [
    center[0] + dx * cos - dz * sin,
    v[1], // Y unchanged for now
    center[2] + dx * sin + dz * cos,
  ]
}

function rotateValue(value: unknown, center: Vector3, angleRad: number): unknown {
  if (!Array.isArray(value)) return value

  const [a, b, c] = value
  if (value.length === 2 && typeof a === 'number' && typeof b === 'number') {
    // 2D [x, z]
    const rotated = rotateVector([a, 0, b], center, angleRad)
    return [rotated[0], rotated[2]]
  }
  if (value.length === 3 && typeof a === 'number' && typeof b === 'number' && typeof c === 'number') {
    // 3D [x, y, z]
    const rotated = rotateVector([a, b, c], center, angleRad)
    return [rotated[0], rotated[1], rotated[2]]
  }
  return value.map((entry) => rotateValue(entry, center, angleRad))
}

export function rotateNodeGeometry<N>(node: N, center: Vector3, angleRad: number): N {
  const source = node as unknown as Record<string, unknown>
  const next: Record<string, unknown> = { ...source }
  
  // Rotate translatable fields
  const TRANSLATABLE_FIELDS = ['position', 'start', 'end', 'polygon', 'holes', 'path']
  for (const field of TRANSLATABLE_FIELDS) {
    if (field in source) {
      next[field] = rotateValue(source[field], center, angleRad)
    }
  }

  // Also rotate the `rotation` field
  if ('rotation' in source && Array.isArray(source.rotation)) {
    const rot = source.rotation as number[]
    // Assuming rotation is [x, y, z] Euler angles
    if (rot.length >= 3 && rot[0] !== undefined && rot[1] !== undefined && rot[2] !== undefined) {
      next.rotation = [rot[0], rot[1] + angleRad, rot[2]]
    }
  }

  return next as unknown as N
}

export function runPolarArrayCommand(
  command: ArrayCommand,
  nodeIds: AnyNodeId[],
  center: Vector3
): { createdIds: AnyNodeId[]; copies: number } | null {
  const scene = useScene.getState()
  if (scene.readOnly) return null

  // Value is total angle, defaults to 360
  const totalAngleDeg = command.value !== undefined ? command.value : 360
  const totalAngleRad = (totalAngleDeg * Math.PI) / 180

  const count = command.count
  if (count < 1) return null

  // Step depends on divide or repeat
  const stepAngle = command.kind === 'repeat' 
    ? (totalAngleRad / count) 
    : (totalAngleRad / count)
  
  const sources: Array<{ root: AnyNode; descendants: AnyNode[] }> = []
  for (const id of nodeIds) {
    const subtree = collectSubtree(scene.nodes, id)
    if (subtree) sources.push(subtree)
  }
  if (sources.length === 0) return null

  const createdIds: AnyNodeId[] = []

  runAsSingleSceneHistoryStep(useScene, () => {
    const numCopies = command.kind === 'repeat' ? count : (count - 1)
    
    for (let i = 1; i <= numCopies; i++) {
      const angle = stepAngle * i
      for (const { root, descendants } of sources) {
        const parentId = (root as any).parentId
        const cloned = cloneNodesInto([rotateNodeGeometry(root, center, angle), ...descendants], {
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
