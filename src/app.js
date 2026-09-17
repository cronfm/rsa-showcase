import { rsaRoundTrip, fermatTest, isPrime } from './engine.js';

const $ = (id) => document.getElementById(id);
const fmt = (value) => value.toLocaleString('en-US');
const set = (id, value) => { $(id).textContent = value; };
const integer = (id, label) => {
  const raw = $(id).value.trim();
  if (!/^\d{1,20}$/.test(raw)) throw new Error(`${label} must be a non-negative integer of at most 20 digits.`);
  return BigInt(raw);
};
let roundTrip;
let submittedMessage = 65n;
let traceMode = 'encrypt';
let primes = [];
let atlasOffset = 0;
const pageSize = 60;

function switchTab(name, focus = false) {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(button.dataset.tab).hidden = !active;
    if (active && focus) button.focus();
  });
}
const tabs = [...document.querySelectorAll('[data-tab]')];
tabs.forEach((button, index) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
  button.addEventListener('keydown', (event) => {
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (target !== undefined) { event.preventDefault(); switchTab(tabs[target].dataset.tab, true); }
  });
});

function renderTrace() {
  if (!roundTrip) return;
  const steps = traceMode === 'encrypt' ? roundTrip.encryptSteps : roundTrip.decryptSteps;
  const exponent = traceMode === 'encrypt' ? roundTrip.key.e : roundTrip.key.d;
  const base = traceMode === 'encrypt' ? submittedMessage : roundTrip.cipher;
  set('trace-summary', `${fmt(base)} raised to ${fmt(exponent)}, modulo ${fmt(roundTrip.key.n)}. ${steps.length} steps, reading the exponent from its lowest bit.`);
  const fragment = document.createDocumentFragment();
  steps.forEach((step, index) => {
    const row = document.createElement('tr');
    [index + 1, fmt(step.exponentBefore), String(step.bit), fmt(step.baseBefore), step.multiplied ? 'Multiply & reduce' : 'Keep accumulator', fmt(step.accumulatorAfter)].forEach((value, column) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (column === 2) cell.className = 'bit';
      row.append(cell);
    });
    fragment.append(row);
  });
  $('trace-body').replaceChildren(fragment);
  ['encrypt', 'decrypt'].forEach((mode) => {
    $(`trace-${mode}`).classList.toggle('active', mode === traceMode);
    $(`trace-${mode}`).setAttribute('aria-pressed', String(mode === traceMode));
  });
}
function runRsa() {
  try {
    const p = integer('prime-p', 'Prime p');
    const q = integer('prime-q', 'Prime q');
    const e = integer('public-e', 'Exponent');
    const message = integer('message', 'Message');
    if (p === 2n || q === 2n) throw new Error('Choose two distinct odd primes greater than 2 for this RSA studio.');
    if (p > 1_000_000n || q > 1_000_000n) throw new Error('For this small-number playground, choose primes below 1,000,000.');
    const result = rsaRoundTrip({ p, q, e, message });
    roundTrip = result;
    submittedMessage = message;
    set('rsa-error', '');
    set('modulus-value', fmt(result.key.n));
    set('prime-product', `${fmt(p)} × ${fmt(q)}`);
    set('public-key', `(${fmt(e)}, ${fmt(result.key.n)})`);
    set('private-key', `(${fmt(result.key.d)}, ${fmt(result.key.n)})`);
    set('message-max', fmt(result.key.n - 1n));
    set('plain-value', fmt(message));
    set('cipher-value', fmt(result.cipher));
    set('recovered-value', fmt(result.recovered));
    set('roundtrip-status', result.recovered === message ? 'Round trip verified' : 'Round trip failed');
    set('key-note', `φ(n) = ${fmt(result.key.phi)} · ${fmt(e)} × ${fmt(result.key.d)} ≡ 1 (mod ${fmt(result.key.phi)})`);
    renderTrace();
    return true;
  } catch (error) {
    set('rsa-error', error.message);
    set('roundtrip-status', 'Previous result · check inputs');
    return false;
  }
}
$('rsa-form').addEventListener('submit', (event) => { event.preventDefault(); runRsa(); });
$('rsa-form').addEventListener('input', () => { if (roundTrip) set('roundtrip-status', 'Inputs changed · run to update'); });
['encrypt', 'decrypt'].forEach((mode) => $(`trace-${mode}`).addEventListener('click', () => { traceMode = mode; renderTrace(); }));
const presets = { classic: [61, 53, 17, 65], larger: [101, 113, 17, 65], wide: [1009, 1013, 65537, 2026] };
document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
  ['prime-p', 'prime-q', 'public-e', 'message'].forEach((id, index) => { $(id).value = presets[button.dataset.preset][index]; });
  runRsa();
}));
$('sample-primes').disabled = true;
$('sample-primes').addEventListener('click', () => {
  if (!primes.length) return;
  // Sample only the bundled public dataset. This is a demonstration, not key generation.
  const sample = new Uint32Array(2);
  crypto.getRandomValues(sample);
  const lo = 100;
  const first = lo + sample[0] % (primes.length - lo);
  let second = lo + sample[1] % (primes.length - lo);
  if (second === first) second = second + 1 < primes.length ? second + 1 : lo;
  $('prime-p').value = primes[first]; $('prime-q').value = primes[second];
  $('public-e').value = '65537'; $('message').value = '65';
  runRsa();
});

