import type { SceneGraph } from '@pascal-app/editor'
import { type I18nLocale, translate } from '@pascal-app/editor/i18n'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ServerLocalizedContent } from '@/components/server-localized-content'
import { SharePresentation } from '@/components/share/share-presentation'
import { getSceneOperations } from '@/lib/scene-store-server'
import { verifyShareAccess } from '@/lib/share-access'
import { prepareShareGraph } from '@/lib/share-graph'
import { buildShareLocation } from '@/lib/share-location'
import { buildSharePresentationMeta } from '@/lib/share-presentation-meta'
import { buildShareSummary } from '@/lib/share-summary'
import { hashSharePassword, shareCostsVisible } from '@/lib/share-token'

export const dynamic = 'force-dynamic'

/**
 * A view-only share link.
 *
 * The scene is read straight from the store rather than through
 * `/api/scenes/[id]`: that route is credentialed, and a share visitor has no
 * credentials by definition. The signed token is the authorization, and it is
 * verified here before the id inside it is used for anything.
 */
async function submitPassword(sid: string, formData: FormData) {
  'use server'
  const pwd = formData.get('password') as string
  if (pwd) {
    const cookieStore = await cookies()
    cookieStore.set(`share_pwd_${sid}`, pwd, { path: '/' })
  }
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cookieStore = await cookies()
  const locale: I18nLocale = cookieStore.get('pascal-locale')?.value === 'en' ? 'en' : 'tr'
  const t = (source: string) => translate(source, locale)
  const verified = await verifyShareAccess(token)

  if (!verified.ok) {
    return (
      <ServerLocalizedContent locale={locale}>
        <ShareProblem
          body={
            verified.error === 'revoked'
              ? t('This link was revoked. Ask whoever shared it for a new one.')
              : verified.error === 'expired'
                ? t('This share link has expired. Ask whoever sent it for a new one.')
                : verified.error === 'secret_missing'
                  ? t('Sharing is not configured on this server.')
                  : verified.error === 'revocation_unavailable'
                    ? t('Sharing is temporarily unavailable. Please try again later.')
                    : t('This share link is not valid.')
          }
          heading={
            verified.error === 'revoked'
              ? t('Link revoked')
              : verified.error === 'expired'
                ? t('Link expired')
                : t('Link not valid')
          }
        />
      </ServerLocalizedContent>
    )
  }

  const payload = verified.payload

  if (payload.pwd) {
    const providedPwd = cookieStore.get(`share_pwd_${payload.sid}`)?.value

    if (!providedPwd || hashSharePassword(providedPwd) !== payload.pwd) {
      const boundSubmit = submitPassword.bind(null, payload.sid)

      return (
        <ServerLocalizedContent locale={locale}>
          <div className="flex min-h-screen items-center justify-center bg-background p-6">
            <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background p-6 text-center shadow-xl">
              <h1 className="font-semibold text-lg">This share is password protected</h1>
              <p className="mt-2 text-muted-foreground text-sm">
                Enter the password to view this scene.
              </p>
              {providedPwd && (
                <p className="mt-2 text-red-700 text-sm dark:text-red-400">
                  Wrong password. Please try again.
                </p>
              )}
              <form action={boundSubmit} className="mt-4 flex flex-col gap-3">
                <input
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                  name="password"
                  placeholder="Password"
                  required
                  type="password"
                />
                <button
                  className="rounded-md bg-primary py-2 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90"
                  type="submit"
                >
                  View scene
                </button>
              </form>
            </div>
          </div>
        </ServerLocalizedContent>
      )
    }
  }

  const operations = await getSceneOperations()
  const scene = await operations.loadStoredScene(payload.sid)
  if (!scene) {
    return (
      <ServerLocalizedContent locale={locale}>
        <ShareProblem
          body={t('The scene this link points at is no longer available.')}
          heading={t('Scene not found')}
        />
      </ServerLocalizedContent>
    )
  }

  const allowComments = payload.allowComments ?? true
  const graph = scene.graph as SceneGraph
  const showCost = shareCostsVisible(payload)
  const initialScene = prepareShareGraph(graph, { allowComments, showCost }) as SceneGraph
  const ownerName = await resolveOwnerName(scene.ownerId)
  const meta = buildSharePresentationMeta({
    name: scene.name,
    version: scene.version,
    updatedAt: scene.updatedAt,
    graph,
    ownerName,
    expiresAtSeconds: payload.exp,
    locale,
  })
  const summary = buildShareSummary(graph)
  const location = buildShareLocation(graph)

  return (
    <SharePresentation
      allowComments={allowComments}
      initialScene={initialScene}
      location={location}
      meta={meta}
      showCost={showCost}
      summary={summary}
      token={token}
    />
  )
}

async function resolveOwnerName(ownerId: string | null): Promise<string | null> {
  if (!(ownerId && process.env.POSTGRES_URL)) return null

  const { getDatabase } = await import('@pascal-app/db')
  const db = getDatabase()
  const owner = await db.query.users.findFirst({
    columns: { name: true },
    where: (users, { and, eq, isNull }) => and(eq(users.id, ownerId), isNull(users.deletedAt)),
  })

  return owner?.name.trim() || null
}

function ShareProblem({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background p-6 text-center shadow-xl">
        <h1 className="font-semibold text-lg">{heading}</h1>
        <p className="mt-2 text-muted-foreground text-sm">{body}</p>
        <div className="mt-4 flex items-center justify-center">
          <Link
            className="rounded-md border border-border bg-accent px-3 py-2 font-medium text-sm hover:bg-accent/80"
            href="/"
          >
            Back to editor
          </Link>
        </div>
      </div>
    </div>
  )
}
