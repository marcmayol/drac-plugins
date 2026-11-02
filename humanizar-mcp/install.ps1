# Installs humanizar on Windows and gets ready every agent it finds. Nothing else is needed: the
# binary depends on no runtime or library.
#   irm https://raw.githubusercontent.com/marcmayol/drac-plugins/main/humanizar-mcp/install.ps1 | iex
#
# Optional variables:
#   HUMANIZAR_INSTALL_DIR   where the binary goes (default %LOCALAPPDATA%\Programs\humanizar)
#   HUMANIZAR_VERSION       a specific release tag (default below)
#   HUMANIZAR_NO_PATH=1     don't add the folder to the user PATH
#   HUMANIZAR_NO_SETUP=1    only install the binary, don't touch any agent
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # without the progress bar, Invoke-WebRequest is much faster on PowerShell 5.1

$repo = 'marcmayol/drac-plugins'
$tag = if ($env:HUMANIZAR_VERSION) { $env:HUMANIZAR_VERSION } else { 'humanizar-v0.4.1' }
$dir = if ($env:HUMANIZAR_INSTALL_DIR) { $env:HUMANIZAR_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\humanizar' }
$base = "https://github.com/$repo/releases/download/$tag"
# Windows on ARM runs the x64 binary through emulation.
$paquete = 'humanizar-x86_64-pc-windows-msvc.zip'

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("humanizar-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    Write-Host "Downloading $paquete..."
    Invoke-WebRequest -UseBasicParsing "$base/$paquete" -OutFile (Join-Path $tmp $paquete)
    Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS" -OutFile (Join-Path $tmp 'SHA256SUMS')

    # The checksum must match before anything is installed.
    $linea = Get-Content (Join-Path $tmp 'SHA256SUMS') | Where-Object { $_ -match " $([regex]::Escape($paquete))$" }
    $esperada = if ($linea) { ($linea -split ' ')[0] } else { '' }
    $real = (Get-FileHash (Join-Path $tmp $paquete) -Algorithm SHA256).Hash.ToLower()
    if (-not $esperada -or $esperada -ne $real) { throw "the SHA-256 checksum of $paquete doesn't match; nothing was installed" }

    Expand-Archive (Join-Path $tmp $paquete) -DestinationPath $tmp -Force
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $exe = Join-Path $dir 'humanizar.exe'
    try {
        Copy-Item (Join-Path $tmp 'humanizar.exe') $exe -Force
    } catch {
        throw "can't replace ${exe}: an open agent session is probably using it. Close them and run the installer again."
    }
    Write-Host "Installed: $exe ($(& $exe --version))"

    if (-not $env:HUMANIZAR_NO_PATH) {
        $usuario = [Environment]::GetEnvironmentVariable('Path', 'User')
        if (-not (($usuario -split ';') -contains $dir)) {
            [Environment]::SetEnvironmentVariable('Path', ($(if ($usuario) { "$usuario;" }) + $dir), 'User')
            Write-Host "Added to your user PATH: $dir (new terminals will see it)."
        }
        if (-not (($env:Path -split ';') -contains $dir)) { $env:Path = "$env:Path;$dir" }
    }
    if ($env:HUMANIZAR_NO_SETUP) {
        Write-Host "Next: humanizar setup <agent>   (or --all, for every agent on this computer)"
    } else {
        # The agents get the binary's full path, so they find it even without the PATH change.
        & $exe setup --all
        if ($LASTEXITCODE -ne 0) { Write-Warning "some agents couldn't be set up (see above); the others are ready." }
        Write-Host "An agent you install later: humanizar setup <agent>"
    }
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
