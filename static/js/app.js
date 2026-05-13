/* ── Glow.ai v2 — Frontend App ── */

let currentMode  = 'summarize';
let chatHistory  = [];
let lastOutput   = '';
let uploadedDocs = [];
let docContext   = '';
let sessionStarted = false;   // true after first message sent

const MODE_CONFIG = {
  summarize: { title:'Summarize a topic',           sub:'Get a clear overview — type a topic or tap + to upload.',         badge:'Summary',  loader:'Summarizing…',      endpoint:'/api/summarize' },
  outline:   { title:'Generate a research outline', sub:'Build a full hierarchical outline with sections and arguments.',   badge:'Outline',  loader:'Building outline…', endpoint:'/api/outline'   },
  draft:     { title:'Draft a section',             sub:'Get a well-written academic draft of any paper section.',         badge:'Draft',    loader:'Drafting…',         endpoint:'/api/draft'     },
  sources:   { title:'Find sources & citations',    sub:'Discover relevant journals, databases, and formatted citations.', badge:'Sources',  loader:'Finding sources…',  endpoint:'/api/sources'   },
  analyze:   { title:'Analyze documents',           sub:'Upload documents and get a full academic analysis.',              badge:'Analysis', loader:'Analyzing docs…',   endpoint:'/api/analyze'   },
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  setupAllNavs();

  const input = document.getElementById('topicInput');
  input.addEventListener('input', autoResize);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  // Close popup when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('.wa-plus') && !e.target.closest('.upload-popup')) {
      closeUploadPopup();
    }
  });
});

function autoResize() {
  const el = document.getElementById('topicInput');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

// ── Health check ──────────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res  = await fetch('/api/health');
    const data = await res.json();
    const ok   = data.agent_ready;
    ['statusDot','mobileStatusDot','drawerStatusDot'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.toggle('ok', ok); el.classList.toggle('err', !ok); }
    });
    ['statusText','drawerStatusText'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = ok ? 'Agent ready' : 'No API key';
    });
  } catch {
    ['statusDot','mobileStatusDot','drawerStatusDot'].forEach(id => {
      document.getElementById(id)?.classList.add('err');
    });
  }
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function setupAllNavs() {
  document.querySelectorAll('.nav-item, .mobile-tab').forEach(btn => {
    btn.addEventListener('click', () => { setMode(btn.dataset.mode); closeDrawer(); });
  });
}

function setMode(mode) {
  currentMode = mode;
  const cfg = MODE_CONFIG[mode];
  document.getElementById('modeTitle').textContent = cfg.title;
  document.getElementById('modeSub').textContent   = cfg.sub;
  document.querySelectorAll('.nav-item, .mobile-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}

function openDrawer()  { document.getElementById('drawer').classList.add('open'); document.getElementById('drawerOverlay').classList.add('open'); }
function closeDrawer() { document.getElementById('drawer').classList.remove('open'); document.getElementById('drawerOverlay').classList.remove('open'); }

// ── Upload popup ──────────────────────────────────────────────────────────────
function toggleUploadPopup() {
  const popup = document.getElementById('uploadPopup');
  const btn   = document.getElementById('plusBtn');
  const isOpen = popup.classList.contains('open');
  popup.classList.toggle('open', !isOpen);
  btn.classList.toggle('active', !isOpen);
}

function closeUploadPopup() {
  document.getElementById('uploadPopup').classList.remove('open');
  document.getElementById('plusBtn').classList.remove('active');
}

function chooseUpload(type) {
  closeUploadPopup();
  if (type === 'doc')   document.getElementById('fileInputDoc').click();
  if (type === 'image') document.getElementById('fileInputImage').click();
}

function onFileSelect(e) {
  handleFiles([...e.target.files]);
  e.target.value = '';
}

// ── File upload ───────────────────────────────────────────────────────────────
async function handleFiles(files) {
  if (!files.length) return;
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  files.forEach(f => addFileChip(f.name, f.size, 'uploading'));

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) { appendThreadError('Upload failed: ' + (data.detail || 'Unknown error')); return; }

    // Replace uploading chips with done chips
    document.querySelectorAll('.file-chip.uploading').forEach(c => c.remove());
    data.documents.forEach(doc => {
      uploadedDocs.push(doc);
      addFileChip(doc.filename, doc.chars, 'ok');
    });
    if (data.errors?.length) data.errors.forEach(err => addFileChip(err, 0, 'error'));

    docContext = data.combined_text;

    // Auto switch to analyze if no topic yet
    if (!document.getElementById('topicInput').value.trim() && currentMode !== 'analyze') {
      setMode('analyze');
    }

    // Focus input so user can type a question about the file
    document.getElementById('topicInput').focus();

  } catch (err) {
    document.querySelectorAll('.file-chip.uploading').forEach(c => c.remove());
    appendThreadError('Upload error: ' + err.message);
  }
}

