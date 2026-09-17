using System.Numerics;

namespace RsaShowcase.Core;

public sealed record FermatWitness(BigInteger Base, BigInteger Residue, bool Passes);
public sealed record FermatResult(
    bool ProbablePrime, IReadOnlyList<FermatWitness> Results, string? Reason = null);

public static class Primality
{
    // Jim Sinclair's fixed witnesses cover every unsigned 64-bit candidate.
    // Reference: https://miller-rabin.appspot.com/ (20 April 2011 record).
    private static readonly ulong[] Witnesses =
        [2, 325, 9375, 28178, 450775, 9780504, 1795265022];

    public static bool IsPrime(ulong candidate)
    {
        if (candidate < 2) return false;
        if (candidate is 2 or 3) return true;
        if (candidate % 2 == 0) return false;

        var n = new BigInteger(candidate);
        var d = n - 1;
        var powersOfTwo = 0;
        while (d.IsEven)
        {
            d >>= 1;
            powersOfTwo++;
        }

        foreach (var witness in Witnesses)
        {
            var basis = witness % candidate;
            if (basis == 0) continue;
            var residue = ModularExponentiation.ModPow(basis, d, n);
            if (residue == 1 || residue == n - 1) continue;

            var passed = false;
            for (var round = 1; round < powersOfTwo; round++)
            {
                residue = residue * residue % n;
                if (residue != n - 1) continue;
                passed = true;
                break;
            }
            if (!passed) return false;
        }
        return true;
    }

    public static bool IsPrime(BigInteger candidate)
    {
        if (candidate < 2) return false;
        if (candidate > ulong.MaxValue)
            throw new ArgumentOutOfRangeException(
                nameof(candidate), "Primality is limited to unsigned 64-bit integers.");
        return IsPrime((ulong)candidate);
    }

    // Passing Fermat witnesses does not prove primality. Carmichael numbers
    // pass every witness coprime to them, which is an intentional showcase case.
    public static FermatResult FermatTest(
        BigInteger candidate, IReadOnlyList<BigInteger> bases)
    {
        ArgumentNullException.ThrowIfNull(bases);
        if (candidate > ulong.MaxValue)
            throw new ArgumentOutOfRangeException(nameof(candidate));
        if (candidate < 2)
            return new(false, [], "Integers below 2 are not prime.");
        if (candidate == 2)
            return new(true, [], "2 is prime; no witness is needed.");
        if (bases.Count == 0)
            throw new ArgumentException(
                "Choose at least one Fermat base.", nameof(bases));
        if (bases.Any(basis => basis < 2 || basis >= candidate))
            throw new ArgumentException(
                "Each Fermat base must be at least 2 and smaller than the candidate.",
                nameof(bases));

        var results = bases
            .Select(basis =>
            {
                var residue = ModularExponentiation.ModPow(
                    basis, candidate - 1, candidate);
                return new FermatWitness(basis, residue, residue == 1);
            })
            .ToArray();

        return new FermatResult(results.All(result => result.Passes), results);
    }
}
