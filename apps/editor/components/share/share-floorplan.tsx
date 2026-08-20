'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type FloorplanGeometry,
  type GeometryContext,
  isNodeKindEnabled,
  nodeRegistry,
} from '@pascal-app/core'
import {
  createFloorplanContextExtensions,
  FloorplanGeometryRenderer,
  type SceneGraph,
} from '@pascal-app/editor'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { NumberedShareComment } from '@/lib/share-comments'
import { floorplanPointToWorld, worldPointToFloorplan } from '@/lib/share-comments'

type FloorplanEntry = {
  id: string
  geometry: FloorplanGeometry
}

const EMPTY_LIVE_TRANSFORMS = new Map()
const EMPTY_LIVE_OVERRIDES = new Map()

function childrenOf(node: AnyNode, nodes: Record<string, AnyNode>): AnyNode[] {
  const children = (node as unknown as { children?: string[] }).children
  return Array.isArray(children)
    ? children.map((id) => nodes[id]).filter((child): child is AnyNode => Boolean(child))
    : []
}

function buildContext(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
  levelData: unknown,
  parentOverride?: AnyNode,
): GeometryContext {
  const parentId = node.parentId as AnyNodeId | null
  const parent = parentOverride ?? (parentId ? nodes[parentId] : null) ?? null
  const siblings = parent
    ? childrenOf(parent, nodes).filter(
        (candidate) => candidate.id !== node.id && candidate.type === node.type,
      )
    : []

  return {
    resolve: <N = AnyNode>(id: AnyNodeId) => nodes[id] as N | undefined,
    children: childrenOf(node, nodes),
    siblings,
    parent,
    levelData,
    extensions: createFloorplanContextExtensions({
      automaticDimensions: false,
      metricNotation: 'meters',
      purpose: 'document',
    }),
  }
}

function buildFloorplanEntries(graph: SceneGraph, levelId: string): FloorplanEntry[] {
  const nodes = graph.nodes as unknown as Record<string, AnyNode>
  const level = nodes[levelId]
  if (level?.type !== 'level') return []

  const collected: AnyNode[] = []
  const visited = new Set<string>()
  const visit = (node: AnyNode) => {
    if (visited.has(node.id) || node.visible === false) return
    visited.add(node.id)
    if (isNodeKindEnabled(node.type, graph.installedPlugins)) collected.push(node)
    for (const child of childrenOf(node, nodes)) visit(child)
  }
  visit(level)

  const buildingId = level.parentId
  if (buildingId) {
    for (const node of Object.values(nodes)) {
      const definition = nodeRegistry.get(node.type)
      if (
        node.parentId === buildingId &&
        definition?.floorplanScope === 'building' &&
        !visited.has(node.id) &&
        node.visible !== false &&
        isNodeKindEnabled(node.type, graph.installedPlugins)
      ) {
        collected.push(node)
      }
    }
  }

  const byType = new Map<string, AnyNode[]>()
  for (const node of collected) {
    const siblings = byType.get(node.type)
    if (siblings) siblings.push(node)
    else byType.set(node.type, [node])
  }

  const levelData = new Map<string, unknown>()
  for (const [type, siblings] of byType) {
    const compute = nodeRegistry.get(type)?.computeFloorplanLevelData
    if (!compute) continue
    try {
      levelData.set(type, compute({ siblings, nodes }))
    } catch (error) {
      console.warn(`[share/floorplan] Could not derive level data for ${type}.`, error)
    }
  }

  const entries: FloorplanEntry[] = []
  for (const sourceNode of collected) {
    const definition = nodeRegistry.get(sourceNode.type)
    const builder = definition?.floorplan
    if (!builder) continue

    try {
      const contextNodes = definition.floorplanSiblingOverrides
        ? definition.floorplanSiblingOverrides({
            nodeId: sourceNode.id,
            nodes,
            liveTransforms: EMPTY_LIVE_TRANSFORMS,
            liveOverrides: EMPTY_LIVE_OVERRIDES,
          })
        : nodes
      const node = contextNodes[sourceNode.id] ?? sourceNode
      const geometry = (
        builder as (node: AnyNode, context: GeometryContext) => FloorplanGeometry | null
      )(
        node,
        buildContext(
          node,
          contextNodes,
          levelData.get(node.type),
          definition.floorplanScope === 'building' ? level : undefined,
        ),
      )
      if (geometry) entries.push({ id: sourceNode.id, geometry })
    } catch (error) {
      console.warn(`[share/floorplan] Could not draw ${sourceNode.type} ${sourceNode.id}.`, error)
    }
  }

  return entries
}

