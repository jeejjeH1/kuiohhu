// Profile audit on your own profile: a button reads what your profile shows (name, avatar, banner, bio, pinned
// tweet, follow counts) and shows the checks from audit-rules.js. Nothing is sent anywhere.
(() => {
  const { XAL } = window;
  const RULES = window.XAL_AUDIT;

  const onOwnProfile = () => {
    const me = XAL.me();
    if (!me) return false;
    const p = location.pathname.toLowerCase();
    return p === `/${me.toLowerCase()}` || p === `/${me.toLowerCase()}/with_replies`;
  };

  // Reads the profile header and the top of the timeline as X renders them now.
  function readProfile(handle) {
    const text = (sel) => (document.querySelector(sel)?.textContent || '').trim();
    const nameBox = document.querySelector('[data-testid="UserName"]');
    const name = nameBox ? (nameBox.querySelector('span')?.textContent || '').trim() : '';
    const countOf = (suffix) => {
      const a = [...document.querySelectorAll(`a[href$="${suffix}"]`)].find((x) => /\d|[۰-۹]/.test(x.textContent));
      return a ? XAL.parseNum(a.textContent) : null;
    };
    const avatar = [...document.querySelectorAll('img[src*="profile_images"]')].find((i) => !/default_profile/.test(i.src));
    const banner = [...document.querySelectorAll('img[src*="profile_banners"]')][0];
    const pinned = [...document.querySelectorAll('[data-testid="socialContext"]')].some((s) => /pinned|سنجاق/i.test(s.textContent));
    return {
      handle,
      name,
      hasAvatar: !!avatar,
      hasBanner: !!banner,
      bio: text('[data-testid="UserDescription"]'),
      location: text('[data-testid="UserLocation"]'),
      url: text('[data-testid="UserUrl"]'),
      hasPinned: pinned,
      followers: countOf('/verified_followers') ?? countOf('/followers'),
      following: countOf('/following'),
    };
  }

  const esc = XAL.esc;

  XAL.fab('audit', '🩺 ممیزی پروفایل', onOwnProfile, () => {
    const me = XAL.me();
    const { body } = XAL.modal({ title: '🩺 ممیزی پروفایل' });
    const r = RULES.auditProfile(readProfile(me));
    const color = r.score >= 80 ? 'var(--green, #2fe39a)' : r.score >= 50 ? '#ffd166' : '#ff8a95';
    body.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <div><div class="muted">امتیاز پروفایل @${esc(me)}</div></div>
        <div style="font-size:34px;font-weight:900;color:${color};direction:ltr">${XAL.fa(r.score)}<small style="font-size:14px">/۱۰۰</small></div>
      </div>
      <div class="bar" style="margin:12px 0 16px"><i style="width:${r.score}%"></i></div>
      <div class="audit-list"></div>
      <div class="muted" style="margin:14px 0 6px">موارد اطلاعاتی</div>
      <div class="row audit-info"></div>
      ${r.tips.length ? '<div class="muted" style="margin:16px 0 6px">پیشنهادها</div><ol class="audit-tips"></ol>' : '<p style="margin-top:14px">همه‌ی موارد پر شده است. ✓</p>'}
      <p class="muted" style="font-size:12px;margin-top:14px">این بررسی فقط از همین صفحه می‌خواند و جایی فرستاده نمی‌شود. اگر چیزی را اشتباه می‌بینید، صفحه را کامل باز کنید و دوباره بزنید.</p>`;
    const list = body.querySelector('.audit-list');
    for (const c of r.checks) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.cssText = 'justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.07)';
      row.innerHTML = `<span>${c.ok ? '✓' : '✗'} ${esc(c.label)}</span><span class="muted">${XAL.fa(c.weight)} امتیاز</span>`;
      row.firstChild.style.color = c.ok ? 'var(--green, #2fe39a)' : '#ff8a95';
      list.appendChild(row);
    }
    const info = body.querySelector('.audit-info');
    if (info) for (const i of r.info) {
      const chip = document.createElement('span');
      chip.className = `chip${i.ok ? ' on' : ''}`;
      chip.textContent = `${i.ok ? '✓' : '—'} ${i.label}`;
      info.appendChild(chip);
    }
    const tips = body.querySelector('.audit-tips');
    if (tips) for (const t of r.tips) {
      const li = document.createElement('li');
      li.style.margin = '6px 0';
      li.textContent = t;
      tips.appendChild(li);
    }
  });
})();
