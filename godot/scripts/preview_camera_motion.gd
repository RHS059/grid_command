extends RefCounted
## Translation moves the target and camera together; orbit/zoom retain that target.

static func movement(keys: Dictionary, basis: Basis, delta: float, distance: float) -> Vector3:
	var horizontal := float(keys.has(KEY_D))-float(keys.has(KEY_A))
	var forward := float(keys.has(KEY_W))-float(keys.has(KEY_S))
	var direction := basis.x*horizontal-basis.z*forward
	var speed := maxf(1.0,distance*0.65)*(3.0 if keys.has(KEY_SHIFT) else 1.0)
	return direction.normalized()*speed*minf(delta,0.05) if direction.length_squared() > 0 else Vector3.ZERO

static func pan(relative: Vector2, basis: Basis, distance: float, fov: float, height: float) -> Vector3:
	var metres_per_pixel := 2.0*distance*tan(deg_to_rad(fov*0.5))/maxf(1.0,height)
	return (-basis.x*relative.x+basis.y*relative.y)*metres_per_pixel

static func is_move_key(key: int) -> bool:
	return key in [KEY_W,KEY_A,KEY_S,KEY_D,KEY_SHIFT]

