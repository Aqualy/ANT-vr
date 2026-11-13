import { BoxGeometry, CircleGeometry, CylinderGeometry, Euler, Group, RingGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Quaternion, Shape, ShapeGeometry, Vector3 } from '@iwsdk/core';

// Metres. All origins are contact planes. Paper models intentionally retain flat edges.
export const colors = { black: 0x000000, grey: 0xdddddd, white: 0xffffff, green: 0xc5d92f } as const;
export function block(name: string, width: number, height: number, depth: number, color: number) {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), new MeshLambertMaterial({ color }));
  mesh.name = name;
  return mesh;
}
export function createTable() {
  const root = new Group(); root.name = 'Paper worktable';
  const top = block('Tabletop', 1.5, 0.035, 0.86, colors.white); top.position.y = -0.0175; root.add(top);
  const edge = block('Black paper edge', 1.5, 0.004, 0.86, colors.black); edge.position.y = -0.035; root.add(edge);
  // Legs run on below the floor disc, which hides the rest at any standing or seated height.
  const legs = new InstancedMesh(new BoxGeometry(0.032, 1.9, 0.032), new MeshLambertMaterial({color: colors.grey}), 4);
  legs.name = 'Four table legs'; const m = new Matrix4();
  [[-0.69,-0.37],[0.69,-0.37],[-0.69,0.37],[0.69,0.37]].forEach(([x,z],i)=>legs.setMatrixAt(i,m.makeTranslation(x,-0.987,z)));
  root.add(legs); return root;
}
export function createKit() {
  const root = new Group(); root.name = 'Blackout Communication Kit';
  const mat = new MeshLambertMaterial({color: colors.black});
  const add = (name:string,w:number,h:number,d:number,x:number,y:number,z:number) => {
    const p = new Mesh(new BoxGeometry(w,h,d),mat); p.name = name; p.position.set(x,y,z); root.add(p);
  };
  add('Box base',.24,.002,.22,0,.001,0);
  add('Front fold',.24,.055,.002,0,.0275,.109);
  add('Back fold',.24,.055,.002,0,.0275,-.109);
  add('Left fold',.002,.055,.22,-.119,.0275,0);
  add('Right fold',.002,.055,.22,.119,.0275,0);
  const hinge = new Group(); hinge.name = 'Lid hinge'; hinge.position.set(0,.055,-.11);
  const lid = block('Kit lid',.24,.002,.22,colors.black); lid.position.z=.11; hinge.add(lid); root.add(hinge);
  return root;
}
/** A paper-cut volunteer behind the counter. Origin: centre, at counter height; the body runs on below the floor. */
export function createOperator() {
  const root = new Group(); root.name = 'Volunteer operator';
  const black = new MeshBasicMaterial({color: colors.black, side: 2});
  const silhouette = new Shape();
  silhouette.moveTo(-.2,-1.9); silhouette.lineTo(-.23,.12); silhouette.quadraticCurveTo(-.23,.32,-.07,.335);
  silhouette.lineTo(.07,.335); silhouette.quadraticCurveTo(.23,.32,.23,.12); silhouette.lineTo(.2,-1.9); silhouette.closePath();
  const body = new Mesh(new ShapeGeometry(silhouette,20), black);
  body.name = 'Paper-cut body'; root.add(body);
  const head = new Mesh(new CircleGeometry(.105,40), black);
  head.name = 'Paper-cut head'; head.position.y = .475; root.add(head);
  const eyes = new InstancedMesh(new CircleGeometry(.011,16), new MeshBasicMaterial({color: colors.white}), 2);
  const m = new Matrix4();
  eyes.setMatrixAt(0, m.makeTranslation(-.036,.487,.002)); eyes.setMatrixAt(1, m.makeTranslation(.036,.487,.002));
  eyes.name = 'Eyes'; root.add(eyes);
  const badge = new Mesh(new CircleGeometry(.034,28), new MeshBasicMaterial({color: colors.green}));
  badge.name = 'Volunteer badge'; badge.position.set(.105,.17,.002); root.add(badge);
  return root;
}
/**
 * The ground around the table, at life size. An unlit grey disc (the room's own grey, so it
 * reads as open ground) hides whatever runs on below it; white distance rings, like the ones on
 * the Neighbourhood Map, give the ground a readable plane; far paper houses and the green
 * discs of other Blobs sit beyond them. Origin is the floor under the visitor.
 */
