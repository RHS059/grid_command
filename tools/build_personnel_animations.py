"""Retarget owned Grid Command clips without rewriting the supplied model GLBs.

The source bundle contains the old game's authored clips, not Mixamo downloads.
Run with --extract-source OLD_SOLDIER_GLB once, then run without arguments.
Only Python's standard library is required. Output is shared by both engines.
"""
from __future__ import annotations

import argparse
import bisect
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/animations/personnel-authored-source.json"
IDENTITY = [0.0, 0.0, 0.0, 1.0]
CLIPS = ("idle_passive", "idle_ready", "walk", "fire", "crouch", "prone", "in_cover", "in_cover_shoot", "peek", "throw", "drag", "downed", "dead")
MAPS = {
    "commander": {"pelvis":"Bone_000", "spine":"Bone_008", "head":"Bone_019", "upper_arm.L":"Bone_023", "forearm.L":"Bone_022", "hand.L":"Bone_021", "upper_arm.R":"Bone_028", "forearm.R":"Bone_027", "hand.R":"Bone_026", "thigh.L":"Bone_016", "shin.L":"Bone_015", "foot.L":"Bone_014", "thigh.R":"Bone_012", "shin.R":"Bone_011", "foot.R":"Bone_010"},
    "logistics": {"pelvis":"Bone_000", "spine":"Bone_004", "head":"Bone_014", "upper_arm.L":"Bone_019", "forearm.L":"Bone_018", "hand.L":"Bone_017", "upper_arm.R":"Bone_024", "forearm.R":"Bone_023", "hand.R":"Bone_022", "thigh.L":"Bone_008", "shin.L":"Bone_007", "foot.L":"Bone_006", "thigh.R":"Bone_012", "shin.R":"Bone_011", "foot.R":"Bone_010"},
}
MAPS["soldier"] = MAPS["logistics"].copy()

def mul(a, b):
    x,y,z,w = a; X,Y,Z,W = b
    return [w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X, w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z]

def inv(q): return [-q[0], -q[1], -q[2], q[3]]
def norm(v):
    length = math.sqrt(sum(x*x for x in v))
    return [x/length for x in v] if length > 1e-10 else v
def rotate(q, v): return mul(mul(q, [*v,0]), inv(q))[:3]
def add(a,b): return [x+y for x,y in zip(a,b)]
def sub(a,b): return [x-y for x,y in zip(a,b)]
def axis_angle(axis, angle): return [*(v*math.sin(angle/2) for v in norm(axis)), math.cos(angle/2)]
def between(a,b):
    a,b=norm(a),norm(b); dot=sum(x*y for x,y in zip(a,b))
    if dot < -.9999: return axis_angle([1,0,0] if abs(a[0]) < .9 else [0,1,0], math.pi)
    return norm([a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0], 1+dot])

def read_glb(path):
    data=path.read_bytes(); document=json.loads(data[20:20+struct.unpack_from("<I",data,12)[0]])
    offset=20+struct.unpack_from("<I",data,12)[0]; binary=data[offset+8:]
    def values(index):
        a=document["accessors"][index]; view=document["bufferViews"][a["bufferView"]]
        size={"SCALAR":1,"VEC3":3,"VEC4":4}[a["type"]]; assert a["componentType"]==5126
        return [list(struct.unpack_from("<"+"f"*size,binary,view.get("byteOffset",0)+a.get("byteOffset",0)+i*view.get("byteStride",size*4))) for i in range(a["count"])]
    clips=[]
    for animation in document.get("animations",[]):
        if animation["name"] not in CLIPS: continue
        tracks=[]
        for channel in animation["channels"]:
            sampler=animation["samplers"][channel["sampler"]]
            tracks.append({"node":document["nodes"][channel["target"]["node"]]["name"],"path":channel["target"]["path"],"times":[x[0] for x in values(sampler["input"])],"values":values(sampler["output"])})
        clips.append({"name":animation["name"],"tracks":tracks,"duration":max(t["times"][-1] for t in tracks)})
    return document,clips

def compact_nodes(document):
    names={i:n.get("name",str(i)) for i,n in enumerate(document["nodes"])}
    parents={c:names[i] for i,n in enumerate(document["nodes"]) for c in n.get("children",[])}
    return {names[i]:{"parent":parents.get(i),"position":n.get("translation",[0,0,0]),"rotation":norm(n.get("rotation",IDENTITY))} for i,n in enumerate(document["nodes"]) if "mesh" not in n}

def globals_for(nodes, overrides=None):
    result={}; overrides=overrides or {}
    def visit(name):
        if name in result:return result[name]
        node=nodes[name]; parent=node["parent"]; local=overrides.get(name,{})
        p=local.get("translation",node["position"]); q=norm(local.get("rotation",node["rotation"]))
        if parent in nodes:
            P,Q=visit(parent);p=add(P,rotate(Q,p));q=mul(Q,q)
        result[name]=(p,q);return result[name]
    for name in nodes:visit(name)
    return result

def sample(track,time):
    times=track["times"]; values=track["values"];i=max(0,min(len(times)-2,bisect.bisect_right(times,time)-1))
    if len(times)==1:return values[0]
    t=max(0,min(1,(time-times[i])/max(1e-9,times[i+1]-times[i])))
    a,b=values[i],values[i+1]
    if track["path"]=="rotation" and sum(x*y for x,y in zip(a,b))<0:b=[-x for x in b]
    value=[x+(y-x)*t for x,y in zip(a,b)]
    return norm(value) if track["path"]=="rotation" else value

def rounded(value): return [round(v,6) for v in value]

