// Browser mirror of cronfm/RSA at 945b57287ef5d88f6413d397cc1f8c7a535f2bd7.
// Preserve the original recursive power routine, witness sampler and early exits.
// The separate engine.js implementation is a showcase extension, not this source.
const UINT64_MAX = (1n << 64n) - 1n;

function requireUInt64(value, name) {
  if (typeof value !== 'bigint') throw new TypeError(`${name} must be a BigInt.`);
  if (value < 0n || value > UINT64_MAX) {
    throw new RangeError(`${name} must fit an unsigned 64-bit integer.`);
  }
}

// The original C# return type is UInt128. Products of two reduced UInt64
// values fit UInt128 exactly, so BigInt reproduces the same arithmetic.
export function originalSquareAndMultiply(x, y, m) {
  requireUInt64(x, 'Base');
  requireUInt64(y, 'Exponent');
  requireUInt64(m, 'Modulus');
  function power(value, exponent, modulus) {
    if (exponent === 0n) return 1n;
    if (exponent % 2n === 1n) {
      return power(value, exponent - 1n, modulus) * value % modulus;
    }
    const a = power(value, exponent / 2n, modulus);
    return a * a % modulus;
  }
  return power(x, y, m);
}

export function originalSampleBase(raw, n) {
  requireUInt64(raw, 'Random value');
  requireUInt64(n, 'Candidate');
  if (n < 5n) throw new RangeError('The original witness sampler requires a candidate of at least 5.');
  // Original call: GetRandomBase(n - 1), then raw % x and Math.Max(r, 2).
  // Values 0, 1 and 2 all map to base 2; this is not uniform sampling.
  const remainder = raw % (n - 1n);
  return remainder < 2n ? 2n : remainder;
}

function browserUInt64() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  // Match BitConverter.ToUInt64 on the original little-endian .NET platform.
  let value = 0n;
  for (let index = 7; index >= 0; index--) value = (value << 8n) | BigInt(bytes[index]);
  return value;
}

export function originalFermatTest(n, rounds = 1, nextUInt64 = browserUInt64) {
  requireUInt64(n, 'Candidate');
  if (!Number.isSafeInteger(rounds) || rounds > 64) {
    throw new RangeError('Rounds must be a safe integer no greater than 64.');
  }
  if (typeof nextUInt64 !== 'function') throw new TypeError('Random source must be a function.');
  const effectiveRounds = Math.max(1, rounds);
  const results = [];
  const finish = (isNotPrime, reason) => ({
    isNotPrime, probablePrime: !isNotPrime, results, reason,
    effectiveRounds, completedRounds: results.length,
  });
  if (n === 2n || n === 3n) {
    return finish(false, 'The original early guard recognizes 2 and 3 as prime.');
  }
  if (n <= 1n || n % 2n === 0n) {
    return finish(true, 'The original early guard rejects values below 2 and even composites.');
  }
  for (let index = 0; index < effectiveRounds; index++) {
    const base = originalSampleBase(nextUInt64(), n);
    const residue = originalSquareAndMultiply(base, n - 1n, n);
    const passes = residue === 1n;
    results.push({ round: index + 1, base, residue, passes });
    if (!passes) return finish(true, 'A Fermat witness detected a composite; the original test stops immediately.');
  }
  return finish(false, 'No sampled witness detected a composite. This is not a proof of primality.');
}
