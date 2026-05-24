// AI Usage Monitor - Central Dashboard Logic

const DEFAULT_SETTINGS = {
  claude_limit: 45,
  claude_window: 5 * 60 * 60 * 1000,
  gemini_limit: 50,
  gemini_window: 5 * 60 * 60 * 1000,
  aistudio_limit: 50,
  aistudio_window: 5 * 60 * 60 * 1000,
  codex_limit: 25,
  codex_window: 5 * 60 * 60 * 1000,
  default_display_mode: 'count'
};

// Global state tracking
let activeHistoryTab = 'claude';
const SERVICES = ['claude', 'gemini', 'aistudio', 'codex'];
let displayMode = 'count'; // 'count' or 'percent'
const CIRCUMFERENCE = 251.2; // 2 * Math.PI * r (r=40)

document.addEventListener('DOMContentLoaded', async () => {
  // Load default display mode and setup initial state
  const data = await chrome.storage.local.get(['display_mode', 'default_display_mode']);
  displayMode = data.display_mode || data.default_display_mode || 'count';
  
  // Set initial switcher UI state
  updateSegmentedSwitcherUI();

  // Initial render
  await renderDashboard();
  setupEventListeners();

  // Highlight active tab
  updateHistoryTabUI();

  // Periodically refresh countdowns in UI
  setInterval(renderDashboard, 10000); // refresh every 10s
});

function updateSegmentedSwitcherUI() {
  const toggleCountBtn = document.getElementById('aim-toggle-count');
  const togglePercentBtn = document.getElementById('aim-toggle-percent');
  if (toggleCountBtn && togglePercentBtn) {
    if (displayMode === 'percent') {
      toggleCountBtn.classList.remove('active');
      togglePercentBtn.classList.add('active');
    } else {
      toggleCountBtn.classList.add('active');
      togglePercentBtn.classList.remove('active');
    }
  }
}

// Primary Render function for Dashboard and Indicators
async function renderDashboard() {
  const data = await chrome.storage.local.get([
    'claude_logs', 'claude_limit', 'claude_window',
    'gemini_logs', 'gemini_limit', 'gemini_window',
    'aistudio_logs', 'aistudio_limit', 'aistudio_window',
    'codex_logs', 'codex_limit', 'codex_window',
    'display_mode', 'default_display_mode', 'claude_reset_time', 'claude_session_reset'
  ]);

  displayMode = data.display_mode || data.default_display_mode || 'count';
  updateSegmentedSwitcherUI();

  const services = SERVICES;
  const now = Date.now();
  let changed = false;
  const storageUpdates = {};

  for (const s of services) {
    const logs = data[`${s}_logs`] || [];
    const limit = Math.max(1, Number(data[`${s}_limit`] || DEFAULT_SETTINGS[`${s}_limit`]));
    const windowMs = Number(data[`${s}_window`] || DEFAULT_SETTINGS[`${s}_window`]);

    // Filter active logs (decay expired ones)
    const activeLogs = logs.filter(timestamp => now - timestamp < windowMs);
    const count = activeLogs.length;

    // Check if auto-cleanup happened
    if (activeLogs.length !== logs.length) {
      storageUpdates[`${s}_logs`] = activeLogs;
      changed = true;
    }

    const percentage = Math.min((count / limit) * 100, 100);
    const remainingPercentage = Math.max(0, 100 - percentage);
    const percentVal = Math.round(remainingPercentage);

    // 1. Update text fields (Handles Toggle Mode)
    const countEl = document.getElementById(`${s}-count`);
    const limitEl = document.getElementById(`${s}-limit`);

    if (countEl) {
      if (displayMode === 'percent') {
        countEl.innerText = `${percentVal}%`;
        if (limitEl) limitEl.style.setProperty('display', 'none');
      } else {
        countEl.innerText = count;
        if (limitEl) {
          limitEl.innerText = `/${limit}`;
          limitEl.style.setProperty('display', 'inline');
        }
      }
    }

    // 2. Update Retro Battery Level
    const batteryLevel = document.getElementById(`${s}-battery-level`);
    if (batteryLevel) {
      batteryLevel.style.width = `${remainingPercentage}%`;
      
      // Update color class based on battery capacity
      batteryLevel.classList.remove('level-high', 'level-med', 'level-low');
      if (remainingPercentage >= 80) {
        batteryLevel.classList.add('level-high');
      } else if (remainingPercentage >= 50) {
        batteryLevel.classList.add('level-med');
      } else {
        batteryLevel.classList.add('level-low');
      }
    }

    // 3. Update next decay countdown info
    const decayInfoEl = document.getElementById(`${s}-decay-info`);
    if (decayInfoEl) {
      const storedResetTime = s === 'claude'
        ? (data.claude_reset_time || data.claude_session_reset)
        : null;
      const calcResetTime = activeLogs.length > 0 ? Math.min(...activeLogs) + windowMs : null;
      const resetTimestamp = storedResetTime || calcResetTime;

      if (resetTimestamp) {
        const diffMs = resetTimestamp - now;
        if (diffMs > 0) {
          const resetDate = new Date(resetTimestamp);
          const h = String(resetDate.getHours()).padStart(2, '0');
          const m = String(resetDate.getMinutes()).padStart(2, '0');
          decayInfoEl.innerText = `充電完了: ${h}:${m}`;
        } else {
          if (storedResetTime) {
            storageUpdates['claude_reset_time'] = null;
            await chrome.storage.local.remove('claude_reset_time');
          }
          decayInfoEl.innerText = '全回復中';
        }
      } else {
        decayInfoEl.innerText = '全回復中';
      }
    }
  }

  // Save changes if log cleanups happened
  if (changed) {
    await chrome.storage.local.set(storageUpdates);
  }

  // Always refresh history list if it is visible
  if (!document.getElementById('aim-history-content').classList.contains('hidden')) {
    await renderHistoryList();
  }
}

