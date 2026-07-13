
import * as THREE from 'three';
import { MeasurementMode, MeasurementResult } from '../types';

interface MeasureItem {
    id: string;
    objects: THREE.Object3D[]; // Markers, Lines, Meshes
    labels: THREE.Sprite[];
    data: MeasurementResult;
    center?: THREE.Vector3;
}

export class MeasurementManager {
    private scene: THREE.Scene;
    private camera: THREE.Camera;
    private raycaster: THREE.Raycaster;
    private container: HTMLElement;
    
    private active: boolean = false;
    private mode: MeasurementMode = 'DISTANCE';

    // State for interactive drawing
    private points: THREE.Vector3[] = [];
    private measurements: MeasureItem[] = []; // Store completed measurements
    
    // Interactive cursor tip
    private tipElement: HTMLDivElement | null = null;
    
    // Callbacks
    public onMeasurementsChange?: (results: MeasurementResult[]) => void;

    // Materials
    private markerMaterial = new THREE.MeshBasicMaterial({ color: 0x3b82f6, depthTest: false, transparent: true, opacity: 0.9 });
    private lineMaterial = new THREE.LineBasicMaterial({ color: 0x3b82f6, depthTest: false, linewidth: 2 });
    private fillMaterial = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide, transparent: true, opacity: 0.2, depthTest: false });

    // Temp objects for current interaction
    private tempPreview: THREE.Object3D | null = null;
    private tempMarkers: THREE.Object3D[] = [];
    private snapMarker: THREE.Sprite;

    constructor(scene: THREE.Scene, camera: THREE.Camera, container: HTMLElement) {
        this.scene = scene;
        this.camera = camera;
        this.container = container;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.firstHitOnly = true;

        // Create snap marker as Canvas-based Sprite (much smaller than Three.js geometry)
        this.snapMarker = this.createSnapMarkerSprite();
        this.snapMarker.renderOrder = 1000;
        this.snapMarker.visible = false;
        this.scene.add(this.snapMarker);

        this.initCursorLabel();
    }

    private createSnapMarkerSprite(): THREE.Sprite {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        
        const pad = 4;
        const rectSize = size - pad * 2;
        
        // Clear
        ctx.clearRect(0, 0, size, size);
        
        // Fill rectangle (solid block like CAD snap marker)
        ctx.fillStyle = '#10b981';
        ctx.fillRect(pad, pad, rectSize, rectSize);
        
        // White border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(pad, pad, rectSize, rectSize);
        
        // Small white cross in center
        const cx = size / 2;
        const cy = size / 2;
        const cross = 4;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - cross, cy - 1, cross * 2 + 1, 3);
        ctx.fillRect(cx - 1, cy - cross, 3, cross * 2 + 1);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        const material = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            blending: THREE.NormalBlending,
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1, 1, 1);
        
        // Fixed screen-pixel size: always appear as 12px regardless of zoom
        const desiredPixelSize = 12;
        sprite.onBeforeRender = (renderer, scene, camera) => {
            const height = renderer.getSize(new THREE.Vector2()).y;
            if (camera instanceof THREE.PerspectiveCamera) {
                const distance = camera.position.distanceTo(sprite.position);
                const vFOV = (camera.fov * Math.PI) / 180;
                const worldHeight = 2 * distance * Math.tan(vFOV / 2);
                const scale = (desiredPixelSize / height) * worldHeight;
                sprite.scale.set(scale, scale, 1);
            } else if (camera instanceof THREE.OrthographicCamera) {
                const worldHeight = camera.top - camera.bottom;
                const scale = (desiredPixelSize / height) * worldHeight;
                sprite.scale.set(scale, scale, 1);
            }
        };
        
        return sprite;
    }

    public updateContainer(container: HTMLElement) {
        this.container = container;
        if (this.tipElement && this.tipElement.parentNode) {
            this.tipElement.parentNode.removeChild(this.tipElement);
        }
        if (this.tipElement) {
            this.container.appendChild(this.tipElement);
        }
    }

    private initCursorLabel() {
        if (getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }

        const div = document.createElement('div');
        div.id = 'viewer-tip-overlay';
        div.style.position = 'absolute';
        div.style.top = '16px';
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%) scale(0.95)';
        div.style.backgroundColor = 'rgba(15, 23, 42, 0.88)';
        div.style.color = '#ffffff';
        div.style.padding = '8px 16px';
        div.style.borderRadius = '8px';
        div.style.fontSize = '12px';
        div.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.15)';
        div.style.pointerEvents = 'none';
        div.style.zIndex = '999';
        div.style.fontFamily = 'sans-serif';
        div.style.fontWeight = '500';
        div.style.transition = 'all 0.15s ease-out';
        div.style.opacity = '0';
        div.style.display = 'none';
        
        div.textContent = '起点';
        this.container.appendChild(div);
        this.tipElement = div;
    }

    private updateCursorText(text: string, visible: boolean = true) {
        if (this.tipElement) {
             if (visible && text) {
                 this.tipElement.textContent = text;
                 this.tipElement.style.display = 'block';
                 // Force reflow
                 this.tipElement.offsetHeight;
                 this.tipElement.style.opacity = '1';
                 this.tipElement.style.transform = 'translateX(-50%) scale(1)';
             } else {
                 this.tipElement.style.opacity = '0';
                 this.tipElement.style.transform = 'translateX(-50%) scale(0.95)';
                 setTimeout(() => {
                     if (this.tipElement && this.tipElement.style.opacity === '0') {
                         this.tipElement.style.display = 'none';
                     }
                 }, 150);
             }
        }
    }

    public setActive(active: boolean) {
        this.active = active;
        if (!active) {
            this.clearTemp();
            this.container.style.cursor = 'default';
            if (this.tipElement) {
                this.tipElement.style.display = 'none';
                this.tipElement.style.opacity = '0';
            }
            this.snapMarker.visible = false;
        } else {
            this.container.style.cursor = 'default';
            this.clearTemp();
            this.points = [];
            this.updateInstructions();
        }
    }

    public setMode(mode: MeasurementMode) {
        this.clearTemp();
        this.points = [];
        this.mode = mode;
        this.updateInstructions();
    }

    private updateInstructions() {
        if (!this.active) return;
        let text = '';
        const count = this.points.length;

        switch (this.mode) {
            case 'DISTANCE': text = count === 0 ? '点击起点' : '点击终点'; break;
            case 'ANGLE': text = count === 0 ? '点击起点' : count === 1 ? '点击顶点' : '点击终点'; break;
            case 'AREA': text = count === 0 ? '点击起点' : '点击下一个点 (双击结束)'; break;
            case 'VOLUME': text = count === 0 ? '点击角点 1' : '点击角点 2'; break;
            case 'COORDINATE': text = '点击任意点获取坐标'; break;
        }
        this.updateCursorText(text, true);
    }

    // Completely clear all measurements
    public clear() {
        this.clearTemp();
        this.measurements.forEach(m => {
            m.objects.forEach(o => this.disposeObject(o));
            m.labels.forEach(l => {
                this.scene.remove(l);
                if (l.material) l.material.dispose();
            });
        });
        this.measurements = [];
        this.notifyChange();
    }

    // Delete a specific measurement
    public deleteMeasurement(id: string) {
        const idx = this.measurements.findIndex(m => m.id === id);
        if (idx !== -1) {
            const m = this.measurements[idx];
            m.objects.forEach(o => {
                this.scene.remove(o);
                if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
                    o.geometry.dispose();
                }
            });
            m.labels.forEach(l => {
                this.scene.remove(l);
                if (l.material) l.material.dispose();
            });
            this.measurements.splice(idx, 1);
            this.notifyChange();
        }
    }

    public raycast(event: MouseEvent): string | null {
        const rect = this.container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        const mouse = new THREE.Vector2();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(mouse, this.camera);
        
        const allObjects: THREE.Object3D[] = [];
        for (const m of this.measurements) {
            allObjects.push(...m.objects, ...m.labels);
        }
        
        // Disable firstHitOnly for proper checking among all overlays
        this.raycaster.firstHitOnly = false;
        
        // Increase line tolerance for easier clicking
        this.raycaster.params.Line.threshold = 0.5;

        const intersects = this.raycaster.intersectObjects(allObjects, false);
        if (intersects.length > 0) {
            return intersects[0].object.userData.measurementId || null;
        }
        return null;
    }

    public getMeasurementBox(id: string): THREE.Box3 | null {
        const m = this.measurements.find(x => x.id === id);
        if (!m) return null;
        const box = new THREE.Box3();
        m.objects.forEach(o => box.expandByObject(o));
        m.labels.forEach(l => box.expandByObject(l));
        return box;
    }
    
    private clearTemp() {
        this.tempMarkers.forEach(m => this.disposeObject(m));
        this.tempMarkers = [];
        if (this.tempPreview) {
            this.disposeObject(this.tempPreview);
            this.tempPreview = null;
        }
    }

    private disposeObject(obj: THREE.Object3D) {
        this.scene.remove(obj);
        if ((obj as any).geometry) (obj as any).geometry.dispose();
    }

    // New: Handle double click to finish measurements (like Area)
    public onDoubleClick(event: MouseEvent) {
        if (!this.active) return;
        
        if (this.mode === 'AREA' && this.points.length > 2) {
            this.createAreaMeasurement(this.points);
            this.points = [];
            this.clearTemp();
            this.updateInstructions();
        }
    }

    public onClick(event: MouseEvent, models: THREE.Object3D[]) {
        if (!this.active) return;
        if ((event.target as HTMLElement) !== this.container && (event.target as HTMLElement).tagName !== 'CANVAS') return;

        const result = this.getIntersects(event, models);
        if (!result) return;

        this.handleModeClick(result.point);
    }

    private handleModeClick(point: THREE.Vector3) {
        switch(this.mode) {
            case 'DISTANCE':
                this.addTempPoint(point);
                if (this.points.length === 2) {
                    this.createDistanceMeasurement(this.points[0], this.points[1]);
                    this.points = []; 
                    this.clearTemp();
                }
                break;
            
            case 'ANGLE':
                this.addTempPoint(point);
                if (this.points.length === 3) {
                    this.createAngleMeasurement(this.points[0], this.points[1], this.points[2]);
                    this.points = [];
                    this.clearTemp();
                }
                break;

            case 'AREA':
                // Check if closing loop (near first point) - Legacy method, Double Click is preferred now
                if (this.points.length > 2 && point.distanceTo(this.points[0]) < 0.5) {
                    this.createAreaMeasurement(this.points);
                    this.points = [];
                    this.clearTemp();
                } else {
                    this.addTempPoint(point);
                }
                break;

            case 'VOLUME':
                this.addTempPoint(point);
                if (this.points.length === 2) {
                    this.createVolumeMeasurement(this.points[0], this.points[1]);
                    this.points = [];
                    this.clearTemp();
                }
                break;

            case 'COORDINATE':
                this.createCoordinateMeasurement(point);
                break;
        }
        this.updateInstructions();
    }

    public onMouseMove(event: MouseEvent, models: THREE.Object3D[]) {
        if (!this.active) return;
        
        const result = this.getIntersects(event, models);
        
        if (result) {
            if (result.type !== 'none') {
                this.snapMarker.position.copy(result.point);
                this.snapMarker.visible = true;
                // Scale sprite based on distance for consistent screen size
                const dist = this.camera.position.distanceTo(result.point);
                const scale = Math.max(0.08, dist / 80);
                this.snapMarker.scale.set(scale, scale, 1);
                // Update sprite color based on snap type
                const material = this.snapMarker.material as THREE.SpriteMaterial;
                if (material.map) {
                    this.updateSnapMarkerColor(result.type === 'vertex' ? '#10b981' : '#f59e0b');
                }
            } else {
                this.snapMarker.visible = false;
            }

            // Preview handling
            if (this.points.length > 0) {
                this.updatePreview(result.point);
            }
        } else {
            this.snapMarker.visible = false;
        }
    }

    private updateSnapMarkerColor(hexColor: string) {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        
        const center = size / 2;
        const outerR = size / 2 - 4;
        const innerR = outerR * 0.35;
        
        // Outer glow
        ctx.beginPath();
        ctx.arc(center, center, outerR + 2, 0, Math.PI * 2);
        ctx.fillStyle = hexColor.replace(')', ', 0.2)').replace('rgb', 'rgba');
        if (hexColor.startsWith('#')) {
            ctx.fillStyle = hexColor + '33';
        }
        ctx.fill();
        
        // Outer ring
        ctx.beginPath();
        ctx.arc(center, center, outerR, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        
        // Filled center
        ctx.beginPath();
        ctx.arc(center, center, innerR, 0, Math.PI * 2);
        ctx.fillStyle = hexColor;
        ctx.fill();
        
        // White dot
        ctx.beginPath();
        ctx.arc(center, center, innerR * 0.33, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        
        const oldTexture = (this.snapMarker.material as THREE.SpriteMaterial).map;
        if (oldTexture) oldTexture.dispose();
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        (this.snapMarker.material as THREE.SpriteMaterial).map = texture;
        (this.snapMarker.material as THREE.SpriteMaterial).needsUpdate = true;
    }

    private getIntersects(event: MouseEvent, models: THREE.Object3D[]): { point: THREE.Vector3, type: 'none' | 'vertex' | 'edge' } | null {
        const rect = this.container.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        this.raycaster.setFromCamera(mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(models);
        if (intersects.length === 0) return null;

        const hit = intersects[0];
        const point = hit.point;

        // Perform Vertex Snapping if face geometry is available
        if (hit.face && hit.object && (hit.object as THREE.Mesh).geometry) {
            const mesh = hit.object as THREE.Mesh;
            const geom = mesh.geometry;
            const posAttr = geom.getAttribute('position');
            if (posAttr) {
                try {
                    const localA = new THREE.Vector3().fromBufferAttribute(posAttr, hit.face.a);
                    const localB = new THREE.Vector3().fromBufferAttribute(posAttr, hit.face.b);
                    const localC = new THREE.Vector3().fromBufferAttribute(posAttr, hit.face.c);

                    const instanceMatrix = new THREE.Matrix4();
                    if (mesh instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
                        mesh.getMatrixAt(hit.instanceId, instanceMatrix);
                    }

                    const worldA = localA.applyMatrix4(instanceMatrix).applyMatrix4(mesh.matrixWorld);
                    const worldB = localB.applyMatrix4(instanceMatrix).applyMatrix4(mesh.matrixWorld);
                    const worldC = localC.applyMatrix4(instanceMatrix).applyMatrix4(mesh.matrixWorld);

                    const distA = point.distanceTo(worldA);
                    const distB = point.distanceTo(worldB);
                    const distC = point.distanceTo(worldC);

                    let closest = point;
                    let minDist = Infinity;

                    // 1. Vertex Snapping
                    if (distA < minDist) { minDist = distA; closest = worldA; }
                    if (distB < minDist) { minDist = distB; closest = worldB; }
                    if (distC < minDist) { minDist = distC; closest = worldC; }

                    // Snap threshold for Vertex: 0.3 meters
                    if (minDist < 0.3) {
                        return { point: closest, type: 'vertex' };
                    }

                    // 2. Edge Snapping
                    const lineAB = new THREE.Line3(worldA, worldB);
                    const lineBC = new THREE.Line3(worldB, worldC);
                    const lineCA = new THREE.Line3(worldC, worldA);

                    const closestAB = new THREE.Vector3();
                    lineAB.closestPointToPoint(point, true, closestAB);
                    const distAB = point.distanceTo(closestAB);

                    const closestBC = new THREE.Vector3();
                    lineBC.closestPointToPoint(point, true, closestBC);
                    const distBC = point.distanceTo(closestBC);

                    const closestCA = new THREE.Vector3();
                    lineCA.closestPointToPoint(point, true, closestCA);
                    const distCA = point.distanceTo(closestCA);

                    minDist = Infinity;
                    if (distAB < minDist) { minDist = distAB; closest = closestAB; }
                    if (distBC < minDist) { minDist = distBC; closest = closestBC; }
                    if (distCA < minDist) { minDist = distCA; closest = closestCA; }

                    // Snap threshold for Edge: 0.3 meters
                    if (minDist < 0.3) {
                        return { point: closest, type: 'edge' };
                    }
                } catch (e) {
                    console.warn("[MeasurementManager] Snapping failed:", e);
                }
            }
        }

        return { point, type: 'none' };
    }

    private addTempPoint(point: THREE.Vector3) {
        this.points.push(point);
        // User requested not to show the spheres for start/end points
        // Keeping logical point, but not adding marker meshes
    }

    // --- Previews ---

    private updatePreview(currentPoint: THREE.Vector3) {
        if (this.tempPreview) {
            this.disposeObject(this.tempPreview);
            this.tempPreview = null;
        }

        const previewMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, opacity: 0.6, transparent: true, depthTest: false });
        let geometry: THREE.BufferGeometry | null = null;
        let mesh: THREE.Object3D | null = null;

        if (this.mode === 'VOLUME' && this.points.length === 1) {
            const min = this.points[0].clone().min(currentPoint);
            const max = this.points[0].clone().max(currentPoint);
            const size = new THREE.Vector3().subVectors(max, min);
            const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
            mesh = new THREE.Mesh(boxGeo, this.fillMaterial);
            mesh.position.copy(min).add(max).multiplyScalar(0.5);
        }
        else if (this.mode === 'AREA' && this.points.length > 0) {
            const pts = [...this.points, currentPoint, this.points[0]]; // Close loop visually
            geometry = new THREE.BufferGeometry().setFromPoints(pts);
        } 
        else if (this.mode === 'ANGLE' && this.points.length === 2) {
             const pts = [this.points[0], this.points[1], currentPoint];
             geometry = new THREE.BufferGeometry().setFromPoints(pts);
        } 
        else if (this.points.length > 0) {
             const pts = [this.points[this.points.length - 1], currentPoint];
             geometry = new THREE.BufferGeometry().setFromPoints(pts);
        }

        if (geometry) {
            mesh = new THREE.Line(geometry, previewMat);
        }

        if (mesh) {
            mesh.renderOrder = 999;
            this.scene.add(mesh);
            this.tempPreview = mesh;
        }
    }

    // --- Creation Logic ---

    private addMeasurementRecord(type: MeasurementMode, value: string, label: string, objects: THREE.Object3D[], labels: THREE.Sprite[], center?: THREE.Vector3) {
        const id = `m_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        // Calculate center if not provided
        if (!center && objects.length > 0) {
            const box = new THREE.Box3();
            objects.forEach(o => box.expandByObject(o));
            center = new THREE.Vector3();
            box.getCenter(center);
        }

        // Add userData to all objects for raycasting
        objects.forEach(o => o.userData.measurementId = id);
        labels.forEach(l => l.userData.measurementId = id);

        this.measurements.push({
            id,
            objects,
            labels,
            data: { id, type, value, label, timestamp: Date.now() },
            center: center || new THREE.Vector3()
        });
        this.notifyChange();
    }

    private notifyChange() {
        if (this.onMeasurementsChange) {
            this.onMeasurementsChange(this.measurements.map(m => m.data));
        }
    }

    private createDistanceMeasurement(p1: THREE.Vector3, p2: THREE.Vector3) {
        const objects: THREE.Object3D[] = [];
        const labels: THREE.Sprite[] = [];

        // Line
        const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const line = new THREE.Line(geometry, this.lineMaterial);
        line.renderOrder = 999;
        this.scene.add(line);
        objects.push(line);

        // Label
        const dist = p1.distanceTo(p2);
        const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const valStr = `${dist.toFixed(3)}m`;
        const label = this.createLabel(center, valStr);
        labels.push(label);

        this.addMeasurementRecord('DISTANCE', valStr, `长度: ${valStr}`, objects, labels);
    }

    private createAngleMeasurement(p1: THREE.Vector3, center: THREE.Vector3, p2: THREE.Vector3) {
        const objects: THREE.Object3D[] = [];
        const labels: THREE.Sprite[] = [];

        const linesGeo = new THREE.BufferGeometry().setFromPoints([p1, center, p2]);
        const lines = new THREE.Line(linesGeo, this.lineMaterial);
        lines.renderOrder = 999;
        this.scene.add(lines);
        objects.push(lines);

        const v1 = new THREE.Vector3().subVectors(p1, center).normalize();
        const v2 = new THREE.Vector3().subVectors(p2, center).normalize();
        const angleRad = v1.angleTo(v2);
        const angleDeg = THREE.MathUtils.radToDeg(angleRad);
        const valStr = `${angleDeg.toFixed(1)}°`;

        const label = this.createLabel(center, valStr);
        labels.push(label);

        this.addMeasurementRecord('ANGLE', valStr, `角度: ${valStr}`, objects, labels);
    }

    private createAreaMeasurement(points: THREE.Vector3[]) {
        const objects: THREE.Object3D[] = [];
        const labels: THREE.Sprite[] = [];

        const closedPoints = [...points, points[0]];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(closedPoints);
        const line = new THREE.Line(lineGeo, this.lineMaterial);
        line.renderOrder = 999;
        this.scene.add(line);
        objects.push(line);

        let area = 0;
        const p0 = points[0];
        for (let i = 1; i < points.length - 1; i++) {
            const v1 = new THREE.Vector3().subVectors(points[i], p0);
            const v2 = new THREE.Vector3().subVectors(points[i+1], p0);
            area += v1.cross(v2).length() * 0.5;
        }
        
        const center = new THREE.Vector3();
        points.forEach(p => center.add(p));
        center.divideScalar(points.length);

        const valStr = `${area.toFixed(2)}m²`;
        const label = this.createLabel(center, valStr);
        labels.push(label);

        this.addMeasurementRecord('AREA', valStr, `面积: ${valStr}`, objects, labels);
    }

    private createVolumeMeasurement(p1: THREE.Vector3, p2: THREE.Vector3) {
        const objects: THREE.Object3D[] = [];
        const labels: THREE.Sprite[] = [];

        const min = p1.clone().min(p2);
        const max = p1.clone().max(p2);
        const size = new THREE.Vector3().subVectors(max, min);
        
        const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const wireframe = new THREE.WireframeGeometry(boxGeo);
        const box = new THREE.LineSegments(wireframe, this.lineMaterial);
        
        const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
        box.position.copy(center);
        box.renderOrder = 999;
        this.scene.add(box);
        objects.push(box);

        const volume = size.x * size.y * size.z;
        const valStr = `${volume.toFixed(2)}m³`;
        const dims = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
        
        const label = this.createLabel(center, `${valStr}\n${dims}`);
        labels.push(label);

        this.addMeasurementRecord('VOLUME', valStr, `体积: ${valStr}`, objects, labels);
    }

    private createCoordinateMeasurement(p: THREE.Vector3) {
        const objects: THREE.Object3D[] = [];
        const labels: THREE.Sprite[] = [];

        // Dynamic leader line direction based on quadrant or standard (0.6, 1.0, 0.6)
        const leaderOffset = new THREE.Vector3(0.6, 1.0, 0.6);
        const labelPos = p.clone().add(leaderOffset);

        // Leader Line
        const lineGeo = new THREE.BufferGeometry().setFromPoints([p, labelPos]);
        const line = new THREE.Line(lineGeo, this.lineMaterial);
        line.renderOrder = 999;
        this.scene.add(line);
        objects.push(line);

        // A very tiny helper marker sphere (0.03m) at the exact clicked coordinate to indicate origin point
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 16), this.markerMaterial);
        m.position.copy(p);
        m.renderOrder = 999;
        this.scene.add(m);
        objects.push(m);

        const txt = `X: ${p.x.toFixed(3)}\nY: ${p.y.toFixed(3)}\nZ: ${p.z.toFixed(3)}`;
        const label = this.createLabel(labelPos, txt);
        labels.push(label);

        this.addMeasurementRecord('COORDINATE', `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`, txt, objects, labels);
    }

    private createLabel(pos: THREE.Vector3, text: string) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return new THREE.Sprite();
        
        const lines = text.split('\n');
        context.font = 'bold 36px Arial';
        
        // Calculate max width
        let maxWidth = 0;
        for (const line of lines) {
            const metrics = context.measureText(line);
            maxWidth = Math.max(maxWidth, metrics.width);
        }
        
        const paddingX = 20;
        const paddingY = 16;
        const lineHeight = 40;
        const textHeight = lines.length * lineHeight;
        
        canvas.width = maxWidth + paddingX * 2;
        canvas.height = textHeight + paddingY * 2;
        
        // Redefine font after resize
        context.font = 'bold 36px Arial';
        
        // Background
        context.fillStyle = 'rgba(255, 255, 255, 0.9)';
        if (context.roundRect) {
            context.beginPath();
            context.roundRect(0, 0, canvas.width, canvas.height, 12);
            context.fill();
        } else {
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.strokeStyle = 'rgba(100, 116, 139, 0.5)';
        context.lineWidth = 4;
        context.strokeRect(0, 0, canvas.width, canvas.height);
        
        // Text
        context.fillStyle = '#1e293b';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const startY = (canvas.height - textHeight) / 2 + lineHeight / 2;
        for (let i = 0; i < lines.length; i++) {
            context.fillText(lines[i], canvas.width / 2, startY + i * lineHeight);
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: true });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Scale appropriately based on typical model size.
        // A sprite's scale corresponds to units in 3D space. 
        const spriteHeight = 0.4; // 0.4m text height
        const aspect = canvas.width / canvas.height;
        sprite.scale.set(spriteHeight * aspect, spriteHeight, 1);
        sprite.position.copy(pos);
        sprite.renderOrder = 1000;
        
        // Store userdata for raycasting
        sprite.userData.isMeasurementLabel = true;
        
        this.scene.add(sprite);
        return sprite;
    }
}
