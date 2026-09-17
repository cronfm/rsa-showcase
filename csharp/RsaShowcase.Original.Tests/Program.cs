using System.Globalization;
using System.Numerics;
using System.Text.Json;
using System.Text.Json.Serialization;
using RSA;

if (args is ["--replay"])
{
    var options = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
    options.Converters.Add(new UInt64StringConverter());
    options.Converters.Add(new UInt128StringConverter());
    while (Console.ReadLine() is { } line)
    {
        if (string.IsNullOrWhiteSpace(line)) continue;
        using var document = JsonDocument.Parse(line);
        var input = document.RootElement;
        var n = ulong.Parse(input.GetProperty("n").GetString()!, CultureInfo.InvariantCulture);
        var rounds = input.GetProperty("rounds").GetInt32();
        var entropy = input.GetProperty("entropy")
            .EnumerateArray()
            .Select(value => ulong.Parse(value.GetString()!, CultureInfo.InvariantCulture))
            .ToArray();
        Console.WriteLine(JsonSerializer.Serialize(EntropyReplay.Run(n, rounds, entropy), options));
    }
    return;
}

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

Check("The unchanged original PrimeTest handles its early guards", () =>
{
    foreach (var rounds in new[] { -5, 0, 1, 64 })
    {
        Equal(PrimeTest.IsNotPrime(0, rounds), true);
        Equal(PrimeTest.IsNotPrime(1, rounds), true);
        Equal(PrimeTest.IsNotPrime(2, rounds), false);
        Equal(PrimeTest.IsNotPrime(3, rounds), false);
        Equal(PrimeTest.IsNotPrime(4, rounds), true);
        Equal(PrimeTest.IsNotPrime(ulong.MaxValue - 1, rounds), true);
    }
});

Check("Actual original random rounds never reject known primes", () =>
{
    // Every possible sampled base is coprime to these primes, so this check
    // does not depend on which random values the original RNG produces.
    ulong[] primes = [5, 7, 11, 53, 61, 97, 104729, 18446744073709551557];
    foreach (var prime in primes)
        Equal(PrimeTest.IsNotPrime(prime, 32), false);
});

Check("Actual original PrimeTest rejects 9 for every possible sampled witness", () =>
{
    // For n=9 the sampler can produce 2..7, none a Fermat liar for 9.
    // This exercises the original private RNG and witness path without flakes.
    foreach (var rounds in new[] { -5, 0, 1, 64 })
        Equal(PrimeTest.IsNotPrime(9, rounds), true);
});

Check("Original UInt128 powers agree with BigInteger for positive exponents", () =>
{
    for (ulong basis = 0; basis < 32; basis++)
    for (ulong modulus = 1; modulus < 40; modulus++)
    for (ulong exponent = 1; exponent < 24; exponent++)
    {
        var actual = ModularExponentiation64.SquareAndMultiply(basis, exponent, modulus);
        var expected = BigInteger.ModPow(basis, exponent, modulus);
        Equal((BigInteger)actual, expected);
    }
});

Check("Original zero-exponent behavior is preserved, including modulus zero and one", () =>
{
    Equal(ModularExponentiation64.SquareAndMultiply(0, 0, 7), (UInt128)1);
    Equal(ModularExponentiation64.SquareAndMultiply(99, 0, 1), (UInt128)1);
    Equal(ModularExponentiation64.SquareAndMultiply(99, 0, 0), (UInt128)1);
    try
    {
        ModularExponentiation64.SquareAndMultiply(2, 1, 0);
        throw new InvalidOperationException("Expected division by zero.");
    }
    catch (DivideByZeroException) { }
});

Check("Original UInt128 arithmetic handles the full UInt64 input domain", () =>
{
    ulong[] values = [0, 1, 2, 4294967291, ulong.MaxValue - 1, ulong.MaxValue];
    foreach (var basis in values)
    foreach (var exponent in values)
    foreach (var modulus in values.Where(value => value > 1))
    {
        var actual = ModularExponentiation64.SquareAndMultiply(basis, exponent, modulus);
        Equal((BigInteger)actual, BigInteger.ModPow(basis, exponent, modulus));
    }
});

