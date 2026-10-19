// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { installPointerCompanion } from '../src/client/pointer.ts'

class Media extends EventTarget {
  constructor(public matches: boolean) { super() }
  set(value: boolean): void { this.matches = value; this.dispatchEvent(new Event('change')) }
}

let fine: Media
let reduced: Media
let frames: Map<number, FrameRequestCallback>
let frameId: number

beforeEach(() => {
  fine = new Media(true)
  reduced = new Media(false)
  frames = new Map()
  frameId = 0
  vi.stubGlobal('matchMedia', (query: string) => query === '(pointer: fine)' ? fine : reduced)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.replaceChildren(); document.body.removeAttribute('data-dsh-pointer-enabled'); document.body.style.removeProperty('cursor') })

function pointer(type: string, target: EventTarget = document.body, fields: Record<string, unknown> = {}): Event {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerType: 'mouse', clientX: 100, clientY: 80, button: 0, relatedTarget: null, ...fields,
  })
  target.dispatchEvent(event)
  return event
}
function step(time: number): void {
  for (const [id, callback] of [...frames]) { frames.delete(id); callback(time) }
}
async function mount() {
  const ctx = new Context()
  const fiber = ctx.plugin({ apply: installPointerCompanion })
  await fiber.await()
  onTestFinished(async () => { await fiber.dispose() })
  const root = document.querySelector<HTMLElement>('[data-dsh-pointer-trail]')!
  return { root, fiber }
}

describe('workbench pointer companion', () => {
  it('follows mouse movement smoothly, settles and stops requesting idle frames', async () => {
    const { root } = await mount()
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(document.body.hasAttribute('data-dsh-pointer-enabled')).toBe(true)
    pointer('pointermove')
    step(16)
    expect(root.style.transform).toBe('translate3d(100px, 80px, 0)')
    expect(frames.size).toBe(0)
    pointer('pointermove', document.body, { clientX: 220, clientY: 160 })
    step(32)
    const x = Number(root.style.transform.match(/translate3d\(([\d.]+)px/)?.[1])
    expect(x).toBeGreaterThan(100)
    expect(x).toBeLessThan(220)
    const offset = Number(root.querySelector<HTMLElement>('[data-dsh-pointer-dot]')!.style.transform.match(/translate3d\(([\d.]+)px/)?.[1])
    expect(x + offset).toBeCloseTo(220)
    for (let time = 48; frames.size && time < 2000; time += 16) step(time)
    expect(root.style.transform).toBe('translate3d(220px, 160px, 0)')
    expect(frames.size).toBe(0)
  })

  it('keeps the circular pointer visible while the native cursor is hidden', async () => {
    const { root } = await mount()
    document.body.style.cursor = 'none'
    pointer('pointermove')
    expect(root.hasAttribute('data-visible')).toBe(true)
  })

  it('reflects button hover and click feedback without cancelling the original input', async () => {
    const { root } = await mount()
    const button = document.createElement('button')
    const span = document.createElement('span')
    button.append(span); document.body.append(button)
    expect(pointer('pointermove', span).defaultPrevented).toBe(false)
    expect(root.hasAttribute('data-interactive')).toBe(true)
    expect(pointer('pointerdown', span).defaultPrevented).toBe(false)
    expect(root.hasAttribute('data-pressed')).toBe(true)
    expect(root.hasAttribute('data-pulse')).toBe(true)
    pointer('pointerup', span)
    expect(root.hasAttribute('data-pressed')).toBe(false)
    root.querySelector('[data-dsh-pointer-ripple]')!.dispatchEvent(new Event('animationend'))
    expect(root.hasAttribute('data-pulse')).toBe(false)
    pointer('pointermove')
    expect(root.hasAttribute('data-interactive')).toBe(false)
  })

  it.each(['input', 'textarea', 'select', 'contenteditable', 'resize'])('leaves %s interaction free of the follower', async (kind) => {
    const { root } = await mount()
    const target = document.createElement(['input', 'textarea', 'select'].includes(kind) ? kind : 'div')
    if (kind === 'contenteditable') target.setAttribute('contenteditable', 'true')
    if (kind === 'resize') target.style.cursor = 'col-resize'
    document.body.append(target)
    pointer('pointermove')
    expect(root.hasAttribute('data-visible')).toBe(true)
    pointer('pointermove', target)
    expect(root.hasAttribute('data-visible')).toBe(false)
    expect(frames.size).toBe(0)
  })

  it('hides for touch, keyboard, focus loss and leaving the application window', async () => {
    const { root } = await mount()
    for (const hide of [
      () => pointer('pointermove', document.body, { pointerType: 'touch' }),
      () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })),
      () => window.dispatchEvent(new Event('blur')),
      () => pointer('pointerout'),
      () => pointer('pointercancel'),
    ]) {
      pointer('pointermove')
      hide()
      expect(root.hasAttribute('data-visible')).toBe(false)
      expect(frames.size).toBe(0)
    }
    pointer('pointermove')
    pointer('pointerout', document.body, { relatedTarget: document.body })
    expect(root.hasAttribute('data-visible')).toBe(true)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(root.hasAttribute('data-visible')).toBe(false)
  })

  it('honors reduced motion and fine-pointer changes while running', async () => {
    fine.matches = false
    const { root } = await mount()
    pointer('pointermove')
    expect(root.hasAttribute('data-visible')).toBe(false)
    expect(document.body.hasAttribute('data-dsh-pointer-enabled')).toBe(false)
    fine.set(true)
    pointer('pointermove')
    expect(root.hasAttribute('data-visible')).toBe(true)
    reduced.set(true)
    expect(root.hasAttribute('data-visible')).toBe(false)
    expect(document.body.hasAttribute('data-dsh-pointer-enabled')).toBe(false)
    reduced.set(false)
    expect(document.body.hasAttribute('data-dsh-pointer-enabled')).toBe(true)
  })

  it('removes its decoration, listeners and pending frames on plugin disposal', async () => {
    const { fiber } = await mount()
    pointer('pointermove')
    expect(frames.size).toBe(1)
    await fiber.dispose()
    expect(document.querySelector('[data-dsh-pointer-trail]')).toBeNull()
    expect(frames.size).toBe(0)
    fine.set(false); fine.set(true)
    pointer('pointermove')
    expect(frames.size).toBe(0)
    expect(document.body.hasAttribute('data-dsh-pointer-enabled')).toBe(false)
  })

  it('does not install in a document without media-query support', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const ctx = new Context()
    installPointerCompanion(ctx)
    expect(document.querySelector('[data-dsh-pointer-trail]')).toBeNull()
  })
})
