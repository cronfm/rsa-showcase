using System.Globalization;
using System.Numerics;
using System.Text.Json;
using System.Text.Json.Serialization;
using RsaShowcase.Core;

var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
};
options.Converters.Add(new BigIntegerConverter());

try
{
    // JSON lines in, JSON lines out. Decimal strings preserve integer precision.
    // Example: {"operation":"roundtrip","p":"61","q":"53","e":"17","message":"65"}
    while (Console.ReadLine() is { } line)
    {
        if (string.IsNullOrWhiteSpace(line)) continue;
        using var document = JsonDocument.Parse(line);
        var input = document.RootElement;
        BigInteger Integer(string name) => BigInteger.Parse(
            input.GetProperty(name).GetString()!, CultureInfo.InvariantCulture);

        object result = input.GetProperty("operation").GetString() switch
        {
            "power" => ModularExponentiation.TraceModPow(
                Integer("base"), Integer("exponent"), Integer("modulus")),
            "gcd" => NumberTheory.Gcd(Integer("a"), Integer("b")),
            "inverse" => NumberTheory.ModInverse(Integer("value"), Integer("modulus")),
            "prime" => Primality.IsPrime(Integer("n")),
            "fermat" => Primality.FermatTest(Integer("n"), input.GetProperty("bases")
                .EnumerateArray()
                .Select(value => BigInteger.Parse(value.GetString()!, CultureInfo.InvariantCulture))
                .ToArray()),
            "key" => RsaWorkbench.BuildKey(Integer("p"), Integer("q"), Integer("e")),
            "roundtrip" => RsaWorkbench.RoundTrip(
                Integer("p"), Integer("q"), Integer("e"), Integer("message")),
            _ => throw new ArgumentException("Unknown operation.")
        };
        Console.WriteLine(JsonSerializer.Serialize(result, options));
    }
}
catch (Exception error) when (error is ArgumentException or JsonException
    or FormatException or OverflowException or KeyNotFoundException
    or InvalidOperationException)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}
return 0;

internal sealed class BigIntegerConverter : JsonConverter<BigInteger>
{
    public override BigInteger Read(
        ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => BigInteger.Parse(reader.GetString()!, CultureInfo.InvariantCulture);

    public override void Write(
        Utf8JsonWriter writer, BigInteger value, JsonSerializerOptions options)
        => writer.WriteStringValue(value.ToString(CultureInfo.InvariantCulture));
}
