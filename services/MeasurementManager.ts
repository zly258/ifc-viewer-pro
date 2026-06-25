
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { MeasurementMode, MeasurementResult } from '../types';

interface MeasureItem {
    id: string;
    objects: THREE.Object3D[]; // Markers, Lines, Meshes
    labels: CSS2DObject[];
    data: MeasurementResult;
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
    
    // Interactive cursor
    private cursorLabel: CSS2DObject | null = null;
    private cursorLabelDiv: HTMLDivElement | null = null;
    
    // Callbacks
    public onMeasurementsChange?: (results: MeasurementResult[]) => void;

    // Materials
    private markerMaterial = new THREE.MeshBasicMaterial({ color: 0x3b82f6, depthTest: false, transparent: true, opacity: 0.9 });
    private lineMaterial = new THREE.LineBasicMaterial({ color: 0x3b82f6, depthTest: false, linewidth: 2 });
    private fillMaterial = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide, transparent: true, opacity: 0.2, depthTest: false });

    // Temp objects for current interaction
    private tempMarkers: THREE.Mesh[] = [];
    private tempPreview: THREE.Object3D | null = null;

    constructor(scene: THREE.Scene, camera: THREE.Camera, container: HTMLElement) {
        this.scene = scene;
        this.camera = camera;
        this.container = container;
        this.raycaster = new THREE.Raycaster();
        // @ts-ignore
        this.raycaster.firstHitOnly = true;

        this.initCursorLabel();
    }

    private initCursorLabel() {
        const div = document.createElement('div');
        div.className = 'bg-white/90 text-slate-800 px-2 py-1 rounded text-[10px] shadow-sm border border-slate-200 pointer-events-none whitespace-nowrap transform translate-x-4 translate-y-4 font-sans font-medium hidden';
        div.textContent = '起点';
        this.cursorLabelDiv = div;
        this.cursorLabel = new CSS2DObject(div);
        this.scene.add(this.cursorLabel);
    }

    private updateCursorText(text: string, visible: boolean = true) {
        if (this.cursorLabelDiv) {
             this.cursorLabelDiv.textContent = text;
             this.cursorLabelDiv.style.display = visible ? 'block' : 'none';
        }
    }

    public setActive(active: boolean) {
        this.active = active;
        if (!active) {
            this.clearTemp();
            this.container.style.cursor = 'default';
            this.updateCursorText('', false);
        } else {
            this.container.style.cursor = 'crosshair';
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
                if (l.element && l.element.parentNode) l.element.parentNode.removeChild(l.element);
            });
        });
        this.measurements = [];
        this.notifyChange();
    }

    // Delete a specific measurement
    public deleteMeasurement(id: string) {
        const index = this.measurements.findIndex(m => m.id === id);
        if (index !== -1) {
            const m = this.measurements[index];
            m.objects.forEach(o => this.disposeObject(o));
            m.labels.forEach(l => {
                this.scene.remove(l);
                if (l.element) l.element.remove();
            });
            this.measurements.splice(index, 1);
            this.notifyChange();
        }
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

        const point = this.getIntersects(event, models);
        if (!point) return;

        this.handleModeClick(point);
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
        
        const point = this.getIntersects(event, models);
        
        if (point) {
            // Update Cursor Label Position
            if (this.cursorLabel) this.cursorLabel.position.copy(point);
            
            // Preview handling
            if (this.points.length > 0) {
                this.updatePreview(point);
            }
        }
    }

    private getIntersects(event: MouseEvent, models: THREE.Object3D[]): THREE.Vector3 | null {
        const rect = this.container.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        this.raycaster.setFromCamera(mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(models);
        return intersects.length > 0 ? intersects[0].point : null;
    }

    private addTempPoint(point: THREE.Vector3) {
        this.points.push(point);
        const markerGeo = new THREE.SphereGeometry(0.1, 16, 16);
        const marker = new THREE.Mesh(markerGeo, this.markerMaterial);
        marker.position.copy(point);
        marker.renderOrder = 999;
        this.scene.add(marker);
        this.tempMarkers.push(marker);
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

    private addMeasurementRecord(type: MeasurementMode, value: string, label: string, objects: THREE.Object3D[], labels: CSS2DObject[]) {
        const id = `m_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        this.measurements.push({
            id,
            objects,
            labels,
            data: { id, type, value, label, timestamp: Date.now() }
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
        const labels: CSS2DObject[] = [];

        // Line
        const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const line = new THREE.Line(geometry, this.lineMaterial);
        line.renderOrder = 999;
        this.scene.add(line);
        objects.push(line);

        // Markers
        [p1, p2].forEach(p => {
             const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), this.markerMaterial);
             m.position.copy(p);
             m.renderOrder = 999;
             this.scene.add(m);
             objects.push(m);
        });

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
        const labels: CSS2DObject[] = [];

        const linesGeo = new THREE.BufferGeometry().setFromPoints([p1, center, p2]);
        const lines = new THREE.Line(linesGeo, this.lineMaterial);
        lines.renderOrder = 999;
        this.scene.add(lines);
        objects.push(lines);

         // Markers
         [p1, center, p2].forEach(p => {
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), this.markerMaterial);
            m.position.copy(p);
            m.renderOrder = 999;
            this.scene.add(m);
            objects.push(m);
       });

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
        const labels: CSS2DObject[] = [];

        const closedPoints = [...points, points[0]];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(closedPoints);
        const line = new THREE.Line(lineGeo, this.lineMaterial);
        line.renderOrder = 999;
        this.scene.add(line);
        objects.push(line);

        points.forEach(p => {
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), this.markerMaterial);
            m.position.copy(p);
            m.renderOrder = 999;
            this.scene.add(m);
            objects.push(m);
       });

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
        const labels: CSS2DObject[] = [];

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
        const labels: CSS2DObject[] = [];

        const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), this.markerMaterial);
        m.position.copy(p);
        m.renderOrder = 999;
        this.scene.add(m);
        objects.push(m);

        const txt = `X: ${p.x.toFixed(3)}\nY: ${p.y.toFixed(3)}\nZ: ${p.z.toFixed(3)}`;
        const label = this.createLabel(p, txt);
        labels.push(label);

        this.addMeasurementRecord('COORDINATE', `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`, txt, objects, labels);
    }

    private createLabel(pos: THREE.Vector3, text: string) {
        const div = document.createElement('div');
        // Autodesk Viewer style: White bg, rounded, shadow, clean text
        div.className = 'bg-white text-slate-800 px-3 py-1.5 rounded-md text-xs font-semibold shadow-md border border-slate-200 pointer-events-none whitespace-pre-line text-center z-10 select-none';
        div.textContent = text;
        // Small arrow visual could be added with pseudo-element class in CSS

        const label = new CSS2DObject(div);
        label.position.copy(pos);
        this.scene.add(label);
        return label;
    }
}
