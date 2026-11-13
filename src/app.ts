import { createSystem, Pressed, Hovered, Grabbed, RayInteractable, PokeInteractable, Group, Vector3, Euler, Quaternion, type Entity, type World } from '@iwsdk/core';
import { ActionTarget, HeldPaper } from './components.js';
import { createTable, createEnvironment } from './scene-assets/ant.scene-asset.js';
import { createLabel, createProgress, type Label, type Progress } from './art/art.js';
import { JourneyScene, actionLabel, CHAPTER_Y, CONSOLE_TILT } from './journey-scene.js';
import { RunManager, STEPS, type ActionPayload, type StepId, type RunSnapshot } from './run.js';
import { SceneDirector } from './lifecycle.js';
import { PaperAudio, haptic } from './audio.js';

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
export class AntApp {
  readonly run=new RunManager();
  readonly audio=new PaperAudio();
  readonly anchor=new Group();
  private director=new SceneDirector<unknown>();
  private chapter?:JourneyScene;
  private chapterKey='';
  /** In-headset guidance and controls; the screen version uses the HTML overlay instead. */
  readonly hud=new Group();
  private hudEntity:Entity;
  private environment:Group;
  private instruction:Label;
  private eyebrow:Label;
  private chain:Progress;
  private diagnostics:Label;
  private controls:Label[]=[];
  private pending:{id:string;payload?:ActionPayload}|null=null;
  private debug=false;
  private started=false;
  private lastTick=performance.now();
  private statsTime=0;
  private frameCount=0;
  private lastStats={fps:0,calls:0,triangles:0,textures:0,geometries:0};
  private maxStats={calls:0,triangles:0,textures:0};
  private position=new Vector3();
  private rotation=new Quaternion();
  private direction=new Vector3();
  private changeOff:()=>void;
  private completeOff:()=>void;
  private disposers:(()=>void)[]=[];

