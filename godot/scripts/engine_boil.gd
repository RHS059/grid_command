extends RefCounted
## A whole-assembly vibration, sampled from time rather than accumulated transforms.

const ROLES := ["TANK","APC","CANNON_APC","IFV","TRUCK","TROOP_TRUCK","FORKLIFT","FUEL_TRUCK","TROOP_HEMTT","MEDICAL_HEMTT","REPAIR_HEMTT","FOB_HEMTT"]
var phase := 0.0
var strength := 0.0
var time := 0.0

func _init(id: String = "") -> void:
	var seed_value := 0
	for index in id.length(): seed_value = (seed_value * 31 + id.unicode_at(index)) % 65521
	phase = float((seed_value * 40503) % 65521) / 65521.0 * TAU

static func powered(record: Dictionary) -> bool:
	return float(record.get("hp",100)) > 0 and not record.get("crew_bailed",false) and not record.get("surrendered",false) and bool(record.get("engine",true)) and float(record.get("fuel",0)) > 0 and (record.get("service","") == "READY" or record.get("refuel_run",false))

func _wave(a: float, b: float, offset: float) -> float:
	return 0.72*sin(time*TAU*a+offset)+0.28*sin(time*TAU*b+offset*1.7)

func sample(role: String, delta: float, running: bool, moving: bool = false, alive: bool = true, length: float = 8.0) -> Transform3D:
	var dt := clampf(delta,0.0,0.1)
	time += dt
	var target := (0.35 if moving else 1.0) if running and alive and role in ROLES else 0.0
	strength = lerpf(strength,target,1.0-exp(-dt*9.0))
	if not alive or role not in ROLES or strength < 0.00001: strength = 0.0
	var distance := length*0.00035*strength
	# Same signal as the browser, mapped from Z-up into Godot's Y-up space.
	var offset := Vector3(_wave(7.3,10.7,phase)*distance*0.3,_wave(8.7,10.1,phase+2)*distance,-_wave(8.1,11.3,phase+1)*distance*0.2)
	var angles := Vector3(_wave(7.7,10.9,phase+3)*0.00035*strength,_wave(7.1,9.7,phase+5)*0.00012*strength,-_wave(8.3,11.1,phase+4)*0.0003*strength)
	return Transform3D(Basis.from_euler(angles),offset)
