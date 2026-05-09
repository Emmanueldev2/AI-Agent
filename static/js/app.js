/* ── Glow.ai — Frontend App ── */

let currentMode = 'summarize';
let chatHistory = [];
let lastOutput  = '';

const MODE_CONFIG = {
  summarize: { title:'Summarize a topic',          sub:'Get a clear, structured overview of any research topic.',          badge:'Summary',  loader:'Summarizing…',      endpoint:'/api/summarize' },
  outline:   { title:'Generate a research outline', sub:'Build a full hierarchical outline with sections and key arguments.', badge:'Outline',  loader:'Building outline…', endpoint:'/api/outline'   },
  draft:     { title:'Draft a section',             sub:'Get a well-written academic draft of any paper section.',           badge:'Draft',    loader:'Drafting…',         endpoint:'/api/draft'     },
  sources:   { title:'Find sources & citations',    sub:'Discover relevant journals, databases, and formatted citations.',   badge:'Sources',  loader:'Finding sources…',  endpoint:'/api/sources'   },
};

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  setupAllNavs();

  // Topic input
  const input = document.getElementById('topicInput');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    document.getElementById('charCount').textContent = `${input.value.length} / 500`;
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAgent(); }
  });

  // Desktop chat input
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
  }

  // Mobile chat input
  const mobileChat = document.getElementById('mobileChatInput');
  if (mobileChat) {
    mobileChat.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMobileChat(); }
    });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
async function checkHealth() {
  const dots  = ['statusDot','mobileStatusDot','drawerStatusDot'];
  const texts = ['statusText','drawerStatusText'];
  try {
    const res  = await fetch('/api/health');
    const data = await res.json();
    const ok   = data.agent_ready;
    dots.forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.toggle('ok', ok); el.classList.toggle('err', !ok); }
    });
    texts.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = ok ? 'Agent ready' : 'No API key';
    });
  } catch {
    dots.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('err'); });
  }
}

// ── Nav setup (desktop sidebar + mobile drawer + mobile tab bar) ──────────────
function setupAllNavs() {
  const allNavBtns = document.querySelectorAll('.nav-item, .mobile-tab');
  allNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      setMode(mode);
      closeDrawer();
    });
  });
}

function setMode(mode) {
  currentMode = mode;
  const cfg = MODE_CONFIG[mode];
  document.getElementById('modeTitle').textContent = cfg.title;
  document.getElementById('modeSub').textContent   = cfg.sub;

  // Update all nav buttons
  document.querySelectorAll('.nav-item, .mobile-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}

// ── Drawer (mobile) ───────────────────────────────────────────────────────────
function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
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

  try {
    const res  = await fetch(cfg.endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        level: 'undergraduate',
        citation_style: 'APA',
        paper_type: 'research paper',
        section: 'Introduction',
        context: '',
      }),
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

// ── Suggestions ───────────────────────────────────────────────────────────────
function fillSuggestion(text) {
  const input = document.getElementById('topicInput');
  input.value = text;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  document.getElementById('charCount').textContent = `${text.length} / 500`;
  runAgent();
}

// ── Desktop chat ──────────────────────────────────────────────────────────────
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

// ── Mobile chat ───────────────────────────────────────────────────────────────
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
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: chatHistory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Chat failed');
    return data.result;
  } catch (err) {
    return `Error: ${err.message}`;
  }
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
  setActions(false);
  setChatVisible(false);
}

function showResult(markdown, badge) {
  hide('emptyState'); hide('loadingState'); hide('errorState');
  const words = markdown.trim().split(/\s+/).length;
  document.getElementById('resultBadge').textContent = badge;
  document.getElementById('resultStats').textContent = `${words.toLocaleString()} words`;
  document.getElementById('resultBody').innerHTML    = renderMarkdown(markdown);
  showBlock('resultArea');
  setActions(true);
  setChatVisible(true);

  // Show mobile chat panel
  const mcp = document.getElementById('mobileChatPanel');
  if (mcp) mcp.classList.add('visible');
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
  setActions(false);
  setChatVisible(false);
  const mcp = document.getElementById('mobileChatPanel');
  if (mcp) mcp.classList.remove('visible');
  clearChat();
  lastOutput = '';
}

function setActions(visible) {
  const el = document.getElementById('headerActions');
  el.style.opacity      = visible ? '1' : '0';
  el.style.pointerEvents = visible ? 'auto' : 'none';
}

function setChatVisible(visible) {
  const cs = document.getElementById('chatSidebar');
  if (cs) {
    cs.style.opacity      = visible ? '1' : '0';
    cs.style.pointerEvents = visible ? 'auto' : 'none';
  }
}

function hide(id)      { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function showFlex(id)  { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
function showBlock(id) { const el = document.getElementById(id); if (el) el.style.display = 'block'; }

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
  const slug = document.getElementById('topicInput').value.trim().slice(0,40).replace(/\s+/g,'-') || 'research';
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
