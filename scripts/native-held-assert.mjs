import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import path from 'node:path';
export default async ({frame,workspaceRoot})=>{
 const result=await frame.evaluate(()=>{const w=window.__ANTVR.world,g=w.systems.find(s=>s.constructor.name==='GrabSystem');const e=[...g.queries.oneHandGrabbables.entities].find(e=>e.object3D?.name==='Neighbourhood Map');const p=e.object3D.getWorldPosition(e.object3D.position.clone()).toArray();return {holder:g.getHolderHand(e),position:p,home:window.__ANTMapHome,snapshot:window.__ANTVR.snapshot()};});
 assert.ok(result.holder==='right'||result.holder==='left');assert.equal(result.snapshot.state.mapTaken,true);assert.ok(Math.hypot(...result.position.map((v,i)=>v-result.home[i]))>.1);
 await writeFile(path.join(workspaceRoot,'evidence/native/grab-held-'+result.holder+'.json'),JSON.stringify({passed:true,...result},null,2));return {passed:true,holder:result.holder,position:result.position,mapTaken:true};
};

