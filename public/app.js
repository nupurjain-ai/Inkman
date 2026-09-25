const connectBtn = document.getElementById('connectBtn');
const connectedAs = document.getElementById('connectedAs');
const syncBtn = document.getElementById('syncBtn');
const reconnectNotice = document.getElementById('reconnectNotice');
const syncStatus = document.getElementById('syncStatus');
const scroller = document.getElementById('scroller');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const calendarWrap = document.getElementById('calendarWrap');
const calendarOnlyView = document.getElementById('calendarOnlyView');
const calendarCardDay = document.getElementById('calendarCardDay');
const dayView = document.getElementById('dayView');
const backLink = document.getElementById('backLink');
const dayModalBody = document.getElementById('dayModalBody');
const jarModal = document.getElementById('jarModal');
const jarModalBody = document.getElementById('jarModalBody');
const jarBtn = document.getElementById('jarBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsModalBody = document.getElementById('settingsModalBody');
const settingsBtn = document.getElementById('settingsBtn');
const onboardingView = document.getElementById('onboardingView');
const appShell = document.getElementById('appShell');
const historyBtn = document.getElementById('historyBtn');
const historyView = document.getElementById('historyView');
const historyBody = document.getElementById('historyBody');
const onboardingContinueBtn = document.getElementById('onboardingContinueBtn');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const today = new Date();
let centerYear = today.getFullYear();
let centerMonth = today.getMonth() + 1; // 1-12
let suppressScroll = false;
let scrollTimer = null;

const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
let currentDayDate = todayDateStr;
let exceptionsMonth = todayDateStr.slice(0, 7);

function formatDateLong(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function addMonths(year, month, delta) {
  const total = (month - 1) + delta;
  const y = year + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12 + 1;
  return { y, m };
}

function money(n) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function buildMonthPanel(year, month) {
  const panel = document.createElement('section');
  panel.className = 'month-panel loading';
  panel.dataset.year = year;
  panel.dataset.month = month;

  panel.innerHTML = `
    <p class="month-title">${MONTH_NAMES[month - 1]} ${year}</p>
    <div class="weekday-row">${WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="day-grid"></div>
    <p class="month-total">Loading…</p>
  `;

  loadMonthData(panel, year, month);
  return panel;
}

async function loadMonthData(panel, year, month) {
  try {
    const res = await fetch(`/api/calendar/${year}/${month}`);
    if (!res.ok) throw new Error('calendar fetch failed');
    const data = await res.json();
    renderMonthData(panel, data);
  } catch (err) {
    panel.querySelector('.month-total').textContent = 'Failed to load this month.';
  } finally {
    panel.classList.remove('loading');
  }
}

// --- Day-circle heat coloring ---
// Color intensity is relative to the OTHER days in the same month, not
// to any fixed rupee scale — a day's overspend/underspend is expressed
// as a percentage of that month's own worst overspend/best underspend,
// then mapped onto a light->dark gradient. Recomputed from scratch on
// every render, so it naturally stays current as days are added.

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

function rgbCss([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

// Perceptual luminance decides text color per-cell so contrast holds
// up across the whole gradient, rather than flipping at a fixed point
// in the light->dark ramp (which risks a muddy middle otherwise).
const HEAT_DARK_TEXT = [42, 31, 24];
const HEAT_LIGHT_TEXT = [253, 246, 236];
function pickHeatTextColor([r, g, b]) {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 140 ? HEAT_DARK_TEXT : HEAT_LIGHT_TEXT;
}

function applyHeatColor(cell, kind, pct) {
  const lo = hexToRgb(getCssVar(kind === 'red' ? '--heat-red-lo' : '--heat-green-lo'));
  const hi = hexToRgb(getCssVar(kind === 'red' ? '--heat-red-hi' : '--heat-green-hi'));
  const bg = mixRgb(lo, hi, Math.max(0, Math.min(1, pct)));
  cell.style.backgroundColor = rgbCss(bg);
  cell.style.color = rgbCss(pickHeatTextColor(bg));
}

function renderMonthData(panel, data) {
  const grid = panel.querySelector('.day-grid');
  grid.innerHTML = '';

  for (let i = 0; i < data.firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'day-cell empty';
    grid.appendChild(empty);
  }

  // First pass: find this month's worst overspend and best underspend
  // — the top of each color scale. A day exactly at budget has an
  // underspend of 0, which naturally lands it at the lightest green.
  // Future dates are skipped here: ₹0 spent on a day that hasn't
  // happened yet is trivially the "best" possible underspend, and
  // would otherwise hijack the dark end of the scale from real,
  // deliberately frugal days — a day that hasn't occurred isn't data.
  let maxOverspend = 0;
  let maxUnderspend = 0;
  data.days.forEach((d) => {
    if (d.date > todayDateStr) return;
    if (d.status === 'red') {
      maxOverspend = Math.max(maxOverspend, d.spent - d.budget);
    } else if (d.status === 'green') {
      maxUnderspend = Math.max(maxUnderspend, d.budget - d.spent);
    }
  });

  data.days.forEach((d) => {
    const isFuture = d.date > todayDateStr;
    const cell = document.createElement('div');
    cell.className = `day-cell status-${isFuture ? 'future' : d.status}`;
    cell.textContent = d.day;
    cell.dataset.date = d.date;
    cell.classList.toggle('selected', d.date === currentDayDate);
    cell.title = isFuture
      ? `${d.date}: upcoming`
      : d.budget == null
        ? `${d.date}: ₹${money(d.spent)} spent, no budget set`
        : `${d.date}: ₹${money(d.spent)} spent of ₹${money(d.budget)} budget`;
    cell.addEventListener('click', () => { location.hash = `#/day/${d.date}`; });

    if (!isFuture && d.status === 'red') {
      const overspend = d.spent - d.budget;
      applyHeatColor(cell, 'red', maxOverspend > 0 ? overspend / maxOverspend : 1);
    } else if (!isFuture && d.status === 'green') {
      const underspend = d.budget - d.spent;
      applyHeatColor(cell, 'green', maxUnderspend > 0 ? underspend / maxUnderspend : 0);
    }

    grid.appendChild(cell);
  });

  panel.querySelector('.month-total').innerHTML =
    `Total spent this month: <strong>₹${money(data.monthTotal)}</strong>`;
}

function markSelectedCell() {
  document.querySelectorAll('.day-cell').forEach((cell) => {
    cell.classList.toggle('selected', cell.dataset.date === currentDayDate);
  });
}

function renderPanels() {
  scroller.innerHTML = '';
  const prev = addMonths(centerYear, centerMonth, -1);
  const next = addMonths(centerYear, centerMonth, 1);

  scroller.appendChild(buildMonthPanel(prev.y, prev.m));
  scroller.appendChild(buildMonthPanel(centerYear, centerMonth));
  scroller.appendChild(buildMonthPanel(next.y, next.m));

  suppressScroll = true;
  scroller.scrollLeft = scroller.clientWidth;
  requestAnimationFrame(() => { suppressScroll = false; });
}

function shiftMonth(delta) {
  const { y, m } = addMonths(centerYear, centerMonth, delta);
  centerYear = y;
  centerMonth = m;
  renderPanels();
}

scroller.addEventListener('scroll', () => {
  if (suppressScroll) return;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const panelWidth = scroller.clientWidth;
    if (!panelWidth) return;
    const index = Math.round(scroller.scrollLeft / panelWidth);
    if (index === 1) return;
    shiftMonth(index < 1 ? -1 : 1);
  }, 120);
});

prevBtn.addEventListener('click', () => shiftMonth(-1));
nextBtn.addEventListener('click', () => shiftMonth(1));

window.addEventListener('resize', () => {
  suppressScroll = true;
  scroller.scrollLeft = scroller.clientWidth;
  requestAnimationFrame(() => { suppressScroll = false; });
});

function showConnected(email) {
  connectBtn.hidden = true;
  reconnectNotice.hidden = true;
  connectedAs.hidden = false;
  connectedAs.textContent = `Connected as ${email}`;
  syncBtn.hidden = false;
}

function showDisconnected(reason) {
  connectBtn.hidden = false;
  connectBtn.textContent = reason === 'expired' ? 'Reconnect Gmail' : 'Connect Gmail';
  connectedAs.hidden = true;
  syncBtn.hidden = true;
  reconnectNotice.hidden = reason !== 'expired';
}

async function refreshStatus() {
  const res = await fetch('/auth/status');
  const data = await res.json();
  if (data.connected) {
    showConnected(data.email);
  } else {
    showDisconnected(data.reason);
  }
}

connectBtn.addEventListener('click', () => {
  window.location.href = '/auth/google';
});

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncStatus.hidden = false;
  syncStatus.textContent = 'Syncing…';

  try {
    const res = await fetch('/api/sync', { method: 'POST' });

    if (res.status === 401) {
      showDisconnected('expired');
      syncStatus.hidden = true;
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      syncStatus.textContent = `Sync failed: ${err.detail || res.statusText}`;
      return;
    }

    const data = await res.json();
    let message = data.newCount > 0
      ? `Synced ${data.newCount} new transaction${data.newCount === 1 ? '' : 's'}.`
      : 'No new transactions found.';
    if (data.hasMore) {
      message += ' More to sync — click Sync again to continue.';
    }
    syncStatus.textContent = message;
    renderPanels();
  } catch (err) {
    syncStatus.textContent = 'Network error — is the server running?';
  } finally {
    syncBtn.disabled = false;
  }
});

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function openModal(modal) { modal.hidden = false; }
function closeModal(modal) { modal.hidden = true; }