// Render active message history log
async function renderHistoryList() {
  const logKey = `${activeHistoryTab}_logs`;
  const data = await chrome.storage.local.get(logKey);
  const logs = data[logKey] || [];
  
  const listEl = document.getElementById('aim-log-list');
  if (!listEl) return;

  if (logs.length === 0) {
    listEl.innerHTML = '<div class="aim-log-empty">現在アクティブな履歴はありません</div>';
    return;
  }

  const now = Date.now();
  // Sort descending (newest messages first)
  const sortedLogs = [...logs].sort((a, b) => b - a);

  let htmlContent = '';
  sortedLogs.forEach((timestamp, idx) => {
    // Format timestamp
    const dateObj = new Date(timestamp);
    const timeStr = dateObj.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Relative string
    const diffMin = Math.floor((now - timestamp) / 1000 / 60);
    let relativeStr = '';
    if (diffMin < 1) {
      relativeStr = '今';
    } else if (diffMin < 60) {
      relativeStr = `${diffMin}分前`;
    } else {
      relativeStr = `${Math.floor(diffMin / 60)}時間前`;
    }

    // Original index (in unsorted logs) to allow precise deletion
    const originalIdx = logs.indexOf(timestamp);

    htmlContent += `
      <div class="aim-log-item">
        <div>
          <span class="aim-log-time">${timeStr}</span>
          <span class="aim-log-relative">${relativeStr}</span>
        </div>
        <button class="aim-btn-delete-log" data-service="${activeHistoryTab}" data-index="${originalIdx}" title="この履歴を消去">&times;</button>
      </div>
    `;
  });

  listEl.innerHTML = htmlContent;

  // Add click listeners to delete buttons
  listEl.querySelectorAll('.aim-btn-delete-log').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const service = e.target.getAttribute('data-service');
      const idxToDelete = parseInt(e.target.getAttribute('data-index'));
      await deleteHistoryEntry(service, idxToDelete);
    });
  });
}

// Delete a single timestamp log entry
async function deleteHistoryEntry(service, index) {
  const logKey = `${service}_logs`;
  const data = await chrome.storage.local.get(logKey);
  const currentLogs = data[logKey] || [];

  if (index >= 0 && index < currentLogs.length) {
    currentLogs.splice(index, 1);
    
    const updates = {};
    updates[logKey] = currentLogs;
    await chrome.storage.local.set(updates);
    
    await renderDashboard();
  }
}

// Adjust count manually (+1 or -1 button on cards)
async function adjustCount(service, delta) {
  const logKey = `${service}_logs`;
  const windowKey = `${service}_window`;
  const data = await chrome.storage.local.get([logKey, windowKey, 'claude_session_reset']);
  const currentLogs = data[logKey] || [];
  const windowMs = data[windowKey] || (service === 'claude' ? 5 * 60 * 60 * 1000 : 3 * 60 * 60 * 1000);
  const now = Date.now();

  const updates = { [logKey]: currentLogs };

  if (delta > 0) {
    const activeBefore = currentLogs.filter(t => now - t < windowMs);
    currentLogs.push(now);
    if (service === 'claude' && (activeBefore.length === 0 || !data.claude_session_reset || data.claude_session_reset <= now)) {
      updates.claude_session_reset = now + windowMs;
    }
  } else if (delta < 0 && currentLogs.length > 0) {
    currentLogs.pop();
  }

  await chrome.storage.local.set(updates);
  await renderDashboard();
}

