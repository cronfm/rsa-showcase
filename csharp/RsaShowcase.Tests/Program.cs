using System.Numerics;
using RsaShowcase.Core;

var passed = 0;
void Check(string name, Action test)
{
    test();
    passed++;
    Console.WriteLine($"PASS {name}");
}
void Equal<T>(T actual, T expected) where T : notnull
{
    if (!EqualityComparer<T>.Default.Equals(actual, expected))
        throw new InvalidOperationException($"Expected {expected}, got {actual}.");
}
void Reject(Action action)
{
    try { action(); }
    catch (ArgumentException) { return; }
    throw new InvalidOperationException("Expected input to be rejected.");
}
BigInteger B(string value) => BigInteger.Parse(value);

Check("ModPow agrees with the .NET BigInteger oracle over signed bases", () =>
{
    for (var basis = -15; basis <= 20; basis++)
    for (var modulus = 1; modulus <= 41; modulus++)
    for (var exponent = 0; exponent < 25; exponent++)
    {
        var expected = BigInteger.ModPow(NumberTheory.Normalize(basis, modulus), exponent, modulus);
        Equal(ModularExponentiation.ModPow(basis, exponent, modulus), expected);
    }
});

Check("Modulo one, zero exponent and uint64 products", () =>
{
    Equal(ModularExponentiation.ModPow(0, 0, 7), BigInteger.One);
    Equal(ModularExponentiation.ModPow(99, 0, 1), BigInteger.Zero);
    Equal(ModularExponentiation.ModPow(-2, 5, 13), new BigInteger(7));
    Equal(ModularExponentiation.ModPow(new BigInteger(ulong.MaxValue) - 1, 2, ulong.MaxValue), BigInteger.One);
    Reject(() => ModularExponentiation.ModPow(2, -1, 7));
    Reject(() => ModularExponentiation.ModPow(2, 5, 0));
});

Check("Trace exposes every bit and satisfies the loop invariant", () =>
{
    var trace = ModularExponentiation.TraceModPow(4, 13, 497);
    Equal(trace.Result, new BigInteger(445));
    Equal(string.Join(",", trace.Steps.Select(step => step.Bit)), "1,0,1,1");
    foreach (var step in trace.Steps)
    {
        Equal(step.ExponentAfter, step.ExponentBefore / 2);
        Equal(step.BaseAfter, step.BaseBefore * step.BaseBefore % 497);
        Equal(step.AccumulatorAfter, step.Multiplied
            ? step.AccumulatorBefore * step.BaseBefore % 497
            : step.AccumulatorBefore);
        Equal(step.AccumulatorBefore * BigInteger.ModPow(step.BaseBefore, step.ExponentBefore, 497) % 497,
            trace.Result);
    }
    Equal(ModularExponentiation.TraceModPow(5, 0, 1).Steps.Count, 0);
});

Check("GCD agrees with the .NET oracle including signs and zero", () =>
{
    for (var a = -70; a < 70; a++)
    for (var b = -70; b < 70; b++)
        Equal(NumberTheory.Gcd(a, b), BigInteger.GreatestCommonDivisor(a, b));
});

Check("Extended Euclid produces canonical inverses or rejects noncoprime inputs", () =>
{
    Equal(NumberTheory.ModInverse(17, 3120), new BigInteger(2753));
    Equal(NumberTheory.ModInverse(-3, 11), new BigInteger(7));
    for (var modulus = 2; modulus < 100; modulus++)
    for (var value = 1; value < modulus; value++)
    {
        if (NumberTheory.Gcd(value, modulus) == 1)
            Equal(value * NumberTheory.ModInverse(value, modulus) % modulus, BigInteger.One);
        else Reject(() => NumberTheory.ModInverse(value, modulus));
    }
    Reject(() => NumberTheory.ModInverse(3, 1));
});

