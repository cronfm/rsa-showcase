import test from 'node:test';
import assert from 'node:assert/strict';
import { originalFermatTest, originalSampleBase, originalSquareAndMultiply } from '../src/original-fermat.js';

const UINT64_MAX = (1n << 64n) - 1n;
function replay(values) {
  let calls = 0;
  return {
    next() {
      assert.ok(calls < values.length, 'The original early exit should not request extra entropy.');
      return values[calls++];
    },
    get calls() { return calls; },
  };
}

test('original guards consume no entropy and preserve IsNotPrime polarity', () => {
  for (const [n, isNotPrime] of [[0n, true], [1n, true], [2n, false], [3n, false], [4n, true], [UINT64_MAX - 1n, true]]) {
    const random = replay([]);
    const result = originalFermatTest(n, 64, random.next);
    assert.equal(result.isNotPrime, isNotPrime);
    assert.equal(result.probablePrime, !isNotPrime);
    assert.equal(result.completedRounds, 0);
    assert.equal(result.effectiveRounds, 64);
    assert.equal(random.calls, 0);
  }
});

test('original sampler folds raw values zero, one and two onto base two', () => {
  for (const raw of [0n, 1n, 2n, 560n, 561n, 562n]) assert.equal(originalSampleBase(raw, 561n), 2n);
  assert.equal(originalSampleBase(559n, 561n), 559n);
  assert.equal(originalSampleBase(UINT64_MAX, 97n), 63n);
  assert.equal(originalSampleBase(UINT64_MAX, UINT64_MAX), 2n);
  assert.equal(originalSampleBase(UINT64_MAX - 2n, UINT64_MAX), UINT64_MAX - 2n);
});

test('negative or zero rounds still execute one original witness', () => {
  for (const rounds of [-100, -1, 0, 1]) {
    const random = replay([2n]);
    const result = originalFermatTest(97n, rounds, random.next);
    assert.equal(result.effectiveRounds, 1);
    assert.equal(result.completedRounds, 1);
    assert.equal(result.isNotPrime, false);
  }
});

test('the original can miss Carmichael numbers and base-specific pseudoprimes', () => {
  const carmichael = replay([2n, 5n, 13n]);
  const fooled = originalFermatTest(561n, 3, carmichael.next);
  assert.equal(fooled.isNotPrime, false);
  assert.equal(fooled.completedRounds, 3);
  assert.ok(fooled.results.every(result => result.residue === 1n));
  assert.equal(originalFermatTest(341n, 1, () => 2n).isNotPrime, false);
});

test('first failed witness stops the original test immediately', () => {
  const random = replay([2n, 3n]);
  const caught = originalFermatTest(341n, 64, random.next);
  assert.equal(caught.isNotPrime, true);
  assert.equal(caught.completedRounds, 2);
  assert.equal(random.calls, 2);
  assert.deepEqual(caught.results.map(result => [result.round, result.base, result.passes]), [[1, 2n, true], [2, 3n, false]]);
  assert.equal(originalFermatTest(561n, 8, () => 3n).completedRounds, 1);
});

test('original power retains its zero-exponent edge case and recursive arithmetic', () => {
  assert.equal(originalSquareAndMultiply(99n, 0n, 1n), 1n);
  assert.equal(originalSquareAndMultiply(99n, 0n, 0n), 1n);
  assert.throws(() => originalSquareAndMultiply(2n, 1n, 0n), RangeError);
  assert.equal(originalSquareAndMultiply(4n, 13n, 497n), 445n);
  assert.equal(originalSquareAndMultiply(UINT64_MAX - 1n, 2n, UINT64_MAX), 1n);
  assert.equal(originalSquareAndMultiply(UINT64_MAX, UINT64_MAX, UINT64_MAX), 0n);
});

test('original power agrees with repeated multiplication for positive exponents', () => {
  for (let base = 0n; base < 20n; base++) {
    for (let modulus = 1n; modulus < 30n; modulus++) {
      let expected = 1n;
      for (let exponent = 1n; exponent < 20n; exponent++) {
        expected = expected * base % modulus;
        assert.equal(originalSquareAndMultiply(base, exponent, modulus), expected);
      }
    }
  }
});

test('mirror checks UInt64 inputs, entropy values and bounded workload', () => {
  for (const n of [-1n, UINT64_MAX + 1n]) assert.throws(() => originalFermatTest(n, 1), /64-bit/);
  assert.throws(() => originalFermatTest(97, 1), /BigInt/);
  for (const rounds of [65, 1.5, Infinity, NaN]) assert.throws(() => originalFermatTest(97n, rounds), /Rounds/);
  assert.throws(() => originalFermatTest(97n, 1, () => -1n), /64-bit/);
  assert.throws(() => originalFermatTest(97n, 1, () => UINT64_MAX + 1n), /64-bit/);
  assert.throws(() => originalFermatTest(97n, 1, () => 2), /BigInt/);
  assert.throws(() => originalSampleBase(0n, 3n), /at least 5/);
});

test('default browser entropy path returns 64 exact witness results for a prime', () => {
  const result = originalFermatTest(104729n, 64);
  assert.equal(result.isNotPrime, false);
  assert.equal(result.completedRounds, 64);
  assert.ok(result.results.every(({base, residue}) => base >= 2n && base <= 104727n && residue === 1n));
});
