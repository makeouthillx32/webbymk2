# scripts/secrets-identity.ps1
# Saves the Infisical machine identity UNAXIS reads secrets with.
#
# Create the identity in Infisical first (Organization -> Access Control ->
# Identities -> Create, Universal Auth, then give it Viewer on the project),
# then run this and paste its Client ID and Client Secret when asked. The
# secret is typed hidden, never echoed, never stored in shell history, and the
# file is readable by your Windows account only.
#
#   powershell -ExecutionPolicy Bypass -File scripts\secrets-identity.ps1

$dir  = Join-Path $env:APPDATA "unaxis\unenter\secrets-manager"
$file = Join-Path $dir "unaxis-identity.json"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$clientId = (Read-Host "Client ID").Trim()
if ($clientId -notmatch '^[0-9a-fA-F-]{36}$') { Write-Host "That doesn't look like a Client ID (a UUID)." -ForegroundColor Red; exit 1 }

$secure = Read-Host "Client Secret (hidden)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ($clientSecret.Length -lt 20) { Write-Host "The secret looks too short — copy the whole value." -ForegroundColor Red; exit 1 }

@{ clientId = $clientId; clientSecret = $clientSecret } | ConvertTo-Json | Set-Content -Path $file -Encoding utf8
Remove-Variable clientSecret

# Owner-only: drop inherited access, grant just this account.
icacls $file /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

Write-Host "Saved $file (readable by $env:USERNAME only)." -ForegroundColor Green
Write-Host "Next: tell Claude, or run  unaxis secrets check"
