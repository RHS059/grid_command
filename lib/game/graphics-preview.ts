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
  enableKeyboard = false
  minDistance = .1
  maxDistance = 10000
  minPolarAngle = .01
  maxPolarAngle = Math.PI * .49
  private pointer?: { id: number; x: number; y: number; pan: boolean }
  private keys = new Set<string>()
  private cleanup: (() => void)[] = []
  private previous = performance.now()
  constructor(private camera: PerspectiveCamera, element: HTMLElement) {
    // Host listeners survive GPU fallback replacing the canvas.
    const host = element.parentElement || element
    const oldTabIndex = host.getAttribute('tabindex'), oldTouchAction = host.style.touchAction
    if (oldTabIndex === null) host.tabIndex = 0
    host.style.touchAction = 'none'
    this.cleanup.push(() => { if (oldTabIndex === null) host.removeAttribute('tabindex'); else host.setAttribute('tabindex', oldTabIndex); host.style.touchAction = oldTouchAction })
    const listen = <K extends keyof HTMLElementEventMap>(name: K, callback: (event: HTMLElementEventMap[K]) => void) => { host.addEventListener(name, callback as EventListener, { passive: false }); this.cleanup.push(() => host.removeEventListener(name, callback as EventListener)) }
    const clear = () => { this.pointer = undefined; this.keys.clear() }
    listen('pointerdown', event => {
      if (event.target !== element && !(event.target instanceof HTMLCanvasElement)) return
      if (![0, 1, 2].includes(event.button)) return
      host.focus({ preventScroll: true })
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button !== 0 || event.shiftKey }
      host.setPointerCapture(event.pointerId); event.preventDefault()
    })
    listen('pointermove', event => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return
      const dx = event.clientX - this.pointer.x, dy = event.clientY - this.pointer.y
      const offset = this.camera.position.clone().sub(this.target), radius = offset.length()
      if (this.pointer.pan) {
        const forward = offset.clone().normalize().multiplyScalar(-1), right = new Vector3().crossVectors(forward, this.camera.up).normalize(), up = new Vector3().crossVectors(right, forward)
        const metresPerPixel = 2 * radius * Math.tan(this.camera.fov * Math.PI / 360) / Math.max(1, host.clientHeight)
        const motion = right.multiplyScalar(-dx * metresPerPixel).addScaledVector(up, dy * metresPerPixel)
        this.camera.position.add(motion); this.target.add(motion)
      } else {
        const theta = Math.atan2(offset.y, offset.x) - dx * .008, phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, Math.acos(offset.z / Math.max(.0001, radius)) - dy * .008))
        this.camera.position.copy(this.target).add(new Vector3(radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi)))
      }
      this.pointer.x = event.clientX; this.pointer.y = event.clientY; event.preventDefault()
    })
    listen('pointerup', () => { this.pointer = undefined }); listen('pointercancel', clear); listen('lostpointercapture', () => { this.pointer = undefined })
    listen('contextmenu', event => event.preventDefault())
    listen('wheel', event => { event.preventDefault(); const direction = this.camera.position.clone().sub(this.target), distance = Math.max(this.minDistance, Math.min(this.maxDistance, direction.length() * Math.exp(Math.max(-100, Math.min(100, event.deltaY)) * .002))); this.camera.position.copy(this.target).add(direction.normalize().multiplyScalar(distance)) })
    listen('keydown', event => {
      if (!this.enableKeyboard || event.target !== host || event.ctrlKey || event.altKey || event.metaKey || !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) return
      this.keys.add(event.code); event.preventDefault()
    })
    listen('keyup', event => { if (this.keys.delete(event.code)) event.preventDefault() })
    listen('blur', clear)
    const hidden = () => { if (document.hidden) clear() }
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', hidden)
    this.cleanup.push(() => { window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', hidden); clear() })
  }
  update(delta?: number) {
    const now = performance.now(), dt = Math.min(.05, delta ?? (now - this.previous) / 1000); this.previous = now
    const offset = this.camera.position.clone().sub(this.target)
    const motion = this.enableKeyboard ? previewCameraMovement(this.keys, offset, this.camera.up, dt) : new Vector3()
    this.camera.position.add(motion); this.target.add(motion)
    if (this.autoRotate && !this.pointer && motion.lengthSq() === 0) {
      const theta = this.autoRotateSpeed * dt * .2, x = offset.x * Math.cos(theta) - offset.y * Math.sin(theta), y = offset.x * Math.sin(theta) + offset.y * Math.cos(theta)
      this.camera.position.set(this.target.x + x, this.target.y + y, this.target.z + offset.z)
    }
    this.camera.lookAt(this.target)
  }
  dispose() { for (const cleanup of this.cleanup) cleanup() }
}

/** Translation is independent of frame rate and diagonal key combinations. */
export function previewCameraMovement(keys: ReadonlySet<string>, offset: Vector3, up: Vector3, delta: number) {
  const forward = offset.clone().normalize().multiplyScalar(-1), right = new Vector3().crossVectors(forward, up).normalize()
  const horizontal = Number(keys.has('KeyD')) - Number(keys.has('KeyA')), longitudinal = Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
  const direction = right.multiplyScalar(horizontal).addScaledVector(forward, longitudinal).normalize()
  const speed = Math.max(1, offset.length() * .65) * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3 : 1)
  return direction.multiplyScalar(speed * Math.min(.05, Math.max(0, delta)))
}


