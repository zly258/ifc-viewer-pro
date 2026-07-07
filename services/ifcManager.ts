
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { IFCElementData, ViewerTool, MeasurementMode, CameraView, IFCProperty, IFCSpatialStructure } from '../types';
import { MeasurementManager } from './MeasurementManager';
import { SectionManager } from './SectionManager';
import { IfcBatcher } from './IfcBatcher';
import { PostProcessingManager } from './PostProcessing';

// 启用 BVH 加速
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class IFCManager {
    private container: HTMLElement | null = null;
    public scene: THREE.Scene;
    public camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
    public orthoCamera: THREE.OrthographicCamera;
    public persCamera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private labelRenderer: CSS2DRenderer;
    private controls: OrbitControls;
    
    private worker: Worker | null = null;
    private modelIdCounter = 1;
    private savedStructures: Map<number, IFCSpatialStructure> = new Map();
    private currentLoadingFileName: string = "";
    private currentLoadingModelID: number = -1;
    private currentFitToFrame: boolean = true;
    private loadResolver: (() => void) | null = null;
    private propertyResolver: ((props: any) => void) | null = null;
    private highlightResolver: ((geoms: any[]) => void) | null = null;
    
    // Incremental loading: partial group accumulates batched meshes before LOAD_COMPLETE
    private partialGroups: Map<number, THREE.Group> = new Map();

    private gltfLoader: GLTFLoader;
    private batcher: IfcBatcher;
    
    private isInitialized: boolean = false;
    
    // Demand rendering — only render when scene changes
    private isDirty: boolean = true;
    private lastUserInteraction: number = 0;

    // 模型存储
    public models: Map<number, { group: THREE.Group, modelID: number, name: string }> = new Map();
    private propertyMaps: Map<number, Map<number, number[]>> = new Map();
    private modelMeshExpressIDs: Map<number, Set<number>> = new Map();
    public parentMap: Map<string, string> = new Map();
    
    public measurementManager: MeasurementManager | null = null;
    public sectionManager: SectionManager | null = null;
    public postProcessing: PostProcessingManager | null = null;
    
    public onSelect: (data: IFCElementData | null) => void = () => {};
    public onMultiSelect?: (items: Array<{ modelID: number; expressID: number }>) => void;
    public onLoading: (progress: number, total: number) => void = () => {};
    public onProcessing: (message: string | null) => void = () => {};
    public onError: (msg: string) => void = () => {};
    public ifcUpAxis: 'Y' | 'Z' = 'Z';
    public glbUpAxis: 'Y' | 'Z' = 'Y';
    public ambientLight!: THREE.AmbientLight;
    public dirLight!: THREE.DirectionalLight;
    public ambientIntensity: number = 0.7;
    public sunIntensity: number = 1.3;
    public shadowQuality: 'high' | 'low' | 'off' = 'off';

    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private activeTool: ViewerTool = ViewerTool.SELECT;
    private pointerDownPosition: { x: number; y: number } | null = null;

    private materialCache: Record<string, THREE.MeshStandardMaterial> = {};
    
    // Highlight - Selection
    private highlightModel: THREE.Mesh | null = null;
    private highlightMaterial = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.55,
        depthTest: false,
        side: THREE.DoubleSide,
        emissive: 0x60a5fa,
        emissiveIntensity: 0.5
    });
    
    // Hover highlight
    private hoverModel: THREE.Mesh | null = null;
    private hoverMaterial = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        transparent: true,
        opacity: 0.3,
        depthTest: false,
        side: THREE.DoubleSide,
        emissive: 0x94a3b8,
        emissiveIntensity: 0.25
    });
    private lastHoverID: number = -1;
    
    // Isolation — list of expressIDs to show, rest are dimmed
    private isolatedIDs: Set<number> | null = null;
    private isolationDimMaterial = new THREE.MeshStandardMaterial({
        color: 0xd1d5db,
        transparent: true,
        opacity: 0.08,
        depthTest: true,
        side: THREE.DoubleSide,
    });
    private originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();
    
    // Multi-selection
    private selectedElements: Array<{ modelID: number; expressID: number }> = [];
    private multiHighlightMeshes: THREE.Mesh[] = [];

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf8fafc); 

        // Lighting (Updated for Y-up)
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(this.ambientLight);

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
        this.orthoCamera = new THREE.OrthographicCamera(-fr, fr, fr, -fr, 0.1, 50000);
        this.orthoCamera.up.set(0, 1, 0); // SWITCHED TO Y-UP (Standard Three.js)
        
        this.persCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50000);
        this.persCamera.up.set(0, 1, 0);
        
        this.camera = this.orthoCamera;
        
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
        this.gltfLoader = new GLTFLoader();
        
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

        // Sync highlights if selection exists
        this.multiHighlightMeshes.forEach(mesh => {
            const hModelID = mesh.userData.modelID;
            if (hModelID !== undefined) {
                const model = this.models.get(hModelID);
                if (model) {
                    mesh.rotation.copy(model.group.rotation);
                    mesh.updateMatrixWorld(true);
                }
            }
        });
        
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

    public setAmbientIntensity(val: number) {
        this.ambientIntensity = val;
        if (this.ambientLight) this.ambientLight.intensity = val;
        this.renderScene();
    }

    public setSunIntensity(val: number) {
        this.sunIntensity = val;
        this.renderScene();
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
        
        this.dirLight.intensity = this.sunIntensity * intensityFactor;
        if (this.ambientLight) {
            this.ambientLight.intensity = this.ambientIntensity * (timeOfDay < 6 || timeOfDay > 18 ? 0.35 : 1.0);
        }

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
        
        if (this.isWalking) {
            this.updateWalkPosition();
            this.isDirty = true;
        } else {
            this.controls.update();
        }
        
        // Demand rendering: only render when dirty or recent interaction (within 200ms)
        const now = performance.now();
        const recentInteraction = (now - this.lastUserInteraction) < 200;
        
        if (this.isDirty || recentInteraction) {
            if (this.postProcessing) {
                this.postProcessing.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
            if (this.measurementManager) this.labelRenderer.render(this.scene, this.camera);
            this.isDirty = false;
        }
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
            this.postProcessing = new PostProcessingManager(this.renderer, this.scene, this.camera);

            window.addEventListener('resize', this.handleResize);
            window.addEventListener('keydown', this.handleKeyDown);
            this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown, true);
            this.renderer.domElement.addEventListener('mousemove', this.handleMouseMove);
            this.renderer.domElement.addEventListener('click', this.handleClick);
            this.renderer.domElement.addEventListener('dblclick', this.handleDoubleClick);
            this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);
            
            // Mark dirty on any user interaction with controls
            this.controls.addEventListener('change', () => {
                this.isDirty = true;
                this.lastUserInteraction = performance.now();
            });
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
                this.initWorker();
                this.isInitialized = true;
                console.log("IFCManager and Worker Initialized");
            } catch(e) {
                console.error("Worker Init Failed:", e);
                this.onError("Worker 初始化失败");
            }
            this.animate();
        }
    }

    private updateCameraFrustum() {
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

    private handleResize = () => {
        if (!this.container) return;
        this.updateCameraFrustum();
        
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.labelRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.postProcessing?.handleResize();
    };

    private handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            this.clearSelection();
            this.onSelect(null);
        }
    }

    private handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return; // Only track left click
        this.pointerDownPosition = { x: event.clientX, y: event.clientY };
        console.log("[IFCManager] pointerdown registered position:", this.pointerDownPosition);
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
        this.onLoading(0, 100);
        this.onProcessing("读取 GLB/GLTF 文件...");
        
        // Force layout canvas size adjustment to prevent 0x0 rendering bugs
        this.handleResize();
        
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
    private initWorker() {
        if (this.worker) return;
        
        // Load the worker via Vite module worker syntax
        this.worker = new Worker(new URL('./ifc.worker.ts', import.meta.url), { type: 'module' });
        
        this.worker.onmessage = (e: MessageEvent) => {
            const { type, data } = e.data;
            
            if (type === 'INIT_SUCCESS') {
                console.log("[Worker] WebIFC initialized in background thread");
            }
            else if (type === 'PROCESSING') {
                this.onProcessing(data || e.data.message);
            }
            else if (type === 'PROGRESS') {
                // Precise progress from worker geometry phase (82-95%)
                const prog = (data?.progress ?? e.data.progress) as number;
                const msg = (data?.message ?? e.data.message) as string;
                if (prog !== undefined) this.onLoading(prog, 100);
                if (msg) this.onProcessing(msg);
            }
            else if (type === 'ERROR') {
                console.error("[Worker Error]", data || e.data.message);
                this.onError(data || e.data.message);
                this.onProcessing(null);
                if (this.loadResolver) {
                    this.loadResolver();
                    this.loadResolver = null;
                }
            }
            else if (type === 'GEOMETRY_BATCH') {
                // Progressive incremental loading — add batch to batcher then do partial build
                const { modelID, geometries } = data;
                this.batcher.addFromWorkerBatch(geometries, this.getMaterial.bind(this));
                
                // Build partial mesh group and add/merge to partial scene group
                const partialMeshes = this.batcher.build();
                
                if (partialMeshes.length > 0) {
                    let rootGroup = this.partialGroups.get(modelID);
                    if (!rootGroup) {
                        rootGroup = new THREE.Group();
                        rootGroup.name = this.currentLoadingFileName || "Model";
                        rootGroup.userData.modelID = modelID;
                        if (this.ifcUpAxis === 'Z') rootGroup.rotateX(-Math.PI / 2);
                        rootGroup.updateMatrixWorld(true);
                        this.partialGroups.set(modelID, rootGroup);
                        this.scene.add(rootGroup);
                    }
                    
                    partialMeshes.forEach(mesh => {
                        mesh.userData.modelID = modelID;
                        mesh.userData.isBatch = true;
                        mesh.castShadow = (this.shadowQuality !== 'off');
                        mesh.receiveShadow = (this.shadowQuality !== 'off');
                        rootGroup!.add(mesh);
                    });
                    
                    this.isDirty = true;
                }
            }
            else if (type === 'GEOMETRY_STREAM') {
                // Legacy single-stream fallback (kept for compatibility)
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
            else if (type === 'LOAD_COMPLETE') {
                const { modelID, structure, parentMap } = data;
                
                // Flush any remaining data in batcher
                const remainingMeshes = this.batcher.build();
                
                // Get or create the group (may already exist from incremental batches)
                let rootGroup = this.partialGroups.get(modelID);
                if (!rootGroup) {
                    rootGroup = new THREE.Group();
                    rootGroup.name = this.currentLoadingFileName || "Model";
                    rootGroup.userData.modelID = modelID;
                    if (this.ifcUpAxis === 'Z') rootGroup.rotateX(-Math.PI / 2);
                    rootGroup.updateMatrixWorld(true);
                    this.scene.add(rootGroup);
                } else {
                    rootGroup.name = this.currentLoadingFileName || rootGroup.name;
                }
                this.partialGroups.delete(modelID);
                
                // Append any remaining meshes
                remainingMeshes.forEach(mesh => {
                    mesh.userData.modelID = modelID;
                    mesh.userData.isBatch = true;
                    mesh.castShadow = (this.shadowQuality !== 'off');
                    mesh.receiveShadow = (this.shadowQuality !== 'off');
                    rootGroup!.add(mesh);
                });
                
                rootGroup.updateMatrixWorld(true);
                this.models.set(modelID, { group: rootGroup, modelID, name: rootGroup.name });
                
                // Merge parentMap entries
                Object.entries(parentMap).forEach(([k, v]) => {
                    this.parentMap.set(k, v as string);
                });
                
                this.savedStructures.set(modelID, structure);
                
                // Force size synchronization
                this.handleResize();
                
                if (this.currentFitToFrame) this.fitModelToFrame();
                this.onLoading(100, 100);
                this.onProcessing(null);
                this.isDirty = true;
                
                if (this.loadResolver) {
                    this.loadResolver();
                    this.loadResolver = null;
                }
            }
            else if (type === 'PROPERTIES_RESULT') {
                if (this.propertyResolver) {
                    this.propertyResolver(data);
                    this.propertyResolver = null;
                }
            }
            else if (type === 'HIGHLIGHT_GEOMETRY_RESULT') {
                const { geometries } = data;
                if (this.highlightResolver) {
                    this.highlightResolver(geometries);
                    this.highlightResolver = null;
                }
            }
        };
        
        this.worker.postMessage({ type: 'INIT' });
    }

    loadIfc = async (file: File, fitToFrame = true) => {
        if (!this.worker) {
            this.initWorker();
        }
        
        // Force layout canvas size adjustment to prevent 0x0 rendering bugs
        this.handleResize();
        
        this.onProcessing("读取 IFC 文件...");
        this.onLoading(0, 100);
        
        this.currentLoadingFileName = file.name;
        this.currentFitToFrame = fitToFrame;
        
        const reader = new FileReader();
        return new Promise<void>((resolve, reject) => {
            reader.onload = async (e) => {
                const buffer = e.target?.result as ArrayBuffer;
                if (!buffer) {
                    reject(new Error("File read returned empty buffer"));
                    return;
                }
                
                this.loadResolver = resolve;
                this.worker!.postMessage({
                    type: 'LOAD_IFC_MODEL',
                    data: {
                        fileBuffer: buffer,
                        modelID: this.modelIdCounter++
                    }
                }, [buffer]); // transfer the array buffer to avoid copying
            };
            reader.onerror = (err) => {
                reject(err);
                this.onProcessing(null);
            };
            reader.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 80; // Reader progress up to 80%
                    this.onLoading(percent, 100);
                }
            };
            reader.readAsArrayBuffer(file);
        });
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
        
        if (this.camera instanceof THREE.OrthographicCamera) {
            const frustumHeight = (this.camera.top - this.camera.bottom);
            const frustumWidth = (this.camera.right - this.camera.left);
            
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

        // Update shadow camera bounds when the model is reframed
        this.updateShadowCameraFrustum();
    }

    async getFullSpatialStructure() {
        const structures: { fileName: string; modelID: number; structure: IFCSpatialStructure }[] = [];
        for (const [modelID, model] of this.models) {
            if (modelID >= 0) {
                const structure = this.savedStructures.get(modelID);
                if (structure) {
                    structures.push({ fileName: model.name, modelID: modelID, structure: structure });
                }
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



    private formatTypeName(type: string): string {
        if (type.startsWith('Ifc')) {
            return type.substring(3);
        }
        return type;
    }



    // --- Interaction ---
    
    // Perform Raycast
    private castRay(event: MouseEvent): { modelID: number, expressID: number, mesh: THREE.Mesh } | null {
        const domElement = this.renderer.domElement;
        if (!this.container || !domElement) return null;
        const rect = domElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Re-enable firstHitOnly for three-mesh-bvh performance (CRITICAL FOR UI NOT TO LAG)
        this.raycaster.firstHitOnly = true; 
        
        const meshes: THREE.Mesh[] = [];
        this.models.forEach(m => {
            if (m.group.visible !== false) {
                m.group.traverse(c => { if(c instanceof THREE.Mesh && c.visible && !this.multiHighlightMeshes.includes(c)) meshes.push(c) });
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
                if (id !== null) expressID = id;
            } else if (mesh.userData.expressID !== undefined) {
                expressID = mesh.userData.expressID;
            }

            return { modelID, expressID, mesh };
        }
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

        // Hover highlight for SELECT tool
        if (this.activeTool === ViewerTool.SELECT || this.activeTool === ViewerTool.NONE) {
            this.container!.style.cursor = 'default';
            const hit = this.castRay(event);
            if (hit && hit.expressID !== -1) {
                if (hit.expressID !== this.lastHoverID) {
                    this.clearHover();
                    this.lastHoverID = hit.expressID;
                    // Build hover overlay async
                    if (this.worker && hit.modelID >= 0) {
                        this.worker.postMessage({
                            type: 'GET_HIGHLIGHT_GEOMETRY',
                            data: { modelID: hit.modelID, expressID: hit.expressID }
                        });
                        // Use a one-shot resolver for hover
                        const prevResolver = this.highlightResolver;
                        this.highlightResolver = (geometries: any[]) => {
                            // Restore previous resolver if there was one (selection)
                            if (prevResolver) prevResolver(geometries);
                            else this.buildHoverMesh(geometries, hit.modelID);
                        };
                    }
                    this.container!.style.cursor = 'pointer';
                }
            } else {
                this.clearHover();
                this.lastHoverID = -1;
            }
        }
    }

    private buildHoverMesh(geometries: any[], modelID: number) {
        this.clearHover();
        if (geometries.length === 0) return;
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
        const merged = BufferGeometryUtils.mergeGeometries(threeGeometries);
        threeGeometries.forEach(g => g.dispose());
        if (!merged) return;
        const mesh = new THREE.Mesh(merged, this.hoverMaterial);
        const rootGroup = this.models.get(modelID)?.group;
        if (rootGroup) {
            mesh.rotation.copy(rootGroup.rotation);
            mesh.position.copy(rootGroup.position);
            mesh.scale.copy(rootGroup.scale);
        }
        mesh.renderOrder = 998;
        mesh.userData = { modelID, isHover: true };
        this.hoverModel = mesh;
        this.scene.add(mesh);
        this.isDirty = true;
    }

    private hasClickMoved(event: MouseEvent, threshold = 10): boolean {
        if (!this.pointerDownPosition) {
            console.log("[IFCManager] hasClickMoved: pointerDownPosition is null, returning false");
            return false;
        }
        const dx = event.clientX - this.pointerDownPosition.x;
        const dy = event.clientY - this.pointerDownPosition.y;
        const dist = Math.hypot(dx, dy);
        console.log("[IFCManager] hasClickMoved check:", { dx, dy, dist, threshold });
        return dist > threshold;
    }

    private async selectFromPointer(event: MouseEvent, shiftKey = false) {
        const hit = this.castRay(event);

        if (hit) {
            const { modelID, expressID, mesh } = hit;
            if (expressID !== -1 && modelID !== undefined) {
                this.clearHover();
                this.lastHoverID = -1;
                await this.highlightElement(modelID, expressID, mesh, shiftKey);
                await this.selectElement(modelID, expressID, shiftKey);
            } else if (mesh.userData.isGLB) {
                this.highlightElement(modelID, -1, mesh);
                this.onSelect({ expressID: -1, modelID, type: 'GLB', name: mesh.name, properties: mesh.userData.properties || [] });
            }
        } else {
            this.clearSelection();
            this.onSelect(null);
        }
    }

    // Context menu handler (right-click)
    private handleContextMenu = (event: MouseEvent) => {
        if (!this.container) return;
        event.preventDefault();
        event.stopPropagation();
        
        const hit = this.castRay(event);
        const rect = this.renderer.domElement.getBoundingClientRect();
        
        window.dispatchEvent(new CustomEvent('viewer-contextmenu', {
            detail: {
                x: event.clientX,
                y: event.clientY,
                hit: hit ? { modelID: hit.modelID, expressID: hit.expressID } : null
            }
        }));
    }

    // Click handler
    private handleClick = async (event: MouseEvent) => {
        if (!this.container) return;
        
        if (this.activeTool === ViewerTool.MEASURE) {
             const m: THREE.Object3D[] = []; 
             this.models.forEach(mod => {
                 if (mod.group.visible !== false) {
                     mod.group.traverse(c => { if(c instanceof THREE.Mesh) m.push(c) });
                 }
             }); 
             this.measurementManager?.onClick(event, m);
             return;
        }

        if (this.activeTool === ViewerTool.SELECT || this.activeTool === ViewerTool.NONE) {
            const hasMoved = this.hasClickMoved(event);
            if (hasMoved) return;
            event.preventDefault();
            event.stopPropagation();
            await this.selectFromPointer(event, event.shiftKey);
        }
    }

    // Double click: zoom to selection
    private handleDoubleClick = async (event: MouseEvent) => {
        if (!this.container) return;

        if (this.activeTool === ViewerTool.MEASURE || this.activeTool === ViewerTool.SECTION || this.activeTool === ViewerTool.WALK) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const hit = this.castRay(event);
        if (hit && hit.expressID !== -1) {
            await this.highlightElement(hit.modelID, hit.expressID, hit.mesh);
            await this.selectElement(hit.modelID, hit.expressID);
            if (this.highlightModel) this.zoomToHighlight();
        }
    }

    private async selectElement(modelID: number, expressID: number, addToSelection = false) {
        if (!this.worker) return;
        
        const isStillSelected = this.selectedElements.some(e => e.modelID === modelID && e.expressID === expressID);
        if (addToSelection && !isStillSelected) {
            if (this.selectedElements.length > 0) {
                const last = this.selectedElements[this.selectedElements.length - 1];
                return this.selectElement(last.modelID, last.expressID, false);
            } else {
                this.onSelect(null);
                if (this.onMultiSelect) this.onMultiSelect([]);
                return;
            }
        }

        return new Promise<void>((resolve) => {
            this.propertyResolver = (propertiesData: any) => {
                const elementData = propertiesData.data;
                if (this.onMultiSelect) {
                    this.onMultiSelect(this.selectedElements);
                }
                this.onSelect(elementData);
                resolve();
            };
            this.worker!.postMessage({
                type: 'GET_PROPERTIES',
                data: { modelID, expressID }
            });
        });
    }
    
    public async selectByID(modelID: number, expressID: number, zoomTo = false) {
        const modelObj = this.models.get(modelID);
        if (modelObj && modelObj.group.visible === false) {
            console.log("Skipping selection/highlighting for hidden model:", modelID);
            return;
        }

        if (modelID >= 0) {
            await this.highlightElement(modelID, expressID);
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
        if (this.multiHighlightMeshes.length === 0) {
            if (!this.highlightModel) return;
            const box = new THREE.Box3().setFromObject(this.highlightModel);
            this.zoomToBox(box);
            return;
        }
        
        const box = new THREE.Box3();
        this.multiHighlightMeshes.forEach(mesh => {
            box.expandByObject(mesh);
        });
        this.zoomToBox(box);
    }

    private zoomToBox(box: THREE.Box3) {
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
    private async highlightElement(modelID: number, expressID: number, targetMesh?: THREE.Mesh, addToSelection = false) {
        if (!addToSelection) {
            this.clearSelection();
        } else {
            // Toggle behavior: check if element is already highlighted
            const index = this.selectedElements.findIndex(e => e.modelID === modelID && e.expressID === expressID);
            if (index !== -1) {
                // Deselect
                this.selectedElements.splice(index, 1);
                const meshIndex = this.multiHighlightMeshes.findIndex(m => m.userData.modelID === modelID && m.userData.expressID === expressID);
                if (meshIndex !== -1) {
                    const m = this.multiHighlightMeshes[meshIndex];
                    this.scene.remove(m);
                    if (m.geometry) m.geometry.dispose();
                    this.multiHighlightMeshes.splice(meshIndex, 1);
                }
                
                // Fallback highlightModel to the last mesh in list
                if (this.multiHighlightMeshes.length > 0) {
                    this.highlightModel = this.multiHighlightMeshes[this.multiHighlightMeshes.length - 1];
                } else {
                    this.highlightModel = null;
                }
                
                this.postProcessing?.setSelection(this.multiHighlightMeshes);
                this.isDirty = true;
                return;
            }
        }
        
        if (modelID >= 0 && expressID >= 0) {
            if (!this.worker) return;
            
            return new Promise<void>((resolve) => {
                this.highlightResolver = (geometries: any[]) => {
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
                    
                    if (threeGeometries.length > 0) {
                        const mergedGeometry = BufferGeometryUtils.mergeGeometries(threeGeometries);
                        threeGeometries.forEach(g => g.dispose());
                        
                        if (mergedGeometry) {
                            const mesh = new THREE.Mesh(mergedGeometry, this.highlightMaterial);
                            const rootGroup = this.models.get(modelID)?.group;
                            if (rootGroup) {
                                mesh.rotation.copy(rootGroup.rotation);
                                mesh.position.copy(rootGroup.position);
                                mesh.scale.copy(rootGroup.scale);
                                mesh.updateMatrixWorld(true);
                            }
                            
                            mesh.renderOrder = 999;
                            mesh.userData = { modelID, expressID };
                            this.scene.add(mesh);
                            
                            this.highlightModel = mesh;
                            this.multiHighlightMeshes.push(mesh);
                            if (!addToSelection) {
                                this.selectedElements = [{ modelID, expressID }];
                            } else {
                                this.selectedElements.push({ modelID, expressID });
                            }
                            this.postProcessing?.setSelection(this.multiHighlightMeshes);
                            this.isDirty = true;
                        }
                    }
                    resolve();
                };
                
                this.worker!.postMessage({
                    type: 'GET_HIGHLIGHT_GEOMETRY',
                    data: { modelID, expressID }
                });
            });
        } else if (targetMesh) {
             const geom = targetMesh.geometry.clone();
             targetMesh.updateMatrixWorld(true);
             geom.applyMatrix4(targetMesh.matrixWorld);
             
             const mesh = new THREE.Mesh(geom, this.highlightMaterial);
             mesh.position.set(0, 0, 0);
             mesh.rotation.set(0, 0, 0);
             mesh.scale.set(1, 1, 1);
             mesh.updateMatrixWorld(true);
             mesh.renderOrder = 999;
             mesh.userData = { modelID, expressID };
             this.scene.add(mesh);
             
             this.highlightModel = mesh;
             this.multiHighlightMeshes.push(mesh);
             if (!addToSelection) {
                 this.selectedElements = [{ modelID, expressID }];
             } else {
                 this.selectedElements.push({ modelID, expressID });
             }
             this.postProcessing?.setSelection(this.multiHighlightMeshes);
             this.isDirty = true;
        }
    }

    // Removed highlightHover usage

    public clearSelection() { 
        this.multiHighlightMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        });
        this.multiHighlightMeshes = [];
        this.selectedElements = [];
        
        if (this.highlightModel) { 
            this.scene.remove(this.highlightModel); 
            if (this.highlightModel.geometry) this.highlightModel.geometry.dispose();
            this.highlightModel = null; 
        } 
        this.postProcessing?.setSelection([]);
        this.isDirty = true;
    }

    private clearHover() {
        if (this.hoverModel) {
            this.scene.remove(this.hoverModel);
            if (this.hoverModel.geometry) this.hoverModel.geometry.dispose();
            this.hoverModel = null;
            this.isDirty = true;
        }
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

        if (modelID >= 0 && this.worker) {
            try {
                this.worker.postMessage({ type: 'CLEAR_MODEL', data: { modelID } });
            } catch(e) {
                console.warn(`WebIFC CloseModel(${modelID}) via worker failed`, e);
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
            this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown, true);
            this.renderer.domElement.removeEventListener('mousemove', this.handleMouseMove);
            this.renderer.domElement.removeEventListener('click', this.handleClick);
            this.renderer.domElement.removeEventListener('dblclick', this.handleDoubleClick);
        }
        if (this.renderer?.domElement?.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        if (this.labelRenderer?.domElement?.parentNode) {
            this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
        }
        this.isInitialized = false;
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

    private isWalking = false;
    private walkKeys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
    private mouseDragging = false;
    private prevMousePos = { x: 0, y: 0 };
    private walkSpeed = 0.8; // units per frame/step
    private lookSpeed = 0.003; // rad per pixel drag
    
    // Euler rotation angles for perspective walkthrough camera
    private cameraYaw = 0;
    private cameraPitch = 0;
    
    // Mobile Touch Navigation
    private touchStartPos = { x: 0, y: 0 };
    private touchStartDist = 0;
    private isPinching = false;

    setTool(t: ViewerTool) { 
        this.activeTool = t; 
        this.measurementManager?.setActive(t === 'MEASURE'); 
        if(t !== 'SECTION') this.sectionManager?.clear(); 
        
        if (t === ViewerTool.WALK) {
            this.activateWalkthroughMode();
        } else {
            this.deactivateWalkthroughMode();
        }
    }

    private activateWalkthroughMode() {
        if (this.isWalking) return;
        
        console.log("[IFCManager] Activating Walkthrough Mode");
        this.isWalking = true;
        
        // 1. Switch active camera to PerspectiveCamera
        this.camera = this.persCamera;
        this.controls.object = this.persCamera;
        this.postProcessing?.setCamera(this.persCamera);
        
        // 2. Position the PerspectiveCamera nicely relative to the scene center
        const { center, size } = this.getModelBoundingBox();
        if (size > 0) {
            this.persCamera.position.copy(center).add(new THREE.Vector3(0, size * 0.3, size * 0.6));
            this.persCamera.lookAt(center);
            
            // Set initial yaw/pitch from direction
            const dir = new THREE.Vector3();
            this.persCamera.getWorldDirection(dir);
            this.cameraYaw = Math.atan2(-dir.x, -dir.z);
            this.cameraPitch = Math.asin(dir.y);
        } else {
            this.persCamera.position.set(0, 1.6, 15);
            this.cameraYaw = 0;
            this.cameraPitch = 0;
        }
        
        this.persCamera.updateProjectionMatrix();
        this.updateCameraRotation();
        
        // 3. Disable OrbitControls
        this.controls.enabled = false;
        
        // 4. Attach event listeners
        window.addEventListener('keydown', this.handleWalkKeyDown);
        window.addEventListener('keyup', this.handleWalkKeyUp);
        
        if (this.container) {
            this.container.addEventListener('mousedown', this.handleWalkMouseDown);
            this.container.addEventListener('mousemove', this.handleWalkMouseMove);
            window.addEventListener('mouseup', this.handleWalkMouseUp);
            
            // Mobile touch events
            this.container.addEventListener('touchstart', this.handleWalkTouchStart, { passive: false });
            this.container.addEventListener('touchmove', this.handleWalkTouchMove, { passive: false });
            this.container.addEventListener('touchend', this.handleWalkTouchEnd);
        }
    }

    private deactivateWalkthroughMode() {
        if (!this.isWalking) return;
        
        console.log("[IFCManager] Deactivating Walkthrough Mode");
        this.isWalking = false;
        
        // 1. Reset keys
        this.walkKeys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
        this.mouseDragging = false;
        this.isPinching = false;
        
        // 2. Switch back to OrthographicCamera
        this.camera = this.orthoCamera;
        this.controls.object = this.orthoCamera;
        this.postProcessing?.setCamera(this.orthoCamera);
        this.controls.enabled = true;
        this.controls.update();
        
        // 3. Remove event listeners
        window.removeEventListener('keydown', this.handleWalkKeyDown);
        window.removeEventListener('keyup', this.handleWalkKeyUp);
        
        if (this.container) {
            this.container.removeEventListener('mousedown', this.handleWalkMouseDown);
            this.container.removeEventListener('mousemove', this.handleWalkMouseMove);
            window.removeEventListener('mouseup', this.handleWalkMouseUp);
            
            this.container.removeEventListener('touchstart', this.handleWalkTouchStart);
            this.container.removeEventListener('touchmove', this.handleWalkTouchMove);
            this.container.removeEventListener('touchend', this.handleWalkTouchEnd);
        }
        
        this.renderScene();
    }

    private handleWalkKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if (key === 'w' || key === 'arrowup') this.walkKeys.w = true;
        if (key === 'a' || key === 'arrowleft') this.walkKeys.a = true;
        if (key === 's' || key === 'arrowdown') this.walkKeys.s = true;
        if (key === 'd' || key === 'arrowright') this.walkKeys.d = true;
        if (key === 'q') this.walkKeys.q = true; // Fly up
        if (key === 'e') this.walkKeys.e = true; // Fly down
        if (e.shiftKey) this.walkKeys.shift = true;
    }

    private handleWalkKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if (key === 'w' || key === 'arrowup') this.walkKeys.w = false;
        if (key === 'a' || key === 'arrowleft') this.walkKeys.a = false;
        if (key === 's' || key === 'arrowdown') this.walkKeys.s = false;
        if (key === 'd' || key === 'arrowright') this.walkKeys.d = false;
        if (key === 'q') this.walkKeys.q = false;
        if (key === 'e') this.walkKeys.e = false;
        if (!e.shiftKey) this.walkKeys.shift = false;
    }

    private handleWalkMouseDown = (e: MouseEvent) => {
        this.mouseDragging = true;
        this.prevMousePos = { x: e.clientX, y: e.clientY };
    }

    private handleWalkMouseMove = (e: MouseEvent) => {
        if (!this.mouseDragging) return;
        
        const deltaX = e.clientX - this.prevMousePos.x;
        const deltaY = e.clientY - this.prevMousePos.y;
        this.prevMousePos = { x: e.clientX, y: e.clientY };
        
        this.cameraYaw -= deltaX * this.lookSpeed;
        this.cameraPitch -= deltaY * this.lookSpeed;
        
        // Constrain pitch between -85 and +85 degrees
        const limit = Math.PI / 2 - 0.05;
        this.cameraPitch = Math.max(-limit, Math.min(limit, this.cameraPitch));
        
        this.updateCameraRotation();
    }

    private handleWalkMouseUp = () => {
        this.mouseDragging = false;
    }

    private updateCameraRotation() {
        const target = new THREE.Vector3(
            -Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch),
            Math.sin(this.cameraPitch),
            -Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch)
        );
        this.persCamera.lookAt(this.persCamera.position.clone().add(target));
    }

    private handleWalkTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 1) {
            this.mouseDragging = true;
            this.prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            this.isPinching = false;
        } else if (e.touches.length === 2) {
            this.mouseDragging = false;
            this.isPinching = true;
            this.touchStartPos = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2
            };
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this.touchStartDist = Math.sqrt(dx*dx + dy*dy);
        }
    }

    private handleWalkTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 1 && this.mouseDragging) {
            const touch = e.touches[0];
            const deltaX = touch.clientX - this.prevMousePos.x;
            const deltaY = touch.clientY - this.prevMousePos.y;
            this.prevMousePos = { x: touch.clientX, y: touch.clientY };
            
            this.cameraYaw -= deltaX * this.lookSpeed * 1.5; 
            this.cameraPitch -= deltaY * this.lookSpeed * 1.5;
            
            const limit = Math.PI / 2 - 0.05;
            this.cameraPitch = Math.max(-limit, Math.min(limit, this.cameraPitch));
            this.updateCameraRotation();
        } else if (e.touches.length === 2 && this.isPinching) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            const currentPos = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2
            };
            
            const distDelta = dist - this.touchStartDist;
            this.touchStartDist = dist;
            
            const forward = distDelta * 0.2; 
            
            const moveVec = new THREE.Vector3();
            this.persCamera.getWorldDirection(moveVec);
            moveVec.y = 0; 
            moveVec.normalize();
            moveVec.multiplyScalar(forward);
            
            // Lateral pan based on touch center movement
            const sideDeltaX = currentPos.x - this.touchStartPos.x;
            const right = new THREE.Vector3();
            right.crossVectors(moveVec, this.persCamera.up).normalize();
            moveVec.addScaledVector(right, -sideDeltaX * 0.1);
            
            this.persCamera.position.add(moveVec);
            this.touchStartPos = currentPos;
        }
    }

    private handleWalkTouchEnd = () => {
        this.mouseDragging = false;
        this.isPinching = false;
    }

    private updateWalkPosition() {
        if (!this.isWalking) return;
        
        const speed = this.walkSpeed * (this.walkKeys.shift ? 2.5 : 1.0);
        const forward = new THREE.Vector3();
        this.persCamera.getWorldDirection(forward);
        
        forward.y = 0; 
        forward.normalize();
        
        const right = new THREE.Vector3();
        right.crossVectors(forward, this.persCamera.up).normalize();
        
        const moveVec = new THREE.Vector3(0, 0, 0);
        if (this.walkKeys.w) moveVec.addScaledVector(forward, speed);
        if (this.walkKeys.s) moveVec.addScaledVector(forward, -speed);
        if (this.walkKeys.a) moveVec.addScaledVector(right, -speed);
        if (this.walkKeys.d) moveVec.addScaledVector(right, speed);
        if (this.walkKeys.q) moveVec.y += speed; 
        if (this.walkKeys.e) moveVec.y -= speed; 
        
        if (moveVec.lengthSq() === 0) return;
        
        const collisionFreePos = this.checkCollision(this.persCamera.position, moveVec);
        this.persCamera.position.copy(collisionFreePos);
        
        this.snapToFloor();
    }

    private checkCollision(currentPos: THREE.Vector3, moveVec: THREE.Vector3): THREE.Vector3 {
        const bodyRadius = 1.0; 
        const moveDir = moveVec.clone().normalize();
        const moveDist = moveVec.length();
        
        const meshes: THREE.Mesh[] = [];
        this.models.forEach(m => {
            if (m.group.visible !== false) {
                m.group.traverse(c => { if(c instanceof THREE.Mesh && c.visible && !this.multiHighlightMeshes.includes(c)) meshes.push(c) });
            }
        });
        
        if (meshes.length === 0) {
            return currentPos.clone().add(moveVec);
        }
        
        const collisionRaycaster = new THREE.Raycaster();
        const rayStart = currentPos.clone();
        
        collisionRaycaster.set(rayStart, moveDir);
        const intersects = collisionRaycaster.intersectObjects(meshes, false);
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            const obstacleDistance = hit.distance;
            
            if (obstacleDistance < (bodyRadius + moveDist)) {
                const wallNormal = hit.face?.normal.clone();
                if (wallNormal) {
                    wallNormal.transformDirection(hit.object.matrixWorld);
                    
                    const dot = moveVec.dot(wallNormal);
                    const slideVec = moveVec.clone().addScaledVector(wallNormal, -dot);
                    
                    if (slideVec.lengthSq() > 0.001) {
                        const slideDir = slideVec.clone().normalize();
                        const slideDist = slideVec.length();
                        collisionRaycaster.set(rayStart, slideDir);
                        const slideIntersects = collisionRaycaster.intersectObjects(meshes, false);
                        
                        if (slideIntersects.length > 0 && slideIntersects[0].distance < (bodyRadius + slideDist)) {
                            return currentPos;
                        }
                        return currentPos.clone().add(slideVec);
                    }
                }
                return currentPos; 
            }
        }
        
        return currentPos.clone().add(moveVec);
    }

    private snapToFloor() {
        const eyeHeight = 1.6; 
        const maxStepHeight = 0.5; 
        
        const meshes: THREE.Mesh[] = [];
        this.models.forEach(m => {
            if (m.group.visible !== false) {
                m.group.traverse(c => { if(c instanceof THREE.Mesh && c.visible && !this.multiHighlightMeshes.includes(c)) meshes.push(c) });
            }
        });
        if (meshes.length === 0) return;
        
        const floorRaycaster = new THREE.Vector3(0, -1, 0);
        const raycasterObj = new THREE.Raycaster();
        const rayStart = this.persCamera.position.clone();
        rayStart.y += maxStepHeight;
        
        raycasterObj.set(rayStart, floorRaycaster);
        const intersects = raycasterObj.intersectObjects(meshes, false);
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            const floorHeight = hit.point.y;
            const targetY = floorHeight + eyeHeight;
            
            const yDiff = Math.abs(this.persCamera.position.y - targetY);
            if (yDiff < (eyeHeight + maxStepHeight + 2.0)) {
                this.persCamera.position.y = THREE.MathUtils.lerp(this.persCamera.position.y, targetY, 0.2);
            }
        }
    }

    setMeasurementMode(m: MeasurementMode) { this.measurementManager?.setMode(m); }
    
    rotateModel(id: number, axis: string, angle: number) { 
        const m = this.models.get(id); 
        if(m) { 
            if(axis==='x') m.group.rotateX(angle); 
            m.group.updateMatrixWorld(true);
            
            // Sync highlight if exists
            this.multiHighlightMeshes.forEach(mesh => {
                if (mesh.userData.modelID === id) {
                    mesh.rotation.copy(m.group.rotation);
                    mesh.updateMatrixWorld(true);
                }
            });
            this.renderScene();
        } 
    }
    
    renderScene() { 
        // Mark dirty so the animate loop renders on next frame (demand rendering)
        this.isDirty = true;
    }
    
    /**
     * Capture the current viewport as a PNG and trigger download.
     */
    captureScreenshot(filename = 'bimvision-screenshot.png') {
        // Force a synchronous render for capture
        this.renderer.render(this.scene, this.camera);
        const dataURL = this.renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    /**
     * Isolate one element — all others are dimmed/hidden.
     */
    async isolateElement(modelID: number, expressID: number) {
        // First unisolate any previous isolation
        this.unisolateAll();
        
        if (modelID < 0) return; // GLB models not supported for isolation yet
        
        this.isolatedIDs = new Set([expressID]);
        
        // Dim all IFC meshes that don't match
        this.models.forEach((m, mID) => {
            if (mID < 0) return; // skip GLB
            m.group.traverse(obj => {
                if (!(obj instanceof THREE.Mesh)) return;
                if (obj.userData.isHover || obj === this.highlightModel || obj === this.hoverModel) return;
                
                // Try to determine this mesh's expressID
                // For batch meshes we dim the whole thing; in future could do per-element
                if (obj.userData.isBatch) {
                    if (!this.originalMaterials.has(obj)) {
                        this.originalMaterials.set(obj, obj.material);
                    }
                    obj.material = this.isolationDimMaterial;
                }
            });
        });
        
        // Highlight the isolated element
        await this.highlightElement(modelID, expressID);
        this.isDirty = true;
    }
    
    /**
     * Remove isolation and restore all materials.
     */
    unisolateAll() {
        this.isolatedIDs = null;
        this.originalMaterials.forEach((mat, mesh) => {
            if (mesh.parent) mesh.material = mat;
        });
        this.originalMaterials.clear();
        this.isDirty = true;
    }
    
    /**
     * Check whether isolation is currently active.
     */
    get isIsolated() { return this.isolatedIDs !== null; }
}

export const ifcManager = new IFCManager();
