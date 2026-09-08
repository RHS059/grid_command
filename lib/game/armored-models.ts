import * as T from './scene-data'
import { mergeGeometries } from './scene-data'
import { shell, profile, rod, tint } from './model-geometry'
import { SIDE_COLOR, type Role, type Side } from './types'

/** All details are baked into one hull and one separately aimed turret. */
export function armoredGeometry(role: Role, side: Side, turret: boolean) {
  const parts:T.BufferGeometry[]=[],sand='#b29a70',light='#c4ad82',shade='#897956',rubber='#282c29',metal='#54574d',glass='#384b49'
  const box=(w:number,d:number,h:number,x:number,y:number,z:number,c=sand)=>parts.push(tint(new T.BoxGeometry(w,d,h).toNonIndexed().translate(x,y,z),c))
  const tube=(a:[number,number,number],b:[number,number,number],r:number,c=metal)=>parts.push(rod(a,b,r,c,8))
  const panel=(rings:Parameters<typeof shell>[0],c=sand,x=0)=>parts.push(shell(rings,c).translate(x,0,0))
  const wheel=(x:number,y:number,z:number,r:number,w:number,c:string)=>parts.push(tint(new T.CylinderGeometry(r,r,w,12).toNonIndexed().rotateZ(Math.PI/2).translate(x,y,z),c))
  const tank=role==='TANK',wheeled=role==='APC'||role==='CANNON_APC'
  if(turret){
    if(role==='APC'){
      panel([{z:2.12,w:.82,d:.85},{z:2.28,w:.72,d:.72}],shade)
      box(.32,.4,.32,0,0,2.45);tube([0,.15,2.57],[0,1.15,2.57],.035,rubber)
      box(.28,.4,.23,-.3,0,2.4,shade);box(.12,.25,.2,.23,.03,2.63,glass)
    }else{
      panel([{z:1.92,w:tank?2.15:1.65,d:tank?2.7:1.85,y:-.2},{z:2.2,w:tank?2.55:1.95,d:tank?2.95:2.1,y:-.25},{z:2.73,w:tank?1.85:1.45,d:tank?2.3:1.65,y:-.4}])
      box(tank?.75:.5,.48,.37,0,tank?1.08:.76,2.4,shade)
      tube([0,tank?1.08:.78,2.43],[0,tank?4.95:3,2.43],tank?.09:.04,rubber)
      tube([0,1.05,2.43],[0,tank?2:1.5,2.43],tank?.14:.085,shade)
      tube([0,tank?4.85:2.87,2.43],[0,tank?5.12:3.13,2.43],tank?.13:.067,metal)
      panel([{z:2.72,w:.6,d:.65,y:-.7},{z:2.84,w:.55,d:.58,y:-.7}],shade,.35)
      box(.25,.3,.22,-.42,-.3,2.83,shade);box(.2,.02,.12,-.42,-.135,2.84,glass)
      box(.5,.08,.34,.5,-.99,2.94,light);box(.055,.5,.34,.23,-.76,2.94,light);box(.055,.5,.34,.77,-.76,2.94,light)
      tube([-.65,-.8,2.72],[-.65,-.8,3.95],.015,rubber)
      tube([.72,-.83,2.72],[.72,-.83,3.35],.018,shade)
      if(role==='IFV'){
        for(const x of [-.98,.98]){
          box(.35,1.18,.43,x,-.35,2.5,shade)
          for(const z of [2.4,2.6])tube([x,-.85,z],[x,.27,z],.085,rubber)
        }
      }
      for(const x of [-1,1])for(let i=0;i<3;i++)tube([x*.73,.25+i*.18,2.37],[x*.95,.42+i*.18,2.58],.047,shade)
    }
  }else{
    // Long tapered glacis, clipped corners, and a narrower lower hull.
    panel([{z:.5,w:2.25,d:5.5,y:-.1},{z:1.15,w:2.95,d:6.25},{z:1.93,w:2.68,d:4.9,y:-.48}],sand)
    if(wheeled){
      for(const sign of [-1,1])for(const y of [-2.35,-.8,.8,2.35]){
        wheel(sign*1.4,y,.68,.66,.42,rubber);wheel(sign*1.64,y,.68,.34,.035,shade);wheel(sign*1.67,y,.68,.12,.035,metal)
      }
    }else{
      for(const sign of [-1,1]){
        const track=profile([[-2.85,.28],[-3.05,.68],[-2.7,1.14],[2.55,1.14],[3.02,.7],[2.75,.17],[-2.45,.17]],.49,rubber).translate(sign*1.42,0,0);parts.push(track)
        for(let i=0;i<6;i++){
          const y=-2.3+i*.89;wheel(sign*1.67,y,.64,.43,.055,shade);wheel(sign*1.71,y,.64,.17,.025,metal)
        }
        for(let i=0;i<17;i++){
          const y=-2.65+i*.32;box(.54,.07,.035,sign*1.42,y,1.15,metal);box(.025,.07,.13,sign*1.69,y,.23,metal)
        }
        for(let i=0;i<5;i++){
          const y=-2.12+i*.99;box(.16,.93,.52,sign*1.55,y,1.41,light);box(.035,.025,.37,sign*1.65,y-.4,1.43,shade)
          box(.055,.1,.04,sign*1.65,y-.2,1.28,shade);box(.055,.1,.04,sign*1.65,y+.2,1.28,shade)
        }
      }
    }
    // Roof access, engine grilles, towing fittings and rear ramp.
    panel([{z:1.94,w:.64,d:.78,y:1.15},{z:2.01,w:.59,d:.7,y:1.15}],light,-.64)
    box(.35,.035,.09,-.64,1.49,2.02,glass)
    for(let i=0;i<8;i++)box(.88,.055,.025,.6,-1.25+i*.12,1.95,shade)
    box(1.75,.055,.94,0,-2.99,1.21,shade);box(1.57,.04,.82,0,-3.025,1.23,sand)
    for(const x of [-.62,.62])box(.16,.055,.045,x,-3.06,1.48,metal)
    for(const sign of [-1,1]){
      box(.32,.32,.22,sign*1.05,2.22,1.62,shade);box(.24,.02,.11,sign*1.05,2.4,1.65,'#c4c6a9')
      tube([sign*1.03,2.78,.86],[sign*1.03,3.08,.81],.05,metal)
      box(.04,.65,.2,sign*1.5,-1.6,1.66,SIDE_COLOR[side])
      box(.28,.42,.38,sign*1.14,-2.34,2.05,shade)
    }
    if(tank){box(1.1,.48,.2,0,-2.36,2.03,shade)}
  }
  const result=mergeGeometries(parts);parts.forEach(g=>g.dispose());return result
}
