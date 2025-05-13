chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scan') {
    scanEmails().then(result => sendResponse(result));
    return true;
  }
});

async function scanEmails() {
  document.querySelectorAll('.highlighted-spam').forEach(el => el.classList.remove('highlighted-spam'));
  const keywords = await getKeywords();
  const emails = document.querySelectorAll('.zA');
  let flagged = 0;
  emails.forEach(email => {
    let text = '';
    const subj = email.querySelector('.bog');
    const snippet = email.querySelector('.y2');
    if (subj) text += subj.innerText.toLowerCase();
    if (snippet) text += ' ' + snippet.innerText.toLowerCase();
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      email.classList.add('highlighted-spam');
      flagged++;
    }
  });
  return { scanned: emails.length, flagged };
}

function getKeywords() {
  return new Promise(resolve => {
    if (!chrome.storage || !chrome.storage.local) {
      console.warn('[SpamDetector] chrome.storage.local not available. Resolving with empty keywords.');
      resolve([]);
      return;
    }
    chrome.storage.local.get(['spamKeywords'], data => {
      if (chrome.runtime.lastError) {
        console.error('[SpamDetector] Error getting spamKeywords:', chrome.runtime.lastError.message);
        resolve([]); 
      } else {
        resolve(data.spamKeywords || []);
      }
    });
  });
}

// Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// --- New Feature: Scan opened email content ---

function cleanupHighlights(container) {
  if (!container) return;
  const highlights = Array.from(container.querySelectorAll('.highlighted-keyword')); // Convert to array for stable iteration
  console.log('[SpamDetector] Cleaning up previous highlights:', highlights.length);
  highlights.forEach(span => {
    let parent = span.parentNode;
    if (parent) {
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    }
  });
  container.normalize(); // IMPORTANT: Merge adjacent text nodes
  console.log('[SpamDetector] Highlights cleaned and container normalized.');
}

async function scanAndHighlightOpenedEmail() {
  console.log('[SpamDetector] Debounced scanAndHighlightOpenedEmail triggered.');
  const keywordsRaw = await getKeywords();
  const keywords = (keywordsRaw || []).filter(Boolean).sort((a, b) => b.length - a.length);
  console.log('[SpamDetector] Keywords to highlight:', keywords);

  const candidates = Array.from(document.querySelectorAll('.a3s'));
  const visibleContent = candidates.find(el => el.offsetParent !== null && window.getComputedStyle(el).display !== 'none');
  console.log('[SpamDetector] Visible .a3s element:', visibleContent);

  if (!visibleContent) {
    console.log('[SpamDetector] No visible .a3s element found.');
    return;
  }
  if (keywords.length === 0) {
    console.log('[SpamDetector] No keywords to highlight. Cleaning up any existing highlights.');
    cleanupHighlights(visibleContent); // Clean even if no keywords, to remove stale highlights
    return;
  }

  cleanupHighlights(visibleContent);

  function highlightKeywordsCrossTag(container, keywords) {
    let textNodes = [];
    function getTextNodes(node) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
        textNodes.push(node);
      } else if (node.nodeType === Node.ELEMENT_NODE && 
                 node.tagName.toLowerCase() !== 'style' && 
                 node.tagName.toLowerCase() !== 'script' &&
                 node.tagName.toLowerCase() !== 'svg' && // Exclude SVG content
                 (!node.classList || !node.classList.contains('highlighted-keyword'))) {
        Array.from(node.childNodes).forEach(getTextNodes); // Use Array.from for NodeList iteration
      }
    }
    getTextNodes(container);
    console.log('[SpamDetector] Text nodes collected:', textNodes.length);

    let fullText = textNodes.map(n => n.nodeValue).join('');
    let lowerFullText = fullText.toLowerCase();

    let matches = [];
    keywords.forEach(keyword => {
      if (!keyword.trim()) return;
      const keywordRegexStr = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const keywordRegex = new RegExp(keywordRegexStr, 'gi');
      let match;
      while ((match = keywordRegex.exec(lowerFullText)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length, matchedString: match[0] });
      }
    });
    
    matches.sort((a, b) => b.start - a.start); // Process from END to START
    console.log('[SpamDetector] Matches found & sorted (end to start):', matches.length, matches);

    matches.forEach(({ start, end, matchedString }) => {
      let charCount = 0;
      for (let i = 0; i < textNodes.length; i++) {
        const node = textNodes[i];
        if (!node.parentNode) continue; // Skip nodes that might have been removed by previous manipulations
        const nodeText = node.nodeValue;
        const nodeEndCharCount = charCount + nodeText.length;

        if (start < nodeEndCharCount && end > charCount) {
          const matchStartInNode = Math.max(0, start - charCount);
          const matchEndInNode = Math.min(nodeText.length, end - charCount);

          if (matchStartInNode < matchEndInNode) {
            const actualTextToHighlight = nodeText.substring(matchStartInNode, matchEndInNode);
            
            const span = document.createElement('span');
            span.className = 'highlighted-keyword';
            span.textContent = actualTextToHighlight;

            const afterText = nodeText.substring(matchEndInNode);
            let afterNode = null;
            if (afterText.length > 0) afterNode = document.createTextNode(afterText);

            node.nodeValue = nodeText.substring(0, matchStartInNode);

            const parent = node.parentNode;
            if (afterNode) parent.insertBefore(afterNode, node.nextSibling);
            parent.insertBefore(span, node.nextSibling);
            console.log('[SpamDetector] Highlighted fragment:', actualTextToHighlight);
          }
        }
        charCount = nodeEndCharCount;
        if (charCount >= end && end !== -1) break; 
      }
    });
    // After modifications, the original textNodes array is stale. Re-normalization might be needed if further passes occur.
    // However, cleanupHighlights will run first on the next debounced call, which re-normalizes.
  }

  highlightKeywordsCrossTag(visibleContent, keywords);
  console.log('[SpamDetector] Advanced cross-tag highlighting attempt finished.');
}

