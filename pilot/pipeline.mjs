import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const text = (value, name, max = 20000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`Invalid ${name}`);
  return value.trim();
};
export function dryRunOnly(mode = 'dry-run') {
  if (mode !== 'dry-run') fail('LIVE_ACTIONS_DISABLED');
}
function publicUrl(value) {
  const url = new URL(text(value, 'source URL', 2048));
  if (url.protocol !== 'https:' || url.username || url.password || url.port) fail('Invalid source URL');
  // Evidence links are never fetched by the planner. Reject obvious local/private links anyway.
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') ||
      host.endsWith('.internal') || /^[\d.]+$/.test(host) || host.includes(':')) fail('Invalid source host');
  url.hash = ''; url.search = '';
  return url.href;
}
const services = [
  { id: 'spreadsheet_cleanup', label: 'spreadsheet cleanup', terms: /\b(spreadsheet|csv|excel|data cleaning|data cleanup)\b/i },
  { id: 'business_research', label: 'business research', terms: /\b(business research|market research|competitor research|company research)\b/i },
];
const buyingIntent = /\b(hiring|paid|budget|looking to hire|seeking a freelancer|need a freelancer)\b/i;

export function planPipeline(input) {
  if (!input || typeof input !== 'object') fail('Invalid input');
  dryRunOnly(input.mode);
  if (!Array.isArray(input.sources) || input.sources.length > 100) fail('Provide at most 100 evidence sources');
  const seen = new Set();
  const leads = input.sources.map(source => {
    if (!source || source.kind !== 'public_request') fail('Source must be a public_request');
    const url = publicUrl(source.url);
    const title = text(source.title, 'title', 500);
    const body = text(source.text, 'source text');
    const observedAt = text(source.observedAt, 'observedAt', 40);
    if (!Number.isFinite(Date.parse(observedAt))) fail('Invalid observedAt');
    if (seen.has(url)) return null;
    seen.add(url);
    const evidence = `${title}\n${body}`;
    const service = services.find(item => item.terms.test(evidence));
    const candidate = !!service && buyingIntent.test(evidence);
    return {
      id: hash(url).slice(0, 20), sourceUrl: url, title, observedAt,
      evidenceSha256: hash(evidence), evidenceText: body,
      service: service?.id ?? null,
      status: candidate ? 'candidate_needs_review' : 'not_qualified',
      reasons: [service ? `Service match: ${service.id}` : 'No supported service match',
        buyingIntent.test(evidence) ? 'Possible buying intent in source; not verified' : 'No explicit buying intent'],
      customerVerified: false, acceptanceVerified: false, paymentVerified: false,
      // A public request is not permission to contact its author.
      outreach: 'blocked_pending_approval',
      offerDraft: candidate ? {
        sender: 'Data Loom Collective', state: 'draft_not_sent',
        body: `Regarding your public request: ${title}. Data Loom Collective can discuss ${service.label}. Please confirm the scope, authorized inputs, acceptance criteria, and budget before any agreement.`,
        price: null, deadline: null,
      } : null,
      preview: candidate ? {
        state: 'internal_research_brief_not_delivered',
        sourceUrl: url, requestExcerpt: body.slice(0, 800),
        checklist: service.id === 'spreadsheet_cleanup'
          ? ['Obtain authorized rows', 'Preserve values and identifiers', 'Trim whitespace', 'Flag duplicate rows', 'Validate row counts', 'Review before delivery']
          : ['Agree research question', 'Gather dated public evidence', 'Cite each factual claim', 'Mark unknowns', 'Review before delivery'],
      } : null,
    };
  }).filter(Boolean);
  return {
    schemaVersion: 1, mode: 'dry-run', leads,
    metrics: { sourcesReceived: input.sources.length, uniqueSources: leads.length,
      candidates: leads.filter(lead => lead.status === 'candidate_needs_review').length,
      messagesSent: 0, acceptedOrders: 0, deliveriesSent: 0, paymentsVerified: 0 },
    audit: ['evidence_ingested', 'qualification_rules_applied', 'drafts_prepared', 'all_external_writes_disabled'],
    limitations: ['Rule-based candidates, not verified customers', 'No outreach or contract acceptance',
      'No scheduler, CRM writes, delivery transport, billing, or payout integration'],
  };
}

