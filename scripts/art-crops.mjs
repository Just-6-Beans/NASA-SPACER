// Crop sprite sheets for the station greenhouse: one sheet per crop, growth stage across and
// leaf condition down. Pure functions that return SVG strings; scripts/gen-art.mjs saves them.
//
// Sheet: 576 x 480, a grid of 72 x 120 frames on a transparent background.
//   columns 0-7  seed, germination, seedling, vegetative, reproductive, ready, postharvest, dead
//   rows 0-3     healthy, wilting, yellowing, spots (columns 0 and 7 are the same in every row)
// Frame: the plant is centred on x = 36 and stands in a plug collar at y 92-100. Everything above
// y = 100 is what the deck shows on the rack. From y = 100 to 120 is the root zone, for the
// inspection panel only: plug body, roots, the radish root and the potato tubers.
// For the leaf and root crops column 4 is the plant bolting to seed (a bay kept for seed).
// The drawings are our own stylised art, lit from the upper left, not botanical plates.

export const CROP_FRAME = { w: 72, h: 120, cols: 8, rows: 4, ground: 100 }

const FW = CROP_FRAME.w, FH = CROP_FRAME.h, CX = 36
/** The substrate surface inside the plug collar, where stems come out. */
const SOIL = 94.2
/** Nothing that grows above the tray may hang below this line. */
const FLOOR = 99.2
const OUTL = '#2a2620'
const NS = ' stroke="none"'
const IDS = ['lettuce', 'mizuna', 'kale', 'radish', 'tomato', 'pepper', 'potato', 'wheat', 'soybean']

// Deterministic PRNG, so the art is byte-identical on every run.
const lcg = seed => { let s = seed % 2147483647; const next = () => ((s = (s * 16807) % 2147483647) / 2147483647); next(); next(); return next }

// ------------------------------------------------------------------ geometry
const rad = d => (d * Math.PI) / 180
/** Unit vector for an angle measured from straight up, clockwise. */
const dir = a => [Math.sin(rad(a)), -Math.cos(rad(a))]
/** Unit vector to the right of that direction. */
const nrm = a => [Math.cos(rad(a)), Math.sin(rad(a))]
const sgn = (v, d = 1) => (v > 0 ? 1 : v < 0 ? -1 : d)
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('') }

// Extent of what a frame draws, to catch anything that would be cropped.
let box = [999, 999, -999, -999]
const mark = (x, y) => { if (x < box[0]) box[0] = x; if (y < box[1]) box[1] = y; if (x > box[2]) box[2] = x; if (y > box[3]) box[3] = y }
const f = n => { const v = Math.round(n * 10) / 10; return v === 0 ? '0' : String(v) }
const P = (x, y) => { mark(x, y); return `${f(x)} ${f(y)}` }
/** A point that steers a curve without lying on it. */
const C = (x, y) => `${f(x)} ${f(y)}`
const mid2 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

/** Smooth curve from the current point through the control points to `end` (a quadratic chain). */
function chain(ctl, end) {
  if (!ctl.length) return `L${P(end[0], end[1])}`
  let s = `Q${P(ctl[0][0], ctl[0][1])} `
  if (ctl.length === 1) return s + P(end[0], end[1])
  const m = mid2(ctl[0], ctl[1])
  s += C(m[0], m[1])
  for (let i = 1; i < ctl.length - 1; i++) { const q = mid2(ctl[i], ctl[i + 1]); s += `T${C(q[0], q[1])}` }
  return s + `T${P(end[0], end[1])}`
}

