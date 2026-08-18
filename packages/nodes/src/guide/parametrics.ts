import type { GuideNode, ParametricDescriptor } from '@pascal-app/core'

export const guideParametrics: ParametricDescriptor<GuideNode> = {
  groups: [
    {
      label: 'Transform',
      fields: [
        { key: 'position', kind: 'vec3', axisLabels: ['X', 'Y', 'Z'] },
        { key: 'rotation', kind: 'vec3', unit: 'deg', axisLabels: ['Rot X', 'Rot Y', 'Rot Z'] },
      ],
    },
  ],
}