export function csvCell(value) {
  let out = String(value ?? '');
  // Prevent spreadsheet formula injection in all exported text, including headings.
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(out) || /^[\t\r\n]/u.test(out)) out = `'${out}`;
  return `"${out.replaceAll('"', '""')}"`;
}
export function tableCsv(columns, rows) {
  return [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function leadCsv(plan) {
  return tableCsv(['id', 'source_url', 'title', 'service', 'status'], plan.leads.map(lead =>
    [lead.id, lead.sourceUrl, lead.title, lead.service, lead.status]));
}
export function previewCleanup(input) {
  if (!input || typeof input !== 'object') fail('Invalid cleanup input');
  dryRunOnly(input.mode);
  const { columns, rows } = input;
  if (!Array.isArray(columns) || !columns.length || columns.length > 100) fail('Invalid columns');
  const headings = columns.map(column => text(column, 'column', 200));
  if (new Set(headings).size !== headings.length) fail('Duplicate headings');
  if (!Array.isArray(rows) || rows.length > 10000) fail('Invalid rows');
  const seen = new Set();
  const duplicateRowIndices = [];
  let trimmedCells = 0;
  const cleaned = rows.map((row, index) => {
    if (!Array.isArray(row) || row.length !== headings.length) fail('Row width mismatch');
    const values = row.map(value => {
      if (typeof value === 'string') {
        if (value.length > 20000) fail('Cell too large');
        if (value !== value.trim()) trimmedCells++;
        return value.trim();
      }
      if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
      fail('Unsupported cell value');
    });
    const key = JSON.stringify(values);
    if (seen.has(key)) duplicateRowIndices.push(index);
    seen.add(key);
    return values;
  });
  return { mode: 'dry-run', status: 'preview_not_delivered', columns: headings, rows: cleaned,
    csv: tableCsv(headings, cleaned),
    qa: { inputRows: rows.length, outputRows: cleaned.length, trimmedCells, duplicateRowIndices,
      rowsDeleted: 0, typeCoercions: 0, formulaEscapingAppliedToCsv: true },
    inputSha256: hash(JSON.stringify({ columns, rows })),
    outputSha256: hash(JSON.stringify({ columns: headings, rows: cleaned })),
  };
}

// Free, read-only public discovery adapter. This is NOT a marketplace or proof of a budget.
// No tokens, cookies, credentials, custom hosts, redirects, or external writes.
export async function discoverGitHubRequests(query, { fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  query = text(query, 'search query', 300);
  const url = new URL('https://api.github.com/search/issues');
  url.searchParams.set('q', `${query} is:issue is:open`);
  url.searchParams.set('per_page', '100');
  url.searchParams.set('sort', 'updated');
  const response = await fetchImpl(url, { method: 'GET', redirect: 'error',
    signal: AbortSignal.timeout(15000), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Data-Loom-Pilot' } });
  if (!response.ok) fail(`DISCOVERY_FAILED_HTTP_${response.status}; no placeholder leads created`);
  if (Number(response.headers.get('content-length')) > 4000000) fail('Discovery response too large');
  const raw = await response.text();
  if (raw.length > 4000000) fail('Discovery response too large');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.items) || data.items.length > 100 || !Number.isInteger(data.total_count)) fail('Invalid discovery response');
  const observedAt = now().toISOString();
  const sources = data.items.filter(item => !item.pull_request).map(item => {
    const sourceUrl = new URL(item.html_url);
    if (sourceUrl.origin !== 'https://github.com' || !/^\/[^/]+\/[^/]+\/issues\/\d+$/.test(sourceUrl.pathname)) fail('Invalid discovery source');
    return { kind: 'public_request', url: sourceUrl.href, title: item.title,
      text: typeof item.body === 'string' && item.body.trim() ? item.body.slice(0, 20000) : item.title,
      observedAt };
  });
  return { mode: 'dry-run', sources,
    discovery: { provider: 'github_public_issues', totalMatches: data.total_count,
      fetched: data.items.length, truncated: data.total_count > data.items.length || data.incomplete_results === true,
      note: 'Bounded one-page pilot; results may be software issues, not commercial opportunities. Review required.' } };
}
