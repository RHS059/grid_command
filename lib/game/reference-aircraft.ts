import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { shell, profile, rod } from './model-geometry'
import { SIDE_COLOR, type Role, type Side } from './types'

// Z up, +Y nose. Only moving assemblies remain separate after baking.
export function createReferenceAircraft(role: Role, side: Side) {
  const root=new T.Group();root.name=role
  const jet=role==='JET',cas=role==='CAS_FIGHTER',transport=role==='TRANSPORT_HELI'
  const body=new T.MeshStandardMaterial({color:jet?'#858f96':cas?'#67786a':transport?'#777868':'#b1b7b4',roughness:.88,metalness:.08,flatShading:true})
  const dark=new T.MeshStandardMaterial({color:'#272e30',roughness:.9,flatShading:true}),glass=new T.MeshStandardMaterial({color:'#344b59',roughness:.3,metalness:.2,flatShading:true}),metal=new T.MeshStandardMaterial({color:'#555f60',roughness:.8,flatShading:true}),mark=new T.MeshStandardMaterial({color:SIDE_COLOR[side],roughness:.85})
  root.userData.materials=[body,dark,glass,metal,mark]
  const mesh=(g:T.BufferGeometry,m:T.Material=body,parent:T.Object3D=root)=>{g.deleteAttribute('color');const o=new T.Mesh(g,m);parent.add(o);return o}
  const box=(w:number,d:number,h:number,x:number,y:number,z:number,m:T.Material=body,p:T.Object3D=root)=>mesh(new T.BoxGeometry(w,d,h).translate(x,y,z),m,p)
  const rail=(a:[number,number,number],b:[number,number,number],r:number,m:T.Material=metal,p:T.Object3D=root)=>mesh(rod(a,b,r,'#ffffff',8),m,p)
  // Cross sections along the longitudinal axis, rotated from the shared Z shell.
  const hull=(sections:{y:number;w:number;h:number}[],z:number,m:T.Material=body,x=0)=>mesh(shell(sections.map(s=>({z:s.y,w:s.w,d:s.h})),'#ffffff').rotateX(-Math.PI/2).translate(x,0,z),m)
  const wing=(points:[number,number][],z:number,m:T.Material=body,p:T.Object3D=root)=>{const shape=new T.Shape(points.map(a=>new T.Vector2(...a)));return mesh(new T.ExtrudeGeometry(shape,{depth:.1,bevelEnabled:false}).translate(0,0,z),m,p)}
  const fin=(points:[number,number][],x:number,m:T.Material=body)=>mesh(profile(points,.12,'#ffffff').translate(x,0,0),m)
  const wheel=(x:number,y:number,r=.3)=>{mesh(new T.CylinderGeometry(r,r,.23,12).rotateZ(Math.PI/2).translate(x,y,r),dark);rail([x,y,r],[x,y,1.25],.055)}
  const rotor=(name:string,x:number,y:number,z:number,radius:number,blades:number,vertical=false)=>{const g=new T.Group();g.name=name;g.position.set(x,y,z);root.add(g);box(.38,.38,.18,0,0,0,metal,g);for(let i=0;i<blades;i++){const arm=new T.Group();arm.rotation.z=i*Math.PI*2/blades;g.add(arm);wing([[-.1,.22],[.14,.22],[.24,radius*.88],[.1,radius],[-.12,radius]],0,dark,arm)}if(vertical)g.rotation.x=Math.PI/2;return g}
  if(role==='CARGO_PLANE'){
    // Strategic airlifter silhouette with the heavy VTOL's pale faceted skin.
    hull([{y:-14,w:.6,h:.8},{y:-11,w:2.6,h:2.8},{y:-7,w:4.6,h:4.6},{y:7,w:4.8,h:4.8},{y:10,w:4.2,h:4.2},{y:12.3,w:2.8,h:2.8},{y:13.6,w:.8,h:1.2}],3.65)
    hull([{y:8.7,w:3.1,h:.6},{y:10,w:2.9,h:1.6},{y:11.5,w:1.8,h:.75}],5.05,glass)
    rail([0,9.5,5.83],[0,11.45,5.32],.065)
    for(const sign of [-1,1]){
      rail([sign*1.15,9.6,5.65],[sign*.7,11.3,5.3],.055)
      wing([[sign*1.8,4.1],[sign*14,-1.9],[sign*14,-3.4],[sign*2,-.7]],5.55)
      // Thick wing roots and restrained dark control-surface seams.
      wing([[sign*1.7,3.8],[sign*6.1,1.4],[sign*5.8,-.8],[sign*1.7,-1]],5.38)
      rail([sign*6.6,-1.25,5.67],[sign*13.2,-3.12,5.67],.02,metal)
      box(.65,.85,.025,sign*11,-1.85,5.68,mark)
      for(const [x,y] of [[5,1.7],[9.2,-.25]]){
        box(.2,1.5,1.1,sign*x,y,4.9)
        hull([{y:y-2.7,w:.65,h:.65},{y:y-1.8,w:1.18,h:1.22},{y:y+.9,w:1.5,h:1.5},{y:y+1.2,w:1.4,h:1.4}],3.95,body,sign*x)
        // Open intake lip, recessed fan face, and a stepped dark exhaust.
        const lip=new T.TorusGeometry(.64,.09,4,12).rotateX(Math.PI/2).translate(sign*x,y+1.22,3.95);mesh(lip,metal)
        mesh(new T.CircleGeometry(.6,12).rotateX(-Math.PI/2).translate(sign*x,y+1.19,3.95),dark)
        rail([sign*x,y+.98,3.95],[sign*x,y+1.23,3.95],.15,metal)
        for(let i=0;i<8;i++){const a=i*Math.PI/4;rail([sign*x+Math.cos(a)*.2,y+1.205,3.95+Math.sin(a)*.2],[sign*x+Math.cos(a+.2)*.51,y+1.205,3.95+Math.sin(a+.2)*.51],.025,metal)}
        rail([sign*x,y-2.5,3.95],[sign*x,y-2.85,3.95],.32,dark)
      }
      hull([{y:-5.8,w:.45,h:.4},{y:-4.6,w:1.1,h:1},{y:1,w:1.1,h:1},{y:2,w:.3,h:.3}],1.8,body,sign*2.2)
      for(const y of [-4.6,-3.8,-1.2,-.4]){
        for(const x of [1.88,2.42]){mesh(new T.CylinderGeometry(.46,.46,.23,12).rotateZ(Math.PI/2).translate(sign*x,y,.46),dark)}
        rail([sign*2.15,y,.6],[sign*2.15,y,1.75],.09,metal)
      }
      box(.035,.6,.85,sign*2.28,6.7,3.7,metal);box(.045,.1,.1,sign*2.31,6.9,3.7,dark)
      box(.045,1.2,.23,sign*2.4,3.3,3.2,mark)
    }
    // Tall swept fin and high mounted horizontal stabilizer form the T-tail.
    fin([[-13.4,4],[-13.3,9.5],[-11.8,9.6],[-9.2,4.6]],0)
    wing([[-.12,-10.9],[-5.7,-13.1],[-5.5,-14.1],[0,-13.3],[5.5,-14.1],[5.7,-13.1],[.12,-10.9]],9.45)
    for(const x of [-.32,.32]){mesh(new T.CylinderGeometry(.38,.38,.24,12).rotateZ(Math.PI/2).translate(x,9.2,.38),dark)}
    rail([0,9.2,.5],[0,9.2,1.9],.1,metal)
    // Hinge at the ramp's bottom edge, preserved for unloading animation.
    const ramp=new T.Group();ramp.name='cargo-ramp';ramp.position.set(0,-11.12,1.1);root.add(ramp)
    box(2.5,.14,2.5,0,0,1.25,metal,ramp);box(2.22,.035,2.23,0,-.09,1.25,dark,ramp)
    for(let i=0;i<7;i++)box(2.1,.04,.045,0,-.12,.3+i*.31,metal,ramp)
  }else if(cas){
    hull([{y:-5,w:.16,h:.28},{y:-2.7,w:.48,h:.65},{y:0,w:1.12,h:1.2},{y:2.5,w:1.04,h:1.08},{y:3.7,w:.65,h:.7}],1.55)
    hull([{y:-1.25,w:.5,h:.15},{y:-.65,w:.83,h:.78},{y:1.35,w:.79,h:.85},{y:2.05,w:.5,h:.22}],2.18,glass)
    for(const y of [-.55,1.15]){rail([-.4,y,2.25],[-.25,y,2.61],.035);rail([-.25,y,2.61],[.25,y,2.61],.035);rail([.25,y,2.61],[.4,y,2.25],.035)}
    for(const s of [-1,1]){
      wing([[s*.42,1],[s*5.4,.2],[s*5.3,-.8],[s*.4,-1.35]],1.25)
      wing([[s*.12,-3.4],[s*2,-3.95],[s*1.95,-4.65],[s*.12,-4.6]],1.7)
      rail([s*1.1,.1,1.34],[s*1.1,1.35,1.34],.025,dark)
      hull([{y:-.8,w:.08,h:.08},{y:-.4,w:.36,h:.4},{y:1.4,w:.36,h:.4},{y:1.9,w:.04,h:.04}],.85,body,s*2.25)
      box(.12,.55,.3,s*2.25,.2,1.05);rail([s*.48,2.8,1.6],[s*.72,2.4,1.65],.1,dark)
      box(.45,.55,.025,s*4,.0,1.37,mark);wheel(s*1.35,-.25)
    }
    fin([[-4.85,1.5],[-4.65,3.6],[-4.08,3.8],[-3.3,1.7]],0)
    hull([{y:3.7,w:.67,h:.67},{y:4.25,w:.02,h:.02}],1.55,dark)
    rotor('propeller',0,3.72,1.55,1.45,5,true);wheel(0,2.55,.24)
  }else if(jet){
    hull([{y:-6,w:.85,h:.55},{y:-3,w:1.65,h:1},{y:1,w:1.45,h:1},{y:4,w:.85,h:.7},{y:7.1,w:.025,h:.025}],1.65)
    hull([{y:.7,w:.65,h:.15},{y:1.5,w:.8,h:.8},{y:3.35,w:.68,h:.85},{y:4.15,w:.25,h:.1}],2.15,glass)
    rail([-.4,2,2.2],[0,2,2.7],.04);rail([0,2,2.7],[.4,2,2.2],.04)
    for(const s of [-1,1]){
      wing([[s*.6,2.4],[s*5.9,-1.35],[s*5.75,-3],[s*1,-2.6]],1.7)
      wing([[s*.6,-3.7],[s*3,-4.4],[s*2.85,-5.7],[s*.6,-5.4]],1.9)
      hull([{y:-5.8,w:.85,h:.85},{y:-3,w:1.05,h:1},{y:1.3,w:1.05,h:.85},{y:2,w:.9,h:.65}],1.3,body,s*.9)
      box(.8,.045,.57,s*.95,2.04,1.3,dark)
      rail([s*.9,-5.8,1.3],[s*.9,-6.3,1.3],.37,dark)
      fin([[-5.9,1.95],[-5.35,4.45],[-4.8,4.6],[-3.8,2]],s*.9)
      for(const x of [2,3.1]){box(.08,.7,.35,s*x,-.5,1.5);rail([s*x,-1.5,1.15],[s*x,.65,1.15],.11,metal);wing([[s*x-.25,-1.2],[s*x+.25,-1.2],[s*x,-.6]],1.16,metal)}
      box(.6,.55,.025,s*4.5,-1.6,1.82,mark);wheel(s*1.25,-1.2,.32)
    }wheel(0,3.7,.27)
  }else if(transport){
    hull([{y:-4,w:.45,h:.7},{y:-2.7,w:2.3,h:2.15},{y:1.8,w:2.5,h:2.25},{y:3.5,w:1.7,h:1.5},{y:4.05,w:.9,h:.6}],2.05)
    hull([{y:2.1,w:2.1,h:.75},{y:3,w:1.85,h:1.2},{y:3.73,w:1.15,h:.5}],2.65,glass)
    rail([0,2.15,3.1],[0,3.7,2.8],.055);rail([-.95,2.3,3.05],[-.65,3.65,2.5],.05);rail([.95,2.3,3.05],[.65,3.65,2.5],.05)
    hull([{y:-9,w:.17,h:.28},{y:-4,w:.5,h:.7},{y:-2.5,w:.85,h:.85}],2.2)
    fin([[-9,2.1],[-9.1,4.8],[-8.5,4.6],[-7.6,2.3]],0)
    wing([[-2,-7.4],[2,-7.4],[2,-8],[ -2,-8]],2.25)
    for(const s of [-1,1]){
      hull([{y:-2,w:.45,h:.5},{y:-1.5,w:.8,h:.7},{y:.8,w:.85,h:.7},{y:1.2,w:.45,h:.4}],3.3,body,s*.88)
      for(const y of [-1.7,-.55,.6]){box(.025,.7,.7,s*1.255,y,2.35,glass);box(.055,.82,.045,s*1.28,y,1.55,metal)}
      rail([s*1.28,-2.1,1.45],[s*1.28,-2.1,2.95],.03);box(.055,.23,.045,s*1.3,-.15,1.9,dark)
      wing([[s*.9,.4],[s*2.9,0],[s*2.8,-.7],[s*.9,-.8]],2.3)
      hull([{y:-2.1,w:.1,h:.1},{y:-1.7,w:.7,h:.65},{y:1,w:.7,h:.65},{y:1.5,w:.1,h:.1}],1.4,body,s*2.45)
      rail([s*1.05,.1,1.5],[s*1.5,.25,.45],.09);wheel(s*1.5,.25,.4);box(.055,.5,.22,s*1.26,-1.7,1.85,mark)
    }
    wheel(0,-7.3,.23);rail([0,0,3.3],[0,0,4.2],.13);rotor('main-rotor',0,0,4.25,7.1,4)
    const tail=rotor('tail-rotor',.2,-8.8,4.2,1,4);tail.rotation.y=Math.PI/2
  }else{
    // Shared wingtip-rotor cargo airframe for heavy lift and attack variants.
    hull([{y:-5.5,w:.5,h:.7},{y:-3.3,w:2.2,h:2.4},{y:1.8,w:2.65,h:2.65},{y:4,w:2,h:2.2},{y:4.9,w:1.2,h:1.5}],2.5)
    hull([{y:3.65,w:2.02,h:1.65},{y:4.75,w:1.26,h:1.12},{y:4.92,w:1.17,h:.8}],2.65,glass)
    rail([0,3.8,3.55],[0,4.95,2.5],.065)
    wing([[-5.5,.5],[5.5,.5],[5.5,-1],[ -5.5,-1]],3.8)
    wing([[-2.8,-4.5],[2.8,-4.5],[2.7,-5.4],[-2.7,-5.4]],3.2)
    for(const s of [-1,1]){
      fin([[-5.5,3.2],[-5.2,4.6],[-4.65,4.7],[-3.9,3.2]],s*1.5)
      const nacelle=hull([{y:-1.8,w:.45,h:.7},{y:-1,w:.85,h:1.55},{y:.6,w:.85,h:1.5},{y:1.05,w:.45,h:.7}],4, dark,s*5.1)
      const blades=rotor(s<0?'main-rotor':'rear-rotor',s*5.1,-.15,5,3.3,3)
      const tilt=new T.Group();tilt.name=s<0?'left-tilt':'right-tilt';tilt.position.set(s*5.1,-.15,4);root.add(tilt)
      nacelle.geometry.translate(-s*5.1,.15,-4);tilt.add(nacelle);blades.position.set(0,0,1);tilt.add(blades)
      box(.025,3.35,1.7,s*1.335,-.3,2.35,dark)
      box(.045,3.4,.1,s*1.36,-.3,1.45,metal);box(.045,3.4,.1,s*1.36,-.3,3.25,metal)
      for(const y of [-1.35,-.3,.75]){box(.06,.82,.65,s*1.355,y,1.83,body);box(.07,.08,.67,s*1.4,y,1.83,metal)}
      box(.055,.48,.18,s*1.12,3.15,1.65,mark);wheel(s*1.3,-2.5,.42)
    }wheel(0,3.25,.32)
    if(role==='ATTACK_HELI'){
      const turret=new T.Group();turret.name='chin-turret';turret.position.set(0,3.9,1.12);root.add(turret)
      mesh(shell([{z:-.2,w:.65,d:.6},{z:.12,w:.85,d:.75},{z:.3,w:.6,d:.55}],'#ffffff'),dark,turret)
      for(const x of [-.1,.1])rail([x,.2,0],[x,1.65,0],.055,metal,turret)
      box(.26,.16,.18,0,.39,.19,glass,turret)
    }else{
      const sling=new T.Group();sling.name='sling-cargo';root.add(sling)
      for(const x of [-.7,.7])rail([x,0,1.25],[x,0,-2],.025,dark,sling)
      box(2,2,1.25,0,0,-2.6,body,sling);box(2.05,2.05,.12,0,0,-3.27,metal,sling)
    }
  }
  // Merge direct stationary meshes within each group without swallowing pivots.
  const bake=(parent:T.Object3D)=>{for(const child of [...parent.children])if(!(child instanceof T.Mesh))bake(child);const meshes=parent.children.filter((c):c is T.Mesh=>c instanceof T.Mesh);for(const m of [body,dark,glass,metal,mark]){const selected=meshes.filter(c=>c.material===m);if(!selected.length)continue;const geos=selected.map(c=>{c.updateMatrix();const g=c.geometry.index?c.geometry.toNonIndexed():c.geometry.clone();g.applyMatrix4(c.matrix);return g});const joined=mergeGeometries(geos);geos.forEach(g=>g.dispose());selected.forEach(c=>{parent.remove(c);c.geometry.dispose()});parent.add(new T.Mesh(joined,m))}}
  bake(root);return root
}
