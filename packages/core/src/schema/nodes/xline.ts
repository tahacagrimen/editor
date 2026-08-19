import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const XLineNode = BaseNode.extend({
  id: objectId('xline'),
  type: nodeType('xline'),
  // Two level-local points on the line. They are NOT endpoints — together they
  // define the direction of an infinite construction line (`through - origin`
  // unbounded in both directions), mirroring an AutoCAD XLine.
  origin: z.tuple([z.number(), z.number()]).default([0, 0]),
  through: z.tuple([z.number(), z.number()]).default([0, 5]),
}).describe(
  dedent`
  XLine node - an infinite construction/reference line used as a drawing aid
  - origin/through: level-local plan points defining the line's direction
  `,
)

export type XLineNode = z.infer<typeof XLineNode>