document.querySelectorAll('[data-close-modal]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(document.getElementById(btn.dataset.closeModal)));
});
[jarModal, settingsModal].forEach((modal) => {
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
});

// --- Routing (calendar page vs. a day's detail page) ---

function parseRoute() {
  const dayMatch = location.hash.match(/^#\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (dayMatch) return { view: 'day', date: dayMatch[1] };
  if (location.hash === '#/history') return { view: 'history' };
  return { view: 'calendar' };
}

// Reparenting calendarWrap detaches + reattaches it, which resets the
// scroller's scrollLeft and fires its scroll handler — left alone,
// that debounced handler reads the reset position as "scrolled to the
// previous month" and silently shifts centerMonth. Skip the move
// entirely when it isn't needed, and when it is, suppress the scroll
// handler and re-center exactly like renderPanels()/resize do.
function moveCalendarWrapTo(target) {
  if (calendarWrap.parentElement === target) return;
  suppressScroll = true;
  target.appendChild(calendarWrap);
  scroller.scrollLeft = scroller.clientWidth;
  requestAnimationFrame(() => { suppressScroll = false; });
}

function applyRoute() {
  const route = parseRoute();
  calendarOnlyView.hidden = true;
  dayView.hidden = true;
  historyView.hidden = true;
  backLink.hidden = true;

  if (route.view === 'day') {
    dayView.hidden = false;
    backLink.hidden = false;
    moveCalendarWrapTo(calendarCardDay);
    if (route.date === currentDayDate) {
      markSelectedCell();
    } else {
      selectDay(route.date);
    }
  } else if (route.view === 'history') {
    historyView.hidden = false;
    backLink.hidden = false;
    loadHistory();
  } else {
    calendarOnlyView.hidden = false;
    moveCalendarWrapTo(calendarOnlyView);
  }
}

window.addEventListener('hashchange', applyRoute);

// --- Day Detail Panel ---

async function selectDay(date) {
  currentDayDate = date;
  markSelectedCell();
  dayModalBody.innerHTML = '<p class="muted">Loading…</p>';
  await refreshDayModal();
}

async function refreshDayModal() {
  if (!currentDayDate) return;
  try {
    const res = await fetch(`/api/day/${currentDayDate}`);
    if (!res.ok) throw new Error('failed');
    renderDayModal(await res.json());
  } catch (err) {
    dayModalBody.innerHTML = '<p class="muted">Failed to load this day.</p>';
  }
}

function renderDayModal(data) {
  const budgetValue = data.budget == null ? '' : data.budget;
  // Default the Exceptions filter to whichever month this day belongs
  // to, so switching to a different month's day doesn't keep showing a
  // previous month's exceptions. The picker can still be changed by
  // hand for this render; it just resets to match the day next time.
  exceptionsMonth = data.date.slice(0, 7);

  const txnRows = data.transactions.length === 0
    ? '<p class="muted">No transactions this day.</p>'
    : `<ul class="txn-list">${data.transactions.map((t) => `
        <li class="txn-row ${t.is_exception ? 'is-exception' : ''}">
          <div class="txn-main">
            <span class="party">${escapeHtml((t.party || 'Unknown').toUpperCase())}</span>
            <span class="meta">${escapeHtml(t.category || 'Uncategorized')}${t.is_exception ? ' · exception: ' + escapeHtml(t.exception_name || '') : ''}${t.source === 'cash' ? ' · cash' : ''}</span>
          </div>
          <span class="txn-amount">₹${money(t.amount)}</span>
          <button class="txn-action-btn" data-action="${t.is_exception ? 'unmark' : 'mark'}" data-id="${t.id}">
            ${t.is_exception ? 'Undo' : 'Exception'}
          </button>
        </li>
      `).join('')}</ul>`;

  dayModalBody.innerHTML = `
    <h2 class="day-title">${formatDateLong(data.date)}</h2>
    <div class="day-stats">
      <div class="day-stat">Limit<strong>₹${money(data.budget)}</strong></div>
      <div class="day-stat">Spent<strong>₹${money(data.spent)}</strong></div>
    </div>
    <p class="day-summary">${escapeHtml(data.summary)}</p>

    <div class="budget-edit">
      <label for="budgetInput">Daily budget (from this date onward)</label>
      <input id="budgetInput" type="number" min="0" value="${budgetValue}" />
      <button id="saveBudgetBtn" class="btn">Save</button>
    </div>

    <h3 class="section-heading">Transactions</h3>
    ${txnRows}

    <h3 class="section-heading">Add cash spend</h3>
    <form id="cashForm" class="cash-entry-form">
      <input type="number" min="0.01" step="0.01" placeholder="Amount" id="cashAmount" required />
      <input type="text" placeholder="What for?" id="cashParty" />
      <input type="text" placeholder="Category (optional)" id="cashCategory" />
      <button type="submit" class="btn">Add</button>
    </form>

    <button type="button" id="exceptionsToggleBtn" class="exceptions-toggle" aria-expanded="false">
      Show exceptions <span class="chevron">&#9662;</span>
    </button>
    <div id="exceptionsPanel" class="exceptions-panel" hidden>
      <div class="exceptions-month-picker">
        <label for="exceptionsMonthInput">Month</label>
        <input id="exceptionsMonthInput" type="month" value="${exceptionsMonth}" />
      </div>
      <div id="exceptionsList"><p class="muted">Loading…</p></div>
    </div>
  `;

  document.getElementById('saveBudgetBtn').addEventListener('click', saveBudget);
  document.getElementById('cashForm').addEventListener('submit', submitCashEntry);
  dayModalBody.querySelectorAll('.txn-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleException(btn.dataset.id, btn.dataset.action));
  });
  document.getElementById('exceptionsMonthInput').addEventListener('change', (e) => {
    exceptionsMonth = e.target.value;
    loadExceptionsList();
  });
  const exceptionsToggleBtn = document.getElementById('exceptionsToggleBtn');
  const exceptionsPanel = document.getElementById('exceptionsPanel');
  exceptionsToggleBtn.addEventListener('click', () => {
    const willExpand = exceptionsPanel.hidden;
    exceptionsPanel.hidden = !willExpand;
    exceptionsToggleBtn.setAttribute('aria-expanded', String(willExpand));
    exceptionsToggleBtn.innerHTML = willExpand
      ? 'Hide exceptions <span class="chevron">&#9652;</span>'
      : 'Show exceptions <span class="chevron">&#9662;</span>';
  });
  loadExceptionsList();
}