const dot = (x, y, r, fill, extra = '') => { mark(x - r, y - r); mark(x + r, y + r); return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"${extra}/>` }
const oval = (x, y, rx, ry, fill, extra = '') => { mark(x - rx, y - ry); mark(x + rx, y + ry); return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>` }
/** A stem or stalk: a dark line with a coloured line inside it. Hair-thin ones are one darker line. */
const stem2 = (d, w, col) => (w <= 1
  ? `<path d="${d}" fill="none" stroke="${mix(col, OUTL, .4)}" stroke-width="${f(w + .7)}"/>`
  : `<path d="${d}" fill="none" stroke-width="${f(w + 1.4)}"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}"/>`)
const line = (d, col, w, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f(w)}"${extra}/>`

// ------------------------------------------------------------------ colour
// Each crop has three leaf gradients (a light, b mid, c dark). The sheet derives the wilted set
// (d, e, f), the yellowed pair (y old leaves, p young leaves) and the dead pair (x, z) from them.
const PAL = {
  lettuce: { k: 'lt', tag: '#8fd35f', a: ['#dcf7a6', '#a8e166', '#6db640'], b: ['#c0ec80', '#86d054', '#509b36'], c: ['#97d564', '#64af46', '#3d7f2e'], stem: '#b8e08a', rib: '#f0fad2', stalk: '#cfeaa0',
    extra: [['u', ['#5fa944', '#84964c', '#96305a'], 'x1="1" y1="1" x2="0" y2="0"'], ['v', ['#5fa944', '#84964c', '#96305a'], 'x1="0" y1="1" x2="1" y2="0"']] },
  mizuna: { k: 'mz', tag: '#5fb84a', a: ['#cdf296', '#92da5e', '#5caa3e'], b: ['#a4de6a', '#66b848', '#3f8c33'], c: ['#72c04e', '#499a3a', '#2e722a'], stem: '#bfe590', rib: '#e6f6c6', stalk: '#e2f1c2' },
  kale: { k: 'ka', tag: '#4fa884', a: ['#c4ecd4', '#80cca6', '#4c9d7c'], b: ['#94d4b3', '#55a986', '#337d65'], c: ['#66b190', '#3c886c', '#245f4d'], stem: '#cfe8da', rib: '#e4f4ea', stalk: '#d6ece0' },
  radish: { k: 'rd', tag: '#e0445c', a: ['#c8ee8e', '#8ad258', '#57a33c'], b: ['#a6de6a', '#6cbb4a', '#438d32'], c: ['#80c456', '#519d3c', '#33732c'], stem: '#e58aa2', rib: '#f6d6de', stalk: '#e27892',
    extra: [['R', ['#ff9db0', '#e3364f', '#8f1230'], 'ball'], ['S', ['#b8726c', '#8a4440', '#562824'], 'ball']] },
  tomato: { k: 'tm', tag: '#e8523a', a: ['#bdea8e', '#80c95e', '#4e9d40'], b: ['#93d36a', '#5bad47', '#378234'], c: ['#6bb34d', '#438d3b', '#2a692b'], stem: '#74b250', rib: '#d9f0b6',
    extra: [['R', ['#ffad90', '#ea4230', '#a31d14'], 'ball'], ['O', ['#ffdc9a', '#f2962e', '#b8601a'], 'ball'], ['G', ['#e4f7a8', '#a8da62', '#6a9c38'], 'ball']] },
  pepper: { k: 'pp', tag: '#f08a2a', a: ['#aee490', '#66bc5e', '#378c41'], b: ['#80cc6e', '#47a14b', '#277237'], c: ['#5bac56', '#31873e', '#1c5d2c'], stem: '#5fa84c', rib: '#cdeeb8',
    extra: [['R', ['#ff9c82', '#e23221', '#98160f'], 'x1="0" y1="0" x2="1" y2="0"'], ['G', ['#c2e878', '#6cab3c', '#3f7627'], 'x1="0" y1="0" x2="1" y2="0"']] },
  potato: { k: 'pt', tag: '#d2ab6c', a: ['#b9e48e', '#7cc15c', '#4c9342'], b: ['#90cc6c', '#5aa34c', '#397d38'], c: ['#6cab52', '#468842', '#2c6432'], stem: '#7aa85a', rib: '#d6eeba',
    extra: [['m', ['#ece58e', '#c6c65a', '#8f923c']], ['T', ['#f6e2ae', '#d4ac6a', '#9a7240'], 'ball'], ['U', ['#b89a6c', '#8a6c44', '#59432a'], 'ball']] },
  wheat: { k: 'wh', tag: '#ecc45a', a: ['#d6f092', '#a2d55e', '#6ca73e'], b: ['#b4de6e', '#7fc04a', '#519136'], c: ['#8fc758', '#62a340', '#3e7b30'], stem: '#8fc45a', rib: '#e4f5c0',
    extra: [['g', ['#fff2ae', '#eec65c', '#b98a2c']], ['h', ['#dcf2a0', '#aad264', '#76a242']], ['s', ['#f0e092', '#cdb65e', '#9c843a']]] },
  soybean: { k: 'sy', tag: '#b9c24e', a: ['#c6ec90', '#8ace5c', '#57a33e'], b: ['#a0da6c', '#69b64a', '#428b31'], c: ['#7cbe54', '#4e9a3c', '#31712c'], stem: '#7fb658', rib: '#dcf2bc',
    extra: [['m', ['#eae684', '#c5c656', '#90983a']], ['G', ['#d2ee90', '#96ca56', '#619838']], ['T', ['#f0dca8', '#cba86a', '#8f6e3c']]] },
}

const grad = (id, [c0, c1, c2], v) => `<linearGradient id="${id}" ${v || 'x1="0" y1="0" x2="1" y2="1"'}><stop offset="0" stop-color="${c0}"/><stop offset=".55" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`
const ball = (id, [c0, c1, c2]) => `<radialGradient id="${id}" cx=".34" cy=".3" r=".85"><stop offset="0" stop-color="${c0}"/><stop offset=".5" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`

function defsFor(pal) {
  const k = pal.k
  const dull = t => t.map(x => mix(mix(x, '#75845a', .44), '#000000', .06))
  let s = grad(k + 'a', pal.a) + grad(k + 'b', pal.b) + grad(k + 'c', pal.c)
    + grad(k + 'd', dull(pal.a)) + grad(k + 'e', dull(pal.b)) + grad(k + 'f', dull(pal.c))
    + grad(k + 'y', ['#fcf2a4', '#e6cd54', '#b0912c']) + grad(k + 'p', pal.b.map(x => mix(x, '#f2ea8c', .6)))
    + grad(k + 'x', ['#c9a56e', '#967241', '#5a4124']) + grad(k + 'z', ['#98784c', '#6b4d2c', '#3f2c18'])
    + grad(k + 'n', ['#5a646f', '#3c444e', '#22272e'], 'x1="0" y1="0" x2="0" y2="1"') + grad(k + 'q', ['#3a424b', '#2a3038', '#1a1e24'], 'x1="0" y1="0" x2="0" y2="1"')
    + `<clipPath id="${k}clip"><rect width="${FW}" height="${FH}"/></clipPath>`
  for (const [id, stops, kind] of pal.extra ?? []) s += kind === 'ball' ? ball(k + id, stops) : grad(k + id, stops, kind)
  return s
}

/** Which gradient a leaf takes in this row. `tint` is a special colour for healthy plants, `tintAll` also survives wilting, `keep` survives everything but death. */
function fillOf(c, o) {
  const tone = o.tone ?? 'b'
  if (c.dead) return c.k + (tone === 'c' ? 'z' : 'x')
  if (o.keep) return c.k + o.keep
  if (c.yellow) return c.k + ((o.age ?? .5) >= .5 ? 'y' : 'p')
  if (o.tintAll) return c.k + o.tintAll
  if (c.droop) return c.k + { a: 'd', b: 'e', c: 'f' }[tone]
  return c.k + (o.tint ?? tone)
}
/** A stem colour in this row. */
const tint = (c, col) => (c.dead ? '#6b4e2e' : c.yellow ? mix(col, '#e6dc78', .5) : c.droop ? mix(col, '#76855a', .45) : col)

function lesion(c, x, y, r) {
  const halo = c.rs() < .45
  return dot(x, y, r, '#8f5d2b', ` stroke="${halo ? '#e2cb52' : '#4c2f14'}" stroke-width="${halo ? '.7' : '.5'}"`)
}

// ------------------------------------------------------------------ leaves
/**
 * A leaf blade from (x, y), pointing along `a`, `L` long and `W` wide. `curl` turns it as it
 * goes. Wilting leans and bends it; the loop keeps it inside the frame and above the tray.
 */
function blade(c, x, y, a, L, W, o = {}) {
  const side = o.side ?? sgn(a)
  let curl = o.curl ?? 0
  if (c.droop && !o.stiff) { a += side * (c.dead ? 26 : o.dA ?? 24) * c.droop; curl += side * (c.dead ? 54 : o.dC ?? 50) * c.droop; W *= .9 }
  if (c.dead) { W *= .55; L *= .84 }
  const n = o.n ?? 6, edge = o.edge ?? 'smooth', amp = o.amp ?? 0, ph = o.phase ?? 0
  const pw = Math.log(.5) / Math.log(o.wp ?? .45), q = o.q ?? .8
  const prof = o.prof ?? (t => Math.pow(Math.sin(Math.PI * Math.pow(t, pw)), q))
  let mid, ang, R, Lf, ws
  for (let it = 0; it < 40; it++) {
    mid = [[x, y]]; ang = [a]; R = []; Lf = []; ws = [0]
    let px = x, py = y
    for (let i = 1; i <= n; i++) {
      const [ux, uy] = dir(a + (curl * (i - .5)) / n)
      px += (ux * L) / n; py += (uy * L) / n
      mid.push([px, py]); ang.push(a + (curl * i) / n)
    }
    for (let i = 1; i < n; i++) {
      const w = (W / 2) * prof(i / n)
      let wr = w, wl = w
      if (edge === 'wave') { wr *= 1 + amp * Math.sin(i * 2.3 + ph); wl *= 1 + amp * Math.sin(i * 2.9 + ph + 1.7) }
      else if (edge === 'frill') { wr *= i % 2 ? 1 + amp : 1 - amp; wl *= i % 2 ? 1 - amp : 1 + amp }
      else if (edge === 'teeth' || edge === 'lobes') { const kk = i % 2 ? 1 : 1 - amp; wr *= kk; wl *= kk }
      ws.push(w)
      const [nx, ny] = nrm(ang[i])
      R.push([mid[i][0] + nx * wr, mid[i][1] + ny * wr]); Lf.push([mid[i][0] - nx * wl, mid[i][1] - ny * wl])
    }
    let low = false, wide = 0, high = false
    for (const [qx, qy] of [...R, ...Lf, mid[n]]) { if (qy > (o.floor ?? FLOOR)) low = true; if (qx < 3) wide = -1; if (qx > 69) wide = 1; if (qy < 3.5) high = true }
    if (!low && !wide && !high) break
    const sg = sgn(a + curl / 2, side)
    if (low) { a -= sg * 6; curl -= sg * 9 } else if (wide) { a -= wide * 7; L *= .98 } else L *= .93
    if (it > 24) L *= .94
  }
  const tip = mid[n]
  for (const q of [...R, ...Lf]) mark(q[0], q[1])
  const jag = edge === 'teeth' || edge === 'lobes'
  const d = jag
    ? `M${P(x, y)} ${[...R, tip, ...Lf.slice().reverse()].map(p => P(p[0], p[1])).join(' ')}Z`
    : `M${P(x, y)}${chain(R, tip)}${chain(Lf.slice().reverse(), [x, y])}Z`
  let s = `<path d="${d}"${o.bare ? '' : ` fill="url(#${fillOf(c, o)})"`}${o.sw ? ` stroke-width="${o.sw}"` : ''}/>`
  if (o.hl && !c.dead) {
    const lit = a < -15 ? 1 : -1, H = []
    for (let i = 1; i < n; i++) { const [nx, ny] = nrm(ang[i]); H.push([mid[i][0] + lit * nx * ws[i] * .68, mid[i][1] + lit * ny * ws[i] * .68]) }
    s += `<path d="M${C(mid[1][0], mid[1][1])}${chain(H, mid[n - 1])}${chain(mid.slice(2, n - 1).reverse(), mid[1])}Z" fill="#fff" opacity="${o.gloss ? '.3' : '.16'}"${NS}/>`
  }
  if (!o.small || (c.yellow && L > 6)) {
    const rc = c.dead ? '#4a3320' : c.yellow ? '#5a9a3c' : (o.ribCol ?? c.pal.rib)
    let rd = `M${C(x, y)}${chain(mid.slice(1, n - 1), mid[n - 1])}`
    if (c.yellow && !o.small && n >= 5) for (let i = 2; i <= Math.min(4, n - 2); i++) for (const E of [R, Lf]) rd += `M${C(mid[i][0], mid[i][1])}L${C(mid[i][0] + (E[i][0] - mid[i][0]) * .6, mid[i][1] + (E[i][1] - mid[i][1]) * .6)}`
    s += line(rd, rc, o.small || c.yellow ? .6 : (o.rib ?? .8), c.dead ? '' : c.yellow ? ' opacity=".85"' : ' opacity=".7"')
  }
  if (c.spots) {
    const cnt = o.spotN ?? (o.small ? (c.rs() < (o.spotP ?? .5) ? 1 : 0) : 1 + (c.rs() < .7 ? 1 : 0) + (W > 14 ? 1 : 0))
    for (let j = 0; j < cnt; j++) {
      const i = 1 + Math.floor(c.rs() * (n - 2)), sd = c.rs() < .5 ? -1 : 1, off = c.rs() * .5
      const [nx, ny] = nrm(ang[i])
      s += lesion(c, mid[i][0] + sd * nx * ws[i] * off, mid[i][1] + sd * ny * ws[i] * off, Math.max(o.spotR ?? 0, Math.min(1.9, .6 + W * .06 + c.rs() * .5)))
    }
  }
  c.geo = { mid, ang, ws, tip, a: a + curl }
  return s
}

/** A small, simple leaflet: two curves from base to tip. */
function lens(c, x, y, a, L, W, o = {}) {
  const side = o.side ?? sgn(a)
  let curl = o.curl ?? 0
  if (c.droop && !o.stiff) { a += side * (o.dA ?? 16) * c.droop; curl += side * (o.dC ?? 32) * c.droop }
  if (c.dead) { W *= .55; L *= .85 }
  let tx, ty, mx, my, nx, ny
  for (let it = 0; it < 40; it++) {
    if (it > 24) L *= .94
    const [ux, uy] = dir(a), [vx, vy] = dir(a + curl)
    tx = x + ((ux + vx) * L) / 2; ty = y + ((uy + vy) * L) / 2
    mx = x + ux * L * .42; my = y + uy * L * .42
    ;[nx, ny] = nrm(a + curl * .3)
    const low = Math.max(ty, my + Math.abs(ny) * W * .5) > (o.floor ?? FLOOR), out = tx < 3 ? -1 : tx > 69 ? 1 : 0, high = ty < 3.5
    if (!low && !out && !high) break
    const sg = sgn(a + curl / 2, side)
    if (low) { a -= sg * 6; curl -= sg * 8 } else if (out) a -= out * 7; else L *= .92
  }
  mark(mx + nx * W * .5, my + ny * W * .5); mark(mx - nx * W * .5, my - ny * W * .5)
  let s = `<path d="M${P(x, y)}Q${C(mx + nx * W, my + ny * W)} ${P(tx, ty)}Q${C(mx - nx * W, my - ny * W)} ${C(x, y)}Z"${o.bare ? '' : ` fill="url(#${fillOf(c, o)})"`}${o.sw ? ` stroke-width="${o.sw}"` : ''}/>`
  if (c.yellow && L > 5 && !o.plain) s += line(`M${C(x, y)}L${C(tx, ty)}`, '#5a9a3c', .6)
  else if (o.rib && !c.dead) s += line(`M${C(x, y)}L${C((mx + tx) / 2, (my + ty) / 2)}`, c.pal.rib, .6, ' opacity=".7"')
  if (c.spots && !o.plain && c.rs() < (o.spot ?? .5)) s += lesion(c, (mx + tx) / 2 + (c.rs() - .5) * W * .4, (my + ty) / 2 + (c.rs() - .5) * W * .4, Math.min(1.5, .6 + W * .1))
  c.geo = { tip: [tx, ty], a: a + curl }
  return s
}

/** A leaf stalk. Returns where it ends and which way it points there. */
function petiole(c, x, y, a, L, curl, w, col, o = {}) {
  const side = o.side ?? sgn(a)
  if (c.droop) { a += side * (c.dead ? 13 : o.dA ?? 13) * c.droop; curl += side * (c.dead ? 36 : o.dC ?? 36) * c.droop }
  if (c.dead) L *= .85
  let ex, ey
  for (let it = 0; it < 40; it++) {
    if (it > 24) L *= .94
    const [ux, uy] = dir(a + curl * .25), [vx, vy] = dir(a + curl * .75)
    ex = x + ((ux + vx) * L) / 2; ey = y + ((uy + vy) * L) / 2
    const sg = sgn(a + curl / 2, side)
    if (ey > 97.4) { a -= sg * 6; curl -= sg * 8 } else if (ex < 6 || ex > 66) a -= sgn(ex - CX) * 7; else break
  }
  const [ux, uy] = dir(a + curl * .25)
  return { x: ex, y: ey, a: a + curl, svg: stem2(`M${P(x, y)}Q${C(x + ux * L * .55, y + uy * L * .55)} ${P(ex, ey)}`, w, tint(c, col)) }
}

/** A main stem as a row of nodes. A wilting stem nods over from the top. */
function stalk(c, x, y, H, n, o = {}) {
  const lean = o.lean ?? 0, wob = o.wob ?? 4, bend = o.bend ?? 0
  const fall = o.side ?? (c.r() < .5 ? -1 : 1)
  // a wilting stem only nods; a dead one goes over
  const drop = (o.drop ?? 24) * (c.dead ? 2 : 1) * c.droop
  const nodes = [{ x, y, a: lean }]
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const a = lean + bend * t + (c.r() - .5) * 2 * wob + fall * drop * Math.pow(t, 2.2)
    const [ux, uy] = dir(a)
    x = Math.max(9, Math.min(63, x + (ux * H) / n)); y = Math.max(8, Math.min(FLOOR - 3, y + (uy * H) / n))
    nodes.push({ x, y, a })
  }
  return nodes
}
const stemSvg = (nodes, w, col) => stem2('M' + nodes.map(q => P(q.x, q.y)).join(' '), w, col)

