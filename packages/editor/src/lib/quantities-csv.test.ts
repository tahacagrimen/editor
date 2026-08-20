import { describe, expect, test } from 'bun:test'
import type { PricedQuantityTakeoff, QuantityTakeoff } from '@pascal-app/core'
import { formatQuantity, quantityDownloadCsv } from './quantities'

const raw: QuantityTakeoff = {
  nodeCount: 2,
  sections: [
    {
      kind: 'wall',
      label: 'Walls',
      lines: [
        {
          key: 'area',
          label: 'Face area',
          group: 'Brick',
          unit: 'area',
          value: 12.5,
          nodeCount: 2,
        },
      ],
    },
  ],
}

describe('quantityDownloadCsv', () => {
  test('omits every price column when cost visibility is off', () => {
    const csv = quantityDownloadCsv(raw, { showCost: false })

    expect(csv.split('\n')[0]).toBe('Category,Item,Group,Quantity,Unit,Count')
    expect(csv).not.toContain('Unit price')
  })

  test('exports the already-priced takeoff when cost visibility is on', () => {
    const priced: PricedQuantityTakeoff = {
      ...raw,
      sections: [
        {
          ...raw.sections[0]!,
          lines: [
            {
              ...raw.sections[0]!.lines[0]!,
              unitPrice: { amount: 480, currency: 'TRY' },
              cost: 6000,
            },
          ],
        },
      ],
      totals: [{ currency: 'TRY', cost: 6000 }],
    }
    const csv = quantityDownloadCsv(priced, { showCost: true })

    expect(csv.split('\n')[0]).toBe(
      'Category,Item,Group,Quantity,Unit,Count,Unit price,Currency,Cost',
    )
    expect(csv.split('\n')[1]).toBe('Walls,Face area,Brick,12.5,m²,2,480,TRY,6000')
  })
})

test('share takeoffs can request two Turkish fraction digits', () => {
  expect(formatQuantity(12.5, 'area', 'metric', 'meters', 2)).toBe('12,50 m²')
})
