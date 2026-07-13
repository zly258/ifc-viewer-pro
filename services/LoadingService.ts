import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { IfcBatcher } from './IfcBatcher';
import { cacheManager } from './CacheManager';
import { ModelService } from './ModelService';
import { SceneService } from './SceneService';

export class LoadingService {
  private worker: Worker | null = null;
  private batcher: IfcBatcher;
  private gltfLoader: GLTFLoader;

  private scene: THREE.Scene;
  private modelService: ModelService;
  private sceneService: SceneService;

  // Resolver callbacks for async worker communication
  private loadResolver: (() => void) | null = null;
  private propertyResolver: ((props: any) => void) | null = null;
  private highlightResolver: ((geoms: any[]) => void) | null = null;
  private propertyKeysResolver: ((keys: string[]) => void) | null = null;
  private reportResolver: ((rows: any[]) => void) | null = null;
  private reportRejecter: ((err: any) => void) | null = null;

  // Loading state
  private currentLoadingFileName: string = '';
  private currentLoadingModelID: number = -1;
  private currentFitToFrame: boolean = true;

  // Cache
  private pendingCacheData: { batches: any[]; cacheKey: string } | null = null;

  // Callbacks
  public onLoading: (progress: number, total: number) => void = () => {};
  public onProcessing: (message: string | null) => void = () => {};
  public onError: (msg: string) => void = () => {};
  public onModelLoaded: ((modelID: number, name: string) => void) | null = null;

  // Highlight result callback (for highlightElement fallback to worker)
  public onHighlightReceive: ((geoms: any[], modelID: number, expressID: number) => void) | null = null;

  /** Exposes batcher.getExpressID for raycasting (used by InteractionService) */
  getExpressIDFromHit(hit: THREE.Intersection): number | null {
    return this.batcher.getExpressID(hit);
  }

  constructor(scene: THREE.Scene, modelService: ModelService, sceneService: SceneService) {
    this.scene = scene;
    this.modelService = modelService;
    this.sceneService = sceneService;
    this.batcher = new IfcBatcher();

    // GLTF Loader
    this.gltfLoader = new GLTFLoader();
    try {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(
        'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/'
      );
      this.gltfLoader.setDRACOLoader(dracoLoader);
    } catch (e) {
      console.warn('Draco Error', e);
    }
  }

  // ── Worker ──
  initWorker() {
    if (this.worker) return;

    this.worker = new Worker(new URL('./ifc.worker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (e: MessageEvent) => {
      const { type, data } = e.data;

      switch (type) {
        case 'INIT_SUCCESS':
          console.log('[Worker] WebIFC initialized in background thread');
          break;

        case 'PROCESSING':
          this.onProcessing(data?.message || e.data.message);
          break;

        case 'PROGRESS': {
          const prog = (data?.progress ?? e.data.progress) as number;
          const msg = (data?.message ?? e.data.message) as string;
          if (prog !== undefined) this.onLoading(prog, 100);
          if (msg) this.onProcessing(msg);
          break;
        }

        case 'ERROR':
          console.error('[Worker Error]', data || e.data.message);
          this.onError(data || e.data.message);
          this.onProcessing(null);
          if (this.loadResolver) {
            this.loadResolver();
            this.loadResolver = null;
          }
          break;

        case 'GEOMETRY_BATCH':
          this.handleGeometryBatch(data);
          break;

        case 'GEOMETRY_STREAM':
          this.handleGeometryStream(data);
          break;

        case 'LOAD_COMPLETE':
          this.handleLoadComplete(data);
          break;

        case 'PROPERTIES_RESULT':
          if (this.propertyResolver) {
            this.propertyResolver(data);
            this.propertyResolver = null;
          }
          break;

        case 'HIGHLIGHT_GEOMETRY_RESULT':
          if (this.highlightResolver) {
            this.highlightResolver(data.geometries);
            this.highlightResolver = null;
          } else if (this.onHighlightReceive) {
            const { modelID, expressID } = data;
            this.onHighlightReceive(data.geometries, modelID ?? -1, expressID ?? -1);
          }
          break;

        case 'REPORT_RESULT': {
          const r = this.reportResolver;
          this.reportResolver = null;
          this.reportRejecter = null;
          r?.(data.rows);
          break;
        }

        case 'REPORT_RESULT_FAILED': {
          const r = this.reportRejecter;
          this.reportResolver = null;
          this.reportRejecter = null;
          r?.(new Error(data.error || '报表计算失败'));
          break;
        }

        case 'PROPERTY_KEYS_RESULT':
          if (this.propertyKeysResolver) {
            this.propertyKeysResolver(data.keys);
            this.propertyKeysResolver = null;
          }
          break;

        default:
          break;
      }
    };

    this.worker.postMessage({ type: 'INIT' });
  }

  // ── Geometry batch handling (incremental) ──
  private handleGeometryBatch(data: any) {
    const { modelID, geometries } = data;
    if (this.pendingCacheData) {
      this.pendingCacheData.batches.push(...geometries);
    }

    this.batcher.addFromWorkerBatch(geometries, this.getMaterial.bind(this));
    const partialMeshes = this.batcher.build();

    if (partialMeshes.length > 0) {
      let rootGroup = this.modelService.partialGroups.get(modelID);
      if (!rootGroup) {
        rootGroup = new THREE.Group();
        rootGroup.name = this.currentLoadingFileName || 'Model';
        rootGroup.userData.modelID = modelID;
        rootGroup.updateMatrixWorld(true);
        this.modelService.partialGroups.set(modelID, rootGroup);
        this.scene.add(rootGroup);
      }

      partialMeshes.forEach((mesh) => {
        mesh.userData.modelID = modelID;
        mesh.userData.isBatch = true;
        mesh.castShadow = this.sceneService.shadowQuality !== 'off';
        mesh.receiveShadow = this.sceneService.shadowQuality !== 'off';
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        rootGroup!.add(mesh);
      });

      this.sceneService.isDirty = true;
    }
  }

  private handleGeometryStream(data: any) {
    const { modelID, expressID, geometryExpressID, color, flatTransformation, pos, norm, indices } = data;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(norm), 3));
    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    const material = this.getMaterial(
      color ? new THREE.Color(color.x, color.y, color.z).getHex() : 0xcccccc,
      color ? color.w : 1.0
    );

