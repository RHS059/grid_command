import * as T from 'three'
import { createReferenceAircraft } from './reference-aircraft'
import { SIDE_COLOR, type Role, type Side } from './types'

export function disposeModel(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>()
  root.traverse(o => { for (const m of o.userData.materials || []) materials.add(m); if (o instanceof T.Mesh || o instanceof T.LineSegments) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); if (o instanceof T.InstancedMesh) o.dispose() } })
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose())
}

export function createAircraft(role: Role, side: Side) {
  if (['CAS_FIGHTER','JET','TRANSPORT_HELI','HEAVY_LIFT_HELI','ATTACK_HELI'].includes(role)) return createReferenceAircraft(role, side)
  const root = new T.Group(); root.name = role
  const body = new T.MeshStandardMaterial({ color: '#65716a', roughness: .62, metalness: .3 })
  const dark = new T.MeshStandardMaterial({ color: '#18222b', roughness: .7, metalness: .35 })
  const glass = new T.MeshStandardMaterial({ color: '#293e4c', roughness: .12, metalness: .75 })
  const marking = new T.MeshStandardMaterial({ color: SIDE_COLOR[side], roughness: .5 })
  const metal = new T.MeshStandardMaterial({ color: '#a4afb4', roughness: .38, metalness: .8 })
  const add = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, name = '', parent: T.Object3D = root) => { const mesh = new T.Mesh(g, m); mesh.position.set(x, y, z); mesh.name = name; parent.add(mesh); return mesh }
  const box = (w: number, d: number, h: number, x: number, y: number, z: number, m: T.Material = body, parent: T.Object3D = root) => add(new T.BoxGeometry(w, d, h), m, x, y, z, '', parent)
  const oval = (w: number, d: number, h: number, x: number, y: number, z: number, m: T.Material = body, name = '') => { const mesh = add(new T.SphereGeometry(1, 20, 12), m, x, y, z, name); mesh.scale.set(w, d, h); return mesh }
  const tube = (radius: number, length: number, x: number, y: number, z: number, m: T.Material = dark, top = radius) => add(new T.CylinderGeometry(top, radius, length, 16), m, x, y, z)
  const wing = (points: [number, number][], z: number, thickness = .1, parent: T.Object3D = root, m: T.Material = body) => { const s = new T.Shape(); points.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return add(new T.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false }), m, 0, 0, z, '', parent) }
  const wheel = (x: number, y: number, z: number, radius = .28) => { const tire = tube(radius, .22, x, y, z); tire.rotation.z = Math.PI / 2; const strut = tube(.06, .65, x, y, z + .45, metal); strut.rotation.x = Math.PI / 2 }
  if (role === 'CARGO_PLANE') {
    oval(1.8,10.5,1.9,0,0,3.2,body,'fuselage');oval(1.5,2.1,.65,0,7.8,4.35,glass,'flight-deck')
    box(26,2.9,.25,0,.5,4.65);box(10,1.8,.18,0,-8.1,5.2);box(.22,3.5,4.8,0,-8.3,5.9)
    for(const x of [-9,-4,4,9]){oval(.55,2.1,.6,x,1,4.4);const prop=new T.Group();prop.name=`propeller-${x}`;prop.position.set(x,3.1,4.4);root.add(prop);box(3.5,.08,.16,0,0,0,dark,prop);box(.16,.08,3.5,0,0,0,dark,prop)}
    for(const x of [-1.6,1.6]){wheel(x,-2.8,.55,.55);wheel(x,-1.4,.55,.55);box(.05,2,.65,x*1.08,4.3,3.4,marking)}wheel(0,7,.55,.45)
    const ramp=box(2.5,.18,2.3,0,-9.4,2.2,dark);ramp.name='cargo-ramp'
  } else if (role === 'TRANSPORT_HELI' || role === 'HEAVY_LIFT_HELI') {
    const heavy=role==='HEAVY_LIFT_HELI'
    oval(heavy?1.55:1.2,heavy?5.5:3.8,1.55,0,0,2.3,body,'cabin');oval(heavy?1.35:1.05,1.2,1,0,heavy?4.4:2.9,2.65,glass,'cockpit')
    for(const x of [-1,1]){for(let y=-2;y<=2;y+=1.3)box(.05,.9,.65,x*(heavy?1.5:1.16),y,2.7,glass);wheel(x*(heavy?1.5:1.25),-2,.4,.4);wheel(x*(heavy?1.5:1.25),2,.4,.4);box(.07,1.5,.4,x*(heavy?1.55:1.22),-.5,1.75,marking)}
    const positions=heavy?[-4,4]:[0]
    for(const y of positions){box(.65,.8,1,0,y,4);const rotor=new T.Group();rotor.name=y===positions[0]?'main-rotor':'rear-rotor';rotor.position.set(0,y,4.65);root.add(rotor);for(let i=0;i<4;i++){const arm=new T.Group();arm.rotation.z=i*Math.PI/2;rotor.add(arm);box(.28,heavy?6.8:6.2,.07,0,3.1,0,dark,arm)}}
    if(!heavy){const boom=tube(.35,5,0,-5,2.5,body,.12);boom.rotation.x=Math.PI;box(.1,1,1.7,0,-7.3,3.15);const rotor=new T.Group();rotor.name='tail-rotor';rotor.position.set(.2,-7.2,3.2);root.add(rotor);box(.07,1.9,.13,0,0,0,dark,rotor);box(.07,.13,1.9,0,0,0,dark,rotor)}
    else {const sling=new T.Group();sling.name='sling-cargo';root.add(sling);for(const x of [-.8,.8])box(.04,.04,3.5,x,0,-.7,dark,sling);box(2.2,2.4,1.4,0,0,-2.7,body,sling);box(2.3,2.5,.15,0,0,-3.45,metal,sling)}
  } else if (role === 'ATTACK_HELI') {
    oval(.83, 2.75, .95, 0, .2, 1.9, body, 'fuselage')
    oval(.58, 1.2, .65, 0, 1.65, 2.3, glass, 'tandem-canopy')
    box(1.05, .075, .85, 0, 1.7, 2.6, dark)
    box(.08, 2.25, .08, 0, 1.5, 2.91, dark)
    const boom = tube(.36, 5.6, 0, -4, 2, body, .12); boom.rotation.x = Math.PI; boom.name = 'tail-boom'
    const fin = wing([[-.1, -6.8], [.1, -6.8], [.13, -5.65], [-.13, -5.65]], 2, 2); fin.rotation.y = -.09
    box(2.7, .65, .1, 0, -5.5, 2.2)
    for (const sign of [-1, 1]) {
      oval(.43, 1.3, .4, sign * .85, -.8, 2.6)
      tube(.27, .35, sign * .85, -2.05, 2.6, dark)
      wing([[sign * .6, .3], [sign * 2.7, -.2], [sign * 2.65, -1.1], [sign * .6, -.65]], 1.6, .14)
      tube(.29, 1.4, sign * 2, -.3, 1.15, dark)
      for (let i = 0; i < 5; i++) tube(.055, .02, sign * 2 + Math.cos(i * 1.256) * .17, .41, 1.15 + Math.sin(i * 1.256) * .17, metal)
      for (let i = 0; i < 2; i++) { tube(.085, 1.8, sign * (2.5 + i * .18), -.25, 1.35, body, .025) }
      wheel(sign * 1.1, .15, .35, .35)
      box(.07, .9, .85, sign * .7, 1.45, 2.2, dark)
      box(.04, .7, .25, sign * .84, .1, 2.2, marking)
    }
    wheel(0, -5.5, 1.0, .2)
    oval(.3, .35, .3, 0, 2.55, 1.5, glass, 'sensor-turret')
    tube(.08, 1.25, 0, 2.9, .95, dark).name = 'chin-gun'
    const mast = tube(.1, .7, 0, -.45, 3.15, metal); mast.rotation.x = Math.PI / 2
    const rotor = new T.Group(); rotor.name = 'main-rotor'; rotor.position.set(0, -.45, 3.6); root.add(rotor)
    box(.55, .55, .15, 0, 0, 0, metal, rotor)
    for (let i = 0; i < 4; i++) { const blade = new T.Group(); blade.rotation.z = i * Math.PI / 2; rotor.add(blade); box(.3, 6.4, .065, .05, 3.3, 0, dark, blade); box(.3, .35, .07, .05, 6.35, 0, metal, blade) }
    const tail = new T.Group(); tail.name = 'tail-rotor'; tail.position.set(.3, -6.35, 2.95); root.add(tail)
    box(.06, 1.8, .12, 0, 0, 0, dark, tail); box(.06, .12, 1.8, 0, 0, 0, dark, tail)
  } else if (role === 'JET') {
    oval(.72, 6.4, .62, 0, .35, 1.35, body, 'fuselage')
    oval(.49, 1.65, .49, 0, 2.6, 1.9, glass, 'canopy')
    tube(.5, 3.2, 0, 5.5, 1.35, body, .035).name = 'nose-cone'
    for (const sign of [-1, 1]) {
      wing([[sign * .45, 2.2], [sign * 5.5, -1.2], [sign * 5.4, -2.3], [sign * .55, -1.3]], 1.1, .14)
      wing([[sign * .4, -3.7], [sign * 2.7, -5.2], [sign * 2.6, -5.9], [sign * .4, -5.35]], 1.5, .12)
      oval(.52, 2.5, .48, sign * .65, -2.7, 1.1)
      tube(.4, .8, sign * .65, -5.05, 1.1, metal); tube(.3, .82, sign * .65, -5.06, 1.1, dark)
      box(.65, .35, .42, sign * .77, .75, 1.05, dark)
      const tail = wing([[0, 0], [1.7, -1.1], [1.6, -2], [0, -1.8]], 0, .1); tail.rotation.y = -sign * 1.25; tail.position.set(sign * .65, -3.4, 1.65); tail.name = 'tail-fin'
      for (const x of [2, 3.7]) { box(.08, .65, .38, sign * x, -.5, .9, dark); tube(.13, 2.3, sign * x, -.4, .58, metal, .02) }
      box(.5, .65, .03, sign * 3.9, -1.65, 1.26, marking)
      wheel(sign * .95, -1.2, .28)
    }
    wheel(0, 3.6, .28)
  } else {
    oval(.38, 3.7, .4, 0, .15, 1.05, body, 'fuselage')
    oval(.37, .75, .42, 0, 2.8, 1.15, body, 'satellite-fairing')
    for (const sign of [-1, 1]) {
      wing([[sign * .2, .7], [sign * 8.4, -.2], [sign * 8.35, -.8], [sign * .2, -.75]], 1.1, .08)
      const tail = wing([[0, 0], [2.2, -.75], [2.05, -1.25], [0, -.65]], 0, .08); tail.rotation.y = -sign * .65; tail.position.set(0, -2.5, 1.1); tail.scale.x = sign; tail.name = 'v-tail'
      box(.4, .32, .025, sign * 6.4, -.4, 1.2, marking)
      wheel(sign * .7, -.7, .2, .2)
    }
    wheel(0, 2.3, .2, .18)
    oval(.3, .32, .3, 0, 1.7, .55, dark, 'sensor-turret'); oval(.16, .08, .15, 0, 1.99, .53, glass)
    const prop = new T.Group(); prop.name = 'propeller'; prop.position.set(0, -3.65, 1.12); root.add(prop)
    box(2.3, .05, .13, 0, 0, 0, dark, prop); box(.13, .05, 2.3, 0, 0, 0, dark, prop)
  }
  root.userData.materials = [body, dark, glass, marking, metal]
  return root
}

export function animateAircraft(root: T.Object3D, time: number) {
  const main = root.getObjectByName('main-rotor'), tail = root.getObjectByName('tail-rotor'), prop = root.getObjectByName('propeller')
  if (main) main.rotation.z = time * 35
  if (tail) tail.rotation.x = time * 48
  if (prop) { if (root.name === 'CAS_FIGHTER') prop.rotation.z = time * 45; else prop.rotation.y = time * 45 }
  const rear=root.getObjectByName('rear-rotor');if(rear)rear.rotation.z=-time*35
  for(const x of [-9,-4,4,9]){const p=root.getObjectByName(`propeller-${x}`);if(p)p.rotation.y=time*40}
}
