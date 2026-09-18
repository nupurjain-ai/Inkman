const connectBtn = document.getElementById('connectBtn');
const connectedAs = document.getElementById('connectedAs');
const reconnectNotice = document.getElementById('reconnectNotice');
const searchSection = document.getElementById('searchSection');
const searchBtn = document.getElementById('searchBtn');
const daysInput = document.getElementById('daysInput');
const resultEl = document.getElementById('result');

function showConnected(email) {
  connectBtn.hidden = true;
  reconnectNotice.hidden = true;
  connectedAs.hidden = false;
  connectedAs.textContent = `Connected as ${email}`;
  searchSection.hidden = false;
}

function showDisconnected(reason) {
  connectBtn.hidden = false;
  connectBtn.textContent = reason === 'expired' ? 'Reconnect Gmail' : 'Connect Gmail';
  connectedAs.hidden = true;
  searchSection.hidden = true;
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

searchBtn.addEventListener('click', async () => {
  const days = Number(daysInput.value) || 30;
  searchBtn.disabled = true;
  resultEl.innerHTML = '<span class="spinner"></span>Searching...';

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days })
    });

    if (res.status === 401) {
      showDisconnected('expired');
      resultEl.textContent = '';
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      resultEl.textContent = `Something went wrong: ${err.detail || res.statusText}`;
      return;
    }

    const data = await res.json();
    if (data.count === 0) {
      resultEl.textContent = `No UPI emails found in the last ${days} days.`;
    } else {
      resultEl.textContent = `${data.count} UPI email${data.count === 1 ? '' : 's'} found in the last ${days} days.`;
    }
  } catch (err) {
    resultEl.textContent = 'Network error — is the server running?';
  } finally {
    searchBtn.disabled = false;
  }
});

// Reflect the OAuth redirect outcome, then clean the URL.
const params = new URLSearchParams(window.location.search);
if (params.has('auth')) {
  window.history.replaceState({}, '', window.location.pathname);
}

refreshStatus();
