// Terminal task panels. Every panel re-renders from mission state + its saved draft, so closing
// and reopening keeps work in progress.
import { FILTER_CUT, INSTRUMENTS, PATCH_HANDOFF, POWER_TOTAL, PREP_HOURS, byId, type InstrumentId } from '../core/data'
import { TASK_INFO, type Mission } from '../core/mission'
import { fastRelay, powerBlock, researchFilter, unassigned, type Power } from '../core/power'
import * as T from '../core/tasks'
import type { TaskId } from '../core/tasks'
import { sound } from '../audio'
import { $, $$, el, esc, lower1 } from './dom'
import { POWER_PRESETS, samePower } from './forecast'
import { ICONS } from './icons'
import { opsTabs } from './ops'

export interface PanelCtx {
  m: Mission
  coopOn: () => boolean
  powerRevision: () => number
  setPower: (p: Power) => void
  done: (task: TaskId, detail: string) => void
  refresh: () => void
  openRover: () => void
  close: () => void
}

export type Tab = { id: string; label: string; task?: TaskId; render: (body: HTMLElement, rerender: () => void) => void }

let current: { root: HTMLElement; id: string } | null = null
export const panelOpen = () => !!current
export const currentPanel = () => current?.id ?? null

export function closePanel() {
  current?.root.remove()
  current = null
}

/** Re-render the open panel (e.g. after a co-op power update). */
export function refreshPanel(ctx: PanelCtx) {
  if (!current) return
  const id = current.id
  const tab = current.root.dataset.tab
  openPanel(id, ctx, tab)
}

const fb = (body: HTMLElement, text: string, kind: 'ok' | 'bad' | 'warn' | '' = '') => {
  const f = $('.feedback', body)
  if (!f) return
  f.className = `feedback ${kind}`
  f.textContent = text
}

export function openPanel(id: string, ctx: PanelCtx, tabId?: string) {
  const m = ctx.m
  const tabs = tabsFor(id, ctx)
  const meta: Record<string, [string, string]> = {
    ops: ['Mission Ops', 'Node B · Under the cupola'],
    power: ['Power Grid', 'Node A · Rear left · Station power'],
    calibration: ['Calibration', 'Node C · Front right · Instrument bench'],
    comms: ['Rover Comms', 'Node C · Rear right · Mars relay'],
    hab: ['Hab Systems', 'Node A · Front left · Life support & medical'],
    payload: ['Payload', 'Node B · Rover bay'],
  }
  const [title, loc] = meta[id]
  closePanel()
  const root = el(`<div class="overlay" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="panel">
      <div class="panel-head"><div style="flex:1"><div class="loc">${loc.toUpperCase()}</div><h2>${title}</h2></div><button class="btn small" id="pclose" aria-label="Close panel">Close · Esc</button></div>
      <div class="tabs" role="tablist"></div>
      <div class="panel-body"></div>
    </div></div>`)
  current = { root, id }
  document.body.append(root)
  root.addEventListener('pointerdown', e => { if (e.target === root) ctx.close() })
  $('#pclose', root).addEventListener('click', () => ctx.close())
  const tabBar = $('.tabs', root)
  const body = $('.panel-body', root)
  let active = tabs.find(t => t.id === tabId) ?? tabs[0]
  const draw = () => {
    root.dataset.tab = active.id
    tabBar.innerHTML = tabs.map(t => `<button class="tab" role="tab" data-id="${t.id}" aria-selected="${t === active}">${esc(t.label)} ${t.task && m.completed.has(t.task) ? '<span class="tick">✓</span>' : ''}</button>`).join('')
    $$('.tab', tabBar).forEach(b => b.addEventListener('click', () => { active = tabs.find(t => t.id === b.dataset.id)!; sound.play('ui'); draw() }))
    if (tabs.length < 2) tabBar.classList.add('hidden')
    body.innerHTML = ''
    active.render(body, draw)
  }
  draw()
  setTimeout(() => ($('.panel-body button:not(:disabled)', root) ?? $('#pclose', root))?.focus(), 30)
}

