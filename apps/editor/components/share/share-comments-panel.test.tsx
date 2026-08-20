import { expect, test } from 'bun:test'
import type { CommentId, CommentThread } from '@pascal-app/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShareCommentsPanel } from './share-comments-panel'

const resolvedThread: CommentThread = {
  id: 'comment_one' as CommentId,
  anchor: { position: [1, 0, 2] },
  author: { name: 'Ada' },
  body: 'Kapı ölçüsünü kontrol eder misiniz?',
  createdAt: '2026-08-20T10:00:00.000Z',
  levelId: 'level_ground' as never,
  resolved: true,
  replies: [],
}

const baseProps = {
  activeId: null,
  comments: [{ number: 1, thread: resolvedThread }],
  draft: null,
  error: null,
  levelNames: { level_ground: 'Zemin Kat' },
  locale: 'tr-TR',
  placing: false,
  saving: false,
  onCancelDraft: () => {},
  onFocus: () => {},
  onReply: async () => true,
  onStartPlacing: () => {},
  onSubmitDraft: async () => true,
}

test('a closed share keeps existing threads readable without mounting placement controls', () => {
  const markup = renderToStaticMarkup(<ShareCommentsPanel {...baseProps} allowComments={false} />)

  expect(markup).toContain('Bu bağlantı yorum eklemeye kapalı. Sadece görüntüleyebilirsin.')
  expect(markup).toContain('Kapı ölçüsünü kontrol eder misiniz?')
  expect(markup).toContain('Çözüldü')
  expect(markup).not.toContain('Yorum ekle')
  expect(markup).not.toContain('Yanıtla')
  expect(markup).not.toContain('>Çöz<')
})

test('an empty draft requires both the visitor name and note', () => {
  const markup = renderToStaticMarkup(
    <ShareCommentsPanel
      {...baseProps}
      allowComments
      comments={[]}
      draft={{ position: [1, 0, 2] }}
    />,
  )

  expect(markup).toContain('Adınız')
  expect(markup).toContain('Notunuz')
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*Yorumu gönder/s)
})
