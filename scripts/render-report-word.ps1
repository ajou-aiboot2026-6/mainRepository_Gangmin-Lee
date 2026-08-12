param(
  [Parameter(Mandatory = $true)][string]$InputDocx,
  [Parameter(Mandatory = $true)][string]$OutputDir
)

$resolvedInput = (Resolve-Path -LiteralPath $InputDocx).Path
$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDir))
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($resolvedInput, $false, $true)
  $pageCount = $doc.ComputeStatistics(2)

  $targets = @(
    '팀 내부 파일럿 3개 시나리오',
    'U1 - 팀원 A',
    '기술 가설은 지지됐다',
    'Q. 이동시간은 AI가 만든 값인가?',
    '팀 내부 파일럿 리뷰',
    '미확인: 팀원 실명'
  )
  $targetPages = @()
  foreach ($target in $targets) {
    $range = $doc.Content.Duplicate
    $find = $range.Find
    $find.ClearFormatting()
    $find.Text = $target
    if ($find.Execute()) {
      $targetPages += [int]$range.Information(3)
    }
  }
  $targetPages = @($targetPages | Sort-Object -Unique)

  $fullPdf = Join-Path $resolvedOutput 'report-full.pdf'
  $doc.ExportAsFixedFormat($fullPdf, 17, $false, 0, 0, 1, $pageCount, 0, $true, $true, 1, $true, $true, $false)

  foreach ($page in 1..$pageCount) {
    $pagePdf = Join-Path $resolvedOutput ('page-{0:D2}.pdf' -f $page)
    $doc.ExportAsFixedFormat($pagePdf, 17, $false, 0, 3, $page, $page, 0, $true, $true, 0, $true, $true, $false)
  }

  [PSCustomObject]@{
    input = $resolvedInput
    output = $resolvedOutput
    pageCount = $pageCount
    targetPages = ($targetPages -join ',')
    fullPdf = $fullPdf
  } | ConvertTo-Json -Compress
}
finally {
  if ($doc -ne $null) { $doc.Close($false) }
  if ($word -ne $null) { $word.Quit() }
  if ($doc -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) }
  if ($word -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
