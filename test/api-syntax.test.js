import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function javascriptFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await javascriptFiles(path));
    else if (entry.isFile() && path.endsWith('.js')) found.push(path);
  }
  return found;
}

test('all server-side JavaScript files parse', async () => {
  const files = [...await javascriptFiles('api'), ...await javascriptFiles('lib')];
  assert.ok(files.length > 0, 'expected server-side JavaScript files');
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file} failed syntax check:\n${result.stderr || result.stdout}`);
  }
});
