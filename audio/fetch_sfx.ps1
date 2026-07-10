<#
fetch_sfx.ps1

Place verified public URLs for each sound effect below and run this script from PowerShell to download them into this `audio/` folder.

Usage:
  1) Edit the `$assets` hashtable below and replace the placeholder URLs with direct links to .mp3/.wav files.
  2) Run in PowerShell (may require elevated/network permissions):
       .\fetch_sfx.ps1

This script performs simple downloads with `Invoke-WebRequest`. It does not attempt to authenticate or scrape pages — provide direct file URLs.
#>

$assets = @{
    "spin.mp3"      = "PUT_DIRECT_URL_HERE"
    "bust.mp3"      = "PUT_DIRECT_URL_HERE"
    "mega.mp3"      = "PUT_DIRECT_URL_HERE"
    "applause.mp3"  = "PUT_DIRECT_URL_HERE"
    "tieStart.mp3"  = "PUT_DIRECT_URL_HERE"
    "tieWin.mp3"    = "PUT_DIRECT_URL_HERE"
    "bonus.mp3"     = "PUT_DIRECT_URL_HERE"
    "click.mp3"     = "PUT_DIRECT_URL_HERE"
    "tick.mp3"      = "PUT_DIRECT_URL_HERE"
}

Write-Host "Downloading SFX to:" $PSScriptRoot -ForegroundColor Cyan

foreach ($name in $assets.Keys) {
    $url = $assets[$name]
    if (-not $url -or $url -eq "PUT_DIRECT_URL_HERE") {
        Write-Host "Skipping $name — no URL provided." -ForegroundColor Yellow
        continue
    }

    $out = Join-Path $PSScriptRoot $name
    Write-Host "Downloading $name from $url -> $out"
    try {
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -ErrorAction Stop
        Write-Host "Saved: $out" -ForegroundColor Green
    } catch {
        Write-Host "Failed to download $url : $_" -ForegroundColor Red
    }
}

Write-Host "Done. Verify files exist in the audio folder before reloading the page." -ForegroundColor Cyan
