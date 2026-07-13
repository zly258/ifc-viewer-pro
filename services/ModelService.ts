import * as THREE from 'three';
import { IFCSpatialStructure } from '../types';

export interface ModelRecord {
  group: THREE.Group;
  modelID: number;
  name: string;
}

export class ModelService {
  // ── Public state ──
  public models: Map<number, ModelRecord> = new Map();
  public propertyMaps: Map<number, Map<number, number[]>> = new Map();
  public modelMeshExpressIDs: Map<number, Set<number>> = new Map();
  public parentMap: Map<string, string> = new Map();
  public savedStructures: Map<number, IFCSpatialStructure> = new Map();
  public partialGroups: Map<number, THREE.Group> = new Map();

  public ifcUpAxis: 'Y' | 'Z' = 'Z';
  public glbUpAxis: 'Y' | 'Z' = 'Y';

  public modelIdCounter: number = 1;

  // ── Hidden elements ──
  private hiddenElementPositions: Map<
    string,
    { mesh: THREE.Mesh; indices: number[]; originalPositions: Float32Array }
  > = new Map();

  // ── Raycast cache ──
  private cachedRaycastMeshes: THREE.Mesh[] = [];

  // ── Isolation ──
  private isolatedIDs: Set<number> | null = null;
  private isolationDimMaterial: THREE.MeshStandardMaterial;
  private originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();

