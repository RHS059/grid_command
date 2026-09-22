"""Read-only inventory of naval GLB image, UV, material and alias contracts."""
import hashlib
import json
from pathlib import Path
import struct
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
KINDS = ('aircraft_carrier', 'missile_cruiser', 'patrol_boat', 'landing_craft')
report = {}
for kind in KINDS:
    assets = ROOT / 'assets/models'
    canonical = assets / f'{kind}_albedo.png'
    image = Image.open(canonical)
    digest = hashlib.sha256(canonical.read_bytes()).hexdigest()
    entry = dict(size=list(image.size), mode=image.mode, sha256=digest, aliases={}, models={})
    archive = ROOT / 'build/naval-style-review/source'
    if (archive / canonical.name).exists():
        before = np.array(Image.open(archive / canonical.name))
        after = np.array(image)
        mask = np.array(Image.open(archive / f'{kind}_paint_mask.png')) > 0
        assert not np.any(before[~mask] != after[~mask]), 'Protected pixels changed'
        entry['protected_pixels_unchanged'] = True
        entry['changed_pixels'] = int(np.any(before != after, axis=2).sum())
    for alias in assets.glob(f'{kind}*albedo.png'):
        entry['aliases'][alias.name] = hashlib.sha256(alias.read_bytes()).hexdigest() == digest
    for model in assets.glob(f'{kind}*.glb'):
        if 'collision' in model.name:
            continue
        blob = model.read_bytes()
        length = struct.unpack_from('<I', blob, 12)[0]
        data = json.loads(blob[20:20 + length])
        binary = blob[28 + length:]
        images = []
        for item in data.get('images', []):
            view = data['bufferViews'][item['bufferView']]
            start = view.get('byteOffset', 0)
            raw = binary[start:start + view['byteLength']]
            images.append(dict(name=item.get('name'), canonical_match=hashlib.sha256(raw).hexdigest() == digest))
        entry['models'][model.name] = dict(
            images=images,
            groups=[node.get('name') for node in data['nodes'] if 'mesh' in node],
            materials=[m.get('name') for m in data.get('materials', [])],
            uv_accessors=[p['attributes'].get('TEXCOORD_0') for m in data['meshes'] for p in m['primitives']],
        )
        if (archive / model.name).exists():
            old_blob = (archive / model.name).read_bytes()
            old_length = struct.unpack_from('<I', old_blob, 12)[0]
            old_data = json.loads(old_blob[20:20+old_length])
            old_binary = old_blob[28+old_length:]
            for key in ('accessors', 'meshes', 'nodes', 'materials', 'textures'):
                assert old_data.get(key) == data.get(key), (model.name, key)
            image_views = {i['bufferView'] for i in data.get('images', [])}
            for index, view in enumerate(data['bufferViews']):
                if index in image_views: continue
                old_view = old_data['bufferViews'][index]
                a = view.get('byteOffset',0); b = old_view.get('byteOffset',0)
                assert binary[a:a+view['byteLength']] == old_binary[b:b+old_view['byteLength']], (model.name,index)
            entry['models'][model.name]['geometry_and_uv_bytes_unchanged'] = True
    report[kind] = entry
out = ROOT / 'build/naval-style-review/contract.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2) + '\n')
assert all(all(x['aliases'].values()) for x in report.values())
assert all(i['canonical_match'] for x in report.values() for m in x['models'].values() for i in m['images'])
print('NAVAL_CONTRACT_OK', len(report), 'families')

