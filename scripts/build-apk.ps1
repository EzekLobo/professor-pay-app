param(
  [string]$OutputName = "",
  [switch]$InstallEmulator,
  [switch]$SkipChecks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$androidDir = Join-Path $repoRoot "android"
$gradlew = Join-Path $androidDir "gradlew.bat"
$releaseApk = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"

if (!(Test-Path $gradlew)) {
  throw "Gradle wrapper not found at $gradlew. Run Expo prebuild before building the APK."
}

$appConfig = Get-Content (Join-Path $repoRoot "app.json") -Raw | ConvertFrom-Json
$version = $appConfig.expo.version
if (!$OutputName) {
  $OutputName = "AulaPay-v$version-release.apk"
}
if (!$OutputName.EndsWith(".apk", [System.StringComparison]::OrdinalIgnoreCase)) {
  $OutputName = "$OutputName.apk"
}
$outputPath = Join-Path $repoRoot $OutputName

Push-Location $repoRoot
try {
  if (!$SkipChecks) {
    Write-Host "Running TypeScript check..." -ForegroundColor Cyan
    & npx.cmd tsc --noEmit

    Write-Host "Running tests..." -ForegroundColor Cyan
    & npm.cmd test -- --run
  }

  Write-Host "Building Android release APK..." -ForegroundColor Cyan
  Push-Location $androidDir
  try {
    & $gradlew assembleRelease
  } finally {
    Pop-Location
  }

  if (!(Test-Path $releaseApk)) {
    throw "Release APK was not created at $releaseApk."
  }

  Copy-Item -Path $releaseApk -Destination $outputPath -Force
  $apk = Get-Item $outputPath
  Write-Host "APK generated:" -ForegroundColor Green
  Write-Host $apk.FullName
  Write-Host ("Size: {0:N0} bytes" -f $apk.Length)

  if ($InstallEmulator) {
    $adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
    if (!(Test-Path $adb)) {
      throw "adb not found at $adb."
    }
    Write-Host "Installing on connected emulator/device..." -ForegroundColor Cyan
    & $adb install -r $apk.FullName
  }
} finally {
  Pop-Location
}
