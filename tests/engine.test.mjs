import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UINT64_MAX, modPow, traceModPow, gcd, modInverse, isPrime,
  fermatTest, buildKey, rsaRoundTrip,
} from '../src/engine.js';

test('square-and-multiply matches independent repeated multiplication', () => {
  for (let base = -9n; base <= 13n; base++) {
    for (let modulus = 1n; modulus <= 31n; modulus++) {
      let expected = 1n % modulus;
      for (let exponent = 0n; exponent < 17n; exponent++) {
        assert.equal(modPow(base, exponent, modulus), expected);
        expected = ((expected * base) % modulus + modulus) % modulus;
      }
    }
  }
});

test('power corner cases include modulo one and negative bases', () => {
  assert.equal(modPow(0n, 0n, 7n), 1n);
  assert.equal(modPow(999n, 0n, 1n), 0n);
  assert.equal(modPow(-2n, 5n, 13n), 7n);
  assert.equal(modPow(UINT64_MAX - 1n, 2n, UINT64_MAX), 1n);
  assert.equal(modPow(4n, 13n, 497n), 445n);
});

test('power validates mathematical and exact-integer inputs', () => {
  assert.throws(() => modPow(2n, -1n, 7n), /negative/);
  assert.throws(() => modPow(2n, 2n, 0n), /positive/);
  assert.throws(() => modPow(2n, 2n, -7n), /positive/);
  assert.throws(() => modPow(2, 2n, 7n), /BigInt/);
});

test('trace consumes low bits and records every state transition', () => {
  const trace = traceModPow(4n, 13n, 497n);
  assert.equal(trace.result, 445n);
  assert.deepEqual(trace.steps.map(step => step.bit), [1, 0, 1, 1]);
  let expected = { accumulator: 1n, base: 4n, exponent: 13n };
  for (const step of trace.steps) {
    assert.equal(step.accumulatorBefore, expected.accumulator);
    assert.equal(step.baseBefore, expected.base);
    assert.equal(step.exponentBefore, expected.exponent);
    assert.equal(step.multiplied, step.bit === 1);
    assert.equal(step.accumulatorAfter, step.bit ? expected.accumulator * expected.base % 497n : expected.accumulator);
    assert.equal(step.baseAfter, expected.base ** 2n % 497n);
    assert.equal(step.exponentAfter, expected.exponent / 2n);
    expected = { accumulator: step.accumulatorAfter, base: step.baseAfter, exponent: step.exponentAfter };
  }
  assert.equal(expected.exponent, 0n);
  assert.deepEqual(traceModPow(7n, 0n, 1n), { result: 0n, steps: [] });
});

test('Euclid handles signs and zero', () => {
  assert.equal(gcd(0n, 0n), 0n);
  assert.equal(gcd(-54n, 24n), 6n);
  assert.equal(gcd(0n, -13n), 13n);
  assert.equal(gcd(17n, 3120n), 1n);
});

test('modular inverses satisfy the identity across coprime inputs', () => {
  assert.equal(modInverse(17n, 3120n), 2753n);
  assert.equal(modInverse(-3n, 11n), 7n);
  for (let modulus = 2n; modulus < 100n; modulus++) {
    for (let value = 1n; value < modulus; value++) {
      if (gcd(value, modulus) === 1n) {
        const inverse = modInverse(value, modulus);
        assert.equal(value * inverse % modulus, 1n);
        assert.ok(inverse >= 0n && inverse < modulus);
      } else assert.throws(() => modInverse(value, modulus), /coprime/);
    }
  }
  assert.throws(() => modInverse(3n, 1n), /exceed 1/);
});

test('deterministic primality agrees with an independent sieve through 100,000', () => {
  const composite = new Uint8Array(100001);
  composite[0] = composite[1] = 1;
  for (let p = 2; p * p < composite.length; p++) {
    if (composite[p]) continue;
    for (let multiple = p * p; multiple < composite.length; multiple += p) composite[multiple] = 1;
  }
  for (let n = 0; n < composite.length; n++) assert.equal(isPrime(BigInt(n)), !composite[n], `n=${n}`);
});

