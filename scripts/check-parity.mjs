import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  modPow, traceModPow, gcd, modInverse, isPrime, fermatTest, buildKey, rsaRoundTrip,
} from '../src/engine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dotnet = process.env.DOTNET_EXE || process.env.DOTNET_PATH || 'dotnet';
const dll = fileURLToPath(new URL('../csharp/RsaShowcase.Cli/bin/Release/net10.0/RsaShowcase.Cli.dll', import.meta.url));
const serialize = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item);
const fixtures = [];
const add = (operation, fields) => fixtures.push({ operation, ...fields });
let seed = 20260917;
function next(max) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % max;
}

for (let i = 0; i < 200; i++) {
  add('power', { base: BigInt(next(2000001) - 1000000), exponent: BigInt(next(65536)), modulus: BigInt(next(1000000) + 1) });
  add('gcd', { a: BigInt(next(2000001) - 1000000), b: BigInt(next(2000001) - 1000000) });
  const modulus = BigInt(next(100000) + 2);
  const value = BigInt(next(200001) - 100000);
  if (gcd(value, modulus) === 1n) add('inverse', { value, modulus });
  add('prime', { n: BigInt(next(1000000000)) });
}
for (const n of [-1n, 0n, 1n, 2n, 3n, 4n, 73n, 193n, 341n, 561n, 407521n, 299210837n,
  4294967291n, 341550071728321n, 3825123056546413051n, 18446744073709551557n, 18446744073709551615n]) add('prime', { n });
for (const n of [3n, 4n, 5n, 9n, 17n, 97n, 341n, 561n, 1105n, 1729n, 3215031751n]) {
  for (const bases of [[2n], [2n, 3n, 5n, 7n].filter(base => base < n), [n - 1n]]) add('fermat', { n, bases });
}
add('fermat', { n: 0n, bases: [] });
add('fermat', { n: 2n, bases: [] });
for (const [base, exponent, modulus] of [[0n, 0n, 1n], [-2n, 5n, 13n], [4n, 13n, 497n],
  [18446744073709551614n, 18446744073709551615n, 18446744073709551615n]]) add('power', { base, exponent, modulus });
for (const [p, q, e] of [[61n, 53n, 17n], [2n, 5n, 3n], [101n, 113n, 17n],
  [9973n, 10007n, 65537n], [4294967291n, 4294967279n, 65537n]]) {
  add('key', { p, q, e });
  for (const message of [0n, 1n, p, q, p * q - 1n, BigInt(next(1000000)) % (p * q)]) add('roundtrip', { p, q, e, message });
}

const expected = fixtures.map(input => {
  switch (input.operation) {
    case 'power': {
      const trace = traceModPow(input.base, input.exponent, input.modulus);
      assert.equal(trace.result, modPow(input.base, input.exponent, input.modulus));
      return trace;
    }
    case 'gcd': return gcd(input.a, input.b);
    case 'inverse': return modInverse(input.value, input.modulus);
    case 'prime': return isPrime(input.n);
    case 'fermat': return fermatTest(input.n, input.bases);
    case 'key': return buildKey(input.p, input.q, input.e);
    case 'roundtrip': return rsaRoundTrip(input);
    default: throw new Error('Unknown operation.');
  }
});
const result = spawnSync(dotnet, [dll], {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  input: fixtures.map(serialize).join('\n') + '\n',
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || 'Build the C# solution in Release before running parity checks.');
const actual = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
assert.deepStrictEqual(actual, JSON.parse(serialize(expected)));
console.log(`C# and JavaScript agree on ${fixtures.length} cases, including complete exponentiation and RSA traces.`);