Check("Explicit entropy replay preserves the original biased sampler", () =>
{
    var result = EntropyReplay.Run(97, 4, [0, 1, 2, ulong.MaxValue]);
    Equal(string.Join(",", result.Results.Select(value => value.Base)), "2,2,2,63");
    Equal(result.CompletedRounds, 4);
    Equal(result.IsNotPrime, false);
});

Check("Replay exposes the original false-pass and early-stop semantics", () =>
{
    Equal(EntropyReplay.Run(561, 3, [2, 5, 13]).IsNotPrime, false);
    Equal(EntropyReplay.Run(341, 1, [2]).IsNotPrime, false);
    var caught = EntropyReplay.Run(341, 3, [2, 3, 2]);
    Equal(caught.IsNotPrime, true);
    Equal(caught.CompletedRounds, 2);
    Equal(caught.Results[1].Base, (ulong)3);
});

Console.WriteLine($"All {passed} original C# regression groups passed.");

// This adapter deliberately does NOT claim to replay PrimeTest's private RNG.
// It transcribes the unchanged GetRandomBase formula and early-exit policy,
// then invokes the actual original UInt128 power method for every witness.
// Separate tests above execute the actual original PrimeTest.IsNotPrime method.
internal static class EntropyReplay
{
    public static ReplayResult Run(ulong n, int rounds, IReadOnlyList<ulong> entropy)
    {
        if (rounds > 64) throw new ArgumentOutOfRangeException(nameof(rounds));
        var effectiveRounds = Math.Max(1, rounds);
        var results = new List<ReplayWitness>();
        ReplayResult Finish(bool isNotPrime, string reason) => new(
            isNotPrime, !isNotPrime, results, reason, effectiveRounds, results.Count);
        if (n is 2 or 3)
            return Finish(false, "The original early guard recognizes 2 and 3 as prime.");
        if (n <= 1 || n % 2 == 0)
            return Finish(true, "The original early guard rejects values below 2 and even composites.");
        for (var index = 0; index < effectiveRounds; index++)
        {
            if (index >= entropy.Count) throw new ArgumentException("Replay entropy exhausted.");
            var basis = Math.Max(entropy[index] % (n - 1), 2UL);
            var residue = ModularExponentiation64.SquareAndMultiply(basis, n - 1, n);
            var passes = residue == 1;
            results.Add(new ReplayWitness(index + 1, basis, residue, passes));
            if (!passes)
                return Finish(true, "A Fermat witness detected a composite; the original test stops immediately.");
        }
        return Finish(false, "No sampled witness detected a composite. This is not a proof of primality.");
    }
}

internal sealed record ReplayWitness(int Round, ulong Base, UInt128 Residue, bool Passes);
internal sealed record ReplayResult(
    bool IsNotPrime, bool ProbablePrime, IReadOnlyList<ReplayWitness> Results,
    string Reason, int EffectiveRounds, int CompletedRounds);

internal sealed class UInt64StringConverter : JsonConverter<ulong>
{
    public override ulong Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
        => ulong.Parse(reader.GetString()!, CultureInfo.InvariantCulture);
    public override void Write(Utf8JsonWriter writer, ulong value, JsonSerializerOptions options)
        => writer.WriteStringValue(value.ToString(CultureInfo.InvariantCulture));
}

internal sealed class UInt128StringConverter : JsonConverter<UInt128>
{
    public override UInt128 Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
        => UInt128.Parse(reader.GetString()!, CultureInfo.InvariantCulture);
    public override void Write(Utf8JsonWriter writer, UInt128 value, JsonSerializerOptions options)
        => writer.WriteStringValue(value.ToString(CultureInfo.InvariantCulture));
}
