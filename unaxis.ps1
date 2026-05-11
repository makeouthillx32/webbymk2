#!/usr/bin/env pwsh
# unaxis.ps1 — global launcher for the UNAXIS TUI
#
# Run from any terminal, any directory:
#   unaxis          build + run (stable)
#   unaxis -Dev     watch mode  (instant reload on save)
#
# This script always changes to the project root before launching,
# so the TUI starts correctly regardless of where you are.

param([switch]$Dev)

$PROJECT_DIR = $PSScriptRoot

Push-Location $PROJECT_DIR

if ($Dev) {
    & "$PROJECT_DIR\src\ink\run.ps1" -Dev
} else {
    & "$PROJECT_DIR\src\ink\run.ps1"
}

Pop-Location
