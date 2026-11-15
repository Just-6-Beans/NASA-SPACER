// Loading. The game opens on the "Preparing to launch" screen that index.html carries inline.
// Behind it, only what the title, the launch and the station need is made ready: the typefaces,
// the title's Mars, the station art, and the launch field's 3D scene (its programs compiled, its
// rockets built and each drawn once, so the first real frame costs nothing). Everything else, the
// rover's map, photos and films, is fetched quietly while the player plays.
import media from 'virtual:media-list'
import { liftForecast, liftLimitKg } from '../core/ascent'
import { SHIPS } from '../core/data'
import { DELIVERY_ROCKETS } from '../core/delivery'
import { launchScene, type SceneState } from './launchScene'
import { FRAMING, dockShot } from './scene/docking'

const frame = () => new Promise<void>(res => requestAnimationFrame(() => res()))
const wait = (ms: number) => new Promise<void>(res => setTimeout(res, ms))
/** Never lets one slow step hold the game on the loading screen. */
const within = <T>(p: Promise<T>, ms: number) => Promise.race([p.then(() => undefined, () => undefined), wait(ms)])

// ------------------------------------------------------------------ the loading screen
const root = document.getElementById('boot')
const shownAt = performance.now()
/** How long the screen stays up at least, so it never flashes by. */
const MIN_SHOWN_MS = 1600

