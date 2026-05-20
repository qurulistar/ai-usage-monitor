// AI Usage Monitor - Content Script

(function () {
  // Determine active service based on URL
  const hostname = window.location.hostname;
  let service = '';
  let serviceName = '';
  let serviceLetter = '';

  if (hostname.includes('claude.ai')) {
    service = 'claude';
    serviceName = 'Claude Pro';
    serviceLetter = 'C';
  } else if (hostname.includes('gemini.google.com')) {
    service = 'gemini';
    serviceName = 'Gemini';
    serviceLetter = 'G';
  } else if (hostname.includes('aistudio.google.com')) {
    service = 'aistudio';
    serviceName = 'AI Studio';
    serviceLetter = 'A';
  }

  // Abort if not running on a supported domain
  if (!service) return;

  const DEBOUNCE_TIME = 1500; // ms to prevent duplicate logs on rapid clicks/enters
  let lastLoggedTime = 0;
  let isCollapsed = false;
  let displayMode = 'count'; // 'count' or 'percent'

  // Initialize and inject the UI
  initWidget();
  setupEventListeners();

  // Helper function to return custom pixel art SVGs for retro theme
  function getServicePixelIcon(srv) {
    if (srv === 'claude') {
      // Official 'Claude Code' Mascot in pixel perfect design
      return `
        <svg viewBox="0 0 13 15" class="aim-pixel-svg">
          <!-- Antennas Asterisk (Purple) -->
          <rect x="6" y="0" width="1" height="1" fill="#A78BFA"/>
          <rect x="5" y="1" width="3" height="1" fill="#A78BFA"/>
          <rect x="6" y="2" width="1" height="1" fill="#A78BFA"/>
          
          <!-- Antenna Shaft (Light Gray) -->
          <rect x="6" y="3" width="1" height="2" fill="#E2E8F0"/>
          
          <!-- Purple Cap (Purple) -->
          <rect x="5" y="5" width="3" height="1" fill="#A78BFA"/>
          <rect x="4" y="6" width="5" height="1" fill="#A78BFA"/>
          
          <!-- Orange Body (Orange) -->
          <rect x="3" y="7" width="7" height="1" fill="#EA6C3B"/>
          <rect x="2" y="8" width="9" height="1" fill="#EA6C3B"/>
          
          <!-- Row 9 (With hands and eyes) -->
          <!-- Left hand -->
          <rect x="1" y="9" width="1" height="2" fill="#EA6C3B"/>
          <!-- Body core -->
          <rect x="2" y="9" width="2" height="1" fill="#EA6C3B"/>
          <rect x="5" y="9" width="3" height="1" fill="#EA6C3B"/>
          <rect x="9" y="9" width="2" height="1" fill="#EA6C3B"/>
          <!-- Right hand -->
          <rect x="11" y="9" width="1" height="2" fill="#EA6C3B"/>
          
          <!-- Row 10 (With eyes) -->
          <rect x="2" y="10" width="2" height="1" fill="#EA6C3B"/>
          <rect x="5" y="10" width="3" height="1" fill="#EA6C3B"/>
          <rect x="9" y="10" width="2" height="1" fill="#EA6C3B"/>
          
          <!-- Eyes (Dark Charcoal for Retro feel) -->
          <rect x="4" y="9" width="1" height="2" fill="#1F2937"/>
          <rect x="8" y="9" width="1" height="2" fill="#1F2937"/>
          
          <!-- Lower body -->
          <rect x="2" y="11" width="9" height="2" fill="#EA6C3B"/>
          
          <!-- Feet (4 legs) -->
          <rect x="3" y="13" width="1" height="2" fill="#EA6C3B"/>
          <rect x="5" y="13" width="1" height="2" fill="#EA6C3B"/>
          <rect x="7" y="13" width="1" height="2" fill="#EA6C3B"/>
          <rect x="9" y="13" width="1" height="2" fill="#EA6C3B"/>
        </svg>
      `;
    } else if (srv === 'gemini') {
      // 11x11 Grid Gemini Sparkle Character (Concave Astroid) with eyes (omitted rects at x=4, x=6)
      return `
        <svg viewBox="0 0 11 11" class="aim-pixel-svg">
          <!-- Top vertical spike -->
          <rect x="5" y="0" width="1" height="1" fill="currentColor"/>
          <rect x="5" y="1" width="1" height="1" fill="currentColor"/>
          <rect x="5" y="2" width="1" height="1" fill="currentColor"/>
          <rect x="5" y="3" width="1" height="1" fill="currentColor"/>
          <!-- Star body -->
          <rect x="4" y="4" width="3" height="1" fill="currentColor"/>
          <!-- Middle horizontal row (Eyes at x=4 and x=6 left transparent) -->
          <rect x="1" y="5" width="3" height="1" fill="currentColor"/>
          <rect x="5" y="5" width="1" height="1" fill="currentColor"/>
          <rect x="7" y="5" width="3" height="1" fill="currentColor"/>
          <!-- Star body -->
          <rect x="4" y="6" width="3" height="1" fill="currentColor"/>
          <!-- Bottom vertical spike -->
          <rect x="5" y="7" width="1" height="1" fill="currentColor"/>
          <rect x="5" y="8" width="1" height="1" fill="currentColor"/>
          <rect x="5" y="9" width="1" height="1" fill="currentColor"/>
          <rect x="5" y="10" width="1" height="1" fill="currentColor"/>
        </svg>
      `;
    } else {
      // AI Studio / Other: 7x7 Grid Star Item
      return `
        <svg viewBox="0 0 7 7" class="aim-pixel-svg">
          <rect x="3" y="0" width="1" height="1" fill="currentColor"/>
          <rect x="1" y="1" width="1" height="1" fill="currentColor"/>
          <rect x="3" y="1" width="1" height="1" fill="currentColor"/>
          <rect x="5" y="1" width="1" height="1" fill="currentColor"/>
          <rect x="2" y="2" width="3" height="1" fill="currentColor"/>
          <rect x="0" y="3" width="7" height="1" fill="currentColor"/>
          <rect x="2" y="4" width="3" height="1" fill="currentColor"/>
          <rect x="1" y="5" width="1" height="1" fill="currentColor"/>
          <rect x="3" y="5" width="1" height="1" fill="currentColor"/>
          <rect x="5" y="5" width="1" height="1" fill="currentColor"/>
          <rect x="3" y="6" width="1" height="1" fill="currentColor"/>
        </svg>
      `;
    }
  }

  // Initialize UI Floating Widget
  async function initWidget() {
    if (document.getElementById('ai-usage-monitor-widget')) return;

    // Load initial collapse and display mode states from storage
    const collapseKey = `${service}_widget_collapsed`;
    const data = await chrome.storage.local.get([collapseKey, 'display_mode', 'default_display_mode']);
    isCollapsed = !!data[collapseKey];
    displayMode = data.display_mode || data.default_display_mode || 'count';

    const widget = document.createElement('div');
    widget.id = 'ai-usage-monitor-widget';
    widget.classList.add(`aim-theme-${service}`);
    widget.style.display = 'none';

    if (isCollapsed) {
      widget.classList.add('aim-collapsed');
    }

    // HTML Structure (Combines Normal View and Collapsed Circular View)
    widget.innerHTML = `
      <!-- Draggable dots -->
      <div class="aim-drag-handle" id="aim-drag-handle">
        <svg viewBox="0 0 16 6" xmlns="http://www.w3.org/2000/svg">
          <circle cx="2" cy="3" r="1.2"/>
          <circle cx="6" cy="3" r="1.2"/>
          <circle cx="10" cy="3" r="1.2"/>
          <circle cx="14" cy="3" r="1.2"/>
        </svg>
      </div>

      <!-- Expanded Detailed View -->
      <div class="aim-widget-content">
        <div class="aim-main-row">
          <span class="aim-service-badge aim-badge-${service}">${serviceName}</span>
          <span class="aim-count-display" id="aim-count-clicker" title="クリックで表示切替 (回数 ⇄ %)" style="cursor: pointer;">
            <strong id="aim-active-count">0</strong><span id="aim-slash-divider">/</span><span id="aim-limit-count">--</span>
          </span>
        </div>
        <div class="aim-progress-container">
          <div id="aim-progress-bar" class="aim-progress-bar"></div>
        </div>
        <div class="aim-expanded-panel">
          <div class="aim-action-row">
            <button id="aim-btn-decrease" class="aim-action-btn" title="回数を1減らす">-1</button>
            <button id="aim-btn-increase" class="aim-action-btn" title="回数を1増やす">+1</button>
          </div>
          <div id="aim-next-decay-text" class="aim-decay-text">Next: --</div>
        </div>
      </div>

      <!-- Collapsed Circular View (MacBook-style Horizontal Battery + Float Character) -->
      <div class="aim-collapsed-view">
        <div class="aim-collapsed-ring-container" id="aim-collapsed-clicker" title="ダブルクリックで展開 / クリックで表示切替 (回数 ⇄ %)" style="cursor: pointer;">
          <!-- 1. MacBook-style Horizontal Battery on top -->
          <div class="aim-collapsed-battery">
            <div class="aim-collapsed-battery-body">
              <div id="aim-collapsed-battery-level" class="aim-collapsed-battery-level"></div>
            </div>
            <div class="aim-collapsed-battery-cap"></div>
          </div>
          <!-- 2. Character in the middle -->
          <div class="aim-pixel-icon-wrapper" id="aim-pixel-icon-placeholder">
            ${getServicePixelIcon(service)}
          </div>
          <!-- 3. Text at the bottom -->
          <span class="aim-collapsed-text" id="aim-collapsed-text">${serviceLetter}0</span>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    // Apply saved coordinates
    await applySavedPosition(widget);

    // Setup drag handler
    makeElementDraggable(widget);

    // Click triggers for manual adjustments
    document.getElementById('aim-btn-increase').addEventListener('click', (e) => {
      e.stopPropagation();
      adjustCount(1);
    });
    document.getElementById('aim-btn-decrease').addEventListener('click', (e) => {
      e.stopPropagation();
      adjustCount(-1);
    });

    // Double-click to toggle collapse/expand (on the main widget area)
    widget.addEventListener('dblclick', (e) => {
      if (e.target.closest('button') || e.target.closest('#aim-count-clicker') || e.target.closest('#aim-collapsed-clicker')) return;
      toggleCollapse(widget);
    });

    // Click on count to toggle raw counts vs percentage modes
    document.getElementById('aim-count-clicker').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDisplayMode();
    });

    // Collapsed Ring click/double-click handler to prevent conflicts and restore widget state
    let clickTimeout;
    document.getElementById('aim-collapsed-clicker').addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.detail === 1) {
        // Debounce single click to wait for a potential double click
        clickTimeout = setTimeout(() => {
          toggleDisplayMode();
        }, 250);
      }
    });

    document.getElementById('aim-collapsed-clicker').addEventListener('dblclick', (e) => {
      e.stopPropagation();
      clearTimeout(clickTimeout); // Cancel pending single-click action
      toggleCollapse(widget);
    });

    // Render data and display
    await renderWidget();
    widget.style.setProperty('display', 'flex', 'important');

    // Periodically update the widget (decay countdowns)
    setInterval(renderWidget, 10000);
  }

  // Toggle Display Mode
  async function toggleDisplayMode() {
    displayMode = displayMode === 'count' ? 'percent' : 'count';
    await chrome.storage.local.set({ display_mode: displayMode });
    await renderWidget();
  }

  // Toggle Collapse State
  async function toggleCollapse(widget) {
    isCollapsed = !isCollapsed;
    const collapseKey = `${service}_widget_collapsed`;
    const updates = {};
    updates[collapseKey] = isCollapsed;
    await chrome.storage.local.set(updates);

    if (isCollapsed) {
      widget.classList.add('aim-collapsed');
    } else {
      widget.classList.remove('aim-collapsed');
    }
    
    // Boundary check in case toggling sizes pushes it out of bounds
    const buffer = 10;
    const maxLeft = window.innerWidth - widget.offsetWidth - buffer;
    const maxTop = window.innerHeight - widget.offsetHeight - buffer;
    const currentLeft = parseInt(widget.style.left);
    const currentTop = parseInt(widget.style.top);

    if (currentLeft > maxLeft || currentTop > maxTop) {
      widget.style.left = `${Math.max(buffer, Math.min(currentLeft, maxLeft))}px`;
      widget.style.top = `${Math.max(buffer, Math.min(currentTop, maxTop))}px`;
    }

    await renderWidget();
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // 1. Click Listener (For Send Buttons)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, [role="button"], .send-button, [aria-label*="send" i], [aria-label*="送信" i]');
      if (!btn) return;

      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      const btnText = btn.innerText.toLowerCase().trim();
      const innerHTML = btn.innerHTML.toLowerCase();

      const isAttachment = ariaLabel.includes('attach') || 
                           ariaLabel.includes('upload') ||
                           ariaLabel.includes('file') ||
                           ariaLabel.includes('添付') ||
                           title.includes('attach') ||
                           title.includes('upload') ||
                           title.includes('file');

      if (isAttachment) return;

      let isSendButton = false;

      const hasSendKeywords = ariaLabel.includes('send') || 
                              ariaLabel.includes('submit') ||
                              ariaLabel.includes('送信') ||
                              ariaLabel.includes('実行') ||
                              title.includes('send') ||
                              title.includes('送信') ||
                              btnText.includes('run') ||
                              btnText.includes('send');

      const hasSendSvg = innerHTML.includes('arrow') || 
                         innerHTML.includes('send') || 
                         innerHTML.includes('airplane') || 
                         innerHTML.includes('paper-plane') ||
                         innerHTML.includes('polygon') || 
                         btn.querySelector('svg');

      if (service === 'claude') {
        isSendButton = hasSendKeywords || 
                       (btn.closest('[class*="chatInput"]') && hasSendSvg) ||
                       btn.querySelector('rect') || 
                       btn.querySelector('path[d*="M"]') && btn.closest('[class*="relative"]'); 
      } else if (service === 'gemini') {
        isSendButton = hasSendKeywords || 
                       btn.classList.contains('send-button') ||
                       (btn.closest('.input-area-container') && hasSendSvg);
      } else if (service === 'aistudio') {
        isSendButton = hasSendKeywords || 
                       btnText.includes('run') || 
                       btn.classList.contains('run-button') ||
                       btn.id === 'run-button';
      }

      if (!isSendButton && btn.closest('[class*="input"]') && btn.querySelector('svg')) {
        isSendButton = true;
      }

      if (isSendButton) {
        triggerMessageLogged();
      }
    }, true);

    // 2. Keydown Listener
    document.addEventListener('keydown', (e) => {
      if (e.isComposing) return;

      const activeEl = document.activeElement;
      if (!activeEl) return;

      const isEditable = activeEl.tagName === 'TEXTAREA' || 
                         activeEl.tagName === 'INPUT' ||
                         activeEl.contentEditable === 'true' ||
                         activeEl.contentEditable === 'plaintext-only' ||
                         activeEl.closest('[contenteditable="true"]') ||
                         activeEl.closest('[contenteditable="plaintext-only"]') ||
                         activeEl.getAttribute('role') === 'textbox';

      if (!isEditable) return;

      if (service === 'aistudio') {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          triggerMessageLogged();
        }
      } else {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const text = activeEl.innerText || activeEl.value || '';
          if (text.trim().length > 0) {
            triggerMessageLogged();
          }
        }
      }
    }, true);

    // 3. Storage Change Listener
    chrome.storage.onChanged.addListener((changes) => {
      const relevantKeys = [
        `${service}_logs`, 
        `${service}_limit`, 
        `${service}_window`,
        `display_mode`,
        `default_display_mode`
      ];
      const shouldUpdate = Object.keys(changes).some(key => relevantKeys.includes(key));
      if (shouldUpdate) {
        if (changes.display_mode) {
          displayMode = changes.display_mode.newValue;
        } else if (changes.default_display_mode) {
          chrome.storage.local.get('display_mode').then(res => {
            if (!res.display_mode) {
              displayMode = changes.default_display_mode.newValue;
              renderWidget();
            }
          });
        }
        renderWidget();
      }
    });
  }

  function triggerMessageLogged() {
    const now = Date.now();
    if (now - lastLoggedTime > DEBOUNCE_TIME) {
      lastLoggedTime = now;
      logMessageSend();
    }
  }

  async function logMessageSend() {
    const logKey = `${service}_logs`;
    const data = await chrome.storage.local.get(logKey);
    const currentLogs = data[logKey] || [];
    
    currentLogs.push(Date.now());
    
    const updates = {};
    updates[logKey] = currentLogs;
    await chrome.storage.local.set(updates);
    
    await renderWidget();
  }

  async function adjustCount(delta) {
    const logKey = `${service}_logs`;
    const data = await chrome.storage.local.get(logKey);
    const currentLogs = data[logKey] || [];

    if (delta > 0) {
      currentLogs.push(Date.now());
    } else if (delta < 0 && currentLogs.length > 0) {
      currentLogs.pop();
    }

    const updates = {};
    updates[logKey] = currentLogs;
    await chrome.storage.local.set(updates);

    await renderWidget();
  }

  // Render Widget Display Values and Progress Circle Gauge
  async function renderWidget() {
    const logKey = `${service}_logs`;
    const limitKey = `${service}_limit`;
    const windowKey = `${service}_window`;

    const data = await chrome.storage.local.get([logKey, limitKey, windowKey, 'display_mode', 'default_display_mode']);
    
    const logs = data[logKey] || [];
    const limit = data[limitKey] || (service === 'claude' ? 45 : 50);
    const windowMs = data[windowKey] || (service === 'claude' ? 5 * 60 * 60 * 1000 : 3 * 60 * 60 * 1000);
    displayMode = data.display_mode || data.default_display_mode || 'count';

    const now = Date.now();
    const activeLogs = logs.filter(timestamp => now - timestamp < windowMs);
    const count = activeLogs.length;

    // A. Update Expanded View Elements
    const countEl = document.getElementById('aim-active-count');
    const limitEl = document.getElementById('aim-limit-count');
    const slashDivider = document.getElementById('aim-slash-divider');
    const progressBar = document.getElementById('aim-progress-bar');
    const decayText = document.getElementById('aim-next-decay-text');

    const percentage = Math.min((count / limit) * 100, 100);
    const remainingPercentage = Math.max(0, 100 - percentage);
    const percentVal = Math.round(remainingPercentage);

    if (countEl) {
      if (displayMode === 'percent') {
        countEl.innerText = `${percentVal}%`;
        if (limitEl) limitEl.style.display = 'none';
        if (slashDivider) slashDivider.style.display = 'none';
      } else {
        countEl.innerText = count;
        if (limitEl) {
          limitEl.innerText = limit;
          limitEl.style.display = 'inline';
        }
        if (slashDivider) slashDivider.style.display = 'inline';
      }
    }
    
    if (progressBar) {
      progressBar.style.width = `${remainingPercentage}%`;
      if (remainingPercentage >= 80) {
        progressBar.style.setProperty('background-color', '#10B981', 'important');
      } else if (remainingPercentage >= 50) {
        progressBar.style.setProperty('background-color', '#F59E0B', 'important');
      } else {
        progressBar.style.setProperty('background-color', '#EF4444', 'important');
      }
    }

    if (decayText) {
      if (activeLogs.length > 0) {
        const oldestActive = Math.min(...activeLogs);
        const releaseTime = oldestActive + windowMs;
        const diffMs = releaseTime - now;

        if (diffMs > 0) {
          const diffMins = Math.ceil(diffMs / 1000 / 60);
          if (diffMins >= 60) {
            const hours = Math.floor(diffMins / 60);
            const mins = diffMins % 60;
            decayText.innerText = `Next: ${hours}h ${mins}m`;
          } else {
            decayText.innerText = `Next: ${diffMins}m`;
          }
        } else {
          decayText.innerText = 'Next: --';
        }
      } else {
        decayText.innerText = 'All slots free';
      }
    }

    // B. Update Collapsed View Elements (Retro Theme)
    const collapsedText = document.getElementById('aim-collapsed-text');
    if (collapsedText) {
      if (displayMode === 'percent') {
        collapsedText.innerText = `${percentVal}%`;
      } else {
        collapsedText.innerText = `${serviceLetter}${count}`;
      }
    }

    const collapsedBatteryLevel = document.getElementById('aim-collapsed-battery-level');
    if (collapsedBatteryLevel) {
      collapsedBatteryLevel.style.width = `${remainingPercentage}%`;
      collapsedBatteryLevel.classList.remove('level-high', 'level-med', 'level-low');
      if (remainingPercentage >= 80) {
        collapsedBatteryLevel.classList.add('level-high');
      } else if (remainingPercentage >= 50) {
        collapsedBatteryLevel.classList.add('level-med');
      } else {
        collapsedBatteryLevel.classList.add('level-low');
      }
    }

    // Dynamic status classes on the root widget to handle retro themes and color changes
    const widgetEl = document.getElementById('ai-usage-monitor-widget');
    if (widgetEl) {
      widgetEl.classList.remove('aim-status-low', 'aim-status-med', 'aim-status-high');
      if (remainingPercentage >= 80) {
        widgetEl.classList.add('aim-status-low');
      } else if (remainingPercentage >= 50) {
        widgetEl.classList.add('aim-status-med');
      } else {
        widgetEl.classList.add('aim-status-high');
      }
    }

    // Auto-save cleaned list if logs expired
    if (activeLogs.length !== logs.length) {
      const cleanUpdate = {};
      cleanUpdate[logKey] = activeLogs;
      await chrome.storage.local.set(cleanUpdate);
    }
  }

  // Draggable logic
  function makeElementDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    elmnt.onmousedown = (e) => {
      if (e.target.closest('button') || e.target.closest('.aim-expanded-panel') || e.target.closest('#aim-count-clicker') || e.target.closest('#aim-collapsed-clicker')) return;
      dragMouseDown(e);
    };

    elmnt.ontouchstart = (e) => {
      if (e.target.closest('button') || e.target.closest('.aim-expanded-panel') || e.target.closest('#aim-count-clicker') || e.target.closest('#aim-collapsed-clicker')) return;
      dragTouchStart(e);
    };

    function dragMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function dragTouchStart(e) {
      if (e.touches.length === 1) {
        pos3 = e.touches[0].clientX;
        pos4 = e.touches[0].clientY;
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementTouchDrag;
      }
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      updatePosition(elmnt.offsetTop - pos2, elmnt.offsetLeft - pos1);
    }

    function elementTouchDrag(e) {
      if (e.touches.length === 1) {
        pos1 = pos3 - e.touches[0].clientX;
        pos2 = pos4 - e.touches[0].clientY;
        pos3 = e.touches[0].clientX;
        pos4 = e.touches[0].clientY;

        updatePosition(elmnt.offsetTop - pos2, elmnt.offsetLeft - pos1);
      }
    }

    function updatePosition(newTop, newLeft) {
      const buffer = 10;
      const maxLeft = window.innerWidth - elmnt.offsetWidth - buffer;
      const maxTop = window.innerHeight - elmnt.offsetHeight - buffer;

      const boundedLeft = Math.max(buffer, Math.min(newLeft, maxLeft));
      const boundedTop = Math.max(buffer, Math.min(newTop, maxTop));

      elmnt.style.top = `${boundedTop}px`;
      elmnt.style.left = `${boundedLeft}px`;
      elmnt.style.bottom = 'auto';
      elmnt.style.right = 'auto';
    }

    async function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
      document.ontouchend = null;
      document.ontouchmove = null;

      const posKey = `${service}_widget_pos`;
      const posData = {
        top: elmnt.style.top,
        left: elmnt.style.left
      };
      
      const saveObj = {};
      saveObj[posKey] = posData;
      await chrome.storage.local.set(saveObj);
    }
  }

  async function applySavedPosition(elmnt) {
    const posKey = `${service}_widget_pos`;
    const data = await chrome.storage.local.get(posKey);
    const pos = data[posKey];

    if (pos && pos.top && pos.left) {
      elmnt.style.top = pos.top;
      elmnt.style.left = pos.left;
      elmnt.style.bottom = 'auto';
      elmnt.style.right = 'auto';
    } else {
      elmnt.style.bottom = '20px';
      elmnt.style.right = '20px';
    }
  }

})();
