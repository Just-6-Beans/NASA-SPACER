// Keyboard + touch movement state shared by the station scene. Lives in the DOM so focus loss
// and open panels can clear it reliably.
export const held = { up: false, down: false, left: false, right: false, jog: false }
export const input = {
  blocked: false,
  onInteract: () => {},
  onEscape: () => {},
}

const map: Record<string, keyof typeof held> = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'jog', ShiftRight: 'jog',
}

export function clearHeld() {
  for (const k of Object.keys(held) as (keyof typeof held)[]) held[k] = false
  document.querySelectorAll('.dpad button.on').forEach(b => b.classList.remove('on'))
}

const typing = (e: Event) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

window.addEventListener('keydown', e => {
  if (e.code === 'Escape') { input.onEscape(); return }
  if (typing(e)) return
  const k = map[e.code]
  if (k) {
    if (!input.blocked || k === 'jog') held[k] = true
    if (k !== 'jog' && !input.blocked) e.preventDefault()
  }
  if (e.code === 'KeyE' && !e.repeat && !input.blocked) input.onInteract()
})
window.addEventListener('keyup', e => {
  const k = map[e.code]
  if (k) held[k] = false
})
window.addEventListener('blur', clearHeld)
document.addEventListener('visibilitychange', () => { if (document.hidden) clearHeld() })

export function setBlocked(b: boolean) {
  input.blocked = b
  if (b) clearHeld()
}

/** Wires an on-screen d-pad (buttons with data-dir) to the held state. */
export function bindDpad(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('button[data-dir]').forEach(btn => {
    const dirs = btn.dataset.dir!.split(',') as (keyof typeof held)[]
    const on = (e: PointerEvent) => {
      e.preventDefault()
      if (input.blocked) return
      btn.setPointerCapture(e.pointerId)
      dirs.forEach(d => (held[d] = true))
      btn.classList.add('on')
    }
    const off = () => { dirs.forEach(d => (held[d] = false)); btn.classList.remove('on') }
    btn.addEventListener('pointerdown', on)
    btn.addEventListener('pointerup', off)
    btn.addEventListener('pointercancel', off)
    btn.addEventListener('lostpointercapture', off)
  })
}
