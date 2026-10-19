// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { en } from '../src/client/locales.ts'
import { CharacterHero } from '../src/client/skeleton/CharacterHero.tsx'
import { DAILY_RECORDS_KEY, parseDailyRecords } from '../src/client/skeleton/daily-records.ts'

const t = makeTranslate(en, commonEn)
const first = { id: 'task-first', title: 'Write article', time: '09:30', done: true }
const second = { id: 'task-second', title: 'Read notes', time: '', done: false }
const records = () => parseDailyRecords(localStorage.getItem(DAILY_RECORDS_KEY))!
function mount() {
  const view = render(<CharacterHero t={t} sidebar />)
  fireEvent.click(view.getByRole('button', { name: en['daily.tasks'] }))
  return view
}
function edit(view: ReturnType<typeof mount>, title = first.title) {
  fireEvent.click(view.getByRole('button', { name: t('daily.editTask', { title }) }))
  return view.getByRole('textbox', { name: t('daily.editTaskTitle', { title }) }) as HTMLTextAreaElement
}
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(DAILY_RECORDS_KEY, JSON.stringify({ ...parseDailyRecords(null), tasks: [first, second],
    links: [{ id: 'keep-link', name: 'Example', url: 'https://example.com/' }],
    notes: [{ id: 'keep-note', text: 'Keep this note', created: 1000 }],
  }))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('personal to-do editing and deletion', () => {
  it('saves a title and retains its id, completion state, planned time and other records across remount', () => {
    const before = records()
    let view = mount()
    const field = edit(view)
    fireEvent.change(field, { target: { value: '  Publish the article  ' } })
    fireEvent.click(view.getByRole('button', { name: en['daily.saveTask'] }))
    expect(records().tasks).toEqual([{ ...first, title: 'Publish the article' }, second])
    expect(records().links).toEqual(before.links)
    expect(records().notes).toEqual(before.notes)
    expect(view.getByRole('button', { name: 'Publish the article' }).getAttribute('aria-pressed')).toBe('true')
    expect(view.getByRole('button', { name: t('daily.editTask', { title: 'Publish the article' }) })).toBe(document.activeElement)
    view.unmount()
    view = mount()
    expect(view.getByText('Publish the article')).toBeTruthy()
    expect(view.getByLabelText(t('daily.timeFor', { title: 'Publish the article' })).getAttribute('value')).toBe('09:30')
  })

  it('keeps time changes made while editing when Enter saves the title', () => {
    const view = mount()
    const field = edit(view)
    fireEvent.change(field, { target: { value: 'Revised task' } })
    fireEvent.change(view.getByLabelText(t('daily.timeFor', { title: first.title })), { target: { value: '17:45' } })
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter', keyCode: 13 })
    expect(records().tasks[0]).toEqual({ ...first, title: 'Revised task', time: '17:45' })
    expect(view.queryByRole('textbox', { name: t('daily.editTaskTitle', { title: first.title }) })).toBeNull()
  })

  it.each(['button', 'Escape'])('cancels a title draft with %s while keeping the dialog and saved record', (method) => {
    const before = localStorage.getItem(DAILY_RECORDS_KEY)
    const view = mount()
    const field = edit(view)
    fireEvent.change(field, { target: { value: 'Discard this draft' } })
    if (method === 'button') fireEvent.click(view.getByRole('button', { name: en['daily.cancelEdit'] }))
    else fireEvent.keyDown(field, { key: 'Escape', code: 'Escape' })
    expect(view.getByRole('dialog', { name: en['daily.tasks'] })).toBeTruthy()
    expect(view.getByText(first.title)).toBeTruthy()
    expect(view.queryByText('Discard this draft')).toBeNull()
    expect(localStorage.getItem(DAILY_RECORDS_KEY)).toBe(before)
  })

  it('removes only the selected task and shows the empty state after deleting the last item', () => {
    const before = records()
    const view = mount()
    fireEvent.click(view.getByRole('button', { name: t('daily.deleteTask', { title: first.title }) }))
    expect(records().tasks).toEqual([second])
    expect(records().links).toEqual(before.links)
    expect(records().notes).toEqual(before.notes)
    expect(view.queryByText(first.title)).toBeNull()
    expect(view.getByRole('status').textContent).toBe(en['daily.taskDeleted'])
    fireEvent.click(view.getByRole('button', { name: t('daily.deleteTask', { title: second.title }) }))
    expect(records().tasks).toEqual([])
    expect(view.getByText(en['daily.emptyTasks'])).toBeTruthy()
  })

  it('keeps blank drafts from saving and limits title edits to the existing 80-character bound', () => {
    const before = localStorage.getItem(DAILY_RECORDS_KEY)
    const view = mount()
    const field = edit(view)
    fireEvent.change(field, { target: { value: '   ' } })
    expect((view.getByRole('button', { name: en['daily.saveTask'] }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 13 })
    expect(localStorage.getItem(DAILY_RECORDS_KEY)).toBe(before)
    fireEvent.change(field, { target: { value: '长'.repeat(90) } })
    expect(field.value).toHaveLength(80)
    fireEvent.click(view.getByRole('button', { name: en['daily.saveTask'] }))
    expect(records().tasks[0]?.title).toHaveLength(80)
  })

  it('does not commit on IME Enter but commits after composition ends', () => {
    const view = mount()
    const field = edit(view)
    fireEvent.change(field, { target: { value: '写文章' } })
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 })
    expect(records().tasks[0]?.title).toBe(first.title)
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 13 })
    expect(records().tasks[0]?.title).toBe('写文章')
  })

  it('keeps the draft and original row when storage refuses editing or deletion', () => {
    const before = localStorage.getItem(DAILY_RECORDS_KEY)
    const view = mount()
    const field = edit(view)
    fireEvent.change(field, { target: { value: 'Keep my draft' } })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    fireEvent.click(view.getByRole('button', { name: en['daily.saveTask'] }))
    expect(field.value).toBe('Keep my draft')
    expect(view.getByRole('status').textContent).toBe(en['daily.saveError'])
    fireEvent.click(view.getByRole('button', { name: t('daily.deleteTask', { title: first.title }) }))
    expect(view.getByRole('button', { name: first.title })).toBeTruthy()
    expect(localStorage.getItem(DAILY_RECORDS_KEY)).toBe(before)
  })

  it('refuses stale-window edits and deletions without replacing newer records', () => {
    const view = mount()
    const field = edit(view)
    fireEvent.change(field, { target: { value: 'Stale edit' } })
    const newer = JSON.stringify({ ...records(), revision: 100, tasks: [{ ...first, title: 'Newer title' }, second] })
    localStorage.setItem(DAILY_RECORDS_KEY, newer)
    fireEvent.click(view.getByRole('button', { name: en['daily.saveTask'] }))
    expect(field.value).toBe('Stale edit')
    expect(view.getByRole('status').textContent).toBe(en['daily.conflict'])
    fireEvent.click(view.getByRole('button', { name: t('daily.deleteTask', { title: first.title }) }))
    expect(localStorage.getItem(DAILY_RECORDS_KEY)).toBe(newer)
    expect(view.getByRole('button', { name: first.title })).toBeTruthy()
  })
})
