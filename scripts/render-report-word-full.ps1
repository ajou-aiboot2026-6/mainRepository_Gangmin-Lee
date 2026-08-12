param(
  [Parameter(Mandatory = $true)][string]$InputDocx,
  [Parameter(Mandatory = $true)][string]$OutputPdf
)

$resolvedInput = (Resolve-Path -LiteralPath $InputDocx).Path
$resolvedPdf = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPdf))
$pdfDir = Split-Path -Parent $resolvedPdf
New-Item -ItemType Directory -Force -Path $pdfDir | Out-Null
$asciiCopy = Join-Path $pdfDir 'report-user-pilot.docx'
Copy-Item -LiteralPath $resolvedInput -Destination $asciiCopy -Force

$word = $null
$doc = $null
$missing = [Type]::Missing
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($asciiCopy, $false, $true, $false, $missing, $missing, $false, $missing, $missing, $missing, $missing, $false, $true, $missing, $true, $missing)
  $pageCount = $doc.ComputeStatistics(2)
  $doc.ExportAsFixedFormat($resolvedPdf, 17, $false, 0, 0, 1, $pageCount, 0, $true, $true, 1, $true, $true, $false)
  [PSCustomObject]@{ pageCount = $pageCount; pdf = $resolvedPdf; bytes = (Get-Item $resolvedPdf).Length } | ConvertTo-Json -Compress
}
finally {
  if ($doc -ne $null) { $doc.Close($false) }
  if ($word -ne $null) { $word.Quit() }
  if ($doc -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) }
  if ($word -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