function tabsFor(id: string, ctx: PanelCtx): Tab[] {
  const m = ctx.m
  switch (id) {
    case 'ops': return opsTabs(ctx)
    case 'power': return [{ id: 'alloc', label: 'Allocation', render: (b, r) => powerTab(b, r, ctx) }, { id: 'battery', label: 'Battery balancing', task: 'battery', render: (b, r) => batteryTab(b, r, ctx) }]
    case 'calibration': return [{ id: 'cal', label: 'Two-point calibration', task: 'calibration', render: (b, r) => calibrationTab(b, r, ctx) }]
    // Once the link is up, the terminal opens the rover planner directly. This panel is only
    // for what stands in the way of it: no payload yet, or the relay.
    case 'comms': return m.payloadActive
      ? [{ id: 'relay', label: m.relayFault ? '⚠ Relay fault' : 'Relay', task: 'relay', render: (b, r) => relayTab(b, r, ctx) }]
      : [{ id: 'offline', label: 'Rover link', render: b => { b.innerHTML = '<p class="lead">The rover link powers up with the payload.</p><div class="feedback warn">Choose and activate a rover instrument at the Payload terminal first.</div>' } }]
    case 'hab': return [{ id: 'medical', label: 'Crew medical', task: 'medical', render: (b, r) => sequenceTab(b, r, ctx, 'medical') }, { id: 'water', label: 'Water purification', task: 'water', render: (b, r) => sequenceTab(b, r, ctx, 'water') }]
    case 'payload': return [{ id: 'inst', label: 'Rover instrument', render: (b, r) => payloadTab(b, r, ctx) }, { id: 'cargo', label: 'Cargo reconciliation', task: 'cargo', render: (b, r) => cargoTab(b, r, ctx) }]
  }
  return []
}

// ------------------------------------------------------------------ Preparation: one crew-hour each
/** True when the task is not done and there is no crew-hour left to do it with. */
const outOfHours = (m: Mission, task: TaskId) => !m.completed.has(task) && !!m.prepBlock(task)

/** The line every preparation task carries: what it costs, what is left, and what it buys. */
function prepLine(m: Mission, task: TaskId): string {
  const left = m.prepLeft
  if (m.completed.has(task)) return `<div class="prepcost done">${ICONS.clock}<span>Done. It took 1 crew-hour; ${left} of ${PREP_HOURS} left.</span></div>`
  if (outOfHours(m, task)) return `<div class="prepcost out">${ICONS.clock}<span>No crew-hours left: all ${PREP_HOURS} went to other preparation. This task is out of reach on this mission.</span></div>`
  return `<div class="prepcost">${ICONS.clock}<span>Takes <b>1 of your ${left} crew-hour${left === 1 ? '' : 's'}</b>. Buys: ${esc(lower1(TASK_INFO[task].reward))}.</span></div>`
}

// ------------------------------------------------------------------ Payload
function payloadTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m
  const sel = m.instrument ?? m.instrumentDraft
  const inst = sel ? byId(INSTRUMENTS, sel) : null
  const mass = inst?.massKg ?? 0
  body.innerHTML = `<p class="lead">One instrument flies on the rover. The cheaper one leaves credits for the landing; the sharper one reads the ice with less doubt. Activating locks the choice.</p>
    <div class="cards">${INSTRUMENTS.map(i => {
      const block = m.instrumentBlock(i.id)
      return `<button class="card" data-id="${i.id}" aria-pressed="${sel === i.id}" ${block || m.payloadActive ? 'disabled' : ''}>
        <h4>${i.name}</h4><div class="mono" style="color:#ff8f45">${i.code}</div><div style="margin-top:4px">${i.note}</div>
        <div class="stats">${i.cost} cr · ${i.massKg} kg<br/>A scan uses ${i.quickDraw}% of the rover battery<br/>Ice reading starts at ±${i.baseUncertainty}</div>
        ${block ? `<div class="why">Does not fit: ${esc(block)}</div>` : ''}</button>`
    }).join('')}</div>
    <div class="ledger">
      <span>Budget with ${esc(m.ship.name)}</span><b>${m.ship.budget} cr</b>
      <span>Instrument</span><b>${inst ? `−${inst.cost} cr` : '—'}</b>
      <span>Credits left</span><b>${m.credits} cr</b>
      <span>Payload mass</span><b>${mass} / ${m.ship.payloadKg} kg</b>
    </div>
    ${m.payloadActive
      ? `<div class="feedback ${m.relayFault ? 'warn' : 'ok'}">${esc(inst!.name)} is locked in. ${m.relayFault ? 'Powering it up knocked the Mars relay out, as it does on every mission. Choose the fix at Rover Comms.' : 'The rover link is up.'}</div>`
      : `<div class="feedback">${sel ? 'Selected. Activate to lock it in.' : 'Pick an instrument.'}</div>`}
    <div class="actions">${m.payloadActive ? '' : `<button class="btn primary" id="act" ${sel ? '' : 'disabled'}>Activate payload</button>`}</div>`
  $$('.card', body).forEach(c => c.addEventListener('click', () => {
    const err = m.selectInstrument(c.dataset.id as InstrumentId)
    if (err) { sound.play('fail'); fb(body, err, 'bad') } else { sound.play('ui'); rerender(); ctx.refresh() }
  }))
  $('#act', body)?.addEventListener('click', () => {
    const err = m.activatePayload()
    if (err) { sound.play('fail'); fb(body, err, 'bad'); return }
    ctx.refresh()
    rerender()
  })
}

function cargoTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m
  const d = (m.drafts.cargo ??= { selected: [] as string[] }) as { selected: string[] }
  const done = m.completed.has('cargo')
  const off = done || outOfHours(m, 'cargo')
  const kg = T.CARGO_ITEMS.filter(i => d.selected.includes(i.id)).reduce((a, i) => a + i.kg, 0)
  body.innerHTML = `<p class="lead">The manifest says this ${T.PALLET_KG} kg pallet holds the <b>liquid-transfer</b> and <b>signal-mount</b> hardware. Load exactly those items to recover them.</p>
    ${prepLine(m, 'cargo')}
    <div class="cards">${T.CARGO_ITEMS.map(i => `<button class="card" data-id="${i.id}" aria-pressed="${d.selected.includes(i.id)}" ${off ? 'disabled' : ''}><h4>${i.name}</h4><div class="stats">${i.kg} kg · ${i.use}</div></button>`).join('')}</div>
    <div class="ledger"><span>Pallet load</span><b class="${kg > T.PALLET_KG ? 'over' : ''}">${kg} / ${T.PALLET_KG} kg</b><span>Reward</span><b>+5 credits</b></div>
    <div class="feedback ${done ? 'ok' : ''}">${done ? 'Reconciled. +5 credits added to the budget.' : 'Select items, then confirm.'}</div>
    <div class="actions">${done ? '<span class="donebadge">COMPLETE</span>' : `<button class="btn primary" id="ok" ${off ? 'disabled' : ''}>Confirm manifest</button><button class="btn" id="rs" ${off ? 'disabled' : ''}>Reset</button>`}</div>`
  $$('.card', body).forEach(c => c.addEventListener('click', () => {
    const id = c.dataset.id!
    d.selected = d.selected.includes(id) ? d.selected.filter(x => x !== id) : [...d.selected, id]
    sound.play('ui'); rerender()
  }))
  $('#rs', body)?.addEventListener('click', () => { d.selected = []; rerender() })
  $('#ok', body)?.addEventListener('click', () => {
    const r = T.cargoCheck(d.selected)
    if (!r.ok) { sound.play('fail'); fb(body, r.message, 'bad'); return }
    ctx.done('cargo', 'water pump + antenna mast recovered (11 kg), +5 cr')
    rerender()
  })
}

