[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WorkerPath = Join-Path $RepoRoot "src\worker.tsx"
$DomainPath = Join-Path $RepoRoot "src\domain\calendar.ts"
$MigrationPath = Join-Path $RepoRoot "migrations\0001_telemetry.sql"
$AppPath = Join-Path $RepoRoot "public\app.js"
$StylesPath = Join-Path $RepoRoot "public\styles.css"
$SourcePath = Join-Path $RepoRoot "SOURCE.md"
$WranglerPath = Join-Path $RepoRoot "wrangler.jsonc"
$PublicDirectory = Join-Path $RepoRoot "public"

$RequiredFiles = @(
    "DECISIONS.md", "EXPERIMENT.md", "LICENSE", "METRICS.md", "PRIVACY.md", "README.md", "SECURITY.md", "SOURCE.md", "STACK.md",
    ".github\workflows\ci.yml", "migrations\0001_telemetry.sql", "ops\product-metrics.ps1", "ops\product-metrics.sql",
    "ops\submit-indexnow.ps1", "public\app.js", "public\favicon.svg", "public\manifest.webmanifest", "public\og.svg", "public\robots.txt",
    "src\domain\calendar.ts", "src\worker.tsx", "test\calendar.test.ts", "test\surface.test.ts"
)
foreach ($RelativePath in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $RelativePath))) { throw "Missing required release file: $RelativePath" }
}

$Worker = Get-Content -Raw -LiteralPath $WorkerPath
$Domain = Get-Content -Raw -LiteralPath $DomainPath
$Migration = Get-Content -Raw -LiteralPath $MigrationPath
$App = Get-Content -Raw -LiteralPath $AppPath
$Styles = Get-Content -Raw -LiteralPath $StylesPath
$Source = Get-Content -Raw -LiteralPath $SourcePath
$Wrangler = Get-Content -Raw -LiteralPath $WranglerPath
$ProductSurface = @($Worker, $App) -join "`n"

if (-not $Worker.Contains('class="year-tape"') -or -not $Worker.Contains(': "month-block"') -or -not $Worker.Contains('class="leave-ticket"') -or -not $Worker.Contains('class="recommendation-tray"') -or -not $App.Contains('panel.className = "month-card"') -or -not $App.Contains('card.className = "leave-ticket-card"')) { throw "Expected the year-tape, leave-ticket, calendar, and recommendation-tray visual system" }
if ($ProductSurface -match '(?i)public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性') { throw "Research copy must not appear on the product surface" }
if ($Styles -match '(?i)gradient') { throw "Product CSS must not use gradients" }
if ($Styles -match '(?s)h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px') { throw "Primary heading is too large" }
if ($ProductSurface -match '(?i)innerHTML|eval\(|new Function|dangerouslySetInnerHTML') { throw "Calendar data must not be interpreted as markup or code" }
if (-not $Worker.Contains('app.post("/api/recommend"') -or -not $Worker.Contains('c.header("Cache-Control", "no-store")')) { throw "Recommendations must use a non-cacheable POST API" }
if ($App -match 'history\.(pushState|replaceState)|location\.search\s*=') { throw "Leave plans must not enter product URLs" }
if ($Migration -match '(?i)selected_date|leave_date|leave_budget|target_year|email|phone_number|telephone|advertising_id|password') { throw "Plans, contact, advertising, and authentication data do not belong in telemetry storage" }
if (-not $Migration.Contains("CHECK(event_name IN") -or -not $Worker.Contains("35 * 86400")) { throw "Expected allowlisted telemetry and 35-day retention" }
if (-not $Domain.Contains("SUPPORTED_YEARS = [2026, 2027]") -or -not $Domain.Contains("Math.min(5, Math.max(1, number))") -or -not $Domain.Contains(".slice(0, 6)")) { throw "Expected bounded years, budget, and recommendation count" }
if (-not $Source.Contains("内閣府") -or -not $Source.Contains("syukujitsu.csv") -or -not $Source.Contains("公共データ利用規約第1.0版") -or -not $Source.Contains("加工内容")) { throw "Official source, use terms, range, and transformation are incomplete" }
if (-not $App.Contains('slice(0, 40)') -or -not $App.Contains('"BEGIN:VCALENDAR"')) { throw "Expected bounded local leave storage and calendar export" }
if ($ProductSurface -match '(?i)better-auth|betterAuth') { throw "Account authentication is not needed for local plans" }
if ($Wrangler.Contains("00000000-0000-0000-0000-000000000000")) { throw "The production D1 database ID has not been configured" }
if ((Get-Item -LiteralPath (Join-Path $PublicDirectory "og.svg")).Length -lt 1500) { throw "Expected a product-specific OG SVG larger than 1.5 KB" }
if ((Get-Item -LiteralPath $AppPath).Length -lt 10000) { throw "Expected a substantial calendar-planning client" }

$KeyFiles = @(Get-ChildItem -LiteralPath $PublicDirectory -File | Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" })
if ($KeyFiles.Count -ne 1) { throw "Expected exactly one generated IndexNow key file, found $($KeyFiles.Count)" }
$Key = (Get-Content -Raw -LiteralPath $KeyFiles[0].FullName).Trim()
if ($Key -ne $KeyFiles[0].BaseName) { throw "IndexNow key file name and content do not match" }

Write-Output "Product release contract is satisfied"
