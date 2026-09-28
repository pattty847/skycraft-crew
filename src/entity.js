import { BLOCK_COUNT } from './blocks.js';
import { createActions } from './actions.js';
export class Entity {
  constructor(id, position, emit) {
    this.id=id;
    this.position={...position};
    this.velocity={x:0,y:0,z:0};
    this.direction={x:0,y:0,z:1};
    this.grounded=false;
    this.inventory=new Uint16Array(BLOCK_COUNT);
    this.inventory[5]=3;this.inventory[9]=24;
    this.selected=9;
    this.breaking=null;
    this.gesture=null;
    this.speech='A little world. A lot of possibilities.';
    this.speechUntil=5;
    this.actions=createActions(id,emit);
  }
}
