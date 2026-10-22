# Gera MANUAL.docx e MANUAL.pdf a partir do MANUAL.md (o .md e sempre a fonte).
# Requer pandoc (winget install JohnMacFarlane.Pandoc) e Microsoft Word.
# Uso, na raiz do repo:  powershell -ExecutionPolicy Bypass -File tools\manual\gerar.ps1
param([string]$Root = (Resolve-Path "$PSScriptRoot\..\..").Path)

$ErrorActionPreference = 'Stop'
$pandoc = "$env:LOCALAPPDATA\Pandoc\pandoc.exe"
if (-not (Test-Path $pandoc)) { $pandoc = 'pandoc' }

# Strings simples: o resultado de Join-Path vem embrulhado em PSObject e, passado ao
# ExportAsFixedFormat do Word, deixa o Word em loop sem gerar o PDF.
$md   = "$Root\MANUAL.md"
$docx = "$Root\MANUAL.docx"
$pdf  = "$Root\MANUAL.pdf"

# "Sumário" escrito com [char] pra o .ps1 continuar ASCII (o PowerShell 5.1 le .ps1 sem BOM como ANSI)
$tocTitle = "Sum$([char]0xE1)rio"
& $pandoc -f gfm+smart $md -o $docx --toc -M lang=pt-BR -M "toc-title=$tocTitle" `
  --resource-path $Root `
  --reference-doc "$PSScriptRoot\ref.docx" --lua-filter "$PSScriptRoot\filtro.lua"
if ($LASTEXITCODE -ne 0) { throw "pandoc falhou ($LASTEXITCODE)" }

# Word: atualiza o sumario, salva o DOCX e exporta o PDF
Write-Host "DOCX gerado; abrindo no Word..."
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($docx)
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Save()
  Write-Host "Sumario atualizado; exportando PDF..."
  $doc.ExportAsFixedFormat($pdf, 17)   # 17 = wdExportFormatPDF
  $pages = $doc.ComputeStatistics(2)   # 2 = wdStatisticPages
  $doc.Close(0)
} finally {
  $word.Quit()
}
Write-Host "OK: $docx e $pdf ($pages paginas)"
