// ==================================================================
// إعداد أولي
// ==================================================================
const STORAGE_CONVOS = 'yara_conversations_v2';
const STORAGE_ACTIVE = 'yara_active_conv_v2';
const STORAGE_THEME = 'yara_theme';

const THEMES = [
  { id: 'pink-night',     name: 'ليلة وردية',    color: '#ff6fa8' },
  { id: 'lavender-dream', name: 'أحلام لافندر',  color: '#b98ee0' },
  { id: 'sunset-glow',    name: 'غروب دافئ',     color: '#ff7043' },
  { id: 'ocean-calm',     name: 'محيط هادئ',     color: '#2fa9ba' },
  { id: 'light-blossom',  name: 'تفتّح فاتح',    color: '#e8548f' },
  { id: 'midnight-mono',  name: 'كلاسيكي داكن',  color: '#8e8e93' },
];

let conversations = loadConversations();
let activeId = localStorage.getItem(STORAGE_ACTIVE);
let authRequired = false;
let currentAbort = null;

// ---------- عناصر DOM ----------
const appShell = document.getElementById('appShell');
const sky = document.getElementById('sky');
const convListEl = document.getElementById('convList');
const chatEl = document.getElementById('chat');
const composer = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const topbarTitle = document.getElementById('topbarTitle');
const newChatBtn = document.getElementById('newChatBtn');
const menuBtn = document.getElementById('menuBtn');
const collapseBtn = document.getElementById('collapseBtn');
const sidebarOverlay = document.getElementById('sidebarOverlay');

const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettings = document.getElementById('closeSettings');
const themeGrid = document.getElementById('themeGrid');
const exportBtn = document.getElementById('exportBtn');
const clearCurrentBtn = document.getElementById('clearCurrentBtn');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const logoutSection = document.getElementById('logoutSection');
const logoutBtn = document.getElementById('logoutBtn');

const confirmOverlay = document.getElementById('confirmOverlay');
const confirmText = document.getElementById('confirmText');
const confirmCancel = document.getElementById('confirmCancel');
const confirmOk = document.getElementById('confirmOk');
let pendingConfirm = null;

// ==================================================================
// النجوم المتلألئة
// ==================================================================
(function stars(){
  const count = window.innerWidth < 500 ? 40 : 70;
  for (let i = 0; i < count; i++){
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2 + 1;
    s.style.width = size + 'px';
    s.style.height = size + 'px';
    s.style.top = Math.random() * 100 + '%';
    s.style.left = Math.random() * 100 + '%';
    s.style.animationDelay = (Math.random() * 3.5) + 's';
    s.style.animationDuration = (2.5 + Math.random() * 3) + 's';
    sky.appendChild(s);
  }
})();

// ==================================================================
// الثيمات
// ==================================================================
function applyTheme(themeId){
  document.body.setAttribute('data-theme', themeId);
  localStorage.setItem(STORAGE_THEME, themeId);
  renderThemeGrid();
}

function renderThemeGrid(){
  const current = localStorage.getItem(STORAGE_THEME) || 'pink-night';
  themeGrid.innerHTML = '';
  THEMES.forEach(t => {
    const el = document.createElement('div');
    el.className = 'theme-swatch' + (t.id === current ? ' active' : '');
    el.innerHTML = `<div class="dot" style="background:${t.color}"></div><span>${t.name}</span>`;
    el.addEventListener('click', () => applyTheme(t.id));
    themeGrid.appendChild(el);
  });
}

(function initTheme(){
  const saved = localStorage.getItem(STORAGE_THEME) || 'pink-night';
  document.body.setAttribute('data-theme', saved);
})();

// ==================================================================
// إدارة المحادثات (localStorage)
// ==================================================================
function loadConversations(){
  try{
    const raw = localStorage.getItem(STORAGE_CONVOS);
    return raw ? JSON.parse(raw) : [];
  }catch{ return []; }
}

function saveConversations(){
  try{ localStorage.setItem(STORAGE_CONVOS, JSON.stringify(conversations)); }catch{}
}

