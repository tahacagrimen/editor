import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const appRoot = join(import.meta.dir, '..')
const routePath = join(appRoot, 'app/share/[token]/page.tsx')
const presentationPath = join(appRoot, 'components/share/share-presentation.tsx')
const floorplanPath = join(appRoot, 'components/share/share-floorplan.tsx')
const quantitiesPath = join(appRoot, 'components/share/share-quantities-panel.tsx')
const shareLinkButtonPath = join(appRoot, 'components/share-link-button.tsx')
const shareApiPath = join(appRoot, 'app/api/scenes/[id]/share/route.ts')
const shareCommentsApiPath = join(appRoot, 'app/api/share/[token]/comments/route.ts')
const shareRepliesApiPath = join(appRoot, 'app/api/share/[token]/comments/[id]/replies/route.ts')
const locationPath = join(appRoot, 'components/share/share-location-panel.tsx')

describe('share presentation shell', () => {
  test('the share route mounts its purpose-built presentation, not the editor', () => {
    const route = readFileSync(routePath, 'utf8')

    expect(route).toContain('<SharePresentation')
    expect(route).toContain('buildShareSummary(graph)')
    expect(route).toContain('summary={summary}')
    expect(route).not.toContain('<Editor')
  })

  test('presentation state stays local and does not need a read-only lease', () => {
    const presentation = readFileSync(presentationPath, 'utf8')

    expect(presentation).toContain('useState<ShareViewState>')
    expect(presentation).not.toContain('useScene')
    expect(presentation).not.toContain('acquireSceneReadOnlyLease')
  })

  test('the scene surfaces stay read-only while sharing one selected level', () => {
    const presentation = readFileSync(presentationPath, 'utf8')
    const floorplan = readFileSync(floorplanPath, 'utf8')

    expect(presentation).toContain('selectionManager="custom"')
    expect(presentation).toContain('levels.length > 1')
    expect(presentation).toContain('data-level-id={selectedLevelId ?? undefined}')
    expect(floorplan).toContain('pointerEventsOverride="none"')
    expect(floorplan).not.toContain('useScene')
    expect(floorplan).not.toContain('useEditor')
  })

  test('mobile overflow is contained and theme-unsafe chrome is absent', () => {
    const presentation = readFileSync(presentationPath, 'utf8')
    const quantities = readFileSync(quantitiesPath, 'utf8')

    expect(presentation).toContain('flex-wrap')
    expect(
      (presentation.match(/overflow-x-auto/g)?.length ?? 0) +
        (quantities.match(/overflow-x-auto/g)?.length ?? 0),
    ).toBeGreaterThanOrEqual(3)
    expect(presentation.match(/min-h-12/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(presentation).not.toContain('bg-white/10')
    expect(presentation).not.toContain('text-white')
  })

  test('the identity header stays visible and lets long project names wrap', () => {
    const presentation = readFileSync(presentationPath, 'utf8')

    expect(presentation).toContain('sticky top-0')
    expect(presentation).toContain('break-words')
    expect(presentation).toContain("t('Read only')")
    expect(presentation).toContain('meta.expiryLine')
    expect(presentation).toContain('dark:text-red-400')
  })

  test('the read-only takeoff follows the selected level without editor controls', () => {
    const presentation = readFileSync(presentationPath, 'utf8')
    const quantities = readFileSync(quantitiesPath, 'utf8')

    expect(presentation).toContain('selectedLevelId={selectedLevelId}')
    expect(quantities).toContain(
      'takeoffForSubtree(selectedLevelId as AnyNodeId, { materials, nodes })',
    )
    expect(quantities).toContain('priceQuantityTakeoff(takeoff, unitPrices)')
    expect(quantities).toContain('max-w-full overflow-x-auto')
    expect(quantities).toContain('downloadQuantityCsv(priced')
    expect(quantities).not.toContain('<input')
    expect(quantities).not.toContain('setUnitPrice')
    expect(quantities).not.toContain('removeUnitPrice')
  })

  test('cost visibility travels from the owner control to the server-redacted presentation', () => {
    const route = readFileSync(routePath, 'utf8')
    const shareApi = readFileSync(shareApiPath, 'utf8')
    const commentsApi = readFileSync(shareCommentsApiPath, 'utf8')
    const repliesApi = readFileSync(shareRepliesApiPath, 'utf8')
    const shareButton = readFileSync(shareLinkButtonPath, 'utf8')

    expect(shareButton).toContain('body: JSON.stringify({')
    expect(shareButton).toContain('ttlSeconds,')
    expect(shareButton).toContain('allowComments,')
    expect(shareButton).toContain('showCost,')
    expect(shareApi).toContain('showCost: z.boolean().optional()')
    expect(shareApi).toContain('showCost: parsed.data.showCost')
    expect(route).toContain('prepareShareGraph(graph, { allowComments, showCost })')
    expect(route).toContain('showCost={showCost}')
    expect(commentsApi).toContain('replaceShareComments(')
    expect(commentsApi).toContain('export async function POST')
    expect(commentsApi).not.toContain('export async function PUT')
    expect(commentsApi).not.toContain('export async function DELETE')
    expect(commentsApi).not.toContain('export async function PATCH')
    expect(repliesApi).toContain('appendShareCommentReply')
  })

  test('the owner share dialog sends four safe defaults and explains the issued capability', () => {
    const shareButton = readFileSync(shareLinkButtonPath, 'utf8')

    expect(shareButton).toContain('const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60')
    expect(shareButton).toContain('const [allowComments, setAllowComments] = useState(true)')
    expect(shareButton).toContain('const [showCost, setShowCost] = useState(false)')
    expect(shareButton).toContain("const [password, setPassword] = useState('')")
    expect(shareButton).toContain("<option value={0}>{t('Never expires')}</option>")
    expect(shareButton).toContain('ShareSettingsSummary')
    expect(shareButton).toContain("failure?.error === 'share_secret_required'")
    expect(shareButton).toContain("copied ? t('Copied') : t('Copy')")
  })

  test('the location tab is omitted without a parcel and never calls a cadastral provider', () => {
    const presentation = readFileSync(presentationPath, 'utf8')
    const location = readFileSync(locationPath, 'utf8')

    expect(presentation).toContain("TABS.filter((tab) => tab.id !== 'konum')")
    expect(presentation).toContain("tab === 'konum' && location")
    expect(location).toContain('<polygon')
    expect(location).not.toContain('fetch(')
    expect(location).not.toContain('/api/cadastre')
  })
})
