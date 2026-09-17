import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('imported Kaggle subset exactly matches an independent sieve', async () => {
  const primes = JSON.parse(await readFile(new URL('../src/data/primes.json', import.meta.url), 'utf8'));
  const composite = new Uint8Array(104730);
  for (let p = 2; p * p < composite.length; p++) {
    if (!composite[p]) for (let n = p * p; n < composite.length; n += p) composite[n] = 1;
  }
  const expected = [];
  for (let n = 2; n < composite.length; n++) if (!composite[n]) expected.push(n);
  assert.equal(primes.length, 10000);
  assert.deepEqual(primes, expected);
});