function addFileChip(name, sizeOrChars, state) {
  const chips = document.getElementById('fileChips');
  const chip  = document.createElement('div');
  chip.className = `file-chip${state === 'uploading' ? ' uploading' : state === 'error' ? ' error' : ''}`;
  chip.dataset.name = name;
  const label = state === 'uploading' ? 'uploading…' : state === 'error' ? 'failed' : `${(sizeOrChars/1000).toFixed(1)}k chars`;
  chip.innerHTML = `
    <span class="file-chip-name">${escHtml(name)}</span>
    <span class="file-chip-size">${label}</span>
    ${state !== 'uploading' ? `<button class="file-chip-remove" onclick="removeFile('${escAttr(name)}')" title="Remove">✕</button>` : ''}
  `;
  chips.appendChild(chip);
}

function removeFile(name) {
  uploadedDocs = uploadedDocs.filter(d => d.filename !== name);
  document.querySelectorAll('.file-chip').forEach(c => { if (c.dataset.name === name) c.remove(); });
  docContext = uploadedDocs.length
    ? uploadedDocs.map((d,i) => `[Document ${i+1}: ${d.filename}]\n\n${d.text}`).join('\n\n────────────────────────────────────────\n\n')
    : '';
}

// ── Handle send (works for both first message and follow-ups) ─────────────────
async function handleSend() {
  const input = document.getElementById('topicInput');
  const msg   = input.value.trim();

  if (!msg && !docContext) {
    flashInput(); return;
  }

  input.value = '';
  input.style.height = 'auto';

  if (!sessionStarted) {
    await runAgent(msg);
  } else {
    await sendFollowUp(msg);
  }
}

// ── First query ───────────────────────────────────────────────────────────────
async function runAgent(topic) {
  const cfg = MODE_CONFIG[currentMode];
  const btn = document.getElementById('sendBtn');

  // Show chat area, hide empty state
  hide('emptyState'); hide('errorState'); hide('loadingState');
  document.getElementById('resultArea').style.display = 'flex';
  document.getElementById('resultBadge').textContent  = cfg.badge;

  if (docContext && uploadedDocs.length) {
    const docBadge = document.getElementById('docBadge');
    docBadge.textContent   = `${uploadedDocs.length} doc${uploadedDocs.length > 1 ? 's' : ''} attached`;
    docBadge.style.display = 'inline-block';
  }

  // Append user bubble
  if (topic) appendUserBubble(topic);

  // Typing indicator
  const typing = appendTyping();
  btn.disabled = true;
  sessionStarted = true;

  try {
    let res;
    if (currentMode === 'analyze') {
      res = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_context: docContext, question: topic, save: true }),
      });
    } else {
      res = await fetch(cfg.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic || 'Analyze and summarize the uploaded documents',
          level: 'undergraduate', citation_style: 'APA',
          paper_type: 'research paper', section: 'Introduction',
          context: '', doc_context: docContext,
          save: true,
        }),
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');

    lastOutput  = data.result;
    chatHistory = [
      { role: 'user',      content: topic || 'Analyze documents' },
      { role: 'assistant', content: data.result },
    ];

    const words = data.result.trim().split(/\s+/).length;
    document.getElementById('resultStats').textContent = `${words.toLocaleString()} words`;

    typing.remove();
    appendAiBubble(data.result);
    afterAiResponse();
    setActions(true);

  } catch (err) {
    typing.remove();
    appendThreadError(err.message);
  } finally {
    btn.disabled = false;
    scrollThread();
  }
}

// ── Follow-up ─────────────────────────────────────────────────────────────────
async function sendFollowUp(msg) {
  const btn = document.getElementById('sendBtn');

  appendUserBubble(msg);
  chatHistory.push({ role: 'user', content: msg });

  const typing = appendTyping();
  btn.disabled = true;

  try {
    const res  = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Chat failed');

    chatHistory.push({ role: 'assistant', content: data.result });
    lastOutput = data.result;

    typing.remove();
    appendAiBubble(data.result);
    afterAiResponse();

  } catch (err) {
    typing.remove();
    appendThreadError(err.message);
  } finally {
    btn.disabled = false;
    scrollThread();
  }
}

