/* ── Glow.ai — Frontend App ── */

let currentMode = 'summarize';
let chatHistory = [];
let lastOutput  = '';

const MODE_CONFIG = {
  summarize: {
    title:   'Summarize a topic',
    sub:     'Get a clear, structured overview of any research topic.',
    badge:   'Summary',
    loader:  'Summarizing…',
    endpoint: '/api/summarize',
  },
  outline: {
    title:   'Generate a research outline',
    sub:     'Build a full hierarchical outline with sections and key arguments.',
    badge:   'Outline',
    loader:  'Building outline…',
    endpoint: '/api/outline',
  },
  draft: {
    title:   'Draft a section',
    sub:     'Get a well-written academic draft of any paper section.',
    badge:   'Draft',
    loader:  'Drafting…',
    endpoint: '/api/draft',
  },
  sources: {
    title:   'Find sources & citations',
    sub:     'Discover relevant journals, databases, and formatted citations.',
    badge:   'Sources',
    loader:  'Finding sources…',
    endpoint: '/api/sources',
  },
};

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();

  // Nav tabs
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      const cfg = MODE_CONFIG[currentMode];
      document.getElementById('modeTitle').textContent = cfg.title;
      document.getElementById('modeSub').textContent   = cfg.sub;
    });
  });

  // Topic input — auto-resize + char count + Enter to send
  const input = document.getElementById('topicInput');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    document.getElementById('charCount').textContent = `${input.value.length} / 500`;
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAgent(); }
  });

  // Chat input — Enter to send
  document.getElementById('chatInput').addEventListener('keydown', e => {
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

// ── Run agent ─────────────────────────────────────────────────────────────────
async function runAgent() {
  const input = document.getElementById('topicInput');
  const topic = input.value.trim();
  if (!topic) { input.focus(); return; }

  const cfg = MODE_CONFIG[currentMode];
  const btn = document.getElementById('sendBtn');

  showLoading(cfg.loader);
  btn.disabled = true;

  const body = {
    topic,
    level: 'undergraduate',
    citation_style: 'APA',
    paper_type: 'research paper',
    section: 'Introduction',
    context: '',
  };

  try {
    const res  = await fetch(cfg.endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
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

// ── Suggestion chips ──────────────────────────────────────────────────────────
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
  appendBubble('user', msg);

  try {
    const res  = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: chatHistory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Chat failed');
    chatHistory.push({ role: 'assistant', content: data.result });
    appendBubble('assistant', data.result);
  } catch (err) {
    appendBubble('assistant', `Error: ${err.message}`);
  }
}

function appendBubble(role, text) {
  const wrap = document.getElementById('chatMessages');
  const div  = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  div.textContent = text;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function clearChat() {
  document.getElementById('chatMessages').innerHTML = '';
  chatHistory = [];
}

// ── UI state helpers ───────────────────────────────────────────────────────────
function showLoading(label) {
  hide('emptyState'); hide('errorState'); hide('resultArea');
  document.getElementById('loadingLabel').textContent = label;
  showFlex('loadingState');
  document.getElementById('headerActions').style.opacity = '0';
  document.getElementById('headerActions').style.pointerEvents = 'none';
  document.getElementById('chatSidebar').style.opacity = '0';
  document.getElementById('chatSidebar').style.pointerEvents = 'none';
}

function showResult(markdown, badge) {
  hide('emptyState'); hide('loadingState'); hide('errorState');
  const words = markdown.trim().split(/\s+/).length;
  document.getElementById('resultBadge').textContent  = badge;
  document.getElementById('resultStats').textContent  = `${words.toLocaleString()} words`;
  document.getElementById('resultBody').innerHTML     = renderMarkdown(markdown);
  showBlock('resultArea');
  document.getElementById('headerActions').style.opacity      = '1';
  document.getElementById('headerActions').style.pointerEvents = 'auto';
  document.getElementById('chatSidebar').style.opacity        = '1';
  document.getElementById('chatSidebar').style.pointerEvents  = 'auto';
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
  document.getElementById('headerActions').style.opacity = '0';
  document.getElementById('headerActions').style.pointerEvents = 'none';
  document.getElementById('chatSidebar').style.opacity = '0';
  document.getElementById('chatSidebar').style.pointerEvents = 'none';
  clearChat();
  lastOutput = '';
}

function hide(id)      { document.getElementById(id).style.display = 'none'; }
function showFlex(id)  { document.getElementById(id).style.display = 'flex'; }
function showBlock(id) { document.getElementById(id).style.display = 'block'; }

// ── Copy & download ───────────────────────────────────────────────────────────
async function copyOutput() {
  if (!lastOutput) return;
  await navigator.clipboard.writeText(lastOutput);
  const btn = document.querySelector('.pill-btn');
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = orig, 1500);
}

function downloadOutput() {
  if (!lastOutput) return;
  const slug = document.getElementById('topicInput').value.trim().slice(0, 40).replace(/\s+/g, '-') || 'research';
  const blob = new Blob([lastOutput], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `glow-${currentMode}-${slug}.md`;
  a.click(); URL.revokeObjectURL(url);
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