  constructor(readonly world:World) {
    this.anchor.name='Reachable workspace'; const anchorEntity=world.createTransformEntity(this.anchor);
    const table=createTable();table.position.set(0,1.00,-.84);this.anchor.add(table);
    this.environment=createEnvironment();this.anchor.add(this.environment);
    // Entities keep their own parent chain: without it the controls stay behind when the workspace is recentred.
    this.hud.name='Headset guidance';this.anchor.add(this.hud);this.hudEntity=world.createTransformEntity(this.hud,anchorEntity);
    // Headline and eyebrow are set straight on the grey room, like type on the site's page.
    this.instruction=createLabel('',{width:1.36,height:.2,fontSize:.058,display:true,background:'#DDDDDD',radius:0,resolution:2048});
    this.instruction.mesh.position.set(0,1.72,-1.2);this.hud.add(this.instruction.mesh);
    this.eyebrow=createLabel('',{width:1.2,height:.05,fontSize:.03,background:'#DDDDDD',radius:0,tracking:.12});
    this.eyebrow.mesh.position.set(0,1.875,-1.2);this.hud.add(this.eyebrow.mesh);
    // A sloped strip along the front edge of the table: progress, then the chapter's own action behind it.
    this.chain=createProgress(STEPS.length);
    this.chain.mesh.position.set(0,1.016,-.426);this.chain.mesh.rotation.x=CONSOLE_TILT;this.hud.add(this.chain.mesh);
    this.diagnostics=createLabel('',{width:.75,height:.22,fontSize:.023,background:'#FFFFFF'});
    this.diagnostics.mesh.position.set(.85,1.2,-.86);this.diagnostics.mesh.rotation.y=-.3;this.diagnostics.mesh.visible=false;this.anchor.add(this.diagnostics.mesh);
    this.control('Skip step',-.56,1.024,-.44,'skip');
    this.control('Recenter',.56,1.024,-.44,'recenter');
    this.showHud(false);
    this.changeOff=this.run.onChange(s=>this.onChange(s));
    this.completeOff=this.run.onComplete(s=>{
      window.dispatchEvent(new CustomEvent('ant:complete',{detail:s}));
      console.info('ANT_RUN_COMPLETE',JSON.stringify({kind:'actual-runtime',...s,performance:this.maxStats}));
      this.audio.play('chime');
    });
    this.bindUI(); this.onChange(this.run.snapshot()); this.syncScene();
  }
  private control(text:string,x:number,y:number,z:number,id:string) {
    const p=createLabel(text,{width:.21,height:.06,fontSize:.024,background:'#DDDDDD'});p.mesh.name=text;p.mesh.position.set(x,y,z);p.mesh.rotation.x=CONSOLE_TILT;
    this.hud.add(p.mesh);const entity=this.world.createTransformEntity(p.mesh,this.hudEntity);entity.addComponent(RayInteractable).addComponent(PokeInteractable).addComponent(ActionTarget,{id});
    this.controls.push(p);this.disposers.push(()=>entity.dispose({disposeResources:false}));
  }
  private showHud(on:boolean){this.hud.visible=on;this.hud.position.y=on?0:-50;}
  queue(id:string,payload?:ActionPayload){if(!this.pending)this.pending={id,payload};}
  dispatch(id:string,payload:ActionPayload={}) {
    if(id==='skip'){this.run.skip();return;}
    if(id==='recenter'){this.recenter();return;}
    if(id==='drawing')return;
    if(id==='primary'){
      if(this.run.finished){this.restart();return;}
      id=this.run.action?.id??'';
    }
    if(id.startsWith('token:')){payload={token:id.slice(6)};id=this.run.action?.id??'';if(!id.startsWith('token-'))return;}
    if(id==='private-choice'||id==='public-choice'){payload={visibility:id==='private-choice'?'private':'public'};id='choose-visibility';}
    if(this.run.act(id,payload)){haptic(this.world,.12);this.audio.play(id==='open-kit'?'wood':'paper');}
  }
  start() {this.started=true;this.lastTick=performance.now();document.body.classList.add('playing');$('landing').hidden=true;$('play-ui').hidden=false;this.run.start();this.run.resume();}
  restart(){this.run.reset();this.chapterKey='';this.maxStats={calls:0,triangles:0,textures:0};this.start();}
  recenter(){
    if(this.world.renderer.xr.isPresenting){
      this.world.player.head.getWorldPosition(this.position);this.world.player.head.getWorldQuaternion(this.rotation);
      this.direction.set(0,0,-1).applyQuaternion(this.rotation);const yaw=Math.atan2(-this.direction.x,-this.direction.z);
      this.anchor.position.set(this.position.x,this.position.y-1.35,this.position.z);
      this.anchor.quaternion.setFromEuler(new Euler(0,yaw,0));
    }else{this.anchor.position.set(0,0,0);this.anchor.rotation.set(0,0,0);}
    // The table follows the visitor's height; the floor stays on the real floor.
    this.environment.position.y=-this.anchor.position.y;
  }
  private syncScene(){
    const key=`${this.run.step.id}:${this.run.step.id==='blob'?this.run.state.atBlob:''}`;
    if(key===this.chapterKey)return;this.chapterKey=key;
    this.director.show(()=>{
      this.chapter=new JourneyScene(this.world,this.run,this.audio,(id,payload)=>this.queue(id,payload));
      this.chapter.root.position.set(0,CHAPTER_Y,-.12);this.anchor.add(this.chapter.root);return this.chapter;
    },this.run.state);
  }
  private onChange(s:RunSnapshot){
    this.instruction.setText(s.instruction);this.chain.setStep(s.stepIndex,s.finished);
    this.eyebrow.setText(`${String(s.stepIndex+1).padStart(2,'0')} / 09  ·  ${(s.finished?'You are part of ANT':this.run.step.name).toUpperCase()}`);
    $('step-number').textContent=`${String(s.stepIndex+1).padStart(2,'0')} / 09`;
    $('step-title').textContent=s.finished?'You are part of ANT':this.run.step.name;
    $('instruction').textContent=s.instruction;
    $('action').textContent=s.finished?'Restart':actionLabel(s.action??'done');
    $('action').hidden=s.step==='further';
    $('token-choices').hidden=!s.action?.startsWith('token-');
    $('visibility-choices').hidden=s.action!=='choose-visibility';
    for(const node of document.querySelectorAll<HTMLButtonElement>('[data-token]'))node.disabled=s.state.tokens.includes(node.dataset.token!);
    document.querySelectorAll('[data-step]').forEach((node,i)=>{node.setAttribute('aria-current',String(i===s.stepIndex));node.classList.toggle('done',i<s.stepIndex);});
    $('assist').hidden=!s.assist;
    this.chapter?.refresh();
  }
  update(_delta:number){
    const now=performance.now();const seconds=(now-this.lastTick)/1000;this.lastTick=now;
    // Count wall time while visible, including slow frames; hidden tabs/headset menus pause.
    const session=this.world.renderer.xr.getSession();
    const visible=!document.hidden&&(!session||session.visibilityState==='visible');
    if(this.started&&visible)this.run.update(seconds);
    if(this.pending){const p=this.pending;this.pending=null;this.dispatch(p.id,p.payload);}
    this.syncScene();this.director.update(Math.min(seconds,.1));
    this.frameCount++;this.statsTime+=seconds;
    if(this.statsTime>=.5){
      const info=this.world.renderer.info;
      this.lastStats={fps:Math.round(this.frameCount/this.statsTime),calls:info.render.calls+1,triangles:info.render.triangles,textures:info.memory.textures,geometries:info.memory.geometries};
      this.maxStats.calls=Math.max(this.maxStats.calls,this.lastStats.calls);this.maxStats.triangles=Math.max(this.maxStats.triangles,this.lastStats.triangles);this.maxStats.textures=Math.max(this.maxStats.textures,this.lastStats.textures);
      const s=this.lastStats;const warning=s.calls>=150||s.triangles>=150000||s.textures>64?'RESOURCE BUDGET EXCEEDED':'';
      const text=`${s.fps} fps · ${s.calls} calls · ${s.triangles} triangles\n${s.textures} textures · ${s.geometries} geometries\n${this.run.elapsed.toFixed(1)} / 300 s · ${this.run.stepElapsed.toFixed(1)} s this step\n${warning}`;
      if(this.debug)this.diagnostics.setText(text);$('stats').textContent=text;
      $('timer').textContent=`${Math.floor(this.run.elapsed/60)}:${String(Math.floor(this.run.elapsed%60)).padStart(2,'0')}`;
      this.frameCount=0;this.statsTime=0;
    }
  }
  onGrab(id:string){this.chapter?.onGrab(id);}
  onRelease(id:string){this.chapter?.onRelease(id);}
  snapshot(){return {...this.run.snapshot(),performance:this.lastStats,peakPerformance:this.maxStats,xr:this.world.renderer.xr.isPresenting};}
  private toggleDebug(){this.debug=!this.debug;this.diagnostics.mesh.visible=this.debug;$('debug-panel').hidden=!this.debug;}
  private bindUI(){
    const listen=(target:EventTarget,event:string,fn:EventListener)=>{target.addEventListener(event,fn);this.disposers.push(()=>target.removeEventListener(event,fn));};
    listen($('desktop'),'click',()=>{void this.audio.unlock();this.start();});
    listen($('enter-vr'),'click',()=>{
      void this.audio.unlock();$('xr-status').textContent='Opening your VR session…';
      try{this.world.launchXR();setTimeout(()=>{if(!this.world.renderer.xr.isPresenting)$('xr-status').textContent='If VR did not open, allow the browser’s VR request and try again.';},3500);}catch{ $('xr-status').textContent='VR could not start. You can still play on this screen.'; }
    });
    listen($('action'),'click',()=>this.queue('primary'));
    listen($('skip'),'click',()=>this.queue('skip'));
    listen($('recenter'),'click',()=>this.recenter());
    listen($('debug-toggle'),'click',()=>this.toggleDebug());
    listen($('restart'),'click',()=>this.restart());
    listen($('exit'),'click',()=>{this.run.pause();if(this.world.renderer.xr.isPresenting)this.world.exitXR();else{document.body.classList.remove('playing');$('landing').hidden=false;$('play-ui').hidden=true;}});
    listen($('sound'),'click',()=>{this.audio.setVolume(this.audio.volume?0:.25);$('sound').textContent=this.audio.volume?'Sound on':'Sound off';void this.audio.unlock();});
    listen($('scene-select'),'change',()=>this.run.jumpTo(($('scene-select') as HTMLSelectElement).value as StepId));
    listen($('download-log'),'click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(this.snapshot(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ANT-run.json';a.click();URL.revokeObjectURL(url);});
    document.querySelectorAll<HTMLButtonElement>('[data-token]').forEach(node=>listen(node,'click',()=>this.queue(`token:${node.dataset.token}`)));
    document.querySelectorAll<HTMLButtonElement>('[data-visibility]').forEach(node=>listen(node,'click',()=>this.queue(`${node.dataset.visibility}-choice`)));
    listen(window,'pointerup',()=>this.chapter?.finishDrawing());
    listen(window,'keydown',event=>{const e=event as KeyboardEvent;if(e.target instanceof HTMLSelectElement)return;if(e.code==='KeyD')this.toggleDebug();if(e.code==='KeyR')this.recenter();if(e.code==='Space'&&this.started){e.preventDefault();this.queue('primary');}});
    listen(document,'visibilitychange',()=>{this.lastTick=performance.now();});
    let connectedSession:XRSession|undefined;
    const onSourcesChanged=()=>this.chapter?.forceRelease();
    const onSessionStart=()=>{connectedSession=this.world.renderer.xr.getSession()??undefined;connectedSession?.addEventListener('inputsourceschange',onSourcesChanged);document.body.classList.add('immersive');this.showHud(true);this.start();setTimeout(()=>this.recenter(),150);};
    const onSessionEnd=()=>{this.chapter?.forceRelease();connectedSession?.removeEventListener('inputsourceschange',onSourcesChanged);connectedSession=undefined;document.body.classList.remove('immersive');this.showHud(false);this.environment.position.y=0;this.run.pause();this.started=false;$('landing').hidden=false;$('play-ui').hidden=true;$('desktop').textContent='Continue on this screen';$('xr-status').textContent='Your session has ended. Continue whenever you’re ready.';this.anchor.position.set(0,0,0);this.anchor.rotation.set(0,0,0);};
    this.world.renderer.xr.addEventListener('sessionstart',onSessionStart);this.world.renderer.xr.addEventListener('sessionend',onSessionEnd);
    this.disposers.push(()=>{connectedSession?.removeEventListener('inputsourceschange',onSourcesChanged);this.world.renderer.xr.removeEventListener('sessionstart',onSessionStart);this.world.renderer.xr.removeEventListener('sessionend',onSessionEnd);});
    for(const s of STEPS){const option=document.createElement('option');option.value=s.id;option.textContent=s.name;$('scene-select').append(option);}
  }
  dispose(){this.changeOff();this.completeOff();this.director.dispose();this.disposers.forEach(fn=>fn());this.controls.forEach(p=>p.dispose());this.instruction.dispose();this.eyebrow.dispose();this.chain.dispose();this.diagnostics.dispose();this.audio.dispose();}
}