async function saveBudget() {
  const amount = Number(document.getElementById('budgetInput').value);
  if (!amount || amount <= 0) return;
  await fetch(`/api/day/${currentDayDate}/budget`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  });
  await refreshDayModal();
  renderPanels();
}

async function submitCashEntry(e) {
  e.preventDefault();
  const amount = Number(document.getElementById('cashAmount').value);
  const party = document.getElementById('cashParty').value;
  const category = document.getElementById('cashCategory').value;
  if (!amount || amount <= 0) return;
  await fetch(`/api/day/${currentDayDate}/cash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, party, category })
  });
  await refreshDayModal();
  renderPanels();
}

async function toggleException(id, action) {
  if (action === 'mark') {
    const name = window.prompt('Name this exception (e.g. "Hospital visit"):', '');
    if (name === null) return;
    await fetch(`/api/transactions/${id}/exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || 'Exception' })
    });
  } else {
    await fetch(`/api/transactions/${id}/exception`, { method: 'DELETE' });
  }
  await refreshDayModal();
  renderPanels();
}

// --- Savings Jar ---

let jarYear = null;
let jarMonth = null;

// The jar icon reflects whichever month is currently centered on the
// calendar — Total Amount is scoped to that specific month, not always
// "today's" real month.
jarBtn.addEventListener('click', () => openJarModal(centerYear, centerMonth));

