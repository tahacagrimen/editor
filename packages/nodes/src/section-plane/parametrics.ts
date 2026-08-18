import type { ParametricDescriptor } from '@pascal-app/core'
import type { SectionPlaneNode } from './schema'

export const sectionPlaneParametrics: ParametricDescriptor<SectionPlaneNode> = {
  groups: [
    {
      label: 'Cut',
      fields: [
        { key: 'active', kind: 'boolean' },
        { key: 'flipped', kind: 'boolean' },
      ],
    },
    {
      label: 'Transform',
      fields: [
        { key: 'position', kind: 'vec3', axisLabels: ['X', 'Y', 'Z'] },
        { key: 'rotation', kind: 'vec3', unit: 'deg', axisLabels: ['Rot X', 'Rot Y', 'Rot Z'] },
      ],
    },
    {
      label: 'Display',
      fields: [{ key: 'size', kind: 'number', unit: 'm', min: 1, max: 200, step: 0.5 }],
    },
  ],
}
