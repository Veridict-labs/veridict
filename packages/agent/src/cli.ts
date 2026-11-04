import { CheckpointError, runMcpSmoke } from './index';

async function main() {
  const report = await runMcpSmoke({
    baseUrl: process.env.VERIDICT_API_URL ?? 'http://localhost:3001',
    token: process.env.VERIDICT_AGENT_TOKEN ?? '',
    query: process.env.VERIDICT_SMOKE_QUERY ?? 'onboarding',
  });
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  const code =
    error instanceof CheckpointError ? error.code : 'MCP_UNAVAILABLE';
  console.error(JSON.stringify({ error: code, workbuddy_verified: false }));
  process.exitCode = 1;
});
