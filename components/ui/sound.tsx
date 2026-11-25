'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useSyncExternalStore } from 'react'

import {
  dropSound,
  isSoundName,
  playSound,
  preloadSounds,
  runSound,
  saveSound,
  setSoundOutput,
  type SoundName,
} from '@/lib/sound/player'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'kobra-sound-muted'
const VOLUME_KEY = 'kobra-sound-volume'
const DEFAULT_VOLUME = 0.5

type Cue = { sound: SoundName; detune?: number; velocity?: number }

const play = (cue: Cue) => playSound(cue.sound, cue)

const TOGGLE_SLOTS = new Set([
  'switch',
  'checkbox',
  'toggle',
  'toggle-group-item',
  'radio-group-item',
  'context-menu-checkbox-item',
  'context-menu-radio-item',
  'dropdown-menu-checkbox-item',
  'dropdown-menu-radio-item',
  'menubar-checkbox-item',
  'menubar-radio-item',
])

const INTERACTIVE =
  '[data-slot], button, a[href], [role="button"], [role="option"], [role="menuitem"], input[type="checkbox"], input[type="radio"]'

const TEXT_ENTRY =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable]'

function isOn(el: Element) {

  if (el instanceof HTMLInputElement) return el.checked
  return (
    el.getAttribute('aria-checked') === 'true' ||
    el.getAttribute('aria-pressed') === 'true' ||
    el.getAttribute('data-checked') !== null
  )
}

/** A key that gives you a file: a download link, or a button with the download mark. */
function takesFile(el: HTMLElement) {
  return el.matches('a[download]') || el.querySelector('svg.lucide-download') !== null
}

function classify(el: HTMLElement): Cue | null {
  const slot = el.dataset.slot ?? ''

  const named = el.dataset.sound
  if (named && isSoundName(named)) return { sound: named }

  // The big key says which job it starts; once there is a result, it hands it over.
  if (slot === 'primary-action') return { sound: el.dataset.tone === 'done' ? saveSound() : runSound() }
  if (el.matches('button, a[href]') && takesFile(el)) return { sound: saveSound() }

  if (slot === 'queue-item') return { sound: 'strip', detune: rowPitch(el.closest('li') ?? el) }
  if (slot.endsWith('-remove') || slot.endsWith('-clear')) return { sound: 'remove' }
  if (slot.endsWith('-close')) return { sound: 'close' }
  if (slot === 'viewer-open') return { sound: window.location.pathname.startsWith('/document') ? 'page' : 'open' }
  if (el.closest('[aria-label="Zoom"]') && el.matches('button')) return { sound: 'zoom' }

  // A page of a PDF, picked or put back.
  if (el.matches('button[aria-label^="Page "]')) return { sound: 'page' }
  if (el.matches('[aria-label*="previous page" i], [aria-label*="next page" i]')) return { sound: 'page' }

  // One of a row: a choice, not a switch.
  if (el.matches('[role="radio"], [role="tab"]') || el.closest('[role="radiogroup"]')) {
    return { sound: 'select', detune: rowPitch(el) }
  }
  if (el.matches('[aria-pressed]') && el.closest('[role="group"]')) return { sound: 'select', detune: rowPitch(el) }

  if (
    TOGGLE_SLOTS.has(slot) ||
    el.matches(
      '[role="switch"], input[type="checkbox"], input[type="radio"], [aria-pressed], [role="menuitemcheckbox"], [role="menuitemradio"]',
    )
  ) {
    return { sound: isOn(el) ? 'off' : 'on' }
  }

  if (el.dataset.variant === 'destructive') return { sound: 'clear' }
  if (slot.endsWith('-trigger') || el.matches('button[aria-expanded]')) {
    const expanded = el.getAttribute('aria-expanded')
    if (expanded === null) return { sound: 'select' }
    return { sound: expanded === 'true' ? 'close' : 'open' }
  }
  if (el.matches('[role="option"], [role="menuitem"]') || slot.endsWith('-item') || slot.endsWith('-option')) {
    return { sound: 'select', detune: rowPitch(el) }
  }
  if (slot === 'slider-thumb' || slot === 'slider-track') return { sound: 'tick' }
  if (el.matches('a[href^="/"], a[href^="#"]') || slot.endsWith('-link')) return { sound: 'nav' }
  if (slot === 'button' || el.matches('button, a[href], [role="button"]')) {
    const soft = el.dataset.variant === 'ghost' || el.dataset.variant === 'link'
    return { sound: 'tap', velocity: soft ? 0.78 : 1 }
  }
  return null
}

