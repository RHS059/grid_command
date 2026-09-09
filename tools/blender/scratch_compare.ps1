param([int]$Revision=2,[string]$Asset='soldier_scratch')
Add-Type -AssemblyName System.Drawing
$outDir=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..\outputs\astra_2'))
$stats=Get-Content (Join-Path $outDir 'soldier_scratch_stats.json') -Raw | ConvertFrom-Json
$bounds=$stats.front_bounds_pixels
$scale=($bounds.bottom-$bounds.top)/1100
$bmp=New-Object System.Drawing.Bitmap 1280,680
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(38,43,48))
$font=New-Object System.Drawing.Font 'Arial',18
$ref=[System.Drawing.Image]::FromFile((Join-Path $outDir 'soldier_tpose_reference.png'))
$model=[System.Drawing.Image]::FromFile((Join-Path $outDir ($Asset+'_r'+$Revision+'_front.png')))
# Align reference helmet-top / sole to study head-top / sole; keep source aspect ratio.
$g.DrawImage($ref,[single](320-645*$scale),[single](35+$bounds.top-55*$scale),[single]($ref.Width*$scale),[single]($ref.Height*$scale))
$g.DrawImage($model,640,35,640,640)
$g.DrawString('PRIMARY REFERENCE',$font,[System.Drawing.Brushes]::White,15,5)
$g.DrawString(($Asset+' '+$Revision+' / STATIC'),$font,[System.Drawing.Brushes]::White,655,5)
$bmp.Save((Join-Path $outDir ($Asset+'_front_comparison.png')),[System.Drawing.Imaging.ImageFormat]::Png)
$ref.Dispose();$model.Dispose();$g.Dispose();$bmp.Dispose();$font.Dispose()
