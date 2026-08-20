import type { AnyNodeId, CommentId, CommentReplyId, CommentThread } from '@pascal-app/core/schema'
import { z } from 'zod'

export const SHARE_COMMENT_LIMITS = {
  bodyCharacters: 2_000,
  nameCharacters: 80,
  repliesPerThread: 50,
  threadsPerScene: 500,
  newThreadsPerMinute: 5,
  repliesPerMinute: 15,
} as const

const finiteNumber = z.number().finite()
const triple = z.tuple([finiteNumber, finiteNumber, finiteNumber])
const authorName = z.string().trim().min(1).max(SHARE_COMMENT_LIMITS.nameCharacters)
const messageBody = z.string().trim().min(1).max(SHARE_COMMENT_LIMITS.bodyCharacters)

export const shareCommentCreateSchema = z.object({
  id: z.string().regex(/^comment_.+$/),
  anchor: z.object({
    position: triple,
    nodeId: z.string().min(1).optional(),
    offset: triple.optional(),
  }),
  body: messageBody,
  name: authorName,
  levelId: z.string().min(1).optional(),
  camera: z
    .object({
      position: triple,
      target: triple,
      projection: z.enum(['perspective', 'orthographic']),
      viewWidth: finiteNumber.optional(),
      fov: finiteNumber.optional(),
    })
    .optional(),
})

export const shareCommentReplySchema = z.object({
  id: z.string().regex(/^comment-reply_.+$/),
  body: messageBody,
  name: authorName,
})

export type ShareCommentCreateInput = z.infer<typeof shareCommentCreateSchema>
export type ShareCommentReplyInput = z.infer<typeof shareCommentReplySchema>

export type ShareCommentWriteError =
  | 'thread_limit'
  | 'reply_limit'
  | 'thread_not_found'
  | 'thread_resolved'

export type ShareCommentWriteResult =
  | {
      ok: true
      comments: Record<CommentId, CommentThread>
      created: boolean
    }
  | { ok: false; error: ShareCommentWriteError }

export function appendShareComment(
  comments: Record<CommentId, CommentThread>,
  input: ShareCommentCreateInput,
  now = new Date(),
): ShareCommentWriteResult {
  const id = input.id as CommentId
  if (comments[id]) return { ok: true, comments, created: false }
  if (Object.keys(comments).length >= SHARE_COMMENT_LIMITS.threadsPerScene) {
    return { ok: false, error: 'thread_limit' }
  }

  const thread: CommentThread = {
    id,
    anchor: {
      position: input.anchor.position,
      ...(input.anchor.nodeId && { nodeId: input.anchor.nodeId as AnyNodeId }),
      ...(input.anchor.offset && { offset: input.anchor.offset }),
    },
    // Only the anonymous display name crosses this trust boundary. An
    // attacker-supplied `author.id` is not part of the parsed input and can
    // never impersonate an account.
    author: { name: input.name },
    body: input.body,
    createdAt: now.toISOString(),
    ...(input.levelId && { levelId: input.levelId as AnyNodeId }),
    ...(input.camera && { camera: input.camera }),
    replies: [],
  }
  return { ok: true, comments: { ...comments, [id]: thread }, created: true }
}

export function appendShareCommentReply(
  comments: Record<CommentId, CommentThread>,
  threadId: CommentId,
  input: ShareCommentReplyInput,
  now = new Date(),
): ShareCommentWriteResult {
  const thread = comments[threadId]
  if (!thread) return { ok: false, error: 'thread_not_found' }
  if (thread.resolved) return { ok: false, error: 'thread_resolved' }

  const replyId = input.id as CommentReplyId
  if (thread.replies.some((reply) => reply.id === replyId)) {
    return { ok: true, comments, created: false }
  }
  if (thread.replies.length >= SHARE_COMMENT_LIMITS.repliesPerThread) {
    return { ok: false, error: 'reply_limit' }
  }

  const nextThread: CommentThread = {
    ...thread,
    replies: [
      ...thread.replies,
      {
        id: replyId,
        author: { name: input.name },
        body: input.body,
        createdAt: now.toISOString(),
      },
    ],
  }
  return {
    ok: true,
    comments: { ...comments, [threadId]: nextThread },
    created: true,
  }
}
