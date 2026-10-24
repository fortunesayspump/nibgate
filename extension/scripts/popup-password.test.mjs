import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../src/popup/popup.ts', import.meta.url), 'utf8');
const passwordIds = ['new-password', 'imp-password', 'recover-password', 'recover-password-confirm', 'lock-password', 'reveal-password'];

test('every extension password field has an accessible, non-submit visibility control', () => {
  for (const id of passwordIds) {
    assert.match(html, new RegExp(`<input id="${id}" type="password"[^>]*>`));
    assert.match(html, new RegExp(`<button type="button" class="password-toggle" data-password-toggle="${id}" aria-label="Show password" aria-pressed="false">`));
  }
  assert.equal((html.match(/data-password-toggle=/g) || []).length, passwordIds.length);
  assert.match(html, /icons\/eye-look\.svg/);
  assert.match(html, /mask: url\('icons\/eye-look\.svg'\)/);
  assert.match(html, /background: currentColor/);
  assert.match(html, /\.password-toggle\[aria-pressed="true"\] \{ color: var\(--accent\)/);
  assert.match(html, /input:focus-visible, textarea:focus-visible \{ outline: none; border-color: var\(--accent\); box-shadow: 0 0 0 1px var\(--accent\); \}/);
});

test('visibility is local UI state that starts and returns concealed', () => {
  assert.match(script, /function concealPasswords\(\)/);
  assert.match(script, /input\.type = 'password'/);
  assert.match(script, /visible \? 'text' : 'password'/);
  assert.match(script, /visible \? 'Hide password' : 'Show password'/);
  assert.match(script, /function showScreen\(name: AppScreen\) \{\s*concealPasswords\(\);/);
  assert.doesNotMatch(script, /storage\.(?:local|sync)\.set\([^)]*password-toggle/);
});
