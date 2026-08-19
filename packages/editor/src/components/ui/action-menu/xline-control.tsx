'use client'

import Image from 'next/image'
import { cn } from '../../../lib/utils'
import useEditor from '../../../store/use-editor'
import { ActionButton } from './action-button'

/**
 * Bottom-bar control for the `xline` construction/reference line. The kind is
 * contributed by `packages/nodes` and resolved through the registry at
 * `setTool`, so this component only names the tool id — it never imports the
 * node package (the editor layer must not depend on `nodes`).
 *
 * `xline` is placed in the 2D floorplan, so arming it also switches to the
 * plan view. Clicking it again drops back to select, mirroring the measure
 * button's toggle.
 */
export function XLineControl() {
  const mode = useEditor((state) => state.mode)
  const tool = useEditor((state) => state.tool)
  const setMode = useEditor((state) => state.setMode)
  const setPhase = useEditor((state) => state.setPhase)
  const setStructureLayer = useEditor((state) => state.setStructureLayer)
  const setTool = useEditor((state) => state.setTool)
  const setViewMode = useEditor((state) => state.setViewMode)

  const isActive = mode === 'build' && tool === 'xline'

  const activateXLine = () => {
    setPhase('structure')
    setStructureLayer('elements')
    setViewMode('2d')
    setMode('build')
    setTool('xline')
  }

  const handleClick = () => {
    if (isActive) {
      setMode('select')
      return
    }
    activateXLine()
  }

  return (
    <ActionButton
      aria-label="XLine: reference line"
      aria-pressed={isActive}
      className={cn(
        'text-muted-foreground',
        isActive
          ? 'bg-sky-500/20 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20'
          : 'hover:bg-sky-500/15 hover:text-sky-700 dark:hover:text-sky-400',
      )}
      label="XLine"
      onClick={handleClick}
      size="icon"
      variant="ghost"
    >
      <Image
        alt="XLine"
        className={cn(
          'h-[28px] w-[28px] object-contain transition-[opacity,filter] duration-200',
          isActive
            ? 'opacity-100 grayscale-0'
            : 'opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0',
        )}
        height={28}
        src="/icons/xline.webp"
        width={28}
      />
    </ActionButton>
  )
}