// ------------------------------------------------------------------ Power
function powerTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m
  const p = m.power
  const free = unassigned(p)
  const rows: [keyof Power, string, number][] = [['life', 'Life support', 3], ['comms', 'Communications', 4], ['research', 'Research', 3]]
  const hand = m.handoffMin
  const block = powerBlock(p)
  const sent = !!m.pass
  // The split is really one choice: after life support, ten units cover one of these, not both.
  const preset = (id: 'direct' | 'filter', title: string, gain: string, cost: string) => {
    const v = POWER_PRESETS[id]
    return `<button class="card" data-preset="${id}" aria-pressed="${samePower(p, v)}"><h4>${title}</h4><div>${gain}</div><div class="stats">${cost}<br/>Life ${v.life} · Comms ${v.comms} · Research ${v.research}</div></button>`
  }
  body.innerHTML = `<p class="lead">The station has ${POWER_TOTAL} units. Life support and the rover link take 7. The last ones buy a faster signal or a sharper reading, not both. ${ctx.coopOn() ? `<b style="color:#5fd8f0">Shared with your crewmate · revision ${ctx.powerRevision()}</b>` : ''}</p>
    <div class="cards">
      ${preset('direct', 'Direct link', `Signals skip the relay and arrive <b>${hand} min sooner</b> each way.`, 'Costs the research filter.')}
      ${preset('filter', 'Research filter', `The ice reading is <b>±${FILTER_CUT} tighter</b>.`, `Costs the direct link: every signal waits ${hand} min at the relay.`)}
    </div>
    <h3 class="sub">Or set the units yourself</h3>
    <div class="power-rows">${rows.map(([k, label, need]) => `<div class="prow">
      <span class="lbl">${label}</span><button class="btn small" data-k="${k}" data-d="-1" aria-label="Decrease ${label}" ${p[k] <= 0 ? 'disabled' : ''}>−</button>
      <div class="cells">${Array.from({ length: POWER_TOTAL }, (_, i) => `<i class="${i < p[k] ? 'on' : ''} ${i === need - 1 ? 'need' : ''}"></i>`).join('')}</div>
      <button class="btn small" data-k="${k}" data-d="1" aria-label="Increase ${label}" ${free <= 0 ? 'disabled' : ''}>+</button><span class="n">${p[k]}</span></div>`).join('')}
    </div>
    <div class="effects">
      <div class="${fastRelay(p) ? 'on' : 'off'}">${fastRelay(p) ? '✓' : '○'} Direct link (Communications 5)</div>
      <div class="${researchFilter(p) ? 'on' : 'off'}">${researchFilter(p) ? '✓' : '○'} Research filter (Research 3)</div>
      ${free > 0 ? `<div class="bad">${free} unit${free === 1 ? '' : 's'} not routed anywhere</div>` : ''}
    </div>
    <div class="feedback ${block ? 'warn' : 'ok'}">${block ? esc(block) : sent ? 'The pass was sent with the power it had then. Changes now do not reach it.' : 'Power is ready for transmission.'}</div>`
  $$('button[data-k]', body).forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k as keyof Power
    const next = { ...m.power, [k]: m.power[k] + Number(b.dataset.d) }
    sound.play('ui')
    ctx.setPower(next)
    rerender()
  }))
  $$('button[data-preset]', body).forEach(b => b.addEventListener('click', () => {
    sound.play('ui')
    ctx.setPower({ ...POWER_PRESETS[b.dataset.preset as 'direct' | 'filter'] })
    rerender()
  }))
}

function batteryTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m
  const d = (m.drafts.battery ??= { cells: [...T.BATTERY_START], sel: -1 }) as { cells: number[]; sel: number }
  const done = m.completed.has('battery')
  const off = done || outOfHours(m, 'battery')
  const even = T.batteryBalanced(d.cells)
  body.innerHTML = `<p class="lead">Rover pack cells are uneven, which wastes charge. Select a <b>source</b> cell, then a <b>destination</b>, to move one unit. Total charge stays ${T.batteryTotal(T.BATTERY_START)}.</p>
    ${prepLine(m, 'battery')}
    <div class="cells4" style="margin-top:28px">${d.cells.map((c, i) => `<button class="cell ${d.sel === i ? 'sel' : ''} ${even ? 'even' : ''}" data-i="${i}" ${off ? 'disabled' : ''} aria-label="Cell ${i + 1}: ${c} units"><span>C${i + 1} · ${c}</span>${'<i></i>'.repeat(c)}</button>`).join('')}</div>
    <div class="feedback ${done ? 'ok' : ''}">${done ? 'Pack balanced: each drive now uses 3% less battery. The rover forecast has updated.' : d.sel >= 0 ? `Source C${d.sel + 1} selected. Pick a destination.` : 'Pick a source cell.'}</div>
    <div class="actions">${done ? '<span class="donebadge">COMPLETE</span>' : `<button class="btn primary" id="ok" ${off ? 'disabled' : ''}>Validate balance</button><button class="btn" id="rs" ${off ? 'disabled' : ''}>Reset</button>`}</div>`
  $$('.cell', body).forEach(c => c.addEventListener('click', () => {
    const i = Number(c.dataset.i)
    if (d.sel < 0) { d.sel = i; sound.play('ui'); rerender(); return }
    if (d.sel === i) { d.sel = -1; rerender(); return }
    const r = T.transferCell(d.cells, d.sel, i)
    if (r.error) { sound.play('fail'); d.sel = -1; rerender(); fb(body, r.error, 'bad'); return }
    d.cells = r.cells; d.sel = -1; sound.play('ui'); rerender()
  }))
  $('#rs', body)?.addEventListener('click', () => { d.cells = [...T.BATTERY_START]; d.sel = -1; rerender() })
  $('#ok', body)?.addEventListener('click', () => {
    if (!T.batteryBalanced(d.cells)) { sound.play('fail'); fb(body, `Not balanced yet: [${d.cells.join(', ')}]. Every cell should hold the same charge.`, 'bad'); return }
    ctx.done('battery', 'cells balanced to [3, 3, 3, 3], each drive uses 3% less battery')
    rerender()
  })
}

// ------------------------------------------------------------------ Calibration
function calibrationTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m
  if (!m.payloadActive) { body.innerHTML = '<p class="lead">Activate a payload instrument first.</p><div class="feedback warn">The bench calibrates whichever instrument is loaded at Payload.</div>'; return }
  const inst = m.instrumentInfo!
  const d = (m.drafts.calibration ??= { gain: 100, offset: 0 }) as { gain: number; offset: number }
  const done = m.completed.has('calibration')
  const off = done || outOfHours(m, 'calibration')
  const dis = off ? 'disabled' : ''
  const { raw, target } = inst.calibration
  const r = T.calibrationCheck(raw, target, d.gain, d.offset)
  const scale = (v: number) => Math.max(0, Math.min(100, v))
  body.innerHTML = `<p class="lead">Two reference standards check the <b>${inst.name} (${inst.code})</b>. Tune gain and offset until both adjusted readings land within ±1 of their references. Skip this and the ice reading is <b>±9 looser</b>; do it and it is <b>±5 tighter</b>.</p>
    ${prepLine(m, 'calibration')}
    ${m.pass && !done ? '<div class="feedback warn">The pass was already sent uncalibrated. Calibrating now would not change its reading.</div>' : ''}
    <div class="formula">adjusted = raw × gain / 100 + offset</div>
    <div class="cal-grid">${[0, 1].map(i => `<div class="std ${r.within[i] ? 'ok' : ''}">
      <div>Standard ${i === 0 ? 'A (low)' : 'B (high)'}</div>
      <div>raw <b>${raw[i]}</b> · reference <b style="color:#ff8f45">${target[i]}</b></div>
      <div class="big">${Number.isInteger(r.values[i]) ? r.values[i] : r.values[i].toFixed(1)} ${r.within[i] ? '<span style="color:#6ef2c6">✓</span>' : ''}</div>
      <div class="gauge"><div class="tgt" style="left:${scale(target[i])}%"></div><div class="val" style="left:${scale(r.values[i])}%"></div></div></div>`).join('')}</div>
    <div class="slider"><label for="gain">Gain</label><input type="range" id="gain" min="${T.GAIN_RANGE[0]}" max="${T.GAIN_RANGE[1]}" step="1" value="${d.gain}" ${dis}/><span class="row"><b>${d.gain}</b></span></div>
    <div class="row" style="justify-content:flex-end;gap:6px"><button class="btn small" data-f="gain" data-d="-1" ${dis}>Gain −1</button><button class="btn small" data-f="gain" data-d="1" ${dis}>Gain +1</button></div>
    <div class="slider"><label for="off">Offset</label><input type="range" id="off" min="${T.OFFSET_RANGE[0]}" max="${T.OFFSET_RANGE[1]}" step="1" value="${d.offset}" ${dis}/><span><b>${d.offset > 0 ? '+' : ''}${d.offset}</b></span></div>
    <div class="row" style="justify-content:flex-end;gap:6px"><button class="btn small" data-f="offset" data-d="-1" ${dis}>Offset −1</button><button class="btn small" data-f="offset" data-d="1" ${dis}>Offset +1</button></div>
    <div class="feedback ${done ? 'ok' : ''}">${done ? `Calibration locked at gain ${d.gain}, offset ${d.offset >= 0 ? '+' : ''}${d.offset}: the ice reading is ±5 tighter.` : 'Adjust, then lock calibration.'}</div>
    <div class="actions">${done ? '<span class="donebadge">COMPLETE</span>' : `<button class="btn primary" id="ok" ${dis}>Lock calibration</button><button class="btn" id="rs" ${dis}>Reset to defaults</button>`}</div>`
  const set = (f: 'gain' | 'offset', v: number) => {
    const [lo, hi] = f === 'gain' ? T.GAIN_RANGE : T.OFFSET_RANGE
    d[f] = Math.max(lo, Math.min(hi, Math.round(v)))
    rerender()
    ;($(f === 'gain' ? '#gain' : '#off', body) as HTMLInputElement | null)?.focus()
  }
  $('#gain', body)?.addEventListener('input', e => set('gain', Number((e.target as HTMLInputElement).value)))
  $('#off', body)?.addEventListener('input', e => set('offset', Number((e.target as HTMLInputElement).value)))
  $$('button[data-f]', body).forEach(b => b.addEventListener('click', () => set(b.dataset.f as 'gain' | 'offset', d[b.dataset.f as 'gain' | 'offset'] + Number(b.dataset.d))))
  $('#rs', body)?.addEventListener('click', () => { d.gain = 100; d.offset = 0; rerender() })
  $('#ok', body)?.addEventListener('click', () => {
    const c = T.calibrationCheck(raw, target, d.gain, d.offset)
    if (!c.ok) { sound.play('fail'); fb(body, c.message, 'bad'); return }
    ctx.done('calibration', `${inst.code} at gain ${d.gain}, offset ${d.offset >= 0 ? '+' : ''}${d.offset} (reading ±5 tighter)`)
    rerender()
  })
}

