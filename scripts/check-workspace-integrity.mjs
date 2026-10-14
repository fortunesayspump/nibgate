import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const req = folder => createRequire(path.resolve(root, folder, 'package.json'));
const resolved = (folder, name) => realpathSync(req(folder).resolve(name));
const packageFolder = (folder, name) => { let p = path.dirname(resolved(folder, name === '@tiptap/pm' ? '@tiptap/pm/state' : name)); while (!p.endsWith(name.replaceAll('/', path.sep))) { const parent=path.dirname(p); assert.notEqual(parent,p); p=parent; } return p; };
const manifest = (folder, name) => { let file; try { file=req(folder).resolve(`${name}/package.json`); } catch { file=path.join(packageFolder(folder,name), 'package.json'); } return JSON.parse(readFileSync(file, 'utf8')); };
for (const folder of ['frontend', 'backend', 'packages/cli', 'packages/wallet', 'subblogs/frontend', 'subblogs/backend']) assert.equal(resolved(folder, '@nibgate/sdk'), path.join(root, 'packages/nibgate/src/index.js'));
for (const folder of ['frontend', 'packages/nibgate', 'subblogs/frontend']) assert.equal(resolved(folder, '@nibgate/wallet'), path.join(root, 'packages/wallet/src/index.js'));
for (const folder of ['frontend', 'subblogs/frontend']) {
  assert.equal(resolved(folder, 'react'), resolved('packages/wallet', 'react'), `${folder}: wallet React identity`);
  assert.equal(manifest(folder, 'react').version, '19.2.4');
  assert.equal(manifest(folder, '@tiptap/core').version, '3.31.4');
  assert.equal(manifest(folder, '@tiptap/pm').version, '3.31.4');
  for (const name of ['@tiptap/react', '@tiptap/starter-kit']) {
    const dependencyFolder = packageFolder(folder, name);
    assert.equal(resolved(dependencyFolder, '@tiptap/core'), resolved(folder, '@tiptap/core'), `${folder}: ${name} core identity`);
    assert.equal(resolved(dependencyFolder, '@tiptap/pm/state'), resolved(folder, '@tiptap/pm/state'), `${folder}: ${name} ProseMirror identity`);
  }
}
for (const folder of ['packages/cli', 'dr-nib/backend']) assert.match(manifest(folder, 'prisma').version, /^5\./);
assert.match(manifest('subblogs/backend', 'prisma').version, /^6\./);
console.log('Workspace source links, shared React/editor identities, and Prisma majors verified.');
