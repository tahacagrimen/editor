'use client'

import { useTranslation } from '@pascal-app/editor'
import { MessageSquarePlus, Send, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { NumberedShareComment } from '@/lib/share-comments'
import { formatShareCommentTime } from '@/lib/share-comments'

const AUTHOR_SESSION_KEY = 'pascal-share-comment-author'

export function ShareCommentsPanel({
  activeId,
  allowComments,
  comments,
  draft,
  error,
  levelNames,
  locale,
  placing,
  saving,
  onCancelDraft,
  onFocus,
  onReply,
  onStartPlacing,
  onSubmitDraft,
}: {
  activeId: string | null
  allowComments: boolean
  comments: NumberedShareComment[]
  draft: { position: [number, number, number] } | null
  error: string | null
  levelNames: Record<string, string>
  locale: string
  placing: boolean
  saving: boolean
  onCancelDraft: () => void
  onFocus: (id: string) => void
  onReply: (id: string, author: string, body: string) => void
  onStartPlacing: () => void
  onSubmitDraft: (author: string, body: string) => void
}) {
  const t = useTranslation()
  const [author, setAuthor] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')

  useEffect(() => {
    try {
      setAuthor(window.sessionStorage.getItem(AUTHOR_SESSION_KEY)?.trim() ?? '')
    } catch {
      // Private browsing may deny storage; the form can still keep its local value.
    }
  }, [])

  const rememberAuthor = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setAuthor(trimmed)
    try {
      window.sessionStorage.setItem(AUTHOR_SESSION_KEY, trimmed)
    } catch {
      // A storage failure must not discard a valid comment.
    }
  }

  const submitDraft = () => {
    const name = author.trim()
    const body = draftBody.trim()
    if (!(name && body)) return
    rememberAuthor(name)
    onSubmitDraft(name, body)
    setDraftBody('')
  }

  const submitReply = (id: string) => {
    const name = author.trim()
    const body = replyBody.trim()
    if (!(name && body)) return
    rememberAuthor(name)
    onReply(id, name, body)
    setReplyBody('')
    setReplyFor(null)
  }

  const openCount = comments.filter(({ thread }) => !thread.resolved).length

  return (
    <div className="min-w-0">
      {allowComments ? (
        <div className="flex items-center gap-3 border-border border-b-2 px-4 py-3">
          <p className="min-w-0 flex-1 text-muted-foreground text-xs tabular-nums">
            {comments.length} {t('comments')} · {openCount} {t('open')}
          </p>
          <button
            aria-pressed={placing}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-2 px-3 font-extrabold text-xs uppercase tracking-[0.04em] transition-colors ${
              placing
                ? 'border-primary bg-background text-primary'
                : 'border-primary bg-primary text-primary-foreground hover:opacity-90'
            }`}
            onClick={onStartPlacing}
            type="button"
          >
            <MessageSquarePlus aria-hidden="true" className="size-4" />
            {t(placing ? 'Choose a point' : 'Add comment')}
          </button>
        </div>
      ) : (
        <p className="m-0 border-border border-b-2 p-4 text-muted-foreground text-sm">
          {t('This link is closed to comments. You can only view it.')}
        </p>
      )}

      {draft && allowComments && (
        <div className="border-border border-b-2 bg-accent/35 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-extrabold text-xs uppercase tracking-[0.05em]">{t('New comment')}</p>
            <button
              aria-label={t('Cancel comment')}
              className="flex size-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                setDraftBody('')
                onCancelDraft()
              }}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
          {!author && (
            <input
              aria-label={t('Your name')}
              className="mb-2 min-h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              onChange={(event) => setAuthor(event.target.value)}
              placeholder={t('Your name')}
              value={author}
            />
          )}
          <textarea
            aria-label={t('Your note')}
            className="min-h-24 w-full resize-y border border-border bg-background p-3 text-sm outline-none focus:border-primary"
            onChange={(event) => setDraftBody(event.target.value)}
            placeholder={t('Your note')}
            value={draftBody}
          />
          <button
            className="mt-2 inline-flex min-h-11 items-center gap-2 bg-primary px-4 font-extrabold text-primary-foreground text-xs uppercase tracking-[0.04em] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={saving || !author.trim() || !draftBody.trim()}
            onClick={submitDraft}
            type="button"
          >
            <Send aria-hidden="true" className="size-4" />
            {saving ? t('Sending…') : t('Send comment')}
          </button>
        </div>
      )}

      {error && (
        <p className="m-0 border-red-700 border-b-2 bg-red-50 p-4 text-red-800 text-sm dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}

      {comments.map(({ number, thread }) => {
        const replyOpen = replyFor === thread.id
        return (
          <article
            className={`border-border border-b-2 p-4 ${
              thread.resolved ? 'bg-muted/40 text-muted-foreground' : ''
            } ${activeId === thread.id ? 'ring-2 ring-inset ring-primary' : ''}`}
            id={`share-comment-${thread.id}`}
            key={thread.id}
          >
            <div className="flex items-start gap-3">
              <button
                aria-label={`${t('Focus comment')} ${number}`}
                className={`flex size-11 shrink-0 items-center justify-center rounded-full border-2 font-extrabold text-xs ${
                  thread.resolved
                    ? 'border-muted-foreground bg-background text-muted-foreground'
                    : 'border-primary bg-primary text-primary-foreground'
                }`}
                onClick={() => onFocus(thread.id)}
                type="button"
              >
                {number}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-extrabold text-sm text-foreground">
                    {thread.author.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {thread.levelId
                      ? (levelNames[thread.levelId] ?? t('Unknown level'))
                      : t('All levels')}
                    {' · '}
                    {formatShareCommentTime(thread.createdAt, locale)}
                  </span>
                  {thread.resolved && (
                    <span className="bg-muted px-2 py-0.5 font-extrabold text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                      {t('Resolved')}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">
                  {thread.body}
                </p>

                {thread.replies.length > 0 && (
                  <div className="mt-3 space-y-3 border-border border-l-2 pl-3">
                    {thread.replies.map((reply) => (
                      <div key={reply.id}>
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-extrabold text-xs text-foreground">
                            {reply.author.name}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatShareCommentTime(reply.createdAt, locale)}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">
                          {reply.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {allowComments && !thread.resolved && (
                  <div className="mt-3">
                    <button
                      className="min-h-11 font-extrabold text-primary text-xs uppercase tracking-[0.04em] hover:underline"
                      onClick={() => {
                        setReplyFor(replyOpen ? null : thread.id)
                        setReplyBody('')
                      }}
                      type="button"
                    >
                      {t(replyOpen ? 'Close' : 'Reply')}
                    </button>
                    {replyOpen && (
                      <div className="mt-1">
                        {!author && (
                          <input
                            aria-label={t('Your name')}
                            className="mb-2 min-h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                            onChange={(event) => setAuthor(event.target.value)}
                            placeholder={t('Your name')}
                            value={author}
                          />
                        )}
                        <textarea
                          aria-label={t('Your reply')}
                          className="min-h-20 w-full resize-y border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary"
                          onChange={(event) => setReplyBody(event.target.value)}
                          placeholder={t('Your reply')}
                          value={replyBody}
                        />
                        <button
                          className="mt-2 min-h-11 bg-primary px-4 font-extrabold text-primary-foreground text-xs uppercase tracking-[0.04em] disabled:opacity-40"
                          disabled={saving || !author.trim() || !replyBody.trim()}
                          onClick={() => submitReply(thread.id)}
                          type="button"
                        >
                          {t('Reply')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </article>
        )
      })}

      {comments.length === 0 && !draft && (
        <p className="m-0 border-border border-b-2 p-4 text-muted-foreground text-sm">
          {allowComments
            ? t('No comments yet. Tap the model to leave the first note.')
            : t('No comments yet.')}
        </p>
      )}
    </div>
  )
}
