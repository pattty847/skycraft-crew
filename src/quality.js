// Render quality, chosen once at startup. Desktop keeps the full look; phones
// (touch-first, small screen or little memory) trade resolution, MSAA, shadow
// detail and light count for frame rate. localStorage 'sky:quality' overrides.
export const QUALITY_KEY='sky:quality';
export const TIERS=Object.freeze({
 // shadowInterval 0: the shadow map redraws every frame (three's autoUpdate).
 high:Object.freeze({name:'high',pixelRatio:2,antialias:true,shadowMapSize:2048,softShadows:true,shadowInterval:0,lights:9,meshBudgetMs:8}),
 // Shadows redraw when the view moves 2 blocks, the terrain changes, or (at most
 // every shadowInterval seconds) while someone is moving.
 phone:Object.freeze({name:'phone',pixelRatio:1.5,antialias:false,shadowMapSize:1024,softShadows:false,shadowInterval:.1,lights:3,meshBudgetMs:4}),
});

export function chooseTier({override,coarsePointer=false,screenWidth=Infinity,screenHeight=Infinity,deviceMemory}={}){
 if(override==='high'||override==='phone')return override;
 if(coarsePointer)return 'phone';
 if(Math.min(screenWidth,screenHeight)<600)return 'phone';
 if(typeof deviceMemory==='number'&&deviceMemory<4)return 'phone';
 return 'high';
}

export function detectQuality(env=globalThis){
 let override=null;
 try{override=env.localStorage?.getItem(QUALITY_KEY);}catch{}
 let coarsePointer=false;
 try{coarsePointer=!!env.matchMedia?.('(pointer: coarse)').matches;}catch{}
 const tier=chooseTier({override,coarsePointer,screenWidth:env.screen?.width,screenHeight:env.screen?.height,deviceMemory:env.navigator?.deviceMemory});
 return TIERS[tier];
}

// Decides, frame by frame, whether a cached shadow map needs redrawing. The sun
// keeps a fixed angle to the view, so a stale map stays consistent with its own
// shadow matrix; only a moved view, changed terrain or moving characters matter.
export function shadowSchedule({interval=.1,step=2}={}){
 let pending=true,since=0;const anchor={x:NaN,y:NaN,z:NaN};
 return {
  request(){pending=true;},
  tick(dt,target,moving=false){
   since+=dt;
   const moved=!(Math.hypot(target.x-anchor.x,target.y-anchor.y,target.z-anchor.z)<=step);
   if(!pending&&!moved&&!(moving&&since>=interval-1e-9))return false;
   pending=false;since=0;anchor.x=target.x;anchor.y=target.y;anchor.z=target.z;
   return true;
  },
 };
}