export function ShareFloorplan({
  active,
  activeCommentId,
  comments,
  draftPosition,
  graph,
  levelId,
  onDropComment,
  onPinClick,
  placementEnabled,
}: {
  active: boolean
  activeCommentId: string | null
  comments: NumberedShareComment[]
  draftPosition: [number, number, number] | null
  graph: SceneGraph
  levelId: string | null
  onDropComment: (position: [number, number, number]) => void
  onPinClick: (id: string) => void
  placementEnabled: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const contentRef = useRef<SVGGElement>(null)
  const [unitsPerPixel, setUnitsPerPixel] = useState(0.02)
  const entries = useMemo(
    () => (levelId ? buildFloorplanEntries(graph, levelId) : []),
    [graph, levelId],
  )
  const buildingTransform = useMemo(() => {
    const nodes = graph.nodes as unknown as Record<string, AnyNode>
    const level = levelId ? nodes[levelId] : null
    const building = level?.parentId ? nodes[level.parentId] : null
    const position = (building as { position?: unknown } | null)?.position
    const rotation = (building as { rotation?: unknown } | null)?.rotation
    return {
      position:
        Array.isArray(position) && position.length === 3
          ? (position as [number, number, number])
          : ([0, 0, 0] as [number, number, number]),
      rotationY: Array.isArray(rotation) && typeof rotation[1] === 'number' ? rotation[1] : 0,
    }
  }, [graph.nodes, levelId])

  useLayoutEffect(() => {
    if (!(active && levelId && entries.length > 0 && svgRef.current && contentRef.current)) return
    const bounds = contentRef.current.getBBox()
    if (!(bounds.width > 0 && bounds.height > 0)) return
    const padding = Math.max(0.75, Math.max(bounds.width, bounds.height) * 0.08)
    const viewWidth = bounds.width + padding * 2
    svgRef.current.setAttribute(
      'viewBox',
      `${bounds.x - padding} ${bounds.y - padding} ${viewWidth} ${bounds.height + padding * 2}`,
    )
    if (svgRef.current.clientWidth > 0) {
      setUnitsPerPixel(viewWidth / svgRef.current.clientWidth)
    }
  }, [active, entries.length, levelId])

  useLayoutEffect(() => {
    if (!(active && activeCommentId && svgRef.current)) return
    const item = comments.find(({ thread }) => thread.id === activeCommentId)
    if (!item) return
    const local = worldPointToFloorplan(
      item.thread.anchor.position,
      buildingTransform.position,
      buildingTransform.rotationY,
    )
    const viewBox = svgRef.current.viewBox.baseVal
    if (!(viewBox.width > 0 && viewBox.height > 0)) return
    svgRef.current.setAttribute(
      'viewBox',
      `${local.x - viewBox.width / 2} ${local.y - viewBox.height / 2} ${viewBox.width} ${viewBox.height}`,
    )
  }, [active, activeCommentId, buildingTransform, comments])

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!(placementEnabled && event.button === 0)) return
    if (event.target instanceof Element && event.target.closest('[data-share-comment-pin]')) return
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    event.preventDefault()
    event.stopPropagation()
    onDropComment(
      floorplanPointToWorld(
        { x: local.x, y: local.y },
        buildingTransform.position,
        buildingTransform.rotationY,
      ),
    )
  }

  const renderPin = (
    position: [number, number, number],
    label: React.ReactNode,
    options: { id?: string; resolved?: boolean; draft?: boolean; active?: boolean },
  ) => {
    const local = worldPointToFloorplan(
      position,
      buildingTransform.position,
      buildingTransform.rotationY,
    )
    return (
      <foreignObject
        data-share-comment-pin=""
        height={44}
        key={options.id ?? 'draft'}
        style={{ overflow: 'visible', pointerEvents: 'auto' }}
        transform={`translate(${local.x} ${local.y}) scale(${unitsPerPixel})`}
        width={44}
        x={-22}
        y={-22}
      >
        {options.draft ? (
          <span className="flex size-11 items-center justify-center rounded-full border-2 border-primary border-dashed bg-background/90 font-extrabold text-primary shadow-md">
            +
          </span>
        ) : (
          <button
            aria-label={`Open comment ${label}`}
            className={`flex size-11 items-center justify-center rounded-full border-2 font-extrabold text-xs shadow-md ${
              options.resolved
                ? 'border-muted-foreground bg-background text-muted-foreground'
                : 'border-primary bg-primary text-primary-foreground'
            } ${options.active ? 'ring-4 ring-primary/30' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              if (options.id) onPinClick(options.id)
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            {label}
          </button>
        )}
      </foreignObject>
    )
  }

  return (
    <svg
      aria-label="Selected level floor plan"
      className={`h-full w-full bg-background text-foreground ${
        placementEnabled ? 'cursor-crosshair' : ''
      }`}
      data-share-floorplan=""
      onPointerDown={handlePointerDown}
      preserveAspectRatio="xMidYMid meet"
      ref={svgRef}
      role="group"
      viewBox="-10 -10 20 20"
    >
      <g pointerEvents="none" ref={contentRef}>
        {entries.map((entry) => (
          <FloorplanGeometryRenderer
            geometry={entry.geometry}
            key={entry.id}
            pointerEventsOverride="none"
            renderMode="screen"
          />
        ))}
      </g>
      {comments.map(({ number, thread }) =>
        renderPin(thread.anchor.position, number, {
          id: thread.id,
          resolved: thread.resolved === true,
          active: activeCommentId === thread.id,
        }),
      )}
      {draftPosition && renderPin(draftPosition, '+', { draft: true })}
    </svg>
  )
}
