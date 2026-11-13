import { enter } from './emulator-common.mjs';
export default async ({frame})=>{ await enter(frame);
 await frame.evaluate(()=>{const a=window.__ANTVR.app; if(window.__ANTNativeRestore){a.run.update=window.__ANTNativeRestore;delete window.__ANTNativeRestore;} window.__ANTVR.reset();window.__ANTNativeRestore=a.run.update.bind(a.run);a.run.update=()=>{};});
 return frame.evaluate(()=>{const o=window.__ANTVR.world.scene.getObjectByName('Primary action');return {target:o.getWorldPosition(o.position.clone()).toArray(),snapshot:window.__ANTVR.snapshot(),method:'Native input isolated from auto-assist; no timing claim'};});
};

