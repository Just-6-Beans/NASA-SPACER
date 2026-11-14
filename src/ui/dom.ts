export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[]

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
  const t = el(`<div class="toast ${kind}">${esc(text)}</div>`)
  box.append(t)
  while (box.children.length > 4) box.firstElementChild!.remove()
  setTimeout(() => t.remove(), ms)
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const isTouch = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
