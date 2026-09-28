// Tiny synthesized sound effects. Silent until the player turns sound on with ♪.
export class Sfx {
 constructor(){this.enabled=false;this.context=null;}
 setEnabled(enabled){
  this.enabled=enabled;
  if(enabled&&!this.context){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=.22;this.master.connect(this.context.destination);}
  if(this.context)(enabled?this.context.resume():this.context.suspend()).catch(()=>{});
 }
 ready(){return this.enabled&&this.context?.state==='running';}
 tone(frequency,duration,{type='sine',volume=.4,glide=1,delay=0}={}){
  if(!this.ready())return;
  const c=this.context,start=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();
  o.type=type;o.frequency.setValueAtTime(frequency,start);o.frequency.exponentialRampToValueAtTime(frequency*glide,start+duration);
  g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(volume,start+.01);g.gain.exponentialRampToValueAtTime(.0001,start+duration);
  o.connect(g).connect(this.master);o.start(start);o.stop(start+duration+.02);
 }
 noise(duration,{volume=.35,frequency=900,q=.8}={}){
  if(!this.ready())return;
  const c=this.context,buffer=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)**2;
  const source=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=q;g.gain.value=volume;
  source.connect(filter).connect(g).connect(this.master);source.start();
 }
 // Softer and lower with distance; nothing beyond 18 blocks.
 near(distance){return distance<18?1-distance/18:0;}
 broke(blockId,distance){const v=this.near(distance);if(!v)return;this.noise(.16,{volume:.5*v,frequency:[0,700,500,1400,900,650,1200,1600,1800,800][blockId]??900});}
 placed(distance){const v=this.near(distance);if(!v)return;this.tone(170,.09,{type:'triangle',volume:.5*v,glide:.6});}
 chirp(){this.tone(880,.09,{volume:.18,glide:1.35});this.tone(1320,.12,{volume:.14,glide:1.2,delay:.08});}
 blip(){this.tone(620,.08,{type:'square',volume:.06,glide:1.1});}
 confirm(){this.tone(660,.1,{volume:.16});this.tone(990,.16,{volume:.14,delay:.09});}
}
