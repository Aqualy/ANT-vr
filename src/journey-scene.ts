import { BufferGeometry, Float32BufferAttribute, CircleGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, Quaternion, type Entity, type World, RayInteractable, PokeInteractable, OneHandGrabbable, Grabbed, GrabSystem } from '@iwsdk/core';
import { ActionTarget, HeldPaper } from './components.js';
import { createKit, createNeighbourhood, createOperator, colors, block } from './scene-assets/ant.scene-asset.js';
import { createPaper, createLabel, createToken, createBlobHost, chain, chainPoint, CHAIN_PARAMS, INK, TEMPLATE_BOX, type Paper, type Label, type PaperKind, type ProfileData, type TokenId, type BlobSurface, type SurfaceBlob } from './art/art.js';
import { RunManager, type ActionPayload, type StepId, type SymbolPoint } from './run.js';
import { withinDropTarget, type SceneContract } from './lifecycle.js';
import { PaperAudio, haptic } from './audio.js';

type Held = { entity:Entity; paper:Paper; home:Vector3; rotation:Quaternion; returning:boolean; id:string };
const LABELS:Record<string,string>={begin:'Begin', 'open-kit':'Open the kit', 'take-map':'Pick up the map', 'take-profile':'Take your profile', 'token-one':'Choose your first token', 'token-two':'Choose another token', 'accept-name':'I am Noor', 'enter-blob':'Visit the Blob', 'hand-profile':'Hand in your profile', 'choose-visibility':'Public', 'turn-page':'Turn the page', 'meet-neighbour':'Hello, Sam', 'accept-request':'Accept request', 'read-profile':'Continue', 'draw-symbol':'Use a garden symbol', 'post-symbol':'Pin to the board', 'watch-network':'Watch the connections', done:'Done'};
export const actionLabel=(id:string)=>LABELS[id]??id;
/** Chapter origin above the anchor; the tabletop is at TABLE_Y in chapter space. */
export const CHAPTER_Y=.2;
const TABLE_Y=.8;
/** Slope of the controls along the front edge of the table: they face a seated or standing visitor. */
export const CONSOLE_TILT=-.75;
const POP_SECONDS=.45;

/** A chapter owns its papers, entities, field target and shared model resources. */
export class JourneyScene implements SceneContract<unknown> {
  readonly root=new Group();
  private entities:Entity[]=[];
  private papers:Paper[]=[];
  private held=new Map<string,Held>();
  private dynamicLabels:Label[]=[];
  private button?:Label;
  private profile?:Paper;
  private map?:Paper;
  private kit?:Group;
  private hinge?:Group;
  private template?:Paper;
  private booklet?:Group;
  private match?:Label;
  private privateInside?:Paper;
  private privateRequest?:Label;
  private privateStatus?:Label;
  private privateRevealed=false;
  private pageTurnProgress=0;
  private readonly pagePivot=new Vector3();
  private readonly pageBasis=new Quaternion();
  private readonly pageRotation=new Quaternion();
  private readonly pageAxis=new Vector3(0,1,0);
  private network?:Group;
  private field?:BlobSurface;
  private host?:ReturnType<typeof createBlobHost>;
  private copies:Mesh[]=[];
  private fibreLights?:InstancedMesh;
  private readonly fibreMatrix=new Matrix4();
  private readonly destinations:readonly (readonly [number,number])[]=[[-.38,-.19],[.38,-.14],[.25,.22]];
  private time=0;
  private pop=0;
  private wasAssisting=false;
  private initialAction='';
  private drawing=false;
  private strokes:SymbolPoint[]=[];
  private readonly tmp=new Vector3();
  private readonly target=new Vector3();
  private disposed=false;
  private fieldTime=-1;
  private baseBlobs:SurfaceBlob[]=[];
  private templateGrabbed=false;
  private readonly rootEntity:Entity;
  readonly step:StepId;

