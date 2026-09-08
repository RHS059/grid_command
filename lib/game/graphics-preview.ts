import { BabylonRuntime } from './babylon-runtime'
import { DEFAULT_GRAPHICS } from './types'
import { Vector3, type Scene, type PerspectiveCamera } from './scene-data'
/** Preview lifecycle is asynchronous so adapter discovery never blocks React. */
export class GraphicsRenderer {
  domElement = document.createElement('canvas')
  readonly ready: Promise<void>
  private runtime?: BabylonRuntime
  private disposed = false
  private ratio = 1
  private width = 0
  private height = 0
  constructor(_options: { antialias?: boolean; alpha?: boolean } = {}) {
    this.ready = BabylonRuntime.create(this.domElement).then(runtime => {
      if (this.disposed) { runtime.dispose(); return }
      this.runtime = runtime; this.domElement = runtime.canvas
      runtime.resize(Math.max(2,this.width),Math.max(2,this.height),this.ratio);runtime.configure(DEFAULT_GRAPHICS)
    })
  }
  setPixelRatio(ratio: number) { this.ratio = ratio }
  setSize(width: number, height: number) { this.width = width; this.height = height; this.domElement.style.width = `${width}px`; this.domElement.style.height = `${height}px`; this.runtime?.resize(width, height, this.ratio) }
  render(scene: Scene, camera: PerspectiveCamera) { if (!this.runtime || this.disposed || this.width < 2 || this.height < 2) return; this.runtime.setCamera(camera.position, camera.target, camera.up, camera.fov * Math.PI / 180, camera.near, camera.far); this.runtime.sync(scene); this.runtime.render() }
  dispose() { this.disposed = true; this.runtime?.dispose() }
}
export class OrbitControls {
  target = new Vector3()
  enableDamping = true
  dampingFactor = .075
  autoRotate = false
  autoRotateSpeed = 1
  minDistance = .1
  maxDistance = 10000
  minPolarAngle = .01
  maxPolarAngle = Math.PI * .49
  private pointer?: { id: number; x: number; y: number }
  private cleanup: (() => void)[] = []
  private previous = performance.now()
  constructor(private camera: PerspectiveCamera, element: HTMLElement) {
    // Listeners on the host survive a GPU-context fallback replacing the canvas.
    const host = element.parentElement || element
    const listen = <K extends keyof HTMLElementEventMap>(name: K, callback: (event: HTMLElementEventMap[K]) => void) => { host.addEventListener(name, callback as EventListener, { passive: false }); this.cleanup.push(() => host.removeEventListener(name, callback as EventListener)) }
    listen('pointerdown', event => { if (event.target !== element && !(event.target instanceof HTMLCanvasElement)) return; this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; host.setPointerCapture(event.pointerId); event.preventDefault() })
    listen('pointermove', event => { if (!this.pointer || this.pointer.id !== event.pointerId) return; const offset = this.camera.position.clone().sub(this.target), radius = offset.length(), theta = Math.atan2(offset.y, offset.x) - (event.clientX - this.pointer.x) * .008, phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, Math.acos(offset.z / Math.max(.0001, radius)) - (event.clientY - this.pointer.y) * .008)); this.camera.position.copy(this.target).add(new Vector3(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi))); this.pointer.x = event.clientX; this.pointer.y = event.clientY })
    listen('pointerup', () => { this.pointer = undefined }); listen('pointercancel', () => { this.pointer = undefined })
    listen('wheel', event => { event.preventDefault(); const direction = this.camera.position.clone().sub(this.target), distance = Math.max(this.minDistance, Math.min(this.maxDistance, direction.length() * Math.exp(Math.max(-100, Math.min(100, event.deltaY)) * .002))); this.camera.position.copy(this.target).add(direction.normalize().multiplyScalar(distance)) })
  }
  update() { const now = performance.now(), dt = Math.min(.05, (now - this.previous) / 1000); this.previous = now; if (this.autoRotate && !this.pointer) { const offset = this.camera.position.clone().sub(this.target), theta = this.autoRotateSpeed * dt * .2, x = offset.x * Math.cos(theta) - offset.y * Math.sin(theta), y = offset.x * Math.sin(theta) + offset.y * Math.cos(theta); this.camera.position.set(this.target.x + x, this.target.y + y, this.target.z + offset.z) } this.camera.lookAt(this.target) }
  dispose() { for (const cleanup of this.cleanup) cleanup() }
}