/** A feather leaf: leaflets in pairs along a stalk with one at the end (tomato, potato). */
function compound(c, x, y, a, L, o = {}) {
  const side = o.side ?? sgn(a), n = o.n ?? 5, ll = o.ll ?? 9, lw = o.lw ?? 5.2
  let curl = o.curl ?? side * 20
  if (c.droop) { a += side * 32 * c.droop; curl += side * 56 * c.droop }
  if (c.dead) L *= .8
  let pts
  for (let it = 0; it < 40; it++) {
    if (it > 24) L *= .94
    pts = [[x, y]]
    let px = x, py = y
    for (let i = 1; i <= 4; i++) { const [ux, uy] = dir(a + (curl * (i - .5)) / 4); px += (ux * L) / 4; py += (uy * L) / 4; pts.push([px, py]) }
    const sg = sgn(a + curl / 2, side)
    if (py > 96.4) { a -= sg * 6; curl -= sg * 8 } else if (px < 3 + ll * .6 || px > 69 - ll * .6) { a -= sgn(px - CX) * 7; L *= .97 } else if (py < 4 + ll * .6) L *= .92; else break
  }
  const A = i => a + (curl * i) / 4
  const lf = (i, da, k) => lens(c, pts[i][0], pts[i][1], A(i) + da, ll * k, lw * k, { bare: true, side, dA: 8, dC: 22, spot: .3, sw: '.9' })
  let g = ''
  if (n >= 5) g += lf(2, -64, .78) + lf(2, 64, .78)
  if (n >= 3) g += lf(3, -58, .9) + lf(3, 58, .9)
  g += lf(4, 0, 1)
  return stem2('M' + pts.map(p => P(p[0], p[1])).join(' '), .9, tint(c, c.pal.stem)) + `<g fill="url(#${fillOf(c, o)})">${g}</g>`
}

/** Three leaflets on a stalk (soybean). */
function trifoliate(c, x, y, a, pl, ll, lw, o = {}) {
  const p = petiole(c, x, y, a, pl, o.curl ?? a * .12, .9, c.pal.stem)
  const mk = (da, k) => blade(c, p.x, p.y, p.a + da, ll * k, lw * k, { wp: .42, q: .72, n: 4, small: true, side: sgn(p.a + da, sgn(a)), dA: 14, dC: 30, sw: '.9', ...o })
  return p.svg + mk(-62, .88) + mk(62, .88) + mk(0, 1)
}

function star(x, y, r, n, rot) {
  let d = ''
  for (let i = 0; i < n * 2; i++) { const rr = i % 2 ? r * .42 : r, t = rad(rot + (i * 180) / n); d += `${i ? ' ' : 'M'}${P(x + Math.sin(t) * rr, y - Math.cos(t) * rr)}` }
  return d + 'Z'
}
function flower(c, x, y, r, col, eye, n = 5, eyeK = .34) {
  const rot = (c.rf() * 360) / n
  x = Math.max(2.6 + r, Math.min(69.4 - r, x)); y = Math.max(2.6 + r, Math.min(FLOOR - r * .5, y))
  if (c.dead) return dot(x, y, r * .45, '#5c4326')
  return `<path d="${star(x, y, r, n, rot)}" fill="${c.droop ? mix(col, '#9a8f6a', .5) : col}" stroke-width=".6"/>` + dot(x, y, r * eyeK, eye, NS)
}
/** A round fruit with a calyx. kind: R ripe, O turning, G green. */
function fruit(c, x, y, r, kind) {
  x = Math.max(4 + r, Math.min(68 - r, x))
  if (c.dead) return dot(x, y, r * .6, '#4f3a22')
  return dot(x, y, r, `url(#${c.k}${kind})`, ' stroke-width=".9"') + dot(x - r * .32, y - r * .36, r * .26, '#fff', ` opacity=".6"${NS}`)
    + line(`M${C(x - 1.5, y - r + .5)}L${P(x, y - r - .7)}L${C(x + 1.5, y - r + .5)}`, '#3f7a34', .9)
}

// ------------------------------------------------------------------ plug, tag, roots
function collar(c) {
  mark(26, 91.8); mark(46, 100)
  return `<path d="M26.4 94.2L27.9 100H44.1L45.6 94.2Z" fill="url(#${c.k}n)"/>${line('M27.6 96.6H44.4', '#7d8a97', .6, ' opacity=".55"')}`
    + `<ellipse cx="36" cy="94.2" rx="9.6" ry="2.4" fill="#66717d"/><ellipse cx="36" cy="94.3" rx="7.9" ry="1.7" fill="#3f2f20" stroke-width=".6"/>`
    + line('M31.6 94h1M38.6 94.8h.9M35.2 93.5h.8M40.6 93.9h.7', '#b9a988', .7)
}
function tag(c) {
  mark(41, 79.6); mark(48, 94)
  return line('M43 93.8L45 85.9', '#8d96a0', 1) + `<path d="M42.4 80L47.6 81L46.6 86.6L41.4 85.6Z" fill="#d9d7cc" stroke-width=".7"/>` + line('M42.8 82.2L46.9 83', c.pal.tag, 1.2)
}
/** The plug body below the tray and the roots growing out of it. `amt` is 0..1. */
function rootZone(c, amt) {
  mark(28, 100); mark(44, 114.4)
  let s = `<path d="M28.6 100H43.4L41.6 112.4Q36 114.4 30.4 112.4Z" fill="url(#${c.k}q)"/>` + line('M32.6 102.5V110.6M36 102.5V111.6M39.4 102.5V110.6', '#56606b', .8)
  const rr = lcg(4243 + IDS.indexOf(c.id) * 613), all = []
  for (let j = 0; j < 9; j++) {
    const u = (j + .5) / 9 - .5
    all.push([CX + u * 11 + (rr() - .5) * 2, 106 + rr() * 6, CX + u * 42 + (rr() - .5) * 5, 113 + rr() * 5, (rr() - .5) * 6, rr() * 3])
  }
  const show = Math.round(amt * 9)
  if (!show) return s
  let d = ''
  for (const j of [4, 3, 5, 2, 6, 1, 7, 0, 8].slice(0, show)) {
    const [sx, sy, ex0, ey0, kx, ky] = all[j], k = Math.min(1, amt * 1.15)
    const ex = sx + (ex0 - sx) * k, ey = Math.min(117.2, sy + (ey0 - sy) * k)
    d += `M${P(sx, sy)}Q${C((sx + ex) / 2 + kx, ey - 1 + ky * .4)} ${P(ex, ey)}`
  }
  return s + line(d, c.dead ? '#8a7354' : '#ece2c8', .8)
}

/** Germination: a first shoot and two seed leaves. */
function sprout(c, { h = 6, kind = 'oval', L = 5, W = 3.2, col = '#d6efac' } = {}) {
  const lean = (c.r() - .5) * 10 + (c.droop ? 30 : 0)
  const [ux, uy] = dir(lean), x = CX + ux * h, y = SOIL + uy * h
  let s = stem2(`M${P(CX, SOIL)}Q${C(CX, SOIL - h * .6)} ${P(x, y)}`, 1.2, tint(c, col))
  for (const sd of [-1, 1]) {
    s += kind === 'kidney'
      ? blade(c, x, y, lean + sd * 64, L, W, { wp: .66, q: .42, n: 4, tone: 'a', age: .2, small: true, side: sd, sw: '.9' })
      : lens(c, x, y, lean + sd * 62, L, W, { tone: 'a', age: .2, side: sd, sw: '.9' })
  }
  return s
}

/** A cut leaf base or stem end: a short wedge with a pale cut face. */
function stub(c, x, y, a, L, W, col) {
  if (c.droop) a += sgn(a) * 14
  const [ux, uy] = dir(a), [nx, ny] = nrm(a)
  const ex = x + ux * L, ey = Math.min(98.6, y + uy * L), k = tint(c, col)
  return `<path d="M${P(x - nx * W * .3, y - ny * W * .3)}L${P(ex - nx * W * .5, ey - ny * W * .5)}L${P(ex + nx * W * .5, ey + ny * W * .5)}L${P(x + nx * W * .3, y + ny * W * .3)}Z" fill="${k}"/>`
    + line(`M${C(ex - nx * W * .42, ey - ny * W * .42)}L${C(ex + nx * W * .42, ey + ny * W * .42)}`, mix(k, '#ffffff', .6), 1)
}