async function openJarModal(year, month) {
  jarYear = year;
  jarMonth = month;
  openModal(jarModal);
  jarModalBody.innerHTML = '<p class="muted">Loading…</p>';
  await refreshJarModal();
}

async function refreshJarModal() {
  try {
    const res = await fetch(`/api/jar?year=${jarYear}&month=${jarMonth}`);
    renderJarModal(await res.json());
  } catch (err) {
    jarModalBody.innerHTML = '<p class="muted">Failed to load Savings Jar.</p>';
  }
}

function renderJarModal(data) {
  const goalsHtml = data.goals.length === 0
    ? '<p class="muted">No goals yet.</p>'
    : data.goals.map((g) => {
        const pct = Math.min(100, Math.round((g.progress / g.targetAmount) * 100));
        return `
          <div class="goal-card">
            <div class="goal-card-top">
              <span class="goal-name">${g.completed ? '<span class="goal-badge">🎉</span>' : ''}${escapeHtml(g.name)}</span>
              <span>₹${money(g.progress)} / ₹${money(g.targetAmount)}</span>
              <button class="goal-delete-btn" data-goal-id="${g.id}" aria-label="Delete goal">🗑</button>
            </div>
            <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
          </div>
        `;
      }).join('');

  jarModalBody.innerHTML = `
    <h2 class="jar-title">Savings Jar</h2>

    <div class="jar-section">
      <h3>Total amount of the month <span class="muted" style="font-weight:normal;font-size:0.75rem;">(${MONTH_NAMES[data.month - 1]} ${data.year}, resets on the 1st)</span></h3>
      <p class="jar-total">₹${money(data.totalAmount)}</p>
      <div class="bank-balance-row">
        <label for="bankBalanceInput">Bank balance (optional)</label>
        <input id="bankBalanceInput" type="number" min="0" step="0.01" value="${data.bankBalance == null ? '' : data.bankBalance}" />
        <button id="saveBankBalanceBtn" class="btn">Save</button>
      </div>
    </div>

    <div class="jar-section">
      <h3>Purchase Goals</h3>
      ${goalsHtml}
      <form id="goalForm" class="goal-form">
        <input type="text" id="goalName" placeholder="Goal name" required />
        <input type="number" id="goalTarget" placeholder="Target ₹" min="0.01" step="0.01" required />
        <button type="submit" class="btn">Add goal</button>
      </form>
    </div>
  `;

  document.getElementById('saveBankBalanceBtn').addEventListener('click', saveBankBalance);
  document.getElementById('goalForm').addEventListener('submit', submitGoal);
  jarModalBody.querySelectorAll('.goal-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteGoal(btn.dataset.goalId));
  });
}

