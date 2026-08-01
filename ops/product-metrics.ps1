[CmdletBinding()]
param([switch]$Local)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SqlPath = Join-Path $PSScriptRoot "product-metrics.sql"
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content $SqlPath) -join " "

$Output = & $Wrangler d1 execute yasumi-kumi $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) { throw "D1 metrics query failed with exit code $LASTEXITCODE" }
$Payload = ($Output -join [Environment]::NewLine) | ConvertFrom-Json
$Row = $Payload[0].results[0]
if (-not $Row) { throw "D1 metrics query returned no result" }

function Get-Percent {
    param([int]$Numerator, [int]$Denominator)
    if ($Denominator -eq 0) { return $null }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

$Users = [int]$Row.users
[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "yasumi-kumi"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        users = $Users
        recommenders = [int]$Row.recommenders
        selectors = [int]$Row.selectors
        copiers = [int]$Row.copiers
        downloaders = [int]$Row.downloaders
        exporters = [int]$Row.exporters
        savers = [int]$Row.savers
        returned = [int]$Row.returned
        recommenders_7d = [int]$Row.recommenders_7d
        exporters_7d = [int]$Row.exporters_7d
        qa_rows = [int]$Row.qa_rows
    }
    rates = [ordered]@{
        recommender_percent = Get-Percent ([int]$Row.recommenders) $Users
        selector_percent = Get-Percent ([int]$Row.selectors) $Users
        copy_percent = Get-Percent ([int]$Row.copiers) $Users
        calendar_download_percent = Get-Percent ([int]$Row.downloaders) $Users
        exporter_percent = Get-Percent ([int]$Row.exporters) $Users
        return_percent = Get-Percent ([int]$Row.returned) $Users
    }
} | ConvertTo-Json -Depth 4
