// Generates every original SVG asset bundled with SPACER into public/assets/.
// Run: npm run art. Output is committed so the game needs no tooling at runtime.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'

const OUT = new URL('../public/assets/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const geo = JSON.parse(readFileSync(new URL('../src/art/geo.json', import.meta.url), 'utf8'))
const save = (name, w, h, body, defs = '') => writeFileSync(new URL(name, OUT),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>\n`)

// Deterministic PRNG so the art is reproducible.
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const r1 = n => Math.round(n * 10) / 10

const SUITS = {
  ember: ['#c8582a', '#8a3618', '#ec8a55'],
  aurora: ['#2bb4c9', '#17738a', '#7fe0ee'],
  sage: ['#5f9b55', '#3a6534', '#9ccc8b'],
  violet: ['#8456c4', '#553286', '#b897e6'],
}
const IVORY = '#ece4d2', IVORY_D = '#bfb49c', CHAR = '#24272c', CHAR_L = '#3a3f46', ORANGE = '#e0702a', MINT = '#6ef2c6', CYAN = '#5fd8f0'

// ---------------------------------------------------------------- Stars & Earth
function stars(w, h, n, maxR = 1.4) {
  let s = ''
  for (let i = 0; i < n; i++) {
    const r = rnd() ** 3 * maxR + 0.3
    const o = 0.35 + rnd() * 0.65
    const tint = rnd() < 0.15 ? '#ffd9b0' : rnd() < 0.2 ? '#bcd8ff' : '#ffffff'
    s += `<circle cx="${r1(rnd() * w)}" cy="${r1(rnd() * h)}" r="${r1(r)}" fill="${tint}" opacity="${r1(o)}"/>`
  }
  return s
}

function earthSvg() {
  const W = 2400, H = 1200
  const defs = `
  <radialGradient id="space" cx="50%" cy="100%" r="90%"><stop offset="0" stop-color="#16243f"/><stop offset=".55" stop-color="#0a1020"/><stop offset="1" stop-color="#03050b"/></radialGradient>
  <radialGradient id="ocean" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="#3f8fd0"/><stop offset=".45" stop-color="#1c5f9e"/><stop offset=".8" stop-color="#0d3460"/><stop offset="1" stop-color="#071a33"/></radialGradient>
  <radialGradient id="night" cx="85%" cy="40%" r="60%"><stop offset="0" stop-color="#02060f" stop-opacity=".92"/><stop offset=".6" stop-color="#02060f" stop-opacity=".5"/><stop offset="1" stop-color="#02060f" stop-opacity="0"/></radialGradient>
  <linearGradient id="atmo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ad8ff" stop-opacity="0"/><stop offset=".5" stop-color="#7cc6ff" stop-opacity=".85"/><stop offset="1" stop-color="#2f7fd6" stop-opacity="0"/></linearGradient>
  <filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="blur20"><feGaussianBlur stdDeviation="22"/></filter>
  <clipPath id="globe"><circle cx="1200" cy="3050" r="2200"/></clipPath>`
  let land = ''
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * W, cy = 850 + rnd() * 400, rx = 60 + rnd() * 260, ry = 20 + rnd() * 70
    land += `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${rnd() < .5 ? '#5d7f45' : '#9b8a5a'}" opacity=".75" transform="rotate(${r1(rnd() * 30 - 15)} ${r1(cx)} ${r1(cy)})"/>`
  }
  let clouds = ''
  for (let i = 0; i < 70; i++) {
    const cx = rnd() * W, cy = 840 + rnd() * 380, rx = 30 + rnd() * 170, ry = 6 + rnd() * 22
    clouds += `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="#fff" opacity="${r1(.35 + rnd() * .5)}"/>`
  }
  const body = `<rect width="${W}" height="${H}" fill="url(#space)"/>${stars(W, 800, 420, 1.8)}
  <circle cx="1200" cy="3050" r="2235" fill="#5fb8ff" opacity=".35" filter="url(#blur20)"/>
  <g clip-path="url(#globe)"><rect x="0" y="700" width="${W}" height="600" fill="url(#ocean)"/>
  <g filter="url(#blur3)">${land}</g><g filter="url(#blur3)">${clouds}</g>
  <rect x="0" y="700" width="${W}" height="600" fill="url(#night)"/></g>
  <circle cx="1200" cy="3050" r="2203" fill="none" stroke="#bfe6ff" stroke-width="5" opacity=".9" filter="url(#blur3)"/>
  <circle cx="1200" cy="3050" r="2212" fill="none" stroke="#5fb0ff" stroke-width="18" opacity=".5" filter="url(#blur8)"/>
  <ellipse cx="420" cy="860" rx="380" ry="40" fill="#fff6dc" opacity=".25" filter="url(#blur20)"/>`
  save('earth.svg', W, H, body, defs)
}

