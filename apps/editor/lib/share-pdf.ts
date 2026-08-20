import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  type PricedQuantityTakeoff,
  priceQuantityTakeoff,
  type QuantityTakeoff,
  type QuantityUnit,
} from '@pascal-app/core/quantities'
import { type CommentThread, normalizeComments, normalizeUnitPrices } from '@pascal-app/core/schema'
import { translate } from '@pascal-app/editor/i18n'
import PDFDocument from 'pdfkit'
import { z } from 'zod'
import { readShareLevels } from './share-scene-levels'
import { buildShareSummary, type ShareSummary } from './share-summary'

const MAX_IMAGE_DATA_URL = 5_000_000
const quantityUnit = z.enum(['length', 'area', 'volume', 'count'])
const imageDataUrl = z
  .string()
  .max(MAX_IMAGE_DATA_URL)
  .regex(/^data:image\/(?:png|jpe?g);base64,[A-Za-z0-9+/=]+$/)

const takeoffSchema = z.object({
  nodeCount: z.number().int().nonnegative(),
  sections: z
    .array(
      z.object({
        kind: z.string().max(120),
        label: z.string().max(200),
        lines: z
          .array(
            z.object({
              key: z.string().max(160),
              label: z.string().max(200),
              group: z.string().max(200).optional(),
              unit: quantityUnit,
              value: z.number().finite(),
              nodeCount: z.number().int().nonnegative(),
            }),
          )
          .max(500),
      }),
    )
    .max(100),
})

export const sharePdfRequestSchema = z.object({
  snapshot: imageDataUrl.optional(),
  levels: z
    .array(
      z.object({
        id: z.string().max(160),
        planImage: imageDataUrl.optional(),
        takeoff: takeoffSchema.optional(),
      }),
    )
    .max(100)
    .default([]),
})

export type SharePdfRequest = z.infer<typeof sharePdfRequestSchema>

type GraphLike = {
  nodes: Record<string, unknown>
  rootNodeIds: string[]
  comments?: unknown
  unitPrices?: unknown
  [key: string]: unknown
}

export type SharePdfLine = {
  label: string
  quantity: string
  unitPrice?: string
  amount?: string
}

export type SharePdfPage =
  | { kind: 'summary'; summary: ShareSummary; snapshot?: string }
  | {
      kind: 'level'
      id: string
      name: string
      area: string | null
      height: string | null
      planImage?: string
      lines: SharePdfLine[]
      showCost: boolean
    }
  | {
      kind: 'comments'
      threads: CommentThread[]
    }

export type SharePdfModel = {
  projectName: string
  revision: number
  date: string
  parcelLine: string | null
  pages: SharePdfPage[]
}

export function buildSharePdfModel({
  projectName,
  revision,
  updatedAt,
  graph,
  request,
  showCost,
  allowComments,
}: {
  projectName: string
  revision: number
  updatedAt: string
  graph: GraphLike
  request: SharePdfRequest
  showCost: boolean
  allowComments: boolean
}): SharePdfModel {
  const summary = buildShareSummary(graph as never)
  const assets = new Map(request.levels.map((level) => [level.id, level]))
  const unitPrices = normalizeUnitPrices(graph.unitPrices)
  const pages: SharePdfPage[] = [
    { kind: 'summary', summary, ...(request.snapshot && { snapshot: request.snapshot }) },
  ]

  for (const level of readShareLevels(graph as never)) {
    const asset = assets.get(level.id)
    const priced = asset?.takeoff
      ? priceQuantityTakeoff(asset.takeoff as QuantityTakeoff, unitPrices)
      : null
    pages.push({
      kind: 'level',
      id: level.id,
      name: translate(level.name, 'tr'),
      area: level.area === null ? null : formatNumber(level.area, ' m²'),
      height: level.height === null ? null : formatNumber(level.height, ' m'),
      ...(asset?.planImage && { planImage: asset.planImage }),
      lines: priced ? quantityLines(priced, showCost) : [],
      showCost,
    })
  }

  if (allowComments) {
    const threads = Object.values(normalizeComments(graph.comments)).sort((left, right) =>
      left.createdAt === right.createdAt
        ? left.id.localeCompare(right.id)
        : left.createdAt.localeCompare(right.createdAt),
    )
    pages.push({ kind: 'comments', threads })
  }

  const parcel = summary.parcelRows.find((row) => row.label === 'Block / parcel')
  return {
    projectName,
    revision,
    date: formatDate(updatedAt),
    parcelLine: parcel ? `Ada / parsel ${parcel.value}` : null,
    pages,
  }
}

