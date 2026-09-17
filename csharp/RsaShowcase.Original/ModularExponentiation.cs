namespace RSA;

public static class ModularExponentiation64
{
    public static UInt128 SquareAndMultiply(ulong x, ulong y, ulong m)
    {
        if (y == 0) return 1;

        if (y % 2 == 1)
            return SquareAndMultiply(x, y - 1, m) * x % m;
        
        var a = SquareAndMultiply(x, y / 2, m);
        return a * a % m;
    }
}