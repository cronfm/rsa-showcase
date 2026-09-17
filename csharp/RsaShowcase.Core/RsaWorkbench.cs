using System.Numerics;

namespace RsaShowcase.Core;

public sealed record RsaKey(
    BigInteger P, BigInteger Q, BigInteger N,
    BigInteger Phi, BigInteger E, BigInteger D);

public sealed record RsaRoundTripResult(
    RsaKey Key, BigInteger Cipher, BigInteger Recovered,
    IReadOnlyList<PowerStep> EncryptSteps, IReadOnlyList<PowerStep> DecryptSteps);

// A transparent textbook RSA demonstration. No padding, secret generation,
// or constant-time execution: use a vetted cryptography library for real data.
public static class RsaWorkbench
{
    public static RsaKey BuildKey(BigInteger p, BigInteger q, BigInteger e)
    {
        if (!Primality.IsPrime(p) || !Primality.IsPrime(q))
            throw new ArgumentException("p and q must both be prime.");
        if (p == q)
            throw new ArgumentException("Choose two distinct primes.");

        var n = p * q;
        var phi = (p - 1) * (q - 1);
        if (e <= 1 || e >= phi)
            throw new ArgumentOutOfRangeException(
                nameof(e), "e must be greater than 1 and smaller than φ(n).");
        if (NumberTheory.Gcd(e, phi) != 1)
            throw new ArgumentException("e must be coprime to φ(n).", nameof(e));

        return new RsaKey(p, q, n, phi, e, NumberTheory.ModInverse(e, phi));
    }

    public static RsaRoundTripResult RoundTrip(
        BigInteger p, BigInteger q, BigInteger e, BigInteger message)
    {
        var key = BuildKey(p, q, e);
        if (message < 0 || message >= key.N)
            throw new ArgumentOutOfRangeException(
                nameof(message), "Message must satisfy 0 ≤ m < n.");

        var encryption = ModularExponentiation.TraceModPow(message, key.E, key.N);
        var decryption = ModularExponentiation.TraceModPow(
            encryption.Result, key.D, key.N);
        return new RsaRoundTripResult(
            key, encryption.Result, decryption.Result,
            encryption.Steps, decryption.Steps);
    }
}
