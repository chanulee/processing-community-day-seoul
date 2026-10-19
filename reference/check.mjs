import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

for (const name of readdirSync('sketch').filter(name => name.endsWith('.js'))) {
  new vm.Script(readFileSync(`sketch/${name}`, 'utf8'), { filename: name });
}

// These curves drive transitions: verify complete, finite, forward progress.
const easing = vm.createContext({ pow: Math.pow });
vm.runInContext(readFileSync('sketch/animators.js', 'utf8'), easing);
for (const name of ['easeInQuad', 'easeInExpo', 'easeOutExpo', 'easeOutQuint', 'easeInOutQuint']) {
  const curve = easing[name];
  assert.equal(curve(0), 0, name);
  assert.equal(curve(1), 1, name);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const value = curve(i / 100);
    assert.ok(Number.isFinite(value) && value >= previous && value <= 1, name);
    previous = value;
  }
}

const assets = readdirSync('sketch/resources');
assert.equal(assets.length, 18);
for (const name of assets) {
  const bytes = readFileSync(`sketch/resources/${name}`);
  const signature = name.endsWith('.png') ? '89504e470d0a1a0a' : '00010000';
  assert.equal(bytes.subarray(0, signature.length / 2).toString('hex'), signature, name);
}
assert.match(readFileSync('vendor/p5.min.js', 'utf8'), /p5\.js v1\.11\.13/);
console.log('Passed: script syntax, transition curves, 18 assets, and pinned p5 runtime.');
