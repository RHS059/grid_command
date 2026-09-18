"""Set explicit hard edges and Blender 4.5 Smooth by Angle at 30 degrees."""
import bpy
import bmesh
import math
import os


def apply(objects):
    angle = math.radians(30)
    asset = os.path.join(bpy.utils.resource_path('LOCAL'), 'datafiles', 'assets',
                         'geometry_nodes', 'smooth_by_angle.blend')
    with bpy.data.libraries.load(asset, link=False) as (source, destination):
        destination.node_groups = ['Smooth by Angle']
    group = destination.node_groups[0]
    rows = []
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        for edge in bm.edges:
            if len(edge.link_faces) != 2:
                edge.smooth = False
                continue
            dihedral = edge.calc_face_angle()
            # Keep authored creases. Flat manufactured faces also need explicit
            # edge marks, even when their angle is below the automatic limit.
            flat_corner = any(not face.smooth for face in edge.link_faces) and dihedral > math.radians(.05)
            if dihedral >= angle or flat_corner:
                edge.smooth = False
        bm.to_mesh(obj.data)
        bm.free()
        modifier = obj.modifiers.new('Smooth by Angle - 30 degrees', 'NODES')
        modifier.node_group = group
        modifier['Input_1'] = angle
        modifier['Socket_1'] = False  # Keep the edges marked sharp by the artist.
        obj['smooth_by_angle_degrees'] = 30.0
        obj['explicit_sharp_edges'] = sum(edge.use_edge_sharp for edge in obj.data.edges)
        rows.append({'name': obj.name, 'part': obj['part'],
                     'marked_sharp_edges': obj['explicit_sharp_edges'],
                     'smooth_by_angle_degrees': 30.0,
                     'ignore_authored_sharp_edges': False})
    bpy.context.view_layer.update()
    return {'method': 'Blender 4.5 bundled Smooth by Angle geometry node modifier',
            'angle_degrees': 30.0, 'ignore_authored_sharp_edges': False,
            'marked_sharp_edges': sum(row['marked_sharp_edges'] for row in rows),
            'components': rows}
