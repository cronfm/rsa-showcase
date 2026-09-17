using System.Runtime.CompilerServices;
using Npgsql;

namespace RSA;

public sealed class PrimeTableChecker : IAsyncDisposable
{
    private readonly NpgsqlDataSource _ds;

    public PrimeTableChecker(string connectionString)
    {
        var csb = new NpgsqlConnectionStringBuilder(connectionString)
        {
            // Long-running sampling/verifications
            CommandTimeout = 0,

            // Let Npgsql cache/prepare statements automatically (better than reusing NpgsqlCommand objects)
            MaxAutoPrepare = 20,
            AutoPrepareMinUsages = 2
        };

        _ds = NpgsqlDataSource.Create(csb.ToString());
    }

    public async ValueTask DisposeAsync() => await _ds.DisposeAsync();

    public async Task<long> GetMaxPrimeAsync(CancellationToken ct = default)
    {
        const string sql = "SELECT primeutil.max_prime();";
        await using var cmd = _ds.CreateCommand(sql);
        var obj = await cmd.ExecuteScalarAsync(ct);
        return obj is DBNull or null ? 0L : (long)obj;
    }

    public async Task<bool> ContainsPrimeAsync(long n, CancellationToken ct = default)
    {
        const string sql = "SELECT primeutil.is_prime_db(@n);";
        await using var cmd = _ds.CreateCommand(sql);
        cmd.Parameters.AddWithValue("n", n);
        return (bool)(await cmd.ExecuteScalarAsync(ct))!;
    }

    /// <summary>
    /// Streams primes sampled from the DB. May yield fewer than requested per call; caller can loop.
    /// </summary>
    public async IAsyncEnumerable<long> SamplePrimesAsync(
        int k,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        const string sql = "SELECT p FROM primeutil.sample_primes(@k);";
        await using var cmd = _ds.CreateCommand(sql);
        cmd.Parameters.AddWithValue("k", k);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            yield return reader.GetInt64(0);
    }

    /// <summary>
    /// Streams composites sampled in [lo, hi] by the DB function (fast, no client-side filtering).
    /// </summary>
    public async IAsyncEnumerable<long> SampleCompositesAsync(
        int k,
        long lo,
        long? hi,
        double oversample = 2.5,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        // NOTE: Requires your SQL function oversample to be double precision.
        const string sql = "SELECT n FROM primeutil.sample_composites(@k, @lo, @hi, @oversample);";

        await using var cmd = _ds.CreateCommand(sql);
        cmd.Parameters.AddWithValue("k", k);
        cmd.Parameters.AddWithValue("lo", lo);
        cmd.Parameters.AddWithValue("hi", (object?)hi ?? DBNull.Value);
        cmd.Parameters.AddWithValue("oversample", oversample); // double precision

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            yield return reader.GetInt64(0);
    }

    public async Task<long?> NextPrimeAsync(long n, CancellationToken ct = default)
    {
        const string sql = "SELECT p FROM primes WHERE p >= @n ORDER BY p LIMIT 1;";
        await using var cmd = _ds.CreateCommand(sql);
        cmd.Parameters.AddWithValue("n", n < 2 ? 2 : n);

        var obj = await cmd.ExecuteScalarAsync(ct);
        return obj is null or DBNull ? null : (long)obj;
    }
}
