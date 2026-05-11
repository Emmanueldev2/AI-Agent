/* ── Glow.ai v2 — Frontend App ── */

let currentMode  = 'summarize';
let chatHistory  = [];
let lastOutput   = '';
let uploadedDocs = [];   // { filename, text, chars }
let docContext   = '';   // combined text from all uploads

const MODE_CONFIG = {
  summarize: { title:'Summarize a topic',           sub:'Get a clear overview — type a topic or upload documents.',          badge:'Summary',  loader:'Summarizing…',      endpoint:'/api/summarize' },
  outline:   { title:'Generate a research outline', sub:'Build a full hierarchical outline with sections and arguments.',     badge:'Outline',  loader:'Building outline…', endpoint:'/api/outline'   },
  draft:     { title:'Draft a section',             sub:'Get a well-written academic draft of any paper section.',           badge:'Draft',    loader:'Drafting…',         endpoint:'/api/draft'     },
  sources:   { title:'Find sources & citations',    sub:'Discover relevant journals, databases, and formatted citations.',   badge:'Sources',  loader:'Finding sources…',  endpoint:'/api/sources'   },
  analyze:   { title:'Analyze documents',           sub:'Upload documents and get a full academic analysis.',                badge:'Analysis', loader:'Analyzing docs…',   endpoint:'/api/analyze'   },
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  setupAllNavs();

  const input = document.getElementById('topicInput');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    document.getElementById('charCount').textContent = `${input.value.length} / 500`;
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAgent(); }
  });

  document.getElementById('chatInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  document.getElementById('mobileChatInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMobileChat(); }
  });
});

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

// ── File upload ───────────────────────────────────────────────────────────────
function onDragOver(e) {
  e.preventDefault();
  document.getElementById('uploadDrop').classList.add('dragover');
}
function onDragLeave(e) {
  document.getElementById('uploadDrop').classList.remove('dragover');
}
function onDrop(e) {
  e.preventDefault();
  document.getElementById('uploadDrop').classList.remove('dragover');
  handleFiles([...e.dataTransfer.files]);
}
function onFileSelect(e) {
  handleFiles([...e.target.files]);
  e.target.value = '';
}

async function handleFiles(files) {
  if (!files.length) return;

  const formData = new FormData();
  files.forEach(f => formData.append('files', f));

  // Show pending chips
  files.forEach(f => addFileChip(f.name, f.size, 'uploading'));

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) { showError(data.detail || 'Upload failed'); return; }

    // Replace pending chips with real ones
    clearFileChips();
    data.documents.forEach(doc => {
      uploadedDocs.push(doc);
      addFileChip(doc.filename, doc.chars, 'ok');
    });
    if (data.errors?.length) {
      data.errors.forEach(e => addFileChip(e, 0, 'error'));
    }

    docContext = data.combined_text;

    // Auto-switch to analyze mode if no topic yet
    if (!document.getElementById('topicInput').value.trim() && currentMode !== 'analyze') {
      setMode('analyze');
    }

  } catch (err) {
    showError('Upload error: ' + err.message);
  }
}

function addFileChip(name, sizeOrChars, state) {
  const chips  = document.getElementById('fileChips');
  const chip   = document.createElement('div');
  chip.className = `file-chip ${state === 'uploading' ? 'uploading' : state === 'error' ? 'error' : ''}`;
  chip.dataset.name = name;

  const label = state === 'uploading' ? 'uploading…' :
                state === 'error'     ? 'failed'     :
                `${(sizeOrChars/1000).toFixed(1)}k chars`;

  chip.innerHTML = `
    <span class="file-chip-name">${escHtml(name)}</span>
    <span class="file-chip-size">${label}</span>
    ${state !== 'uploading' ? `<button class="file-chip-remove" onclick="removeFile('${escAttr(name)}')" title="Remove">✕</button>` : ''}
  `;
  chips.appendChild(chip);
}

function clearFileChips() {
  document.getElementById('fileChips').innerHTML = '';
}

function removeFile(name) {
  uploadedDocs = uploadedDocs.filter(d => d.filename !== name);
  document.querySelectorAll('.file-chip').forEach(c => {
    if (c.dataset.name === name) c.remove();
  });
  docContext = uploadedDocs.length
    ? uploadedDocs.map((d,i) => `[Document ${i+1}: ${d.filename}]\n\n${d.text}`).join('\n\n' + '─'.repeat(40) + '\n\n')
    : '';
}

