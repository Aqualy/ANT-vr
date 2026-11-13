export default async ({frame})=>frame.evaluate(async()=>{
 const w=window.__ANTVR.world;const sdk=await import('/node_modules/@iwsdk/core/dist/index.js');const o=w.scene.getObjectByName('Primary action'),ray=w.player.raySpaces.right;
 const r=new sdk.Raycaster();const q=ray.getWorldQuaternion(new sdk.Quaternion());r.set(ray.getWorldPosition(new sdk.Vector3()),new sdk.Vector3(0,0,-1).applyQuaternion(q));
 return {hits:r.intersectObject(o).map(h=>({name:h.object.name,distance:h.distance})),desc:w.scene.rayDescendants?.map(o=>o.name),visibility:w.visibilityState.peek(),xrKeys:Object.keys(w.input.xr),pointers:Object.keys(w.input.xr.multiPointers.right??{}),sources:[...w.renderer.xr.getSession().inputSources].map(s=>({hand:s.handedness,profiles:s.profiles,buttons:s.gamepad?.buttons.map(b=>b.value)}))};
});
