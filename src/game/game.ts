import Phaser from 'phaser'
import geo from '../art/geo.json'
import { SUITS, type SuitId } from '../core/data'
import type { CrewMember, Facing, Pose } from '../core/protocol'
import { held, input } from './input'

export const asset = (f: string) => `${import.meta.env.BASE_URL}assets/${f}`
const SUIT_RES = 3
const DECK_RES = 2
const MAP_RES = 1.5
export const dpr = () => Math.min(window.devicePixelRatio || 1, 2.5)

type TerminalId = 'power' | 'calibration' | 'comms' | 'hab' | 'payload'
export interface Terminal { id: TerminalId; name: string; at: [number, number] }
export const TERMINALS = geo.deck.terminals as Terminal[]
const REACH = 78

// ------------------------------------------------------------------ Boot
class BootScene extends Phaser.Scene {
  constructor() { super('boot') }
  preload() {
    for (const s of SUITS) this.load.svg(`suit-${s.id}`, asset(`suit-${s.id}.svg`), { scale: SUIT_RES })
    this.load.svg('deck', asset('deck.svg'), { scale: DECK_RES })
    this.load.svg('earthview', asset('earth.svg'), { scale: 0.75 })
    for (const p of ['payload', 'hab', 'rack', 'rail']) this.load.svg(`prop-${p}`, asset(`prop-${p}.svg`), { scale: DECK_RES })
    this.load.svg('mars', asset('mars-sector.svg'), { scale: MAP_RES })
    this.load.svg('rover', asset('rover.svg'), { scale: 2 })
  }
  create() {
    const dirs: Facing[] = ['down', 'up', 'side']
    for (const s of SUITS) {
      const tex = this.textures.get(`suit-${s.id}`)
      dirs.forEach((d, row) => {
        for (let col = 0; col < 5; col++) tex.add(`${d}${col}`, 0, col * 64 * SUIT_RES, row * 96 * SUIT_RES, 64 * SUIT_RES, 96 * SUIT_RES)
        this.anims.create({ key: `${s.id}-walk-${d}`, frames: [1, 2, 3, 4].map(i => ({ key: `suit-${s.id}`, frame: `${d}${i}` })), frameRate: 8, repeat: -1 })
      })
    }
    const g = this.make.graphics({}, false)
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8)
    g.generateTexture('spark', 16, 16)
    g.destroy()
    this.game.events.emit('assets-ready')
  }
}

// ------------------------------------------------------------------ Avatar
class Avatar {
  root: Phaser.GameObjects.Container
  sprite: Phaser.GameObjects.Sprite
  shadow: Phaser.GameObjects.Ellipse
  label: Phaser.GameObjects.Text
  suit: SuitId
  facing: Facing = 'down'
  left = false
  moving = false
  jog = false
  constructor(scene: Phaser.Scene, x: number, y: number, suit: SuitId, name: string, remote: boolean) {
    this.suit = suit
    this.shadow = scene.add.ellipse(0, 0, 34, 11, 0x000000, 0.38)
    this.sprite = scene.add.sprite(0, 4, `suit-${suit}`, 'down0').setOrigin(0.5, 1).setScale(1 / SUIT_RES)
    this.label = scene.add.text(0, -100, name, {
      fontFamily: 'Barlow Condensed, Arial Narrow, sans-serif', fontSize: '15px', color: remote ? '#5fd8f0' : '#ece4d2',
      backgroundColor: 'rgba(10,12,16,0.7)', padding: { x: 5, y: 1 }, resolution: dpr() * 2,
    }).setOrigin(0.5, 1)
    this.root = scene.add.container(x, y, [this.shadow, this.sprite, this.label])
  }
  setIdentity(suit: SuitId, name: string) {
    if (suit !== this.suit) { this.suit = suit; this.sprite.setTexture(`suit-${suit}`, `${this.facing}0`) }
    if (this.label.text !== name) this.label.setText(name)
  }
  pose(facing: Facing, left: boolean, moving: boolean, jog: boolean) {
    this.facing = facing; this.left = left; this.moving = moving; this.jog = jog
    this.sprite.setFlipX(facing === 'side' && left)
    if (moving) {
      const key = `${this.suit}-walk-${facing}`
      if (this.sprite.anims.currentAnim?.key !== key || !this.sprite.anims.isPlaying) this.sprite.play(key, true)
      this.sprite.anims.timeScale = jog ? 1.6 : 1
    } else {
      this.sprite.stop()
      this.sprite.setFrame(`${facing}0`)
    }
  }
  place(x: number, y: number) { this.root.setPosition(x, y); this.root.setDepth(y) }
  destroy() { this.root.destroy() }
}

