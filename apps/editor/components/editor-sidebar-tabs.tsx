'use client'

import { ItemsPanel, QuantitiesPanel, type SidebarTab, SunStudyPanel } from '@pascal-app/editor'
import { Boxes, Hammer, Layers, MessageSquare, Package, Settings, Sigma, Sun } from 'lucide-react'
import Image from 'next/image'
import type { ComponentType } from 'react'
import { BuildTab } from './build-tab'

// The open-source editor only ships the built-in catalog (no uploaded items),
// so the Library/Community/Mine source chips and tag filters add nothing —
// drop them and keep the panel to plain categories.
function EditorItemsPanel() {
  return <ItemsPanel showSourceFilter={false} showTagFilters={false} />
}

const imageIcon = (src: string) => (
  <Image alt="" className="h-8 w-8 object-contain" height={32} src={src} width={32} />
)

/**
 * The single source of truth for the standalone editor's left rail. Both
 * editing hosts (`app/page.tsx` and `components/scene-loader.tsx`) pass this to
 * `<Editor>`, so a tab added, renamed or reordered in one no longer drifts from
 * the other.
 *
 * Labels are plain English: `EditorInner` translates them against the user's
 * locale before they reach the rail.
 *
 * `group` clusters consecutive tabs behind a thin divider — model / create /
 * analyze / collaborate. `settings` stays ungrouped; it is pinned to the rail's
 * bottom regardless.
 */
export const EDITOR_SIDEBAR_TABS: (SidebarTab & { component: ComponentType })[] = [
  {
    id: 'site',
    label: 'Site',
    group: 'model',
    component: () => null, // Built-in SitePanel handles this
    mobileDefaultSnap: 0.5,
    mobileIcon: <Layers className="h-5 w-5" />,
    icon: imageIcon('/icons/site-flag.webp'),
  },
  {
    id: 'building',
    label: 'Structure',
    group: 'model',
    component: () => null, // Built-in BuildingPanel handles this
    mobileDefaultSnap: 0.5,
    mobileIcon: <Layers className="h-5 w-5" />,
    icon: imageIcon('/icons/building.webp'),
  },
  {
    id: 'build',
    label: 'Build',
    group: 'create',
    component: BuildTab,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Hammer className="h-5 w-5" />,
    icon: imageIcon('/icons/build.webp'),
  },
  {
    id: 'items',
    label: 'Items',
    group: 'create',
    component: EditorItemsPanel,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Package className="h-5 w-5" />,
    icon: imageIcon('/icons/couch.webp'),
  },
  {
    id: 'components',
    label: 'Components',
    group: 'create',
    component: () => null, // Built-in ComponentsPanel handles this
    mobileDefaultSnap: 0.5,
    mobileIcon: <Boxes className="h-5 w-5" />,
    icon: <Boxes className="h-5 w-5" />,
  },
  {
    id: 'sun',
    label: 'Sun',
    group: 'analyze',
    component: SunStudyPanel,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Sun className="h-5 w-5" />,
    icon: <Sun className="h-5 w-5" />,
  },
  {
    id: 'quantities',
    label: 'Quantities',
    group: 'analyze',
    component: QuantitiesPanel,
    mobileDefaultSnap: 0.5,
    mobileIcon: <Sigma className="h-5 w-5" />,
    icon: <Sigma className="h-5 w-5" />,
  },
  {
    id: 'activity',
    label: 'Activity',
    group: 'collaborate',
    component: () => null, // Built-in ActivityPanel handles this
    mobileDefaultSnap: 0.5,
    mobileIcon: <MessageSquare className="h-5 w-5" />,
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    component: () => null, // Built-in SettingsPanel handles this
    mobileDefaultSnap: 0.5,
    mobileIcon: <Settings className="h-5 w-5" />,
    icon: imageIcon('/icons/settings.webp'),
  },
]
