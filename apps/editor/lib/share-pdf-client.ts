'use client'

const MAX_IMAGE_DIMENSION = 1600

type ThumbnailWindow = Window & {
  __pascalCaptureThumbnail?: (options?: {
    captureMode?: 'standard' | 'viewport' | 'area'
    transparent?: boolean
  }) => Promise<{ blob: Blob; resolution: { w: number; h: number } }>
}

export async function captureShareSnapshot(): Promise<string | undefined> {
  const capture = (window as ThumbnailWindow).__pascalCaptureThumbnail
  if (capture) {
    try {
      const result = await withTimeout(
        capture({ captureMode: 'viewport', transparent: false }),
        5_000,
      )
      if (result) return rasterizeImageBlob(result.blob)
    } catch {
      // Fall through to the live canvas when the renderer cannot make a thumbnail.
    }
  }

  const canvas = document.querySelector<HTMLCanvasElement>('canvas')
  if (!canvas) return undefined
  try {
    return canvas.toDataURL('image/jpeg', 0.84)
  } catch {
    return undefined
  }
}

export async function rasterizeShareFloorplan(svg: SVGSVGElement): Promise<string | undefined> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', '1600')
  clone.setAttribute('height', '1000')
  clone.style.background = '#ffffff'
  clone.style.color = '#171717'

  const source = new XMLSerializer().serializeToString(clone)
  return rasterizeImageBlob(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
}

export async function downloadSharePdf(
  token: string,
  payload: unknown,
  projectName: string,
): Promise<void> {
  const response = await fetch(`/api/share/${encodeURIComponent(token)}/pdf`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`share_pdf_${response.status}`)

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFilename(projectName)}-paylasim-ozeti.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function waitForSharePdfAssets(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

async function rasterizeImageBlob(blob: Blob): Promise<string | undefined> {
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url)
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return undefined
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.84)
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = source
  })
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(undefined), milliseconds)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
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