// ------------------------------------------------------------------ Station
export class StationScene extends Phaser.Scene {
  private feet!: Phaser.GameObjects.Zone
  private body0!: Phaser.Physics.Arcade.Body
  private me!: Avatar
  private remotes = new Map<string, { av: Avatar; tx: number; ty: number }>()
  private exterior!: Phaser.GameObjects.Graphics
  private exteriorFx!: Phaser.GameObjects.Graphics
  private earthImg!: Phaser.GameObjects.Image
  private lightFx!: Phaser.GameObjects.Graphics
  private rings!: Phaser.GameObjects.Graphics
  private debugG!: Phaser.GameObjects.Graphics
  private stars: { x: number; y: number; r: number; s: number; a: number }[] = []
  private glows: Phaser.GameObjects.Rectangle[] = []
  private load0: Phaser.GameObjects.Image[] = []
  private vel = new Phaser.Math.Vector2()
  private stepTimer = 0
  private poseTimer = 0
  private lastPose = ''
  private near: Terminal | null = null
  private callout!: Phaser.GameObjects.Container
  private calloutText!: Phaser.GameObjects.Text
  private calloutBg!: Phaser.GameObjects.Graphics
  private startedAt = performance.now()
  debug = false
  profile = { name: 'Pilot', suit: 'ember' as SuitId }
  // callbacks wired by the app
  onNear: (t: Terminal | null) => void = () => {}
  onOpen: (id: TerminalId) => void = () => {}
  onStep: () => void = () => {}
  onPose: (p: Pose) => void = () => {}
  onBlocked: (msg: string) => void = () => {}

  constructor() { super('station') }