/** A small step up along a row, as on a real instrument. */
function rowPitch(el: HTMLElement) {
  const siblings = el.parentElement?.children
  if (!siblings) return 0
  return Math.min([...siblings].indexOf(el), 7) * 28
}

function soundFor(target: Element): Cue | null {
  if (target.closest('[data-sound="none"]')) return null

  const labeled = target.closest('label')?.control ?? target

  if (labeled.closest(TEXT_ENTRY)) return null

  let el = labeled.closest<HTMLElement>(INTERACTIVE)
  while (el) {

    if (el.matches(':disabled, [aria-disabled="true"], [data-disabled]')) {
      return { sound: 'blocked' }
    }
    const cue = classify(el)
    if (cue) return cue
    el = el.parentElement?.closest<HTMLElement>(INTERACTIVE) ?? null
  }
  return null
}

function span(min: number, max: number, value: number) {
  return max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)))
}

function sliderRange(el: HTMLElement) {
  if (el instanceof HTMLInputElement) {
    return {
      min: Number(el.min || 0),
      max: Number(el.max || 100),
      step: Math.abs(Number(el.step)) || 1,
    }
  }
  const read = (name: string, fallback: number) => {
    const value = Number(el.getAttribute(name))
    return Number.isFinite(value) ? value : fallback
  }
  return { min: read('aria-valuemin', 0), max: read('aria-valuemax', 100), step: 1 }
}

/** Everything a page is likely to need first. */
const EVERYWHERE: SoundName[] = ['tap', 'select', 'on', 'off', 'nav', 'open', 'close', 'blocked', 'success', 'error']

