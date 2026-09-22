"""Constrain imagegen paint to large structural UV islands, sync GLB/PNG aliases.

Usage: python tools/install_naval_repaint.py KIND GENERATED_IMAGE
The original is archived once under build/naval-style-review/source/.
"""
import json
from pathlib import Path
import struct
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from collections import deque

def label(mask):
    h,w=mask.shape
    labels=np.zeros((h,w),dtype=np.int32)
    count=0
    for y,x in zip(*np.nonzero(mask)):
        if labels[y,x]: continue
        count+=1; labels[y,x]=count; queue=deque([(y,x)])
        while queue:
            yy,xx=queue.popleft()
            for ny,nx in ((yy-1,xx),(yy+1,xx),(yy,xx-1),(yy,xx+1)):
                if 0<=ny<h and 0<=nx<w and mask[ny,nx] and not labels[ny,nx]:
                    labels[ny,nx]=count; queue.append((ny,nx))
    return labels,count

ROOT = Path(__file__).resolve().parents[1]
kind, generated = sys.argv[1:]
assets = ROOT / 'assets/models'
archive = ROOT / 'build/naval-style-review/source'
archive.mkdir(parents=True, exist_ok=True)
canonical = assets / f'{kind}_albedo.png'
original = archive / canonical.name
if not original.exists(): original.write_bytes(canonical.read_bytes())
base = Image.open(original).convert('RGB')

def read_glb(path):
    blob = path.read_bytes()
    length = struct.unpack_from('<I', blob, 12)[0]
    return json.loads(blob[20:20+length]), blob[28+length:]

data, binary = read_glb(assets / f'{kind}.glb')
def accessor(index):
    a = data['accessors'][index]
    v = data['bufferViews'][a['bufferView']]
    dtype = {5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
    width = {'VEC2':2, 'SCALAR':1}[a['type']]
    offset = v.get('byteOffset',0)+a.get('byteOffset',0)
    stride = v.get('byteStride',np.dtype(dtype).itemsize*width)
    return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=offset,strides=(stride,np.dtype(dtype).itemsize))

mask_image = Image.new('L',base.size)
draw = ImageDraw.Draw(mask_image)
groups = {'hull','island','superstructure','hangar','bow_ramp'}
for node in data['nodes']:
    if node.get('name') not in groups or 'mesh' not in node: continue
    for p in data['meshes'][node['mesh']]['primitives']:
        uv = accessor(p['attributes']['TEXCOORD_0']) * np.array(base.size)
        indices = accessor(p['indices']).reshape(-1,3)
        for triangle in indices:
            draw.polygon([tuple(x) for x in uv[triangle]],fill=255)
components, count = label(np.array(mask_image)>0)
sizes = np.bincount(components.ravel())
large = sizes[components]>=700
large[components==0] = False
src = np.array(base).astype(float)
high, low = src.max(2), src.min(2)
# Preserve the exact original glass, waterline, text, lights and saturated marks.
paint = large & (low>=38) & (high<=125) & ((high-low)/np.maximum(high,1)<0.32)
mask = Image.fromarray((paint*255).astype('uint8')).filter(ImageFilter.MinFilter(3))
mask.save(archive / f'{kind}_paint_mask.png')
gen = Image.open(generated).convert('RGB').resize(base.size,Image.Resampling.LANCZOS)
# Keep imagegen as painted style assistance. Retain original UV information.
gen = gen.filter(ImageFilter.GaussianBlur(0.55))
alpha = np.array(mask).astype(float)[...,None]/255*0.68
painted = np.array(gen).astype(float)
# Constrain hue and overall value drift; palette logic uses the original color.
ratio = np.clip(painted.mean(2)/np.maximum(src.mean(2),1),0.7,1.4)
result = np.clip(src*(1-alpha)+src*ratio[...,None]*alpha,0,255).astype('uint8')
Image.fromarray(result,'RGB').save(canonical,optimize=True)
png = canonical.read_bytes()
for alias in assets.glob(f'{kind}*albedo.png'): alias.write_bytes(png)
for model in assets.glob(f'{kind}*.glb'):
    if 'collision' in model.name: continue
    backup = archive / model.name
    if not backup.exists(): backup.write_bytes(model.read_bytes())
    j,b = read_glb(model)
    for image in j.get('images',[]):
        vi = image['bufferView']; view = j['bufferViews'][vi]
        start = view.get('byteOffset',0); end = start+view['byteLength']
        old_padded = (end+3)//4*4
        payload = png+b'\0'*((-len(png))%4)
        delta = len(payload)-(old_padded-start)
        b = b[:start]+payload+b[old_padded:]
        view['byteLength'] = len(png)
        for index,v in enumerate(j['bufferViews']):
            if index!=vi and v.get('byteOffset',0)>=old_padded: v['byteOffset'] += delta
    j['buffers'][0]['byteLength']=len(b)
    js=json.dumps(j,separators=(',',':')).encode(); js+=b' '*((-len(js))%4)
    model.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(b))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(b),0x004e4942)+b)
print(kind,'painted structural pixels',int(paint.sum()),'of',paint.size)

