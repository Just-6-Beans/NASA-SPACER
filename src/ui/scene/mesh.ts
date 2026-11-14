// Builds triangle meshes in plain arrays: bodies of revolution, beams, slabs and lofted hulls.
// The launch scene turns these into WebGL buffers. Nothing here touches the DOM or WebGL.
import { cross, direction, identity, norm, point, sub, type M4, type V3 } from './math'

/** A surface finish: base colour (linear), roughness 0 to 1, how metallic, how much it glows, and the spacing in metres of its weld rings (0 for none). */
export interface Mat { col: V3; rough: number; metal?: number; glow?: number; seam?: number }
export const mat = (col: V3, rough: number, metal = 0, glow = 0, seam = 0): Mat => ({ col, rough, metal, glow, seam })

export class Mesh {
  pos: number[] = []
  nrm: number[] = []
  /** r, g, b, roughness: 0 to 1. */
  col: number[] = []
  /** metal, glow, ambient occlusion, weld-ring spacing in tens of metres: 0 to 1. */
  aux: number[] = []
  idx: number[] = []
  /** Applied to everything added while it is set. */
  xf: M4 = identity()
  /** Darkens what is added while it is set: 1 leaves it alone. Used for parts tucked against others. */
  shade: (p: V3, n: V3) => number = () => 1

  get vertices() { return this.pos.length / 3 }

