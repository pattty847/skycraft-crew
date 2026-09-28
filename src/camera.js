import * as THREE from 'three';
import { raycast } from './raycast.js';

// Third person orbits behind the player; first person looks from the eyes. Zooming all
// the way in enters first person and zooming out leaves it. Each view keeps its own
// field of view (degrees), so a narrow orbit and a wide first person both feel right.
export const FOV_RANGE=Object.freeze({min:35,max:100});
export const DEFAULT_FOV=Object.freeze({third:43,first:72});
export const EYE_HEIGHT=1.5;
const OVERVIEW_TARGET=new THREE.Vector3(62,16,62);
// Scratch vectors: update() runs every frame and allocates nothing.
const goal=new THREE.Vector3(),backward=new THREE.Vector3(),ahead=new THREE.Vector3();

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.overview = true;
    this.target = new THREE.Vector3();
    this.firstPerson = false;
    this.fov = {...DEFAULT_FOV};
    this.reset();
  }

  reset() {
    this.yaw = .72;
    this.pitch = .5;
    this.distance = 8;
    this.actualDistance = 8;
    this.ready = false;
  }

  orbit(dx, dy) {
    this.yaw -= dx * .006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * .005, -1.35, 1.35);
  }

  zoom(delta) {
    const next = this.distance + delta * .012;
    if (!this.firstPerson && next < 3 && this.distance <= 3.05) { this.setFirstPerson(true); return; }
    if (this.firstPerson) { if (delta > 0) { this.setFirstPerson(false); this.distance = 3.5; } return; }
    this.distance = THREE.MathUtils.clamp(next, 3, 15);
  }

  setFirstPerson(on) { this.firstPerson = !!on; if (!on) this.distance = Math.max(this.distance, 3.5); }

  setFov(view, degrees) { this.fov[view] = THREE.MathUtils.clamp(Math.round(degrees), FOV_RANGE.min, FOV_RANGE.max); }

  // The field of view for the current view (the island overview keeps its framing).
  currentFov() { return this.overview ? DEFAULT_FOV.third : this.fov[this.firstPerson ? 'first' : 'third']; }

  update(entity, dt) {
    const p = entity.position;
    // Follow the eyes, below a two-block ceiling. The orbit can point almost straight up.
    const target = this.overview
      ? goal.copy(OVERVIEW_TARGET)
      : goal.set(p.x, p.y + EYE_HEIGHT, p.z);
    this.target.lerp(target, this.ready ? 1 - Math.exp(-dt * 10) : 1);
    // The overview frames the whole archipelago, not just Origin Island.
    const distance = this.overview ? (this.camera.aspect < .8 ? 205 : 118) : this.distance;
    backward.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    if (this.firstPerson && !this.overview) {
      // From the eyes: no boom, no collision retract. The target snaps so looking stays crisp.
      this.target.copy(target);this.actualDistance = 0;
      this.camera.position.copy(this.target);this.camera.lookAt(ahead.copy(this.camera.position).sub(backward));
      this.applyFov();this.ready = true;return;
    }
    const hit = this.overview ? null : raycast(this.world, this.target, backward, distance);
    // Collision retracts the boom without restricting the look angle. Leave enough
    // clearance for the near plane; allow an eye-level view in confined shelters.
    this.actualDistance = hit ? Math.max(0, hit.distance - .2) : distance;
    this.camera.position.copy(this.target).addScaledVector(backward, this.actualDistance);
    this.camera.lookAt(ahead.copy(this.camera.position).sub(backward));
    this.applyFov();
    this.ready = true;
  }

  applyFov() { const fov = this.currentFov(); if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); } }

  movement(x, z) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return { x: x * c + z * s, y: 0, z: -x * s + z * c };
  }
}
