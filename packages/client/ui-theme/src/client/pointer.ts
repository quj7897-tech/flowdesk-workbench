import type { Context } from '@deepseek-ai/cordis'

const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
const INTERACTIVE = 'button:not(:disabled), a[href], summary, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="checkbox"], [role="switch"]'

/**
 * Install the workbench's decorative mouse follower for the plugin lifetime.
 * Touch, editing, reduced motion, window exits and disposal retain native interaction.
 * @param ctx - Owning theme plugin context.
 */
export function installPointerCompanion(ctx: Context): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  ctx.effect(() => {
    const fine = window.matchMedia('(pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const root = document.createElement('div')
    root.dataset.dshPointerTrail = ''
    root.setAttribute('aria-hidden', 'true')
    const halo = document.createElement('span')
    halo.dataset.dshPointerHalo = ''
    const ripple = document.createElement('span')
    ripple.dataset.dshPointerRipple = ''
    const dot = document.createElement('span')
    dot.dataset.dshPointerDot = ''
    root.append(halo, ripple, dot)
    document.body.append(root)

    let enabled = false
    let frame: number | undefined
    let previousTime: number | undefined
    let x = 0
    let y = 0
    let targetX = 0
    let targetY = 0

    const hide = (): void => {
      delete root.dataset.visible
      delete root.dataset.pressed
      delete root.dataset.pulse
      previousTime = undefined
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      frame = undefined
    }
    const syncPreference = (): void => {
      enabled = fine.matches && !reduced.matches
      document.body.toggleAttribute('data-dsh-pointer-enabled', enabled)
      if (!enabled) hide()
    }
    const draw = (time: number): void => {
      frame = undefined
      const elapsed = previousTime === undefined ? 16 : Math.min(time - previousTime, 64)
      previousTime = time
      const ease = 1 - Math.exp(-elapsed / 48)
      x += (targetX - x) * ease
      y += (targetY - y) * ease
      const settled = Math.hypot(targetX - x, targetY - y) < 0.15
      if (settled) { x = targetX; y = targetY }
      root.style.transform = `translate3d(${x}px, ${y}px, 0)`
      dot.style.transform = `translate3d(${targetX - x}px, ${targetY - y}px, 0)`
      if (!settled) frame = window.requestAnimationFrame(draw)
      else previousTime = undefined
    }
    const onMove = (event: PointerEvent): void => {
      if (!enabled || event.pointerType !== 'mouse') { hide(); return }
      const element = event.target instanceof Element ? event.target : undefined
      const cursor = element === undefined ? '' : window.getComputedStyle(element).cursor
      if (element?.closest(EDITABLE) || /text|resize|grab/.test(cursor)) { hide(); return }
      targetX = event.clientX
      targetY = event.clientY
      if (root.dataset.visible === undefined) { x = targetX; y = targetY }
      root.dataset.visible = ''
      if (element?.closest(INTERACTIVE)) root.dataset.interactive = ''
      else delete root.dataset.interactive
      if (frame === undefined) frame = window.requestAnimationFrame(draw)
    }
    const onDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || root.dataset.visible === undefined) return
      root.dataset.pressed = ''
      delete root.dataset.pulse
      // Restart the single decorative ripple without retaining previous animations.
      void ripple.offsetWidth
      root.dataset.pulse = ''
    }
    const onUp = (): void => { delete root.dataset.pressed }
    const onExit = (event: PointerEvent): void => { if (event.relatedTarget === null) hide() }
    const onVisibility = (): void => { if (document.hidden) hide() }
    const onAnimationEnd = (): void => { delete root.dataset.pulse }
    fine.addEventListener('change', syncPreference)
    reduced.addEventListener('change', syncPreference)
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerdown', onDown, { passive: true })
    document.addEventListener('pointerup', onUp, { passive: true })
    document.addEventListener('pointercancel', hide)
    document.addEventListener('pointerout', onExit)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('keydown', hide)
    window.addEventListener('blur', hide)
    ripple.addEventListener('animationend', onAnimationEnd)
    syncPreference()
    return () => {
      hide()
      fine.removeEventListener('change', syncPreference)
      reduced.removeEventListener('change', syncPreference)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', hide)
      document.removeEventListener('pointerout', onExit)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('keydown', hide)
      window.removeEventListener('blur', hide)
      ripple.removeEventListener('animationend', onAnimationEnd)
      root.remove()
      document.body.removeAttribute('data-dsh-pointer-enabled')
    }
  }, 'ui-theme: workbench pointer companion')
}
