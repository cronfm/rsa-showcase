using System.Security.Cryptography;

namespace RSA;

public static class PrimeTest
{
    private static readonly RandomNumberGenerator Rng = RandomNumberGenerator.Create();
    
    public static bool IsNotPrime(ulong x, int rounds)
    {
        if (x is 2 or 3) return false;
        if (x <= 1 || x % 2 == 0) return true;

        // Fermat can miss composites
        for (var i = 0; i < Math.Max(1, rounds); i++)
        {
            if (FermatWitnessSaysComposite(x))
                return true;
        }
        return false;
    }

    private static bool FermatWitnessSaysComposite(ulong x)
    {
        var a = GetRandomBase(x - 1);
        var r = ModularExponentiation64.SquareAndMultiply(a, x - 1, x);
        return r != 1;
    }
    
    private static ulong GetRandomBase(ulong x)
    {
        // Choose a in [2, x-2]. Requires x >= 5.
        const ulong min = 2;
        Span<byte> buf = stackalloc byte[8];
        
        Rng.GetBytes(buf);
        var r = BitConverter.ToUInt64(buf) % x;
        return Math.Max(r, min);
    }
}