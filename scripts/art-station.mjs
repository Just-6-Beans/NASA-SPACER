// The station deck in the title screen's look: dark navy and steel, cyan edge light, mint
// screens, an orange slash here and there. Stylised 2.5D: each module shows its back wall face
// on and its floor from above. Every position comes from src/art/geo.json (scripts/build-geo.mjs),
// which the game reads too.
//
// The layout borrows the plan of the ISS (a backbone of nodes and a lab, with modules berthed
// above and below). It is a game set, not a drawing of the real station.
import { commonDefs, roverSvg } from './art-hq.mjs'

const r1 = n => Math.round(n * 10) / 10
const r2 = n => Math.round(n * 100) / 100
// Station-only random sequence, so this art never moves the crew, Mars or site art.
let seed = 41
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const OUTL = '#04090f'
const CYAN = '#3fd0ff', CYAN_L = '#9be8ff', MINT = '#6ef2c6', ORANGE = '#ff6a2b', AMBER = '#ffb347', RED = '#ff5a4a', IVORY = '#e2f5ff', DIM = '#86aac4', VIOLET = '#c9a2ff', GREEN = '#7fe36a'
const BUS = { life: MINT, comms: '#5fd8f0', research: VIOLET }
const stroke = `stroke="${OUTL}" stroke-width="1.5" stroke-linejoin="round"`
const FONT = 'font-family="Barlow Condensed, Arial Narrow, Arial" font-weight="700"'
const MONO = 'font-family="IBM Plex Mono, Consolas, monospace" font-weight="600"'

export const stationDefs = commonDefs + `
  <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3350"/><stop offset=".55" stop-color="#162840"/><stop offset="1" stop-color="#0d1a2a"/></linearGradient>
  <linearGradient id="panelG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24405f"/><stop offset="1" stop-color="#16293f"/></linearGradient>
  <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#172433"/><stop offset=".4" stop-color="#1b2a3b"/><stop offset="1" stop-color="#131e2b"/></linearGradient>
  <linearGradient id="hullH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a1522"/><stop offset=".5" stop-color="#1c3048"/><stop offset="1" stop-color="#0a1522"/></linearGradient>
  <linearGradient id="hullV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22384f"/><stop offset=".45" stop-color="#132235"/><stop offset="1" stop-color="#070f1a"/></linearGradient>
  <linearGradient id="cab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a5677"/><stop offset=".5" stop-color="#253a54"/><stop offset="1" stop-color="#14202f"/></linearGradient>
  <linearGradient id="cabH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3f5d80"/><stop offset=".6" stop-color="#293f5a"/><stop offset="1" stop-color="#162334"/></linearGradient>
  <linearGradient id="cabTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a7da6"/><stop offset="1" stop-color="#33506f"/></linearGradient>
  <linearGradient id="dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25364a"/><stop offset="1" stop-color="#0c141e"/></linearGradient>
  <linearGradient id="acc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8f4f"/><stop offset="1" stop-color="#c8461a"/></linearGradient>
  <linearGradient id="steelTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d7896"/><stop offset="1" stop-color="#354b63"/></linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d97b3"/><stop offset="1" stop-color="#34485e"/></linearGradient>
  <linearGradient id="glassDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12303f"/><stop offset="1" stop-color="#06131c"/></linearGradient>
  <linearGradient id="screenC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14506e"/><stop offset=".5" stop-color="#0d3650"/><stop offset="1" stop-color="#071f30"/></linearGradient>
  <linearGradient id="coreG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06231f"/><stop offset=".5" stop-color="#1f8f76"/><stop offset="1" stop-color="#06231f"/></linearGradient>
  <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd6ee"/><stop offset="1" stop-color="#2b8fb5"/></linearGradient>
  <linearGradient id="nutri" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6e87a"/><stop offset="1" stop-color="#3f9a4a"/></linearGradient>
  <linearGradient id="bag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fa5bb"/><stop offset="1" stop-color="#566b82"/></linearGradient>
  <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#63c3ff"/><stop offset="1" stop-color="#1b6fb0"/></linearGradient>
  <linearGradient id="led" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfe6ff"/></linearGradient>
  <linearGradient id="aoTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03070c" stop-opacity=".7"/><stop offset="1" stop-color="#03070c" stop-opacity="0"/></linearGradient>
  <linearGradient id="aoBot" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#03070c" stop-opacity=".55"/><stop offset="1" stop-color="#03070c" stop-opacity="0"/></linearGradient>
  <linearGradient id="aoL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#03070c" stop-opacity=".6"/><stop offset="1" stop-color="#03070c" stop-opacity="0"/></linearGradient>
  <linearGradient id="aoR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#03070c" stop-opacity=".6"/><stop offset="1" stop-color="#03070c" stop-opacity="0"/></linearGradient>
  <radialGradient id="pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#bfe6ff" stop-opacity=".16"/><stop offset="1" stop-color="#bfe6ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="cyanGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${CYAN}" stop-opacity=".4"/><stop offset="1" stop-color="${CYAN}" stop-opacity="0"/></radialGradient>
  <radialGradient id="growGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd6f0" stop-opacity=".5"/><stop offset="1" stop-color="#ff9ad5" stop-opacity="0"/></radialGradient>
  <radialGradient id="warmGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".5"/><stop offset="1" stop-color="#ffb066" stop-opacity="0"/></radialGradient>
  <pattern id="haz" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="${AMBER}"/><rect width="6" height="12" fill="#101820"/></pattern>
  <pattern id="grip" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" fill="#bfe6ff" fill-opacity=".2"/><circle cx="7" cy="7" r="1.1" fill="#03070c" fill-opacity=".4"/></pattern>
  <pattern id="mesh" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0 L6 6 M6 0 L0 6" stroke="#bfe6ff" stroke-opacity=".16" stroke-width=".8"/></pattern>
  <pattern id="cells" width="14" height="10" patternUnits="userSpaceOnUse"><rect width="14" height="10" fill="#14284a"/><rect x=".8" y=".8" width="12.4" height="8.4" fill="#1d3f74"/><path d="M0 5 H14" stroke="#3f6fb0" stroke-opacity=".5" stroke-width=".6"/></pattern>`

