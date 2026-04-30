# Set your module's sounds root directory
$root = $PSScriptRoot

$scriptDir = $PSScriptRoot
Write-Host "The script directory is: $scriptDir"

function Build-Tree($dir, $prefix = "") {
    $result = @{}

    Get-ChildItem -LiteralPath $dir | ForEach-Object {
        if ($_.PSIsContainer) {
            # Recurse into subfolder
            $result[$_.Name] = Build-Tree $_.FullName ($prefix + $_.Name + "/")
        } elseif ($_.Extension -eq ".mp3") {
            $fileKey = "file$($result.Count)"
            $result[$fileKey] = @{
                name = $_.BaseName
                file = ($prefix + $_.Name)   # <-- relative path from sounds root
            }
        }
    }

    return $result
}

$tree = @{ root = Build-Tree $root }
$outFile = Join-Path $root "soundboard.json"
$tree | ConvertTo-Json -Depth 10 | Set-Content $outFile

Write-Host "soundboard.json created at $outFile"
