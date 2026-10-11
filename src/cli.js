#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CodexSource, activePet } from './source.js';
import { activity, ANIMATIONS } from './activity.js';
import { DiscordRPC } from './rpc.js';
import { APPLICATION_ID, ARTWORK_BASE, BUILTIN_PETS } from './config.js';

const {values} = parseArgs({options:{help:{type:'boolean',short:'h'},once:{type:'boolean'},'dry-run':{type:'boolean'},'hide-project':{type:'boolean'},pet:{type:'string'},'codex-home':{type:'string'},'artwork-base':{type:'string'},'no-image':{type:'boolean'}}});
if(values.help) {
  console.log(`Codex Pet Presence\n\nUsage: codex-pet-presence [options]\n\n  --dry-run          Preview ONLY the public activity, without Discord\n  --once             Read/send once and exit (diagnostic)\n  --hide-project     Hide the project name too\n  --pet NAME         Override automatic companion selection\n  --codex-home PATH  Custom Codex data directory\n  --artwork-base URL Public HTTPS directory for your own artwork\n  --no-image         Text-only activity\n\nRequires Node 22.18+ and Discord desktop. No account token or API key.\nCtrl+C clears presence. No background install or startup changes.`);
  process.exit(0);
}
if(values.pet && !BUILTIN_PETS.includes(values.pet)) throw new Error(`Choose a built-in pet: ${BUILTIN_PETS.join(', ')}`);
const home=values['codex-home'] || process.env.CODEX_HOME || join(homedir(),'.codex');
const source=new CodexSource(home,{hideProject:values['hide-project']});
const rpc=new DiscordRPC(APPLICATION_ID);
let stopped=false,lastPayload='',lastError='',lastSent=0;
rpc.on('disconnected',()=>{lastPayload='';});
async function stop() {stopped=true;if(rpc.ready)try{await rpc.setActivity(null);}catch{}rpc.close();source.close();}
process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
console.log(values['dry-run']?'Codex Pet Presence · local preview':'Codex Pet Presence · connecting to Discord');
while(!stopped) {
  try {
    const snapshot=source.snapshot();
    const selected=values.pet || activePet(home);
    const pet=BUILTIN_PETS.includes(selected)?selected:null;
    const base=values['artwork-base'] || ARTWORK_BASE;
    const image=snapshot && pet && !values['no-image'] ? `${base.replace(/\/$/,'')}/${pet}/${ANIMATIONS[snapshot.state] || 'idle'}.gif` : undefined;
    const payload=activity(snapshot,image), serialized=JSON.stringify(payload);
    if(values['dry-run']) {if(serialized!==lastPayload)console.log(JSON.stringify(payload,null,2));lastPayload=serialized;}
    else {
      if(!rpc.ready) {await rpc.connect();lastPayload='';console.log('Connected · Codex');}
      // Coalesce rapid transitions, keeping Discord updates to at most one / 5 s.
      if(serialized!==lastPayload && Date.now()-lastSent>=5000) {await rpc.setActivity(payload);lastPayload=serialized;lastSent=Date.now();console.log(snapshot?`${payload.details}${snapshot.project?' · '+snapshot.project:''}`:'Presence cleared');}
    }
    lastError='';
  } catch(e) {
    // Never display raw SQL, session data or command contents in diagnostics.
    const message=e.message.startsWith('Discord') || e.message.startsWith('Current Codex') ? e.message : 'Activity unavailable; no private data was published. Check Codex compatibility.';
    if(message!==lastError)console.error(message);lastError=message;
    if(rpc.ready)try{await rpc.setActivity(null);lastPayload='';}catch{}
    if(values.once)process.exitCode=1;
  }
  if(values.once)break;
  await new Promise(r=>setTimeout(r,1500));
}
await stop();
