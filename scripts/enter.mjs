export default async ({frame}) => {
 await frame.getByRole('button',{name:'Enter VR',exact:false}).click();
 await frame.waitForFunction(()=>window.__ANTVR?.snapshot().xr, null, {timeout:30000});
 return frame.evaluate(()=>({snapshot:window.__ANTVR.snapshot(),session:window.__ANTVR.world.renderer.xr.getSession()?.visibilityState}));
};