export const boot = {
  /** 0 to 1 along the bar, and what is being made ready. */
  set(fraction: number, label: string) {
    if (!root) return
    const fill = root.querySelector<HTMLElement>('#boot-fill'), step = root.querySelector<HTMLElement>('#boot-step')
    if (fill) fill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction)).toFixed(3)})`
    if (step && step.textContent !== label) step.textContent = label
  },
  /** The rocket lifts away and the screen clears. Resolves when the fade starts, so the title can begin under it. */
  async done() {
    if (!root) return
    boot.set(1, 'Ready')
    await wait(Math.max(0, MIN_SHOWN_MS - (performance.now() - shownAt)))
    root.classList.add('done')
    setTimeout(() => root.remove(), 1300)
  },
}

// ------------------------------------------------------------------ what must be ready
export interface Step { label: string; weight: number; run: (report: (fraction: number) => void) => Promise<unknown> }

/** Runs the steps together, moving the bar by each one's share, and resolves when all are done or have taken too long. */
export async function prepare(steps: Step[], limitMs = 20000): Promise<void> {
  const total = steps.reduce((a, s) => a + s.weight, 0)
  const done = steps.map(() => 0)
  let label = steps[0]?.label ?? ''
  const show = () => boot.set(steps.reduce((a, s, i) => a + s.weight * done[i], 0) / total, label)
  show()
  const began = performance.now()
  await Promise.all(steps.map((s, i) => within(s.run(f => { done[i] = Math.max(done[i], Math.min(1, f)); if (f < 1) label = s.label; show() }), limitMs).then(() => {
    performance.measure(`boot: ${s.label}`, { start: began, end: performance.now() }) // how long each step took, for the browser's performance tools
    done[i] = 1
    label = steps.find((_, k) => done[k] < 1)?.label ?? label
    show()
  })))
}

/** The three typefaces, in the weights the stylesheet uses. */
export const fontsStep: Step = {
  label: 'Loading typefaces', weight: 1,
  run: () => Promise.all(['500 16px "Barlow Condensed"', '700 16px "Barlow Condensed"', '400 16px "IBM Plex Mono"', '600 16px "IBM Plex Mono"', '400 16px "DM Sans"', '700 16px "DM Sans"'].map(f => document.fonts.load(f))),
}

/** The title's Mars: its surface is baked over a few frames once the title is in the page. */
export const marsStep: Step = {
  label: 'Drawing Mars', weight: 2,
  run: async report => {
    for (let i = 0; i < 400; i++) {
      if (document.querySelector('.t3d-canvas.on') || (i > 30 && !document.querySelector('.t3d-canvas'))) return
      report(Math.min(0.9, i / 40))
      await frame()
    }
  },
}

/**
 * The launch field's 3D scene. Building it compiles its programs; each rocket is then built and
 * drawn once into a hidden canvas, which is what makes the graphics driver finish its own work
 * now instead of on the first frame the player sees.
 */
export const launchStep: Step = {
  label: 'Building the launch pad', weight: 4,
  run: async report => {
    await frame()
    const s = launchScene()
    if (!s) return
    report(0.25)
    await frame()
    const holder = document.createElement('div')
    holder.setAttribute('aria-hidden', 'true')
    // the size of the window, so the drawing surface is already the size the launch field will use
    holder.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;opacity:0;pointer-events:none;z-index:-1'
    document.body.append(holder)
    holder.append(s.canvas)
    const still: SceneState = { time: 0, ship: SHIPS[0].id, dim: 0, descent: 0, chase: 0, ptr: [0, 0], shiftY: 0, ignite: 0, flight: null, orbit: 0, boom: -1 }
    // the crew's launch systems, then the rockets that carry the rover: building one takes a
    // third of a second, which would show as a freeze if it happened while something moved
    const stacks = [...SHIPS.map(x => x.id), ...DELIVERY_ROCKETS.map(x => x.id)]
    try {
      for (const [i, id] of stacks.entries()) {
        s.prepare(id)
        await frame()
        s.draw({ ...still, ship: id, descent: 1 }) // the fall from orbit the field opens with
        s.draw({ ...still, ship: id })             // on the pad
        report(0.25 + 0.6 * ((i + 1) / stacks.length))
        await frame()
      }
      // the climb and the view from orbit, far above the pad so no smoke is left behind on it
      const high = { alt: 90000, range: 60000, pitch: 1.2, thrust: 1, stage: 2 as const, sinceStaging: 6, air: 0, shake: 0 }
      s.draw({ ...still, chase: 1, flight: high })
      s.draw({ ...still, chase: 1, orbit: 1, flight: { ...high, thrust: 0 } })
      report(0.9)
      await frame()
      // the docking film: the station and each spacecraft, built and drawn once from both of its cameras
      for (const ship of SHIPS) {
        s.prepareDock(ship.id)
        await frame()
        for (const t of [2, 9.6]) s.draw({ ...still, dock: { ship: ship.id, shot: dockShot(t, FRAMING[ship.id], 1.6), alt: 408000, range: 0 } })
      }
      report(0.97)
      await frame()
    } finally {
      s.canvas.remove()
      holder.remove()
    }
  },
}

/**
 * The lift forecast for each launch system with the cargo saved from last time. The launch field
 * shows it the moment it opens, and working it out means flying several whole ascents in the
 * model; the answers are kept, so the field finds them ready.
 */
export const forecastStep = (cargoKgNow: number): Step => ({
  label: 'Planning the climb', weight: 2,
  run: async report => {
    for (const [i, ship] of SHIPS.entries()) {
      await frame()
      liftForecast(ship.id, cargoKgNow)
      await frame()
      liftLimitKg(ship.id)
      report((i + 1) / SHIPS.length)
    }
  },
})

// ------------------------------------------------------------------ the rest, while the player plays
/** What comes first: the order the game reaches them in. Films are last and largest. */
const ORDER = ['nasa/earth/', 'nasa/rovers/', 'nasa/samples/', 'nasa/perseverance/', 'nasa/curiosity/', 'nasa/map/', 'nasa/video/']
const rank = (file: string) => { const i = ORDER.findIndex(p => file.startsWith(p)); return i < 0 ? ORDER.length : i }
let resting = false

/**
 * Fetches the rover's map, photos and films into the browser's cache, two at a time, so they are
 * there when the rover part opens. Only the network is used: nothing here holds up a frame.
 * Does nothing where the player has asked the browser to save data.
 */
export function loadTheRest(): { done: Promise<void>; progress: () => { files: number; of: number } } {
  const list = [...media].sort((a, b) => rank(a.file) - rank(b.file) || a.bytes - b.bytes)
  let fetched = 0
  const progress = () => ({ files: fetched, of: list.length })
  if (resting) return { done: Promise.resolve(), progress }
  resting = true
  const saver = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData
  if (saver) return { done: Promise.resolve(), progress }
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const item = list[next++]
      try { await (await fetch(`${import.meta.env.BASE_URL}${item.file}`, { priority: 'low' } as RequestInit)).arrayBuffer() } catch { /* offline or missing: the game asks again when it needs the file */ }
      fetched++
      await wait(40) // leave the connection and the main thread some air
    }
  }
  return { done: wait(1500).then(() => Promise.all([worker(), worker()])).then(() => undefined), progress }
}