  create() {
    const W = geo.deck.width, H = geo.deck.height
    this.startedAt = performance.now()
    this.physics.world.setBounds(0, 0, W, H)
    // exterior layer (seen only through the window cut-outs)
    for (let i = 0; i < 260; i++) this.stars.push({ x: Math.random() * W, y: Math.random() * 214, r: Math.random() ** 3 * 1.6 + 0.4, s: 4 + Math.random() * 10, a: 0.4 + Math.random() * 0.6 })
    this.exterior = this.add.graphics().setDepth(-30)
    this.earthImg = this.add.image(0, 0, 'earthview').setOrigin(0).setDepth(-29)
    this.exteriorFx = this.add.graphics().setDepth(-28)
    this.add.image(0, 0, 'deck').setOrigin(0).setScale(1 / DECK_RES).setDepth(-10)
    this.lightFx = this.add.graphics().setDepth(-9)
    this.rings = this.add.graphics().setDepth(-8)
    const props: [string, number, number, number][] = [['payload', 480, 324, 462], ['hab', 50, 380, 536], ['rack', 974, 370, 518], ['rail', 0, 624, 2000]]
    for (const [k, x, y, depth] of props) this.add.image(x, y, `prop-${k}`).setOrigin(0).setScale(1 / DECK_RES).setDepth(depth)
    const glowAt: [number, number, number, number, number][] = [[233, 153, 82, 58, 0x6ef2c6], [551, 151, 74, 54, 0x6ef2c6], [901, 152, 78, 60, 0x6ef2c6], [972, 142, 52, 40, 0x6ef2c6], [580, 409, 28, 14, 0x6ef2c6], [211, 453, 58, 34, 0x6ef2c6]]
    for (const [x, y, w, h, c] of glowAt) {
      this.glows.push(this.add.rectangle(x, y, w, h, c, 0.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(y < 300 ? -7 : 470))
    }
    this.add.text(118, 108, 'EXTERIOR · 30× PLAYBACK', { fontFamily: 'IBM Plex Mono, monospace', fontSize: '9px', color: '#9fd8e8', resolution: dpr() * 2 }).setDepth(-5).setAlpha(0.8)

    // collision
    const solids = this.physics.add.staticGroup()
    for (const s of geo.deck.solids) {
      const [x, y, w, h] = s.rect
      const z = this.add.zone(x + w / 2, y + h / 2, w, h)
      solids.add(z)
    }
    const [sx, sy] = geo.deck.spawn
    this.feet = this.add.zone(sx, sy, 26, 12)
    this.physics.add.existing(this.feet)
    this.body0 = this.feet.body as Phaser.Physics.Arcade.Body
    this.body0.setCollideWorldBounds(true)
    this.physics.add.collider(this.feet, solids)
    this.me = new Avatar(this, sx, sy, this.profile.suit, this.profile.name, false)

    // pointer: click a terminal within reach
    for (const t of TERMINALS) {
      const solid = geo.deck.solids.find(s => s.id === t.id)!
      const [x, y, w, h] = solid.rect
      const hit = this.add.zone(x + w / 2, y + h / 2 - 30, w, h + 70).setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => {
        if (input.blocked) return
        const d = Phaser.Math.Distance.Between(this.feet.x, this.feet.y, t.at[0], t.at[1])
        if (d <= REACH * 1.9) this.onOpen(t.id)
        else this.onBlocked(`Walk closer to ${t.name} to use it.`)
      })
    }

    this.debugG = this.add.graphics().setDepth(5000)
    // in-world interaction callout (E • terminal name)
    this.calloutBg = this.add.graphics()
    this.calloutText = this.add.text(0, 0, '', { fontFamily: 'Barlow Condensed, Arial Narrow, sans-serif', fontSize: '17px', color: '#e6fbff', resolution: dpr() * 2.5 }).setOrigin(0, 0.5)
    const key = this.add.text(0, 0, 'E', { fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px', fontStyle: 'bold', color: '#05121c', resolution: dpr() * 2.5 }).setOrigin(0.5)
    this.callout = this.add.container(0, 0, [this.calloutBg, key, this.calloutText]).setDepth(4500).setVisible(false)
    key.setPosition(-0, 0)
    this.callout.setData('key', key)
    this.cameras.main.setBounds(0, 0, W, H)
    this.cameras.main.startFollow(this.feet, false, 0.12, 0.12, 0, 20)
    this.cameras.main.setBackgroundColor('#05070d')
    this.layout()
    this.scale.on('resize', this.layout, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this))
  }

  /** Camera framing: keep the astronaut and prompts legible on narrow screens. */
  layout() {
    const cssW = window.innerWidth, cssH = window.innerHeight
    const base = Phaser.Math.Clamp(Math.max(Math.min(cssW / 1120, cssH / 700), cssH / 720), 0.85, 1.6)
    this.cameras.main.setZoom(base * dpr())
    this.cameras.main.setSize(this.scale.width, this.scale.height)
  }

  setProfile(name: string, suit: SuitId) {
    this.profile = { name, suit }
    this.me?.setIdentity(suit, name)
  }

  respawn(x = geo.deck.spawn[0], y = geo.deck.spawn[1]) {
    this.body0.reset(x, y)
    this.vel.set(0, 0)
    this.me.place(x, y)
    this.me.pose('down', false, false, false)
    this.cameras.main.centerOn(x, y - 20)
    this.lastPose = ''
  }

  get position() { return { x: this.feet.x, y: this.feet.y } }
  get pose(): Pose {
    return { x: Math.round(this.feet.x * 10) / 10, y: Math.round(this.feet.y * 10) / 10, facing: this.me.facing, left: this.me.left, moving: this.me.moving, jog: this.me.jog, name: this.profile.name, suit: this.profile.suit }
  }
  forcePoseSend() { this.lastPose = ''; this.poseTimer = 1 }

  // ---- remote crew ----
  upsertRemote(m: CrewMember) {
    let r = this.remotes.get(m.id)
    if (!r) {
      r = { av: new Avatar(this, m.x, m.y, m.suit, m.name, true), tx: m.x, ty: m.y }
      r.av.place(m.x, m.y)
      this.remotes.set(m.id, r)
    }
    r.tx = m.x; r.ty = m.y
    r.av.setIdentity(m.suit, m.name)
    r.av.pose(m.facing, m.left, m.moving, m.jog)
  }
  removeRemote(id: string) { this.remotes.get(id)?.av.destroy(); this.remotes.delete(id) }
  clearRemotes() { for (const id of [...this.remotes.keys()]) this.removeRemote(id) }
  get remoteCount() { return this.remotes.size }
  remoteInfo() { return [...this.remotes.entries()].map(([id, r]) => ({ id, x: Math.round(r.av.root.x), y: Math.round(r.av.root.y), name: r.av.label.text, suit: r.av.suit })) }

  // ---- debug ----
  setDebug(on: boolean) { this.debug = on; if (!on) this.debugG.clear() }
  addLoad(n: number) {
    const room = Math.max(0, 3000 - this.load0.length)
    for (let i = 0; i < Math.min(n, room); i++) {
      const img = this.add.image(Math.random() * 1160, Math.random() * 670, 'spark').setScale(0.2 + Math.random() * 0.5).setAlpha(0.5).setTint(Phaser.Display.Color.HSVToRGB(Math.random(), 0.4, 1).color).setDepth(4000)
      img.setData('v', { x: (Math.random() - 0.5) * 40, y: (Math.random() - 0.5) * 40 })
      this.load0.push(img)
    }
    return this.load0.length
  }
  resetLoad() { this.load0.forEach(i => i.destroy()); this.load0 = []; return 0 }
  get loadCount() { return this.load0.length }

  // ---- frame ----
  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000
    this.drawExterior()
    // movement with acceleration/braking and normalized diagonals
    let ix = (held.right ? 1 : 0) - (held.left ? 1 : 0)
    let iy = (held.down ? 1 : 0) - (held.up ? 1 : 0)
    if (input.blocked) { ix = 0; iy = 0 }
    const len = Math.hypot(ix, iy)
    const jog = held.jog && len > 0
    const speed = jog ? 235 : 145
    const tx = len ? (ix / len) * speed : 0
    const ty = len ? (iy / len) * speed : 0
    const k = 1 - Math.exp(-dt * (len ? 11 : 16))
    this.vel.x += (tx - this.vel.x) * k
    this.vel.y += (ty - this.vel.y) * k
    if (Math.abs(this.vel.x) < 2 && !ix) this.vel.x = 0
    if (Math.abs(this.vel.y) < 2 && !iy) this.vel.y = 0
    this.body0.setVelocity(this.vel.x, this.vel.y)
    const moving = len > 0 && (Math.abs(this.body0.velocity.x) + Math.abs(this.body0.velocity.y) > 20)
    let facing = this.me.facing, left = this.me.left
    if (len) {
      if (Math.abs(ix) > Math.abs(iy) * 0.9) { facing = 'side'; left = ix < 0 } else facing = iy < 0 ? 'up' : 'down'
    }
    this.me.pose(facing, left, moving, jog)
    this.me.place(this.feet.x, this.feet.y)
    if (moving) {
      this.stepTimer -= dt
      if (this.stepTimer <= 0) { this.onStep(); this.stepTimer = jog ? 0.24 : 0.34 }
    } else this.stepTimer = 0.05

    // remote interpolation
    const kr = 1 - Math.exp(-dt * 12)
    for (const r of this.remotes.values()) {
      const x = r.av.root.x + (r.tx - r.av.root.x) * kr
      const y = r.av.root.y + (r.ty - r.av.root.y) * kr
      r.av.place(x, y)
    }

    // nearest terminal
    let best: Terminal | null = null, bd = REACH
    for (const t of TERMINALS) {
      const d = Phaser.Math.Distance.Between(this.feet.x, this.feet.y, t.at[0], t.at[1])
      if (d < bd) { bd = d; best = t }
    }
    if (best !== this.near) { this.near = best; this.onNear(best); this.drawCallout(best) }
    if (this.callout.visible) this.callout.y = this.callout.getData('baseY') + Math.sin(performance.now() / 400) * 2
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300)
    this.rings.clear()
    for (const t of TERMINALS) {
      const on = t === this.near
      this.rings.lineStyle(on ? 3 : 1.5, on ? 0x6ef2c6 : 0x6ef2c6, on ? 0.6 + pulse * 0.4 : 0.18)
      this.rings.strokeEllipse(t.at[0], t.at[1], on ? 70 : 54, on ? 22 : 16)
    }
    this.glows.forEach((g, i) => g.setAlpha(0.08 + 0.08 * Math.sin(performance.now() / 500 + i * 1.7)))

