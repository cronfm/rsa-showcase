# PRIME / RSA lab

[Open the playground](https://rsa.cronfm.com/) · [Case study](https://cronfm.com/work/rsa) · [C# source](csharp/RsaShowcase.Core)

An interactive number-theory showcase by Frederik Cronjé, adapted from the C# arithmetic and prime-verification experiments in the private `RSA` repository.

## Explore

- **RSA studio:** choose distinct primes, derive a public/private key pair, and trace integer encryption and decryption one exponent bit at a time.
- **Primality lab:** compare explicit-base Fermat testing with deterministic Miller–Rabin over the unsigned 64-bit range. Try `561` with bases `2, 5, 13`, then add `3` to expose the composite.
- **Prime atlas:** explore 10,000 independently verified primes from a CC0 Kaggle dataset; select one for the studio or download the subset.
- **C# source:** syntax-highlighted source is generated from the actual compiled `.NET 10` library. It is not separately maintained example text.

This is an educational implementation of **textbook RSA**, using public small primes and unpadded integer messages. It is variable-time and unsuitable for protecting secrets. Real cryptographic applications should use established libraries and standard schemes. [RFC 8017](https://www.rfc-editor.org/rfc/rfc8017.html) describes RSA primitives and encryption/signature schemes.

## Implementation

The original experiment used recursive square-and-multiply with `UInt128` intermediates, random Fermat witnesses, and an asynchronous PostgreSQL prime-verification harness. The public edition extracts the mathematical ideas into a dependency-free core:

- `ModularExponentiation.cs`: iterative square-and-multiply, exact `BigInteger` arithmetic, and trace records; handles exponent zero and modulus one.
- `NumberTheory.cs`: GCD and extended Euclidean modular inverse.
- `Primality.cs`: explicit Fermat bases, plus the seven-base deterministic Miller–Rabin set for `n < 2^64` ([witness-set reference](https://miller-rabin.appspot.com/)).
- `RsaWorkbench.cs`: prime/key validation and an integer RSA round trip.

The web playground runs JavaScript `BigInt` locally in the browser. Cloudflare Workers serves its static assets; the server does **not** run the C# library. The C# CLI and browser engine are compared by cross-language parity checks, including the entire calculation trace.

No database, account, private connection string, or original repository history is needed. The original `RSA` repository remains private.

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
npm run test:parity
```

Set `DOTNET_EXE` to a specific `dotnet` executable if it is not on your PATH. The regression harness checks modular powers against `BigInteger.ModPow`, primality against an independent sieve, pseudoprimes, unsigned 64-bit boundaries, invalid inputs, and RSA messages that share a factor with the modulus.

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
