import { useEffect, useId, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import {
  IconChecklistOutlineRegular, IconGlobeOutlineRegular, IconEditOutlineRegular,
  IconNewChatOutlineRegular, IconSparkleRegular, Modal, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { HeroShellProps } from './EmptyHero.tsx'
import { CHARACTER_ART } from './character-art.ts'
import { FLOWDESK_WORDMARK } from './flowdesk-wordmark.ts'
import { DAILY_RECORDS_KEY, dailyURL, parseDailyRecords, type DailyRecords, type DailyLink, type DailyNote } from './daily-records.ts'
import css from './HeroShell.module.css'
import { DailyTaskRow } from './DailyTaskRow.tsx'

type Panel = 'tasks' | 'links' | 'notes' | 'memory'
const panels = ['tasks', 'links', 'notes', 'memory'] as const
const labels = { tasks: 'daily.tasks', links: 'daily.links', notes: 'daily.notes', memory: 'daily.memory' } as const

function readRecords() {
  try {
    const raw = localStorage.getItem(DAILY_RECORDS_KEY)
    return { raw, data: parseDailyRecords(raw), error: false }
  } catch (_error) {
    // Storage denial is visible and never falls back to a successful save.
    return { raw: null, data: undefined, error: true }
  }
}

/** Approved character artwork with bounded, damped pupils and frame cleanup. */
function CharacterArtwork({ paused }: { paused: boolean }) {
  const id = useId().replace(/:/g, '')
  const root = useRef<HTMLDivElement>(null)
  const artwork = useMemo(() => {
    const prefix = (source: string) => source
      .replace(/id="([^"]+)"/g, `id="${id}-$1"`)
      .replace(/href="#([^"]+)"/g, `href="#${id}-$1"`)
      .replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`)
    return { art: prefix(CHARACTER_ART), wordmark: prefix(FLOWDESK_WORDMARK) }
  }, [id])

  useEffect(() => {
    const element = root.current
    const svg = element?.querySelector('svg')
    const left = element?.querySelector(`[id="${id}-pupil-left"]`)
    const right = element?.querySelector(`[id="${id}-pupil-right"]`)
    const eyes = element?.querySelector<SVGGElement>(`[id="${id}-eye-layers"]`)
    if (element === null || svg === null || svg === undefined || left === null || left === undefined
      || right === null || right === undefined || eyes === null || eyes === undefined) return
    const current: [number, number, number, number] = [0, 0, 0, 0]
    const target: [number, number, number, number] = [0, 0, 0, 0]
    let frame: number | undefined
    let active = false
    const draw = () => {
      left.setAttribute('transform', `translate(${current[0]} ${current[1]})`)
      right.setAttribute('transform', `translate(${current[2]} ${current[3]})`)
      eyes.style.opacity = !active && current.every(value => Math.abs(value) < .05) ? '0' : '1'
    }
    const tick = () => {
      let unsettled = false
      for (const i of [0, 1, 2, 3] as const) {
        const delta = target[i] - current[i]
        current[i] = Math.abs(delta) < .02 ? target[i] : current[i] + delta * .16
        if (Math.abs(delta) >= .02) unsettled = true
      }
      draw()
      frame = unsettled ? requestAnimationFrame(tick) : undefined
    }
    const animate = () => { if (frame === undefined) frame = requestAnimationFrame(tick) }
    const reset = () => { active = false; target.fill(0); animate() }
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
    const move = (event: PointerEvent) => {
      if (paused) return
      // SVG's inverse screen matrix keeps the bitmap and eye coordinates in
      // one plane through window resize, page zoom and letterboxing.
      const matrix = svg.getScreenCTM()?.inverse()
      if (matrix === undefined) return
      const x = matrix.a * event.clientX + matrix.c * event.clientY + matrix.e
      const y = matrix.b * event.clientX + matrix.d * event.clientY + matrix.f
      target[0] = 25 + clamp((x - 866) / 18, -25, 25)
      target[1] = clamp((y - 499) / 23, -17, 17)
      target[2] = 27 + clamp((x - 1027) / 18, -25, 25)
      target[3] = 1 + clamp((y - 495) / 23, -17, 17)
      active = true
      animate()
    }
    draw()
    window.addEventListener('pointermove', move)
    document.addEventListener('mouseleave', reset)
    window.addEventListener('pointercancel', reset)
    window.addEventListener('blur', reset)
    window.addEventListener('resize', reset)
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      document.removeEventListener('mouseleave', reset)
      window.removeEventListener('pointercancel', reset)
      window.removeEventListener('blur', reset)
      window.removeEventListener('resize', reset)
    }
  }, [id, paused])

  return <>
    <div ref={root} className={css.artwork} aria-hidden="true" dangerouslySetInnerHTML={{ __html: artwork.art }} />
    <div className={css.wordmark} aria-hidden="true" dangerouslySetInnerHTML={{ __html: artwork.wordmark }} />
  </>
}

/** Website shortcut with an origin-owned favicon and an offline initial fallback. */
function BookmarkTile({ item }: { item: DailyLink }) {
  const [iconFailed, setIconFailed] = useState(false)
  const [iconLoaded, setIconLoaded] = useState(false)
  const website = new URL(item.url)
  return <Tooltip label={website.hostname} portal>
    <a className={css.bookmark} href={item.url} target="_blank" rel="noopener noreferrer">
      <span className={css.bookmarkIcon} aria-hidden="true">
        {!iconLoaded && <span>{Array.from(item.name.trim())[0]?.toLocaleUpperCase()}</span>}
        {!iconFailed && <img src={new URL('/favicon.ico', website.origin).href} alt="" loading="lazy"
          decoding="async" referrerPolicy="no-referrer" data-loaded={iconLoaded || undefined}
          onLoad={() => { setIconLoaded(true) }}
          onError={() => { setIconFailed(true); setIconLoaded(false) }} />}
      </span>
      <span className={css.bookmarkName}>{item.name}</span>
    </a>
  </Tooltip>
}

/** Saved notes share their original text and timestamps in both personal views. */
function SavedNotes({ notes }: { notes: DailyNote[] }) {
  return <div className={css.noteList}>
    {notes.slice().reverse().map(item => <article className={css.memoryRow} key={item.id} data-note-id={item.id}>
      <time dateTime={new Date(item.created).toISOString()}>{new Date(item.created).toLocaleString()}</time>
      <p>{item.text}</p>
    </article>)}
  </div>
}

/** Personal organizer beside the unchanged Harness composer and workspace picker. */
export function CharacterHero({ t, sidebar = false, wide = true }: Pick<HeroShellProps, 't'> & { sidebar?: boolean; wide?: boolean }) {
  const [panel, setPanel] = useState<Panel>()
  const [stored, setStored] = useState(readRecords)
  const [status, setStatus] = useState('')
  const [task, setTask] = useState('')
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [url, setURL] = useState('')
  const [note, setNote] = useState('')
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const change = (event: MediaQueryListEvent) => { setReducedMotion(event.matches) }
    reduced?.addEventListener('change', change)
    return () => { reduced?.removeEventListener('change', change) }
  }, [])

  const data = stored.data
  const save = (next: DailyRecords): boolean => {
    if (data === undefined) return false
    try {
      if (localStorage.getItem(DAILY_RECORDS_KEY) !== stored.raw) {
        setStatus(t('daily.conflict'))
        return false
      }
      const raw = JSON.stringify({ ...next, revision: data.revision + 1 })
      localStorage.setItem(DAILY_RECORDS_KEY, raw)
      setStored({ raw, data: { ...next, revision: data.revision + 1 }, error: false })
      setStatus(t('daily.saved'))
      return true
    } catch (_error) {
      // Keep the form and current records intact when persistence fails.
      setStatus(t('daily.saveError'))
      return false
    }
  }
  const open = (next: Panel) => {
    setStored(readRecords())
    setStatus('')
    setPanel(next)
  }
  const close = () => { setPanel(undefined) }

  return (
    <section className={sidebar ? css.dailySidebar : css.root} aria-label={t(sidebar ? 'daily.navigation' : 'daily.workbench')}>
      {sidebar ? <nav aria-label={t('daily.navigation')} className={css.sidebarNavigation}>
        {panels.map((key) => {
          const Icon = key === 'tasks' ? IconChecklistOutlineRegular : key === 'links' ? IconGlobeOutlineRegular : key === 'notes' ? IconEditOutlineRegular : IconNewChatOutlineRegular
          return <Tooltip key={key} label={t(labels[key])} disabled={wide} portal side="right">
            <button type="button" className={css.sidebarAction} aria-label={t(labels[key])} onClick={() => { open(key) }}>
              <Icon size={22} />{wide && <span>{t(labels[key])}</span>}
            </button>
          </Tooltip>
        })}
      </nav> : <>
        <CharacterArtwork paused={reducedMotion} />
        <div className={css.leftCopy}>
          <span className={css.eyebrow}><IconSparkleRegular size={16} />{t('daily.eyebrow')}</span>
          <h1 data-testid="hero-headline">{t('daily.headlineFirst')}<br />{t('daily.headlineSecond')}</h1>
          <p>{t('daily.intro')}</p>

        </div>
        <div className={css.rightCopy}>
          <span className={css.eyebrow}><svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.2"><rect x="1.4" y="2.6" width="11.2" height="10" rx="1.6" /><path d="M1.4 5.6H12.6M4.4 1.4V3.6M9.6 1.4V3.6" /></svg>{t('daily.noteEyebrow')}</span>
          <h2>{t('daily.noteFirst')}<br />{t('daily.noteSecond')}</h2>
          <p>{t('daily.caption')}</p>

        </div>
      </>}
      <Modal open={panel !== undefined} onClose={close} title={t(labels[panel ?? 'tasks'])} closeLabel={t('daily.close')}
        className={clsx(css.dialog)} contentClassName={clsx(css.dialogContent)}>
        <p className={css.subcopy}>{t(panel === 'tasks' ? 'daily.taskHelp' : panel === 'links' ? 'daily.linkHelp' : panel === 'memory' ? 'daily.memoryHelp' : 'daily.noteHelp')}</p>
        {data === undefined && <p role="alert" className={css.error}>{t(stored.error ? 'daily.storageError' : 'daily.invalidData')}</p>}
        {panel === 'tasks' && <>
          {!data?.tasks.length && <p className={css.empty}>{t('daily.emptyTasks')}</p>}
          {data?.tasks.map(item => <DailyTaskRow key={item.id} item={item} t={t}
            onUpdate={next => save({ ...data, tasks: data.tasks.map(row => row.id === item.id ? next : row) })}
            onDelete={() => {
              if (save({ ...data, tasks: data.tasks.filter(row => row.id !== item.id) })) setStatus(t('daily.taskDeleted'))
            }} />)}
          <form className={css.addRow} onSubmit={(event) => {
            event.preventDefault()
            if (data !== undefined && task.trim() !== '' && save({ ...data, tasks: [...data.tasks, { id: randomUUID(), title: task.trim(), time, done: false }] })) {
              setTask(''); setTime('')
            }
          }}>
            <input data-modal-autofocus aria-label={t('daily.newTask')} placeholder={t('daily.newTask')} maxLength={80} required value={task} onChange={(event) => { setTask(event.target.value) }} />
            <input type="time" aria-label={t('daily.time')} value={time} onChange={(event) => { setTime(event.target.value) }} />
            <button className={css.primary} disabled={data === undefined} type="submit">{t('daily.add')}</button>
          </form>
        </>}
        {panel === 'links' && <>
          {!data?.links.length && <p className={css.empty}>{t('daily.emptyLinks')}</p>}
          {!!data?.links.length && <div className={css.bookmarkGrid}>
            {data.links.map(item => <BookmarkTile key={item.id} item={item} />)}
          </div>}
          <form className={css.linkForm} onSubmit={(event) => {
            event.preventDefault()
            const safe = dailyURL(url.trim())
            if (safe === undefined) { setStatus(t('daily.invalidURL')); return }
            if (data !== undefined && name.trim() !== '' && save({ ...data, links: [...data.links, { id: randomUUID(), name: name.trim(), url: safe }] })) {
              setName(''); setURL('')
            }
          }}>
            <input data-modal-autofocus aria-label={t('daily.linkName')} placeholder={t('daily.linkName')} value={name} required maxLength={40} onChange={(event) => { setName(event.target.value) }} />
            <input aria-label={t('daily.linkURL')} placeholder={t('daily.linkURL')} type="url" required value={url} onChange={(event) => { setURL(event.target.value) }} />
            <button className={css.primary} type="submit" disabled={data === undefined}>{t('daily.addLink')}</button>
          </form>
        </>}
        {panel === 'notes' && <>
          <form className={css.noteForm} onSubmit={(event) => {
            event.preventDefault()
            if (data !== undefined && note.trim() !== '' && save({ ...data, notes: [...data.notes, { id: randomUUID(), text: note.trim(), created: Date.now() }] })) setNote('')
          }}>
            <textarea data-modal-autofocus aria-label={t('daily.noteText')} placeholder={t('daily.notePlaceholder')} maxLength={3000} required value={note} onChange={(event) => { setNote(event.target.value) }} />
            <button className={css.primary} type="submit" disabled={data === undefined}>{t('daily.saveNote')}</button>
          </form>
          {data !== undefined && <section className={css.noteHistory} aria-label={t('daily.noteHistory')}>
            <h3>{t('daily.noteHistory')}</h3>
            {data.notes.length ? <SavedNotes notes={data.notes} /> : <p className={css.empty}>{t('daily.emptyNotes')}</p>}
          </section>}
        </>}
        {panel === 'memory' && <>
          {!data?.notes.length && <p className={css.empty}>{t('daily.emptyNotes')}</p>}
          {data !== undefined && <SavedNotes notes={data.notes} />}
        </>}
        <p className={css.status} role="status">{status}</p>
        <p className={css.disclaimer}>{t('daily.persistence')}</p>
      </Modal>
    </section>
  )
}

/** Personal tools remain available through the sidebar across main-panel navigation. */
export function DailySidebarActions({ t, wide }: PropsRuntime<'sidebar.footer.action'> & PropsLocale<'conversation'>) {
  return <CharacterHero t={t} sidebar wide={wide} />
}
