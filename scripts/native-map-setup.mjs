export default async ({frame})=>{
 await frame.evaluate(()=>{const a=window.__ANTVR.app;a.run.jumpTo('kit');window.__ANTVR.act('open-kit');});
 await frame.waitForFunction(()=>window.__ANTVR.world.scene.getObjectByName('Neighbourhood Map')?.visible);
 return frame.evaluate(()=>{const o=window.__ANTVR.world.scene.getObjectByName('Neighbourhood Map');window.__ANTMapHome=o.getWorldPosition(o.position.clone()).toArray();return {home:window.__ANTMapHome,snapshot:window.__ANTVR.snapshot()};});
};

