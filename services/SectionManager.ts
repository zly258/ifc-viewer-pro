import * as THREE from 'three';

export class SectionManager {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    
    // Support 6 active planes for slicing min and max
    private planes: {
        xMin: THREE.Plane;
        xMax: THREE.Plane;
        yMin: THREE.Plane;
        yMax: THREE.Plane;
        zMin: THREE.Plane;
        zMax: THREE.Plane;
    };
    
    private activeAxis: Set<'X' | 'Y' | 'Z'> = new Set();

    // Visual helper indicator planes
    private helpers: {
        xMin?: THREE.Group;
        xMax?: THREE.Group;
        yMin?: THREE.Group;
        yMax?: THREE.Group;
        zMin?: THREE.Group;
        zMax?: THREE.Group;
    } = {};
    
    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
        this.renderer = renderer;
        this.scene = scene;
        this.renderer.localClippingEnabled = true;

        this.planes = {
            xMin: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
            xMax: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
            yMin: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
            yMax: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
            zMin: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
            zMax: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
        };
    }

    public togglePlane(axis: 'X' | 'Y' | 'Z', active: boolean, minVal: number, maxVal: number) {
        if (active) {
            this.activeAxis.add(axis);
            this.updatePlaneConstant(axis, minVal, maxVal);
        } else {
            this.activeAxis.delete(axis);
        }
        this.updateClippingPlanes();
        this.updateHelpers();
    }

    public updateOffset(axis: 'X' | 'Y' | 'Z', minVal: number, maxVal: number) {
        if (this.activeAxis.has(axis)) {
            this.updatePlaneConstant(axis, minVal, maxVal);
            this.updateHelpers();
        }
    }

    private updatePlaneConstant(axis: 'X' | 'Y' | 'Z', minVal: number, maxVal: number) {
        if (axis === 'X') {
            this.planes.xMin.constant = -minVal;
            this.planes.xMax.constant = maxVal;
        }
        if (axis === 'Y') {
            this.planes.yMin.constant = -minVal;
            this.planes.yMax.constant = maxVal;
        }
        if (axis === 'Z') {
            this.planes.zMin.constant = -minVal;
            this.planes.zMax.constant = maxVal;
        }
    }

    private updateClippingPlanes() {
        const activePlanes: THREE.Plane[] = [];
        if (this.activeAxis.has('X')) { activePlanes.push(this.planes.xMin, this.planes.xMax); }
        if (this.activeAxis.has('Y')) { activePlanes.push(this.planes.yMin, this.planes.yMax); }
        if (this.activeAxis.has('Z')) { activePlanes.push(this.planes.zMin, this.planes.zMax); }
        
        this.renderer.clippingPlanes = activePlanes;
    }

    private getModelBounds(): THREE.Box3 {
        const box = new THREE.Box3();
        this.scene.traverse(c => {
            if (c instanceof THREE.Mesh && !c.userData.isSectionHelper) {
                if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
                if (c.geometry.boundingBox) {
                    const b = c.geometry.boundingBox.clone();
                    c.updateMatrixWorld(true);
                    b.applyMatrix4(c.matrixWorld);
                    box.union(b);
                }
            }
        });
        return box;
    }

    private updateHelpers() {
        // Clear previous helpers first
        this.clearHelpers();

        const box = this.getModelBounds();
        if (box.isEmpty()) return;

        const min = box.min;
        const max = box.max;

        const sizeX = max.x - min.x;
        const sizeY = max.y - min.y;
        const sizeZ = max.z - min.z;

        const centerX = (min.x + max.x) / 2;
        const centerY = (min.y + max.y) / 2;
        const centerZ = (min.z + max.z) / 2;

        const createHelperPlane = (axis: 'X' | 'Y' | 'Z', val: number) => {
            let width = 0;
            let height = 0;
            const group = new THREE.Group();
            group.userData = { isSectionHelper: true };

            let color = 0x3b82f6; // Blue for Z
            if (axis === 'X') {
                color = 0xef4444; // Red
            } else if (axis === 'Y') {
                color = 0x22c55e; // Green
            }

            if (axis === 'X') {
                width = sizeZ;
                height = sizeY;
            } else if (axis === 'Y') {
                width = sizeX;
                height = sizeZ;
            } else { // Z
                width = sizeX;
                height = sizeY;
            }

            if (width <= 0) width = 10;
            if (height <= 0) height = 10;

            const geometry = new THREE.PlaneGeometry(width, height);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.15,
                side: THREE.DoubleSide,
                depthWrite: false,
                clippingPlanes: [] // Do not clip the helper itself
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData = { isSectionHelper: true };

            if (axis === 'X') {
                mesh.rotation.y = Math.PI / 2;
                mesh.position.set(val, centerY, centerZ);
            } else if (axis === 'Y') {
                mesh.rotation.x = Math.PI / 2;
                mesh.position.set(centerX, val, centerZ);
            } else { // Z
                mesh.position.set(centerX, centerY, val);
            }

            group.add(mesh);

            // Add clean wire boundary
            const edges = new THREE.EdgesGeometry(geometry);
            const lineMat = new THREE.LineBasicMaterial({ 
                color: color, 
                linewidth: 2, 
                depthWrite: false,
                clippingPlanes: [] 
            });
            const line = new THREE.LineSegments(edges, lineMat);
            line.userData = { isSectionHelper: true };
            line.rotation.copy(mesh.rotation);
            line.position.copy(mesh.position);
            group.add(line);

            this.scene.add(group);
            return group;
        };

        if (this.activeAxis.has('X')) {
            const xMinVal = -this.planes.xMin.constant;
            const xMaxVal = this.planes.xMax.constant;
            this.helpers.xMin = createHelperPlane('X', xMinVal);
            this.helpers.xMax = createHelperPlane('X', xMaxVal);
        }

        if (this.activeAxis.has('Y')) {
            const yMinVal = -this.planes.yMin.constant;
            const yMaxVal = this.planes.yMax.constant;
            this.helpers.yMin = createHelperPlane('Y', yMinVal);
            this.helpers.yMax = createHelperPlane('Y', yMaxVal);
        }

        if (this.activeAxis.has('Z')) {
            const zMinVal = -this.planes.zMin.constant;
            const zMaxVal = this.planes.zMax.constant;
            this.helpers.zMin = createHelperPlane('Z', zMinVal);
            this.helpers.zMax = createHelperPlane('Z', zMaxVal);
        }
    }

    private clearHelpers() {
        Object.entries(this.helpers).forEach(([key, group]) => {
            if (group) {
                this.scene.remove(group);
                group.traverse(c => {
                    if (c instanceof THREE.Mesh) {
                        c.geometry.dispose();
                        if (c.material instanceof THREE.Material) {
                            c.material.dispose();
                        }
                    }
                    if (c instanceof THREE.LineSegments) {
                        c.geometry.dispose();
                        if (c.material instanceof THREE.Material) {
                            c.material.dispose();
                        }
                    }
                });
            }
        });
        this.helpers = {};
    }

    public clear() {
        this.activeAxis.clear();
        this.renderer.clippingPlanes = [];
        this.clearHelpers();
    }

    public dispose() {
        this.renderer.clippingPlanes = [];
        this.renderer.localClippingEnabled = false;
        this.clearHelpers();
    }
}