const debouncedScanAndHighlight = debounce(scanAndHighlightOpenedEmail, 100); // Debounce delay 100ms

const observeGmailChanges = () => {
  const targetNode = document.body;
  if (!targetNode) {
    console.log("[SpamDetector] Target node for MutationObserver not found.");
    return;
  }
  // Broad observation scope
  const observerConfig = { childList: true, subtree: true, characterData: true };

  const mutationCallback = (mutationsList, observer) => {
    let relevantChange = false;
    for (const mutation of mutationsList) {
      if (mutation.type === 'characterData') {
        // If text changed within an email body or its potential containers
        if (mutation.target.parentElement && mutation.target.parentElement.closest('.a3s, .gs, .ii')) {
          relevantChange = true;
          break;
        }
      }
      if (mutation.type === 'childList') {
        const processNodes = (nodes) => {
          for (const node of nodes) {
            if (node.nodeType === Node.ELEMENT_NODE && (node.matches('.a3s, .gs, .ii') || node.querySelector('.a3s, .gs, .ii'))) {
              return true;
            }
          }
          return false;
        };
        if (processNodes(mutation.addedNodes) || processNodes(mutation.removedNodes)) {
          relevantChange = true;
          break;
        }
        // Also check if the target of the mutation is an email container itself
        if (mutation.target.nodeType === Node.ELEMENT_NODE && mutation.target.matches('.a3s, .gs, .ii')){
            relevantChange = true;
            break;
        }
      }
    }

    if (relevantChange) {
      console.log('[SpamDetector] Relevant DOM change detected, triggering debounced scan.');
      debouncedScanAndHighlight();
    }
  };

  const observer = new MutationObserver(mutationCallback);
  observer.observe(targetNode, observerConfig);
  console.log('[SpamDetector] Mutation observer started.');
  debouncedScanAndHighlight(); 
};

if (window.location.hostname === "mail.google.com") {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    observeGmailChanges();
  } else {
    document.addEventListener("DOMContentLoaded", observeGmailChanges);
  }
}

// Preserved original scanEmails for subject/snippet from earlier versions
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scan') {
    async function scanInboxEmails() {
      document.querySelectorAll('.highlighted-spam').forEach(el => el.classList.remove('highlighted-spam'));
      const keywords = await getKeywords();
      const emails = document.querySelectorAll('.zA');
      let flagged = 0;
      emails.forEach(email => {
        let text = '';
        const subj = email.querySelector('.bog');
        const snippet = email.querySelector('.y2');
        if (subj) text += subj.innerText.toLowerCase();
        if (snippet) text += ' ' + snippet.innerText.toLowerCase();
        if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
          email.classList.add('highlighted-spam');
          flagged++;
        }
      });
      return { scanned: emails.length, flagged };
    }
    scanInboxEmails().then(result => sendResponse(result));
    return true; 
  }
});