function SoundEffectListener() {
  const muted = useSoundMuted()
  const volume = useSoundVolume()
  const pathname = usePathname()

  useEffect(() => {
    setSoundOutput({ muted, volume })
  }, [muted, volume])

  const wasMuted = useRef(muted)
  useEffect(() => {
    const cameBack = wasMuted.current && !muted
    wasMuted.current = muted
    if (cameBack) play({ sound: 'mute' })
  }, [muted])

  // Fetched once the page has settled, so the first key already answers.
  useEffect(() => {
    if (muted) return
    const handle = window.setTimeout(() => {
      const tool = pathname.split('/').filter(Boolean).length > 1
      preloadSounds(
        tool
          ? [...EVERYWHERE, runSound(), dropSound(), saveSound(), 'strip', 'remove', 'clear', 'zoom', 'tick', 'page']
          : [...EVERYWHERE, 'hover', 'key'],
      )
    }, 900)
    return () => window.clearTimeout(handle)
  }, [pathname, muted])

  useEffect(() => {

    const TICK_GAP_MS = 28
    const TICK_LAG_MS = 60
    const DRAG_SLOP_PX = 3

    let grab: { x: number; y: number; dragged: boolean } | null = null
    let interactingSlider: Element | null = null
    let nextTickAt = 0
    const queued = new Set<ReturnType<typeof setTimeout>>()

    const stopTicking = () => {
      for (const timer of queued) clearTimeout(timer)
      queued.clear()
      nextTickAt = 0
    }

    const tick = (detune: number, now: number) => {
      if (nextTickAt - now > TICK_LAG_MS) return false
      const wait = nextTickAt - now
      nextTickAt += TICK_GAP_MS
      const cue = { sound: 'tick', detune } as const
      if (wait <= 0) {
        play(cue)
        return true
      }
      const timer = setTimeout(() => {
        queued.delete(timer)
        play(cue)
      }, wait)
      queued.add(timer)
      return true
    }

    const ratchet = (el: HTMLElement, from: number, to: number) => {
      const { min, max, step } = sliderRange(el)
      const crossed = Math.round(Math.abs(to - from) / step)
      if (!Number.isFinite(crossed) || crossed < 1) return

      const now = performance.now()
      nextTickAt = Math.max(nextTickAt, now)
      const direction = Math.sign(to - from)

      for (let i = 1; i <= crossed; i++) {

        const value = from + direction * step * i
        if (!tick(span(min, max, value) * 260, now)) break
      }
    }

    const onPointerDown = (event: PointerEvent) => {

      if (event.button !== 0 || !(event.target instanceof Element)) return
      const sliderEl = event.target.closest('input[type="range"], [role="slider"], [data-slot="slider"]')
      interactingSlider = sliderEl && !sliderEl.closest('[data-sound="none"]') ? sliderEl : null
      const cue = soundFor(event.target)
      if (!cue) return
      if (cue.sound === 'tick') grab = { x: event.clientX, y: event.clientY, dragged: false }
      play(cue)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element)) return
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === 'PageUp' ||
        event.key === 'PageDown'
      ) {
        const sliderEl = event.target.closest('input[type="range"], [role="slider"]')
        interactingSlider = sliderEl && !sliderEl.closest('[data-sound="none"]') ? sliderEl : null
      }
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (event.repeat) return
      const typing = event.target.matches(TEXT_ENTRY)

      if (typing) return
      const cue = soundFor(event.target)
      if (cue) play(cue)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!grab || grab.dragged) return
      if (Math.hypot(event.clientX - grab.x, event.clientY - grab.y) > DRAG_SLOP_PX)
        grab.dragged = true
    }

    const onPointerUp = () => {
      if (grab) stopTicking()
      grab = null
      interactingSlider = null
    }

    const onBlur = () => {
      interactingSlider = null
    }

    const onContextMenu = () => play({ sound: 'open' })

    // Cards whisper as the pointer crosses them, never faster than this.
    let hoveredAt = 0
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return
      const card = event.target.closest('.fb-card')
      if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return
      const now = performance.now()
      if (now - hoveredAt < 70) return
      hoveredAt = now
      play({ sound: 'hover' })
    }

    // Files arriving, whichever way: chosen, dropped or pasted.
    const landed = () => play({ sound: dropSound() })
    const onFileChosen = (event: Event) => {
      const el = event.target
      if (el instanceof HTMLInputElement && el.type === 'file' && el.files?.length) landed()
    }
    const onFileDropped = (event: DragEvent) => {
      if (event.dataTransfer?.files.length) landed()
    }
    const onFilePasted = (event: ClipboardEvent) => {
      if (event.clipboardData?.files.length) landed()
    }
    // Something dragged into a new place.
    const onDragEnd = () => play({ sound: 'place' })

    const onInput = (event: Event) => {

      if (!event.isTrusted) return
      const el = event.target
      if (!(el instanceof HTMLInputElement) || !el.closest('[data-slot="input-otp"]')) return
      const deleting = (event as InputEvent).inputType?.startsWith('delete') ?? false
      play({ sound: 'key', detune: deleting ? -200 : 0 })
    }

    const observer = new MutationObserver((records) => {
      let slid = false

      for (const record of records) {
        const el = record.target
        if (!(el instanceof HTMLElement)) continue
        const value = el.getAttribute(record.attributeName ?? '')

        const entered = value !== null && value !== 'false' && value !== record.oldValue

        switch (record.attributeName) {
          case 'aria-valuenow': {
            if (slid || !el.matches('input[type="range"], [role="slider"]')) break
            if (el.closest('[data-sound="none"]')) break

            if (value === null || record.oldValue === null) break

            const userDriving =
              el === interactingSlider ||
              (interactingSlider !== null &&
                (el.contains(interactingSlider) || interactingSlider.contains(el))) ||
              el.matches(':active')
            if (!userDriving) break

            if (grab && !grab.dragged) break
            slid = true
            if (grab) {
              ratchet(el, Number(record.oldValue), Number(value))
              break
            }
            const { min, max } = sliderRange(el)
            const now = performance.now()
            nextTickAt = Math.max(nextTickAt, now)
            tick(span(min, max, Number(value)) * 260, now)
            break
          }
          case 'data-success': {
            if (entered) play({ sound: 'success' })
            break
          }
          case 'aria-invalid':
          case 'data-error': {
            if (entered) play({ sound: 'error' })
            break
          }
          default:
            break
        }
      }
    })

    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['aria-valuenow', 'aria-invalid', 'data-success', 'data-error'],
    })

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('pointercancel', onPointerUp, true)
    document.addEventListener('blur', onBlur, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('pointerover', onPointerOver, true)
    document.addEventListener('change', onFileChosen, true)
    document.addEventListener('drop', onFileDropped, true)
    document.addEventListener('paste', onFilePasted, true)
    document.addEventListener('dragend', onDragEnd, true)
    document.addEventListener('input', onInput, true)
    return () => {
      observer.disconnect()
      stopTicking()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('pointercancel', onPointerUp, true)
      document.removeEventListener('blur', onBlur, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('pointerover', onPointerOver, true)
      document.removeEventListener('change', onFileChosen, true)
      document.removeEventListener('drop', onFileDropped, true)
      document.removeEventListener('paste', onFilePasted, true)
      document.removeEventListener('dragend', onDragEnd, true)
      document.removeEventListener('input', onInput, true)
    }
  }, [])

  return null
}

