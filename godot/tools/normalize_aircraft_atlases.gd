extends SceneTree
## Contract normalization of imagegen paint: original atlas defines all masks,
## markings, hardware and island boundaries; generated input supplies body variation.
const OUT := "res://assets/textures/vehicles/aircraft/"

func paint_pixel(c: Color, kind: String, x: int, y: int) -> bool:
	if kind == "fighter":
		if y > 952 and x > 450 and x < 610: return false # turbine/exhaust island
		return c.r > 0.08 and c.r < 0.65 and c.g > c.r + 0.012 and c.b > c.g + 0.005 and c.b - c.r < 0.15
	if kind == "cas": return c.r > 0.20 and c.r < 0.6 and c.g > c.r + 0.025 and c.b > c.r + 0.025 and c.b <= c.g + 0.015
	return c.r > 0.35 and c.r < 0.7 and c.g > c.r + 0.025 and c.b >= c.g

func _initialize() -> void:
	for kind in ["fighter", "cas", "recon_uav"]:
		var original := Image.load_from_file("res://assets/models/%s_albedo.png" % kind)
		var generated := Image.load_from_file(OUT + "source/%s.png" % kind)
		generated.resize(1024,1024,Image.INTERPOLATE_LANCZOS)
		var mask := PackedByteArray(); mask.resize(1024*1024)
		for y in 1024:
			for x in 1024: mask[y*1024+x] = 1 if paint_pixel(original.get_pixel(x,y),kind,x,y) else 0
		# Connected paint regions under 1800 texels remain clean. Recess lines split
		# large panels naturally, instead of putting blanket noise on small hardware.
		var visited := PackedByteArray(); visited.resize(mask.size())
		var large := PackedByteArray(); large.resize(mask.size())
		var region_mean := PackedFloat32Array(); region_mean.resize(mask.size())
		for start in mask.size():
			if mask[start] == 0 or visited[start] != 0: continue
			var queue := PackedInt32Array([start]); var head := 0; visited[start]=1
			while head < queue.size():
				var p := queue[head]; head += 1
				for n in [p-1,p+1,p-1024,p+1024]:
					if n < 0 or n >= mask.size() or abs(n%1024-p%1024)>1: continue
					if mask[n] != 0 and visited[n] == 0: visited[n]=1; queue.append(n)
			if queue.size() >= 1800:
				var average := 0.0
				for p in queue: average += generated.get_pixel(p%1024,int(p/1024)).get_luminance()
				average = maxf(average / queue.size(), 0.08)
				for p in queue: large[p]=1; region_mean[p]=average
		for team in 2:
			var result := original.duplicate(); result.convert(Image.FORMAT_RGB8)
			var base := Color("a58d68" if team == 0 else "4b6046")
			for y in 1024:
				for x in 1024:
					var p := y*1024+x
					if mask[p] == 0: continue
					var source := original.get_pixel(x,y)
					var ratio := source.get_luminance() / (0.44 if kind == "fighter" else 0.38 if kind == "cas" else 0.55)
					var level := clampf(0.65 + ratio * 0.35,0.68,1.18)
					if large[p] != 0:
						var art := generated.get_pixel(x,y)
						# Only bounded surface variation survives; source establishes silhouette,
						# exact cavities and protected details even if generation drifts.
						var variation := clampf(art.get_luminance()/region_mean[p],0.78,1.16)
						level *= lerpf(1.0, variation,0.60)
					result.set_pixel(x,y,Color(base.r*level,base.g*level,base.b*level))
			assert(result.save_png(OUT+"%s_%s.png" % [kind,"blue" if team==0 else "red"]) == OK)
		print("NORMALIZED_AIRCRAFT ",kind)
	quit()

