const { appendFileSync } = require('node:fs');
const EXPECTED = '2026-10-15T13:47:00Z';
const CRON = '47 13 15 10 *';
function assess(runs, now = Date.now()) {
  const found = runs.find(r => r.event === 'schedule' &&
    r.display_title === `Reminders — ${CRON}` && Date.parse(r.created_at) >= Date.parse(EXPECTED));
  if (found) return { result: 'scheduled_run_created', run: found.id, status: found.status, conclusion: found.conclusion };
  return { result: now < Date.parse(EXPECTED) ? 'not_due_yet' : 'no_matching_schedule_event_recorded',
    note: 'Absence identifies a missing trigger, not its internal GitHub cause. Scheduling may be delayed.' };
}
async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo !== 'Ventsharm/Yearly-budget') throw Error('Unexpected repository');
  const get = async path => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    });
    // Never log response bodies or credentials on API errors.
    return { status: response.status, data: response.ok ? await response.json() : null };
  };
  const repository = await get('');
  const permissions = await get('actions/permissions');
  const records = [];
  for (const file of ['daily-reminders.yml', 'schedule-diagnostic.yml']) {
    const state = await get(`actions/workflows/${file}`);
    const history = await get(`actions/workflows/${file}/runs?event=schedule&per_page=10`);
    const runs = history.data?.workflow_runs || [];
    records.push({ workflow: file, state: state.data?.state || null,
      stateApiStatus: state.status, historyApiStatus: history.status,
      recentScheduledRuns: runs.map(r => ({ id: r.id, createdAt: r.created_at, status: r.status, conclusion: r.conclusion })),
      assessment: history.status !== 200 ? { result: 'history_unavailable' } : file === 'daily-reminders.yml' ? assess(runs) : {
        result: runs.some(r => Date.parse(r.created_at) >= Date.parse(EXPECTED)) ? 'scheduled_run_created' :
          Date.now() < Date.parse(EXPECTED) ? 'not_due_yet' : 'no_matching_schedule_event_recorded' } });
  }
  const report = { checkedAt: new Date().toISOString(), expectedTestAt: EXPECTED,
    trigger: process.env.GITHUB_EVENT_NAME, cron: process.env.DIAGNOSTIC_CRON || null,
    runId: process.env.GITHUB_RUN_ID, ref: process.env.GITHUB_REF,
    defaultBranch: repository.data?.default_branch || null, fork: repository.data?.fork ?? null,
    actionsSettings: { apiStatus: permissions.status,
      enabled: permissions.data?.enabled ?? null,
      note: permissions.status === 403 ? 'Connection cannot inspect administrative settings; this is not evidence Actions are disabled.' : null },
    workflows: records,
    limitation: 'A workflow cannot report a trigger GitHub never creates. Run this read-only report manually after the test to detect missing events.' };
  const rendered = JSON.stringify(report, null, 2);
  console.log(rendered);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Scheduler diagnostic\n\nNo Firebase access or notification sends.\n\n\`\`\`json\n${rendered}\n\`\`\`\n`);
  if (repository.status !== 200 || records.some(r => r.stateApiStatus !== 200 || r.historyApiStatus !== 200)) process.exitCode = 1;
}
if (require.main === module) main().catch(() => { console.error('Scheduler report failed: GitHub API or network unavailable. No Firebase access occurred.'); process.exitCode = 1; });
module.exports = { assess };
