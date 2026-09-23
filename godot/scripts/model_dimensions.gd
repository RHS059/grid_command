extends RefCounted
## Shared with the browser. All focused-view scene distances are metres.

static var catalog: Dictionary = {}

static func specification(id: String) -> Dictionary:
	if catalog.is_empty():
		catalog = JSON.parse_string(FileAccess.get_file_as_string("res://data/model_dimensions.json"))
	return catalog.get(id, {"metres":1.0,"axis":"longest"})

static func scale_factor(id: String, size: Vector3) -> float:
	var dimension := specification(id)
	var span: float = size.y if dimension.axis == "height" else maxf(size.x,maxf(size.y,size.z))
	return float(dimension.metres)/span if is_finite(span) and span > 0.00001 else 1.0

static func label(id: String) -> String:
	var dimension := specification(id)
	return "%s m %s" % [str(snappedf(float(dimension.metres),0.01)),"tall" if dimension.axis == "height" else "overall"]

static func grid_spacing(extent: float) -> float:
	return maxf(1.0,pow(10.0,floor(log(maxf(1.0,extent/10.0))/log(10.0))))