// ── Thread helpers ────────────────────────────────────────────────────────────
function appendUserBubble(text) {
  const thread = document.getElementById('chatThread');
  const div = document.createElement('div');
  div.className   = 'thread-bubble thread-user';
  div.textContent = text;
  thread.appendChild(div);
  scrollThread();
}

function appendAiBubble(markdown) {
  const thread = document.getElementById('chatThread');
  const div = document.createElement('div');
  div.className = 'thread-bubble thread-ai';
  div.innerHTML = renderMarkdown(markdown);
  thread.appendChild(div);
  scrollThread();
}

function appendThreadError(msg) {
  const thread = document.getElementById('chatThread');
  const div = document.createElement('div');
  div.className = 'thread-bubble thread-ai';
  div.style.color = 'var(--danger)';
  div.textContent = 'Error: ' + msg;
  thread.appendChild(div);
  scrollThread();
}

function appendTyping() {
  const thread = document.getElementById('chatThread');
  const div = document.createElement('div');
  div.className = 'thread-bubble thread-ai thread-typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  thread.appendChild(div);
  scrollThread();
  return div;
}

function scrollThread() {
  const thread = document.getElementById('chatThread');
  thread.scrollTop = thread.scrollHeight;
  // Also scroll the output area
  const area = document.getElementById('outputArea');
  area.scrollTop = area.scrollHeight;
}

// ── Clear all ─────────────────────────────────────────────────────────────────
function clearAll() {
  hide('loadingState'); hide('errorState'); hide('resultArea');
  showFlex('emptyState');
  document.getElementById('topicInput').value = '';
  document.getElementById('topicInput').style.height = 'auto';
  document.getElementById('chatThread').innerHTML = '';
  document.getElementById('fileChips').innerHTML  = '';
  document.getElementById('docBadge').style.display = 'none';
  setActions(false);
  chatHistory = []; lastOutput = ''; uploadedDocs = []; docContext = '';
  sessionStarted = false;
}

function flashInput() {
  const bar = document.querySelector('.wa-inner');
  bar.style.borderColor = 'rgba(248,113,113,0.5)';
  setTimeout(() => bar.style.borderColor = '', 600);
}

function fillSuggestion(text) {
  document.getElementById('topicInput').value = text;
  autoResize();
  handleSend();
}

function setActions(v) {
  const el = document.getElementById('headerActions');
  el.style.opacity = v ? '1' : '0';
  el.style.pointerEvents = v ? 'auto' : 'none';
}

