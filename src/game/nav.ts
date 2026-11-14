// Walkable routes across the station deck, for the floor guide. Pure TypeScript over the same
// collision rectangles Phaser uses, so a test can prove every terminal is reachable.
import { DECK, SOLIDS, type Pt } from './deck'

const CELL = 10
const COLS = Math.ceil(DECK.width / CELL)
const ROWS = Math.ceil(DECK.height / CELL)
// The astronaut collides as a 26 x 12 box at the feet. A cell is open when that box, centred
// on the cell, clears every solid with a little room to spare.
const PAD_X = 16
const PAD_Y = 9

const blocked = new Uint8Array(COLS * ROWS)
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2
  if (SOLIDS.some(({ rect: [sx, sy, sw, sh] }) => x > sx - PAD_X && x < sx + sw + PAD_X && y > sy - PAD_Y && y < sy + sh + PAD_Y)) blocked[r * COLS + c] = 1
}

const cellOf = (x: number, y: number): [number, number] => [Math.floor(x / CELL), Math.floor(y / CELL)]
const open = (c: number, r: number) => c >= 0 && r >= 0 && c < COLS && r < ROWS && !blocked[r * COLS + c]
const centre = (c: number, r: number): Pt => [c * CELL + CELL / 2, r * CELL + CELL / 2]

/** True when the astronaut can stand at this deck position. */
export const walkable = (x: number, y: number) => open(...cellOf(x, y))

function nearestOpen(c: number, r: number): [number, number] | null {
  if (open(c, r)) return [c, r]
  for (let d = 1; d <= 8; d++) {
    let best: [number, number] | null = null, bd = Infinity
    for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== d || !open(c + dc, r + dr)) continue
      const dist = dc * dc + dr * dr
      if (dist < bd) { bd = dist; best = [c + dc, r + dr] }
    }
    if (best) return best
  }
  return null
}

/** Everywhere the astronaut can walk to from a deck position. Returns a test for one position. */
export function reachableFrom(from: Pt): (x: number, y: number) => boolean {
  const seen = new Uint8Array(COLS * ROWS)
  const start = nearestOpen(...cellOf(from[0], from[1]))
  if (start) {
    const queue = new Int32Array(COLS * ROWS)
    let head = 0, tail = 0
    queue[tail++] = start[1] * COLS + start[0]
    seen[queue[0]] = 1
    while (head < tail) {
      const i = queue[head++], c = i % COLS, r = (i - c) / COLS
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr, ni = nr * COLS + nc
        if (open(nc, nr) && !seen[ni]) { seen[ni] = 1; queue[tail++] = ni }
      }
    }
  }
  return (x, y) => { const [c, r] = cellOf(x, y); return c >= 0 && r >= 0 && c < COLS && r < ROWS && !!seen[r * COLS + c] }
}

/** Straight-line walk between two points with no solid in the way. */
export function clearLine(a: Pt, b: Pt) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4)
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0
    if (!walkable(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false
  }
  return true
}

/** Shortest walkable route as a few straight segments, or null if the target cannot be reached. */
export function findPath(from: Pt, to: Pt): Pt[] | null {
  const start = nearestOpen(...cellOf(from[0], from[1]))
  const goal = nearestOpen(...cellOf(to[0], to[1]))
  if (!start || !goal) return null
  const prev = new Int32Array(COLS * ROWS).fill(-1)
  const si = start[1] * COLS + start[0], gi = goal[1] * COLS + goal[0]
  const queue = new Int32Array(COLS * ROWS)
  let head = 0, tail = 0
  queue[tail++] = si
  prev[si] = si
  while (head < tail && prev[gi] < 0) {
    const i = queue[head++], c = i % COLS, r = (i - c) / COLS
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, ni = nr * COLS + nc
      if (open(nc, nr) && prev[ni] < 0) { prev[ni] = i; queue[tail++] = ni }
    }
  }
  if (prev[gi] < 0) return null
  const cells: Pt[] = []
  for (let i = gi; ; i = prev[i]) {
    const c = i % COLS
    cells.push(centre(c, (i - c) / COLS))
    if (i === si) break
  }
  cells.reverse()
  // Pull the staircase of cells tight: keep only the corners that are really needed.
  const raw: Pt[] = [walkable(from[0], from[1]) ? from : cells[0], ...cells.slice(1, -1), walkable(to[0], to[1]) ? to : cells[cells.length - 1]]
  const path: Pt[] = [raw[0]]
  for (let i = 0; i < raw.length - 1;) {
    let j = raw.length - 1
    while (j > i + 1 && !clearLine(raw[i], raw[j])) j--
    path.push(raw[j])
    i = j
  }
  return path
}

export const pathLength = (path: Pt[]) => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0)

/** Position and heading at distance d along a path. */
export function pointAlong(path: Pt[], d: number): { x: number; y: number; ang: number } {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (d <= len || i === path.length - 2) {
      const t = len ? Math.min(1, Math.max(0, d / len)) : 0
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }
    }
    d -= len
  }
  return { x: path[0][0], y: path[0][1], ang: 0 }
}
