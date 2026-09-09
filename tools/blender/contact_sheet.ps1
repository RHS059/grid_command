param([string]$Asset='soldier',[int]$Revision=7)
Add-Type -AssemblyName System.Drawing
$outDir=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..\outputs\astra_2'))
$bmp=New-Object System.Drawing.Bitmap 1920,1360
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(38,43,48))
$font=New-Object System.Drawing.Font 'Arial',18
$views=@('front','side','back','top','top_3quarter')
for($i=0;$i -lt 5;$i++) {
 $file=Join-Path $outDir ($Asset+'_r'+$Revision+'_'+$views[$i]+'.png')
 $im=[System.Drawing.Image]::FromFile($file)
 $x=($i%3)*640; $y=[math]::Floor($i/3)*680
 $g.DrawImage($im,$x,$y+35,640,640)
 $g.DrawString($views[$i],$font,[System.Drawing.Brushes]::White,$x+15,$y+5)
 $im.Dispose()
}
$g.DrawString(($Asset+' | revision '+$Revision),$font,[System.Drawing.Brushes]::White,1300,760)
$g.DrawString('Eevee / orthographic / faceted',$font,[System.Drawing.Brushes]::White,1300,810)
$bmp.Save((Join-Path $outDir ($Asset+'_contact_sheet.png')),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose();$font.Dispose()
