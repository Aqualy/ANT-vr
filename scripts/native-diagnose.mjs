export default async ({frame})=>frame.evaluate(()=>{
 const a=window.__ANTVR.app,w=a.world,o=w.scene.getObjectByName('Primary action'),ray=w.player.raySpaces.right;
 window.__ANTEvents=[];for(const name of ['pointerover','pointerdown','click','pointerup'])o.addEventListener(name,e=>window.__ANTEvents.push({name,type:e.pointerType}));
 const q=ray.quaternion.clone();ray.getWorldQuaternion(q);const pos=ray.position.clone();ray.getWorldPosition(pos);const dir=pos.clone().set(0,0,-1).applyQuaternion(q);
 return {target:o.getWorldPosition(o.position.clone()).toArray(),ray:{pos:pos.toArray(),dir:dir.toArray()},object:{pointerEvents:o.pointerEvents,pointerEventsType:o.pointerEventsType,visible:o.visible,userData:o.userData},worldKeys:Object.keys(w)};
});

