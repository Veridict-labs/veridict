// Legacy opt-in command: explicitly selects HF, never falls back from Gemini.
if (process.env.HF_LIVE_TEST !== '1') {
  console.error('Set HF_LIVE_TEST=1 to authorize live HF credit usage');
  process.exitCode = 1;
} else {
  process.env.AI_LIVE_TEST = '1';
  process.env.AI_PROVIDER = 'huggingface';
  require('./agent-live.cjs');
}
