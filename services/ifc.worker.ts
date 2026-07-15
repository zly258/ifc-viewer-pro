import * as WebIFC from 'web-ifc';
import { FLUSH_EVERY, WASM_PATH } from './config';

const ifcApi = new WebIFC.IfcAPI();
let isInitialized = false;

// Format name helper
function formatTypeName(type: string): string {
    if (type.startsWith('Ifc')) {
        return type.substring(3);
    }
    return type;
}

function getTypeName(typeID: number): string {
    if (typeID === WebIFC.IFCPROJECT) return 'Project';
    if (typeID === WebIFC.IFCSITE) return 'Site';
    if (typeID === WebIFC.IFCBUILDING) return 'Building';
    if (typeID === WebIFC.IFCBUILDINGSTOREY) return 'Storey';
    return 'Object';
}

function parsePropertyName(name: any): string {
    if (!name) return 'Unnamed';
    if (typeof name !== 'object') return String(name);
    return name.value !== undefined ? String(name.value) : String(name);
}

function parsePropertyValue(nominalValue: any): string {
    if (nominalValue === null || nominalValue === undefined) return '';
    if (typeof nominalValue !== 'object') return String(nominalValue);
    
    let val = nominalValue;
    while (val && typeof val === 'object' && val.value !== undefined) {
        val = val.value;
    }
    
    if (val && typeof val === 'object') {
        return JSON.stringify(val);
    }
    return val === null || val === undefined ? '' : String(val);
}

const modelsMetadata = new Map<number, {
    parentMap: Map<string, string>;
    propertyMaps: Map<number, number[]>;
    modelMeshExpressIDs: Set<number>;
}>();

const mainToWebIfcModelID = new Map<number, number>();

