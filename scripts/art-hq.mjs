// High-detail station, crew, rover, Mars and habitat art (stylized 2.5D, soft-lit, outlined).
// Light comes from the upper left; every solid gets a highlight, a shade and a contact shadow.

let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const r1 = n => Math.round(n * 10) / 10
const OUTL = '#2a2620'
const CREAM = '#efe6d3', CREAM_M = '#d9cdb3', CREAM_D = '#b3a58a'
const CHAR = '#25282d', CHAR_M = '#383c43', CHAR_L = '#4b5058'
const RED = '#d9512c', RED_D = '#a63a1d', MINT = '#6ef2c6', MINT_D = '#1d6b58', CYAN = '#5fd8f0', YEL = '#e9b22c', YEL_D = '#a87a12'

// ------------------------------------------------------------------ shared defs
export const commonDefs = `
  <linearGradient id="cream" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf5e8"/><stop offset=".55" stop-color="${CREAM}"/><stop offset="1" stop-color="${CREAM_D}"/></linearGradient>
  <linearGradient id="creamH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fbf5e8"/><stop offset=".6" stop-color="${CREAM_M}"/><stop offset="1" stop-color="${CREAM_D}"/></linearGradient>
  <linearGradient id="creamTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e6dcc6"/></linearGradient>
  <linearGradient id="char" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CHAR_L}"/><stop offset="1" stop-color="${CHAR}"/></linearGradient>
  <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a6a5a"/><stop offset=".5" stop-color="#0f4a40"/><stop offset="1" stop-color="#082a25"/></linearGradient>
  <radialGradient id="screenGlow" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#6ef2c6" stop-opacity=".35"/><stop offset="1" stop-color="#6ef2c6" stop-opacity="0"/></radialGradient>
  <linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ec6a40"/><stop offset="1" stop-color="${RED_D}"/></linearGradient>
  <linearGradient id="yel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd25c"/><stop offset="1" stop-color="${YEL_D}"/></linearGradient>
  <linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity=".03"/><stop offset=".5" stop-color="#fff" stop-opacity=".09"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="lampGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".55"/><stop offset="1" stop-color="#ffb066" stop-opacity="0"/></radialGradient>
  <radialGradient id="ao" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="drop" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="3" dy="7" stdDeviation="5" flood-color="#1a0f05" flood-opacity=".45"/></filter>`