// ---------------------------------------------------------------- Ships
function shipSvg(id) {
  const W = 900, H = 420
  const defs = `
  <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf6ea"/><stop offset=".5" stop-color="${IVORY}"/><stop offset="1" stop-color="#9c937f"/></linearGradient>
  <linearGradient id="dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5059"/><stop offset="1" stop-color="#1b1e23"/></linearGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2b77d"/><stop offset=".5" stop-color="#b9864b"/><stop offset="1" stop-color="#6e4b26"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ff3ff"/><stop offset=".5" stop-color="#2a7f9c"/><stop offset="1" stop-color="#0d2833"/></linearGradient>
  <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2c9"/><stop offset=".4" stop-color="#ff9c45" stop-opacity=".7"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient>
  <linearGradient id="panel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1e3354"/><stop offset=".5" stop-color="#2f5b8f"/><stop offset="1" stop-color="#1e3354"/></linearGradient>
  <filter id="sh"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".55"/></filter>`
  const panelGrid = (x, y, w, h, cols) => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#panel)" stroke="#9fb6d1" stroke-width="2"/>`
    for (let i = 1; i < cols; i++) s += `<line x1="${x + (w / cols) * i}" y1="${y}" x2="${x + (w / cols) * i}" y2="${y + h}" stroke="#9fb6d1" stroke-width="1" opacity=".6"/>`
    return s + `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="#9fb6d1" stroke-width="1" opacity=".6"/>`
  }
  let body = ''
  if (id === 'odyssey') {
    body = `<g filter="url(#sh)">
    ${panelGrid(250, 40, 170, 70, 5)}${panelGrid(250, 310, 170, 70, 5)}
    <rect x="325" y="108" width="20" height="205" fill="#8c8576"/>
    <ellipse cx="160" cy="210" rx="44" ry="62" fill="url(#glow)"/>
    <path d="M180 160 L230 140 L230 280 L180 260 Z" fill="url(#dark)"/>
    <rect x="225" y="130" width="300" height="160" rx="30" fill="url(#hull)"/>
    <rect x="240" y="150" width="270" height="18" fill="${ORANGE}" opacity=".9"/>
    <rect x="240" y="252" width="270" height="10" fill="${CHAR_L}"/>
    <path d="M520 138 L690 168 Q760 210 690 252 L520 282 Z" fill="url(#hull)"/>
    <path d="M640 182 Q700 196 712 210 L640 214 Z" fill="url(#glass)"/>
    <rect x="300" y="186" width="120" height="44" rx="8" fill="url(#metal)"/>
    <text x="360" y="215" text-anchor="middle" font-family="Arial Narrow,Arial" font-weight="700" font-size="20" fill="#2b1a0b">ODYSSEY</text>
    <circle cx="560" cy="210" r="10" fill="${MINT}"/></g>`
  } else if (id === 'atlas') {
    body = `<g filter="url(#sh)">
    ${panelGrid(320, 20, 220, 60, 6)}${panelGrid(320, 340, 220, 60, 6)}
    <rect x="420" y="78" width="16" height="264" fill="#8c8576"/>
    <ellipse cx="110" cy="170" rx="40" ry="50" fill="url(#glow)"/><ellipse cx="110" cy="250" rx="40" ry="50" fill="url(#glow)"/>
    <rect x="130" y="140" width="60" height="60" rx="8" fill="url(#dark)"/><rect x="130" y="220" width="60" height="60" rx="8" fill="url(#dark)"/>
    <rect x="180" y="110" width="440" height="200" rx="18" fill="url(#hull)"/>
    ${[0, 1, 2, 3].map(i => `<rect x="${205 + i * 100}" y="130" width="86" height="160" rx="6" fill="none" stroke="#a69c86" stroke-width="3"/><rect x="${205 + i * 100}" y="${i % 2 ? 250 : 130}" width="86" height="14" fill="${ORANGE}" opacity=".85"/>`).join('')}
    <path d="M615 120 L740 150 Q790 210 740 270 L615 300 Z" fill="url(#hull)"/>
    <path d="M700 168 Q760 190 768 210 L700 214 Z" fill="url(#glass)"/>
    <rect x="300" y="196" width="150" height="40" rx="6" fill="url(#metal)"/>
    <text x="375" y="223" text-anchor="middle" font-family="Arial Narrow,Arial" font-weight="700" font-size="20" fill="#2b1a0b">ATLAS</text></g>`
  } else {
    body = `<g filter="url(#sh)">
    <ellipse cx="170" cy="210" rx="52" ry="40" fill="url(#glow)"/>
    <path d="M300 200 L250 60 L330 60 L420 190 Z" fill="url(#dark)"/>
    <path d="M300 220 L250 360 L330 360 L420 230 Z" fill="url(#dark)"/>
    <path d="M190 180 L520 150 Q760 175 820 210 Q760 245 520 270 L190 240 Z" fill="url(#hull)"/>
    <path d="M200 196 L520 170 L520 180 L200 206 Z" fill="${ORANGE}"/>
    <path d="M660 186 Q770 196 800 210 L660 214 Z" fill="url(#glass)"/>
    <circle cx="470" cy="150" r="30" fill="${IVORY}" stroke="#8c8576" stroke-width="4"/><circle cx="470" cy="150" r="10" fill="${MINT}"/>
    <rect x="330" y="198" width="130" height="34" rx="6" fill="url(#metal)"/>
    <text x="395" y="222" text-anchor="middle" font-family="Arial Narrow,Arial" font-weight="700" font-size="20" fill="#2b1a0b">VECTOR</text></g>`
  }
  save(`ship-${id}.svg`, W, H, body, defs)
}

