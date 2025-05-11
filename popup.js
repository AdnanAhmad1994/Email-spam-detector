document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scan-btn');
  const scannedEl = document.getElementById('scanned-count');
  const flaggedEl = document.getElementById('flagged-count');
  const addInput = document.getElementById('add-input');
  const addBtn = document.getElementById('add-btn');
  const importFile = document.getElementById('import-file');
  const importBtn = document.getElementById('import-btn');
  const exportBtn = document.getElementById('export-btn');
  const clearBtn = document.getElementById('clear-btn');

  loadKeywords();

  scanBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'scan' }, response => {
        scannedEl.textContent = response.scanned;
        flaggedEl.textContent = response.flagged;
      });
    });
  });

  addBtn.addEventListener('click', () => {
    const kw = addInput.value.trim();
    if (kw) {
      addKeyword(kw);
      addInput.value = '';
    }
  });

  importBtn.addEventListener('click', () => {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      const items = text.split(/\r?\n|,/).map(s => s.trim()).filter(s => s);
      chrome.storage.local.get(['spamKeywords'], data => {
        const keywords = new Set(data.spamKeywords || []);
        items.forEach(i => keywords.add(i));
        const arr = Array.from(keywords);
        saveKeywords(arr);
        renderKeywords(arr);
      });
    };
    reader.readAsText(file);
  });

  exportBtn.addEventListener('click', () => {
    chrome.storage.local.get(['spamKeywords'], data => {
      const keywords = data.spamKeywords || [];
      const blob = new Blob([keywords.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'spam_keywords.txt';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  clearBtn.addEventListener('click', () => {
    clearAll();
  });

  function loadKeywords() {
    chrome.storage.local.get(['spamKeywords'], data => {
      renderKeywords(data.spamKeywords || []);
    });
  }

  function saveKeywords(keywords) {
    chrome.storage.local.set({ spamKeywords: keywords });
  }

  function renderKeywords(keywords) {
    const list = document.getElementById('keywords-list');
    list.innerHTML = '';
    keywords.forEach((kw, i) => {
      const li = document.createElement('li');
      li.textContent = kw;
      const btn = document.createElement('button');
      btn.textContent = '×';
      btn.addEventListener('click', () => removeKeyword(i));
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function addKeyword(kw) {
    chrome.storage.local.get(['spamKeywords'], data => {
      const keywords = data.spamKeywords || [];
      if (!keywords.includes(kw)) {
        keywords.push(kw);
        saveKeywords(keywords);
        renderKeywords(keywords);
      }
    });
  }

  function removeKeyword(idx) {
    chrome.storage.local.get(['spamKeywords'], data => {
      const keywords = data.spamKeywords || [];
      keywords.splice(idx, 1);
      saveKeywords(keywords);
      renderKeywords(keywords);
    });
  }

  function clearAll() {
    saveKeywords([]);
    renderKeywords([]);
  }
});