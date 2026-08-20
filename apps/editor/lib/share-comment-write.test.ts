import { describe, expect, test } from 'bun:test'
import type { CommentId, CommentReplyId, CommentThread } from '@pascal-app/core/schema'
import {
  appendShareComment,
  appendShareCommentReply,
  SHARE_COMMENT_LIMITS,
  shareCommentCreateSchema,
  shareCommentReplySchema,
} from './share-comment-write'

const now = new Date('2026-08-20T12:00:00.000Z')
const input = {
  id: 'comment_client-1',
  anchor: { position: [1, 2, 3] as [number, number, number] },
  name: 'Visitor',
  body: 'Please review this wall.',
}

function thread(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: 'comment_existing' as CommentId,
    anchor: { position: [0, 0, 0] },
    author: { id: 'owner', name: 'Owner' },
    body: 'Original body',
    createdAt: '2026-08-19T00:00:00.000Z',
    replies: [],
    ...overrides,
  }
}

describe('share comment field-level writes', () => {
  test('adds a new anonymous thread and strips an injected author id', () => {
    const parsed = shareCommentCreateSchema.parse({
      ...input,
      author: { id: 'real-user', name: 'Impersonated' },
    })
    const result = appendShareComment({}, parsed, now)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.comments['comment_client-1' as CommentId]).toMatchObject({
      author: { name: 'Visitor' },
      body: input.body,
      createdAt: now.toISOString(),
    })
    expect(result.comments['comment_client-1' as CommentId]?.author).not.toHaveProperty('id')
  })

  test('treats a repeated client id as success without changing the stored thread', () => {
    const existing = thread({ id: input.id as CommentId })
    const comments = { [existing.id]: existing }
    const result = appendShareComment(comments, { ...input, body: 'Malicious replacement' }, now)
    expect(result).toEqual({ ok: true, comments, created: false })
    expect(existing.body).toBe('Original body')
    expect(existing.resolved).toBeUndefined()
  })

  test('adding another thread preserves every field of existing threads', () => {
    const existing = thread({ resolved: true, resolvedBy: { id: 'owner', name: 'Owner' } })
    const comments = { [existing.id]: existing }
    const parsed = shareCommentCreateSchema.parse({
      ...input,
      resolved: false,
      comments: {},
      author: { id: 'attacker', name: 'Attacker' },
    })
    const result = appendShareComment(comments, parsed, now)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.comments[existing.id]).toBe(existing)
    expect(result.comments[existing.id]).toEqual(comments[existing.id])
    expect(Object.keys(result.comments)).toHaveLength(2)
  })

  test('a reply only appends and cannot modify or resolve its parent', () => {
    const existing = thread()
    const result = appendShareCommentReply(
      { [existing.id]: existing },
      existing.id,
      { id: 'comment-reply_client-1', name: 'Guest', body: 'Understood.' },
      now,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const saved = result.comments[existing.id]
    expect(saved?.body).toBe('Original body')
    expect(saved?.resolved).toBeUndefined()
    expect(saved?.author).toEqual(existing.author)
    expect(saved?.replies[0]).toMatchObject({ author: { name: 'Guest' }, body: 'Understood.' })
    expect(saved?.replies[0]?.author).not.toHaveProperty('id')
  })

  test('resolved threads reject replies', () => {
    const existing = thread({ resolved: true })
    expect(
      appendShareCommentReply(
        { [existing.id]: existing },
        existing.id,
        { id: 'comment-reply_client-1', name: 'Guest', body: 'Nope' },
        now,
      ),
    ).toEqual({ ok: false, error: 'thread_resolved' })
  })
})

describe('share comment abuse ceilings', () => {
  test('validates name/body limits and client ids', () => {
    expect(shareCommentCreateSchema.safeParse({ ...input, name: 'x'.repeat(81) }).success).toBe(
      false,
    )
    expect(shareCommentCreateSchema.safeParse({ ...input, body: 'x'.repeat(2_001) }).success).toBe(
      false,
    )
    expect(shareCommentCreateSchema.safeParse({ ...input, id: 'owner_thread' }).success).toBe(false)
    expect(
      shareCommentReplySchema.safeParse({
        id: 'comment-reply_client',
        name: 'Guest',
        body: 'x'.repeat(2_001),
      }).success,
    ).toBe(false)
  })

  test('caps threads per scene and replies per thread', () => {
    const comments = Object.fromEntries(
      Array.from({ length: SHARE_COMMENT_LIMITS.threadsPerScene }, (_, index) => {
        const item = thread({ id: `comment_${index}` as CommentId })
        return [item.id, item]
      }),
    ) as Record<CommentId, CommentThread>
    expect(appendShareComment(comments, input, now)).toEqual({ ok: false, error: 'thread_limit' })

    const full = thread({
      replies: Array.from({ length: SHARE_COMMENT_LIMITS.repliesPerThread }, (_, index) => ({
        id: `comment-reply_${index}` as CommentReplyId,
        author: { name: 'Guest' },
        body: 'reply',
        createdAt: now.toISOString(),
      })),
    })
    expect(
      appendShareCommentReply(
        { [full.id]: full },
        full.id,
        { id: 'comment-reply_overflow', name: 'Guest', body: 'one too many' },
        now,
      ),
    ).toEqual({ ok: false, error: 'reply_limit' })
  })
})