const stroke = `stroke="${OUTL}" stroke-width="1.6" stroke-linejoin="round"`
const bolt = (x, y, r = 1.6) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="#8f836a"/><circle cx="${r1(x - .4)}" cy="${r1(y - .4)}" r="${r * .45}" fill="#fff8e6" opacity=".7"/>`

// A 3/4 box: front face + top face, with outline, highlight edge and contact shadow.
function box(x, y, w, h, top, { front = 'url(#cream)', topFill = 'url(#creamTop)', stripe = null, shadow = true } = {}) {
  return `${shadow ? `<ellipse cx="${x + w / 2 + 6}" cy="${y + h + 2}" rx="${w * .58}" ry="${Math.max(6, top * .5)}" fill="url(#ao)"/>` : ''}
  <path d="M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z" fill="${front}" ${stroke}/>
  <path d="M${x} ${y} L${x + 6} ${y - top} L${x + w - 6} ${y - top} L${x + w} ${y} Z" fill="${topFill}" ${stroke}/>
  <path d="M${x + 1.5} ${y + 1.5} L${x + w - 1.5} ${y + 1.5}" stroke="#fff" stroke-opacity=".7" stroke-width="1.4"/>
  <rect x="${x}" y="${y + h - 6}" width="${w}" height="6" fill="#000" opacity=".14"/>
  ${stripe ? `<rect x="${x}" y="${y + stripe[0]}" width="${w}" height="${stripe[1]}" fill="url(#red)"/>` : ''}`
}

// ------------------------------------------------------------------ Astronaut
// Frame 64x96, feet at y=92. Cream EVA suit with the chosen finish on shoulders, chest, sleeves and leg panels.
export function astronautDefs(id, [P, S, L]) {
  return `<linearGradient id="fin-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${L}"/><stop offset=".5" stop-color="${P}"/><stop offset="1" stop-color="${S}"/></linearGradient>
  <linearGradient id="suit-${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffaf0"/><stop offset=".55" stop-color="${CREAM}"/><stop offset="1" stop-color="${CREAM_D}"/></linearGradient>
  <linearGradient id="suitV-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="${CREAM_D}"/></linearGradient>
  <radialGradient id="visor-${id}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffe2a0"/><stop offset=".25" stop-color="#d98a3a"/><stop offset=".6" stop-color="#5a2e12"/><stop offset="1" stop-color="#1b0e05"/></radialGradient>
  <radialGradient id="helm-${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fffdf6"/><stop offset=".7" stop-color="${CREAM}"/><stop offset="1" stop-color="${CREAM_D}"/></radialGradient>`
}

export function astronaut(id, dir, st) {
  const suit = `url(#suit-${id})`, fin = `url(#fin-${id})`, helm = `url(#helm-${id})`, visor = `url(#visor-${id})`
  const bob = Math.abs(st) > .5 ? -1.2 : 0
  const s = `stroke="${OUTL}" stroke-width="1.2" stroke-linejoin="round"`
  if (dir === 'down' || dir === 'up') {
    const front = dir === 'down'
    const liftL = Math.max(0, st) * 5, liftR = Math.max(0, -st) * 5
    const leg = (cx, lift, back) => {
      const y1 = 84 - lift
      return `<path d="M${cx - 5.5} 59 L${cx + 5.5} 59 L${cx + 5} ${y1} L${cx - 5} ${y1} Z" fill="${back ? `url(#suitV-${id})` : suit}" ${s}/>
        <path d="M${cx + (cx < 32 ? -5.5 : 2)} 61 L${cx + (cx < 32 ? -2 : 5.5)} 61 L${cx + (cx < 32 ? -2 : 5)} ${y1 - 4} L${cx + (cx < 32 ? -5 : 2)} ${y1 - 4} Z" fill="${fin}"/>
        <rect x="${cx - 6}" y="${70 - lift / 2}" width="12" height="4" rx="2" fill="${CREAM_D}" ${s}/>
        <path d="M${cx - 6.5} ${y1 - 1} L${cx + 6.5} ${y1 - 1} L${cx + 7} ${y1 + 7} Q${cx} ${y1 + 9} ${cx - 7} ${y1 + 7} Z" fill="url(#char)" ${s}/>
        <rect x="${cx - 6}" y="${y1 + 5}" width="12" height="2.2" fill="#6b625a"/>`
    }
    const arm = (side, sw) => {
      const x = side < 0 ? 15.5 : 48.5
      return `<path d="M${x - 3.6} 33 Q${x - 4.5 + side} ${46 + sw * .5} ${x - 3.6 + side * 1.2} ${57 + sw} L${x + 3.6 + side * 1.2} ${57 + sw} Q${x + 4.5 + side} ${46 + sw * .5} ${x + 3.6} 33 Z" fill="${fin}" ${s}/>
        <path d="M${x - 3.8} 34 L${x + 3.8} 34 L${x + 3.4} 42 L${x - 3.4} 42 Z" fill="${fin}"/>
        <rect x="${x - 4 + side * 1.2}" y="${48 + sw * .7}" width="8" height="3" rx="1.5" fill="${CREAM_D}"/>
        <circle cx="${x + side * 1.2}" cy="${60 + sw}" r="4.2" fill="url(#char)" ${s}/>`
    }
    const swing = st * 4
    return `<g transform="translate(0 ${bob})">
      ${front ? `<rect x="13" y="30" width="38" height="27" rx="5" fill="${CREAM_D}" ${s}/>` : ''}
      ${leg(26.5, front ? liftL : liftR, !front)}${leg(37.5, front ? liftR : liftL, !front)}
      ${arm(-1, front ? -swing : swing)}${arm(1, front ? swing : -swing)}
      <path d="M17 32 Q32 26 47 32 L46 56 Q32 60 18 56 Z" fill="${suit}" ${s}/>
      <path d="M17.5 32.5 Q22 29.5 27 29 L26 38 L18 39 Z" fill="${fin}"/><path d="M46.5 32.5 Q42 29.5 37 29 L38 38 L46 39 Z" fill="${fin}"/>
      <path d="M18 53 L46 53 L46 58 Q32 61 18 58 Z" fill="${CHAR_M}" ${s}/><rect x="29" y="53" width="6" height="5" rx="1" fill="#9a8f78"/>
      ${front
        ? `<rect x="24" y="38" width="16" height="12" rx="2.5" fill="url(#creamTop)" ${s}/><rect x="26" y="40.5" width="6" height="3" rx="1" fill="${MINT}"/><circle cx="36" cy="42" r="1.6" fill="${RED}"/><rect x="26" y="45.5" width="12" height="2" rx="1" fill="${fin}"/>`
        : `<rect x="15" y="30" width="34" height="26" rx="5" fill="url(#creamTop)" ${s}/><rect x="15" y="35" width="34" height="5" fill="${fin}"/><rect x="20" y="43" width="24" height="9" rx="2" fill="${CHAR_M}" ${s}/><path d="M23 45 h18 M23 48 h18" stroke="#6b707a" stroke-width="1"/>`}
      <rect x="22" y="27" width="20" height="5" rx="2.5" fill="${CREAM_D}" ${s}/>
      <circle cx="32" cy="17" r="11.8" fill="${helm}" ${s}/>
      ${front
        ? `<path d="M23.5 14 Q32 6.5 40.5 14 L40 21 Q32 26 24 21 Z" fill="${visor}" stroke="#1b0e05" stroke-width="1"/><path d="M26 13 Q30 9.8 34 10.4" stroke="#fff" stroke-width="1.6" fill="none" opacity=".75" stroke-linecap="round"/><circle cx="37.5" cy="18.5" r="1" fill="#fff" opacity=".5"/>`
        : `<path d="M25 8 Q32 5 39 8" stroke="${CREAM_D}" stroke-width="2" fill="none"/><rect x="29" y="9" width="6" height="3" rx="1.5" fill="${fin}"/>`}
    </g>`
  }
  // side view, facing right
  const leg = (ang, back) => `<g transform="rotate(${r1(ang)} 31 59)">
      <path d="M26 57 L36 57 L35.5 84 L27 84 Z" fill="${back ? `url(#suitV-${id})` : suit}" ${s} ${back ? 'opacity=".92"' : ''}/>
      <path d="M26.5 60 L30 60 L29.5 80 L27 80 Z" fill="${fin}"/>
      <rect x="26" y="70" width="10.5" height="4" rx="2" fill="${CREAM_D}" ${s}/>
      <path d="M25.5 83 L36 83 L41 86 L41 91 Q33 93 25.5 91 Z" fill="url(#char)" ${s}/><rect x="25.5" y="89" width="15.5" height="2" fill="#6b625a"/></g>`
  const arm = (ang, back) => `<g transform="rotate(${r1(ang)} 33 35)">
      <path d="M29 33 L37.5 33 L36.5 56 L30 56 Z" fill="${fin}" ${s} ${back ? 'opacity=".85"' : ''}/>
      <path d="M29.2 34 L37.3 34 L37 41 L29.5 41 Z" fill="${fin}"/>
      <rect x="29" y="47" width="8" height="3" rx="1.5" fill="${CREAM_D}"/>
      <circle cx="33.3" cy="58.5" r="4.1" fill="url(#char)" ${s}/></g>`
  return `<g transform="translate(0 ${bob})">
    ${arm(-st * 22, true)}${leg(st * 22, true)}
    <rect x="11" y="29" width="14" height="28" rx="4" fill="url(#creamTop)" ${s}/><rect x="11" y="34" width="14" height="5" fill="${fin}"/><rect x="13.5" y="43" width="9" height="9" rx="1.5" fill="${CHAR_M}"/>
    <path d="M22 32 Q34 27 42.5 33 L42 56 Q32 60 22 57 Z" fill="${suit}" ${s}/>
    <path d="M30 30 Q37 29 42 33 L42 39 L31 39 Z" fill="${fin}"/>
    <path d="M22 53 L42 53 L42 57 Q32 60 22 58 Z" fill="${CHAR_M}"/>
    <rect x="37" y="41" width="6" height="8" rx="1.5" fill="url(#creamTop)" ${s}/><circle cx="40" cy="44" r="1.2" fill="${MINT}"/>
    ${leg(-st * 22, false)}
    ${arm(st * 22, false)}
    <rect x="24" y="27" width="16" height="5" rx="2.5" fill="${CREAM_D}" ${s}/>
    <circle cx="32.5" cy="17" r="11.8" fill="${helm}" ${s}/>
    <path d="M35 8.5 Q44.5 11 44.3 18.5 Q43.5 25 36.5 26.5 Z" fill="${visor}" stroke="#1b0e05" stroke-width="1"/>
    <path d="M38 11 Q42 13 42.6 16.5" stroke="#fff" stroke-width="1.5" fill="none" opacity=".75" stroke-linecap="round"/>
  </g>`
}

// ------------------------------------------------------------------ Station deck
// Three pressurised nodes side by side (A Utility, B Command, C Science & Comms), joined by open
// bulkhead hatches. Every position comes from src/art/geo.json, which the game reads too.
function chamfer(x, y, w, h, c) {
  return `M${x + c} ${y} H${x + w - c} L${x + w} ${y + c} V${y + h - c} L${x + w - c} ${y + h} H${x + c} L${x} ${y + h - c} V${y + c} Z`
}

const VIOLET = '#c9a2ff'
const BUS = { life: MINT, comms: CYAN, research: VIOLET }
const FONT = 'font-family="Barlow Condensed, Arial Narrow, Arial" font-weight="700"'
const MONO = 'font-family="IBM Plex Mono, Consolas, monospace" font-weight="600"'

// Deck-only random sequence, so floor wear never moves the Mars and site art generated after it.
let dseed = 23
const drand = () => ((dseed = (dseed * 16807) % 2147483647) / 2147483647)
const r2 = n => Math.round(n * 100) / 100

export const stationDefs = commonDefs + `
  <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4decd"/><stop offset=".7" stop-color="#d3cbb7"/><stop offset="1" stop-color="#aca38d"/></linearGradient>
  <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#66727f"/><stop offset=".35" stop-color="#7c8996"/><stop offset="1" stop-color="#606c79"/></linearGradient>
  <linearGradient id="steelTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93a0ad"/><stop offset="1" stop-color="#6d7986"/></linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#aeb8c2"/><stop offset="1" stop-color="#5f6a76"/></linearGradient>
  <linearGradient id="glassDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12303f"/><stop offset="1" stop-color="#06131c"/></linearGradient>
  <linearGradient id="coreG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#06231f"/><stop offset=".5" stop-color="#1f8f76"/><stop offset="1" stop-color="#06231f"/></linearGradient>
  <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd6ee"/><stop offset="1" stop-color="#2b8fb5"/></linearGradient>
  <linearGradient id="aoTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1118" stop-opacity=".6"/><stop offset="1" stop-color="#0b1118" stop-opacity="0"/></linearGradient>
  <linearGradient id="aoL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b1118" stop-opacity=".5"/><stop offset="1" stop-color="#0b1118" stop-opacity="0"/></linearGradient>
  <linearGradient id="aoR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#0b1118" stop-opacity=".5"/><stop offset="1" stop-color="#0b1118" stop-opacity="0"/></linearGradient>
  <radialGradient id="pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#eaf6ff" stop-opacity=".2"/><stop offset="1" stop-color="#eaf6ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="growGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff9ad5" stop-opacity=".5"/><stop offset="1" stop-color="#ff9ad5" stop-opacity="0"/></radialGradient>
  <linearGradient id="pipe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a2c14"/><stop offset=".4" stop-color="#e2683e"/><stop offset="1" stop-color="#7a2410"/></linearGradient>
  <linearGradient id="pipeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a3d42"/><stop offset=".4" stop-color="#7d828a"/><stop offset="1" stop-color="#2c2f33"/></linearGradient>
  <linearGradient id="pipeH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a2c14"/><stop offset=".4" stop-color="#e2683e"/><stop offset="1" stop-color="#7a2410"/></linearGradient>
  <linearGradient id="pipeGH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3d42"/><stop offset=".4" stop-color="#7d828a"/><stop offset="1" stop-color="#2c2f33"/></linearGradient>
  <pattern id="haz" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="${YEL}"/><rect width="6" height="12" fill="${CHAR}"/></pattern>
  <pattern id="grip" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" fill="#dfe8f0" fill-opacity=".26"/><circle cx="7" cy="7" r="1.1" fill="#10161d" fill-opacity=".3"/></pattern>`

const ICON = {
  power: (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M2 -10 L-6 2 L0 2 L-2 10 L6 -2 L0 -2 Z" fill="#fff8e6"/>`,
  target: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff8e6" stroke-width="2"><circle r="8"/><circle r="3.5"/><path d="M-11 0 H-6 M6 0 H11 M0 -11 V-6 M0 6 V11"/></g>`,
  antenna: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff8e6" stroke-width="2" stroke-linecap="round"><path d="M0 -2 L-5 10 M0 -2 L5 10 M-3 5 H3"/><circle cy="-4" r="2" fill="#fff8e6"/><path d="M-6 -9 Q-9 -4 -6 1 M6 -9 Q9 -4 6 1"/></g>`,
  drop: (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -10 Q8 0 6 4 A6 6 0 0 1 -6 4 Q-8 0 0 -10 Z" fill="#fff8e6"/>`,
  crate: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff8e6" stroke-width="2"><rect x="-8" y="-7" width="16" height="14" rx="1"/><path d="M-8 -1 H8 M0 -7 V7"/></g>`,
  orbit: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff8e6" stroke-width="2"><circle r="4" fill="#fff8e6"/><ellipse rx="11" ry="4.5" transform="rotate(-25)"/></g>`,
}

// Name plate: cream bar with a red icon tab. Wall consoles use the 22 px size, floor props 18 px.
function sign(cx, y, w, label, icon, h = 22, fs = 15) {
  const x = cx - w / 2, tab = h + 8, c = h > 20 ? 5 : 4
  return `<g filter="url(#drop)"><path d="${chamfer(x, y, w, h, c)}" fill="url(#cream)" ${stroke}/>
    <path d="${chamfer(x, y, tab, h, c)}" fill="url(#red)" ${stroke}/>${ICON[icon](x + tab / 2, y + h / 2, (.8 * h) / 22)}
    <text x="${x + tab + 8}" y="${r1(y + h * .75)}" ${FONT} font-size="${fs}" letter-spacing="1.6" fill="#3a3128">${label}</text></g>`
}

const fbolt = (x, y) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="1.3" fill="#27303a"/><circle cx="${r1(x - .4)}" cy="${r1(y - .4)}" r=".55" fill="#c7d2dd" opacity=".55"/>`
const sprout = (x, y, l) => [-1, 0, 1].map(k => `<path d="M${r1(x)} ${y} Q${r1(x + k * l * .25)} ${r1(y - l * .7)} ${r1(x + k * l * .55)} ${r1(y - l)}" stroke="${k ? '#3f7a3c' : '#62a552'}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`).join('')

export function deckSvg(geo) {
  const D = geo.deck
  const { width: W, height: H, wallY: WY, frontY: FY, windows, modules, bulkheads, doorway: [DY0, DY1], conduits, live, spawn: [SX, SY] } = D
  const R = id => D.solids.find(s => s.id === id).rect

  // ---- back wall, seen face on
  const cham = i => (i === 1 ? 30 : 22)
  const holes = windows.map(([x, y, w, h], i) => chamfer(x, y, w, h, cham(i))).join(' ')
  let wall = `<path fill-rule="evenodd" d="M0 0 H${W} V${WY} H0 Z ${holes}" fill="url(#wallG)"/>`
  for (let x = 40; x <= W - 40; x += 46) wall += `<path d="M${x} 14 V${WY - 20}" stroke="#000" stroke-opacity=".05"/>`
  wall += [62, 132].map(y => `<path d="M0 ${y} H${W}" stroke="#000" stroke-opacity=".06"/>`).join('')
  wall += `<rect x="0" y="0" width="${W}" height="14" fill="url(#char)"/>`
  wall += modules.map(m => `<rect x="${m.x + 26}" y="4" width="${m.w - 52}" height="5" rx="2.5" fill="#fff6dc"/>`).join('')

  // structural rib where each bulkhead meets the wall
  const pillar = bx => {
    const x = bx - 12
    return `<rect x="${x}" y="0" width="48" height="${WY - 20}" fill="url(#creamH)" ${stroke}/>
    <rect x="${x + 5}" y="0" width="5" height="${WY - 20}" fill="#000" opacity=".08"/><rect x="${x + 38}" y="0" width="5" height="${WY - 20}" fill="#000" opacity=".12"/>
    <path d="M${x} 150 L${x + 48} 134 V146 L${x} 162 Z" fill="url(#red)"/>
    <rect x="${x + 19}" y="28" width="10" height="84" rx="5" fill="#fff1cf" ${stroke}/><rect x="${x + 22}" y="32" width="4" height="76" rx="2" fill="#fffdf2"/>`
  }

  const winFrame = ([x, y, w, h], c) => `
    <path d="${chamfer(x, y, w, h, c)}" fill="url(#glassSheen)"/>
    <path d="M${x + 30} ${y + 12} l40 0 l-60 70" stroke="#fff" stroke-opacity=".05" stroke-width="10" fill="none"/>
    <path d="${chamfer(x - 9, y - 9, w + 18, h + 18, c + 6)}" fill="none" stroke="url(#cream)" stroke-width="16" stroke-linejoin="round"/>
    <path d="${chamfer(x - 17, y - 17, w + 34, h + 34, c + 11)}" fill="none" stroke="${OUTL}" stroke-width="1.6"/>
    <path d="${chamfer(x - 1, y - 1, w + 2, h + 2, c)}" fill="none" stroke="#3a332a" stroke-width="3.5"/>
    ${[.2, .5, .8].map(f => bolt(x + w * f, y - 9) + bolt(x + w * f, y + h + 9)).join('')}${bolt(x - 9, y + h / 2)}${bolt(x + w + 9, y + h / 2)}`

  // the cupola: a three-pane bay window over the Mission Ops table
  const [cx0, cy0, cw, ch] = windows[1]
  const cupola = `
    <path d="M${cx0} ${cy0 + 30} L${cx0 + 30} ${cy0} H${cx0 + 96} V${cy0 + ch} H${cx0 + 30} L${cx0} ${cy0 + ch - 30} Z" fill="#061624" opacity=".18"/>
    <path d="M${cx0 + cw} ${cy0 + 30} L${cx0 + cw - 30} ${cy0} H${cx0 + cw - 96} V${cy0 + ch} H${cx0 + cw - 30} L${cx0 + cw} ${cy0 + ch - 30} Z" fill="#061624" opacity=".18"/>
    ${winFrame(windows[1], 30)}
    ${[cx0 + 91, cx0 + cw - 101].map(x => `<rect x="${x}" y="${cy0 - 2}" width="10" height="${ch + 4}" fill="url(#creamH)" ${stroke}/>${bolt(x + 5, cy0 + 12)}${bolt(x + 5, cy0 + ch - 12)}`).join('')}
    <rect x="${cx0 - 22}" y="${cy0 + ch + 18}" width="${cw + 44}" height="9" rx="3" fill="url(#creamTop)" ${stroke}/>
    <rect x="${cx0 + cw / 2 - 30}" y="${cy0 + ch + 20}" width="60" height="5" rx="2" fill="url(#red)"/>`

  const nodePlate = (x, y, letter) => `<g filter="url(#drop)"><rect x="${x}" y="${y}" width="30" height="30" rx="5" fill="url(#red)" ${stroke}/><text x="${x + 15}" y="${y + 23}" text-anchor="middle" ${FONT} font-size="24" fill="#fff8e6">${letter}</text></g>`

  // ---- floor: slate deck plates, four across each node
  let floor = `<rect x="0" y="${WY}" width="${W}" height="${H - WY}" fill="url(#floorG)"/>`
  for (const m of modules) {
    const cols = 4, rows = 8, pw = m.w / cols, ph = (FY - WY) / rows
    floor += `<rect x="${m.x}" y="${WY}" width="${m.w}" height="${FY - WY}" fill="${m.tint}" opacity=".05"/>`
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = r1(m.x + c * pw), y = r1(WY + r * ph), x1 = r1(m.x + (c + 1) * pw), y1 = r1(WY + (r + 1) * ph)
      floor += `<rect x="${x + 1.5}" y="${y + 1.5}" width="${r1(x1 - x - 3)}" height="${r1(y1 - y - 3)}" rx="2" fill="${drand() < .5 ? '#000' : '#fff'}" opacity="${r2(drand() * .07)}"/>
        <path d="M${x + 2} ${y + 2} H${x1 - 2}" stroke="#aebbc8" stroke-opacity=".42" stroke-width="1.2"/>
        <path d="M${x + 2} ${r1(y1 - 1.5)} H${x1 - 2} M${r1(x1 - 1.5)} ${y + 2} V${y1 - 2}" stroke="#1c232b" stroke-opacity=".5" stroke-width="1.2"/>
        ${fbolt(x + 6, y + 6)}${fbolt(x1 - 6, y + 6)}${fbolt(x + 6, y1 - 6)}${fbolt(x1 - 6, y1 - 6)}`
      if (drand() < .22) floor += `<path d="M${r1(x + 10 + drand() * 40)} ${r1(y + 12 + drand() * 28)} q${r1(8 + drand() * 16)} ${r1(drand() * 6 - 3)} ${r1(20 + drand() * 16)} 0" stroke="#1c232b" stroke-opacity=".3" stroke-width="1.2" fill="none"/>`
    }
    floor += `<rect x="${m.x + 9}" y="${WY + 9}" width="${m.w - 18}" height="${FY - WY - 18}" rx="9" fill="none" stroke="${m.tint}" stroke-opacity=".36" stroke-width="2.2"/>`
  }

  // anti-slip walkway through both hatches; the comms and research buses run inside it
  const bandY0 = conduits.comms[1][1] - 16, bandY1 = conduits.research[1][1] + 16
  floor += `<rect x="52" y="${bandY0}" width="${W - 104}" height="${bandY1 - bandY0}" fill="url(#grip)"/>
    <path d="M52 ${bandY0} H${W - 52} M52 ${bandY1} H${W - 52}" stroke="#dfe8f0" stroke-opacity=".3" stroke-width="1.5" stroke-dasharray="18 8"/>`

  // hatch thresholds
  floor += bulkheads.map(bx => `<rect x="${bx - 6}" y="${DY0}" width="6" height="${DY1 - DY0}" fill="url(#haz)"/><rect x="${bx + 24}" y="${DY0}" width="6" height="${DY1 - DY0}" fill="url(#haz)"/>
    <rect x="${bx}" y="${DY0}" width="24" height="${DY1 - DY0}" fill="#2b3038" ${stroke}/><path d="M${bx + 12} ${DY0 + 6} V${DY1 - 6}" stroke="#0f1318" stroke-width="3"/>
    ${[.08, .3, .5, .7, .92].map(f => fbolt(bx + 5, DY0 + (DY1 - DY0) * f) + fbolt(bx + 19, DY0 + (DY1 - DY0) * f)).join('')}`).join('')

  // power buses recessed in the floor; the game lights them from the live allocation
  const groove = (pts, color) => {
    const d = 'M' + pts.map(p => p.join(' ')).join(' L')
    let ticks = ''
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len
      for (let t = 9; t < len - 4; t += 14) ticks += `<path d="M${r1(x0 + ux * t - uy * 4)} ${r1(y0 + uy * t + ux * 4)} L${r1(x0 + ux * t + uy * 4)} ${r1(y0 + uy * t - ux * 4)}" stroke="#0e1319" stroke-width="1.6"/>`
    }
    const cap = ([x, y]) => `<rect x="${x - 9}" y="${y - 5}" width="18" height="10" rx="2" fill="url(#steel)" ${stroke}/><rect x="${x - 4}" y="${y - 2.5}" width="8" height="5" rx="1" fill="${color}"/>`
    return `<path d="${d}" fill="none" stroke="#141a21" stroke-width="11" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#2d3742" stroke-width="7" stroke-linejoin="round"/>${ticks}
      <path d="${d}" fill="none" stroke="${color}" stroke-opacity=".3" stroke-width="2" stroke-linejoin="round"/>${cap(pts[0])}${cap(pts[pts.length - 1])}`
  }
  const busLabel = (x, y, s, color, rot = 0) => `<text ${rot ? `transform="translate(${x} ${y}) rotate(${rot})"` : `x="${x}" y="${y}"`} ${MONO} font-size="8.5" letter-spacing="1.5" fill="${color}" opacity=".75">${s}</text>`
  floor += Object.entries(conduits).map(([bus, pts]) => groove(pts, BUS[bus])).join('')
    + busLabel(conduits.life[0][0] - 17, 282, 'LIFE SUPPORT BUS', BUS.life, 90)
    + busLabel(bulkheads[1] - 96, bandY0 + 8, 'COMMS BUS', BUS.comms) + busLabel(bulkheads[1] - 96, bandY1 - 3, 'RESEARCH BUS', BUS.research)

  // node names, stencilled along the walkway
  const stencil = (x, s, color) => `<text x="${x}" y="${bandY0 - 6}" ${FONT} font-size="14" letter-spacing="3" fill="${color}" opacity=".72">${s}</text>`
  floor += stencil(174, 'A · UTILITY', modules[0].tint) + stencil(410, 'B · COMMAND', modules[1].tint) + stencil(886, 'C · SCIENCE &amp; COMMS', modules[2].tint)

  // rover bay loading zone
  const [px, py, pw, ph] = R('payload')
  const zone = { x: px - 30, y: py - 14, w: pw + 60, h: ph + 56 }
  floor += `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" fill="none" stroke="${RED}" stroke-width="6" stroke-dasharray="17 9" opacity=".8"/>`
  floor += `<text x="${px + pw / 2}" y="${zone.y + zone.h + 17}" text-anchor="middle" ${FONT} font-size="14" letter-spacing="6" fill="${RED}" opacity=".7">ROVER BAY</text>`

  // arrival pad in front of the airlock
  floor += `<rect x="${SX - 50}" y="${SY - 20}" width="100" height="46" rx="8" fill="#10161d" opacity=".3"/>
    <path d="M${SX - 50} ${SY - 8} v-12 h14 M${SX + 50} ${SY - 8} v-12 h-14 M${SX - 50} ${SY + 14} v12 h14 M${SX + 50} ${SY + 14} v12 h-14" stroke="${YEL}" stroke-width="3" fill="none"/>
    <path d="M${SX - 11} ${SY - 3} l11 -9 l11 9 M${SX - 11} ${SY + 7} l11 -9 l11 9" stroke="${YEL}" stroke-opacity=".85" stroke-width="3" fill="none"/>
    <text x="${SX}" y="${SY - 26}" text-anchor="middle" ${FONT} font-size="11" letter-spacing="4" fill="${YEL}" opacity=".85">AIRLOCK</text>`

  // shading and light
  floor += `<rect x="0" y="${WY}" width="${W}" height="70" fill="url(#aoTop)"/>
    <ellipse cx="${cx0 + cw / 2}" cy="300" rx="250" ry="120" fill="url(#pool)"/><ellipse cx="228" cy="330" rx="200" ry="90" fill="url(#pool)"/><ellipse cx="932" cy="330" rx="200" ry="90" fill="url(#pool)"/>`

  const pipes = x => `<rect x="${x}" y="0" width="7" height="${H}" fill="url(#pipe)" ${stroke}/><rect x="${x + 10}" y="0" width="5" height="${H}" fill="url(#pipeG)" ${stroke}/>${[90, 300, 520].map(y => `<rect x="${x - 2}" y="${y}" width="19" height="8" rx="2" fill="#8f836a" ${stroke}/>`).join('')}`
  const sideWall = (x, flip) => `<rect x="${x}" y="0" width="40" height="${H}" fill="url(#creamH)" ${stroke}/>
    ${pipes(flip ? x + 6 : x + 18)}
    ${[260, 400, 540].map(y => `<rect x="${x + (flip ? 24 : 4)}" y="${y}" width="12" height="54" rx="3" fill="${CHAR_M}" ${stroke}/><rect x="${x + (flip ? 26 : 6)}" y="${y + 6}" width="8" height="6" rx="1" fill="${flip ? '#ff8f45' : MINT}"/>`).join('')}`

  // bulkhead stub running out of the wall: lit top face, then the cut end facing the viewer
  const stubUp = bx => `<rect x="${bx + 24}" y="${WY}" width="14" height="84" fill="url(#aoL)"/>
    <rect x="${bx}" y="${WY - 46}" width="24" height="82" fill="url(#creamTop)" ${stroke}/>
    <rect x="${bx + 9}" y="${WY - 40}" width="6" height="68" rx="3" fill="#bff3ff" opacity=".85"/>
    <rect x="${bx}" y="${WY + 36}" width="24" height="46" fill="url(#cream)" ${stroke}/><rect x="${bx}" y="${WY + 52}" width="24" height="6" fill="url(#red)"/>
    ${bolt(bx + 5, WY + 74)}${bolt(bx + 19, WY + 74)}`

  // power core: the column that feeds the three buses
  const [tx, ty, tw, th] = live.coreTube
  const tcx = tx + tw / 2
  const core = `<g><ellipse cx="${tcx + 6}" cy="234" rx="54" ry="9" fill="url(#ao)"/>
    <rect x="102" y="150" width="50" height="7" fill="url(#pipeH)" ${stroke}/><rect x="102" y="166" width="50" height="5" fill="url(#pipeGH)" ${stroke}/>
    <rect x="${tx - 10}" y="${ty - 18}" width="${tw + 20}" height="${th + 40}" rx="12" fill="url(#char)" ${stroke}/>
    <rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="10" fill="url(#coreG)" stroke="#0b1512" stroke-width="2"/>
    ${[...Array(6)].map((_, i) => `<ellipse cx="${tcx}" cy="${ty + 14 + i * 17}" rx="${tw / 2 - 3}" ry="3.6" fill="none" stroke="${MINT}" stroke-width="1.6" opacity="${r2(.9 - i * .1)}"/>`).join('')}
    <rect x="${tx + 5}" y="${ty + 6}" width="4" height="${th - 12}" rx="2" fill="#fff" opacity=".18"/>
    <rect x="${tx - 6}" y="${ty - 8}" width="${tw + 12}" height="10" rx="3" fill="url(#cream)" ${stroke}/><rect x="${tx - 6}" y="${ty + th - 2}" width="${tw + 12}" height="10" rx="3" fill="url(#cream)" ${stroke}/>
    <rect x="${tx + 6}" y="${ty - 14}" width="${tw - 12}" height="5" rx="2" fill="url(#red)"/>
    ${box(46, 214, 60, 20, 8, { front: 'url(#char)', topFill: '#5a5f68', shadow: false })}
    ${box(104, 218, 36, 14, 6, { front: 'url(#char)', topFill: '#5a5f68', shadow: false })}</g>`

  // relay equipment rack with the fault beacon on top
  const [bx0, by0] = live.beacon
  const rack = `<g><ellipse cx="1094" cy="234" rx="52" ry="9" fill="url(#ao)"/>
    <rect x="1100" y="14" width="6" height="124" fill="url(#pipeG)" ${stroke}/><rect x="1108" y="14" width="5" height="124" fill="url(#pipe)" ${stroke}/>
    ${box(1022, 218, 40, 14, 6, { front: 'url(#char)', topFill: '#5a5f68', shadow: false })}
    ${box(1062, 142, 52, 92, 9, { front: 'url(#char)', topFill: '#5a5f68', shadow: false })}
    ${[0, 1, 2, 3, 4].map(r => `<rect x="1068" y="${150 + r * 16}" width="40" height="11" rx="2" fill="#15191e" ${stroke}/>` + [0, 1, 2, 3].map(c => `<rect x="${1071 + c * 9}" y="${153 + r * 16}" width="6" height="5" rx="1" fill="${(r + c) % 3 === 0 ? MINT : (r * 2 + c) % 4 === 1 ? '#ffb347' : '#3d444d'}"/>`).join('')).join('')}
    <rect x="${bx0 - 10}" y="${by0 + 4}" width="20" height="6" rx="2" fill="url(#steel)" ${stroke}/>
    <path d="M${bx0 - 8} ${by0 + 4} A8 9 0 0 1 ${bx0 + 8} ${by0 + 4} Z" fill="#7a2416" ${stroke}/></g>`

  const cabinet = cx => `<path d="M${cx - 80} 122 H${cx + 80} L${cx + 82} 196 H${cx - 82} Z" fill="url(#cream)" ${stroke}/>`
  const screenAt = ([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="url(#screen)" ${stroke}/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#screenGlow)"/>`

  const consolePower = () => {
    const [x, y, w] = R('power'), cx = x + w / 2
    return `<g><ellipse cx="${cx + 6}" cy="${y + 56}" rx="${w * .58}" ry="12" fill="url(#ao)"/>${cabinet(cx)}
      <rect x="${cx - 74}" y="128" width="20" height="60" rx="3" fill="url(#char)" ${stroke}/>${[MINT, CYAN, VIOLET].map((c, i) => `<rect x="${cx - 70}" y="${133 + i * 18}" width="12" height="12" rx="2" fill="${c}"/>`).join('')}
      ${screenAt(live.powerScreen)}
      <rect x="${cx + 56}" y="128" width="20" height="60" rx="3" fill="${CHAR_M}" ${stroke}/>${[0, 1, 2].map(i => `<rect x="${cx + 60}" y="${132 + i * 18}" width="12" height="14" rx="2" fill="#15191e"/><rect x="${cx + 62}" y="${133 + i * 18 + (i === 1 ? 6 : 0)}" width="8" height="6" rx="1.5" fill="${i === 1 ? '#8f836a' : RED}"/>`).join('')}
      ${box(x, y + 10, w, 46, 14, { stripe: [26, 6] })}
      ${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${x + 14 + i * 22}" y="${y - 1 - (i % 2)}" width="14" height="7" rx="2" fill="${i === 1 ? MINT : i === 3 ? CYAN : i === 5 ? VIOLET : CHAR_M}" ${stroke}/>`).join('')}
      ${[0, 1, 2, 3].map(i => `<rect x="${x + 20 + i * 38}" y="${y + 20}" width="24" height="5" rx="2" fill="#a2967c"/>`).join('')}
      ${bolt(x + 8, y + 44)}${bolt(x + w - 8, y + 44)}
      ${sign(cx, 98, 148, 'POWER GRID', 'power')}</g>`
  }
  const consoleComms = () => {
    const [x, y, w] = R('comms'), cx = x + w / 2, [ox, oy, or] = live.scope
    return `<g><ellipse cx="${cx + 6}" cy="${y + 56}" rx="${w * .58}" ry="12" fill="url(#ao)"/>${cabinet(cx)}
      ${screenAt(live.commsScreen)}
      <circle cx="${ox}" cy="${oy}" r="${or + 4}" fill="url(#char)" ${stroke}/><circle cx="${ox}" cy="${oy}" r="${or}" fill="#082a25" stroke="#0b1512" stroke-width="1.5"/>
      <circle cx="${ox}" cy="${oy}" r="${r1(or * .6)}" fill="none" stroke="${MINT}" stroke-width="1" opacity=".45"/><path d="M${ox - or} ${oy} H${ox + or} M${ox} ${oy - or} V${oy + or}" stroke="${MINT}" stroke-width=".8" opacity=".35"/>
      ${[0, 1, 2].map(i => `<rect x="${ox - 15 + i * 11}" y="${oy + or + 6}" width="8" height="6" rx="1.5" fill="${[YEL, MINT, RED][i]}"/>`).join('')}
      ${box(x, y + 10, w, 46, 14, { stripe: [26, 6] })}
      ${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${x + 14 + i * 22}" y="${y - 1}" width="16" height="7" rx="1.5" fill="${i % 5 === 1 ? '#ff8f45' : i % 4 === 3 ? MINT : CHAR_M}" ${stroke}/>`).join('')}
      ${[0, 1, 2, 3].map(i => `<rect x="${x + 20 + i * 38}" y="${y + 20}" width="24" height="5" rx="2" fill="#a2967c"/>`).join('')}
      ${bolt(x + 8, y + 44)}${bolt(x + w - 8, y + 44)}
      ${sign(cx, 98, 166, 'ROVER COMMS', 'antenna')}</g>`
  }

  const body = `${wall}
  ${bulkheads.map(pillar).join('')}
  ${winFrame(windows[0], 22)}${cupola}${winFrame(windows[2], 22)}
  ${nodePlate(R('power')[0] + R('power')[2] + 6, 142, 'A')}${nodePlate(R('comms')[0] - 36, 142, 'C')}
  <rect x="0" y="${WY - 20}" width="${W}" height="20" fill="url(#cream)" ${stroke}/><rect x="0" y="${WY - 12}" width="${W}" height="5" fill="url(#red)"/>
  ${floor}
  ${sideWall(0, false)}${sideWall(W - 40, true)}
  <rect x="40" y="${WY}" width="50" height="${H - WY}" fill="url(#aoL)"/><rect x="${W - 90}" y="${WY}" width="50" height="${H - WY}" fill="url(#aoR)"/>
  ${core}${rack}${consolePower()}${consoleComms()}
  ${bulkheads.map(stubUp).join('')}`
  return { body, defs: stationDefs, W, H }
}

// Freestanding props, drawn as separate sprites so the astronaut can walk behind them.
// Each returns the region of the deck it covers (geo.deck.props), so art and game agree.
export function props(geo) {
  const D = geo.deck, live = D.live, W = D.width
  const R = id => D.solids.find(s => s.id === id).rect
  const frame = (id, body) => { const p = D.props.find(q => q.id === id); return { w: p.size[0], h: p.size[1], ox: p.at[0], oy: p.at[1], body } }
  const led = ([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5" fill="#15191e" ${stroke}/><circle cx="${x}" cy="${y}" r="3" fill="#2c343d"/>`

  // Mission Ops: a round holo-table under the cupola
  const [ex, ey] = live.emitter
  const ops = frame('ops', `
    <ellipse cx="${ex + 5}" cy="${ey + 41}" rx="80" ry="10" fill="url(#ao)"/>
    <path d="M${ex - 70} ${ey} A70 20 0 0 0 ${ex + 70} ${ey} V${ey + 22} A70 20 0 0 1 ${ex - 70} ${ey + 22} Z" fill="url(#char)" ${stroke}/>
    <path d="M${ex - 69.6} ${ey + 5} A70 20 0 0 0 ${ex + 69.6} ${ey + 5}" fill="none" stroke="${RED}" stroke-width="4"/>
    <ellipse cx="${ex}" cy="${ey}" rx="70" ry="20" fill="url(#creamTop)" ${stroke}/>
    <ellipse cx="${ex}" cy="${ey}" rx="55" ry="14.5" fill="url(#glassDark)" stroke="#3a332a" stroke-width="2"/>
    <ellipse cx="${ex}" cy="${ey}" rx="42" ry="10.5" fill="none" stroke="${CYAN}" stroke-width="1.4" opacity=".8"/>
    <ellipse cx="${ex}" cy="${ey}" rx="24" ry="6" fill="none" stroke="${CYAN}" stroke-width="1" opacity=".55"/>
    <ellipse cx="${ex}" cy="${ey}" rx="6" ry="2" fill="${CYAN}"/>
    ${[...Array(8)].map((_, i) => { const a = (i / 8) * Math.PI * 2 + .39; return bolt(ex + Math.cos(a) * 63, ey + Math.sin(a) * 17.5, 1.4) }).join('')}
    ${sign(ex, ey + 23, 128, 'MISSION OPS', 'orbit', 18, 12)}`)

  // Rover bay: the rover itself on a lift platform, between two marker posts. Nothing here
  // stands taller than the rover, so the walkway behind it stays in view.
  const [px, py, pw, ph] = R('payload')
  const top = py + 48
  const [bsx, bsy, bsw, bsh] = live.battScreen
  const [rvx, rvy] = live.rover
  const post = x => `<rect x="${x}" y="${py - 20}" width="8" height="34" fill="url(#yel)" ${stroke}/><rect x="${x - 2}" y="${py - 9}" width="12" height="5" fill="${CHAR}"/><rect x="${x - 2}" y="${py - 24}" width="12" height="7" rx="2" fill="url(#char)" ${stroke}/><circle cx="${x + 4}" cy="${py - 27}" r="3.4" fill="#ff8f45" ${stroke}/>`
  const payload = frame('payload', `
    <ellipse cx="${px + pw / 2 + 4}" cy="${py + ph + 1}" rx="112" ry="12" fill="url(#ao)"/>
    ${post(px + 14)}${post(px + pw - 22)}
    <path d="M${px} ${top} L${px + 10} ${py + 6} H${px + pw - 10} L${px + pw} ${top} Z" fill="url(#steelTop)" ${stroke}/>
    <ellipse cx="${px + pw / 2}" cy="${py + 27}" rx="88" ry="15" fill="#10161d" opacity=".24"/><ellipse cx="${px + pw / 2}" cy="${py + 27}" rx="88" ry="15" fill="none" stroke="#dfe8f0" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="6 5"/>
    <g transform="translate(${rvx} ${rvy})">${roverSvg().body}</g>
    <path d="M${px} ${top} L${px + 1.6} ${top - 6} H${px + pw - 1.6} L${px + pw} ${top} Z" fill="url(#haz)" ${stroke}/>
    <rect x="${px}" y="${top}" width="${pw}" height="${py + ph - top}" fill="url(#char)" ${stroke}/>
    <rect x="${px}" y="${py + ph - 5}" width="${pw}" height="5" fill="#000" opacity=".22"/>
    <rect x="${bsx}" y="${bsy}" width="${bsw}" height="${bsh}" rx="2" fill="url(#screen)" ${stroke}/>
    ${sign(px + pw / 2, top + 2, 92, 'PAYLOAD', 'crate', 18, 12)}
    <circle cx="${px + pw - 46}" cy="${top + 11}" r="3.5" fill="${MINT}"/><circle cx="${px + pw - 35}" cy="${top + 11}" r="3.5" fill="#ff8f45"/><rect x="${px + pw - 26}" y="${top + 5}" width="18" height="12" rx="2" fill="url(#haz)" ${stroke}/>`)

  // Hab Systems: water recycler, hydroponics rack, medical monitor
  const [hx, hy, , hh] = R('hab')
  const hab = frame('hab', `
    <ellipse cx="${hx + 122}" cy="${hy + hh}" rx="120" ry="12" fill="url(#ao)"/>
    ${[0, 1].map(i => `<g><rect x="${hx + 14 + i * 48}" y="${hy - 66 + i * 10}" width="42" height="${92 - i * 10}" rx="18" fill="url(#creamH)" ${stroke}/>
      <rect x="${hx + 20 + i * 48}" y="${hy - 46 + i * 10}" width="30" height="${50 - i * 8}" rx="8" fill="#123c4a" ${stroke}/><rect x="${hx + 20 + i * 48}" y="${hy - 24 + i * 6}" width="30" height="${28 - i * 4}" rx="6" fill="url(#water)" opacity=".9"/>
      <circle cx="${hx + 28 + i * 48}" cy="${hy - 14 + i * 6}" r="2" fill="#dff7ff" opacity=".8"/><circle cx="${hx + 40 + i * 48}" cy="${hy - 8 + i * 6}" r="1.5" fill="#dff7ff" opacity=".8"/></g>`).join('')}
    <path d="M${hx + 50} ${hy - 62} q8 -14 18 -4" fill="none" stroke="${RED_D}" stroke-width="5" stroke-linecap="round"/><circle cx="${hx + 59}" cy="${hy - 69}" r="5" fill="url(#red)" ${stroke}/>
    <ellipse cx="${hx + 138}" cy="${hy - 28}" rx="46" ry="54" fill="url(#growGlow)"/>
    <rect x="${hx + 110}" y="${hy - 74}" width="56" height="98" rx="4" fill="url(#char)" ${stroke}/>
    <rect x="${hx + 114}" y="${hy - 70}" width="48" height="6" rx="2" fill="#ffc4ea"/>
    ${[0, 1].map(t => { const sy = hy - 30 + t * 34; return [0, 1, 2, 3].map(k => sprout(hx + 121 + k * 11.5, sy, 14 + ((k + t) % 2) * 6)).join('') + `<rect x="${hx + 114}" y="${sy}" width="48" height="7" rx="2" fill="url(#cream)" ${stroke}/>` }).join('')}
    <rect x="${hx + 176}" y="${hy - 44}" width="50" height="60" rx="4" fill="url(#cream)" ${stroke}/><rect x="${hx + 181}" y="${hy - 39}" width="40" height="32" rx="3" fill="url(#screen)" ${stroke}/>
    <path d="M${hx + 184} ${hy - 20} h8 l3 -11 l4 20 l3 -9 h15" stroke="${MINT}" stroke-width="1.8" fill="none"/><text x="${hx + 218}" y="${hy - 30}" text-anchor="end" ${MONO} font-size="8" fill="${MINT}">72</text>
    <rect x="${hx + 190}" y="${hy - 68}" width="22" height="18" rx="4" fill="url(#creamTop)" ${stroke}/><path d="M${hx + 201} ${hy - 65} v12 M${hx + 195} ${hy - 59} h12" stroke="#2f9d6b" stroke-width="3.4"/>
    ${box(hx + 4, hy + 24, 222, 48, 12, { stripe: [22, 6], shadow: false })}
    ${led(live.habWater)}${led(live.habMed)}
    ${sign(hx + 115, hy + 41, 124, 'HAB SYSTEMS', 'drop', 18, 12)}`)

  // Calibration bench: graph monitor, optical sensor, two reference standards
  const [lx, ly, lw, lh] = R('calibration')
  const eye = [lx + 116, ly - 22]
  const lab = frame('lab', `
    <ellipse cx="${lx + lw / 2 + 2}" cy="${ly + lh}" rx="118" ry="12" fill="url(#ao)"/>
    <rect x="${lx + 12}" y="${ly - 50}" width="68" height="68" rx="5" fill="url(#cream)" ${stroke}/><rect x="${lx + 18}" y="${ly - 44}" width="56" height="46" rx="3" fill="url(#screen)" ${stroke}/>
    <path d="M${lx + 23} ${ly - 6} L${lx + 34} ${ly - 17} L${lx + 44} ${ly - 13} L${lx + 56} ${ly - 30} L${lx + 69} ${ly - 36}" stroke="${MINT}" stroke-width="2.2" fill="none"/><circle cx="${lx + 34}" cy="${ly - 17}" r="2.4" fill="#ff8f45"/><circle cx="${lx + 69}" cy="${ly - 36}" r="2.4" fill="#ff8f45"/>
    <path d="M${lx + 22} ${ly - 3} H${lx + 71} M${lx + 22} ${ly - 40} V${ly - 3}" stroke="${MINT}" stroke-width="1" opacity=".5"/>
    <rect x="${eye[0] - 8}" y="${eye[1] + 22}" width="16" height="22" fill="url(#steel)" ${stroke}/>
    <circle cx="${eye[0]}" cy="${eye[1]}" r="26" fill="url(#char)" ${stroke}/><circle cx="${eye[0]}" cy="${eye[1]}" r="19" fill="#d9cdb3" ${stroke}/><circle cx="${eye[0]}" cy="${eye[1]}" r="12" fill="#1f5e78"/><circle cx="${eye[0]}" cy="${eye[1]}" r="6" fill="#0b2633"/><circle cx="${eye[0] - 5}" cy="${eye[1] - 5}" r="3.5" fill="#c9f4ff" opacity=".9"/>
    <path d="M${eye[0] + 27} ${eye[1] + 2} L${lx + 158} ${ly - 6} M${eye[0] + 27} ${eye[1] + 4} L${lx + 188} ${ly - 6}" stroke="#ff8f45" stroke-width="1.4" stroke-dasharray="4 3" opacity=".8"/>
    <rect x="${lx + 148}" y="${ly + 8}" width="72" height="8" rx="2" fill="url(#steel)" ${stroke}/>
    ${[['A', '#4b5058', '#fff8e6'], ['B', '#f6f0e2', '#3a3128']].map(([t, fill, ink], i) => `<rect x="${lx + 154 + i * 32}" y="${ly - 20}" width="24" height="30" rx="2" fill="${fill}" ${stroke}/><text x="${lx + 166 + i * 32}" y="${ly + 4}" text-anchor="middle" ${FONT} font-size="12" fill="${ink}">${t}</text><circle cx="${lx + 166 + i * 32}" cy="${ly - 11}" r="3" fill="#ff8f45"/>`).join('')}
    ${box(lx + 4, ly + 24, 222, 48, 12, { stripe: [22, 6], shadow: false })}
    ${led(live.labStatus)}
    ${sign(lx + 108, ly + 41, 124, 'CALIBRATION', 'target', 18, 12)}`)

  // lower bulkhead stubs: the astronaut passes behind their raised top face
  const stubLow = (id, bx) => frame(id, `
    <rect x="${bx + 24}" y="548" width="12" height="94" fill="url(#aoL)"/>
    <rect x="${bx}" y="502" width="24" height="94" fill="url(#creamTop)" ${stroke}/>
    <rect x="${bx + 9}" y="510" width="6" height="78" rx="3" fill="#bff3ff" opacity=".85"/>
    <rect x="${bx}" y="596" width="24" height="46" fill="url(#cream)" ${stroke}/><rect x="${bx}" y="612" width="24" height="6" fill="url(#red)"/>
    ${bolt(bx + 5, 634)}${bolt(bx + 19, 634)}`)

  // front edge: a low sill with EVA handrails and the airlock the crew arrived through
  const SX = D.spawn[0]
  const rail = (a, b) => `<rect x="${a}" y="629" width="${b - a}" height="6" rx="3" fill="url(#yel)" ${stroke}/>` + [...Array(Math.floor((b - a - 12) / 86) + 1)].map((_, i) => `<rect x="${a + 6 + i * 86}" y="634" width="6" height="9" fill="url(#yel)" ${stroke}/>`).join('')
  const front = frame('front', `
    <rect x="0" y="641" width="${W}" height="29" fill="url(#creamTop)" ${stroke}/><rect x="0" y="642" width="${W}" height="3" fill="#fff" opacity=".55"/>
    <rect x="0" y="659" width="${W}" height="11" fill="url(#char)"/>
    ${[...Array(13)].map((_, i) => `<rect x="${40 + i * 90}" y="642" width="5" height="17" fill="#000" opacity=".1"/>`).join('')}
    ${rail(56, SX - 72)}${rail(SX + 72, W - 56)}
    <rect x="${SX - 58}" y="629" width="116" height="41" rx="7" fill="url(#char)" ${stroke}/>
    <rect x="${SX - 46}" y="636" width="92" height="34" rx="3" fill="#0a0f15"/>
    <rect x="${SX - 46}" y="636" width="5" height="34" fill="${MINT}"/><rect x="${SX + 41}" y="636" width="5" height="34" fill="${MINT}"/>
    <rect x="${SX - 41}" y="662" width="82" height="8" fill="url(#haz)"/>`)

  // instruments that appear on the rover once chosen at the Payload terminal
  const instIr = { w: 44, h: 32, ox: 0, oy: 0, body: `
    <rect x="1" y="15" width="16" height="5" rx="2" fill="#8f836a" ${stroke}/>
    <rect x="12" y="5" width="28" height="22" rx="5" fill="url(#cream)" ${stroke}/><rect x="12" y="13" width="28" height="4" fill="url(#red)"/>
    <circle cx="32" cy="16" r="7" fill="#1b0e05" ${stroke}/><circle cx="32" cy="16" r="4.2" fill="#ff8f45"/><circle cx="30.4" cy="14.4" r="1.5" fill="#fff" opacity=".85"/>
    <circle cx="17.5" cy="9.5" r="1.7" fill="${MINT}"/>` }
  const instGpr = { w: 60, h: 42, ox: 0, oy: 0, body: `
    <path d="M5 6 L30 24" stroke="${OUTL}" stroke-width="6.4" stroke-linecap="round"/><path d="M5 6 L30 24" stroke="#a2967c" stroke-width="3.6" stroke-linecap="round"/>
    <circle cx="5" cy="6" r="3.6" fill="url(#steel)" ${stroke}/>
    <path d="M18 23 H52 L57 33 H13 Z" fill="url(#char)" ${stroke}/><rect x="13" y="33" width="44" height="5" fill="#15191e" ${stroke}/>
    <path d="M25 25 L23 31 M35 25 V31 M45 25 L47 31" stroke="${MINT}" stroke-width="2"/>` }

  return { ops, payload, hab, lab, stubL: stubLow('stubL', D.bulkheads[0]), stubR: stubLow('stubR', D.bulkheads[1]), front, 'inst-ir': instIr, 'inst-gpr': instGpr }
}

// Station exterior for the docking approach: the same three nodes, cupola and relay dish.
export function exteriorSvg({ ORANGE, IVORY }) {
  const o = `stroke="${OUTL}" stroke-width="1.5"`
  const defs = `<linearGradient id="mod" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf6ea"/><stop offset=".6" stop-color="#cfc5ad"/><stop offset="1" stop-color="#7f7765"/></linearGradient>
    <linearGradient id="sol" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#16294a"/><stop offset=".5" stop-color="#2e5a93"/><stop offset="1" stop-color="#16294a"/></linearGradient>
    <linearGradient id="tr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9c2cc"/><stop offset="1" stop-color="#5f6a76"/></linearGradient>
    <linearGradient id="cup" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ff3ff"/><stop offset=".5" stop-color="#2a7f9c"/><stop offset="1" stop-color="#0d2833"/></linearGradient>`
  const wing = (x, y) => `<rect x="${x}" y="${y}" width="190" height="58" fill="url(#sol)" stroke="#a7bad3" stroke-width="2"/>${[1, 2, 3, 4, 5].map(i => `<line x1="${r1(x + (190 / 6) * i)}" y1="${y}" x2="${r1(x + (190 / 6) * i)}" y2="${y + 58}" stroke="#a7bad3" opacity=".5"/>`).join('')}<line x1="${x}" y1="${y + 29}" x2="${x + 190}" y2="${y + 29}" stroke="#a7bad3" opacity=".5"/>`
  let lattice = ''
  for (let x = 64; x <= 808; x += 24) lattice += `<path d="M${x} 100 L${x + 12} 112 L${x + 24} 100" stroke="#3a424c" stroke-width="1.4" fill="none"/>`
  const body = `
    ${wing(64, 28)}${wing(64, 126)}${wing(646, 28)}${wing(646, 126)}
    <rect x="156" y="86" width="6" height="40" fill="#8c8576"/><rect x="738" y="86" width="6" height="40" fill="#8c8576"/>
    <rect x="60" y="98" width="780" height="16" fill="url(#tr)" ${o}/>${lattice}
    ${[300, 578].map(x => `<rect x="${x}" y="114" width="22" height="64" fill="#f4eede" stroke="#8c8576" stroke-width="1.5"/>${[0, 1, 2, 3, 4].map(i => `<line x1="${x}" y1="${124 + i * 11}" x2="${x + 22}" y2="${124 + i * 11}" stroke="#b3a58a"/>`).join('')}`).join('')}
    <rect x="440" y="112" width="20" height="96" fill="url(#tr)" ${o}/>
    <path d="M692 242 L768 178" stroke="#8c8576" stroke-width="7" stroke-linecap="round"/><path d="M692 242 L768 178" stroke="#d9cdb3" stroke-width="3" stroke-linecap="round"/>
    <rect x="196" y="226" width="216" height="92" rx="40" fill="url(#mod)" ${o}/><rect x="488" y="226" width="216" height="92" rx="40" fill="url(#mod)" ${o}/>
    <rect x="372" y="204" width="156" height="136" rx="34" fill="url(#mod)" ${o}/>
    <rect x="386" y="212" width="9" height="120" fill="#8c8576" opacity=".55"/><rect x="505" y="212" width="9" height="120" fill="#8c8576" opacity=".55"/>
    <rect x="212" y="264" width="476" height="9" fill="${ORANGE}"/>
    ${[0, 1, 2].map(i => `<rect x="${232 + i * 46}" y="286" width="30" height="13" rx="5" fill="#ffd9a0"/><rect x="${538 + i * 46}" y="286" width="30" height="13" rx="5" fill="#ffd9a0"/>`).join('')}
    <path d="M412 338 H488 L476 364 H424 Z" fill="url(#cup)" ${o}/><path d="M437 338 L441 364 M463 338 L459 364" stroke="${OUTL}" stroke-width="1.2"/>
    <rect x="172" y="250" width="26" height="44" rx="4" fill="#3a3f46" ${o}/><rect x="162" y="244" width="11" height="56" rx="3" fill="#8c8576" ${o}/>
    <circle cx="167" cy="237" r="3" fill="${MINT}"/><circle cx="167" cy="307" r="3" fill="${MINT}"/>
    <g transform="translate(774 172) rotate(38)"><path d="M-34 0 Q0 30 34 0 Z" fill="url(#mod)" ${o}/><ellipse cx="0" cy="0" rx="34" ry="7" fill="#cfc5ad" ${o}/><path d="M-26 -1 L0 -26 L26 -1 M0 4 V-26" stroke="#5b544a" stroke-width="1.6" fill="none"/><circle cx="0" cy="-27" r="3.5" fill="${ORANGE}"/></g>
    <circle cx="450" cy="204" r="6" fill="${IVORY}" stroke="#7f7765" stroke-width="3"/><circle cx="450" cy="204" r="2.6" fill="${MINT}"/>`
  return { W: 900, H: 420, body, defs }
}

// Relay antenna seen through the node C window: a fixed boom and a dish the game steers.
export function relaySvg() {
  const boom = { w: 130, h: 74, body: `
    <path d="M126 58 L14 8 M126 70 L14 20" stroke="${OUTL}" stroke-width="5" stroke-linecap="round"/><path d="M126 58 L14 8 M126 70 L14 20" stroke="#b9c2cc" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M110 51 L96 57 L82 38 L68 44 L54 26 L40 32 L26 14" stroke="#8f9aa6" stroke-width="1.6" fill="none"/>
    <circle cx="14" cy="14" r="9" fill="url(#cream)" ${stroke}/><circle cx="14" cy="14" r="3.4" fill="${CHAR_M}"/>` }
  const dish = { w: 110, h: 96, body: `
    <rect x="50" y="66" width="10" height="18" fill="url(#creamH)" ${stroke}/>
    <g transform="translate(55 50)"><path d="M-42 0 Q0 38 42 0 Z" fill="url(#creamH)" ${stroke}/><path d="M-27 14 Q0 28 27 14" stroke="${RED}" stroke-width="3" fill="none"/>
      <ellipse cx="0" cy="0" rx="42" ry="9" fill="${CREAM_M}" ${stroke}/><ellipse cx="0" cy="1" rx="33" ry="5.5" fill="#8f836a" opacity=".45"/>
      <path d="M-32 -1 L0 -34 L32 -1 M0 6 V-34" stroke="#5b544a" stroke-width="2" fill="none"/><rect x="-5" y="-43" width="10" height="10" rx="2" fill="url(#char)" ${stroke}/></g>
    <circle cx="55" cy="84" r="7" fill="url(#char)" ${stroke}/>` }
  return { boom, dish }
}

// ------------------------------------------------------------------ Rover (3/4 view, facing right)
export function roverSvg() {
  const wheel = (x, y) => `<g><ellipse cx="${x}" cy="${y}" rx="13" ry="14" fill="url(#char)" ${stroke}/>${[...Array(8)].map((_, i) => `<rect x="${x - 1.5}" y="${y - 14}" width="3" height="5" fill="#1b1d21" transform="rotate(${i * 45} ${x} ${y})"/>`).join('')}<ellipse cx="${x + 1}" cy="${y}" rx="6" ry="6.5" fill="#a2967c" ${stroke}/><circle cx="${x + 1}" cy="${y}" r="2" fill="#5b544a"/></g>`
  return {
    w: 150, h: 120, body: `<ellipse cx="78" cy="104" rx="64" ry="11" fill="#1a0b05" opacity=".45"/>
    ${wheel(32, 90)}${wheel(76, 92)}${wheel(120, 90)}
    <path d="M24 74 L130 74 L124 84 L30 84 Z" fill="${CHAR_M}" ${stroke}/>
    <path d="M20 50 L128 50 L134 74 L22 76 Z" fill="url(#cream)" ${stroke}/>
    <path d="M26 42 L120 42 L128 50 L20 50 Z" fill="url(#creamTop)" ${stroke}/>
    <path d="M86 52 l8 22 M96 52 l8 22 M106 52 l8 22" stroke="url(#red)" stroke-width="5"/>
    <rect x="30" y="44" width="44" height="5" fill="#2e5a93" ${stroke}/>
    <rect x="28" y="58" width="40" height="10" rx="2" fill="${CHAR_M}" ${stroke}/><rect x="31" y="61" width="12" height="4" fill="${MINT}"/>
    <rect x="98" y="18" width="5" height="26" fill="#8f836a" ${stroke}/>
    <rect x="88" y="6" width="28" height="14" rx="3" fill="url(#cream)" ${stroke}/><circle cx="110" cy="13" r="4" fill="#0b2633" ${stroke}/><circle cx="109" cy="12" r="1.5" fill="${CYAN}"/>
    <rect x="34" y="28" width="3" height="16" fill="#8f836a"/><circle cx="35.5" cy="27" r="3" fill="${RED}"/>
    <rect x="124" y="56" width="10" height="5" rx="2" fill="${CYAN}"/>`,
  }
}

// ------------------------------------------------------------------ Mars sector
export function marsSvg(geo) {
  // The value the shared sequence held here in the first build. Pinned, so station art changes
  // can never move a crater or a rock on the survey map or in the site illustrations.
  seed = 206856167
  const { width: W, height: H, base, ice, ridge, basin } = geo.mars
  const defs = commonDefs + `
  <radialGradient id="ground" cx="40%" cy="35%" r="85%"><stop offset="0" stop-color="#c98455"/><stop offset=".55" stop-color="#ad6440"/><stop offset="1" stop-color="#7a3c25"/></radialGradient>
  <radialGradient id="dust" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#eebd88" stop-opacity=".95"/><stop offset=".65" stop-color="#dba26c" stop-opacity=".55"/><stop offset="1" stop-color="#dba26c" stop-opacity="0"/></radialGradient>
  <radialGradient id="crIn" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#4d2213"/><stop offset=".6" stop-color="#7a3a22"/><stop offset="1" stop-color="#b8754d"/></radialGradient>
  <radialGradient id="iceG" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f2fdff" stop-opacity=".95"/><stop offset=".6" stop-color="#bfeeff" stop-opacity=".5"/><stop offset="1" stop-color="#9fe6ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="rock" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c78558"/><stop offset=".5" stop-color="#8f4c2e"/><stop offset="1" stop-color="#55281a"/></linearGradient>
  <filter id="albedo"><feTurbulence type="fractalNoise" baseFrequency=".006" numOctaves="4" seed="3"/><feColorMatrix values="0 0 0 0 .32  0 0 0 0 .14  0 0 0 0 .07  0 0 0 .6 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .1  0 0 0 0 .05  0 0 0 .22 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
  <filter id="cast" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>`
  const crater = (x, y, r) => `<ellipse cx="${r1(x + r * .18)}" cy="${r1(y + r * .22)}" rx="${r1(r * 1.15)}" ry="${r1(r * 1.05)}" fill="#e2a678" opacity=".35"/>
    <ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(r)}" ry="${r1(r * .92)}" fill="url(#crIn)"/>
    <path d="M${r1(x - r)} ${r1(y)} A${r1(r)} ${r1(r * .92)} 0 0 0 ${r1(x + r)} ${r1(y)}" stroke="#f0b98a" stroke-width="${r1(1 + r / 14)}" fill="none" opacity=".7"/>
    <path d="M${r1(x - r)} ${r1(y)} A${r1(r)} ${r1(r * .92)} 0 0 1 ${r1(x + r)} ${r1(y)}" stroke="#3a180c" stroke-width="${r1(1 + r / 18)}" fill="none" opacity=".45"/>`
  const rock = (x, y, s) => `<ellipse cx="${r1(x + s * .5)}" cy="${r1(y + s * .55)}" rx="${r1(s * 1.1)}" ry="${r1(s * .45)}" fill="#2a0f05" opacity=".35" filter="url(#cast)"/>
    <path d="M${r1(x - s)} ${r1(y + s * .4)} L${r1(x - s * .6)} ${r1(y - s * .6)} L${r1(x + s * .2)} ${r1(y - s * .9)} L${r1(x + s)} ${r1(y - s * .2)} L${r1(x + s * .8)} ${r1(y + s * .5)} Z" fill="url(#rock)" stroke="#3a180c" stroke-width="${r1(Math.max(.6, s / 10))}"/>
    <path d="M${r1(x - s * .6)} ${r1(y - s * .6)} L${r1(x + s * .2)} ${r1(y - s * .9)} L${r1(x)} ${r1(y - s * .1)} Z" fill="#e0a171" opacity=".55"/>`
  let craters = '', rocks = ''
  for (let i = 0; i < 34; i++) craters += crater(rnd() * W, rnd() * H, 10 + rnd() ** 2 * 60)
  for (let i = 0; i < 220; i++) { const x = rnd() * W, y = rnd() * H; if (Math.hypot(x - base[0], y - base[1]) > 90) rocks += rock(x, y, 2 + rnd() ** 3 * 14) }
  // ridge as a raised mesa band: cast shadow, cliff face, lit top
  const rp = ridge.map(p => p.join(' ')).join(' L')
  const ridgeSvg = `<path d="M${rp}" transform="translate(16 26)" stroke="#2a0f05" stroke-width="80" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".45" filter="url(#cast)"/>
    <path d="M${rp}" transform="translate(0 14)" stroke="#5a2716" stroke-width="66" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M${rp}" stroke="#8f4a2c" stroke-width="58" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M${rp}" transform="translate(-4 -6)" stroke="#c07a4f" stroke-width="34" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M${rp}" transform="translate(-8 -12)" stroke="#e2a274" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
    ${ridge.map(([x, y], i) => i % 1 === 0 ? rock(x + 20, y + 30, 10) + rock(x - 30, y + 26, 7) : '').join('')}`
  let crystals = ''
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 50, x = ice[0] + Math.cos(a) * d, y = ice[1] + Math.sin(a) * d * .7, s = 3 + rnd() * 7
    crystals += `<path d="M${r1(x)} ${r1(y - s)} L${r1(x + s * .6)} ${r1(y)} L${r1(x)} ${r1(y + s * .4)} L${r1(x - s * .6)} ${r1(y)} Z" fill="${rnd() < .5 ? '#f4fdff' : '#bfeeff'}" stroke="#7fb8cc" stroke-width=".6"/>`
  }
  let ripples = ''
  for (let i = 0; i < 46; i++) ripples += `<path d="M${r1(basin[0] - basin[2] * .85 + rnd() * basin[2] * 1.7)} ${r1(basin[1] - basin[3] * .7 + rnd() * basin[3] * 1.4)} q14 -5 28 0 q14 5 28 0" stroke="#f6d0a2" stroke-width="2" fill="none" opacity=".45"/>`
  const [bx, by] = base
  const baseSvg = `<ellipse cx="${bx + 10}" cy="${by + 18}" rx="70" ry="30" fill="#2a0f05" opacity=".35" filter="url(#cast)"/>
    <ellipse cx="${bx}" cy="${by + 6}" rx="62" ry="32" fill="#8a7a66" stroke="#3a3128" stroke-width="2"/><ellipse cx="${bx}" cy="${by + 6}" rx="48" ry="24" fill="none" stroke="#f4c27a" stroke-width="2" stroke-dasharray="8 6"/>
    <path d="M${bx - 30} ${by + 10} Q${bx - 30} ${by - 22} ${bx} ${by - 26} Q${bx + 30} ${by - 22} ${bx + 30} ${by + 10} Z" fill="url(#cream)" ${stroke}/><rect x="${bx - 30}" y="${by - 2}" width="60" height="5" fill="url(#red)"/><rect x="${bx - 7}" y="${by - 4}" width="14" height="14" rx="2" fill="${CHAR_M}"/>
    <rect x="${bx + 34}" y="${by - 64}" width="5" height="70" fill="#d9cdb3" ${stroke}/><path d="M${bx + 18} ${by - 64} Q${bx + 36} ${by - 92} ${bx + 56} ${by - 64} Z" fill="url(#cream)" ${stroke}/><circle cx="${bx + 36}" cy="${by - 66}" r="4" fill="${RED}"/>
    <rect x="${bx - 72}" y="${by - 6}" width="34" height="18" fill="#2e5a93" ${stroke}/><path d="M${bx - 72} ${by + 3} H${bx - 38}" stroke="#a7bad3"/>`
  const body = `<rect width="${W}" height="${H}" fill="url(#ground)"/><rect width="${W}" height="${H}" fill="#000" filter="url(#albedo)"/>
    ${craters}
    <ellipse cx="${basin[0]}" cy="${basin[1]}" rx="${basin[2]}" ry="${basin[3]}" fill="url(#dust)"/>${ripples}
    ${rocks}${ridgeSvg}
    <ellipse cx="${ice[0]}" cy="${ice[1]}" rx="80" ry="58" fill="url(#iceG)"/>${crystals}
    ${baseSvg}
    <rect width="${W}" height="${H}" fill="#000" filter="url(#grain)"/>`
  return { body, defs, W, H }
}

// ------------------------------------------------------------------ Habitat site illustrations
export function siteSvg(id) {
  const W = 640, H = 360
  const sky = { shelf: ['#f0c79a', '#d48f62'], hollow: ['#b68266', '#7a4c3a'], plain: ['#eccaa2', '#d6a27a'] }[id]
  const defs = commonDefs + `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
  <linearGradient id="far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c88a64"/><stop offset="1" stop-color="#a86a48"/></linearGradient>
  <linearGradient id="mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8693f"/><stop offset="1" stop-color="#8a4a2c"/></linearGradient>
  <linearGradient id="near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a95c38"/><stop offset="1" stop-color="#6e3523"/></linearGradient>
  <linearGradient id="cliff" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e2a576"/><stop offset=".5" stop-color="#a05a36"/><stop offset="1" stop-color="#5e2a18"/></linearGradient>
  <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff8e6"/><stop offset=".3" stop-color="#fff2d0" stop-opacity=".7"/><stop offset="1" stop-color="#fff2d0" stop-opacity="0"/></radialGradient>
  <filter id="haze"><feGaussianBlur stdDeviation="1.5"/></filter>`
  const rocks = (n, y0, y1, smax) => { let s = ''; for (let i = 0; i < n; i++) { const x = rnd() * W, y = y0 + rnd() * (y1 - y0), r = 2 + rnd() ** 2 * smax * ((y - y0) / (y1 - y0) + .3); s += `<ellipse cx="${r1(x + r * .4)}" cy="${r1(y + r * .3)}" rx="${r1(r * 1.2)}" ry="${r1(r * .35)}" fill="#2a0f05" opacity=".35"/><path d="M${r1(x - r)} ${r1(y)} Q${r1(x - r * .8)} ${r1(y - r)} ${r1(x)} ${r1(y - r * 1.05)} Q${r1(x + r)} ${r1(y - r * .7)} ${r1(x + r)} ${r1(y)} Z" fill="url(#cliff)" stroke="#3a180c" stroke-width=".8"/>` } return s }
  const habitat = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="10" cy="26" rx="120" ry="12" fill="#2a0f05" opacity=".3"/>
    <rect x="-90" y="-4" width="70" height="28" rx="8" fill="url(#cream)" ${stroke}/><rect x="-90" y="10" width="70" height="4" fill="url(#red)"/>
    <path d="M-30 26 L-30 -14 L0 -34 L30 -14 L30 26 Z" fill="url(#cream)" ${stroke}/><path d="M-30 -14 L0 -34 L30 -14" fill="none" stroke="#fff" stroke-opacity=".6"/><rect x="-8" y="6" width="16" height="20" rx="2" fill="${CHAR_M}"/><rect x="-30" y="0" width="60" height="4" fill="url(#red)"/>
    <path d="M36 26 A34 34 0 0 1 104 26 Z" fill="#a9d9e6" fill-opacity=".55" ${stroke}/><path d="M44 26 A26 26 0 0 1 70 0 M70 0 A26 26 0 0 1 96 26 M36 26 H104 M52 8 L88 8" stroke="#e7f6fa" stroke-opacity=".6" fill="none"/>
    <rect x="18" y="-80" width="3" height="66" fill="#d9cdb3"/><circle cx="19.5" cy="-82" r="3" fill="${RED}"/>
    <rect x="110" y="6" width="44" height="18" fill="#2e5a93" ${stroke}/></g>`
  let scene = ''
  if (id === 'shelf') scene = `<path d="M0 170 Q120 140 240 158 T480 150 T640 160 V360 H0 Z" fill="url(#far)" filter="url(#haze)"/>
    <path d="M0 210 L180 196 L380 204 L640 190 V360 H0 Z" fill="url(#mid)"/><path d="M0 214 L640 196 L640 206 L0 224 Z" fill="#e7b086" opacity=".5"/>
    <path d="M0 250 L640 236 V360 H0 Z" fill="url(#near)"/>${rocks(60, 240, 350, 16)}${habitat(330, 222, 1)}
    <g opacity=".9">${[...Array(10)].map(() => `<path d="M${r1(470 + rnd() * 110)} ${r1(290 + rnd() * 30)} l5 -8 l5 8 z" fill="#e9fbff"/>`).join('')}</g>`
  if (id === 'hollow') scene = `<path d="M0 120 L80 120 L100 150 L200 150 L210 128 L330 128 L350 160 L640 160 V360 H0 Z" fill="url(#far)" filter="url(#haze)"/>
    <path d="M0 160 L140 160 L170 210 L250 280 L390 280 L470 200 L520 170 L640 170 V360 H0 Z" fill="url(#mid)"/>
    <path d="M140 160 L170 210 L250 280 L230 290 L150 220 Z" fill="url(#cliff)" opacity=".8"/><path d="M520 170 L470 200 L390 280 L420 290 L490 210 Z" fill="#5e2a18" opacity=".7"/>
    ${[0, 1, 2, 3].map(i => `<path d="M0 ${200 + i * 14} L130 ${206 + i * 14}" stroke="#f0d7c2" stroke-width="4" opacity=".55"/><path d="M640 ${210 + i * 12} L530 ${214 + i * 12}" stroke="#f0d7c2" stroke-width="3" opacity=".45"/>`).join('')}
    <path d="M0 300 Q320 270 640 300 V360 H0 Z" fill="url(#near)"/>${rocks(70, 280, 355, 18)}${habitat(320, 286, .55)}<rect width="${W}" height="${H}" fill="#1a0c08" opacity=".22"/>`
  if (id === 'plain') scene = `<path d="M0 176 Q160 168 320 174 T640 170 V360 H0 Z" fill="url(#far)" filter="url(#haze)"/>
    <path d="M0 196 L640 190 V360 H0 Z" fill="url(#mid)"/><rect x="0" y="120" width="640" height="80" fill="#f2d6b0" opacity=".35" filter="url(#haze)"/>
    <ellipse cx="470" cy="290" rx="90" ry="20" fill="#7a3a22"/><ellipse cx="470" cy="286" rx="84" ry="16" fill="#5e2a18"/><path d="M386 290 A90 20 0 0 0 554 290" stroke="#e7b086" stroke-width="3" fill="none"/>
    ${rocks(70, 210, 355, 14)}${habitat(220, 248, .9)}
    <path d="M0 150 q80 -24 160 -4 q80 20 160 0 q80 -20 160 4 q80 20 160 -4" stroke="#f6dcb4" stroke-width="18" fill="none" opacity=".35" filter="url(#haze)"/>`
  return { body: `<rect width="${W}" height="${H}" fill="url(#sky)"/><circle cx="${id === 'hollow' ? 540 : 110}" cy="${id === 'hollow' ? 50 : 70}" r="60" fill="url(#sun)"/>${scene}`, defs, W, H }
}
