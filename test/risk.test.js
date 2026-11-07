/**
 * The risk matrix, on its own.
 *
 * Severity is derived from two ratings rather than picked from a list, so the
 * banding is now logic a reader has to be able to check — a threshold edited by
 * accident would silently re-grade every finding ever filed. These tests pin the
 * band edges, the shape the form reads, and the one case worth arguing about.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIKELIHOOD_LEVELS, IMPACT_LEVELS, RISK_BANDS, levelOf, riskMatrix, severityFor } from '../server/risk.js';

test('the matrix bands every product of two ratings, and only those', () => {
  for (let likelihood = 1; likelihood <= 5; likelihood += 1) {
    for (let impact = 1; impact <= 5; impact += 1) {
      const score = likelihood * impact;
      const band = RISK_BANDS.find((b) => score <= b.max);
      assert.equal(severityFor(likelihood, impact), band.severity, `${likelihood} × ${impact} = ${score}`);
    }
  }
});

test('the band edges are the documented ones', () => {
  assert.equal(severityFor(2, 2), 'Low', '4 is still Low');
  assert.equal(severityFor(1, 5), 'Medium', '5 crosses into Medium');
  assert.equal(severityFor(3, 3), 'Medium', '9 is still Medium');
  assert.equal(severityFor(2, 5), 'High', '10 crosses into High');
  assert.equal(severityFor(4, 4), 'High', '16 is still High');
  assert.equal(severityFor(5, 4), 'Critical', '20 crosses into Critical');
  assert.equal(severityFor(5, 5), 'Critical');
});

test('a catastrophic but unlikely finding is Medium, and that is on the record', () => {
  // 1 × 5 = 5. The product is the standard trade: it keeps the matrix checkable
  // against a client's own register. The form prints the score beside the band so
  // a reader who disagrees can see the 1 and say so in the likelihood.
  assert.equal(severityFor(1, 5), 'Medium');
  assert.equal(severityFor(5, 1), 'Medium', 'the product does not care which factor is which');
});

test('the table the client reads matches the function that stores the answer', () => {
  const matrix = riskMatrix();
  assert.equal(matrix.grid.length, 5);
  for (const [l, row] of matrix.grid.entries()) {
    assert.equal(row.length, 5);
    for (const [i, severity] of row.entries()) {
      assert.equal(severity, severityFor(l + 1, i + 1), `grid[${l}][${i}]`);
    }
  }
  assert.deepEqual(matrix.likelihood.map((l) => l.value), [1, 2, 3, 4, 5]);
  assert.deepEqual(matrix.impact.map((i) => i.value), [1, 2, 3, 4, 5]);
  assert.equal(matrix.likelihood.length, LIKELIHOOD_LEVELS.length);
  assert.equal(matrix.impact.length, IMPACT_LEVELS.length);
});

test('a level is a whole number from 1 to 5, or nothing', () => {
  assert.equal(levelOf(3), 3);
  assert.equal(levelOf('4'), 4);
  assert.equal(levelOf(0), null);
  assert.equal(levelOf(6), null);
  assert.equal(levelOf(2.5), null);
  assert.equal(levelOf('High'), null);
  assert.equal(levelOf(''), null);
  assert.equal(levelOf(undefined), null);
  assert.equal(levelOf(null), null);
});
