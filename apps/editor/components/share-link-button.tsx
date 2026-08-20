'use client'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  ToggleControl,
  useTranslation,
} from '@pascal-app/editor'
import { useCallback, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { formatShareDate } from '@/lib/share-format'
import { cn } from '@/lib/utils'
import { TOP_BAR_ACTION } from './editor-top-bar'

type ShareState = 'idle' | 'minting' | 'ready' | 'error'
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60

type CreatedShare = {
  url: string
  expiresAt: string | null
  allowComments: boolean
  showCost: boolean
  passwordProtected: boolean
}

export function ShareLinkButton({ sceneId }: { sceneId: string }) {
  const t = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [allowComments, setAllowComments] = useState(true)
  const [showCost, setShowCost] = useState(false)
  const [password, setPassword] = useState('')
  const [ttlSeconds, setTtlSeconds] = useState(DEFAULT_TTL_SECONDS)
  const [state, setState] = useState<ShareState>('idle')
  const [created, setCreated] = useState<CreatedShare | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: session } = authClient.useSession()
  const isAnonymous = session?.user?.isAnonymous ?? false

  const share = useCallback(async () => {
    if (isAnonymous) return
    setState('minting')
    setCopied(false)
    setError(null)
    try {
      const response = await fetch(`/api/scenes/${encodeURIComponent(sceneId)}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ttlSeconds,
          allowComments,
          showCost,
          password: password || undefined,
        }),
      })
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { error?: string } | null
        setError(
          failure?.error === 'share_secret_required'
            ? t('Sharing is not configured on this server. Ask an administrator to set it up.')
            : t('The share link could not be created. Please try again.'),
        )
        setState('error')
        return
      }
      const result = (await response.json()) as { url: string; expiresAt: string | null }
      setCreated({
        url: result.url,
        expiresAt: result.expiresAt,
        allowComments,
        showCost,
        passwordProtected: Boolean(password),
      })
      setState('ready')

      navigator.clipboard?.writeText(result.url).then(
        () => setCopied(true),
        () => setCopied(false),
      )
    } catch {
      setError(t('The share link could not be created. Please try again.'))
      setState('error')
    }
  }, [sceneId, isAnonymous, ttlSeconds, allowComments, showCost, password, t])

  const copy = () => {
    if (!created) return
    navigator.clipboard?.writeText(created.url).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          // Reset when closed
          setState('idle')
          setCreated(null)
          setCopied(false)
          setError(null)
          setPassword('')
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(TOP_BAR_ACTION, isOpen && 'bg-accent text-foreground')}
          disabled={isAnonymous}
          title={
            isAnonymous
              ? t('Sign in to share scenes')
              : t('Create a view-only link — visitors can look, measure and comment, not edit')
          }
          type="button"
        >
          {t('Share')}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-4 rounded-xl border-border/45 bg-popover/95 backdrop-blur-xl shadow-xl"
      >
        <div className="flex flex-col gap-4">
          <h3 className="font-semibold text-sm text-foreground">{t('Share link')}</h3>

          <ToggleControl
            label="Allow comments"
            checked={allowComments}
            onChange={setAllowComments}
          />

          <ToggleControl label="Show costs" checked={showCost} onChange={setShowCost} />

          <label className="flex flex-col gap-1.5 text-muted-foreground text-xs">
            <span className="font-medium">{t('Link expires')}</span>
            <select
              className="min-h-11 rounded-md border border-border/50 bg-background/50 px-3 text-foreground text-sm outline-none focus:border-primary/50"
              onChange={(event) => setTtlSeconds(Number(event.target.value))}
              value={ttlSeconds}
            >
              <option value={86_400}>1 {t('day')}</option>
              <option value={604_800}>7 {t('days')}</option>
              <option value={2_592_000}>30 {t('days')}</option>
              <option value={0}>{t('Never expires')}</option>
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t('Password')} ({t('optional')})
            </label>
            <input
              type="password"
              className="rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
              placeholder={t('Leave empty for public')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            className="w-full rounded-md bg-primary py-2 text-primary-foreground font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            onClick={share}
            disabled={state === 'minting'}
            type="button"
          >
            {state === 'minting'
              ? t('Creating link…')
              : state === 'error'
                ? t('Link failed')
                : t('Create Link')}
          </button>

          {error && (
            <p aria-live="polite" className="text-red-700 text-xs dark:text-red-400">
              {error}
            </p>
          )}

          {created && state === 'ready' && (
            <div className="mt-1 flex flex-col gap-2.5 border-border border-t pt-3">
              <ShareSettingsSummary created={created} t={t} />
              <div className="flex min-w-0 gap-2">
                <input
                  className="min-h-11 min-w-0 flex-1 rounded border border-border bg-background/40 px-2 py-1.5 font-mono text-[11px] text-foreground outline-none cursor-text"
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  value={created.url}
                />
                <button
                  className="min-h-11 shrink-0 rounded border border-border px-3 font-medium text-xs hover:bg-accent"
                  onClick={copy}
                  type="button"
                >
                  {copied ? t('Copied') : t('Copy')}
                </button>
              </div>
              <span aria-live="polite" className="text-primary text-xs">
                {copied ? t('Link copied!') : t('Ready to copy')}
              </span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ShareSettingsSummary({
  created,
  t,
}: {
  created: CreatedShare
  t: (text: string) => string
}) {
  return (
    <p className="text-muted-foreground text-xs leading-relaxed">
      {created.expiresAt ? (
        <>
          {t('This link is valid until')}{' '}
          <strong className="text-foreground">
            {formatShareDate(created.expiresAt, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </strong>
          .{' '}
        </>
      ) : (
        <>{t('This link never expires.')} </>
      )}
      {created.allowComments
        ? t('The recipient can view the project and write comments;')
        : t('The recipient can view the project;')}{' '}
      <strong className="text-foreground">
        {created.showCost ? t('prices are visible.') : t('prices are hidden.')}
      </strong>{' '}
      {created.passwordProtected ? t('It is password protected.') : t('It has no password.')}
    </p>
  )
}
