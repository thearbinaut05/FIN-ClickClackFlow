import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planPipeline, leadCsv, previewCleanup, discoverGitHubRequests } from './pipeline.mjs';

const usage = 'Usage: node pilot/cli.mjs <discover|plan|clean> <query|input.json> <NEW_OUTPUT_DIRECTORY_OUTSIDE_REPO>';
try {
  const [command, input, output, ...extra] = process.argv.slice(2);
  if (!input || !output || extra.length || !['discover', 'plan', 'clean'].includes(command)) throw new Error(usage);
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const requested = resolve(output);
  const out = join(await realpath(dirname(requested)), basename(requested));
  const rel = relative(await realpath(repo), out);
  if (rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))) {
    throw new Error('Output must be outside repository; never commit customer data');
  }
  let data;
  if (command === 'discover') data = await discoverGitHubRequests(input);
  else {
    const raw = await readFile(input, 'utf8');
    if (raw.length > 8000000) throw new Error('Input too large');
    data = JSON.parse(raw);
  }
  const result = command === 'clean' ? previewCleanup(data) : planPipeline(data);
  if (command === 'discover') result.discovery = data.discovery;
  // Refuse existing directories; write restrictive, private local artifacts only.
  await mkdir(out, { mode: 0o700 });
  await writeFile(join(out, 'report.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await writeFile(join(out, command === 'clean' ? 'preview.csv' : 'leads.csv'),
    command === 'clean' ? result.csv : leadCsv(result), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ mode: 'dry-run', output: out, metrics: result.metrics ?? result.qa,
    warning: 'No contacts, deliveries, payments, or CRM writes performed' }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
