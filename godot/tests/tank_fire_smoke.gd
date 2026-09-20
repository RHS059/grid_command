extends SceneTree

var failures := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _run() -> void:
	var stage := Node3D.new()
	root.add_child(stage)
	var unit := CombatUnit.new()
	stage.add_child(unit)
	unit.set_process(false)
	unit.animation_player.stop()
	var effect := unit.tank_fire
	check(effect != null and effect.muzzle != null, "Tank must create its cannon presentation.")
	check(effect.get_parent() == unit.visual and effect.get_child(0).name == "SourceAxisCorrection", "Recoil must be below interpolation and above the whole model.")
	var hull := unit.source_model.find_child("hull", true, false) as MeshInstance3D
	var cannon := unit.source_model.find_child("cannon", true, false) as MeshInstance3D
	var center := hull.to_global(hull.get_aabb().get_center())
	var unit_origin := unit.global_transform
	var source_pose := unit.source_model.global_transform
	var mesh_ids := [effect.flash.get_child(0).mesh.get_instance_id(), effect.flash.get_child(1).mesh.get_instance_id()]
	check(center.is_equal_approx(effect.global_position), "Pivot must coincide with the heavy hull center of mass.")
	check(unit.muzzle_position().distance_to(cannon.to_global(Vector3(0, 0, -3.729))) < 0.00001, "Tracer and flash must start at the cannon muzzle.")
	var target := CombatUnit.new()
	target.team = 1
	target.position.z = -1.0
	stage.add_child(target)
	target.set_process(false)
	var units: Array[CombatUnit] = [unit, target]
	unit.tick(0.05, units, 0.0)
	check(effect.flash.visible and effect.is_processing(), "A successful gameplay shot must start the flash and recoil.")
	effect.set_process(false)
	effect._process(0.10)
	check(is_equal_approx(effect.recoil_degrees, 4.0), "Shot must peak at four degrees backward.")
	check((-effect.global_basis.z).y > 0.0, "Backward recoil must lift the tank nose.")
	check(hull.to_global(hull.get_aabb().get_center()).is_equal_approx(center), "Recoil must preserve its center of mass.")
	check(unit.global_transform.is_equal_approx(unit_origin), "Recoil must not move the simulation transform.")
	unit.tick(0.05, units, 0.10)
	check(is_equal_approx(effect.recoil_degrees, 4.0), "Weapon cooldown must not restart the presentation.")
	effect._process(0.20)
	check(effect.recoil_degrees < 0.0 and not effect.flash.visible, "Tank must settle forward after the brief flash.")
	effect._process(1.0)
	check(not effect.is_processing() and effect.basis.is_equal_approx(Basis.IDENTITY), "Settled tanks must stop processing and return to rest.")
	check(unit.source_model.global_transform.is_equal_approx(source_pose), "Rest pose must not drift after recoil.")
	var turret := unit.source_model.find_child("Assembly_turret", true, false) as Node3D
	var barrel := unit.source_model.find_child("Assembly_cannon", true, false) as Node3D
	turret.rotation.y = PI * 0.5
	barrel.rotation.x = deg_to_rad(12.0)
	effect.fire(20.0)
	effect.set_process(false)
	effect._process(0.10)
	check(is_equal_approx(effect.recoil_degrees, 5.0), "Recoil must remain within the five-degree maximum.")
	check(effect.basis.x.y < 0.0, "A broadside shot must rock away from the slewed cannon.")
	check(unit.muzzle_position().is_equal_approx(cannon.to_global(effect.muzzle.position)), "Muzzle must follow turret yaw, cannon elevation and recoil.")
	check(effect.flash.global_basis.orthonormalized().is_equal_approx(cannon.global_basis.orthonormalized()), "Flash must retain barrel orientation.")
	effect.reset()
	effect.fire(0.0)
	effect.set_process(false)
	effect._process(0.10)
	check(is_equal_approx(effect.recoil_degrees, 2.0), "Recoil must retain the two-degree minimum.")
	check(mesh_ids == [effect.flash.get_child(0).mesh.get_instance_id(), effect.flash.get_child(1).mesh.get_instance_id()], "Repeated shots must reuse their flash meshes.")
	for mesh: MeshInstance3D in effect.flash.get_children():
		var material := mesh.material_override as StandardMaterial3D
		check(material.emission_enabled and material.emission.r > material.emission.b, "Muzzle flash must use warm emissive materials.")
	unit.take_damage(100.0)
	check(not effect.flash.visible and effect.recoil_degrees == 0.0, "Destroyed tanks must clear their firing presentation.")
	var preview := NativeWorkspaces.new()
	root.add_child(preview)
	preview.setup(null)
	preview.show_models()
	preview._load_model("TANK")
	check(preview.fire_cannon_button.visible and preview.preview_tank_fire != null, "Tank preview must expose the shared firing presentation.")
	preview.fire_cannon_button.pressed.emit()
	check(preview.preview_tank_fire.flash.visible, "Preview Fire cannon must trigger the flash.")
	preview.preview_tank_fire.reset()
	preview.animation.play("shoot")
	preview.animation.advance(0.01)
	preview._process(0.01)
	check(preview.preview_tank_fire.flash.visible, "Authored shoot animation must trigger the preview presentation.")
	preview._set_team(1)
	for mesh: MeshInstance3D in preview.preview_tank_fire.flash.get_children():
		check(mesh.material_overlay == null, "Team outline must not override muzzle flame colors.")
	preview._load_model("APC")
	check(preview.preview_tank_fire == null and not preview.fire_cannon_button.visible, "Switching away from tank must remove the firing preview.")
	# Allow queued material changes/model replacements to finish; SceneTree
	# owns and releases the remaining test fixtures on quit.
	await process_frame
	await process_frame
	if failures == 0: print("GRID_COMMAND_TANK_FIRE_SMOKE_OK")
	quit(1 if failures else 0)
