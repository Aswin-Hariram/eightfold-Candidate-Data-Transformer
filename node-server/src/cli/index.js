#!/usr/bin/env node
/**
 * Candidate Transformer CLI — feature parity with the web UI.
 *
 * Commands:
 *   transform   Run the pipeline on a directory, explicit files, or bundled samples.
 *   configs     List available output configs (configs/*.json).
 *   formats     List supported input formats.
 *
 * Mirrors every web-UI capability:
 *   - multi-file / directory / sample inputs        (--inputs, --files, --sample)
 *   - output config selection by name or path       (--config)
 *   - GitHub + LinkedIn enrichment with toggles     (--enrich/--no-enrich, --no-github, --no-linkedin)
 *   - extra enrichment URLs                          (--url, repeatable)
 *   - entity-resolution merges + conflict tracking   (shown in summary / --conflicts)
 *   - provenance + confidence + per-file stats       (summary / table views)
 *   - raw JSON output                                (--format json / --out)
 */
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { runPipeline } = require('../transformer/pipeline');
const { validateConfig } = require('../transformer/validate-config');
const pkg = require('../../package.json');

const ROOT = path.join(__dirname, '..', '..');
const SAMPLE_DIR = path.join(ROOT, 'sample-data');
const CONFIG_DIR = path.join(ROOT, 'configs');
const OUTPUT_DIR = path.join(ROOT, 'outputs');

// ---- tiny ANSI color helper (no dependency) -------------------------------
let COLOR = process.stdout.isTTY;
const wrap = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const C = {
  bold: wrap(1), dim: wrap(2), red: wrap(31), green: wrap(32),
  yellow: wrap(33), blue: wrap(34), magenta: wrap(35), cyan: wrap(36), gray: wrap(90),
};
const bar = (s = '') => C.gray('─'.repeat(Math.max(0, 58 - s.length)));
const heading = (s) => `\n${C.bold(C.cyan(s))} ${bar(s)}`;

// ---- input collection ------------------------------------------------------
function collectFiles(globs) {
  const out = [];
  for (const g of globs || []) {
    const p = path.resolve(g);
    if (!fs.existsSync(p)) { console.error(C.yellow(`! skipped (not found): ${g}`)); continue; }
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(p)) {
        const fp = path.join(p, name);
        if (fs.statSync(fp).isFile()) out.push({ name, content: fs.readFileSync(fp) });
      }
    } else {
      out.push({ name: path.basename(p), content: fs.readFileSync(p) });
    }
  }
  return out;
}

function resolveConfig(value) {
  if (!value) return null;
  // by path
  let p = path.resolve(value);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  // by name in configs/
  const named = value.endsWith('.json') ? value : `${value}.json`;
  p = path.join(CONFIG_DIR, named);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  throw new Error(`Config not found: '${value}' (looked at path and in configs/)`);
}

// ---- pretty views ----------------------------------------------------------
function printStats(stats) {
  console.log(heading('Pipeline Stats'));
  console.log(`  Records parsed : ${C.bold(stats.total_records)}`);
  console.log(`  Candidates     : ${C.bold(C.green(stats.total_candidates))}`);
  console.log(`  Orphan records : ${stats.orphan_records ? C.yellow(stats.orphan_records) : 0}`);

  if (stats.files && stats.files.length) {
    console.log(heading('Files'));
    for (const f of stats.files) {
      if (f.error) console.log(`  ${C.red('✗')} ${f.file} ${C.dim('— ' + f.error)}`);
      else console.log(`  ${C.green('✓')} ${f.file} ${C.dim(`(${f.records} record${f.records === 1 ? '' : 's'}, ${f.source || 'unknown'})`)}`);
    }
  }

  const e = stats.enrichment || {};
  if ((e.github || e.linkedin || e.failed)) {
    console.log(heading('Enrichment'));
    console.log(`  GitHub   : ${C.bold(e.github || 0)}`);
    console.log(`  LinkedIn : ${C.bold(e.linkedin || 0)}`);
    if (e.failed) {
      console.log(`  Failed   : ${C.yellow(e.failed)}`);
      for (const err of (e.errors || []).slice(0, 5)) console.log(`    ${C.dim('• ' + err)}`);
    }
  }

  const r = stats.resolution || {};
  if (r.merges && r.merges.length) {
    console.log(heading('Entity Resolution'));
    console.log(`  ${C.dim(`${r.groups_before} group(s) → ${r.groups_after} candidate(s)`)}`);
    for (const m of r.merges) console.log(`  ${C.magenta('⤳')} merged ${C.dim(m.from)} into ${C.bold(m.into)}`);
  }
}

