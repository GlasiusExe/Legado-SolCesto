#  Legado - mod de progresion para Sol Cesto (no oficial) - Glasius.Mods
#  Instalador / desinstalador. Compatible con Windows PowerShell 5.1 (Windows 10/11).
#  No incluye ni redistribuye archivos del juego: modifica la copia que ya tienes instalada.
param(
  [switch]$Uninstall,
  [switch]$Elevated,
  [string]$GamePath = ""
)

$ErrorActionPreference = "Stop"
try { $Host.UI.RawUI.WindowTitle = "Legado - Glasius.Mods" } catch {}

$Here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root   = Split-Path -Parent $Here
$ModDir = Join-Path $Root "mods"
$ModFiles = @("loader.js", "legado.js")

function Say([string]$msg, [string]$color = "Gray") { Write-Host $msg -ForegroundColor $color }
function Title {
  Write-Host ""
  Say "   ============================================" "DarkYellow"
  Say "     LEGADO  -  Progresion para Sol Cesto" "Yellow"
  Say "     por Glasius.Mods  (mod no oficial)" "DarkYellow"
  Say "   ============================================" "DarkYellow"
  Write-Host ""
}
function Finish([int]$code) {
  if ($Elevated) { Write-Host ""; Read-Host "  Presiona Enter para cerrar" | Out-Null }
  exit $code
}
function Fail([string]$msg) {
  Write-Host ""
  Say "  [X] $msg" "Red"
  Write-Host ""
  Finish 1
}

