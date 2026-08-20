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
import { useLayoutEffect, useMemo, useRef } from 'react'

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
  graph,
  levelId,
}: {
  active: boolean
  graph: SceneGraph
  levelId: string | null
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const contentRef = useRef<SVGGElement>(null)
  const entries = useMemo(
    () => (levelId ? buildFloorplanEntries(graph, levelId) : []),
    [graph, levelId],
  )

  useLayoutEffect(() => {
    if (!(active && levelId && entries.length > 0 && svgRef.current && contentRef.current)) return
    const bounds = contentRef.current.getBBox()
    if (!(bounds.width > 0 && bounds.height > 0)) return
    const padding = Math.max(0.75, Math.max(bounds.width, bounds.height) * 0.08)
    svgRef.current.setAttribute(
      'viewBox',
      `${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`,
    )
  }, [active, entries.length, levelId])

  return (
    <svg
      aria-label="Selected level floor plan"
      className="h-full w-full bg-background text-foreground"
      data-share-floorplan=""
      preserveAspectRatio="xMidYMid meet"
      ref={svgRef}
      role="img"
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
    </svg>
  )
}