    // pose broadcast at ~15 Hz, only when changed (plus a slow heartbeat)
    this.poseTimer += dt
    if (this.poseTimer >= 1 / 15) {
      const p = this.pose
      const sig = JSON.stringify(p)
      if (sig !== this.lastPose || this.poseTimer > 2) { this.onPose(p); this.lastPose = sig; this.poseTimer = 0 } else this.poseTimer = 1 / 15
    }

    for (const img of this.load0) {
      const v = img.getData('v') as { x: number; y: number }
      img.x = (img.x + v.x * dt + 1160) % 1160
      img.y = (img.y + v.y * dt + 670) % 670
    }
    if (this.debug) this.drawDebug()
  }

  private drawCallout(t: Terminal | null) {
    if (!t) { this.callout.setVisible(false); return }
    const tops: Record<string, number> = { power: 186, calibration: 186, comms: 186, payload: 318, hab: 386 }
    this.calloutText.setText('•  ' + t.name)
    const w = 44 + this.calloutText.width + 14, h = 30
    const g = this.calloutBg
    g.clear()
    g.fillStyle(0x05121c, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, 9)
    g.lineStyle(2, 0x6ef2c6, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 9)
    g.fillStyle(0x6ef2c6, 1).fillRoundedRect(-w / 2 + 6, -h / 2 + 5, 20, 20, 4)
    g.fillStyle(0x6ef2c6, 1).fillTriangle(-6, h / 2, 6, h / 2, 0, h / 2 + 8)
    ;(this.callout.getData('key') as Phaser.GameObjects.Text).setPosition(-w / 2 + 16, 0)
    this.calloutText.setPosition(-w / 2 + 34, 0)
    this.callout.setPosition(t.at[0], tops[t.id] ?? t.at[1] - 120).setData('baseY', tops[t.id] ?? t.at[1] - 120).setVisible(true)
  }

  /** Real seconds since docking, and exterior phase at 30x (92 min orbit => ~184 s loop). */
  get exteriorPhase() { return (((performance.now() - this.startedAt) / 1000 + 8) % 184) / 184 }

  private drawExterior() {
    const g = this.exterior
    const ph = this.exteriorPhase
    const day = ph < 0.62
    const tDay = day ? Math.min(1, Math.sin((ph / 0.62) * Math.PI) * 3) : 0
    g.clear()
    g.fillStyle(Phaser.Display.Color.GetColor(4 + tDay * 8, 7 + tDay * 14, 16 + tDay * 30), 1).fillRect(0, 0, 1160, 214)
    const now = performance.now() / 1000
    for (const s of this.stars) {
      const x = (((s.x - now * s.s) % 1160) + 1160) % 1160
      g.fillStyle(0xffffff, s.a * (1 - tDay * 0.6)).fillCircle(x, s.y, s.r)
    }
    // Earth (bundled texture) drifting below the windows; the limb sits at about y=58.
    const W = 1500, scale = W / this.earthImg.width
    this.earthImg.setScale(scale).setPosition(-170 + Math.sin(ph * Math.PI * 2) * 150 - ((now * 1.5) % 40), 58 - 0.708 * this.earthImg.height * scale)
    const fx = this.exteriorFx
    fx.clear()
    // night side: darken the planet, add city lights
    const night = 1 - tDay
    if (night > 0.02) {
      fx.fillStyle(0x020611, 0.82 * night).fillRect(0, 50, 1160, 170)
      for (let i = 0; i < 46; i++) {
        const bx = ((i * 97 - now * 6) % 1300 + 1300) % 1300 - 70
        fx.fillStyle(0xffd27a, 0.6 * night).fillCircle(bx, 74 + (i * 13) % 50, 1.3)
      }
    }
    // sunrise / sunset glare along the limb
    const edge = Math.min(Math.abs(ph - 0.0), Math.abs(ph - 1), Math.abs(ph - 0.62))
    if (edge < 0.05) {
      const a = 1 - edge / 0.05
      const sx = ph > 0.3 && ph < 0.8 ? 1000 : 160
      fx.fillStyle(0xffb066, 0.35 * a).fillEllipse(sx, 60, 520, 40)
      fx.fillStyle(0xffc27a, 0.5 * a).fillCircle(sx, 58, 50)
      fx.fillStyle(0xfff3d6, 0.95 * a).fillCircle(sx, 58, 13)
    }
    // interior light: warm shafts by day, cool dim at night
    const lf = this.lightFx
    lf.clear()
    if (tDay > 0.05) {
      lf.fillStyle(0xfff0d0, 0.05 * tDay)
      for (const [x, , w] of geo.deck.windows) lf.fillPoints([{ x, y: 214 }, { x: x + w, y: 214 }, { x: x + w + 80, y: 520 }, { x: x + 80, y: 520 }] as Phaser.Types.Math.Vector2Like[], true)
    } else {
      lf.fillStyle(0x0a1838, 0.16).fillRect(0, 0, 1160, 670)
    }
  }

  private drawDebug() {
    const g = this.debugG
    g.clear()
    g.lineStyle(1, 0xff4a4a, 0.9)
    for (const s of geo.deck.solids) g.strokeRect(s.rect[0], s.rect[1], s.rect[2], s.rect[3])
    g.lineStyle(1, 0x6ef2c6, 0.9)
    g.strokeRect(this.body0.x, this.body0.y, this.body0.width, this.body0.height)
    g.lineStyle(1, 0xffb347, 0.5)
    for (const t of TERMINALS) g.strokeCircle(t.at[0], t.at[1], REACH)
  }
}