def build_rig(kind,target,source):
    mapping=MAPS[kind]; nodes=compact_nodes(target); rest=globals_for(nodes); source_rest=globals_for(source["nodes"])
    target_to_source={v:k for k,v in mapping.items()}; correction={}
    for source_name,target_name in mapping.items():
        alignment=IDENTITY
        if source_name.startswith(("upper_arm", "forearm", "hand", "thigh", "shin", "foot")):
            source_child=next((n for n,v in source["nodes"].items() if v["parent"]==source_name),None)
            target_child=next((n for n,v in nodes.items() if v["parent"]==target_name),None)
            source_direction=sub(source_rest[source_child][0],source_rest[source_name][0]) if source_child else rotate(source_rest[source_name][1],[0,1,0])
            target_direction=sub(rest[target_child][0],rest[target_name][0]) if target_child else rotate(rest[target_name][1],[0,1,0])
            alignment=between(target_direction,source_direction)
        correction[target_name]=mul(mul(inv(source_rest[source_name][1]),alignment),rest[target_name][1])
    clips=[]
    for clip in source["clips"]:
        duration=clip["duration"]; count=max(2,round(duration*24)+1);times=[round(i*duration/(count-1),6) for i in range(count)]
        tracks={n:{"target":n,"type":"bone","rotation":[],"position":[]} for n in target_to_source}
        for time in times:
            overrides={}
            for track in clip["tracks"]:overrides.setdefault(track["node"],{})[track["path"]]=sample(track,time)
            pose=globals_for(source["nodes"],overrides); desired={}
            def solve(name):
                if name in desired:return desired[name]
                node=nodes[name];parent=node["parent"]
                parent_pose=solve(parent) if parent in nodes else ([0,0,0],IDENTITY)
                p,q=node["position"],node["rotation"]
                if name in target_to_source:
                    source_name=target_to_source[name];global_q=mul(pose[source_name][1],correction[name]);q=mul(inv(parent_pose[1]),global_q)
                    if source_name=="pelvis":
                        # The supplied rigs put their skeleton root at the hips.
                        # Transfer the source hip position, including fall motion,
                        # so death does not rotate around an elevated pivot.
                        factor=rest[name][0][1]/source_rest["pelvis"][0][1]
                        global_p=add(rest[name][0],[v*factor for v in sub(pose["pelvis"][0],source_rest["pelvis"][0])])
                        p=rotate(inv(parent_pose[1]),sub(global_p,parent_pose[0]))
                    tracks[name]["rotation"].append(rounded(norm(q)))
                    tracks[name]["position"].append(rounded(p))
                desired[name]=(add(parent_pose[0],rotate(parent_pose[1],p)),mul(parent_pose[1],q));return desired[name]
            for name in nodes:solve(name)
            if clip["name"] in ("downed","dead","prone"):
                floor = min(position[1] for name,(position,_) in desired.items() if name.startswith("Bone_"))
                if floor < .025:
                    tracks[mapping["pelvis"]]["position"][-1][1] = round(tracks[mapping["pelvis"]]["position"][-1][1] + .025-floor,6)
        clips.append({"name":clip["name"],"duration":round(duration,6),"loop":clip["name"] not in ("downed","dead","throw","peek"),"times":times,"tracks":list(tracks.values())})
    return {"schema":1,"model":kind,"source":"grid-command-authored-v1","mode":"skeletal","clips":clips}

def equipment_for(kind, target, bundle):
    """Calibrate the separate rifle to the real wrist in the ready pose.

    Supplied rifle: muzzle along -X, Y up, 3.7578 source units long.
    Keep that mesh intact; its display length is 0.82 metres. The grip is
    translated to the palm, never the rifle's arbitrary exported origin.
    """
    hand = MAPS[kind]["hand.R"]
    clip = next(c for c in bundle["clips"] if c["name"] == "idle_ready")
    overrides = {t["target"]:{"rotation":t["rotation"][0],"translation":t["position"][0]} for t in clip["tracks"]}
    pose = globals_for(compact_nodes(target),overrides)
    rotation = mul(inv(pose[hand][1]),axis_angle([0,1,0],-math.pi/2))
    return {"hand":hand,"rotation":rounded(norm(rotation)),
            "legacy_rotation":rounded(norm(mul(inv(pose[hand][1]),axis_angle([1,0,0],-math.pi/2)))),
            "palm_offset":[0,0.045,0],"grip":[0.2,0.72,0],"scale":round(0.82/3.7578322887420654,8)}

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--extract-source",type=Path);args=parser.parse_args()
    if args.extract_source:
        document,clips=read_glb(args.extract_source)
        bundle={"schema":1,"source":"Grid Command pre-replacement authored soldier animations","sha256":hashlib.sha256(args.extract_source.read_bytes()).hexdigest(),"nodes":compact_nodes(document),"clips":clips}
        SOURCE.parent.mkdir(parents=True,exist_ok=True);SOURCE.write_text(json.dumps(bundle,separators=(",",":"))+"\n",encoding="utf-8")
    source=json.loads(SOURCE.read_text(encoding="utf-8"))
    for kind in ("soldier","commander","logistics"):
        target,_=read_glb(ROOT/f"public/models/{kind}.glb")
        bundle=build_rig(kind,target,source)
        bundle["equipment"] = equipment_for(kind,target,bundle)
        bundle["model_sha256"]=hashlib.sha256((ROOT/f"public/models/{kind}.glb").read_bytes()).hexdigest()
        payload=json.dumps(bundle,separators=(",",":"))+"\n"
        for base in ("public/animations/personnel","godot/assets/animations/personnel"):
            output=ROOT/base/f"{kind}.json";output.parent.mkdir(parents=True,exist_ok=True);output.write_text(payload,encoding="utf-8")
        print(kind,bundle["mode"],len(bundle["clips"]),len(payload),"bytes")

if __name__=="__main__":main()

