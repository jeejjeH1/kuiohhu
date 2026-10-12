// Profile audit rules (pure functions, no DOM): given what was read from your own profile, returns the checks and a
// score. Kept apart from the page code so it can be tested without X. Used by content/audit.js.
(() => {
  const CHECKS = [
    { id: 'name', weight: 10, label: 'نام نمایشی', tip: 'نام نمایشی را طوری بگذارید که موضوع اکانت را نشان بدهد.',
      pass: (p) => !!p.name && p.name.toLowerCase() !== (p.handle || '').toLowerCase() },
    { id: 'avatar', weight: 15, label: 'عکس پروفایل', tip: 'عکس پروفایل واقعی بگذارید. عکس پیش‌فرض اعتماد را کم می‌کند.',
      pass: (p) => p.hasAvatar === true },
    { id: 'banner', weight: 10, label: 'بنر', tip: 'بنر بگذارید؛ فضای خالی پروفایل حرفه‌ای به نظر نمی‌رسد.',
      pass: (p) => p.hasBanner === true },
    { id: 'bio', weight: 20, label: 'بیو', tip: 'بیو را بنویسید. حداقل ۶۰ کاراکتر و بگویید دقیقاً درباره‌ی چه چیزی حرف می‌زنید.',
      pass: (p) => (p.bio || '').trim().length >= 60 },
    { id: 'bioTopic', weight: 10, label: 'موضوع مشخص در بیو', tip: 'یک یا دو موضوع مشخص در بیو بیاورید (مثلاً «تحلیل DeFi و بازار»)، تا کسی که می‌بیند بداند چرا دنبالتان کند.',
      pass: (p) => (p.bio || '').trim().length >= 20 && (p.bio.match(/[#@]\S+|[\p{L}]{4,}/gu) || []).length >= 3 },
    { id: 'pinned', weight: 15, label: 'توییت پین‌شده', tip: 'بهترین توییت یا معرفی خودتان را پین کنید. اولین چیزی است که بازدیدکننده می‌بیند.',
      pass: (p) => p.hasPinned === true },
    { id: 'ratio', weight: 10, label: 'نسبت دنبال‌کننده به فالووینگ', tip: 'دنبال‌کردن زیاد بدون دنبال‌کننده، مثل فارم فالو به نظر می‌رسد. فالووینگ را کم کنید یا محتوای بیشتری بسازید.',
      pass: (p) => p.followers == null || p.following == null || p.following <= Math.max(200, p.followers * 2) },
  ];
  const INFO = [
    { id: 'location', label: 'موقعیت', present: (p) => !!p.location },
    { id: 'url', label: 'لینک', present: (p) => !!p.url },
  ];

  function auditProfile(p) {
    const checks = CHECKS.map((c) => {
      const ok = !!c.pass(p);
      return { id: c.id, label: c.label, ok, tip: ok ? '' : c.tip, weight: c.weight };
    });
    const total = CHECKS.reduce((n, c) => n + c.weight, 0);
    const got = checks.reduce((n, c) => n + (c.ok ? c.weight : 0), 0);
    const info = INFO.map((i) => ({ id: i.id, label: i.label, ok: !!i.present(p) }));
    const tips = checks.filter((c) => !c.ok).map((c) => c.tip);
    if (!info[0].ok) tips.push('موقعیت را اضافه کنید؛ به بعضی از بازدیدکننده‌ها کمک می‌کند بدانند از کجا حرف می‌زنید.');
    return { score: Math.round((got / total) * 100), checks, info, tips };
  }

  const api = { auditProfile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.XAL_AUDIT = api;
})();