/** Flowers at the top of a bolting stalk, with seed pods on the two nodes below them. */
function raceme(c, N, col, eye, o = {}) {
  let s = ''
  const top = N[N.length - 1]
  for (let i = Math.max(1, N.length - 3); i < N.length - 1; i++) for (const sd of [-1, 1])
    s += lens(c, N[i].x, N[i].y, N[i].a + sd * (30 + i * 3), o.podL ?? 7, o.podW ?? 1.7, { tone: 'a', age: .2, side: sd, plain: true, stiff: true, sw: '.8' })
  const [ux, uy] = dir(top.a), [nx, ny] = nrm(top.a)
  for (const [du, dn, r] of [[1.5, -3.6, 2.2], [1.8, 3.4, 2.2], [5.2, -.4, 2.3], [-1.6, -1.4, 1.9], [-1.2, 2.2, 1.8]])
    s += flower(c, Math.max(5, Math.min(67, top.x + ux * du + nx * dn)), Math.min(96, top.y + uy * du + ny * dn), r, col, eye, o.petals ?? 4)
  return s + dot(top.x + ux * 2.2 + nx * .2, top.y + uy * 2.2 + ny * .2, 1.2, c.dead ? '#5c4326' : '#a6d45e', ' stroke-width=".6"')
}

// ------------------------------------------------------------------ leaf and root crops
/** How far a rosette leaf sags when the plant wilts: the outer leaves go down first, the heart last. */
const limp = (a, k = 1) => ({ dA: (5 + Math.abs(a) * .3) * k, dC: (14 + Math.abs(a) * .5) * k })

function lettuce(c, st) {
  const jit = k => (c.r() - .5) * k
  const lf = (a, L, W, tone, age, o = {}) => blade(c, CX + a * .03, o.y ?? SOIL + .5, a, L, W, { wp: .62, q: .5, edge: 'wave', amp: .13, phase: a * .7, curl: a * .2, tone, age, hl: true, ...limp(a), ...o })
  let s = ''
  if (st === 1) s = sprout(c, { h: 5.5, L: 5, W: 3.3 })
  if (st === 2) for (const [a, L, t] of [[-64, 11, 'b'], [62, 11.5, 'b'], [-22, 13, 'a'], [20, 12, 'a']]) s += lf(a + jit(8), L, 8, t, .4, { amp: .05, n: 5 })
  if (st === 3 || st === 7) {
    for (const [a, L] of [[-44, 25], [-8, 27], [30, 26]]) s += lf(a + jit(6), L, 17, 'c', .85)
    for (const [a, L] of [[-66, 21], [8, 23], [60, 22]]) s += lf(a + jit(6), L, 16, 'b', .6)
    for (const [a, L] of [[-24, 15], [22, 14]]) s += lf(a + jit(6), L, 12, 'a', .2)
  }
  if (st === 4) {
    for (const [a, L] of [[-70, 22], [-40, 25], [42, 25], [72, 22]]) s += lf(a + jit(5), L, 11, 'c', .9, { wp: .5, amp: .06 })
    const N = stalk(c, CX, SOIL, 35, 4, { wob: 3 })
    s += stemSvg(N, 1.5, tint(c, '#a8d477'))
    for (let i = 1; i <= 3; i++) s += lens(c, N[i].x, N[i].y, N[i].a + (i % 2 ? -1 : 1) * 50, 10.5 - i * 1.6, 4.8 - i * .5, { tone: 'b', age: .5 })
    for (const [a, L] of [[-88, 15], [86, 15], [-18, 13], [20, 12]]) s += lf(a + jit(5), L, 9, 'b', .6, { wp: .5, amp: .05 })
    const top = N[4]
    for (const [da, len, what] of [[-40, 7, 'f'], [6, 8, 'f'], [42, 6.5, 'p'], [-14, 4.5, 'b'], [24, 4, 'b']]) {
      const [ux, uy] = dir(top.a + da), ex = Math.max(5, Math.min(67, top.x + ux * len)), ey = Math.min(96, top.y + uy * len)
      s += stem2(`M${P(top.x, top.y)}L${P(ex, ey)}`, .7, tint(c, '#a8d477'))
      s += what === 'f' ? flower(c, ex, ey, 2.4, '#ffd94a', '#f0a82a', 7) : what === 'p' ? dot(ex, ey, 2.1, c.dead ? '#5c4326' : '#f4f1e6', ' stroke-width=".5"') : dot(ex, ey, 1.3, c.dead ? '#5c4326' : '#a6d45e', ' stroke-width=".6"')
    }
  }
  if (st === 5) {
    for (const [a, L] of [[-60, 34], [-33, 38], [-6, 40], [22, 39], [50, 35]]) s += lf(a + jit(5), L, 22, 'c', .9, Math.abs(a) > 45 ? { tint: a < 0 ? 'u' : 'v' } : {})
    for (const [a, L] of [[-76, 29], [-47, 32], [-17, 33], [14, 33], [45, 32], [75, 29]]) s += lf(a + jit(5), L, 20, 'b', .65, Math.abs(a) > 60 ? { tint: a < 0 ? 'u' : 'v' } : {})
    for (const [a, L] of [[-34, 22], [36, 21], [-10, 24], [13, 23]]) s += lf(a + jit(5), L, 16, 'a', .25)
    for (const [a, L] of [[-90, 16], [88, 15]]) s += lf(a + jit(4), L, 12, 'b', 1, { tint: a < 0 ? 'u' : 'v', curl: a * .32 })
  }
  if (st === 6) {
    s += stem2(`M${P(CX, SOIL)}L${P(CX, SOIL - 4)}`, 3.6, tint(c, '#b4d984'))
    for (const a of [-74, -38, 40, 72]) s += stub(c, CX, SOIL - 2, a + jit(6), 7.5, 5, '#b4d984')
    for (const [a, L] of [[-26, 10], [24, 9.5], [-2, 12]]) s += lf(a + jit(6), L, 7, 'a', .2, { amp: .05, n: 5, y: SOIL - 3.5 })
  }
  return { plant: s, roots: [0, .25, .5, .8, 1, 1, .85, .7][st] }
}

function mizuna(c, st) {
  const jit = k => (c.r() - .5) * k
  // a thin pale stalk carrying a feathery, deeply cut blade
  const lf = (a, L, tone, age, o = {}) => {
    const p = petiole(c, CX + a * .03, o.y ?? SOIL, a, L * .42, a * .14, 1.1, c.pal.stalk, limp(a, .55))
    return p.svg + blade(c, p.x, p.y, p.a, L * .62, o.W ?? 10.5, { edge: 'lobes', amp: .66, n: 9, wp: .45, q: .7, curl: a * .14, tone, age, sw: '.8', ...limp(a, .6), ...o })
  }
  let s = ''
  if (st === 1) s = sprout(c, { h: 6, kind: 'kidney', L: 4, W: 5 })
  if (st === 2) {
    for (const sd of [-1, 1]) { const p = petiole(c, CX, SOIL, sd * 70, 4.5, 0, .9, c.pal.stalk); s += p.svg + blade(c, p.x, p.y, p.a, 3.8, 4.8, { wp: .66, q: .42, n: 4, tone: 'b', age: .9, small: true, sw: '.9' }) }
    for (const [a, L] of [[-24, 14], [22, 13]]) s += lf(a + jit(8), L, 'a', .3, { W: 6.5, n: 7 })
  }
  if (st === 3 || st === 7) {
    for (const [a, L] of [[-40, 29], [-10, 32], [22, 31], [48, 27]]) s += lf(a + jit(6), L, 'c', .85)
    for (const [a, L] of [[-58, 23], [-24, 27], [6, 28], [36, 25], [62, 21]]) s += lf(a + jit(6), L, 'b', .55, { W: 9.5 })
  }
  if (st === 4) {
    for (const [a, L] of [[-56, 26], [-28, 30], [30, 30], [58, 26]]) s += lf(a + jit(6), L, 'c', .9)
    const N = stalk(c, CX, SOIL, 37, 5, { wob: 3 })
    s += stemSvg(N, 1.3, tint(c, '#b6de80'))
    for (let i = 1; i <= 2; i++) s += lens(c, N[i].x, N[i].y, N[i].a + (i % 2 ? -1 : 1) * 48, 9 - i * 1.5, 3.6, { tone: 'b', age: .5 })
    s += raceme(c, N, '#ffe14a', '#e6a82a')
    for (const [a, L] of [[-74, 20], [74, 20], [-14, 18]]) s += lf(a + jit(6), L, 'b', .6, { W: 9 })
  }
  if (st === 5) {
    for (const [a, L] of [[-46, 38], [-24, 42], [-2, 43], [20, 42], [44, 38]]) s += lf(a + jit(5), L, 'c', .9, { W: 11.5 })
    for (const [a, L] of [[-64, 31], [-36, 36], [-12, 38], [10, 38], [34, 36], [62, 31]]) s += lf(a + jit(5), L, 'b', .6, { W: 11 })
    for (const [a, L] of [[-28, 26], [2, 28], [30, 25]]) s += lf(a + jit(6), L, 'a', .25, { W: 10 })
  }
  if (st === 6) {
    for (const a of [-66, -44, -24, -6, 12, 30, 50, 70]) { const aa = a + jit(8), L = 6.5 + c.r() * 4; s += stub(c, CX + aa * .03, SOIL, aa, L, 2.4, c.pal.stalk) }
    for (const [a, L] of [[-18, 13], [16, 12], [0, 15]]) s += lf(a + jit(8), L, 'a', .2, { W: 6.5, n: 7 })
  }
  return { plant: s, roots: [0, .25, .5, .8, 1, 1, .85, .7][st] }
}