export function interactionSystem(app:AntApp){
  return class AntSystem extends createSystem({pressed:{required:[ActionTarget,Pressed]},hovered:{required:[ActionTarget,Hovered]},held:{required:[HeldPaper,Grabbed]}}){
    init(){
      this.cleanupFuncs.push(this.queries.pressed.subscribe('qualify',e=>app.queue(e.getValue(ActionTarget,'id')??'')));
      // Anything that can be pressed leans toward the pointer or fingertip.
      this.cleanupFuncs.push(this.queries.hovered.subscribe('qualify',e=>{if(e.getValue(ActionTarget,'id')!=='drawing')e.object3D?.scale.setScalar(1.06);}));
      this.cleanupFuncs.push(this.queries.hovered.subscribe('disqualify',e=>e.object3D?.scale.setScalar(1)));
      this.cleanupFuncs.push(this.queries.held.subscribe('qualify',e=>app.onGrab(e.getValue(HeldPaper,'id')??'')));
      this.cleanupFuncs.push(this.queries.held.subscribe('disqualify',e=>app.onRelease(e.getValue(HeldPaper,'id')??'')));
    }
    update(delta:number){
      // SDK touch hover has priority over rays within 20 cm. A controller near
      // a neighbouring tag must still select the tag it points at. Fingertip
      // touch remains enabled for tracked hands; controllers use ray + grip.
      this.input.xr.multiPointers.left.toggleSubPointer('touch',!!this.input.xr.getPrimaryInputSource('left')?.hand);
      this.input.xr.multiPointers.right.toggleSubPointer('touch',!!this.input.xr.getPrimaryInputSource('right')?.hand);
      app.update(delta);
    }
  };
}
