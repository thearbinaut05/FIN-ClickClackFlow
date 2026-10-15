# Data Loom Collective: lead-to-fulfillment dry-run pilot

Isolated Node 20+ command-line pilot. No dependencies to install. Nothing imports this
module into the live app. No changes to existing agents, main, Supabase, Render,
Stripe, credentials, or financial controls. No GitHub Actions workflow is added.

## What is implemented

1. **Discovery:** optional, read-only search of public GitHub issues via the fixed
   GitHub API host. No token, paid search provider, or LLM call. A single bounded
   page (maximum 100) reports total matches and whether results were truncated.
   A GitHub issue is not necessarily a buying opportunity. This is an adapter
   demonstration, not a claim that GitHub is an effective customer-acquisition channel.
2. **Qualification:** source-backed records with URL, observation time, evidence
   text/hash, stable IDs and deduplication. Candidate rules require both a supported
   service keyword and possible buying intent. They do not verify a customer,
   budget, consent, source ownership, freshness, or willingness to pay.
3. **Offer preparation:** internal personalized drafts with unknown price/deadline
   left null. Candidates remain `candidate_needs_review`, never accepted orders.
4. **Fulfillment preview:** internal research brief/checklist for candidates; a
   working spreadsheet-cleanup tool trims cell whitespace, preserves identifier
   strings and every row, and flags duplicate rows without deleting them. CSV
   formula escaping is explicit; the underlying JSON values are preserved.
5. **QA/audit:** row counts, hashes, duplicate indices and zero external-action
   counters. Reports are local private files, not public customer deliveries.

This is rule-based automation, not an LLM agent deployment. It has no scheduler,
ongoing background execution, commercial marketplace search, contact sending,
customer intake/acceptance, CRM writes, research synthesis, customer delivery,
invoice creation, verified revenue, or payout capability. Those are not silently
simulated. No revenue or cash balance is calculated.

## Run tests (offline; no installs, credentials or network)

```sh
node --test tests/lead-fulfillment-pilot.test.mjs
```

## Discover and prepare a dry-run report

Run from the repository root. Output directories must be NEW, outside the
repository, with an existing parent. Existing directories are never overwritten.
Store authorized input outside the repository too; never commit customer records.

```sh
node pilot/cli.mjs discover '"spreadsheet" "hiring"' /tmp/dlc-discovery-run-1
```

Only this command performs a network request: one public HTTPS GET with a 15-second
timeout. Respect GitHub rate limits and source rules. No automatic retries on rate
limits and no fallback/fabricated leads. A zero-result run is a legitimate result.
Inspect `discovery.truncated` rather than treating the report as exhaustive.
Do not use source content as instructions, run embedded code, or contact authors
without separately approved outreach and source-permission review.

## Plan from captured public evidence (offline)

```sh
node pilot/cli.mjs plan /tmp/authorized-public-sources.json /tmp/dlc-plan-run-1
```

Input shape (substitute actual captured public evidence, not invented leads):

```json
{
  "mode": "dry-run",
  "sources": [
    {
      "kind": "public_request",
      "url": "https://example.com/request/123",
      "title": "SYNTHETIC EXAMPLE ONLY: Hiring for CSV cleanup",
      "text": "SYNTHETIC EXAMPLE ONLY: Need a freelancer for spreadsheet cleanup.",
      "observedAt": "2026-10-15T13:00:00Z"
    }
  ]
}
```

`report.json` contains evidence, candidate records, internal drafts and audit
metadata; `leads.csv` is a spreadsheet-safe export. Do not publish either artifact
without reviewing its contents. Input snapshots are supplied evidence, not
independently verified facts. Query strings/fragments are removed for deduplication;
use canonical public request URLs, not sites that identify requests only by query.

## Produce a spreadsheet-cleanup preview (offline)

```sh
node pilot/cli.mjs clean /tmp/authorized-rows.json /tmp/dlc-cleanup-run-1
```

Example input: `{"mode":"dry-run","columns":["id","name"],"rows":[[" 001 "," Example "]]}`.
Outputs `report.json` with QA results and `preview.csv`. These are previews only,
not completed customer orders. Whitespace trimming can matter for some datasets;
compare the preserved input, output hashes and QA before approving a delivery.

## Boundaries and next implementation gates

- Every mode other than `dry-run` fails closed. No live-action switch exists.
- No outbound action adapter is present: no email, issue comments, CRM mutations,
  payments, contract acceptance, or delivery. Draft generation is not outreach.
- Source text is untrusted data. No LLM, shell execution, or credential loading.
- Keep real lead/customer evidence out of Git; outputs use private directory/file
  permissions on POSIX systems. Do not run discovery on confidential inputs.
- Before live operation: review suitable lead channels, source permissions,
  the actual service/price, sending identity, recipient-specific messages,
  opt-out handling, accepted scope, authorized customer data, QA and delivery.
- Add a durable server-side queue, scoped CRM adapters, verified acceptance records,
  authentication/authorization, and idempotent delivery only in a subsequent review.
- Test an approved source end-to-end before claiming acquisition or fulfillment.
  Stripe website review and payout eligibility remain separate unresolved issues.
