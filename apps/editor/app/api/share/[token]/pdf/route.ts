import type { NextRequest } from 'next/server'
import { sceneApiJson, sceneApiPreflight, withSceneApiHeaders } from '@/lib/scene-api-security'
import { getSceneOperations } from '@/lib/scene-store-server'
import {
  buildSharePdfModel,
  renderSharePdf,
  type SharePdfRequest,
  sharePdfRequestSchema,
} from '@/lib/share-pdf'
import { authorizeSharePdf } from '@/lib/share-pdf-route-security'
import { type ShareTokenPayload, shareCostsVisible } from '@/lib/share-token'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_REQUEST_BYTES = 30 * 1024 * 1024
type RouteParams = { params: Promise<{ token: string }> }

export function OPTIONS(request: NextRequest) {
  return sceneApiPreflight(request)
}

export async function GET(request: NextRequest, context: RouteParams) {
  const access = await authorize(request, context)
  if (!access.ok) return access.response
  return generatePdf(request, access.payload, { levels: [] })
}

export async function POST(request: NextRequest, context: RouteParams) {
  const access = await authorize(request, context)
  if (!access.ok) return access.response

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_REQUEST_BYTES) {
    return sceneApiJson(request, { error: 'payload_too_large' }, { status: 413 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const parsed = sharePdfRequestSchema.safeParse(body)
  if (!parsed.success) {
    return sceneApiJson(
      request,
      { error: 'invalid_pdf_request', details: parsed.error.issues },
      { status: 422 },
    )
  }
  return generatePdf(request, access.payload, parsed.data)
}

async function generatePdf(
  request: NextRequest,
  access: ShareTokenPayload,
  payload: SharePdfRequest,
) {
  const operations = await getSceneOperations()
  const scene = await operations.loadStoredScene(access.sid)
  if (!scene) return sceneApiJson(request, { error: 'not_found' }, { status: 404 })

  try {
    const model = buildSharePdfModel({
      projectName: scene.name,
      revision: scene.version,
      updatedAt: scene.updatedAt,
      graph: scene.graph as never,
      request: payload,
      showCost: shareCostsVisible(access),
      allowComments: access.allowComments ?? true,
    })
    const pdf = await renderSharePdf(model)
    const filename = `${safeFilename(scene.name)}-paylasim-ozeti.pdf`
    return withSceneApiHeaders(
      request,
      new Response(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(pdf.byteLength),
          'content-disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      }),
    )
  } catch (error) {
    console.error('[share/pdf] generation failed:', error)
    return sceneApiJson(request, { error: 'pdf_generation_failed' }, { status: 500 })
  }
}

async function authorize(request: NextRequest, { params }: RouteParams) {
  const { token } = await params
  return authorizeSharePdf(request, token)
}

function safeFilename(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'menart-3d'
  )
}
