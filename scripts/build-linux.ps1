# Cross-compiles the Go binaries for the Linux VPS from Windows (DEPLOY.md, Bagian 0).
# Pure Go only (CGO_ENABLED=0): the binaries must run without system C libraries or external tools.
# Usage, from the repository root:  powershell -ExecutionPolicy Bypass -File scripts\build-linux.ps1
$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')
New-Item -ItemType Directory -Force dist | Out-Null

$env:GOOS = 'linux'
$env:GOARCH = 'amd64'
$env:CGO_ENABLED = '0'

$targets = @(
    @{ Name = 'klikumroh-api'; Pkg = './cmd/api' },
    @{ Name = 'klikumroh-migrate'; Pkg = './cmd/migrate' },
    @{ Name = 'klikumroh-seed-demo'; Pkg = './cmd/seed-demo' }
)

try {
    foreach ($t in $targets) {
        Write-Host "build dist/$($t.Name)  <- $($t.Pkg)"
        go build -trimpath -ldflags '-s -w' -o "dist/$($t.Name)" $t.Pkg
        if ($LASTEXITCODE -ne 0) { throw "go build failed for $($t.Pkg)" }
    }
} finally {
    # Do not leave the cross-compile settings in this PowerShell session.
    Remove-Item Env:GOOS, Env:GOARCH, Env:CGO_ENABLED -ErrorAction SilentlyContinue
}

Get-ChildItem dist/klikumroh-* | Select-Object Name, Length