function kale(c, st) {
  const jit = k => (c.r() - .5) * k
  // a stout pale stalk and midrib, and a blade with a tightly frilled edge
  const lf = (y, a, L, W, tone, age, o = {}) => {
    const p = petiole(c, CX + a * .02, y, a, L * .3, a * .12, 1.7, c.pal.stalk, limp(a, .5))
    return p.svg + blade(c, p.x, p.y, p.a, L * .74, W, { edge: 'frill', amp: .3, n: 12, wp: .5, q: .5, curl: a * .24, tone, age, rib: 1.3, ribCol: c.pal.stalk, hl: true, ...limp(a, .7), ...o })
  }
  const trunk = h => stem2(`M${P(CX, SOIL)}L${P(CX, SOIL - h)}`, 3, tint(c, '#cfe6d8'))
  let s = ''
  if (st === 1) s = sprout(c, { h: 6, kind: 'kidney', L: 4.2, W: 5.2, col: '#d2e9dc' })
  if (st === 2) {
    for (const sd of [-1, 1]) { const p = petiole(c, CX, SOIL, sd * 72, 4.5, 0, .9, c.pal.stalk); s += p.svg + blade(c, p.x, p.y, p.a, 4, 5, { wp: .66, q: .42, n: 4, tone: 'b', age: .9, small: true, sw: '.9' }) }
    for (const [a, L, W] of [[-30, 11, 7], [28, 11.5, 7], [0, 9, 5.5]]) s += lf(SOIL, a + jit(8), L, W, 'a', .3, { n: 6, amp: .14, rib: .9 })
  }
  if (st === 3 || st === 7) {
    s += trunk(4)
    for (const [a, L, W] of [[-64, 20, 11], [62, 20, 11]]) s += lf(SOIL - 1, a + jit(6), L, W, 'c', .9)
    for (const [a, L, W] of [[-36, 24, 12], [34, 24, 12]]) s += lf(SOIL - 3, a + jit(6), L, W, 'b', .6)
    for (const [a, L, W] of [[-10, 25, 11], [12, 23, 10]]) s += lf(SOIL - 4, a + jit(6), L, W, 'a', .25)
  }
  if (st === 4) {
    s += trunk(4)
    for (const [a, L] of [[-80, 24], [78, 24], [-54, 27], [52, 27]]) s += lf(SOIL - 2, a + jit(6), L, 12, 'c', .9)
    const N = stalk(c, CX, SOIL - 4, 34, 5, { wob: 3 })
    s += stemSvg(N, 1.5, tint(c, '#bfdccb'))
    for (let i = 1; i <= 2; i++) s += lens(c, N[i].x, N[i].y, N[i].a + (i % 2 ? -1 : 1) * 46, 10 - i * 1.5, 4, { tone: 'b', age: .5 })
    s += raceme(c, N, '#ffe14a', '#e6a82a')
    for (const [a, L] of [[-26, 17], [28, 16]]) s += lf(SOIL - 3, a + jit(6), L, 9, 'b', .5)
  }
  if (st === 5) {
    s += trunk(9)
    for (const [a, L] of [[-80, 27], [78, 27]]) s += lf(SOIL - 3, a + jit(5), L, 14, 'c', 1)
    for (const [a, L] of [[-58, 31], [56, 31]]) s += lf(SOIL - 5, a + jit(5), L, 15, 'c', .8)
    for (const [a, L] of [[-36, 35], [34, 35]]) s += lf(SOIL - 7, a + jit(5), L, 15.5, 'b', .55)
    for (const [a, L] of [[-15, 36], [16, 35]]) s += lf(SOIL - 9, a + jit(5), L, 15, 'b', .35)
    s += lf(SOIL - 9, jit(8), 29, 12.5, 'a', .1)
  }
  if (st === 6) {
    s += stem2(`M${P(CX, SOIL)}L${P(CX + .5, SOIL - 14)}`, 3.4, tint(c, '#cfe6d8')) + line(`M${C(CX - 1.6, SOIL - 4)}h3.2M${C(CX - 1.4, SOIL - 7.5)}h3M${C(CX - 1.4, SOIL - 11)}h3`, '#7f9a8c', .7)
    for (const a of [-72, 70]) s += stub(c, CX, SOIL - 9, a + jit(8), 4.5, 2.6, c.pal.stalk)
    for (const [a, L] of [[-46, 13], [44, 13], [-15, 15.5], [14, 14.5]]) s += lf(SOIL - 14, a + jit(6), L, 8, 'a', .2, { n: 8, amp: .18, rib: .9 })
  }
  return { plant: s, roots: [0, .25, .5, .8, 1, 1, .9, .7][st] }
}

// A radish leaf: small side lobes, then one big rounded lobe at the end.
const lyre = t => (t < .42 ? .15 + .17 * Math.abs(Math.sin((t / .42) * Math.PI * 2)) : Math.pow(Math.sin(Math.PI * Math.pow((t - .42) / .58, .75)), .55))

function radish(c, st) {
  const jit = k => (c.r() - .5) * k
  const lf = (a, L, W, tone, age, o = {}) => {
    const p = petiole(c, CX + a * .03, o.y ?? SOIL, a, L * .34, a * .1, 1.3, c.pal.stalk, limp(a, .5))
    return p.svg + blade(c, p.x, p.y, p.a, L * .7, W, { prof: lyre, n: 10, curl: a * .2, tone, age, hl: true, rib: .9, ...limp(a, .7), ...o })
  }
  // the swollen root, drawn in front of the collar once its shoulder shows
  const bulb = () => {
    mark(27, 91); mark(45.4, 116.4)
    return `<path d="M36 91C45 91 45.6 99.6 43.4 103.4C41.6 106.6 38.6 108.2 36.8 109Q36.4 112.6 37.6 116.4Q35 112.8 35.2 109C33.4 108.2 30.4 106.6 28.6 103.4C26.4 99.6 27 91 36 91Z" fill="url(#${c.k}R)"/>`
      + line('M31.4 95.4Q30.1 99 31.5 103.2', '#fff', 1.3, ' opacity=".55"') + oval(36, 91.7, 2.7, 1, '#e9f2c0', ' stroke-width=".6"')
  }
  let s = '', under = ''
  if (st === 1) { s = sprout(c, { h: 6, kind: 'kidney', L: 4.2, W: 5.2, col: '#eaa6b8' }); under = line('M36 101Q36.5 105 35.7 109', '#f6dfe4', 1.2) }
  if (st === 2) {
    for (const sd of [-1, 1]) { const p = petiole(c, CX, SOIL, sd * 72, 4.5, 0, .9, c.pal.stalk); s += p.svg + blade(c, p.x, p.y, p.a, 4, 5, { wp: .66, q: .42, n: 4, tone: 'b', age: .9, small: true, sw: '.9' }) }
    for (const [a, L] of [[-22, 14], [24, 13]]) s += lf(a + jit(8), L, 6.5, 'a', .3, { n: 8 })
    under = stem2(`M${P(36, 100.5)}Q${C(36.8, 108)} ${P(35.6, 116)}`, 1.5, '#f0a6b6')
  }
  if (st === 3 || st === 7) {
    for (const [a, L] of [[-46, 24], [18, 27], [46, 23]]) s += lf(a + jit(6), L, 10.5, 'c', .85)
    for (const [a, L] of [[-14, 27], [0, 20]]) s += lf(a + jit(6), L, 10, 'b', .4)
    mark(31, 100); mark(41, 117)
    under = st === 7
      ? `<path d="M36 100.6C39.6 101 40 105 38.8 107.6Q37.4 110 36.6 113Q35.4 110 33.4 107.6C32 105 32.4 101 36 100.6Z" fill="url(#${c.k}S)"/>` + line('M34.4 103.4Q35.2 105.4 34.6 107.4M37.6 103Q37 105.2 37.6 107', '#4a2420', .6)
      : `<path d="M36 100.4C41 100.6 41.6 106 39.8 108.8Q37.8 111.4 36.8 116.6Q35.8 111.4 32.4 108.8C30.4 106 31 100.6 36 100.4Z" fill="url(#${c.k}R)"/>` + line('M33.4 103.2Q32.8 105.2 33.6 107.2', '#fff', 1, ' opacity=".5"')
  }
  if (st === 4) {
    s = bulb()
    for (const [a, L] of [[-62, 26], [60, 26], [-30, 30], [32, 29]]) s += lf(a + jit(6), L, 11.5, 'c', .9, { y: 91.8 })
    const N = stalk(c, CX, 91.8, 35, 5, { wob: 3 })
    s += stemSvg(N, 1.4, tint(c, '#b6de80'))
    for (let i = 1; i <= 2; i++) s += lens(c, N[i].x, N[i].y, N[i].a + (i % 2 ? -1 : 1) * 46, 9 - i * 1.5, 3.8, { tone: 'b', age: .5 })
    s += raceme(c, N, '#fdeaf2', '#e8d36a', { podL: 7.5, podW: 3.2 })
    s += lf(4 + jit(8), 20, 9, 'b', .5, { y: 91.8 })
  }
  if (st === 5) {
    s = bulb()
    for (const [a, L] of [[-38, 38], [-8, 41], [24, 40], [48, 35]]) s += lf(a + jit(5), L, 14.5, 'c', .9, { y: 91.8 })
    for (const [a, L] of [[-58, 30], [-22, 33], [10, 34], [40, 31], [64, 26]]) s += lf(a + jit(5), L, 12.5, Math.abs(a) < 30 ? 'a' : 'b', .5, { y: 91.8 })
  }
  if (st === 6) {
    // pulled: an empty plug, crumbs of substrate, a torn leaf left behind
    s = oval(36, 94.5, 4.6, 1.2, '#16100a', NS) + [[30.4, 92.6, 1.1], [42, 92.9, .9], [33.6, 91.9, .8], [39.2, 91.8, .7]].map(([x, y, r]) => dot(x, y, r, '#5a4430', ' stroke-width=".5"')).join('')
      + lens(c, 39.5, 93.6, 74, 7, 3, { tone: 'c', age: .9, floor: 97 })
    under = oval(36, 105.6, 4.6, 5, '#120e0a', ' stroke-width=".6" opacity=".92"')
  }
  return { plant: s, under, roots: [0, .2, .4, .6, .8, .8, .35, .5][st] }
}

// ------------------------------------------------------------------ fruiting crops
/** A truss hanging off a stem node: flowers (F, f) and fruit (R, r ripe, O turning, G, g green). */
function truss(c, nd, sd, items) {
  const [ux, uy] = dir(nd.a + sd * 112)
  const x = Math.max(8, Math.min(64, nd.x + ux * 5.5)), y = Math.min(94, nd.y + uy * 5.5 + 1.5)
  let s = stem2(`M${P(nd.x, nd.y)}Q${C(nd.x + ux * 4, nd.y + .5)} ${P(x, y)}`, .8, tint(c, c.pal.stem))
  const K = { R: ['R', 3.9], r: ['R', 3.2], O: ['O', 3.5], g: ['G', 2.3], G: ['G', 3.2] }
  ;[...items].forEach((ch, j) => {
    const fx = x + sd * [0, 4.8, 1.4][j % 3] + (c.rf() - .5), fy = y + [0, 3.4, 7][j % 3] + (c.rf() - .5)
    s += ch === 'F' || ch === 'f' ? flower(c, fx, Math.min(fy, 95.5), ch === 'F' ? 3.3 : 2.6, '#ffd83a', '#f09a1c') : fruit(c, fx, Math.min(fy, 95.4 - K[ch][1]), K[ch][1], K[ch][0])
  })
  return s
}

