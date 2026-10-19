/** Sidebar navigation floats over the page and reveals from a quiet edge gutter. */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconNewChatOutlineMedium, IconNewChatOutlineRegular, IconPanelLeftOutlineRegular, isDarwinDesktop, ShortcutKeys, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SidebarPanelMetadata, SidebarRootComponentProps, SidebarRootInjected, SidebarSectionOwnerProps,
} from './contract/slots.ts'
import css from './SidebarRoot.module.css'
import { OkokLogo } from './OkokLogo.tsx'
import { FlowdeskWordmark } from './FlowdeskWordmark.tsx'

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000

type PanelRowProps =
  Pick<SidebarPanelMetadata, 'id' | 'label'>
  & Pick<SidebarSectionOwnerProps, 'wide'>
  & Pick<PropsRuntime<'sidebar'>, 'usePanelInfo'>
  & Pick<InjectFace<SidebarRootInjected>, 'selectPanel'>
  & PropsRenderSlots<'sidebar.panellist'>

/** Each panel row subscribes only to its own selection state. */
function PanelRow({ id, label, wide, usePanelInfo, selectPanel, renderSlot }: PanelRowProps) {
  const active = usePanelInfo(info => info.activePanelId === id)
  return (
    <Tooltip label={label} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.panelRow, active && css.panelActive)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={() => { selectPanel(id) }}
      >
        <span className={css.panelGlyph} aria-hidden="true">
          {renderSlot('sidebar.panellist', { size: wide ? 16 : 18, active }, { only: id })}
        </span>
        {wide && (
          <span className={clsx(css.panelTitle, css.wide)}>
            {label}
          </span>
        )}
      </button>
    </Tooltip>
  )
}

