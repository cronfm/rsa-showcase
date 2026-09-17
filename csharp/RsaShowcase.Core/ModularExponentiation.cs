using System.Numerics;

namespace RsaShowcase.Core;

public sealed record PowerStep(
    int Bit,
    BigInteger ExponentBefore,
    BigInteger AccumulatorBefore,
    BigInteger BaseBefore,
    bool Multiplied,
    BigInteger AccumulatorAfter,
    BigInteger BaseAfter,
    BigInteger ExponentAfter);

public sealed record PowerTrace(BigInteger Result, IReadOnlyList<PowerStep> Steps);

public static class ModularExponentiation
{
    public static BigInteger ModPow(
        BigInteger value, BigInteger exponent, BigInteger modulus)
        => Run(value, exponent, modulus, null);

    public static PowerTrace TraceModPow(
        BigInteger value, BigInteger exponent, BigInteger modulus)
    {
        var steps = new List<PowerStep>();
        var result = Run(value, exponent, modulus, steps);
        return new PowerTrace(result, steps.AsReadOnly());
    }

    // Right-to-left square-and-multiply consumes one exponent bit per step.
    // BigInteger keeps every intermediate product exact, including near 2^64.
    private static BigInteger Run(
        BigInteger value,
        BigInteger exponent,
        BigInteger modulus,
        List<PowerStep>? steps)
    {
        if (modulus <= 0)
            throw new ArgumentOutOfRangeException(
                nameof(modulus), "Modulus must be positive.");
        if (exponent < 0)
            throw new ArgumentOutOfRangeException(
                nameof(exponent), "Exponent cannot be negative.");

        var accumulator = BigInteger.One % modulus;
        var currentBase = NumberTheory.Normalize(value, modulus);
        var remaining = exponent;

        while (remaining > 0)
        {
            var bit = remaining.IsEven ? 0 : 1;
            var accumulatorAfter = bit == 1
                ? accumulator * currentBase % modulus
                : accumulator;
            var baseAfter = currentBase * currentBase % modulus;
            var exponentAfter = remaining >> 1;

            steps?.Add(new PowerStep(
                bit, remaining, accumulator, currentBase, bit == 1,
                accumulatorAfter, baseAfter, exponentAfter));

            accumulator = accumulatorAfter;
            currentBase = baseAfter;
            remaining = exponentAfter;
        }

        return accumulator;
    }
}
