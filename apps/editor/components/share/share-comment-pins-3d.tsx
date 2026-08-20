'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type CameraPose,
  emitter,
  type GridEvent,
  type NodeEvent,
  resolveCommentAnchorPosition,
} from '@pascal-app/core'
import { useTranslation } from '@pascal-app/editor'
import { type CameraControlsImpl, Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Vector3 } from 'three'
import type { NumberedShareComment } from '@/lib/share-comments'

const PIN_LIFT = 0.12

function nodePosition(nodes: Record<string, AnyNode>, id: AnyNodeId) {
  const position = (nodes[id] as { position?: unknown } | undefined)?.position
  if (
    !Array.isArray(position) ||
    position.length !== 3 ||
    !position.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    return null
  }
  return position as [number, number, number]
}

export function ShareCommentPins3D({
  activeId,
  comments,
  draftPosition,
  nodes,
  onPinClick,
}: {
  activeId: string | null
  comments: NumberedShareComment[]
  draftPosition: [number, number, number] | null
  nodes: Record<string, AnyNode>
  onPinClick: (id: string) => void
}) {
  return (
    <group>
      {comments.map(({ number, thread }) => {
        const position = resolveCommentAnchorPosition(thread.anchor, (id) =>
          nodePosition(nodes, id),
        )
        return (
          <Html center key={thread.id} position={position} zIndexRange={[50, 40]}>
            <ShareScenePin
              active={activeId === thread.id}
              number={number}
              onClick={() => onPinClick(thread.id)}
              resolved={thread.resolved === true}
            />
          </Html>
        )
      })}
      {draftPosition && (
        <Html center position={draftPosition} zIndexRange={[55, 45]}>
          <span className="flex size-11 items-center justify-center rounded-full border-2 border-primary border-dashed bg-background/90 text-primary shadow-md">
            +
          </span>
        </Html>
      )}
    </group>
  )
}

export function ShareScenePin({
  active,
  number,
  onClick,
  resolved,
}: {
  active: boolean
  number: number
  onClick: () => void
  resolved: boolean
}) {
  const t = useTranslation()
  return (
    <button
      aria-label={`${t('Open comment')} ${number}`}
      className={`flex size-11 items-center justify-center rounded-full border-2 font-extrabold text-xs shadow-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        resolved
          ? 'border-muted-foreground bg-background text-muted-foreground'
          : 'border-primary bg-primary text-primary-foreground'
      } ${active ? 'ring-4 ring-primary/30' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      type="button"
    >
      {number}
    </button>
  )
}

/** Mounted only while a comment-enabled visitor is choosing a 3D point. */
export function ShareCommentPlacement3D({
  controls,
  levelId,
  nodeKinds,
  nodes,
  onDrop,
}: {
  controls: React.RefObject<CameraControlsImpl | null>
  levelId: string | null
  nodeKinds: string[]
  nodes: Record<string, AnyNode>
  onDrop: (draft: {
    position: [number, number, number]
    nodeId?: string
    offset?: [number, number, number]
    levelId?: string
    camera: CameraPose
  }) => void
}) {
  const camera = useThree((state) => state.camera)
  const kinds = useMemo(() => [...new Set(nodeKinds)], [nodeKinds])

  useEffect(() => {
    const containers = new Set(['site', 'building', 'level'])
    let press: { nodeId: AnyNodeId; position: [number, number, number] } | null = null
    let handled = false
    let resetTimer: ReturnType<typeof setTimeout> | undefined

    const resetPress = () => {
      press = null
    }
    const onNodeDown = (event: NodeEvent) => {
      if (press || containers.has(event.node.type)) return
      press = { nodeId: event.node.id as AnyNodeId, position: event.position }
    }
    const capturePose = (): CameraPose => {
      const position = new Vector3()
      const target = new Vector3()
      controls.current?.getPosition(position, false)
      controls.current?.getTarget(target, false)
      const perspective = 'isPerspectiveCamera' in camera && camera.isPerspectiveCamera === true
      return {
        position: [position.x, position.y, position.z],
        target: [target.x, target.y, target.z],
        projection: perspective ? 'perspective' : 'orthographic',
        ...(perspective && 'fov' in camera && typeof camera.fov === 'number'
          ? { fov: camera.fov }
          : {}),
      }
    }
    const commit = (fallbackPosition: [number, number, number]) => {
      if (handled) return
      handled = true
      clearTimeout(resetTimer)
      resetTimer = setTimeout(() => {
        handled = false
      }, 50)

      const hit = press
      const position = hit?.position ?? fallbackPosition
      const origin = hit ? nodePosition(nodes, hit.nodeId) : null
      const lifted: [number, number, number] = [position[0], position[1] + PIN_LIFT, position[2]]
      onDrop({
        position: lifted,
        ...(hit && { nodeId: hit.nodeId }),
        ...(hit &&
          origin && {
            offset: [lifted[0] - origin[0], lifted[1] - origin[1], lifted[2] - origin[2]],
          }),
        ...(levelId && { levelId }),
        camera: capturePose(),
      })
    }
    const onNodeClick = (event: NodeEvent) => {
      event.stopPropagation()
      commit(event.position)
    }
    const onGridClick = (event: GridEvent) => commit(event.position)

    window.addEventListener('pointerdown', resetPress, true)
    for (const kind of kinds) {
      emitter.on(`${kind}:pointerdown` as never, onNodeDown as never)
      emitter.on(`${kind}:click` as never, onNodeClick as never)
    }
    emitter.on('grid:click', onGridClick)
    return () => {
      clearTimeout(resetTimer)
      window.removeEventListener('pointerdown', resetPress, true)
      for (const kind of kinds) {
        emitter.off(`${kind}:pointerdown` as never, onNodeDown as never)
        emitter.off(`${kind}:click` as never, onNodeClick as never)
      }
      emitter.off('grid:click', onGridClick)
    }
  }, [camera, controls, kinds, levelId, nodes, onDrop])

  return null
}
