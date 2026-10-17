import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('setup replacement covers every locked upstream role without legacy import', () => {
  const provenance = JSON.parse(readFileSync(new URL('../generated/provenance.json', import.meta.url)));
  const setup = readFileSync(new URL('../overrides/skills/setup-pstack/SKILL.md', import.meta.url), 'utf8');
  for (const role of provenance.roles) assert.ok(setup.includes(`\`${role}\``), `Missing role ${role}`);
  assert.ok(!setup.includes('p3-models.md'));
});
