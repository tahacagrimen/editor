'use client'

import Image from 'next/image'
import { type ReactNode, useState, useRef, useEffect } from 'react'

/**
 * Shared class for a top-bar action cell. Exported so callers can style links
 * and buttons identically without re-deriving the rule/padding rhythm.
 */
export const TOP_BAR_ACTION =
  'flex h-full items-center gap-2 border-border border-l-2 px-3.5 font-semibold text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

export interface EditorTopBarProps {
  /** Project or scene name. */
  title: string
  /** Short status line, set in monospace beside the title. */
  status?: string
  /** Action cells, each styled with `TOP_BAR_ACTION`. */
  actions?: ReactNode
  /** Callback fired when the title is renamed by the user. */
  onTitleChange?: (newTitle: string) => void
}

export function EditorTopBar({ title, status, actions, onTitleChange }: EditorTopBarProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const handleCommit = () => {
    setIsEditing(false)
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== title && onTitleChange) {
      onTitleChange(trimmed)
    } else {
      setEditValue(title)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCommit()
    if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(title)
    }
  }

  return (
    <header className="flex h-12 flex-shrink-0 items-stretch border-border border-b-2 bg-background text-foreground">
      <div className="flex w-14 flex-shrink-0 items-center justify-center border-border border-r-2">
        <Image
          alt="Menart"
          className="h-6 w-6 object-contain dark:invert"
          height={24}
          src="/menartlogo.webp"
          width={24}
        />
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 border-border border-r-2 px-4">
        <span className="font-extrabold text-[15px] tracking-[-0.01em]">MENART</span>
        <span className="font-extrabold text-[15px] text-muted-foreground">3D</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
        {isEditing ? (
          <input
            ref={inputRef}
            className="h-7 w-64 rounded border border-primary/50 bg-accent px-1.5 font-semibold text-[14px] outline-none"
            onBlur={handleCommit}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            value={editValue}
          />
        ) : (
          <button
            className="truncate rounded px-1.5 py-0.5 font-semibold text-[14px] hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              setEditValue(title)
              setIsEditing(true)
            }}
            title="Click to rename"
            type="button"
          >
            {title}
          </button>
        )}
        {status && (
          <span className="flex-shrink-0 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
            {status}
          </span>
        )}
      </div>

      {actions && <div className="flex flex-shrink-0 items-stretch">{actions}</div>}
    </header>
  )
}
