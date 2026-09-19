"""Author a destroy-only, capped FQ-44 model from the exact shipped R4 GLB.

Run in Blender 4.5 with --background --factory-startup --python-exit-code 1.
The intact aircraft, UVs, texture bytes and rig are never rewritten. The output
JSON uses the same indexed packed Part representation as blender-vehicles.ts.
"""
import base64
import hashlib
import json
import math
import os
import struct
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../../..'))
OUT = os.path.join(HERE, 'fighter_breakup')
SOURCE = os.path.join(REPO, 'public/models/fighter.glb')
ATLAS = os.path.join(REPO, 'public/models/fighter_albedo.png')
DESTINATION = os.path.join(REPO, 'lib/game/generated/fighter_breakup.json')
sys.path.insert(0, HERE)
import fq44_normals_audit

# Gameplay tuning, not measured engineering data. Fractions total exactly one.
SECTIONS = {
    'nose': (.12, .52, 'center'),
    'wing_L': (.105, .42, 'center'),
    'wing_R': (.105, .42, 'center'),
    'tail': (.08, .36, 'engine'),
    'engine': (.20, .68, 'center'),
    'center': (.30, 1.0, None),
    'gear_N': (.02, .26, 'center'),
    'gear_L': (.035, .30, 'center'),
    'gear_R': (.035, .30, 'center'),
}
CUTS = {'nose': [(2.4, 1)], 'center': [(2.4, -1), (-3.15, 1)],
        'engine': [(-3.15, -1)]}
OPEN_SHELLS = {'sensor_dark_window_astra_r_4',
               'single_exhaust_nozzle_astra_r_4',
               'ventral_intake_depth_astra_r_4'}


def sha(path):
    with open(path, 'rb') as stream:
        return hashlib.sha256(stream.read()).hexdigest()


