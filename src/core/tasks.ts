// Pure validation for every station task. No DOM, no Phaser.

export type TaskId = 'battery' | 'cargo' | 'water' | 'medical' | 'calibration' | 'relay' | 'habitat'

// ---- Battery balancing -------------------------------------------------
export const BATTERY_START = [5, 4, 2, 1]
export const BATTERY_MAX = 6
export function transferCell(cells: number[], from: number, to: number): { cells: number[]; error?: string } {
  if (from === to) return { cells, error: 'Pick two different cells.' }
  if (cells[from] <= 0) return { cells, error: `Cell ${from + 1} is empty.` }
  if (cells[to] >= BATTERY_MAX) return { cells, error: `Cell ${to + 1} is full.` }
  const next = [...cells]
  next[from]--
  next[to]++
  return { cells: next }
}
export const batteryBalanced = (cells: number[]) => cells.length === 4 && cells.every(c => c === 3)
export const batteryTotal = (cells: number[]) => cells.reduce((a, b) => a + b, 0)

// ---- Cargo reconciliation ----------------------------------------------
export const PALLET_KG = 11
export const CARGO_ITEMS = [
  { id: 'seal', name: 'Pressure seal kit', kg: 2, use: 'Spare gaskets for hatches' },
  { id: 'pump', name: 'Water pump', kg: 4, use: 'Liquid transfer hardware' },
  { id: 'battery', name: 'Backup battery', kg: 5, use: 'Spare energy storage' },
  { id: 'mast', name: 'Antenna mast', kg: 7, use: 'Signal mount hardware' },
] as const
export function cargoCheck(selected: string[]): { ok: boolean; kg: number; message: string } {
  const kg = CARGO_ITEMS.filter(i => selected.includes(i.id)).reduce((a, i) => a + i.kg, 0)
  if (kg > PALLET_KG) return { ok: false, kg, message: `Over the ${PALLET_KG} kg pallet limit by ${kg - PALLET_KG} kg.` }
  const want = ['pump', 'mast']
  const ok = selected.length === 2 && want.every(w => selected.includes(w))
  if (ok) return { ok, kg, message: 'Manifest reconciled: water pump and antenna mast recovered.' }
  if (!selected.includes('pump')) return { ok, kg, message: 'Missing the liquid-transfer hardware.' }
  if (!selected.includes('mast')) return { ok, kg, message: 'Missing the signal-mount hardware.' }
  return { ok, kg, message: 'Something on the pallet is not liquid-transfer or signal-mount hardware.' }
}

// ---- Water purification -------------------------------------------------
export const WATER_STAGES = [
  { id: 'screen', name: 'Mesh screen', clue: 'Catches grit and particles' },
  { id: 'carbon', name: 'Carbon bed', clue: 'Removes dissolved contaminants' },
  { id: 'uv', name: 'UV lamp', clue: 'Disinfects clear, filtered water' },
] as const
export const WATER_ORDER = ['screen', 'carbon', 'uv']
export function waterCheck(order: string[]): { ok: boolean; message: string } {
  if (order.length < 3) return { ok: false, message: 'Place all three stages between intake and output.' }
  if (order[0] !== 'screen') return { ok: false, message: 'Grit reaches the first stage and clogs it. What catches particles?' }
  if (order[2] !== 'uv') return { ok: false, message: 'UV only works on water that is already clear. It belongs last.' }
  if (order[1] !== 'carbon') return { ok: false, message: 'Dissolved contaminants slip through.' }
  return { ok: true, message: 'Potable water confirmed. Imported water need drops by 8 cr.' }
}

// ---- Crew medical -------------------------------------------------------
export const MEDICAL_STEPS = [
  { id: 'baseline', name: 'Resting baseline', clue: 'Record normal values before any load' },
  { id: 'exertion', name: 'Exertion scan', clue: 'Measure the heart under load' },
  { id: 'recovery', name: 'Recovery verification', clue: 'Confirm values return toward the baseline' },
] as const
export const MEDICAL_ORDER = ['baseline', 'exertion', 'recovery']
export function medicalCheck(order: string[]): { ok: boolean; message: string } {
  if (order.length < 3) return { ok: false, message: 'Queue all three checks.' }
  if (order[0] !== 'baseline') return { ok: false, message: 'Without a resting baseline there is nothing to compare against.' }
  if (order[1] !== 'exertion') return { ok: false, message: 'Recovery cannot be verified before the heart has been loaded.' }
  return { ok: true, message: 'Crew cleared for surface habitat commissioning.' }
}

// ---- Two-point calibration ---------------------------------------------
export const GAIN_RANGE: [number, number] = [90, 160]
export const OFFSET_RANGE: [number, number] = [-12, 12]
export const adjusted = (raw: number, gain: number, offset: number) => raw * gain / 100 + offset
export function calibrationCheck(raw: [number, number], target: [number, number], gain: number, offset: number) {
  const values = raw.map(r => adjusted(r, gain, offset))
  const within = values.map((v, i) => Math.abs(v - target[i]) <= 1)
  let message = 'Both standards within ±1. Calibration locked.'
  if (!within[0] && !within[1]) message = values[1] - values[0] < target[1] - target[0] - 1
    ? 'The spread between readings is too small: raise the gain.'
    : values[1] - values[0] > target[1] - target[0] + 1 ? 'The spread is too large: lower the gain.' : 'Spread looks right; shift the offset.'
  else if (!within[0] || !within[1]) message = 'One standard matches but the other does not: adjust gain, then offset.'
  return { ok: within[0] && within[1], values, within, message }
}

// ---- Relay repair -------------------------------------------------------
export const RELAY_SYMBOLS = ['—', '╱', '│', '╲']
export const RELAY_START = [1, 3, 0]
export const RELAY_TARGET = [3, 1, 2]
export const rotateRelay = (idx: number[], seg: number) => idx.map((v, i) => (i === seg ? (v + 1) % 4 : v))
export function relayCheck(idx: number[]): { ok: boolean; message: string } {
  const wrong = idx.map((v, i) => v !== RELAY_TARGET[i]).filter(Boolean).length
  return wrong === 0
    ? { ok: true, message: 'Carrier lock. Relay restored.' }
    : { ok: false, message: `${wrong} segment${wrong > 1 ? 's' : ''} still out of phase with the reference.` }
}

// ---- Habitat commissioning ---------------------------------------------
export const HABITAT_STEPS = [
  { id: 'anchor', name: 'Anchor foundation', clue: 'Fix the base to the ground' },
  { id: 'seal', name: 'Seal pressure shell', clue: 'Make the volume airtight' },
  { id: 'energize', name: 'Energize life support', clue: 'Only useful inside a sealed shell' },
] as const
export const HABITAT_ORDER = ['anchor', 'seal', 'energize']
export function habitatCheck(order: string[]): { ok: boolean; message: string } {
  if (order.length < 3) return { ok: false, message: 'Queue all three steps.' }
  if (order[0] !== 'anchor') return { ok: false, message: 'An unanchored shell can shift during pressurization.' }
  if (order[1] !== 'seal') return { ok: false, message: 'Life support would vent into an unsealed shell.' }
  return { ok: true, message: 'Habitat commissioned. Crew quarters pressurized.' }
}