function tomato(c, st) {
  const jit = k => (c.r() - .5) * k
  if (st === 1) return { plant: sprout(c, { h: 7.5, L: 6.5, W: 2.3, col: '#c5d99a' }), roots: .25 }
  const H = [0, 0, 18, 44, 63, 74, 74, 46][st], n = [0, 0, 3, 6, 7, 8, 8, 6][st]
  const N = stalk(c, CX, SOIL, H, n, { wob: 3.5 }), green = tint(c, c.pal.stem)
  const mat = st >= 4 && st <= 6 ? 1 : .82
  let back = '', front = '', twigs = '', deco = ''
  const leafAt = (nd, sd, t, o) => {
    const big = Math.pow(Math.sin(Math.PI * Math.min(.94, .1 + t * .86)), .65)
    return compound(c, nd.x, nd.y, nd.a + sd * (86 - 34 * t) + jit(10), (st === 2 ? 5 : 8) + 13 * big * mat, { n: st === 2 || t > .8 || t < .2 ? 3 : 5, ll: 5.8 + 4.8 * big * mat, lw: 3.6 + 2.7 * big * mat, age: 1 - t, side: sd, ...o })
  }
  if (st === 2) for (const sd of [-1, 1]) back += lens(c, N[1].x, N[1].y, N[1].a + sd * 76, 6.5, 2.3, { tone: 'b', age: 1, side: sd })
  for (let i = st === 2 ? 2 : 1; i <= n; i++) {
    const sd = i % 2 ? -1 : 1, t = i / n
    if (i % 3 === 0) back += leafAt(N[i], sd, t, { tone: 'c' }); else front += leafAt(N[i], sd, t, { tone: t > .7 ? 'a' : 'b' })
  }
  // side shoots make it a bush
  const shoots = st === 5 || st === 6 ? [[2, 1, 17], [3, -1, 15]] : st === 4 ? [[2, 1, 15], [3, -1, 11]] : st === 3 ? [[2, 1, 11]] : st === 7 ? [[2, 1, 10]] : []
  for (const [i, sd, len] of shoots) {
    const B = stalk(c, N[i].x, N[i].y, len, 2, { lean: N[i].a + sd * 44, wob: 4, side: sd })
    twigs += stemSvg(B, 1.1, green)
    front += compound(c, B[1].x, B[1].y, B[1].a + sd * 50 + jit(8), 10, { n: 3, ll: 7, lw: 4.4, tone: 'b', age: .6, side: sd })
      + compound(c, B[2].x, B[2].y, B[2].a + sd * 12 + jit(8), 9, { n: 3, ll: 7.5, lw: 4.6, tone: 'a', age: .4, side: sd })
  }
  const top = N[n]
  front += lens(c, top.x, top.y, top.a - 34, 7, 3.6, { tone: 'a', age: 0 }) + lens(c, top.x, top.y, top.a + 30, 6.5, 3.4, { tone: 'a', age: 0 })
  const TR = { 4: [[3, 'gg'], [5, 'FF'], [6, 'Ff']], 5: [[2, 'RRr'], [4, 'RRO'], [6, 'Og'], [7, 'F']], 6: [[4, 'gg'], [6, 'g'], [7, 'Ff']], 7: [[3, 'r']] }[st] ?? []
  for (const [i, items] of TR) deco += truss(c, N[i], i % 2 ? 1 : -1, items)
  const stem = stemSvg(N, 1.5, green) + stemSvg(N.slice(0, Math.ceil(n * .45) + 1), 2.3, green)
  return { plant: back + twigs + stem + front + deco, roots: [0, .25, .5, .8, 1, 1, 1, .7][st] }
}

/** A pepper pod hanging from (x, y). */
function pepperPod(c, x, y, L, W, kind, lean) {
  x = Math.max(4 + W / 2, Math.min(68 - W / 2, x))
  if (y + L > 97.5) L = Math.max(4, 97.5 - y)
  if (c.dead) return oval(x, y + L * .4, W * .3, L * .4, '#4f3a22')
  const [ux, uy] = dir(180 + lean), [nx, ny] = nrm(180 + lean), h = W / 2
  const at = (u, n2) => [x + ux * u + nx * n2, y + uy * u + ny * n2]
  const s1 = at(1.5, h), s2 = at(1.5, -h), t = at(L, 0), c1 = at(L * .78, h * 1.05), c2 = at(L * .78, -h * 1.05), k1 = at(-.5, h), k2 = at(-.5, -h), b = at(0, 0)
  const hl0 = at(2.2, h * .45), hl1 = at(L * .62, h * .4)
  return `<path d="M${P(s1[0], s1[1])}Q${P(c1[0], c1[1])} ${P(t[0], t[1])}Q${P(c2[0], c2[1])} ${P(s2[0], s2[1])}Q${C(k2[0], k2[1])} ${P(b[0], b[1])}Q${C(k1[0], k1[1])} ${C(s1[0], s1[1])}Z" fill="url(#${c.k}${kind})" stroke-width=".9"/>`
    + line(`M${C(hl0[0], hl0[1])}L${C(hl1[0], hl1[1])}`, '#fff', .9, ' opacity=".5"')
    + `<path d="M${C(...at(.9, h * .7))}Q${C(...at(-1.6, 0))} ${C(...at(.9, -h * .7))}Z" fill="#4c8f3c" stroke-width=".7"/>`
}

function pepper(c, st) {
  const jit = k => (c.r() - .5) * k
  if (st === 1) return { plant: sprout(c, { h: 7, L: 6.5, W: 2.6, col: '#c5d99a' }), roots: .25 }
  const [H0, n0, H1, H2] = { 2: [14, 2, 0, 0], 3: [20, 3, 17, 0], 4: [24, 3, 23, 16], 5: [26, 3, 26, 21], 6: [26, 3, 26, 21], 7: [20, 3, 15, 0] }[st]
  const green = tint(c, c.pal.stem), k = st === 2 ? .62 : 1
  // a glossy, pointed leaf
  const lf = (nd, a, L, tone, age) => blade(c, nd.x, nd.y, a, L, L * .52, { wp: .4, q: .78, n: 5, curl: sgn(a) * 12, tone, age, hl: true, gloss: true, rib: .7, dA: 30, dC: 62 })
  const T = stalk(c, CX, SOIL, H0, n0, { wob: 3 })
  let stems = stemSvg(T, 2.2, green), back = '', front = '', deco = ''
  if (st === 2) for (const sd of [-1, 1]) back += lens(c, T[1].x, T[1].y, T[1].a + sd * 76, 6.5, 2.6, { tone: 'b', age: 1, side: sd })
  // the trunk keeps a pair of leaves at each node below the fork
  for (let i = st === 2 ? 2 : 1; i < n0 || (i === n0 && !H1); i++) {
    back += lf(T[i], T[i].a - (76 - i * 8) + jit(8), (12 + i * 1.5) * k, 'c', 1 - i / 8)
    front += lf(T[i], T[i].a + (72 - i * 8) + jit(8), (12.5 + i * 1.5) * k, 'b', .9 - i / 8)
  }
  const top = T[n0], forks = [], mids = []
  if (!H1) front += lf(top, top.a - 22, 12 * k, 'a', .1) + lf(top, top.a + 26, 11.5 * k, 'a', .1)
  if (H1) for (const sd of [-1, 1]) {
    const M = stalk(c, top.x, top.y, H1, 2, { lean: top.a + sd * 25, wob: 4, side: sd })
    stems += stemSvg(M, 1.6, green)
    back += lf(M[1], M[1].a + sd * 62 + jit(8), 15, 'c', .6)
    front += lf(M[1], M[1].a - sd * 40 + jit(8), 12, 'b', .5)
    mids.push([M[1], sd])
    if (!H2) { front += lf(M[2], M[2].a + sd * 40 + jit(6), 13, 'b', .3) + lf(M[2], M[2].a - sd * 24 + jit(6), 11.5, 'a', .1); continue }
    forks.push([M[2], sd])
    for (const s2 of [-1, 1]) {
      const W = stalk(c, M[2].x, M[2].y, H2, 2, { lean: M[2].a + s2 * 21, wob: 4, side: s2 })
      stems += stemSvg(W, 1.2, green)
      back += lf(W[1], W[1].a + s2 * 58 + jit(8), 13.5, 'b', .35)
      front += lf(W[2], W[2].a + s2 * 44 + jit(6), 12.5, 'b', .2) + lf(W[2], W[2].a - s2 * 22 + jit(6), 11, 'a', .05)
      mids.push([W[1], s2])
    }
  }
  // fruit hangs under the forks, flowers nod on the young wood
  const hang = (nd, dx, L, W, kind, lean) => { deco += stem2(`M${P(nd.x, nd.y)}Q${C(nd.x + dx, nd.y - .5)} ${P(nd.x + dx, nd.y + 2)}`, .8, green) + pepperPod(c, nd.x + dx, nd.y + 2, L, W, kind, lean) }
  const bloom = (nd, sd) => { deco += flower(c, nd.x - sd * 2.4, Math.min(95, nd.y + 2.6), 3, '#fbf7ea', '#cfe08a', 6) }
  if (st === 4) { hang(top, 3, 7.5, 4.8, 'G', 8); if (forks[0]) hang(forks[0][0], -2.5, 6, 4.2, 'G', -6); for (const [nd, sd] of mids.slice(1)) bloom(nd, sd) }
  if (st === 5) {
    hang(top, 3, 12.5, 7, 'R', 6)
    if (forks[0]) hang(forks[0][0], -3, 12, 6.6, 'R', -8)
    if (forks[1]) hang(forks[1][0], 3, 11, 6.4, 'G', 8)
    if (mids[0]) hang(mids[0][0], -2.4, 10.5, 6, 'G', -4)
    if (mids[3]) hang(mids[3][0], 2.4, 10.5, 6, 'R', 6)
    if (mids[2]) hang(mids[2][0], -2, 8.5, 5.2, 'R', -4)
  }
  if (st === 6) {
    if (forks[1]) hang(forks[1][0], 3, 6.5, 4.4, 'G', 8)
    if (mids[0]) hang(mids[0][0], -2.4, 5.5, 4, 'G', -4)
    if (mids[5]) bloom(mids[5][0], mids[5][1])
    if (mids[2]) bloom(mids[2][0], mids[2][1])
  }
  if (st === 7 && mids[0]) hang(mids[0][0], 2, 7, 4.6, 'R', 6)
  return { plant: back + stems + front + deco, roots: [0, .25, .5, .8, 1, 1, 1, .7][st] }
}

