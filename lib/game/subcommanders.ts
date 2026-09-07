import { authorizeMissionFuel, fuelEconomy } from './sustainment'
import { distance } from './movement'
import { isAir, isVehicle, troopSeats, type BattleState, type CommandCouncil, type Objective, type Side, type StrategicAction, type SubcommanderId, type SubcommanderReport, type Unit } from './types'

const NAMES: Record<SubcommanderId, [string, string]> = {
  TROOPS: ['Troop Command', 'personnel readiness and ground maneuver'],
  FUEL: ['Fuel Command', 'mission fuel, recovery reserve and endurance'],
  MOTORCADE: ['Motorcade Command', 'personnel carriers, seats and movement'],
  AIR: ['Air Command', 'aircraft readiness and sortie authorization'],
  LOGISTICS: ['Logistics Command', 'stock flow, servicing and procurement'],
  FIRES: ['Fires Command', 'direct and indirect fire support'],
}
const report=(id:SubcommanderId,approved:boolean,required:boolean,status:string,reason:string,metrics:string,time:number):SubcommanderReport=>({id,name:NAMES[id][0],responsibility:NAMES[id][1],approved,required,status,reason,metrics,updatedAt:time})
const activeInfantry=(u:Unit)=>u.hp>0&&!u.carrier&&!isVehicle(u.role)&&!['COMMAND','PILOT','LOGISTICS'].includes(u.role)&&u.members>0
const available=(u:Unit)=>u.hp>0&&!u.external&&!u.crewBailed&&!u.servicing&&!u.emergency&&!u.deployment

export function assessCommandStaff(state:BattleState,side:Side,target:Objective,action:StrategicAction):CommandCouncil {
  const own=state.units.filter(u=>u.side===side),infantry=own.filter(u=>activeInfantry(u)&&available(u))
  const transportRequired=infantry.some(u=>distance(u,target)>500)
  const carriers=own.filter(u=>available(u)&&troopSeats(u.role)>0&&(!u.transport||['available','escort'].includes(u.transport.phase)))
  const carrierPlans=carriers.map(carrier=>{const squad=infantry.filter(u=>distance(u,target)>500&&u.members<=troopSeats(carrier.role)).sort((a,b)=>distance(carrier,a)-distance(carrier,b))[0];return squad?{carrier,squad,authorization:authorizeMissionFuel(carrier,target,squad,state)}:undefined}).filter((plan):plan is NonNullable<typeof plan>=>!!plan)
  const readyCarriers=carrierPlans.filter(plan=>plan.authorization.ok)
  const missionVehicles=own.filter(u=>available(u)&&isVehicle(u.role)&&!['FORKLIFT','CARGO_PLANE','HEAVY_LIFT_HELI'].includes(u.role))
  const vehiclePlans=missionVehicles.map(vehicle=>({vehicle,authorization:authorizeMissionFuel(vehicle,target,undefined,state)})),readyMissionVehicles=vehiclePlans.filter(plan=>plan.authorization.ok)
  const airAssets=own.filter(u=>u.hp>0&&isAir(u.role)&&!['CARGO_PLANE','HEAVY_LIFT_HELI','TRANSPORT_HELI'].includes(u.role)),combatAircraft=airAssets.filter(available)
  const readyAircraft=combatAircraft.filter(u=>authorizeMissionFuel(u,target,undefined,state).ok&&u.ammo>=12)
  const fireAssets=own.filter(u=>u.hp>0&&['MG','MORTAR','AT','AA_TEAM','TANK','CANNON_APC','IFV'].includes(u.role)),fires=fireAssets.filter(u=>available(u)&&u.ammo>=12)
  const economy=fuelEconomy(state,side),troopsApproved=infantry.length>0,motorcadeApproved=!transportRequired||readyCarriers.length>0
  const fuelRequired=transportRequired||missionVehicles.length>0,fuelApproved=!fuelRequired||readyMissionVehicles.length>0
  const reports:Record<SubcommanderId,SubcommanderReport>={
    TROOPS:report('TROOPS',troopsApproved,true,troopsApproved?'APPROVED':'NEGATIVE',troopsApproved?'Ground elements are available.':'No ready ground elements are available.',`${infantry.length} ready groups · ${infantry.reduce((n,u)=>n+u.members,0)} personnel`,state.time),
    FUEL:report('FUEL',fuelApproved,fuelRequired,fuelApproved?'APPROVED':'NEGATIVE',fuelApproved?'Required mission and recovery fuel is assigned.':vehiclePlans.some(p=>p.authorization.required>100)?'The route exceeds vehicle range without forward service.':'No mission vehicle has the required fuel and recovery reserve.',`${readyMissionVehicles.length}/${missionVehicles.length} mission vehicles fueled · ${Math.floor(economy.baseOnHand)} base · ${Math.floor(economy.inbound)} inbound`,state.time),
    MOTORCADE:report('MOTORCADE',motorcadeApproved,transportRequired,motorcadeApproved?'APPROVED':'NEGATIVE',!transportRequired?'Objective is within walking distance.':motorcadeApproved?'A fueled carrier and sufficient seats are available.':'No ready fueled carrier can lift a ground element.',`${readyCarriers.length}/${carriers.length} carriers mission-ready`,state.time),
    AIR:report('AIR',readyAircraft.length>0,airAssets.length>0,readyAircraft.length?'APPROVED':airAssets.length?'NEGATIVE':'STANDBY',readyAircraft.length?'At least one combat aircraft is cleared for tasking.':airAssets.length?'Aircraft are servicing, unarmed or outside safe range.':'No combat aircraft assigned.',`${readyAircraft.length}/${airAssets.length} combat aircraft ready`,state.time),
    LOGISTICS:report('LOGISTICS',economy.available>=0,true,economy.available>=0?'SUSTAINABLE':'HOLD PROCUREMENT',economy.available>=0?'Current commitments preserve the protected reserve.':'Vehicle procurement is held until the projected deficit clears.',`${Math.floor(economy.onHand)} total · ${Math.ceil(economy.committed)} committed · ${Math.floor(economy.available)} discretionary`,state.time),
    FIRES:report('FIRES',fires.length>0,fireAssets.length>0,fires.length?'APPROVED':fireAssets.length?'NEGATIVE':'STANDBY',fires.length?'Fire-support elements have ammunition and are available.':fireAssets.length?'Assigned fire-support elements are servicing, committed or short of ammunition.':'No fire-support element is assigned.',`${fires.length}/${fireAssets.length} fire-support groups ready`,state.time),
  }
  const council:CommandCouncil={revision:(state.subcommanders?.[side]?.revision||0)+1,action,target:target.id,issuedAt:state.time,infantryApproved:troopsApproved&&motorcadeApproved&&fuelApproved,airApproved:reports.AIR.approved,firesApproved:reports.FIRES.approved,reports}
  if(!state.subcommanders)state.subcommanders={} as Record<Side,CommandCouncil>
  state.subcommanders[side]=council
  return council
}