async function loadExceptionsList() {
  const container = document.getElementById('exceptionsList');
  if (!container) return;
  container.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch(`/api/exceptions?month=${exceptionsMonth}`);
    const data = await res.json();
    container.innerHTML = data.exceptions.length === 0
      ? '<p class="muted">No exceptions this month.</p>'
      : data.exceptions.map((e) => `
          <div class="exception-row">
            <span>${escapeHtml(e.exception_name || '')} — ${escapeHtml(e.party || '')}</span>
            <span>₹${money(e.amount)} · ${e.date}</span>
          </div>
        `).join('');
  } catch (err) {
    container.innerHTML = '<p class="muted">Failed to load exceptions.</p>';
  }
}

async function saveBankBalance() {
  const input = document.getElementById('bankBalanceInput');
  const amount = input.value === '' ? null : Number(input.value);
  await fetch('/api/jar/bank-balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  });
  await refreshJarModal();
}

async function submitGoal(e) {
  e.preventDefault();
  const name = document.getElementById('goalName').value;
  const targetAmount = Number(document.getElementById('goalTarget').value);
  if (!name || !targetAmount) return;
  await fetch('/api/jar/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, targetAmount })
  });
  await refreshJarModal();
}

async function deleteGoal(id) {
  await fetch(`/api/jar/goals/${id}`, { method: 'DELETE' });
  await refreshJarModal();
}