function tuber(c, x, y, rx, ry, rot, kind = 'T') {
  mark(x - rx, y - ry); mark(x + rx, y + ry)
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#${c.k}${kind})" stroke-width=".9" transform="rotate(${rot} ${f(x)} ${f(y)})"/>`
    + (rx > 3 ? dot(x - rx * .3, y - ry * .1, .45, '#7a5a34', NS) + dot(x + rx * .35, y + ry * .25, .45, '#7a5a34', NS) : '')
}

function potato(c, st) {
  const jit = k => (c.r() - .5) * k
  const seedPiece = () => tuber(c, 36, 106.4, 5, 3.6, -8) + line('M32.6 105.2L31.8 103.6M38.4 104.2L39.4 102.8', '#e9dfc6', .8)
  if (st === 0) return { under: seedPiece(), roots: 0 }
  if (st === 1) {
    const lean = jit(8) + (c.droop ? 26 : 0), [ux, uy] = dir(lean), x = CX + ux * 8, y = SOIL + uy * 8
    let s = stem2(`M${P(CX, SOIL)}L${P(x, y)}`, 2.6, tint(c, '#8ea268'))
    for (const da of [-58, 0, 56]) s += lens(c, x, y, lean + da, 5, 3.2, { tone: 'c', age: .3, sw: '.9' })
    return { plant: s, under: seedPiece(), roots: .3 }
  }
  const green = tint(c, c.pal.stem)
  if (st === 6) {
    // cut haulm and an emptied chamber
    let s = ''
    for (const [lean, L] of [[-22, 9], [3, 12], [24, 10]]) {
      const a = lean + jit(6), [ux, uy] = dir(a), x0 = CX + lean * .1, ex = x0 + ux * L, ey = SOIL + uy * L
      s += stem2(`M${P(x0, SOIL)}L${P(ex, ey)}`, 2.8, tint(c, '#8fa868')) + oval(ex, ey, 1.6, .9, c.droop ? '#bfc9a2' : '#e2ecc4', ' stroke-width=".6"')
    }
    return { plant: s + lens(c, 29, 93.8, -78, 7, 3.4, { tone: 'c', age: 1, floor: 97 }), under: line('M31 108Q26 111 22 110M41 108Q47 112 52 110.6M34 112Q32 115.6 28.6 116.6', '#ece2c8', .8), roots: .45 }
  }
  // three stems from the seed piece: [lean, height, nodes]
  const plan = { 2: [[-16, 15, 2], [3, 20, 3], [18, 14, 2]], 3: [[-17, 38, 3], [2, 46, 4], [18, 40, 3]], 4: [[-15, 58, 5], [1, 70, 6], [16, 61, 5]], 5: [[-16, 60, 5], [1, 73, 6], [17, 63, 5]], 7: [[-18, 34, 3], [4, 42, 4], [20, 36, 3]] }[st]
  let back = '', mid = '', front = '', deco = ''
  plan.forEach(([lean, H, n], si) => {
    const N = stalk(c, CX + lean * .12, SOIL, H, n, { lean, wob: 4, bend: -lean * .4, drop: 16, side: si === 1 ? undefined : sgn(lean) })
    let leaves = ''
    for (let i = 1; i <= n; i++) {
      const sd = (i + si) % 2 ? -1 : 1, t = i / n, big = Math.pow(Math.sin(Math.PI * Math.min(.92, .14 + t * .8)), .7), full = st >= 4 ? 1 : .8
      const fade = st === 5 && t < .4
      leaves += compound(c, N[i].x, N[i].y, N[i].a + sd * (80 - 28 * t) + jit(10) + (fade ? sd * 10 : 0), (st === 2 ? 5 : 7.5) + 10 * big * full, { n: si === 1 && st > 2 && t < .8 ? 5 : 3, ll: (si === 1 ? 5.6 : 6.4) + 4.8 * big * full, lw: (si === 1 ? 4.2 : 4.8) + 3.2 * big * full, tone: si === 1 ? (t > .7 ? 'a' : 'b') : 'c', age: 1 - t, side: sd, tint: fade ? 'm' : undefined })
    }
    const top = N[n]
    leaves += lens(c, top.x, top.y, top.a - 30, 7, 4.2, { tone: 'a', age: 0 }) + lens(c, top.x, top.y, top.a + 28, 6.5, 4, { tone: 'a', age: 0 })
    const all = stemSvg(N, si === 1 ? 2 : 1.6, green) + leaves
    if (si === 1) front += all; else if (si === 0) back += all; else mid += all
    if (st === 4 && si !== 0) for (const [dx, dy] of [[-3.6, -4.6], [3.2, -5.6], [0, -9]]) deco += flower(c, Math.max(6, Math.min(66, top.x + dx)), Math.max(6, top.y + dy), 3.3, '#f6f0ff', '#ffd23c')
  })
  let under = line('M31 107Q25 109 20 108M41 107Q47 110 52 108', '#ece2c8', .8)
  if (st === 2 || st === 3) under = tuber(c, 36, 106.6, 4.2, 3, -8, 'U') + (st === 3 ? under : '')
  if (st === 4) under += tuber(c, 19, 108.4, 3, 2.3, 10) + tuber(c, 53, 108.2, 2.8, 2.2, -12) + tuber(c, 30, 113.6, 2.4, 1.9, 0)
  if (st === 5) under = line('M31 107Q25 108 20 107M41 107Q47 109 52 107M33 111Q30 114 28 113M39 111Q42 114 45 113M24 108Q14 110 10 112', '#ece2c8', .8)
    + tuber(c, 9.6, 113, 4.6, 3.4, -14) + tuber(c, 20.4, 107.6, 6.4, 4.5, 8) + tuber(c, 52.6, 107.4, 6, 4.3, -10) + tuber(c, 29, 113.4, 5, 3.5, -6) + tuber(c, 45.4, 113, 5.4, 3.4, 8) + tuber(c, 62.6, 112.6, 4.2, 3.2, 12)
  if (st === 7) under = tuber(c, 22, 108.4, 2.8, 2.1, 10, 'U') + tuber(c, 50, 109, 2.4, 1.9, -10, 'U')
  return { plant: back + mid + front + deco, under, roots: [0, .3, .5, .7, .85, .85, .45, .6][st] }
}

/** An ear of wheat on the end of a stem, with its awns. */
function ear(c, x, y, a, ripe) {
  const s = blade(c, x, y, a, 12.5, 4.8, { edge: 'frill', amp: .17, n: 8, wp: .42, q: .45, curl: sgn(a) * (ripe ? 18 : 5), keep: ripe ? 'g' : 'h', small: true, sw: '.8', dA: 16, dC: 52, tone: 'b', spotP: 0 })
  if (c.dead) return s
  const g = c.geo
  let aw = '', rows = ''
  for (let i = 2; i <= 7; i++) {
    const sd = i % 2 ? -1 : 1, [nx, ny] = nrm(g.ang[i]), [ux, uy] = dir(g.ang[i] + sd * 20)
    const bx = g.mid[i][0] + sd * nx * g.ws[i] * .9, by = g.mid[i][1] + sd * ny * g.ws[i] * .9
    const ex = Math.max(3, Math.min(69, bx + ux * 6)), ey = Math.max(3.5, by + uy * 6)
    aw += `M${C(bx, by)}L${P(ex, ey)}`
    rows += `M${C(g.mid[i][0] - nx * g.ws[i] * .7, g.mid[i][1] - ny * g.ws[i] * .7)}L${C(g.mid[i][0] + nx * g.ws[i] * .7, g.mid[i][1] + ny * g.ws[i] * .7)}`
  }
  return line(aw, ripe ? '#e8c060' : '#b9d87a', .5) + s + line(rows, ripe ? '#a87a22' : '#6f9a3c', .5, ' opacity=".7"')
}

function wheat(c, st) {
  const jit = k => (c.r() - .5) * k
  // a long narrow blade that arcs outward
  const bl = (x, y, a, L, tone, age, o = {}) => blade(c, x, y, a, L, o.W ?? 3.2, { wp: .2, q: .9, n: 6, curl: a * 1.5 + sgn(a) * 24 + jit(14), tone, age, small: true, sw: '.8', dA: 20, dC: 62, spotN: 2, spotR: 1, ...o })
  let s = ''
  if (st === 1) s = bl(CX, SOIL, 3, 10.5, 'a', .2, { W: 2.6, curl: 8 }) + bl(CX, SOIL, -24, 5.5, 'a', .2, { W: 2.2, curl: -14 })
  if (st === 2) for (const [a, L, t] of [[-21, 18, 'b'], [22, 17, 'b'], [-6, 26, 'a'], [8, 23, 'a']]) s += bl(CX + a * .05, SOIL, a + jit(4), L, t, .4)
  if (st === 3 || st === 7) {
    for (const [a, L] of [[-34, 34], [-17, 46], [3, 52], [20, 45], [36, 33]]) s += bl(CX + a * .06, SOIL, a + jit(5), L, 'c', .85, { W: 3.6 })
    for (const [a, L] of [[-44, 26], [-25, 38], [-8, 47], [12, 46], [28, 37], [46, 25]]) s += bl(CX + a * .06, SOIL, a + jit(5), L, Math.abs(a) < 15 ? 'a' : 'b', .45, { W: 3.4 })
  }
  if (st === 4 || st === 5) {
    const ripe = st === 5, sc = tint(c, ripe ? '#d9c56a' : c.pal.stem), kk = ripe ? { tintAll: 's' } : {}
    let stems = '', leaves = '', ears = ''
    for (const [th, H] of [[-13, 59], [12, 60], [-8, 64], [7, 65], [-3, 68], [2, 67]]) {
      const lean = th + jit(2), sd = sgn(th)
      // the straw stays up when the plant wilts: the blades and the ears are what droop
      const N = stalk(c, CX + th * .16, SOIL, H + (ripe ? 1 : 0), 4, { lean, wob: 1.2, bend: th * .3, drop: 9, side: sd })
      stems += stemSvg(N, 1.1, sc)
      leaves += bl(N[1].x, N[1].y, N[1].a + sd * 16, 25, 'c', .9, kk) + bl(N[2].x, N[2].y, N[2].a - sd * 14, 22, 'b', .6, kk) + bl(N[3].x, N[3].y, N[3].a + sd * 26, 14, 'a', .2, { W: 2.8, ...kk })
      ears += ear(c, N[4].x, N[4].y, N[4].a, ripe)
    }
    s = leaves + stems + ears
  }
  if (st === 6) {
    for (const th of [-17, -11, -6, -1, 4, 9, 15, 20]) {
      const a = th * 1.2 + jit(6), L = 8 + c.r() * 5, x0 = CX + th * .2, [ux, uy] = dir(a + (c.droop ? sgn(a) * 16 : 0))
      const ex = x0 + ux * L, ey = SOIL + uy * L
      s += stem2(`M${P(x0, SOIL)}L${P(ex, ey)}`, 1.5, tint(c, '#dcc878')) + dot(ex, ey, .8, '#f4e8ae', NS)
    }
    s += bl(CX - 3, SOIL, -74, 13, 'b', 1, { keep: 's', curl: -10, floor: 97.5 }) + bl(CX + 3, SOIL, 70, 11, 'b', 1, { keep: 's', curl: 12, floor: 97.5 })
  }
  return { plant: s, roots: [0, .3, .55, .85, 1, 1, .8, .7][st] }
}

