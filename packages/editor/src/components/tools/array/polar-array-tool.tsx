'use client'

import { useScene, type AnyNodeId } from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { Raycaster, Vector2, Vector3 as ThreeVector3 } from 'three'
import { Html } from '@react-three/drei'
import useInteractionScope from '../../../store/use-interaction-scope'
import useMeasurementInput from '../../../store/use-measurement-input'
import { parseArrayCommand } from '../../../lib/array-duplicate'
import { runPolarArrayCommand } from '../../../lib/polar-array-command'
import { emitter } from '@pascal-app/core'

export const PolarArrayTool: React.FC = () => {
  const { camera, gl } = useThree()
  const activeScope = useInteractionScope((s) => s.scope)
  const isPolarArray = activeScope.kind === 'polar-array'
  const center = isPolarArray ? activeScope.center : undefined
  const nodeIds = isPolarArray ? activeScope.nodeIds : []
  const [hoverPoint, setHoverPoint] = useState<[number, number, number] | null>(null)

  useEffect(() => {
    if (!isPolarArray) {
      setHoverPoint(null)
      return
    }

    if (!center) {
      const canvas = gl.domElement
      const raycaster = new Raycaster()
      const pointer = new Vector2()

      const getHit = (event: PointerEvent | MouseEvent) => {
        const rect = canvas.getBoundingClientRect()
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        
        // Simple plane intersection for now
        const targetY = 0
        if (Math.abs(raycaster.ray.direction.y) < 0.001) return null
        const t = (targetY - raycaster.ray.origin.y) / raycaster.ray.direction.y
        if (t < 0) return null
        const hit = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(t))
        return [hit.x, hit.y, hit.z] as [number, number, number]
      }

      const onPointerMove = (e: PointerEvent) => {
        const hit = getHit(e)
        setHoverPoint(hit)
      }

      const onClick = (e: PointerEvent) => {
        if (e.button !== 0) return
        const hit = getHit(e)
        if (hit) {
          useInteractionScope.getState().update({ center: hit })
        }
      }

      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerup', onClick)
      return () => {
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerup', onClick)
      }
    } else {
      // Center is selected, wait for input
      const handleCommit = () => {
        const buffer = useMeasurementInput.getState().buffer
        const arrayCommand = parseArrayCommand(buffer)
        if (arrayCommand) {
          useMeasurementInput.getState().clear()
          runPolarArrayCommand(arrayCommand, nodeIds, center)
          useInteractionScope.getState().end() // Return to select mode
        }
      }

      emitter.on('tool:commit', handleCommit)
      return () => {
        emitter.off('tool:commit', handleCommit)
      }
    }
  }, [isPolarArray, center, camera, gl, nodeIds])

  if (!isPolarArray) return null

  return (
    <>
      {!center && hoverPoint && (
        <group position={hoverPoint}>
          <Html center style={{ pointerEvents: 'none' }}>
            <div className="rounded border border-primary/70 bg-background/90 px-3 py-1.5 text-xs tabular-nums text-foreground shadow-sm backdrop-blur">
              Click to place center
            </div>
          </Html>
        </group>
      )}
      {center && (
        <group position={center}>
          <Html center style={{ pointerEvents: 'none' }}>
            <div className="rounded border border-primary/70 bg-background/90 px-3 py-1.5 text-xs tabular-nums text-foreground shadow-sm backdrop-blur">
              Type *N [Angle]
            </div>
          </Html>
        </group>
      )}
    </>
  )
}
