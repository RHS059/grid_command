extends RefCounted
class_name GeographicHTTP

const PUBLIC_CA_BUNDLE := "res://data/certificates/mozilla-ca.pem"
static var _cached_trust: X509Certificate
static var _trust_loaded := false
static var _trust_mutex := Mutex.new()

## Call only on a worker thread. TLS verification stays enabled.
static func fetch(url: String, cancelled: Callable, max_bytes: int = 16777216, ca_path: String = "") -> Dictionary:
	if cancelled.is_valid() and cancelled.call():
		return {"cancelled":true}
	if OS.get_name() == "Windows" and ca_path.is_empty():
		var native_curl := OS.get_environment("SystemRoot").path_join("System32/curl.exe")
		if FileAccess.file_exists(native_curl):
			return _fetch_windows(native_curl,url,cancelled,max_bytes)
	var trust := _trusted_certificates(ca_path)
	if trust.has("error"):
		return trust
	for _redirect in range(5):
		if not url.begins_with("https://"):
			return {"error":"Geographic requests require HTTPS."}
		var rest := url.substr(8)
		var slash := rest.find("/")
		var host := rest if slash < 0 else rest.substr(0,slash)
		var request_path := "/" if slash < 0 else rest.substr(slash)
		if host.contains("@") or host.contains(":"):
			return {"error":"Invalid geographic host."}
		var client := HTTPClient.new()
		var certificates: X509Certificate = trust.get("certificates")
		var error := client.connect_to_host(host,443,TLSOptions.client(certificates))
		if error != OK:
			return {"error":"Cannot start geographic HTTPS connection."}
		var deadline := Time.get_ticks_msec()+30000
		while client.get_status() in [HTTPClient.STATUS_RESOLVING,HTTPClient.STATUS_CONNECTING]:
			if _stop(cancelled,deadline):
				client.close()
				return {"cancelled":true} if cancelled.is_valid() and cancelled.call() else {"error":"Geographic connection timed out."}
			client.poll()
			OS.delay_msec(2)
		if client.get_status() != HTTPClient.STATUS_CONNECTED:
			client.close()
			return {"error":"Geographic HTTPS connection failed (TLS and host checks remain enabled)."}
		error = client.request(HTTPClient.METHOD_GET,request_path,["Accept: application/x-protobuf, application/json, */*","Accept-Encoding: identity","User-Agent: GridCommand/1.0"])
		if error != OK:
			client.close()
			return {"error":"Cannot send geographic request."}
		while client.get_status() == HTTPClient.STATUS_REQUESTING:
			if _stop(cancelled,deadline):
				client.close()
				return {"cancelled":true} if cancelled.is_valid() and cancelled.call() else {"error":"Geographic request timed out."}
			client.poll()
			OS.delay_msec(2)
		if not client.has_response():
			client.close()
			return {"error":"Geographic server returned no response."}
		var code := client.get_response_code()
		var headers := client.get_response_headers_as_dictionary()
		if code in [301,302,303,307,308]:
			var location := ""
			for key in headers:
				if str(key).to_lower() == "location":
					location = str(headers[key])
			client.close()
			url = "https://"+host+location if location.begins_with("/") else location
			continue
		if code != 200:
			client.close()
			return {"error":"Geographic HTTP status %d." % code}
		if client.get_response_body_length() > max_bytes:
			client.close()
			return {"error":"Geographic response exceeds the size limit."}
		var bytes := PackedByteArray()
		while client.get_status() == HTTPClient.STATUS_BODY:
			if _stop(cancelled,deadline):
				client.close()
				return {"cancelled":true} if cancelled.is_valid() and cancelled.call() else {"error":"Geographic download timed out."}
			client.poll()
			var chunk := client.read_response_body_chunk()
			if bytes.size()+chunk.size() > max_bytes:
				client.close()
				return {"error":"Geographic response exceeds the size limit."}
			bytes.append_array(chunk)
			if chunk.is_empty():
				OS.delay_msec(2)
		client.close()
		if bytes.size() >= 2 and bytes[0] == 31 and bytes[1] == 139:
			bytes = bytes.decompress_dynamic(max_bytes,FileAccess.COMPRESSION_GZIP)
		if bytes.is_empty():
			return {"error":"Geographic response is empty or compressed data is invalid."}
		return {"bytes":bytes}
	return {"error":"Too many geographic redirects."}

static func _stop(cancelled: Callable, deadline: int) -> bool:
	return Time.get_ticks_msec() >= deadline or cancelled.is_valid() and cancelled.call()