function hide(id)      { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function showFlex(id)  { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
function showBlock(id) { const el = document.getElementById(id); if (el) el.style.display = 'block'; }

// ── Export ────────────────────────────────────────────────────────────────────
async function copyOutput() {
  if (!lastOutput) return;
  await navigator.clipboard.writeText(lastOutput);
  const btn = document.querySelector('.pill-btn');
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = orig, 1500);
}

function downloadMarkdown() {
  if (!lastOutput) return;
  const slug = (document.getElementById('topicInput').value.trim() || 'research').slice(0,40).replace(/\s+/g,'-');
  const blob = new Blob([lastOutput], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `glow-${currentMode}-${slug}.md`;
  a.click(); URL.revokeObjectURL(url);
}

async function downloadPDF() {
  if (!lastOutput) return;
  const btn  = document.querySelector('.pill-accent');
  const orig = btn.textContent;
  btn.textContent = 'Generating…'; btn.disabled = true;
  try {
    const topic = 'Research Output';
    const res   = await fetch('/api/export/pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: lastOutput, title: topic }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `glow-research.pdf`;
    a.click(); URL.revokeObjectURL(url);
    btn.textContent = 'Downloaded!';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  } catch (err) {
    alert('PDF export failed: ' + err.message);
    btn.textContent = orig; btn.disabled = false;
  }
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(md) {
  let html = md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^### (.+)$/gm,  '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,   '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,    '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,    '<em>$1</em>')
    .replace(/`(.+?)`/g,      '<code>$1</code>')
    .replace(/^> (.+)$/gm,    '<blockquote>$1</blockquote>')
    .replace(/^---$/gm,       '<hr/>')
    .replace(/^\d+\. (.+)$/gm,'<li>$1</li>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]+?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  html = html.split('\n').map(line => {
    if (/^<(h[1-3]|ul|ol|li|blockquote|hr)/.test(line.trim()) || !line.trim()) return line;
    return `<p>${line}</p>`;
  }).join('\n');
  return html;
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s).replace(/'/g,"\\'"); }

/* ════════════════════════════════════════
   User profile & research history
════════════════════════════════════════ */

// Load on init
document.addEventListener('DOMContentLoaded', () => {
  loadUser();
  loadHistory();
  restoreLastSession();
});

async function loadUser() {
  try {
    const res  = await fetch('/api/auth/me');
    if (!res.ok) return;
    const data = await res.json();
    const name = data.name;
    const initial = name.charAt(0).toUpperCase();
    
    document.getElementById('userName').textContent  = name;
    document.getElementById('userEmail').textContent = data.email;
    document.getElementById('userAvatar').textContent = initial;
    
    // Mobile elements
    const mName = document.getElementById('mobileUserName');
    const mAvatar = document.getElementById('mobileUserAvatar');
    if (mName) mName.textContent = name;
    if (mAvatar) mAvatar.textContent = initial;
  } catch {}
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout failed:', err);
  }
  // Clear all local data
  localStorage.removeItem('glowCurrentSession');
  sessionStorage.removeItem('glowHistory');
  window.location.href = '/login';
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const res  = await fetch('/api/history');
    if (!res.ok) return;
    const data = await res.json();
    renderHistory(data);
  } catch {}
}

function renderHistory(sessions) {
  const list = document.getElementById('historyList');
  if (!sessions.length) {
    list.innerHTML = '<p class="history-empty">No research yet</p>';
    return;
  }
  list.innerHTML = sessions.map(s => `
    <div class="history-item" onclick="restoreSession(${s.id})">
      <div class="history-mode-dot"></div>
      <div class="history-text">
        <span class="history-topic">${escHtml(s.topic)}</span>
        <span class="history-date">${s.created_at}</span>
      </div>
      <button class="history-del" onclick="deleteSession(event, ${s.id})" title="Delete">✕</button>
    </div>
  `).join('');

  // Cache in sessionStorage so it survives page navigation
  sessionStorage.setItem('glowHistory', JSON.stringify(sessions));
}

async function deleteSession(e, id) {
  e.stopPropagation();
  await fetch(`/api/history/${id}`, { method: 'DELETE' });
  loadHistory();
}

// ── Restore session ───────────────────────────────────────────────────────────
async function restoreSession(id) {
  try {
    const res  = await fetch('/api/history');
    const data = await res.json();
    const s    = data.find(x => x.id === id);
    if (!s) return;

    clearAll();
    lastOutput = s.result;
    chatHistory = [
      { role: 'user', content: s.topic },
      { role: 'assistant', content: s.result },
    ];
    sessionStarted = true;

    setMode(s.mode === 'summary' ? 'summarize' : s.mode);
    document.getElementById('resultArea').style.display = 'flex';
    document.getElementById('resultBadge').textContent  = s.mode;
    document.getElementById('resultStats').textContent  = `${s.result.trim().split(/\s+/).length.toLocaleString()} words`;
    hide('emptyState');

    const thread = document.getElementById('chatThread');
    thread.innerHTML = '';
    appendUserBubble(s.topic);
    appendAiBubble(s.result);
    setActions(true);

  } catch (err) {
    console.error('Restore failed:', err);
  }
}

// ── Persist current session in localStorage ───────────────────────────────────
function saveCurrentSession() {
  if (!lastOutput) return;
  localStorage.setItem('glowCurrentSession', JSON.stringify({
    mode: currentMode,
    topic: document.getElementById('topicInput').value || chatHistory[0]?.content || '',
    result: lastOutput,
    history: chatHistory,
    timestamp: Date.now(),
  }));
}

function restoreLastSession() {
  // We'll rely on backend history instead of localStorage for a cleaner experience
  // but we can keep it for temporary persistence if needed.
  // For now, let's just clear it to avoid confusion with account-based history.
  localStorage.removeItem('glowCurrentSession');
}

// Auto-save after every AI response
const _origAppendAiBubble = appendAiBubble;
// We patch the save call inside sendFollowUp and runAgent via a wrapper
function afterAiResponse() {
  // saveCurrentSession(); // We can disable this to rely on backend history
  loadHistory();
}
