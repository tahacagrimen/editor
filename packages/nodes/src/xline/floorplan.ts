import type { FloorplanGeometry, GeometryContext, XLineNode } from '@pascal-app/core'

// The "infinite" line is a long finite segment — there is no infinite SVG
// primitive and `GeometryContext.viewState` carries no viewport bounds, so we
// extend to a fixed half-length and let the panel's viewBox clip it.
const XLINE_HALF_LENGTH = 10000
const XLINE_STROKE = '#0ea5e9'

export function buildXLineFloorplan(
  node: XLineNode,
  ctx: GeometryContext,
): FloorplanGeometry | null {
  const dx = node.through[0] - node.origin[0]
  const dy = node.through[1] - node.origin[1]
  const length = Math.hypot(dx, dy)
  if (length < 0.001) return null

  const ux = dx / length
  const uy = dy / length
  const midX = (node.origin[0] + node.through[0]) / 2
  const midY = (node.origin[1] + node.through[1]) / 2

  const selected = ctx.viewState?.selected ?? false
  const highlighted = ctx.viewState?.highlighted ?? false
  const palette = ctx.viewState?.palette
  const active = selected || highlighted
  const stroke = active && palette ? palette.selectedStroke : XLINE_STROKE

  // Deliberately NOT tagged with an annotation role. Structural grids and
  // column centers are tagged `structuralGrids`, which `resolveFloorplan-
  // AnnotationVisibility` hides in the default floorplan mode — a reference
  // line the user places has to render in the default view, so it stays an
  // ordinary always-visible node rather than a toggleable annotation.
  return {
    kind: 'group',
    children: [
      {
        kind: 'line',
        x1: midX - ux * XLINE_HALF_LENGTH,
        y1: midY - uy * XLINE_HALF_LENGTH,
        x2: midX + ux * XLINE_HALF_LENGTH,
        y2: midY + uy * XLINE_HALF_LENGTH,
        stroke,
        strokeWidth: active ? 1.6 : 1,
        strokeDasharray: '10 4 2 4',
        vectorEffect: 'non-scaling-stroke',
        pointerEvents: 'stroke',
      },
    ],
  }
}