static func _fetch_windows(executable: String,url: String,cancelled: Callable,max_bytes: int) -> Dictionary:
	# The Windows system curl uses Schannel and the current Windows trust store.
	# This also supports valid enterprise/antivirus roots that mbedTLS cannot parse.
	# No shell is used; URL data is a separate argument. Ignore user curl config.
	if not url.begins_with("https://") or url.contains("\n") or url.contains("\r"):
		return {"error":"Geographic requests require HTTPS."}
	var host := url.substr(8).split("/")[0]
	if host.is_empty() or host.contains("@") or host.contains(":"):
		return {"error":"Invalid geographic host."}
	var temporary := OS.get_temp_dir().path_join("grid-command-tile-%d-%s.bin" % [OS.get_process_id(),Crypto.new().generate_random_bytes(12).hex_encode()])
	# Best-effort revocation still rejects revoked certificates. It tolerates a
	# trusted local root with no CRL endpoint. Certificate and hostname validation
	# remain enabled; never use --insecure or --ssl-no-revoke.
	var arguments := PackedStringArray(["--disable","--globoff","--fail","--silent","--show-error","--proto","=https","--proto-redir","=https","--ssl-revoke-best-effort","--connect-timeout","10","--max-time","30","--max-filesize",str(max_bytes),"--location","--max-redirs","4","--header","Accept-Encoding: identity","--user-agent","GridCommand/1.0","--output",temporary,"--write-out","%{response_code}","--url",url])
	var process := OS.execute_with_pipe(executable,arguments,false)
	if process.is_empty():
		return {"error":"Cannot start the Windows geographic HTTPS transport."}
	var pid: int = process["pid"]
	var output: FileAccess = process["stdio"]
	var errors: FileAccess = process["stderr"]
	var status := ""
	var diagnostic := ""
	var deadline := Time.get_ticks_msec()+31000
	var interrupted := false
	while OS.is_process_running(pid):
		status += output.get_buffer(32).get_string_from_utf8()
		diagnostic = (diagnostic+errors.get_buffer(1024).get_string_from_utf8()).left(2048)
		var too_large := false
		if FileAccess.file_exists(temporary):
			var file := FileAccess.open(temporary,FileAccess.READ)
			if file != null:
				too_large = file.get_length() > max_bytes
		if _stop(cancelled,deadline) or too_large:
			interrupted = true
			OS.kill(pid)
			var stop_deadline := Time.get_ticks_msec()+500
			while OS.is_process_running(pid) and Time.get_ticks_msec() < stop_deadline:
				OS.delay_msec(2)
			break
		OS.delay_msec(5)
	status += output.get_buffer(32).get_string_from_utf8()
	diagnostic = (diagnostic+errors.get_buffer(1024).get_string_from_utf8()).left(2048)
	output.close()
	errors.close()
	var code := OS.get_process_exit_code(pid)
	var bytes := PackedByteArray()
	if not interrupted and code == 0 and status.strip_edges() == "200" and FileAccess.file_exists(temporary):
		var file := FileAccess.open(temporary,FileAccess.READ)
		if file != null and file.get_length() <= max_bytes:
			bytes = file.get_buffer(file.get_length())
	if FileAccess.file_exists(temporary):
		DirAccess.remove_absolute(temporary)
	if cancelled.is_valid() and cancelled.call():
		return {"cancelled":true}
	if interrupted:
		return {"error":"Geographic download timed out or exceeded the size limit."}
	if code != 0:
		return {"error":"Windows geographic HTTPS failed (%d): %s" % [code,diagnostic.strip_edges()]}
	if bytes.size() >= 2 and bytes[0] == 31 and bytes[1] == 139:
		bytes = bytes.decompress_dynamic(max_bytes,FileAccess.COMPRESSION_GZIP)
	if bytes.is_empty():
		return {"error":"Geographic response is empty, invalid, or not HTTP 200."}
	return {"bytes":bytes}

static func _trusted_certificates(ca_path: String) -> Dictionary:
	if not ca_path.is_empty():
		var configured := X509Certificate.new()
		if configured.load(ca_path) != OK:
			return {"error":"Cannot load the configured geographic CA certificates."}
		return {"certificates":configured}
	_trust_mutex.lock()
	if not _trust_loaded:
		var pem := FileAccess.get_file_as_string(PUBLIC_CA_BUNDLE) if FileAccess.file_exists(PUBLIC_CA_BUNDLE) else ""
		if not pem.is_empty():
			var certificates := X509Certificate.new()
			if certificates.load_from_string(pem) == OK:
				_cached_trust = certificates
		_trust_loaded = true
	var result := {"certificates":_cached_trust}
	_trust_mutex.unlock()
	return result
