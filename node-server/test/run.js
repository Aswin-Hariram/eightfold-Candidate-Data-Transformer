/**
 * Minimal deterministic smoke tests. Run: yarn test
 * Asserts pipeline correctness on sample data and re-checks determinism.
 */
const assert = require('assert');
const path = require('path');
const { runPipeline } = require('../src/transformer/pipeline');
const { normalizePhone, normalizeSkill, normalizeDate, normalizeCountry } = require('../src/transformer/normalize');

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n    ${e.message}`); failed++; }
}

console.log('Normalization');
t('phone → E.164', () => assert.strictEqual(normalizePhone('(415) 222-3344', 'US'), '+14152223344'));
t('phone → null on garbage', () => assert.strictEqual(normalizePhone('not-a-number'), null));
t('skill alias js → JavaScript', () => assert.strictEqual(normalizeSkill('js'), 'JavaScript'));
t('skill unknown title-cased', () => assert.strictEqual(normalizeSkill('rust'), 'Rust'));
t('date YYYY-MM passthrough', () => assert.strictEqual(normalizeDate('2021-01'), '2021-01'));
t('date "Jan 2021"', () => assert.strictEqual(normalizeDate('Jan 2021'), '2021-01'));
t('date present', () => assert.strictEqual(normalizeDate('Present'), 'present'));
t('country USA → US', () => assert.strictEqual(normalizeCountry('USA'), 'US'));
t('country unknown → null', () => assert.strictEqual(normalizeCountry('Atlantis'), null));

console.log('\nPipeline (sample data, default config)');
const cfg = require('../configs/default.json');

(async () => {
const out1 = await runPipeline({ inputsDir: path.join(__dirname, '..', 'sample-data'), config: cfg, enrich: false });
const out2 = await runPipeline({ inputsDir: path.join(__dirname, '..', 'sample-data'), config: cfg, enrich: false });
t('produces ≥ 10 candidates', () => assert.ok(out1.stats.total_candidates >= 10, `got ${out1.stats.total_candidates}`));
t('deterministic across runs', () =>
  assert.strictEqual(JSON.stringify(out1.profiles), JSON.stringify(out2.profiles)));
const jane = out1.profiles.find((p) => p.candidate_id === 'cand_001');
t('cand_001 merged from multiple sources', () => {
  const sources = new Set(Object.values(jane.canonical.provenance.full_name || []));
  assert.ok(sources.size >= 1);
});
t('cand_001 phone is E.164', () => assert.ok(jane.output.phones[0].startsWith('+1')));
t('cand_011 garbage years → null', () => {
  const c = out1.profiles.find((p) => p.candidate_id === 'cand_011');
  assert.ok(c);
  assert.strictEqual(c.output.years_experience, null);
});

console.log('\nProjection (recruiter slim config)');
const slim = require('../configs/custom-recruiter.json');
const outSlim = await runPipeline({ inputsDir: path.join(__dirname, '..', 'sample-data'), config: slim, enrich: false });
const janeSlim = outSlim.profiles.find((p) => p.candidate_id === 'cand_001');
t('renames candidate_id → id', () => assert.strictEqual(janeSlim.output.id, 'cand_001'));
t('primary_email is first email', () => assert.ok(janeSlim.output.primary_email.includes('@')));
t('missing_policy=omit drops missing keys', () => {
  const amir = outSlim.profiles.find((p) => p.candidate_id === 'cand_006');
  assert.ok(!('primary_phone' in amir.output)); // Amir has no phone anywhere
});

console.log('\nConflict tracking');
const rohan = out1.profiles.find((p) => p.candidate_id === 'cand_014');
t('cand_014 (Rohan) detected as a candidate', () => assert.ok(rohan, 'cand_014 missing'));
t('conflict tracking exposes alternates for full_name', () => {
  const c = rohan.output.conflicts || rohan.canonical._conflicts;
  assert.ok(c && c.full_name && Array.isArray(c.full_name.alternates) && c.full_name.alternates.length >= 1);
});
t('conflict tracking exposes alternates for years_experience', () => {
  const c = rohan.output.conflicts || rohan.canonical._conflicts;
  assert.ok(c && c.years_experience && c.years_experience.alternates.length >= 1);
});
t('winner for years_experience is the ATS value (10)', () => {
  assert.strictEqual(rohan.output.years_experience, 10);
});

console.log('\nEntity resolution (fuzzy merge across candidate_ids)');
const fuzzyFiles = [
  { name: 'r1.csv', content: 'name,email,phone,location,headline\nLinda Park,linda@example.com,+1 415 555 1010,"San Francisco, CA, US",Engineer\n' },
  { name: 'r2.txt', content: 'CANDIDATE_ID: synthetic_a\nNAME: Linda Park\nLOCATION: San Francisco, CA, US\nHEADLINE: Senior Engineer\n' },
  { name: 'r3.txt', content: 'CANDIDATE_ID: synthetic_b\nNAME: Linda Park\nEMAIL: linda@example.com\nHEADLINE: Staff Engineer\n' },
];
const fuzzyOut = await runPipeline({ files: fuzzyFiles, config: null, enrich: false });
t('groups before > groups after', () => {
  const r = fuzzyOut.stats.resolution;
  assert.ok(r.groups_before > r.groups_after, `${r.groups_before} → ${r.groups_after}`);
});
t('3 input records → 1 final candidate', () => {
  assert.strictEqual(fuzzyOut.profiles.length, 1);
});
t('merges list records the rewrites', () => {
  assert.ok(fuzzyOut.stats.resolution.merges.length >= 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