// ---------------------------------------------------------------- Cockpit & exterior
function cockpitSvg() {
  const W = 1600, H = 900
  const defs = `<linearGradient id="dash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f46"/><stop offset="1" stop-color="#121418"/></linearGradient>
  <linearGradient id="frame" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b1d21"/><stop offset=".5" stop-color="#3a3f46"/><stop offset="1" stop-color="#1b1d21"/></linearGradient>
  <filter id="gl"><feGaussianBlur stdDeviation="3"/></filter>`
  const body = `
  <path fill-rule="evenodd" d="M0 0 H${W} V${H} H0 Z M260 120 L1340 120 L1480 560 L120 560 Z" fill="url(#frame)"/>
  <path d="M800 120 L790 560 L810 560 Z" fill="#2b2f36"/>
  <path d="M0 560 L1600 560 L1600 900 L0 900 Z" fill="url(#dash)"/>
  <path d="M120 560 L1480 560 L1500 600 L100 600 Z" fill="#4e4a43"/>
  ${[0, 1, 2].map(i => `<rect x="${330 + i * 330}" y="630" width="270" height="150" rx="10" fill="#0b1c1c" stroke="#5a5d63" stroke-width="3"/>`).join('')}
  <path d="M350 740 L400 700 L450 715 L500 670 L560 660" stroke="${MINT}" stroke-width="3" fill="none"/>
  <circle cx="795" cy="705" r="50" fill="none" stroke="${CYAN}" stroke-width="2"/><path d="M745 705 h100 M795 655 v100" stroke="${CYAN}" stroke-width="1" opacity=".6"/>
  ${[...Array(10)].map((_, i) => `<rect x="${1010 + (i % 5) * 46}" y="${650 + Math.floor(i / 5) * 60}" width="30" height="30" rx="4" fill="${i % 3 ? '#2b2f36' : ORANGE}" stroke="#6b6250"/>`).join('')}
  <rect x="770" y="580" width="60" height="10" rx="4" fill="${ORANGE}" filter="url(#gl)"/>`
  save('cockpit.svg', W, H, body, defs)
}


// ---------------------------------------------------------------- High-detail station, crew, rover, Mars, sites
import * as HQ from './art-hq.mjs'
import { stationArt } from './art-station.mjs'

function suitSheets() {
  const phases = [0, 1, 0.35, -1, -0.35]
  for (const [id, pal] of Object.entries(SUITS)) {
    const defs = HQ.commonDefs + HQ.astronautDefs(id, pal)
    let body = ''
    ;['down', 'up', 'side'].forEach((dir, row) => phases.forEach((ph, col) => {
      body += `<g transform="translate(${col * 64} ${row * 96})">${HQ.astronaut(id, dir, ph)}</g>`
    }))
    save(`suit-${id}.svg`, 320, 288, body, defs)
    const prev = `<ellipse cx="80" cy="198" rx="50" ry="9" fill="#000" opacity=".35"/><g transform="translate(16 12) scale(2)">${HQ.astronaut(id, 'down', 0)}</g>`
    save(`preview-${id}.svg`, 160, 210, prev, defs)
  }
}

// The station: its eight modules, the passages between them, the freestanding props, what is
// outside the hull, the view of the station from outside, and the relay antenna.
function station() {
  for (const f of stationArt(geo)) save(f.name, f.w, f.h, f.body, f.defs)
  const e = HQ.exteriorSvg({ ORANGE, IVORY })
  save('station-exterior.svg', e.W, e.H, e.body, e.defs)
  for (const [k, p] of Object.entries(HQ.relaySvg())) save(`ext-${k}.svg`, p.w, p.h, p.body, HQ.commonDefs)
}

earthSvg()
;['odyssey', 'atlas', 'vector'].forEach(shipSvg)
suitSheets()
station()
cockpitSvg()
{ const m = HQ.marsSvg(geo); save('mars-sector.svg', m.W, m.H, m.body, m.defs) }
{ const r = HQ.roverSvg(); save('rover.svg', r.w, r.h, r.body, HQ.commonDefs) }
for (const id of ['shelf', 'hollow', 'plain']) { const s = HQ.siteSvg(id); save(`site-${id}.svg`, s.W, s.H, s.body, s.defs) }
console.log('SPACER art generated in public/assets/')