/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export function SidebarRoot({
  collapsed,
  width,
  startSession,
  toggleSidebar,
  selectPanel,
  usePanels,
  useShortcuts,
  usePanelInfo,
  t,
  renderSlot,
}: SidebarRootComponentProps) {
  const panels = usePanels(snapshot => snapshot)
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'sidebar.left.toggle'))
  const newShortcut = useShortcuts(rows => rows.find(row => row.id === 'session.new'))
  const keyboardFocus = useRef(false)
  const toggleLabel = collapsed ? t('toggle.open') : t('toggle.collapse')
  const windowsTitlebar = document.documentElement.hasAttribute('data-windows-titlebar')
  const wide = windowsTitlebar ? !collapsed : true
  // The Windows caption menus occupy the strip to the right of these controls
  // (that is what --dsh-windows-menu-start reserves), so a right-side bubble
  // lands under their text. Below the caption is the only clear side.
  const captionTooltipSide = windowsTitlebar ? 'bottom' : 'right'
  // Freeze the content at its expanded width while it fades out (collapsed
  // && wide): the sliding column then clips it instead of reflowing it. The
  // rail layout (.collapsed styles) only applies once the fade settles.
  const lastWideWidth = useRef(width)
  if (!collapsed) lastWideWidth.current = width

  // Rail-in only crossfades a live collapse: a refresh straight into the
  // collapsed state renders the rail statically (no delay-hidden icons).
  const everWide = useRef(!collapsed)
  if (!collapsed) everWide.current = true

  // Scrollbars in the column follow the pointer (.quietBars rebinds them
  // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
  // leaves. A pointer that returns within that window cancels the pending
  // hide rather than restarting from a hidden bar.
  const column = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const edge = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!collapsed && keyboardFocus.current && document.activeElement === edge.current) content.current?.querySelector<HTMLButtonElement>('button[aria-expanded]')?.focus()
  }, [collapsed])
  const collapsedNow = useRef(collapsed)
  collapsedNow.current = collapsed
  const pointerInColumn = useRef(false)
  const pointerHeld = useRef(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const cancelAutoClose = () => { window.clearTimeout(closeTimer.current); closeTimer.current = undefined }
  const scheduleAutoClose = () => {
    cancelAutoClose()
    closeTimer.current = window.setTimeout(() => {
      const hasOverlay = Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"], dialog[open]'))
        .some(element => element.getClientRects().length > 0)
      if (!collapsedNow.current && !pointerInColumn.current && !pointerHeld.current
        && !(keyboardFocus.current && column.current?.contains(document.activeElement)) && !hasOverlay
        && document.querySelector('[data-dragging]') === null) toggleSidebar()
    }, 120)
  }
  useEffect(() => {
    const focus = () => {
      if (column.current?.contains(document.activeElement)) cancelAutoClose()
      else scheduleAutoClose()
    }
    const pointerUp = () => { pointerHeld.current = false; scheduleAutoClose() }
    const pointerDown = () => { keyboardFocus.current = false; scheduleAutoClose() }
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Tab') keyboardFocus.current = true }
    const pointerMove = (event: PointerEvent) => {
      const box = column.current?.getBoundingClientRect()
      if (box === undefined) return
      const inside = event.clientX >= box.left && event.clientX < box.right && event.clientY >= box.top && event.clientY < box.bottom
      if (inside === pointerInColumn.current) return
      pointerInColumn.current = inside
      if (inside) cancelAutoClose()
      else scheduleAutoClose()
    }
    document.addEventListener('keydown', keyDown)
    document.addEventListener('pointermove', pointerMove)
    document.addEventListener('focusin', focus)
    document.addEventListener('pointerup', pointerUp)
    document.addEventListener('pointerdown', pointerDown)
    return () => {
      cancelAutoClose()
      document.removeEventListener('keydown', keyDown)
      document.removeEventListener('pointermove', pointerMove)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('pointerup', pointerUp)
      document.removeEventListener('pointerdown', pointerDown)
    }
  }, [toggleSidebar])

  const [pointerInside, setPointerInside] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)
  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined
      setPointerInside(false)
    }, SCROLLBAR_LINGER_MS)
  }
  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = undefined
  }
  // Leaving is decided by the column's BOX, not by DOM containment, and only
  // while the bars are drawn. ui-settings renders its full-viewport panel as a
  // fixed-position DESCENDANT of this column, so a pointer moved onto that
  // panel — or onto the conversation once it closes — fires no `pointerleave`
  // here, and the bars would stay drawn over a column nobody is pointing at.
  // The element's own leave stays as the one signal geometry cannot give: a
  // pointer that leaves the window emits no further moves.
  useEffect(() => {
    if (!pointerInside) return
    const onMove = (event: PointerEvent): void => {
      const rect = column.current?.getBoundingClientRect()
      /* v8 ignore next -- the listener only exists while the column is mounted and revealed. */
      if (rect === undefined) return
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom
      if (inside) cancelLinger()
      else armLinger()
    }
    document.addEventListener('pointermove', onMove)
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelLinger()
    }
  }, [pointerInside])


  const darwinDesktop = isDarwinDesktop()
  // Rail resting state is the whale mark; hovering swaps in the panel icon
  // (the expand affordance, figma sidebar-hover flow). Expanded it is a plain
  // panel icon.
  const toggle = (
    <Tooltip label={toggleLabel} shortcutKeys={shortcut?.keys} delayMs={500} side={captionTooltipSide}>
      <button
        type="button"
        className={clsx(css.iconButton, css.toggle)}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        aria-keyshortcuts={shortcut?.aria}
        onClick={() => { toggleSidebar() }}
      >
        {!wide && !windowsTitlebar && (
          <span className={css.railMark} aria-hidden="true">
            {renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: <OkokLogo size={24} className={css.okokLogo} /> })}
          </span>
        )}
        {/* Rail icons render at 18 (figma rail spec); expanded keeps the glyph-native sizes. */}
        <IconPanelLeftOutlineRegular className={css.panelIcon} size={wide || windowsTitlebar ? 16 : 18} />
        {!wide && renderSlot('sidebar.toggle.badge', {})}
      </button>
    </Tooltip>
  )

  return (
    <div
      ref={column}
      data-testid="auto-sidebar"
      data-sidebar-expanded={!collapsed}
      className={windowsTitlebar ? css.windowsZone : css.revealZone}
      style={!windowsTitlebar ? { width: collapsed ? 24 : width } : undefined}
      onPointerEnter={() => {
        cancelLinger()
        cancelAutoClose()
        pointerInColumn.current = true
        if (collapsedNow.current) { collapsedNow.current = false; toggleSidebar() }
        setPointerInside(true)
      }}
      onPointerLeave={() => { pointerInColumn.current = false; armLinger(); scheduleAutoClose() }}
      onPointerDownCapture={() => { pointerHeld.current = true; cancelAutoClose() }}
      onFocusCapture={() => { cancelAutoClose(); if (collapsedNow.current) { collapsedNow.current = false; toggleSidebar() } }}
      onBlurCapture={scheduleAutoClose}
    >
      {!windowsTitlebar && <Tooltip label={t('toggle.open')} shortcutKeys={shortcut?.keys} portal side="right" delayMs={500}>
        <button ref={edge} type="button" className={css.edgeTrigger} aria-label={t('toggle.open')} aria-hidden={!collapsed || undefined}
          aria-expanded={!collapsed} aria-keyshortcuts={shortcut?.aria} tabIndex={collapsed ? 0 : -1}
          onClick={() => { if (collapsedNow.current) toggleSidebar() }} />
      </Tooltip>}
      <div ref={content} className={clsx(css.root, windowsTitlebar && !wide && css.collapsed,
        windowsTitlebar && !wide && everWide.current && css.railIn,
        windowsTitlebar && collapsed && wide && css.fading, !pointerInside && css.quietBars,
        !windowsTitlebar && css.floating)}
      aria-hidden={!windowsTitlebar && collapsed || undefined}
      {...(!windowsTitlebar && collapsed ? { inert: '' } : {})}
      style={wide ? { width: windowsTitlebar && collapsed ? lastWideWidth.current : width } : undefined}>
        {/* macOS hiddenInset titlebar: the strip shares the row with the
          traffic lights and keeps the toggle at the sidebar's top-right. */}
        {darwinDesktop && <div className={css.topStrip} data-window-drag>{toggle}</div>}
        <div className={css.logoRow} data-window-drag>
          {/* Expanded, the brand doubles as a New Session shortcut — except on
            macOS, where it stays part of the logo row's window-drag surface
            (a button would subtract itself through the global no-drag rule);
            the collapsed rail's logo is the expand toggle below instead. */}
          {wide && (() => {
            const identity = (
              <span className={css.brandIdentity} aria-hidden="true">
                <span className={css.brandMark}>
                  {renderSlot('sidebar.brand.mark', { size: 24 }, { fallback: <FlowdeskWordmark className={css.flowdeskWordmark} /> })}
                </span>
                <span className={css.brandName}>
                  {renderSlot('sidebar.brand.name', {}, {
                    fallback: null,
                  })}
                </span>
              </span>
            )
            return darwinDesktop
              ? <span className={clsx(css.brand, css.wide)}>{identity}</span>
              : (
                <button
                  type="button"
                  className={clsx(css.brand, css.wide)}
                  aria-label={t('session.new.label')}
                  aria-keyshortcuts={newShortcut?.aria}
                  onClick={() => { startSession() }}
                >
                  {identity}
                </button>
              )
          })()}
          {!darwinDesktop && toggle}
        </div>

        {/* The label fades before the hover/focus shortcut, including on translucent backgrounds. */}
        <Tooltip label={t('session.new.label')} shortcutKeys={newShortcut?.keys} delayMs={500} side={captionTooltipSide} disabled={wide}>
          <button
            type="button"
            className={css.newSession}
            aria-label={t('session.new.label')}
            aria-keyshortcuts={newShortcut?.aria}
            onClick={() => { startSession() }}
          >
            <span className={css.newSessionLabelMask}><span className={css.newSessionContent}>
              {wide
                ? <IconNewChatOutlineMedium size={14} />
                : <IconNewChatOutlineRegular size={windowsTitlebar ? 16 : 18} />}
              {wide && <span className={clsx(css.newSessionLabel, css.wide)}>{t('session.new')}</span>}
            </span></span>
            {wide && newShortcut !== undefined && newShortcut.keys.length > 0 && <span className={css.newSessionShortcut} aria-hidden="true">
              <ShortcutKeys keys={newShortcut.keys} />
            </span>}
          </button>
        </Tooltip>

        {panels.length > 0 && (
          <nav className={css.panelList} aria-label={t('panels.label')}>
            {panels.map(({ id, label }) => (
              <PanelRow
                key={id}
                id={id}
                label={label}
                wide={wide}
                usePanelInfo={usePanelInfo}
                selectPanel={selectPanel}
                renderSlot={renderSlot}
              />
            ))}
          </nav>
        )}

        {/* The browsing region fills the column between the controls and the
          foot in both states; its rail icon column rides the same slot. */}
        <div className={css.regionArea}>
          {renderSlot('sidebar.workspaces', {
            wide,
            expandSidebar: () => { if (collapsed) toggleSidebar() },
          })}
        </div>

        {/* Footer actions stack above Settings in both sidebar widths. */}
        <div className={css.footArea}>
          <div className={css.footerActions}>
            {renderSlot('sidebar.footer.action', { wide })}
          </div>
          <div className={css.settingsArea}>
            {renderSlot('sidebar.settings', { wide })}
          </div>
        </div>
      </div>
    </div>
  )
}