// ------------------------------------------------------------------ Relay: patch it or repair it
function relayTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx) {
  const m = ctx.m
  const d = (m.drafts.relay ??= { idx: [...T.RELAY_START], full: false }) as { idx: number[]; full: boolean }
  const done = m.completed.has('relay')
  const normal = m.ship.handoffMin, slow = normal + PATCH_HANDOFF
  const direct = fastRelay(m.power)
  const left = m.prepLeft
  const noHours = outOfHours(m, 'relay')
  const sent = !!m.pass
  const next = `<div class="actions"><button class="btn primary" id="plan">Open rover planner</button><button class="btn" id="stay">Back to the station</button></div>`
  const wire = () => {
    $('#plan', body)?.addEventListener('click', () => ctx.openRover())
    $('#stay', body)?.addEventListener('click', () => ctx.close())
  }

  if (done) {
    body.innerHTML = `<p class="lead">The relay is fully repaired.</p><div class="feedback ok">Carrier lock. The relay hand-off is ${normal} min on every signal, and none at all on a direct link.</div>${next}`
    return wire()
  }
  // The receiver puzzle: the full repair, or the upgrade of a patch.
  if (d.full && !noHours && !sent) {
    body.innerHTML = `<p class="lead">Rotate each receiver segment until it matches the reference pattern, then confirm.</p>
      ${prepLine(m, 'relay')}
      <div class="relay">
        <span class="lab">REFERENCE</span>${T.RELAY_TARGET.map(i => `<div class="seg ref" aria-label="Reference ${T.RELAY_SYMBOLS[i]}">${T.RELAY_SYMBOLS[i]}</div>`).join('')}
        <span class="lab">RECEIVER<br/>(tap to rotate)</span>${d.idx.map((v, i) => `<button class="seg ${v === T.RELAY_TARGET[i] ? 'match' : ''}" data-i="${i}" aria-label="Receiver segment ${i + 1}: ${T.RELAY_SYMBOLS[v]}">${T.RELAY_SYMBOLS[v]}</button>`).join('')}
      </div>
      <div class="feedback">Rotation order: — ╱ │ ╲</div>
      <div class="actions"><button class="btn primary" id="ok">Confirm match</button><button class="btn" id="rs">Reset</button><button class="btn ghost" id="choose">← Other fix</button></div>`
    $$('button.seg', body).forEach(b => b.addEventListener('click', () => { d.idx = T.rotateRelay(d.idx, Number(b.dataset.i)); sound.play('ui'); rerender() }))
    $('#rs', body)?.addEventListener('click', () => { d.idx = [...T.RELAY_START]; rerender() })
    $('#choose', body)?.addEventListener('click', () => { d.full = false; rerender() })
    $('#ok', body)?.addEventListener('click', () => {
      const r = T.relayCheck(d.idx)
      if (!r.ok) { sound.play('fail'); fb(body, r.message, 'bad'); return }
      ctx.done('relay', `receiver segments re-phased, hand-off ${normal} min`)
      rerender()
    })
    return
  }
  if (m.relayPatched) {
    body.innerHTML = `<p class="lead">The relay is patched and the link is up.</p>
      <div class="feedback ${direct ? 'ok' : 'warn'}">${direct
        ? `Your direct link skips the relay, so the patch costs nothing while Communications stays at 5.`
        : `Every signal now waits <b>${slow} min</b> at the relay instead of ${normal}. That is ${PATCH_HANDOFF * 2} min more on a command and its answer.`}</div>
      ${sent ? '' : noHours ? `<div class="prepcost out">${ICONS.clock}<span>No crew-hours left for the full repair.</span></div>`
        : `<div class="actions"><button class="btn" id="full">Repair it fully · 1 of your ${left} crew-hour${left === 1 ? '' : 's'}</button></div>`}
      ${next}`
    $('#full', body)?.addEventListener('click', () => { d.full = true; sound.play('ui'); rerender() })
    return wire()
  }
  // The fault itself: a choice, not an alarm to clear.
  body.innerHTML = `<p class="lead">Powering up the payload knocked the Mars relay out of phase. It happens on every mission. How you fix it is your call, and it depends on your power plan.</p>
    <div class="cards">
      <button class="card" id="patch"><h4>Quick patch</h4><div>Free and instant.</div>
        <div class="stats">Relay hand-off ${slow} min instead of ${normal}, on every signal.<br/>${direct ? '<b>Your direct link skips the relay: no cost to you now.</b>' : 'A direct link (Communications 5) would skip the relay.'}</div></button>
      <button class="card" id="full" ${noHours ? 'disabled' : ''}><h4>Full repair</h4><div>Takes 1 of your ${left} crew-hour${left === 1 ? '' : 's'}.</div>
        <div class="stats">Re-phase the receiver by hand.<br/>Relay hand-off stays at ${normal} min.${noHours ? '<br/><b>No crew-hours left.</b>' : ''}</div></button>
    </div>
    <div class="feedback warn">The rover planner stays offline until the relay is patched or repaired.</div>`
  $('#patch', body)?.addEventListener('click', () => {
    const err = m.patchRelay()
    if (err) { sound.play('fail'); fb(body, err, 'bad'); return }
    sound.play('success')
    ctx.refresh()
    rerender()
  })
  $('#full', body)?.addEventListener('click', () => { d.full = true; sound.play('ui'); rerender() })
}

