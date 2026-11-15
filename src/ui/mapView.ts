// The expedition map: a 3 km square around the real rover. The background is a real picture
// taken from orbit (or, at the flip of a switch, a height map drawn from MOLA laser heights).
// Everything the game adds is drawn on top: where the real rover parked, the real photo places,
// the points the player taps, and the rover itself. The player can zoom in and drag the map.
import type { Mission, SpotReport } from '../core/mission'
import type { RoverSpec } from '../core/rovers'
import { SAMPLE_RANGE_M } from '../core/samples'
import { PHOTO_RANGE_M, groundAt, halfMap, heightAt, photoPlaces, slopeAt, type DriveResult, type Pt } from '../core/survey'

/** Map units: the whole 3 km square is MAP_PX wide, whatever size it is drawn at. */
export const MAP_PX = 600
export const MAX_ZOOM = 6
const CONTOUR_M = 20

export type MapMode = 'sat' | 'height'
/** What part of the map is on screen: zoom factor, the centre in map units, and which picture. */
export interface MapView { k: number; cx: number; cy: number; mode: MapMode }
export const newView = (): MapView => ({ k: 1, cx: MAP_PX / 2, cy: MAP_PX / 2, mode: 'sat' })

/** The visible square in map units, kept inside the map. */
export function viewBox(v: MapView) {
  const size = MAP_PX / v.k
  const clamp = (c: number) => Math.max(0, Math.min(MAP_PX - size, c - size / 2))
  return { x: clamp(v.cx), y: clamp(v.cy), size }
}
/** Changes the zoom, keeping the centre of the view where it was (or moving it to `around`). */
export function setZoom(v: MapView, k: number, around?: { x: number; y: number }) {
  const vb = viewBox(v)
  v.cx = around?.x ?? vb.x + vb.size / 2
  v.cy = around?.y ?? vb.y + vb.size / 2
  v.k = Math.max(1, Math.min(MAX_ZOOM, Math.round(k * 10) / 10))
}

export const toPx = (rv: RoverSpec, p: Pt) => ({ x: (p.x / rv.area.sizeM + 0.5) * MAP_PX, y: (0.5 - p.y / rv.area.sizeM) * MAP_PX })
/** Map metres (east, north) under a pointer event, for the element showing the map and its current view. */
export function pointAt(box: Element, e: { clientX: number; clientY: number }, rv: RoverSpec, v: MapView): Pt {
  const b = box.getBoundingClientRect(), vb = viewBox(v)
  const x = vb.x + ((e.clientX - b.left) / b.width) * vb.size, y = vb.y + ((e.clientY - b.top) / b.height) * vb.size
  return { x: Math.round((x / MAP_PX - 0.5) * rv.area.sizeM), y: Math.round((0.5 - y / MAP_PX) * rv.area.sizeM) }
}

// ---------------------------------------------------------------- Backgrounds
const terrainCache = new Map<string, { url: string; min: number; max: number }>()
export const RAMP: [number, number, number][] = [[74, 34, 22], [128, 62, 36], [176, 98, 54], [214, 146, 92], [238, 196, 150]]
function ramp(f: number): [number, number, number] {
  const t = Math.max(0, Math.min(0.9999, f)) * (RAMP.length - 1)
  const i = Math.floor(t), k = t - i
  return [0, 1, 2].map(c => RAMP[i][c] + (RAMP[i + 1][c] - RAMP[i][c]) * k) as [number, number, number]
}

