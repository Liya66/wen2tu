import {
  Download,
  FilePlus2,
  FolderOpen,
  Import,
  PaintBucket,
  PanelLeft,
  Redo2,
  Save,
  SaveAll,
  Settings,
  Undo2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceController, WorkspaceState } from '../features/workspace/workspaceController'
import { shortcut } from '../utils/platform'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Logo } from './Logo'
import { Menu } from './Menu'

interface ToolButtonProps {
  label: string
  icon: ReactNode
  onClick: () => void
  keys?: string
  showLabel?: boolean
  disabled?: boolean
}

function ToolButton({ label, icon, onClick, keys, showLabel = true, disabled }: ToolButtonProps) {
  const title = keys ? `${label} (${keys})` : label
  return (
    <button
      type="button"
      className="tool-button"
      onClick={onClick}
      title={title}
      aria-label={showLabel ? undefined : label}
      aria-keyshortcuts={keys}
      disabled={disabled}
    >
      {icon}
      {showLabel && <span className="tool-label">{label}</span>}
    </button>
  )
}

interface Props {
  controller: WorkspaceController
  state: WorkspaceState
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onShowShortcuts: () => void
  onShowTemplates: () => void
  styleOpen: boolean
  onToggleStyle: () => void
}

export function Toolbar({
  controller,
  state,
  sidebarOpen,
  onToggleSidebar,
  onShowShortcuts,
  onShowTemplates,
  styleOpen,
  onToggleStyle,
}: Props) {
  const { t } = useTranslation()
  const disabled = !state.ready
  const size = 18

  return (
    <header className="toolbar">
      <button
        type="button"
        className="tool-button"
        onClick={onToggleSidebar}
        aria-label={t('toolbar.toggleSidebar')}
        aria-expanded={sidebarOpen}
        aria-controls="file-sidebar"
        title={t('toolbar.toggleSidebar')}
      >
        <PanelLeft size={size} aria-hidden="true" />
      </button>

      <div className="brand">
        <Logo size={24} />
        <span className="brand-name">{t('app.name')}</span>
      </div>

      <nav className="tool-group" aria-label={t('app.name')}>
        <Menu
          label={t('toolbar.new')}
          icon={<FilePlus2 size={size} aria-hidden="true" />}
          items={[
            { label: t('toolbar.newBlank'), onSelect: () => controller.newDoc() },
            { label: t('toolbar.newFromTemplate'), onSelect: onShowTemplates },
          ]}
        />
        <ToolButton
          label={t('toolbar.open')}
          icon={<FolderOpen size={size} aria-hidden="true" />}
          onClick={() => void controller.openFile()}
          keys={shortcut('O')}
          disabled={disabled}
        />
        <ToolButton
          label={t('toolbar.import')}
          icon={<Import size={size} aria-hidden="true" />}
          onClick={() => void controller.importFile()}
          disabled={disabled}
        />
        <span className="tool-separator" aria-hidden="true" />
        <ToolButton
          label={t('toolbar.save')}
          icon={<Save size={size} aria-hidden="true" />}
          onClick={() => void controller.save()}
          keys={shortcut('S')}
          disabled={disabled}
        />
        <ToolButton
          label={t('toolbar.saveAs')}
          icon={<SaveAll size={size} aria-hidden="true" />}
          onClick={() => void controller.saveAs()}
          keys={shortcut('Shift', 'S')}
          disabled={disabled}
          showLabel={false}
        />
        <span className="tool-separator" aria-hidden="true" />
        <ToolButton
          label={t('toolbar.undo')}
          icon={<Undo2 size={size} aria-hidden="true" />}
          onClick={() => controller.undo()}
          keys={shortcut('Z')}
          showLabel={false}
          disabled={disabled}
        />
        <ToolButton
          label={t('toolbar.redo')}
          icon={<Redo2 size={size} aria-hidden="true" />}
          onClick={() => controller.redo()}
          keys={shortcut('Shift', 'Z')}
          showLabel={false}
          disabled={disabled}
        />
        <span className="tool-separator" aria-hidden="true" />
        <Menu
          label={t('toolbar.export')}
          icon={<Download size={size} aria-hidden="true" />}
          items={[
            { label: t('toolbar.exportPng'), onSelect: () => void controller.exportImage('png') },
            { label: t('toolbar.exportSvg'), onSelect: () => void controller.exportImage('svg') },
            { label: t('toolbar.exportMarkdown'), onSelect: () => controller.exportMarkdown() },
          ]}
        />
        <span className="tool-separator" aria-hidden="true" />
        <button
          type="button"
          className="tool-button"
          aria-pressed={styleOpen}
          aria-controls="style-panel"
          onClick={onToggleStyle}
          title={t('toolbar.style')}
          disabled={disabled}
        >
          <PaintBucket size={size} aria-hidden="true" />
          <span className="tool-label">{t('toolbar.style')}</span>
        </button>
      </nav>

      <div className="toolbar-end">
        <LanguageSwitcher />
        <Menu
          label={t('toolbar.settings')}
          icon={<Settings size={size} aria-hidden="true" />}
          showLabel={false}
          align="end"
          items={[
            {
              label: t('toolbar.autoWrite'),
              hint: state.fileSystemAccess ? t('toolbar.autoWriteHint') : t('status.fallbackMode'),
              checked: state.autoWrite,
              disabled: !state.fileSystemAccess,
              onSelect: () => void controller.setAutoWrite(!state.autoWrite),
            },
            { label: t('toolbar.shortcuts'), onSelect: onShowShortcuts },
          ]}
        />
      </div>
    </header>
  )
}
