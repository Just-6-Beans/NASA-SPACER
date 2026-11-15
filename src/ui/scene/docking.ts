// The docking film: where the spacecraft, the hatch and the camera are at each moment.
//
// OUR OWN STAGING, an artist's impression. A real approach takes hours and closes at a few
// centimetres a second; the film shows it in seconds, and says so on screen. It is not playable.
//
// The film's frame: metres; the centre of the station's docking ring is the origin; the
// spacecraft closes along +x; the Earth is below (-y); the outside camera stands on the +z side.
// Nothing here touches the DOM or WebGL, so the staging can be checked without a browser.
import type { ShipId } from '../../core/data'
import { clamp, mix, rad, smooth, type V3 } from './math'

/** How long the film runs, seconds. */
export const DOCK_SECONDS = 10.8
/** The change from the outside view to the docking camera, the touch of the two rings, and the hatch starting to swing. */
export const CUT = 5.0, CONTACT = 8.3, HATCH = 8.95
const START_GAP = 26

/**
 * What the camera needs to know about each spacecraft: how far back from its docking ring it
 * reaches, how far below the ring's line its middle hangs, and half its height seen from the side.
 */
export interface Framing { reach: number; drop: number; tall: number }
export const FRAMING: Record<ShipId, Framing> = {
  falcon9: { reach: 8, drop: 0, tall: 3 },
  atlasv: { reach: 6.5, drop: 0, tall: 3.2 },
  shuttle: { reach: 8, drop: 6.2, tall: 18.5 }, // it docks back first, standing on its tail
}

export interface DockShot {
  /** From beside the spacecraft, or from the camera in its docking ring. */
  view: 'outside' | 'nose'
  eye: V3
  target: V3
  /** Vertical field of view, radians, and the nearest distance drawn. */
  fov: number
  near: number
  /** Metres between the two docking rings. */
  gap: number
  /** The hatch, 0 shut to 1 open, and how much light comes through it. */
  hatch: number
  light: number
  /** The small thrusters, 0 to 1. */
  jets: number
  /** The picture dipped to black (the start, and the change of camera) and lost in the light at the end, 0 to 1 each. */
  black: number
  white: number
  beat: 'approach' | 'final' | 'contact' | 'hatch'
}

/** Short pulses of the thrusters: when each starts. */
const PULSES = [0.7, 1.9, 3.1, 4.2, 5.9, 7.1]

/** The film at `t` seconds, framed for one spacecraft on a screen `aspect` wide for its height. */
export function dockShot(t: number, craft: Framing, aspect: number): DockShot {
  const gap = START_GAP * (1 - clamp(t / CONTACT)) ** 1.6
  const hatch = smooth(HATCH, 9.85, t), light = smooth(9.0, 10.2, t)
  const jets = Math.max(0, ...PULSES.map(p => smooth(p, p + 0.05, t) * (1 - smooth(p + 0.16, p + 0.3, t))))
  const black = Math.max(1 - smooth(0, 0.8, t), 1 - clamp(Math.abs(t - CUT) / 0.24))
  const white = smooth(9.9, 10.6, t)
  const beat = t < CUT ? 'approach' : t < CONTACT ? 'final' : t < HATCH ? 'contact' : 'hatch'
  if (t < CUT) {
    // beside the spacecraft and a little above it, moving in as the gap closes, so both it and the docking ring stay in the picture
    const fov = rad(38)
    const wide = Math.tan(fov / 2) * Math.max(0.5, aspect)
    // far enough back for the spacecraft and the docking ring across the picture, and for the spacecraft's height between the film's bars
    const dist = Math.max((gap + craft.reach + 7) / (2 * wide * 0.78), craft.tall / (Math.tan(fov / 2) * 0.68))
    const target: V3 = [2.5 - (gap + craft.reach) / 2, -craft.drop, 0]
    const swing = mix(-0.34, -0.16, smooth(0, CUT, t))
    return { view: 'outside', eye: [target[0] + swing * dist, target[1] + 0.22 * dist, 0.9 * dist], target, fov, near: Math.max(1, dist * 0.04), gap, hatch, light, jets, black, white, beat }
  }
  // the camera in the spacecraft's docking ring: a last drift onto the centre line, the touch, then through the open hatch
  const off = gap / 8, since = t - CONTACT
  const jolt = since > 0 ? Math.exp(-since * 5) * Math.sin(since * 38) * 0.03 : 0
  const through = 2.9 * smooth(9.45, 10.75, t) ** 1.5
  const eye: V3 = [-gap - 1.2 + through, 0.2 * off * Math.sin(t * 1.3) + jolt, 0.24 * off * Math.cos(t * 0.9) + jolt * 0.6]
  return { view: 'nose', eye, target: [eye[0] + 10, 0, 0], fov: rad(62), near: 0.1, gap, hatch, light, jets, black, white, beat }
}