def read_glb(path):
    raw = open(path, 'rb').read()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    blob = raw[28 + size:]

    def accessor(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']]
        width = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'SCALAR': 1}[a['type']]
        if view.get('byteStride'):
            raise ValueError('Interleaved accessors require an explicit reader update')
        return np.frombuffer(blob, dtype=dtype, count=a['count'] * width,
                             offset=view.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape((-1, width))

    records = []

    def walk(index, parent, part='hull', section=None):
        node = doc['nodes'][index]
        name = node.get('name', '')
        if name.startswith('Assembly_'):
            part = name[9:]
        if name.startswith('BreakSection_'):
            section = name[len('BreakSection_'):]
        rotation = node.get('rotation', [0, 0, 0, 1])
        matrix = Matrix.LocRotScale(Vector(node.get('translation', [0, 0, 0])),
                                   Quaternion((rotation[3], *rotation[:3])),
                                   Vector(node.get('scale', [1, 1, 1])))
        world = parent @ matrix
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                a = primitive['attributes']
                points = np.array([world @ Vector(p) for p in accessor(a['POSITION'])])
                normal_matrix = world.to_3x3().inverted().transposed()
                normals = np.array([(normal_matrix @ Vector(n)).normalized() for n in accessor(a['NORMAL'])])
                records.append({'name': name, 'part': part, 'section': section,
                                'p': points, 'normals': normals,
                                'uv': accessor(a['TEXCOORD_0']).astype(float),
                                'indices': accessor(primitive['indices']).reshape((-1, 3)).astype(int),
                                'extras': node.get('extras', {})})
        for child in node.get('children', []):
            walk(child, world, part, section)

    for index in doc['scenes'][doc.get('scene', 0)]['nodes']:
        walk(index, Matrix.Identity(4))
    return doc, records


def classify(record):
    name, part = record['name'], record['part']
    if part.startswith('gear_'):
        return part
    if name.startswith('fixed_trunnion_'):
        return 'gear_' + name[len('fixed_trunnion_')]
    if part.startswith('tail_') or name.startswith(('single_vertical_tail', 'tail_root_fairing')):
        return 'tail'
    if part.startswith('control_'):
        return 'wing_' + part[-1]
    if name.startswith(('main_wing', 'wing_', 'wingtip_', 'weapon_pylon_', 'paired_store_rack_', 'rack_clamp_')):
        return 'wing_L' if record['p'][:, 0].mean() < 0 else 'wing_R'
    if name.startswith(('nose_probe', 'probe_vane', 'sensor_dark_window')):
        return 'nose'
    if name.startswith(('single_exhaust', 'exhaust_recess')):
        return 'engine'
    return 'center'


def reserve_cap_uv(records):
    """Find an unused 32px atlas patch, with 8px safety on every side.

    The six-sided box collider and planar caps are intentionally economical.
    The four cap faces intentionally reuse this one unpainted gray patch.
    """
    occupied = np.zeros((1024, 1024), dtype=bool)
    for record in records:
        for indices in record['indices']:
            tri = record['uv'][indices] * 1024
            low = np.maximum(np.floor(tri.min(axis=0)).astype(int) - 1, 0)
            high = np.minimum(np.ceil(tri.max(axis=0)).astype(int) + 1, 1023)
            # Conservative triangle bounds are sufficient to reserve unused space.
            occupied[low[1]:high[1]+1, low[0]:high[0]+1] = True
    for y in range(8, 984, 8):
        for x in range(8, 984, 8):
            if not occupied[y-8:y+40, x-8:x+40].any():
                return [x / 1024, y / 1024, (x+32) / 1024, (y+32) / 1024]
    raise RuntimeError('No safe atlas patch for fracture interiors; do not alter the approved atlas')


def clipped_body(record, section, uv_patch):
    """Clip exterior triangles with interpolated UVs/normals, then close cuts.

    Dedup includes position, UV and normal so valid GLB seam duplicates survive.
    Cross-section loops retain collinear source vertices to make diagnostic
    welding manifold. No intact model or existing atlas coordinate is edited.
    """
    source = np.concatenate((record['p'], record['normals'], record['uv']), axis=1)
    triangles = []
    source_triangles = []
    for triangle_index, indices in enumerate(record['indices']):
        polygon = [source[i].copy() for i in indices]
        for height, direction in CUTS[section]:
            clipped = []
            for previous, current in zip(polygon[-1:] + polygon[:-1], polygon):
                before = direction * (previous[1] - height)
                after = direction * (current[1] - height)
                if (before >= -1e-8) != (after >= -1e-8):
                    t = (height - previous[1]) / (current[1] - previous[1])
                    value = previous + t * (current - previous)
                    value[1] = height
                    value[3:6] /= np.linalg.norm(value[3:6])
                    clipped.append(value)
                if after >= -1e-8:
                    clipped.append(current)
            polygon = clipped
            if not polygon:
                break
        for i in range(1, len(polygon)-1):
            tri = [polygon[0], polygon[i], polygon[i+1]]
            if np.linalg.norm(np.cross(tri[1][:3]-tri[0][:3], tri[2][:3]-tri[0][:3])) > 1e-10:
                triangles.append(tri)
                source_triangles.append(triangle_index)

    caps = []
    for height, direction in CUTS[section]:
        edges = {}
        for tri in triangles:
            for a, b in zip(tri, tri[1:] + tri[:1]):
                if abs(a[1]-height) < 1e-7 and abs(b[1]-height) < 1e-7:
                    ka, kb = tuple(np.round(a[:3], 6)), tuple(np.round(b[:3], 6))
                    if ka != kb:
                        edges[tuple(sorted((ka, kb)))] = (a[:3], b[:3])
        if not edges:
            raise RuntimeError('Missing hull cross-section ' + section)
        neighbors = {}
        coordinates = {}
        for ka, kb in edges:
            a, b = edges[(ka, kb)]
            # edges were sorted independently of their original winding.
            coordinates[tuple(np.round(a, 6))] = a
            coordinates[tuple(np.round(b, 6))] = b
            neighbors.setdefault(ka, []).append(kb)
            neighbors.setdefault(kb, []).append(ka)
        assert all(len(items) == 2 for items in neighbors.values()), (section, 'non-loop cut')
        start = min(neighbors)
        loop, previous, current = [], None, start
        while True:
            loop.append(coordinates[current])
            following = next(item for item in neighbors[current] if item != previous)
            previous, current = current, following
            if current == start:
                break
            if len(loop) > len(neighbors):
                raise RuntimeError('Cross-section failed to close')
        assert len(loop) == len(neighbors), 'Multiple loops need separate cap authoring'
        center = np.mean(loop, axis=0)
        low, high = np.min(loop, axis=0), np.max(loop, axis=0)
        normal = np.array([0, -direction, 0], dtype=float)

        def cap_vertex(point):
            u = (point[0]-low[0]) / (high[0]-low[0])
            v = (point[2]-low[2]) / (high[2]-low[2])
            uv = [uv_patch[0] + u*(uv_patch[2]-uv_patch[0]), uv_patch[1] + v*(uv_patch[3]-uv_patch[1])]
            return np.concatenate((point, normal, uv))

        for a, b in zip(loop, loop[1:] + loop[:1]):
            if np.dot(np.cross(a-center, b-center), normal) < 0:
                a, b = b, a
            caps.append([cap_vertex(center), cap_vertex(a), cap_vertex(b)])

    values, indices, lookup = [], [], {}
    for tri in triangles + caps:
        face = []
        for vertex in tri:
            key = tuple(np.round(vertex, 7))
            if key not in lookup:
                lookup[key] = len(values)
                values.append(vertex)
            face.append(lookup[key])
        indices.append(face)
    values = np.array(values)
    return {'name': record['name'], 'part': record['part'], 'section': section,
            'p': values[:, :3], 'normals': values[:, 3:6], 'uv': values[:, 6:8],
            'indices': np.array(indices), 'sourceTriangles': sorted(set(source_triangles)),
            'exteriorTriangles': len(triangles), 'capTriangles': len(caps)}


def mesh_health(objects):
    results = []
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
        boundary = sum(edge.is_boundary for edge in bm.edges)
        nonmanifold = sum(not edge.is_manifold for edge in bm.edges)
        zero = sum(face.calc_area() < 1e-10 for face in bm.faces)
        volume = bm.calc_volume(signed=True) if boundary == 0 else None
        results.append({'name': obj.name, 'sourceObject': obj.get('sourceObject'),
                        'boundaryEdges': boundary, 'nonmanifoldEdges': nonmanifold,
                        'zeroAreaFaces': zero, 'signedVolume': volume,
                        'intentionalOpenSurface': obj.get('sourceObject') in OPEN_SHELLS})
        bm.free()
    return results


def compact_ranges(values):
    ranges = []
    for value in values:
        if ranges and value == ranges[-1][0] + ranges[-1][1]:
            ranges[-1][1] += 1
        else:
            ranges.append([value, 1])
    return ranges


def surface_area(record, limit=None):
    triangles = record['p'][record['indices'][:limit]]
    return float(np.linalg.norm(np.cross(triangles[:, 1]-triangles[:, 0],
                                         triangles[:, 2]-triangles[:, 0]), axis=1).sum() / 2)


def signed_volume(record):
    triangles = record['p'][record['indices']]
    return float(np.einsum('ij,ij->i', triangles[:, 0],
                          np.cross(triangles[:, 1], triangles[:, 2])).sum() / 6)


def packed_part(records):
    points, normals, uv, indices, ranges = [], [], [], [], []
    for record in records:
        vertex_start, index_start = len(points), len(indices)
        points.extend(record['p'])
        normals.extend(record['normals'])
        uv.extend(record['uv'])
        indices.extend((record['indices'].ravel() + vertex_start).tolist())
        ranges.append({'objectName': record['name'], 'sourceObject': record['extras']['sourceObject'],
                       'sourcePart': record['extras']['sourcePart'], 'vertexStart': vertex_start,
                       'vertexCount': len(record['p']), 'indexStart': index_start,
                       'indexCount': len(record['indices']) * 3})
    points = np.array(points)
    scale = max(abs(points).max() / 16380, 1e-6)
    quantized = np.clip(np.round(points.ravel() / scale), -16384, 16383).astype(int)
    packed = bytearray()
    buffer = bits = 0
    for value in quantized:
        buffer |= (int(value) & 0x7fff) << bits
        bits += 15
        while bits >= 8:
            packed.append(buffer & 255)
            buffer >>= 8
            bits -= 8
    if bits:
        packed.append(buffer & 255)
    part = {'q': base64.b64encode(packed).decode(), 'n': len(quantized), 's': float(scale),
            'i': base64.b64encode(bytes((len(points)+1)//2)).decode(), 'palette': [[1, 1, 1]],
            'indices': indices, 'normals': np.round(normals, 6).ravel().tolist(),
            'uv': np.round(uv, 6).ravel().tolist(), 'texture': '/models/fighter_albedo.png'}
    return part, ranges, points


def render_evidence(objects, pivots, exploded=False):
    offsets = {'nose': (0, 1.8, .45), 'wing_L': (-1.5, 0, .35), 'wing_R': (1.5, 0, .35),
               'tail': (0, -1, 1.5), 'engine': (0, -1.8, 0), 'center': (0, 0, 0),
               'gear_N': (0, .6, -.7), 'gear_L': (-.7, 0, -.7), 'gear_R': (.7, 0, -.7)}
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.eevee.taa_render_samples = 32
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Breakup studio')
    scene.world.color = (.13, .15, .18)
    if not scene.camera:
        target = Vector((0, .1, 1.25))
        for location, power, size in [((4, 5, 9), 1900, 7), ((-6, 2, 5), 1600, 6), ((0, -8, 6), 1800, 5)]:
            bpy.ops.object.light_add(type='AREA', location=location)
            lamp = bpy.context.object
            lamp.data.energy, lamp.data.shape, lamp.data.size = power, 'DISK', size
            lamp.rotation_euler = (target-lamp.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.ops.object.camera_add(location=(12, 17, 12))
        camera = bpy.context.object
        camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.type, camera.data.ortho_scale = 'ORTHO', 15
        scene.camera = camera
    for obj in objects:
        if exploded:
            obj.location += Vector(offsets[obj['section']])
    bpy.context.view_layer.update()
    camera = scene.camera
    coords = [camera.matrix_world.inverted() @ obj.matrix_world @ vertex.co
              for obj in objects for vertex in obj.data.vertices]
    low = Vector((min(point.x for point in coords), min(point.y for point in coords), 0))
    high = Vector((max(point.x for point in coords), max(point.y for point in coords), 0))
    camera.data.ortho_scale = max(high.x-low.x, (high.y-low.y)*1.4) * 1.12
    camera.location += camera.rotation_euler.to_matrix() @ ((low+high)/2)
    scene.render.filepath = os.path.join(OUT, 'exploded.png' if exploded else 'assembled.png')
    bpy.ops.render.render(write_still=True)
    for obj in objects:
        if exploded:
            obj.location -= Vector(offsets[obj['section']])


def main():
    os.makedirs(OUT, exist_ok=True)
    originals = {SOURCE: sha(SOURCE), ATLAS: sha(ATLAS),
                 os.path.join(REPO, 'lib/game/generated/fighter.json'): sha(os.path.join(REPO, 'lib/game/generated/fighter.json'))}
    doc, source = read_glb(SOURCE)
    assert len(doc['materials']) == len(doc['images']) == len(doc['textures']) == 1
    uv_patch = reserve_cap_uv(source)
    sections = {key: [] for key in SECTIONS}
    for record in source:
        if record['name'] == 'fury_chined_fuselage_astra_r_4':
            for section in CUTS:
                sections[section].append(clipped_body(record, section, uv_patch))
        else:
            section = classify(record)
            record.update(section=section, sourceTriangles=list(range(len(record['indices']))),
                          exteriorTriangles=len(record['indices']), capTriangles=0)
            sections[section].append(record)
    source_body = next(record for record in source if record['name'] == 'fury_chined_fuselage_astra_r_4')
    body_pieces = [record for records in sections.values() for record in records
                   if record['name'] == source_body['name']]
    body_volume = signed_volume(source_body)
    piece_volume = sum(signed_volume(record) for record in body_pieces)
    source_area = surface_area(source_body)
    piece_area = sum(surface_area(record, record['exteriorTriangles']) for record in body_pieces)
    assert abs(body_volume-piece_volume) < 1e-6, 'Hull cuts changed the enclosed volume'
    assert abs(source_area-piece_area) < 1e-6, 'Hull cuts changed exterior surface area'
    assert set().union(*(set(record['sourceTriangles']) for record in body_pieces)) == set(range(len(source_body['indices'])))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    image = bpy.data.images.load(ATLAS)
    assert list(image.size) == [1024, 1024]
    image.pack()
    material = bpy.data.materials.new('FQ44_Breakup_Shared_Atlas')
    material.use_nodes = True
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    shader = material.node_tree.nodes.get('Principled BSDF')
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = .85
    objects, pivots, source_ranges = [], {}, []
    for section, records in sections.items():
        coords = np.concatenate([record['p'] for record in records])
        pivot = (coords.min(axis=0) + coords.max(axis=0)) / 2
        pivots[section] = pivot
        group = bpy.data.objects.new('BreakSection_' + section, None)
        bpy.context.scene.collection.objects.link(group)
        group.location = pivot
        group['section'] = section
        for record in records:
            name = section + '__' + record['name']
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata((record['p']-pivot).tolist(), [], record['indices'].tolist())
            mesh.update()
            layer = mesh.uv_layers.new(name='UVMap')
            for face in mesh.polygons:
                face.use_smooth = True
                for loop_index in face.loop_indices:
                    vertex_index = mesh.loops[loop_index].vertex_index
                    uv = record['uv'][vertex_index]
                    layer.data[loop_index].uv = (uv[0], 1-uv[1])
            mesh.normals_split_custom_set_from_vertices(record['normals'].tolist())
            obj = bpy.data.objects.new(name, mesh)
            bpy.context.scene.collection.objects.link(obj)
            obj.parent = group
            obj['section'] = section
            obj['sourceObject'] = record['name']
            obj['sourcePart'] = record['part']
            mesh.materials.append(material)
            objects.append(obj)
            source_ranges.append({'section': section, 'sourceObject': record['name'], 'sourcePart': record['part'],
                                  'sourceTriangleRanges': compact_ranges(record['sourceTriangles']),
                                  'exteriorTriangles': record['exteriorTriangles'], 'capTriangles': record['capTriangles']})
    bpy.context.view_layer.update()
    source_health = mesh_health(objects)
    for row in source_health:
        assert row['zeroAreaFaces'] == 0, row
        assert row['intentionalOpenSurface'] or row['nonmanifoldEdges'] == 0, row
        assert row['signedVolume'] is None or row['signedVolume'] > 0, row
    expected_normals = fq44_normals_audit.snapshot(objects)
    bpy.ops.object.select_all(action='SELECT')
    glb = os.path.join(OUT, 'fighter_breakup.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_yup=False,
                              export_extras=True, use_selection=True, export_animations=False)
    exported_doc, exported = read_glb(glb)
    raw = open(glb, 'rb').read()
    json_size = struct.unpack_from('<I', raw, 12)[0]
    view = exported_doc['bufferViews'][exported_doc['images'][0]['bufferView']]
    image_start = 28 + json_size + view.get('byteOffset', 0)
    assert hashlib.sha256(raw[image_start:image_start+view['byteLength']]).hexdigest() == originals[ATLAS]
    data = {'version': 1, 'asset': 'FQ-44 Fury R4', 'axis': '+Y forward, +Z up',
            'sourceGlbSha256': originals[SOURCE], 'atlasSha256': originals[ATLAS],
            'sections': []}
    for section, (mass, threshold, anchor) in SECTIONS.items():
        records = [record for record in exported if record['section'] == section]
        geometry, ranges, points = packed_part(records)
        half_extents = (points.max(axis=0)-points.min(axis=0))/2
        data['sections'].append({'id': section, 'node': 'BreakSection_'+section,
                                 'anchorSection': anchor, 'pivot': pivots[section].tolist(),
                                 'massFraction': mass, 'collider': {'halfExtents': half_extents.tolist(),
                                                                   'radius': float(np.linalg.norm(half_extents))},
                                 'detachThreshold': threshold, 'ranges': ranges,
                                 'sourceObjects': sorted(set(r['extras']['sourceObject'] for r in records)),
                                 'geometry': geometry})
    count = sum(row['geometry']['n']//3 for row in data['sections'])
    assert 7500 <= count <= 10000, count
    assert abs(sum(row['massFraction'] for row in data['sections'])-1) < 1e-8
    assert len(exported_doc['materials']) == len(exported_doc['images']) == len(exported_doc['textures']) == 1
    blend = os.path.join(OUT, 'fighter_breakup.blend')
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    for obj in list(bpy.context.scene.objects):
        if not obj.parent:
            obj.matrix_world = Matrix.Rotation(-math.pi/2, 4, 'X') @ obj.matrix_world
    bpy.context.view_layer.update()
    imported = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    health = mesh_health(imported)
    normals = fq44_normals_audit.compare(expected_normals, imported)
    assert normals['pass'], normals
    for row in health:
        assert row['zeroAreaFaces'] == 0, row
        assert row['intentionalOpenSurface'] or row['nonmanifoldEdges'] == 0, row
        assert row['signedVolume'] is None or row['signedVolume'] > 0, row
    for path, fingerprint in originals.items():
        assert sha(path) == fingerprint, 'Protected input changed: ' + path
    report = {'pass': True, 'sourceGlbSha256': originals[SOURCE], 'atlasSha256': originals[ATLAS],
              'sourceVertices': sum(len(record['p']) for record in source), 'exportVertices': count,
              'exportTriangles': sum(len(record['indices']) for record in exported),
              'meshObjects': len(imported), 'sections': len(SECTIONS), 'materialCount': 1,
              'colorAtlasCount': 1, 'atlasSize': [1024, 1024], 'capUvRectGltf': uv_patch,
              'capUvPolicy': 'Four planar caps intentionally stack in a reserved unused 32px region; existing UVs and atlas bytes unchanged.',
              'cutPlanesY': [2.4, -3.15], 'sourceRanges': source_ranges,
              'sourceHullVolume': body_volume, 'sectionHullVolumeSum': piece_volume,
              'sourceHullExteriorArea': source_area, 'sectionHullExteriorAreaSum': piece_area,
              'normalRoundTrip': normals, 'roundTripGeometry': health,
              'limitations': ['Planar structural closure caps; no internal engine or avionics detail.',
                              'Masses, joint thresholds and box/sphere colliders are gameplay approximations.',
                              'Gear is authored in its deployed rest pose; runtime must choose or transform its breakup pose.',
                              'Sensor, exhaust ring and intake back plate retain their intentional open boundaries.']}
    json.dump(report, open(os.path.join(OUT, 'verification.json'), 'w'), indent=2)
    json.dump(data, open(DESTINATION, 'w'), separators=(',', ':'))
    manifest = {key: value for key, value in data.items() if key != 'sections'}
    manifest['sections'] = [{key: value for key, value in row.items() if key != 'geometry'} for row in data['sections']]
    json.dump(manifest, open(os.path.join(OUT, 'sections.json'), 'w'), indent=2)
    render_evidence(imported, pivots)
    render_evidence(imported, pivots, exploded=True)
    print('BREAKUP_QA', json.dumps({key: report[key] for key in ['pass', 'exportVertices', 'exportTriangles', 'meshObjects', 'sections', 'materialCount', 'atlasSize']}))


if __name__ == '__main__':
    main()
