import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import {
  IFCElementData,
  ViewerTool,
  MeasurementMode,
  CameraView,
  IFCSpatialStructure,
} from '../types';
import { SceneService } from './SceneService';
import { ModelService } from './ModelService';
import { LoadingService } from './LoadingService';
import { InteractionService } from './InteractionService';
import { WalkthroughService } from './WalkthroughService';
import { MeasurementManager } from './MeasurementManager';
import { SectionManager } from './SectionManager';
import { AnnotationManager } from './AnnotationManager';
import { PostProcessingManager } from './PostProcessing';

// Enable BVH acceleration (must run once)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/**
 * IFCManager — Thin facade coordinating all services.
 * Maintains backward compatibility with all existing components.
 *
 * Architecture:
 *   IFCManager (facade)
 *     ├── SceneService        — scene, cameras, renderer, lights, controls, shadows, render loop
 *     ├── ModelService        — model CRUD, hide/show, isolate, bounding box, spatial, stats
 *     ├── LoadingService      — Worker, IFC/GLB loading, batcher, cache, property/report queries
 *     ├── InteractionService  — raycasting, selection, highlight/hover, keyboard, tool mgmt
 *     └── WalkthroughService  — walk mode, WASD, collision, touch
 */
export class IFCManager {
  // ── Services ──
  public sceneService: SceneService;
  public modelService: ModelService;
  public loadingService: LoadingService;
  public interactionService: InteractionService;
  public walkthroughService: WalkthroughService;

  // ── Sub-services (externally managed) ──
  public measurementManager: MeasurementManager | null = null;
  public sectionManager: SectionManager | null = null;
  public annotationManager: AnnotationManager | null = null;
  public postProcessing: PostProcessingManager | null = null;

  // ── Container ──
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isInitialized: boolean = false;

  // ── Callbacks ──
  public onSelect: (data: IFCElementData | null) => void = () => {};
  public onMultiSelect?: (items: Array<{ modelID: number; expressID: number }>) => void;
  public onLoading: (progress: number, total: number) => void = () => {};
  public onProcessing: (message: string | null) => void = () => {};
  public onError: (msg: string) => void = () => {};

  constructor() {
    this.sceneService = new SceneService();
    this.modelService = new ModelService(this.sceneService.scene);
    this.loadingService = new LoadingService(
      this.sceneService.scene,
      this.modelService,
      this.sceneService
    );
    this.interactionService = new InteractionService(
      this.sceneService,
      this.modelService,
      this.loadingService
    );
    this.walkthroughService = new WalkthroughService(
      this.sceneService,
      this.modelService
    );

    // Wire callbacks
    this.loadingService.onLoading = (p, t) => this.onLoading(p, t);
    this.loadingService.onProcessing = (m) => this.onProcessing(m);
    this.loadingService.onError = (m) => this.onError(m);
    this.loadingService.onModelLoaded = () => {
      window.dispatchEvent(new CustomEvent('model-loaded'));
    };
  }

  // ═══════════════════════════════════════════
  //  Delegated properties (read-only shortcuts)
  // ═══════════════════════════════════════════

  get scene(): THREE.Scene {
    return this.sceneService.scene;
  }
  get camera(): THREE.OrthographicCamera | THREE.PerspectiveCamera {
    return this.sceneService.camera;
  }
  get orthoCamera(): THREE.OrthographicCamera {
    return this.sceneService.orthoCamera;
  }
  get persCamera(): THREE.PerspectiveCamera {
    return this.sceneService.persCamera;
  }
  get renderer(): THREE.WebGLRenderer {
    return this.sceneService.renderer;
  }
  get labelRenderer(): CSS2DRenderer {
    return this.sceneService.labelRenderer;
  }
  get controls(): OrbitControls {
    return this.sceneService.controls;
  }
  get ambientLight(): THREE.AmbientLight {
    return this.sceneService.ambientLight;
  }
  get dirLight(): THREE.DirectionalLight {
    return this.sceneService.dirLight;
  }

  get models(): Map<number, { group: THREE.Group; modelID: number; name: string }> {
    return this.modelService.models;
  }
  get parentMap(): Map<string, string> {
    return this.modelService.parentMap;
  }
  get savedStructures(): Map<number, IFCSpatialStructure> {
    return this.modelService.savedStructures;
  }
  get hasHiddenElements(): boolean {
    return this.modelService.hasHiddenElements;
  }
  get isIsolated(): boolean {
    return this.modelService.isIsolated;
  }

