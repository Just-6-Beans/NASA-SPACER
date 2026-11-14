// The two instruments the pilot flies the ascent by, drawn on 2D canvases: a map of the planet
// with the path ahead, and a pitch dial with the guidance marker. They read the ascent model
// (src/core/ascent.ts) and add nothing to it.
import { MU, PERI_MIN, PLANET, altitude, guidance, orbitOf, pathPitch, pitch, showAltKm, speed, type Ascent } from '../core/ascent'

const MINT = '#5ff2c5', CYAN = '#3fd0ff', WARN = '#ffb347', IVORY = '#e2f5ff', DIM = 'rgba(134,170,196,.75)'

/** Sizes the canvas for the screen's pixel density and returns a context that draws in CSS pixels. */
function prepare(c: HTMLCanvasElement): { g: CanvasRenderingContext2D; w: number; h: number } | null {
  const w = c.clientWidth, h = c.clientHeight
  if (!w || !h) return null
  const k = Math.min(window.devicePixelRatio || 1, 2)
  if (c.width !== Math.round(w * k) || c.height !== Math.round(h * k)) { c.width = Math.round(w * k); c.height = Math.round(h * k) }
  const g = c.getContext('2d')
  if (!g) return null
  g.setTransform(k, 0, 0, k, 0, 0)
  g.clearRect(0, 0, w, h)
  return { g, w, h }
}

/** Where the rocket has been, as [angle round the planet from the pad, altitude] pairs. */
export type Trail = [number, number][]

/**
 * The map: the whole planet, the station's orbit, the path flown and the path ahead if the
 * engines stopped now. Altitude is drawn about five times too tall so the climb can be read.
 */
export function drawMap(c: HTMLCanvasElement, s: Ascent, trail: Trail) {
  const p = prepare(c)
  if (!p) return
  const { g, w, h } = p
  const cx = w / 2, cy = h * 0.53, R = Math.min(w, h) * 0.27, tall = R * 0.5
  const rad = (alt: number) => R + Math.max(-0.25, Math.min(1.9, alt / PLANET.targetAlt)) * tall
  const at = (angle: number, alt: number): [number, number] => [cx + rad(alt) * Math.sin(angle), cy - rad(alt) * Math.cos(angle)]
  const ring = (alt: number, style: string, dash: number[], width = 1) => {
    g.beginPath(); g.arc(cx, cy, rad(alt), 0, Math.PI * 2); g.strokeStyle = style; g.lineWidth = width; g.setLineDash(dash); g.stroke(); g.setLineDash([])
  }
  // air, planet, the two rings that matter
  const glow = g.createRadialGradient(cx, cy, R, cx, cy, rad(2600))
  glow.addColorStop(0, 'rgba(63,208,255,.34)'); glow.addColorStop(1, 'rgba(63,208,255,0)')
  g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, rad(2600), 0, Math.PI * 2); g.fill()
  const body = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R)
  body.addColorStop(0, '#12406a'); body.addColorStop(1, '#051222')
  g.fillStyle = body; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill()
  g.strokeStyle = 'rgba(63,208,255,.55)'; g.lineWidth = 1; g.stroke()
  ring(PERI_MIN, 'rgba(255,179,71,.4)', [2, 4])
  ring(PLANET.targetAlt, MINT, [5, 4], 1.2)
  // the pad
  const [px, py] = at(0, 0)
  g.fillStyle = IVORY; g.fillRect(px - 1, py - 4, 2, 5)

  // the path flown
  if (trail.length > 1) {
    g.beginPath()
    trail.forEach(([a, alt], i) => { const [x, y] = at(a, alt); if (i) g.lineTo(x, y); else g.moveTo(x, y) })
    g.strokeStyle = IVORY; g.lineWidth = 1.6; g.stroke()
  }
  // the path ahead with the engines off: gravity only
  const o = orbitOf(s)
  const stable = o.bound && o.peri >= PERI_MIN
  let x = s.x, y = s.y, vx = s.vx, vy = s.vy
  const a0 = Math.atan2(x, y)
  let turned = 0, last = a0, high: [number, number, number] | null = null, low: [number, number, number] | null = null, hit: [number, number] | null = null
  g.beginPath()
  g.moveTo(...at(a0, altitude(s)))
  if (speed(s) > 1) {
    for (let i = 0; i < 1400; i++) {
      const dt = 0.35
      const r = Math.hypot(x, y), k = -MU / (r * r * r)
      vx += k * x * dt; vy += k * y * dt
      x += vx * dt; y += vy * dt
      const r2 = Math.hypot(x, y), alt = r2 - PLANET.radius, a = Math.atan2(x, y)
      let da = a - last
      if (da < -Math.PI) da += Math.PI * 2
      if (da > Math.PI) da -= Math.PI * 2
      turned += da; last = a
      if (alt < 0) { hit = at(a, 0); g.lineTo(...hit); break }
      g.lineTo(...at(a, alt))
      if (!high || alt > high[2]) high = [a, alt, alt]
      if (!low || alt < low[2]) low = [a, alt, alt]
      if (Math.abs(turned) > Math.PI * 2) break
      if (alt > PLANET.targetAlt * 4) break
    }
  }
  g.strokeStyle = stable ? MINT : WARN; g.lineWidth = 1.4; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([])
  g.font = '600 10px "IBM Plex Mono", ui-monospace, monospace'
  const mark = (pt: [number, number, number] | null, label: string, color: string) => {
    if (!pt) return
    const [mx, my] = at(pt[0], pt[1])
    g.fillStyle = color; g.beginPath(); g.arc(mx, my, 2.6, 0, Math.PI * 2); g.fill()
    g.textAlign = mx > cx ? 'left' : 'right'
    g.fillText(label, mx + (mx > cx ? 6 : -6), my + 3)
  }
  if (hit) { g.strokeStyle = '#ff5a4a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(hit[0] - 4, hit[1] - 4); g.lineTo(hit[0] + 4, hit[1] + 4); g.moveTo(hit[0] + 4, hit[1] - 4); g.lineTo(hit[0] - 4, hit[1] + 4); g.stroke() }
  if (high && speed(s) > 30) mark(high, `HIGH ${Math.round(showAltKm(high[1]))}`, stable ? MINT : WARN)
  if (low && stable) mark(low, `LOW ${Math.round(showAltKm(low[1]))}`, MINT)

  // the rocket: an arrow along its nose
  const [rx, ry] = at(a0, altitude(s))
  const nx = Math.sin(s.att), ny = -Math.cos(s.att)
  g.fillStyle = '#fff'
  g.beginPath()
  g.moveTo(rx + nx * 7, ry + ny * 7)
  g.lineTo(rx - nx * 4 - ny * 3.5, ry - ny * 4 + nx * 3.5)
  g.lineTo(rx - nx * 4 + ny * 3.5, ry - ny * 4 - nx * 3.5)
  g.closePath(); g.fill()
  g.fillStyle = DIM; g.textAlign = 'left'
  g.fillText('STATION ORBIT', 6, 12)
  g.fillStyle = MINT; g.fillRect(6, 16, 16, 1.5)
}

