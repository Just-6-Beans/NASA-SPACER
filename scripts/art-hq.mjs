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
function chamfer(x, y, w, h, c) {
  return `M${x + c} ${y} H${x + w - c} L${x + w} ${y + c} V${y + h - c} L${x + w - c} ${y + h} H${x + c} L${x} ${y + h - c} V${y + c} Z`
}

const ICON = {
  power: (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M2 -10 L-6 2 L0 2 L-2 10 L6 -2 L0 -2 Z" fill="#fff8e6"/>`,
  target: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff8e6" stroke-width="2"><circle r="8"/><circle r="3.5"/><path d="M-11 0 H-6 M6 0 H11 M0 -11 V-6 M0 6 V11"/></g>`,
  antenna: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff8e6" stroke-width="2" stroke-linecap="round"><path d="M0 -2 L-5 10 M0 -2 L5 10 M-3 5 H3"/><circle cy="-4" r="2" fill="#fff8e6"/><path d="M-6 -9 Q-9 -4 -6 1 M6 -9 Q9 -4 6 1"/></g>`,
  drop: (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -10 Q8 0 6 4 A6 6 0 0 1 -6 4 Q-8 0 0 -10 Z" fill="#fff8e6"/>`,
  crate: (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="#fff8e6" stroke-width="2"><rect x="-8" y="-7" width="16" height="14" rx="1"/><path d="M-8 -1 H8 M0 -7 V7"/></g>`,
}

function header(cx, y, w, label, icon) {
  return `<g filter="url(#drop)"><path d="${chamfer(cx - w / 2, y, w, 22, 5)}" fill="url(#cream)" ${stroke}/>
    <path d="${chamfer(cx - w / 2, y, 30, 22, 5)}" fill="url(#red)" ${stroke}/>${ICON[icon](cx - w / 2 + 15, y + 11, .8)}
    <text x="${cx - w / 2 + 38}" y="${y + 16.5}" font-family="Barlow Condensed, Arial Narrow, Arial" font-weight="700" font-size="15" letter-spacing="1.6" fill="#3a3128">${label}</text></g>`
}

function consolePower() {
  return `<g>
    <ellipse cx="236" cy="252" rx="98" ry="12" fill="url(#ao)"/>
    <path d="M156 116 H304 L306 196 H154 Z" fill="url(#cream)" ${stroke}/>
    <rect x="162" y="122" width="22" height="70" rx="3" fill="url(#char)" ${stroke}/>${[0, 1, 2].map(i => `<rect x="166" y="${128 + i * 20}" width="14" height="14" rx="2" fill="${i === 0 ? RED : '#4f555e'}"/>`).join('')}
    <rect x="192" y="124" width="82" height="58" rx="4" fill="url(#screen)" ${stroke}/><rect x="192" y="124" width="82" height="58" fill="url(#screenGlow)"/>
    <g stroke="${MINT}" stroke-width="2" fill="none"><rect x="225" y="130" width="16" height="12" rx="1"/><path d="M233 142 V150 M210 150 H256 M210 150 V158 M233 150 V158 M256 150 V158"/><rect x="203" y="158" width="14" height="10" rx="1"/><rect x="226" y="158" width="14" height="10" rx="1"/><rect x="249" y="158" width="14" height="10" rx="1"/></g>
    ${ICON.power(233, 136, .45)}
    <rect x="280" y="124" width="18" height="58" rx="3" fill="${CHAR_M}" ${stroke}/>${[0, 1, 2, 3].map(i => `<rect x="284" y="${130 + i * 13}" width="10" height="8" rx="1.5" fill="${['#6ef2c6', '#e9b22c', '#6ef2c6', '#d9512c'][i]}"/>`).join('')}
    ${box(150, 206, 160, 46, 14, { stripe: [26, 6] })}
    ${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${164 + i * 22}" y="${195 - (i % 2) * 1}" width="14" height="7" rx="2" fill="${i === 2 ? MINT : i === 4 ? RED : CHAR_M}" ${stroke}/>`).join('')}
    ${[0, 1, 2, 3].map(i => `<rect x="${170 + i * 34}" y="${216}" width="22" height="5" rx="2" fill="#a2967c"/>`).join('')}
    ${bolt(158, 240)}${bolt(302, 240)}
    ${header(230, 92, 132, 'POWER GRID', 'power')}</g>`
}
function consoleCalib() {
  return `<g>
    <ellipse cx="586" cy="252" rx="98" ry="12" fill="url(#ao)"/>
    <path d="M506 116 H654 L656 196 H504 Z" fill="url(#cream)" ${stroke}/>
    <rect x="514" y="124" width="74" height="54" rx="4" fill="url(#screen)" ${stroke}/><rect x="514" y="124" width="74" height="54" fill="url(#screenGlow)"/>
    <path d="M520 168 L534 156 L546 160 L560 140 L576 134" stroke="${MINT}" stroke-width="2.2" fill="none"/><circle cx="534" cy="156" r="2.4" fill="#ff8f45"/><circle cx="576" cy="134" r="2.4" fill="#ff8f45"/>
    <path d="M520 172 H582 M520 130 V172" stroke="${MINT}" stroke-width="1" opacity=".5"/>
    <circle cx="622" cy="152" r="26" fill="url(#char)" ${stroke}/><circle cx="622" cy="152" r="19" fill="#d9cdb3" ${stroke}/><circle cx="622" cy="152" r="12" fill="#1f5e78"/><circle cx="622" cy="152" r="6" fill="#0b2633"/><circle cx="617" cy="147" r="3.5" fill="#c9f4ff" opacity=".9"/>
    ${box(500, 206, 160, 46, 14, { stripe: [26, 6] })}
    ${[0, 1].map(i => `<rect x="${516 + i * 70}" y="194" width="52" height="7" rx="3.5" fill="${CHAR_M}" ${stroke}/><circle cx="${530 + i * 70 + i * 12}" cy="197.5" r="4.5" fill="#ff8f45" ${stroke}/>`).join('')}
    ${bolt(508, 240)}${bolt(652, 240)}
    ${header(580, 92, 140, 'CALIBRATION', 'target')}</g>`
}
function consoleComms() {
  return `<g>
    <ellipse cx="936" cy="252" rx="98" ry="12" fill="url(#ao)"/>
    <path d="M856 116 H1004 L1006 196 H854 Z" fill="url(#cream)" ${stroke}/>
    <rect x="862" y="122" width="78" height="60" rx="4" fill="url(#screen)" ${stroke}/><rect x="862" y="122" width="78" height="60" fill="url(#screenGlow)"/>
    <g stroke="${MINT}" stroke-width="2" fill="none"><rect x="878" y="148" width="34" height="12" rx="2"/><circle cx="884" cy="164" r="4"/><circle cx="895" cy="164" r="4"/><circle cx="906" cy="164" r="4"/><path d="M904 148 V136 M898 136 H910"/></g>
    ${[0, 1, 2, 3].map(i => `<rect x="${918 + i * 5}" y="${160 - i * 5}" width="3.5" height="${4 + i * 5}" fill="${MINT}"/>`).join('')}
    <rect x="946" y="122" width="52" height="40" rx="4" fill="url(#screen)" ${stroke}/>
    <circle cx="972" cy="142" r="14" fill="none" stroke="${MINT}" stroke-width="1.2" opacity=".7"/><circle cx="972" cy="142" r="6" fill="none" stroke="${MINT}" stroke-width="1.2" opacity=".7"/><path d="M972 142 L982 134" stroke="${MINT}" stroke-width="2"/>
    <rect x="946" y="166" width="52" height="16" rx="3" fill="${CHAR_M}" ${stroke}/>${[0, 1, 2, 3].map(i => `<rect x="${950 + i * 12}" y="170" width="8" height="8" rx="1.5" fill="${['#e9b22c', '#6ef2c6', '#d9512c', '#6ef2c6'][i]}"/>`).join('')}
    ${box(850, 206, 160, 46, 14, { stripe: [26, 6] })}
    ${[...Array(12)].map((_, i) => `<rect x="${862 + (i % 6) * 22}" y="${193 + Math.floor(i / 6) * 0}" width="16" height="7" rx="1.5" fill="${i % 5 === 1 ? '#ff8f45' : i % 4 === 3 ? MINT : CHAR_M}" ${stroke}/>`).slice(0, 6).join('')}
    ${bolt(858, 240)}${bolt(1002, 240)}
    ${header(930, 92, 150, 'ROVER COMMS', 'antenna')}</g>`
}

function crateStack(x, y, scale = 1) {
  const c = (cx, cy, w, h, stripe) => box(cx, cy, w, h, 10, { stripe: stripe ? [h * .35, 5] : null, shadow: false }) +
    `<path d="M${cx + w * .55} ${cy} l${w * .25} ${h}" stroke="url(#red)" stroke-width="7" opacity="${stripe ? 0 : .9}"/>${bolt(cx + 4, cy + 4, 1.3)}${bolt(cx + w - 4, cy + 4, 1.3)}`
  return `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cx="46" cy="50" rx="56" ry="10" fill="url(#ao)"/>${c(0, 14, 56, 36, false)}${c(52, 22, 40, 28, true)}${c(10, -18, 40, 30, true)}</g>`
}

function plant(x, y) {
  let leaves = ''
  for (let i = 0; i < 11; i++) {
    const a = (-160 + i * 14) * Math.PI / 180, l = 18 + (i % 3) * 7
    leaves += `<path d="M${x} ${y} Q${r1(x + Math.cos(a) * l * .45)} ${r1(y - l * .75)} ${r1(x + Math.cos(a) * l)} ${r1(y + Math.sin(a) * l)}" stroke="${i % 2 ? '#3f7a3c' : '#62a552'}" stroke-width="5.5" fill="none" stroke-linecap="round"/>`
  }
  return `<g><ellipse cx="${x + 4}" cy="${y + 34}" rx="22" ry="6" fill="url(#ao)"/>${leaves}
    <path d="M${x - 15} ${y + 2} L${x + 15} ${y + 2} L${x + 11} ${y + 32} L${x - 11} ${y + 32} Z" fill="url(#red)" ${stroke}/><rect x="${x - 16}" y="${y}" width="32" height="5" rx="2" fill="#e88b62" ${stroke}/></g>`
}

export function deckSvg(geo) {
  const { width: W, height: H, windows } = geo.deck
  const holes = windows.map(([x, y, w, h]) => chamfer(x, y, w, h, 22)).join(' ')
  const defs = commonDefs + `
  <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8ccb2"/><stop offset=".7" stop-color="#cbbd9f"/><stop offset="1" stop-color="#a99a7c"/></linearGradient>
  <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f7c64"/><stop offset=".35" stop-color="#a48d70"/><stop offset="1" stop-color="#7a6650"/></linearGradient>
  <linearGradient id="aoTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0f05" stop-opacity=".55"/><stop offset="1" stop-color="#1a0f05" stop-opacity="0"/></linearGradient>
  <linearGradient id="aoL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1a0f05" stop-opacity=".5"/><stop offset="1" stop-color="#1a0f05" stop-opacity="0"/></linearGradient>
  <linearGradient id="aoR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#1a0f05" stop-opacity=".5"/><stop offset="1" stop-color="#1a0f05" stop-opacity="0"/></linearGradient>
  <radialGradient id="pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe0b0" stop-opacity=".28"/><stop offset="1" stop-color="#ffe0b0" stop-opacity="0"/></radialGradient>
  <linearGradient id="pipe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a2c14"/><stop offset=".4" stop-color="#e2683e"/><stop offset="1" stop-color="#7a2410"/></linearGradient>
  <linearGradient id="pipeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a3d42"/><stop offset=".4" stop-color="#7d828a"/><stop offset="1" stop-color="#2c2f33"/></linearGradient>`

  // floor plates with bevels and wear
  let plates = ''
  for (let y = 214; y < 650; y += 54) for (let x = 40; x < 1120; x += 90) {
    const tone = r1(rnd() * .08)
    plates += `<rect x="${x + 1.5}" y="${y + 1.5}" width="87" height="51" rx="2" fill="#000" opacity="${tone}"/>
      <path d="M${x + 2} ${y + 2} H${x + 88}" stroke="#d9c4a2" stroke-opacity=".45" stroke-width="1.3"/>
      <path d="M${x + 2} ${y + 52} H${x + 88} M${x + 88} ${y + 2} V${y + 52}" stroke="#3b2f22" stroke-opacity=".55" stroke-width="1.3"/>
      ${bolt(x + 6, y + 6, 1.2)}${bolt(x + 84, y + 6, 1.2)}${bolt(x + 6, y + 48, 1.2)}${bolt(x + 84, y + 48, 1.2)}`
    if (rnd() < .25) plates += `<path d="M${r1(x + 10 + rnd() * 50)} ${r1(y + 12 + rnd() * 30)} q${r1(10 + rnd() * 20)} ${r1(rnd() * 6 - 3)} ${r1(25 + rnd() * 20)} 0" stroke="#5a4733" stroke-opacity=".35" stroke-width="1.2" fill="none"/>`
  }
  // red dashed hazard frame (like a loading zone) around the central walkway
  const zone = { x: 430, y: 300, w: 300, h: 320 }
  let dashes = ''
  const per = 2 * (zone.w + zone.h)
  for (let d = 0; d < per; d += 26) {
    const pt = t => t < zone.w ? [zone.x + t, zone.y] : t < zone.w + zone.h ? [zone.x + zone.w, zone.y + t - zone.w] : t < 2 * zone.w + zone.h ? [zone.x + zone.w - (t - zone.w - zone.h), zone.y + zone.h] : [zone.x, zone.y + zone.h - (t - 2 * zone.w - zone.h)]
    const [a, b] = [pt(d), pt(Math.min(per, d + 15))]
    dashes += `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="#d9512c" stroke-width="7" stroke-linecap="square" opacity=".75"/>`
  }
  const winFrames = windows.map(([x, y, w, h]) => `
    <path d="${chamfer(x, y, w, h, 22)}" fill="url(#glassSheen)"/>
    <path d="M${x + 30} ${y + 12} l40 0 l-60 70" stroke="#fff" stroke-opacity=".05" stroke-width="10" fill="none"/>
    <path d="${chamfer(x - 9, y - 9, w + 18, h + 18, 28)}" fill="none" stroke="url(#cream)" stroke-width="16" stroke-linejoin="round"/>
    <path d="${chamfer(x - 17, y - 17, w + 34, h + 34, 33)}" fill="none" stroke="${OUTL}" stroke-width="1.6"/>
    <path d="${chamfer(x - 1, y - 1, w + 2, h + 2, 22)}" fill="none" stroke="#3a332a" stroke-width="3.5"/>
    ${[.2, .5, .8].map(f => bolt(x + w * f, y - 9) + bolt(x + w * f, y + h + 9)).join('')}${bolt(x - 9, y + h / 2)}${bolt(x + w + 9, y + h / 2)}
    <rect x="${x + w / 2 - 22}" y="${y + h + 4}" width="44" height="7" rx="2" fill="url(#red)" ${stroke}/>`).join('')
  const pillar = (x) => `<rect x="${x}" y="0" width="70" height="200" fill="url(#creamH)" ${stroke}/>
    <rect x="${x + 8}" y="0" width="6" height="200" fill="#000" opacity=".08"/><rect x="${x + 56}" y="0" width="6" height="200" fill="#000" opacity=".12"/>
    <path d="M${x} 150 L${x + 70} 128 L${x + 70} 140 L${x} 162 Z" fill="url(#red)"/>`
  const photo = (x, y, c, rot) => `<g transform="rotate(${rot} ${x + 13} ${y + 16})" filter="url(#drop)"><rect x="${x}" y="${y}" width="26" height="32" fill="#f6f0e2" ${stroke}/><rect x="${x + 3}" y="${y + 3}" width="20" height="21" fill="${c}"/><circle cx="${x + 13}" cy="${y + 12}" r="4.5" fill="#e5c4a0"/><path d="M${x + 6} ${y + 24} q7 -9 14 0 Z" fill="#f2ead8"/></g>`
  const patch = (x, y, c) => `<g filter="url(#drop)"><circle cx="${x}" cy="${y}" r="13" fill="${c}" stroke="#f6f0e2" stroke-width="3"/><path d="M${x - 7} ${y + 4} L${x} ${y - 8} L${x + 7} ${y + 4} Z" fill="#f6f0e2"/><circle cx="${x}" cy="${y + 2}" r="2.6" fill="${RED}"/></g>`
  const lamp = (x, y) => `<ellipse cx="${x}" cy="${y + 50}" rx="80" ry="70" fill="url(#lampGlow)"/><rect x="${x - 16}" y="${y}" width="32" height="10" rx="3" fill="#fff1cf" ${stroke}/><rect x="${x - 12}" y="${y + 2}" width="24" height="5" rx="2" fill="#fffdf2"/>`
  const pipes = (x) => `<rect x="${x}" y="0" width="7" height="${H}" fill="url(#pipe)" ${stroke}/><rect x="${x + 10}" y="0" width="5" height="${H}" fill="url(#pipeG)" ${stroke}/>${[90, 300, 520].map(y => `<rect x="${x - 2}" y="${y}" width="19" height="8" rx="2" fill="#8f836a" ${stroke}/>`).join('')}`
  const sideWall = (x, flip) => `<rect x="${x}" y="0" width="40" height="${H}" fill="url(#creamH)" ${stroke}/>
    ${pipes(flip ? x + 6 : x + 18)}
    ${[260, 400, 540].map(y => `<rect x="${x + (flip ? 24 : 4)}" y="${y}" width="12" height="54" rx="3" fill="${CHAR_M}" ${stroke}/><rect x="${x + (flip ? 26 : 6)}" y="${y + 6}" width="8" height="6" rx="1" fill="${flip ? '#ff8f45' : MINT}"/>`).join('')}`

  const body = `
  <path fill-rule="evenodd" d="M0 0 H${W} V214 H0 Z ${holes}" fill="url(#wallG)"/>
  ${[0, 1, 2, 3].map(i => `<path d="M0 ${40 + i * 44} H${W}" stroke="#000" stroke-opacity=".06"/>`).join('')}
  <rect x="0" y="0" width="${W}" height="14" fill="url(#char)"/>
  ${pillar(368)}${pillar(718)}
  ${winFrames}
  ${photo(380, 30, '#4f78a6', -4)}${photo(404, 66, '#a65d4f', 5)}${patch(752, 44, '#2b4f7f')}${photo(736, 70, '#5f8a5a', -3)}
  ${lamp(403, 112)}${lamp(753, 112)}${lamp(60, 112)}${lamp(1100, 112)}
  <rect x="0" y="194" width="${W}" height="20" fill="url(#cream)" ${stroke}/><rect x="0" y="202" width="${W}" height="5" fill="url(#red)"/>
  <rect x="0" y="214" width="${W}" height="${H - 214}" fill="url(#floorG)"/>${plates}
  <rect x="0" y="214" width="${W}" height="70" fill="url(#aoTop)"/>
  <ellipse cx="580" cy="470" rx="320" ry="150" fill="url(#pool)"/><ellipse cx="230" cy="330" rx="210" ry="90" fill="url(#pool)"/><ellipse cx="930" cy="330" rx="210" ry="90" fill="url(#pool)"/>
  ${dashes}
  <text x="580" y="612" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, Arial" font-weight="700" font-size="16" letter-spacing="6" fill="#d9512c" opacity=".55">PAYLOAD BAY</text>
  ${sideWall(0, false)}${sideWall(W - 40, true)}
  <rect x="40" y="214" width="50" height="${H - 214}" fill="url(#aoL)"/><rect x="${W - 90}" y="214" width="50" height="${H - 214}" fill="url(#aoR)"/>
  ${crateStack(46, 204, .95)}${crateStack(1024, 204, .95)}
  ${consolePower()}${consoleCalib()}${consoleComms()}
  ${plant(381, 206)}${plant(779, 206)}`
  return { body, defs, W, H }
}

// Freestanding props drawn as separate sprites so the astronaut can walk behind them.
export function props() {
  const payload = { w: 200, h: 150, ox: 480, oy: 324, body: `
    <ellipse cx="584" cy="462" rx="96" ry="14" fill="url(#ao)"/>
    <rect x="504" y="420" width="152" height="10" rx="3" fill="url(#yel)" ${stroke}/>
    <rect x="510" y="380" width="8" height="48" fill="url(#yel)" ${stroke}/><rect x="642" y="380" width="8" height="48" fill="url(#yel)" ${stroke}/>
    ${[518, 640].map(x => `<circle cx="${x}" cy="455" r="7" fill="url(#char)" ${stroke}/><circle cx="${x}" cy="455" r="2.5" fill="#8f836a"/><rect x="${x - 2}" y="428" width="4" height="22" fill="${CHAR_M}"/>`).join('')}
    ${box(514, 396, 132, 26, 8, { front: 'url(#char)', topFill: '#5a5f68', shadow: false })}
    ${box(522, 360, 116, 36, 12, { stripe: [14, 6], shadow: false })}
    <path d="M560 360 l0 36 M600 360 l0 36" stroke="url(#red)" stroke-width="6"/>
    <rect x="548" y="342" width="64" height="8" rx="2" fill="#a2967c" ${stroke}/>
    <rect x="566" y="402" width="28" height="14" rx="2" fill="url(#screen)" ${stroke}/><circle cx="604" cy="409" r="3.5" fill="${MINT}"/><circle cx="614" cy="409" r="3.5" fill="#ff8f45"/>
    <path d="${chamfer(536, 436, 88, 18, 4)}" fill="url(#cream)" ${stroke}/>${ICON.crate(548, 445, .6)}<text x="560" y="449.5" font-family="Barlow Condensed, Arial Narrow, Arial" font-weight="700" font-size="12" letter-spacing="1.5" fill="#3a3128">PAYLOAD</text>` }
  const hab = { w: 220, h: 170, ox: 50, oy: 380, body: `
    <ellipse cx="164" cy="536" rx="104" ry="14" fill="url(#ao)"/>
    ${box(66, 486, 188, 50, 12, { stripe: [22, 6], shadow: false })}
    ${[0, 1].map(i => `<g><rect x="${76 + i * 50}" y="${404 + i * 10}" width="42" height="${84 - i * 10}" rx="18" fill="url(#creamH)" ${stroke}/>
      <rect x="${82 + i * 50}" y="${424 + i * 10}" width="30" height="${44 - i * 8}" rx="8" fill="#123c4a" ${stroke}/><rect x="${82 + i * 50}" y="${444 + i * 6}" width="30" height="${24 - i * 4}" rx="6" fill="#45b6d6" opacity=".85"/>
      <circle cx="${90 + i * 50}" cy="${452 + i * 6}" r="2" fill="#dff7ff" opacity=".8"/><circle cx="${100 + i * 50}" cy="${458 + i * 6}" r="1.5" fill="#dff7ff" opacity=".8"/></g>`).join('')}
    <rect x="176" y="430" width="70" height="50" rx="4" fill="url(#cream)" ${stroke}/><rect x="182" y="436" width="58" height="34" rx="3" fill="url(#screen)" ${stroke}/>
    <path d="M186 456 h12 l4 -12 l5 22 l4 -10 h25" stroke="${MINT}" stroke-width="2" fill="none"/><text x="235" y="447" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="8" fill="${MINT}">72</text>
    <path d="${chamfer(106, 504, 112, 18, 4)}" fill="url(#cream)" ${stroke}/>${ICON.drop(118, 513, .6)}<text x="130" y="517.5" font-family="Barlow Condensed, Arial Narrow, Arial" font-weight="700" font-size="12" letter-spacing="1.5" fill="#3a3128">HAB SYSTEMS</text>` }
  const rack = { w: 150, h: 160, ox: 974, oy: 370, body: `<g transform="translate(-6 0)">${crateStack(996, 456, 1.12)}</g>` }
  const rail = { w: 1160, h: 50, ox: 0, oy: 624, body: `
    <rect x="0" y="640" width="1160" height="8" rx="4" fill="url(#yel)" ${stroke}/>
    ${[...Array(13)].map((_, i) => `<rect x="${44 + i * 89}" y="640" width="9" height="30" fill="url(#yel)" ${stroke}/><rect x="${42 + i * 89}" y="${642}" width="13" height="5" rx="1" fill="${YEL_D}"/>`).join('')}
    <rect x="0" y="656" width="1160" height="5" rx="2.5" fill="url(#yel)" ${stroke}/>` }
  return { payload, hab, rack, rail }
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
