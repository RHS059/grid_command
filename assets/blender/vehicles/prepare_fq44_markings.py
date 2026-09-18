from pathlib import Path
import argparse
from PIL import Image,ImageDraw,ImageFont
parser=argparse.ArgumentParser();parser.add_argument('--font',default='arialbd.ttf');args=parser.parse_args()
root=Path(__file__).parent/'fighter_r2'/'markings'
root.mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype(args.font,100)
for text in ['YFQ-44A','AI','0043']:
    bounds=font.getbbox(text);image=Image.new('L',(bounds[2]+16,bounds[3]-bounds[1]+16),0)
    ImageDraw.Draw(image).text((8,8-bounds[1]),text,fill=255,font=font)
    image.save(root/(text+'.png'))
