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
    chrome.storage.local.get(['spamKeywords'], data => {
      resolve(data.spamKeywords || []);
    });
  });
}