test('Miller–Rabin rejects difficult pseudoprimes and covers uint64 boundaries', () => {
  for (const n of [341n, 561n, 1105n, 1729n, 3215031751n, 341550071728321n, 3825123056546413051n, UINT64_MAX]) {
    assert.equal(isPrime(n), false, `${n}`);
  }
  for (const n of [73n, 193n, 407521n, 299210837n, 4294967291n, 18446744073709551557n]) {
    assert.equal(isPrime(n), true, `${n}`);
  }
  assert.equal(isPrime(-1n), false);
  assert.throws(() => isPrime(UINT64_MAX + 1n), /64-bit/);
});

test('Fermat exposes a base-2 pseudoprime and a Carmichael number', () => {
  assert.equal(fermatTest(341n, [2n]).probablePrime, true);
  assert.equal(fermatTest(341n, [2n, 3n]).probablePrime, false);
  assert.equal(fermatTest(561n, [2n, 5n, 7n]).probablePrime, true);
  const sharedFactor = fermatTest(561n, [3n]);
  assert.equal(sharedFactor.probablePrime, false);
  assert.notEqual(sharedFactor.results[0].residue, 1n);
  assert.equal(fermatTest(97n, [2n, 3n, 5n, 96n]).probablePrime, true);
});

test('Fermat special cases and explicit-base validation are unambiguous', () => {
  assert.equal(fermatTest(1n, []).probablePrime, false);
  assert.equal(fermatTest(2n, []).probablePrime, true);
  assert.equal(fermatTest(3n, [2n]).probablePrime, true);
  for (const bases of [[], [1n], [0n], [-2n], [97n]]) {
    assert.throws(() => fermatTest(97n, bases), RangeError);
  }
  assert.throws(() => fermatTest(UINT64_MAX + 1n, [2n]), /64-bit/);
});

test('textbook RSA matches the classic 61 × 53 example', () => {
  assert.deepEqual(buildKey(61n, 53n, 17n), { p: 61n, q: 53n, n: 3233n, phi: 3120n, e: 17n, d: 2753n });
  const result = rsaRoundTrip({ p: 61n, q: 53n, e: 17n, message: 65n });
  assert.equal(result.cipher, 2790n);
  assert.equal(result.recovered, 65n);
  assert.equal(result.encryptSteps.at(-1).accumulatorAfter, result.cipher);
  assert.equal(result.decryptSteps.at(-1).accumulatorAfter, result.recovered);
});

test('RSA recovers every residue including zero and messages sharing a prime factor', () => {
  for (const [p, q, e] of [[5n, 11n, 3n], [2n, 5n, 3n], [17n, 19n, 5n]]) {
    for (let message = 0n; message < p * q; message++) {
      assert.equal(rsaRoundTrip({ p, q, e, message }).recovered, message);
    }
  }
});

test('RSA rejects invalid primes, exponent and message domain', () => {
  assert.throws(() => buildKey(61n, 61n, 17n), /distinct/);
  assert.throws(() => buildKey(561n, 53n, 17n), /prime/);
  assert.throws(() => buildKey(1n, 53n, 17n), /prime/);
  assert.throws(() => buildKey(61n, 53n, 12n), /coprime/);
  assert.throws(() => buildKey(61n, 53n, 1n), /greater than 1/);
  assert.throws(() => buildKey(61n, 53n, 3120n), /smaller/);
  for (const message of [-1n, 3233n]) {
    assert.throws(() => rsaRoundTrip({ p: 61n, q: 53n, e: 17n, message }), /Message/);
  }
});

test('RSA operates exactly above the JavaScript safe-integer range', () => {
  const result = rsaRoundTrip({ p: 4294967291n, q: 4294967279n, e: 65537n, message: 9007199254740993n });
  assert.equal(result.recovered, 9007199254740993n);
  assert.ok(result.key.n > BigInt(Number.MAX_SAFE_INTEGER));
});
