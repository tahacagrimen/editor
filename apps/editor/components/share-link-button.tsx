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
import { cn } from '@/lib/utils'
import { TOP_BAR_ACTION } from './editor-top-bar'

type ShareState = 'idle' | 'minting' | 'ready' | 'error'
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60

export function ShareLinkButton({ sceneId }: { sceneId: string }) {
  const t = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [allowComments, setAllowComments] = useState(true)
  const [showCost, setShowCost] = useState(true)
  const [password, setPassword] = useState('')
  const [ttlSeconds, setTtlSeconds] = useState(DEFAULT_TTL_SECONDS)
  const [state, setState] = useState<ShareState>('idle')
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { data: session } = authClient.useSession()
  const isAnonymous = session?.user?.isAnonymous ?? false

  const share = useCallback(async () => {
    if (isAnonymous) return
    setState('minting')
    setCopied(false)
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
        setState('error')
        return
      }
      const { url: shareUrl } = (await response.json()) as { url: string }
      setUrl(shareUrl)
      setState('ready')

      navigator.clipboard?.writeText(shareUrl).then(
        () => setCopied(true),
        () => setCopied(false),
      )
    } catch {
      setState('error')
    }
  }, [sceneId, isAnonymous, ttlSeconds, allowComments, showCost, password])

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          // Reset when closed
          setState('idle')
          setUrl(null)
          setCopied(false)
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
          <h3 className="font-semibold text-sm text-foreground">{t('Share options')}</h3>

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
              <option value={7_776_000}>90 {t('days')}</option>
            </select>
          </label>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t('Password')} ({t('optional')})
            </label>
            <input
              type="text"
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

          {url && state === 'ready' && (
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-primary">
                {copied ? t('Link copied!') : t('Ready')}
              </span>
              <input
                className="w-full rounded border border-border bg-background/40 px-2 py-1.5 font-mono text-[11px] text-foreground outline-none cursor-text"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={url}
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
