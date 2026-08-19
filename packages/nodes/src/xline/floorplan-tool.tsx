'use client'

import { type AnyNodeId, XLineNode } from '@pascal-app/core'
import {
  clearSurfacePlanSnapFeedback,
  type FloorplanToolContext,
  isAngleSnapActive,
  isGridSnapActive,
  isMagneticSnapActive,
  markToolCancelConsumed,
  resolveSurfacePlanPointSnap,
  triggerSFX,
  useFloorplanRender,
  useInteractionScope,
} from '@pascal-app/editor'
import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_XLINE_LENGTH = 0.01
const ANGLE_INCREMENT = Math.PI / 4
const XLINE_PREVIEW_HALF_LENGTH = 10000
const XLINE_COLOR = '#0ea5e9'

type PlanPoint = [number, number]

export function shouldConsumeXLinePointerEvent(event: {
  type: string
  button: number
  buttons: number
}): boolean {
  if (event.type === 'pointerdown') return event.button === 0
  return (event.buttons & 0b110) === 0
}

function snap(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value
}

function clientToPlanPoint(group: SVGGElement, clientX: number, clientY: number): PlanPoint | null {
  const matrix = group.getScreenCTM()
  if (!matrix) return null
  const local = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
  return [local.x, local.y]
}

export function snapXLineAngle(start: PlanPoint, point: PlanPoint): PlanPoint {
  const dx = point[0] - start[0]
  const dy = point[1] - start[1]
  const length = Math.hypot(dx, dy)
  if (length < MIN_XLINE_LENGTH) return point
  const angle = Math.round(Math.atan2(dy, dx) / ANGLE_INCREMENT) * ANGLE_INCREMENT
  return [start[0] + Math.cos(angle) * length, start[1] + Math.sin(angle) * length]
}

export function FloorplanXLineToolLayer({
  activeLevelId,
  finishTool,
  gridSnapStep,
  sceneApi,
  selectNode,
}: FloorplanToolContext) {
  const groupRef = useRef<SVGGElement>(null)
  const startRef = useRef<PlanPoint | null>(null)
  const [start, setStart] = useState<PlanPoint | null>(null)
  const [hover, setHover] = useState<PlanPoint | null>(null)
  const renderContext = useFloorplanRender()

  useEffect(() => {
    useInteractionScope.getState().begin({ kind: 'drafting', tool: 'xline' })
    return () =>
      useInteractionScope
        .getState()
        .endIf((scope) => scope.kind === 'drafting' && scope.tool === 'xline')
  }, [])

  const updateStart = useCallback((point: PlanPoint | null) => {
    startRef.current = point
    setStart(point)
  }, [])

  useEffect(() => {
    updateStart(null)
    setHover(null)
    const group = groupRef.current
    const svg = group?.ownerSVGElement
    if (!(activeLevelId && group && svg)) return

    const consume = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
    const resolveEvent = (event: MouseEvent | PointerEvent): PlanPoint | null => {
      const raw = clientToPlanPoint(group, event.clientX, event.clientY)
      if (!raw) return null
      const anglePoint =
        startRef.current && !event.altKey && isAngleSnapActive()
          ? snapXLineAngle(startRef.current, raw)
          : raw
      const step = !event.altKey && isGridSnapActive() ? gridSnapStep : 0
      const fallback: PlanPoint = [snap(anglePoint[0], step), snap(anglePoint[1], step)]
      const snapped = resolveSurfacePlanPointSnap({
        rawPoint: anglePoint,
        fallbackPoint: fallback,
        levelId: activeLevelId,
        magnetic: !event.altKey && isMagneticSnapActive(),
        align: isMagneticSnapActive(),
      })
      return snapped.point
    }
    const onPointerDown = (event: PointerEvent) => {
      if (shouldConsumeXLinePointerEvent(event)) consume(event)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (shouldConsumeXLinePointerEvent(event)) consume(event)
      setHover(resolveEvent(event))
    }
    const onPointerLeave = () => {
      clearSurfacePlanSnapFeedback()
      setHover(null)
    }
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return
      consume(event)
      const point = resolveEvent(event)
      if (!point) return
      const currentStart = startRef.current
      if (!currentStart) {
        updateStart(point)
        return
      }
      if (Math.hypot(point[0] - currentStart[0], point[1] - currentStart[1]) < MIN_XLINE_LENGTH) {
        return
      }

      const node = XLineNode.parse({
        name: 'XLine',
        origin: currentStart,
        through: point,
      })
      sceneApi.upsert(node, activeLevelId as AnyNodeId)
      selectNode(node.id)
      triggerSFX('sfx:structure-build')
      finishTool()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      markToolCancelConsumed()
      if (startRef.current) {
        updateStart(null)
        return
      }
      finishTool()
    }
    const onBlur = () => clearSurfacePlanSnapFeedback()

    svg.addEventListener('pointerdown', onPointerDown, true)
    svg.addEventListener('pointermove', onPointerMove, true)
    svg.addEventListener('pointerleave', onPointerLeave, true)
    svg.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      clearSurfacePlanSnapFeedback()
      svg.removeEventListener('pointerdown', onPointerDown, true)
      svg.removeEventListener('pointermove', onPointerMove, true)
      svg.removeEventListener('pointerleave', onPointerLeave, true)
      svg.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [activeLevelId, finishTool, gridSnapStep, sceneApi, selectNode, updateStart])

  if (!activeLevelId) return null
  const unitsPerPixel = renderContext?.unitsPerPixel ?? 0.01
  const reticleRadius = 9 * unitsPerPixel

  const renderInfinitePreview = (from: PlanPoint, through: PlanPoint) => {
    const dx = through[0] - from[0]
    const dy = through[1] - from[1]
    const length = Math.hypot(dx, dy)
    if (length < MIN_XLINE_LENGTH) return null
    const ux = dx / length
    const uy = dy / length
    const midX = (from[0] + through[0]) / 2
    const midY = (from[1] + through[1]) / 2
    return (
      <line
        stroke={XLINE_COLOR}
        strokeDasharray="10 4 2 4"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        x1={midX - ux * XLINE_PREVIEW_HALF_LENGTH}
        x2={midX + ux * XLINE_PREVIEW_HALF_LENGTH}
        y1={midY - uy * XLINE_PREVIEW_HALF_LENGTH}
        y2={midY + uy * XLINE_PREVIEW_HALF_LENGTH}
      />
    )
  }

  return (
    <g ref={groupRef}>
      {start && hover ? (
        <g pointerEvents="none">{renderInfinitePreview(start, hover)}</g>
      ) : null}
      {hover ? (
        <g pointerEvents="none">
          <circle
            cx={hover[0]}
            cy={hover[1]}
            fill="none"
            r={reticleRadius}
            stroke={XLINE_COLOR}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          <line
            stroke={XLINE_COLOR}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            x1={hover[0] - reticleRadius * 1.4}
            x2={hover[0] + reticleRadius * 1.4}
            y1={hover[1]}
            y2={hover[1]}
          />
          <line
            stroke={XLINE_COLOR}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            x1={hover[0]}
            x2={hover[0]}
            y1={hover[1] - reticleRadius * 1.4}
            y2={hover[1] + reticleRadius * 1.4}
          />
        </g>
      ) : null}
    </g>
  )
}

export default FloorplanXLineToolLayer
