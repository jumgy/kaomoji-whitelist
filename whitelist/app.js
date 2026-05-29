const SUPABASE_URL = 'https://qwabvvnpprxksnqlfmow.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_X8Fwu6nENNv0ZzjfELalhg_rCr6eJOs';

const TWITTER_HANDLE = 'kaomojinft';
const TWEET_ID = '2059363078450315727';
const TWITTER_PROFILE_URL = 'https://x.com/' + TWITTER_HANDLE;
const TWEET_URL =
  'https://x.com/' + TWITTER_HANDLE + '/status/' + TWEET_ID;

const isSupabaseConfigured =
  SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
  SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY' &&
  typeof window.supabase !== 'undefined';

let supabaseClient = null;
if (isSupabaseConfigured) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('Supabase init failed:', e);
  }
}

const screens = {
  form:    document.getElementById('screen-form'),
  success: document.getElementById('screen-success'),
  applied: document.getElementById('screen-applied'),
};

const dom = {
  connectPanel:      document.getElementById('connect-panel'),
  userBar:           document.getElementById('user-bar'),
  btnConnectTwitter: document.getElementById('btn-connect-twitter'),
  btnApply:          document.getElementById('btn-apply'),
  btnDisconnect:     document.getElementById('btn-disconnect'),
  btnDisconnectSuccess: document.getElementById('btn-disconnect-success'),
  btnDisconnectApplied: document.getElementById('btn-disconnect-applied'),
  userAvatar:        document.getElementById('user-avatar'),
  userDisplayName:   document.getElementById('user-display-name'),
  userTwitterHandle: document.getElementById('user-twitter-handle'),
  totalPoints:       document.getElementById('total-points'),
  connectPtsBadge:   document.getElementById('connect-pts-badge'),
  taskConnect:       document.getElementById('task-connect'),
  taskConnectHint:   document.getElementById('task-connect-hint'),
  walletInput:       document.getElementById('wallet-input'),
  walletError:       document.getElementById('wallet-error'),
  finalScore:        document.getElementById('final-score'),
  appliedScore:      document.getElementById('applied-score'),
  statusBadge:       document.getElementById('status-badge'),
  taskFollow:        document.getElementById('task-follow'),
  taskLike:          document.getElementById('task-like'),
  taskRepost:        document.getElementById('task-repost'),
  taskComment:       document.getElementById('task-comment'),
};

let currentUser = null;
let existingEntry = null;
let twitterConnected = false;

const taskState = {
  follow:  false,
  like:    false,
  repost:  false,
  comment: false,
};

function showScreen(name) {
  Object.values(screens).forEach((s) => {
    if (s) s.classList.remove('active');
  });
  if (screens[name]) screens[name].classList.add('active');
}