function soybean(c, st) {
  const jit = k => (c.r() - .5) * k
  const green = tint(c, c.pal.stem)
  if (st === 1) {
    // the hooked stem that lifts two fat seed leaves
    const lean = jit(8) + (c.droop ? 26 : 0), [ux, uy] = dir(lean), x = CX + ux * 7.5, y = SOIL + uy * 7.5
    let s = stem2(`M${P(CX, SOIL)}Q${C(CX - 1.4, SOIL - 5)} ${P(x, y)}`, 1.6, tint(c, '#cfe2a0'))
    for (const sd of [-1, 1]) s += blade(c, x, y, lean + sd * 56, 6.2, 4.4, { wp: .55, q: .5, n: 4, tone: 'a', age: .2, small: true, side: sd, sw: '.9' })
    return { plant: s, roots: .3 }
  }
  const H = [0, 0, 19, 44, 61, 70, 69, 46][st], n = [0, 0, 2, 4, 6, 7, 7, 4][st]
  const N = stalk(c, CX, SOIL, H, n, { wob: 6 })
  if (st === 6) {
    // threshed: bare stems, leaf stalk stubs, a few empty pod stalks
    const tan = tint(c, '#b89a5c')
    let s = stemSvg(N, 1.5, tan)
    for (let i = 1; i < n; i++) {
      const sd = i % 2 ? -1 : 1, [ux, uy] = dir(N[i].a + sd * 58), [vx, vy] = dir(N[i].a - sd * 150)
      s += stem2(`M${P(N[i].x, N[i].y)}L${P(N[i].x + ux * (4 + (i % 3)), N[i].y + uy * (4 + (i % 3)))}`, .8, tan)
      if (i % 2) s += stem2(`M${P(N[i].x, N[i].y)}L${P(N[i].x + vx * 3, N[i].y + vy * 3)}`, .6, tan)
    }
    for (const [i, sd, len] of [[2, 1, 12], [3, -1, 10]]) s += stemSvg(stalk(c, N[i].x, N[i].y, len, 2, { lean: N[i].a + sd * 46, wob: 4, side: sd }), 1.1, tan)
    return { plant: s + lens(c, N[n].x, N[n].y, N[n].a + 40, 6, 3, { keep: 'x', tone: 'b' }), roots: .85 }
  }
  let back = '', front = '', twigs = '', deco = ''
  const ripe = st === 5
  if (st === 2) for (const sd of [-1, 1]) back += blade(c, (N[0].x + N[1].x) / 2, (N[0].y + N[1].y) / 2, sd * 74, 5.6, 4, { wp: .55, q: .5, n: 4, tone: 'b', age: 1, small: true, side: sd, sw: '.9' })
  for (let i = 1; i <= n; i++) {
    const sd = i % 2 ? -1 : 1, t = i / n, big = Math.pow(Math.sin(Math.PI * Math.min(.92, .16 + t * .8)), .7), full = st >= 4 ? 1 : .82
    if (i === 1 && st <= 3) {
      // the first true leaves are a simple pair
      for (const s2 of [-1, 1]) back += blade(c, N[1].x, N[1].y, N[1].a + s2 * 66 + jit(6), st === 2 ? 9 : 11, st === 2 ? 7.4 : 8.6, { wp: .42, q: .7, n: 5, tone: 'c', age: .9, hl: true, side: s2 })
      continue
    }
    if (ripe && i === 1) continue // the oldest leaves have dropped
    const o = { tone: i % 3 === 0 ? 'c' : t > .7 ? 'a' : 'b', age: 1 - t, ...(ripe && t < .8 ? { tintAll: 'm' } : {}) }
    const leaf = trifoliate(c, N[i].x, N[i].y, N[i].a + sd * (64 - 18 * t) + jit(8), (st === 2 ? 4 : 7) + 8 * big * full, 7.6 + 6 * big * full, 5.8 + 4.2 * big * full, o)
    if (i % 3 === 0) back += leaf; else front += leaf
  }
  const shoots = st === 4 || st === 5 ? [[1, 1, 13], [2, -1, 12]] : st === 3 ? [[1, 1, 9]] : []
  for (const [i, sd, len] of shoots) {
    const B = stalk(c, N[i].x, N[i].y, len, 2, { lean: N[i].a + sd * 50, wob: 4, side: sd })
    twigs += stemSvg(B, 1.1, green)
    front += trifoliate(c, B[2].x, B[2].y, B[2].a + sd * 8 + jit(8), 4, 10, 7, { tone: 'b', age: .5, ...(ripe ? { tintAll: 'm' } : {}) })
    if (ripe) deco += podsAt(c, B[1], sd, 'T', 2)
  }
  const top = N[n]
  front += trifoliate(c, top.x, top.y, top.a + jit(10), 2.5, 8, 5.6, { tone: 'a', age: 0 })
  if (st === 4) {
    for (const i of [2, 3, 4, 5]) deco += flower(c, N[i].x + (i % 2 ? 2.8 : -2.8), N[i].y - .6, 2.9, '#b86be6', '#f6e9ff', 5, .22)
    for (const i of [1, 2]) deco += podsAt(c, N[i], i % 2 ? 1 : -1, 'G', 2)
  }
  if (ripe) for (let i = 1; i <= 6; i++) deco += podsAt(c, N[i], i % 2 ? 1 : -1, 'T', i % 3 === 0 ? 3 : 2)
  if (st === 7) deco += podsAt(c, N[2], 1, 'T', 1)
  return { plant: back + twigs + stemSvg(N, 1.6, green) + front + deco, roots: [0, .3, .5, .8, 1, 1, .85, .7][st] }
}
/** A cluster of soybean pods hanging from a node. kind: G green, T dry. */
function podsAt(c, nd, sd, kind, count) {
  let s = ''
  for (let j = 0; j < count; j++) s += lens(c, nd.x + sd * (.8 + j * 1.2), Math.min(92, nd.y + .8 + j * .7), sd * (150 - j * 24), kind === 'T' ? 9.4 : 7.4, kind === 'T' ? 3.6 : 3, { keep: kind, tone: 'c', stiff: true, plain: true, side: sd, sw: '.8', floor: 98.5 })
  return s
}

// ------------------------------------------------------------------ sheets
const DRAW = { lettuce, mizuna, kale, radish, tomato, pepper, potato, wheat, soybean }

function frame(id, st, row, sheet) {
  const pal = PAL[id], i = IDS.indexOf(id)
  // The post-harvest tomato and pepper are the same plant as the ripe one, so they share its shape.
  const shape = (id === 'tomato' || id === 'pepper') && st === 6 ? 5 : st
  const live = st > 0 && st < 7
  const c = {
    id, k: pal.k, pal, st, row,
    droop: st === 7 ? 1.2 : live && row === 1 ? 1 : 0, yellow: live && row === 2, spots: live && row === 3, dead: st === 7,
    r: lcg(31337 + i * 7919 + shape * 104729), rf: lcg(2713 + i * 6151 + st * 15485), rs: lcg(9973 + i * 3571 + st * 2221),
  }
  box = [999, 999, -999, -999]
  // A seed plug has no plant yet: just the seed inside the plug (the potato draws its seed piece).
  const art = st === 0 && id !== 'potato' ? { under: oval(36, 104.2, 1.6, 1, '#d9c9a0', ' stroke-width=".5"') } : DRAW[id](c, st)
  // The plug is the same in every frame and the roots repeat, so each is drawn once and reused.
  const key = `r${Math.round((art.roots ?? 0) * 100)}${c.dead ? 'd' : ''}`
  sheet.parts[key] ??= rootZone(c, art.roots ?? 0)
  mark(26, 79.6); mark(48, 114.4)
  const s = `<use href="#${pal.k}${key}"/>` + (art.under ?? '') + `<use href="#${pal.k}K"/>` + (art.plant ?? '')
  if (box[0] < 2.5 || box[1] < 2.5 || box[2] > FW - 2.5 || box[3] > FH - 2.5) sheet.overflow.push(`${id} stage ${st} row ${row}: ${box.map(v => Math.round(v * 10) / 10).join(', ')}`)
  return s
}

/** The nine sheets, ready for the caller to wrap in an <svg> and save. */
export function cropSheets() {
  return IDS.map(id => {
    const pal = PAL[id], sheet = { parts: { K: collar({ k: pal.k }) + tag({ pal }) }, overflow: [] }
    let body = ''
    for (let row = 0; row < CROP_FRAME.rows; row++) for (let col = 0; col < CROP_FRAME.cols; col++)
      body += `<g transform="translate(${col * FW} ${row * FH})" clip-path="url(#${pal.k}clip)">${frame(id, col, row, sheet)}</g>`
    return {
      file: `crop-${id}.svg`, w: FW * CROP_FRAME.cols, h: FH * CROP_FRAME.rows,
      body: `<g stroke="${OUTL}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round">${body}</g>`,
      defs: defsFor(pal) + Object.entries(sheet.parts).map(([key, svg]) => `<g id="${pal.k}${key}">${svg}</g>`).join(''),
      overflow: sheet.overflow,
    }
  })
}
