import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';
import './check-original.mjs';

loadLanguages(['csharp']);
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
await cp(new URL('src/', root), new URL('dist/', root), { recursive: true });

const sourceFiles = [
  ['PrimeTest', 'RsaShowcase.Original/PrimeTest.cs', 'PrimeTest.cs · probabilistic Fermat', 'Original source. RandomNumberGenerator supplies each base; IsNotPrime returns at the first failed Fermat congruence. Apart from its direct checks for 2 and 3, false means no composite witness was found, not proof of primality.', 'original'],
  ['OriginalModularExponentiation', 'RsaShowcase.Original/ModularExponentiation.cs', 'ModularExponentiation.cs · UInt128', 'Original source. Recursive square-and-multiply uses UInt128 products. Its original base cases and control flow are preserved.', 'original'],
  ['PrimeDbVerifier', 'RsaShowcase.Original/PrimeDBVerifier.cs', 'PrimeDBVerifier.cs · parallel verification', 'Original source. Asynchronous database samples are read in chunks, then Parallel.For counts detected and missed composites using the probabilistic test.', 'original'],
  ['PrimeTableChecker', 'RsaShowcase.Original/PrimeTableChecker.cs', 'PrimeTableChecker.cs · database sampling', 'Original source. Npgsql streams prime and composite samples with cancellation. Running this database harness requires the original database functions; no connection details are published.', 'original'],
  ['ModularExponentiation', 'RsaShowcase.Core/ModularExponentiation.cs', 'ModularExponentiation.cs · trace extension', 'Playground addition. BigInteger square-and-multiply records the trace used by the RSA studio.', 'extension'],
  ['Primality', 'RsaShowcase.Core/Primality.cs', 'Primality.cs · comparison tools', 'Playground addition. Explicit-base inspection and a deterministic Miller–Rabin reference check for unsigned 64-bit inputs.', 'extension'],
  ['NumberTheory', 'RsaShowcase.Core/NumberTheory.cs', 'NumberTheory.cs · GCD & inverse', 'Playground addition. Euclid supplies the coprimality check and modular inverse for the RSA studio.', 'extension'],
  ['RsaWorkbench', 'RsaShowcase.Core/RsaWorkbench.cs', 'RsaWorkbench.cs · RSA extension', 'Playground addition. Builds an educational integer RSA round trip from validated inputs.', 'extension'],
];
const entries = [];
for (const [name, file, label, description, kind] of sourceFiles) {
  const path = `csharp/${file}`;
  const code = (await readFile(new URL(path, root), 'utf8')).replaceAll('\r\n', '\n').trimEnd();
  entries.push({ name, label, description, path, kind, code, html: Prism.highlight(code, Prism.languages.csharp, 'csharp') });
}
await writeFile(new URL('dist/csharp-source.json', root), JSON.stringify(entries) + '\n');

const provenance = JSON.parse(await readFile(new URL('src/data/provenance.json', root), 'utf8'));
for (const [file, expected] of [['primes.json', provenance.jsonSha256], ['primes.csv', provenance.csvSha256]]) {
  const bytes = await readFile(new URL(`src/data/${file}`, root));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expected) throw new Error(`Dataset checksum mismatch: ${file}`);
}
console.log(`Built PRIME with ${entries.length} highlighted C# source files and verified dataset checksums.`);
