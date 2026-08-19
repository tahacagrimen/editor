'use client'

import { type XLineNode, useRegistry } from '@pascal-app/core'
import { OVERLAY_LAYER, useNodeEvents } from '@pascal-app/viewer'
import { useMemo, useRef } from 'react'
import { Group } from 'three'

// A long thin box rather than a three.js `Line`: `linewidth` is ignored by the
// WebGL/WebGPU renderers, so any 1px line disappears under the geometry it
// overlaps. Same convention as `shared/draft-axis-guides.tsx`.
const XLINE_HALF_LENGTH = 1000
const XLINE_THICKNESS = 0.004
const XLINE_WIDTH = 0.035
const XLINE_Y_OFFSET = 0.026
const XLINE_COLOR = '#0ea5e9'

export const XLineRenderer = ({ node }: { node: XLineNode }) => {
  const ref = useRef<Group>(null!)
  useRegistry(node.id, 'xline', ref)
  const handlers = useNodeEvents(node, 'xline')

  const { position, rotationY } = useMemo(() => {
    const dx = node.through[0] - node.origin[0]
    const dy = node.through[1] - node.origin[1]
    if (Math.hypot(dx, dy) < 0.001) {
      return {
        position: [node.origin[0], XLINE_Y_OFFSET, node.origin[1]] as [number, number, number],
        rotationY: 0,
      }
    }
    return {
      position: [
        (node.origin[0] + node.through[0]) / 2,
        XLINE_Y_OFFSET,
        (node.origin[1] + node.through[1]) / 2,
      ] as [number, number, number],
      // Floorplan `(x, y)` maps to world `(x, 0, z)`; a Y-rotation by `θ` sends
      // the box's local +X to `(cosθ, 0, -sinθ)`, so θ = atan2(-dy, dx) aligns it
      // with the line direction.
      rotationY: Math.atan2(-dy, dx),
    }
  }, [node.origin, node.through])

  return (
    <group ref={ref} {...handlers} position={position} rotation={[0, rotationY, 0]}>
      <mesh
        frustumCulled={false}
        layers={OVERLAY_LAYER}
        renderOrder={0}
        userData={{ pascalExport: 'strip' }}
      >
        <boxGeometry args={[XLINE_HALF_LENGTH * 2, XLINE_THICKNESS, XLINE_WIDTH]} />
        <meshBasicMaterial
          color={XLINE_COLOR}
          depthTest={false}
          depthWrite={false}
          opacity={0.4}
          transparent
        />
      </mesh>
    </group>
  )
}

export default XLineRenderer