// --- Settings (bring-your-own LLM key) ---

const PROVIDER_LABELS = { gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic (Claude)', groq: 'Groq' };

settingsBtn.addEventListener('click', openSettingsModal);

async function openSettingsModal() {
  openModal(settingsModal);
  settingsModalBody.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch('/api/settings/llm');
    renderSettingsModal(await res.json());
  } catch (err) {
    settingsModalBody.innerHTML = '<p class="muted">Failed to load settings.</p>';
  }
}

let settingsData = null;

function renderSettingsModal(data) {
  settingsData = data;
  const defaultModels = data.defaultModels || {};
  const optionsHtml = Object.entries(PROVIDER_LABELS)
    .map(([value, label]) => `<option value="${value}" ${data.provider === value ? 'selected' : ''}>${label}</option>`)
    .join('');

  settingsModalBody.innerHTML = `
    <h3 style="margin-top:0;">Settings</h3>
    <p class="muted" style="font-size:0.85rem;">
      Bring your own API key for the AI agent that reads and categorizes your Gmail transactions.
      ${data.hasKey ? `Currently using <strong>${PROVIDER_LABELS[data.provider] || data.provider}</strong> (key ending ${escapeHtml(data.maskedKey || '')}).` : 'No key saved yet — falling back to the server default, if any.'}
    </p>
    <form id="llmSettingsForm">
      <div class="budget-edit" style="flex-wrap:wrap;">
        <label for="providerSelect">Provider</label>
        <select id="providerSelect">${optionsHtml}</select>
      </div>
      <div class="budget-edit" style="flex-wrap:wrap;">
        <label for="apiKeyInput">API key</label>
        <input id="apiKeyInput" type="password" placeholder="${data.hasKey ? 'Leave blank to keep current key' : 'Paste your key'}" autocomplete="off" style="flex:1;min-width:160px;" />
      </div>
      <div class="budget-edit" style="flex-wrap:wrap;">
        <label for="modelInput">Model</label>
        <input id="modelInput" type="text" value="${escapeHtml(data.model || '')}" placeholder="${escapeHtml(defaultModels[data.provider] || 'default')}" autocomplete="off" style="flex:1;min-width:160px;" />
      </div>
      <p class="muted" style="font-size:0.78rem;margin:4px 0 0;">Leave Model blank to use the built-in default for whichever provider is selected above.</p>
      <button type="submit" class="btn primary" style="margin-top:8px;">Save</button>
    </form>
    <p id="settingsSaveStatus" class="muted" style="margin-top:8px;"></p>
  `;

  document.getElementById('providerSelect').addEventListener('change', (e) => {
    document.getElementById('modelInput').placeholder = defaultModels[e.target.value] || 'default';
  });
  document.getElementById('llmSettingsForm').addEventListener('submit', submitLlmSettings);
}

