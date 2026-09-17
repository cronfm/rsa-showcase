import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';

loadLanguages(['csharp']);
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
await cp(new URL('src/', root), new URL('dist/', root), { recursive: true });

const sourceFiles = [
  ['ModularExponentiation', 'ModularExponentiation.cs', 'Square, multiply, reduce', 'BigInteger keeps each product exact before modular reduction. The same square-and-multiply loop produces the visible trace.'],
  ['Primality', 'Primality.cs', 'Fermat & Miller–Rabin', 'Explicit Fermat witnesses make false positives reproducible. A separate deterministic witness set covers the unsigned 64-bit domain.'],
  ['NumberTheory', 'NumberTheory.cs', 'GCD & modular inverse', 'Euclid supplies the coprimality test. Its extended form finds the private exponent.'],
  ['RsaWorkbench', 'RsaWorkbench.cs', 'The RSA round trip', 'Validated prime factors, a public exponent, and an integer message become a traceable educational example.'],
];
const entries = [];
for (const [name, file, label, description] of sourceFiles) {
  const path = `csharp/RsaShowcase.Core/${file}`;
  const code = (await readFile(new URL(path, root), 'utf8')).replaceAll('\r\n', '\n').trimEnd();
  entries.push({ name, label, description, path, code, html: Prism.highlight(code, Prism.languages.csharp, 'csharp') });
}
await writeFile(new URL('dist/csharp-source.json', root), JSON.stringify(entries) + '\n');

const provenance = JSON.parse(await readFile(new URL('src/data/provenance.json', root), 'utf8'));
for (const [file, expected] of [['primes.json', provenance.jsonSha256], ['primes.csv', provenance.csvSha256]]) {
  const bytes = await readFile(new URL(`src/data/${file}`, root));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expected) throw new Error(`Dataset checksum mismatch: ${file}`);
}
console.log(`Built PRIME with ${entries.length} highlighted C# source files and verified dataset checksums.`);
