$ErrorActionPreference = 'Stop'
$stagePath = Join-Path $PSScriptRoot '../work/kaggle'
New-Item -ItemType Directory -Force -Path $stagePath | Out-Null
$downloadUrl = 'https://www.kaggle.com/api/v1/datasets/download/brandonconrady/first-million-primes/primes.csv?datasetVersionNumber=1'
$zipPath = Join-Path $stagePath 'kaggle-first-million-primes-v1.zip'
if (-not (Test-Path -LiteralPath $zipPath)) {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -TimeoutSec 60
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entry = $archive.GetEntry('primes.csv')
    if ($null -eq $entry) { throw 'Expected primes.csv in Kaggle archive.' }
    $sourceStream = $entry.Open()
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $sourceSha256 = [System.Convert]::ToHexString($sha.ComputeHash($sourceStream)).ToLowerInvariant()
    $sourceStream.Dispose()
    $sha.Dispose()
    $reader = [System.IO.StreamReader]::new($entry.Open())
    $values = [System.Collections.Generic.List[int]]::new()
    $discarded = [System.Collections.Generic.List[int]]::new()
    $linesRead = 0
    try {
        while ($values.Count -lt 10000) {
            $line = $reader.ReadLine()
            if ($null -eq $line) { throw 'Dataset ended before 10,000 primes.' }
            $linesRead++
            if ($line -notmatch '^\d+$') { throw "Unexpected CSV content on line $linesRead." }
            $value = [int]$line
            if ($value -lt 2) { $discarded.Add($value); continue }
            $values.Add($value)
        }
    } finally { $reader.Dispose() }
    $sourceBytes = $entry.Length
} finally { $archive.Dispose() }

# Independently verify the imported subset against an Eratosthenes sieve.
# The sieve validates the imported source values; it does not replace them.
$maximum = 104729
$composite = [bool[]]::new($maximum + 1)
for ($factor = 2; $factor * $factor -le $maximum; $factor++) {
    if (-not $composite[$factor]) {
        for ($multiple = $factor * $factor; $multiple -le $maximum; $multiple += $factor) {
            $composite[$multiple] = $true
        }
    }
}
$expected = [System.Collections.Generic.List[int]]::new()
for ($candidate = 2; $candidate -le $maximum; $candidate++) {
    if (-not $composite[$candidate]) { $expected.Add($candidate) }
}
if ($expected.Count -ne $values.Count) { throw 'Unexpected prime count.' }
for ($index = 0; $index -lt $expected.Count; $index++) {
    if ($expected[$index] -ne $values[$index]) { throw "Dataset mismatch at prime rank $($index + 1)." }
}

$encoding = [System.Text.UTF8Encoding]::new($false)
$jsonPath = Join-Path $stagePath 'primes-10000.json'
$csvPath = Join-Path $stagePath 'primes-10000.csv'
[System.IO.File]::WriteAllText($jsonPath, '[' + ($values -join ',') + "]`n", $encoding)
[System.IO.File]::WriteAllText($csvPath, "prime`n" + ($values -join "`n") + "`n", $encoding)
$provenance = [ordered]@{
    title = 'First Million Primes'
    creator = 'Brandon Conrady'
    datasetHandle = 'brandonconrady/first-million-primes'
    sourceUrl = 'https://www.kaggle.com/datasets/brandonconrady/first-million-primes'
    version = 1
    sourceUpdatedAt = '2021-12-10T20:32:25.12Z'
    acquiredAt = '2026-09-17'
    license = 'CC0-1.0'
    licenseLabelFromKaggle = 'CC0: Public Domain'
    licenseUrl = 'https://creativecommons.org/publicdomain/zero/1.0/'
    metadataUrl = 'https://www.kaggle.com/api/v1/datasets/view/brandonconrady/first-million-primes'
    fileListingUrl = 'https://www.kaggle.com/api/v1/datasets/list/brandonconrady/first-million-primes'
    downloadUrl = $downloadUrl
    sourceFile = 'primes.csv'
    sourceFileBytes = $sourceBytes
    sourceFileSha256 = $sourceSha256
    sourceArchiveBytes = (Get-Item -LiteralPath $zipPath).Length
    sourceArchiveSha256 = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    sourceLinesReadForSubset = $linesRead
    discardedValues = @($discarded)
    transformation = 'Read original one-integer-per-line primes.csv in source order; discard values below 2 (the first row is 1); retain the first 10,000 remaining values; independently compare every retained value with an Eratosthenes sieve through 104,729; emit compact UTF-8 JSON array and UTF-8 one-column CSV with prime header, both with LF final newline.'
    validation = 'Exactly matches all 10,000 primes from 2 through 104,729, with no duplicates, omissions, or composites.'
    subsetCount = $values.Count
    subsetMinimum = $values[0]
    subsetMaximum = $values[$values.Count - 1]
    jsonFile = 'primes-10000.json'
    jsonBytes = (Get-Item -LiteralPath $jsonPath).Length
    jsonSha256 = (Get-FileHash -LiteralPath $jsonPath -Algorithm SHA256).Hash.ToLowerInvariant()
    csvFile = 'primes-10000.csv'
    csvBytes = (Get-Item -LiteralPath $csvPath).Length
    csvSha256 = (Get-FileHash -LiteralPath $csvPath -Algorithm SHA256).Hash.ToLowerInvariant()
    use = 'Educational prime exploration and toy RSA only. Public, small, deterministic dataset values are unsuitable as secret production RSA key factors.'
}
[System.IO.File]::WriteAllText((Join-Path $stagePath 'provenance.json'), ($provenance | ConvertTo-Json -Depth 8) + "`n", $encoding)
$provenance | ConvertTo-Json -Depth 8

$destination = Join-Path $PSScriptRoot '../src/data'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Copy-Item -LiteralPath $jsonPath -Destination (Join-Path $destination 'primes.json')
Copy-Item -LiteralPath $csvPath -Destination (Join-Path $destination 'primes.csv')
$provenance.jsonFile = 'primes.json'
$provenance.csvFile = 'primes.csv'
[System.IO.File]::WriteAllText((Join-Path $destination 'provenance.json'), ($provenance | ConvertTo-Json -Depth 8) + "`n", $encoding)
