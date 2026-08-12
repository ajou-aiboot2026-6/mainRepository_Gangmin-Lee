$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$sourcePath = (Get-ChildItem -LiteralPath $workspace -Filter "*update.docx" -File | Select-Object -First 1).FullName
$mappingPath = Join-Path $PSScriptRoot "fill-report.mjs"
$outputDir = Join-Path $workspace "output"
$outputPath = (Get-ChildItem -LiteralPath $outputDir -Filter "*.docx" -File -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if (-not $sourcePath) { throw "Reference DOCX not found" }
if (-not $outputPath) { $outputPath = Join-Path $outputDir "report.docx" }

$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $sourceHash = ([System.BitConverter]::ToString($sha256.ComputeHash([System.IO.File]::ReadAllBytes($sourcePath)))).Replace("-", "")
} finally {
  $sha256.Dispose()
}
if ($sourceHash -ne "DF0D5F0254DBD4F8D00C7467E560C3C794EFB4F739CD82F63DF17427D2810C91") {
  throw "Reference hash mismatch"
}

$mappingSource = Get-Content -Raw -Encoding UTF8 -LiteralPath $mappingPath
$mapBlock = [regex]::Match($mappingSource, '(?s)const R = \{(.*?)\n\};')
if (-not $mapBlock.Success) { throw "Mapping block not found" }
$entries = [regex]::Matches($mapBlock.Groups[1].Value, '(?<!\d)(\d+):\s*"((?:\\.|[^"\\])*)"')
$replacements = @{}
foreach ($entry in $entries) {
  $index = [int]$entry.Groups[1].Value
  $jsonString = '"' + $entry.Groups[2].Value + '"'
  $replacements[$index] = $jsonString | ConvertFrom-Json
}
if ($replacements.Count -lt 500) { throw "Unexpected replacement count: $($replacements.Count)" }

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Copy-Item -LiteralPath $sourcePath -Destination $outputPath -Force
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($outputPath, [System.IO.Compression.ZipArchiveMode]::Update)
try {
  $entry = $archive.GetEntry("word/document.xml")
  if (-not $entry) { throw "word/document.xml not found" }
  $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
  try { $xml = $reader.ReadToEnd() } finally { $reader.Dispose() }

  $paragraphRegex = [regex]::new('<w:p(?:\s[^>]*)?>.*?</w:p>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $paragraphMatches = $paragraphRegex.Matches($xml)
  if ($paragraphMatches.Count -ne 1080) { throw "Unexpected paragraph count: $($paragraphMatches.Count)" }
  $paragraphs = [System.Collections.Generic.List[string]]::new()
  foreach ($paragraph in $paragraphMatches) { $paragraphs.Add($paragraph.Value) }

  foreach ($pair in $replacements.GetEnumerator()) {
    $paragraph = $paragraphs[$pair.Key]
    $escaped = [System.Security.SecurityElement]::Escape([string]$pair.Value)
    $state = @{ Written = $false }
    $textRegex = [regex]::new('<w:t(?:\s[^>]*)?>.*?</w:t>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $paragraph = $textRegex.Replace($paragraph, {
      param($match)
      if (-not $state.Written) {
        $state.Written = $true
        return '<w:t xml:space="preserve">' + $escaped + '</w:t>'
      }
      return [regex]::Replace($match.Value, '>.*?</w:t>$', '></w:t>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    })
    if (-not $state.Written) {
      $paragraph = [regex]::Replace($paragraph, '</w:p>$', '<w:r><w:t xml:space="preserve">' + $escaped + '</w:t></w:r></w:p>')
    }
    $paragraphs[$pair.Key] = $paragraph
  }

  $replaceState = @{ Cursor = 0 }
  $patchedXml = $paragraphRegex.Replace($xml, { param($match) $value = $paragraphs[$replaceState.Cursor]; $replaceState.Cursor++; $value })
  $entry.Delete()
  $newEntry = $archive.CreateEntry("word/document.xml", [System.IO.Compression.CompressionLevel]::Optimal)
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  $writer = [System.IO.StreamWriter]::new($newEntry.Open(), $utf8NoBom)
  try { $writer.Write($patchedXml) } finally { $writer.Dispose() }
} finally {
  $archive.Dispose()
}

Write-Output "OUTPUT=$outputPath"
Write-Output "REPLACEMENTS=$($replacements.Count)"
Write-Output "SOURCE_HASH=$sourceHash"
