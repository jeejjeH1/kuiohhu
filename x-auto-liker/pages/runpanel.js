// Run panel shared by the follow-back pages: progress, today's count against the cap, pause / resume / stop.
// Needs these ids on the page: runPanel runTitle runSub runDone runErr runToday runCapText runBar pauseBtn stopBtn.
(() => {
  const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const $ = (id) => document.getElementById(id);
let runCap = 20;
async function refreshRun() {
  const { runState: r, unfollowLog, unfollowCfg } = await chrome.storage.local.get(['runState', 'unfollowLog', 'unfollowCfg']);
  runCap = r?.dailyCap || unfollowCfg?.cap || 20;
  const today = new Date().toISOString().slice(0, 10);
  const todayN = unfollowLog?.day === today ? unfollowLog.n : 0;
  const unf = r?.kind === 'unfollow';
  const active = !!r && unf && (r.running || (r.phase === 'done' || r.phase === 'stopped') && !r.dismissed && r.results?.length);
  $('runPanel').hidden = !active;
  if (!active) return;
  const total = r.queue.length, results = r.results || [];
  const done = results.filter((x) => x.result === 'unfollowed').length;
  const errs = results.filter((x) => x.result === 'error').length;
  $('runTitle').textContent = r.running ? (r.paused ? 'مکث شده' : 'در حال آنفالو') : (r.phase === 'stopped' ? 'متوقف شد' : 'تمام شد');
  $('runSub').textContent = r.statusText || `${fa(results.length)} از ${fa(total)}`;
  $('runDone').textContent = fa(done);
  $('runErr').textContent = fa(errs);
  $('runToday').textContent = `${fa(todayN)} از ${fa(runCap)}`;
  $('runCapText').textContent = 'امروز از سقف';
  $('runBar').style.width = `${total ? (results.length / total) * 100 : 0}%`;
  $('pauseBtn').textContent = r.paused ? '▶ ادامه' : '⏸ مکث';
  $('pauseBtn').hidden = !r.running;
  $('stopBtn').hidden = !r.running;
}
$('pauseBtn').addEventListener('click', async () => {
  const { runState: r } = await chrome.storage.local.get('runState');
  chrome.runtime.sendMessage({ type: r?.paused ? 'resume' : 'pause' });
});
$('stopBtn').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'stop' }));
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && (c.runState || c.unfollowLog)) refreshRun(); });
refreshRun();

})();
