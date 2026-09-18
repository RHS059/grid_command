"""Apply the approved texture to its locked UV layout."""
import bpy
import hashlib
import json
import os
import shutil
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
STAGE = os.path.join(HERE, 'fighter_r4')
TEXTURE = os.path.join(STAGE, 'fighter_albedo_imagegen_detail.png')
MANIFEST = os.path.join(STAGE, 'fighter_texture_manifest.json')


def layout_fingerprint(objects):
    data = []
    for obj in sorted(objects, key=lambda item: item.name):
        if obj.type != 'MESH':
            continue
        uv = obj.data.uv_layers.active.data
        data.append((obj.name, [tuple(round(value, 7) for value in corner.uv) for corner in uv]))
    return hashlib.sha256(json.dumps(data, separators=(',', ':')).encode()).hexdigest()


def apply(objects):
    with open(MANIFEST) as handle:
        manifest = json.load(handle)
    fingerprint = layout_fingerprint(objects)
    if fingerprint != manifest['uv_layout_sha256']:
        raise RuntimeError('The authored texture requires the locked R4 UV layout.')
    texture = bpy.data.images.load(TEXTURE, check_existing=False)
    if tuple(texture.size) != (1024, 1024):
        raise RuntimeError('The Fury texture must be 1024 by 1024 pixels.')
    destination = os.path.join(STAGE, 'fighter_albedo.png')
    shutil.copy2(TEXTURE, destination)
    texture.name = 'FQ44_1024_BaseColor'
    texture.filepath_raw = destination
    texture.colorspace_settings.name = 'sRGB'
    texture.pack()
    previous = set()
    materials = {material for obj in objects for material in obj.data.materials}
    for material in materials:
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE':
                previous.add(node.image)
                node.image = texture
    for image in previous:
        if image and image != texture and image.users == 0:
            bpy.data.images.remove(image)
    with open(TEXTURE, 'rb') as handle:
        checksum = hashlib.sha256(handle.read()).hexdigest()
    packed_matches = texture.packed_file is not None and hashlib.sha256(texture.packed_file.data).hexdigest() == checksum
    if not packed_matches:
        raise RuntimeError('The packed Blender texture differs from the approved PNG.')
    return {'source': os.path.basename(TEXTURE), 'dimensions': [1024, 1024],
            'texture_sha256': checksum, 'uv_layout_sha256': fingerprint,
            'uv_layout_unchanged': True,
            'blend_packed_texture_matches': packed_matches,
            'description': 'Reference-based grey fields, metal seams, access panels and restrained wear. Existing markings and island layout are retained.'}


def check_export():
    with open(MANIFEST) as handle:
        manifest = json.load(handle)
    results = {}
    for filename, key in [('fighter.json', 'geometry_json_sha256'), ('fighter_rig.json', 'rig_sha256')]:
        with open(os.path.join(STAGE, filename), 'rb') as handle:
            checksum = hashlib.sha256(handle.read()).hexdigest()
        if checksum != manifest[key]:
            raise RuntimeError('The texture pass changed ' + filename)
        results[key] = checksum
    results['geometry_and_rig_unchanged'] = True
    with open(os.path.join(STAGE, 'fighter.glb'), 'rb') as handle:
        glb = handle.read()
    json_size = struct.unpack_from('<I', glb, 12)[0]
    document = json.loads(glb[20:20 + json_size])
    assert len(document['images']) == len(document['textures']) == 1
    view = document['bufferViews'][document['images'][0]['bufferView']]
    start = 28 + json_size + view.get('byteOffset', 0)
    embedded = glb[start:start + view['byteLength']]
    with open(TEXTURE, 'rb') as handle:
        texture = handle.read()
    if hashlib.sha256(embedded).digest() != hashlib.sha256(texture).digest():
        raise RuntimeError('The GLB texture differs from the approved PNG.')
    results['glb_embedded_texture_matches'] = True
    return results