/**
 * The pitch dial: straight up at the top, level and heading east at the right. White needle: the
 * nose. Mint marker: where the guidance wants it. Cyan dot: the way the rocket is actually going.
 */
export function drawDial(c: HTMLCanvasElement, s: Ascent) {
  const p = prepare(c)
  if (!p) return
  const { g, w, h } = p
  const cx = w * 0.16, cy = h * 0.86, R = Math.min(w * 0.74, h * 0.78)
  const dir = (angle: number, r: number): [number, number] => [cx + Math.sin(angle) * r, cy - Math.cos(angle) * r]
  const from = -Math.PI / 2, to = from + (112 * Math.PI) / 180
  g.beginPath(); g.arc(cx, cy, R, from, to); g.strokeStyle = 'rgba(63,208,255,.6)'; g.lineWidth = 1.2; g.stroke()
  g.font = '600 9.5px "IBM Plex Mono", ui-monospace, monospace'
  g.fillStyle = DIM
  for (let d = 0; d <= 105; d += 15) {
    const a = (d * Math.PI) / 180, long = d % 45 === 0
    const [x0, y0] = dir(a, R), [x1, y1] = dir(a, R - (long ? 9 : 5))
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = long ? CYAN : 'rgba(63,208,255,.5)'; g.lineWidth = 1; g.stroke()
    if (long) { const [tx, ty] = dir(a, R - 19); g.textAlign = 'center'; g.fillText(`${d}°`, tx, ty + 3) }
  }
  g.textAlign = 'left'
  g.fillText('UP', cx - 6, cy - R - 5)
  g.fillText('EAST', cx + R + 6, cy + 3)
  const flying = s.status !== 'pad'
  // the way it is going
  if (flying && speed(s) > 8) { const [fx, fy] = dir(pathPitch(s), R - 3); g.fillStyle = CYAN; g.beginPath(); g.arc(fx, fy, 3.2, 0, Math.PI * 2); g.fill() }
  // guidance marker, outside the arc
  const want = guidance(s)
  const [gx, gy] = dir(want, R + 3), [ga, gb] = dir(want - 0.07, R + 13), [gc, gd] = dir(want + 0.07, R + 13)
  g.fillStyle = MINT; g.beginPath(); g.moveTo(gx, gy); g.lineTo(ga, gb); g.lineTo(gc, gd); g.closePath(); g.fill()
  // the nose
  const now = pitch(s)
  const [nx, ny] = dir(now, R - 1)
  const off = Math.abs(now - want)
  g.strokeStyle = off > 0.35 ? '#ff5a4a' : off > 0.16 ? WARN : '#fff'
  g.lineWidth = 2.6; g.lineCap = 'round'
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(nx, ny); g.stroke()
  g.fillStyle = IVORY; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill()
}
