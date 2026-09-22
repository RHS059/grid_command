Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$items = @(
  @('M977 HEMTT', 'build/support-model-review/truck_front_left.png', 'build/support-model-review/truck_rear_right.png'),
  @('Main battle tank', 'build/ground-style-review/tank_close.png', 'build/ground-style-review/tank_red_close.png'),
  @('APC', 'build/ground-style-review/apc_close.png', 'build/ground-style-review/apc_red_close.png'),
  @('Cannon APC', 'build/ground-style-review/cannon_apc_close.png', 'build/ground-style-review/cannon_apc_red_close.png'),
  @('IFV', 'build/ground-style-review/ifv_close.png', 'build/ground-style-review/ifv_red_close.png'),
  @('FQ-44 Fury', 'build/aircraft-style-review/fighter_blue_close.png', 'build/aircraft-style-review/fighter_red_close.png'),
  @('CAS aircraft', 'build/aircraft-style-review/cas_blue_close.png', 'build/aircraft-style-review/cas_red_close.png'),
  @('Recon UAV', 'build/aircraft-style-review/recon_uav_blue_close.png', 'build/aircraft-style-review/recon_uav_red_close.png'),
  @('Transport helicopter', 'build/aircraft-style-review/transport_heli_blue_close.png', 'build/aircraft-style-review/transport_heli_red_close.png'),
  @('Cargo aircraft', 'build/aircraft-style-review/cargo_plane_blue_close.png', 'build/aircraft-style-review/cargo_plane_red_close.png'),
  @('Aircraft carrier', 'build/naval-style-review/aircraft_carrier_blue_front.png', 'build/naval-style-review/aircraft_carrier_red_front.png'),
  @('Missile cruiser', 'build/naval-style-review/missile_cruiser_blue_front.png', 'build/naval-style-review/missile_cruiser_red_front.png'),
  @('Patrol boat', 'build/naval-style-review/patrol_boat_blue_front.png', 'build/naval-style-review/patrol_boat_red_front.png'),
  @('Landing craft', 'build/naval-style-review/landing_craft_blue_front.png', 'build/naval-style-review/landing_craft_red_front.png')
)

$columns = 3
$cellWidth = 800
$cellHeight = 430
$headerHeight = 145
$rows = [Math]::Ceiling($items.Count / $columns)
$canvas = New-Object Drawing.Bitmap ($columns * $cellWidth), ($headerHeight + $rows * $cellHeight)
$graphics = [Drawing.Graphics]::FromImage($canvas)
$graphics.Clear([Drawing.Color]::FromArgb(19, 29, 37))
$graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$titleFont = New-Object Drawing.Font('Arial', 28, [Drawing.FontStyle]::Bold)
$subtitleFont = New-Object Drawing.Font('Arial', 14, [Drawing.FontStyle]::Regular)
$labelFont = New-Object Drawing.Font('Arial', 17, [Drawing.FontStyle]::Bold)
$smallFont = New-Object Drawing.Font('Arial', 11, [Drawing.FontStyle]::Bold)
$white = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(235, 241, 244))
$muted = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(151, 178, 192))
$blue = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(89, 185, 236))
$red = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(231, 133, 114))
$border = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(54, 75, 88)), 2

$graphics.DrawString('GRID COMMAND — 2004 VEHICLE ART APPROVAL', $titleFont, $white, 28, 22)
$graphics.DrawString('Actual Godot renders · BLUFOR FDE (left) · REDFOR pine green (right) · neutral lighting', $subtitleFont, $muted, 31, 72)
$graphics.DrawString('Review silhouette, faction palette, painted cavity depth, selective edge wear, and large-area grunge.', $subtitleFont, $muted, 31, 101)

function Draw-FitImage($graphics, $image, $x, $y, $width, $height) {
  $scale = [Math]::Min($width / $image.Width, $height / $image.Height)
  $drawWidth = [int]($image.Width * $scale)
  $drawHeight = [int]($image.Height * $scale)
  $drawX = [int]($x + ($width - $drawWidth) / 2)
  $drawY = [int]($y + ($height - $drawHeight) / 2)
  $graphics.DrawImage($image, $drawX, $drawY, $drawWidth, $drawHeight)
}

for ($i = 0; $i -lt $items.Count; $i++) {
  $column = $i % $columns
  $row = [Math]::Floor($i / $columns)
  $x = $column * $cellWidth
  $y = $headerHeight + $row * $cellHeight
  $graphics.DrawRectangle($border, $x + 8, $y + 8, $cellWidth - 16, $cellHeight - 16)
  $graphics.DrawString($items[$i][0], $labelFont, $white, $x + 24, $y + 20)
  $graphics.DrawString('BLUFOR', $smallFont, $blue, $x + 28, $y + 57)
  $graphics.DrawString('REDFOR', $smallFont, $red, $x + 414, $y + 57)
  for ($side = 0; $side -lt 2; $side++) {
    $path = Join-Path $root $items[$i][$side + 1]
    $image = [Drawing.Image]::FromFile($path)
    Draw-FitImage $graphics $image ($x + 18 + $side * 390) ($y + 82) 374 320
    $image.Dispose()
  }
}

$outputDir = Join-Path $root 'build/vehicle-art-approval'
[IO.Directory]::CreateDirectory($outputDir) | Out-Null
$output = Join-Path $outputDir 'vehicle-art-approval-gallery.png'
$canvas.Save($output, [Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$canvas.Dispose()
$titleFont.Dispose(); $subtitleFont.Dispose(); $labelFont.Dispose(); $smallFont.Dispose()
$white.Dispose(); $muted.Dispose(); $blue.Dispose(); $red.Dispose(); $border.Dispose()
Write-Output $output