/** Height map: shaded relief with contour lines, drawn once per rover from the MOLA height grid. */
export function terrain(rv: RoverSpec) {
  const hit = terrainCache.get(rv.id)
  if (hit) return hit
  const N = 480, half = halfMap(rv), step = rv.area.sizeM / N
  const h = new Float32Array((N + 1) * (N + 1))
  let min = Infinity, max = -Infinity
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const v = heightAt(rv, { x: -half + i * step, y: half - j * step })
    h[j * (N + 1) + i] = v
    if (v < min) min = v
    if (v > max) max = v
  }
  const c = document.createElement('canvas')
  c.width = c.height = N
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(N, N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = h[j * (N + 1) + i], e = h[j * (N + 1) + i + 1], s = h[(j + 1) * (N + 1) + i]
    // Light from the north-west: slopes facing it are brighter.
    const shade = Math.max(0.62, Math.min(1.3, 1 + (((a - e) + (a - s)) / step) * -1.6))
    const contour = Math.floor(a / CONTOUR_M) !== Math.floor(e / CONTOUR_M) || Math.floor(a / CONTOUR_M) !== Math.floor(s / CONTOUR_M)
    const [r, g, b] = ramp((a - min) / (max - min || 1))
    const k = contour ? shade * 0.72 : shade
    const o = (j * N + i) * 4
    img.data[o] = r * k; img.data[o + 1] = g * k; img.data[o + 2] = b * k; img.data[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const out = { url: c.toDataURL('image/png'), min: Math.round(min), max: Math.round(max) }
  terrainCache.set(rv.id, out)
  return out
}

const bgCache = new Map<string, HTMLElement>()
/**
 * The picture behind the map, as one element that is made once and then reused. For the real
 * photo from orbit, NASA's map tiles are joined on a canvas and cropped to the game square.
 */
export function background(rv: RoverSpec, mode: MapMode): HTMLElement {
  const key = `${rv.id}:${mode}`
  const hit = bgCache.get(key)
  if (hit) return hit
  let out: HTMLElement
  if (mode === 'height') {
    const img = document.createElement('img')
    img.src = terrain(rv).url
    img.alt = ''
    out = img
  } else {
    const s = rv.satellite
    const c = document.createElement('canvas')
    c.width = Math.round(s.square.width)
    c.height = Math.round(s.square.height)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#5a3524'
    ctx.fillRect(0, 0, c.width, c.height)
    for (let row = 0; row < s.rows; row++) for (let col = 0; col < s.cols; col++) {
      if (s.missing.includes(`${col}_${row}`)) continue
      // Whole-pixel positions keep the picture sharp (the half-pixel this drops is about 0.6 m).
      const x = Math.round(col * s.tilePx - s.square.left), y = Math.round(row * s.tilePx - s.square.top)
      if (x >= c.width || y >= c.height || x + s.tilePx <= 0 || y + s.tilePx <= 0) continue
      const tile = new Image()
      tile.onload = () => ctx.drawImage(tile, x, y)
      tile.src = `${import.meta.env.BASE_URL}${s.files.replace('{col}', String(col)).replace('{row}', String(row))}`
    }
    out = c
  }
  out.className = 'mapbg'
  bgCache.set(key, out)
  return out
}

// ---------------------------------------------------------------- What the game draws on top
const COLOUR = { good: '#5ff2c5', risky: '#ffb347', bad: '#ff5a4a', unknown: '#b8c4cf' }

export interface MapOpts {
  /** The player may tap to add points. */
  planning: boolean
  /** A drive being played back: the rover marker follows it and the destination spot is hidden. */
  anim: { pos: Pt; trail: Pt[]; drive: DriveResult } | null
  reports: SpotReport[]
  /** Spot to highlight (the one whose details are showing). */
  focus: number | null
  view: MapView
  /** Photo places already in the album, and the one in camera range right now (if any). */
  found: number[]
  inRange: number | null
}

/** A marker drawn at a map position that keeps its size on screen however far the map is zoomed. */
export const pin = (q: { x: number; y: number }, k: number) => `translate(${q.x.toFixed(1)},${q.y.toFixed(1)}) scale(${(1 / k).toFixed(4)})`

export function mapSvg(m: Mission, rv: RoverSpec, o: MapOpts): string {
  const k = o.view.k, vb = viewBox(o.view)
  /** A line width or dash that stays the same on screen. */
  const u = (n: number) => +(n / k).toFixed(2)
  const px = (p: Pt) => toPx(rv, p)
  const pts = (list: Pt[]) => list.map(p => { const q = px(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}` }).join(' ')
  const lines = Array.from({ length: 5 }, (_, i) => (i + 1) * (MAP_PX / 6)).map(v => `<line x1="${v}" y1="0" x2="${v}" y2="${MAP_PX}"/><line x1="0" y1="${v}" x2="${MAP_PX}" y2="${v}"/>`).join('')
  const track = `<polyline points="${pts(rv.area.stops)}" fill="none" stroke="#fff" stroke-width="${u(1.4)}" stroke-dasharray="${u(4)} ${u(4)}" opacity=".6"/>${rv.area.stops.map(s => `<g transform="${pin(px(s), k)}"><circle r="2.8" fill="#fff" stroke="#04101c" stroke-width=".9"/></g>`).join('')}`
  // Real photo places: a camera mark, and a ring showing how close the rover must pass.
  const ring = (PHOTO_RANGE_M / rv.area.sizeM) * MAP_PX
  const cams = photoPlaces(rv).map(pl => {
    const q = px(pl), got = o.found.includes(pl.id)
    // "near", not "hot": the parts guide has a .hot class of its own, and its CSS would move this mark across the map
    return `<g class="mcam ${got ? 'got' : ''} ${o.inRange === pl.id ? 'near' : ''}" data-place="${pl.id}" pointer-events="none">
      ${got ? '' : `<circle class="mring" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${ring.toFixed(1)}" stroke-width="${u(1.5)}" stroke-dasharray="${u(5)} ${u(4)}"/>`}
      <g transform="${pin(q, k)}"><rect class="mbody" x="-10" y="-6" width="20" height="14" rx="3.5"/><rect class="mbody" x="-4.5" y="-9.5" width="9" height="5" rx="1.5"/>${got ? '<path class="mtick" d="M-4.5 1 L-1.2 4.3 L5 -3"/>' : '<circle class="mlens" cy="1" r="3.8"/>'}</g></g>`
  }).join('')
  // The sample site: a diamond over a place the real rover parked, with the ring the rover has to stop inside.
  const st = m.sampleSite
  let site = ''
  if (st) {
    const q = px(st), r = (SAMPLE_RANGE_M / rv.area.sizeM) * MAP_PX
    site = `<g class="msite ${m.samples ? 'done' : ''}" pointer-events="none">
      ${m.samples ? '' : `<circle class="msring" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${r.toFixed(1)}" stroke-width="${u(1.5)}" stroke-dasharray="${u(3)} ${u(4)}"/>`}
      <g transform="${pin({ x: q.x, y: q.y - 24 / k }, k)}"><rect class="msbody" x="-8" y="-8" width="16" height="16" rx="2" transform="rotate(45)"/>${m.samples ? '<path class="mtick" d="M-4.5 0.5 L-1.2 3.8 L5 -3.5"/>' : '<circle class="mscore" r="3"/>'}</g></g>`
  }
  const history = m.drives.filter(d => d !== o.anim?.drive).map(d => `<polyline points="${pts([d.start, ...d.legs.map(l => l.to)])}" fill="none" stroke="#ff8a4c" stroke-width="${u(3)}" opacity=".85"/>`).join('')
  const hidden = o.anim ? m.spots[m.spots.length - 1]?.id : -1
  const spots = o.reports.filter(r => r.spot.id !== hidden || m.drives.length === 0).map(r => {
    const built = m.base?.approved && m.base.id === r.spot.id
    return `<g class="mspot ${o.focus === r.spot.id ? 'focus' : ''}" data-spot="${r.spot.id}" tabindex="0" role="button" aria-label="${r.name}: ${r.verdict.title}" transform="${pin(px(r.spot.p), k)}">
      ${built ? '<path d="M-16 4 A16 14 0 0 1 16 4Z" fill="#e6e1d6" stroke="#04101c" stroke-width="2"/>' : ''}
      <circle r="${built ? 9 : 11}" fill="${COLOUR[r.verdict.level]}" stroke="#04101c" stroke-width="2.5"/>
      <text y="4.5" text-anchor="middle" font-size="13" font-weight="700" fill="#04101c">${r.spot.label}</text></g>`
  }).join('')
  // Planned path: orange while the battery lasts, red past the point where safe mode would stop the rover.
  let plan = ''
  if (o.planning && m.waypoints.length) {
    const f = m.forecast()!
    const ok = [m.pos, ...f.legs.map(l => l.to)]
    const lost = f.safeMode ? [f.end, ...m.waypoints.slice(f.reached)] : []
    plan = `<polyline points="${pts(ok)}" fill="none" stroke="#04101c" stroke-width="${u(6)}" opacity=".55"/><polyline points="${pts(ok)}" fill="none" stroke="#ffb347" stroke-width="${u(3.5)}" stroke-dasharray="${u(9)} ${u(6)}"/>
      ${lost.length ? `<polyline points="${pts(lost)}" fill="none" stroke="#ff5a4a" stroke-width="${u(3)}" stroke-dasharray="${u(4)} ${u(6)}"/><g transform="${pin(px(f.end), k)}"><text y="-8" text-anchor="middle" font-size="16" font-weight="700">!</text></g>` : ''}
      ${m.waypoints.map((w, i) => { const last = i === m.waypoints.length - 1; return `<g transform="${pin(px(w), k)}"><circle r="${last ? 11 : 8}" fill="${i >= f.reached ? '#ff5a4a' : last ? '#ffb347' : '#fff'}" stroke="#04101c" stroke-width="2"/><text y="4" text-anchor="middle" font-size="${last ? 12 : 11}" font-weight="700" fill="#04101c">${last ? '⚑' : i + 1}</text></g>` }).join('')}`
  }
  const anim = o.anim ? `<polyline points="${pts([o.anim.drive.start, ...o.anim.drive.legs.map(l => l.to)])}" fill="none" stroke="#ffb347" stroke-width="${u(2)}" stroke-dasharray="${u(6)} ${u(6)}" opacity=".8"/><polyline id="trail" points="${pts(o.anim.trail)}" fill="none" stroke="#ff8a4c" stroke-width="${u(4)}"/>` : ''
  return `<svg class="expmap ${o.planning ? 'planning' : ''}" viewBox="${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.size.toFixed(2)} ${vb.size.toFixed(2)}" role="application" aria-label="Map of the ${rv.area.sizeM / 1000} km around ${rv.name}. ${o.planning ? 'Tap to place points for the rover to drive to.' : ''}">
    <g stroke="#ffffff" stroke-opacity=".12" stroke-width="${u(1)}">${lines}</g>
    ${track}${cams}${site}${history}${plan}${anim}${spots}
    <g id="rv" transform="${pin(px(o.anim?.pos ?? m.pos), k)}" pointer-events="none">${m.stuck && !o.anim ? '<circle class="mstuck" r="27"/>' : ''}<circle r="17" fill="#ff6a2b" opacity=".22"/><circle r="17" fill="none" stroke="#fff" stroke-width="4.5" opacity=".9"/><circle r="17" fill="none" stroke="#ff6a2b" stroke-width="3"/>
      <rect x="-9" y="-5" width="18" height="8" rx="2" fill="#ff6a2b" stroke="#04101c" stroke-width="1"/><circle cx="-6" cy="5" r="2.6" fill="#04101c"/><circle cx="0" cy="5" r="2.6" fill="#04101c"/><circle cx="6" cy="5" r="2.6" fill="#04101c"/><line x1="5" y1="-5" x2="5" y2="-11" stroke="#ff6a2b" stroke-width="2.4"/></g>
  </svg>`
}

/** A round length for the scale bar: the longest that fits in about a third of the visible map. */
export function scaleBar(rv: RoverSpec, v: MapView) {
  const visible = rv.area.sizeM / v.k
  const metres = [1000, 500, 200, 100, 50, 20].find(x => x <= visible * 0.34) ?? 20
  return { metres, percent: (metres / visible) * 100 }
}

/** One-line readout for the point under the pointer: real MOLA height and slope, and any real stop nearby. */
export function readout(rv: RoverSpec, p: Pt): string {
  const g = groundAt(rv, p)
  const where = `${Math.abs(p.x)} m ${p.x >= 0 ? 'E' : 'W'}, ${Math.abs(p.y)} m ${p.y >= 0 ? 'N' : 'S'}`
  return g.source === 'rover'
    ? `${where} · ${rv.name} parked ${g.distM} m away on sol ${g.sol}: tilt ${g.tiltDeg}°, ${g.elevationM} m`
    : `${where} · from orbit: ${Math.round(heightAt(rv, p))} m high, slope about ${slopeAt(rv, p)}°`
}
