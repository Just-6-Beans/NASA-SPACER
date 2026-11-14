// Inline line icons (currentColor) for the HUD and panels.
const svg = (body: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const ICONS = {
  leaf: svg('<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l8-8"/>'),
  signal: svg('<circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'),
  flask: svg('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>'),
  pilot: svg('<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c0-4.2 3.3-7 7.5-7s7.5 2.8 7.5 7"/>'),
  crew: svg('<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 13.2c3 .2 5.5 2.4 5.5 5.8"/>'),
  rover: svg('<rect x="4" y="9" width="14" height="5" rx="1"/><circle cx="6" cy="17" r="2"/><circle cx="11" cy="17" r="2"/><circle cx="16" cy="17" r="2"/><path d="M14 9V5h3M2 11h2M1 13.5h2"/>'),
  scan: svg('<circle cx="5" cy="12" r="1.5" fill="currentColor"/><path d="M9 8.5a5 5 0 0 1 0 7M12.5 6a8.5 8.5 0 0 1 0 12M16 3.5a12 12 0 0 1 0 17"/>'),
  home: svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>'),
  dish: svg('<path d="M4 14a8 8 0 0 0 10-10z"/><path d="M9 9l5-5M14 4l2 2M6 20h8M10 17l-1 3"/><path d="M17 7a4 4 0 0 1 2 4M18 3a8 8 0 0 1 4 7"/>'),
  bars: svg('<path d="M5 20v-4M10 20v-8M15 20v-12M20 20V4"/>'),
  snow: svg('<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/>'),
  mountain: svg('<path d="M2 20l7-12 4 6 3-4 6 10z"/><path d="M7.5 11l1.5 2 1.5-1.5"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  warn: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
}
