// The toolbar button opens the current page in Prism when the content script has flagged it as JSON,
// and otherwise opens Prism in its own tab, for pasting, opening or fetching a document.
chrome.action.onClicked.addListener(async (tab) => {
  const res = await chrome.tabs.sendMessage(tab.id, { type: 'prism:open' }).catch(() => null);
  if (!res?.ok) chrome.tabs.create({ url: 'index.html' });
});

// "Highlight the toolbar button" mode: the content script found JSON it left alone, so badge this tab's button.
chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;
  if (msg?.type !== 'prism:detected' || tabId === undefined) return;
  chrome.action.setBadgeText({ tabId, text: 'JSON' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#4f57e8' });
  chrome.action.setBadgeTextColor?.({ tabId, color: '#ffffff' });
  chrome.action.setTitle({ tabId, title: 'Open this response in JSON Prism' });
});

// a new page in the tab starts unflagged
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'loading') return;
  chrome.action.setBadgeText({ tabId, text: '' });
  chrome.action.setTitle({ tabId, title: 'Open JSON Prism' });
});
