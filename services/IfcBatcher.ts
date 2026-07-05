import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface GeometryPlacement {
    geometry: THREE.BufferGeometry;
    transform: THREE.Matrix4;
    expressID: number;
    geometryExpressID: number;
}

interface MaterialGroup {
    material: THREE.MeshStandardMaterial;
    placements: GeometryPlacement[];
}

export class IfcBatcher {
    private groups: Map<string, MaterialGroup> = new Map();
    private readonly enableInstancing = false;

    constructor() {}

    add(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, transform: THREE.Matrix4, expressID: number, geometryExpressID: number) {
        const matId = this.getMaterialId(material);
        if (!this.groups.has(matId)) {
            this.groups.set(matId, { material, placements: [] });
        }
        const group = this.groups.get(matId)!;
        group.placements.push({
            geometry,
            transform: transform.clone(),
            expressID,
            geometryExpressID
        });
    }

    build(): THREE.Object3D[] {
        const meshes: THREE.Object3D[] = [];

        this.groups.forEach((group, matId) => {
            if (group.placements.length === 0) return;

            // 1. Group placements by geometryExpressID to count occurrences
            const geomCountMap = new Map<number, GeometryPlacement[]>();
            group.placements.forEach(p => {
                if (!geomCountMap.has(p.geometryExpressID)) {
                    geomCountMap.set(p.geometryExpressID, []);
                }
                geomCountMap.get(p.geometryExpressID)!.push(p);
            });

            // Placements that will be merged (non-instanced)
            const mergeGeometries: THREE.BufferGeometry[] = [];

            geomCountMap.forEach((placements, geomExpressID) => {
                // Keep IFC geometry fidelity first. Some IFC exporters reuse geometry IDs with
                // placement data that is not safe for direct instancing, which can distort shapes.
                if (this.enableInstancing && placements.length >= 3) {
                    const first = placements[0];
                    
                    // Sanitize base geometry (no transform applied!)
                    const baseGeom = new THREE.BufferGeometry();
                    baseGeom.setAttribute('position', first.geometry.getAttribute('position'));
                    if (first.geometry.getAttribute('normal')) {
                        baseGeom.setAttribute('normal', first.geometry.getAttribute('normal'));
                    } else {
                        baseGeom.computeVertexNormals();
                    }
                    baseGeom.setIndex(first.geometry.getIndex());
                    
                    baseGeom.computeBoundingBox();
                    baseGeom.computeBoundingSphere();
                    
                    if (baseGeom.computeBoundsTree) baseGeom.computeBoundsTree();

                    const instancedMesh = new THREE.InstancedMesh(baseGeom, group.material, placements.length);
                    instancedMesh.name = `Instanced_${matId}_geom_${geomExpressID}`;
                    
                    const instanceExpressIDs: number[] = [];
                    
                    placements.forEach((p, idx) => {
                        instancedMesh.setMatrixAt(idx, p.transform);
                        instanceExpressIDs.push(p.expressID);
                        // Dispose individual geometries since they are not merged
                        p.geometry.dispose();
                    });
                    
                    instancedMesh.userData = {
                        instanceExpressIDs,
                        isInstanced: true,
                        geometryExpressID: geomExpressID
                    };
                    
                    instancedMesh.instanceMatrix.needsUpdate = true;
                    meshes.push(instancedMesh);
                } else {
                    // For geometries used < 3 times, we merge them (applying transform first)
                    placements.forEach(p => {
                        const geom = p.geometry.clone();
                        geom.applyMatrix4(p.transform);

                        const cleanGeom = new THREE.BufferGeometry();
                        cleanGeom.setAttribute('position', geom.getAttribute('position'));
                        if (geom.getAttribute('normal')) {
                            cleanGeom.setAttribute('normal', geom.getAttribute('normal'));
                        } else {
                            cleanGeom.computeVertexNormals();
                        }
                        cleanGeom.setIndex(geom.getIndex());

                        // Store expressID attribute for raycast selection in merged geometries
                        const vertexCount = cleanGeom.getAttribute('position').count;
                        const ids = new Float32Array(vertexCount);
                        ids.fill(p.expressID);
                        cleanGeom.setAttribute('expressID', new THREE.BufferAttribute(ids, 1));

                        mergeGeometries.push(cleanGeom);
                        
                        // Dispose source geometry
                        p.geometry.dispose();
                    });
                }
            });

            // 2. Build merged geometries
            if (mergeGeometries.length > 0) {
                const mergedGeometry = BufferGeometryUtils.mergeGeometries(mergeGeometries, false);
                mergeGeometries.forEach(g => g.dispose());

                if (mergedGeometry) {
                    mergedGeometry.computeBoundingBox();
                    mergedGeometry.computeBoundingSphere();

                    if (mergedGeometry.computeBoundsTree) mergedGeometry.computeBoundsTree();

                    const mesh = new THREE.Mesh(mergedGeometry, group.material);
                    mesh.name = `Batch_${matId}`;
                    mesh.userData = { isBatch: true };
                    meshes.push(mesh);
                }
            }
        });

        this.groups.clear();
        return meshes;
    }

    getExpressID(intersection: THREE.Intersection): number | null {
        const mesh = intersection.object;
        
        // Handle InstancedMesh selection
        if (mesh instanceof THREE.InstancedMesh) {
            const instanceId = intersection.instanceId;
            if (instanceId !== undefined && mesh.userData.instanceExpressIDs) {
                const id = mesh.userData.instanceExpressIDs[instanceId];
                console.log(`[IfcBatcher] Hit instance: ${instanceId}. ExpressID: ${id}`);
                return id;
            }
            return null;
        }

        // Handle Merged Mesh selection
        if (!(mesh instanceof THREE.Mesh)) return null;
        const geometry = mesh.geometry;
        if (!geometry.attributes.expressID) {
            return null;
        }

        if (intersection.face) {
            const id = geometry.attributes.expressID.getX(intersection.face.a);
            console.log(`[IfcBatcher] Face: ${intersection.face.a}. ExpressID: ${id}`);
            return id;
        }

        return null;
    }

    private getMaterialId(mat: THREE.MeshStandardMaterial): string {
        return `${mat.color.getHexString()}-${mat.opacity.toFixed(2)}-${mat.transparent ? '1' : '0'}`;
    }

    dispose() {
        this.groups.forEach(g => g.placements.forEach(p => p.geometry.dispose()));
        this.groups.clear();
    }
}
