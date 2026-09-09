param([int]$Revision=3)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.Common,System.Drawing.Primitives -TypeDefinition @'
using System.Drawing;
public static class SoldierOutline {
 public static Bitmap Build(Bitmap source) {
  Bitmap output=new Bitmap(source.Width,source.Height);
  for(int y=1;y<source.Height-1;y++)for(int x=1;x<source.Width-1;x++)
   if(source.GetPixel(x,y).A>128 && (source.GetPixel(x-1,y).A<128 || source.GetPixel(x+1,y).A<128 || source.GetPixel(x,y-1).A<128 || source.GetPixel(x,y+1).A<128))output.SetPixel(x,y,Color.Cyan);
  return output;
 }
}
'@
$outDir=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..\outputs\astra_2'))
$stats=Get-Content (Join-Path $outDir 'soldier_scratch_equipped_stats.json') -Raw | ConvertFrom-Json
foreach($view in @('front','side','top_3quarter')) {
 $refName=switch($view){'front'{'soldier_tpose_reference.png'}'side'{'soldier_tpose_side_reference.png'}default{'soldier_tpose_3quarter_reference.png'}}
 $bounds=$stats.view_bounds.$view;$scale=($bounds.bottom-$bounds.top)/1125
 $reference=[System.Drawing.Image]::FromFile((Join-Path $outDir $refName))
 $model=[System.Drawing.Image]::FromFile((Join-Path $outDir ('soldier_scratch_equipped_r'+$Revision+'_'+$view+'.png')))
 $alpha=[System.Drawing.Bitmap]::FromFile((Join-Path $outDir ('soldier_scratch_equipped_r'+$Revision+'_'+$view+'_alpha.png')))
 $font=New-Object System.Drawing.Font 'Arial',17
 $comparison=New-Object System.Drawing.Bitmap 1280,680;$g=[System.Drawing.Graphics]::FromImage($comparison);$g.Clear([System.Drawing.Color]::FromArgb(38,43,48))
 $g.DrawImage($reference,[single](320-645*$scale),[single](35+$bounds.top-30*$scale),[single]($reference.Width*$scale),[single]($reference.Height*$scale));$g.DrawImage($model,640,35,640,640)
 $g.DrawString(('REFERENCE '+$view),$font,[System.Drawing.Brushes]::White,15,5);$g.DrawString(('SCRATCH EQUIPPED '+$Revision),$font,[System.Drawing.Brushes]::White,655,5)
 $comparison.Save((Join-Path $outDir ('soldier_scratch_'+$view+'_comparison.png')),[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$comparison.Dispose()
 $overlay=New-Object System.Drawing.Bitmap 640,680;$g=[System.Drawing.Graphics]::FromImage($overlay);$g.Clear([System.Drawing.Color]::FromArgb(38,43,48))
 $g.DrawImage($reference,[single](320-645*$scale),[single](35+$bounds.top-30*$scale),[single]($reference.Width*$scale),[single]($reference.Height*$scale));$outline=[SoldierOutline]::Build($alpha);$g.DrawImage($outline,0,35,640,640);$g.DrawString(('CYAN MODEL OUTLINE / '+$view),$font,[System.Drawing.Brushes]::White,10,5)
 $overlay.Save((Join-Path $outDir ('soldier_scratch_'+$view+'_overlay.png')),[System.Drawing.Imaging.ImageFormat]::Png)
 $outline.Dispose();$g.Dispose();$overlay.Dispose();$reference.Dispose();$model.Dispose();$alpha.Dispose();$font.Dispose()
}