# ---------------------------------------------------------------------------
# Buscar la carpeta del juego en todas las bibliotecas de Steam
# ---------------------------------------------------------------------------
function Find-Game {
  $roots = New-Object System.Collections.Generic.List[string]
  foreach ($k in @("HKCU:\Software\Valve\Steam", "HKLM:\SOFTWARE\WOW6432Node\Valve\Steam", "HKLM:\SOFTWARE\Valve\Steam")) {
    try {
      $p = Get-ItemProperty -Path $k -ErrorAction Stop
      if ($p.SteamPath)   { $roots.Add(($p.SteamPath -replace "/", "\")) }
      if ($p.InstallPath) { $roots.Add(($p.InstallPath -replace "/", "\")) }
    } catch {}
  }
  if (${env:ProgramFiles(x86)}) { $roots.Add((Join-Path ${env:ProgramFiles(x86)} "Steam")) }
  if ($env:ProgramFiles)        { $roots.Add((Join-Path $env:ProgramFiles "Steam")) }

  $libs = New-Object System.Collections.Generic.List[string]
  foreach ($r in ($roots | Select-Object -Unique)) {
    $libs.Add($r)
    $vdf = Join-Path $r "steamapps\libraryfolders.vdf"
    if (Test-Path -LiteralPath $vdf) {
      $txt = Get-Content -LiteralPath $vdf -Raw
      foreach ($m in [regex]::Matches($txt, '"path"\s*"([^"]+)"')) {
        $libs.Add(($m.Groups[1].Value -replace "\\\\", "\"))
      }
    }
  }
  foreach ($l in ($libs | Select-Object -Unique)) {
    $g = Join-Path $l "steamapps\common\Sol Cesto"
    if (Test-Path -LiteralPath (Join-Path $g "package.nw")) { return $g }
  }
  return $null
}

function Pick-Folder {
  Add-Type -AssemblyName System.Windows.Forms
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = "Selecciona la carpeta de Sol Cesto (la que contiene SolCesto.exe y package.nw)"
  $d.ShowNewFolderButton = $false
  if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $d.SelectedPath }
  return $null
}

function Test-Writable([string]$dir) {
  try {
    $probe = Join-Path $dir (".legado_test_" + [guid]::NewGuid().ToString("N"))
    [IO.File]::WriteAllText($probe, "ok")
    Remove-Item -LiteralPath $probe -Force
    return $true
  } catch { return $false }
}

function Restart-Elevated([string]$game) {
  Say "  Se necesitan permisos de administrador para escribir en la carpeta del juego." "Yellow"
  Say "  Windows te pedira confirmacion..." "Yellow"
  $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-Elevated", "-GamePath", "`"$game`"")
  if ($Uninstall) { $argList += "-Uninstall" }
  try { Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Verb RunAs -Wait } catch { Fail "No se obtuvieron permisos de administrador." }
  exit 0
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Test-Patched([string]$pkg) {
  $z = [System.IO.Compression.ZipFile]::OpenRead($pkg)
  try { return [bool]($z.Entries | Where-Object { $_.FullName -eq "mods/legado.js" }) }
  finally { $z.Dispose() }
}

# ---------------------------------------------------------------------------
Title

if (-not $GamePath) {
  Say "  Buscando Sol Cesto en tus bibliotecas de Steam..."
  $GamePath = Find-Game
  if (-not $GamePath) {
    Say "  No lo encontre automaticamente. Elige la carpeta del juego en la ventana." "Yellow"
    $GamePath = Pick-Folder
  }
}
if (-not $GamePath -or -not (Test-Path -LiteralPath (Join-Path $GamePath "package.nw"))) {
  Fail "No se encontro package.nw en la carpeta indicada. Verifica que Sol Cesto este instalado."
}
Say "  Juego encontrado: $GamePath" "Green"

if (Get-Process -Name "SolCesto" -ErrorAction SilentlyContinue) {
  Fail "Sol Cesto esta abierto. Cierralo y vuelve a ejecutar el instalador."
}
if (-not (Test-Writable $GamePath)) { Restart-Elevated $GamePath }

$Pkg = Join-Path $GamePath "package.nw"
$Bak = Join-Path $GamePath "package.nw.original"

# ---------------------------------------------------------------------------
# Desinstalar
# ---------------------------------------------------------------------------
if ($Uninstall) {
  if (Test-Path -LiteralPath $Bak) {
    Copy-Item -LiteralPath $Bak -Destination $Pkg -Force
    Remove-Item -LiteralPath $Bak -Force
    Remove-Item -LiteralPath (Join-Path $GamePath "legado_log.txt") -Force -ErrorAction SilentlyContinue
    Write-Host ""
    Say "  [OK] Legado desinstalado. El juego quedo como el original." "Green"
    Say "  (Tu progreso del mod se conserva por si lo vuelves a instalar.)" "DarkGray"
  } elseif (-not (Test-Patched $Pkg)) {
    Say "  [OK] Legado no estaba instalado." "Green"
  } else {
    Fail "No encontre el respaldo original. En Steam: clic derecho en Sol Cesto > Propiedades > Archivos instalados > Verificar integridad."
  }
  Write-Host ""
  Finish 0
}

# ---------------------------------------------------------------------------
# Instalar / actualizar
# ---------------------------------------------------------------------------
foreach ($f in $ModFiles) {
  $p = Join-Path $ModDir $f
  if (-not (Test-Path -LiteralPath $p)) { Fail "Falta el archivo mods\$f. Descomprime el ZIP completo antes de instalar." }
  try { Unblock-File -LiteralPath $p } catch {}
}

if (-not (Test-Patched $Pkg)) {
  # package.nw es el original (instalacion nueva o despues de una actualizacion de Steam)
  Say "  Creando respaldo del juego original (package.nw.original)..."
  Copy-Item -LiteralPath $Pkg -Destination $Bak -Force
} elseif (-not (Test-Path -LiteralPath $Bak)) {
  Fail "El juego ya tiene mods pero no encuentro el respaldo. Verifica la integridad de los archivos en Steam y vuelve a intentar."
} else {
  Say "  Legado ya estaba instalado: se actualizara a esta version."
}

Say "  Instalando Legado (puede tardar unos segundos)..."
$Tmp = Join-Path $env:TEMP ("legado_" + [guid]::NewGuid().ToString("N") + ".nw")
Copy-Item -LiteralPath $Bak -Destination $Tmp -Force
$zip = [System.IO.Compression.ZipFile]::Open($Tmp, [System.IO.Compression.ZipArchiveMode]::Update)
try {
  # package.json: inyectar el cargador de mods
  $entry = $zip.GetEntry("package.json")
  if (-not $entry) { throw "package.json no encontrado dentro de package.nw" }
  $sr = New-Object IO.StreamReader($entry.Open())
  $json = $sr.ReadToEnd()
  $sr.Close()
  if ($json -match '"inject_js_end"') {
    $json = [regex]::Replace($json, '"inject_js_end"\s*:\s*"[^"]*"', '"inject_js_end": "mods/loader.js"')
  } else {
    $i = $json.IndexOf("{")
    $json = $json.Insert($i + 1, "`n`t`"inject_js_end`": `"mods/loader.js`",")
  }
  $entry.Delete()
  $newEntry = $zip.CreateEntry("package.json")
  $sw = New-Object IO.StreamWriter($newEntry.Open(), (New-Object Text.UTF8Encoding($false)))
  $sw.Write($json)
  $sw.Close()

  # archivos del mod
  foreach ($f in $ModFiles) {
    $old = $zip.GetEntry("mods/$f")
    if ($old) { $old.Delete() }
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $ModDir $f), "mods/$f")
  }
} finally {
  $zip.Dispose()
}
Copy-Item -LiteralPath $Tmp -Destination $Pkg -Force
Remove-Item -LiteralPath $Tmp -Force -ErrorAction SilentlyContinue

if (-not (Test-Patched $Pkg)) { Fail "Algo salio mal al instalar. Tu juego original esta respaldado en package.nw.original." }

Write-Host ""
Say "  [OK] Legado instalado correctamente." "Green"
Write-Host ""
Say "  - Abre Sol Cesto desde Steam." "Gray"
Say "  - En el menu principal haz clic en el medallon LEGADO o presiona F7." "Gray"
Say "  - Si Steam actualiza el juego, vuelve a ejecutar INSTALAR.bat." "Gray"
Write-Host ""
Finish 0
