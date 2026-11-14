// The live layer of the station: everything on the deck that shows mission state. The art is a
// static picture; this draws on top of it, so the player can read their choices off the room:
// power flowing along the floor buses, the instrument on the rover, the relay link, the alarm.
import Phaser from 'phaser'
import type { InstrumentId, ShipId } from '../core/data'
import type { Power } from '../core/power'
import { BUSES, CONDUITS, DECK, LIVE, MODULES, moduleById, prop, solid, terminal, type Bus, type Pt, type Terminal, type TerminalId } from './deck'
import { findPath, pathLength, pointAlong } from './nav'

/** What the deck needs to know about the mission. Built by the app from the Mission object. */
export interface StationView {
  /** The docked ship, seen behind the docking port and through its window. */
  ship: ShipId
  power: Power
  /** Units each bus needs before the plan can be transmitted. */
  need: Power
  relayFault: boolean
  /** Instrument locked onto the rover (payload active). */
  instrument: InstrumentId | null
  /** Instrument selected at the Payload terminal but not yet activated. */
  instrumentDraft: InstrumentId | null
  calibrated: boolean
  battery: number
  /** One-way signal delay in minutes, or null while the rover plan cannot say yet. */
  linkMin: number | null
  /** Where that delay comes from, for the line under it on the Rover Comms screen. */
  linkNote: string
  /** Rover clock in simulated minutes once the plan is transmitted, else null. */
  passClock: number | null
  passDone: boolean
  water: boolean
  medical: boolean
  /** Terminal the current objective points at, if any. */
  target: TerminalId | null
  urgent: boolean
  guide: boolean
}

export const BUS_COLOR: Record<Bus, number> = { life: 0x6ef2c6, comms: 0x5fd8f0, research: 0xc9a2ff }
const MINT = 0x6ef2c6, CYAN = 0x5fd8f0, AMBER = 0xff9a3c, RED = 0xff4a3a, OFF = 0x2c343d
const DISH_REST = -28
// Where each ship's name plate sits in its 900 px wide artwork, so the plate lands in the window.
const NAME_PLATE: Record<ShipId, number> = { shuttle: 400, falcon9: 352, atlasv: 352 }
const SHIP_W = 450

const vec = (pts: Pt[]) => pts.map(([x, y]) => new Phaser.Math.Vector2(x, y))

export class StationLive {
  private v: StationView | null = null
  private floor: Phaser.GameObjects.Graphics
  private wall: Phaser.GameObjects.Graphics
  private glow: Phaser.GameObjects.Graphics
  private bay: Phaser.GameObjects.Graphics
  private side: Phaser.GameObjects.Graphics
  private holo: Phaser.GameObjects.Graphics
  private sky: Phaser.GameObjects.Graphics
  private wash: Phaser.GameObjects.Graphics
  private marker: Phaser.GameObjects.Graphics
  private ships = new Map<ShipId, Phaser.GameObjects.Image>()
  private dish: Phaser.GameObjects.Image
  private inst: Record<InstrumentId, Phaser.GameObjects.Image>
  private relayLabel: Phaser.GameObjects.Text
  private linkBig: Phaser.GameObjects.Text
  private linkSub: Phaser.GameObjects.Text
  private batt: Phaser.GameObjects.Text
  private lines = Object.fromEntries(BUSES.map(b => [b, vec(CONDUITS[b])])) as Record<Bus, Phaser.Math.Vector2[]>
  private lengths = Object.fromEntries(BUSES.map(b => [b, pathLength(CONDUITS[b])])) as Record<Bus, number>
  private path: Pt[] | null = null
  private pathKey = ''
  private pathFrom: Pt = [0, 0]