// onmessage handler
self.onmessage = async (e: MessageEvent) => {
    const { type, data } = e.data;
    
    if (type === 'INIT') {
        try {
            ifcApi.SetWasmPath(import.meta.env.BASE_URL + WASM_PATH);
            await ifcApi.Init();
            isInitialized = true;
            self.postMessage({ type: 'INIT_SUCCESS' });
        } catch (err: any) {
            self.postMessage({ type: 'ERROR', message: `INIT_FAILED: ${err.message}` });
        }
    }
    
    else if (type === 'LOAD_IFC_MODEL') {
        const { fileBuffer, modelID } = data;
        if (!isInitialized) {
            try {
                ifcApi.SetWasmPath(import.meta.env.BASE_URL + WASM_PATH);
                await ifcApi.Init();
                isInitialized = true;
            } catch (err: any) {
                self.postMessage({ type: 'ERROR', message: `INIT_FAILED: ${err.message}` });
                return;
            }
        }
        
        try {
            const dataArray = new Uint8Array(fileBuffer);
            const openedModelID = ifcApi.OpenModel(dataArray, {
                COORDINATE_TO_ORIGIN: true
            });
            mainToWebIfcModelID.set(modelID, openedModelID);
            
            const meta = {
                parentMap: new Map<string, string>(),
                propertyMaps: new Map<number, number[]>(),
                modelMeshExpressIDs: new Set<number>()
            };
            modelsMetadata.set(openedModelID, meta);
            
            // Build property map
            self.postMessage({ type: 'PROCESSING', message: '解析模型属性映射关系...' });
            await buildPropertyMap(openedModelID, meta);
            
            // --- Pre-count total mesh elements (cheap enumeration, no geometry decode) ---
            self.postMessage({ type: 'PROCESSING', message: '统计模型构件数量...' });
            let totalMeshCount = 0;
            try {
              totalMeshCount = ifcApi.GetLineIDsWithType(openedModelID, WebIFC.IFCELEMENT).size();
            } catch {
              totalMeshCount = 0;
            }
            
            // Stream geometries with progress reporting
            self.postMessage({ type: 'PROGRESS', progress: 82, message: `正在生成几何体 (共 ${totalMeshCount} 个构件)...` });
            let streamedMeshCount = 0;
            let pendingFlush: any[] = [];
            let pendingTransfers: ArrayBuffer[] = [];
            let lastProgressReport = 0;
            
            ifcApi.StreamAllMeshes(openedModelID, (flatMesh: WebIFC.FlatMesh) => {
                try {
                    const expressID = flatMesh.expressID;
                    meta.modelMeshExpressIDs.add(expressID);
                    
                    const size = flatMesh.geometries.size();
                    for (let i = 0; i < size; i++) {
                        const placedGeom = flatMesh.geometries.get(i);
                        const geomData = ifcApi.GetGeometry(openedModelID, placedGeom.geometryExpressID);
                        if (!geomData) continue;
                        
                        const verts = ifcApi.GetVertexArray(geomData.GetVertexData(), geomData.GetVertexDataSize());
                        const indices = ifcApi.GetIndexArray(geomData.GetIndexData(), geomData.GetIndexDataSize());
                        
                        if (verts.length === 0 || indices.length === 0) continue;
                        
                        const numVerts = verts.length / 6;
                        const pos = new Float32Array(numVerts * 3);
                        const norm = new Float32Array(numVerts * 3);
                        
                        let idx3 = 0;
                        let idx6 = 0;
                        for (let j = 0; j < numVerts; j++) {
                            pos[idx3] = verts[idx6];
                            pos[idx3+1] = verts[idx6+1];
                            pos[idx3+2] = verts[idx6+2];
                            
                            norm[idx3] = verts[idx6+3];
                            norm[idx3+1] = verts[idx6+4];
                            norm[idx3+2] = verts[idx6+5];
                            
                            idx3 += 3;
                            idx6 += 6;
                        }
                        
                        const geomMsg = {
                            modelID: openedModelID,
                            expressID,
                            geometryExpressID: placedGeom.geometryExpressID,
                            color: placedGeom.color ? { x: placedGeom.color.x, y: placedGeom.color.y, z: placedGeom.color.z, w: placedGeom.color.w } : null,
                            flatTransformation: Array.from(placedGeom.flatTransformation),
                            pos: pos.buffer,
                            norm: norm.buffer,
                            indices: indices.buffer
                        };
                        
                        pendingFlush.push(geomMsg);
                        pendingTransfers.push(pos.buffer as ArrayBuffer, norm.buffer as ArrayBuffer, indices.buffer as ArrayBuffer);
                    }
                } catch (e) {
                    console.warn(`[Worker] Failed parsing geometry for expressID ${flatMesh?.expressID}:`, e);
                }
                
                streamedMeshCount++;
                
                // Incremental flush — emit a batch so the main thread can render progressively
                if (pendingFlush.length >= FLUSH_EVERY) {
                    (self as any).postMessage(
                        { type: 'GEOMETRY_BATCH', data: { modelID: openedModelID, geometries: pendingFlush } },
                        pendingTransfers
                    );
                    pendingFlush = [];
                    pendingTransfers = [];
                }
                
                // Progress update every 5% of total
                if (totalMeshCount > 0) {
                    const pct = Math.round((streamedMeshCount / totalMeshCount) * 100);
                    if (pct - lastProgressReport >= 5) {
                        lastProgressReport = pct;
                        const scaled = 82 + Math.round(pct * 0.13); // 82-95% range
                        self.postMessage({ type: 'PROGRESS', progress: scaled, message: `几何体生成 ${pct}%…` });
                    }
                }
            });
            
            // Flush remaining
            if (pendingFlush.length > 0) {
                (self as any).postMessage(
                    { type: 'GEOMETRY_BATCH', data: { modelID: openedModelID, geometries: pendingFlush } },
                    pendingTransfers
                );
                pendingFlush = [];
                pendingTransfers = [];
            }
            
            // Build spatial structure
            self.postMessage({ type: 'PROCESSING', message: '构建空间树结构...' });
            const structure = await buildSpatialTree(openedModelID, meta);
            
            // Send maps to main thread so it has immediate access for queries or syncing
            const parentMapObj = Object.fromEntries(meta.parentMap);
            
            self.postMessage({
                type: 'LOAD_COMPLETE',
                data: {
                    modelID: openedModelID,
                    structure,
                    parentMap: parentMapObj
                }
            });
            
        } catch (err: any) {
            self.postMessage({ type: 'ERROR', message: `LOAD_FAILED: ${err.message}` });
        }
    }
    
    else if (type === 'LOAD_IFC_MODEL_BACKGROUND') {
        const { fileBuffer, modelID } = data;
        if (!isInitialized) {
            try {
                ifcApi.SetWasmPath(import.meta.env.BASE_URL + WASM_PATH);
                await ifcApi.Init();
                isInitialized = true;
            } catch (err: any) {
                self.postMessage({ type: 'ERROR', message: `INIT_BACKGROUND_FAILED: ${err.message}` });
                return;
            }
        }
        try {
            const dataArray = new Uint8Array(fileBuffer);
            const openedModelID = ifcApi.OpenModel(dataArray, { COORDINATE_TO_ORIGIN: true });
            mainToWebIfcModelID.set(modelID, openedModelID);
            
            const meta = {
                parentMap: new Map<string, string>(),
                propertyMaps: new Map<number, number[]>(),
                modelMeshExpressIDs: new Set<number>()
            };
            modelsMetadata.set(openedModelID, meta);
            
            // Build property map
            await buildPropertyMap(openedModelID, meta);
            
            // Collect all expressIDs for properties query
            ifcApi.StreamAllMeshes(openedModelID, (flatMesh: WebIFC.FlatMesh) => {
                meta.modelMeshExpressIDs.add(flatMesh.expressID);
            });
            
            console.log(`[Worker] Model ${modelID} properties loaded in background.`);
        } catch (err: any) {
            console.warn(`[Worker] Background model load failed:`, err);
        }
    }
    
    else if (type === 'GET_PROPERTIES') {
        const { modelID: originalModelID, expressID } = data;
        const modelID = mainToWebIfcModelID.get(originalModelID) ?? originalModelID;
        const meta = modelsMetadata.get(modelID);
        if (!meta) {
            self.postMessage({ type: 'PROPERTIES_RESULT', data: { expressID, modelID: originalModelID, properties: [], name: 'Unknown', type: 'Object' } });
            return;
        }
        
        try {
            const props = ifcApi.GetLine(modelID, expressID);
            const properties: any[] = [];
            
            if (props) {
                properties.push({ name: '构件类型', value: String(formatTypeName(props.is_a || 'Unknown')), setName: '基本信息' });
                properties.push({ name: 'Express ID', value: String(expressID), setName: '基本信息' });
                if (props.GlobalId && props.GlobalId.value) {
                    properties.push({ name: '全局唯一标识 (GUID)', value: String(props.GlobalId.value), setName: '基本信息' });
                }
                if (props.Name && props.Name.value) {
                    properties.push({ name: '构件名称', value: String(props.Name.value), setName: '基本信息' });
                }
                
                Object.keys(props).forEach(k => {
                    if (!['expressID', 'type', 'GlobalId', 'Name', 'is_a'].includes(k) && props[k]) {
                        let val = props[k];
                        if (val !== undefined && val !== null) {
                            properties.push({ name: k, value: parsePropertyValue(val), setName: '基本属性' });
                        }
                    }
                });
            }
            
            // Parent info
            try {
                const parentId = meta.parentMap.get(`${modelID}_${expressID}`);
                if (parentId) {
                    const pExpID = parseInt(parentId.split('_')[1], 10);
                    if (!isNaN(pExpID) && pExpID > 0) {
                        const parentProps = ifcApi.GetLine(modelID, pExpID);
                        if (parentProps) {
                            const pName = parentProps.Name?.value || parentProps.is_a || `Storey #${pExpID}`;
                            properties.push({ name: '所在空间', value: String(formatTypeName(pName)), setName: '基本信息' });
                        }
                    }
                }
            } catch (e) {}
            
            // Materials info
            try {
                const matRels = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
                for (let i = 0; i < matRels.size(); i++) {
                    const rel = ifcApi.GetLine(modelID, matRels.get(i));
                    if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
                        const isRelated = rel.RelatedObjects.some((o: any) => o.value === expressID);
                        if (isRelated && rel.RelatingMaterial) {
                            const mat = ifcApi.GetLine(modelID, rel.RelatingMaterial.value);
                            if (mat) {
                                let matName = mat.Name?.value || mat.is_a || 'Material';
                                if (mat.MaterialParts && Array.isArray(mat.MaterialParts)) {
                                    const parts: string[] = [];
                                    for (const pt of mat.MaterialParts) {
                                        const pLine = ifcApi.GetLine(modelID, pt.value);
                                        if (pLine && pLine.Material) {
                                            const item = ifcApi.GetLine(modelID, pLine.Material.value);
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
            
            // Psets
            const psetIDs = meta.propertyMaps.get(expressID);
            if (psetIDs) {
                for (const pid of psetIDs) {
                    try {
                        const pset = ifcApi.GetLine(modelID, pid);
                        const setName = parsePropertyName(pset.Name) || 'Pset';
                        
                        if (pset.HasProperties && Array.isArray(pset.HasProperties)) {
                            for (const pr of pset.HasProperties) {
                                try {
                                    const p = ifcApi.GetLine(modelID, pr.value);
                                    const pName = parsePropertyName(p.Name);
                                    
                                    if (p.NominalValue !== undefined && p.NominalValue !== null) {
                                        const pVal = parsePropertyValue(p.NominalValue);
                                        properties.push({ name: pName, value: pVal, setName });
                                    } else if (p.EnumerationValues && Array.isArray(p.EnumerationValues)) {
                                        const vals = p.EnumerationValues.map((v: any) => parsePropertyValue(v)).filter(Boolean).join(', ');
                                        properties.push({ name: pName, value: vals, setName });
                                    } else if (p.LowerLimitValue !== undefined || p.UpperLimitValue !== undefined) {
                                        const lower = p.LowerLimitValue ? parsePropertyValue(p.LowerLimitValue) : '无下限';
                                        const upper = p.UpperLimitValue ? parsePropertyValue(p.UpperLimitValue) : '无上限';
                                        properties.push({ name: pName, value: `${lower} ~ ${upper}`, setName });
                                    } else if (p.ListValues && Array.isArray(p.ListValues)) {
                                        const vals = p.ListValues.map((v: any) => parsePropertyValue(v)).filter(Boolean).join(', ');
                                        properties.push({ name: pName, value: vals, setName });
                                    }
                                } catch (e) {}
                            }
                        }
                        
                        if (pset.Quantities && Array.isArray(pset.Quantities)) {
                            for (const q of pset.Quantities) {
                                try {
                                    const p = ifcApi.GetLine(modelID, q.value);
                                    const pName = parsePropertyName(p.Name);
                                    const val = p.LengthValue ?? p.AreaValue ?? p.VolumeValue ?? p.CountValue ?? p.WeightValue ?? p.TimeValue ?? p.QuantityValue;
                                    if (val !== undefined && val !== null) {
                                        properties.push({ name: pName, value: parsePropertyValue(val), setName });
                                    }
                                } catch (e) {}
                            }
                        }
                    } catch (e) {}
                }
            }
            
            self.postMessage({
                type: 'PROPERTIES_RESULT',
                data: {
                    expressID,
                    modelID: originalModelID,
                    properties,
                    name: props?.Name?.value || `${formatTypeName(props?.is_a || 'Object')} #${expressID}`,
                    type: props?.is_a || 'Object'
                }
            });
        } catch (err: any) {
            self.postMessage({ type: 'ERROR', message: `GET_PROPERTIES_FAILED for #${expressID}: ${err.message}` });
        }
    }
    
    else if (type === 'GET_HIGHLIGHT_GEOMETRY') {
        const { modelID, expressID } = data;
        try {
            const flatMesh = ifcApi.GetFlatMesh(modelID, expressID);
            const geometries: any[] = [];
            const size = flatMesh.geometries.size();
            
            for (let i = 0; i < size; i++) {
                const placedGeom = flatMesh.geometries.get(i);
                const geomData = ifcApi.GetGeometry(modelID, placedGeom.geometryExpressID);
                if (!geomData) continue;
                
                const verts = ifcApi.GetVertexArray(geomData.GetVertexData(), geomData.GetVertexDataSize());
                const indices = ifcApi.GetIndexArray(geomData.GetIndexData(), geomData.GetIndexDataSize());
                
                if (verts.length === 0 || indices.length === 0) continue;
                
                const numVerts = verts.length / 6;
                const pos = new Float32Array(numVerts * 3);
                
                let idx3 = 0;
                let idx6 = 0;
                for (let j = 0; j < numVerts; j++) {
                    pos[idx3] = verts[idx6];
                    pos[idx3+1] = verts[idx6+1];
                    pos[idx3+2] = verts[idx6+2];
                    idx3 += 3;
                    idx6 += 6;
                }
                
                geometries.push({
                    flatTransformation: Array.from(placedGeom.flatTransformation),
                    pos: pos.buffer as ArrayBuffer,
                    indices: indices.buffer as ArrayBuffer
                });
            }
            
            const transferables = geometries.flatMap(g => [g.pos, g.indices]);
            (self as any).postMessage({
                type: 'HIGHLIGHT_GEOMETRY_RESULT',
                data: { modelID, expressID, geometries }
            }, transferables);
            
        } catch (err: any) {
            self.postMessage({ type: 'ERROR', message: `GET_HIGHLIGHT_FAILED: ${err.message}` });
        }
    }
    
    else if (type === 'CLEAR_MODEL') {
        const { modelID } = data;
        const webIfcID = mainToWebIfcModelID.get(modelID) ?? modelID;
        try {
            ifcApi.CloseModel(webIfcID);
            modelsMetadata.delete(webIfcID);
            mainToWebIfcModelID.delete(modelID);
        } catch (e) {}
    }
    
    else if (type === 'GENERATE_REPORT') {
        let { modelID, config } = data;
        modelID = mainToWebIfcModelID.get(modelID) ?? modelID;
        const meta = modelsMetadata.get(modelID);
        if (!meta) {
            self.postMessage({ type: 'REPORT_RESULT_FAILED', error: '模型数据未找到或未加载完成' });
            return;
        }

        try {
            // 1. Pre-build materials map for O(1) lookup
            const elementMaterials = new Map<number, string>();
            try {
                const matRels = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
                for (let i = 0; i < matRels.size(); i++) {
                    const rel = ifcApi.GetLine(modelID, matRels.get(i));
                    if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects) && rel.RelatingMaterial) {
                        const mat = ifcApi.GetLine(modelID, rel.RelatingMaterial.value);
                        if (mat) {
                            let matName = mat.Name?.value || mat.is_a || 'Material';
                            if (mat.MaterialParts && Array.isArray(mat.MaterialParts)) {
                                const parts: string[] = [];
                                for (const pt of mat.MaterialParts) {
                                    const pLine = ifcApi.GetLine(modelID, pt.value);
                                    if (pLine && pLine.Material) {
                                        const item = ifcApi.GetLine(modelID, pLine.Material.value);
                                        if (item && item.Name) parts.push(item.Name.value);
                                    }
                                }
                                if (parts.length > 0) matName = parts.join(' + ');
                            }
                            rel.RelatedObjects.forEach((objRef: any) => {
                                elementMaterials.set(objRef.value, matName);
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn("Worker properties report build materials map fail:", e);
            }

            const groupRows = new Map<string, { count: number; metrics: Record<string, number[]>; expressIDs: number[] }>();
            const resultRows: any[] = [];

            // 2. Iterate elements and resolve properties
            meta.modelMeshExpressIDs.forEach((expressID) => {
                let props: any;
                try {
                    props = ifcApi.GetLine(modelID, expressID);
                } catch (e) { return; }
                if (!props) return;

                const elemType = formatTypeName(props.is_a || 'Unknown');
                const elemName = props.Name?.value || '';

                // Get space name
                let spaceName = '未分配空间';
                try {
                    const parentKey = meta.parentMap.get(`${modelID}_${expressID}`);
                    if (parentKey) {
                        const parentID = parseInt(parentKey.split('_')[1], 10);
                        const pLine = ifcApi.GetLine(modelID, parentID);
                        if (pLine) {
                            spaceName = pLine.Name?.value || formatTypeName(pLine.is_a) || `空间 #${parentID}`;
                        }
                    }
                } catch (e) {}

                const materialName = elementMaterials.get(expressID) || '未指定材质';

                // Flatten element properties for easy filtering & grouping matching
                const elementProps: Record<string, any> = {
                    'type': elemType,
                    '构件类型': elemType,
                    'name': elemName,
                    '构件名称': elemName,
                    'space': spaceName,
                    '所在空间': spaceName,
                    'material': materialName,
                    '材质': materialName,
                    'expressid': String(expressID),
                    'express id': String(expressID)
                };

                // Add properties from Psets
                const psetIDs = meta.propertyMaps.get(expressID);
                if (psetIDs) {
                    for (const pid of psetIDs) {
                        try {
                            const pset = ifcApi.GetLine(modelID, pid);
                            const setName = parsePropertyName(pset.Name) || 'Pset';
                            
                            if (pset.HasProperties && Array.isArray(pset.HasProperties)) {
                                for (const pr of pset.HasProperties) {
                                    try {
                                        const p = ifcApi.GetLine(modelID, pr.value);
                                        const pName = parsePropertyName(p.Name);
                                        if (p.NominalValue !== undefined && p.NominalValue !== null) {
                                            const pVal = parsePropertyValue(p.NominalValue);
                                            const keyFull = `${setName}.${pName}`;
                                            elementProps[pName.toLowerCase()] = pVal;
                                            elementProps[keyFull.toLowerCase()] = pVal;
                                            elementProps[pName] = pVal;
                                            elementProps[keyFull] = pVal;
                                        }
                                    } catch (e) {}
                                }
                            }
                            if (pset.Quantities && Array.isArray(pset.Quantities)) {
                                for (const q of pset.Quantities) {
                                    try {
                                        const p = ifcApi.GetLine(modelID, q.value);
                                        const pName = parsePropertyName(p.Name);
                                        const val = p.LengthValue ?? p.AreaValue ?? p.VolumeValue ?? p.CountValue ?? p.WeightValue ?? p.TimeValue ?? p.QuantityValue;
                                        if (val !== undefined && val !== null) {
                                            const pVal = parsePropertyValue(val);
                                            const keyFull = `${setName}.${pName}`;
                                            elementProps[pName.toLowerCase()] = pVal;
                                            elementProps[keyFull.toLowerCase()] = pVal;
                                            elementProps[pName] = pVal;
                                            elementProps[keyFull] = pVal;
                                        }
                                    } catch (e) {}
                                }
                            }
                        } catch (e) {}
                    }
                }

                // 3. Resolve Fields for Flat Row
                const row: any = {
                    expressID: expressID
                };

                let hasAnyData = false;
                for (const col of config.columns) {
                    const candidates = col.fieldMatch.split(',').map(c => c.trim().toLowerCase());
                    let finalVal: any = '-';
                    for (const cand of candidates) {
                        const rawVal = elementProps[cand];
                        if (rawVal !== undefined && rawVal !== null) {
                            finalVal = rawVal;
                            hasAnyData = true;
                            break;
                        }
                    }
                    row[col.id] = finalVal;
                }
                
                if (hasAnyData || config.columns.length === 0) {
                    resultRows.push(row);
                }
            });

            self.postMessage({ type: 'REPORT_RESULT', data: { rows: resultRows } });
        } catch (err: any) {
            self.postMessage({ type: 'REPORT_RESULT_FAILED', error: err.message });
        }
    }
    
    else if (type === 'GET_ALL_PROPERTY_KEYS') {
        let { modelID } = data;
        modelID = mainToWebIfcModelID.get(modelID) ?? modelID;
        const meta = modelsMetadata.get(modelID);
        if (!meta) {
            self.postMessage({ type: 'PROPERTY_KEYS_RESULT', data: { keys: [] } });
            return;
        }

        try {
            const keys = new Set<string>();
            
            // Add standard ones
            keys.add('构件类型');
            keys.add('构件名称');
            keys.add('所在空间');
            keys.add('材质');
            keys.add('Express ID');

            // Retrieve all PropertySets in the model
            try {
                const psetIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROPERTYSET);
                for (let i = 0; i < psetIDs.size(); i++) {
                    const pid = psetIDs.get(i);
                    try {
                        const pset = ifcApi.GetLine(modelID, pid);
                        const setName = parsePropertyName(pset.Name);
                        if (setName && pset.HasProperties && Array.isArray(pset.HasProperties)) {
                            for (const pr of pset.HasProperties) {
                                try {
                                    const p = ifcApi.GetLine(modelID, pr.value);
                                    const pName = parsePropertyName(p.Name);
                                    if (pName) {
                                        keys.add(pName);
                                        keys.add(`${setName}.${pName}`);
                                    }
                                } catch (e) {}
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}

            // Retrieve all ElementQuantities in the model
            try {
                const qtyIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCELEMENTQUANTITY);
                for (let i = 0; i < qtyIDs.size(); i++) {
                    const qid = qtyIDs.get(i);
                    try {
                        const qty = ifcApi.GetLine(modelID, qid);
                        const setName = parsePropertyName(qty.Name);
                        if (setName && qty.Quantities && Array.isArray(qty.Quantities)) {
                            for (const q of qty.Quantities) {
                                try {
                                    const p = ifcApi.GetLine(modelID, q.value);
                                    const pName = parsePropertyName(p.Name);
                                    if (pName) {
                                        keys.add(pName);
                                        keys.add(`${setName}.${pName}`);
                                    }
                                } catch (e) {}
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}

            self.postMessage({ type: 'PROPERTY_KEYS_RESULT', data: { keys: Array.from(keys) } });
        } catch (e) {
            self.postMessage({ type: 'PROPERTY_KEYS_RESULT', data: { keys: ['构件类型', '构件名称', '所在空间', '材质', 'Express ID'] } });
        }
    }
};

async function buildPropertyMap(modelID: number, meta: { parentMap: Map<string, string>, propertyMaps: Map<number, number[]>, modelMeshExpressIDs: Set<number> }) {
    try {
        const map = meta.propertyMaps;
        const typeMap = new Map<number, number>();
        
        // RelDefinesByProperties
        const relProps = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
        for (let i = 0; i < relProps.size(); i++) {
            const id = relProps.get(i);
            const rel = ifcApi.GetLine(modelID, id);
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
        
        // RelDefinesByType
        const relTypes = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYTYPE);
        for (let i = 0; i < relTypes.size(); i++) {
            const id = relTypes.get(i);
            const rel = ifcApi.GetLine(modelID, id);
            if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects) && rel.RelatingType) {
                const typeID = rel.RelatingType.value;
                rel.RelatedObjects.forEach((objRef: any) => {
                    const objID = objRef.value;
                    typeMap.set(objID, typeID);
                });
            }
        }
        
        // Inherit direct property sets on type objects (IfcTypeObject has HasPropertySets)
        const processedTypes = new Set<number>(typeMap.values());
        for (const typeID of processedTypes) {
            try {
                const typeObj = ifcApi.GetLine(modelID, typeID);
                if (typeObj && typeObj.HasPropertySets && Array.isArray(typeObj.HasPropertySets)) {
                    if (!map.has(typeID)) map.set(typeID, []);
                    const typePsets = map.get(typeID)!;
                    typeObj.HasPropertySets.forEach((psetRef: any) => {
                        const psetID = psetRef.value;
                        if (psetID && !typePsets.includes(psetID)) {
                            typePsets.push(psetID);
                        }
                    });
                }
            } catch (e) {}
        }
        
        // Inherit type properties to instance elements
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
    } catch (e) {
        console.warn("Worker Property Map generation issue", e);
    }
}

async function buildSpatialTree(modelID: number, meta: { parentMap: Map<string, string>, propertyMaps: Map<number, number[]>, modelMeshExpressIDs: Set<number> }): Promise<any> {
    const typeMap = new Map<number, string>();
    const types = [WebIFC.IFCPROJECT, WebIFC.IFCSITE, WebIFC.IFCBUILDING, WebIFC.IFCBUILDINGSTOREY];
    for (const type of types) {
        const lines = ifcApi.GetLineIDsWithType(modelID, type);
        for (let i = 0; i < lines.size(); i++) {
            typeMap.set(lines.get(i), getTypeName(type));
        }
    }
    
    const aggregates = new Map<number, number[]>();
    const contains = new Map<number, number[]>();
    
    const aggLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES);
    for (let i = 0; i < aggLines.size(); i++) {
        const rel = ifcApi.GetLine(modelID, aggLines.get(i));
        if (!rel.RelatingObject) continue;
        const parentID = rel.RelatingObject.value;
        if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
            rel.RelatedObjects.forEach((r: any) => {
                if (!aggregates.has(parentID)) aggregates.set(parentID, []);
                aggregates.get(parentID)!.push(r.value);
            });
        }
    }
    
    const contLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < contLines.size(); i++) {
        const rel = ifcApi.GetLine(modelID, contLines.get(i));
        if (!rel.RelatingStructure) continue;
        const parentID = rel.RelatingStructure.value;
        if (rel.RelatedElements && Array.isArray(rel.RelatedElements)) {
            rel.RelatedElements.forEach((r: any) => {
                if (!contains.has(parentID)) contains.set(parentID, []);
                contains.get(parentID)!.push(r.value);
            });
        }
    }
    
    const nestsLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELNESTS);
    for (let i = 0; i < nestsLines.size(); i++) {
        const rel = ifcApi.GetLine(modelID, nestsLines.get(i));
        if (!rel.RelatingObject) continue;
        const parentID = rel.RelatingObject.value;
        if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
            rel.RelatedObjects.forEach((r: any) => {
                if (!aggregates.has(parentID)) aggregates.set(parentID, []);
                aggregates.get(parentID)!.push(r.value);
            });
        }
    }
    
    const visitedExpressIDs = new Set<number>();
    const projects = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT);
    const projectID = projects.size() > 0 ? projects.get(0) : 0;
    
    const buildNode = async (id: number, parentIdStr?: string): Promise<any> => {
        visitedExpressIDs.add(id);
        const nodeIdStr = `${modelID}_${id}`;
        if (parentIdStr) {
            meta.parentMap.set(nodeIdStr, parentIdStr);
        }
        
        const props = ifcApi.GetLine(modelID, id);
        const type = typeMap.get(id) || props.is_a || 'Object';
        
        const node: any = {
            expressID: id,
            type: type,
            name: props.Name?.value || `${formatTypeName(type)} #${id}`,
            children: []
        };
        
        const childIDs = aggregates.get(id) || [];
        for (const childID of childIDs) {
            node.children.push(await buildNode(childID, nodeIdStr));
        }
        
        const elemIDs = contains.get(id) || [];
        for (const elemID of elemIDs) {
            node.children.push(await buildNode(elemID, nodeIdStr));
        }
        
        return node;
    };
    
    let rootNode: any;
    if (projectID !== 0) {
        rootNode = await buildNode(projectID);
    } else {
        const alternativeClasses = [WebIFC.IFCSITE, WebIFC.IFCBUILDING, WebIFC.IFCBUILDINGSTOREY];
        let altID = 0;
        for (const cls of alternativeClasses) {
            const ids = ifcApi.GetLineIDsWithType(modelID, cls);
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
    
    const loadedIDs = meta.modelMeshExpressIDs;
    const unassignedNodes: any[] = [];
    
    for (const expressID of loadedIDs) {
        if (!visitedExpressIDs.has(expressID)) {
            try {
                const props = ifcApi.GetLine(modelID, expressID);
                const type = props.is_a || 'Object';
                unassignedNodes.push({
                    expressID,
                    type,
                    name: props.Name?.value || `${formatTypeName(type)} #${expressID}`,
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
        const groupMap = new Map<string, any[]>();
        unassignedNodes.forEach(node => {
            if (!groupMap.has(node.type)) {
                groupMap.set(node.type, []);
            }
            groupMap.get(node.type)!.push(node);
        });
        
        const groupChildren: any[] = [];
        let virtualID = -500;
        const rootIdStr = `${modelID}_${rootNode.expressID}`;
        
        groupMap.forEach((children, type) => {
            const typeFolderID = virtualID--;
            const folderIdStr = `${modelID}_${typeFolderID}`;
            meta.parentMap.set(folderIdStr, rootIdStr);
            
            children.forEach(c => {
                meta.parentMap.set(`${modelID}_${c.expressID}`, folderIdStr);
            });
            
            groupChildren.push({
                expressID: typeFolderID,
                type: 'Group',
                name: `${formatTypeName(type)} (${children.length})`,
                children
            });
        });
        
        const unassignedGroupID = -100;
        const unassignedGroupStr = `${modelID}_${unassignedGroupID}`;
        meta.parentMap.set(unassignedGroupStr, rootIdStr);
        groupChildren.forEach(folder => {
            meta.parentMap.set(`${modelID}_${folder.expressID}`, unassignedGroupStr);
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
