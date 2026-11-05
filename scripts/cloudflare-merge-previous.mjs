import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

// These are public static files from the last manual deployments. Retain them
// so already-open tabs can load their old chunks after the first Git build.
export function mergePrevious(target, assets) {
 const archive = resolve('cloudflare/previous-static', `${target}.tar.gz`);
 if (!existsSync(archive)) return;
 const tmp = mkdtempSync(join(tmpdir(), 'nibgate-assets-'));
 try {
  const unpack = spawnSync('tar', ['-xzf', archive, '-C', tmp], {stdio:'inherit'});
  if (unpack.status !== 0) throw Error('Could not unpack previous static assets');
  let copied = 0;
  function walk(dir, relative='') {
   for (const entry of readdirSync(dir, {withFileTypes:true})) {
    const rel=join(relative,entry.name), src=join(dir,entry.name), dest=join(assets,rel);
    if(entry.isDirectory()) {walk(src,rel);continue;}
    if(!entry.isFile() || !rel.startsWith('_next/static/')) throw Error('Unexpected previous asset');
    if(existsSync(dest)) {
     const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
     if(!statSync(dest).isFile() || hash(src)!==hash(dest)) throw Error(`Static asset collision: ${rel}`);
    } else {mkdirSync(dirname(dest),{recursive:true});cpSync(src,dest);copied++;}
   }
  }
  walk(tmp);console.log(`Retained ${copied} previous static files for ${target}`);
 } finally {rmSync(tmp,{recursive:true,force:true});}
}
