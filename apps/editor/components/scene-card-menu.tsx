'use client'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useTranslation,
} from '@pascal-app/editor'
import { Link2, Loader2, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { SceneShareLinksPanel } from './scene-share-links-panel'

export function SceneCardMenu({ sceneId, sceneName }: { sceneId: string; sceneName: string }) {
  const t = useTranslation()
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const isAnonymous = session?.user?.isAnonymous ?? false

  const [menuOpen, setMenuOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const [newName, setNewName] = useState(sceneName)
  const [isRenaming, setIsRenaming] = useState(false)

  const [isDeleting, setIsDeleting] = useState(false)

  const handleRename = async () => {
    if (!newName.trim() || newName === sceneName) {
      setRenameOpen(false)
      return
    }
    setIsRenaming(true)
    try {
      const response = await fetch(`/api/scenes/${sceneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
      if (response.ok) {
        setRenameOpen(false)
        router.refresh()
      }
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/scenes/${sceneId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        setDeleteOpen(false)
        router.refresh()
      }
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div onClick={(e) => e.preventDefault()}>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 outline-none">
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            <span>{t('Rename')}</span>
          </DropdownMenuItem>
          {!isAnonymous && (
            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              <Link2 className="mr-2 h-4 w-4" />
              <span>{t('Share links')}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{t('Delete')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Rename')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <input
              autoFocus
              className="w-full rounded border border-border bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              className="rounded px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setRenameOpen(false)}
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={isRenaming || !newName.trim()}
              onClick={handleRename}
            >
              {isRenaming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('Rename')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Delete')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-muted-foreground">
            {t('Are you sure you want to delete')}{' '}
            <span className="font-medium text-foreground">{sceneName}</span>?
          </div>
          <DialogFooter>
            <button
              type="button"
              className="rounded px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setDeleteOpen(false)}
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('Delete')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('Share links')}</DialogTitle>
          </DialogHeader>
          <SceneShareLinksPanel active={shareOpen} sceneId={sceneId} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