function captureReferral() {
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref) {
    localStorage.setItem('kaomoji_ref', ref);
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function getSavedReferral() {
  return localStorage.getItem('kaomoji_ref') || null;
}

/** Confirmed score only — awarded columns set manually in Supabase. */
function calcPoints(entry, refCount) {
  if (!entry) return 0;
  let pts = entry.connect_points || 0;
  pts += entry.pts_follow || 0;
  pts += entry.pts_like || 0;
  pts += entry.pts_repost || 0;
  pts += entry.pts_comment || 0;
  pts += (refCount || 0) * 3;
  return pts;
}

const TASK_BADGE_LABELS = {
  'task-connect': '1-10 pts',
  'task-follow':  '+2 pts',
  'task-like':    '+1 pt',
  'task-repost':  '1-10 pts',
  'task-comment': '+1 pt',
};

function setTaskReviewNote(el, visible) {
  if (!el) return;
  const note = el.querySelector('.task-review-note');
  if (note) note.hidden = !visible;
}

function resetTaskBadge(el) {
  if (!el || !el.id) return;
  const badge = el.querySelector('.task-points');
  const label = TASK_BADGE_LABELS[el.id];
  if (badge && label) {
    badge.textContent = label;
    badge.classList.add('task-points--hint');
    badge.classList.remove('task-points--review');
  }
  setTaskReviewNote(el, false);
}

function isValidWallet(addr) {
  if (!addr) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

function markTaskClaimed(el) {
  el.classList.add('completed');
  el.classList.remove('task-item--locked');
  const check = el.querySelector('.task-check');
  if (check) check.innerHTML = '&#10003;';
  resetTaskBadge(el);
  setTaskReviewNote(el, true);
}

function resetOptionalTasks() {
  ['task-follow', 'task-like', 'task-repost', 'task-comment'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('completed');
    const check = el.querySelector('.task-check');
    if (check) check.innerHTML = '';
    resetTaskBadge(el);
  });
  taskState.follow = false;
  taskState.like = false;
  taskState.repost = false;
  taskState.comment = false;
}

function setTasksLocked(locked) {
  [dom.taskFollow, dom.taskLike, dom.taskRepost, dom.taskComment].forEach((el) => {
    if (!el) return;
    if (locked) {
      el.classList.add('task-item--locked');
      el.classList.remove('completed');
      const check = el.querySelector('.task-check');
      if (check) check.innerHTML = '';
    } else {
      el.classList.remove('task-item--locked');
    }
  });
}

function updateApplyState() {
  const walletVal = dom.walletInput.value.trim();
  const walletValid = isValidWallet(walletVal);
  const canApply = twitterConnected && taskState.follow && walletValid;
  dom.btnApply.disabled = !canApply;

  if (dom.walletError) {
    if (walletVal.length > 0 && !walletValid) {
      dom.walletError.textContent = 'Enter a valid EVM address (0x + 40 hex characters)';
      dom.walletInput.classList.add('error');
    } else {
      dom.walletError.textContent = '';
      dom.walletInput.classList.remove('error');
    }
  }

  if (dom.totalPoints) {
    const verified = existingEntry ? calcPoints(existingEntry, 0) : 0;
    dom.totalPoints.innerHTML = verified + ' <small>verified pts</small>';
  }
}

function markTwitterConnected(user, meta) {
  twitterConnected = true;

  dom.connectPanel.classList.add('is-hidden');
  dom.userBar.classList.remove('is-hidden');
  dom.btnDisconnect.classList.remove('is-hidden');

  const avatar = meta.avatar_url || meta.picture || '';
  const displayName = meta.full_name || meta.name || meta.user_name || 'User';
  const handle = meta.user_name || meta.preferred_username || '';

  dom.userAvatar.src = avatar;
  dom.userAvatar.alt = displayName;
  dom.userDisplayName.textContent = displayName;
  dom.userTwitterHandle.textContent = handle ? '@' + handle : '';

  if (dom.taskConnectHint) {
    dom.taskConnectHint.textContent = 'Connected · 1-10 on review';
  }
  markTaskClaimed(dom.taskConnect);

  setTasksLocked(false);
  updateApplyState();
}

function markTwitterDisconnected() {
  twitterConnected = false;
  currentUser = null;

  dom.connectPanel.classList.remove('is-hidden');
  dom.userBar.classList.add('is-hidden');
  dom.btnDisconnect.classList.add('is-hidden');

  dom.taskConnect.classList.remove('completed');
  const check = dom.taskConnect.querySelector('.task-check');
  if (check) check.innerHTML = '';
  if (dom.taskConnectHint) {
    dom.taskConnectHint.textContent = 'Better account quality = more points (1-10). Connect above.';
  }
  resetTaskBadge(dom.taskConnect);
  if (dom.connectPtsBadge) dom.connectPtsBadge.textContent = '1-10 pts';

  resetOptionalTasks();
  setTasksLocked(true);
  updateApplyState();
}

function setupTaskHandler(el, taskKey, intentUrl) {
  if (!el || el.dataset.bound === '1') return;
  el.dataset.bound = '1';
  el.style.cursor = 'pointer';

  el.addEventListener('click', () => {
    if (!twitterConnected) return;
    if (taskState[taskKey]) return;
    window.open(intentUrl, '_blank', 'noopener');
    taskState[taskKey] = true;
    markTaskClaimed(el);
    updateApplyState();
  });
}

function initTaskHandlers() {
  setupTaskHandler(dom.taskFollow, 'follow', TWITTER_PROFILE_URL);
  setupTaskHandler(dom.taskLike, 'like', TWEET_URL);
  setupTaskHandler(dom.taskRepost, 'repost', TWEET_URL);
  setupTaskHandler(dom.taskComment, 'comment', TWEET_URL);
}

function buildRefLink(code) {
  return window.location.origin + window.location.pathname + '?ref=' + code;
}

function showReferralUI(code, linkId, copyId, shareId, bonusId, countId, pointsId) {
  const link = buildRefLink(code);
  const linkEl = document.getElementById(linkId);
  const copyBtn = document.getElementById(copyId);
  const shareBtn = document.getElementById(shareId);

  if (linkEl) linkEl.textContent = link;

  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(link).then(() => {
        copyBtn.textContent = 'COPIED!';
        setTimeout(() => { copyBtn.textContent = 'COPY'; }, 2000);
      });
    };
  }

  if (shareBtn) {
    shareBtn.onclick = () => {
      const text = encodeURIComponent(
        'I just joined the @kaomojinft whitelist! Join using my link:\n' + link
      );
      window.open('https://x.com/intent/tweet?text=' + text, '_blank', 'noopener');
    };
  }

  fetchReferralCount(code, bonusId, countId, pointsId);
}

