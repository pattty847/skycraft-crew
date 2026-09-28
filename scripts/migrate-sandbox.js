import { Room } from '../server/room.js';
import { TERRAIN_VERSION } from '../server/terrain.js';
import { Trace } from '../server/trace.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const directory=process.env.SKY_DATA_DIR;
if(!directory)throw Error('Set SKY_DATA_DIR to the saved-world directory before running the Sandbox migration.');
if(!existsSync(join(directory,'world.json')))throw Error('No world.json exists in SKY_DATA_DIR; refusing to create a new world.');
const room=new Room(directory);
if(room.sandboxMigrated){const trace=new Trace(directory);trace.record('terrain.sandbox',{msg:'Filled empty Sandbox cells on saved world'});await trace.close();}
const version=room.extensionSnapshots().terrain.frontier;
if(version!==TERRAIN_VERSION)throw Error(`Terrain migration ended at version ${version}, expected ${TERRAIN_VERSION}.`);
console.log(`Sandbox terrain ready in ${room.file} (version ${version}).`);
