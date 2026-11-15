// The live layer of the greenhouse: the plants on the racks, the grow lights, the status lamps,
// the control screens and the array wings outside. The art is a static picture of empty racks;
// this draws the module's state on top of it, read from the simulation and never kept here.
import Phaser from 'phaser'
import { STAGES, crop, type CropId, type Stage } from '../core/crops'
import type { AlertLevel, BayId, Symptom } from '../core/greenhouse'
import { BAYS, EXTERIOR, LIVE, moduleById, prop, type BayGeo, type Terminal } from './deck'

/** How scripts/art-crops.mjs lays out a crop sheet: one column per stage, one row per symptom. */
export const CROP_FRAME = { w: 72, h: 120, cols: 8, rows: 4, ground: 100, res: 2 }
const SYMPTOM_ROW: Record<Symptom, number> = { none: 0, wilt: 1, yellow: 2, spots: 3 }

export type BayStatus = 'locked' | 'empty' | 'growing' | 'ready' | 'care' | 'warn' | 'bad' | 'dead'
export interface BayView {
  id: BayId
  status: BayStatus
  crop: CropId | null
  stage: Stage
  symptom: Symptom
  /** 0..1 toward the next harvest. */
  progress: number
  /** Light reaching the plants, 0..1 of the bay's setting. */
  lit: number
  /** The tier that opens a locked bay. */
  tier: number
}
/** What the deck needs to know about the greenhouse. Built by the app from the simulation. */
export interface GreenhouseView {
  bays: BayView[]
  /** The worst open alert, or null when all is well. */
  alarm: AlertLevel | null
  arrayState: 'tracking' | 'feathered' | 'string offline'
  sunlit: boolean
  /** Irrigation flow in each loop, 0..1. */
  flow: { A: number; B: number }
  /** Air is moving: leaves sway. */
  airflow: boolean
  /** Humid enough for condensation on the windows. */
  condensation: boolean
  /** Share of the power budget still free, 0..100 (the first bar of the service screen). */
  batteryPct: number
  /** Water left in the tank, 0..100. */
  tankPct: number
  /** Two short lines for the control kiosk screen. */
  screen: [string, string]
  radiation: boolean
}

const MINT = 0x6ef2c6, CYAN = 0x5fd8f0, AMBER = 0xffb347, RED = 0xff4a3a, OFF = 0x2c343d, GREEN = 0x7fe36a
const LAMP: Record<BayStatus, number> = { locked: OFF, empty: OFF, growing: MINT, ready: CYAN, care: AMBER, warn: AMBER, bad: RED, dead: RED }

interface Plant { img: Phaser.GameObjects.Image; x: number; y: number; scale: number; phase: number }

export class GreenhouseLive {
  private v: GreenhouseView | null = null
  private plants = new Map<BayId, Plant[]>()
  private light: Phaser.GameObjects.Graphics
  private lamps: Phaser.GameObjects.Graphics
  private over: Phaser.GameObjects.Graphics
  private kiosk: Phaser.GameObjects.Graphics
  private mark: Phaser.GameObjects.Graphics
  private locks = new Map<BayId, Phaser.GameObjects.Text>()
  private wings: Phaser.GameObjects.Image[] = []
  private line1: Phaser.GameObjects.Text
  private line2: Phaser.GameObjects.Text
  private service: Phaser.GameObjects.Text
  private key = ''

