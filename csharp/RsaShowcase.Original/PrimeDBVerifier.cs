using System.Collections.Concurrent;

namespace RSA;

public static class PrimeDbVerifier
{
    public static async Task RunAsync(
        PrimeTableChecker db,
        int primeSamples = 50_000,
        int compositeSamples = 200_000,
        int fermatRounds = 1,
        double compositeOversample = 2.5,
        int chunkSize = 50_000,
        CancellationToken ct = default)
    {
        var maxPrime = await db.GetMaxPrimeAsync(ct);
        if (maxPrime < 3) throw new InvalidOperationException("DB seems empty or invalid.");

        Console.WriteLine($"Max prime in DB: {maxPrime:N0}");

        // 1) Verify primes: DB primes must yield IsNotPrime == false
        long primeChecked = 0;
        long primeFalsePositives = 0;

        await foreach (var chunk in ReadInChunks(db, isPrimeChunk: true, primeSamples, maxPrime, compositeOversample, chunkSize, ct))
        {
            var fp = VerifyChunkFalsePositives(chunk, fermatRounds);
            primeFalsePositives += fp;
            primeChecked += chunk.Length;

            if (primeChecked >= primeSamples) break;
        }

        // 2) Verify composites: DB composites must yield IsNotPrime == true (Fermat may miss some)
        long compositeChecked = 0;
        long compositeDetected = 0;
        long compositeMissed = 0;

        await foreach (var chunk in ReadInChunks(db, isPrimeChunk: false, compositeSamples, maxPrime, compositeOversample, chunkSize, ct))
        {
            var (det, miss) = VerifyChunkComposites(chunk, fermatRounds);
            compositeDetected += det;
            compositeMissed += miss;
            compositeChecked += chunk.Length;

            if (compositeChecked >= compositeSamples) break;
        }

        Console.WriteLine();
        Console.WriteLine($"Prime samples:      {primeChecked:N0}");
        Console.WriteLine($"False positives:    {primeFalsePositives:N0}");
        Console.WriteLine();
        Console.WriteLine($"Composite samples:  {compositeChecked:N0}");
        Console.WriteLine($"Detected composite: {compositeDetected:N0}");
        Console.WriteLine($"Missed composite:   {compositeMissed:N0}");
        Console.WriteLine($"Composite hit-rate: {(compositeChecked == 0 ? 0.0 : (double)compositeDetected / compositeChecked):P4}");
    }

    private static async IAsyncEnumerable<long[]> ReadInChunks(
        PrimeTableChecker db,
        bool isPrimeChunk,
        int totalNeeded,
        long maxPrime,
        double compositeOversample,
        int chunkSize,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        var remaining = totalNeeded;

        while (remaining > 0)
        {
            var take = Math.Min(chunkSize, remaining);
            var list = new List<long>(take);

            if (isPrimeChunk)
            {
                // sample_primes may return fewer than requested; loop until we fill this chunk
                while (list.Count < take)
                {
                    await foreach (var p in db.SamplePrimesAsync(take - list.Count, ct))
                    {
                        list.Add(p);
                        if (list.Count >= take) break;
                    }
                }
            }
            else
            {
                await foreach (var n in db.SampleCompositesAsync(take, 2, maxPrime, compositeOversample, ct))
                    list.Add(n);
            }

            remaining -= list.Count;
            yield return list.ToArray();
        }
    }

    private static long VerifyChunkFalsePositives(long[] primes, int rounds)
    {
        long falsePositives = 0;

        Parallel.For(0, primes.Length, i =>
        {
            if (PrimeTest.IsNotPrime((ulong)primes[i], rounds))
                Interlocked.Increment(ref falsePositives);
        });

        return falsePositives;
    }

    private static (long Detected, long Missed) VerifyChunkComposites(long[] composites, int rounds)
    {
        long detected = 0;
        long missed = 0;

        Parallel.For(0, composites.Length, i =>
        {
            if (PrimeTest.IsNotPrime((ulong)composites[i], rounds))
                Interlocked.Increment(ref detected);
            else
                Interlocked.Increment(ref missed);
        });

        return (detected, missed);
    }
}
