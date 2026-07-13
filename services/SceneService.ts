import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CameraView } from '../types';

export class SceneService {
  public scene: THREE.Scene;
  public orthoCamera: THREE.OrthographicCamera;
  public persCamera: THREE.PerspectiveCamera;
  public camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public labelRenderer: CSS2DRenderer;
  public controls: OrbitControls;

  public ambientLight: THREE.AmbientLight;
  public dirLight: THREE.DirectionalLight;
  private backLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;

  public ambientIntensity: number = 0.7;
  public sunIntensity: number = 1.3;
  public shadowQuality: 'high' | 'low' | 'off' = 'off';

  private pivotMarker: THREE.Mesh;
  private container: HTMLElement | null = null;
  private animationFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  public isDirty: boolean = true;
  public wasDraggingControls: boolean = false;

  // Callbacks injected by facade
  public onBeforeFrame: (() => void) | null = null;
  public onPostRender: (() => void) | null = null;

  constructor() {
    // ── Scene ──
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8fafc);

    // ── Cameras ──
    const fr = 50;
    this.orthoCamera = new THREE.OrthographicCamera(-fr, fr, fr, -fr, 0.1, 50000);
    this.orthoCamera.up.set(0, 1, 0);
    this.persCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 50000);
    this.persCamera.up.set(0, 1, 0);
    this.camera = this.orthoCamera;

    // ── Renderer ──
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.labelRenderer = new CSS2DRenderer();

    // ── Lights ──
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    this.hemiLight.position.set(0, 200, 0);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
    this.dirLight.position.set(50, 200, 100);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 1;
    this.dirLight.shadow.camera.far = 5000;
    this.dirLight.shadow.camera.left = -100;
    this.dirLight.shadow.camera.right = 100;
    this.dirLight.shadow.camera.top = 100;
    this.dirLight.shadow.camera.bottom = -100;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    this.backLight = new THREE.DirectionalLight(0xffffff, 0.5);
    this.backLight.position.set(-50, -100, -50);
    this.scene.add(this.backLight);

    // ── Orbit Controls ──
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons = {
      LEFT: null as any,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: null as any,
    };

    // Control event listeners
    this.controls.addEventListener('start', () => {
      this.wasDraggingControls = false;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
      this.isDirty = true;
    });
    this.controls.addEventListener('change', () => {
      this.wasDraggingControls = true;
      this.isDirty = true;
    });
    this.controls.addEventListener('end', () => {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      if (this.pivotMarker && this.pivotMarker.visible) {
        this.pivotMarker.visible = false;
      }
      this.isDirty = true;
      setTimeout(() => { this.wasDraggingControls = false; }, 150);
    });

    // ── Pivot Marker ──
    this.pivotMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      })
    );
    this.pivotMarker.renderOrder = 9999;
    this.pivotMarker.visible = false;
    this.scene.add(this.pivotMarker);

    // Middle-button rotate setup
    this.setupMiddleRotate();
  }

  // ── Middle-button Ctrl+rotate via pivot ──
  private setupMiddleRotate() {
    const rotateCursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>') 12 12, auto`;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 1) {
        if (e.ctrlKey) {
          this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
          try {
            Object.defineProperty(e, 'ctrlKey', { get: () => false });
            Object.defineProperty(e, 'shiftKey', { get: () => false });
            Object.defineProperty(e, 'metaKey', { get: () => false });
          } catch (_) {}
        } else {
          this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
        }
      }

      const isRotateMiddle = e.button === 1 && this.controls.mouseButtons.MIDDLE === THREE.MOUSE.ROTATE;
      if (isRotateMiddle && this.container) {
        this.container.style.cursor = rotateCursor;
        // Defer depth-based pivot update to InteractionService via callback
      }
    };

    // We need to allow external code to set container before this listener attaches.
    // The facade will call setupContainerListeners.
    this._onPointerDown = onPointerDown;
  }

  private _onPointerDown: ((e: PointerEvent) => void) | null = null;

  /** Called by facade after container is set */
  attachContainerListeners(container: HTMLElement) {
    this.container = container;
    if (this._onPointerDown) {
      container.addEventListener('pointerdown', this._onPointerDown, { capture: true });
    }
    window.addEventListener('mouseup', () => {
      if (this.container) this.container.style.cursor = 'default';
    });
  }

  // ── Render Loop ──
  private animate = () => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.onBeforeFrame?.();
    this.controls.update();

    if (this.onPostRender) {
      this.onPostRender();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.isDirty = false;
  };

  startRenderLoop() {
    if (!this.animationFrameId) {
      this.animate();
    }
  }

  stopRenderLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // ── Initialization ──
  initContainer(container: HTMLElement) {
    this.container = container;
    this.updateCameraFrustum();

    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0px';
    this.labelRenderer.domElement.style.pointerEvents = 'none';

    // Initial view (ISO Y-up)
    this.camera.position.set(50, 50, 50);
    this.camera.lookAt(0, 0, 0);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();

    // ResizeObserver
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    // Attach renderer + label DOM
    container.appendChild(this.renderer.domElement);
    container.appendChild(this.labelRenderer.domElement);
  }

  reattachContainer(container: HTMLElement) {
    this.container = container;
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.labelRenderer.setSize(container.clientWidth, container.clientHeight);

    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    if (!container.contains(this.renderer.domElement)) {
      container.appendChild(this.renderer.domElement);
    }
    if (!container.contains(this.labelRenderer.domElement)) {
      container.appendChild(this.labelRenderer.domElement);
    }
  }

  // ── Resize ──
  handleResize = () => {
    if (!this.container) return;
    this.updateCameraFrustum();

    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.labelRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.isDirty = true;
  };

  // ── Camera Frustum ──
  updateCameraFrustum() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;

    if (this.camera instanceof THREE.OrthographicCamera) {
      const frustumSize = 100;
      this.camera.left = -frustumSize * aspect / 2;
      this.camera.right = frustumSize * aspect / 2;
      this.camera.top = frustumSize / 2;
      this.camera.bottom = -frustumSize / 2;
      this.camera.updateProjectionMatrix();
    } else if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }

  // ── Fit to Frame ──
  fitModelToFrame(box: THREE.Box3, center: THREE.Vector3, maxDim: number) {
    if (maxDim <= 0) {
      this.camera.position.set(50, 50, 50);
      this.camera.zoom = 1;
      this.camera.updateProjectionMatrix();
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      return;
    }

    const padding = 1.2;
    this.camera.up.set(0, 1, 0);

    const direction = new THREE.Vector3(1, 1, 1).normalize();
    const distance = maxDim * 2;
    const newPos = center.clone().add(direction.multiplyScalar(distance));
    this.camera.position.copy(newPos);
    this.camera.lookAt(center);

    if (this.camera instanceof THREE.OrthographicCamera) {
      const frustumHeight = this.camera.top - this.camera.bottom;
      const frustumWidth = this.camera.right - this.camera.left;
      this.camera.zoom = Math.min(
        frustumWidth / (maxDim * padding),
        frustumHeight / (maxDim * padding)
      );
    } else {
      this.camera.zoom = 1;
    }

    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  // ── Camera Views ──
  setCameraView(view: CameraView, center: THREE.Vector3, maxDim: number) {
    this.camera.up.set(0, 1, 0);
    const d = Math.max(maxDim, 40) * 1.5;
    const p = center.clone();

    switch (view) {
      case CameraView.TOP:
        p.add(new THREE.Vector3(0, d, 0));
        this.camera.up.set(0, 0, -1);
        break;
      case CameraView.BOTTOM:
        p.add(new THREE.Vector3(0, -d, 0));
        this.camera.up.set(0, 0, 1);
        break;
      case CameraView.FRONT:
        p.add(new THREE.Vector3(0, 0, d));
        break;
      case CameraView.BACK:
        p.add(new THREE.Vector3(0, 0, -d));
        break;
      case CameraView.LEFT:
        p.add(new THREE.Vector3(-d, 0, 0));
        break;
      case CameraView.RIGHT:
        p.add(new THREE.Vector3(d, 0, 0));
        break;
      case CameraView.ISO_NE:
        p.add(new THREE.Vector3(d, d, -d));
        break;
      case CameraView.ISO_NW:
        p.add(new THREE.Vector3(-d, d, -d));
        break;
      case CameraView.ISO_SE:
        p.add(new THREE.Vector3(d, d, d));
        break;
      case CameraView.ISO_SW:
        p.add(new THREE.Vector3(-d, d, d));
        break;
      case CameraView.ISO_TOP:
        p.add(new THREE.Vector3(d * 0.7, d * 0.9, d * 0.7));
        break;
      case CameraView.ISO_BOTTOM:
        p.add(new THREE.Vector3(d * 0.7, -d * 0.9, d * 0.7));
        break;
      default:
        p.add(new THREE.Vector3(d, d, d));
    }

    this.camera.position.copy(p);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  // ── Zoom ──
  zoomToBox(box: THREE.Box3) {
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    this.controls.target.copy(center);

    if (this.camera instanceof THREE.OrthographicCamera) {
      const viewW = Math.abs(this.camera.right - this.camera.left);
      const viewH = Math.abs(this.camera.top - this.camera.bottom);
      const minViewDim = Math.min(viewW, viewH);
      const targetZoom = minViewDim / (maxDim * 2.0);
      this.camera.zoom = THREE.MathUtils.clamp(targetZoom, 0.1, 20.0);
      this.camera.updateProjectionMatrix();
    } else {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const distance = maxDim > 0 ? maxDim * 1.5 : 5;
      this.camera.position.copy(center).addScaledVector(dir.negate(), distance);
    }

    this.controls.update();
  }

  zoomToTarget(target: THREE.Vector3, distance: number) {
    this.controls.target.copy(target);
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.zoom = Math.min(10, Math.max(1, distance / 5));
      this.camera.updateProjectionMatrix();
    } else {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.camera.position.copy(target).addScaledVector(dir.negate(), distance);
    }
    this.controls.update();
    this.isDirty = true;
  }

  // ── Shadow ──
  setShadowQuality(quality: 'high' | 'low' | 'off') {
    this.shadowQuality = quality;
    const enabled = quality !== 'off';
    const mapSize = quality === 'high' ? 2048 : 1024;

    this.renderer.shadowMap.enabled = enabled;
    this.dirLight.castShadow = enabled;
    if (enabled) {
      this.dirLight.shadow.mapSize.set(mapSize, mapSize);
      this.dirLight.shadow.bias = -0.0005;
    }
  }

  updateShadowCameraFrustum(modelBoundingGetter: () => THREE.Box3 | null) {
    if (this.shadowQuality === 'off') return;
    const box = modelBoundingGetter();
    if (!box || box.isEmpty()) return;

    const size = Math.max(
      box.max.x - box.min.x,
      box.max.y - box.min.y,
      box.max.z - box.min.z
    ) * 1.3;

    this.dirLight.shadow.camera.left = -size;
    this.dirLight.shadow.camera.right = size;
    this.dirLight.shadow.camera.top = size;
    this.dirLight.shadow.camera.bottom = -size;
    this.dirLight.shadow.camera.updateProjectionMatrix();
  }

  // ── Lighting ──
  setAmbientIntensity(val: number) {
    this.ambientIntensity = val;
    this.ambientLight.intensity = val;
  }

  setSunIntensity(val: number) {
    this.sunIntensity = val;
    // DirLight intensity handled in render
  }

  updateLighting(_timeOfDay: number, _azimuth: number, _altitude: number) {
    // No-op — sun/lighting panel removed
  }

  // ── Screenshot ──
  captureScreenshot(filename: string = 'bimvision-screenshot.png') {
    this.renderer.render(this.scene, this.camera);
    const dataURL = this.renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ── Background ──
  setBackground(color: number) {
    (this.scene.background as THREE.Color).set(color);
  }

  // ── Switch active camera ──
  switchToPerspective() {
    this.camera = this.persCamera;
    this.controls.object = this.persCamera;
  }

  switchToOrthographic() {
    this.camera = this.orthoCamera;
    this.controls.object = this.orthoCamera;
    this.controls.update();
  }

  // ── Pivot ──
  showPivot(position: THREE.Vector3, depthDistance: number) {
    this.pivotMarker.position.copy(position);
    const scale = depthDistance * 0.02;
    this.pivotMarker.scale.set(scale, scale, scale);
    this.pivotMarker.visible = true;
    this.isDirty = true;
  }

  hidePivot() {
    this.pivotMarker.visible = false;
  }

  // ── Cleanup (safe, does NOT destroy WebGL context) ──
  dispose() {
    this.stopRenderLoop();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this._onPointerDown && this.container) {
      this.container.removeEventListener('pointerdown', this._onPointerDown);
    }
    // Remove canvas elements from DOM without destroying WebGL context
    if (this.renderer?.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this.labelRenderer?.domElement?.parentNode) {
      this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
    }
    // NOTE: DO NOT call renderer.dispose() or controls.dispose() here —
    // they destroy the WebGL context, breaking React StrictMode re-mount.
  }

  getContainer(): HTMLElement | null {
    return this.container;
  }
}
