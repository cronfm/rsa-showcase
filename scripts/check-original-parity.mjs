import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { originalFermatTest } from '../src/original-fermat.js';

const dotnet = process.env.DOTNET_EXE || process.env.DOTNET_PATH || 'dotnet';
const dll = fileURLToPath(new URL('../csharp/RsaShowcase.Original.Tests/bin/Release/net10.0/RsaShowcase.Original.Tests.dll', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
const serialize = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item);
const max = (1n << 64n) - 1n;
const fixtures = [];
for (const n of [0n, 1n, 2n, 3n, 4n, 5n, 9n, 97n, 341n, 561n, 1105n, 1729n, 104729n,
  3215031751n, 341550071728321n, 18446744073709551557n, max - 1n, max]) {
  for (const rounds of [-5, 0, 1, 4, 8, 64]) {
    const pattern = [0n, 1n, 2n, 3n, 5n, 13n, max, max - 2n];
    fixtures.push({ n, rounds, entropy: Array.from({length: 64}, (_, index) => pattern[index % pattern.length]) });
  }
}
fixtures.push({n: 561n, rounds: 3, entropy: [2n, 5n, 13n]});
fixtures.push({n: 341n, rounds: 4, entropy: [2n, 2n, 3n, 5n]});
const expected = fixtures.map(input => {
  let position = 0;
  return originalFermatTest(input.n, input.rounds, () => {
    assert.ok(position < input.entropy.length, 'Entropy exhausted.');
    return input.entropy[position++];
  });
});
const result = spawnSync(dotnet, [dll, '--replay'], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  input: fixtures.map(serialize).join('\n') + '\n',
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || 'Build the original C# regression project in Release first.');
const actual = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
assert.deepStrictEqual(actual, JSON.parse(serialize(expected)));
console.log(`Original mirror agrees on ${fixtures.length} explicit entropy replays using the original sampler formula and actual C# UInt128 power routine.`);
console.log('This replays supplied entropy; it does not claim to reproduce the private RNG inside PrimeTest. Separate C# regressions execute PrimeTest itself.');
