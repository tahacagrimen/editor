'use client'

import { useTranslation } from '@pascal-app/editor'
import { Copy, Link2, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type ManagedShareLink = {
  id: string
  role: 'viewer' | 'editor'
  createdBy: { id: string; name: string | null } | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

const EXPIRY_OPTIONS = [
  { days: 1, seconds: 86_400 },
  { days: 7, seconds: 604_800 },
  { days: 30, seconds: 2_592_000 },
  { days: 90, seconds: 7_776_000 },
]

export function SceneShareLinksPanel({ active, sceneId }: { active: boolean; sceneId: string }) {
  const t = useTranslation()
  const [links, setLinks] = useState<ManagedShareLink[]>([])
  const [ttlSeconds, setTtlSeconds] = useState(604_800)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadLinks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/scenes/${encodeURIComponent(sceneId)}/share`)
      if (!response.ok) throw new Error(`share_links_${response.status}`)
      const data = (await response.json()) as { links: ManagedShareLink[] }
      setLinks(data.links)
    } catch {
      setError(t('Share links could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [sceneId, t])

  useEffect(() => {
    if (active) void loadLinks()
  }, [active, loadLinks])

  const createLink = async () => {
    setCreating(true)
    setError(null)
    setCopied(false)
    try {
      const response = await fetch(`/api/scenes/${encodeURIComponent(sceneId)}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlSeconds, allowComments: true, showCost: true }),
      })
      if (!response.ok) throw new Error(`share_create_${response.status}`)
      const data = (await response.json()) as { url: string }
      setNewUrl(data.url)
      await navigator.clipboard?.writeText(data.url)
      setCopied(true)
      await loadLinks()
    } catch {
      setError(t('The share link could not be created.'))
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (linkId: string) => {
    setRevokingId(linkId)
    setError(null)
    try {
      const response = await fetch(
        `/api/scenes/${encodeURIComponent(sceneId)}/share/${encodeURIComponent(linkId)}`,
        { method: 'DELETE' },
      )
      if (!response.ok) throw new Error(`share_revoke_${response.status}`)
      setLinks((current) =>
        current.map((link) =>
          link.id === linkId ? { ...link, revokedAt: new Date().toISOString() } : link,
        ),
      )
    } catch {
      setError(t('The share link could not be revoked.'))
    } finally {
      setRevokingId(null)
    }
  }

  const copyNewLink = async () => {
    if (!newUrl) return
    await navigator.clipboard?.writeText(newUrl)
    setCopied(true)
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 py-3">
      <div className="flex flex-wrap items-end gap-2 border-border border-b pb-4">
        <label className="min-w-36 flex-1 text-muted-foreground text-xs">
          <span className="mb-1.5 block font-medium">{t('Link expires')}</span>
          <select
            className="min-h-11 w-full rounded border border-border bg-background px-3 text-foreground text-sm"
            onChange={(event) => setTtlSeconds(Number(event.target.value))}
            value={ttlSeconds}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.seconds} value={option.seconds}>
                {option.days} {t(option.days === 1 ? 'day' : 'days')}
              </option>
            ))}
          </select>
        </label>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-primary px-4 font-medium text-primary-foreground text-sm disabled:opacity-50"
          disabled={creating}
          onClick={createLink}
          type="button"
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
          {t('Create link')}
        </button>
      </div>

      {newUrl && (
        <div className="flex min-w-0 gap-2">
          <input
            className="min-h-11 min-w-0 flex-1 rounded border border-primary/40 bg-background px-3 font-mono text-[11px]"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={newUrl}
          />
          <button
            aria-label={t('Copy new link')}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded border border-border hover:bg-accent"
            onClick={copyNewLink}
            type="button"
          >
            <Copy className="size-4" />
          </button>
          <span className="sr-only" aria-live="polite">
            {copied ? t('Link copied!') : ''}
          </span>
        </div>
      )}

      {error && (
        <p aria-live="polite" className="text-red-700 text-xs dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex min-h-24 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : links.length === 0 ? (
        <p className="py-5 text-center text-muted-foreground text-sm">
          {t('No managed share links yet.')}
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {links.map((link) => {
            const expired = link.expiresAt
              ? new Date(link.expiresAt).getTime() <= Date.now()
              : false
            const inactive = Boolean(link.revokedAt) || expired
            return (
              <li className="rounded border border-border p-3" key={link.id}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      {link.revokedAt ? t('Revoked') : expired ? t('Expired') : t('Active')}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs tabular-nums">
                      {t('View only')} · {t('Created')} {formatDate(link.createdAt)} ·{' '}
                      {link.expiresAt
                        ? `${t('Expires')} ${formatDate(link.expiresAt)}`
                        : t('Never expires')}
                    </p>
                    <p className="mt-1 truncate text-muted-foreground text-xs">
                      {link.createdBy?.name ?? t('Unknown creator')}
                    </p>
                  </div>
                  <button
                    aria-label={t('Revoke link')}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded border border-border px-3 text-xs hover:bg-accent disabled:opacity-40"
                    disabled={inactive || revokingId === link.id}
                    onClick={() => revoke(link.id)}
                    type="button"
                  >
                    {revokingId === link.id ? (
                      <RotateCcw className="size-3.5 animate-spin" />
                    ) : (
                      <XCircle className="size-3.5" />
                    )}
                    {t('Revoke')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}