// Update History Tabs CSS states
function updateHistoryTabUI() {
  const tabs = document.querySelectorAll('.aim-tab-btn');
  tabs.forEach(tab => {
    if (tab.getAttribute('data-tab') === activeHistoryTab) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
}

// Event Listeners setup
function setupEventListeners() {
  // 1. Manual adjust (+ / -) buttons on cards
  document.querySelectorAll('.aim-btn-adjust').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const service = e.target.getAttribute('data-service');
      const action = e.target.classList.contains('increase') ? 1 : -1;
      await adjustCount(service, action);
    });
  });

  // 2. Click to toggle between counts and percentages in popup gauges
  document.querySelectorAll('.aim-circle-text').forEach(textContainer => {
    textContainer.style.setProperty('cursor', 'pointer');
    textContainer.setAttribute('title', 'クリックで表示切替 (回数 ⇄ %)');
    textContainer.addEventListener('click', async () => {
      displayMode = displayMode === 'count' ? 'percent' : 'count';
      await chrome.storage.local.set({ display_mode: displayMode });
      await renderDashboard();
    });
  });

  // 3. Segmented Switcher Click Listeners
  const switcherContainer = document.getElementById('aim-segmented-switcher');
  if (switcherContainer) {
    switcherContainer.querySelectorAll('.aim-mode-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const mode = e.target.getAttribute('data-mode');
        if (mode && mode !== displayMode) {
          displayMode = mode;
          await chrome.storage.local.set({ display_mode: displayMode });
          await renderDashboard();
        }
      });
    });
  }

  // 4. History Toggle collapsible section
  const toggleHistoryBtn = document.getElementById('aim-toggle-history');
  const historyContent = document.getElementById('aim-history-content');
  toggleHistoryBtn.addEventListener('click', async () => {
    const isHidden = historyContent.classList.toggle('hidden');
    toggleHistoryBtn.classList.toggle('collapsed', isHidden);
    if (!isHidden) {
      await renderHistoryList();
    }
  });

  // 5. Tabs for history logs
  document.querySelectorAll('.aim-tab-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      activeHistoryTab = e.target.getAttribute('data-tab');
      updateHistoryTabUI();
      await renderHistoryList();
    });
  });

  // 6. Modal Settings controls
  const settingsBtn = document.getElementById('aim-btn-settings');
  const settingsModal = document.getElementById('aim-settings-modal');
  const closeSettingsBtn = document.getElementById('aim-btn-close-settings');
  const saveBtn = document.getElementById('aim-btn-save');
  const resetBtn = document.getElementById('aim-btn-reset');

  settingsBtn.addEventListener('click', async () => {
    const data = await chrome.storage.local.get([
      'claude_limit', 'claude_window', 'claude_logs',
      'gemini_limit', 'gemini_window', 'gemini_logs',
      'aistudio_limit', 'aistudio_window', 'aistudio_logs',
      'codex_limit', 'codex_window', 'codex_logs',
      'default_display_mode', 'claude_reset_time'
    ]);

    const now = Date.now();

    // Limits and decay windows
    document.getElementById('input-claude-limit').value = data.claude_limit || DEFAULT_SETTINGS.claude_limit;
    const claudeWinMs = data.claude_window || DEFAULT_SETTINGS.claude_window;
    document.getElementById('input-claude-window').value = claudeWinMs / 3600000;
    
    // Active log counts for calibration
    const activeClaudeLogs = (data.claude_logs || []).filter(t => now - t < claudeWinMs);
    document.getElementById('input-claude-current-count').value = activeClaudeLogs.length;

    document.getElementById('input-gemini-limit').value = data.gemini_limit || DEFAULT_SETTINGS.gemini_limit;
    const geminiWinMs = data.gemini_window || DEFAULT_SETTINGS.gemini_window;
    document.getElementById('input-gemini-window').value = geminiWinMs / 3600000;
    
    const activeGeminiLogs = (data.gemini_logs || []).filter(t => now - t < geminiWinMs);
    document.getElementById('input-gemini-current-count').value = activeGeminiLogs.length;

    document.getElementById('input-aistudio-limit').value = data.aistudio_limit || DEFAULT_SETTINGS.aistudio_limit;
    const aistudioWinMs = data.aistudio_window || DEFAULT_SETTINGS.aistudio_window;
    document.getElementById('input-aistudio-window').value = aistudioWinMs / 3600000;
    
    const activeAistudioLogs = (data.aistudio_logs || []).filter(t => now - t < aistudioWinMs);
    document.getElementById('input-aistudio-current-count').value = activeAistudioLogs.length;

    document.getElementById('input-codex-limit').value = data.codex_limit || DEFAULT_SETTINGS.codex_limit;
    const codexWinMs = data.codex_window || DEFAULT_SETTINGS.codex_window;
    document.getElementById('input-codex-window').value = codexWinMs / 3600000;

    const activeCodexLogs = (data.codex_logs || []).filter(t => now - t < codexWinMs);
    document.getElementById('input-codex-current-count').value = activeCodexLogs.length;

    // General display mode default
    document.getElementById('input-default-display-mode').value = data.default_display_mode || DEFAULT_SETTINGS.default_display_mode;

    // Claude reset time: show remaining minutes if stored, else blank
    const resetMinsInput = document.getElementById('input-claude-reset-mins');
    const detectedLabel = document.getElementById('aim-detected-reset-label');
    const claudeResetTime = data.claude_reset_time;
    if (claudeResetTime && claudeResetTime > now) {
      const remainingMins = Math.ceil((claudeResetTime - now) / 60000);
      resetMinsInput.value = remainingMins;
      const resetDate = new Date(claudeResetTime);
      const h = String(resetDate.getHours()).padStart(2, '0');
      const m = String(resetDate.getMinutes()).padStart(2, '0');
      detectedLabel.innerText = ` → ${h}:${m}`;
    } else {
      resetMinsInput.value = '';
      detectedLabel.innerText = '';
    }

    settingsModal.classList.remove('hidden');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  saveBtn.addEventListener('click', async () => {
    const claudeLimit = parseInt(document.getElementById('input-claude-limit').value) || DEFAULT_SETTINGS.claude_limit;
    const claudeWindow = parseFloat(document.getElementById('input-claude-window').value) || 5;
    const claudeWindowMs = claudeWindow * 60 * 60 * 1000;
    const claudeTargetCount = parseInt(document.getElementById('input-claude-current-count').value) || 0;
    
    const geminiLimit = parseInt(document.getElementById('input-gemini-limit').value) || DEFAULT_SETTINGS.gemini_limit;
    const geminiWindow = parseFloat(document.getElementById('input-gemini-window').value) || 5;
    const geminiWindowMs = geminiWindow * 60 * 60 * 1000;
    const geminiTargetCount = parseInt(document.getElementById('input-gemini-current-count').value) || 0;

    const aistudioLimit = parseInt(document.getElementById('input-aistudio-limit').value) || DEFAULT_SETTINGS.aistudio_limit;
    const aistudioWindow = parseFloat(document.getElementById('input-aistudio-window').value) || 5;
    const aistudioWindowMs = aistudioWindow * 60 * 60 * 1000;
    const aistudioTargetCount = parseInt(document.getElementById('input-aistudio-current-count').value) || 0;

    const codexLimit = parseInt(document.getElementById('input-codex-limit').value) || DEFAULT_SETTINGS.codex_limit;
    const codexWindow = parseFloat(document.getElementById('input-codex-window').value) || 5;
    const codexWindowMs = codexWindow * 60 * 60 * 1000;
    const codexTargetCount = parseInt(document.getElementById('input-codex-current-count').value) || 0;

    const defaultDisplayMode = document.getElementById('input-default-display-mode').value || 'count';

    // Calibrate logs
    const updatedClaudeLogs = await calibrateServiceCount('claude', claudeTargetCount, claudeLimit, claudeWindowMs);
    const updatedGeminiLogs = await calibrateServiceCount('gemini', geminiTargetCount, geminiLimit, geminiWindowMs);
    const updatedAistudioLogs = await calibrateServiceCount('aistudio', aistudioTargetCount, aistudioLimit, aistudioWindowMs);
    const updatedCodexLogs = await calibrateServiceCount('codex', codexTargetCount, codexLimit, codexWindowMs);

    await chrome.storage.local.set({
      claude_limit: claudeLimit,
      claude_window: claudeWindowMs,
      claude_logs: updatedClaudeLogs,
      gemini_limit: geminiLimit,
      gemini_window: geminiWindowMs,
      gemini_logs: updatedGeminiLogs,
      aistudio_limit: aistudioLimit,
      aistudio_window: aistudioWindowMs,
      aistudio_logs: updatedAistudioLogs,
      codex_limit: codexLimit,
      codex_window: codexWindowMs,
      codex_logs: updatedCodexLogs,
      default_display_mode: defaultDisplayMode
    });

    // If display_mode hasn't been set by clicking yet, apply the new default
    const existingMode = await chrome.storage.local.get('display_mode');
    if (!existingMode.display_mode) {
      displayMode = defaultDisplayMode;
      await chrome.storage.local.set({ display_mode: displayMode });
    }

    // Handle reset time: 0 = clear, positive = set from now + minutes
    const resetMinsVal = parseInt(document.getElementById('input-claude-reset-mins').value);
    if (!isNaN(resetMinsVal)) {
      if (resetMinsVal > 0) {
        await chrome.storage.local.set({ claude_reset_time: Date.now() + resetMinsVal * 60 * 1000 });
      } else {
        await chrome.storage.local.remove('claude_reset_time');
      }
    }

    settingsModal.classList.add('hidden');
    await renderDashboard();
  });

  // Calibration logic helper
  async function calibrateServiceCount(service, targetCount, limit, windowMs) {
    const logKey = `${service}_logs`;
    const data = await chrome.storage.local.get(logKey);
    const logs = data[logKey] || [];
    const now = Date.now();
    
    // Filter active logs first (remove expired)
    let activeLogs = logs.filter(t => now - t < windowMs);
    const currentCount = activeLogs.length;

    if (targetCount > currentCount) {
      const delta = targetCount - currentCount;
      // Add evenly distributed dummy logs in the past so they decay normally later
      for (let i = 0; i < delta; i++) {
        activeLogs.push(now - (i * 1000));
      }
    } else if (targetCount < currentCount) {
      // Remove oldest logs first
      activeLogs.sort((a, b) => a - b);
      activeLogs = activeLogs.slice(currentCount - targetCount);
    }
    return activeLogs;
  }

  resetBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({
      claude_limit: DEFAULT_SETTINGS.claude_limit,
      claude_window: DEFAULT_SETTINGS.claude_window,
      claude_logs: [],
      gemini_limit: DEFAULT_SETTINGS.gemini_limit,
      gemini_window: DEFAULT_SETTINGS.gemini_window,
      gemini_logs: [],
      aistudio_limit: DEFAULT_SETTINGS.aistudio_limit,
      aistudio_window: DEFAULT_SETTINGS.aistudio_window,
      aistudio_logs: [],
      codex_limit: DEFAULT_SETTINGS.codex_limit,
      codex_window: DEFAULT_SETTINGS.codex_window,
      codex_logs: [],
      default_display_mode: DEFAULT_SETTINGS.default_display_mode
    });

    document.getElementById('input-claude-limit').value = DEFAULT_SETTINGS.claude_limit;
    document.getElementById('input-claude-window').value = DEFAULT_SETTINGS.claude_window / 3600000;
    document.getElementById('input-claude-current-count').value = 0;
    
    document.getElementById('input-gemini-limit').value = DEFAULT_SETTINGS.gemini_limit;
    document.getElementById('input-gemini-window').value = DEFAULT_SETTINGS.gemini_window / 3600000;
    document.getElementById('input-gemini-current-count').value = 0;

    document.getElementById('input-aistudio-limit').value = DEFAULT_SETTINGS.aistudio_limit;
    document.getElementById('input-aistudio-window').value = DEFAULT_SETTINGS.aistudio_window / 3600000;
    document.getElementById('input-aistudio-current-count').value = 0;

    document.getElementById('input-codex-limit').value = DEFAULT_SETTINGS.codex_limit;
    document.getElementById('input-codex-window').value = DEFAULT_SETTINGS.codex_window / 3600000;
    document.getElementById('input-codex-current-count').value = 0;

    document.getElementById('input-default-display-mode').value = DEFAULT_SETTINGS.default_display_mode;
    await renderDashboard();
  });

  // Spotlight card glows
  document.querySelectorAll('.aim-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--x', `${x}px`);
      card.style.setProperty('--y', `${y}px`);
    });
  });

  // Bidirectional storage listener to keep open dashboards synced
  chrome.storage.onChanged.addListener((changes) => {
    const relevantKeys = [
      ...SERVICES.flatMap(service => [`${service}_logs`, `${service}_limit`, `${service}_window`]),
      'display_mode',
      'default_display_mode',
      'claude_reset_time',
      'claude_session_reset'
    ];
    if (Object.keys(changes).some(key => relevantKeys.includes(key))) {
      if (changes.display_mode) {
        displayMode = changes.display_mode.newValue;
      }
      renderDashboard();
    }
  });
}