function makeId(){
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function getActiveConv(){
  return conversations.find(c => c.id === activeId) || null;
}

function createConversation(select = true){
  const conv = { id: makeId(), title: 'محادثة جديدة', messages: [], updatedAt: Date.now() };
  conversations.unshift(conv);
  saveConversations();
  if (select) setActive(conv.id);
  renderSidebar();
  return conv;
}

function setActive(id){
  activeId = id;
  localStorage.setItem(STORAGE_ACTIVE, id);
  renderSidebar();
  renderChat();
  closeMobileSidebar();
}

function deleteConversation(id){
  conversations = conversations.filter(c => c.id !== id);
  saveConversations();
  if (activeId === id){
    if (conversations.length){
      setActive(conversations[0].id);
    } else {
      activeId = null;
      localStorage.removeItem(STORAGE_ACTIVE);
      renderSidebar();
      renderChat();
    }
  } else {
    renderSidebar();
  }
}

function titleFromText(text){
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 34 ? t.slice(0, 34) + '…' : (t || 'محادثة جديدة');
}

// ==================================================================
// عرض الشريط الجانبي
// ==================================================================
function renderSidebar(){
  convListEl.innerHTML = '';
  conversations
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach(conv => {
      const item = document.createElement('div');
      item.className = 'conv-item' + (conv.id === activeId ? ' active' : '');

      const title = document.createElement('span');
      title.className = 'conv-title';
      title.textContent = conv.title;

      const del = document.createElement('button');
      del.className = 'conv-delete';
      del.innerHTML = '✕';
      del.title = 'حذف المحادثة';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        askConfirm('حذف هذه المحادثة نهائيًا؟', () => deleteConversation(conv.id));
      });

      item.appendChild(title);
      item.appendChild(del);
      item.addEventListener('click', () => setActive(conv.id));
      convListEl.appendChild(item);
    });

  const active = getActiveConv();
  topbarTitle.textContent = active ? active.title : 'محادثة جديدة';
}

// ==================================================================
// عرض الدردشة
// ==================================================================
function renderChat(){
  chatEl.innerHTML = '';
  const conv = getActiveConv();

  if (!conv || conv.messages.length === 0){
    chatEl.innerHTML = `
      <div class="empty-state">
        <div class="moon-big">🌙</div>
        <h2>أهلًا، أنا يارا</h2>
        <p>احكيلي كيف يومك، أو أي شيء في بالك... أنا هنا أسمعك بلا حكم وبلا عجلة 💗</p>
      </div>`;
    return;
  }

  conv.messages.forEach((m, idx) => appendMessageRow(m.role, m.content, idx));
  scrollToBottom();
}

function appendMessageRow(role, text, msgIndex){
  const row = document.createElement('div');
  row.className = 'msg-row ' + (role === 'user' ? 'user' : 'yara');

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? '💗' : '🌙';

  const content = document.createElement('div');
  content.className = 'content';

  const roleName = document.createElement('div');
  roleName.className = 'role-name';
  roleName.textContent = role === 'user' ? 'أنتِ' : 'يارا';

  const textEl = document.createElement('div');
  textEl.className = 'text';
  textEl.textContent = text;

  content.appendChild(roleName);
  content.appendChild(textEl);

  if (role === 'assistant'){
    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.title = 'نسخ';
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 15V5a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(text).catch(() => {});
    });

    const regenBtn = document.createElement('button');
    regenBtn.title = 'إعادة توليد الرد';
    regenBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 4v6h6M20 20v-6h-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14a8 8 0 0 0 14 3M19 10A8 8 0 0 0 5 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    regenBtn.addEventListener('click', () => regenerateFrom(msgIndex));

    actions.appendChild(copyBtn);
    actions.appendChild(regenBtn);
    content.appendChild(actions);
  }

  row.appendChild(avatar);
  row.appendChild(content);
  chatEl.appendChild(row);
}

function appendTypingRow(){
  const row = document.createElement('div');
  row.className = 'msg-row yara typing-row';
  row.id = 'typingRow';
  row.innerHTML = `
    <div class="avatar">🌙</div>
    <div class="content">
      <div class="role-name">يارا</div>
      <div class="text"><span></span><span></span><span></span></div>
    </div>`;
  chatEl.appendChild(row);
  scrollToBottom();
}

function removeTypingRow(){
  document.getElementById('typingRow')?.remove();
}

function scrollToBottom(){
  requestAnimationFrame(() => { chatEl.scrollTop = chatEl.scrollHeight; });
}

// ==================================================================
// إرسال الرسائل
// ==================================================================
async function sendToApi(conv){
  currentAbort = new AbortController();
  try{
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conv.messages.map(m => ({ role: m.role, content: m.content })) }),
      signal: currentAbort.signal
    });
    const data = await res.json();

    if (res.status === 401){
      window.location.href = '/login';
      return null;
    }
    if (!res.ok){
      return { error: data.error || 'حدث خطأ، حاولي مرة أخرى 💭' };
    }
    return { reply: data.reply };
  }catch(err){
    if (err.name === 'AbortError') return { aborted: true };
    return { error: 'تعذر الاتصال بالسيرفر، تأكدي من اتصالك بالإنترنت 🌙' };
  }finally{
    currentAbort = null;
  }
}

composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  let conv = getActiveConv();
  if (!conv) conv = createConversation();

  if (conv.messages.length === 0) conv.title = titleFromText(text);
  conv.messages.push({ role: 'user', content: text });
  conv.updatedAt = Date.now();
  saveConversations();
  renderSidebar();
  renderChat();

  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;
  appendTypingRow();

  const result = await sendToApi(conv);
  removeTypingRow();

  if (result && !result.aborted){
    const replyText = result.error ? result.error : result.reply;
    conv.messages.push({ role: 'assistant', content: replyText });
    conv.updatedAt = Date.now();
    saveConversations();
    appendMessageRow('assistant', replyText, conv.messages.length - 1);
    scrollToBottom();
  }

  sendBtn.disabled = false;
  input.focus();
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    composer.requestSubmit();
  }
});

async function regenerateFrom(msgIndex){
  const conv = getActiveConv();
  if (!conv) return;
  // احذفي كل الرسائل بعد آخر رسالة مستخدمة قبل هذا الرد، ثم أعيدي الطلب
  const cutIndex = msgIndex; // فهرس رد يارا نفسه
  conv.messages = conv.messages.slice(0, cutIndex);
  saveConversations();
  renderChat();

  sendBtn.disabled = true;
  appendTypingRow();
  const result = await sendToApi(conv);
  removeTypingRow();

  if (result && !result.aborted){
    const replyText = result.error ? result.error : result.reply;
    conv.messages.push({ role: 'assistant', content: replyText });
    conv.updatedAt = Date.now();
    saveConversations();
    appendMessageRow('assistant', replyText, conv.messages.length - 1);
    scrollToBottom();
  }
  sendBtn.disabled = false;
}

// ==================================================================
// الشريط الجانبي: فتح/إغلاق على الجوال + طي على الشاشات الكبيرة
// ==================================================================
newChatBtn.addEventListener('click', () => {
  createConversation();
  renderChat();
  closeMobileSidebar();
  input.focus();
});

menuBtn?.addEventListener('click', () => appShell.classList.add('sidebar-open'));
sidebarOverlay?.addEventListener('click', closeMobileSidebar);
function closeMobileSidebar(){ appShell.classList.remove('sidebar-open'); }

collapseBtn?.addEventListener('click', () => appShell.classList.toggle('collapsed'));

// ==================================================================
// نافذة الإعدادات
// ==================================================================
settingsBtn.addEventListener('click', () => {
  renderThemeGrid();
  settingsOverlay.classList.add('open');
});
closeSettings.addEventListener('click', () => settingsOverlay.classList.remove('open'));
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) settingsOverlay.classList.remove('open'); });

exportBtn.addEventListener('click', () => {
  const conv = getActiveConv();
  if (!conv || conv.messages.length === 0){
    alert('لا توجد محادثة لتصديرها بعد.');
    return;
  }
  const lines = conv.messages.map(m => `${m.role === 'user' ? 'أنتِ' : 'يارا'}: ${m.content}`);
  const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${conv.title || 'محادثة'}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

clearCurrentBtn.addEventListener('click', () => {
  const conv = getActiveConv();
  if (!conv) return;
  askConfirm('حذف كل رسائل هذه المحادثة؟ لن يمكن التراجع.', () => {
    conv.messages = [];
    conv.title = 'محادثة جديدة';
    saveConversations();
    renderSidebar();
    renderChat();
    settingsOverlay.classList.remove('open');
  });
});

deleteAllBtn.addEventListener('click', () => {
  askConfirm('حذف كل المحادثات نهائيًا من هذا الجهاز؟ لا يمكن التراجع عن هذا الإجراء.', () => {
    conversations = [];
    activeId = null;
    saveConversations();
    localStorage.removeItem(STORAGE_ACTIVE);
    renderSidebar();
    renderChat();
    settingsOverlay.classList.remove('open');
  });
});

logoutBtn.addEventListener('click', async () => {
  try{ await fetch('/api/logout', { method: 'POST' }); }catch{}
  window.location.href = '/login';
});

// ==================================================================
// نافذة التأكيد العامة
// ==================================================================
function askConfirm(message, onConfirm){
  confirmText.textContent = message;
  pendingConfirm = onConfirm;
  confirmOverlay.classList.add('open');
}
confirmCancel.addEventListener('click', () => {
  confirmOverlay.classList.remove('open');
  pendingConfirm = null;
});
confirmOk.addEventListener('click', () => {
  confirmOverlay.classList.remove('open');
  if (pendingConfirm) pendingConfirm();
  pendingConfirm = null;
});
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay){ confirmOverlay.classList.remove('open'); pendingConfirm = null; }
});

// ==================================================================
// التشغيل الأولي
// ==================================================================
(async function init(){
  try{
    const res = await fetch('/api/health');
    const data = await res.json();
    authRequired = !!data.authRequired;
  }catch{}
  logoutSection.style.display = authRequired ? 'block' : 'none';

  if (!activeId || !getActiveConv()){
    if (conversations.length){
      activeId = conversations.slice().sort((a,b) => b.updatedAt - a.updatedAt)[0].id;
    }
  }
  renderSidebar();
  renderChat();
})();