function fmtLocation(loc) {
  if (!loc) return '—';
  return [loc.city, loc.region, loc.country].filter(Boolean).join(', ') || loc.raw || '—';
}

function confColor(v) {
  const n = Number(v || 0);
  const s = n.toFixed(2);
  if (n >= 0.75) return C.green(s);
  if (n >= 0.5) return C.yellow(s);
  return C.red(s);
}

function printConflicts(out, indent = '  ') {
  const conflicts = out.conflicts || {};
  const keys = Object.keys(conflicts);
  if (!keys.length) return false;
  console.log(`${indent}${C.yellow('⚠ Conflicts:')}`);
  for (const field of keys) {
    const c = conflicts[field];
    const win = typeof c.winner === 'object' ? JSON.stringify(c.winner) : c.winner;
    console.log(`${indent}  ${C.bold(field)}: ${C.green(win)} ${C.dim('← ' + (c.winning_sources || []).join(', '))}`);
    for (const alt of c.alternates || []) {
      const av = typeof alt.value === 'object' ? JSON.stringify(alt.value) : alt.value;
      console.log(`${indent}    ${C.gray('vs')} ${av} ${C.dim('(' + (alt.sources || []).join(', ') + ', w=' + alt.weight + ')')}`);
    }
  }
  return true;
}

function printProfilesSummary(profiles) {
  console.log(heading(`Canonical Profiles (${profiles.length})`));
  for (const p of profiles) {
    const o = p.output || {};
    const name = o.full_name || p.canonical?.full_name || C.dim('(no name)');
    console.log(`\n  ${C.bold(C.blue('● ' + name))}  ${C.dim('[' + p.candidate_id + ']')}  conf ${confColor(o.overall_confidence)}`);
    if (o.headline) console.log(`    ${C.dim(o.headline)}`);
    const emails = o.emails || p.canonical?.emails || [];
    const phones = o.phones || p.canonical?.phones || [];
    const skills = o.skills || p.canonical?.skills || [];
    if (emails.length) console.log(`    ${C.gray('email')}  ${emails.join(', ')}`);
    if (phones.length) console.log(`    ${C.gray('phone')}  ${phones.join(', ')}`);
    console.log(`    ${C.gray('loc')}    ${fmtLocation(o.location || p.canonical?.location)}`);
    if (skills.length) console.log(`    ${C.gray('skills')} ${skills.slice(0, 12).join(', ')}${skills.length > 12 ? C.dim(` +${skills.length - 12} more`) : ''}`);
    const exp = (o.experience || p.canonical?.experience || []).length;
    const edu = (o.education || p.canonical?.education || []).length;
    console.log(`    ${C.gray('exp')}    ${exp} role(s)   ${C.gray('edu')} ${edu} entr(y/ies)`);
    if (p.canonical?._github) {
      const g = p.canonical._github;
      console.log(`    ${C.gray('github')} @${g.handle} ${C.dim(`(${g.public_repos} repos, ${g.followers} followers)`)}`);
    }
    printConflicts(o, '    ');
    if (p.validation && !p.validation.ok) {
      console.log(`    ${C.red('✗ validation:')} ${p.validation.errors.join('; ')}`);
    }
  }
}

function printProfilesTable(profiles) {
  console.log(heading(`Candidates (${profiles.length})`));
  const rows = profiles.map((p) => {
    const o = p.output || {};
    const cn = p.canonical || {};
    return {
      id: p.candidate_id,
      name: o.full_name || o.name || cn.full_name || '—',
      email: (o.emails || cn.emails || [])[0] || '—',
      skills: (o.skills || cn.skills || []).length,
      conf: Number(o.overall_confidence ?? cn.overall_confidence ?? 0).toFixed(2),
      conflicts: Object.keys(o.conflicts || cn._conflicts || {}).length,
    };
  });
  const w = (k, h) => Math.max(h.length, ...rows.map((r) => String(r[k]).length));
  const cols = [
    ['name', 'NAME'], ['id', 'ID'], ['email', 'EMAIL'], ['skills', '#SK'], ['conf', 'CONF'], ['conflicts', '#CFL'],
  ];
  const widths = Object.fromEntries(cols.map(([k, h]) => [k, w(k, h)]));
  const line = (vals, color = (x) => x) =>
    '  ' + cols.map(([k]) => color(String(vals[k]).padEnd(widths[k]))).join('  ');
  console.log(line(Object.fromEntries(cols.map(([k, h]) => [k, h])), C.bold));
  console.log('  ' + cols.map(([k]) => C.gray('─'.repeat(widths[k]))).join('  '));
  for (const r of rows) console.log(line(r));
}

