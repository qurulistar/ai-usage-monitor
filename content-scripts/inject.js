// 1. inject.js をページコンテキストに注入
const s = document.createElement("script");
s.src = chrome.runtime.getURL("content-scripts/inject.js");
s.onload = () => s.remove();
(document.head || document.documentElement).appendChild(s);

// 2. 検知メッセージを受信
let lastDetected = 0;
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || !data.__aiUsageMonitor) return;

  // 200ms以内の重複は無視（fetch/XHR両方が走った場合の保険）
  if (Date.now() - lastDetected < 200) return;
  lastDetected = Date.now();

  // ここで既存のカウントアップ処理を呼ぶ
  incrementUsage(data.service);
}); // 1. inject.js をページコンテキストに注入
const s = document.createElement("script");
s.src = chrome.runtime.getURL("content-scripts/inject.js");
s.onload = () => s.remove();
(document.head || document.documentElement).appendChild(s);

// 2. 検知メッセージを受信
let lastDetected = 0;
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || !data.__aiUsageMonitor) return;

  // 200ms以内の重複は無視（fetch/XHR両方が走った場合の保険）
  if (Date.now() - lastDetected < 200) return;
  lastDetected = Date.now();

  // ここで既存のカウントアップ処理を呼ぶ
  incrementUsage(data.service);
});
