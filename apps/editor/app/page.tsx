'use client'

import { useScene } from '@pascal-app/core'
import { Editor, useTranslation, type SceneGraph } from '@pascal-app/editor'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { TopBarAuth } from '@/components/auth/top-bar-auth'
import { EDITOR_SIDEBAR_TABS } from '@/components/editor-sidebar-tabs'
import { EditorTopBar, TOP_BAR_ACTION } from '@/components/editor-top-bar'
import {
  CommunityViewerToolbarLeft,
  CommunityViewerToolbarRight,
} from '@/components/viewer-toolbar'
import { authClient } from '@/lib/auth-client'
import { cadastreProvider } from '@/lib/cadastre-provider'

const PROJECT_ID = 'local-editor'

export default function Home() {
  const t = useTranslation()
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTitleChange = async (newTitle: string) => {
    setIsCreating(true)
    setError(null)
    try {
      if (!session) {
        const { error: signInError } = await authClient.signIn.anonymous()
        if (signInError) throw new Error('Failed to initialize anonymous session')
      }

      const state = useScene.getState()
      const currentGraph: SceneGraph = {
        nodes: state.nodes,
        rootNodeIds: state.rootNodeIds,
        collections: state.collections,
        savedViews: state.savedViews,
        definitions: state.definitions,
        materials: state.materials,
        unitPrices: state.unitPrices,
        comments: state.comments,
        installedPlugins: state.installedPlugins,
      }

      const response = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTitle, graph: currentGraph }),
      })

      if (!response.ok) {
        let msg = `Failed to create scene (${response.status})`
        try {
          const errData = await response.json()
          if (errData.details && typeof errData.details === 'string') msg = errData.details
        } catch {}
        throw new Error(msg)
      }

      const meta = (await response.json()) as { id: string }
      router.push(`/scene/${meta.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scene')
      setIsCreating(false)
    }
  }

  return (
    <div className="relative h-screen w-screen">
      <Editor
        layoutVersion="v2"
        parcelProvider={cadastreProvider}
        navbarSlot={
          <EditorTopBar
            actions={
              <>
                <Link className={TOP_BAR_ACTION} href="/scenes">
                  {t('Saved scenes')}
                </Link>
                <TopBarAuth />
              </>
            }
            status={error ? t(error) : isCreating ? t('Saving…') : t('Blank canvas · not saved')}
            title={t('New workspace')}
            onTitleChange={handleTitleChange}
          />
        }
        projectId={PROJECT_ID}
        sidebarTabs={EDITOR_SIDEBAR_TABS}
        viewerToolbarLeft={<CommunityViewerToolbarLeft />}
        viewerToolbarRight={<CommunityViewerToolbarRight />}
      />
    </div>
  )
}
