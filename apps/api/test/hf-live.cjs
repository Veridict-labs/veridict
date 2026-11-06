// Opt-in, credit-consuming evaluation. Ordinary test:api never runs this file.
const { execFileSync } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { Client } = require('pg');

async function main() {
  if (process.env.HF_LIVE_TEST !== '1')
    throw new Error('Set HF_LIVE_TEST=1 to authorize live HF credit usage');
  if (!process.env.HF_TOKEN || !process.env.HF_MODEL)
    throw new Error('HF_TOKEN and HF_MODEL are required in apps/api/.env');
  if (
    !new RegExp('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+)?$').test(
      process.env.HF_MODEL,
    )
  )
    throw new Error('HF_MODEL must be a valid namespace/model identifier');
  const container = `veridict-hf-live-${process.pid}-${randomUUID().slice(0, 8)}`;
  const docker = (...args) =>
    execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    }).trim();
  let app;
  let started = false;
  const report = {
    kind: 'HF_LIVE_SYNTHETIC_EVALUATION',
    synthetic: true,
    workbuddy_verified: false,
    official_organizer_tests: false,
    checked_at: new Date().toISOString(),
    model: process.env.HF_MODEL,
    database: 'temporary container, removed after evaluation',
    scenarios: [],
  };
  try {
    docker(
      'run',
      '--rm',
      '-d',
      '--name',
      container,
      '-e',
      'POSTGRES_USER=test',
      '-e',
      'POSTGRES_PASSWORD=test',
      '-e',
      'POSTGRES_DB=veridict_hf_test',
      '-p',
      '127.0.0.1::5432',
      'pgvector/pgvector:pg17',
    );
    started = true;
    const port = docker('port', container, '5432/tcp').split(':').at(-1);
    process.env.DATABASE_URL = `postgresql://test:test@127.0.0.1:${port}/veridict_hf_test`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      const probe = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 500,
      });
      try {
        await probe.connect();
        await probe.query('SELECT 1');
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      } finally {
        await probe.end().catch(() => {});
      }
    }
    if (!ready) throw new Error('Temporary database unavailable');
    execFileSync(
      process.execPath,
      [
        path.resolve(__dirname, '../../../node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        env: process.env,
        stdio: 'pipe',
        timeout: 60000,
      },
    );
    const { createApplication } = require('../dist/application');
    const { seedDemo } = require('../dist/demo/seed-demo');
    app = await createApplication(false);
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    process.env.MCP_PUBLIC_URL = `${url}/mcp`;
    const password = randomBytes(24).toString('hex');
    const manifest = await seedDemo(app, {
      slug: `hf-live-${randomUUID().slice(0, 8)}`,
      password,
    });
    async function request(route, token, body) {
      const response = await fetch(`${url}${route}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(240000),
      });
      return { status: response.status, body: await response.json() };
    }
    const login = await request('/v1/auth/login', null, {
      org_slug: manifest.org_slug,
      email: 'employee@example.test',
      password,
    });
    if (login.status !== 201) throw new Error('Synthetic login failed');
    const token = login.body.access_token;
    const selected = process.argv.includes('--all')
      ? [
          'fuel_conflict',
          'restricted',
          'missing',
          'reconciliation',
          'multi_source',
        ]
      : ['fuel_conflict'];
    for (const scenarioKey of selected) {
      const scenario = manifest.scenarios.find((s) => s.key === scenarioKey);
      const created = await request('/v1/inquiries', token, {
        question: scenario.question,
      });
      if (created.status !== 201)
        throw new Error('Synthetic inquiry creation failed');
      const run = await request(
        `/v1/inquiries/${created.body.inquiry_id}/run`,
        token,
        {},
      );
      const result = await request(
        `/v1/inquiries/${created.body.inquiry_id}`,
        token,
      );
      const trace = await request(
        `/v1/inquiries/${created.body.inquiry_id}/trace?limit=100`,
        token,
      );
      const row = {
        key: scenarioKey,
        question: scenario.question,
        expected: scenario.expected,
        http_status: run.status,
        error: run.body.error ?? null,
        status: result.body.status,
        answer: result.body.answer,
        official_truth: result.body.official_truth,
        operational_truth: result.body.operational_truth,
        assumptions: result.body.assumptions,
        limitations: result.body.limitations,
        evidence: (result.body.citations ?? []).map((e) => ({
          source_type: e.source_type,
          title: e.title,
          excerpt: e.excerpt,
        })),
        model_calls: run.body.model_calls ?? null,
        trace: (trace.body.results ?? []).map((e) => ({
          event_type: e.event_type,
          tool: e.metadata?.tool ?? null,
          decision: e.decision,
        })),
      };
      row.checks = {
        completed: run.status === 201,
        structured: [
          'ANSWERED',
          'NEEDS_CLARIFICATION',
          'INSUFFICIENT_EVIDENCE',
          'UNAVAILABLE',
        ].includes(row.status),
        cited_if_answered: row.status !== 'ANSWERED' || row.evidence.length > 0,
        ...(scenarioKey === 'fuel_conflict'
          ? {
              expected_amount:
                /750[.,]?000/.test(row.answer ?? '') &&
                row.status === 'ANSWERED',
            }
          : {}),
        ...(scenarioKey === 'restricted' || scenarioKey === 'missing'
          ? {
              abstained: ['INSUFFICIENT_EVIDENCE', 'UNAVAILABLE'].includes(
                row.status,
              ),
            }
          : {}),
        ...(scenarioKey === 'reconciliation'
          ? {
              official_director: /Director|Direktur/i.test(
                row.official_truth?.statement ?? '',
              ),
              practice_separate: row.operational_truth !== null,
            }
          : {}),
        ...(scenarioKey === 'multi_source'
          ? {
              all_source_types: ['DOCUMENT', 'CHAT', 'TASK'].every((type) =>
                row.evidence.some((e) => e.source_type === type),
              ),
            }
          : {}),
      };
      row.passed = Object.values(row.checks).every(Boolean);
      report.scenarios.push(row);
      console.log(
        JSON.stringify({
          scenario: scenarioKey,
          status: row.status,
          error: row.error,
          passed: row.passed,
          model_calls: row.model_calls,
        }),
      );
      // Do not spend further credits when the selected model/account cannot run.
      if (run.status !== 201) break;
    }
  } finally {
    if (app) await app.close().catch(() => {});
    if (started) {
      try {
        docker('rm', '-f', container);
      } catch {
        /* Already removed. */
      }
    }
    const directory = path.resolve(__dirname, '../../../docs/evaluation');
    fs.mkdirSync(directory, { recursive: true });
    const reportPath = path.join(
      directory,
      `hf-live-${report.checked_at.replace(/[:.]/g, '-')}.json`,
    );
    report.summary = {
      attempted: report.scenarios.length,
      passed: report.scenarios.filter((s) => s.passed).length,
      limitations: [
        'Synthetic automated checks do not establish semantic correctness, complete injection resistance, or organizer scores. Manual review of every answer and its evidence is required.',
      ],
    };
    const safeReport = JSON.stringify(report, null, 2)
      .split(process.env.HF_TOKEN)
      .join('[REDACTED_TOKEN]');
    fs.writeFileSync(reportPath, safeReport + '\n');
    console.log(
      `Evaluation report: ${path.relative(path.resolve(__dirname, '../../..'), reportPath)}`,
    );
    if (!report.scenarios.length || report.scenarios.some((s) => !s.passed))
      process.exitCode = 1;
  }
}

void main().catch((error) => {
  // Error messages are limited to local fixed diagnostics, never raw HF/network errors.
  const safe = [
    'Set HF_LIVE_TEST=1 to authorize live HF credit usage',
    'HF_TOKEN and HF_MODEL are required in apps/api/.env',
    'HF_MODEL must be a valid namespace/model identifier',
    'Temporary database unavailable',
    'Synthetic login failed',
    'Synthetic inquiry creation failed',
  ];
  console.error(
    safe.includes(error.message)
      ? error.message
      : 'Live evaluation could not be completed; inspect the safe report and Docker connectivity.',
  );
  process.exitCode = 1;
});
