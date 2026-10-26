/* Inline SVG icon set — 1.6 stroke, feather-ish */
const s = (paths, extra = '') =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

const s2 = (size, paths, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

export const icon = {
  shield: (size = 18) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3.2v5.9c0 4.5-3 8.1-7 9-4-.9-7-4.5-7-9V6.2L12 3z"/><path d="M9.2 11.9l2 2 3.7-4"/></svg>`,
  grid: () => s('<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>'),
  tableGrid: (size = 14) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M9 9.5V20"/></svg>`,
  fileText: (size = 14) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>`,
  rowPlus: (size = 13) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  colPlus: (size = 13) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M4 12h16"/>` +
    `</svg>`,
  arrowUp: (size = 13) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>`,
  arrowDown: (size = 13) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>`,
  arrowRight: (size = 13) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  list: () => s('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>'),
  search: () => s('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>'),
  plus: (size = 16) => s2(size, '<path d="M12 5v14M5 12h14"/>'),
  x: (size = 16) => s2(size, '<path d="M18 6 6 18M6 6l12 12"/>'),
  check: (size = 16) => s2(size, '<path d="m5 13 4 4L19 7"/>'),
  chevronDown: (size = 16) => s2(size, '<path d="m6 9 6 6 6-6"/>'),
  chevronRight: () => s('<path d="m9 6 6 6-6 6"/>'),
  chevronLeft: () => s('<path d="m15 6-6 6 6 6"/>'),
  arrowLeft: () => s('<path d="M19 12H5m0 0 6-6m-6 6 6 6"/>'),
  // Six dots: the universal "grab me" affordance. Used on draggable table
  // columns, where the cursor alone was not a strong enough cue.
  // Horizontal grip for column headers: the vertical grip reads as "move this row",
  // and a column moves sideways.
  gripX: (size = 12) => s2(size, '<circle cx="6" cy="9" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="9" r="1.35" fill="currentColor" stroke="none"/><circle cx="18" cy="9" r="1.35" fill="currentColor" stroke="none"/><circle cx="6" cy="15" r="1.35" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1.35" fill="currentColor" stroke="none"/><circle cx="18" cy="15" r="1.35" fill="currentColor" stroke="none"/>'),
  grip: (size = 12) => s2(size, '<circle cx="9" cy="6" r="1.35" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.35" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.35" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.35" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.35" fill="currentColor" stroke="none"/>'),
  eye: () => s('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: () => s('<path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.6 3.3M6.2 7.6A16.6 16.6 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 3.9-.8"/><path d="M3 3l18 18"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  building: (size = 15) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V21"/><path d="M15 10h3.5A1.5 1.5 0 0 1 20 11.5V21"/><path d="M8 8h4M8 12h4M8 16h4"/></svg>`,
  logout: () => s('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8 6 12l4 4"/><path d="M6 12h10"/>'),
  sun: () => s('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: () => s('<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>'),
  menu: () => s('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  globe: () => s('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.4 3.6 5.5 3.6 9s-1.2 6.6-3.6 9c-2.4-2.4-3.6-5.5-3.6-9S9.6 5.4 12 3z"/>'),
  phone: () => s('<rect x="6" y="2.5" width="12" height="19" rx="2.6"/><path d="M10.5 18.5h3"/>'),
  // Contact glyphs: a handset (not the smartphone above) and an envelope.
  call: (size = 13) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2.5 2.5 0 0 1-2.7 2.5A16.5 16.5 0 0 1 4 5.7 2.5 2.5 0 0 1 6.5 3z"/></svg>`,
  mail: (size = 13) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.2"/><path d="m3 6.5 9 6 9-6"/></svg>`,
  userCheck: (size = 16) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="m16 11 2 2 4-4"/></svg>`,
  contact: (size = 16) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="10.5" r="2.2"/><path d="M5 17c0-1.7 1.6-3 3.5-3s3.5 1.3 3.5 3"/><path d="M15 9h4M15 13h4M15 17h2"/></svg>`,
  api: () => s('<path d="M8.5 7.5 5 12l3.5 4.5M15.5 7.5 19 12l-3.5 4.5"/><path d="M13.5 5l-3 14"/>'),
  card: () => s('<rect x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M2.5 10h19"/><path d="M7 14.5h3"/>'),
  clock: () => s('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>'),
  play: () => s('<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5L10 15.5z" fill="currentColor" stroke="none"/>'),
  pause: () => s('<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>'),
  inbox: () => s('<path d="M3 12h4l2 3h6l2-3h4"/><path d="M4.6 6h14.8l1.6 6v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6l1.6-6z"/>'),
  refresh: () => s('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>'),
  users: () => s('<circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M17.6 14.2a6.2 6.2 0 0 1 3.6 5.1"/>'),
  edit: () => s('<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5 17.5 10.5"/>'),
  trash: () => s('<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 12.5a1.8 1.8 0 0 0 1.8 1.5h6.4A1.8 1.8 0 0 0 17 19.5L18 7"/><path d="M10.5 11v6M13.5 11v6"/>'),
  briefcase: (size = 16) => s2(size, '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'),
  layers: () => s('<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 17l9 5 9-5"/>'),
  alert: () => s('<path d="M12 4 3 20h18L12 4z"/><path d="M12 10v4.5M12 17.5h.01"/>'),
  note: () => s('<path d="M6 3h9l4 4v14H6z"/><path d="M14.5 3v4.5H19"/><path d="M9.5 12h6M9.5 16h4"/>'),
  calendar: () => s('<rect x="3.5" y="5" width="17" height="16" rx="2.4"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/>'),
  filter: () => s('<path d="M3.5 5h17l-6.6 7.6V20l-3.8-2v-5.4L3.5 5z"/>'),
  user: () => s('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  sparkle: () => s('<path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9L5.2 10.3l4.9-1.9L12 3.5z"/>'),
  download: () => s('<path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M4.5 18.5h15"/>'),
  // The mirror of `download`: a tray under an arrow pointing in, for "bring a list in".
  upload: (size = 16) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V5m0 0 4 4m-4-4-4 4"/><path d="M4.5 20.5h15"/></svg>`,
  dot: () => s('<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>'),
  lock: () => s('<rect x="4.5" y="10" width="15" height="10.5" rx="2.4"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>'),
  apps: () => s('<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>'),
  crown: () => s('<path d="M3 8.5l4 3.5 5-6 5 6 4-3.5-2 10.5H5L3 8.5z"/><path d="M5 19h14"/>'),
  book: (size = 16) =>
    s2(size, '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17.5H6.5A2.5 2.5 0 0 0 4 22V4.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>'),
  pin: (size = 14) =>
    s2(size, '<path d="M12 17v5"/><path d="M9 3h6l-1 7 3 3H7l3-3-1-7z"/>'),
  copy: (size = 14) =>
    s2(size, '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  android: (size = 16) => s2(size, '<path d="M6 10.5v6a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-6"/><path d="M6 10.5a6 6 0 0 1 12 0"/><path d="M7.5 6 6 4M16.5 6 18 4"/><circle cx="9" cy="9" r=".7" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r=".7" fill="currentColor" stroke="none"/><path d="M3 11v5M21 11v5"/>'),
  apple: (size = 16) => s2(size, '<path d="M16.2 12.6c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.9-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2.1-1.1 2.8-2.2.6-.9.9-1.6 1.3-2.6-2.1-.8-2.9-2.8-2.9-3.5z"/><path d="M14.1 5.8c.6-.8 1.1-1.9 1-3-1 .1-2.2.7-2.9 1.5-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.4z"/>'),
  queue: () => s('<rect x="3" y="4" width="18" height="4.5" rx="1.6"/><rect x="3" y="10.5" width="18" height="4.5" rx="1.6"/><path d="M6 18.5h12"/><path d="M8.5 6.2h.01M8.5 12.8h.01"/>'),
  archive: () => s('<rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M4.5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V8.5"/><path d="M10 12.5h4"/>'),
  settings: () => s('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>'),
  tag: () => s('<path d="M11.6 3.5H20v8.4l-8.5 8.5a1.6 1.6 0 0 1-2.3 0l-6.1-6.1a1.6 1.6 0 0 1 0-2.3l8.5-8.5z"/><circle cx="16.3" cy="7.7" r="1.4"/>'),
  flag: () => s('<path d="M5 21V4"/><path d="M5 4.5h9.5l-1.3 3.3 1.3 3.2H5"/>'),
};

export const CATEGORY = {
  Web: { icon: 'globe', color: 'var(--blue)', soft: 'var(--blue-soft)', tone: 'blue' },
  Mobile: { icon: 'phone', color: 'var(--primary-fg)', soft: 'var(--primary-soft)', tone: 'violet' },
  API: { icon: 'api', color: 'var(--cyan)', soft: 'var(--cyan-soft)', tone: 'cyan' },
  EDC: { icon: 'card', color: 'var(--amber)', soft: 'var(--amber-soft)', tone: 'amber' },
};

export const STATUS = {
  Incoming: { tone: 'blue', color: 'var(--blue)' },
  Ongoing: { tone: 'amber', color: 'var(--amber)' },
  // Testing is finished and the report is being written.
  Ready: { tone: 'violet', color: 'var(--violet)' },
  Hold: { tone: 'slate', color: 'var(--slate)' },
  Done: { tone: 'green', color: 'var(--green)' },
};

export const PLATFORM = {
  Android: { icon: 'android', tone: 'green', label: 'Android' },
  iOS: { icon: 'apple', tone: 'slate', label: 'iOS' },
  API: { icon: 'api', tone: 'cyan', label: 'API' },
};

export const SUBROLE = {
  Lead: { tone: 'violet', rank: 0 },
  'Sub Lead': { tone: 'blue', rank: 1 },
  Member: { tone: 'slate', rank: 2 },
};

export const ENV = {
  Dev: { tone: 'slate' },
  Prod: { tone: 'rose' },
};

/**
 * Availability board vocabulary. '' is never shown: it means "automatic" and
 * resolves to On Project or Idle on the server.
 */
export const AVAILABILITY = {
  'On Project': { tone: 'amber', icon: 'briefcase', label: 'On Project' },
  Idle: { tone: 'green', icon: 'sparkle', label: 'Idle' },
  Leave: { tone: 'slate', icon: 'calendar', label: 'Leave' },
  Exam: { tone: 'violet', icon: 'flag', label: 'Exam' },
  'Research/Learning': { tone: 'cyan', icon: 'layers', label: 'Research / Learning' },
  Other: { tone: 'blue', icon: 'note', label: 'Other' },
};

/**
 * Device inventory kinds. `icon` names an entry in the `icon` map above, and the
 * tone drives the tab accent so the four tabs are distinguishable at a glance
 * rather than by reading their labels.
 */
export const DEVICE_KIND = {
  Android: { tone: 'green', icon: 'android', label: 'Android' },
  iOS: { tone: 'slate', icon: 'apple', label: 'iOS' },
  EDC: { tone: 'amber', icon: 'card', label: 'EDC' },
  Misc: { tone: 'violet', icon: 'layers', label: 'Misc' },
};
