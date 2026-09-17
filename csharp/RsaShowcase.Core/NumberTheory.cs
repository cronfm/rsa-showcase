using System.Numerics;

namespace RsaShowcase.Core;

public static class NumberTheory
{
    public static BigInteger Normalize(BigInteger value, BigInteger modulus)
    {
        if (modulus <= 0)
            throw new ArgumentOutOfRangeException(nameof(modulus));
        return (value % modulus + modulus) % modulus;
    }

    public static BigInteger Gcd(BigInteger a, BigInteger b)
    {
        a = BigInteger.Abs(a);
        b = BigInteger.Abs(b);
        while (b != 0)
            (a, b) = (b, a % b);
        return a;
    }

    // Extended Euclid tracks the coefficient of value, reducing it at the end.
    public static BigInteger ModInverse(BigInteger value, BigInteger modulus)
    {
        if (modulus <= 1)
            throw new ArgumentOutOfRangeException(
                nameof(modulus), "Inverse modulus must exceed 1.");

        var oldR = modulus;
        var r = Normalize(value, modulus);
        var oldT = BigInteger.Zero;
        var t = BigInteger.One;

        while (r != 0)
        {
            var quotient = oldR / r;
            (oldR, r) = (r, oldR - quotient * r);
            (oldT, t) = (t, oldT - quotient * t);
        }

        if (oldR != 1)
            throw new ArgumentException("No modular inverse: values are not coprime.");

        return Normalize(oldT, modulus);
    }
}