async function submitLlmSettings(e) {
  e.preventDefault();
  const provider = document.getElementById('providerSelect').value;
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const model = document.getElementById('modelInput').value.trim();
  const statusEl = document.getElementById('settingsSaveStatus');

  const switchingProvider = settingsData && settingsData.provider !== provider;
  if (!apiKey && (switchingProvider || !settingsData || !settingsData.hasKey)) {
    statusEl.textContent = 'Enter an API key first (required when selecting a different provider).';
    return;
  }

  statusEl.textContent = 'Saving…';
  try {
    const res = await fetch('/api/settings/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey: apiKey || undefined, model: model || undefined })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      statusEl.textContent = `Save failed: ${err.error || 'unknown error'}`;
      return;
    }
    statusEl.textContent = 'Saved.';
    const refreshed = await fetch('/api/settings/llm');
    renderSettingsModal(await refreshed.json());
  } catch (err) {
    statusEl.textContent = 'Network error — is the server running?';
  }
}

// --- Spending & Savings History ---

historyBtn.addEventListener('click', () => { location.hash = '#/history'; });

let historyData = null;
const historyState = { filter: 'all', year: null };

async function loadHistory() {
  historyBody.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const res = await fetch('/api/history');
    if (!res.ok) throw new Error('failed');
    historyData = await res.json();
    historyState.filter = 'all';
    historyState.year = historyData.ytd.year;
    renderHistory();
  } catch (err) {
    historyBody.innerHTML = '<p class="muted">Failed to load history.</p>';
  }
}