    const matrix = new THREE.Matrix4().fromArray(flatTransformation);
    this.batcher.add(geom, material, matrix, expressID, geometryExpressID);
  }

  private handleLoadComplete(data: any) {
    const { modelID, structure, parentMap } = data;

    // Flush remaining batcher data
    const remainingMeshes = this.batcher.build();

    let rootGroup = this.modelService.partialGroups.get(modelID);
    if (!rootGroup) {
      rootGroup = new THREE.Group();
      rootGroup.name = this.currentLoadingFileName || 'Model';
      rootGroup.userData.modelID = modelID;
      rootGroup.updateMatrixWorld(true);
      this.modelService.partialGroups.set(modelID, rootGroup);
      this.scene.add(rootGroup);
    } else {
      rootGroup.name = this.currentLoadingFileName || rootGroup.name;
    }
    this.modelService.partialGroups.delete(modelID);

    remainingMeshes.forEach((mesh) => {
      mesh.userData.modelID = modelID;
      mesh.userData.isBatch = true;
      mesh.castShadow = this.sceneService.shadowQuality !== 'off';
      mesh.receiveShadow = this.sceneService.shadowQuality !== 'off';
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      rootGroup!.add(mesh);
    });

    rootGroup.updateMatrixWorld(true);
    this.modelService.registerModel(modelID, rootGroup, rootGroup.name);

    // Merge parentMap
    Object.entries(parentMap).forEach(([k, v]) => {
      this.modelService.parentMap.set(k, v as string);
    });

    this.modelService.savedStructures.set(modelID, structure);

    // Resize
    this.sceneService.handleResize();

    // Fit if needed
    if (this.currentFitToFrame) {
      const meta = this.modelService.getMergedBoundingBox();
      if (meta.size > 0) {
        this.sceneService.fitModelToFrame(meta.box, meta.center, meta.size);
      }
      this.sceneService.updateShadowCameraFrustum(() => {
        return meta.size > 0 ? meta.box : null;
      });
    }

    this.onLoading(100, 100);
    this.onProcessing(null);
    this.sceneService.isDirty = true;

    // Cache save
    if (this.pendingCacheData) {
      cacheManager
        .set(this.pendingCacheData.cacheKey, {
          batches: this.pendingCacheData.batches,
          structure,
          parentMap,
        })
        .catch((e) => console.warn('Cache write failed:', e));
      this.pendingCacheData = null;
    }

    this.onModelLoaded?.(modelID, rootGroup.name);

    if (this.loadResolver) {
      this.loadResolver();
      this.loadResolver = null;
    }
  }

  // ── Material (shared with InteractionService) ──
  private materialCache: Map<string, THREE.MeshStandardMaterial> = new Map();
  private static MATERIAL_CACHE_MAX = 500;

  // Clipping plane reference (set by facade)
  public getClippingPlanes: (() => THREE.Plane[]) | null = null;

  getMaterial(color: number, opacity: number): THREE.MeshStandardMaterial {
    const key = `${color}-${opacity.toFixed(2)}`;

    if (this.materialCache.has(key)) {
      const mat = this.materialCache.get(key)!;
      this.materialCache.delete(key);
      this.materialCache.set(key, mat);
      return mat;
    }

    if (this.materialCache.size >= LoadingService.MATERIAL_CACHE_MAX) {
      const oldest = this.materialCache.keys().next().value;
      if (oldest) {
        this.materialCache.get(oldest)!.dispose();
        this.materialCache.delete(oldest);
      }
    }

    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      side: THREE.FrontSide,
      roughness: 0.6,
      metalness: 0.2,
    });

    if (this.getClippingPlanes) {
      mat.clippingPlanes = this.getClippingPlanes();
    }

    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         if (!gl_FrontFacing) {
           diffuseColor.rgb = vec3(0.65, 0.65, 0.65);
         }`
      );
    };

    this.materialCache.set(key, mat);
    return mat;
  }

  getMaterialCache(): Map<string, THREE.MeshStandardMaterial> {
    return this.materialCache;
  }

  // ── GLB Loading ──
  loadGlb = async (file: File, fitToFrame = true): Promise<void> => {
    this.onLoading(0, 100);
    this.onProcessing('读取 GLB/GLTF 文件...');
    this.sceneService.handleResize();

    const url = URL.createObjectURL(file);

    return new Promise<void>((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          const root = gltf.scene;
          const modelID = -Date.now();

          root.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.userData.modelID = modelID;
              obj.userData.isGLB = true;
              obj.userData.originalName = obj.name;

              if (obj.geometry) {
                obj.geometry.computeBoundingBox();
                if ((obj.geometry as any).computeBoundsTree) {
                  (obj.geometry as any).computeBoundsTree();
                }
              }
              obj.castShadow = this.sceneService.shadowQuality !== 'off';
              obj.receiveShadow = this.sceneService.shadowQuality !== 'off';
              obj.matrixAutoUpdate = false;
              obj.updateMatrix();
            }
          });

          if (this.modelService.glbUpAxis === 'Z') {
            root.rotateX(-Math.PI / 2);
          }
          root.updateMatrixWorld(true);

          this.scene.add(root);
          this.modelService.registerModel(modelID, root, file.name);

          if (fitToFrame) {
            const meta = this.modelService.getMergedBoundingBox();
            if (meta.size > 0) {
              this.sceneService.fitModelToFrame(meta.box, meta.center, meta.size);
            }
          }

          this.onLoading(100, 100);
          this.onProcessing(null);
          URL.revokeObjectURL(url);
          this.onModelLoaded?.(modelID, file.name);
          resolve();
        },
        (xhr: any) => {
          if (xhr.lengthComputable) {
            this.onLoading((xhr.loaded / xhr.total) * 100, 100);
          }
        },
        (err: any) => {
          this.onError('GLB 加载失败');
          this.onProcessing(null);
          reject(err);
        }
      );
    });
  };

  // ── IFC Loading ──
  loadIfc = async (file: File, fitToFrame = true): Promise<void> => {
    if (!this.worker) this.initWorker();

    this.sceneService.handleResize();
    const cacheKey = `${file.name}_${file.size}_${file.lastModified}`;

    this.onProcessing('检查缓存...');
    this.onLoading(0, 100);

    try {
      const cached = await cacheManager.get(cacheKey);
      if (cached) {
        this.onProcessing('从缓存恢复模型...');
        this.currentLoadingFileName = file.name;
        this.currentFitToFrame = fitToFrame;

        const modelID = this.modelService.modelIdCounter++;
        this.batcher.addFromWorkerBatch(cached.batches, this.getMaterial.bind(this));
        const meshes = this.batcher.build();

        const rootGroup = new THREE.Group();
        rootGroup.name = file.name;
        rootGroup.userData.modelID = modelID;

        meshes.forEach((mesh) => {
          mesh.userData.modelID = modelID;
          mesh.userData.isBatch = true;
          mesh.castShadow = this.sceneService.shadowQuality !== 'off';
          mesh.receiveShadow = this.sceneService.shadowQuality !== 'off';
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          rootGroup.add(mesh);
        });
        rootGroup.updateMatrixWorld(true);
        this.scene.add(rootGroup);
        this.modelService.registerModel(modelID, rootGroup, rootGroup.name);

        Object.entries(cached.parentMap).forEach(([k, v]) => {
          this.modelService.parentMap.set(k, v as string);
        });
        this.modelService.savedStructures.set(modelID, cached.structure);

        this.sceneService.handleResize();

        if (fitToFrame) {
          const meta = this.modelService.getMergedBoundingBox();
          if (meta.size > 0) {
            this.sceneService.fitModelToFrame(meta.box, meta.center, meta.size);
          }
        }

        this.onLoading(100, 100);
        this.onProcessing(null);
        this.sceneService.isDirty = true;
        this.onModelLoaded?.(modelID, file.name);

        // Background loading for properties
        const bgReader = new FileReader();
        bgReader.onload = () => {
          const buffer = bgReader.result as ArrayBuffer;
          if (this.worker && buffer) {
            this.worker.postMessage(
              { type: 'LOAD_IFC_MODEL_BACKGROUND', data: { fileBuffer: buffer, modelID } },
              [buffer]
            );
          }
        };
        bgReader.readAsArrayBuffer(file);
        return;
      }
    } catch (e) {
      console.warn('Cache check failed', e);
    }

    // Fresh load
    this.onProcessing('读取 IFC 文件...');
    this.currentLoadingFileName = file.name;
    this.currentFitToFrame = fitToFrame;
    this.pendingCacheData = { cacheKey, batches: [] };

    this.currentLoadingModelID = this.modelService.modelIdCounter++;

    const reader = new FileReader();
    return new Promise<void>((resolve, reject) => {
      reader.onload = async (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) {
          reject(new Error('File read returned empty buffer'));
          return;
        }

        this.loadResolver = resolve;
        this.worker!.postMessage(
          {
            type: 'LOAD_IFC_MODEL',
            data: { fileBuffer: buffer, modelID: this.currentLoadingModelID },
          },
          [buffer]
        );
      };
      reader.onerror = (err) => {
        reject(err);
        this.onProcessing(null);
      };
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          this.onLoading((e.loaded / e.total) * 80, 100);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  // ── Property Queries ──
  queryProperties(modelID: number, expressID: number): Promise<any> {
    if (!this.worker) return Promise.reject('Worker not initialized');
    return new Promise((resolve) => {
      this.propertyResolver = resolve;
      this.worker!.postMessage({ type: 'GET_PROPERTIES', data: { modelID, expressID } });
    });
  }

  queryHighlightGeometry(modelID: number, expressID: number): Promise<any[]> {
    if (!this.worker) return Promise.resolve([]);
    return new Promise((resolve) => {
      this.highlightResolver = resolve;
      this.worker!.postMessage({ type: 'GET_HIGHLIGHT_GEOMETRY', data: { modelID, expressID } });
    });
  }

  getAllPropertiesForStats(modelID: number): Promise<string[]> {
    if (!this.worker || modelID < 0) return Promise.resolve([]);
    return new Promise((resolve) => {
      this.propertyKeysResolver = resolve;
      this.worker!.postMessage({ type: 'GET_ALL_PROPERTY_KEYS', data: { modelID } });
      setTimeout(() => {
        if (this.propertyKeysResolver === resolve) {
          resolve([]);
          this.propertyKeysResolver = null;
        }
      }, 3000);
    });
  }

  generateReport(modelID: number, config: any): Promise<any[]> {
    if (!this.worker || modelID < 0) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      this.reportResolver = resolve;
      this.reportRejecter = reject;
      this.worker!.postMessage({ type: 'GENERATE_REPORT', data: { modelID, config } });
    });
  }

  // ── Worker message helpers ──
  sendWorkerMessage(msg: any, transfer?: Transferable[]) {
    this.worker?.postMessage(msg, transfer || []);
  }

  clearModelInWorker(modelID: number) {
    if (modelID >= 0 && this.worker) {
      try {
        this.worker.postMessage({ type: 'CLEAR_MODEL', data: { modelID } });
      } catch (e) {
        console.warn(`WebIFC CloseModel(${modelID}) via worker failed`, e);
      }
    }
  }

  // ── Dispose (safe for remount — only clear runtime state) ──
  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    // NOTE: batcher and materialCache survive remount,
    // so don't dispose them here.
  }
}