function quantityLines(takeoff: PricedQuantityTakeoff, showCost: boolean): SharePdfLine[] {
  return takeoff.sections.flatMap((section) =>
    section.lines.map((line) => ({
      label: `${translate(section.label, 'tr')} · ${line.group ? `${line.group} · ` : ''}${translate(line.label, 'tr')}`,
      quantity: formatQuantity(line.value, line.unit),
      ...(showCost && {
        unitPrice: line.unitPrice
          ? formatMoney(line.unitPrice.amount, line.unitPrice.currency)
          : '—',
        amount:
          line.cost !== undefined && line.unitPrice
            ? formatMoney(line.cost, line.unitPrice.currency)
            : '—',
      }),
    })),
  )
}

function formatQuantity(value: number, unit: QuantityUnit): string {
  if (unit === 'count')
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(value)
  const suffix = unit === 'length' ? ' m' : unit === 'area' ? ' m²' : ' m³'
  return formatNumber(value, suffix)
}

function formatNumber(value: number, suffix = ''): string {
  return `${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}${suffix}`
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${formatNumber(value)} ${currency}`
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 42
const RED = '#c62a2a'
const INK = '#171717'
const MUTED = '#666666'
const LINE = '#d9d9d9'

export async function renderSharePdf(
  model: SharePdfModel,
  options: { compress?: boolean; fontDirectory?: string } = {},
): Promise<Buffer> {
  const fontDirectory = options.fontDirectory ?? resolveFontDirectory()
  const bodyFont = join(fontDirectory, 'geist-regular.ttf')
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: options.compress ?? true,
    font: bodyFont,
    margin: 0,
    size: 'A4',
    info: { Title: `${model.projectName} · Menart 3D paylaşım özeti` },
  })
  doc.registerFont('PascalBody', bodyFont)
  doc.registerFont('PascalBold', join(fontDirectory, 'PlusJakartaSans-SemiBold.ttf'))

  const chunks: Buffer[] = []
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  for (const page of model.pages) {
    if (page.kind === 'summary') drawSummaryPage(doc, model, page)
    else if (page.kind === 'level') drawLevelPage(doc, page)
    else drawCommentsPages(doc, page)
  }

  const range = doc.bufferedPageRange()
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index)
    drawFooter(doc, model, index + 1, range.count)
  }
  doc.end()
  return complete
}

function resolveFontDirectory(): string {
  const candidates = [
    join(process.cwd(), 'public/fonts'),
    join(process.cwd(), 'apps/editor/public/fonts'),
  ]
  const directory = candidates.find(
    (candidate) =>
      existsSync(join(candidate, 'geist-regular.ttf')) &&
      existsSync(join(candidate, 'PlusJakartaSans-SemiBold.ttf')),
  )
  if (!directory) throw new Error('share_pdf_fonts_missing')
  return directory
}

function addPage(doc: PDFKit.PDFDocument) {
  doc.addPage({ size: 'A4', margin: 0 })
  doc.rect(0, 0, PAGE_WIDTH, 8).fill(RED)
}

function header(doc: PDFKit.PDFDocument, title: string, eyebrow: string) {
  doc
    .font('PascalBold')
    .fontSize(9)
    .fillColor(RED)
    .text(eyebrow.toLocaleUpperCase('tr-TR'), MARGIN, 32)
  doc
    .font('PascalBold')
    .fontSize(21)
    .fillColor(INK)
    .text(title, MARGIN, 49, { width: PAGE_WIDTH - MARGIN * 2 })
  doc
    .moveTo(MARGIN, 80)
    .lineTo(PAGE_WIDTH - MARGIN, 80)
    .lineWidth(1)
    .strokeColor(LINE)
    .stroke()
}

function drawSummaryPage(
  doc: PDFKit.PDFDocument,
  model: SharePdfModel,
  page: Extract<SharePdfPage, { kind: 'summary' }>,
) {
  addPage(doc)
  header(doc, model.projectName, 'Salt okunur paylaşım özeti')
  doc.font('PascalBody').fontSize(9).fillColor(MUTED)
  doc.text(
    [model.parcelLine, `Revizyon ${model.revision}`, model.date].filter(Boolean).join('  ·  '),
    MARGIN,
    88,
  )

  const imageY = 112
  const imageH = 300
  drawImageOrPlaceholder(
    doc,
    page.snapshot,
    MARGIN,
    imageY,
    PAGE_WIDTH - MARGIN * 2,
    imageH,
    '3B görünüm',
  )

  const stats = [
    ['Toplam kat alanı', `${page.summary.stats.totalFloorArea} m²`],
    ['Taban alanı', `${page.summary.stats.footprintArea} m²`],
    ['Parsel alanı', `${page.summary.stats.siteArea} m²`],
    ['Maks. yükseklik', `${page.summary.stats.maxHeight} m`],
  ]
  const gap = 8
  const cardW = (PAGE_WIDTH - MARGIN * 2 - gap * 3) / 4
  stats.forEach(([label, value], index) => {
    const x = MARGIN + index * (cardW + gap)
    doc.rect(x, 426, cardW, 62).lineWidth(0.8).strokeColor(LINE).stroke()
    doc
      .font('PascalBody')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(label!, x + 8, 438, { width: cardW - 16 })
    doc
      .font('PascalBold')
      .fontSize(13)
      .fillColor(INK)
      .text(value!, x + 8, 458, { width: cardW - 16 })
  })

  let y = 515
  doc.font('PascalBold').fontSize(12).fillColor(INK).text('İmar kontrolü', MARGIN, y)
  y += 22
  if (page.summary.zoningRows.length === 0) {
    doc
      .font('PascalBody')
      .fontSize(9)
      .fillColor(MUTED)
      .text('Kayıtlı imar sınırı bulunmuyor.', MARGIN, y)
  } else {
    for (const row of page.summary.zoningRows) {
      const label =
        row.kind === 'footprint'
          ? 'TAKS / taban alanı'
          : row.kind === 'total-area'
            ? 'KAKS / toplam alan'
            : row.kind === 'height'
              ? 'Yükseklik'
              : 'Kat adedi'
      doc.font('PascalBody').fontSize(9).fillColor(MUTED).text(label, MARGIN, y)
      doc
        .font('PascalBold')
        .fillColor(row.status === 'ok' ? '#27734a' : RED)
        .text(row.value, 270, y, { width: 280, align: 'right' })
      y += 22
      doc
        .moveTo(MARGIN, y - 6)
        .lineTo(PAGE_WIDTH - MARGIN, y - 6)
        .lineWidth(0.5)
        .strokeColor(LINE)
        .stroke()
    }
  }
}

function drawLevelPage(doc: PDFKit.PDFDocument, page: Extract<SharePdfPage, { kind: 'level' }>) {
  addPage(doc)
  header(doc, page.name, 'Kat planı ve metraj')
  doc
    .font('PascalBody')
    .fontSize(9)
    .fillColor(MUTED)
    .text([page.area, page.height].filter(Boolean).join('  ·  '), MARGIN, 90)
  drawImageOrPlaceholder(
    doc,
    page.planImage,
    MARGIN,
    112,
    PAGE_WIDTH - MARGIN * 2,
    350,
    'Kat planı',
  )

  const y = 485
  const columns = page.showCost
    ? [MARGIN, 326, 408, 493, PAGE_WIDTH - MARGIN]
    : [MARGIN, 430, PAGE_WIDTH - MARGIN]
  doc.rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 22).fill('#222222')
  const headings = page.showCost ? ['Kalem', 'Miktar', 'Birim fiyat', 'Tutar'] : ['Kalem', 'Miktar']
  doc.font('PascalBold').fontSize(7.5).fillColor('#ffffff')
  headings.forEach((heading, index) => {
    const left = columns[index]!
    const right = columns[index + 1]!
    doc.text(heading, left + 5, y + 7, {
      width: right - left - 10,
      align: index === 0 ? 'left' : 'right',
    })
  })

  const maxRows = 15
  const rows = page.lines.slice(0, maxRows)
  rows.forEach((line, index) => {
    const rowY = y + 22 + index * 18
    if (index % 2 === 1) doc.rect(MARGIN, rowY, PAGE_WIDTH - MARGIN * 2, 18).fill('#f4f4f4')
    doc.font('PascalBody').fontSize(7.2).fillColor(INK)
    const values = page.showCost
      ? [line.label, line.quantity, line.unitPrice ?? '—', line.amount ?? '—']
      : [line.label, line.quantity]
    values.forEach((value, columnIndex) => {
      const left = columns[columnIndex]!
      const right = columns[columnIndex + 1]!
      doc.text(value, left + 5, rowY + 5.5, {
        width: right - left - 10,
        align: columnIndex === 0 ? 'left' : 'right',
        ellipsis: true,
        lineBreak: false,
      })
    })
  })
  if (page.lines.length === 0) {
    doc
      .font('PascalBody')
      .fontSize(9)
      .fillColor(MUTED)
      .text('Bu katta gösterilecek metraj bulunmuyor.', MARGIN + 6, y + 34)
  } else if (page.lines.length > maxRows) {
    doc
      .font('PascalBody')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`+ ${page.lines.length - maxRows} satır daha`, MARGIN + 5, y + 22 + maxRows * 18 + 5)
  }
}

function drawCommentsPages(
  doc: PDFKit.PDFDocument,
  page: Extract<SharePdfPage, { kind: 'comments' }>,
) {
  addPage(doc)
  header(doc, 'Yorumlar', `${page.threads.length} konu`)
  let y = 102
  if (page.threads.length === 0) {
    doc.font('PascalBody').fontSize(10).fillColor(MUTED).text('Henüz yorum yok.', MARGIN, y)
    return
  }
  page.threads.forEach((thread, index) => {
    const height = 58 + thread.replies.length * 34
    if (y + height > PAGE_HEIGHT - 58) {
      addPage(doc)
      header(doc, 'Yorumlar', 'Devam')
      y = 102
    }
    doc.circle(MARGIN + 13, y + 13, 13).fill(thread.resolved ? '#dddddd' : RED)
    doc
      .font('PascalBold')
      .fontSize(8)
      .fillColor(thread.resolved ? MUTED : '#ffffff')
      .text(String(index + 1), MARGIN + 4, y + 9, { width: 18, align: 'center' })
    doc
      .font('PascalBold')
      .fontSize(9)
      .fillColor(INK)
      .text(thread.author.name, MARGIN + 36, y + 2)
    doc
      .font('PascalBody')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(formatDate(thread.createdAt), MARGIN + 36, y + 17)
    if (thread.resolved)
      doc
        .font('PascalBold')
        .fontSize(7)
        .fillColor(MUTED)
        .text('ÇÖZÜLDÜ', PAGE_WIDTH - 110, y + 3)
    doc
      .font('PascalBody')
      .fontSize(9)
      .fillColor(INK)
      .text(thread.body, MARGIN + 36, y + 31, {
        width: PAGE_WIDTH - MARGIN * 2 - 36,
        height: 25,
        ellipsis: true,
      })
    let replyY = y + 62
    for (const reply of thread.replies) {
      doc
        .moveTo(MARGIN + 46, replyY)
        .lineTo(MARGIN + 46, replyY + 26)
        .lineWidth(1.5)
        .strokeColor(LINE)
        .stroke()
      doc
        .font('PascalBold')
        .fontSize(7.5)
        .fillColor(INK)
        .text(reply.author.name, MARGIN + 55, replyY)
      doc
        .font('PascalBody')
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(reply.body, MARGIN + 55, replyY + 12, {
          width: PAGE_WIDTH - MARGIN * 2 - 55,
          height: 15,
          ellipsis: true,
        })
      replyY += 34
    }
    y += height
    doc
      .moveTo(MARGIN, y - 8)
      .lineTo(PAGE_WIDTH - MARGIN, y - 8)
      .lineWidth(0.5)
      .strokeColor(LINE)
      .stroke()
  })
}

function drawImageOrPlaceholder(
  doc: PDFKit.PDFDocument,
  image: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
) {
  doc.rect(x, y, width, height).fillAndStroke('#f3f3f3', LINE)
  if (image) {
    try {
      doc.image(image, x + 1, y + 1, {
        fit: [width - 2, height - 2],
        align: 'center',
        valign: 'center',
      })
      return
    } catch {
      // The rest of the PDF remains useful if a browser supplied a bad image.
    }
  }
  doc
    .font('PascalBody')
    .fontSize(9)
    .fillColor(MUTED)
    .text(`${label} mevcut değil`, x, y + height / 2 - 5, { width, align: 'center' })
}

function drawFooter(doc: PDFKit.PDFDocument, model: SharePdfModel, page: number, total: number) {
  doc
    .moveTo(MARGIN, PAGE_HEIGHT - 38)
    .lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 38)
    .lineWidth(0.5)
    .strokeColor(LINE)
    .stroke()
  doc
    .font('PascalBody')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(
      `Menart 3D · ${model.projectName} · ${model.date} · sayfa ${page}/${total}`,
      MARGIN,
      PAGE_HEIGHT - 28,
      { width: PAGE_WIDTH - MARGIN * 2, align: 'center', lineBreak: false },
    )
}
