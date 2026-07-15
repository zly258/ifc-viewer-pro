import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ViewerTool, IFCElementData } from '../types';
import { SceneService } from './SceneService';
import { ModelService } from './ModelService';
import { LoadingService } from './LoadingService';
import type { MeasurementManager } from './MeasurementManager';
import type { PostProcessingManager } from './PostProcessing';
import { eventBus } from './eventBus';

export class InteractionService {
  private sceneService: SceneService;
  private modelService: ModelService;
  private loadingService: LoadingService;

  // Sub-service references (set by facade)
  public measurementManager: MeasurementManager | null = null;
  public postProcessing: PostProcessingManager | null = null;

  // ── Raycaster ──
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // ── Tool state ──
  public activeTool: ViewerTool = ViewerTool.NONE;

  // ── Highlight materials ──
  public highlightMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    side: THREE.DoubleSide,
    emissive: 0x60a5fa,
    emissiveIntensity: 0.5,
  });

  public hoverMaterial = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.35,
    depthTest: false,
    side: THREE.DoubleSide,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.3,
  });

  // ── Selection state ──
  public selectedElements: Array<{ modelID: number; expressID: number }> = [];
  public multiHighlightMeshes: THREE.Mesh[] = [];
  private highlightModel: THREE.Mesh | null = null;

  // ── Hover state ──
  private hoverModel: THREE.Mesh | null = null;
  private hoveredElement: { modelID: number; expressID: number } | null = null;
  public enableHoverHighlight: boolean = true;

  // ── Callbacks ──
  public onSelect: (data: IFCElementData | null) => void = () => {};
  public onMultiSelect?: (items: Array<{ modelID: number; expressID: number }>) => void;

  constructor(
    sceneService: SceneService,
    modelService: ModelService,
    loadingService: LoadingService
  ) {
    this.sceneService = sceneService;
    this.modelService = modelService;
    this.loadingService = loadingService;
  }

  // ── Tool ──
  setTool(t: ViewerTool) {
    this.activeTool = t;
    this.measurementManager?.setActive(t === 'MEASURE');

    // Update material side for Section mode
    const side = t === ViewerTool.SECTION ? THREE.DoubleSide : THREE.FrontSide;
    this.loadingService.getMaterialCache().forEach((mat) => {
      if (mat.side !== side) {
        mat.side = side;
        mat.needsUpdate = true;
      }
    });

    this.sceneService.isDirty = true;
  }

  // ── Clipping planes ──
  updateClippingPlanesForMaterials(planes: THREE.Plane[]) {
    this.loadingService.getMaterialCache().forEach((mat) => {
      mat.clippingPlanes = planes;
      mat.needsUpdate = true;
    });
    this.highlightMaterial.clippingPlanes = planes;
    this.highlightMaterial.needsUpdate = true;
    this.hoverMaterial.clippingPlanes = planes;
    this.hoverMaterial.needsUpdate = true;
    this.sceneService.isDirty = true;
  }

  // ── Raycast ──
  castRay(
    event: MouseEvent | { clientX: number; clientY: number }
  ): {
    modelID: number;
    expressID: number;
    mesh: THREE.Mesh;
    point: THREE.Vector3;
  } | null {
    const domElement = this.sceneService.renderer.domElement;
    const container = this.sceneService.getContainer();
    if (!container || !domElement) return null;

    const rect = domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.sceneService.camera);
    this.raycaster.firstHitOnly = true;

    const excludes = this.multiHighlightMeshes;
    const targets = this.modelService.getRaycastMeshes().filter((c) => !excludes.includes(c));
    const intersects = this.raycaster.intersectObjects(targets, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const mesh = hit.object as THREE.Mesh;
      let expressID = -1;
      let modelID = mesh.userData.modelID;

      if (mesh.userData.isBatch) {
        // Use batcher for expressID
        const id = this.loadingService.getExpressIDFromHit(hit);
        if (id !== null) expressID = id;
      } else if (mesh.userData.expressID !== undefined) {
        expressID = mesh.userData.expressID;
      }

      return { modelID, expressID, mesh, point: hit.point };
    }
    return null;
  }

  // ── Rotate pivot ──
  // Re-derives the OrbitControls pivot (controls.target) at rotate-start so the
  // close-up view orbits around the geometry the user is actually pointing at,
  // instead of the far-away model center (which makes the model "fly away").
  //
  // Pivot is taken from a ray cast through the CURSOR (ndcX/ndcY), not the
  // viewport center — so it tracks where the user pressed, even when the detail
  // sits at the screen edge.
  //
  // IMPORTANT: we raycast against ALL raycast meshes and do NOT filter out the
  // highlighted/selected element. Otherwise the element the user just selected
  // would be skipped and the pivot would land behind it (or miss entirely).
  //
  // JUMP-FREE UPDATE: the pivot usually lies OFF the current view axis, and
  // OrbitControls' internal `camera.lookAt(target)` would otherwise snap the
  // view toward it. To keep the exact same orientation we translate the camera
  // by the same delta as the target (delta = newPivot - oldTarget). Because
  // OrbitControls recomputes the camera-offset as `position - target` on every
  // update, moving both by the same delta leaves the offset (and therefore the
  // view direction & zoom) untouched — only the center of rotation moves.
  //
  // If nothing is under the cursor at rotate-start we keep the CURRENT orbit
  // center (usually the last selected element) instead of snapping to a far
  // fallback — that fallback was the original cause of the "fly away" bug.
  updateRotatePivot(ndcX: number, ndcY: number) {
    const controls = this.sceneService.controls;
    const camera = this.sceneService.camera;
    const oldTarget = controls.target.clone();

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    this.raycaster.firstHitOnly = true;
    const hits = this.raycaster.intersectObjects(this.modelService.getRaycastMeshes(), false);

    if (hits.length === 0) {
      // No geometry under the cursor: keep the current orbit center.
      return;
    }

    const pivot = hits[0].point.clone();
    const delta = pivot.clone().sub(oldTarget);
    controls.target.copy(pivot);
    camera.position.add(delta);
    controls.update();

    // Marker size: use camera→pivot distance for perspective, visible world height
    // for orthographic, so the pivot dot stays a consistent on-screen size.
    let depthDistance: number;
    if (camera instanceof THREE.OrthographicCamera) {
      depthDistance = (camera.top - camera.bottom) / camera.zoom;
    } else {
      depthDistance = camera.position.distanceTo(pivot);
    }
    this.sceneService.showPivot(pivot, depthDistance);
    this.sceneService.isDirty = true;
  }

  // ── Mouse events ──
  handleMouseMove = (event: MouseEvent) => {
    if (this.activeTool === ViewerTool.MEASURE) {
      this.measurementManager?.onMouseMove(event, this.modelService.getRaycastMeshes());
      this.sceneService.isDirty = true;
      return;
    }

    if (this.sceneService.wasDraggingControls) return;

    const hit = this.castRay(event);
    const c = this.sceneService.getContainer();
    if (hit && hit.expressID !== -1 && hit.modelID !== undefined) {
      if (c) c.style.cursor = 'pointer';

      if (this.enableHoverHighlight) {
        const sameElement =
          this.hoveredElement?.modelID === hit.modelID &&
          this.hoveredElement?.expressID === hit.expressID;
        if (!sameElement) {
          this.clearHoverHighlight();
          this.createHoverHighlight(hit.modelID, hit.expressID, hit.mesh);
        }
      }
    } else {
      if (c) c.style.cursor = 'default';
      this.clearHoverHighlight();
    }
  };

  handleClick = async (event: MouseEvent) => {
    const container = this.sceneService.getContainer();
    if (!container) return;

    if (this.activeTool === ViewerTool.MEASURE) {
      this.measurementManager?.onClick(event, this.modelService.getRaycastMeshes());
      this.sceneService.isDirty = true;
      return;
    }

    if (this.sceneService.wasDraggingControls) return;
    event.preventDefault();
    event.stopPropagation();

    if (this.measurementManager) {
      const measurementId = this.measurementManager.raycast(event);
      if (measurementId) {
        const box = this.measurementManager.getMeasurementBox(measurementId);
        if (box && !box.isEmpty()) {
          this.sceneService.zoomToBox(box);
        }
        return;
      }
    }

    await this.selectFromPointer(event, event.ctrlKey);
  };

  handleDoubleClick = async (event: MouseEvent) => {
    const container = this.sceneService.getContainer();
    if (!container) return;

    event.preventDefault();
    event.stopPropagation();

    const hit = this.castRay(event);
    if (hit && hit.expressID !== -1) {
      await this.highlightElement(hit.modelID, hit.expressID, hit.mesh);
      await this.selectElement(hit.modelID, hit.expressID);
      this.zoomToSelection();
    }
  };

  handleContextMenu = (event: MouseEvent) => {
    const container = this.sceneService.getContainer();
    if (!container) return;
    event.preventDefault();
    event.stopPropagation();

    const hit = this.castRay(event);
    eventBus.emit('viewer-contextmenu', {
      x: event.clientX,
      y: event.clientY,
      hit: hit ? { modelID: hit.modelID, expressID: hit.expressID } : null,
    });
  };

  handleKeyDown = (e: KeyboardEvent) => {
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.getAttribute('contenteditable') === 'true')
    ) {
      return;
    }

    const key = e.key.toLowerCase();

    if (e.key === 'Escape') {
      if (this.activeTool === ViewerTool.MEASURE) {
        this.setTool(ViewerTool.NONE);
        eventBus.emit('tool-changed', { tool: ViewerTool.NONE });
        return;
      }
      if (this.activeTool === ViewerTool.SECTION) {
        this.setTool(ViewerTool.NONE);
        eventBus.emit('tool-changed', { tool: ViewerTool.NONE });
        return;
      }
      this.clearSelection();
      this.onSelect(null);
      this.onMultiSelect?.([]);
    } else if (key === 'f') {
      this.zoomToSelection();
    } else if (key === 'h') {
      if (this.selectedElements.length > 0) {
        const toHide = [...this.selectedElements];
        toHide.forEach((el) => this.modelService.hideElement(el.modelID, el.expressID));
        this.onSelect(null);
        this.onMultiSelect?.([]);
        eventBus.emit('viewer-elements-changed', undefined);
      }
    } else if (key === 'i') {
      if (this.selectedElements.length > 0) {
        const first = this.selectedElements[0];
        this.modelService.isolateElement(first.modelID, first.expressID);
        eventBus.emit('viewer-isolation-changed', { isIsolated: true });
      }
    } else if (key === 'u') {
      this.modelService.unisolateAll();
      this.modelService.showAllElements();
      eventBus.emit('viewer-isolation-changed', { isIsolated: false });
      eventBus.emit('viewer-elements-changed', undefined);
    }
  };

  // ── Selection ──
  private async selectFromPointer(event: MouseEvent, shiftKey = false) {
    this.clearHoverHighlight();
    const hit = this.castRay(event);
    if (!hit) {
      this.clearSelection();
      this.onSelect(null);
      return;
    }

    const { modelID, expressID, mesh } = hit;
    if (expressID !== -1 && modelID !== undefined) {
      await this.highlightElement(modelID, expressID, mesh, shiftKey);
      await this.selectElement(modelID, expressID, shiftKey);
      // NOTE: intentionally NOT re-centering the orbit pivot here (no focusOn /
      // fit). Point-selecting should only highlight + show properties; moving
      // the camera on every click feels like an unwanted auto-fit. The close-up
      // rotation fix (updateRotatePivot at middle+Ctrl start) re-derives the
      // pivot from the cursor on demand, so this removal is safe.
    } else if (mesh.userData.isGLB) {
      this.highlightElement(modelID, -1, mesh);
      this.onSelect({
        expressID: -1,
        modelID,
        type: 'GLB',
        name: mesh.name,
        properties: mesh.userData.properties || [],
      });
    }
  }

  async selectElement(modelID: number, expressID: number, addToSelection = false) {
    const isStillSelected = this.selectedElements.some(
      (e) => e.modelID === modelID && e.expressID === expressID
    );
    if (addToSelection && !isStillSelected) {
      if (this.selectedElements.length > 0) {
        const last = this.selectedElements[this.selectedElements.length - 1];
        return this.selectElement(last.modelID, last.expressID, false);
      } else {
        this.onSelect(null);
        this.onMultiSelect?.([]);
        return;
      }
    }

    const propertiesData = await this.loadingService.queryProperties(modelID, expressID);
    const elementData = propertiesData;
    this.onMultiSelect?.(this.selectedElements);
    this.onSelect(elementData);
  }

  async selectByID(modelID: number, expressID: number, zoomTo = false) {
    const modelObj = this.modelService.models.get(modelID);
    if (modelObj && modelObj.group.visible === false) {
      console.log('Skipping selection/highlighting for hidden model:', modelID);
      return;
    }

    if (modelID >= 0) {
      await this.highlightElement(modelID, expressID);
      await this.selectElement(modelID, expressID);
      if (zoomTo) this.zoomToSelection();
    } else {
      const model = this.modelService.models.get(modelID);
      if (model) {
        let targetMesh: THREE.Mesh | null = null;
        model.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.userData.modelID === modelID) {
            targetMesh = obj;
          }
        });
        if (targetMesh) {
          this.highlightElement(modelID, -1, targetMesh);
          this.onSelect({
            expressID: -1,
            modelID,
            type: 'GLB',
            name: targetMesh.name,
            properties: targetMesh.userData.properties || [],
          });
          if (zoomTo) this.zoomToSelection();
        }
      }
    }
  }

  clearSelection() {
    this.clearHoverHighlight();
    this.multiHighlightMeshes.forEach((mesh) => {
      this.sceneService.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.multiHighlightMeshes = [];
    this.selectedElements = [];
    this.highlightModel = null;
    this.updatePostProcessingSelection();
    this.sceneService.isDirty = true;
  }

  /**
   * Sync the post-processing selection + active state in one place.
   * The OutlinePass composer is only enabled when at least one element
   * is highlighted — otherwise we render directly (no per-frame cost).
   */
  private updatePostProcessingSelection() {
    if (!this.postProcessing) return;
    this.postProcessing.setSelection(this.multiHighlightMeshes);
    this.postProcessing.setActive(this.multiHighlightMeshes.length > 0);
  }

  // ── Highlight ──
  async highlightElement(
    modelID: number,
    expressID: number,
    targetMesh?: THREE.Mesh | THREE.InstancedMesh,
    addToSelection = false
  ) {
    if (!addToSelection) {
      this.clearSelection();
    } else {
      const index = this.selectedElements.findIndex(
        (e) => e.modelID === modelID && e.expressID === expressID
      );
      if (index !== -1) {
        // Deselect
        this.selectedElements.splice(index, 1);
        const meshIndex = this.multiHighlightMeshes.findIndex(
          (m) => m.userData.modelID === modelID && m.userData.expressID === expressID
        );
        if (meshIndex !== -1) {
          const m = this.multiHighlightMeshes[meshIndex];
          this.sceneService.scene.remove(m);
          if (m.geometry) m.geometry.dispose();
          this.multiHighlightMeshes.splice(meshIndex, 1);
        }
        this.highlightModel =
          this.multiHighlightMeshes.length > 0
            ? this.multiHighlightMeshes[this.multiHighlightMeshes.length - 1]
            : null;
        this.updatePostProcessingSelection();
        this.sceneService.isDirty = true;
        return;
      }
    }

    // Resolve mesh locally first
    let localMeshInfo: { mesh: THREE.Mesh | THREE.InstancedMesh; instanceId?: number } | null =
      targetMesh ? { mesh: targetMesh } : null;

    if (targetMesh instanceof THREE.InstancedMesh) {
      const instanceExpressIDs = targetMesh.userData.instanceExpressIDs as number[];
      const instanceId = instanceExpressIDs.indexOf(expressID);
      if (instanceId !== -1) localMeshInfo = { mesh: targetMesh, instanceId };
    }

    if (!localMeshInfo) {
      localMeshInfo = this.modelService.findMeshByExpressID(modelID, expressID) as any;
    }

    if (localMeshInfo) {
      const { mesh: tMesh, instanceId } = localMeshInfo;
      let geom: THREE.BufferGeometry | null = null;

      if (tMesh instanceof THREE.InstancedMesh && instanceId !== undefined) {
        geom = tMesh.geometry.clone();
        const instMatrix = new THREE.Matrix4();
        tMesh.getMatrixAt(instanceId, instMatrix);
        tMesh.updateMatrixWorld(true);
        const combinedMatrix = tMesh.matrixWorld.clone().multiply(instMatrix);
        geom.applyMatrix4(combinedMatrix);
      } else if (tMesh instanceof THREE.Mesh && tMesh.userData.isBatch) {
        geom = this.modelService.extractGeometryByExpressID(tMesh.geometry, expressID);
        if (geom) {
          tMesh.updateMatrixWorld(true);
          geom.applyMatrix4(tMesh.matrixWorld);
        }
      } else if (tMesh instanceof THREE.Mesh) {
        geom = tMesh.geometry.clone();
        tMesh.updateMatrixWorld(true);
        geom.applyMatrix4(tMesh.matrixWorld);
      }

      if (geom) {
        const mesh = new THREE.Mesh(geom, this.highlightMaterial);
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        mesh.updateMatrixWorld(true);
        mesh.renderOrder = 999;
        mesh.userData = { modelID, expressID };

        this.sceneService.scene.add(mesh);
        this.highlightModel = mesh;
        this.multiHighlightMeshes.push(mesh);
        if (!addToSelection) {
          this.selectedElements = [{ modelID, expressID }];
        } else {
          this.selectedElements.push({ modelID, expressID });
        }
        this.updatePostProcessingSelection();
        this.sceneService.isDirty = true;
        return;
      }
    }

    // Fallback to worker
    if (modelID >= 0 && expressID >= 0) {
      const geometries = await this.loadingService.queryHighlightGeometry(modelID, expressID);
      this.handleWorkerHighlightGeometries(geometries, modelID, expressID, addToSelection);
    }
  }

  private handleWorkerHighlightGeometries(
    geometries: any[],
    modelID: number,
    expressID: number,
    addToSelection: boolean
  ) {
    const threeGeometries: THREE.BufferGeometry[] = [];
    geometries.forEach((g: any) => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.pos), 3));
      geom.setIndex(new THREE.BufferAttribute(new Uint32Array(g.indices), 1));
      geom.computeVertexNormals();
      const matrix = new THREE.Matrix4().fromArray(g.flatTransformation);
      geom.applyMatrix4(matrix);
      threeGeometries.push(geom);
    });

    if (threeGeometries.length === 0) return;

    const mergedGeometry = BufferGeometryUtils.mergeGeometries(threeGeometries);
    threeGeometries.forEach((g) => g.dispose());

    if (mergedGeometry) {
      const mesh = new THREE.Mesh(mergedGeometry, this.highlightMaterial);
      const rootGroup = this.modelService.models.get(modelID)?.group;
      if (rootGroup) {
        mesh.rotation.copy(rootGroup.rotation);
        mesh.position.copy(rootGroup.position);
        mesh.scale.copy(rootGroup.scale);
        mesh.updateMatrixWorld(true);
      }
      mesh.renderOrder = 999;
      mesh.userData = { modelID, expressID };
      this.sceneService.scene.add(mesh);

      this.highlightModel = mesh;
      this.multiHighlightMeshes.push(mesh);
      if (!addToSelection) {
        this.selectedElements = [{ modelID, expressID }];
      } else {
        this.selectedElements.push({ modelID, expressID });
      }
      this.updatePostProcessingSelection();
      this.sceneService.isDirty = true;
    }
  }

  // ── Hover ──
  clearHoverHighlight() {
    if (this.hoverModel) {
      this.sceneService.scene.remove(this.hoverModel);
      if (this.hoverModel.geometry) this.hoverModel.geometry.dispose();
      this.hoverModel = null;
      this.sceneService.isDirty = true;
    }
    this.hoveredElement = null;
  }

  private createHoverHighlight(
    modelID: number,
    expressID: number,
    targetMesh?: THREE.Mesh | THREE.InstancedMesh
  ) {
    if (expressID < 0 || !this.enableHoverHighlight) return;

    const alreadySelected = this.selectedElements.some(
      (e) => e.modelID === modelID && e.expressID === expressID
    );
    if (alreadySelected) return;

    let localMeshInfo: { mesh: THREE.Mesh | THREE.InstancedMesh; instanceId?: number } | null =
      targetMesh ? { mesh: targetMesh } : null;

    if (targetMesh instanceof THREE.InstancedMesh) {
      const ids = targetMesh.userData.instanceExpressIDs as number[];
      const iid = ids.indexOf(expressID);
      if (iid !== -1) localMeshInfo = { mesh: targetMesh, instanceId: iid };
    }

    if (!localMeshInfo) {
      localMeshInfo = this.modelService.findMeshByExpressID(modelID, expressID) as any;
    }

    if (!localMeshInfo) return;

    const { mesh: tMesh, instanceId } = localMeshInfo;
    let geom: THREE.BufferGeometry | null = null;

    if (tMesh instanceof THREE.InstancedMesh && instanceId !== undefined) {
      geom = tMesh.geometry.clone();
      const instMatrix = new THREE.Matrix4();
      tMesh.getMatrixAt(instanceId, instMatrix);
      tMesh.updateMatrixWorld(true);
      const combinedMatrix = tMesh.matrixWorld.clone().multiply(instMatrix);
      geom.applyMatrix4(combinedMatrix);
    } else if (tMesh instanceof THREE.Mesh && tMesh.userData.isBatch) {
      geom = this.modelService.extractGeometryByExpressID(tMesh.geometry, expressID);
      if (geom) {
        tMesh.updateMatrixWorld(true);
        geom.applyMatrix4(tMesh.matrixWorld);
      }
    } else if (tMesh instanceof THREE.Mesh) {
      geom = tMesh.geometry.clone();
      tMesh.updateMatrixWorld(true);
      geom.applyMatrix4(tMesh.matrixWorld);
    }

    if (geom) {
      const mesh = new THREE.Mesh(geom, this.hoverMaterial);
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      mesh.updateMatrixWorld(true);
      mesh.renderOrder = 900;
      mesh.userData = { modelID, expressID, isHover: true };

      this.sceneService.scene.add(mesh);
      this.hoverModel = mesh;
      this.hoveredElement = { modelID, expressID };
      this.sceneService.isDirty = true;
    }
  }

  // ── Zoom to selection ──
  zoomToSelection() {
    if (this.multiHighlightMeshes.length === 0) {
      if (!this.highlightModel) return;
      const box = new THREE.Box3().setFromObject(this.highlightModel);
      this.sceneService.zoomToBox(box);
      return;
    }

    const box = new THREE.Box3();
    this.multiHighlightMeshes.forEach((mesh) => box.expandByObject(mesh));
    this.sceneService.zoomToBox(box);
  }

  // Getters for facade
  get highlightModelMesh(): THREE.Mesh | null {
    return this.highlightModel;
  }

  get hoverModelMesh(): THREE.Mesh | null {
    return this.hoverModel;
  }

  get hoveredElementRef(): { modelID: number; expressID: number } | null {
    return this.hoveredElement;
  }

  // ── Dispose (safe for remount — only clear temp state) ──
  dispose() {
    this.clearSelection();
    // NOTE: highlightMaterial and hoverMaterial survive remount,
    // so don't dispose them here.
  }
}
