'use client'

import { useScene, type AnyNodeId, type AnyNode } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { Raycaster, Vector2 } from 'three'
import { Html } from '@react-three/drei'
import useInteractionScope from '../../../store/use-interaction-scope'
import useMeasurementInput from '../../../store/use-measurement-input'
import { parseArrayCommand } from '../../../lib/array-duplicate'
import { runPathArrayCommand } from '../../../lib/path-array-command'
import { emitter } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'

export const PathArrayTool: React.FC = () => {
  const { camera, gl } = useThree()
  const activeScope = useInteractionScope((s) => s.scope)
  const isPathArray = activeScope.kind === 'path-array'
  const nodeIds = isPathArray ? activeScope.nodeIds : []
  const [pathNode, setPathNode] = useState<AnyNode | null>(null)
  const [hoverPoint, setHoverPoint] = useState<[number, number, number] | null>(null)

  useEffect(() => {
    if (!isPathArray) {
      setPathNode(null)
      setHoverPoint(null)
      return
    }

    if (!pathNode) {
      const canvas = gl.domElement
      const raycaster = new Raycaster()
      const pointer = new Vector2()

      const getHitNode = (event: PointerEvent | MouseEvent) => {
        const hitNodeId = useViewer.getState().hoveredId
        if (hitNodeId) {
          const node = useScene.getState().nodes[hitNodeId]
          if (node && (node.type === 'wall' || node.type === 'fence' || node.type === 'slab' || node.type === 'zone')) {
            return node
          }
        }
        return null
      }

      const onPointerMove = (e: PointerEvent) => {
        const hitNode = getHitNode(e)
        // just find point on plane for UI
        const targetY = 0
        if (Math.abs(raycaster.ray.direction.y) > 0.001) {
          const t = (targetY - raycaster.ray.origin.y) / raycaster.ray.direction.y
          if (t >= 0) {
            const hit = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(t))
            setHoverPoint([hit.x, hit.y, hit.z])
          }
        }
      }

      const onClick = (e: PointerEvent) => {
        if (e.button !== 0) return
        const hitNode = getHitNode(e)
        if (hitNode) {
          setPathNode(hitNode)
        }
      }

      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerup', onClick)
      return () => {
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerup', onClick)
      }
    } else {
      // Path is selected, wait for input
      const handleCommit = () => {
        const buffer = useMeasurementInput.getState().buffer
        const arrayCommand = parseArrayCommand(buffer)
        if (arrayCommand) {
          useMeasurementInput.getState().clear()
          runPathArrayCommand(arrayCommand, nodeIds, pathNode)
          useInteractionScope.getState().end() // Return to select mode
        }
      }

      emitter.on('tool:commit', handleCommit)
      return () => {
        emitter.off('tool:commit', handleCommit)
      }
    }
  }, [isPathArray, pathNode, camera, gl, nodeIds])

  if (!isPathArray) return null

  return (
    <>
      {!pathNode && hoverPoint && (
        <group position={hoverPoint}>
          <Html center style={{ pointerEvents: 'none' }}>
            <div className="rounded border border-primary/70 bg-background/90 px-3 py-1.5 text-xs tabular-nums text-foreground shadow-sm backdrop-blur">
              Click a path (Wall/Fence/etc.)
            </div>
          </Html>
        </group>
      )}
      {pathNode && hoverPoint && (
        <group position={hoverPoint}>
          <Html center style={{ pointerEvents: 'none' }}>
            <div className="rounded border border-primary/70 bg-background/90 px-3 py-1.5 text-xs tabular-nums text-foreground shadow-sm backdrop-blur">
              Type *N or /N
            </div>
          </Html>
        </group>
      )}
    </>
  )
}