  constructor(scene: Phaser.Scene, ships: ShipId[], res: number) {
    const mono = (size: number, color: string, bg = false): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontFamily: 'IBM Plex Mono, monospace', fontSize: `${size}px`, color, resolution: res,
      ...(bg ? { backgroundColor: 'rgba(5,12,20,0.72)', padding: { x: 4, y: 1 } } : {}),
    })
    // outside the windows: the docked ship and the relay antenna (the deck image hides the rest)
    for (const id of ships) {
      const img = scene.add.image(0, 0, `ship-${id}`).setOrigin(0).setDepth(-27).setVisible(false)
      img.setDisplaySize(SHIP_W, (SHIP_W * img.height) / img.width)
      // the name plate sits in the docking port window; the nose and tail show past the module
      const [wx, wy, ww, wh] = LIVE.shipWindow
      img.setPosition(wx + ww / 2 - NAME_PLATE[id] * (SHIP_W / 900), wy + wh / 2 - 105)
      this.ships.set(id, img)
    }
    const [hubX, hubY] = LIVE.relayHub
    scene.add.image(hubX - 14, hubY - 14, 'ext-boom').setOrigin(0).setScale(0.5).setDepth(-27)
    this.dish = scene.add.image(hubX, hubY, 'ext-dish').setOrigin(0.5, 0.875).setScale(0.41).setDepth(-26.5).setAngle(DISH_REST)
    this.sky = scene.add.graphics().setDepth(-26)
    this.relayLabel = scene.add.text(LIVE.relayLabel[0], LIVE.relayLabel[1], '', mono(9, '#9fd8e8', true)).setDepth(-6)

    // on the deck floor, under everything that stands on it
    this.floor = scene.add.graphics().setDepth(-8.6)
    // console screens on the back wall
    this.wall = scene.add.graphics().setDepth(-7)
    this.glow = scene.add.graphics().setDepth(-6.9).setBlendMode(Phaser.BlendModes.ADD)
    const [cx, cy, cw] = LIVE.commsScreen
    this.linkBig = scene.add.text(cx + cw / 2, cy + 38, '', { ...mono(13, '#6ef2c6'), fontStyle: 'bold' }).setOrigin(0.5).setDepth(-6.8)
    this.linkSub = scene.add.text(cx + cw / 2, cy + 50, '', mono(6.5, '#8fd9c4')).setOrigin(0.5).setDepth(-6.8)

    // on the freestanding props (just in front of each prop, behind anyone standing before it)
    const bayDepth = prop('payload').depth + 0.2
    const [rx, ry] = LIVE.rover
    this.inst = {
      ir: scene.add.image(rx + 112, ry - 2, 'prop-inst-ir').setOrigin(0).setScale(0.5).setDepth(bayDepth).setVisible(false),
      gpr: scene.add.image(rx + 118, ry + 54, 'prop-inst-gpr').setOrigin(0).setScale(0.5).setDepth(bayDepth).setVisible(false),
    }
    this.bay = scene.add.graphics().setDepth(bayDepth)
    const [bx, by, bw, bh] = LIVE.battScreen
    this.batt = scene.add.text(bx + bw / 2, by + bh / 2, '', { ...mono(9, '#6ef2c6'), fontStyle: 'bold' }).setOrigin(0.5).setDepth(bayDepth + 0.1)
    this.side = scene.add.graphics().setDepth(prop('hab').depth + 0.2)
    this.holo = scene.add.graphics().setDepth(prop('ops').depth + 0.2).setBlendMode(Phaser.BlendModes.ADD)

    this.wash = scene.add.graphics().setDepth(2600)
    this.marker = scene.add.graphics().setDepth(4400)
  }

  setView(v: StationView) {
    this.v = v
    for (const [id, img] of this.ships) img.setVisible(id === v.ship)
    const relay = v.relayFault ? 'FAULT' : v.passClock !== null && !v.passDone ? 'PASS IN PROGRESS' : 'NOMINAL'
    this.relayLabel.setText(`MARS RELAY · ${relay}`).setColor(v.relayFault ? '#ff8a7a' : '#9fd8e8')
    const mins = v.linkMin === null ? '—' : Number.isInteger(v.linkMin) ? String(v.linkMin) : v.linkMin.toFixed(1)
    this.linkBig.setText(v.relayFault ? 'NO LINK' : `${mins} MIN`).setColor(v.relayFault ? '#ff6a55' : '#6ef2c6')
    this.linkSub.setText(v.linkNote).setVisible(!v.relayFault)
    this.batt.setText(`${v.battery}%`)
    const shown = v.instrument ?? v.instrumentDraft
    for (const id of ['ir', 'gpr'] as InstrumentId[]) this.inst[id].setVisible(shown === id)
    this.pathKey = '' // the guide re-plans on the next frame
  }

  update(now: number, feet: { x: number; y: number }, near: Terminal | null) {
    const v = this.v
    if (!v) return
    const t = now / 1000
    const blink = 0.5 + 0.5 * Math.sin(t * 7)
    const breathe = 0.5 + 0.5 * Math.sin(t * 2)
    this.drawFloor(v, t, breathe, feet, near)
    this.drawWall(v, t, blink, breathe)
    this.drawProps(v, blink, breathe)
    this.drawHolo(v, t, near)
    this.drawSky(v, t, blink)
    this.wash.clear()
    if (v.relayFault) {
      const c = moduleById('comms')
      this.wash.fillStyle(0xff2a1a, 0.02 + 0.03 * blink).fillRect(0, 0, DECK.width, DECK.height)
      this.wash.fillStyle(0xff2a1a, 0.06 * blink).fillRect(c.x, c.y, c.w, c.h)
    }
    this.drawMarker(v, t, near)
  }

  private busOk(v: StationView, bus: Bus) { return v.power[bus] >= v.need[bus] }

  private drawFloor(v: StationView, t: number, breathe: number, feet: { x: number; y: number }, near: Terminal | null) {
    const g = this.floor
    g.clear()
    // node status strips along the ceiling line; a node whose bus is short goes dim
    const ready = BUSES.every(b => this.busOk(v, b)) && !v.relayFault
    for (const m of MODULES) {
      const ok = m.bus ? this.busOk(v, m.bus) : ready
      if (m.bus || ready) g.fillStyle(ok ? (m.bus ? BUS_COLOR[m.bus] : MINT) : AMBER, ok ? 0.9 : 0.55 + 0.4 * breathe).fillRect(m.x + 30, m.y + 10, m.w - 60, 2.4)
      if (m.bus && !ok) g.fillStyle(0x03070c, 0.2).fillRect(m.floor[0], m.floor[1], m.floor[2], m.floor[3])
    }
    // power buses: brightness and pulse density follow the units routed to each
    for (const bus of BUSES) {
      const u = v.power[bus]
      if (u <= 0) continue
      const col = this.busOk(v, bus) ? BUS_COLOR[bus] : AMBER
      g.lineStyle(8, col, 0.05 + 0.012 * u).strokePoints(this.lines[bus], false)
      g.lineStyle(2.4, col, 0.3 + 0.06 * u).strokePoints(this.lines[bus], false)
      const gap = 560 / u
      for (let d = (t * 80) % gap; d < this.lengths[bus]; d += gap) {
        const p = pointAlong(CONDUITS[bus], d)
        g.fillStyle(col, 0.32).fillCircle(p.x, p.y, 5.5)
        g.fillStyle(0xffffff, 0.95).fillCircle(p.x, p.y, 2.1)
      }
    }
    // objective: a pulse on the target terminal and chevrons leading to it
    if (!v.target || near?.id === v.target) return
    const tm = terminal(v.target), col = v.urgent ? RED : MINT
    const pulse = (t * 0.9) % 1
    g.lineStyle(3, col, 0.9 * (1 - pulse)).strokeEllipse(tm.at[0], tm.at[1], 62 + pulse * 56, 19 + pulse * 17)
    if (!v.guide) return
    if (this.pathKey !== v.target || Math.hypot(feet.x - this.pathFrom[0], feet.y - this.pathFrom[1]) > 14) {
      this.path = findPath([feet.x, feet.y], tm.at)
      this.pathKey = v.target
      this.pathFrom = [feet.x, feet.y]
    }
    if (!this.path) return
    const len = pathLength(this.path)
    for (let d = 20 + ((t * 44) % 26); d < len - 20; d += 26) {
      const p = pointAlong(this.path, d), a = Math.min(1, (d - 12) / 40, (len - d) / 34) * 0.8
      const c = Math.cos(p.ang), s = Math.sin(p.ang)
      g.lineStyle(2.6, col, a)
      g.beginPath()
      g.moveTo(p.x - c * 4 - s * 5.5, p.y - s * 4 + c * 5.5)
      g.lineTo(p.x + c * 4, p.y + s * 4)
      g.lineTo(p.x - c * 4 + s * 5.5, p.y - s * 4 - c * 5.5)
      g.strokePath()
    }
  }

  private drawWall(v: StationView, t: number, blink: number, breathe: number) {
    const g = this.wall, glow = this.glow
    g.clear()
    glow.clear()
    // Power Grid screen: ten pips per bus, with a tick at the level needed to transmit
    const [sx, sy, sw, sh] = LIVE.powerScreen
    BUSES.forEach((bus, i) => {
      const cx = sx + sw * (0.2 + 0.3 * i), u = v.power[bus], ok = this.busOk(v, bus)
      for (let k = 0; k < 10; k++) g.fillStyle(k < u ? (ok ? BUS_COLOR[bus] : AMBER) : 0x1b4a40, k < u ? 1 : 0.6).fillRect(cx - 9, sy + sh - 9 - k * 4.6, 18, 3.4)
      if (v.need[bus] > 0) {
        const y = sy + sh - 9 - (v.need[bus] - 1) * 4.6 + 1.7
        g.fillStyle(0xffd27a, 1).fillTriangle(cx - 15, y - 3, cx - 15, y + 3, cx - 11, y)
      }
    })
    glow.fillStyle(MINT, 0.05 + 0.04 * breathe).fillRect(sx, sy, sw, sh)
    // power core: brighter and faster with more units routed
    const [tx, ty, tw, th] = LIVE.coreTube
    const total = v.power.life + v.power.comms + v.power.research
    glow.fillStyle(MINT, 0.04 + 0.018 * total + 0.04 * breathe).fillRoundedRect(tx, ty, tw, th, 10)
    glow.fillStyle(0xeafff7, 0.45).fillEllipse(tx + tw / 2, ty + th - 6 - ((t * (10 + total * 5)) % (th - 12)), tw - 8, 6)
    // Rover Comms screen: Earth, Mars, and a signal crossing between them
    const [cx0, cy0, cw, ch] = LIVE.commsScreen
    const ly = cy0 + 16, ex = cx0 + 15, mx = cx0 + cw - 15
    if (v.relayFault) {
      g.lineStyle(2.2, RED, 0.45 + 0.55 * blink)
      g.lineBetween(cx0 + cw / 2 - 9, ly - 7, cx0 + cw / 2 + 9, ly + 7)
      g.lineBetween(cx0 + cw / 2 - 9, ly + 7, cx0 + cw / 2 + 9, ly - 7)
    } else {
      g.lineStyle(1.2, MINT, 0.5)
      for (let x = ex + 9; x < mx - 9; x += 7) g.lineBetween(x, ly, x + 3.5, ly)
      // one simulated minute of delay is drawn as 0.4 s of travel
      const period = Math.max(1.2, (v.linkMin ?? 8) * 0.4)
      const f = (t % period) / period
      g.fillStyle(0xffffff, 0.95).fillCircle(ex + 9 + (mx - ex - 18) * f, ly, 2.3)
      if (v.passClock !== null && !v.passDone) g.fillStyle(CYAN, 0.95).fillCircle(mx - 9 - (mx - ex - 18) * ((f + 0.5) % 1), ly, 2.3)
    }
    g.fillStyle(0x4f9fe0, 1).fillCircle(ex, ly, 5).fillStyle(0xd9703c, 1).fillCircle(mx, ly, 4)
    glow.fillStyle(v.relayFault ? RED : MINT, 0.05 + 0.04 * breathe).fillRect(cx0, cy0, cw, ch)
    // scope and fault beacon
    const [ox, oy, or] = LIVE.scope
    const ang = t * (v.relayFault ? 5.5 : 1.6)
    g.lineStyle(1.6, v.relayFault ? RED : MINT, 0.9).lineBetween(ox, oy, ox + Math.cos(ang) * (or - 2), oy + Math.sin(ang) * (or - 2))
    if (!v.relayFault) g.fillStyle(MINT, 0.3 + 0.7 * (1 - (ang % (Math.PI * 2)) / (Math.PI * 2))).fillCircle(ox + 8, oy - 6, 1.8)
    if (v.relayFault) {
      const [bx, by] = LIVE.beacon
      glow.fillStyle(RED, 0.2 + 0.3 * blink).fillCircle(bx, by, 30)
      g.fillStyle(0xff6a55, 0.55 + 0.45 * blink).slice(bx, by + 4, 8, Math.PI, 0, false).fillPath()
    }
  }

  private drawProps(v: StationView, blink: number, breathe: number) {
    // rover bay: marker lamps follow the payload, a selected instrument shimmers until activated
    const g = this.bay
    g.clear()
    const [px, py, pw] = solid('payload')
    const lamp = v.instrument ? MINT : v.instrumentDraft ? AMBER : OFF
    for (const x of [px + 18, px + pw - 18]) g.fillStyle(lamp, v.instrument ? 1 : v.instrumentDraft ? 0.5 + 0.5 * blink : 1).fillCircle(x, py - 27, 3)
    for (const id of ['ir', 'gpr'] as InstrumentId[]) this.inst[id].setAlpha(v.instrument === id ? 1 : 0.45 + 0.4 * breathe)
    // hab and calibration bench status lamps
    const s = this.side
    s.clear()
    s.fillStyle(v.water ? 0x4fd0f5 : OFF, 1).fillCircle(LIVE.habWater[0], LIVE.habWater[1], 3.2)
    s.fillStyle(v.medical ? MINT : OFF, 1).fillCircle(LIVE.habMed[0], LIVE.habMed[1], 3.2)
    s.fillStyle(v.calibrated ? MINT : v.instrument ? AMBER : OFF, v.calibrated || !v.instrument ? 1 : 0.5 + 0.5 * breathe).fillCircle(LIVE.labStatus[0], LIVE.labStatus[1], 3.2)
  }

  /** Mars over the Mission Ops table. Decoration: it carries no data. */
  private drawHolo(v: StationView, t: number, near: Terminal | null) {
    const g = this.holo
    g.clear()
    const [hx, hy, hr] = LIVE.holo, [ex, ey] = LIVE.emitter
    const col = v.relayFault ? RED : CYAN
    const a = (near?.id === 'ops' ? 1 : 0.78) * (v.relayFault && Math.sin(t * 31) < 0.2 ? 0.4 : 1)
    g.fillStyle(col, 0.07 * a).fillPoints([{ x: ex - 42, y: ey }, { x: ex + 42, y: ey }, { x: hx + hr * 0.8, y: hy + hr * 0.6 }, { x: hx - hr * 0.8, y: hy + hr * 0.6 }] as Phaser.Types.Math.Vector2Like[], true)
    g.fillStyle(0xd9703c, 0.34 * a).fillCircle(hx, hy, hr)
    g.lineStyle(1.5, col, 0.9 * a).strokeCircle(hx, hy, hr)
    for (let k = 0; k < 4; k++) g.lineStyle(1, col, 0.42 * a).strokeEllipse(hx, hy, Math.abs(Math.cos(((t * 0.3 + k / 4) % 1) * Math.PI)) * hr * 2, hr * 2)
    for (const f of [-0.5, 0, 0.5]) { const r = Math.sqrt(1 - f * f) * hr; g.lineStyle(1, col, 0.32 * a).strokeEllipse(hx, hy + f * hr, r * 2, r * 0.5) }
    g.lineStyle(1.2, col, 0.55 * a).strokeEllipse(hx, hy, hr * 3, hr * 0.72)
    const o = t * 0.9
    g.fillStyle(0xffffff, 0.9 * a).fillCircle(hx + Math.cos(o) * hr * 1.5, hy + Math.sin(o) * hr * 0.36, 2)
  }

  private drawSky(v: StationView, t: number, blink: number) {
    const g = this.sky
    g.clear()
    const active = v.passClock !== null && !v.passDone
    // the dish hunts for the carrier during a fault, holds still during a pass, drifts otherwise
    const ang = DISH_REST + (v.relayFault ? 34 * Math.sin(t * 2.6) : active ? 0 : 4 * Math.sin(t * 0.5))
    this.dish.setAngle(ang)
    const [hubX, hubY] = LIVE.relayHub
    // the feed horn sits 59 px up the dish axis from the pivot
    const r = Phaser.Math.DegToRad(ang), fx = hubX + Math.sin(r) * 59, fy = hubY - Math.cos(r) * 59
    if (v.relayFault) g.fillStyle(RED, 0.4 + 0.6 * blink).fillCircle(fx, fy, 3)
    else if (active) for (let k = 0; k < 3; k++) { const p = (t * 0.7 + k / 3) % 1; g.lineStyle(1.6, CYAN, 0.8 * (1 - p)).strokeCircle(fx, fy, 4 + p * 34) }
    else g.fillStyle(MINT, 0.9).fillCircle(fx, fy, 2)
  }

  private drawMarker(v: StationView, t: number, near: Terminal | null) {
    const g = this.marker
    g.clear()
    if (!v.target || near?.id === v.target) return
    const tm = terminal(v.target), x = tm.at[0], y = tm.callout + 8 + Math.sin(t * 3.2) * 4
    g.fillStyle(0x05121c, 0.92).fillTriangle(x - 13, y - 11, x + 13, y - 11, x, y + 11)
    g.fillStyle(v.urgent ? RED : MINT, 1).fillTriangle(x - 8.5, y - 8, x + 8.5, y - 8, x, y + 6)
  }
}
