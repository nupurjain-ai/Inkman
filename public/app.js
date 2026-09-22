const connectBtn = document.getElementById('connectBtn');
const connectedAs = document.getElementById('connectedAs');
const syncBtn = document.getElementById('syncBtn');
const reconnectNotice = document.getElementById('reconnectNotice');
const syncStatus = document.getElementById('syncStatus');
const scroller = document.getElementById('scroller');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const dayModal = document.getElementById('dayModal');
const dayModalBody = document.getElementById('dayModalBody');
const dayJarBtn = document.getElementById('dayJarBtn');
const jarModal = document.getElementById('jarModal');
const jarModalBody = document.getElementById('jarModalBody');
const jarBtn = document.getElementById('jarBtn');

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

function renderMonthData(panel, data) {
  const grid = panel.querySelector('.day-grid');
  grid.innerHTML = '';

  for (let i = 0; i < data.firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'day-cell empty';
    grid.appendChild(empty);
  }

  data.days.forEach((d) => {
    const cell = document.createElement('div');
    cell.className = `day-cell status-${d.status}`;
    cell.textContent = d.day;
    cell.title = d.budget == null
      ? `${d.date}: ₹${money(d.spent)} spent, no budget set`
      : `${d.date}: ₹${money(d.spent)} spent of ₹${money(d.budget)} budget`;
    cell.addEventListener('click', () => openDayModal(d.date));
    grid.appendChild(cell);
  });

  panel.querySelector('.month-total').innerHTML =
    `Total spent this month: <strong>₹${money(data.monthTotal)}</strong>`;
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
[dayModal, jarModal].forEach((modal) => {
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
});

// --- Day Detail View ---

let currentDayDate = null;

async function openDayModal(date) {
  currentDayDate = date;
  openModal(dayModal);
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

  const txnRows = data.transactions.length === 0
    ? '<p class="muted">No transactions this day.</p>'
    : `<ul class="txn-list">${data.transactions.map((t) => `
        <li class="txn-row ${t.is_exception ? 'is-exception' : ''}">
          <div class="txn-main">
            <span class="party">${escapeHtml(t.party || 'Unknown')}</span>
            <span class="meta">${escapeHtml(t.category || 'Uncategorized')}${t.is_exception ? ' · exception: ' + escapeHtml(t.exception_name || '') : ''}${t.source === 'cash' ? ' · cash' : ''}</span>
          </div>
          <span class="txn-amount">₹${money(t.amount)}</span>
          <button class="txn-action-btn" data-action="${t.is_exception ? 'unmark' : 'mark'}" data-id="${t.id}">
            ${t.is_exception ? 'Undo' : 'Exception'}
          </button>
        </li>
      `).join('')}</ul>`;

  dayModalBody.innerHTML = `
    <p class="muted" style="margin:0 0 2px;">${data.date}</p>
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

    <h3 style="margin:0 0 8px;font-size:0.95rem;">Transactions</h3>
    ${txnRows}

    <h3 style="margin:16px 0 8px;font-size:0.95rem;">Add cash spend</h3>
    <form id="cashForm" class="cash-entry-form">
      <input type="number" min="0.01" step="0.01" placeholder="Amount" id="cashAmount" required />
      <input type="text" placeholder="What for?" id="cashParty" />
      <input type="text" placeholder="Category (optional)" id="cashCategory" />
      <button type="submit" class="btn">Add</button>
    </form>
  `;

  document.getElementById('saveBudgetBtn').addEventListener('click', saveBudget);
  document.getElementById('cashForm').addEventListener('submit', submitCashEntry);
  dayModalBody.querySelectorAll('.txn-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleException(btn.dataset.id, btn.dataset.action));
  });
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

let exceptionsMonth = null;
let jarYear = null;
let jarMonth = null;

// The main jar icon reflects whichever month is currently centered on
// the calendar; the one inside a day's detail view reflects that day's
// own month — either way, Total Amount is scoped to that specific
// month, not always "today's" real month.
dayJarBtn.addEventListener('click', () => {
  closeModal(dayModal);
  const [y, m] = currentDayDate.split('-').map(Number);
  openJarModal(y, m);
});
jarBtn.addEventListener('click', () => openJarModal(centerYear, centerMonth));

async function openJarModal(year, month) {
  jarYear = year;
  jarMonth = month;
  if (!exceptionsMonth) {
    const d = new Date();
    exceptionsMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
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
    <div class="jar-section">
      <h3>Total Amount <span class="muted" style="font-weight:normal;font-size:0.75rem;">(${MONTH_NAMES[data.month - 1]} ${data.year}, resets on the 1st)</span></h3>
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

    <div class="jar-section">
      <h3>Exceptions</h3>
      <div class="exceptions-month-picker">
        <label for="exceptionsMonthInput">Month</label>
        <input id="exceptionsMonthInput" type="month" value="${exceptionsMonth}" />
      </div>
      <div id="exceptionsList"><p class="muted">Loading…</p></div>
    </div>
  `;

  document.getElementById('saveBankBalanceBtn').addEventListener('click', saveBankBalance);
  document.getElementById('goalForm').addEventListener('submit', submitGoal);
  jarModalBody.querySelectorAll('.goal-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteGoal(btn.dataset.goalId));
  });
  document.getElementById('exceptionsMonthInput').addEventListener('change', (e) => {
    exceptionsMonth = e.target.value;
    loadExceptionsList();
  });

  loadExceptionsList();
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

renderPanels();
refreshStatus();