Check("Miller-Rabin agrees with an independent sieve through 100,000", () =>
{
    var composite = new bool[100_001];
    composite[0] = composite[1] = true;
    for (var p = 2; p * p < composite.Length; p++)
    {
        if (composite[p]) continue;
        for (var multiple = p * p; multiple < composite.Length; multiple += p)
            composite[multiple] = true;
    }
    for (var n = 0; n < composite.Length; n++)
        Equal(Primality.IsPrime((ulong)n), !composite[n]);
});

Check("Pseudoprimes and the uint64 boundary", () =>
{
    ulong[] composites = [341, 561, 1105, 1729, 3215031751,
        341550071728321, 3825123056546413051, ulong.MaxValue];
    foreach (var n in composites) Equal(Primality.IsPrime(n), false);
    ulong[] primes = [73, 193, 407521, 299210837, 4294967291, 18446744073709551557];
    foreach (var n in primes) Equal(Primality.IsPrime(n), true);
    Equal(Primality.IsPrime(new BigInteger(-1)), false);
    Reject(() => Primality.IsPrime(new BigInteger(ulong.MaxValue) + 1));
});

Check("Fermat explicitly demonstrates pseudoprime and Carmichael traps", () =>
{
    Equal(Primality.FermatTest(341, [2]).ProbablePrime, true);
    Equal(Primality.FermatTest(341, [2, 3]).ProbablePrime, false);
    Equal(Primality.FermatTest(561, [2, 5, 7]).ProbablePrime, true);
    Equal(Primality.FermatTest(561, [3]).ProbablePrime, false);
    Equal(Primality.FermatTest(97, [2, 3, 5, 96]).ProbablePrime, true);
});

Check("Fermat rejects missing or meaningless bases", () =>
{
    Equal(Primality.FermatTest(1, []).ProbablePrime, false);
    Equal(Primality.FermatTest(2, []).ProbablePrime, true);
    Equal(Primality.FermatTest(3, [2]).ProbablePrime, true);
    Reject(() => Primality.FermatTest(97, []));
    Reject(() => Primality.FermatTest(97, [1]));
    Reject(() => Primality.FermatTest(97, [97]));
    Reject(() => Primality.FermatTest(new BigInteger(ulong.MaxValue) + 1, [2]));
});

Check("Classic RSA key and ciphertext", () =>
{
    var result = RsaWorkbench.RoundTrip(61, 53, 17, 65);
    Equal(result.Key, new RsaKey(61, 53, 3233, 3120, 17, 2753));
    Equal(result.Cipher, new BigInteger(2790));
    Equal(result.Recovered, new BigInteger(65));
    Equal(result.EncryptSteps[^1].AccumulatorAfter, result.Cipher);
    Equal(result.DecryptSteps[^1].AccumulatorAfter, result.Recovered);
});

Check("RSA recovers every residue, including values not coprime to n", () =>
{
    (int P, int Q, int E)[] keys = [(5, 11, 3), (2, 5, 3), (17, 19, 5)];
    foreach (var (p, q, e) in keys)
    for (var message = 0; message < p * q; message++)
        Equal(RsaWorkbench.RoundTrip(p, q, e, message).Recovered, new BigInteger(message));
});

Check("RSA validates primes, exponents and message range", () =>
{
    Reject(() => RsaWorkbench.BuildKey(61, 61, 17));
    Reject(() => RsaWorkbench.BuildKey(561, 53, 17));
    Reject(() => RsaWorkbench.BuildKey(1, 53, 17));
    Reject(() => RsaWorkbench.BuildKey(61, 53, 12));
    Reject(() => RsaWorkbench.BuildKey(61, 53, 1));
    Reject(() => RsaWorkbench.BuildKey(61, 53, 3120));
    Reject(() => RsaWorkbench.RoundTrip(61, 53, 17, -1));
    Reject(() => RsaWorkbench.RoundTrip(61, 53, 17, 3233));
});

Check("RSA works above the JavaScript safe-integer range", () =>
{
    var message = B("9007199254740993");
    var result = RsaWorkbench.RoundTrip(B("4294967291"), B("4294967279"), 65537, message);
    Equal(result.Recovered, message);
});

Console.WriteLine($"All {passed} C# regression groups passed.");