async function fetchReferralCount(code, bonusId, countId, pointsId) {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.rpc('count_approved_referrals', { code });
    if (!error && data > 0) {
      const bonusEl = document.getElementById(bonusId);
      const countEl = document.getElementById(countId);
      const pointsEl = document.getElementById(pointsId);
      if (bonusEl) bonusEl.hidden = false;
      if (countEl) countEl.textContent = data;
      if (pointsEl) pointsEl.textContent = data * 3;
    }
  } catch (_) { /* silent */ }
}

async function handleApply(user, meta) {
  const wallet = dom.walletInput.value.trim();
  if (!isValidWallet(wallet) || !taskState.follow || !twitterConnected) return;

  dom.btnApply.disabled = true;
  dom.btnApply.textContent = 'Submitting...';

  const entry = {
    user_id:          user.id,
    twitter_id:       meta.provider_id || meta.sub || '',
    twitter_username: meta.user_name || meta.preferred_username || '',
    twitter_avatar:   meta.avatar_url || meta.picture || '',
    wallet_address:   wallet,
    connect_points:   0,
    task_follow:      taskState.follow,
    task_like:        taskState.like,
    task_repost:      taskState.repost,
    task_comment:     taskState.comment,
    pts_follow:       0,
    pts_like:         0,
    pts_repost:       0,
    pts_comment:      0,
    referred_by:      getSavedReferral(),
  };

  const { data, error } = await supabaseClient
    .from('whitelist_entries')
    .insert(entry)
    .select()
    .single();

  dom.btnApply.textContent = 'Apply for Whitelist';

  if (error) {
    dom.btnApply.disabled = false;
    if (error.code === '23505') {
      window.location.reload();
      return;
    }
    alert('Error submitting: ' + (error.message || 'Unknown error'));
    return;
  }

  existingEntry = data;
  localStorage.removeItem('kaomoji_ref');
  await refreshVerifiedScore();

  showReferralUI(
    data.referral_code,
    'ref-link-display',
    'btn-copy-ref',
    'btn-share-twitter',
    'ref-bonus',
    'ref-count',
    'ref-points'
  );

  showScreen('success');
}

async function refreshVerifiedScore() {
  if (!existingEntry) {
    updateApplyState();
    return;
  }
  const refCount = await getReferralCount(existingEntry.referral_code);
  const verified = calcPoints(existingEntry, refCount);
  if (dom.totalPoints) {
    dom.totalPoints.innerHTML = verified + ' <small>verified pts</small>';
  }
  if (dom.appliedScore) dom.appliedScore.textContent = verified;
  if (dom.finalScore) dom.finalScore.textContent = verified;
}

async function showAppliedScreen(entry) {
  const refCount = await getReferralCount(entry.referral_code);
  dom.appliedScore.textContent = calcPoints(entry, refCount);

  const status = entry.status || 'pending';
  dom.statusBadge.textContent = status.toUpperCase();
  dom.statusBadge.className = 'status-badge ' + status;

  showReferralUI(
    entry.referral_code,
    'ref-link-display-2',
    'btn-copy-ref-2',
    'btn-share-twitter-2',
    'ref-bonus-2',
    'ref-count-2',
    'ref-points-2'
  );

  showScreen('applied');
}

async function getReferralCount(code) {
  if (!supabaseClient) return 0;
  try {
    const { data, error } = await supabaseClient.rpc('count_approved_referrals', { code });
    if (!error) return data || 0;
  } catch (_) { /* silent */ }
  return 0;
}

async function connectTwitter() {
  if (!isSupabaseConfigured || !supabaseClient) {
    alert('Supabase is not configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in app.js');
    return;
  }
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'x',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) alert('Twitter login failed: ' + error.message);
}

async function disconnectTwitter() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  existingEntry = null;
  markTwitterDisconnected();
  showScreen('form');
}

