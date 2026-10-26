/**
 * Project properties — the live category and status lists.
 *
 * These were hard-coded arrays in two places (app.js on the client, db.js ENUMS on the
 * server) until an admin could edit them. A project stores a property's KEY; the
 * interface shows its LABEL and paints its TONE. That separation is the whole point:
 * renaming "Ongoing" to "In progress" must not rewrite a single project row.
 *
 * The list lives in module state rather than in `state` so that badge helpers (ui.js)
 * can read it without app.js having to pass a label down through every call site —
 * `statusBadge(project.status)` still takes exactly one argument.
 *
 * Kept free of imports from app.js on purpose: app.js and ui.js both import this, and
 * a cycle there would make the registry undefined at module-eval time.
 */
let registry = { category: [], status: [] };

/** Replace the registry from `GET /api/properties` (or any writer's response). */
export function setProperties(next) {
  registry = {
    category: Array.isArray(next?.categories) ? next.categories : [],
    status: Array.isArray(next?.statuses) ? next.statuses : [],
  };
}

export function propList(kind) {
  return registry[kind] || [];
}

/** The stored values, in display order — what a `<select>` or segmented control wants. */
export function propKeys(kind) {
  return propList(kind).map((p) => p.key);
}

/** `{ value, label }` pairs for a picker whose values are keys and whose text is labels. */
export function propOptions(kind) {
  return propList(kind).map((p) => ({ value: p.key, label: p.label }));
}

export function propOf(kind, key) {
  return propList(kind).find((p) => p.key === key) || null;
}

/** The label to print for a stored value. Falls back to the key, never to blank. */
export function propLabel(kind, key) {
  if (!key) return '';
  return propOf(kind, key)?.label || String(key);
}

/** The badge tone for a stored value. */
export function propTone(kind, key, fallback = 'slate') {
  return propOf(kind, key)?.tone || fallback;
}
