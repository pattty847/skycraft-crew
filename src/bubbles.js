import * as THREE from 'three';
// Speech bubbles above every character, positioned over the canvas each frame.
export function createBubbles(parent) {
 const layer=document.createElement('div');layer.className='bubbles';layer.setAttribute('aria-hidden','true');parent.append(layer);
 const bubbles=new Map(),point=new THREE.Vector3();
 function element(id){
  let b=bubbles.get(id);if(b)return b;
  const el=document.createElement('div');el.className='bubble';layer.append(el);b={el,text:'',tone:null};bubbles.set(id,b);return b;
 }
 return {
  // speakers: [{id, position, text, tone}] — tone is a CSS class such as 'claude'.
  update(camera,speakers){
   const seen=new Set();
   for(const s of speakers){
    if(!s.text)continue;
    point.set(s.position.x,s.position.y+(s.height??2.25),s.position.z);
    const distance=point.distanceTo(camera.position);point.project(camera);
    if(point.z>1||distance>32||Math.abs(point.x)>1.2||Math.abs(point.y)>1.2)continue;
    seen.add(s.id);const b=element(s.id);
    if(b.text!==s.text){b.text=s.text;b.el.textContent=s.text;b.el.classList.remove('pop');void b.el.offsetWidth;b.el.classList.add('pop');}
    const tone=s.tone??'';if(b.tone!==tone){b.tone=tone;b.el.className=`bubble pop ${tone}`;}
    b.el.style.transform=`translate(${(point.x*.5+.5)*innerWidth}px,${(-point.y*.5+.5)*innerHeight}px) translate(-50%,-100%) scale(${THREE.MathUtils.clamp(14/distance,.7,1)})`;
    b.el.style.opacity=String(THREE.MathUtils.clamp((32-distance)/8,0,1));
   }
   for(const [id,b] of bubbles)if(!seen.has(id)){b.el.remove();bubbles.delete(id);}
  },
 };
}
