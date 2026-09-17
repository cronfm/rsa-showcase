// Exact-integer algorithms for the educational RSA workbench.
// These routines are variable-time and use textbook RSA without padding.
export const UINT64_MAX = (1n << 64n) - 1n;
export const MILLER_RABIN_BASES = Object.freeze([
  2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n,
]);

function requireBigInt(value, name) {
  if (typeof value !== 'bigint') throw new TypeError(`${name} must be a BigInt.`);
}

function normalize(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function exponentiate(base, exponent, modulus, steps) {
  requireBigInt(base, 'Base');
  requireBigInt(exponent, 'Exponent');
  requireBigInt(modulus, 'Modulus');
  if (modulus <= 0n) throw new RangeError('Modulus must be positive.');
  if (exponent < 0n) throw new RangeError('Exponent cannot be negative.');

  let accumulator = 1n % modulus;
  let currentBase = normalize(base, modulus);
  let remaining = exponent;
  while (remaining > 0n) {
    const bit = Number(remaining & 1n);
    const accumulatorAfter = bit === 1
      ? (accumulator * currentBase) % modulus
      : accumulator;
    const baseAfter = (currentBase * currentBase) % modulus;
    const exponentAfter = remaining >> 1n;
    if (steps) steps.push({
      bit,
      exponentBefore: remaining,
      accumulatorBefore: accumulator,
      baseBefore: currentBase,
      multiplied: bit === 1,
      accumulatorAfter,
      baseAfter,
      exponentAfter,
    });
    accumulator = accumulatorAfter;
    currentBase = baseAfter;
    remaining = exponentAfter;
  }
  return accumulator;
}

export function modPow(base, exponent, modulus) {
  return exponentiate(base, exponent, modulus);
}

export function traceModPow(base, exponent, modulus) {
  const steps = [];
  return { result: exponentiate(base, exponent, modulus, steps), steps };
}

export function gcd(a, b) {
  requireBigInt(a, 'First operand');
  requireBigInt(b, 'Second operand');
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function modInverse(value, modulus) {
  requireBigInt(value, 'Value');
  requireBigInt(modulus, 'Modulus');
  if (modulus <= 1n) throw new RangeError('Inverse modulus must exceed 1.');
  let [oldR, r] = [modulus, normalize(value, modulus)];
  let [oldT, t] = [0n, 1n];
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldT, t] = [t, oldT - quotient * t];
  }
  if (oldR !== 1n) throw new RangeError('No modular inverse: values are not coprime.');
  return normalize(oldT, modulus);
}

export function isPrime(n) {
  requireBigInt(n, 'Candidate');
  if (n < 2n) return false;
  if (n > UINT64_MAX) throw new RangeError('Primality is limited to unsigned 64-bit integers.');
  if (n === 2n || n === 3n) return true;
  if (n % 2n === 0n) return false;

  let d = n - 1n;
  let powersOfTwo = 0;
  while (d % 2n === 0n) { d >>= 1n; powersOfTwo++; }

  // Jim Sinclair's seven bases cover n < 2^64: miller-rabin.appspot.com.
  for (const witness of MILLER_RABIN_BASES) {
    const base = witness % n;
    if (base === 0n) continue;
    let residue = modPow(base, d, n);
    if (residue === 1n || residue === n - 1n) continue;
    let passed = false;
    for (let round = 1; round < powersOfTwo; round++) {
      residue = (residue * residue) % n;
      if (residue === n - 1n) { passed = true; break; }
    }
    if (!passed) return false;
  }
  return true;
}

export function fermatTest(n, bases) {
  requireBigInt(n, 'Candidate');
  if (n > UINT64_MAX) throw new RangeError('Primality is limited to unsigned 64-bit integers.');
  if (!Array.isArray(bases)) throw new TypeError('Bases must be an array of BigInts.');
  for (const base of bases) requireBigInt(base, 'Fermat base');
  if (n < 2n) return { probablePrime: false, results: [], reason: 'Integers below 2 are not prime.' };
  if (n === 2n) return { probablePrime: true, results: [], reason: '2 is prime; no witness is needed.' };
  if (bases.length === 0) throw new RangeError('Choose at least one Fermat base.');
  if (bases.some(base => base < 2n || base >= n)) {
    throw new RangeError('Each Fermat base must be at least 2 and smaller than the candidate.');
  }
  const results = bases.map(base => {
    const residue = modPow(base, n - 1n, n);
    return { base, residue, passes: residue === 1n };
  });
  return { probablePrime: results.every(result => result.passes), results };
}

export function buildKey(p, q, e) {
  requireBigInt(p, 'p');
  requireBigInt(q, 'q');
  requireBigInt(e, 'e');
  if (!isPrime(p) || !isPrime(q)) throw new RangeError('p and q must both be prime.');
  if (p === q) throw new RangeError('Choose two distinct primes.');
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  if (e <= 1n || e >= phi) throw new RangeError('e must be greater than 1 and smaller than φ(n).');
  if (gcd(e, phi) !== 1n) throw new RangeError('e must be coprime to φ(n).');
  return { p, q, n, phi, e, d: modInverse(e, phi) };
}

export function rsaRoundTrip({ p, q, e, message }) {
  requireBigInt(message, 'Message');
  const key = buildKey(p, q, e);
  if (message < 0n || message >= key.n) throw new RangeError('Message must satisfy 0 ≤ m < n.');
  const encryption = traceModPow(message, key.e, key.n);
  const decryption = traceModPow(encryption.result, key.d, key.n);
  return {
    key, cipher: encryption.result, recovered: decryption.result,
    encryptSteps: encryption.steps, decryptSteps: decryption.steps,
  };
}
