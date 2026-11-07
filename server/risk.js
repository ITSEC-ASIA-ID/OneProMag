/**
 * The risk assessment matrix: how a finding earns its severity.
 *
 * Severity used to be a dropdown, which meant two testers looking at the same
 * bug could file it as High and Medium and both be "right". It is a product now:
 * likelihood × impact on a 5×5 grid, the classic shape a client's own risk
 * register already uses, so the number we send can be checked against theirs.
 *
 * The band thresholds are the part people argue about, so they live here and
 * nowhere else — the client reads the grid from `GET /api/risk-matrix` instead of
 * carrying its own copy of these numbers.
 *
 *   score = likelihood × impact        Low ≤ 4 · Medium ≤ 9 · High ≤ 16 · Critical
 *
 * The honest caveat: multiplying ranks a catastrophic-but-unlikely bug (1 × 5 = 5)
 * as Medium. That is the standard trade for a matrix this simple, and it is why
 * the form shows the score next to the band — a reader can see the 5 and decide
 * whether the assessment is being honest about the likelihood.
 */

export const LIKELIHOOD_LEVELS = [
  { value: 1, label: 'Rare', hint: 'needs conditions we have never seen' },
  { value: 2, label: 'Unlikely', hint: 'possible, but not with the access given' },
  { value: 3, label: 'Possible', hint: 'an ordinary attacker could get here' },
  { value: 4, label: 'Likely', hint: 'no special conditions needed' },
  { value: 5, label: 'Almost certain', hint: 'it happens on every engagement' },
];

export const IMPACT_LEVELS = [
  { value: 1, label: 'Negligible', hint: 'no real effect' },
  { value: 2, label: 'Minor', hint: 'inconvenience, no data exposed' },
  { value: 3, label: 'Moderate', hint: 'one account, or metadata only' },
  { value: 4, label: 'Major', hint: 'bulk data, or a privileged account' },
  { value: 5, label: 'Severe', hint: 'the client cannot operate, or must disclose' },
];

/** Worst band a score can still fall in. */
export const RISK_BANDS = [
  { max: 4, severity: 'Low' },
  { max: 9, severity: 'Medium' },
  { max: 16, severity: 'High' },
  { max: 25, severity: 'Critical' },
];

export function severityForScore(score) {
  const n = Number(score);
  return (RISK_BANDS.find((b) => n <= b.max) || { severity: 'Critical' }).severity;
}

export function severityFor(likelihood, impact) {
  return severityForScore(Number(likelihood) * Number(impact));
}

/** `grid[likelihood - 1][impact - 1]` — the table the client renders and reads. */
const GRID = LIKELIHOOD_LEVELS.map((l) => IMPACT_LEVELS.map((i) => severityFor(l.value, i.value)));

export function riskMatrix() {
  return {
    likelihood: LIKELIHOOD_LEVELS,
    impact: IMPACT_LEVELS,
    bands: RISK_BANDS,
    grid: GRID,
  };
}

/** A level, or null — the caller decides whether null is refused or a fallback. */
export function levelOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}