function formatMoneySigned(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${money(Math.abs(n))}`;
}

function renderHistory() {
  if (!historyData) return;
  const { ytd, years } = historyData;
  const rangeLabel = ytd.startMonth === ytd.endMonth
    ? `${MONTH_NAMES[ytd.startMonth - 1]} ${ytd.year}`
    : `${MONTH_NAMES[ytd.startMonth - 1].slice(0, 3)} – ${MONTH_NAMES[ytd.endMonth - 1].slice(0, 3)} ${ytd.year}`;
  // Not ytd.savings >= 0 — that figure is floored at 0 per month (a bad
  // month contributes nothing rather than subtracting, same rule as
  // goal progress), so it's ALWAYS >= 0 and would say "Healthy" even
  // when every month ran over budget. The day-level green ratio is the
  // one signal here that can actually go either way.
  const isHealthy = ytd.greenPct >= 50;
  const healthLabel = isHealthy ? 'Healthy' : 'Needs attention';

  const monthsForYear = historyData.months.filter((m) => m.year === historyState.year);
  const visibleMonths = historyState.filter === 'under'
    ? monthsForYear.filter((m) => m.status === 'under')
    : monthsForYear;

  const monthsHtml = visibleMonths.length === 0
    ? '<p class="muted">No months to show here.</p>'
    : visibleMonths.map((m) => {
        const netPillClass = m.netSaved >= 0 ? 'net-pill positive' : 'net-pill negative';
        const netPillText = m.netSaved >= 0
          ? `+₹${money(m.netSaved)} moved to Jar`
          : `-₹${money(Math.abs(m.netSaved))} (Overspent)`;
        return `
          <div class="month-card">
            <div class="month-card-top">
              <h3>${MONTH_NAMES[m.month - 1]} ${m.year}</h3>
              <span class="month-status-pill ${m.status}">${m.status === 'under' ? 'Under Budget' : 'Over Budget'}</span>
            </div>
            <div class="month-card-row">
              <span class="muted">Budgeted ₹${money(m.budgeted)}</span>
              <span class="month-spent">₹${money(m.spent)}<span class="muted"> Spent</span></span>
            </div>
            <div class="month-card-footer">
              <span class="day-tally"><span class="tally-dot green"></span>${m.greenDays} Green days &nbsp;|&nbsp; <span class="tally-dot red"></span>${m.redDays} Red days</span>
              <span class="${netPillClass}">${netPillText}</span>
            </div>
          </div>
        `;
      }).join('');

  const yearOptionsHtml = years.map((y) => `<option value="${y}" ${y === historyState.year ? 'selected' : ''}>Year ${y}</option>`).join('');

  historyBody.innerHTML = `
    <div class="history-header">
      <div>
        <h1 class="history-title">Spending &amp; Savings History</h1>
        <p class="history-subtitle">Mindful monthly rhythms &amp; balance shifts</p>
      </div>
      <span class="history-badge ${isHealthy ? 'positive' : 'negative'}">${healthLabel}</span>
    </div>

    <div class="ytd-card">
      <div class="ytd-card-top">
        <span class="muted">${ytd.year} Year-to-Date Savings</span>
        <span class="ytd-range-pill">${rangeLabel}</span>
      </div>
      <div class="ytd-savings-row">
        <span class="ytd-savings">${formatMoneySigned(ytd.savings)}</span>
        <span class="muted">&uarr; Moved to Jar</span>
      </div>
      <div class="ytd-stats-row">
        <div class="ytd-stat">
          <strong>${ytd.greenPct}% Under-budget</strong>
          <span class="muted">${ytd.greenDays} calm disciplined days</span>
        </div>
        <div class="ytd-stat ytd-stat-right">
          <span class="muted">Over-budget Days</span>
          <strong class="over-budget-days">${ytd.redDays} days (${ytd.redPct}%)</strong>
        </div>
      </div>
    </div>

    <div class="history-filters">
      <button type="button" class="filter-btn ${historyState.filter === 'all' ? 'active' : ''}" data-filter="all">All Months</button>
      <button type="button" class="filter-btn ${historyState.filter === 'under' ? 'active' : ''}" data-filter="under">Only Under-Budget</button>
      <select id="historyYearSelect" class="year-select">${yearOptionsHtml}</select>
    </div>

    <div class="month-list">${monthsHtml}</div>
  `;

  historyBody.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      historyState.filter = btn.dataset.filter;
      renderHistory();
    });
  });
  document.getElementById('historyYearSelect').addEventListener('change', (e) => {
    historyState.year = Number(e.target.value);
    renderHistory();
  });
}

// --- Onboarding ---
// Shown on every page load/refresh (not just once) — it's the site's
// first page by design, so there's no "seen it already" state to track.

function showApp() {
  onboardingView.hidden = true;
  appShell.hidden = false;
  // The calendar panels (and the day view, if that's the current route)
  // were laid out and scroll-centered while appShell was display:none,
  // so every width read was 0 — recenter now that it's actually visible.
  suppressScroll = true;
  scroller.scrollLeft = scroller.clientWidth;
  requestAnimationFrame(() => { suppressScroll = false; });
}

onboardingContinueBtn.addEventListener('click', showApp);

renderPanels();
refreshStatus();
applyRoute();
