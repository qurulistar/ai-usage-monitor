// Default configuration settings
const DEFAULT_SETTINGS = {
  claude_limit: 45,
  claude_window: 5 * 60 * 60 * 1000, // 5 hours in ms
  claude_logs: [],

  gemini_limit: 50,
  gemini_window: 5 * 60 * 60 * 1000, // 5 hours in ms
  gemini_logs: [],

  aistudio_limit: 50,
  aistudio_window: 5 * 60 * 60 * 1000, // 5 hours in ms
  aistudio_logs: [],

  codex_limit: 25,
  codex_window: 5 * 60 * 60 * 1000, // 5 hours in ms
  codex_logs: []
};

// Initialize settings on installation
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const updates = {};
  
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (current[key] === undefined) {
      updates[key] = val;
    }
  }

  // Migrate old 3-hour defaults to the requested 5-hour rolling windows without
  // overwriting custom values.
  const oldThreeHourWindow = 3 * 60 * 60 * 1000;
  if (current.gemini_window === oldThreeHourWindow) {
    updates.gemini_window = DEFAULT_SETTINGS.gemini_window;
  }
  if (current.aistudio_window === oldThreeHourWindow) {
    updates.aistudio_window = DEFAULT_SETTINGS.aistudio_window;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  // Create alarm for periodic decay checking (every 1 minute)
  await chrome.alarms.create('decay_alarm', { periodInMinutes: 1 });
  
  // Initial badge update
  await updateBadge();
});

// Listen to the alarm to trigger decay
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'decay_alarm') {
    await decayLogs();
  }
});

// Update the badge when storage changes (e.g. message added or settings changed)
chrome.storage.onChanged.addListener(async (changes) => {
  const keys = [
    'claude_logs', 'gemini_logs', 'aistudio_logs', 'codex_logs',
    'claude_limit', 'gemini_limit', 'aistudio_limit', 'codex_limit',
    'claude_window', 'gemini_window', 'aistudio_window', 'codex_window',
    'display_mode'
  ];
  const hasRelevantChanges = Object.keys(changes).some(key => keys.includes(key));
  if (hasRelevantChanges) {
    await updateBadge();
  }
});

// Clean up expired message logs based on rolling windows
async function decayLogs() {
  const data = await chrome.storage.local.get([
    'claude_logs', 'claude_window',
    'gemini_logs', 'gemini_window',
    'aistudio_logs', 'aistudio_window',
    'codex_logs', 'codex_window'
  ]);

  const now = Date.now();
  let changed = false;
  const updates = {};

  const services = ['claude', 'gemini', 'aistudio', 'codex'];
  for (const service of services) {
    const logs = data[`${service}_logs`] || [];
    const windowMs = data[`${service}_window`] || DEFAULT_SETTINGS[`${service}_window`];
    
    // Keep only timestamps within the rolling window
    const activeLogs = logs.filter(timestamp => now - timestamp < windowMs);
    
    if (activeLogs.length !== logs.length) {
      updates[`${service}_logs`] = activeLogs;
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set(updates);
    await updateBadge();
  }

  // Clear session reset time once it has passed
  const sessionData = await chrome.storage.local.get('claude_session_reset');
  if (sessionData.claude_session_reset && now >= sessionData.claude_session_reset) {
    await chrome.storage.local.remove('claude_session_reset');
  }
}

// Dynamically updates the extension badge (color & text) to show usage
async function updateBadge() {
  const data = await chrome.storage.local.get([
    'claude_logs', 'claude_limit', 'claude_window',
    'gemini_logs', 'gemini_limit', 'gemini_window',
    'aistudio_logs', 'aistudio_limit', 'aistudio_window',
    'codex_logs', 'codex_limit', 'codex_window',
    'display_mode'
  ]);

  const displayMode = data.display_mode || 'count';

  const services = [
    { key: 'claude', name: 'Claude', prefix: 'C', logs: data.claude_logs || [], limit: data.claude_limit || 45, windowMs: data.claude_window || DEFAULT_SETTINGS.claude_window },
    { key: 'gemini', name: 'Gemini', prefix: 'G', logs: data.gemini_logs || [], limit: data.gemini_limit || 50, windowMs: data.gemini_window || DEFAULT_SETTINGS.gemini_window },
    { key: 'aistudio', name: 'AIStudio', prefix: 'A', logs: data.aistudio_logs || [], limit: data.aistudio_limit || 50, windowMs: data.aistudio_window || DEFAULT_SETTINGS.aistudio_window },
    { key: 'codex', name: 'Codex', prefix: 'X', logs: data.codex_logs || [], limit: data.codex_limit || 25, windowMs: data.codex_window || DEFAULT_SETTINGS.codex_window }
  ];

  let maxUsageRatio = -1;
  let activeService = null;

  const now = Date.now();

  // Determine which service is closest to its limit (highest usage percentage)
  for (const s of services) {
    s.activeLogs = s.logs.filter(timestamp => now - timestamp < s.windowMs);
    const ratio = s.activeLogs.length / Math.max(1, s.limit);
    if (s.activeLogs.length > 0 && ratio > maxUsageRatio) {
      maxUsageRatio = ratio;
      activeService = s;
    }
  }

  // If no services have usage, clear the badge
  if (!activeService) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  const count = activeService.activeLogs.length;
  let badgeText = '';

  if (displayMode === 'percent') {
    const usagePercentage = Math.min((count / Math.max(1, activeService.limit)) * 100, 100);
    const remainingPercent = Math.round(Math.max(0, 100 - usagePercentage));
    
    // Fit within Chrome's 4-character badge limit (e.g., "C6%", "C99%", "C100")
    if (remainingPercent >= 100) {
      badgeText = `${activeService.prefix}100`;
    } else {
      badgeText = `${activeService.prefix}${remainingPercent}%`;
    }
  } else {
    // Set badge text to raw count (e.g., C12, G5, A20)
    badgeText = `${activeService.prefix}${count}`;
  }

  await chrome.action.setBadgeText({ text: badgeText });

  // Color code based on proximity to limit
  // Green (<50%), Yellow (50-80%), Red (>80%)
  let badgeColor = '#10B981'; // Tailwind Emerald 500 (Green)
  if (maxUsageRatio >= 0.8) {
    badgeColor = '#EF4444'; // Tailwind Red 500 (Red)
  } else if (maxUsageRatio >= 0.5) {
    badgeColor = '#F59E0B'; // Tailwind Amber 500 (Yellow)
  }

  await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
}