function runFermat() {
  try {
    const n = integer('candidate', 'Candidate');
    const rawBases = $('bases').value.split(',').map((part) => part.trim());
    if (rawBases.length > 16 || rawBases.some((part) => !/^\d{1,20}$/.test(part))) throw new Error('Enter 1–16 integer bases, separated by commas.');
    const result = fermatTest(n, rawBases.map(BigInt));
    const prime = isPrime(n);
    set('fermat-error', '');
    set('candidate-label', fmt(n));
    set('fermat-verdict', result.results.length === 0 ? 'Trivial check' : result.probablePrime ? 'Passes these bases' : 'Does not pass');
    set('fermat-detail', result.reason || (result.probablePrime ? 'No composite witness found. This is not a proof of primality.' : 'A failed witness rules out primality.'));
    set('exact-verdict', prime ? 'Prime' : n < 2n ? 'Neither prime nor composite' : 'Composite');
    const fragment = document.createDocumentFragment();
    result.results.forEach((witness) => {
      const row = document.createElement('div'); row.className = 'witness-row';
      const equation = document.createElement('span'); equation.textContent = `${witness.base}^${n - 1n} mod ${n} = ${witness.residue}`;
      const verdict = document.createElement('span'); verdict.textContent = witness.passes ? 'Pass' : 'Composite witness';
      row.append(equation, verdict); fragment.append(row);
    });
    $('witness-results').replaceChildren(fragment);
    set('trap-note', !prime && result.probablePrime
      ? `${fmt(n)} fooled all selected bases. ${n === 561n ? '561 = 3 × 11 × 17 is a Carmichael number: every base coprime to 561 passes Fermat. Try adding base 3.' : n === 341n ? '341 = 11 × 31 is a base-2 pseudoprime. Try adding base 3.' : 'Passing Fermat is evidence, not a certificate.'}`
      : prime ? `${fmt(n)} is prime. Every allowed Fermat base passes; the deterministic check confirms it in the supported range.`
      : n < 2n ? 'Primes are integers greater than 1. These values are outside that definition.'
      : `A witness caught ${fmt(n)}. One failed Fermat congruence is enough to rule out primality.`);
  } catch (error) {
    set('fermat-error', error.message);
    set('fermat-verdict', 'Check inputs'); set('exact-verdict', '—');
    set('fermat-detail', 'Enter a valid candidate and witness bases to run both tests.');
    set('candidate-label', '—'); set('trap-note', '');
    $('witness-results').replaceChildren();
  }
}
$('fermat-form').addEventListener('submit', (event) => { event.preventDefault(); runFermat(); });
document.querySelectorAll('[data-candidate]').forEach((button) => button.addEventListener('click', () => {
  $('candidate').value = button.dataset.candidate;
  $('bases').value = button.dataset.candidate === '341' ? '2' : '2, 5, 13';
  runFermat();
}));

