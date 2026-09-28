import { SIZE, ISLANDS, islandAt } from './world.js';
import { describeEntity } from './presence.js';
// Top-down map of the whole sky: terrain colour by top block, shaded by height,
// with every character as a dot. Columns redraw individually on block changes.
// Tap or click it to open a large map with the island names; tap again, Esc or M closes.
const COLORS=[null,[111,174,91],[138,106,74],[140,148,153],[227,215,163],[122,90,58],[63,127,78],[85,85,85],[185,154,122],[200,154,94],[204,128,97],[255,227,160],[80,157,72],[187,85,75],[141,98,73],[255,209,123],[249,235,187]];
export function createMinimap(parent,world) {
 const panel=document.createElement('figure');panel.className='minimap';panel.innerHTML='<canvas width="128" height="128" aria-hidden="true"></canvas><canvas width="256" height="256" aria-hidden="true"></canvas><figcaption></figcaption>';
 panel.setAttribute('aria-label','Map of the sky islands');panel.tabIndex=0;panel.setAttribute('role','button');panel.setAttribute('aria-expanded','false');parent.append(panel);
 const labels=document.createElement('div');labels.className='minimap-labels';labels.setAttribute('aria-hidden','true');
 for(const island of ISLANDS){const label=document.createElement('span');label.textContent=island.name;label.style.left=`${island.x/SIZE.x*100}%`;label.style.top=`${(island.z+island.radius*.8)/SIZE.z*100}%`;labels.append(label);}
 panel.querySelector('figcaption').before(labels);
 const expand=on=>{panel.classList.toggle('expanded',on);panel.setAttribute('aria-expanded',String(on));};
 panel.addEventListener('click',()=>expand(!panel.classList.contains('expanded')));
 panel.addEventListener('keydown',e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();expand(!panel.classList.contains('expanded'));}});
 addEventListener('keydown',e=>{if(e.code==='Escape'&&panel.classList.contains('expanded'))expand(false);});
 addEventListener('pointerdown',e=>{if(panel.classList.contains('expanded')&&!panel.contains(e.target))expand(false);});
 const [terrain,marks]=panel.querySelectorAll('canvas'),caption=panel.querySelector('figcaption');
 const t=terrain.getContext('2d'),m=marks.getContext('2d'),image=t.createImageData(SIZE.x,SIZE.z);
 function column(x,z){
  const y=world.top(x,z),i=(z*SIZE.x+x)*4,color=y<0?null:COLORS[world.get(x,y,z)];
  if(!color){image.data[i+3]=0;return;}
  const shade=.62+Math.min(1,Math.max(0,(y-12)/22))*.5;
  image.data[i]=Math.min(255,color[0]*shade);image.data[i+1]=Math.min(255,color[1]*shade);image.data[i+2]=Math.min(255,color[2]*shade);image.data[i+3]=255;
 }
 function redraw(){for(let x=0;x<SIZE.x;x++)for(let z=0;z<SIZE.z;z++)column(x,z);t.putImageData(image,0,0);}
 let pending=false;
 redraw();
 const api={
  hidden:false,
  toggle(){api.hidden=!api.hidden;panel.hidden=api.hidden;if(api.hidden)expand(false);return api.hidden;},
  changed(x,z){column(x,z);if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;t.putImageData(image,0,0);});}},
  redraw,
  update(entities,you,view){
   if(api.hidden)return;
   m.clearRect(0,0,256,256);
   for(const e of entities){
    const self=e.id===you,p=self?view.position:e.position,identity=describeEntity(e,you);
    m.fillStyle=`#${identity.tint.toString(16).padStart(6,'0')}`;m.strokeStyle='#102a30';m.lineWidth=2;
    m.beginPath();m.arc(p.x*2,p.z*2,self?5:4,0,Math.PI*2);m.fill();m.stroke();
    if(self){const d=view.direction;m.beginPath();m.moveTo(p.x*2+d.x*11,p.z*2+d.z*11);m.lineTo(p.x*2-d.z*5,p.z*2+d.x*5);m.lineTo(p.x*2+d.z*5,p.z*2-d.x*5);m.closePath();m.fillStyle='#ffffff';m.fill();}
   }
   const place=islandAt(view.position.x,view.position.z);if(caption.textContent!==place)caption.textContent=place;
  },
 };
 return api;
}
