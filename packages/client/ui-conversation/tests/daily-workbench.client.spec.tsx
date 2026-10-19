// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { en } from '../src/client/locales.ts'
import { CharacterHero } from '../src/client/skeleton/CharacterHero.tsx'
import { DAILY_RECORDS_KEY, dailyURL, parseDailyRecords } from '../src/client/skeleton/daily-records.ts'

const t = makeTranslate(en, commonEn)
function open(view: ReturnType<typeof render>, label: string) {
  fireEvent.click(view.getByRole('navigation').querySelector(`button:nth-child(${label === 'tasks' ? 1 : label === 'links' ? 2 : label === 'notes' ? 3 : 4})`)!)
}
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('personal workbench records', () => {
  it('keeps the character neutral when the system requests reduced motion', () => {
    const previous = window.matchMedia
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({
      matches: true, addEventListener() {}, removeEventListener() {},
    }) })
    try {
      const view = render(<CharacterHero t={t} />)
      fireEvent.pointerMove(window, { clientX: 900, clientY: 500 })
      const pupils = view.container.querySelectorAll('[id$="pupil-left"], [id$="pupil-right"]')
      expect(Array.from(pupils, pupil => pupil.getAttribute('transform'))).toEqual(['translate(0 0)', 'translate(0 0)'])
      expect(view.queryByRole('button', { name: en['daily.pause'] })).toBeNull()
    } finally { Object.defineProperty(window, 'matchMedia', { configurable: true, value: previous }) }
  })
  it('keeps gaze coordinates identical through page scale and translation changes', () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const view = render(<CharacterHero t={t} />)
    const svg = view.container.querySelector('svg')!
    let mapping = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: () => ({ inverse: () => mapping }) })
    const settle = () => { act(() => { for (let i = 0; i < 100 && frames.length; i++) frames.shift()!(i) }) }
    fireEvent.pointerMove(window, { clientX: 900, clientY: 500 })
    settle()
    const pupil = view.container.querySelector('[id$="pupil-left"]')!
    const before = pupil.getAttribute('transform')
    mapping = { a: 2, b: 0, c: 0, d: 2, e: -100, f: -200 }
    fireEvent.pointerMove(window, { clientX: 500, clientY: 350 })
    settle()
    expect(pupil.getAttribute('transform')).toBe(before)
    fireEvent.resize(window)
    settle()
    expect(pupil.getAttribute('transform')).toBe('translate(0 0)')
    expect(view.container.querySelector('[id$="eye-layers"]')?.getAttribute('style')).toContain('opacity: 0')
  })

  it('shows the work companion copy without homepage shortcuts while preserving sidebar tools', () => {
    const view = render(<CharacterHero t={t} />)
    expect(view.getByText(en['daily.eyebrow'])).toBeTruthy()
    expect(view.getByText(en['daily.intro'])).toBeTruthy()
    expect(view.getByRole('heading', { level: 2 }).textContent).toBe(en['daily.noteFirst'] + en['daily.noteSecond'])
    for (const key of ['daily.tasks', 'daily.links', 'daily.notes', 'daily.memory'] as const) {
      expect(view.queryByRole('button', { name: en[key] })).toBeNull()
    }
    view.rerender(<CharacterHero t={t} sidebar />)
    for (const key of ['daily.tasks', 'daily.links', 'daily.notes', 'daily.memory'] as const) {
      expect(view.getByRole('button', { name: en[key] })).toBeTruthy()
    }
  })

  it('starts empty without importing prototype data or writing during render', () => {
    localStorage.setItem('daily-original-character-v5', '{"notes":[{"text":"demo"}]}')
    localStorage.setItem('existing-harness-data', 'keep')
    const view = render(<CharacterHero t={t} sidebar />)
    open(view, 'tasks')
    expect(view.getByText(en['daily.emptyTasks'])).toBeTruthy()
    expect(localStorage.getItem(DAILY_RECORDS_KEY)).toBeNull()
    expect(localStorage.getItem('existing-harness-data')).toBe('keep')
  })

  it('persists a note across remount and displays it in memories as plain text', () => {
    let view = render(<CharacterHero t={t} sidebar />)
    open(view, 'notes')
    fireEvent.change(view.getByRole('textbox', { name: en['daily.noteText'] }), { target: { value: '<script>kept as text</script>' } })
    fireEvent.click(view.getByRole('button', { name: en['daily.saveNote'] }))
    expect(view.getByRole('status').textContent).toBe(en['daily.saved'])
    view.unmount()
    view = render(<CharacterHero t={t} sidebar />)
    open(view, 'memory')
    expect(view.getByText('<script>kept as text</script>')).toBeTruthy()
    expect(document.querySelector('article script')).toBeNull()
  })

  it('keeps every saved note visible in Quick note, newest first, after closing and remounting', () => {
    const baseline = { ...parseDailyRecords(null)!, tasks: [{ id: 'keep-task', title: 'Keep this task', done: true, time: '09:30' }], notes: [
      { id: 'existing-note', text: 'Existing thought', created: 1700000000000 },
    ] }
    localStorage.setItem(DAILY_RECORDS_KEY, JSON.stringify(baseline))
    let view = render(<CharacterHero t={t} sidebar />)
    open(view, 'notes')
    for (const text of ['First idea\nSecond line', '<script>another thought</script>']) {
      fireEvent.change(view.getByRole('textbox', { name: en['daily.noteText'] }), { target: { value: text } })
      fireEvent.click(view.getByRole('button', { name: en['daily.saveNote'] }))
      expect(view.getByText(text, { exact: false, normalizer: value => value })).toBeTruthy()
      expect((view.getByRole('textbox', { name: en['daily.noteText'] }) as HTMLTextAreaElement).value).toBe('')
    }
    const assertHistory = () => {
      const history = view.getByRole('region', { name: en['daily.noteHistory'] })
      expect([...history.querySelectorAll('article p')].map(row => row.textContent)).toEqual([
        '<script>another thought</script>', 'First idea\nSecond line', 'Existing thought',
      ])
      expect(history.querySelectorAll('time')).toHaveLength(3)
      expect(history.querySelector('script')).toBeNull()
    }
    assertHistory()
    fireEvent.click(view.getByRole('button', { name: en['daily.close'] }))
    open(view, 'notes')
    assertHistory()
    view.unmount()
    view = render(<CharacterHero t={t} sidebar />)
    open(view, 'notes')
    assertHistory()
    expect(parseDailyRecords(localStorage.getItem(DAILY_RECORDS_KEY))?.tasks).toEqual(baseline.tasks)
    expect(parseDailyRecords(localStorage.getItem(DAILY_RECORDS_KEY))?.notes[0]).toEqual(baseline.notes[0])
  })

  it('keeps saved notes and an unsaved draft visible when storage rejects the next note', () => {
    const raw = JSON.stringify({ ...parseDailyRecords(null), notes: [{ id: 'kept', text: 'Already saved', created: 1700000000000 }] })
    localStorage.setItem(DAILY_RECORDS_KEY, raw)
    const view = render(<CharacterHero t={t} sidebar />)
    open(view, 'notes')
    const input = view.getByRole('textbox', { name: en['daily.noteText'] })
    fireEvent.change(input, { target: { value: 'Unsaved draft' } })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    fireEvent.click(view.getByRole('button', { name: en['daily.saveNote'] }))
    expect(view.getByText('Already saved')).toBeTruthy()
    expect(view.queryByText('Unsaved draft', { selector: 'article p' })).toBeNull()
    expect((input as HTMLTextAreaElement).value).toBe('Unsaved draft')
    expect(view.getByRole('status').textContent).toBe(en['daily.saveError'])
    expect(localStorage.getItem(DAILY_RECORDS_KEY)).toBe(raw)
  })

  it('adds and completes a task without requesting notification permission', () => {
    const view = render(<CharacterHero t={t} sidebar />)
    open(view, 'tasks')
    fireEvent.change(view.getByRole('textbox', { name: en['daily.newTask'] }), { target: { value: 'Write a paragraph' } })
    fireEvent.click(view.getByRole('button', { name: en['daily.add'] }))
    fireEvent.click(view.getByRole('button', { name: 'Write a paragraph' }))
    expect(parseDailyRecords(localStorage.getItem(DAILY_RECORDS_KEY))?.tasks[0]?.done).toBe(true)
    expect(view.getByText(en['daily.taskHelp'])).toBeTruthy()
  })

  it('retains input when storage refuses a save', () => {
    const view = render(<CharacterHero t={t} sidebar />)
    open(view, 'notes')
    const input = view.getByRole('textbox', { name: en['daily.noteText'] })
    fireEvent.change(input, { target: { value: 'Keep this draft' } })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    fireEvent.click(view.getByRole('button', { name: en['daily.saveNote'] }))
    expect(view.getByRole('status').textContent).toBe(en['daily.saveError'])
    expect((input as HTMLTextAreaElement).value).toBe('Keep this draft')
    expect(localStorage.getItem(DAILY_RECORDS_KEY)).toBeNull()
  })

  it('preserves malformed stored bytes and refuses an incompatible version', () => {
    const raw = '{"version":99,"notes":["keep"]}'
    localStorage.setItem(DAILY_RECORDS_KEY, raw)
    const view = render(<CharacterHero t={t} sidebar />)
    open(view, 'notes')
    expect(view.getByRole('alert').textContent).toBe(en['daily.invalidData'])
    expect((view.getByRole('button', { name: en['daily.saveNote'] }) as HTMLButtonElement).disabled).toBe(true)
    expect(localStorage.getItem(DAILY_RECORDS_KEY)).toBe(raw)
  })

  it('refuses stale-window writes without overwriting the newer document', () => {
    const view = render(<CharacterHero t={t} sidebar />)
    open(view, 'notes')
    fireEvent.change(view.getByRole('textbox', { name: en['daily.noteText'] }), { target: { value: 'Old window' } })
    const newer = JSON.stringify({ ...parseDailyRecords(null), revision: 2 })
    localStorage.setItem(DAILY_RECORDS_KEY, newer)
    fireEvent.click(view.getByRole('button', { name: en['daily.saveNote'] }))
    expect(view.getByRole('status').textContent).toBe(en['daily.conflict'])
    expect(localStorage.getItem(DAILY_RECORDS_KEY)).toBe(newer)
  })

  it('shows saved website icons and keeps links usable when an icon fails', () => {
    const raw = JSON.stringify({ ...parseDailyRecords(null), links: [
      { id: 'saved-link', name: 'Keduck', url: 'https://www.keduck.cn/workspace?from=saved' },
    ] })
    localStorage.setItem(DAILY_RECORDS_KEY, raw)
    const view = render(<CharacterHero t={t} sidebar />)
    open(view, 'links')
    const link = view.getByRole('link', { name: 'Keduck' })
    expect(link.getAttribute('href')).toBe('https://www.keduck.cn/workspace?from=saved')
    expect(link.getAttribute('target')).toBe('_blank')
    const icon = link.querySelector('img')!
    expect(icon.getAttribute('src')).toBe('https://www.keduck.cn/favicon.ico')
    expect(icon.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(link.textContent).toBe('KKeduck')
    fireEvent.load(icon)
    expect(link.textContent).toBe('Keduck')
    fireEvent.error(icon)
    expect(link.querySelector('img')).toBeNull()
    expect(link.textContent).toBe('KKeduck')
    expect(view.getByRole('link', { name: 'Keduck' })).toBe(link)
    expect(localStorage.getItem(DAILY_RECORDS_KEY)).toBe(raw)
  })

  it('accepts web links and rejects executable or local-file URLs', () => {
    expect(dailyURL('https://example.com')).toBe('https://example.com/')
    for (const value of ['javascript:alert(1)', 'file:///tmp/private', 'data:text/html,x', 'bad-url']) expect(dailyURL(value)).toBeUndefined()
    expect(parseDailyRecords('{broken')).toBeUndefined()
  })
})