  get ifcUpAxis(): 'Y' | 'Z' {
    return this.modelService.ifcUpAxis;
  }
  set ifcUpAxis(v: 'Y' | 'Z') {
    this.modelService.ifcUpAxis = v;
  }
  get glbUpAxis(): 'Y' | 'Z' {
    return this.modelService.glbUpAxis;
  }
  set glbUpAxis(v: 'Y' | 'Z') {
    this.modelService.glbUpAxis = v;
  }

  get ambientIntensity(): number {
    return this.sceneService.ambientIntensity;
  }
  set ambientIntensity(v: number) {
    this.sceneService.ambientIntensity = v;
  }
  get sunIntensity(): number {
    return this.sceneService.sunIntensity;
  }
  set sunIntensity(v: number) {
    this.sceneService.sunIntensity = v;
  }
  get shadowQuality(): 'high' | 'low' | 'off' {
    return this.sceneService.shadowQuality;
  }
  set shadowQuality(v: 'high' | 'low' | 'off') {
    this.sceneService.shadowQuality = v;
  }

  get enableHoverHighlight(): boolean {
    return this.interactionService.enableHoverHighlight;
  }
  set enableHoverHighlight(v: boolean) {
    this.interactionService.enableHoverHighlight = v;
  }

  get activeTool(): ViewerTool {
    return this.interactionService.activeTool;
  }

  // ═══════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════

  async init(container: HTMLElement) {
    this.container = container;

    if (!this.isInitialized) {
      // First-time init
      this.sceneService.initContainer(container);
      this.sceneService.attachContainerListeners(container);

      // Sub-services that need scene/camera/renderer (only create once)
      if (!this.sectionManager) {
        this.sectionManager = new SectionManager(
          this.sceneService.renderer,
          this.sceneService.scene,
          (planes) => this.interactionService.updateClippingPlanesForMaterials(planes)
        );
      }
      if (!this.measurementManager) {
        this.measurementManager = new MeasurementManager(
          this.sceneService.scene,
          this.sceneService.camera,
          container
        );
      }
      if (!this.annotationManager) {
        this.annotationManager = new AnnotationManager();
        this.annotationManager.init(
          this.sceneService.scene,
          this.sceneService.camera,
          this.sceneService.labelRenderer,
          container
        );
      }
      if (!this.postProcessing) {
        this.postProcessing = new PostProcessingManager(
          this.sceneService.renderer,
          this.sceneService.scene,
          this.sceneService.camera
        );
      }

      // Wire sub-services to interaction service
      this.interactionService.measurementManager = this.measurementManager;
      this.interactionService.annotationManager = this.annotationManager;
      this.interactionService.postProcessing = this.postProcessing;

      // Wire walkthrough sub-service
      this.walkthroughService.postProcessing = this.postProcessing;

      // Resize handling
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(container);

      // Event listeners
      window.addEventListener('keydown', this.interactionService.handleKeyDown);
      const dom = this.sceneService.renderer.domElement;
      dom.addEventListener('mousemove', this.interactionService.handleMouseMove);
      dom.addEventListener('click', this.interactionService.handleClick);
      dom.addEventListener('dblclick', this.interactionService.handleDoubleClick);
      dom.addEventListener('contextmenu', this.interactionService.handleContextMenu);

      // Custom events
      window.addEventListener('zoom-to-measurement', (e: Event) => {
        const ce = e as CustomEvent;
        if (this.measurementManager && ce.detail?.id) {
          const box = this.measurementManager.getMeasurementBox(ce.detail.id);
          if (box && !box.isEmpty()) this.sceneService.zoomToBox(box);
        }
      });

      window.addEventListener('annotation-focus', (e: Event) => {
        const ce = e as CustomEvent;
        if (ce.detail?.target) {
          const t = ce.detail.target;
          this.sceneService.zoomToTarget(new THREE.Vector3(t.x, t.y, t.z), 15);
        }
      });

      // Set up render loop with post-processing
      this.sceneService.onPostRender = () => {
        if (this.postProcessing) {
          this.postProcessing.render();
        } else {
          this.sceneService.renderer.render(this.sceneService.scene, this.sceneService.camera);
        }
        if (this.measurementManager) {
          this.sceneService.labelRenderer.render(this.sceneService.scene, this.sceneService.camera);
        }
      };

      this.sceneService.onBeforeFrame = () => {
        if (this.walkthroughService.isWalking) {
          this.walkthroughService.updatePosition();
          this.sceneService.isDirty = true;
        }
      };

      // Start render loop
      this.sceneService.startRenderLoop();

      // Init worker
      try {
        this.loadingService.initWorker();
        this.isInitialized = true;
        console.log('IFCManager and Worker Initialized');
      } catch (e) {
        console.error('Worker Init Failed:', e);
        this.onError('Worker 初始化失败');
      }
    } else {
      // Re-mount
      this.sceneService.reattachContainer(container);
      if (this.measurementManager) {
        this.measurementManager.updateContainer(container);
      }
      if (this.annotationManager) {
        this.annotationManager.init(
          this.sceneService.scene,
          this.sceneService.camera,
          this.sceneService.labelRenderer,
          container
        );
      }
      if (this.resizeObserver) this.resizeObserver.disconnect();
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(container);
    }

    // Wire interaction callbacks
    this.interactionService.onSelect = (data) => this.onSelect(data);
    this.interactionService.onMultiSelect = (items) => this.onMultiSelect?.(items);
  }