export function createEnvironment() {
  const root = new Group(); root.name = 'Neighbourhood around you';
  const ground = new Mesh(new CircleGeometry(24, 48), new MeshBasicMaterial({color: colors.grey}));
  ground.name = 'Open ground'; ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -.84); root.add(ground);
  const white = new MeshBasicMaterial({color: colors.white});
  [[1.5,.02],[3,.03],[4.5,.045]].forEach(([radius, width]) => {
    const ring = new Mesh(new RingGeometry(radius - width / 2, radius + width / 2, 96, 1), white);
    ring.name = `Distance ring ${radius} m`; ring.rotation.x = -Math.PI / 2; ring.position.set(0, .004, -.84); root.add(ring);
  });
  const count = 15;
  // Lit like the table model, but lifted so no face falls darker than the room's grey.
  const paper = new MeshLambertMaterial({color: colors.white, emissive: colors.white, emissiveIntensity: .3});
  const houses = new InstancedMesh(new BoxGeometry(1, 1, 1), paper, count);
  const roofs = new InstancedMesh(new CylinderGeometry(1, 1, 1, 3, 1), paper, count);
  houses.name = 'Far paper houses'; roofs.name = 'Far folded roofs';
  const m = new Matrix4(); const position = new Vector3(); const scale = new Vector3();
  const yaw = new Quaternion(); // Lay the three-sided prism along the house and turn its ridge upward: a gable roof.
  const roll = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2)).multiply(new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0))); const turn = new Quaternion();
  for (let i = 0; i < count; i++) {
    // Deterministic scatter (this module is evaluated in two realms): no Math.random.
    const k = (i * 0.618034) % 1; const j = (i * 0.381966 + .3) % 1;
    const angle = (i + .15 + k * .5) / count * Math.PI * 2;
    const radius = 12 + k * 4;
    // Kept low: nothing may rise behind the headline that floats above the table.
    const w = 2.4 + j * 1.4; const h = 1.6 + k * .6; const d = 2 + ((i * 7) % 5) * .15;
    const x = Math.sin(angle) * radius; const z = -.84 - Math.cos(angle) * radius;
    yaw.setFromEuler(new Euler(0, angle + (j - .5) * .5, 0));
    houses.setMatrixAt(i, m.compose(position.set(x, h / 2, z), yaw, scale.set(w, h, d)));
    const rise = .6; // prism centre to ridge; the eaves sit rise / 2 below the centre
    turn.copy(yaw).multiply(roll);
    roofs.setMatrixAt(i, m.compose(position.set(x, h + rise / 2, z), turn, scale.set(d * .624, w * 1.04, rise)));
  }
  houses.frustumCulled = false; roofs.frustumCulled = false;
  root.add(houses, roofs);
  const blobs = new InstancedMesh(new CircleGeometry(1, 48), new MeshBasicMaterial({color: colors.green}), 4);
  blobs.name = 'Other Blobs nearby'; blobs.frustumCulled = false;
  const flat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
  [[-7.5,-6.5,1.3],[8,-5,1.1],[6,-10.5,1.5],[-6,6,1.2]].forEach(([x,z,r],i)=>blobs.setMatrixAt(i,m.compose(position.set(x,.008,z),flat,scale.set(r,r,1))));
  root.add(blobs);
  return root;
}
export function createNeighbourhood() {
  const root = new Group(); root.name = 'Pop-up neighbourhood';
  const page=block('Grey map paper',1.18,.008,.65,colors.grey); root.add(page);
  const houses=new InstancedMesh(new BoxGeometry(.075,.065,.065),new MeshLambertMaterial({color:colors.white}),18);
  const roofs=new InstancedMesh(new CylinderGeometry(.055,.055,.075,3,1),new MeshLambertMaterial({color:colors.white}),18);
  houses.name='18 paper houses'; roofs.name='Folded roofs'; const m=new Matrix4();
  const gable=new Matrix4().makeRotationZ(Math.PI/2).multiply(new Matrix4().makeRotationY(Math.PI/2)); // ridge up
  for(let i=0;i<18;i++) {
    const x=(i%6-2.5)*.185; const z=(Math.floor(i/6)-1)*.22;
    m.makeTranslation(x,.037,z); houses.setMatrixAt(i,m);
    m.copy(gable); m.setPosition(x,.089,z); roofs.setMatrixAt(i,m);
  }
  root.add(houses,roofs);
  const roads=new InstancedMesh(new BoxGeometry(1.1,.001,.035),new MeshBasicMaterial({color:colors.white}),2);
  roads.name='Neighbourhood streets'; roads.setMatrixAt(0,m.makeTranslation(0,.005,-.11)); roads.setMatrixAt(1,m.makeTranslation(0,.005,.11)); root.add(roads);
  return root;
}
