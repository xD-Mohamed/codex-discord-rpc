import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
export function parseNumstat(text) {
  let added=0,removed=0;
  for(const entry of text.split('\0')) {
    const m=/^(\d+|-)\t(\d+|-)\t/.exec(entry);
    if(m && m[1]!=='-' && m[2]!=='-') {added+=Number(m[1]);removed+=Number(m[2]);}
  }
  return {added,removed};
}
export class GitDiff {
  constructor() {this.cached=null;}
  async read(cwd,now=Date.now()) {
    if(!cwd)return null;
    if(this.cached?.cwd===cwd && now-this.cached.time<10_000)return this.cached.value;
    let value=null;
    try {
      const {stdout}=await exec('git',['--no-optional-locks','-C',cwd,'diff','--no-ext-diff','--no-textconv','--numstat','-z','HEAD','--'],{timeout:3000,maxBuffer:2*1024*1024,windowsHide:true,encoding:'utf8'});
      value=parseNumstat(stdout);
    } catch { /* Non-Git, unborn HEAD, timeout: omit unknown counts, never invent zero. */ }
    this.cached={cwd,time:now,value};return value;
  }
}