  private handleResize = () => {
    this.sceneService.handleResize();
    this.postProcessing?.handleResize();
  };

  dispose() {
    // Remove event listeners
    window.removeEventListener('keydown', this.interactionService.handleKeyDown);
    const dom = this.sceneService.renderer?.domElement;
    if (dom) {
      dom.removeEventListener('mousemove', this.interactionService.handleMouseMove);
      dom.removeEventListener('click', this.interactionService.handleClick);
      dom.removeEventListener('dblclick', this.interactionService.handleDoubleClick);
      dom.removeEventListener('contextmenu', this.interactionService.handleContextMenu);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.isInitialized = false;
    this.sectionManager?.clear();

    // Dispose services
    this.interactionService.dispose();
    this.walkthroughService.dispose();
    this.loadingService.dispose();
    this.modelService.dispose();
    this.sceneService.dispose();
  }

  // ═══════════════════════════════════════════
  //  Scene / Camera operations
  // ═══════════════════════════════════════════

  fitModelToFrame() {
    const meta = this.modelService.getMergedBoundingBox();
    if (meta.size > 0) {
      this.sceneService.fitModelToFrame(meta.box, meta.center, meta.size);
      this.sceneService.updateShadowCameraFrustum(() => {
        const m = this.modelService.getMergedBoundingBox();
        return m.size > 0 ? m.box : null;
      });
    }
  }

  setCameraView(view: CameraView) {
    const { center, size } = this.modelService.getMergedBoundingBox();
    if (size <= 0) return;
    this.sceneService.setCameraView(view, center, size);
  }

  zoomToHighlight() {
    this.interactionService.zoomToSelection();
  }

  setOrientations(ifcUpAxis: 'Y' | 'Z', glbUpAxis: 'Y' | 'Z') {
    this.modelService.setOrientations(ifcUpAxis, glbUpAxis);
    this.sceneService.camera.up.set(0, 1, 0);
    this.sceneService.camera.updateProjectionMatrix();
    this.renderScene();
  }

  setUpAxis(axis: 'Y' | 'Z') {
    this.modelService.setUpAxis(axis);
    this.sceneService.camera.up.set(0, 1, 0);
    this.sceneService.camera.updateProjectionMatrix();
    this.renderScene();
  }

  // ═══════════════════════════════════════════
  //  Lighting / Shadow
  // ═══════════════════════════════════════════

  setAmbientIntensity(val: number) {
    this.sceneService.setAmbientIntensity(val);
    this.renderScene();
  }

  setSunIntensity(val: number) {
    this.sceneService.setSunIntensity(val);
    this.renderScene();
  }

  setShadowQuality(quality: 'high' | 'low' | 'off') {
    this.sceneService.setShadowQuality(quality);
    this.modelService.models.forEach((m) => {
      m.group.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.castShadow = quality !== 'off';
          c.receiveShadow = quality !== 'off';
        }
      });
    });
    this.renderScene();
  }

  updateShadowCameraFrustum() {
    this.sceneService.updateShadowCameraFrustum(() => {
      const meta = this.modelService.getMergedBoundingBox();
      return meta.size > 0 ? meta.box : null;
    });
  }

  updateLighting(_timeOfDay: number, _azimuth: number, _altitude: number) {}

  // ═══════════════════════════════════════════
  //  Loading
  // ═══════════════════════════════════════════

  loadIfc = async (file: File, fitToFrame = true) => {
    await this.loadingService.loadIfc(file, fitToFrame);
  };

  loadGlb = async (file: File, fitToFrame = true) => {
    await this.loadingService.loadGlb(file, fitToFrame);
  };

  // ═══════════════════════════════════════════
  //  Model management
  // ═══════════════════════════════════════════

  clearModels() {
    this.modelService.clearAll();
    this.interactionService.clearSelection();
    if (this.onMultiSelect) this.onMultiSelect([]);
    this.sectionManager?.clear();
    this.sceneService.renderer.clear();
    this.sceneService.camera.zoom = 1;
    this.sceneService.camera.position.set(50, 50, 50);
    this.sceneService.camera.lookAt(0, 0, 0);
    this.sceneService.camera.updateProjectionMatrix();
    this.sceneService.controls.target.set(0, 0, 0);
    this.sceneService.controls.update();
    this.renderScene();
  }

  removeModel(modelID: number) {
    this.loadingService.clearModelInWorker(modelID);
    this.modelService.unregisterModel(modelID);

    const hlMesh = this.interactionService.highlightModelMesh;
    if (hlMesh && hlMesh.userData.modelID === modelID) {
      this.interactionService.clearSelection();
      this.onSelect(null);
    }
    this.renderScene();
  }

  toggleModelVisibility(modelID: number): boolean {
    return this.modelService.toggleModelVisibility(modelID);
  }

  isModelVisible(modelID: number): boolean {
    return this.modelService.isModelVisible(modelID);
  }

  rotateModel(id: number, axis: string, angle: number) {
    this.modelService.rotateModel(id, axis, angle);
    this.renderScene();
  }

  getModelBoundingBox() {
    const meta = this.modelService.getMergedBoundingBox();
    return { min: meta.box.min, max: meta.box.max, center: meta.center, size: meta.size };
  }

  getFullSpatialStructure() {
    return this.modelService.getFullSpatialStructure();
  }

  getStatistics() {
    return this.modelService.getStatistics({
      geometries: this.sceneService.renderer?.info.memory.geometries || 0,
      triangles: this.sceneService.renderer?.info.render.triangles || 0,
    });
  }

  // ═══════════════════════════════════════════
  //  Selection / Highlight
  // ═══════════════════════════════════════════

  async selectByID(modelID: number, expressID: number, zoomTo = false) {
    await this.interactionService.selectByID(modelID, expressID, zoomTo);
  }

  async selectElementsByExpressIDs(modelID: number, expressIDs: number[], zoomTo = false) {
    await this.interactionService.selectElementsByExpressIDs(modelID, expressIDs, zoomTo);
  }

  clearSelection() {
    this.interactionService.clearSelection();
  }

  // ═══════════════════════════════════════════
  //  Element operations
  // ═══════════════════════════════════════════

  hideElement(modelID: number, expressID: number) {
    const didHide = this.modelService.hideElement(modelID, expressID);
    if (didHide) {
      this.interactionService.clearSelection();
      this.onSelect(null);
      this.renderScene();
    }
  }

  showElement(modelID: number, expressID: number) {
    this.modelService.showElement(modelID, expressID);
    this.renderScene();
  }

  showAllElements() {
    this.modelService.showAllElements();
    this.renderScene();
  }

  async isolateElement(modelID: number, expressID: number) {
    this.modelService.isolateElement(modelID, expressID);
    await this.interactionService.highlightElement(modelID, expressID);
    window.dispatchEvent(new CustomEvent('viewer-isolation-changed', { detail: { isIsolated: true } }));
  }

  unisolateAll() {
    this.modelService.clearIsolation();
    window.dispatchEvent(new CustomEvent('viewer-isolation-changed', { detail: { isIsolated: false } }));
  }

  // ═══════════════════════════════════════════
  //  Tool / measurement
  // ═══════════════════════════════════════════

  setTool(t: ViewerTool) {
    this.interactionService.setTool(t);

    if (t !== ViewerTool.SECTION) this.sectionManager?.clear();

    if (t === ViewerTool.WALK) {
      this.walkthroughService.activate();
    } else if (this.walkthroughService.isWalking) {
      this.walkthroughService.deactivate();
    }

    this.renderScene();
  }

  setMeasurementMode(m: MeasurementMode) {
    this.measurementManager?.setMode(m);
  }

  // ═══════════════════════════════════════════
  //  Queries (worker)
  // ═══════════════════════════════════════════

  getAllPropertiesForStats(modelID: number): Promise<string[]> {
    return this.loadingService.getAllPropertiesForStats(modelID);
  }

  generateReport(modelID: number, config: any): Promise<any[]> {
    return this.loadingService.generateReport(modelID, config);
  }

  // ═══════════════════════════════════════════
  //  Screenshot
  // ═══════════════════════════════════════════

  captureScreenshot(filename = 'bimvision-screenshot.png') {
    this.sceneService.captureScreenshot(filename);
  }

  // ═══════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════

  renderScene() {
    this.sceneService.isDirty = true;
  }
}

export const ifcManager = new IFCManager();
