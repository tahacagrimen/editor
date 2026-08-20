import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { SharePdfRequest } from './share-pdf'
import { buildSharePdfModel, renderSharePdf } from './share-pdf'

function graph(levelCount: number) {
  const levels = Array.from({ length: levelCount }, (_, index) => ({
    id: `level_${index}`,
    type: 'level',
    name: index === 0 ? 'Zemin Kat' : `${index}. Kat`,
    level: index,
    height: 3.2,
    children: [],
  }))
  return {
    rootNodeIds: ['site_1'],
    nodes: {
      site_1: { id: 'site_1', type: 'site', children: ['building_1'], polygon: { points: [] } },
      building_1: {
        id: 'building_1',
        type: 'building',
        children: levels.map((level) => level.id),
      },
      ...Object.fromEntries(levels.map((level) => [level.id, level])),
    },
    unitPrices: { 'wall\0length\0': { amount: 500, currency: 'TRY' } },
    comments: {
      comment_1: {
        id: 'comment_1',
        anchor: { position: [0, 0, 0] },
        author: { name: 'Çağrı' },
        body: 'Şişli cephesini kontrol edin.',
        createdAt: '2026-08-20T10:00:00.000Z',
        replies: [],
      },
    },
  }
}

function request(levelCount: number): SharePdfRequest {
  return {
    levels: Array.from({ length: levelCount }, (_, index) => ({
      id: `level_${index}`,
      takeoff: {
        nodeCount: 1,
        sections: [
          {
            kind: 'wall',
            label: 'Walls',
            lines: [
              {
                key: 'length',
                label: 'Length',
                unit: 'length' as const,
                value: 12.5,
                nodeCount: 1,
              },
            ],
          },
        ],
      },
    })),
  }
}

describe('share PDF permission cuts', () => {
  test('physically omits prices and the comments page when permissions are off', () => {
    const model = buildSharePdfModel({
      projectName: 'Çağdaş Proje',
      revision: 4,
      updatedAt: '2026-08-20T10:00:00.000Z',
      graph: graph(2),
      request: request(2),
      showCost: false,
      allowComments: false,
    })

    expect(model.pages.map((page) => page.kind)).toEqual(['summary', 'level', 'level'])
    const level = model.pages.find((page) => page.kind === 'level')
    expect(level?.lines[0]?.quantity).toBe('12,50 m')
    expect(level?.lines[0]).not.toHaveProperty('unitPrice')
    expect(level?.lines[0]).not.toHaveProperty('amount')
    expect(JSON.stringify(model)).not.toContain('Şişli cephesini')
    expect(JSON.stringify(model)).not.toContain('6.250')
  })

  test('adds authoritative costs and comments only when both are allowed', () => {
    const model = buildSharePdfModel({
      projectName: 'Çağdaş Proje',
      revision: 4,
      updatedAt: '2026-08-20T10:00:00.000Z',
      graph: graph(1),
      request: request(1),
      showCost: true,
      allowComments: true,
    })
    const level = model.pages.find((page) => page.kind === 'level')
    expect(level?.lines[0]?.unitPrice).toContain('500,00')
    expect(level?.lines[0]?.amount).toContain('6.250,00')
    expect(model.pages.at(-1)?.kind).toBe('comments')
  })
})

test('a 22-level Turkish PDF embeds fonts and renders well below a route timeout', async () => {
  const model = buildSharePdfModel({
    projectName: 'Çağdaş Şişli Projesi',
    revision: 12,
    updatedAt: '2026-08-20T10:00:00.000Z',
    graph: graph(22),
    request: request(22),
    showCost: false,
    allowComments: false,
  })
  const started = performance.now()
  const pdf = await renderSharePdf(model, {
    compress: false,
    fontDirectory: join(import.meta.dir, '../public/fonts'),
  })

  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(23)
  expect(pdf.includes(Buffer.from('/FontFile2'))).toBe(true)
  expect(pdf.includes(Buffer.from('/BaseFont /Helvetica'))).toBe(false)
  expect(performance.now() - started).toBeLessThan(5_000)
})
