import { useTranslation } from 'react-i18next'
import { shortcut } from '../utils/platform'
import { Dialog } from './Dialog'

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const rows: Array<[string, string]> = [
    [shortcut('S'), t('shortcuts.save')],
    [shortcut('Shift', 'S'), t('shortcuts.saveAs')],
    [shortcut('O'), t('shortcuts.open')],
    [shortcut('V'), t('shortcuts.paste')],
    [shortcut('Z'), t('shortcuts.undo')],
    [shortcut('Shift', 'Z'), t('shortcuts.redo')],
    ['Tab', t('shortcuts.addChild')],
    ['Enter', t('shortcuts.addSibling')],
    ['F2', t('shortcuts.edit')],
    ['Delete', t('shortcuts.remove')],
    ['← ↑ → ↓', t('shortcuts.navigate')],
    [`${shortcut('=')} / ${shortcut('-')}`, t('shortcuts.zoom')],
    ['F1', t('shortcuts.center')],
    [shortcut('K'), t('shortcuts.collapse')],
  ]
  return (
    <Dialog
      open={open}
      title={t('shortcuts.title')}
      onClose={onClose}
      actions={
        <button type="button" className="button primary" onClick={onClose}>
          {t('dialogs.close')}
        </button>
      }
    >
      <table className="shortcut-table">
        <tbody>
          {rows.map(([keys, label]) => (
            <tr key={label}>
              <td>
                <kbd>{keys}</kbd>
              </td>
              <td>{label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  )
}
