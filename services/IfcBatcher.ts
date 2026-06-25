
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface MaterialGroup {
    material: THREE.MeshStandardMaterial;
    geometries: THREE.BufferGeometry[];
}

export class IfcBatcher {
    private groups: Map<string, MaterialGroup> = new Map();

    constructor() {}

    add(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, transform: THREE.Matrix4, expressID: number) {
        // Clone and apply transform
        const geom = geometry.clone();
        geom.applyMatrix4(transform);

        // Sanitize attributes: Keep only position and normal
        const cleanGeom = new THREE.BufferGeometry();
        cleanGeom.setAttribute('position', geom.getAttribute('position'));
        if (geom.getAttribute('normal')) {
            cleanGeom.setAttribute('normal', geom.getAttribute('normal'));
        } else {
             cleanGeom.computeVertexNormals();
        }
        cleanGeom.setIndex(geom.getIndex());

        // Write ExpressID into a vertex attribute
        // This persists even if BVH reorders the geometry indices
        const vertexCount = cleanGeom.getAttribute('position').count;
        const ids = new Float32Array(vertexCount);
        ids.fill(expressID);
        cleanGeom.setAttribute('expressID', new THREE.BufferAttribute(ids, 1));

        const matId = this.getMaterialId(material);
        if (!this.groups.has(matId)) {
            this.groups.set(matId, { material, geometries: [] });
        }
        const group = this.groups.get(matId)!;
        group.geometries.push(cleanGeom);
    }

    build(): THREE.Mesh[] {
        const meshes: THREE.Mesh[] = [];

        this.groups.forEach((group, matId) => {
            if (group.geometries.length === 0) return;

            // Merge geometries (including the 'expressID' attribute)
            const mergedGeometry = BufferGeometryUtils.mergeGeometries(group.geometries, false);
            
            if (!mergedGeometry) {
                console.warn(`[IfcBatcher] Failed to merge group ${matId}`);
                group.geometries.forEach(g => g.dispose());
                return;
            }

            // Dispose source geometries to free memory
            group.geometries.forEach(g => g.dispose());

            // Compute BVH & Bounds
            mergedGeometry.computeBoundingBox();
            mergedGeometry.computeBoundingSphere();
            
            // BVH will reorder indices, but 'expressID' attribute remains aligned with vertices
            // @ts-ignore
            if (mergedGeometry.computeBoundsTree) mergedGeometry.computeBoundsTree();

            const mesh = new THREE.Mesh(mergedGeometry, group.material);
            mesh.name = `Batch_${matId}`;
            
            meshes.push(mesh);
        });

        this.groups.clear();
        return meshes;
    }

    /**
     * Retrieves the Express ID from the intersection point using the vertex attribute.
     */
    getExpressID(intersection: THREE.Intersection): number | null {
        const mesh = intersection.object;
        if (!(mesh instanceof THREE.Mesh)) return null;
        
        const geometry = mesh.geometry;
        if (!geometry.attributes.expressID) {
            console.warn("[IfcBatcher] No expressID attribute on geometry!", geometry.attributes);
            return null;
        }

        if (intersection.face) {
            const id = geometry.attributes.expressID.getX(intersection.face.a);
            console.log(`[IfcBatcher] Face: ${intersection.face.a}, ${intersection.face.b}, ${intersection.face.c}. ExpressID: ${id}`);
            return id;
        }

        return null;
    }

    private getMaterialId(mat: THREE.MeshStandardMaterial): string {
        return `${mat.color.getHexString()}-${mat.opacity.toFixed(2)}-${mat.transparent ? '1' : '0'}`;
    }

    dispose() {
        this.groups.forEach(g => g.geometries.forEach(geom => geom.dispose()));
        this.groups.clear();
    }
}