  constructor(private world:World,private run:RunManager,private audio:PaperAudio,private dispatch:(id:string,payload?:ActionPayload)=>void) {
    this.step=run.step.id; this.root.name=`Chapter ${this.step}`;
    this.rootEntity=world.createTransformEntity(this.root);
  }
  build() {
    const step=this.step;
    if(step==='intro'||step==='further'||step==='outro'||(step==='blob'&&!this.run.state.atBlob)) this.buildNetwork();
    if(step==='kit') this.buildKit();
    if(step==='profile') this.buildProfile();
    if(step==='blob'&&this.run.state.atBlob) this.buildCounter();
    if(step==='public') this.buildBook();
    if(step==='private') this.buildPrivate();
    if(step==='symbols') this.buildSymbols();
    if(step==='outro') this.label('Get to know your neighbours\nbefore you need them.',0,1.18,-.94,.98,.19,.045,true);
    if(step!=='further') {
      this.button=this.label('',0,.845,-.35,.4,.075,.03,true);this.button.mesh.rotation.x=CONSOLE_TILT;
      this.button.mesh.name='Primary action'; this.action(this.button.mesh,'primary');
    }
    this.refresh();this.applyPop(0);
  }
  /** Chapters fold up out of the tabletop, like the site's pop-up world. */
  private applyPop(progress:number){
    const e=Math.max(.02,1-(1-progress)**3);
    this.root.scale.y=e;this.root.position.y=CHAPTER_Y+TABLE_Y*(1-e);
  }
  /** A thin black stand from the tabletop (or `floor`) up to a sign. */
  private post(x:number,top:number,z:number,floor=TABLE_Y){
    const p=block('Sign post',.005,top-floor,.005,colors.black);p.position.set(x,(top+floor)/2,z-.004);this.add(p);return p;
  }
  enter() { this.root.visible=true; }
  exit() { this.root.visible=false; this.forceRelease(); }
  private add(object:Group|Mesh) { this.root.add(object); return object; }
  private label(text:string,x:number,y:number,z:number,w=.5,h=.1,font=.03,green=false,background:string=green?INK.green:INK.white) {
    const p=createLabel(text,{width:w,height:h,fontSize:font,background});
    p.mesh.position.set(x,y,z); this.add(p.mesh); this.papers.push(p); this.dynamicLabels.push(p); return p;
  }
  private paper(kind:PaperKind,x:number,y:number,z:number,tilt=-.6,profile?:ProfileData) {
    const p=createPaper(kind,{profile}); p.mesh.position.set(x,y,z); p.mesh.rotation.x=tilt;
    this.add(p.mesh); this.papers.push(p); return p;
  }
  private action(object:Mesh,id:string) {
    if(object.parent!==this.root)this.root.attach(object);
    const e=this.world.createTransformEntity(object,this.rootEntity);
    e.addComponent(RayInteractable).addComponent(PokeInteractable).addComponent(ActionTarget,{id});
    this.entities.push(e); return e;
  }
  private grab(paper:Paper,id:string) {
    const e=this.world.createTransformEntity(paper.mesh,this.rootEntity);
    e.addComponent(RayInteractable).addComponent(OneHandGrabbable,{translate:true,rotate:true}).addComponent(HeldPaper,{id});
    this.entities.push(e);
    this.held.set(id,{entity:e,paper,home:paper.mesh.position.clone(),rotation:paper.mesh.quaternion.clone(),returning:false,id});
    paper.mesh.name=id;
  }
  private resident(name='Noor'):ProfileData {
    return {name,street:'Your neighbourhood',picto:name==='Noor'?'person':'person2',tokens:this.run.state.tokens as TokenId[],tokenLabels:this.run.state.tokens.map(t=>t[0].toUpperCase()+t.slice(1)),canHelp:'Growing things together',also:'A neighbour nearby'};
  }
  private buildKit() {
    this.kit=createKit(); this.kit.position.set(0,.806,-.64); this.add(this.kit);
    this.hinge=this.kit.getObjectByName('Lid hinge') as Group;
    const lid=createPaper('kitLid'); lid.mesh.rotation.x=-Math.PI/2; lid.mesh.position.set(0,.0015,.11); this.hinge.add(lid.mesh); this.papers.push(lid);
    const front=createPaper('kitFront'); front.mesh.position.set(0,.0275,.1105); this.kit.add(front.mesh); this.papers.push(front);
    const kitEntity=this.world.createTransformEntity(this.kit,this.rootEntity);
    const lidEntity=this.world.createTransformEntity(this.hinge,kitEntity);
    lidEntity.addComponent(RayInteractable).addComponent(OneHandGrabbable,{translate:false,rotate:false}).addComponent(HeldPaper,{id:'Kit lid'});
    this.entities.push(lidEntity,kitEntity);
    this.map=this.paper('map',-.33,.96,-.64,-.75); this.map.mesh.scale.setScalar(.5); this.grab(this.map,'Neighbourhood Map');
    this.profile=this.paper('profileCover',.31,.96,-.64,-.55); this.grab(this.profile,'Paper Profile');
    this.paper('stickerSheet',-.16,.828,-.83,-Math.PI/2);
    this.paper('template',.02,.829,-.88,-Math.PI/2);
    this.paper('cardBox',.19,.83,-.85,-Math.PI/2);
  }
  private buildProfile() {
    this.profile=this.paper('profileInterests',.12,1.02,-.57,-.45,this.resident()); this.grab(this.profile,'Paper Profile');
    const sheet=this.paper('stickerSheet',-.22,1.01,-.59,-.45); this.grab(sheet,'Interest Token sheet');
    const ids:TokenId[]=['gardening','music','cooking','repair'];
    ids.forEach((id,i)=>{
      const p=createToken(id); p.mesh.position.set(-.30+i*.15,.9,-.52); p.mesh.rotation.x=-.65; this.add(p.mesh); this.papers.push(p); this.grab(p,`Token ${id}`);
      // A roomy paper tab is the ray alternative; the physical token remains 25 mm.
      const tag=this.label(id[0].toUpperCase()+id.slice(1),-.30+i*.15,.834,-.475,.135,.046,.019,false,INK.grey);tag.mesh.rotation.x=CONSOLE_TILT;
      this.action(tag.mesh,`token:${id}`);
    });
    this.label('Two interests. One way to meet.',0,1.25,-.8,.8,.09,.032);
  }
  private buildCounter() {
    const operator=createOperator(); operator.position.set(-.27,TABLE_Y,-1.4); this.add(operator);
    const second=createOperator(); second.position.set(.33,TABLE_Y,-1.52); second.scale.setScalar(.93); this.add(second);
    this.label('Volunteer operators',.03,TABLE_Y+.044,-1.1,.5,.076,.033);
    this.label('Local Blob',-.66,1.17,-1.05,.3,.11,.046,true);this.post(-.66,1.12,-1.05);
    this.profile=this.paper('profileCover',.46,1.0,-.52,-.4,this.resident()); this.grab(this.profile,'Paper Profile');
    const target=this.label('Your profile\ngoes here',0,.82,-.73,.22,.16,.025,true); target.mesh.rotation.x=-Math.PI/2; target.mesh.name='Profile handover';
    this.action(target.mesh,'hand-profile');
    const priv=this.label('Private',.29,1.08,-.72,.24,.075,.032); priv.mesh.name='Choose Private'; this.action(priv.mesh,'private-choice');
    const pub=this.label('Public',-.29,1.08,-.72,.24,.075,.032,true); pub.mesh.name='Choose Public'; this.action(pub.mesh,'public-choice');
  }
  private buildBook() {
    this.booklet=new Group(); this.booklet.name='Public profile booklet'; this.booklet.position.set(0,1.02,-.64); this.booklet.rotation.x=-.45; this.add(this.booklet);
    const left=createPaper('profileCover',{profile:this.resident()}); left.mesh.position.x=-.075; this.booklet.add(left.mesh); this.papers.push(left);
    const inside=createPaper('profileInterests',{profile:this.resident('Sam')}); inside.mesh.position.set(.075,0,-.0006); this.booklet.add(inside.mesh); this.papers.push(inside);
    const right=createPaper('profileCover',{profile:this.resident('Sam')}); right.mesh.position.x=.075; this.booklet.add(right.mesh); this.papers.push(right); this.profile=right;
    this.action(right.mesh,'turn-page'); right.mesh.name='Turn the booklet page';
    this.pagePivot.copy(this.booklet.position);this.pagePivot.x+=.001;this.pageBasis.copy(this.booklet.quaternion);
    this.label('Public profiles · anyone can browse',0,1.28,-.9,.9,.09,.032);
    this.match=this.label('',0,1.16,-.5,.76,.1,.035,true);
  }
  private buildPrivate() {
    this.profile=this.paper('profileCover',-.15,1.04,-.64,-.4,this.resident()); this.grab(this.profile,'Private Paper Profile');
    this.privateInside=this.paper('profileInterests',-.15,1.04,-.642,-.4,this.resident());this.privateInside.mesh.visible=false;
    this.privateInside.mesh.name='Profile revealed after permission';
    this.label('Your name and picture stay visible.',0,1.31,-.9,.86,.085,.032);
    this.privateRequest=this.label('Sam would like to read more.\nThe operator passes on the request.',.18,1.07,-.64,.46,.17,.028);
    this.privateStatus=this.label('PRIVATE',-.15,.87,-.53,.19,.055,.025,true);
  }
  private buildSymbols() {
    this.template=this.paper('template',-.18,1.08,-.54,-.20); this.template.mesh.name='Draw your symbol';
    this.action(this.template.mesh,'drawing');
    const mesh=this.template.mesh;
    mesh.addEventListener('pointerdown',(event)=>{if(this.run.action?.id!=='draw-symbol')return; this.drawing=true; this.strokes=[]; this.drawPoint(event.point);});
    mesh.addEventListener('pointermove',(event)=>{if(this.drawing)this.drawPoint(event.point);});
    mesh.addEventListener('pointerup',()=>this.finishDrawing());
    const board=block('Community symbol board',.36,.36,.02,colors.grey); board.position.set(.24,1.08,-.83); this.add(board);
    const tag=this.label('Public board',.24,1.3,-.816,.34,.065,.028); this.action(tag.mesh,'post-symbol');
    this.label('Garden\nA place to grow together',.24,.94,-.81,.32,.11,.022);
    if(this.run.state.symbolPoints.length) this.paintStrokes(this.run.state.symbolPoints);
  }
  private drawPoint(worldPoint:Vector3) {
    if(!this.template)return;
    this.tmp.copy(worldPoint); this.template.mesh.worldToLocal(this.tmp);
    const x=(this.tmp.x/this.template.width+.5)*this.template.designWidth;
    const y=(.5-this.tmp.y/this.template.height)*this.template.designHeight;
    const b=TEMPLATE_BOX; const u=(x-b.x)/b.w,v=(y-b.y)/b.h;
    if(u<0||u>1||v<0||v>1)return;
    const last=this.strokes.at(-1); if(last&&Math.hypot(last[0]-u,last[1]-v)<.012)return;
    this.strokes.push([u,v]); this.paintStrokes(this.strokes);
  }
  finishDrawing() {if(!this.drawing)return; this.drawing=false; if(this.strokes.length>2)this.dispatch('draw-symbol',{points:this.strokes});}
  private paintStrokes(points:readonly SymbolPoint[],paper=this.template) {
    const p=paper;if(!p)return; p.repaint({template:{meaning:'The neighbourhood garden',mark:'A place to grow together'}});
    p.draw(ctx=>{ctx.strokeStyle=INK.black;ctx.lineWidth=3.5;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach(([x,y],i)=>{const px=TEMPLATE_BOX.x+x*TEMPLATE_BOX.w,py=TEMPLATE_BOX.y+y*TEMPLATE_BOX.h;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.stroke();});
  }
  private buildNetwork() {
    this.network=createNeighbourhood(); this.network.position.set(0,.813,-.81); this.add(this.network);
    this.host=createBlobHost(this.world.renderer); this.field=this.host.surface(512,256,CHAIN_PARAMS);
    const field=new Mesh(new PlaneGeometry(1.18,.65),this.field.material); field.rotation.x=-Math.PI/2; field.position.y=.006; this.network.add(field);
    this.baseBlobs=[{id:0,x:256,y:128,r:31,color:INK.green},{id:1,x:90,y:54,r:22,color:INK.green},{id:2,x:421,y:77,r:25,color:INK.green},{id:3,x:364,y:215,r:21,color:INK.green}];
    this.updateField(this.step==='further'?0:1);
    const centres=[[-.38,-.19],[0,0],[.38,-.14],[.25,.22]];
    centres.forEach(([x,z],i)=>{const p=this.label(i===1?'Local Blob':'Blob',x,.985,-.81+z,i===1?.19:.12,.058,.027,true);this.post(x,.96,-.81+z,.82);if(i===1){p.mesh.name='Visit the local Blob';this.action(p.mesh,'enter-blob');}});
    if(this.step==='further'||this.step==='outro') {
      for(let i=0;i<3;i++){const p=createPaper('profileCover',{profile:this.resident()});p.mesh.scale.setScalar(.35);p.mesh.rotation.x=-Math.PI/2;this.network.add(p.mesh);this.papers.push(p);this.copies.push(p.mesh);}
      this.buildFibre();
      if(this.run.state.symbolPosted&&this.run.state.symbolPoints.length)this.buildGardenSymbol();
      this.label('Copies travel between Blobs.\nWith electricity: light through fibre.',0,1.23,-1.0,.98,.16,.034);
    } else this.label('Your neighbourhood. Your connections.',0,1.24,-1,.95,.1,.038);
  }
  private buildGardenSymbol() {
    if(!this.network)return;
    // Keep the just-posted form in view; repeat its mark on a garden sign.
    const board=block('Your symbol on the public board',.125,.172,.008,colors.grey);
    board.position.set(.49,1.035,-.92);this.add(board);
    const support=block('Public board support',.018,.14,.018,colors.black);
    support.position.set(.49,.883,-.924);this.add(support);
    const posted=this.paper('template',.49,1.035,-.915,0);
    posted.mesh.name='Your posted symbol';this.paintStrokes(this.run.state.symbolPoints,posted);
    const garden=block('Neighbourhood garden',.115,.003,.085,colors.green);
    garden.position.set(-.19,.008,.2);this.network.add(garden);
    const sign=createLabel('',{width:.084,height:.06});
    sign.mesh.name='Your symbol marks the garden';sign.mesh.position.set(-.19,.078,.2);
    sign.draw(ctx=>{
      ctx.strokeStyle=INK.black;ctx.lineWidth=2.3;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
      this.run.state.symbolPoints.forEach(([x,y],i)=>{const px=6+x*72,py=5+y*50;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.stroke();
    });
    this.network.add(sign.mesh);this.papers.push(sign);
    const post=block('Garden sign fold',.012,.05,.004,colors.black);
    post.position.set(-.19,.031,.198);this.network.add(post);
  }
  private buildFibre() {
    if(!this.network)return;
    // Three cable ribbons share one mesh; three light packets share one draw.
    const vertices:number[]=[];const halfWidth=.006;
    for(let branch=1;branch<4;branch++){
      const blob=this.baseBlobs[branch];
      for(let j=0;j<24;j++){
        const [ax,ay]=chainPoint([256,128],[blob.x,blob.y],j/24);
        const [bx,by]=chainPoint([256,128],[blob.x,blob.y],(j+1)/24);
        const x0=(ax/512-.5)*1.18,z0=(ay/256-.5)*.65;
        const x1=(bx/512-.5)*1.18,z1=(by/256-.5)*.65;
        const length=Math.hypot(x1-x0,z1-z0)||1;
        const nx=-(z1-z0)/length*halfWidth,nz=(x1-x0)/length*halfWidth;
        vertices.push(x0+nx,.009,z0+nz,x1+nx,.009,z1+nz,x0-nx,.009,z0-nz,
          x0-nx,.009,z0-nz,x1+nx,.009,z1+nz,x1-nx,.009,z1-nz);
      }
    }
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const cable=new Mesh(geometry,new MeshBasicMaterial({color:colors.black,side:DoubleSide}));
    cable.name='Fibre-optic connections';this.network.add(cable);
    this.fibreLights=new InstancedMesh(new CircleGeometry(.005,12),new MeshBasicMaterial({color:colors.green,side:DoubleSide}),3);
    this.fibreLights.name='Light carries data with electricity';this.fibreLights.frustumCulled=false;this.network.add(this.fibreLights);
    this.updateFibreLights(0);
  }
  private updateFibreLights(progress:number) {
    const lights=this.fibreLights;if(!lights)return;
    for(let i=0;i<3;i++){
      const blob=this.baseBlobs[i+1];
      // Same bent path as the original field; no allocation in the frame loop.
      const dx=blob.x-256,dy=blob.y-128,length=Math.hypot(dx,dy)||1;
      const bend=Math.sin(progress*Math.PI)*length*.06;
      const x=256+dx*progress-dy/length*bend,y=128+dy*progress+dx/length*bend;
      this.fibreMatrix.makeRotationX(-Math.PI/2);
      this.fibreMatrix.setPosition((x/512-.5)*1.18,.010,(y/256-.5)*.65);
      lights.setMatrixAt(i,this.fibreMatrix);
    }
    lights.instanceMatrix.needsUpdate=true;
  }
  refresh() {
    const action=this.run.action?.id??'done';
    if(this.button)this.button.setText(this.run.finished?'Restart':actionLabel(action));
    if(this.step==='kit') {
      const opened=this.run.state.kitOpen;
      for(const paper of this.papers) if(paper!==this.button&&!this.dynamicLabels.includes(paper as Label)) {
        if(paper.mesh.parent===this.root)paper.mesh.visible=opened;
      }
      if(this.map?.mesh && this.run.state.mapTaken)this.map.mesh.scale.setScalar(1);
    }
    if(this.step==='profile'&&this.profile)this.profile.repaint({profile:this.resident()});
    if(this.step==='public'&&this.match) {this.match.mesh.visible=this.run.state.pageTurned;this.match.setText(`You and Sam both enjoy\n${this.run.state.tokens[0]??'gardening'}.`);}
    if(this.step==='private'&&this.run.state.requestAccepted&&!this.privateRevealed){
      this.privateRevealed=true;
      if(this.privateInside)this.privateInside.mesh.visible=true;
      this.privateRequest?.setText('You decide what to share.\nSam can now read your profile.');
      this.privateStatus?.setText('ACCEPTED');
      const cover=this.held.get('Private Paper Profile');
      if(cover){cover.home.set(-.32,.92,-.58);cover.returning=true;}
    }
    if(this.step==='symbols'&&this.run.state.symbolPoints.length){
      this.paintStrokes(this.run.state.symbolPoints);
      if(!this.templateGrabbed&&this.template){
        const entity=this.entities.find(e=>e.object3D===this.template!.mesh);
        if(entity){entity.removeComponent(ActionTarget);entity.removeComponent(PokeInteractable);entity.addComponent(OneHandGrabbable,{translate:true,rotate:true}).addComponent(HeldPaper,{id:'Symbol template'});
          this.template.mesh.name='Symbol template';this.held.set('Symbol template',{entity,paper:this.template,home:this.template.mesh.position.clone(),rotation:this.template.mesh.quaternion.clone(),returning:false,id:'Symbol template'});}
        this.templateGrabbed=true;
      }
    }
    this.initialAction=action;
  }
  onGrab(id:string) {
    if(id==='Kit lid'){
      if(this.run.action?.id==='open-kit'){haptic(this.world);this.audio.play('paper');this.dispatch('open-kit');}
      return;
    }
    const held=this.held.get(id);if(!held)return;held.returning=false;haptic(this.world);this.audio.play('paper',held.home.x);
    if(id==='Neighbourhood Map'&&this.run.action?.id==='take-map'){held.paper.mesh.scale.setScalar(1);this.dispatch('take-map');}
    if(id==='Paper Profile'&&this.run.action?.id==='take-profile')this.dispatch('take-profile');
  }
  onRelease(id:string) {
    const item=this.held.get(id);if(!item||this.disposed)return;
    item.paper.mesh.getWorldPosition(this.tmp); let accepted=false;
    if(id.startsWith('Token ')&&this.run.action?.id.startsWith('token-')&&this.profile){
      this.profile.mesh.getWorldPosition(this.target);if(withinDropTarget(this.tmp,this.target,.2)){this.dispatch(this.run.action.id,{token:id.slice(6)});accepted=true;}
    }
    if(id==='Paper Profile'&&this.run.action?.id==='hand-profile'){
      this.target.set(0,.88,-.73).applyMatrix4(this.root.matrixWorld);if(withinDropTarget(this.tmp,this.target,.27)){this.dispatch('hand-profile');accepted=true;}
    }
    if(id==='Symbol template'&&this.run.action?.id==='post-symbol'){
      this.target.set(.24,1.08,-.81).applyMatrix4(this.root.matrixWorld);if(withinDropTarget(this.tmp,this.target,.24)){this.dispatch('post-symbol');accepted=true;}
    }
    item.returning=true; if(accepted)this.audio.play('chime');
  }
  update(delta:number) {
    this.time+=delta;
    if(this.pop<1){this.pop=Math.min(1,this.pop+delta/POP_SECONDS);this.applyPop(this.pop);}
    if(this.initialAction!==(this.run.action?.id??'done'))this.refresh();
    if(this.hinge){const target=this.run.state.kitOpen?-2.15:0;this.hinge.rotation.x+=(target-this.hinge.rotation.x)*Math.min(1,delta*7);}
    if(this.step==='public'&&this.run.state.pageTurned&&this.profile&&this.pageTurnProgress<1){
      this.pageTurnProgress=Math.min(1,this.pageTurnProgress+delta/.65);
      const p=this.pageTurnProgress,angle=-Math.PI*p*p*(3-2*p);
      this.tmp.set(.074*Math.cos(angle),0,-.074*Math.sin(angle)).applyQuaternion(this.pageBasis).add(this.pagePivot);
      this.profile.mesh.position.copy(this.tmp);this.pageRotation.setFromAxisAngle(this.pageAxis,angle);
      this.profile.mesh.quaternion.copy(this.pageBasis).multiply(this.pageRotation);
      this.profile.mesh.visible=p<1;
    }
    for(const item of this.held.values()) if(item.returning&&!item.entity.hasComponent(Grabbed)) {
      item.paper.mesh.position.lerp(item.home,Math.min(1,delta*9));item.paper.mesh.quaternion.slerp(item.rotation,Math.min(1,delta*9));
      if(item.paper.mesh.position.distanceToSquared(item.home)<.000001)item.returning=false;
    }
    if(this.copies.length){const progress=Math.min(this.time/2.5,1);this.copies.forEach((p,i)=>{p.position.set(this.destinations[i][0]*progress,.075+Math.sin(progress*Math.PI)*.11,this.destinations[i][1]*progress);});}
    if(this.fibreLights&&this.time-delta<2.5)this.updateFibreLights(Math.min(this.time/2.5,1));
    if(this.step==='further'&&this.field&&this.time-this.fieldTime>.12&&this.fieldTime<3){this.updateField(Math.min(this.time/2.5,1));this.fieldTime=this.time;}
    // Assistance: the action pill breathes instead of changing colour (palette stays exact).
    if(this.button&&this.run.assist)this.button.mesh.scale.setScalar(1.04+.04*Math.sin(this.time*5));
    else if(this.button&&this.wasAssisting)this.button.mesh.scale.setScalar(1);
    this.wasAssisting=this.run.assist;
  }
  private updateField(progress:number){
    const blobs=[...this.baseBlobs];
    for(let i=1;i<4;i++){const b=this.baseBlobs[i];blobs.push(...chain(100*i,[256,128],[b.x,b.y],progress,INK.green,6));}
    this.field?.set(blobs,true);
  }
  forceRelease(){const grab=this.world.getSystem(GrabSystem); for(const entity of this.entities) if(entity.hasComponent(Grabbed))grab?.forceRelease(entity);}
  dispose() {
    if(this.disposed)return;this.disposed=true;this.forceRelease();
    const geometry=new Set(),materials=new Set();
    this.root.traverse(o=>{if(o instanceof Mesh){geometry.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
    // Capture nested kit resources before entity disposal detaches their groups.
    for(const entity of this.entities)entity.dispose({disposeResources:false});
    for(const p of this.papers){geometry.delete(p.mesh.geometry);materials.delete(p.mesh.material);p.dispose();}this.host?.dispose();
    if(this.field)materials.delete(this.field.material);
    this.rootEntity.dispose({disposeResources:false});
    for(const g of geometry)(g as PlaneGeometry).dispose();for(const m of materials)(m as MeshBasicMaterial).dispose();
    this.held.clear(); this.entities=[]; this.papers=[];
  }
}