  // Shared scene reference
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.isolationDimMaterial = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      transparent: true,
      opacity: 0.08,
      depthTest: true,
      side: THREE.DoubleSide,
    });
  }

  // ── Model registration ──
  registerModel(modelID: number, group: THREE.Group, name: string) {
    this.models.set(modelID, { group, modelID, name });
    this.updateRaycastMeshes();
  }

  unregisterModel(modelID: number) {
    const model = this.models.get(modelID);
    if (!model) return;

    this.scene.remove(model.group);
    model.group.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        if ((c.geometry as any).disposeBoundsTree) {
          (c.geometry as any).disposeBoundsTree();
        }
        c.geometry.dispose();

        if (c.material instanceof THREE.Material) {
          c.material.dispose();
        } else if (Array.isArray(c.material)) {
          c.material.forEach((m) => m.dispose());
        }
      }
    });

    this.hiddenElementPositions.forEach((_val, key) => {
      if (key.startsWith(`${modelID}_`)) {
        this.hiddenElementPositions.delete(key);
      }
    });

    this.models.delete(modelID);
    this.updateRaycastMeshes();
  }

  clearAll() {
    const ids = Array.from(this.models.keys());
    ids.forEach((id) => this.unregisterModel(id));

    this.models.clear();
    this.propertyMaps.clear();
    this.modelMeshExpressIDs.clear();
    this.parentMap.clear();
    this.hiddenElementPositions.clear();
    this.savedStructures.clear();
    this.partialGroups.clear();
    this.clearIsolation();
    this.updateRaycastMeshes();
  }

  // ── Visibility ──
  toggleModelVisibility(modelID: number): boolean {
    const model = this.models.get(modelID);
    if (!model) return false;
    model.group.visible = !model.group.visible;
    this.updateRaycastMeshes();
    return model.group.visible;
  }

  isModelVisible(modelID: number): boolean {
    const model = this.models.get(modelID);
    return model ? model.group.visible !== false : false;
  }

  // ── Raycast cache ──
  updateRaycastMeshes() {
    const meshes: THREE.Mesh[] = [];
    this.models.forEach((m) => {
      if (m.group.visible !== false) {
        m.group.traverse((c) => {
          if (c instanceof THREE.Mesh && c.visible) {
            meshes.push(c);
          }
        });
      }
    });
    this.cachedRaycastMeshes = meshes;
  }

  getRaycastMeshes(): THREE.Mesh[] {
    return this.cachedRaycastMeshes;
  }

  // ── Bounding Box ──
  getMergedBoundingBox(): { box: THREE.Box3; center: THREE.Vector3; size: number } {
    const empty = { box: new THREE.Box3(), center: new THREE.Vector3(), size: 0 };

    // Ensure all world matrices are fresh
    this.models.forEach((m) => m.group.updateMatrixWorld(true));

    const box = new THREE.Box3();
    const meshBoxes: { box: THREE.Box3; center: THREE.Vector3 }[] = [];

    const isVisible = (obj: THREE.Object3D): boolean => {
      let current: THREE.Object3D | null = obj;
      while (current) {
        if (!current.visible) return false;
        current = current.parent;
      }
      return true;
    };

    this.models.forEach((m) =>
      m.group.traverse((c) => {
        if (!(c instanceof THREE.Mesh) || !isVisible(c)) return;
        const cBox = new THREE.Box3();

        if (c instanceof THREE.InstancedMesh) {
          if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
          if (c.geometry.boundingBox) {
            const count = c.count;
            const instMatrix = new THREE.Matrix4();
            for (let i = 0; i < count; i++) {
              c.getMatrixAt(i, instMatrix);
              const b = c.geometry.boundingBox.clone();
              b.applyMatrix4(c.matrixWorld.clone().multiply(instMatrix));
              cBox.union(b);
            }
          }
        } else {
          if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
          if (c.geometry.boundingBox) {
            cBox.copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld);
          }
        }

        if (!cBox.isEmpty()) {
          meshBoxes.push({ box: cBox, center: cBox.getCenter(new THREE.Vector3()) });
        }
      })
    );

    if (meshBoxes.length === 0) return empty;

    // Outlier filtering
    const avgCenter = new THREE.Vector3();
    meshBoxes.forEach((mb) => avgCenter.add(mb.center));
    avgCenter.divideScalar(meshBoxes.length);

    let totalDist = 0;
    meshBoxes.forEach((mb) => (totalDist += mb.center.distanceTo(avgCenter)));
    const avgDist = totalDist / meshBoxes.length;

    const enableFiltering = meshBoxes.length > 5;
    const outlierThreshold = enableFiltering ? Math.max(1200, avgDist * 8) : Infinity;

    meshBoxes.forEach((mb) => {
      const dist = mb.center.distanceTo(avgCenter);
      if (dist <= outlierThreshold) {
        box.union(mb.box);
      }
    });

    if (box.isEmpty()) return empty;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    return { box, center, size: Math.max(size.x, size.y, size.z) };
  }

  // ── Spatial Structure ──
  getFullSpatialStructure(): {
    fileName: string;
    modelID: number;
    structure: IFCSpatialStructure;
  }[] {
    const structures: {
      fileName: string;
      modelID: number;
      structure: IFCSpatialStructure;
    }[] = [];

    for (const [modelID, model] of this.models) {
      if (modelID >= 0) {
        const structure = this.savedStructures.get(modelID);
        if (structure) {
          structures.push({ fileName: model.name, modelID, structure });
        }
      } else {
        const structure = this.buildGLBSpatialTree(model.group, modelID);
        structures.push({ fileName: model.name, modelID, structure });
      }
    }
    return structures;
  }

  private buildGLBSpatialTree(root: THREE.Group, _modelID: number): IFCSpatialStructure {
    let idCounter = 1;
    const parseNode = (obj: THREE.Object3D): IFCSpatialStructure => {
      const children: IFCSpatialStructure[] = [];
      if (obj.children && obj.children.length > 0) {
        obj.children.forEach((child) => {
          if (child.type !== 'LineSegments') {
            children.push(parseNode(child));
          }
        });
      }
      return {
        expressID: idCounter++,
        type: obj.type,
        name: obj.name || obj.type,
        children,
      };
    };
    return {
      expressID: 0,
      type: 'GLB_Model',
      name: root.name || 'Model Root',
      children: root.children.map((c) => parseNode(c)),
    };
  }

  // ── Mesh lookup ──
  findMeshByExpressID(
    modelID: number,
    expressID: number
  ): { mesh: THREE.Mesh | THREE.InstancedMesh; instanceId?: number } | null {
    const model = this.models.get(modelID);
    if (!model) return null;

    let found: { mesh: THREE.Mesh | THREE.InstancedMesh; instanceId?: number } | null = null;
    model.group.traverse((c) => {
      if (found) return;
      if (c instanceof THREE.InstancedMesh) {
        const ids = c.userData.instanceExpressIDs as number[];
        if (ids) {
          const idx = ids.indexOf(expressID);
          if (idx !== -1) found = { mesh: c, instanceId: idx };
        }
      } else if (c instanceof THREE.Mesh && c.userData.isBatch) {
        const attr = c.geometry.getAttribute('expressID');
        if (attr) {
          const arr = attr.array;
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] === expressID) {
              found = { mesh: c };
              break;
            }
          }
        }
      }
    });
    return found;
  }

  extractGeometryByExpressID(
    mergedGeometry: THREE.BufferGeometry,
    targetExpressID: number
  ): THREE.BufferGeometry | null {
    const expressIDAttr = mergedGeometry.getAttribute('expressID');
    const positionAttr = mergedGeometry.getAttribute('position');
    const normalAttr = mergedGeometry.getAttribute('normal');
    const indexAttr = mergedGeometry.index;

    if (!expressIDAttr || !positionAttr || !indexAttr) return null;

    const indexArray = indexAttr.array;
    const expressIDArray = expressIDAttr.array;
    const positionArray = positionAttr.array;
    const normalArray = normalAttr ? normalAttr.array : null;

    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newIndices: number[] = [];
    const vertexMap = new Map<number, number>();

    const faceCount = indexArray.length / 3;
    for (let i = 0; i < faceCount; i++) {
      const a = indexArray[i * 3];
      const b = indexArray[i * 3 + 1];
      const c = indexArray[i * 3 + 2];
      const idA = expressIDArray[a];

      if (idA === targetExpressID) {
        [a, b, c].forEach((oldIdx) => {
          let newIdx = vertexMap.get(oldIdx);
          if (newIdx === undefined) {
            newIdx = newPositions.length / 3;
            vertexMap.set(oldIdx, newIdx);
            newPositions.push(
              positionArray[oldIdx * 3],
              positionArray[oldIdx * 3 + 1],
              positionArray[oldIdx * 3 + 2]
            );
            if (normalArray) {
              newNormals.push(
                normalArray[oldIdx * 3],
                normalArray[oldIdx * 3 + 1],
                normalArray[oldIdx * 3 + 2]
              );
            }
          }
          newIndices.push(newIdx);
        });
      }
    }

    if (newIndices.length === 0) return null;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length > 0) {
      geom.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }
    geom.setIndex(newIndices);
    return geom;
  }

  // ── Orientation ──
  setOrientations(ifcUpAxis: 'Y' | 'Z', glbUpAxis: 'Y' | 'Z') {
    this.ifcUpAxis = ifcUpAxis;
    this.glbUpAxis = glbUpAxis;
    this.models.forEach((model) => model.group.rotation.set(0, 0, 0));
    this.models.forEach((model) => model.group.updateMatrixWorld(true));
  }

  setUpAxis(axis: 'Y' | 'Z') {
    if (axis === 'Z') this.setOrientations('Z', 'Z');
    else this.setOrientations('Y', 'Y');
  }

  // ── Rotate ──
  rotateModel(id: number, axis: string, angle: number) {
    const m = this.models.get(id);
    if (m) {
      if (axis === 'x') m.group.rotateX(angle);
      m.group.updateMatrixWorld(true);
    }
  }

  // ── Hide / Show ──
  hideElement(modelID: number, expressID: number): boolean {
    const key = `${modelID}_${expressID}`;
    if (this.hiddenElementPositions.has(key)) return false;

    let modelGroup = this.models.get(modelID)?.group;
    if (!modelGroup) modelGroup = this.partialGroups.get(modelID);
    if (!modelGroup) return false;

    let didHide = false;
    modelGroup.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const geom = obj.geometry;
      if (!geom.attributes.expressID || !geom.attributes.position) return;

      const expressIDAttr = geom.attributes.expressID;
      const positionAttr = geom.attributes.position;
      const vertexCount = positionAttr.count;

      const indices: number[] = [];
      for (let i = 0; i < vertexCount; i++) {
        if (expressIDAttr.getX(i) === expressID) indices.push(i);
      }

      if (indices.length === 0) return;
      didHide = true;

      const originalPositions = new Float32Array(indices.length * 3);
      indices.forEach((vIdx, i) => {
        originalPositions[i * 3] = positionAttr.getX(vIdx);
        originalPositions[i * 3 + 1] = positionAttr.getY(vIdx);
        originalPositions[i * 3 + 2] = positionAttr.getZ(vIdx);
        positionAttr.setXYZ(vIdx, 0, 0, 0);
      });
      positionAttr.needsUpdate = true;

      this.hiddenElementPositions.set(key, { mesh: obj, indices, originalPositions });
      geom.computeBoundingBox();
      geom.computeBoundingSphere();
      if ((geom as any).computeBoundsTree) (geom as any).computeBoundsTree();
    });

    if (didHide) this.updateRaycastMeshes();
    return didHide;
  }

  showElement(modelID: number, expressID: number) {
    const key = `${modelID}_${expressID}`;
    const cache = this.hiddenElementPositions.get(key);
    if (!cache) return;

    const { mesh, indices, originalPositions } = cache;
    const geom = mesh.geometry;
    const positionAttr = geom.attributes.position;
    indices.forEach((vIdx, i) => {
      positionAttr.setXYZ(vIdx, originalPositions[i * 3], originalPositions[i * 3 + 1], originalPositions[i * 3 + 2]);
    });
    positionAttr.needsUpdate = true;
    this.hiddenElementPositions.delete(key);

    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    if ((geom as any).computeBoundsTree) (geom as any).computeBoundsTree();
    this.updateRaycastMeshes();
  }

  showAllElements() {
    this.hiddenElementPositions.forEach((cache) => {
      const { mesh, indices, originalPositions } = cache;
      const geom = mesh.geometry;
      const positionAttr = geom.attributes.position;
      indices.forEach((vIdx, i) => {
        positionAttr.setXYZ(vIdx, originalPositions[i * 3], originalPositions[i * 3 + 1], originalPositions[i * 3 + 2]);
      });
      positionAttr.needsUpdate = true;
      geom.computeBoundingBox();
      geom.computeBoundingSphere();
      if ((geom as any).computeBoundsTree) (geom as any).computeBoundsTree();
    });
    this.hiddenElementPositions.clear();
    this.updateRaycastMeshes();
  }

  get hasHiddenElements(): boolean {
    return this.hiddenElementPositions.size > 0;
  }

  // ── Isolation ──
  isolateElement(modelID: number, expressID: number) {
    this.clearIsolation();
    if (modelID < 0) return;

    this.isolatedIDs = new Set([expressID]);

    this.models.forEach((m, mID) => {
      if (mID < 0) return;
      m.group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if ((obj.userData?.isHover) === true) return;
        if (obj.userData?.isBatch) {
          if (!this.originalMaterials.has(obj)) {
            this.originalMaterials.set(obj, obj.material);
          }
          obj.material = this.isolationDimMaterial;
        }
      });
    });
    this.updateRaycastMeshes();
  }

  clearIsolation() {
    this.isolatedIDs = null;
    this.originalMaterials.forEach((mat, mesh) => {
      if (mesh.parent) mesh.material = mat;
    });
    this.originalMaterials.clear();
    this.updateRaycastMeshes();
  }

  unisolateAll() {
    this.clearIsolation();
  }

  get isIsolated(): boolean {
    return this.isolatedIDs !== null;
  }

  get isolatedIDSet(): Set<number> | null {
    return this.isolatedIDs;
  }

  // ── Statistics ──
  getStatistics(rendererInfo?: { geometries: number; triangles: number }): {
    triangles: number;
    geometries: number;
    memory: number;
  } {
    let gpuMemoryBytes = 0;
    this.models.forEach((model) => {
      if (model.group) {
        model.group.traverse((obj: any) => {
          if (obj.isMesh && obj.geometry) {
            const geom = obj.geometry;
            if (geom.index?.array) gpuMemoryBytes += geom.index.array.byteLength;
            for (const key in geom.attributes) {
              const attr = geom.attributes[key];
              if (attr?.array) gpuMemoryBytes += attr.array.byteLength;
            }
          }
        });
      }
    });

    const gpuMemoryMB = gpuMemoryBytes / (1024 * 1024);

    let jsHeapMemory = 0;
    if (typeof window !== 'undefined' && (window.performance as any)?.memory) {
      jsHeapMemory = (window.performance as any).memory.usedJSHeapSize / (1024 * 1024);
    } else {
      const baseMemory = 68.2;
      const geometriesCount = rendererInfo?.geometries || 0;
      const triangleCount = rendererInfo?.triangles || 0;
      jsHeapMemory = baseMemory + geometriesCount * 0.12 + triangleCount * 0.000032;
    }

    return {
      triangles: rendererInfo?.triangles || 0,
      geometries: rendererInfo?.geometries || 0,
      memory: Math.round((jsHeapMemory + gpuMemoryMB) * 10) / 10,
    };
  }

  // ── Dispose ──
  dispose() {
    this.clearAll();
    this.isolationDimMaterial.dispose();
  }
}
