import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('csharp/original-provenance.json', root), 'utf8'));
assert.match(manifest.commit, /^[a-f0-9]{40}$/);
assert.equal(manifest.files.length, 4);
for (const file of manifest.files) {
  const source = (await readFile(new URL(file.path, root), 'utf8')).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const hash = createHash('sha256').update(source).digest('hex');
  assert.equal(hash, file.sha256, `${file.path} no longer matches the recorded original source.`);
}
console.log(`Verified ${manifest.files.length} unchanged original C# sources from RSA commit ${manifest.commit}.`);
