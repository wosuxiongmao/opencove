import React from 'react'
import { ChevronRight, Copy, FolderOpen, GitBranchPlus, Package } from 'lucide-react'
import type { WorkspacePathOpener, WorkspacePathOpenerId } from '@shared/types/api'
import type { SpaceActionMenuState } from '../types'

interface WorkspaceSpaceActionMenuProps {
  menu: SpaceActionMenuState | null
  availableOpeners: WorkspacePathOpener[]
  canCreateWorktree: boolean
  canArchive: boolean
  closeMenu: () => void
  onCreateWorktree: () => void
  onArchive: () => void
  onCopyPath: () => void | Promise<void>
  onOpenPath: (openerId: WorkspacePathOpenerId) => void | Promise<void>
}

const MENU_WIDTH = 188
const SUBMENU_WIDTH = 188
const VIEWPORT_PADDING = 12

export function WorkspaceSpaceActionMenu({
  menu,
  availableOpeners,
  canCreateWorktree,
  canArchive,
  closeMenu,
  onCreateWorktree,
  onArchive,
  onCopyPath,
  onOpenPath,
}: WorkspaceSpaceActionMenuProps): React.JSX.Element | null {
  const [openSubmenu, setOpenSubmenu] = React.useState<'open' | null>(null)

  React.useEffect(() => {
    setOpenSubmenu(null)
  }, [menu?.spaceId, menu?.x, menu?.y])

  if (!menu) {
    return null
  }

  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight
  const menuLeft = Math.min(menu.x, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING)
  const menuTop = Math.min(menu.y, viewportHeight - 120)
  const shouldShowOpenSubmenu = openSubmenu === 'open' && availableOpeners.length > 0
  const submenuWouldOverflow =
    menuLeft + MENU_WIDTH + SUBMENU_WIDTH > viewportWidth - VIEWPORT_PADDING
  const submenuLeft = submenuWouldOverflow
    ? menuLeft - SUBMENU_WIDTH - 6
    : menuLeft + MENU_WIDTH + 6
  const submenuTop = menuTop

  return (
    <>
      <div
        className="workspace-context-menu workspace-space-action-menu"
        data-testid="workspace-space-action-menu"
        style={{ top: menuTop, left: menuLeft }}
        onClick={event => {
          event.stopPropagation()
        }}
        onMouseLeave={() => {
          setOpenSubmenu(null)
        }}
      >
        {canCreateWorktree ? (
          <button
            type="button"
            data-testid="workspace-space-action-create"
            onClick={() => {
              onCreateWorktree()
              closeMenu()
            }}
          >
            <GitBranchPlus className="workspace-context-menu__icon" aria-hidden="true" />
            <span className="workspace-context-menu__label">Create Worktree</span>
          </button>
        ) : null}

        {canArchive ? (
          <button
            type="button"
            data-testid="workspace-space-action-archive"
            onClick={() => {
              onArchive()
              closeMenu()
            }}
          >
            <Package className="workspace-context-menu__icon" aria-hidden="true" />
            <span className="workspace-context-menu__label">Archive</span>
          </button>
        ) : null}

        <button
          type="button"
          data-testid="workspace-space-action-copy-path"
          onClick={() => {
            void Promise.resolve(onCopyPath()).finally(closeMenu)
          }}
        >
          <Copy className="workspace-context-menu__icon" aria-hidden="true" />
          <span className="workspace-context-menu__label">Copy Path</span>
        </button>

        {availableOpeners.length > 0 ? (
          <button
            type="button"
            data-testid="workspace-space-action-open"
            onMouseEnter={() => {
              setOpenSubmenu('open')
            }}
            onFocus={() => {
              setOpenSubmenu('open')
            }}
            onClick={() => {
              setOpenSubmenu(previous => (previous === 'open' ? null : 'open'))
            }}
          >
            <FolderOpen className="workspace-context-menu__icon" aria-hidden="true" />
            <span className="workspace-context-menu__label">Open</span>
            <ChevronRight
              className="workspace-context-menu__icon workspace-space-action-menu__chevron"
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>

      {shouldShowOpenSubmenu ? (
        <div
          className="workspace-context-menu workspace-space-action-menu workspace-space-action-menu--submenu"
          data-testid="workspace-space-action-open-menu"
          style={{ top: submenuTop, left: submenuLeft }}
          onClick={event => {
            event.stopPropagation()
          }}
          onMouseEnter={() => {
            setOpenSubmenu('open')
          }}
          onMouseLeave={() => {
            setOpenSubmenu(null)
          }}
        >
          {availableOpeners.map(opener => (
            <button
              key={opener.id}
              type="button"
              data-testid={`workspace-space-action-open-${opener.id}`}
              onClick={() => {
                void Promise.resolve(onOpenPath(opener.id)).finally(closeMenu)
              }}
            >
              <FolderOpen className="workspace-context-menu__icon" aria-hidden="true" />
              <span className="workspace-context-menu__label">{opener.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}
