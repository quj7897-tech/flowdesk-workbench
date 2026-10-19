import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { IconEditOutlineRegular, IconTrashOutlineRegular, InlineEditor, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HeroShellProps } from './EmptyHero.tsx'
import type { DailyTask } from './daily-records.ts'
import css from './HeroShell.module.css'

/**
 * Render a personal to-do with a local title draft and independent completion/time controls.
 * @param props - Saved item, localized labels and persistence callbacks.
 * @returns the editable task row.
 */
export function DailyTaskRow({ item, t, onUpdate, onDelete }: {
  item: DailyTask
  t: HeroShellProps['t']
  onUpdate: (next: DailyTask) => boolean
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  useEffect(() => {
    if (!editing && wasEditing.current) editButton.current?.focus()
    wasEditing.current = editing
  }, [editing])
  const saveTitle = () => {
    const title = draft.trim()
    if (title !== '' && onUpdate({ ...item, title })) setEditing(false)
  }
  return <div className={css.taskRow} data-task-id={item.id}>
    <button type="button" className={css.check} aria-label={item.title} aria-pressed={item.done}
      onClick={() => { onUpdate({ ...item, done: !item.done }) }}>
      <span className={css.checkMark} aria-hidden="true">{item.done ? '✓' : ''}</span>
    </button>
    <div className={css.taskContent}>
      {editing ? <div className={css.taskEdit} onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation() }
      }}>
        <InlineEditor value={draft} label={t('daily.editTaskTitle', { title: item.title })}
          onChange={(value) => { setDraft(value.slice(0, 80)) }} onSave={saveTitle}
          onCancel={() => { setEditing(false) }} className={clsx(css.taskEditor)} />
        <div className={css.taskEditActions}>
          <button type="button" className={css.taskSave} disabled={draft.trim() === ''} onClick={saveTitle}>{t('daily.saveTask')}</button>
          <button type="button" className={css.taskCancel} onClick={() => { setEditing(false) }}>{t('daily.cancelEdit')}</button>
        </div>
      </div> : <span className={item.done ? css.done : css.taskTitle}>{item.title}</span>}
    </div>
    <input className={css.taskTime} type="time" aria-label={t('daily.timeFor', { title: item.title })}
      value={item.time} onChange={(event) => { onUpdate({ ...item, time: event.target.value }) }} />
    <div className={css.taskActions}>
      <Tooltip label={t('daily.editTask', { title: item.title })} disabled={editing} portal side="top" delayMs={400}>
        <button ref={editButton} type="button" className={css.taskAction} disabled={editing}
          aria-label={t('daily.editTask', { title: item.title })} onClick={() => { setDraft(item.title); setEditing(true) }}>
          <IconEditOutlineRegular size={16} />
        </button>
      </Tooltip>
      <Tooltip label={t('daily.deleteTask', { title: item.title })} portal side="top" delayMs={400}>
        <button type="button" className={css.taskAction} aria-label={t('daily.deleteTask', { title: item.title })} onClick={onDelete}>
          <IconTrashOutlineRegular size={16} />
        </button>
      </Tooltip>
    </div>
  </div>
}