const listeners = new Set<() => void>()

function subscribeMuted(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function notify() {
  for (const onChange of listeners) onChange()
}

export function setSoundMuted(muted: boolean) {
  localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
  notify()
}

export function useSoundMuted() {
  return useSyncExternalStore(
    subscribeMuted,
    () => localStorage.getItem(STORAGE_KEY) === '1',
    () => false,
  )
}

export function setSoundVolume(volume: number) {
  localStorage.setItem(VOLUME_KEY, String(volume))
  notify()
}

export function useSoundVolume() {
  return useSyncExternalStore(
    subscribeMuted,
    () => {
      const stored = Number(localStorage.getItem(VOLUME_KEY))

      return Number.isFinite(stored) && stored > 0 && stored <= 1 ? stored : DEFAULT_VOLUME
    },
    () => DEFAULT_VOLUME,
  )
}

export function SoundEffects({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SoundEffectListener />
      {children}
    </>
  )
}

const SPEAKER =
  'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z'
const WAVE_INNER = 'M16 9a5 5 0 0 1 0 6'
const WAVE_OUTER = 'M19.364 18.364a9 9 0 0 0 0-12.728'
const SLASH = 'M2 2 22 22'

export function SoundToggle({ className, onClick, ...props }: React.ComponentProps<'button'>) {

  const muted = useSoundMuted()
  const maskId = useId()

  return (
    <button
      type="button"
      aria-label={muted ? 'Unmute interface sounds' : 'Mute interface sounds'}
      aria-pressed={muted}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setSoundMuted(!muted)
      }}

      data-sound="mute"
      {...props}
      className={cn(
        'flex size-7 cursor-pointer items-center justify-center rounded text-shell-fg-faint transition-[transform,box-shadow] duration-100 ease-out outline-none hover:bg-foreground/5 hover:text-shell-fg-muted focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] motion-reduce:transition-none',
        className,
      )}
    >
      <svg
        data-muted={muted}
        viewBox="0 0 24 24"
        width={17}
        height={17}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >

        <mask id={maskId}>
          <rect width="24" height="24" fill="white" />
          <path className="sound-slash" d={SLASH} pathLength={1} stroke="black" strokeWidth={4} />
        </mask>
        <g mask={`url(#${maskId})`}>
          <path className="sound-speaker" d={SPEAKER} />
          <path className="sound-wave sound-wave-inner" d={WAVE_INNER} />
          <path className="sound-wave sound-wave-outer" d={WAVE_OUTER} />
        </g>
        <path className="sound-slash" d={SLASH} pathLength={1} />
      </svg>
    </button>
  )
}
