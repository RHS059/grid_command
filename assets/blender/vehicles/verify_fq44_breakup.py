"""Verify the committed packed breakup data against the independently stored GLB.

Run with Blender 4.5 --background --factory-startup --python-exit-code 1.
Does not rebuild or overwrite the production model or verification artifacts.
"""
import base64
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_fq44_breakup import ATLAS, DESTINATION, OUT, SOURCE, SECTIONS, read_glb, sha


def decode_positions(part):
    raw = base64.b64decode(part['q'])
    assert len(raw) == (part['n'] * 15 + 7) // 8
    values = []
    for component in range(part['n']):
        bit = component * 15
        cursor = bit // 8
        value = (int.from_bytes(raw[cursor:cursor+3], 'little') >> (bit % 8)) & 0x7fff
        values.append((value if value < 0x4000 else value-0x8000) * part['s'])
    return np.array(values).reshape((-1, 3))


def main():
    data = json.load(open(DESTINATION))
    assert data['version'] == 1
    assert data['sourceGlbSha256'] == sha(SOURCE)
    assert data['atlasSha256'] == sha(ATLAS)
    assert data['axis'] == '+Y forward, +Z up'
    assert [row['id'] for row in data['sections']] == list(SECTIONS)
    assert abs(sum(row['massFraction'] for row in data['sections'])-1) < 1e-8
    doc, records = read_glb(os.path.join(OUT, 'fighter_breakup.glb'))
    assert len(doc['materials']) == len(doc['images']) == len(doc['textures']) == 1
    vertices = triangles = 0
    maximum_position_error = 0
    for section in data['sections']:
        selected = [record for record in records if record['section'] == section['id']]
        assert selected
        part = section['geometry']
        points = decode_positions(part)
        expected = np.concatenate([record['p'] for record in selected])
        error = float(abs(points-expected).max())
        maximum_position_error = max(error, maximum_position_error)
        assert error <= part['s'] / 2 + 1e-7, (section['id'], error)
        assert part['texture'] == '/models/fighter_albedo.png'
        assert len(part['normals']) == len(points) * 3
        assert len(part['uv']) == len(points) * 2
        assert np.allclose(np.array(part['normals']).reshape((-1, 3)), np.concatenate([record['normals'] for record in selected]), atol=5.1e-7)
        assert np.allclose(np.array(part['uv']).reshape((-1, 2)), np.concatenate([record['uv'] for record in selected]), atol=5.1e-7)
        normals = np.array(part['normals']).reshape((-1, 3))
        assert np.allclose(np.linalg.norm(normals, axis=1), 1, atol=2e-6)
        assert np.isfinite(points).all() and np.isfinite(normals).all()
        assert 0 < section['massFraction'] < 1 and 0 < section['detachThreshold'] <= 1
        assert section['anchorSection'] is None or section['anchorSection'] in SECTIONS
        pivot = np.array(section['pivot'])
        extents = np.array(section['collider']['halfExtents'])
        assert (extents > 0).all()
        assert (abs(expected-pivot) <= extents+1e-6).all()
        offset = index_offset = 0
        assert len(section['ranges']) == len(selected)
        for record, span in zip(selected, section['ranges']):
            assert span['vertexStart'] == offset and span['indexStart'] == index_offset
            assert span['vertexCount'] == len(record['p'])
            assert span['indexCount'] == len(record['indices']) * 3
            assert span['objectName'] == record['name']
            assert span['sourceObject'] == record['extras']['sourceObject']
            actual = part['indices'][index_offset:index_offset+span['indexCount']]
            assert actual == (record['indices'].ravel()+offset).tolist()
            assert all(offset <= index < offset+span['vertexCount'] for index in actual)
            offset += span['vertexCount']
            index_offset += span['indexCount']
        assert offset == len(points) and index_offset == len(part['indices'])
        vertices += len(points)
        triangles += len(part['indices']) // 3
    assert 7500 <= vertices <= 10000
    print(json.dumps({'pass': True, 'sections': len(data['sections']), 'indexedVertices': vertices,
                      'triangles': triangles, 'maximumPackedPositionError': maximum_position_error,
                      'sourceAndAtlasHashesMatch': True, 'allPackedAttributesMatchGlb': True}))


if __name__ == '__main__':
    main()
