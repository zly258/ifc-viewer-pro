import * as THREE from 'three';
import { IFCSpatialStructure } from '../types';

// A merged-mesh record keeps the original vertex positions and a per-vertex
// direction (element centroid − model center). setExplosion moves each vertex
// by dir * factor * SPREAD; reset copies the original array back.
// An instanced-mesh record keeps each instance's base matrix and radial
// direction; setExplosion adds dir * factor * SPREAD to the translation.
export type ExplosionRecord =
  | {
      kind: 'vertex';
      mesh: THREE.Mesh;
      original: Float32Array;
      dir: Float32Array;
      hadBoundsTree: boolean;
    }
  | {
      kind: 'instance';
      mesh: THREE.InstancedMesh;
      indices: number[];
      base: THREE.Matrix4[];
      dir: THREE.Vector3[];
      hadBoundsTree: boolean;
    };

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

  public modelIdCounter: number = 1;
  public glbUpAxis: 'Y' | 'Z' = 'Y'; // GLB orientation default

  // Render hook injected by the facade: when visibility/isolation changes we must
  // flag the dirty-render loop so the screen actually refreshes (otherwise under
  // dirty rendering the scene graph mutates but no frame is drawn).
  public requestRender: (() => void) | null = null;

  // ── Hidden elements ──
  private hiddenElementPositions: Map<
    string,
    { mesh: THREE.Mesh; indices: number[]; originalPositions: Float32Array }
  > = new Map();

  // ── Raycast cache ──
  private cachedRaycastMeshes: THREE.Mesh[] = [];
  // O(1) expressID -> mesh lookup (rebuilt alongside the raycast cache, see updateRaycastMeshes)
  private meshIndex: Map<string, { mesh: THREE.Mesh | THREE.InstancedMesh; instanceId?: number }> = new Map();

  // ── Explosion view ──
  // IFC geometry is batched by material: unique elements are merged into one
  // BufferGeometry (vertices already in world space) and repeated elements
  // become an InstancedMesh. In BOTH cases the mesh OBJECT sits at the origin,
  // so moving mesh.position just slides the whole model as one rigid block.
  // A real explosion must therefore operate at the ELEMENT level:
  //   • merged meshes   → shift each vertex by its element's radial direction,
  //     derived from the per-vertex `expressID` attribute in a single O(verts)
  //     pass (no per-element geometry extraction needed).
  //   • instanced meshes → shift each instance matrix's translation radially.
  // Directions are the element centroid relative to the model's bounding-box
  // center, so elements spread APART instead of the model drifting as a whole.
  private explosionRecords: ExplosionRecord[] = [];
  private explosionCenter = new THREE.Vector3();
  private explosionInitialized = false;
  private explosionFactor = 0;
  private static readonly EXPLODE_SPREAD = 1.2;

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
    // A removed model invalidates the explosion baseline — reset it so the
    // next explosion rebuilds from the remaining models.
    this.explosionRecords = [];
    this.explosionInitialized = false;
    this.explosionFactor = 0;
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
    this.explosionRecords = [];
    this.explosionInitialized = false;
    this.explosionFactor = 0;
    this.clearIsolation();
    this.updateRaycastMeshes();
  }

  // ── Visibility ──
  toggleModelVisibility(modelID: number): boolean {
    const model = this.models.get(modelID);
    if (!model) return false;
    model.group.visible = !model.group.visible;
    this.updateRaycastMeshes();
    this.requestRender?.();
    return model.group.visible;
  }

  isModelVisible(modelID: number): boolean {
    const model = this.models.get(modelID);
    return model ? model.group.visible !== false : false;
  }

  // ── Raycast cache ──
  updateRaycastMeshes() {
    const meshes: THREE.Mesh[] = [];
    this.meshIndex.clear();
    this.models.forEach((m) => {
      if (m.group.visible !== false) {
        m.group.traverse((c) => {
          if (c instanceof THREE.Mesh && c.visible) {
            meshes.push(c);

            // Build expressID -> mesh index for O(1) hover/selection lookup.
            // (Replaces the previous O(n) scene traversal on every hover.)
            if (c instanceof THREE.InstancedMesh && c.userData.instanceExpressIDs) {
              const ids = c.userData.instanceExpressIDs as number[];
              ids.forEach((eid, i) => {
                const key = `${m.modelID}_${eid}`;
                if (!this.meshIndex.has(key)) this.meshIndex.set(key, { mesh: c, instanceId: i });
              });
            } else if (c.userData.isBatch && c.geometry.getAttribute('expressID')) {
              const arr = c.geometry.getAttribute('expressID').array as ArrayLike<number>;
              for (let i = 0; i < arr.length; i++) {
                const eid = arr[i];
                const key = `${m.modelID}_${eid}`;
                // Skip hidden elements so they can't be re-selected/hovered after hide.
                if (!this.hiddenElementPositions.has(key) && !this.meshIndex.has(key)) {
                  this.meshIndex.set(key, { mesh: c });
                }
              }
            }
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

  // ── Explosion View ──
  // Capture every element's centroid (relative to the model center) as the
  // baseline for a radial explosion. Idempotent: only (re)builds when not
  // initialized yet.
  initExplosion() {
    if (this.explosionInitialized) return;
    if (this.models.size === 0) return;

    this.models.forEach((m) => m.group.updateMatrixWorld(true));
    const merged = this.getMergedBoundingBox();
    if (!merged || merged.box.isEmpty()) return;
    this.explosionCenter.copy(merged.center);

    const records: ExplosionRecord[] = [];

    this.models.forEach((m) => {
      m.group.traverse((c) => {
        if (!c.visible) return;

        // Repeated elements: one InstancedMesh, explode per instance.
        if (c instanceof THREE.InstancedMesh && c.userData.instanceExpressIDs) {
          const ids = c.userData.instanceExpressIDs as number[];
          const indices: number[] = [];
          const base: THREE.Matrix4[] = [];
          const dir: THREE.Vector3[] = [];
          for (let i = 0; i < ids.length; i++) {
            const center = this.getElementCenter(m.modelID, ids[i]);
            if (!center) continue;
            const d = center.clone().sub(this.explosionCenter);
            const mat = new THREE.Matrix4();
            c.getMatrixAt(i, mat);
            indices.push(i);
            base.push(mat);
            dir.push(d);
          }
          if (indices.length > 0) {
            const hadBoundsTree = !!(c.geometry as any).boundsTree;
            if (hadBoundsTree && (c.geometry as any).disposeBoundsTree) {
              (c.geometry as any).disposeBoundsTree();
            }
            records.push({ kind: 'instance', mesh: c, indices, base, dir, hadBoundsTree });
          }
          return;
        }

        // IFC batched meshes carry a per-vertex expressID attribute that maps
        // each vertex back to its source element. Explode per element via a
        // single-pass centroid map (no per-element geometry extraction).
        if (c instanceof THREE.Mesh) {
          const geo = c.geometry as THREE.BufferGeometry;
          const posAttr = geo.getAttribute('position');
          const eidAttr = geo.getAttribute('expressID');
          if (!posAttr || !eidAttr) return;
          const pos = posAttr.array as Float32Array;
          const eids = eidAttr.array as ArrayLike<number>;
          const count = posAttr.count;

          // Accumulate each element's centroid (mesh-local space, which equals
          // world space because the batched mesh transform is identity).
          const acc = new Map<number, { x: number; y: number; z: number; n: number }>();
          for (let i = 0; i < count; i++) {
            const e = eids[i];
            let a = acc.get(e);
            if (!a) {
              a = { x: 0, y: 0, z: 0, n: 0 };
              acc.set(e, a);
            }
            a.x += pos[i * 3];
            a.y += pos[i * 3 + 1];
            a.z += pos[i * 3 + 2];
            a.n++;
          }
          // Work in the mesh's own local space so the radial direction stays
          // correct even if the model group were transformed.
          const modelLocal = c.worldToLocal(this.explosionCenter.clone());
          const centerMap = new Map<number, THREE.Vector3>();
          acc.forEach((a, e) =>
            centerMap.set(e, new THREE.Vector3(a.x / a.n, a.y / a.n, a.z / a.n))
          );

          // Per-vertex radial direction = element centroid − model center.
          const dir = new Float32Array(pos.length);
          for (let i = 0; i < count; i++) {
            const ctr = centerMap.get(eids[i]);
            if (ctr) {
              dir[i * 3] = ctr.x - modelLocal.x;
              dir[i * 3 + 1] = ctr.y - modelLocal.y;
              dir[i * 3 + 2] = ctr.z - modelLocal.z;
            }
          }

          const hadBoundsTree = !!(geo as any).boundsTree;
          if (hadBoundsTree && (geo as any).disposeBoundsTree) {
            (geo as any).disposeBoundsTree();
          }
          records.push({ kind: 'vertex', mesh: c, original: pos.slice(), dir, hadBoundsTree });
        }
      });
    });

    this.explosionRecords = records;
    this.explosionInitialized = true;
  }

  // factor: 0 = assembled, 1 = fully exploded (each element pushed radially
  // outward from the model center by up to EXPLODE_SPREAD × its distance).
  setExplosion(factor: number) {
    if (this.models.size === 0) return;
    if (!this.explosionInitialized) this.initExplosion();
    if (this.explosionRecords.length === 0) return;

    const f = Math.max(0, Math.min(1, factor));
    this.explosionFactor = f;
    const s = f * ModelService.EXPLODE_SPREAD;

    const tmpMat = new THREE.Matrix4();
    const tmpPos = new THREE.Vector3();
    this.explosionRecords.forEach((rec) => {
      if (rec.kind === 'vertex') {
        const geo = rec.mesh.geometry as THREE.BufferGeometry;
        const arr = geo.getAttribute('position').array as Float32Array;
        for (let i = 0; i < arr.length; i++) {
          arr[i] = rec.original[i] + rec.dir[i] * s;
        }
        geo.getAttribute('position').needsUpdate = true;
        rec.mesh.frustumCulled = false;
      } else {
        for (let k = 0; k < rec.indices.length; k++) {
          const idx = rec.indices[k];
          tmpMat.copy(rec.base[k]);
          tmpPos.setFromMatrixPosition(rec.base[k]);
          tmpPos.addScaledVector(rec.dir[k], s);
          tmpMat.setPosition(tmpPos);
          rec.mesh.setMatrixAt(idx, tmpMat);
        }
        rec.mesh.instanceMatrix.needsUpdate = true;
        rec.mesh.frustumCulled = false;
      }
    });
    this.requestRender?.();
  }

  // Restore every element to its assembled geometry/instance and clear the
  // baseline. Bounds trees (if any) are rebuilt so picking stays accurate.
  resetExplosion() {
    this.explosionRecords.forEach((rec) => {
      if (rec.kind === 'vertex') {
        const geo = rec.mesh.geometry as THREE.BufferGeometry;
        const arr = geo.getAttribute('position').array as Float32Array;
        arr.set(rec.original);
        geo.getAttribute('position').needsUpdate = true;
        rec.mesh.frustumCulled = true;
        if (rec.hadBoundsTree && (geo as any).computeBoundsTree) {
          (geo as any).computeBoundsTree();
        }
      } else {
        for (let k = 0; k < rec.indices.length; k++) {
          rec.mesh.setMatrixAt(rec.indices[k], rec.base[k]);
        }
        rec.mesh.instanceMatrix.needsUpdate = true;
        rec.mesh.frustumCulled = true;
        if (rec.hadBoundsTree && (rec.mesh.geometry as any).computeBoundsTree) {
          (rec.mesh.geometry as any).computeBoundsTree();
        }
      }
    });
    this.explosionRecords = [];
    this.explosionInitialized = false;
    this.explosionFactor = 0;
    this.requestRender?.();
  }

  get explosionActive(): boolean {
    return this.explosionFactor > 0.0001;
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
    // O(1) lookup via the index built in updateRaycastMeshes().
    return this.meshIndex.get(`${modelID}_${expressID}`) || null;
  }

  // World-space centroid of a single IFC element (by expressID). Handles both
  // instanced meshes (per-instance transform) and merged/batched geometry
  // (extracts the element's sub-geometry first so the center is accurate).
  // Returns null if the element cannot be located.
  getElementCenter(modelID: number, expressID: number): THREE.Vector3 | null {
    const found = this.findMeshByExpressID(modelID, expressID);
    if (!found) return null;
    const { mesh, instanceId } = found;

    const center = new THREE.Vector3();

    if (mesh instanceof THREE.InstancedMesh && instanceId !== undefined) {
      mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) {
        mesh.geometry.boundingBox.getCenter(center);
        const m = new THREE.Matrix4();
        mesh.getMatrixAt(instanceId, m);
        center.applyMatrix4(m).applyMatrix4(mesh.matrixWorld);
        return center;
      }
    }

    const geo = mesh.geometry as THREE.BufferGeometry;
    if (geo.getAttribute('expressID')) {
      const sub = this.extractGeometryByExpressID(geo, expressID);
      if (sub) {
        sub.computeBoundingBox();
        if (sub.boundingBox) {
          sub.boundingBox.getCenter(center);
          center.applyMatrix4(mesh.matrixWorld);
        }
        sub.dispose();
        if (sub.boundingBox) return center;
      }
    }

    geo.computeBoundingBox();
    if (geo.boundingBox) {
      geo.boundingBox.getCenter(center);
      center.applyMatrix4(mesh.matrixWorld);
      return center;
    }
    return null;
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
    this.requestRender?.();
    return didHide;
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
    this.requestRender?.();
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
    this.requestRender?.();
  }

  clearIsolation() {
    this.isolatedIDs = null;
    this.originalMaterials.forEach((mat, mesh) => {
      if (mesh.parent) mesh.material = mat;
    });
    this.originalMaterials.clear();
    this.updateRaycastMeshes();
    this.requestRender?.();
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
      // No Chrome-only performance.memory: derive a transparent estimate from
      // real model metrics (GPU buffer bytes + geometry/triangle counts) instead
      // of a hardcoded constant.
      const geometriesCount = rendererInfo?.geometries || 0;
      const triangleCount = rendererInfo?.triangles || 0;
      jsHeapMemory = gpuMemoryMB * 0.35 + geometriesCount * 0.05 + triangleCount * 0.00002;
    }

    return {
      triangles: rendererInfo?.triangles || 0,
      geometries: rendererInfo?.geometries || 0,
      memory: Math.round((jsHeapMemory + gpuMemoryMB) * 10) / 10,
    };
  }

  // ── Dispose (safe for remount) ──
  dispose() {
    this.clearAll();
    // NOTE: isolationDimMaterial survives remount — don't dispose it here.
  }
}