// ------------------------------------------------------------------ Mars
type Pt = [number, number]
export class MarsScene extends Phaser.Scene {
  private routeG!: Phaser.GameObjects.Graphics
  private fx!: Phaser.GameObjects.Graphics
  private rover!: Phaser.GameObjects.Image
  private route: 'ridge' | 'basin' = 'ridge'
  private along = 0
  private returning = false
  private scanning = false
  private drag: { x: number; y: number; sx: number; sy: number } | null = null
  private pinch: number | null = null
  private viewRect = { x: 0, y: 0, w: 800, h: 600 }

  constructor() { super('mars') }

  create() {
    const { width: W, height: H, base, ice, ridge, basin } = geo.mars
    this.add.image(0, 0, 'mars').setOrigin(0).setScale(1 / MAP_RES)
    this.routeG = this.add.graphics()
    this.fx = this.add.graphics()
    const label = (x: number, y: number, t: string, c = '#ece4d2') => this.add.text(x, y, t, { fontFamily: 'Barlow Condensed, Arial Narrow, sans-serif', fontSize: '22px', color: c, backgroundColor: 'rgba(20,10,6,0.6)', padding: { x: 6, y: 2 }, resolution: dpr() * 2 }).setOrigin(0.5)
    label(base[0], base[1] + 64, 'RELAY BASE')
    label(ice[0], ice[1] - 60, 'ICE SAMPLE SITE', '#bff3ff')
    label(ridge[2][0], ridge[2][1] - 52, 'RIDGE')
    label(basin[0], basin[1] + 40, 'DUSTY BASIN', '#ffd9a8')
    this.add.text(W - 16, H - 14, 'SIMULATED TERRAIN', { fontFamily: 'IBM Plex Mono, monospace', fontSize: '16px', color: '#ffd27a', resolution: dpr() * 2 }).setOrigin(1, 1)
    this.rover = this.add.image(base[0], base[1], 'rover').setScale(0.3).setOrigin(0.52, 0.86).setDepth(10)
    const cam = this.cameras.main
    cam.setBounds(-200, -200, W + 400, H + 400)
    cam.setBackgroundColor('#8a4a2c')
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(dy > 0 ? 0.9 : 1.1, p.x, p.y))
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY } })
    this.input.on('pointerup', () => { this.drag = null; this.pinch = null })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1, p2 = this.input.pointer2
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y)
        if (this.pinch) this.zoomAt(d / this.pinch, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
        this.pinch = d
        return
      }
      if (this.drag && p.isDown) {
        cam.scrollX = this.drag.sx - (p.x - this.drag.x) / cam.zoom
        cam.scrollY = this.drag.sy - (p.y - this.drag.y) / cam.zoom
      }
    })
    this.input.addPointer(1)
    this.setView(this.viewRect)
  }

  /** CSS-pixel rectangle of the map area. */
  setView(r: { x: number; y: number; w: number; h: number }) {
    this.viewRect = r
    if (!this.cameras?.main) return
    const d = dpr()
    this.cameras.main.setViewport(r.x * d, r.y * d, r.w * d, r.h * d)
    this.fit()
  }
  fit() {
    const cam = this.cameras.main
    const z = Math.min(cam.width / geo.mars.width, cam.height / geo.mars.height) * 0.98
    cam.setZoom(z)
    cam.centerOn(geo.mars.width / 2, geo.mars.height / 2)
  }
  zoomAt(f: number, px?: number, py?: number) {
    const cam = this.cameras.main
    const min = Math.min(cam.width / geo.mars.width, cam.height / geo.mars.height) * 0.8
    const before = px !== undefined ? cam.getWorldPoint(px, py!) : null
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, min, min * 6))
    if (before) {
      const after = cam.getWorldPoint(px!, py!)
      cam.scrollX += before.x - after.x
      cam.scrollY += before.y - after.y
    }
  }
  setRoute(r: 'ridge' | 'basin') { this.route = r }
  setRover(along: number, returning: boolean, scanning: boolean) { this.along = along; this.returning = returning; this.scanning = scanning }

  private pointAt(path: Pt[], f: number): { x: number; y: number; ang: number } {
    const segs = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]))
    const total = segs.reduce((a, b) => a + b, 0)
    let d = Phaser.Math.Clamp(f, 0, 1) * total
    for (let i = 0; i < segs.length; i++) {
      if (d <= segs[i] || i === segs.length - 1) {
        const t = segs[i] ? Math.min(1, d / segs[i]) : 0
        const a = path[i], b = path[i + 1]
        return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }
      }
      d -= segs[i]
    }
    return { x: path[0][0], y: path[0][1], ang: 0 }
  }

  update() {
    const routes = geo.mars.routes as unknown as Record<string, Pt[]>
    const g = this.routeG
    g.clear()
    for (const [id, path] of Object.entries(routes)) {
      const sel = id === this.route
      if (sel) {
        g.lineStyle(16, 0x5fd8f0, 0.18).strokePoints(path.map(([x, y]) => ({ x, y })), false)
        g.lineStyle(5, 0x5fd8f0, 1).strokePoints(path.map(([x, y]) => ({ x, y })), false)
      } else {
        for (let f = 0; f < 1; f += 0.025) {
          const a = this.pointAt(path, f), b = this.pointAt(path, f + 0.012)
          g.lineStyle(3, 0xffffff, 0.35).lineBetween(a.x, a.y, b.x, b.y)
        }
      }
    }
    const p = this.pointAt(routes[this.route], this.along)
    this.rover.setPosition(p.x, p.y)
    this.rover.setFlipX(this.returning)
    const pulse = (performance.now() / 900) % 1
    this.fx.clear()
    const [ix, iy] = geo.mars.ice
    this.fx.lineStyle(3, 0xbff3ff, 0.9).strokeCircle(ix, iy, 16)
    this.fx.lineStyle(2, 0xbff3ff, 1 - pulse).strokeCircle(ix, iy, 16 + pulse * 30)
    if (this.scanning) this.fx.lineStyle(3, 0x6ef2c6, 1 - pulse).strokeCircle(p.x, p.y - 10, 20 + pulse * 50)
  }
}

// ------------------------------------------------------------------ Boot the game
export function createGame(parent: HTMLElement): Promise<Phaser.Game> {
  const d = dpr()
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.round(window.innerWidth * d),
    height: Math.round(window.innerHeight * d),
    backgroundColor: '#05070d',
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / d },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [BootScene, StationScene, MarsScene],
    banner: false,
    fps: { target: 60 },
  })
  const resize = () => {
    const r = dpr()
    game.scale.resize(Math.round(window.innerWidth * r), Math.round(window.innerHeight * r))
    game.scale.setZoom(1 / r)
  }
  window.addEventListener('resize', resize)
  return new Promise(res => game.events.once('assets-ready', () => res(game)))
}