// ── Run agent ─────────────────────────────────────────────────────────────────
async function runAgent() {
  const topic = document.getElementById('topicInput').value.trim();
  const cfg   = MODE_CONFIG[currentMode];

  if (!topic && !docContext) {
    showError('Please enter a research topic or upload at least one document.');
    return;
  }

  const btn = document.getElementById('sendBtn');
  showLoading(cfg.loader);
  btn.disabled = true;

  try {
    let res, data;

    if (currentMode === 'analyze') {
      if (!docContext) { showError('Please upload at least one document to analyze.'); btn.disabled = false; return; }
      res  = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_context: docContext, question: topic }),
      });
    } else {
      res = await fetch(cfg.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic || 'Analyze and summarize the uploaded documents',
          level: 'undergraduate',
          citation_style: 'APA',
          paper_type: 'research paper',
          section: 'Introduction',
          context: '',
          doc_context: docContext,
        }),
      });
    }

    data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');

    lastOutput = data.result;
    chatHistory = [];
    showResult(data.result, cfg.badge);

  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
  }
}

function fillSuggestion(text) {
  const input = document.getElementById('topicInput');
  input.value = text;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  document.getElementById('charCount').textContent = `${text.length} / 500`;
  runAgent();
}

// ── Chat ──────────────────────────────────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';
  chatHistory.push({ role: 'user', content: msg });
  appendBubble('chatMessages', 'user', msg);
  const reply = await fetchChat();
  if (reply) { chatHistory.push({ role: 'assistant', content: reply }); appendBubble('chatMessages', 'assistant', reply); }
}

async function sendMobileChat() {
  const input = document.getElementById('mobileChatInput');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';
  chatHistory.push({ role: 'user', content: msg });
  appendBubble('mobileChatMessages', 'user', msg);
  const reply = await fetchChat();
  if (reply) { chatHistory.push({ role: 'assistant', content: reply }); appendBubble('mobileChatMessages', 'assistant', reply); }
}

async function fetchChat() {
  try {
    const res  = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Chat failed');
    return data.result;
  } catch (err) { return `Error: ${err.message}`; }
}

function appendBubble(containerId, role, text) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const div  = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function clearChat() {
  document.getElementById('chatMessages').innerHTML = '';
  document.getElementById('mobileChatMessages').innerHTML = '';
  chatHistory = [];
}

// ── UI states ─────────────────────────────────────────────────────────────────
function showLoading(label) {
  hide('emptyState'); hide('errorState'); hide('resultArea');
  document.getElementById('loadingLabel').textContent = label;
  showFlex('loadingState');
  setActions(false); setChatVisible(false);
}

function showResult(markdown, badge) {
  hide('emptyState'); hide('loadingState'); hide('errorState');
  const words = markdown.trim().split(/\s+/).length;
  document.getElementById('resultBadge').textContent  = badge;
  document.getElementById('resultStats').textContent  = `${words.toLocaleString()} words`;
  document.getElementById('resultBody').innerHTML     = renderMarkdown(markdown);

  const docBadge = document.getElementById('docBadge');
  if (docContext && uploadedDocs.length) {
    docBadge.textContent = `${uploadedDocs.length} doc${uploadedDocs.length>1?'s':''} attached`;
    docBadge.style.display = 'inline-block';
  } else {
    docBadge.style.display = 'none';
  }

  showBlock('resultArea');
  setActions(true); setChatVisible(true);
  document.getElementById('mobileChatPanel')?.classList.add('visible');
}

function showError(msg) {
  hide('emptyState'); hide('loadingState'); hide('resultArea');
  document.getElementById('errorState').textContent = `Error: ${msg}`;
  showBlock('errorState');
}

function clearAll() {
  hide('loadingState'); hide('errorState'); hide('resultArea');
  showFlex('emptyState');
  document.getElementById('topicInput').value = '';
  document.getElementById('topicInput').style.height = 'auto';
  document.getElementById('charCount').textContent = '0 / 500';
  setActions(false); setChatVisible(false);
  document.getElementById('mobileChatPanel')?.classList.remove('visible');
  clearChat();
  lastOutput = '';
}

function setActions(v) {
  const el = document.getElementById('headerActions');
  el.style.opacity = v ? '1' : '0'; el.style.pointerEvents = v ? 'auto' : 'none';
}
function setChatVisible(v) {
  const cs = document.getElementById('chatSidebar');
  if (cs) { cs.style.opacity = v ? '1' : '0'; cs.style.pointerEvents = v ? 'auto' : 'none'; }
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
  const slug = document.getElementById('topicInput').value.trim().slice(0,40).replace(/\s+/g,'-') || 'research';
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
  btn.textContent = 'Generating…';
  btn.disabled = true;

  try {
    const topic = document.getElementById('topicInput').value.trim() || 'Research Output';
    const res   = await fetch('/api/export/pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: lastOutput, title: topic }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const slug = topic.slice(0,40).replace(/\s+/g,'-').toLowerCase();
    a.href = url; a.download = `glow-${slug}.pdf`;
    a.click(); URL.revokeObjectURL(url);
    btn.textContent = 'Downloaded!';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  } catch (err) {
    alert('PDF export failed: ' + err.message + '\n\nMake sure WeasyPrint or ReportLab is installed.');
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
