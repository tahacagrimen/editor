import type { NodeDefinition } from '@pascal-app/core'
import type { FloorplanNodeExtension } from '@pascal-app/editor'
import { buildXLineFloorplan } from './floorplan'
import { XLineNode } from './schema'

export const xlineDefinition: NodeDefinition<typeof XLineNode> = {
  kind: 'xline',
  bake: 'strip',
  schemaVersion: 1,
  schema: XLineNode,
  category: 'structure',
  extensions: {
    'pascal:editor/floorplan': {
      tool: () => import('./floorplan-tool'),
      // `default` keeps the tile visible in the normal Build tab (structural-grid
      // uses `['expert']` and is hidden until Expert mode).
      availableModes: ['default', 'expert'],
      preferredView: '2d',
    } satisfies FloorplanNodeExtension<XLineNode>,
  },
  snapProfile: 'structural',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    origin: [0, 0],
    through: [0, 5],
  }),

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    deletable: true,
    presettable: false,
  },

  dirtyTracking: false,
  floorplan: buildXLineFloorplan,
  renderer: { kind: 'parametric', module: () => import('./renderer') },
  toolHints: [
    { key: 'Left click', label: 'Place line origin' },
    { key: 'Left click', label: 'Set line direction' },
    { key: 'Alt', label: 'Bypass snapping' },
    { key: 'Esc', label: 'Cancel' },
  ],

  presentation: {
    label: 'XLine',
    description: 'Infinite construction line for reference while drawing.',
    icon: { kind: 'url', src: '/icons/xline.webp' },
    paletteSection: 'structure',
    paletteOrder: 71,
    // Not in the Build palette — it is armed from the bottom bar, next to the
    // measure button, not from the structure tool grid.
    hidden: true,
  },

  mcp: {
    description:
      'An infinite construction/reference line defined by two level-local points (origin and through), unbounded in both directions.',
  },
}