  constructor(scene: Phaser.Scene, res: number) {
    const mono = (size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: 'IBM Plex Mono, monospace', fontSize: `${size}px`, color, resolution: res })
    // the greenhouse's own array wings, outside the hull beside the module
    for (const [x, y, w, h] of EXTERIOR.ghArray.wings) {
      this.wings.push(scene.add.image(x + w / 2, y + h / 2, 'ext-gh-wing').setDisplaySize(w, h).setDepth(-29))
    }
    // plants stand on the racks, behind the crew
    for (const b of BAYS) {
      const list: Plant[] = []
      const scale = (b.kind === 'tier' ? 0.75 : 1) / CROP_FRAME.res
      b.shelves.forEach((sy, si) => b.slots.forEach((sx, k) => {
        const jx = ((k * 7 + si * 3) % 5) - 2, s = scale * (0.94 + ((k * 5 + si * 2) % 4) * 0.03)
        const img = scene.add.image(sx + jx, sy + 2, 'crop-lettuce', '0-0').setOrigin(0.5, 1).setScale(s).setDepth(-7 + si * 0.01).setVisible(false).setFlipX((k + si) % 2 === 1)
        list.push({ img, x: sx + jx, y: sy + 2, scale: s, phase: k * 1.7 + si * 0.9 })
      }))
      this.plants.set(b.id, list)
      const [x, y, w, h] = b.box
      this.locks.set(b.id, scene.add.text(x + w / 2, y + h / 2, '', { ...mono(9, '#86aac4'), align: 'center' }).setOrigin(0.5).setDepth(-6.4))
    }
    this.light = scene.add.graphics().setDepth(-6.9).setBlendMode(Phaser.BlendModes.ADD)
    this.lamps = scene.add.graphics().setDepth(-6.5)
    this.over = scene.add.graphics().setDepth(-6.45)
    this.mark = scene.add.graphics().setDepth(4390)
    const kd = prop('gh-control').depth + 0.2
    this.kiosk = scene.add.graphics().setDepth(kd)
    const [sx, sy, sw] = LIVE.ghScreen
    this.line1 = scene.add.text(sx + sw / 2, sy + 15, '', { ...mono(11, '#6ef2c6'), fontStyle: 'bold' }).setOrigin(0.5).setDepth(kd + 0.1)
    this.line2 = scene.add.text(sx + sw / 2, sy + 31, '', mono(7.5, '#8fd9c4')).setOrigin(0.5).setDepth(kd + 0.1)
    const [gx, gy, gw] = LIVE.ghServiceScreen
    this.service = scene.add.text(gx + gw / 2, gy + 30, '', mono(7, '#9be8ff')).setOrigin(0.5).setDepth(-6.4)
  }

  setView(v: GreenhouseView) {
    this.v = v
    // plants change frame only when something about them changed
    const key = v.bays.map(b => `${b.status}${b.crop}${b.stage}${b.symptom}${Math.round(b.progress * 20)}`).join('|')
    if (key !== this.key) {
      this.key = key
      for (const b of v.bays) {
        const list = this.plants.get(b.id)!
        const show = !!b.crop && b.status !== 'locked' && b.status !== 'empty'
        const col = STAGES.indexOf(b.stage), row = b.stage === 'seed' || b.stage === 'dead' ? 0 : SYMPTOM_ROW[b.symptom]
        // within a stage the plant fills out a little, so growth reads between the drawn states
        const grow = b.stage === 'vegetative' || b.stage === 'reproductive' || b.stage === 'postharvest' ? 0.86 + 0.14 * b.progress : 1
        // any crop may stand in any bay: a trellis crop on a low leaf rack is drawn smaller so it fits under the shelf above
        const fit = b.crop && crop(b.crop).bay === 'tall' && BAYS.find(q => q.id === b.id)?.kind === 'tier' ? 0.6 : 1
        for (const p of list) {
          p.img.setVisible(show)
          if (show) p.img.setTexture(`crop-${b.crop}`, `${col}-${row}`).setScale(p.scale * grow * fit)
        }
        this.locks.get(b.id)!.setText(b.status === 'locked' ? `LOCKED\nLEVEL ${b.tier}` : '')
      }
    }
    this.line1.setText(v.screen[0]).setColor(v.alarm === 'damage' ? '#ff8a7a' : v.alarm ? '#ffcf8a' : '#6ef2c6')
    this.line2.setText(v.screen[1])
    this.service.setText(`PWR ${Math.round(v.batteryPct)}%\nH2O ${Math.round(v.tankPct)}%`)
  }

  update(now: number, near: Terminal | null) {
    const v = this.v
    const t = now / 1000
    const blink = 0.5 + 0.5 * Math.sin(t * 7), breathe = 0.5 + 0.5 * Math.sin(t * 2)
    this.light.clear(); this.lamps.clear(); this.over.clear(); this.kiosk.clear(); this.mark.clear()
    if (!v) { this.drawIdle(); return }
    for (const b of BAYS) {
      const s = v.bays.find(q => q.id === b.id)!
      this.drawBay(b, s, t, blink, breathe, near)
      // leaves move with the ventilation, never with anything outside
      if (v.airflow && s.crop) for (const p of this.plants.get(b.id)!) p.img.setRotation(Math.sin(t * 1.3 + p.phase) * 0.022)
    }
    this.drawSystems(v, t, blink, breathe)
  }

  /** Before the mission hands over a greenhouse: racks dark, lamps off. */
  private drawIdle() {
    for (const b of BAYS) this.lamps.fillStyle(OFF, 1).fillCircle(b.lamp[0], b.lamp[1], 2.6)
  }

  private drawBay(b: BayGeo, s: BayView, t: number, blink: number, breathe: number, near: Terminal | null) {
    const [x, y, w, h] = b.box
    // grow lights: white with a little red and blue, a soft wash over the shelf below each bar
    if (s.lit > 0.02) {
      for (const [lx, ly, lw] of b.leds) {
        const reach = b.kind === 'tier' ? 44 : 96
        this.light.fillStyle(0xffffff, 0.75 * s.lit).fillRect(lx, ly, lw, 4)
        for (let k = 0; k < 5; k++) this.light.fillStyle(0xeaf2ff, 0.05 * s.lit).fillRect(lx - 2 + k * 2, ly + 4, lw + 4 - k * 4, (reach * (5 - k)) / 5)
        for (let k = 0; k < 6; k++) this.light.fillStyle(k % 2 ? 0xff5a7a : 0x5a8cff, 0.8 * s.lit).fillRect(lx + 8 + (k * (lw - 16)) / 5 - 1, ly + 1, 2.4, 2)
      }
    }
    // status lamp: colour, and a blink for anything that wants a look
    const c = LAMP[s.status]
    const a = s.status === 'ready' ? 0.55 + 0.45 * breathe : s.status === 'care' || s.status === 'warn' || s.status === 'bad' ? 0.45 + 0.55 * blink : 1
    this.lamps.fillStyle(c, a).fillCircle(b.lamp[0], b.lamp[1], 2.6)
    if (s.status === 'locked') {
      this.over.fillStyle(0x03070c, 0.55).fillRect(x + 5, y + 8, w - 10, h - 20)
      this.over.lineStyle(1, 0x3d5f84, 0.6)
      for (let k = -h; k < w; k += 14) this.over.lineBetween(Math.max(x + 5, x + 5 + k), k < 0 ? y + 8 - k : y + 8, Math.min(x + w - 5, x + 5 + k + h - 20), k + h - 20 > w - 10 ? y + 8 + (w - 10 - k) : y + h - 12)
      return
    }
    // growth bar along the foot of the rack
    if (s.crop && s.status !== 'dead') {
      const bw = w - 60
      this.lamps.fillStyle(0x070d15, 1).fillRect(x + 36, y + h - 6, bw, 3)
      this.lamps.fillStyle(s.status === 'ready' ? CYAN : s.status === 'bad' ? RED : s.status === 'warn' ? AMBER : GREEN, 1).fillRect(x + 36, y + h - 6, bw * Phaser.Math.Clamp(s.progress, 0, 1), 3)
    }
    // a marker over a bay that is ready to harvest or wants its flowers helped
    const here = near?.id === `bay-${b.id}`
    if ((s.status === 'ready' || s.status === 'care' || s.status === 'bad' || s.status === 'dead') && !here) {
      const mx = x + w / 2, my = y - 10 + Math.sin(t * 3.2 + x) * 3
      const col = s.status === 'ready' ? CYAN : s.status === 'care' ? AMBER : RED
      this.mark.fillStyle(0x05121c, 0.92).fillTriangle(mx - 10, my - 9, mx + 10, my - 9, mx, my + 8)
      this.mark.fillStyle(col, 1).fillTriangle(mx - 6.5, my - 6.5, mx + 6.5, my - 6.5, mx, my + 4.5)
    }
  }

  private drawSystems(v: GreenhouseView, t: number, blink: number, breathe: number) {
    const g = this.kiosk, m = moduleById('greenhouse')
    // control kiosk: a glow that goes amber or red with the worst alert
    const [sx, sy, sw, sh] = LIVE.ghScreen
    const col = v.alarm === 'damage' ? RED : v.alarm === 'degraded' || v.alarm === 'warning' ? AMBER : MINT
    g.fillStyle(col, 0.06 + 0.05 * breathe).fillRect(sx, sy, sw, sh)
    // service bay screen: battery and tank as two bars
    const [gx, gy, gw] = LIVE.ghServiceScreen
    const bar = (yy: number, f: number, c: number) => { this.lamps.fillStyle(0x071f30, 1).fillRect(gx + 4, yy, gw - 8, 5); this.lamps.fillStyle(c, 1).fillRect(gx + 4, yy, (gw - 8) * Phaser.Math.Clamp(f, 0, 1), 5) }
    bar(gy + 5, v.batteryPct / 100, v.batteryPct < 20 ? RED : v.sunlit ? MINT : AMBER)
    bar(gy + 14, v.tankPct / 100, v.tankPct < 10 ? RED : CYAN)
    // irrigation: beads run along each loop's supply line while water flows
    for (const loop of ['A', 'B'] as const) {
      const [[x0, y0], [x1]] = LIVE.ghFlow[loop] as [[number, number], [number, number]]
      const f = v.flow[loop]
      if (f > 0.05) for (let d = (t * 60) % 34; d < x0 - x1; d += 34) this.over.fillStyle(CYAN, 0.75 * f).fillCircle(x0 - d, y0, 2)
      else this.over.fillStyle(RED, 0.4 + 0.6 * blink).fillCircle(x0 - 8, y0, 3.2)
    }
    // alarm beacon by the hatch
    if (v.alarm && v.alarm !== 'recovery') {
      const [bx, by] = LIVE.ghBeacon, c = v.alarm === 'warning' ? AMBER : RED
      this.light.fillStyle(c, 0.16 + 0.26 * blink).fillCircle(bx, by, 26)
      this.lamps.fillStyle(c, 0.55 + 0.45 * blink).slice(bx, by + 4, 8, Math.PI, 0, false).fillPath()
    }
    if (v.alarm === 'damage') this.over.fillStyle(0xff2a1a, 0.025 + 0.03 * blink).fillRect(m.x, m.y, m.w, m.h)
    // condensation: a haze low on the back wall when the air is too humid
    if (v.condensation) this.over.fillStyle(0xbfe6ff, 0.05 + 0.03 * breathe).fillRect(m.floor[0], m.y + 20, m.floor[2], m.wallH - 40)
    // array wings: edge-on while feathered, one wing dark while a string is offline
    this.wings.forEach((wing, i) => {
      const h = EXTERIOR.ghArray.wings[i][3]
      const target = v.arrayState === 'feathered' ? 0.16 : 1
      wing.displayHeight += (h * target - wing.displayHeight) * 0.06
      const off = v.arrayState === 'string offline' && i === 1
      wing.setTint(off ? (blink > 0.5 ? 0x7a2a22 : 0x3a1a16) : v.sunlit ? 0xffffff : 0x6f84a0)
    })
    if (v.radiation) this.over.lineStyle(2, 0xc9a2ff, 0.3 + 0.3 * blink).strokeRect(m.floor[0] + 6, m.floor[1] + 6, m.floor[2] - 12, m.floor[3] - 12)
  }
}
