'use client'

import { Editor, useTranslation } from '@pascal-app/editor'
import Link from 'next/link'
import { TopBarAuth } from '@/components/auth/top-bar-auth'
import { EDITOR_SIDEBAR_TABS } from '@/components/editor-sidebar-tabs'
import { EditorTopBar, TOP_BAR_ACTION } from '@/components/editor-top-bar'
import {
  CommunityViewerToolbarLeft,
  CommunityViewerToolbarRight,
} from '@/components/viewer-toolbar'
import { cadastreProvider } from '@/lib/cadastre-provider'

const PROJECT_ID = 'local-editor'

export default function Home() {
  const t = useTranslation()

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
            status={t('Blank canvas · not saved')}
            title={t('New workspace')}
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