// ------------------------------------------------------------------ Sequence builders (water, medical, habitat)
const SEQ = {
  water: { items: T.WATER_STAGES, pool: ['uv', 'screen', 'carbon'], check: T.waterCheck, start: 'Dirty intake', end: 'Potable output', reward: 'Imported water costs 8 cr less', detail: 'screen → carbon → UV, imported water −8 cr', lead: 'Assemble the purification train from dirty intake to potable output. Read what each stage does.' },
  medical: { items: T.MEDICAL_STEPS, pool: ['recovery', 'baseline', 'exertion'], check: T.medicalCheck, start: 'Crew member', end: 'Clearance', reward: 'The crew is cleared to commission the habitat', detail: 'baseline → exertion → recovery, crew cleared for habitat', lead: 'A landing only completes the mission once the habitat is commissioned, and that needs this clearance. Order the cardiovascular check: each step only means something if the step it depends on came first.' },
  habitat: { items: T.HABITAT_STEPS, pool: ['energize', 'anchor', 'seal'], check: T.habitatCheck, start: 'Landed module', end: 'Habitable', reward: 'Crew quarters on Mars', detail: 'anchor → seal → energize', lead: 'Commission the surface habitat in a safe order.' },
} as const

export function sequenceTab(body: HTMLElement, rerender: () => void, ctx: PanelCtx, kind: keyof typeof SEQ) {
  const m = ctx.m
  const cfg = SEQ[kind]
  const d = (m.drafts[kind] ??= { order: [] as string[] }) as { order: string[] }
  const done = m.completed.has(kind)
  const off = done || outOfHours(m, kind)
  const order = done ? cfg.items.map(i => i.id) : d.order
  const item = (id: string) => cfg.items.find(i => i.id === id)!
  const monitor = kind === 'medical' ? `<div class="monitor"><div>HR<br/><b style="font-size:22px">${done ? 72 : order.includes('exertion') ? 128 : 68}</b> bpm</div><svg viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0 30 H40 L46 10 L52 50 L58 30 H100 L106 ${order.includes('exertion') ? 2 : 14} L112 ${order.includes('exertion') ? 58 : 46} L118 30 H160 L166 12 L172 48 L178 30 H200" stroke="#6ef2c6" stroke-width="2" fill="none"/></svg><div>SpO₂<br/><b style="font-size:22px">98</b>%</div></div>` : ''
  body.innerHTML = `<p class="lead">${cfg.lead}</p>${kind === 'habitat' ? '' : prepLine(m, kind)}${monitor}
    <div class="seq"><div class="endcap">${cfg.start}<br/>→</div>${[0, 1, 2].map(i => order[i]
      ? `<button class="slot filled" data-slot="${i}" ${off ? 'disabled' : ''} aria-label="Remove ${item(order[i]).name}"><b>${i + 1}. ${item(order[i]).name}</b>${item(order[i]).clue}</button>`
      : `<div class="slot"><span style="color:#b9ae95">${i + 1}. empty</span></div>`).join('')}<div class="endcap">→<br/>${cfg.end}</div></div>
    ${done ? '' : `<div class="pool">${cfg.pool.map(id => `<button class="chip" data-id="${id}" ${off || order.includes(id) ? 'disabled' : ''}><b>${item(id).name}</b>${item(id).clue}</button>`).join('')}</div>`}
    <div class="feedback ${done ? 'ok' : ''}">${done ? `Complete: ${cfg.reward}.` : 'Tap stages to place them in order. Tap a placed stage to remove it.'}</div>
    <div class="actions">${done ? '<span class="donebadge">COMPLETE</span>' : `<button class="btn primary" id="ok" ${off ? 'disabled' : ''}>Validate</button><button class="btn" id="rs" ${off ? 'disabled' : ''}>Reset</button>`}</div>`
  $$('.chip', body).forEach(c => c.addEventListener('click', () => { if (d.order.length < 3) { d.order = [...d.order, c.dataset.id!]; sound.play('ui'); rerender() } }))
  $$('.slot[data-slot]', body).forEach(s => s.addEventListener('click', () => { d.order = d.order.filter((_, i) => i !== Number(s.dataset.slot)); rerender() }))
  $('#rs', body)?.addEventListener('click', () => { d.order = []; rerender() })
  $('#ok', body)?.addEventListener('click', () => {
    const r = cfg.check(d.order)
    if (!r.ok) { sound.play('fail'); fb(body, r.message, 'bad'); return }
    ctx.done(kind, cfg.detail)
    rerender()
  })
}
