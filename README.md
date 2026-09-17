# PRIME / RSA lab

[Open the playground](https://rsa.cronfm.com/) · [Case study](https://cronfm.com/work/rsa) · [Original C# source](csharp/RsaShowcase.Original)

A showcase of Frederik Cronjé’s original probabilistic primality-testing code from the private `RSA` repository. The original source is preserved and compiled; a browser mirror makes its random witness rounds inspectable.

## Explore

- **Fermat test, the default view:** choose a candidate and maximum round count. Fresh random bases follow the original sampler; the test stops at the first failed congruence. `IsNotPrime == false` means no sampled witness rejected the candidate, not proof of primality.
- **Original C# viewer:** opens on `PrimeTest.cs`. Recursive modular exponentiation, asynchronous database sampling and parallel verification are also available, unchanged except for line endings.
- **Inspection tools:** choose explicit bases to reproduce a Fermat pass or failure. A collapsed Miller–Rabin reference check is labeled as an added comparison, not the original algorithm.
- **RSA studio:** an added educational key-building and integer round-trip demonstration with exponentiation traces.
- **Prime atlas:** explore 10,000 independently verified primes from a CC0 Kaggle dataset; select one for the studio or download the subset.

The RSA extension uses **textbook RSA**, public dataset primes and unpadded integer messages. It is variable-time and unsuitable for protecting secrets. [RFC 8017](https://www.rfc-editor.org/rfc/rfc8017.html) describes RSA primitives and encryption/signature schemes.

## Original implementation

[`csharp/RsaShowcase.Original`](csharp/RsaShowcase.Original) contains these original files from commit `945b57287ef5d88f6413d397cc1f8c7a535f2bd7`:

- `PrimeTest.cs`: `PrimeTest.IsNotPrime(ulong x, int rounds)`, `RandomNumberGenerator` witnesses, direct guards and first-witness return.
- `ModularExponentiation.cs`: recursive `ModularExponentiation64.SquareAndMultiply`, with `UInt128` intermediate products.
- `PrimeDBVerifier.cs`: chunked asynchronous sampling and `Parallel.For` verification of primes and composites.
- `PrimeTableChecker.cs`: Npgsql queries and asynchronous streaming with cancellation.

The new `.NET 10` library project compiles these files with the original Npgsql 10.0.1 dependency. [`csharp/original-provenance.json`](csharp/original-provenance.json) records origin paths, commit and LF-normalized SHA-256 digests. Every site build checks their identity. Original comments, control flow and edge cases are retained.

The sampler computes `Math.Max(rawUInt64 % (n - 1), 2)`, so residues 0, 1 and 2 all map to base 2. It is **not uniform sampling**. The browser mirror preserves that behavior and the early return. Its fresh entropy comes from browser `crypto.getRandomValues`; C# uses `RandomNumberGenerator`. They do not draw the same random sequence. The mirror uses the original little-endian byte interpretation and exact integer arithmetic.

The original power routine also retains `exponent == 0 => 1`, including modulus one. The browser UI limits a run to 1–64 rounds; the original C# still uses `Math.Max(1, rounds)` without that UI limit.

The original database harness needs its database and `primeutil` SQL functions to run; those are not included. No original entry-point configuration, connection details or user secrets are published. The standalone Fermat test and modular exponentiation need no database. The private `RSA` repository remains unchanged.

## Playground extensions

[`csharp/RsaShowcase.Core`](csharp/RsaShowcase.Core) holds the separately labeled additions:

- `ModularExponentiation.cs`: iterative square-and-multiply, exact `BigInteger` arithmetic, and trace records; handles exponent zero and modulus one.
- `NumberTheory.cs`: GCD and extended Euclidean modular inverse.
- `Primality.cs`: explicit Fermat bases, plus the seven-base deterministic Miller–Rabin set for `n < 2^64` ([witness-set reference](https://miller-rabin.appspot.com/)).
- `RsaWorkbench.cs`: prime/key validation and an integer RSA round trip.

Cloudflare Workers serves the static site. Browser calculations use JavaScript `BigInt`; the website does not execute .NET. The original method’s browser mirror is in `src/original-fermat.js`, while the added studio/comparison engine is in `src/engine.js`. The added C# CLI and browser engine have cross-language parity checks, including full traces.

## Run locally

Requires Node.js 22+ and, for C# checks, .NET SDK 10.

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4174`. The build copies `src/` into `dist/`, verifies dataset checksums, and exports highlighted C# sources.

```sh
npm test
dotnet build csharp/RsaShowcase.slnx -c Release
dotnet run --project csharp/RsaShowcase.Tests -c Release --no-build
dotnet run --project csharp/RsaShowcase.Original.Tests -c Release --no-build
npm run test:parity
npm run test:original-parity
```

Set `DOTNET_EXE` to a specific `dotnet` executable if it is not on your PATH. Regression checks cover the actual original methods, source identity, injected-entropy witness sequences, early exits and original edge cases. The extension checks cover powers, primality, pseudoprimes, unsigned 64-bit boundaries and RSA round trips.

The CLI reads one JSON request per line and emits one JSON result per line. Integer values are strings, preserving precision:

```json
{"operation":"roundtrip","p":"61","q":"53","e":"17","message":"65"}
```

Run it with `dotnet run --project csharp/RsaShowcase.Cli -c Release --no-build`.

## Dataset and provenance

Source: **[First Million Primes](https://www.kaggle.com/datasets/brandonconrady/first-million-primes)** by **Brandon Conrady**, Kaggle version **1**, **[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)**.

The original `primes.csv` begins with `1`, which is not prime. We discard that row and retain the next 10,000 numbers, then compare every imported value with an independent Eratosthenes sieve. The verified subset contains exactly all primes from **2 through 104,729**, in ascending order, without duplicates or omissions. The rest of the original dataset has not been audited by this project.

- [`src/data/primes.json`](src/data/primes.json) — compact numeric array.
- [`src/data/primes.csv`](src/data/primes.csv) — one-column downloadable equivalent.
- [`src/data/provenance.json`](src/data/provenance.json) — source/version URLs, transformation, validation and SHA-256 checksums.
- [`scripts/import-kaggle.ps1`](scripts/import-kaggle.ps1) — reproduce the import with PowerShell 7.

## Hosting

`wrangler.jsonc` targets the `rsa-showcase` Cloudflare Worker and `rsa.cronfm.com` custom domain. To deploy in your own account, change the account and route first, then run `npm run deploy`. For the author's existing authenticated profile: `npm run build` followed by `npx wrangler deploy --profile cronfm`.

## License

The code is available under the **[MIT license](LICENSE)**, copyright 2026 Frederik Cronjé. The imported prime dataset is separately **CC0 1.0**, as recorded in its provenance. Third-party packages retain their own licenses.
