import{j as e}from"./vendor-BJvD0mLf.js";import{u as w,e as j,i as n}from"./index-C0a_dQw4.js";import{R as d,t as z,a as x,M as S,D as $}from"./lucide-vendor-8iza9X3T.js";import"./three-vendor-DNYFT8s_.js";const E=({measurements:s,onClear:l})=>{const{t}=w(),m=r=>{var o;(o=n.measurementManager)==null||o.deleteMeasurement(r),n.renderScene()},u=()=>{n.measurementManager&&(n.measurementManager.clear(),n.renderScene(),l&&l())},h=()=>{if(s.length===0)return;let r="";try{n.renderScene(),r=n.renderer.domElement.toDataURL("image/png")}catch(a){console.error("Failed to capture screenshot for report:",a)}const o=n.models.size===1?Array.from(n.models.values())[0].name:t.measureTips.combinedScene,b=new Date().toLocaleString(),g=`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>BIMVision Pro - ${t.measurement.reportTitle}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 35px; background: #f8fafc; }
        .card { background: #ffffff; border-radius: 14px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05); padding: 32px; max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 18px; margin-bottom: 26px; }
        .title { font-size: 22px; font-weight: 800; color: #1e3a8a; margin: 0; letter-spacing: -0.02em; }
        .meta-info { font-size: 12px; color: #64748b; text-align: right; line-height: 1.6; }
        .section-title { font-size: 14px; font-weight: 700; color: #334155; margin-top: 28px; margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 13px; }
        th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; color: #475569; font-weight: 700; border-top: 1px solid #e2e8f0; }
        .value-text {  font-weight: 700; color: #0f172a; }
        .screenshot-container { width: 100%; border-radius: 10px; overflow: hidden; border: 1px solid #cbd5e1; background: #0f172a; margin-top: 14px; text-align: center; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
        .screenshot { max-width: 100%; max-height: 420px; display: block; margin: 0 auto; }
        .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        .print-btn { padding: 9px 18px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; box-shadow: 0 4px 6px -1px rgba(59,130,246,0.25); transition: all 0.15s ease; }
        .print-btn:hover { background: #2563eb; transform: translateY(-1px); }
        @media print {
            body { background: #ffffff; padding: 0; }
            .card { box-shadow: none; border: none; padding: 0; max-width: 100%; }
            .print-btn { display: none; }
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div>
                <h1 class="title">BIMVision Pro ${t.measurement.reportTitle}</h1>
                <div style="font-size: 13px; color: #64748b; margin-top: 4px; font-weight: 500;">${t.measurement.fileName}: ${o}</div>
            </div>
            <div class="meta-info">
                <div>${t.measurement.exportTime}: ${b}</div>
                <div>${t.measurement.reportNo}: BIM-${Date.now().toString().slice(-6)}</div>
            </div>
        </div>

        <div class="section-title">\u{1F4CA} ${t.measurement.measureRecords}</div>
        <table>
            <thead>
                <tr>
                    <th style="width: 80px;">${t.reportExport.index}</th>
                    <th>${t.reportExport.type}</th>
                    <th>${t.reportExport.value}</th>
                </tr>
            </thead>
            <tbody>
                ${s.map((a,v)=>`
                <tr>
                    <td>${v+1}</td>
                    <td style="font-weight: 600;">${c(a.type)}</td>
                    <td class="value-text">${a.value.replace(/\n/g,"<br/>")}${a.type==="DISTANCE"&&a.deltas?`<br/><span style="font-size:11px;font-weight:400;color:#64748b;">\u0394X: ${a.deltas.x.toFixed(3)}  \u0394Y: ${a.deltas.y.toFixed(3)}  \u0394Z: ${a.deltas.z.toFixed(3)}</span>`:""}</td>
                </tr>
                `).join("")}
            </tbody>
        </table>

        ${r?`
        <div class="section-title">\u{1F5BC}\uFE0F ${t.measurement.snapshot}</div>
        <div class="screenshot-container">
            <img class="screenshot" src="${r}" alt="BIM Snapshot" />
        </div>
        `:""}

        <div style="margin-top: 28px; text-align: right;">
            <button class="print-btn" onclick="window.print()">\u{1F5A8}\uFE0F ${t.measurement.printPdf}</button>
        </div>

        <div class="footer">
            ${t.measurement.footer}
        </div>
    </div>
</body>
</html>
        `,y=new Blob([g],{type:"text/html;charset=utf-8;"}),p=URL.createObjectURL(y),i=document.createElement("a");i.href=p,i.setAttribute("download",`BIM-Measurement-Report-${Date.now().toString().slice(-5)}.html`),document.body.appendChild(i),i.click(),document.body.removeChild(i),URL.revokeObjectURL(p)},f=r=>{switch(r){case"DISTANCE":return e.jsx(d,{size:14});case"ANGLE":return e.jsx($,{size:14});case"COORDINATE":return e.jsx(S,{size:14});default:return e.jsx(d,{size:14})}},c=r=>{switch(r){case"DISTANCE":return t.measurement.distance;case"ANGLE":return t.measurement.angle;case"COORDINATE":return t.measurement.coordinate;default:return r}};return s.length===0?e.jsx("div",{className:"h-full flex flex-col panel-content",children:e.jsxs("div",{className:"empty-state h-full",children:[e.jsx("div",{style:{width:40,height:40,borderRadius:"var(--radius-lg)",background:"var(--surface-2)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8},children:e.jsx(d,{size:18,style:{color:"var(--text-muted)"}})}),e.jsx("span",{className:"empty-state-title",children:t.measurement.empty}),e.jsx("span",{className:"empty-state-desc",children:t.measurement.emptyDesc})]})}):e.jsxs("div",{className:"h-full flex flex-col panel-content select-none",children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",borderBottom:"1px solid var(--border-soft)",background:"var(--surface-1)"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:6},children:[e.jsx("span",{style:{fontSize:11,fontWeight:700,color:"var(--text-secondary)"},children:t.measurement.panelTitle}),e.jsx("span",{style:{fontSize:10,fontWeight:700,color:"var(--brand)",background:"var(--brand-soft)",border:"1px solid var(--brand-border)",borderRadius:99,padding:"0 6px",lineHeight:"18px"},children:s.length})]}),e.jsx("button",{onClick:h,className:"icon-button",title:t.measurement.exportReport,style:{width:24,height:24},children:e.jsx(z,{size:12})})]}),e.jsx("div",{style:{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:8},children:s.map(r=>e.jsxs("div",{style:{display:"flex",gap:10,padding:"10px 12px",background:"var(--surface-0)",border:"1px solid var(--border)",borderRadius:"var(--radius-md)",position:"relative",transition:"border-color 0.15s, box-shadow 0.15s"},onMouseEnter:o=>{o.currentTarget.style.borderColor="var(--brand-border)",o.currentTarget.style.boxShadow="var(--shadow-sm)"},onMouseLeave:o=>{o.currentTarget.style.borderColor="var(--border)",o.currentTarget.style.boxShadow="none"},onDoubleClick:()=>{j.emit("zoom-to-measurement",{id:r.id})},title:t.measurement.locateHint,children:[e.jsx("div",{style:{width:28,height:28,borderRadius:"var(--radius-sm)",background:"var(--brand-soft)",border:"1px solid var(--brand-border)",color:"var(--brand)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},children:f(r.type)}),e.jsxs("div",{style:{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:2},children:[e.jsx("span",{style:{fontSize:11,fontWeight:700,color:"var(--text-secondary)"},children:c(r.type)}),e.jsx("span",{style:{fontSize:13,fontWeight:700,color:"var(--text-primary)",whiteSpace:"pre-wrap"},children:r.value}),r.type==="DISTANCE"&&r.deltas&&e.jsxs("span",{style:{fontSize:10,color:"var(--text-muted)",fontWeight:400,fontFamily:"monospace"},children:["\u0394X: ",r.deltas.x.toFixed(3),"  \u0394Y: ",r.deltas.y.toFixed(3),"  \u0394Z: ",r.deltas.z.toFixed(3)]})]}),e.jsx("button",{onClick:()=>m(r.id),className:"icon-button danger-button",title:t.measurement.deleteSingle,style:{alignSelf:"center",width:24,height:24},children:e.jsx(x,{size:12})})]},r.id))}),e.jsx("div",{style:{padding:"10px 12px",borderTop:"1px solid var(--border)",background:"var(--surface-1)"},children:e.jsxs("button",{onClick:u,className:"danger-primary-button",style:{width:"100%",minHeight:30,display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontSize:11},children:[e.jsx(x,{size:13}),e.jsx("span",{children:t.measurement.clearAll})]})})]})};export{E as default};
