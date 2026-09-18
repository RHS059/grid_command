"""Compare evaluated source corner normals with a fresh GLB import."""
import bpy
import math
from mathutils.kdtree import KDTree


def snapshot(objects):
    result = {}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        matrix = obj.matrix_world
        rotation = matrix.to_3x3().inverted().transposed()
        corners = [(tuple(matrix @ mesh.vertices[loop.vertex_index].co),
                    tuple((rotation @ mesh.corner_normals[i].vector).normalized()))
                   for i, loop in enumerate(mesh.loops)]
        # Record the shading split on each manifold edge in the evaluated mesh.
        edge_corners = {}
        for polygon in mesh.polygons:
            loops = list(polygon.loop_indices)
            for offset, loop_index in enumerate(loops):
                following = loops[(offset + 1) % len(loops)]
                edge = mesh.loops[loop_index].edge_index
                edge_corners.setdefault(edge, []).append({
                    mesh.loops[loop_index].vertex_index: mesh.corner_normals[loop_index].vector.copy(),
                    mesh.loops[following].vertex_index: mesh.corner_normals[following].vector.copy()})
        split_edges = 0
        for sides in edge_corners.values():
            if len(sides) == 2 and any(sides[0][v].dot(sides[1][v]) < math.cos(math.radians(.1)) for v in sides[0]):
                split_edges += 1
        result[obj.name] = {'corners': corners, 'split_normal_edges': split_edges}
        evaluated.to_mesh_clear()
    return result


def compare(source, imported_objects):
    imported = snapshot(imported_objects)
    rows = []
    for name, expected in source.items():
        if name not in imported:
            rows.append({'name': name, 'missing_mesh': True, 'mismatched_corners': len(expected['corners'])})
            continue
        actual = imported[name]['corners']
        tree = KDTree(len(actual))
        for index, (position, normal) in enumerate(actual):
            tree.insert(position, index)
        tree.balance()
        mismatch = 0
        max_error = 0.0
        for position, normal in expected['corners']:
            candidates = tree.find_range(position, .00002)
            dot = max((sum(normal[j] * actual[index][1][j] for j in range(3)) for _, index, _ in candidates), default=-1)
            error = math.degrees(math.acos(max(-1.0, min(1.0, dot))))
            max_error = max(max_error, error)
            if error > .1:
                mismatch += 1
        rows.append({'name': name, 'source_corners_tested': len(expected['corners']),
                     'source_split_normal_edges': expected['split_normal_edges'],
                     'mismatched_corners': mismatch, 'maximum_error_degrees': max_error})
    return {'pass': all(row['mismatched_corners'] == 0 for row in rows),
            'method': 'Each evaluated source corner normal must match a GLB normal at the same world position.',
            'position_tolerance': .00002, 'normal_tolerance_degrees': .1,
            'source_split_normal_edges': sum(row.get('source_split_normal_edges', 0) for row in rows),
            'mismatched_corners': sum(row['mismatched_corners'] for row in rows),
            'components': rows}