  vertex(p: V3, n: V3, m: Mat, tint = 1): number {
    const P = point(this.xf, p), N = norm(direction(this.xf, n))
    this.pos.push(P[0], P[1], P[2])
    this.nrm.push(N[0], N[1], N[2])
    this.col.push(m.col[0] * tint, m.col[1] * tint, m.col[2] * tint, m.rough)
    this.aux.push(m.metal ?? 0, m.glow ?? 0, this.shade(P, N), (m.seam ?? 0) / 10)
    return this.vertices - 1
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c) }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d) }

  /** A flat polygon given in order, counter-clockwise seen from the side its normal should face. Convex only. */
  face(pts: V3[], m: Mat) {
    const n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])))
    const first = this.vertices
    for (const p of pts) this.vertex(p, n, m)
    for (let i = 1; i < pts.length - 1; i++) this.tri(first, first + i, first + i + 1)
  }

  /**
   * A body of revolution about the y axis. Each section is a run of [radius, y] points drawn from
   * the bottom up; it is smooth along its own length and meets the next section at a crisp edge.
   * `paint` can override the finish by angle (radians) and height, for panels and stripes.
   */
  lathe(sections: { pts: [number, number][]; m: Mat; flat?: boolean }[], seg = 28, paint?: (angle: number, y: number, m: Mat) => Mat) {
    for (const s of sections) {
      const n = s.pts.length
      // slope of the outline at each point: along the section, or per segment when flat
      const tangent = (i: number): [number, number] => {
        const a = s.pts[Math.max(0, i - 1)], b = s.pts[Math.min(n - 1, i + 1)]
        return [b[0] - a[0], b[1] - a[1]]
      }
      const rings: number[][] = []
      const ring = (r: number, y: number, tr: number, ty: number) => {
        const l = Math.hypot(tr, ty) || 1
        const row: number[] = []
        for (let j = 0; j <= seg; j++) {
          const a = (j / seg) * Math.PI * 2
          const c = Math.cos(a), sn = Math.sin(a)
          row.push(this.vertex([r * c, y, r * sn], [(ty / l) * c, -tr / l, (ty / l) * sn], paint ? paint(a, y, s.m) : s.m))
        }
        return row
      }
      if (s.flat) {
        for (let i = 0; i < n - 1; i++) {
          const [tr, ty] = [s.pts[i + 1][0] - s.pts[i][0], s.pts[i + 1][1] - s.pts[i][1]]
          const lo = ring(s.pts[i][0], s.pts[i][1], tr, ty), hi = ring(s.pts[i + 1][0], s.pts[i + 1][1], tr, ty)
          for (let j = 0; j < seg; j++) this.quad(lo[j], hi[j], hi[j + 1], lo[j + 1])
        }
        continue
      }
      for (let i = 0; i < n; i++) { const [tr, ty] = tangent(i); rings.push(ring(s.pts[i][0], s.pts[i][1], tr, ty)) }
      for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) this.quad(rings[i][j], rings[i + 1][j], rings[i + 1][j + 1], rings[i][j + 1])
    }
  }

  /** A box between two corners. */
  box(lo: V3, hi: V3, m: Mat) {
    const [x0, y0, z0] = lo, [x1, y1, z1] = hi
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], m)
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], m)
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], m)
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], m)
    this.face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], m)
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], m)
  }

  /** A six-sided block between two quads. Both are given counter-clockwise seen from B's side. */
  block(A: V3[], B: V3[], m: Mat) {
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.face([A[i], A[j], B[j], B[i]], m) }
    this.face([A[3], A[2], A[1], A[0]], m)
    this.face([B[0], B[1], B[2], B[3]], m)
  }

  /** A square bar from a to b, `w` wide at a and `w2` wide at b. For lattice towers, masts and struts. */
  beam(a: V3, b: V3, w: number, m: Mat, w2 = w) {
    const axis = norm(sub(b, a))
    const side = norm(cross(axis, Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]))
    const other = cross(axis, side)
    const corner = (p: V3, half: number, i: number): V3 => {
      const s = (i === 0 || i === 3 ? -1 : 1) * half, o = (i < 2 ? -1 : 1) * half
      return [p[0] + side[0] * s + other[0] * o, p[1] + side[1] * s + other[1] * o, p[2] + side[2] * s + other[2] * o]
    }
    const A = [0, 1, 2, 3].map(i => corner(a, w / 2, i)), B = [0, 1, 2, 3].map(i => corner(b, w2 / 2, i))
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.face([A[i], A[j], B[j], B[i]], m) }
    this.face([A[3], A[2], A[1], A[0]], m)
    this.face([B[0], B[1], B[2], B[3]], m)
  }

  /**
   * A plate with a convex outline. Each outline point is [u, v, lo, hi]: where it sits in the
   * plate's plane and how far the two faces are from that plane there, so the plate can taper.
   * `place` puts (u, v, w) into space. Outline counter-clockwise seen from the +w side.
   */
  plate(outline: [number, number, number, number][], place: (u: number, v: number, w: number) => V3, top: Mat, bottom: Mat, edge: Mat) {
    const hi = outline.map(([u, v, , h]) => place(u, v, h)), lo = outline.map(([u, v, l]) => place(u, v, l))
    this.face(hi, top)
    this.face([...lo].reverse(), bottom)
    for (let i = 0; i < outline.length; i++) { const j = (i + 1) % outline.length; this.face([lo[i], lo[j], hi[j], hi[i]], edge) }
  }

  /**
   * A hull through a stack of rings. Every ring has the same number of points, in the same order
   * (counter-clockwise seen from the far end). Normals are smoothed. `paint` picks the finish
   * from the ring index, the position round the ring (0 to 1) and the outward normal.
   */
  loft(rings: V3[][], paint: (ring: number, around: number, n: V3) => Mat, capStart?: Mat, capEnd?: Mat) {
    const k = rings[0].length
    const at = (i: number, j: number) => rings[Math.max(0, Math.min(rings.length - 1, i))][((j % k) + k) % k]
    const ids: number[][] = []
    for (let i = 0; i < rings.length; i++) {
      const row: number[] = []
      for (let j = 0; j <= k; j++) {
        const along = sub(at(i + 1, j), at(i - 1, j)), around = sub(at(i, j + 1), at(i, j - 1))
        const n = norm(cross(around, along))
        row.push(this.vertex(at(i, j), n, paint(i, (j % k) / k, n)))
      }
      ids.push(row)
    }
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < k; j++) this.quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j])
    if (capStart) this.face([...rings[0]].reverse(), capStart)
    if (capEnd) this.face(rings[rings.length - 1], capEnd)
  }

  /** Interleaved buffers for WebGL: positions and normals as floats, finish as bytes. */
  pack() {
    const n = this.vertices
    const geo = new Float32Array(n * 6), look = new Uint8Array(n * 8)
    const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
    for (let i = 0; i < n; i++) {
      geo.set([this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2], this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]], i * 6)
      // colours are stored as their square root: more steps for the dark finishes
      look.set([byte(Math.sqrt(this.col[i * 4])), byte(Math.sqrt(this.col[i * 4 + 1])), byte(Math.sqrt(this.col[i * 4 + 2])), byte(this.col[i * 4 + 3]),
        byte(this.aux[i * 4]), byte(this.aux[i * 4 + 1]), byte(this.aux[i * 4 + 2]), byte(this.aux[i * 4 + 3])], i * 8)
    }
    return { geo, look, index: n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), count: this.idx.length }
  }
}

/** Points along a quarter-ellipse nose: from radius r at y0 up to a point (or `tip` radius) at y1. */
export function ogive(r: number, y0: number, y1: number, steps = 10, tip = 0): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push([tip + (r - tip) * Math.cos((t * Math.PI) / 2), y0 + (y1 - y0) * Math.sin((t * Math.PI) / 2)])
  }
  return pts
}
/** An engine bell hanging below y: throat at the top, mouth at the bottom. */
export function bell(y: number, length: number, throat: number, mouth: number, steps = 6): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) { const t = i / steps; pts.push([mouth + (throat - mouth) * t ** 0.6, y - length + length * t]) }
  return pts
}