// ---- transform handler -----------------------------------------------------
async function transformHandler(argv) {
  if (argv.color === false) COLOR = false;

  // `--color` (explicit) restores the previous human-readable summary view,
  // unless the user explicitly asked for a specific --format.
  const rawArgs = hideBin(process.argv);
  const colorExplicit = rawArgs.includes('--color');
  const formatExplicit = rawArgs.some((a) => a === '--format' || a.startsWith('--format='));
  if (colorExplicit && !formatExplicit) argv.format = 'summary';

  const config = resolveConfig(argv.config);
  if (config) {
    const v = validateConfig(config);
    for (const w of v.warnings) console.error(C.yellow('⚠ config: ') + w);
    if (!v.ok) {
      for (const e of v.errors) console.error(C.red('✗ config: ') + e);
      throw new Error('Invalid output config — fix the error(s) above.');
    }
  }

  let inputsDir = null;
  if (argv.sample) inputsDir = SAMPLE_DIR;
  else if (argv.inputs) inputsDir = path.resolve(argv.inputs);
  const files = collectFiles(argv.files);
  const urls = argv.url || [];

  if (!inputsDir && files.length === 0 && urls.length === 0) {
    throw new Error('No input provided. Use --inputs <dir>, --files <a> <b>, --url <link>, or --sample.');
  }

  if (!argv.quiet) console.error(C.dim('Running pipeline…'));
  const result = await runPipeline({
    inputsDir,
    files,
    urls,
    config,
    enrich: argv.enrich,
    enrichGithub: argv.github,
    enrichLinkedin: argv.linkedin,
  });

  const emitted = {
    generated_at: new Date().toISOString(),
    stats: result.stats,
    profiles: result.profiles.map((p) => ({
      candidate_id: p.candidate_id,
      output: p.output,
      validation: p.validation,
    })),
  };

  if (argv.out) {
    const text = argv.pretty ? JSON.stringify(emitted, null, 2) : JSON.stringify(emitted);
    fs.mkdirSync(path.dirname(path.resolve(argv.out)), { recursive: true });
    fs.writeFileSync(path.resolve(argv.out), text);
    if (!argv.quiet) console.error(C.green(`✓ Wrote ${result.profiles.length} profile(s) to ${argv.out}`));
  } else if (argv.save !== false) {
    // Default behaviour: persist the JSON result into outputs/.
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(OUTPUT_DIR, `transform-${ts}.json`);
    const text = argv.pretty ? JSON.stringify(emitted, null, 2) : JSON.stringify(emitted);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(outPath, text);
    if (!argv.quiet) console.error(C.green(`✓ Wrote ${result.profiles.length} profile(s) to ${path.relative(ROOT, outPath)}`));
  }

  if (argv.quiet) return;

  switch (argv.format) {
    case 'json':
      process.stdout.write((argv.pretty ? JSON.stringify(emitted, null, 2) : JSON.stringify(emitted)) + '\n');
      break;
    case 'table':
      printStats(result.stats);
      printProfilesTable(result.profiles);
      break;
    case 'conflicts': {
      printStats(result.stats);
      console.log(heading('Conflicts'));
      let any = false;
      for (const p of result.profiles) {
        if (Object.keys(p.output.conflicts || {}).length) {
          console.log(`\n  ${C.bold(C.blue(p.output.full_name || p.candidate_id))} ${C.dim('[' + p.candidate_id + ']')}`);
          printConflicts(p.output, '    ');
          any = true;
        }
      }
      if (!any) console.log(`  ${C.green('No conflicts across sources.')}`);
      break;
    }
    case 'summary':
    default:
      printStats(result.stats);
      printProfilesSummary(result.profiles);
      console.log('');
  }
}

