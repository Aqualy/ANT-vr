import assert from 'node:assert/strict';import{writeFile}from'node:fs/promises';import path from'node:path';
export default async({frame,workspaceRoot})=>{
 await new Promise(r=>setTimeout(r,1000));const s=await frame.evaluate(()=>{const w=window.__ANTVR.world,g=w.systems.find(s=>s.constructor.name==='GrabSystem');const e=[...g.queries.oneHandGrabbables.entities].find(e=>e.object3D?.name==='Neighbourhood Map');return{holder:g.getHolderHand(e),position:e.object3D.getWorldPosition(e.object3D.position.clone()).toArray(),home:window.__ANTMapHome};});assert.equal(s.holder,null);assert.ok(Math.hypot(...s.position.map((v,i)=>v-s.home[i]))<.02);await writeFile(path.join(workspaceRoot,'evidence/native/grab-return.json'),JSON.stringify({passed:true,...s},null,2));return{passed:true,...s};
};