async function restoreSession() {
  if (!supabaseClient) return;

  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session) return;

  currentUser = session.user;
  const meta = currentUser.user_metadata || {};
  markTwitterConnected(currentUser, meta);

  const { data: entries } = await supabaseClient
    .from('whitelist_entries')
    .select('*')
    .eq('user_id', currentUser.id)
    .limit(1);

  if (entries && entries.length > 0) {
    existingEntry = entries[0];
    taskState.follow = entries[0].task_follow;
    taskState.like = entries[0].task_like;
    taskState.repost = entries[0].task_repost;
    taskState.comment = entries[0].task_comment;
    if (entries[0].task_follow) markTaskClaimed(dom.taskFollow);
    if (entries[0].task_like) markTaskClaimed(dom.taskLike);
    if (entries[0].task_repost) markTaskClaimed(dom.taskRepost);
    if (entries[0].task_comment) markTaskClaimed(dom.taskComment);
    if (twitterConnected) markTaskClaimed(dom.taskConnect);
    await showAppliedScreen(existingEntry);
    await refreshVerifiedScore();
  }
}

function measureGroupWidth(group) {
  const kids = group.children;
  if (!kids.length) return 0;
  const last = kids[kids.length - 1];
  const w = last.offsetLeft + last.offsetWidth;
  return w > 0 ? w : group.scrollWidth;
}

function getMarqueePattern(group) {
  const seen = new Set();
  const pattern = [];
  group.querySelectorAll(':scope > span').forEach((span) => {
    const key = span.className + '|' + span.textContent;
    if (!seen.has(key)) {
      seen.add(key);
      pattern.push({
        className: span.className,
        text: span.textContent,
      });
    }
  });
  return pattern;
}

/** Extend segments if needed, then scroll by exact pixel width of one segment. */
function initMarquee() {
  const wrap = document.getElementById('marquee-wrap');
  const track = document.getElementById('marquee-track');
  if (!wrap || !track) return;

  let segments = track.querySelectorAll('[data-marquee-segment]');
  if (segments.length === 0) return;

  let segment = segments[0];
  const viewportW = Math.ceil(wrap.getBoundingClientRect().width) || window.innerWidth;
  const targetW = viewportW + 100;
  const pattern = getMarqueePattern(segment);

  if (pattern.length > 0) {
    let guard = 0;
    while (measureGroupWidth(segment) < targetW && guard < 48) {
      pattern.forEach((item) => {
        const span = document.createElement('span');
        if (item.className) span.className = item.className;
        span.textContent = item.text;
        segment.appendChild(span);
      });
      guard += 1;
    }
  }

  let segmentW = Math.ceil(measureGroupWidth(segment));
  if (segmentW <= 0) {
    segmentW = Math.ceil(segment.getBoundingClientRect().width);
  }
  if (segmentW <= 0) {
    setTimeout(initMarquee, 100);
    return;
  }

  if (segments.length < 2) {
    const clone = segment.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
    segments = track.querySelectorAll('[data-marquee-segment]');
  } else {
    segments[1].innerHTML = segment.innerHTML;
  }

  track.style.animation = 'none';
  void track.offsetWidth;

  track.style.setProperty('--marquee-end', `-${segmentW}px`);
  const seconds = Math.max(28, Math.round(segmentW / 65));
  track.style.setProperty('--marquee-duration', `${seconds}s`);
  track.style.animation = `marquee-scroll ${seconds}s linear infinite`;
}

async function init() {
  captureReferral();
  initMarquee();
  showScreen('form');
  markTwitterDisconnected();
  initTaskHandlers();

  dom.walletInput.addEventListener('input', updateApplyState);

  if (!supabaseClient) return;

  try {
    await Promise.race([
      restoreSession(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout')), 8000)
      ),
    ]);
  } catch (e) {
    console.warn('Session restore skipped:', e);
    showScreen('form');
  }
}

dom.btnConnectTwitter.addEventListener('click', connectTwitter);

dom.btnApply.addEventListener('click', () => {
  if (!isSupabaseConfigured || !supabaseClient) {
    alert('Backend not configured yet. Add Supabase URL and key in app.js');
    return;
  }
  if (!currentUser) {
    alert('Connect Twitter before applying');
    return;
  }
  handleApply(currentUser, currentUser.user_metadata || {});
});

dom.btnDisconnect.addEventListener('click', disconnectTwitter);
dom.btnDisconnectSuccess.addEventListener('click', disconnectTwitter);
dom.btnDisconnectApplied.addEventListener('click', disconnectTwitter);

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      markTwitterConnected(currentUser, currentUser.user_metadata || {});
      showScreen('form');
    }
    if (event === 'SIGNED_OUT') {
      markTwitterDisconnected();
    }
  });
}

let marqueeResizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(marqueeResizeTimer);
  marqueeResizeTimer = setTimeout(initMarquee, 200);
});

window.addEventListener('load', () => {
  initMarquee();
});

init();