// ---- configs / formats handlers --------------------------------------------
function configsHandler(argv) {
  if (argv.color === false) COLOR = false;
  const files = fs.existsSync(CONFIG_DIR) ? fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json')) : [];
  console.log(heading('Available output configs'));
  if (!files.length) { console.log('  (none)'); return; }
  for (const f of files) {
    const cfg = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, f), 'utf8'));
    const keys = (cfg.fields || []).map((x) => x.key);
    console.log(`  ${C.bold(f.replace(/\.json$/, ''))} ${C.dim('— ' + (keys.length ? keys.join(', ') : 'all fields'))}`);
  }
  console.log('');
}

function formatsHandler(argv) {
  if (argv.color === false) COLOR = false;
  console.log(heading('Supported input formats'));
  console.log('  ' + ['.csv', '.json', '.txt', '.pdf', '.docx'].map((x) => C.cyan(x)).join('  '));
  console.log(C.dim('\n  Enrichment: GitHub & LinkedIn URLs found in any source are auto-fetched.\n'));
}

function validateHandler(argv) {
  if (argv.color === false) COLOR = false;
  const config = resolveConfig(argv.config);
  const v = validateConfig(config);
  console.log(heading(`Validate config: ${argv.config}`));
  for (const w of v.warnings) console.log(`  ${C.yellow('⚠')} ${w}`);
  for (const e of v.errors) console.log(`  ${C.red('✗')} ${e}`);
  if (v.ok) console.log(`  ${C.green('✓ Config is valid.')}`);
  console.log('');
  if (!v.ok) process.exit(1);
}

// ---- wiring ----------------------------------------------------------------
yargs(hideBin(process.argv))
  .scriptName('candidate-transform')
  .usage('$0 <command> [options]')
  .command(
    ['transform', '$0'],
    'Run the candidate transform pipeline',
    (y) => y
      .option('inputs', { type: 'string', describe: 'Directory of source files' })
      .option('files', { type: 'array', describe: 'Explicit input file(s)' })
      .option('sample', { type: 'boolean', default: false, describe: 'Use bundled sample-data' })
      .option('config', { type: 'string', describe: 'Output config by name (configs/) or path' })
      .option('url', { type: 'array', describe: 'Extra GitHub/LinkedIn URL(s) to enrich' })
      .option('enrich', { type: 'boolean', default: true, describe: 'Enable GitHub/LinkedIn enrichment' })
      .option('github', { type: 'boolean', default: true, describe: 'Enable GitHub enrichment' })
      .option('linkedin', { type: 'boolean', default: true, describe: 'Enable LinkedIn enrichment' })
      .option('format', { choices: ['summary', 'table', 'conflicts', 'json'], default: 'json', describe: 'Console output style (default: json)' })
      .option('out', { type: 'string', describe: 'Write full JSON result to a specific file' })
      .option('save', { type: 'boolean', default: true, describe: 'Auto-save JSON result to outputs/ (use --no-save to skip)' })
      .option('pretty', { type: 'boolean', default: true, describe: 'Pretty-print JSON' })
      .option('quiet', { type: 'boolean', default: false, describe: 'Suppress console output (use with --out)' })
      .example('$0 --sample', 'Transform bundled sample data (JSON to stdout + outputs/)')
      .example('$0 --inputs ./data --config hiring-manager --format table', 'Use a named config, table view')
      .example('$0 --files a.pdf b.csv --no-enrich --out out.json', 'Two files, no enrichment, write JSON'),
    transformHandler
  )
  .command('configs', 'List available output configs', {}, configsHandler)
  .command('formats', 'List supported input formats', {}, formatsHandler)
  .command(
    'validate <config>',
    'Validate a custom output config file (path or name in configs/)',
    (y) => y.positional('config', { type: 'string', describe: 'Config file path or name' }),
    validateHandler
  )
  .option('color', { type: 'boolean', default: true, global: true, describe: 'ANSI colors. Pass --color to show the rich summary view (pre-JSON output); --no-color disables colors' })
  .version(pkg.version)
  .alias('v', 'version')
  .help()
  .alias('h', 'help')
  .strict()
  .wrap(Math.min(110, process.stdout.columns || 110))
  .fail((msg, err) => {
    console.error(C.red('Error: ') + (err ? err.message : msg));
    process.exit(1);
  })
  .parseAsync()
  .catch((e) => { console.error(C.red('Error: ') + e.message); process.exit(1); });