// ------------------------------------------------------------------ small parts
const glow = (d, color, w = 1.6, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-opacity=".14" stroke-width="${w * 5}" stroke-linecap="round" ${extra}/><path d="${d}" fill="none" stroke="${color}" stroke-opacity=".3" stroke-width="${w * 2.4}" stroke-linecap="round" ${extra}/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`
const bolt = (x, y, r = 1.5) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="#0a121c"/><circle cx="${r1(x - .4)}" cy="${r1(y - .4)}" r="${r2(r * .45)}" fill="#9fc0de" opacity=".6"/>`
const lamp = (x, y, c, r = 2.6) => `<circle cx="${x}" cy="${y}" r="${r + 2}" fill="#070d15" ${stroke}/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`
const led0 = ([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5" fill="#070d15" ${stroke}/><circle cx="${x}" cy="${y}" r="3" fill="#2c343d"/>`
function chamfer(x, y, w, h, c) {
  return `M${x + c} ${y} H${x + w - c} L${x + w} ${y + c} V${y + h - c} L${x + w - c} ${y + h} H${x + c} L${x} ${y + h - c} V${y + c} Z`
}
const text = (x, y, s, size, color, extra = '') => `<text x="${x}" y="${y}" ${FONT} font-size="${size}" fill="${color}" ${extra}>${s}</text>`
const mono = (x, y, s, size, color, extra = '') => `<text x="${x}" y="${y}" ${MONO} font-size="${size}" fill="${color}" ${extra}>${s}</text>`

// A 3/4 box: front face and top face, with outline, a cyan highlight edge and a contact shadow.
function box(x, y, w, h, top, { front = 'url(#cab)', topFill = 'url(#cabTop)', stripe = null, shadow = true, edge = CYAN } = {}) {
  return `${shadow ? `<ellipse cx="${x + w / 2 + 6}" cy="${y + h + 2}" rx="${w * .58}" ry="${Math.max(6, top * .5)}" fill="url(#ao)"/>` : ''}
  <path d="M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z" fill="${front}" ${stroke}/>
  <path d="M${x} ${y} L${x + 6} ${y - top} L${x + w - 6} ${y - top} L${x + w} ${y} Z" fill="${topFill}" ${stroke}/>
  <path d="M${x + 1.5} ${y + 1.2} L${x + w - 1.5} ${y + 1.2}" stroke="${edge}" stroke-opacity=".75" stroke-width="1.3"/>
  <rect x="${x}" y="${y + h - 6}" width="${w}" height="6" fill="#000" opacity=".25"/>
  ${stripe ? `<rect x="${x}" y="${y + stripe[0]}" width="${w}" height="${stripe[1]}" fill="url(#acc)"/>` : ''}`
}

const ICON = {
  power: (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M2 -10 L-6 2 L0 2 L-2 10 L6 -2 L0 -2 Z" fill="#fff3e6"/>`,
  target: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff3e6" stroke-width="2"><circle r="8"/><circle r="3.5"/><path d="M-11 0 H-6 M6 0 H11 M0 -11 V-6 M0 6 V11"/></g>`,
  antenna: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff3e6" stroke-width="2" stroke-linecap="round"><path d="M0 -2 L-5 10 M0 -2 L5 10 M-3 5 H3"/><circle cy="-4" r="2" fill="#fff3e6"/><path d="M-6 -9 Q-9 -4 -6 1 M6 -9 Q9 -4 6 1"/></g>`,
  drop: (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -10 Q8 0 6 4 A6 6 0 0 1 -6 4 Q-8 0 0 -10 Z" fill="#fff3e6"/>`,
  crate: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff3e6" stroke-width="2"><rect x="-8" y="-7" width="16" height="14" rx="1"/><path d="M-8 -1 H8 M0 -7 V7"/></g>`,
  orbit: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff3e6" stroke-width="2"><circle r="4" fill="#fff3e6"/><ellipse rx="11" ry="4.5" transform="rotate(-25)"/></g>`,
  leaf: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-8 8 C-8 -4 -1 -9 9 -9 C9 2 3 8 -8 8 Z" fill="#fff3e6"/><path d="M-7 7 L4 -4" stroke="#c8461a" stroke-width="1.6" stroke-linecap="round"/></g>`,
  gear: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff3e6" stroke-width="2.2"><circle r="5"/><path d="M0 -10 V-7 M0 7 V10 M-10 0 H-7 M7 0 H10 M-7 -7 L-5 -5 M5 5 L7 7 M-7 7 L-5 5 M5 -5 L7 -7"/></g>`,
  seed: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff3e6" stroke-width="2" stroke-linecap="round"><path d="M0 9 V-1 M0 -1 C-7 -1 -8 -8 -8 -8 C-2 -9 0 -5 0 -1 M0 2 C6 2 8 -4 8 -4 C3 -5 0 -2 0 2"/></g>`,
  ship: (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M-10 3 L-2 -4 L8 -4 L11 0 L8 4 L-2 4 Z M-4 -4 L-7 -9 L-1 -4 M-4 4 L-7 9 L-1 4" fill="#fff3e6"/>`,
}

// Name plate: dark bar with a cyan rim and an orange icon tab. Wall consoles use 22 px, floor props 18 px.
function sign(cx, y, w, label, icon, h = 22, fs = 15) {
  const x = cx - w / 2, tab = h + 8, c = h > 20 ? 5 : 4
  return `<g><path d="${chamfer(x + 1.5, y + 2.5, w, h, c)}" fill="#000" opacity=".45"/>
    <path d="${chamfer(x, y, w, h, c)}" fill="#0b1826" stroke="${CYAN}" stroke-opacity=".85" stroke-width="1.3"/>
    <path d="${chamfer(x, y, tab, h, c)}" fill="url(#acc)" ${stroke}/>${ICON[icon](x + tab / 2, y + h / 2, (.8 * h) / 22)}
    <text x="${x + tab + 8}" y="${r1(y + h * .75)}" ${FONT} font-size="${fs}" letter-spacing="1.6" fill="${IVORY}">${label}</text></g>`
}

const screenAt = ([x, y, w, h], cyan = false) => `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="5" fill="#070d15" ${stroke}/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#${cyan ? 'screenC' : 'screen'})"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#screenGlow)"/>`

// ISS-style rack face: an inset panel with a handle, a label strip and a couple of status lights.
function rackFront(x, y, w, h, v = 0) {
  const c = [MINT, CYAN, AMBER, VIOLET][v % 4]
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#panelG)" ${stroke}/>
    <rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="2" fill="none" stroke="#3d5f84" stroke-opacity=".7"/>
    <rect x="${x + 6}" y="${y + 7}" width="${w - 12}" height="5" rx="1.5" fill="#0a121c"/><rect x="${x + 7}" y="${y + 8}" width="${r1((w - 14) * (.3 + .1 * (v % 3)))}" height="3" rx="1" fill="${c}" opacity=".85"/>`
  const rows = Math.max(1, Math.floor((h - 26) / 22))
  for (let i = 0; i < rows; i++) {
    const yy = y + 18 + i * 22
    s += `<rect x="${x + 6}" y="${yy}" width="${w - 12}" height="17" rx="2" fill="#101c2b" stroke="#04090f" stroke-width="1"/>`
    if ((i + v) % 3 === 0) s += `<rect x="${x + 9}" y="${yy + 3}" width="${w - 30}" height="11" rx="1.5" fill="url(#screenC)"/><path d="M${x + 11} ${yy + 10} l5 -3 l5 2 l6 -4" stroke="${CYAN_L}" stroke-width="1" fill="none"/>`
    else s += `<rect x="${x + w / 2 - 9}" y="${yy + 6.5}" width="18" height="4" rx="2" fill="#5d7896"/>`
    s += `<circle cx="${x + w - 11}" cy="${yy + 8.5}" r="1.8" fill="${(i + v) % 4 === 1 ? AMBER : c}"/>`
  }
  return s + bolt(x + 4, y + h - 4, 1.1) + bolt(x + w - 4, y + h - 4, 1.1)
}
// Cargo transfer bag strapped to the wall.
const ctb = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="url(#bag)" ${stroke}/><path d="M${x + w * .3} ${y} V${y + h} M${x + w * .7} ${y} V${y + h}" stroke="#2a3a4d" stroke-width="2.4"/><rect x="${x + w * .36}" y="${y + h * .28}" width="${w * .28}" height="${h * .3}" rx="1.5" fill="#dfeaf5" opacity=".8"/><path d="M${x + 2} ${y + 2.5} H${x + w - 2}" stroke="#fff" stroke-opacity=".3"/>`
// Blue handrail on two stand-offs, as on the ISS.
const handrail = (x, y, len, vertical = false) => vertical
  ? `<rect x="${x - 1}" y="${y}" width="8" height="5" rx="1" fill="#0a121c"/><rect x="${x - 1}" y="${y + len - 5}" width="8" height="5" rx="1" fill="#0a121c"/><rect x="${x}" y="${y}" width="6" height="${len}" rx="3" fill="url(#rail)" ${stroke}/>`
  : `<rect x="${x}" y="${y - 1}" width="5" height="8" rx="1" fill="#0a121c"/><rect x="${x + len - 5}" y="${y - 1}" width="5" height="8" rx="1" fill="#0a121c"/><rect x="${x}" y="${y}" width="${len}" height="6" rx="3" fill="url(#rail)" ${stroke}/>`
const vent = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#070d15" ${stroke}/>${[...Array(Math.floor((h - 4) / 4))].map((_, i) => `<path d="M${x + 3} ${y + 4 + i * 4} H${x + w - 3}" stroke="#3d5f84" stroke-width="1.2"/>`).join('')}`
const laptop = (x, y) => `<path d="M${x} ${y + 16} H${x + 30} L${x + 34} ${y + 21} H${x - 4} Z" fill="#101c2b" ${stroke}/><rect x="${x + 1}" y="${y}" width="28" height="17" rx="2" fill="#070d15" ${stroke}/><rect x="${x + 3}" y="${y + 2}" width="24" height="13" rx="1" fill="url(#screenC)"/><path d="M${x + 5} ${y + 11} l5 -4 l4 2 l6 -5" stroke="${CYAN_L}" stroke-width="1" fill="none"/>`
// A hatch door swung back and stowed against the wall.
const stowedHatch = (x, y, s) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="12" fill="url(#cab)" ${stroke}/><rect x="${x + 5}" y="${y + 5}" width="${s - 10}" height="${s - 10}" rx="9" fill="none" stroke="#3d5f84"/>
  <circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s * .22}" fill="#06131c" ${stroke}/><circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s * .22}" fill="none" stroke="${CYAN}" stroke-opacity=".5"/>
  <path d="M${x + s / 2 - s * .34} ${y + s - 11} H${x + s / 2 + s * .34}" stroke="url(#rail)" stroke-width="4" stroke-linecap="round"/>${[[7, 7], [s - 7, 7], [7, s - 7], [s - 7, s - 7]].map(([a, b]) => bolt(x + a, y + b, 1.3)).join('')}`

// ------------------------------------------------------------------ module shell
function shell(D, m) {
  const SW = D.wall, FW = D.front
  const { x, y, w, h, wallH } = m
  const fy = y + wallH, by = y + h - FW, fx = x + SW, fw = w - 2 * SW, fh = by - fy
  const wins = D.windows.filter(v => v.module === m.id)
  const hole = v => {
    const [wx, wy, ww, wh] = v.rect
    if (v.kind === 'port') return `M${wx} ${wy + wh / 2} A${ww / 2} ${wh / 2} 0 1 0 ${wx + ww} ${wy + wh / 2} A${ww / 2} ${wh / 2} 0 1 0 ${wx} ${wy + wh / 2} Z`
    return chamfer(wx, wy, ww, wh, v.kind === 'cupola' ? 38 : 16)
  }
  // ---- back wall, seen face on
  let wall = `<path fill-rule="evenodd" d="M${x} ${y} H${x + w} V${fy} H${x} Z ${wins.map(hole).join(' ')}" fill="url(#wallG)"/>`
  let seams = ''
  for (let px = x + SW + 6; px < x + w - SW; px += 64) seams += `<path d="M${px} ${y + 22} V${fy - 24}" stroke="#2e4d70" stroke-opacity=".5"/><path d="M${px + 1.2} ${y + 22} V${fy - 24}" stroke="#04090f" stroke-opacity=".45"/>`
  for (const yy of [y + 60, y + Math.round(wallH * .62)]) seams += `<path d="M${x} ${yy} H${x + w}" stroke="#2e4d70" stroke-opacity=".35"/><path d="M${x} ${yy + 1.2} H${x + w}" stroke="#04090f" stroke-opacity=".4"/>`
  wall += `<clipPath id="wc-${m.id}"><path clip-rule="evenodd" d="M${x} ${y} H${x + w} V${fy} H${x} Z ${wins.map(hole).join(' ')}"/></clipPath><g clip-path="url(#wc-${m.id})">${seams}
    <rect x="${x}" y="${y}" width="${w}" height="20" fill="#070f1a"/>
    <rect x="${x + 28}" y="${y + 8}" width="${w - 56}" height="6" rx="3" fill="#0e2233"/><rect x="${x + 30}" y="${y + 10}" width="${w - 60}" height="2.4" rx="1.2" fill="${m.tint}" opacity=".28"/>
    <rect x="${x}" y="${y + 20}" width="${w}" height="26" fill="url(#aoTop)" opacity=".7"/>
    <rect x="${x}" y="${fy - 24}" width="${w}" height="24" fill="url(#hullV)"/><path d="M${x} ${fy - 24} H${x + w}" stroke="${m.tint}" stroke-opacity=".55" stroke-width="1.4"/><path d="M${x} ${fy - 9} H${x + w}" stroke="#04090f" stroke-opacity=".6"/></g>`
  // window frames
  const frame = v => {
    const [wx, wy, ww, wh] = v.rect
    if (v.kind === 'port') {
      const cx = wx + ww / 2, cy = wy + wh / 2, r = ww / 2
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#06131c" opacity=".28"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#glassSheen)"/><circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="url(#cab)" stroke-width="11"/><circle cx="${cx}" cy="${cy}" r="${r + 11.5}" fill="none" stroke="${OUTL}" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="${r + .6}" fill="none" stroke="${OUTL}" stroke-width="2.6"/>
        <circle cx="${cx}" cy="${cy}" r="${r + 1.8}" fill="none" stroke="${CYAN}" stroke-opacity=".55" stroke-width="1"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(i => bolt(cx + Math.cos(i * Math.PI / 4 + .39) * (r + 6), cy + Math.sin(i * Math.PI / 4 + .39) * (r + 6), 1.3)).join('')}`
    }
    const c = v.kind === 'cupola' ? 38 : 16
    let s = `<path d="${chamfer(wx, wy, ww, wh, c)}" fill="#06131c" opacity=".28"/><path d="${chamfer(wx, wy, ww, wh, c)}" fill="url(#glassSheen)"/>
      <path d="${chamfer(wx - 8, wy - 8, ww + 16, wh + 16, c + 5)}" fill="none" stroke="url(#cab)" stroke-width="14" stroke-linejoin="round"/>
      <path d="${chamfer(wx - 15, wy - 15, ww + 30, wh + 30, c + 9)}" fill="none" stroke="${OUTL}" stroke-width="1.5"/>
      <path d="${chamfer(wx - 1, wy - 1, ww + 2, wh + 2, c)}" fill="none" stroke="${OUTL}" stroke-width="3"/>
      <path d="${chamfer(wx + 1.5, wy + 1.5, ww - 3, wh - 3, c - 1)}" fill="none" stroke="${CYAN}" stroke-opacity=".5" stroke-width="1"/>
      ${[.2, .5, .8].map(f => bolt(wx + ww * f, wy - 8) + bolt(wx + ww * f, wy + wh + 8)).join('')}${bolt(wx - 8, wy + wh / 2)}${bolt(wx + ww + 8, wy + wh / 2)}`
    if (v.kind === 'cupola') {
      // seven panes: a centre pane and six around it
      const ix = wx + ww * .3, ix2 = wx + ww * .7, iy = wy + wh * .26, iy2 = wy + wh * .74
      const bar = d => `<path d="${d}" stroke="${OUTL}" stroke-width="8.5" stroke-linecap="round" fill="none"/><path d="${d}" stroke="#2f4a68" stroke-width="5.5" stroke-linecap="round" fill="none"/>`
      s += bar(`M${ix} ${iy} H${ix2} L${ix2 + 22} ${wy + wh / 2} L${ix2} ${iy2} H${ix} L${ix - 22} ${wy + wh / 2} Z`)
        + bar(`M${ix} ${iy} L${wx + c * .8} ${wy + 3}`) + bar(`M${ix2} ${iy} L${wx + ww - c * .8} ${wy + 3}`) + bar(`M${ix} ${iy2} L${wx + c * .8} ${wy + wh - 3}`) + bar(`M${ix2} ${iy2} L${wx + ww - c * .8} ${wy + wh - 3}`)
        + bar(`M${ix - 22} ${wy + wh / 2} H${wx + 3}`) + bar(`M${ix2 + 22} ${wy + wh / 2} H${wx + ww - 3}`)
    } else if (ww > 150) {
      for (const f of [1 / 3, 2 / 3]) s += `<rect x="${r1(wx + ww * f - 4)}" y="${wy - 1}" width="8" height="${wh + 2}" fill="url(#cabH)" ${stroke}/>`
    }
    return s
  }

  // ---- floor, seen from above: dark deck plates with a soft bevel
  let floor = `<rect x="${x}" y="${fy}" width="${w}" height="${h - wallH}" fill="url(#floorG)"/><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="${m.tint}" opacity=".035"/>`
  const cols = Math.max(2, Math.round(fw / 86)), rows = Math.max(2, Math.round(fh / 62)), pw = fw / cols, ph = fh / rows
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const px = r1(fx + c * pw), py = r1(fy + r * ph), px1 = r1(fx + (c + 1) * pw), py1 = r1(fy + (r + 1) * ph)
    floor += `<rect x="${px + 1.5}" y="${py + 1.5}" width="${r1(px1 - px - 3)}" height="${r1(py1 - py - 3)}" rx="2" fill="${rnd() < .5 ? '#000' : '#9fc0de'}" opacity="${r2(rnd() * .06)}"/>
      <path d="M${px + 2} ${py + 2} H${px1 - 2}" stroke="#5d7896" stroke-opacity=".4" stroke-width="1.1"/>
      <path d="M${px + 2} ${r1(py1 - 1.5)} H${px1 - 2} M${r1(px1 - 1.5)} ${py + 2} V${py1 - 2}" stroke="#03070c" stroke-opacity=".6" stroke-width="1.2"/>
      ${bolt(px + 6, py + 6, 1.2)}${bolt(px1 - 6, py + 6, 1.2)}${bolt(px + 6, py1 - 6, 1.2)}${bolt(px1 - 6, py1 - 6, 1.2)}`
    if (rnd() < .18) floor += `<path d="M${r1(px + 10 + rnd() * 30)} ${r1(py + 12 + rnd() * 26)} q${r1(8 + rnd() * 14)} ${r1(rnd() * 6 - 3)} ${r1(18 + rnd() * 14)} 0" stroke="#03070c" stroke-opacity=".35" stroke-width="1.1" fill="none"/>`
  }
  floor += `<rect x="${fx + 8}" y="${fy + 8}" width="${fw - 16}" height="${fh - 16}" rx="8" fill="none" stroke="${m.tint}" stroke-opacity=".3" stroke-width="2"/>
    <rect x="${fx}" y="${fy}" width="${fw}" height="64" fill="url(#aoTop)"/><rect x="${fx}" y="${fy}" width="46" height="${fh}" fill="url(#aoL)" opacity=".7"/><rect x="${fx + fw - 46}" y="${fy}" width="46" height="${fh}" fill="url(#aoR)" opacity=".7"/>
    <ellipse cx="${x + w / 2}" cy="${fy + fh * .45}" rx="${fw * .42}" ry="${fh * .36}" fill="url(#pool)"/>`

  // ---- side walls and the front wall, as the hull seen edge on
  const side = (sx, flip) => `<rect x="${sx}" y="${fy}" width="${SW}" height="${h - wallH}" fill="url(#hullH)"/>
    <rect x="${sx + (flip ? 8 : SW - 12)}" y="${fy + 14}" width="4" height="${fh - 28}" rx="2" fill="#0e2233"/><rect x="${sx + (flip ? 9 : SW - 11)}" y="${fy + 16}" width="2" height="${fh - 32}" rx="1" fill="${CYAN}" opacity=".5"/>
    <rect x="${sx + (flip ? 16 : 6)}" y="${fy}" width="5" height="${h - wallH}" fill="#0a121c" opacity=".8"/><rect x="${sx + (flip ? 23 : 12)}" y="${fy}" width="3" height="${h - wallH}" fill="#c8461a" opacity=".55"/>
    ${[.2, .5, .8].map(f => `<rect x="${sx + (flip ? 14 : 4)}" y="${r1(fy + fh * f)}" width="14" height="7" rx="2" fill="#2a4563" ${stroke}/>`).join('')}`
  const front = `<rect x="${x}" y="${by}" width="${w}" height="${FW}" fill="url(#hullV)"/>`
  const label = text(fx + 18, by - 26, m.label, 13, m.tint, 'letter-spacing="3" opacity=".8"')
  const body = `<clipPath id="hull-${m.id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20"/></clipPath>
    <g clip-path="url(#hull-${m.id})">${wall}${floor}${side(x, false)}${side(x + w - SW, true)}${front}${label}</g>`
  const rim = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="none" stroke="#03070c" stroke-width="7"/><rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="22" fill="none" stroke="${CYAN}" stroke-opacity=".14" stroke-width="9"/>
    <rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="22" fill="none" stroke="${CYAN}" stroke-opacity=".7" stroke-width="1.4"/>`
  return { body, frames: wins.map(frame).join(''), rim, fx, fy, fw, fh, by }
}

// ------------------------------------------------------------------ what stands in each module
const consoleCabinet = (cx, wy, half = 80) => `<path d="M${cx - half} ${wy - 92} H${cx + half} L${cx + half + 2} ${wy - 18} H${cx - half - 2} Z" fill="url(#cab)" ${stroke}/><path d="M${cx - half + 1.5} ${wy - 90.5} H${cx + half - 1.5}" stroke="${CYAN}" stroke-opacity=".6" stroke-width="1.2"/>`
const buttons = (x, y, n, gap, colors) => [...Array(n)].map((_, i) => `<rect x="${x + i * gap}" y="${y - (i % 2)}" width="${gap - 8}" height="7" rx="2" fill="${colors[i % colors.length]}" ${stroke}/>`).join('')
const stencil = (x, y, s, color, size = 13, anchor = 'start') => text(x, y, s, size, color, `letter-spacing="3" opacity=".72" text-anchor="${anchor}"`)
const chevrons = (cx, y, dir, color) => [0, 10].map(d => `<path d="M${cx - 11} ${y + d * dir} l11 ${9 * dir} l11 ${-9 * dir}" stroke="${color}" stroke-opacity=".85" stroke-width="3" fill="none"/>`).join('')

function dressCupola(D, m) {
  const fy = m.y + m.wallH, cx = m.x + m.w / 2
  const wall = ''
  const pad = `<path d="M${cx - 62} ${fy + 78} l31 -44 h62 l31 44 l-31 44 h-62 Z" fill="#0b1826" opacity=".55"/><path d="M${cx - 62} ${fy + 78} l31 -44 h62 l31 44 l-31 44 h-62 Z" fill="none" stroke="${m.tint}" stroke-opacity=".5" stroke-width="2" stroke-dasharray="10 6"/>
    ${stencil(cx, fy + 83, 'EARTH OBSERVATION', m.tint, 11, 'middle')}`
  return { wall, floor: pad }
}

function dressDock(D, m) {
  const fy = m.y + m.wallH, cx = m.x + m.w / 2, [SX, SY] = D.spawn
  const col = (px, label, c) => `<rect x="${px}" y="${m.y + 34}" width="26" height="96" rx="4" fill="#070d15" ${stroke}/>${[0, 1, 2, 3].map(i => lamp(px + 13, m.y + 50 + i * 20, i < 3 ? c : '#2c343d', 3.4)).join('')}${text(px + 13, m.y + 144, label, 7, DIM, 'text-anchor="middle" letter-spacing=".8"')}`
  const wall = `${col(m.x + 35, 'LATCH', MINT)}${col(m.x + m.w - 61, 'PRESS', CYAN)}${sign(cx, fy - 30, 168, 'DOCKING PORT', 'ship')}`
  // arrival pad in front of the hatch the crew came through
  const floor = `<rect x="${SX - 54}" y="${SY - 24}" width="108" height="52" rx="8" fill="#03070c" opacity=".4"/>
    <path d="M${SX - 54} ${SY - 10} v-14 h16 M${SX + 54} ${SY - 10} v-14 h-16 M${SX - 54} ${SY + 14} v14 h16 M${SX + 54} ${SY + 14} v14 h-16" stroke="${AMBER}" stroke-width="3" fill="none"/>
    ${chevrons(SX, SY - 8, 1, AMBER)}${stencil(SX, SY - 32, 'AIRLOCK', AMBER, 11, 'middle')}`
  return { wall, floor }
}

function dressNode3(D, m) {
  const fy = m.y + m.wallH, ix = m.x + D.wall
  const wall = `${rackFront(ix + 4, fy - 78, 48, 54, 0)}${rackFront(ix + 56, fy - 78, 48, 54, 2)}
    ${stowedHatch(m.x + 262, fy - 78, 56)}${ctb(m.x + 324, fy - 72, 38, 46)}
    ${mono(ix + 8, m.y + 38, 'ECLSS · WATER', 8, DIM, 'letter-spacing="1.4"')}`
  const floor = stencil(m.x + 200, fy + 50, '↑ CUPOLA', '#5fd8f0', 12, 'middle')
  return { wall, floor }
}

function dressNode1(D, m) {
  const fy = m.y + m.wallH, live = D.live
  const R = id => D.solids.find(s => s.id === id).rect
  const [tx, ty, tw, th] = live.coreTube, tcx = tx + tw / 2
  // power core: the column that feeds the three buses
  const core = `<g><ellipse cx="${tcx + 6}" cy="${fy + 20}" rx="54" ry="9" fill="url(#ao)"/>
    <rect x="${tx + tw + 10}" y="${ty + 68}" width="26" height="7" fill="#c8461a" ${stroke}/><rect x="${tx + tw + 10}" y="${ty + 84}" width="26" height="5" fill="#3d5f84" ${stroke}/>
    <rect x="${tx - 10}" y="${ty - 18}" width="${tw + 20}" height="${th + 40}" rx="12" fill="url(#dark)" ${stroke}/>
    <rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="10" fill="url(#coreG)" stroke="#0b1512" stroke-width="2"/>
    ${[...Array(6)].map((_, i) => `<ellipse cx="${tcx}" cy="${ty + 14 + i * 17}" rx="${tw / 2 - 3}" ry="3.6" fill="none" stroke="${MINT}" stroke-width="1.6" opacity="${r2(.9 - i * .1)}"/>`).join('')}
    <rect x="${tx + 5}" y="${ty + 6}" width="4" height="${th - 12}" rx="2" fill="#fff" opacity=".18"/>
    <rect x="${tx - 6}" y="${ty - 8}" width="${tw + 12}" height="10" rx="3" fill="url(#cabTop)" ${stroke}/><rect x="${tx - 6}" y="${ty + th - 2}" width="${tw + 12}" height="10" rx="3" fill="url(#cabTop)" ${stroke}/>
    <rect x="${tx + 6}" y="${ty - 14}" width="${tw - 12}" height="5" rx="2" fill="url(#acc)"/>
    ${box(tx - 14, fy, 60, 20, 8, { front: 'url(#dark)', topFill: '#31465e', shadow: false })}</g>`
  const [x, y, w] = R('power'), cx = x + w / 2
  const consolePower = `<g><ellipse cx="${cx + 6}" cy="${y + 56}" rx="${w * .58}" ry="12" fill="url(#ao)"/>${consoleCabinet(cx, fy)}
    <rect x="${cx - 74}" y="${fy - 86}" width="20" height="60" rx="3" fill="url(#dark)" ${stroke}/>${[MINT, BUS.comms, VIOLET].map((c, i) => `<rect x="${cx - 70}" y="${fy - 81 + i * 18}" width="12" height="12" rx="2" fill="${c}"/>`).join('')}
    ${screenAt(live.powerScreen)}
    <rect x="${cx + 56}" y="${fy - 86}" width="20" height="60" rx="3" fill="#101c2b" ${stroke}/>${[0, 1, 2].map(i => `<rect x="${cx + 60}" y="${fy - 82 + i * 18}" width="12" height="14" rx="2" fill="#070d15"/><rect x="${cx + 62}" y="${fy - 81 + i * 18 + (i === 1 ? 6 : 0)}" width="8" height="6" rx="1.5" fill="${i === 1 ? '#5d7896' : ORANGE}"/>`).join('')}
    ${box(x, y + 10, w, 46, 14, { stripe: [26, 6] })}
    ${buttons(x + 14, y - 1, 7, 22, ['#101c2b', MINT, '#101c2b', BUS.comms, '#101c2b', VIOLET, '#101c2b'])}
    ${[0, 1, 2, 3].map(i => `<rect x="${x + 20 + i * 38}" y="${y + 20}" width="24" height="5" rx="2" fill="#5d7896"/>`).join('')}
    ${bolt(x + 8, y + 44)}${bolt(x + w - 8, y + 44)}
    ${sign(cx, fy - 116, 148, 'POWER GRID', 'power')}</g>`
  const wall = `${core}${consolePower}${ctb(m.x + 304, fy - 76, 30, 50)}${ctb(m.x + 338, fy - 60, 26, 34)}`
  const t = D.links.find(l => l.id === 'greenhouse').rect
  const floor = `${chevrons(t[0] + t[2] / 2, m.y + m.h - D.front - 44, 1, GREEN)}${stencil(t[0] + t[2] / 2, m.y + m.h - D.front - 54, 'GREENHOUSE', GREEN, 12, 'middle')}`
  return { wall, floor }
}

function dressLab(D, m) {
  const fy = m.y + m.wallH, ix = m.x + D.wall
  const R = id => D.solids.find(s => s.id === id).rect
  const win = D.windows.find(v => v.module === 'lab').rect
  let wall = ''
  for (let i = 0; i < 2; i++) wall += rackFront(ix + 2 + i * 58, m.y + 30, 54, m.wallH - 60, i + 1)
  for (let i = 0; i < 3; i++) wall += rackFront(win[0] + win[2] + 26 + i * 62, m.y + 30, 58, m.wallH - 60, i)
  wall += mono(win[0] + win[2] / 2, win[1] + win[3] + 30, 'EXTERIOR VIEW', 8, DIM, 'text-anchor="middle" letter-spacing="1.6"')
  // rover bay loading zone
  const [px, py, pw, ph] = R('payload')
  const zone = { x: px - 26, y: py - 14, w: pw + 52, h: ph + 50 }
  const floor = `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" fill="none" stroke="${ORANGE}" stroke-width="5" stroke-dasharray="17 9" opacity=".7"/>
    ${text(px + pw / 2, zone.y + zone.h + 16, 'ROVER BAY', 13, ORANGE, 'text-anchor="middle" letter-spacing="6" opacity=".7"')}`
  return { wall, floor }
}

function dressNode2(D, m) {
  const fy = m.y + m.wallH, ix = m.x + D.wall
  // crew quarters: four sleep stations, two each side of the hatch
  const cabin = (px, n) => `<rect x="${px}" y="${fy - 82}" width="50" height="60" rx="6" fill="url(#panelG)" ${stroke}/><rect x="${px + 5}" y="${fy - 77}" width="40" height="50" rx="4" fill="#0b1826" stroke="#3d5f84" stroke-opacity=".7"/>
    <ellipse cx="${px + 25}" cy="${fy - 50}" rx="26" ry="26" fill="url(#warmGlow)" opacity=".5"/><rect x="${px + 9}" y="${fy - 72}" width="32" height="5" rx="2" fill="#ffd9a0" opacity=".55"/>
    <rect x="${px + 12}" y="${fy - 40}" width="26" height="10" rx="2" fill="#070d15"/>${text(px + 25, fy - 32, `CQ-${n}`, 8, IVORY, 'text-anchor="middle" letter-spacing="1"')}`
  const wall = `${cabin(ix + 2, 1)}${cabin(ix + 56, 2)}${cabin(m.x + m.w - D.wall - 108, 3)}${cabin(m.x + m.w - D.wall - 54, 4)}${mono(ix + 8, m.y + 38, 'CREW QUARTERS', 8, DIM, 'letter-spacing="1.4"')}`
  const t = D.links.find(l => l.id === 'comms').rect
  const floor = `${chevrons(t[0] + t[2] / 2, m.y + m.h - D.front - 44, 1, '#5fd8f0')}${stencil(t[0] + t[2] / 2, m.y + m.h - D.front - 54, 'MARS RELAY', '#5fd8f0', 12, 'middle')}${stencil(m.x + m.w / 2 + 82, fy + 50, '↑ DOCKING PORT', AMBER, 12, 'middle')}`
  return { wall, floor }
}

function dressComms(D, m) {
  const fy = m.y + m.wallH, live = D.live
  const [x, y, w] = D.solids.find(s => s.id === 'comms').rect, cx = x + w / 2, [ox, oy, or] = live.scope, [bx0, by0] = live.beacon
  const wall = `<g><ellipse cx="${cx + 6}" cy="${y + 56}" rx="${w * .58}" ry="12" fill="url(#ao)"/>${consoleCabinet(cx, fy)}
    ${screenAt(live.commsScreen)}
    <circle cx="${ox}" cy="${oy}" r="${or + 4}" fill="url(#dark)" ${stroke}/><circle cx="${ox}" cy="${oy}" r="${or}" fill="#082a25" stroke="#0b1512" stroke-width="1.5"/>
    <circle cx="${ox}" cy="${oy}" r="${r1(or * .6)}" fill="none" stroke="${MINT}" stroke-width="1" opacity=".45"/><path d="M${ox - or} ${oy} H${ox + or} M${ox} ${oy - or} V${oy + or}" stroke="${MINT}" stroke-width=".8" opacity=".35"/>
    ${box(x, y + 10, w, 46, 14, { stripe: [26, 6] })}
    ${buttons(x + 14, y - 1, 7, 22, ['#101c2b', ORANGE, '#101c2b', MINT, '#101c2b', '#101c2b', ORANGE])}
    ${[0, 1, 2, 3].map(i => `<rect x="${x + 20 + i * 38}" y="${y + 20}" width="24" height="5" rx="2" fill="#5d7896"/>`).join('')}
    ${bolt(x + 8, y + 44)}${bolt(x + w - 8, y + 44)}
    ${sign(cx, fy - 116, 166, 'ROVER COMMS', 'antenna')}
    <rect x="${bx0 - 10}" y="${by0 + 4}" width="20" height="6" rx="2" fill="url(#steel)" ${stroke}/><path d="M${bx0 - 8} ${by0 + 4} A8 9 0 0 1 ${bx0 + 8} ${by0 + 4} Z" fill="#5a1a10" ${stroke}/></g>`
  return { wall, floor: '' }
}

// One greenhouse rack. Two shelves for low crops, or one tall shelf with a trellis over an opaque
// root chamber. The plants, the light and the status lamp are drawn by the game.
function rack(b) {
  const [x, y, w, h] = b.box, tall = b.kind === 'tall'
  let s = `<rect x="${x - 2}" y="${y + 4}" width="${w + 4}" height="${h - 4}" fill="#060c14" opacity=".55"/>`
  // back panel and uprights
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#0a1522" ${stroke}/><rect x="${x + 5}" y="${y + 14}" width="${w - 10}" height="${h - 30}" fill="url(#mesh)"/>
    <rect x="${x}" y="${y}" width="5" height="${h}" fill="url(#steel)" ${stroke}/><rect x="${x + w - 5}" y="${y}" width="5" height="${h}" fill="url(#steel)" ${stroke}/>
    <rect x="${x - 2}" y="${y - 3}" width="${w + 4}" height="11" rx="2" fill="url(#cabTop)" ${stroke}/>`
  for (const [lx, ly, lw] of b.leds) s += `<rect x="${lx - 3}" y="${ly - 2}" width="${lw + 6}" height="8" rx="2" fill="#101c2b" ${stroke}/><rect x="${lx}" y="${ly}" width="${lw}" height="4" rx="2" fill="#31465e"/>`
  if (tall) {
    const sy = b.shelves[0]
    // trellis
    s += [...Array(4)].map((_, i) => `<path d="M${x + 8} ${r1(y + 24 + i * 22)} H${x + w - 8}" stroke="#5d7896" stroke-opacity=".55" stroke-width="1"/>`).join('')
      + b.slots.map(sx => `<path d="M${sx} ${y + 16} V${sy}" stroke="#5d7896" stroke-opacity=".5" stroke-width="1"/>`).join('')
    // opaque root chamber with a harvest drawer
    s += `<rect x="${x + 2}" y="${sy}" width="${w - 4}" height="${y + h - sy}" rx="2" fill="url(#dark)" ${stroke}/><path d="M${x + 3.5} ${sy + 1.3} H${x + w - 3.5}" stroke="${GREEN}" stroke-opacity=".6" stroke-width="1.2"/>
      <rect x="${x + 22}" y="${sy + 7}" width="${w - 62}" height="12" rx="2" fill="#101c2b" ${stroke}/><rect x="${x + w / 2 - 22}" y="${sy + 11}" width="26" height="4" rx="2" fill="#7d97b3"/>`
  } else {
    for (const sy of b.shelves) s += `<rect x="${x + 2}" y="${sy}" width="${w - 4}" height="9" rx="2" fill="url(#cabTop)" ${stroke}/><path d="M${x + 4} ${sy + 1.2} H${x + w - 4}" stroke="${GREEN}" stroke-opacity=".55" stroke-width="1.1"/>`
      + b.slots.map(sx => `<rect x="${sx - 5}" y="${sy - 1.5}" width="10" height="4" rx="1.5" fill="#060c14"/>`).join('')
    const by = b.shelves[1] + 9
    s += `<rect x="${x + 2}" y="${by}" width="${w - 4}" height="${y + h - by}" rx="2" fill="url(#dark)" ${stroke}/>`
  }
  s += `<rect x="${b.tag[0] - 3}" y="${b.tag[1] - 10}" width="24" height="12" rx="2" fill="#0b1826" stroke="${GREEN}" stroke-opacity=".7"/>${text(b.tag[0] + 9, b.tag[1], b.id, 10, IVORY, 'text-anchor="middle" letter-spacing=".6"')}
    <circle cx="${b.lamp[0]}" cy="${b.lamp[1]}" r="4.6" fill="#070d15" ${stroke}/><circle cx="${b.lamp[0]}" cy="${b.lamp[1]}" r="2.6" fill="#2c343d"/>`
  return s
}

function dressGreenhouse(D, m) {
  const fy = m.y + m.wallH, live = D.live, bays = D.greenhouse.bays
  const R = id => D.solids.find(s => s.id === id).rect
  const A = bays.filter(b => b.loop === 'A'), B = bays.filter(b => b.loop === 'B')
  const x0 = A[0].box[0], x1 = A[3].box[0] + A[3].box[2]
  // overhead duct with a fan above each bay
  let wall = `<rect x="${x0 - 30}" y="${m.y + 26}" width="${x1 - x0 + 46}" height="30" rx="6" fill="url(#cab)" ${stroke}/><path d="M${x0 - 28} ${m.y + 28} H${x1 + 14}" stroke="${CYAN}" stroke-opacity=".5" stroke-width="1.1"/>`
  for (const b of A) {
    const cx = b.box[0] + b.box[2] / 2
    wall += `<circle cx="${cx}" cy="${m.y + 41}" r="11" fill="#070d15" ${stroke}/>${[0, 1, 2].map(i => `<path d="M${cx} ${m.y + 41} l${r1(Math.cos(i * 2.094) * 9)} ${r1(Math.sin(i * 2.094) * 9)}" stroke="#7d97b3" stroke-width="3" stroke-linecap="round"/>`).join('')}<circle cx="${cx}" cy="${m.y + 41}" r="2.4" fill="#9fc0de"/>
      <rect x="${cx - 4}" y="${m.y + 56}" width="8" height="${b.box[1] - m.y - 59}" fill="#101c2b" ${stroke}/>
      ${mono(b.box[0] + 4, b.box[1] - 9, b.kind === 'tall' ? 'TRELLIS BAY' : 'LEAF RACK', 7.5, DIM, 'letter-spacing="1.2"')}`
  }
  wall += A.map(rack).join('')
  // seedling shelf and prep bench, left of the hatch
  const [px, py, pw] = R('gh-prep')
  wall += `<g><ellipse cx="${px + pw / 2 + 4}" cy="${py + 56}" rx="${pw * .6}" ry="10" fill="url(#ao)"/>
    <ellipse cx="${px + pw / 2}" cy="${py - 46}" rx="56" ry="46" fill="url(#growGlow)" opacity=".6"/>
    <rect x="${px + 2}" y="${py - 96}" width="${pw - 4}" height="78" rx="3" fill="#0a1522" ${stroke}/><rect x="${px + 6}" y="${py - 92}" width="${pw - 12}" height="4" rx="2" fill="url(#led)"/>
    ${[0, 1].map(t => { const sy = py - 58 + t * 34; return `<rect x="${px + 4}" y="${sy}" width="${pw - 8}" height="6" rx="2" fill="url(#cabTop)" ${stroke}/>` + [...Array(8)].map((_, k) => { const sx = px + 12 + k * 11.4, l = 5 + ((k + t) % 3) * 2.5; return `<path d="M${r1(sx)} ${sy} v${-l} M${r1(sx)} ${r1(sy - l)} q-4 -3 -5 -1 M${r1(sx)} ${r1(sy - l)} q4 -3 5 -1" stroke="${k % 3 ? '#5fbf52' : '#8fe07a'}" stroke-width="1.7" fill="none" stroke-linecap="round"/><rect x="${r1(sx - 2.5)}" y="${sy - 1}" width="5" height="3" rx="1" fill="#060c14"/>` }).join('') }).join('')}
    ${box(px, py + 10, pw, 46, 12, { stripe: [26, 5] })}
    <rect x="${px + 10}" y="${py + 20}" width="34" height="10" rx="2" fill="#101c2b" ${stroke}/><rect x="${px + 50}" y="${py + 20}" width="44" height="10" rx="2" fill="#101c2b" ${stroke}/>
    ${sign(px + pw / 2, py - 122, 96, 'SEEDS', 'seed', 18, 12)}</g>`
  wall += mono(px + 4, m.y + 58, 'CLEAN PREP', 8, DIM, 'letter-spacing="1.4"')
  // alarm beacon by the hatch
  const [bx, bby] = live.ghBeacon
  wall += `<rect x="${bx - 10}" y="${bby + 4}" width="20" height="6" rx="2" fill="url(#steel)" ${stroke}/><path d="M${bx - 8} ${bby + 4} A8 9 0 0 1 ${bx + 8} ${bby + 4} Z" fill="#5a1a10" ${stroke}/>`
  // service bay wall unit: screen, gauges, valve wheel, risers
  const [sx, sy, sw] = R('gh-service'), scx = sx + sw / 2, [gx, gy, gw, gh] = live.ghServiceScreen
  wall += `<g><ellipse cx="${scx + 4}" cy="${sy + 56}" rx="${sw * .58}" ry="10" fill="url(#ao)"/>
    <rect x="${sx + 12}" y="${m.y + 96}" width="7" height="${sy - m.y - 110}" fill="#2b8fb5" ${stroke}/><rect x="${sx + 24}" y="${m.y + 96}" width="7" height="${sy - m.y - 110}" fill="#3f9a4a" ${stroke}/><rect x="${sx + sw - 22}" y="${m.y + 96}" width="6" height="${sy - m.y - 110}" fill="#c8461a" ${stroke}/>
    ${consoleCabinet(scx, fy, 70)}${screenAt([gx, gy, gw, gh], true)}
    ${[0, 1].map(i => { const cx = gx + gw + 22 + i * 30, cy = gy + 14; return `<circle cx="${cx}" cy="${cy}" r="12" fill="#070d15" ${stroke}/><circle cx="${cx}" cy="${cy}" r="9" fill="#0b1826" stroke="${[CYAN, GREEN][i]}" stroke-opacity=".7"/><path d="M${cx} ${cy} l${i ? 5 : -4} -6" stroke="${IVORY}" stroke-width="1.6" stroke-linecap="round"/>` }).join('')}
    <circle cx="${gx + gw + 37}" cy="${gy + 44}" r="9" fill="none" stroke="${ORANGE}" stroke-width="3"/><path d="M${gx + gw + 28} ${gy + 44} h18 M${gx + gw + 37} ${gy + 35} v18" stroke="${ORANGE}" stroke-width="2"/>
    ${box(sx, sy + 10, sw, 46, 12, { stripe: [26, 5] })}
    ${buttons(sx + 12, sy - 1, 6, 22, ['#101c2b', CYAN, '#101c2b', GREEN, '#101c2b', ORANGE])}
    ${sign(scx, fy - 116, 140, 'SERVICE BAY', 'gear', 20, 13)}</g>`

  // ---- floor: clean mat at the hatch, plumbing from the service bay to both rack bands, band B
  const t = D.links.find(l => l.id === 'greenhouse').rect
  let floor = `<rect x="${t[0] - 14}" y="${fy + 4}" width="${t[2] + 28}" height="52" rx="6" fill="url(#grip)"/><rect x="${t[0] - 14}" y="${fy + 4}" width="${t[2] + 28}" height="52" rx="6" fill="none" stroke="${GREEN}" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="12 6"/>
    ${stencil(t[0] + t[2] / 2, fy + 74, 'CLEAN ZONE', GREEN, 11, 'middle')}`
  const pipe = (pts, c) => { const d = 'M' + pts.map(p => p.join(' ')).join(' L'); return `<path d="${d}" fill="none" stroke="#03070c" stroke-width="9" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#22364d" stroke-width="6" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${c}" stroke-opacity=".45" stroke-width="2" stroke-linejoin="round"/>` }
  const [[xs, ya], [xe]] = live.ghFlow.A, [[xs2, yb]] = live.ghFlow.B
  floor += pipe([[xs, fy + 34], [xs, ya], [xe, ya]], '#5fd8f0') + pipe([[xs2, fy + 34], [xs2, yb], [xe, yb]], '#5fd8f0')
  for (const b of A) floor += pipe([[b.box[0] + b.box[2] / 2, ya], [b.box[0] + b.box[2] / 2, fy + 58]], '#5fd8f0')
  floor += mono(x0 + 26, ya - 7, 'LOOP A · SUPPLY / RETURN', 7.5, '#5fd8f0', 'letter-spacing="1.2" opacity=".8"') + mono(x0 + 26, yb + 14, 'LOOP B · SUPPLY / RETURN', 7.5, '#5fd8f0', 'letter-spacing="1.2" opacity=".8"')
  // band B stands in the room: shadow first, then the racks
  floor += B.map(b => `<ellipse cx="${b.box[0] + b.box[2] / 2 + 5}" cy="${b.box[1] + b.box[3] + 2}" rx="${b.box[2] * .56}" ry="8" fill="url(#ao)"/>`).join('') + B.map(rack).join('')
    + B.map(b => mono(b.box[0] + 4, b.box[1] - 8, b.kind === 'tall' ? 'TRELLIS BAY' : 'LEAF RACK', 7.5, DIM, 'letter-spacing="1.2"')).join('')
  floor += stencil(x0, fy + 96, 'BAND A', GREEN, 11) + stencil(x0, yb + 40, 'BAND B', GREEN, 11)
  return { wall, floor }
}

const DRESS = { cupola: dressCupola, dock: dressDock, node3: dressNode3, node1: dressNode1, lab: dressLab, node2: dressNode2, comms: dressComms, greenhouse: dressGreenhouse }

// Power buses recessed in the floor; the game lights them from the live allocation. They cross
// module borders, so each module and each link draws the part inside its own floor.
function grooves(D) {
  const groove = (pts, color) => {
    const d = 'M' + pts.map(p => p.join(' ')).join(' L')
    let ticks = ''
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len
      for (let t = 9; t < len - 4; t += 14) ticks += `<path d="M${r1(ax + ux * t - uy * 4)} ${r1(ay + uy * t + ux * 4)} L${r1(ax + ux * t + uy * 4)} ${r1(ay + uy * t - ux * 4)}" stroke="#03070c" stroke-width="1.6"/>`
    }
    const cap = ([cx, cy]) => `<rect x="${cx - 9}" y="${cy - 5}" width="18" height="10" rx="2" fill="url(#steel)" ${stroke}/><rect x="${cx - 4}" y="${cy - 2.5}" width="8" height="5" rx="1" fill="${color}"/>`
    return `<path d="${d}" fill="none" stroke="#03070c" stroke-width="11" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#22364d" stroke-width="7" stroke-linejoin="round"/>${ticks}
      <path d="${d}" fill="none" stroke="${color}" stroke-opacity=".3" stroke-width="2" stroke-linejoin="round"/>${cap(pts[0])}${cap(pts[pts.length - 1])}`
  }
  return Object.entries(D.conduits).map(([bus, pts]) => groove(pts, BUS[bus])).join('')
}
const clipped = (id, [x, y, w, h], inner) => `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`

function sharedFloor(D, m) {
  const wy0 = D.conduits.life[1][1] - 16, wy1 = D.conduits.comms[1][1] + 16
  let s = ''
  if (['node3', 'node1', 'lab', 'node2'].includes(m.id)) {
    const a = m.x + D.wall + 14, b = m.x + m.w - D.wall - 14
    s += `<rect x="${a}" y="${wy0}" width="${b - a}" height="${wy1 - wy0}" fill="url(#grip)"/><path d="M${a} ${wy0} H${b} M${a} ${wy1} H${b}" stroke="#bfe6ff" stroke-opacity=".28" stroke-width="1.5" stroke-dasharray="18 8"/>`
  }
  return clipped(`fl-${m.id}`, m.floor, s + grooves(D))
}

function moduleSvg(D, m) {
  const sh = shell(D, m), d = DRESS[m.id](D, m)
  const body = `${sh.body}${sharedFloor(D, m)}${d.floor}${sh.frames}${d.wall}${sh.rim}`
  return { name: `mod-${m.id}.svg`, ox: m.x - D.bleed, oy: m.y - D.bleed, w: m.w + 2 * D.bleed, h: m.h + 2 * D.bleed, body }
}

// ------------------------------------------------------------------ links: hatches and tunnels
// The passage floor is painted over the walls it goes through, with the collar that joins the hulls.
function plates(x, y, w, h, n, horizontal) {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#141f2c"/>`
  for (let i = 0; i < n; i++) {
    const a = horizontal ? x + (w * i) / n : y + (h * i) / n
    s += horizontal ? `<path d="M${r1(a)} ${y} V${y + h}" stroke="#03070c" stroke-opacity=".7" stroke-width="1.4"/><path d="M${r1(a + 1.4)} ${y} V${y + h}" stroke="#5d7896" stroke-opacity=".35"/>`
      : `<path d="M${x} ${r1(a)} H${x + w}" stroke="#03070c" stroke-opacity=".7" stroke-width="1.4"/><path d="M${x} ${r1(a + 1.4)} H${x + w}" stroke="#5d7896" stroke-opacity=".35"/>`
  }
  return s
}

function hatchSvg(D, l) {
  const [x, y, w, h] = l.rect, SW = D.wall, a = D.modules.find(m => m.id === l.a)
  const fy = a.y + a.wallH, gx = x + SW, gw = w - 2 * SW
  const top = fy - 46
  // floor through both walls and the gap, and the hazard thresholds
  let s = plates(x, y, w, h, 4, true)
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#grip)" opacity=".6"/>`
    + `<rect x="${x}" y="${y}" width="6" height="${h}" fill="url(#haz)"/><rect x="${x + w - 6}" y="${y}" width="6" height="${h}" fill="url(#haz)"/>`
    + `<rect x="${gx}" y="${y}" width="${gw}" height="${h}" fill="#03070c" opacity=".3"/>` + glow(`M${gx} ${y + 4} V${y + h - 4}`, CYAN, 1.2) + glow(`M${gx + gw} ${y + 4} V${y + h - 4}`, CYAN, 1.2)
    + clipped(`fl-${l.id}`, l.rect, grooves(D)) + `<rect x="${x}" y="${y}" width="${w}" height="40" fill="url(#aoTop)"/>`
  // the collar between the hulls, above the passage: its raised top face, then the cut end facing the viewer
  s += `<rect x="${gx - 6}" y="${fy - 60}" width="${gw + 12}" height="${y - fy + 60}" fill="url(#hullH)"/>
    <rect x="${x}" y="${top}" width="${w}" height="${y - 46 - top}" fill="url(#cabTop)" ${stroke}/>
    <rect x="${x + w / 2 - 3}" y="${top + 8}" width="6" height="${y - top - 62}" rx="3" fill="${CYAN_L}" opacity=".8"/>
    <rect x="${x}" y="${y - 46}" width="${w}" height="46" fill="url(#cab)" ${stroke}/><rect x="${x}" y="${y - 28}" width="${w}" height="6" fill="url(#acc)"/>
    ${bolt(x + 7, y - 8)}${bolt(x + w - 7, y - 8)}${bolt(x + w / 2, y - 8)}
    ${glow(`M${x + 3} ${y - 1.5} H${x + w - 3}`, CYAN, 1.3)}`
  return { name: `link-${l.id}.svg`, ox: l.art[0], oy: l.art[1], w: l.art[2], h: l.art[3], body: s }
}

// The lower jamb of a hatch, drawn over the crew's feet as they pass behind its raised top face.
function stubSvg(D, p, l) {
  const [x, y] = p.at, [w, h] = p.size
  const body = `<rect x="${x}" y="${y}" width="${w}" height="${h - 46}" fill="url(#cabTop)" ${stroke}/>
    <rect x="${x + w / 2 - 3}" y="${y + 9}" width="6" height="${h - 64}" rx="3" fill="${CYAN_L}" opacity=".8"/>
    ${glow(`M${x + 3} ${y + 1.5} H${x + w - 3}`, CYAN, 1.3)}
    <rect x="${x}" y="${y + h - 46}" width="${w}" height="46" fill="url(#cab)" ${stroke}/><rect x="${x}" y="${y + h - 30}" width="${w}" height="6" fill="url(#acc)"/>
    ${bolt(x + 7, y + h - 8)}${bolt(x + w - 7, y + h - 8)}${bolt(x + w / 2, y + h - 8)}`
  return { name: `prop-${p.id}.svg`, ox: x, oy: y, w, h, body, link: l.id }
}

function tunnelSvg(D, l) {
  const [x, y, w, h] = l.rect, a = D.modules.find(m => m.id === l.a), b = D.modules.find(m => m.id === l.b)
  const gy = a.y + a.h, gh = b.y - gy, fyB = b.y + b.wallH
  // the passage floor from the upper room's floor down to the lower room's floor
  let s = plates(x, y, w, h, Math.round(h / 34), false) + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#grip)" opacity=".5"/>`
  s += clipped(`fl-${l.id}`, l.rect, grooves(D))
  // shade under the upper wall and where the passage runs through the lower back wall
  s += `<rect x="${x}" y="${gy}" width="${w}" height="${fyB - gy}" fill="#03070c" opacity=".28"/><rect x="${x}" y="${b.y}" width="${w}" height="70" fill="url(#aoTop)"/>`
  // side light strips, thresholds, and chevrons pointing both ways
  s += glow(`M${x + 4} ${y + 6} V${fyB - 6}`, CYAN, 1.2) + glow(`M${x + w - 4} ${y + 6} V${fyB - 6}`, CYAN, 1.2)
    + `<rect x="${x}" y="${y}" width="${w}" height="6" fill="url(#haz)"/><rect x="${x}" y="${fyB - 6}" width="${w}" height="6" fill="url(#haz)"/>`
    + [.3, .5, .7].map(f => `<path d="M${x + w / 2 - 12} ${r1(y + h * f + 5)} l12 -9 l12 9" stroke="${CYAN_L}" stroke-opacity=".4" stroke-width="2.4" fill="none"/>`).join('')
  // the collar in the gap between the two hulls
  s += `<rect x="${x - 22}" y="${gy - 3}" width="22" height="${gh + 6}" fill="url(#hullV)" ${stroke}/><rect x="${x + w}" y="${gy - 3}" width="22" height="${gh + 6}" fill="url(#hullV)" ${stroke}/>
    ${glow(`M${x - 22} ${gy + gh / 2} H${x}`, CYAN, 1)}${glow(`M${x + w} ${gy + gh / 2} H${x + w + 22}`, CYAN, 1)}`
  // jambs where the passage cuts the lower back wall
  s += `<rect x="${x - 8}" y="${b.y}" width="8" height="${b.wallH}" fill="url(#cabH)" ${stroke}/><rect x="${x + w}" y="${b.y}" width="8" height="${b.wallH}" fill="url(#cabH)" ${stroke}/>
    ${[.2, .5, .8].map(f => bolt(x - 4, b.y + b.wallH * f) + bolt(x + w + 4, b.y + b.wallH * f)).join('')}`
  return { name: `link-${l.id}.svg`, ox: l.art[0], oy: l.art[1], w: l.art[2], h: l.art[3], body: s }
}

// The front edge of a module: a low sill with a handrail, drawn over the crew's feet.
function sillSvg(D, p, m) {
  const [x, y] = p.at, [w, h] = p.size
  const gaps = D.links.filter(l => l.kind === 'tunnel' && l.a === m.id).map(l => [l.rect[0], l.rect[0] + l.rect[2]]).sort((a, b) => a[0] - b[0])
  const runs = []
  let cur = x
  for (const [g0, g1] of gaps) { runs.push([cur, g0]); cur = g1 }
  runs.push([cur, x + w])
  const rail = (a, b) => b - a < 60 ? '' : `<rect x="${a}" y="${y + 5}" width="${b - a}" height="6" rx="3" fill="url(#rail)" ${stroke}/>` + [...Array(Math.floor((b - a - 12) / 86) + 1)].map((_, i) => `<rect x="${a + 6 + i * 86}" y="${y + 10}" width="6" height="9" fill="url(#rail)" ${stroke}/>`).join('')
  let s = ''
  for (const [a, b] of runs) {
    const first = a === x, last = b === x + w
    s += `<path d="M${a} ${y + 17} H${b} V${y + h - (last ? 20 : 0)} ${last ? `Q${b} ${y + h} ${b - 20} ${y + h}` : ''} H${a + (first ? 20 : 0)} ${first ? `Q${a} ${y + h} ${a} ${y + h - 20}` : ''} Z" fill="url(#cabTop)" ${stroke}/>
      <path d="M${a + 2} ${y + 18.5} H${b - 2}" stroke="${CYAN}" stroke-opacity=".7" stroke-width="1.3"/>
      <rect x="${a + (first ? 8 : 0)}" y="${y + 34}" width="${b - a - (first ? 8 : 0) - (last ? 8 : 0)}" height="${h - 34}" fill="#070f1a" opacity=".85"/>
      ${rail(a + (first ? 40 : 12), b - (last ? 40 : 12))}`
    if (!first) s += `<rect x="${a}" y="${y + 17}" width="6" height="${h - 17}" fill="url(#haz)"/>`
    if (!last) s += `<rect x="${b - 6}" y="${y + 17}" width="6" height="${h - 17}" fill="url(#haz)"/>`
  }
  return { name: `prop-${p.id}.svg`, ox: x, oy: y, w, h, body: s }
}

// ------------------------------------------------------------------ freestanding props
function furniture(D) {
  const live = D.live
  const R = id => D.solids.find(s => s.id === id).rect
  const frame = (id, body) => { const p = D.props.find(q => q.id === id); return { name: `prop-${id}.svg`, w: p.size[0], h: p.size[1], ox: p.at[0], oy: p.at[1], body } }

  // Mission Ops: a round holo-table
  const [ex, ey] = live.emitter
  const ops = frame('ops', `
    <ellipse cx="${ex + 5}" cy="${ey + 41}" rx="80" ry="10" fill="url(#ao)"/>
    <path d="M${ex - 70} ${ey} A70 20 0 0 0 ${ex + 70} ${ey} V${ey + 22} A70 20 0 0 1 ${ex - 70} ${ey + 22} Z" fill="url(#dark)" ${stroke}/>
    <path d="M${ex - 69.6} ${ey + 5} A70 20 0 0 0 ${ex + 69.6} ${ey + 5}" fill="none" stroke="${ORANGE}" stroke-width="4"/>
    <ellipse cx="${ex}" cy="${ey}" rx="70" ry="20" fill="url(#cabTop)" ${stroke}/>
    <ellipse cx="${ex}" cy="${ey}" rx="55" ry="14.5" fill="url(#glassDark)" stroke="#04090f" stroke-width="2"/>
    <ellipse cx="${ex}" cy="${ey}" rx="42" ry="10.5" fill="none" stroke="${CYAN}" stroke-width="1.4" opacity=".8"/>
    <ellipse cx="${ex}" cy="${ey}" rx="24" ry="6" fill="none" stroke="${CYAN}" stroke-width="1" opacity=".55"/>
    <ellipse cx="${ex}" cy="${ey}" rx="6" ry="2" fill="${CYAN}"/>
    ${[...Array(8)].map((_, i) => { const a = (i / 8) * Math.PI * 2 + .39; return bolt(ex + Math.cos(a) * 63, ey + Math.sin(a) * 17.5, 1.4) }).join('')}
    ${sign(ex, ey + 23, 128, 'MISSION OPS', 'orbit', 18, 12)}`)

  // Rover bay: the rover itself on a lift platform, between two marker posts
  const [px, py, pw, ph] = R('payload')
  const top = py + 48
  const [bsx, bsy, bsw, bsh] = live.battScreen
  const [rvx, rvy] = live.rover
  const post = x => `<rect x="${x}" y="${py - 20}" width="8" height="34" fill="url(#yel)" ${stroke}/><rect x="${x - 2}" y="${py - 9}" width="12" height="5" fill="#101820"/><rect x="${x - 2}" y="${py - 24}" width="12" height="7" rx="2" fill="url(#dark)" ${stroke}/><circle cx="${x + 4}" cy="${py - 27}" r="3.4" fill="#ff8f45" ${stroke}/>`
  const payload = frame('payload', `
    <ellipse cx="${px + pw / 2 + 4}" cy="${py + ph + 1}" rx="112" ry="12" fill="url(#ao)"/>
    ${post(px + 14)}${post(px + pw - 22)}
    <path d="M${px} ${top} L${px + 10} ${py + 6} H${px + pw - 10} L${px + pw} ${top} Z" fill="url(#steelTop)" ${stroke}/>
    <ellipse cx="${px + pw / 2}" cy="${py + 27}" rx="88" ry="15" fill="#03070c" opacity=".3"/><ellipse cx="${px + pw / 2}" cy="${py + 27}" rx="88" ry="15" fill="none" stroke="${CYAN_L}" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="6 5"/>
    <g transform="translate(${rvx} ${rvy})">${roverSvg().body}</g>
    <path d="M${px} ${top} L${px + 1.6} ${top - 6} H${px + pw - 1.6} L${px + pw} ${top} Z" fill="url(#haz)" ${stroke}/>
    <rect x="${px}" y="${top}" width="${pw}" height="${py + ph - top}" fill="url(#dark)" ${stroke}/>
    <rect x="${px}" y="${py + ph - 5}" width="${pw}" height="5" fill="#000" opacity=".3"/>
    <rect x="${bsx}" y="${bsy}" width="${bsw}" height="${bsh}" rx="2" fill="url(#screen)" ${stroke}/>
    ${sign(px + pw / 2, top + 2, 92, 'PAYLOAD', 'crate', 18, 12)}
    <circle cx="${px + pw - 46}" cy="${top + 11}" r="3.5" fill="${MINT}"/><circle cx="${px + pw - 35}" cy="${top + 11}" r="3.5" fill="#ff8f45"/><rect x="${px + pw - 26}" y="${top + 5}" width="18" height="12" rx="2" fill="url(#haz)" ${stroke}/>`)

  // Hab Systems: water recycler, a small herb rack, medical monitor
  const [hx, hy, , hh] = R('hab')
  const sprout = (x, y, l) => [-1, 0, 1].map(k => `<path d="M${r1(x)} ${y} Q${r1(x + k * l * .25)} ${r1(y - l * .7)} ${r1(x + k * l * .55)} ${r1(y - l)}" stroke="${k ? '#3f8a3c' : '#72c05e'}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`).join('')
  const hab = frame('hab', `
    <ellipse cx="${hx + 122}" cy="${hy + hh}" rx="120" ry="12" fill="url(#ao)"/>
    ${[0, 1].map(i => `<g><rect x="${hx + 14 + i * 48}" y="${hy - 66 + i * 10}" width="42" height="${92 - i * 10}" rx="18" fill="url(#cabH)" ${stroke}/>
      <rect x="${hx + 20 + i * 48}" y="${hy - 46 + i * 10}" width="30" height="${50 - i * 8}" rx="8" fill="#0b2a36" ${stroke}/><rect x="${hx + 20 + i * 48}" y="${hy - 24 + i * 6}" width="30" height="${28 - i * 4}" rx="6" fill="url(#water)" opacity=".9"/>
      <circle cx="${hx + 28 + i * 48}" cy="${hy - 14 + i * 6}" r="2" fill="#dff7ff" opacity=".8"/><circle cx="${hx + 40 + i * 48}" cy="${hy - 8 + i * 6}" r="1.5" fill="#dff7ff" opacity=".8"/></g>`).join('')}
    <path d="M${hx + 50} ${hy - 62} q8 -14 18 -4" fill="none" stroke="#c8461a" stroke-width="5" stroke-linecap="round"/><circle cx="${hx + 59}" cy="${hy - 69}" r="5" fill="url(#acc)" ${stroke}/>
    <ellipse cx="${hx + 138}" cy="${hy - 28}" rx="46" ry="54" fill="url(#growGlow)"/>
    <rect x="${hx + 110}" y="${hy - 74}" width="56" height="98" rx="4" fill="url(#dark)" ${stroke}/>
    <rect x="${hx + 114}" y="${hy - 70}" width="48" height="6" rx="2" fill="#ffd6f0"/>
    ${[0, 1].map(t => { const sy = hy - 30 + t * 34; return [0, 1, 2, 3].map(k => sprout(hx + 121 + k * 11.5, sy, 14 + ((k + t) % 2) * 6)).join('') + `<rect x="${hx + 114}" y="${sy}" width="48" height="7" rx="2" fill="url(#cabTop)" ${stroke}/>` }).join('')}
    <rect x="${hx + 176}" y="${hy - 44}" width="50" height="60" rx="4" fill="url(#cab)" ${stroke}/><rect x="${hx + 181}" y="${hy - 39}" width="40" height="32" rx="3" fill="url(#screen)" ${stroke}/>
    <path d="M${hx + 184} ${hy - 20} h8 l3 -11 l4 20 l3 -9 h15" stroke="${MINT}" stroke-width="1.8" fill="none"/><text x="${hx + 218}" y="${hy - 30}" text-anchor="end" ${MONO} font-size="8" fill="${MINT}">72</text>
    <rect x="${hx + 190}" y="${hy - 68}" width="22" height="18" rx="4" fill="url(#cabTop)" ${stroke}/><path d="M${hx + 201} ${hy - 65} v12 M${hx + 195} ${hy - 59} h12" stroke="#4fd08a" stroke-width="3.4"/>
    ${box(hx + 4, hy + 24, 222, 48, 12, { stripe: [22, 6], shadow: false })}
    ${led0(live.habWater)}${led0(live.habMed)}
    ${sign(hx + 115, hy + 41, 124, 'HAB SYSTEMS', 'drop', 18, 12)}`)

  // Calibration bench: graph monitor, optical sensor, two reference standards
  const [lx, ly, lw, lh] = R('calibration')
  const eye = [lx + 116, ly - 22]
  const lab = frame('lab', `
    <ellipse cx="${lx + lw / 2 + 2}" cy="${ly + lh}" rx="118" ry="12" fill="url(#ao)"/>
    <rect x="${lx + 12}" y="${ly - 50}" width="68" height="68" rx="5" fill="url(#cab)" ${stroke}/><rect x="${lx + 18}" y="${ly - 44}" width="56" height="46" rx="3" fill="url(#screen)" ${stroke}/>
    <path d="M${lx + 23} ${ly - 6} L${lx + 34} ${ly - 17} L${lx + 44} ${ly - 13} L${lx + 56} ${ly - 30} L${lx + 69} ${ly - 36}" stroke="${MINT}" stroke-width="2.2" fill="none"/><circle cx="${lx + 34}" cy="${ly - 17}" r="2.4" fill="#ff8f45"/><circle cx="${lx + 69}" cy="${ly - 36}" r="2.4" fill="#ff8f45"/>
    <path d="M${lx + 22} ${ly - 3} H${lx + 71} M${lx + 22} ${ly - 40} V${ly - 3}" stroke="${MINT}" stroke-width="1" opacity=".5"/>
    <rect x="${eye[0] - 8}" y="${eye[1] + 22}" width="16" height="22" fill="url(#steel)" ${stroke}/>
    <circle cx="${eye[0]}" cy="${eye[1]}" r="26" fill="url(#dark)" ${stroke}/><circle cx="${eye[0]}" cy="${eye[1]}" r="19" fill="#5d7896" ${stroke}/><circle cx="${eye[0]}" cy="${eye[1]}" r="12" fill="#1f5e78"/><circle cx="${eye[0]}" cy="${eye[1]}" r="6" fill="#0b2633"/><circle cx="${eye[0] - 5}" cy="${eye[1] - 5}" r="3.5" fill="#c9f4ff" opacity=".9"/>
    <path d="M${eye[0] + 27} ${eye[1] + 2} L${lx + 158} ${ly - 6} M${eye[0] + 27} ${eye[1] + 4} L${lx + 188} ${ly - 6}" stroke="#ff8f45" stroke-width="1.4" stroke-dasharray="4 3" opacity=".8"/>
    <rect x="${lx + 148}" y="${ly + 8}" width="72" height="8" rx="2" fill="url(#steel)" ${stroke}/>
    ${[['A', '#25364a', IVORY], ['B', '#c9d8e6', '#101820']].map(([t, fill, ink], i) => `<rect x="${lx + 154 + i * 32}" y="${ly - 20}" width="24" height="30" rx="2" fill="${fill}" ${stroke}/><text x="${lx + 166 + i * 32}" y="${ly + 4}" text-anchor="middle" ${FONT} font-size="12" fill="${ink}">${t}</text><circle cx="${lx + 166 + i * 32}" cy="${ly - 11}" r="3" fill="#ff8f45"/>`).join('')}
    ${box(lx + 4, ly + 24, 222, 48, 12, { stripe: [22, 6], shadow: false })}
    ${led0(live.labStatus)}
    ${sign(lx + 108, ly + 41, 124, 'CALIBRATION', 'target', 18, 12)}`)

  // Greenhouse control: a standing console with a tilted screen and a tablet dock
  const [kx, ky, kw, kh] = R('gh-control'), [gsx, gsy, gsw, gsh] = live.ghScreen
  const kiosk = frame('gh-control', `
    <ellipse cx="${kx + kw / 2 + 4}" cy="${ky + kh + 1}" rx="${kw * .62}" ry="10" fill="url(#ao)"/>
    <rect x="${kx + kw / 2 - 9}" y="${gsy + gsh}" width="18" height="${ky - gsy - gsh + 14}" fill="url(#steel)" ${stroke}/>
    <path d="M${gsx - 8} ${gsy - 8} H${gsx + gsw + 8} L${gsx + gsw + 12} ${gsy + gsh + 8} H${gsx - 12} Z" fill="url(#cab)" ${stroke}/>
    <rect x="${gsx}" y="${gsy}" width="${gsw}" height="${gsh}" rx="3" fill="url(#screen)" ${stroke}/><rect x="${gsx}" y="${gsy}" width="${gsw}" height="${gsh}" fill="url(#screenGlow)"/>
    ${box(kx, ky + 12, kw, kh - 12, 12, { stripe: [18, 5], shadow: false, edge: GREEN })}
    ${buttons(kx + 12, ky + 2, 5, 20, ['#101c2b', GREEN, '#101c2b', CYAN, '#101c2b'])}
    ${sign(kx + kw / 2, ky + 30, 100, 'CONTROL', 'leaf', 18, 12)}`)

  // Nutrient and water reservoirs with the pump skid
  const [tx, ty, tw, th] = R('gh-tanks')
  const tank = (x, w, fill, lvl, label) => `<rect x="${x}" y="${ty - 58}" width="${w}" height="${th + 40}" rx="${w / 2.4}" fill="#0b2a36" ${stroke}/><rect x="${x + 4}" y="${r1(ty - 54 + (th + 32) * (1 - lvl))}" width="${w - 8}" height="${r1((th + 32) * lvl)}" rx="${(w - 8) / 2.6}" fill="url(#${fill})" opacity=".85"/>
    <rect x="${x + 6}" y="${ty - 50}" width="4" height="${th + 20}" rx="2" fill="#fff" opacity=".2"/>${[.25, .5, .75].map(f => `<path d="M${x + w - 12} ${r1(ty - 54 + (th + 32) * f)} h8" stroke="${IVORY}" stroke-opacity=".6" stroke-width="1.2"/>`).join('')}
    <rect x="${x - 2}" y="${ty - 62}" width="${w + 4}" height="9" rx="3" fill="url(#cabTop)" ${stroke}/>${text(x + w / 2, ty + th - 26, label, 8, IVORY, 'text-anchor="middle" letter-spacing="1"')}`
  const tanks = frame('gh-tanks', `
    <ellipse cx="${tx + tw / 2 + 4}" cy="${ty + th + 1}" rx="${tw * .6}" ry="10" fill="url(#ao)"/>
    ${tank(tx + 4, 46, 'nutri', .68, 'NUTRIENT')}${tank(tx + 58, 46, 'water', .8, 'WATER')}
    ${box(tx, ty + th - 22, tw, 22, 8, { shadow: false, edge: GREEN })}
    <circle cx="${tx + 22}" cy="${ty + th - 11}" r="6" fill="#070d15" ${stroke}/><circle cx="${tx + 22}" cy="${ty + th - 11}" r="2.6" fill="#2c343d"/><circle cx="${tx + 44}" cy="${ty + th - 11}" r="6" fill="#070d15" ${stroke}/><circle cx="${tx + 44}" cy="${ty + th - 11}" r="2.6" fill="#2c343d"/>
    ${mono(tx + 56, ty + th - 8, 'PUMPS A·B', 7.5, DIM, 'letter-spacing="1"')}`)

  // instruments that appear on the rover once chosen at the Payload terminal
  const instIr = { name: 'prop-inst-ir.svg', w: 44, h: 32, ox: 0, oy: 0, body: `
    <rect x="1" y="15" width="16" height="5" rx="2" fill="#8f836a" stroke="#2a2620" stroke-width="1.6"/>
    <rect x="12" y="5" width="28" height="22" rx="5" fill="url(#cream)" stroke="#2a2620" stroke-width="1.6"/><rect x="12" y="13" width="28" height="4" fill="url(#red)"/>
    <circle cx="32" cy="16" r="7" fill="#1b0e05" stroke="#2a2620" stroke-width="1.6"/><circle cx="32" cy="16" r="4.2" fill="#ff8f45"/><circle cx="30.4" cy="14.4" r="1.5" fill="#fff" opacity=".85"/>
    <circle cx="17.5" cy="9.5" r="1.7" fill="${MINT}"/>` }
  const instGpr = { name: 'prop-inst-gpr.svg', w: 60, h: 42, ox: 0, oy: 0, body: `
    <path d="M5 6 L30 24" stroke="#2a2620" stroke-width="6.4" stroke-linecap="round"/><path d="M5 6 L30 24" stroke="#a2967c" stroke-width="3.6" stroke-linecap="round"/>
    <circle cx="5" cy="6" r="3.6" fill="url(#steel)" stroke="#2a2620" stroke-width="1.6"/>
    <path d="M18 23 H52 L57 33 H13 Z" fill="url(#char)" stroke="#2a2620" stroke-width="1.6"/><rect x="13" y="33" width="44" height="5" fill="#15191e" stroke="#2a2620" stroke-width="1.6"/>
    <path d="M25 25 L23 31 M35 25 V31 M45 25 L47 31" stroke="${MINT}" stroke-width="2"/>` }
  return [ops, payload, hab, lab, kiosk, tanks, instIr, instGpr]
}

// ------------------------------------------------------------------ outside the hull
// The Earth below, the station truss with its arrays and radiators, and the greenhouse's own
// array wing and radiator. Decoration: a game set, not a model of the real station.
function earthSvg(D, night) {
  const { width: W, height: H } = D, { cx, cy, r } = D.exterior.earth, S = 0.5
  seed = night ? 97 : 53
  const defs = `<radialGradient id="ocean" gradientUnits="userSpaceOnUse" cx="${cx + r * .55}" cy="${cy - r * .75}" r="${r * 1.3}"><stop offset="0" stop-color="#3f8fd0"/><stop offset=".45" stop-color="#1c5f9e"/><stop offset=".8" stop-color="#0d3460"/><stop offset="1" stop-color="#071a33"/></radialGradient>
    <radialGradient id="rim" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r + 46}"><stop offset="${r2((r - 60) / (r + 46))}" stop-color="#5fb8ff" stop-opacity="0"/><stop offset="${r2(r / (r + 46))}" stop-color="#9ad8ff" stop-opacity="${night ? .45 : .9}"/><stop offset="1" stop-color="#2f7fd6" stop-opacity="0"/></radialGradient>
    <radialGradient id="shade" gradientUnits="userSpaceOnUse" cx="${cx + r * .7}" cy="${cy - r * .9}" r="${r * 1.7}"><stop offset=".35" stop-color="#02060f" stop-opacity="0"/><stop offset="1" stop-color="#02060f" stop-opacity=".8"/></radialGradient>
    <filter id="eb3"><feGaussianBlur stdDeviation="5"/></filter><filter id="eb9"><feGaussianBlur stdDeviation="12"/></filter>
    <clipPath id="globe"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`
  // points on the visible part of the disc
  const on = () => { for (;;) { const x = rnd() * (W + 200) - 100, y = rnd() * (H + 200) - 100; if (Math.hypot(x - cx, y - cy) < r - 30) return [x, y] } }
  let body = `<circle cx="${cx}" cy="${cy}" r="${r + 46}" fill="url(#rim)"/>`
  if (night) {
    let lights = ''
    for (let i = 0; i < 46; i++) {
      const [x, y] = on(), n = 6 + Math.floor(rnd() * 22)
      for (let k = 0; k < n; k++) lights += `<circle cx="${r1(x + (rnd() - .5) * 150)}" cy="${r1(y + (rnd() - .5) * 90)}" r="${r1(1.2 + rnd() * 2.2)}" fill="${rnd() < .7 ? '#ffd27a' : '#fff1c9'}" opacity="${r2(.35 + rnd() * .6)}"/>`
    }
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#030a16"/><g clip-path="url(#globe)">${lights}</g>`
  } else {
    let land = '', clouds = ''
    for (let i = 0; i < 44; i++) { const [x, y] = on(), rx = 70 + rnd() * 260, ry = 40 + rnd() * 120; land += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${rnd() < .5 ? '#5d7f45' : '#9b8a5a'}" opacity=".7" transform="rotate(${r1(rnd() * 60 - 30)} ${r1(x)} ${r1(y)})"/>` }
    for (let i = 0; i < 130; i++) { const [x, y] = on(), rx = 40 + rnd() * 200, ry = 10 + rnd() * 34; clouds += `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="#fff" opacity="${r2(.25 + rnd() * .5)}" transform="rotate(${r1(-30 + rnd() * 24)} ${r1(x)} ${r1(y)})"/>` }
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#ocean)"/><g clip-path="url(#globe)"><g filter="url(#eb9)">${land}</g><g filter="url(#eb3)">${clouds}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#shade)"/></g>`
  }
  return { name: night ? 'ext-earth-night.svg' : 'ext-earth-day.svg', ox: 0, oy: 0, w: W * S, h: H * S, body: `<g transform="scale(${S})">${body}</g>`, defs, plain: true }
}

function starsSvg() {
  seed = 61
  let s = ''
  for (let i = 0; i < 150; i++) { const r = rnd() ** 3 * 1.5 + .35; s += `<circle cx="${r1(rnd() * 512)}" cy="${r1(rnd() * 512)}" r="${r1(r)}" fill="${rnd() < .15 ? '#ffd9b0' : rnd() < .2 ? '#bcd8ff' : '#ffffff'}" opacity="${r2(.3 + rnd() * .7)}"/>` }
  return { name: 'ext-stars.svg', ox: 0, oy: 0, w: 512, h: 512, body: s, defs: '', plain: true }
}

const arrayWing = (x, y, w, h, vertical) => {
  const n = Math.round((vertical ? h : w) / 46)
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#cells)" stroke="#9fb6d1" stroke-opacity=".75" stroke-width="1.4"/>`
  for (let i = 1; i < n; i++) s += vertical ? `<path d="M${x} ${r1(y + (h * i) / n)} H${x + w}" stroke="#c9a15a" stroke-opacity=".8" stroke-width="1.4"/>` : `<path d="M${r1(x + (w * i) / n)} ${y} V${y + h}" stroke="#c9a15a" stroke-opacity=".8" stroke-width="1.4"/>`
  return s + (vertical ? `<path d="M${x + w / 2} ${y} V${y + h}" stroke="#9fb6d1" stroke-opacity=".5"/>` : `<path d="M${x} ${y + h / 2} H${x + w}" stroke="#9fb6d1" stroke-opacity=".5"/>`)
}
const radiator = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#8fa5bb" stroke="#04090f" stroke-width="1.4" opacity=".85"/>${[...Array(Math.round(w / 25) - 1)].map((_, i) => `<path d="M${r1(x + ((i + 1) * w) / Math.round(w / 25))} ${y} V${y + h}" stroke="#3d5f84" stroke-width="1.2"/>`).join('')}<path d="M${x} ${y + h / 2} H${x + w}" stroke="#3d5f84"/>`
const trussBeam = (x, y, w, h) => { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#25364a" stroke="#04090f" stroke-width="1.4"/>`; for (let i = 0; i < w / h; i++) s += `<path d="M${r1(x + i * h)} ${y} l${h} ${h} M${r1(x + i * h)} ${y + h} l${h} ${-h}" stroke="#7d97b3" stroke-opacity=".6" stroke-width="1"/>`; return s }

function trussSvg(D) {
  const t = D.exterior.truss, [bx, by, bw, bh] = t.beam, [mx, my] = t.mast
  let s = trussBeam(bx, by, bw, bh) + `<rect x="${mx - 12}" y="${by + bh}" width="24" height="${my + 240 - by}" fill="#25364a" stroke="#04090f" stroke-width="1.4"/>${[...Array(12)].map((_, i) => `<path d="M${mx - 12} ${by + bh + i * 24} l24 24 M${mx + 12} ${by + bh + i * 24} l-24 24" stroke="#7d97b3" stroke-opacity=".5"/>`).join('')}`
  for (const [x, y, w, h] of t.wings) s += `<rect x="${x + w / 2 - 4}" y="${by + bh}" width="8" height="${y - by - bh + 4}" fill="#5d7896" stroke="#04090f"/>` + arrayWing(x, y, w, h, true)
  for (const [x, y, w, h] of t.radiators) s += `<rect x="${x + w / 2 - 4}" y="${by + bh}" width="8" height="${y - by - bh + 4}" fill="#5d7896" stroke="#04090f"/>` + radiator(x, y, w, h)
  return { name: 'ext-truss.svg', ox: t.art[0], oy: t.art[1], w: t.art[2], h: t.art[3], body: s }
}

function ghExteriorSvg(D) {
  const e = D.exterior, [bx, by, bw, bh] = e.ghArray.boom, [rx, ry, rw, rh] = e.ghRadiator
  const boom = { name: 'ext-gh-boom.svg', ox: e.ghArray.art[0], oy: e.ghArray.art[1], w: e.ghArray.art[2], h: e.ghArray.art[3], body: trussBeam(bx, by, bw, bh) + `<rect x="${rx + rw - 30}" y="${by + bh}" width="8" height="${ry - by - bh + 6}" fill="#5d7896" stroke="#04090f"/>` + radiator(rx, ry, rw, rh) }
  const [, , ww, wh] = e.ghArray.wings[0]
  const wing = { name: 'ext-gh-wing.svg', ox: 0, oy: 0, w: ww, h: wh, body: arrayWing(0, 0, ww, wh, false) }
  return [boom, wing]
}

// ------------------------------------------------------------------ everything
/** Every station image: { name, w, h, ox, oy, body, defs }. `body` is in deck coordinates; the caller shifts it by (-ox, -oy). */
export function stationArt(geo) {
  const D = geo.deck
  seed = 41
  const out = []
  for (const m of D.modules) out.push(moduleSvg(D, m))
  for (const l of D.links) out.push(l.kind === 'hatch' ? hatchSvg(D, l) : tunnelSvg(D, l))
  for (const p of D.props) {
    if (p.id.startsWith('stub-')) out.push(stubSvg(D, p, D.links.find(l => `stub-${l.id}` === p.id)))
    else if (p.id.startsWith('sill-')) out.push(sillSvg(D, p, D.modules.find(m => `sill-${m.id}` === p.id)))
  }
  out.push(...furniture(D), trussSvg(D), ...ghExteriorSvg(D), earthSvg(D, false), earthSvg(D, true), starsSvg())
  return out.map(f => ({ ...f, defs: f.defs ?? stationDefs, body: f.plain ? f.body : `<g transform="translate(${-f.ox} ${-f.oy})">${f.body}</g>` }))
}
