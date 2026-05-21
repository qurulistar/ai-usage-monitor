// Runs in PAGE context (injected by content.js) to intercept Claude API calls
(function () {
  'use strict';

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const req = args[0];
    const opts = args[1] || {};
    const url = typeof req === 'string' ? req : (req?.url || '');
    const method = (opts.method || req?.method || 'GET').toUpperCase();

    const response = await originalFetch.apply(this, args);

    if (method === 'POST' && /\/api\/[^?#]*\/completion/.test(url) && response.ok) {
      window.postMessage({ __aiUsageMonitor: true, type: 'message_sent', service: 'claude' }, '*');
    }

    return response;
  };

  // XHR fallback
  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;

  XHR.open = function (method, url) {
    this._aimMethod = method;
    this._aimUrl = url;
    return origOpen.apply(this, arguments);
  };

  XHR.send = function () {
    if (this._aimMethod?.toUpperCase() === 'POST' && /\/api\/[^?#]*\/completion/.test(this._aimUrl || '')) {
      this.addEventListener('load', function () {
        if (this.status === 200) {
          window.postMessage({ __aiUsageMonitor: true, type: 'message_sent', service: 'claude' }, '*');
        }
      });
    }
    return origSend.apply(this, arguments);
  };
})();
