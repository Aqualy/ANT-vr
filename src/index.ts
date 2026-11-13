import './style.css';
import { World, Color, AmbientLight, DirectionalLight, NoToneMapping } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { loadPrintFonts } from './art/art.js';
import { AntApp, interactionSystem } from './app.js';
import type { StepId, ActionPayload } from './run.js';

const showError=(message:string)=>{document.getElementById('error-message')!.textContent=message;document.getElementById('error')!.hidden=false;};
try {
  await loadPrintFonts();
  const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions);
  world.scene.background=new Color(0xdddddd);world.renderer.toneMapping=NoToneMapping;
  world.renderer.shadowMap.enabled=false;
  world.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));world.renderer.xr.setFramebufferScaleFactor(.85);world.renderer.xr.setFoveation(1);
  world.createTransformEntity(new AmbientLight(0xffffff,1.6));
  const light=new DirectionalLight(0xffffff,1.8);light.position.set(-2,5,2);world.createTransformEntity(light);
  const app=new AntApp(world);world.registerSystem(interactionSystem(app));
  const api={ready:true,world,app,start:()=>app.start(),act:(id:string,payload?:ActionPayload)=>app.dispatch(id,payload),runStep:()=>app.dispatch('primary'),completeStep:()=>app.run.completeStep(),jumpTo:(step:StepId|number)=>app.run.jumpTo(step),reset:()=>app.restart(),snapshot:()=>app.snapshot()};
  Object.assign(window,{__ANTVR:api});
  (document.getElementById('desktop') as HTMLButtonElement).disabled=false;
  const supported=await navigator.xr?.isSessionSupported('immersive-vr').catch(()=>false);
  (document.getElementById('enter-vr') as HTMLButtonElement).disabled=!supported;
  document.getElementById('xr-status')!.textContent=supported?'Ready for your headset. Enter VR when you’re comfortable.':'VR is not available in this browser. The complete journey also works on your screen.';
  document.getElementById('ready')!.textContent='Ready when you are';document.getElementById('ready')!.classList.add('loaded');
  world.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();app.run.pause();showError('The browser paused the 3D view. Reload to return to your neighbourhood.');});
  if(import.meta.hot)import.meta.hot.dispose(()=>{app.dispose();world.destroy();});
  window.addEventListener('pagehide',()=>{app.dispose();world.destroy();},{once:true});
}catch(error){console.error(error);showError('The neighbourhood could not load. Check your connection, then try again.');}
