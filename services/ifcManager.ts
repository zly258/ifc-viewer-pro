
import * as THREE from 'three';
import * as WebIFC from 'web-ifc';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// @ts-ignore
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { IFCElementData, ViewerTool, MeasurementMode, CameraView, IFCProperty, IFCSpatialStructure } from '../types';
import { MeasurementManager } from './MeasurementManager';
import { SectionManager } from './SectionManager';
import { IfcBatcher } from './IfcBatcher';

// 启用 BVH 加速
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class IFCManager {
    private container: HTMLElement | null = null;
    private scene: THREE.Scene;
    public camera: THREE.OrthographicCamera;
    private renderer: THREE.WebGLRenderer;
    private labelRenderer: CSS2DRenderer;
    private controls: OrbitControls;
    
    private ifcApi: WebIFC.IfcAPI;
    private gltfLoader: GLTFLoader;
    private batcher: IfcBatcher;
    
    private isInitialized: boolean = false;

    // 模型存储
    private models: Map<number, { group: THREE.Group, modelID: number, name: string }> = new Map();
    private propertyMaps: Map<number, Map<number, number[]>> = new Map();
    private modelMeshExpressIDs: Map<number, Set<number>> = new Map();
    public parentMap: Map<string, string> = new Map();
    
    public measurementManager: MeasurementManager | null = null;
    public sectionManager: SectionManager | null = null;
    
    public onSelect: (data: IFCElementData | null) => void = () => {};
    public onLoading: (progress: number, total: number) => void = () => {};
    public onProcessing: (message: string | null) => void = () => {};
    public onError: (msg: string) => void = () => {};
    public ifcUpAxis: 'Y' | 'Z' = 'Z';
    public glbUpAxis: 'Y' | 'Z' = 'Y';
    private dirLight!: THREE.DirectionalLight;
    public shadowQuality: 'high' | 'low' | 'off' = 'off';

    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private activeTool: ViewerTool = ViewerTool.SELECT;

    private materialCache: Record<string, THREE.MeshStandardMaterial> = {};
    
    // Highlight - Selection
    private highlightModel: THREE.Mesh | null = null;
    private highlightMaterial = new THREE.MeshStandardMaterial({
        color: 0x3b82f6, // Blue
        transparent: true,
        opacity: 0.6,
        depthTest: false,
        side: THREE.DoubleSide,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.4
    });

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf8fafc); 

        // Lighting (Updated for Y-up)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
        hemiLight.position.set(0, 200, 0); // Y-up
        this.scene.add(hemiLight);
        
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
        this.dirLight.position.set(50, 200, 100);
        this.dirLight.castShadow = false; 
        this.dirLight.shadow.bias = -0.0005; // To prevent shadow acne
        this.scene.add(this.dirLight);
        
        const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
        backLight.position.set(-50, -100, -50);
        this.scene.add(backLight);

        // Renderer
        const fr = 50; 
        this.camera = new THREE.OrthographicCamera(-fr, fr, fr, -fr, 0.1, 50000);
        this.camera.up.set(0, 1, 0); // SWITCHED TO Y-UP (Standard Three.js)
        
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true, 
            preserveDrawingBuffer: true,
            logarithmicDepthBuffer: true
        });
        this.labelRenderer = new CSS2DRenderer();
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = false;
        this.controls.screenSpacePanning = true; 
        
        this.batcher = new IfcBatcher();

        // Loaders
        this.ifcApi = new WebIFC.IfcAPI();
        
        // Fixed path
        this.ifcApi.SetWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/');

        // Note: SetLogLevel moved to init() to avoid early access errors
        
        this.gltfLoader = new GLTFLoader();
        try {
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
            this.gltfLoader.setDRACOLoader(dracoLoader);
        } catch (e) { console.warn("Draco Error", e); }
    }

    public setOrientations(ifcUpAxis: 'Y' | 'Z', glbUpAxis: 'Y' | 'Z') {
        this.ifcUpAxis = ifcUpAxis;
        this.glbUpAxis = glbUpAxis;

        this.models.forEach((model, modelID) => {
            const isIFC = modelID > 0;
            const targetAxis = isIFC ? ifcUpAxis : glbUpAxis;
            
            // Reset rotation first
            model.group.rotation.set(0, 0, 0);
            if (targetAxis === 'Z') {
                model.group.rotateX(-Math.PI / 2);
            }
            model.group.updateMatrixWorld(true);
        });

        // Sync highlight if selection exists
        if (this.highlightModel) {
            const hModelID = this.highlightModel.userData.modelID;
            if (hModelID !== undefined) {
                const model = this.models.get(hModelID);
                if (model) {
                    this.highlightModel.rotation.copy(model.group.rotation);
                    this.highlightModel.updateMatrixWorld(true);
                }
            }
        }
        
        this.camera.up.set(0, 1, 0); // Always standard Y-up globally
        this.camera.updateProjectionMatrix();
        this.renderScene();
    }

    public setUpAxis(axis: 'Y' | 'Z') {
        // Fallback for custom legacy calls
        if (axis === 'Z') {
            this.setOrientations('Z', 'Z');
        } else {
            this.setOrientations('Y', 'Y');
        }
    }

    public setShadowQuality(quality: 'high' | 'low' | 'off') {
        this.shadowQuality = quality;

        if (quality === 'off') {
            this.renderer.shadowMap.enabled = false;
            this.dirLight.castShadow = false;
        } else {
            this.renderer.shadowMap.enabled = true;
            this.dirLight.castShadow = true;

            const mapSize = quality === 'high' ? 2048 : 512;
            this.dirLight.shadow.mapSize.width = mapSize;
            this.dirLight.shadow.mapSize.height = mapSize;

            if (this.dirLight.shadow.map) {
                this.dirLight.shadow.map.dispose();
                (this.dirLight.shadow.map as any) = null;
            }

            this.renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        }

        // Apply castShadow and receiveShadow to all model meshes
        this.models.forEach(m => {
            m.group.traverse(c => {
                if (c instanceof THREE.Mesh) {
                    c.castShadow = (quality !== 'off');
                    c.receiveShadow = (quality !== 'off');
                    if (c.material) {
                        if (Array.isArray(c.material)) {
                            c.material.forEach(mat => { mat.needsUpdate = true; });
                        } else {
                            c.material.needsUpdate = true;
                        }
                    }
                }
            });
        });

        this.updateShadowCameraFrustum();

        this.renderer.shadowMap.needsUpdate = true;
        this.renderScene();
    }

    public updateShadowCameraFrustum() {
        if (this.shadowQuality === 'off') return;

        const box = new THREE.Box3();
        let hasContent = false;
        this.models.forEach(m => {
            m.group.updateMatrixWorld(true);
            m.group.traverse(c => {
                if (c instanceof THREE.Mesh && !c.userData.isSectionHelper) {
                    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
                    if (c.geometry.boundingBox) {
                        const geomBox = c.geometry.boundingBox.clone();
                        geomBox.applyMatrix4(c.matrixWorld);
                        if (!geomBox.isEmpty()) {
                            box.union(geomBox);
                            hasContent = true;
                        }
                    }
                }
            });
        });

        if (!hasContent || box.isEmpty()) {
            return;
        }

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        // Position the shadow casting directional light from above-side of the model center
        this.dirLight.position.set(center.x + maxDim, center.y + maxDim * 1.5, center.z + maxDim);
        this.dirLight.target.position.copy(center);
        this.dirLight.target.updateMatrixWorld();

        // Adjust shadow camera frustum
        const d = maxDim * 1.5;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.dirLight.shadow.camera.near = 0.1;
        this.dirLight.shadow.camera.far = maxDim * 6;
        this.dirLight.shadow.camera.updateProjectionMatrix();
    }

    public updateLighting(timeOfDay: number, azimuth: number, altitude: number) {
        if (!this.dirLight) return;

        // Convert degree parameters to radians
        const altRad = (altitude * Math.PI) / 180;
        const azRad = (azimuth * Math.PI) / 180;

        const box = new THREE.Box3();
        let hasContent = false;
        this.models.forEach(m => {
            m.group.updateMatrixWorld(true);
            m.group.traverse(c => {
                if (c instanceof THREE.Mesh && !c.userData.isSectionHelper) {
                    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
                    if (c.geometry.boundingBox) {
                        const geomBox = c.geometry.boundingBox.clone();
                        geomBox.applyMatrix4(c.matrixWorld);
                        if (!geomBox.isEmpty()) {
                            box.union(geomBox);
                            hasContent = true;
                        }
                    }
                }
            });
        });

        const center = hasContent ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
        const size = hasContent ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(100, 100, 100);
        const maxDim = Math.max(size.x, size.y, size.z);
        const d = maxDim * 1.5 || 150;

        // Spherical coordinate mapping for light position (Y-up standard)
        // x = d * cos(altitude) * sin(azimuth)
        // y = d * sin(altitude)
        // z = d * cos(altitude) * cos(azimuth)
        const x = d * Math.cos(altRad) * Math.sin(azRad);
        const y = d * Math.sin(altRad);
        const z = d * Math.cos(altRad) * Math.cos(azRad);

        this.dirLight.position.set(center.x + x, center.y + y, center.z + z);
        this.dirLight.target.position.copy(center);
        this.dirLight.target.updateMatrixWorld();

        // Dynamically adjust shadow camera frustum around current position
        if (this.shadowQuality !== 'off') {
            this.dirLight.shadow.camera.left = -d;
            this.dirLight.shadow.camera.right = d;
            this.dirLight.shadow.camera.top = d;
            this.dirLight.shadow.camera.bottom = -d;
            this.dirLight.shadow.camera.near = 0.1;
            this.dirLight.shadow.camera.far = d * 5;
            this.dirLight.shadow.camera.updateProjectionMatrix();
        }

        // Adjust intensity of directional light based on time of day (sunrise/sunset transitions)
        let intensityFactor = 1.0;
        if (timeOfDay < 6 || timeOfDay > 18) {
            // Night ambient simulation
            intensityFactor = 0.15;
        } else {
            // Day arc peaking at noon (12:00)
            const angle = ((timeOfDay - 6) / 12) * Math.PI;
            intensityFactor = Math.sin(angle);
        }
        
        this.dirLight.intensity = 1.3 * intensityFactor;

        // Warm temperature shifts for sunset/sunrise
        if (timeOfDay >= 6 && timeOfDay < 8.5) {
            // Sunrise (Golden orange)
            this.dirLight.color.setHex(0xffaa44);
        } else if (timeOfDay > 15.5 && timeOfDay <= 18) {
            // Sunset (Warm red-orange)
            this.dirLight.color.setHex(0xff7733);
        } else if (timeOfDay < 6 || timeOfDay > 18) {
            // Night (Cool slate moonlight color)
            this.dirLight.color.setHex(0x99bbff);
        } else {
            // Standard midday solar (Pure clean daylight)
            this.dirLight.color.setHex(0xffffff);
        }

        this.renderScene();
    }

    private animationFrameId: number | null = null;

    private animate = () => {
        this.animationFrameId = requestAnimationFrame(this.animate);
        this.controls.update(); // only required if controls.enableDamping or controls.autoRotate are set
        this.renderer.render(this.scene, this.camera);
        if (this.measurementManager) this.labelRenderer.render(this.scene, this.camera);
    }

    async init(container: HTMLElement) {
        this.container = container;
        
        if (!this.isInitialized) {
            this.updateCameraFrustum();
            
            this.renderer.setSize(container.clientWidth, container.clientHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            
            this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
            this.labelRenderer.domElement.style.position = 'absolute';
            this.labelRenderer.domElement.style.top = '0px';
            this.labelRenderer.domElement.style.pointerEvents = 'none';
            
            // Initial View (ISO Y-up)
            this.camera.position.set(50, 50, 50);
            this.camera.lookAt(0, 0, 0);
            this.camera.zoom = 1;
            this.camera.updateProjectionMatrix();
            
            this.sectionManager = new SectionManager(this.renderer, this.scene);
            this.measurementManager = new MeasurementManager(this.scene, this.camera, container);

            window.addEventListener('resize', this.handleResize);
            window.addEventListener('keydown', this.handleKeyDown);
            this.renderer.domElement.addEventListener('mousemove', this.handleMouseMove);
            this.renderer.domElement.addEventListener('click', this.handleClick);
            this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick);
        } else {
            // Re-mounting
            this.renderer.setSize(container.clientWidth, container.clientHeight);
            this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
            if (this.measurementManager) {
                this.measurementManager.updateContainer(container);
            }
        }

        container.appendChild(this.renderer.domElement);
        container.appendChild(this.labelRenderer.domElement);

        if (!this.animationFrameId) {
            this.animate();
        }

        // Ensure Init is only called once and errors are handled
        if (!this.isInitialized) {
            try {
                await this.ifcApi.Init();
                this.isInitialized = true;
                
                // Set Log Level safely after Init
                try {
                     // LogLevel definition might vary by version, using safe numeric or enum if available
                     this.ifcApi.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_OFF); 
                } catch(e) {
                     // Ignore errors setting log level
                }
                
                console.log("WebIFC Initialized");
            } catch(e) {
                console.error("WebIFC Init Failed:", e);
                this.onError("WebIFC 初始化失败 (WASM加载错误)");
            }
            this.animate();
        }
    }

    private updateCameraFrustum() {
        if (!this.container) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const aspect = width / height;
        const frustumSize = 100;
        
        this.camera.left = -frustumSize * aspect / 2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;
        this.camera.updateProjectionMatrix();
    }

    private handleResize = () => {
        if (!this.container) return;
        this.updateCameraFrustum();
        
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.labelRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    };

    private handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            this.clearSelection();
            this.onSelect(null);
        }
    }

    private readFileWithProgress(file: File): Promise<Uint8Array> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = (event.loaded / event.total) * 80;
                    this.onLoading(percent, 100);
                }
            };
            reader.onload = () => {
                this.onLoading(80, 100);
                if (reader.result instanceof ArrayBuffer) {
                    resolve(new Uint8Array(reader.result));
                } else {
                    reject(new Error("File read failed"));
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    // --- GLB Loading ---
    loadGlb = async (file: File, fitToFrame = true) => {
        this.onProcessing("读取 GLB 文件...");
        this.onLoading(0, 100);
        const url = URL.createObjectURL(file);
        
        return new Promise<void>((resolve, reject) => {
            this.gltfLoader.load(url, (gltf) => {
                const root = gltf.scene;
                const modelID = -Date.now(); // Negative ID for GLB

                root.traverse((obj) => {
                    if (obj instanceof THREE.Mesh) {
                        obj.userData.modelID = modelID;
                        obj.userData.isGLB = true;
                        obj.userData.originalName = obj.name;
                        
                        if (obj.geometry) {
                            obj.geometry.computeBoundingBox();
                            // BVH for interaction
                            if (obj.geometry.computeBoundsTree) obj.geometry.computeBoundsTree();
                        }
                        if (obj.material) {
                            obj.material.side = THREE.DoubleSide; 
                            obj.material.needsUpdate = true;
                        }
                        obj.castShadow = (this.shadowQuality !== 'off');
                        obj.receiveShadow = (this.shadowQuality !== 'off');
                    }
                });
                
                // Adjust based on glbUpAxis
                if (this.glbUpAxis === 'Z') {
                    root.rotateX(-Math.PI / 2);
                }
                root.updateMatrixWorld(true);
                
                this.scene.add(root);
                this.models.set(modelID, { group: root, modelID, name: file.name });
                
                if (fitToFrame) this.fitModelToFrame();
                this.onLoading(100, 100);
                this.onProcessing(null);
                URL.revokeObjectURL(url);
                resolve();
            }, 
            (xhr) => {
                if (xhr.lengthComputable) {
                    const percent = (xhr.loaded / xhr.total) * 100;
                    this.onLoading(percent, 100);
                }
            },
            (err) => {
                this.onError("GLB 加载失败");
                this.onProcessing(null);
                reject(err);
            });
        });
    }

    // --- IFC Loading ---
    loadIfc = async (file: File, fitToFrame = true) => {
        if (!this.isInitialized) {
             try {
                await this.ifcApi.Init();
                this.isInitialized = true;
             } catch(e) {
                this.onError("WebIFC 初始化失败 (WASM加载中或失败)");
                return;
             }
        }

        this.onProcessing("读取 IFC 文件...");
        this.onLoading(0, 100);
        
        try {
            const data = await this.readFileWithProgress(file);
            
            this.onProcessing("解析模型结构...");
            this.onLoading(85, 100);
            const modelID = this.ifcApi.OpenModel(data, {
                COORDINATE_TO_ORIGIN: true
            });

            await this.buildPropertyMap(modelID);
            this.onLoading(90, 100);

            this.onProcessing("生成几何体...");
            let meshCount = 0;
            
            this.ifcApi.StreamAllMeshes(modelID, (flatMesh: WebIFC.FlatMesh) => {
                const size = flatMesh.geometries.size();
                const expressID = flatMesh.expressID;

                if (!this.modelMeshExpressIDs.has(modelID)) {
                    this.modelMeshExpressIDs.set(modelID, new Set());
                }
                this.modelMeshExpressIDs.get(modelID)!.add(expressID);

                for (let i = 0; i < size; i++) {
                    const placedGeom = flatMesh.geometries.get(i);
                    const geom = this.makeGeometry(modelID, placedGeom);
                    if (!geom) continue;

                    const color = placedGeom.color;
                    const material = this.getMaterial(
                        color ? new THREE.Color(color.x, color.y, color.z).getHex() : 0xcccccc,
                        color ? color.w : 1.0
                    );

                    const matrix = new THREE.Matrix4().fromArray(placedGeom.flatTransformation);
                    this.batcher.add(geom, material, matrix, expressID);
                    meshCount++;
                }
            });

            console.log(`[IFCManager] Streamed ${meshCount} geometries.`);
            this.onLoading(95, 100);
            
            this.onProcessing("优化网格...");
            const mergedMeshes = this.batcher.build();
            this.onLoading(98, 100);
            
            console.log(`[IFCManager] Created ${mergedMeshes.length} batched meshes.`);

            const rootGroup = new THREE.Group();
            rootGroup.name = file.name;
            rootGroup.userData.modelID = modelID;
            
            mergedMeshes.forEach(mesh => {
                mesh.userData.modelID = modelID;
                mesh.userData.isBatch = true;
                mesh.castShadow = (this.shadowQuality !== 'off');
                mesh.receiveShadow = (this.shadowQuality !== 'off');
                rootGroup.add(mesh);
            });

            // Adjust based on ifcUpAxis
            if (this.ifcUpAxis === 'Z') {
                rootGroup.rotateX(-Math.PI / 2);
            }
            rootGroup.updateMatrixWorld(true);

            this.scene.add(rootGroup);
            this.models.set(modelID, { group: rootGroup, modelID, name: file.name });
            
            if (fitToFrame) this.fitModelToFrame();
            this.onLoading(100, 100);
            this.onProcessing(null);

        } catch (e: any) {
            console.error(e);
            this.onError(`Load Error: ${e.message}`);
            this.onProcessing(null);
        }
    }

    private makeGeometry(modelID: number, placedGeom: WebIFC.PlacedGeometry): THREE.BufferGeometry | null {
        const geomData = this.ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
        if (!geomData) return null;
        
        const verts = this.ifcApi.GetVertexArray(geomData.GetVertexData(), geomData.GetVertexDataSize());
        const indices = this.ifcApi.GetIndexArray(geomData.GetIndexData(), geomData.GetIndexDataSize());

        if (verts.length === 0 || indices.length === 0) return null;

        const geometry = new THREE.BufferGeometry();
        
        const numVerts = verts.length / 6;
        const pos = new Float32Array(numVerts * 3);
        const norm = new Float32Array(numVerts * 3);

        let idx3 = 0;
        let idx6 = 0;
        for (let i = 0; i < numVerts; i++) {
            pos[idx3] = verts[idx6];
            pos[idx3+1] = verts[idx6+1];
            pos[idx3+2] = verts[idx6+2];
            
            norm[idx3] = verts[idx6+3];
            norm[idx3+1] = verts[idx6+4];
            norm[idx3+2] = verts[idx6+5];

            idx3 += 3;
            idx6 += 6;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        return geometry;
    }

    private getMaterial(color: number, opacity: number): THREE.MeshStandardMaterial {
        const key = `${color}-${opacity.toFixed(2)}`;
        if (!this.materialCache[key]) {
            this.materialCache[key] = new THREE.MeshStandardMaterial({
                color: color,
                transparent: opacity < 1,
                opacity: opacity,
                side: THREE.DoubleSide,
                roughness: 0.6,
                metalness: 0.2
            });
        }
        return this.materialCache[key];
    }

    fitModelToFrame() {
        if (this.models.size === 0) return;
        
        const box = new THREE.Box3();
        let hasContent = false;

        this.models.forEach(m => {
            m.group.updateMatrixWorld(true);
            m.group.traverse(c => {
                if (c instanceof THREE.Mesh) {
                    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
                    if (c.geometry.boundingBox) {
                         const geomBox = c.geometry.boundingBox.clone();
                         geomBox.applyMatrix4(c.matrixWorld);
                         if (!geomBox.isEmpty()) {
                             box.union(geomBox);
                             hasContent = true;
                         }
                    }
                }
            });
        });

        if (!hasContent || box.isEmpty()) {
            this.camera.position.set(50, 50, 50);
            this.camera.zoom = 1;
            this.camera.updateProjectionMatrix();
            this.controls.target.set(0, 0, 0);
            this.controls.update();
            return;
        }

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const padding = 1.2;
        
        this.camera.up.set(0, 1, 0); // Ensure Y-up
        
        const direction = new THREE.Vector3(1, 1, 1).normalize(); // ISO View
        const distance = maxDim * 2; 
        
        const newPos = center.clone().add(direction.multiplyScalar(distance));
        this.camera.position.copy(newPos);
        this.camera.lookAt(center);
        
        const frustumHeight = (this.camera.top - this.camera.bottom);
        const frustumWidth = (this.camera.right - this.camera.left);
        
        this.camera.zoom = Math.min(
            frustumWidth / (maxDim * padding),
            frustumHeight / (maxDim * padding)
        );

        this.camera.updateProjectionMatrix();
        this.controls.target.copy(center);
        this.controls.update();

        // Update shadow camera bounds when the model is reframed
        this.updateShadowCameraFrustum();
    }

    async getFullSpatialStructure() {
        const structures: { fileName: string; modelID: number; structure: IFCSpatialStructure }[] = [];
        for (const [modelID, model] of this.models) {
            if (modelID >= 0) {
                const structure = await this.buildSpatialTree(modelID);
                structures.push({ fileName: model.name, modelID: modelID, structure: structure });
            } else {
                const structure = this.buildGLBSpatialTree(model.group, modelID);
                structures.push({ fileName: model.name, modelID: modelID, structure: structure });
            }
        }
        return structures;
    }

    private buildGLBSpatialTree(root: THREE.Group, modelID: number): IFCSpatialStructure {
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
                children: children
            };
        };
        return {
            expressID: 0,
            type: 'GLB_Model',
            name: root.name || 'Model Root',
            children: root.children.map(c => parseNode(c))
        };
    }

    private async buildSpatialTree(modelID: number): Promise<IFCSpatialStructure> {
        const typeMap = new Map<number, string>();
        [WebIFC.IFCPROJECT, WebIFC.IFCSITE, WebIFC.IFCBUILDING, WebIFC.IFCBUILDINGSTOREY].forEach(type => {
            const lines = this.ifcApi.GetLineIDsWithType(modelID, type);
            for(let i=0; i<lines.size(); i++) typeMap.set(lines.get(i), this.getTypeName(type));
        });

        const aggregates = new Map<number, number[]>(); 
        const contains = new Map<number, number[]>();

        const aggLines = this.ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);
        for(let i=0; i<aggLines.size(); i++) {
            const rel = this.ifcApi.GetLine(modelID, aggLines.get(i));
            if (!rel.RelatingObject) continue;
            const parentID = rel.RelatingObject.value;
            if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
                rel.RelatedObjects.forEach((r: any) => {
                    if(!aggregates.has(parentID)) aggregates.set(parentID, []);
                    aggregates.get(parentID)!.push(r.value);
                });
            }
        }

        const contLines = this.ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
        for(let i=0; i<contLines.size(); i++) {
            const rel = this.ifcApi.GetLine(modelID, contLines.get(i));
            if (!rel.RelatingStructure) continue;
            const parentID = rel.RelatingStructure.value;
            if (rel.RelatedElements && Array.isArray(rel.RelatedElements)) {
                rel.RelatedElements.forEach((r: any) => {
                    if(!contains.has(parentID)) contains.set(parentID, []);
                    contains.get(parentID)!.push(r.value);
                });
            }
        }

        const nestsLines = this.ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELNESTS);
        for(let i=0; i<nestsLines.size(); i++) {
            const rel = this.ifcApi.GetLine(modelID, nestsLines.get(i));
            if (!rel.RelatingObject) continue;
            const parentID = rel.RelatingObject.value;
            if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
                rel.RelatedObjects.forEach((r: any) => {
                    if(!aggregates.has(parentID)) aggregates.set(parentID, []);
                    aggregates.get(parentID)!.push(r.value);
                });
            }
        }

        const visitedExpressIDs = new Set<number>();
        const projects = this.ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
        const projectID = projects.size() > 0 ? projects.get(0) : 0;

        const buildNode = async (id: number, parentIdStr?: string): Promise<IFCSpatialStructure> => {
            visitedExpressIDs.add(id);
            const nodeIdStr = `${modelID}_${id}`;
            if (parentIdStr) {
                this.parentMap.set(nodeIdStr, parentIdStr);
            }

            const props = this.ifcApi.GetLine(modelID, id);
            const type = typeMap.get(id) || props.is_a || 'Object';
            
            const node: IFCSpatialStructure = {
                expressID: id,
                type: type,
                name: props.Name?.value || `${this.formatTypeName(type)} #${id}`,
                children: []
            };

            const childIDs = aggregates.get(id) || [];
            for(const childID of childIDs) {
                node.children.push(await buildNode(childID, nodeIdStr));
            }

            const elemIDs = contains.get(id) || [];
            for(const elemID of elemIDs) {
                node.children.push(await buildNode(elemID, nodeIdStr));
            }
            
            return node;
        };

        let rootNode: IFCSpatialStructure;
        if (projectID !== 0) {
            rootNode = await buildNode(projectID);
        } else {
            const alternativeClasses = [WebIFC.IFCSITE, WebIFC.IFCBUILDING, WebIFC.IFCBUILDINGSTOREY];
            let altID = 0;
            for (const cls of alternativeClasses) {
                const ids = this.ifcApi.GetLineIDsWithType(modelID, cls);
                if (ids.size() > 0) {
                    altID = ids.get(0);
                    break;
                }
            }
            if (altID !== 0) {
                rootNode = await buildNode(altID);
            } else {
                rootNode = {
                    expressID: 0,
                    type: 'Project',
                    name: 'Virtual Root',
                    children: []
                };
            }
        }

        // Get unassigned meshes from model stream
        const loadedIDs = this.modelMeshExpressIDs.get(modelID) || new Set<number>();
        const unassignedNodes: IFCSpatialStructure[] = [];

        for (const expressID of loadedIDs) {
            if (!visitedExpressIDs.has(expressID)) {
                try {
                    const props = this.ifcApi.GetLine(modelID, expressID);
                    const type = props.is_a || 'Object';
                    unassignedNodes.push({
                        expressID,
                        type,
                        name: props.Name?.value || `${this.formatTypeName(type)} #${expressID}`,
                        children: []
                    });
                } catch (e) {
                    unassignedNodes.push({
                        expressID,
                        type: 'Object',
                        name: `未命名构件 #${expressID}`,
                        children: []
                    });
                }
            }
        }

        if (unassignedNodes.length > 0) {
            const groupMap = new Map<string, IFCSpatialStructure[]>();
            unassignedNodes.forEach(node => {
                if (!groupMap.has(node.type)) {
                    groupMap.set(node.type, []);
                }
                groupMap.get(node.type)!.push(node);
            });

            const groupChildren: IFCSpatialStructure[] = [];
            let virtualID = -500;
            const rootIdStr = `${modelID}_${rootNode.expressID}`;

            groupMap.forEach((children, type) => {
                const typeFolderID = virtualID--;
                const folderIdStr = `${modelID}_${typeFolderID}`;
                this.parentMap.set(folderIdStr, rootIdStr);
                
                children.forEach(c => {
                    this.parentMap.set(`${modelID}_${c.expressID}`, folderIdStr);
                });

                groupChildren.push({
                    expressID: typeFolderID,
                    type: 'Group',
                    name: `${this.formatTypeName(type)} (${children.length})`,
                    children
                });
            });

            const unassignedGroupID = -100;
            const unassignedGroupStr = `${modelID}_${unassignedGroupID}`;
            this.parentMap.set(unassignedGroupStr, rootIdStr);
            groupChildren.forEach(folder => {
                this.parentMap.set(`${modelID}_${folder.expressID}`, unassignedGroupStr);
            });

            rootNode.children.push({
                expressID: unassignedGroupID,
                type: 'Group',
                name: `其他未分类构件 (${unassignedNodes.length})`,
                children: groupChildren
            });
        }

        return rootNode;
    }

    private formatTypeName(type: string): string {
        if (type.startsWith('Ifc')) {
            return type.substring(3);
        }
        return type;
    }

    private getTypeName(typeID: number) {
        if (typeID === WebIFC.IFCPROJECT) return 'Project';
        if (typeID === WebIFC.IFCSITE) return 'Site';
        if (typeID === WebIFC.IFCBUILDING) return 'Building';
        if (typeID === WebIFC.IFCBUILDINGSTOREY) return 'Storey';
        return 'Object';
    }

    private async buildPropertyMap(modelID: number) {
        const map = new Map<number, number[]>();
        const typeMap = new Map<number, number>(); 
        
        try {
            let lastYield = performance.now();

            // RelDefinesByProperties (Psets & Quantities)
            const relProps = this.ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
            for (let i = 0; i < relProps.size(); i++) {
                if (performance.now() - lastYield > 35) { // Yield if blocked for > 35ms
                    await new Promise(r => setTimeout(r, 0));
                    lastYield = performance.now();
                }
                const id = relProps.get(i);
                const rel = this.ifcApi.GetLine(modelID, id);
                if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
                    const psetID = rel.RelatingPropertyDefinition?.value;
                    if (psetID) {
                        rel.RelatedObjects.forEach((objRef: any) => {
                            const objID = objRef.value;
                            if (!map.has(objID)) map.set(objID, []);
                            map.get(objID)!.push(psetID);
                        });
                    }
                }
            }

            // RelDefinesByType (Types)
            const relTypes = this.ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYTYPE);
            for (let i = 0; i < relTypes.size(); i++) {
                if (performance.now() - lastYield > 35) {
                    await new Promise(r => setTimeout(r, 0));
                    lastYield = performance.now();
                }
                const id = relTypes.get(i);
                const rel = this.ifcApi.GetLine(modelID, id);
                if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects) && rel.RelatingType) {
                    const typeID = rel.RelatingType.value;
                    rel.RelatedObjects.forEach((objRef: any) => {
                        const objID = objRef.value;
                        typeMap.set(objID, typeID);
                    });
                }
            }

            // Pass down properties from Types to Instances
            for (const [objID, typeID] of Array.from(typeMap.entries())) {
                const typePsets = map.get(typeID);
                if (typePsets) {
                    if (!map.has(objID)) map.set(objID, []);
                    const objPsets = map.get(objID)!;
                    for (const pid of typePsets) {
                        if (!objPsets.includes(pid)) objPsets.push(pid);
                    }
                }
            }

        } catch(e) {
            console.warn("Property Map generation issue", e);
        }
        this.propertyMaps.set(modelID, map);
    }

    // --- Interaction ---
    
    // Perform Raycast
    private castRay(event: MouseEvent): { modelID: number, expressID: number, mesh: THREE.Mesh } | null {
        if (!this.container) return null;
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Re-enable firstHitOnly for three-mesh-bvh performance (CRITICAL FOR UI NOT TO LAG)
        // @ts-ignore
        this.raycaster.firstHitOnly = true; 
        
        const meshes: THREE.Mesh[] = [];
        this.models.forEach(m => {
            if (m.group.visible !== false) {
                m.group.traverse(c => { if(c instanceof THREE.Mesh && c.visible && c !== this.highlightModel) meshes.push(c) });
            }
        });
        const intersects = this.raycaster.intersectObjects(meshes, false);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const mesh = hit.object as THREE.Mesh;
            let expressID = -1;
            let modelID = mesh.userData.modelID;

            if (mesh.userData.isBatch) {
                const id = this.batcher.getExpressID(hit);
                console.log("[castRay] Hit batch mesh. Extracted expressID:", id);
                if (id !== null) expressID = id;
            } else if (mesh.userData.expressID !== undefined) {
                expressID = mesh.userData.expressID;
                console.log("[castRay] Hit normal mesh. Extracted expressID:", expressID);
            }

            console.log("[castRay] Final result:", { modelID, expressID, meshName: mesh.name });
            return { modelID, expressID, mesh };
        }
        console.log("[castRay] No intersections found.");
        return null;
    }

    // Hover Effect
    private handleMouseMove = (event: MouseEvent) => {
        if (this.activeTool === ViewerTool.MEASURE) {
            const m: THREE.Object3D[]=[]; 
            this.models.forEach(mod => {
                if (mod.group.visible !== false) {
                    mod.group.traverse(c => { if(c instanceof THREE.Mesh) m.push(c) });
                }
            }); 
            this.measurementManager?.onMouseMove(event, m);
            return;
        }

        // Disabled Hover Highlight for Select tool
        if (this.activeTool === ViewerTool.SELECT) {
             this.container!.style.cursor = 'default';
        }
    }

    // Click handler (for measurement)
    private handleClick = (event: MouseEvent) => {
        if (!this.container) return;
        
        if (this.activeTool === ViewerTool.MEASURE) {
             const m: THREE.Object3D[]=[]; 
             this.models.forEach(mod => {
                 if (mod.group.visible !== false) {
                     mod.group.traverse(c => { if(c instanceof THREE.Mesh) m.push(c) });
                 }
             }); 
             this.measurementManager?.onClick(event, m);
        }
    }

    // Double Click Selection
    private handleDoubleClick = async (event: MouseEvent) => {
        console.log("[handleDoubleClick] Triggered. Active tool:", this.activeTool);
        if (!this.container) return;

        if (this.activeTool !== ViewerTool.SELECT) return;

        const hit = this.castRay(event);
        console.log("[handleDoubleClick] Raycast result:", hit);

        if (hit) {
            const { modelID, expressID, mesh } = hit;
            if (expressID !== -1 && modelID !== undefined) {
                this.highlightElement(modelID, expressID, mesh);
                await this.selectElement(modelID, expressID);
            }
            else if (mesh.userData.isGLB) {
                this.highlightElement(modelID, -1, mesh); // GLB Highlight
                this.onSelect({ expressID: -1, modelID, type: 'GLB', name: mesh.name, properties: mesh.userData.properties || [] });
            }
        } else {
            // Only clear if double-clicking on empty space
            console.log("[handleDoubleClick] Clearing selection");
            this.clearSelection();
            this.onSelect(null);
        }
    }

    private async selectElement(modelID: number, expressID: number) {
        try {
            const props = await this.ifcApi.GetLine(modelID, expressID);
            const properties: IFCProperty[] = [];
             
            if(props) {
                properties.push({ name: '构件类型', value: String(this.formatTypeName(props.is_a || 'Unknown')), setName: '基本信息' });
                properties.push({ name: 'Express ID', value: String(expressID), setName: '基本信息' });
                if (props.GlobalId && props.GlobalId.value) {
                    properties.push({ name: '全局唯一标识 (GUID)', value: String(props.GlobalId.value), setName: '基本信息' });
                }
                if (props.Name && props.Name.value) {
                    properties.push({ name: '构件名称', value: String(props.Name.value), setName: '基本信息' });
                }

                Object.keys(props).forEach(k => { 
                    if(!['expressID','type','GlobalId','Name','is_a'].includes(k) && props[k]) {
                        let val = props[k].value;
                        if (val === undefined || val === null) {
                            if (typeof props[k] !== 'object') val = props[k];
                        }
                        if (val !== undefined && val !== null) {
                            if (typeof val === 'object' && val.value !== undefined) val = val.value;
                            properties.push({ name: k, value: String(val), setName: '基本属性' });
                        }
                    }
                });
            }

            try {
                const parentId = this.parentMap.get(`${modelID}_${expressID}`);
                if (parentId) {
                    const pExpID = parseInt(parentId.split('_')[1], 10);
                    if (!isNaN(pExpID) && pExpID > 0) {
                        const parentProps = this.ifcApi.GetLine(modelID, pExpID);
                        if (parentProps) {
                            const pName = parentProps.Name?.value || parentProps.is_a || `Storey #${pExpID}`;
                            properties.push({ name: '所在空间', value: String(this.formatTypeName(pName)), setName: '基本信息' });
                        }
                    }
                }
            } catch (e) {}

            try {
                const matRels = this.ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
                for (let i = 0; i < matRels.size(); i++) {
                    const rel = this.ifcApi.GetLine(modelID, matRels.get(i));
                    if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
                        const isRelated = rel.RelatedObjects.some((o: any) => o.value === expressID);
                        if (isRelated && rel.RelatingMaterial) {
                            const mat = this.ifcApi.GetLine(modelID, rel.RelatingMaterial.value);
                            if (mat) {
                                let matName = mat.Name?.value || mat.is_a || 'Material';
                                if (mat.MaterialParts && Array.isArray(mat.MaterialParts)) {
                                    const parts: string[] = [];
                                    for(const pt of mat.MaterialParts) {
                                         const pLine = this.ifcApi.GetLine(modelID, pt.value);
                                         if (pLine && pLine.Material) {
                                             const item = this.ifcApi.GetLine(modelID, pLine.Material.value);
                                             if (item && item.Name) parts.push(item.Name.value);
                                         }
                                    }
                                    if (parts.length > 0) matName = parts.join(' + ');
                                }
                                properties.push({ name: '关联物理材质', value: String(matName), setName: '材质信息' });
                            }
                        }
                    }
                }
            } catch (e) {}

            const psetIDs = this.propertyMaps.get(modelID)?.get(expressID);
             if(psetIDs) {
                 for(const pid of psetIDs) {
                     try {
                         const pset = await this.ifcApi.GetLine(modelID, pid);
                         const setName = pset.Name?.value || 'Pset';
                         
                         // Standard Property Set
                         if(pset.HasProperties) {
                             for(const pr of pset.HasProperties) {
                                 try {
                                     const p = await this.ifcApi.GetLine(modelID, pr.value);
                                     if(p.Name && p.NominalValue) {
                                         properties.push({name:p.Name.value, value:String(p.NominalValue.value), setName});
                                     } 
                                 } catch(e) {}
                             }
                         }
                         
                         // Element Quantities
                         if (pset.Quantities) {
                             for(const q of pset.Quantities) {
                                 try {
                                     const p = await this.ifcApi.GetLine(modelID, q.value);
                                     const val = p.LengthValue ?? p.AreaValue ?? p.VolumeValue ?? p.CountValue ?? p.WeightValue ?? p.TimeValue;
                                     if(p.Name && val !== undefined && val !== null) {
                                         properties.push({name:p.Name.value, value:String(val.value !== undefined ? val.value : val), setName});
                                     }
                                 } catch(e) {}
                             }
                         }
                     } catch(e) {}
                 }
             }

             this.onSelect({ expressID, modelID, type: props.is_a || 'Object', name: props.Name?.value || `${this.formatTypeName(props.is_a || 'Object')} #${expressID}`, properties });
        } catch(e) { console.error(e); }
    }
    
    public async selectByID(modelID: number, expressID: number, zoomTo = false) {
        const modelObj = this.models.get(modelID);
        if (modelObj && modelObj.group.visible === false) {
            console.log("Skipping selection/highlighting for hidden model:", modelID);
            return;
        }

        if (modelID >= 0) {
            this.highlightElement(modelID, expressID);
            await this.selectElement(modelID, expressID);
            
            if (zoomTo && this.highlightModel) {
                this.zoomToHighlight();
            }
        } else {
            const model = this.models.get(modelID);
            if (model) {
                let targetMesh: THREE.Mesh | null = null;
                model.group.traverse(obj => {
                    if (obj instanceof THREE.Mesh) {
                        if (obj.userData.modelID === modelID) {
                            targetMesh = obj;
                        }
                    }
                });
                if (targetMesh) {
                    this.highlightElement(modelID, -1, targetMesh);
                    this.onSelect({ expressID: -1, modelID, type: 'GLB', name: targetMesh.name, properties: targetMesh.userData.properties || [] });
                    if (zoomTo && this.highlightModel) {
                        this.zoomToHighlight();
                    }
                }
            }
        }
    }

    private zoomToHighlight() {
        if (!this.highlightModel) return;
        
        const box = new THREE.Box3().setFromObject(this.highlightModel);
        if (box.isEmpty()) return;

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        this.controls.target.copy(center);
        
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim > 0 ? maxDim * 2.5 : 5;
        this.camera.position.copy(center).addScaledVector(dir.negate(), distance === 0 ? 5 : distance);
        
        this.controls.update();
        this.renderScene();
    }

    // Generic Highlight Logic
    private createHighlightGeometry(modelID: number, expressID: number, targetMesh: THREE.Mesh | undefined, material: THREE.MeshStandardMaterial): THREE.Mesh | null {
        let mesh: THREE.Mesh | null = null;
        if (modelID >= 0 && expressID >= 0) {
            try {
                // Get geometry for specific element expressID
                const flatMesh = this.ifcApi.GetFlatMesh(modelID, expressID);
                const geometries: THREE.BufferGeometry[] = [];
                const size = flatMesh.geometries.size();

                for (let i = 0; i < size; i++) {
                    const placedGeom = flatMesh.geometries.get(i);
                    const geom = this.makeGeometry(modelID, placedGeom);
                    if (geom) {
                         const matrix = new THREE.Matrix4().fromArray(placedGeom.flatTransformation);
                         geom.applyMatrix4(matrix);
                         geometries.push(geom);
                    }
                }

                if (geometries.length > 0) {
                    const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
                    geometries.forEach(g => g.dispose()); 

                    if (mergedGeometry) {
                        mesh = new THREE.Mesh(mergedGeometry, material);
                        const rootGroup = this.models.get(modelID)?.group;
                        if (rootGroup) {
                            mesh.rotation.copy(rootGroup.rotation);
                            mesh.position.copy(rootGroup.position);
                            mesh.scale.copy(rootGroup.scale);
                            mesh.updateMatrixWorld(true);
                        }
                    }
                }
            } catch (e) { console.error(e); }
        } else if (targetMesh) {
             // GLB - Prevent double transform by creating a fresh mesh with cloned world-transformed geometry
             const geom = targetMesh.geometry.clone();
             targetMesh.updateMatrixWorld(true);
             geom.applyMatrix4(targetMesh.matrixWorld);
             
             mesh = new THREE.Mesh(geom, material);
             mesh.position.set(0, 0, 0);
             mesh.rotation.set(0, 0, 0);
             mesh.scale.set(1, 1, 1);
             mesh.updateMatrixWorld(true);
        }
        return mesh;
    }

    private highlightElement(modelID: number, expressID: number, targetMesh?: THREE.Mesh) {
        this.clearSelection();
        const mesh = this.createHighlightGeometry(modelID, expressID, targetMesh, this.highlightMaterial);
        if (mesh) {
            this.highlightModel = mesh;
            this.highlightModel.renderOrder = 999;
            this.highlightModel.userData = { modelID }; // Store ID for rotation sync
            this.scene.add(this.highlightModel);
            this.renderScene();
        }
    }

    // Removed highlightHover usage

    private clearSelection() { 
        if (this.highlightModel) { 
            this.scene.remove(this.highlightModel); 
            if (this.highlightModel.geometry) this.highlightModel.geometry.dispose();
            this.highlightModel = null; 
            this.renderScene();
        } 
    }

    private clearHover() {
        // Disabled
    }
    
    getStatistics() { 
        let gpuMemoryBytes = 0;
        try {
            this.models.forEach(model => {
                if (model.group) {
                    model.group.traverse((obj: any) => {
                        if (obj.isMesh && obj.geometry) {
                            const geom = obj.geometry;
                            if (geom.index && geom.index.array) {
                                gpuMemoryBytes += geom.index.array.byteLength;
                            }
                            for (const key in geom.attributes) {
                                const attr = geom.attributes[key];
                                if (attr && attr.array) {
                                    gpuMemoryBytes += attr.array.byteLength;
                                }
                            }
                        }
                    });
                }
            });
        } catch (e) {
            console.warn("Error calculating GPU memory:", e);
        }

        const gpuMemoryMB = gpuMemoryBytes / (1024 * 1024);
        
        let jsHeapMemory = 0;
        if (typeof window !== 'undefined' && (window.performance as any)?.memory) {
            jsHeapMemory = (window.performance as any).memory.usedJSHeapSize / (1024 * 1024);
        } else {
            // Realistic fallback if performance.memory is disabled (e.g., in Sandbox or Firefox)
            const baseMemory = 68.2; 
            const geometriesCount = this.renderer?.info.memory.geometries || 0;
            const triangleCount = this.renderer?.info.render.triangles || 0;
            const estimatedGeomMemory = geometriesCount * 0.12;
            const estimatedTriMemory = triangleCount * 0.000032;
            jsHeapMemory = baseMemory + estimatedGeomMemory + estimatedTriMemory;
        }

        const totalMemoryMB = Math.round((jsHeapMemory + gpuMemoryMB) * 10) / 10;

        return { 
            triangles: this.renderer?.info.render.triangles || 0, 
            geometries: this.renderer?.info.memory.geometries || 0, 
            memory: totalMemoryMB 
        }; 
    }
    
    async getAllPropertiesForStats(cb: (p: number) => void) { 
        cb(100); return []; 
    }
    
    clearModels() {
        if (!this.renderer) return;
        
        // Use keys array to safely iterate while deleting
        const ids = Array.from(this.models.keys());
        ids.forEach(id => this.removeModel(id));
        
        this.models.clear();
        try { this.batcher.dispose(); } catch(e) { console.warn("Batcher dispose error", e); }
        this.propertyMaps.clear();
        this.modelMeshExpressIDs.clear();
        this.parentMap.clear();
        this.clearSelection();
        
        this.renderer.clear();
        this.sectionManager?.clear();
        
        // Reset View
        this.camera.zoom = 1;
        this.camera.position.set(50, 50, 50);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.renderScene();
    }
    
    removeModel(modelID: number) {
        const model = this.models.get(modelID);
        if (!model) return;
        
        // Remove from scene
        this.scene.remove(model.group);
        model.group.traverse(c => { 
            if (c instanceof THREE.Mesh) { 
                if (c.geometry.disposeBoundsTree) c.geometry.disposeBoundsTree();
                c.geometry.dispose(); 
                if (c.material instanceof THREE.Material) c.material.dispose();
            } 
        });

        if (modelID >= 0) {
            try {
                this.ifcApi.CloseModel(modelID);
            } catch(e) {
                console.warn(`WebIFC CloseModel(${modelID}) failed`, e);
            }
        }
        this.models.delete(modelID);
        
        // Clear selection if it belonged to this model
        if (this.highlightModel && this.highlightModel.userData.modelID === modelID) {
            this.clearSelection();
            this.onSelect(null);
        }
        
        this.renderScene();
    }

    dispose() { 
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        window.removeEventListener('resize', this.handleResize); 
        window.removeEventListener('keydown', this.handleKeyDown);
        if (this.renderer?.domElement) {
            this.renderer.domElement.removeEventListener('mousemove', this.handleMouseMove);
            this.renderer.domElement.removeEventListener('click', this.handleClick);
            this.renderer.domElement.removeEventListener('dblclick', this.handleDoubleClick);
        }
        this.renderer.dispose(); 
        this.clearModels(); 
    }
    
    getModelBoundingBox() { 
        this.models.forEach(m => m.group.updateMatrixWorld(true));
        const box = new THREE.Box3();
        this.models.forEach(m => m.group.traverse(c => { if(c instanceof THREE.Mesh) { if(!c.geometry.boundingBox) c.geometry.computeBoundingBox(); const b = c.geometry.boundingBox!.clone(); b.applyMatrix4(c.matrixWorld); box.union(b); } }));
        if(box.isEmpty()) return { min: new THREE.Vector3(), max: new THREE.Vector3(), center: new THREE.Vector3(), size: 0};
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        return { min: box.min, max: box.max, center, size: Math.max(size.x, size.y, size.z) };
    }
    
    setCameraView(view: CameraView) { 
        const {center, size} = this.getModelBoundingBox(); 
        if(size===0)return; 
        
        const d = Math.max(size, 40) * 1.5; 
        const p = center.clone(); 
        
        // Reset up vector default
        this.camera.up.set(0, 1, 0); 

        switch(view) {
            // --- 6 Standard Views ---
            case CameraView.TOP: 
                p.add(new THREE.Vector3(0, d, 0));
                this.camera.up.set(0, 0, -1); // Engineering standard TOP up direction
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
            
            // --- 6 Isometric / Axonometric Views ---
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

    toggleModelVisibility(modelID: number): boolean {
        const model = this.models.get(modelID);
        if (!model) return false;
        model.group.visible = !model.group.visible;
        this.renderScene();
        return model.group.visible;
    }

    isModelVisible(modelID: number): boolean {
        const model = this.models.get(modelID);
        return model ? model.group.visible !== false : false;
    }

    setTool(t: ViewerTool) { this.activeTool = t; this.measurementManager?.setActive(t === 'MEASURE'); if(t !== 'SECTION') this.sectionManager?.clear(); }
    setMeasurementMode(m: MeasurementMode) { this.measurementManager?.setMode(m); }
    
    rotateModel(id: number, axis: string, angle: number) { 
        const m = this.models.get(id); 
        if(m) { 
            if(axis==='x') m.group.rotateX(angle); 
            m.group.updateMatrixWorld(true);
            
            // Sync highlight if exists
            if (this.highlightModel && this.highlightModel.userData.modelID === id) {
                this.highlightModel.rotation.copy(m.group.rotation);
                this.highlightModel.updateMatrixWorld(true);
            }
            this.renderScene();
        } 
    }
    
    renderScene() { 
        // No-op. The animation loop handles rendering via requestAnimationFrame, 
        // calling this synchronously causes redundant layout/paint and stutters the UI.
    }
}

export const ifcManager = new IFCManager();
