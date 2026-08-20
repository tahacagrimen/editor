import { describe, expect, test } from 'bun:test'
import { prepareShareGraph, replaceShareComments } from './share-graph'

const graph = {
  nodes: {},
  rootNodeIds: [],
  comments: { thread_1: { body: 'Review this.' } },
  unitPrices: {
    'wall:length': { amount: 480, currency: 'TRY' },
  },
}

describe('prepareShareGraph', () => {
  test('omits unit prices from the serialized client graph when costs are hidden', () => {
    const prepared = prepareShareGraph(graph, { allowComments: true, showCost: false })

    expect(prepared).not.toHaveProperty('unitPrices')
    expect(JSON.stringify(prepared)).not.toContain('480')
    expect(graph.unitPrices['wall:length']?.amount).toBe(480)
  })

  test('keeps prices for an authorized link and independently filters comments', () => {
    const prepared = prepareShareGraph(graph, { allowComments: false, showCost: true })

    expect(prepared.unitPrices).toEqual(graph.unitPrices)
    expect(prepared.comments).toEqual({})
  })
})

test('posting a share comment preserves the authoritative unit-price bag', () => {
  const saved = replaceShareComments(graph, { thread_2: { body: 'Looks good.' } })

  expect(saved.unitPrices).toEqual(graph.unitPrices)
  expect(saved.comments).toEqual({ thread_2: { body: 'Looks good.' } })
})
