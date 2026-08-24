const RULE_IDS = [1, 2];

const rules = [
  {
    id: 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'content-security-policy', operation: 'remove' },
        { header: 'content-security-policy-report-only', operation: 'remove' },
      ],
    },
    condition: {
      urlFilter: '||reddit.com^',
      resourceTypes: ['main_frame', 'sub_frame'],
    },
  },
  {
    id: 2,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'content-security-policy', operation: 'remove' },
        { header: 'content-security-policy-report-only', operation: 'remove' },
      ],
    },
    condition: {
      urlFilter: '||devvit.net^',
      resourceTypes: ['main_frame', 'sub_frame'],
    },
  },
];

async function setEnabled(enabled) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: RULE_IDS,
    addRules: enabled ? rules : [],
  });
  await chrome.storage.local.set({ enabled });
  await chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: enabled ? '#167A3E' : '#6B7280' });
  await chrome.action.setTitle({
    title: enabled
      ? 'Reddit Devvit World ID POC Unblocker is ON. Click to disable.'
      : 'Reddit Devvit World ID POC Unblocker is OFF. Click to enable.',
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void setEnabled(true);
});

chrome.runtime.onStartup.addListener(async () => {
  const { enabled = true } = await chrome.storage.local.get('enabled');
  await setEnabled(enabled);
});

chrome.action.onClicked.addListener(async () => {
  const { enabled = true } = await chrome.storage.local.get('enabled');
  await setEnabled(!enabled);
});
