/* ── Glpw.ai — Frontend App ── */

let currentMode = 'summarize';
let chatHistory  = [];
let lastOutput   = '';

const LOADER_LABELS = {
  summarize: 'Summarising topic…',
  outline:   'Building outline…',
  draft:     'Drafting section…',
  sources:   'Finding sources…',
  chat:      'Thinking…',
};

const MODE_OUTPUT_LABELS = {
  summarize: 'Summary',
  outline:   'Research Outline',
  draft:     'Draft',
  sources:   'Sources & Citations',
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  setupModeTabs();

  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
async function checkHealth() {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const res  = await fetch('/api/health');
    const data = await res.json();
    if (data.agent_ready) {
      dot.classList.add('ok');
      text.textContent = 'Agent ready';
    } else {
      dot.classList.add('err');
      text.textContent = 'No API key';
    }
  } catch {
    dot.classList.add('err');
    text.textContent = 'Server offline';
  }
}

// ── Mode tabs ─────────────────────────────────────────────────────────────────
function setupModeTabs() {
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;
      toggleModeFields(currentMode);
    });
  });
}

function toggleModeFields(mode) {
  document.getElementById('paperTypeRow').style.display = mode === 'outline' ? 'flex' : 'none';
  document.getElementById('draftRow').style.display     = mode === 'draft'   ? 'flex' : 'none';
}

// ── Run agent ─────────────────────────────────────────────────────────────────
async function runAgent() {
  const topic = document.getElementById('topic').value.trim();
  if (!topic) { showError('Please enter a research topic first.'); return; }

  const level    = document.getElementById('level').value;
  const citation = document.getElementById('citation').value;
  const btn      = document.getElementById('runBtn');

  showLoading(LOADER_LABELS[currentMode]);
  btn.disabled = true;

  let endpoint = `/api/${currentMode}`;
  let body = { topic, level, citation_style: citation };

  if (currentMode === 'outline') {
    body.paper_type = document.getElementById('paperType').value;
  }
  if (currentMode === 'draft') {
    body.section = document.getElementById('section').value;
    body.context = document.getElementById('context').value.trim();
  }

  try {
    const res  = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');

    lastOutput = data.result;
    showResult(data.result, MODE_OUTPUT_LABELS[currentMode] || 'Output');
    updateStats(data.result, currentMode);

  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
  }
}

// ── Chat ──────────────────────────────────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg   = input.value.trim();
  if (!msg) return;

  input.value = '';
  chatHistory.push({ role: 'user', content: msg });
  appendChatMsg('user', msg);

  try {
    const res  = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: chatHistory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Chat failed');

    chatHistory.push({ role: 'assistant', content: data.result });
    appendChatMsg('assistant', data.result);
  } catch (err) {
    appendChatMsg('assistant', `Error: ${err.message}`);
  }
}

function appendChatMsg(role, text) {
  const msgs = document.getElementById('chatMessages');
  const div  = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// ── UI state helpers ───────────────────────────────────────────────────────────
function showLoading(label) {
  hide('emptyState'); hide('errorState'); hide('resultBody');
  document.getElementById('chatPanel').style.display = 'none';
  document.getElementById('outputActions').style.opacity = '0';
  document.getElementById('loaderText').textContent = label;
  show('loadingState');
}

function showResult(markdown, label) {
  hide('emptyState'); hide('loadingState'); hide('errorState');
  document.getElementById('outputLabel').textContent = label;
  document.getElementById('resultBody').innerHTML = renderMarkdown(markdown);
  document.getElementById('outputActions').style.opacity = '1';
  show('resultBody');
  document.getElementById('chatPanel').style.display = 'flex';
}

function showError(msg) {
  hide('emptyState'); hide('loadingState'); hide('resultBody');
  document.getElementById('errorState').textContent = `Error: ${msg}`;
  show('errorState');
}

function clearAll() {
  hide('errorState'); hide('resultBody'); hide('loadingState');
  hide('chatPanel');
  show('emptyState');
  document.getElementById('outputLabel').textContent = 'Output';
  document.getElementById('outputActions').style.opacity = '0';
  document.getElementById('statsGrid').style.display = 'none';
  document.getElementById('chatMessages').innerHTML = '';
  chatHistory = []; lastOutput = '';
}

function show(id) { document.getElementById(id).style.display = 'flex'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats(text, mode) {
  const words    = text.trim().split(/\s+/).length;
  const sections = (text.match(/^#{1,3} /gm) || []).length;
  document.getElementById('statWords').textContent    = words.toLocaleString();
  document.getElementById('statSections').textContent = sections || '—';
  document.getElementById('statMode').textContent     = mode.charAt(0).toUpperCase() + mode.slice(1);
  document.getElementById('statsGrid').style.display  = 'grid';
}

// ── Copy & download ───────────────────────────────────────────────────────────
async function copyOutput() {
  if (!lastOutput) return;
  await navigator.clipboard.writeText(lastOutput);
  const btn = document.querySelector('.action-btn');
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = orig, 1500);
}

function downloadOutput() {
  if (!lastOutput) return;
  const topic = document.getElementById('topic').value.trim().slice(0, 40).replace(/\s+/g, '-') || 'research';
  const blob  = new Blob([lastOutput], { type: 'text/markdown' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = `glpw-${currentMode}-${topic}.md`;
  a.click(); URL.revokeObjectURL(url);
}

// ── Markdown renderer (lightweight, no dependencies) ─────────────────────────
function renderMarkdown(md) {
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm,  '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,   '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,    '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code>$1</code>')
    .replace(/^> (.+)$/gm,     '<blockquote>$1</blockquote>')
    .replace(/^---$/gm,        '<hr/>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^[-*] (.+)$/gm,  '<li>$1</li>');

  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Paragraphs: lines not already wrapped
  html = html.split('\n').map(line => {
    if (/^<(h[1-3]|ul|ol|li|blockquote|hr)/.test(line.trim()) || line.trim() === '') return line;
    return `<p>${line}</p>`;
  }).join('\n');

  return html;
}
