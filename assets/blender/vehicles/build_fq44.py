"""Build, check, and copy the approved R4 Fury asset. Blender 4.5.

Run from the repository root:
  blender --background --factory-startup --python assets/blender/vehicles/build_fq44.py

The earlier revisions remain in their archive folders. The body starts with
the saved side and front contours. The supplied photographs take priority.
"""
import json
import os
import runpy
import shutil
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '../../..'))
STAGE = os.path.join(HERE, 'fighter_r4')
sys.path.insert(0, HERE)


def check_report():
    with open(os.path.join(STAGE, 'fighter_verification.json')) as handle:
        report = json.load(handle)
    assert 7500 <= report['export_stored_vertices'] <= 10000
    assert report['runtime_indexed_vertices'] == report['export_stored_vertices']
    assert report['texture_dimensions'] == [1024, 1024]
    assert report['texture_count'] == report['gltf_image_count'] == report['gltf_texture_count'] == 1
    assert report['material_count'] == report['gltf_material_count'] == 1
    assert report['uv_zero_area_triangles'] == 0
    assert report['exact_uv_audit']['overlap_pairs'] == 0
    assert report['exact_uv_audit']['overlap_area'] == 0
    assert report['source_geometry']['zero_area_faces'] == 0
    assert report['round_trip']['zero_area_faces'] == 0
    assert not report['round_trip']['closed_negative_volume']
    assert report['round_trip']['vertices'] == report['export_stored_vertices']
    assert report['round_trip']['image_sizes'] == [[1024, 1024]]
    assert report['shading']['angle_degrees'] == 30.0
    assert not report['shading']['ignore_authored_sharp_edges']
    assert report['normal_round_trip']['pass']
    assert report['authored_texture']['uv_layout_unchanged']
    assert report['authored_texture'].get('aircraft_geometry_and_uv_unchanged') or report['authored_texture']['geometry_and_rig_unchanged']
    assert report['authored_texture']['glb_embedded_texture_matches']
    assert report['authored_texture']['blend_packed_texture_matches']
    assert report['assembly_contacts'] and all(row['contact_pass'] for row in report['assembly_contacts'])
    assert report['gear_retraction']['all_inside_body']
    assert len(report['gear_retraction']['parts']) == 3
    assert all(row['outside_body_samples'] == 0 for row in report['gear_retraction']['parts'])
    return report


def promote():
    report = check_report()
    # Copy only this asset after every required check passes.
    for filename in os.listdir(STAGE):
        if filename.startswith('fighter') and filename.endswith(('.blend', '.glb', '.png', '.json')):
            if filename.startswith('fighter_albedo_'):
                continue  # Keep texture trials in the source archive.
            if filename not in ('fighter.json', 'fighter_rig.json'):
                shutil.copy2(os.path.join(STAGE, filename), os.path.join(HERE, filename))
    for folder, filenames in [
        ('public/models', ('fighter.glb', 'fighter_albedo.png')),
        ('lib/game/generated', ('fighter.json', 'fighter_rig.json')),
    ]:
        destination = os.path.join(REPO, folder)
        os.makedirs(destination, exist_ok=True)
        for filename in filenames:
            shutil.copy2(os.path.join(STAGE, filename), os.path.join(destination, filename))
    print('FURY_R4_PROMOTED', json.dumps({
        'exported_vertices': report['export_stored_vertices'],
        'source_vertices': report['blender_mesh_vertices'],
        'triangles': report['triangles'],
        'texture_dimensions': report['texture_dimensions'],
        'uv_overlaps': report['exact_uv_audit']['overlap_pairs'],
        'gear_inside_body': report['gear_retraction']['all_inside_body'],
    }))


def main():
    if '--promote-only' not in sys.argv:
        import build_fq44_r4_blockout
        import build_fq44_r4
        build_fq44_r4_blockout.main()
        build_fq44_r4.main()
        runpy.run_path(os.path.join(HERE, 'separate_fq44_weapons.py'), run_name='__main__')
        runpy.run_path(os.path.join(HERE, 'verify_fq44_r4.py'), run_name='__main__')
        bpy.ops.wm.open_mainfile(filepath=os.path.join(STAGE, 'fighter.blend'))
        audit = runpy.run_path(os.path.join(HERE, 'audit_fq44_uv.py'), run_name='__main__')['result']
        with open(os.path.join(STAGE, 'fighter_exact_uv_audit.json'), 'w') as handle:
            json.dump(audit, handle, indent=2)
        runpy.run_path(os.path.join(HERE, 'fq44_r4_evidence.py'), run_name='__main__')
        runpy.run_path(os.path.join(HERE, 'fq44_r4_pose_audit.py'), run_name='__main__')
    promote()


if __name__ == '__main__':
    main()
