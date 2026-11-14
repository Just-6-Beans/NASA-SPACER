export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[]

/** A phrase with its first letter in lower case, to run on after a colon. Proper nouns inside it keep their capitals. */
export const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Escape text for safe interpolation into HTML templates. */
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function el(html: string): HTMLElement {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild as HTMLElement
}

export function toast(text: string, kind: 'info' | 'ok' | 'warn' | 'bad' = 'info', ms = 3800) {
  let box = document.getElementById('toasts')
  if (!box) { box = el('<div id="toasts" class="toasts" role="status" aria-live="polite"></div>'); document.body.append(box) }
  // The same message twice in a row says nothing new.
  if ([...box.children].some(c => c.textContent === text)) return
  const t = el(`<div class="toast ${kind}">${esc(text)}</div>`)
  box.append(t)
  while (box.children.length > 3) box.firstElementChild!.remove()
  setTimeout(() => t.remove(), ms)
}
/** Drops every toast on screen. Called when a full-screen decision opens, so nothing sits on top of it. */
export function clearToasts() { document.getElementById('toasts')?.replaceChildren() }

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const isTouch = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