function renderAtlas() {
  const end = Math.min(atlasOffset + pageSize, primes.length);
  const fragment = document.createDocumentFragment();
  primes.slice(atlasOffset, end).forEach((prime, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'prime-tile';
    button.textContent = fmt(prime);
    button.setAttribute('aria-label', `Prime ${prime}, rank ${atlasOffset + index + 1}. Use as p.`);
    const rank = document.createElement('small'); rank.textContent = `#${fmt(atlasOffset + index + 1)}`; button.append(rank);
    button.addEventListener('click', () => {
      if (prime === 2) { set('atlas-status', '2 is prime, but this RSA studio uses distinct odd primes. Choose a prime greater than 2.'); return; }
      $('prime-p').value = prime;
      $('prime-q').value = prime === 53 ? 61 : 53;
      $('public-e').value = prime === 3 ? 3 : 17;
      // Find a small valid public exponent for this pair.
      const phi = BigInt(prime - 1) * (BigInt($('prime-q').value) - 1n);
      const gcd = (a, b) => b === 0n ? a : gcd(b, a % b);
      for (const e of [17n, 65537n, 3n, 5n, 7n, 11n]) {
        if (e < phi && gcd(e, phi) === 1n) { $('public-e').value = String(e); break; }
      }
      $('message').value = '65';
      runRsa(); switchTab('studio', true); $('workspace').scrollIntoView({ block: 'start' });
    });
    fragment.append(button);
  });
  $('prime-grid').replaceChildren(fragment);
  set('atlas-range', `${fmt(atlasOffset + 1)}–${fmt(end)} of ${fmt(primes.length)}`);
  $('atlas-prev').disabled = atlasOffset === 0;
  $('atlas-next').disabled = end >= primes.length;
}
function findPrime() {
  if (!primes.length) return;
  const raw = $('atlas-search').value.trim();
  if (!/^\d{1,7}$/.test(raw)) { set('atlas-status', 'Enter a whole number between 0 and 104,729.'); return; }
  const target = Number(raw);
  const index = primes.findIndex((prime) => prime >= target);
  if (index === -1) { set('atlas-status', 'This bundled subset ends at 104,729. The full dataset is linked above.'); return; }
  atlasOffset = index;
  set('atlas-status', `Starting at ${fmt(primes[index])}, prime #${fmt(index + 1)}.`);
  renderAtlas();
}
$('atlas-find').addEventListener('click', findPrime);
$('atlas-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); findPrime(); } });
$('atlas-prev').addEventListener('click', () => { atlasOffset = Math.max(0, atlasOffset - pageSize); set('atlas-status', ''); renderAtlas(); });
$('atlas-next').addEventListener('click', () => { atlasOffset = Math.min(primes.length - 1, atlasOffset + pageSize); set('atlas-status', ''); renderAtlas(); });
async function loadDataset() {
  try {
    const responses = await Promise.all([fetch('./data/primes.json'), fetch('./data/provenance.json')]);
    if (responses.some((response) => !response.ok)) throw new Error('Dataset unavailable');
    const [data, provenance] = await Promise.all(responses.map((response) => response.json()));
    if (!Array.isArray(data) || data.length !== 10000 || data[0] !== 2 || data.at(-1) !== 104729) throw new Error('Dataset invalid');
    primes = data;
    $('sample-primes').disabled = false;
    set('dataset-summary', `${fmt(primes.length)} verified primes · 2 to ${fmt(primes.at(-1))} · Kaggle / CC0`);
    set('dataset-provenance', `From “${provenance.title}” by ${provenance.creator}, version ${provenance.version}, CC0 public domain. The source’s initial 1 was removed. Every imported value was checked against an independent sieve; this is the first 10,000 primes from that dataset.`);
    renderAtlas();
  } catch {
    set('dataset-summary', 'The dataset could not load. You can still enter primes in the RSA studio.');
    set('atlas-status', 'Reload to retry, or open the original dataset on Kaggle.');
    ['atlas-find', 'atlas-prev', 'atlas-next'].forEach((id) => { $(id).disabled = true; });
  }
}
async function loadSource() {
  let current = '';
  try {
    const response = await fetch('./csharp-source.json');
    if (!response.ok) throw new Error('Source unavailable');
    const entries = await response.json();
    if (!entries.length) throw new Error('Source empty');
    $('source-select').replaceChildren();
    entries.forEach((entry) => { const option = document.createElement('option'); option.value = entry.name; option.textContent = entry.label; $('source-select').append(option); });
    const show = () => {
      const entry = entries.find((item) => item.name === $('source-select').value);
      current = entry.code;
      // Only generated, escaped Prism markup from this repository's C# files.
      $('source-code').innerHTML = entry.html;
      set('source-description', entry.description);
      $('source-file-link').href = `https://github.com/cronfm/rsa-showcase/blob/main/${entry.path}`;
      set('source-status', '');
    };
    $('source-select').disabled = false; $('copy-source').disabled = false;
    $('source-select').addEventListener('change', show); show();
    $('copy-source').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(current); set('source-status', 'C# source copied.'); }
      catch { set('source-status', 'Select the code to copy, or open it on GitHub.'); }
    });
  } catch { set('source-code', 'The complete C# project is available on GitHub.'); set('source-description', 'Source preview unavailable. Use the link below to read the implementation.'); }
}
runRsa(); runFermat();
loadDataset(); loadSource();
