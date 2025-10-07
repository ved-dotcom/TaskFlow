// app.js — Resilient TaskFlow frontend (vanilla JS + Firestore)
// Paste/overwrite this as app.js in your repo.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- FIREBASE CONFIG ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyCt3MkuMExKqg8J3BRm60Sf5RZWJZUjrpQ",
  authDomain: "taskflow-22167.firebaseapp.com",
  projectId: "taskflow-22167",
  storageBucket: "taskflow-22167.firebasestorage.app",
  messagingSenderId: "485747269063",
  appId: "1:485747269063:web:1924481b201b0f1d804de2",
  measurementId: "G-D2HQ4YVXL9"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ---------- Safe DOM helpers ---------- */
const $id = (id) => document.getElementById(id) || null;
const has = (el) => !!el;

/* ---------- DOM references (may be null depending on HTML) ---------- */
const loginView = $id('login-view');
const appView = $id('app-view');

const loginUsername = $id('login-username');
const loginPassword = $id('login-password');
const loginBtn = $id('login-btn');
const registerBtn = $id('register-btn');
const logoutBtn = $id('logout-btn');

const navDashboard = $id('nav-dashboard');
const navGroups = $id('nav-groups');
const navAdmin = $id('nav-admin');
const navProfile = $id('nav-profile');

const dashboardView = $id('dashboard-view');
const groupsView = $id('groups-view');
const groupChatView = $id('group-chat-view');
const adminView = $id('admin-view');
const profileView = $id('profile-view');

const groupsCol = $id('groups-col');
const tasksCol = $id('tasks-col');
const mentionsCol = $id('mentions-col');

const groupsList = $id('groups-list');
const createGroupBtn = $id('create-group-btn');

const chatMessages = $id('chat-messages');
const chatInput = $id('chat-input');
const mentionSelect = $id('mention-select');
const sendMsgBtn = $id('send-msg');
const backToGroups = $id('back-to-groups');
const chatGroupName = $id('chat-group-name');
const chatMembersCount = $id('chat-members-count');

const pendingList = $id('pending-list');
const userManagement = $id('user-management');

const profileUsername = $id('profile-username');
const profileRole = $id('profile-role');

const modalCreateGroup = $id('modal-create-group');
const groupNameInput = $id('group-name');
const membersCheckboxes = $id('members-checkboxes');
const adminsCheckboxes = $id('admins-checkboxes');
const createGroupConfirm = $id('create-group-confirm');
const createGroupCancel = $id('create-group-cancel');

const modalCreateTask = $id('modal-create-task');
const taskTitle = $id('task-title');
const taskDesc = $id('task-desc');
const taskAssignTo = $id('task-assign-to');
const taskGroup = $id('task-group');
const taskPrivate = $id('task-private');
const createTaskConfirm = $id('create-task-confirm');
const createTaskCancel = $id('create-task-cancel');

const newDmBtn = $id('new-dm-btn');
const modalCreateDM = $id('modal-create-dm');
const dmUserSelect = $id('dm-user-select');
const createDMConfirm = $id('create-dm-confirm');
const createDMCancel = $id('create-dm-cancel');

const modalReply = $id('modal-reply');
const replyToMessageContent = $id('reply-to-message-content');
const replyForm = $id('reply-form');
const replyInput = $id('reply-input');
const replyCancel = $id('cancel-reply-btn');

const showCompletedBtn = $id('show-completed');
const showArchivedBtn = $id('show-archived');

const refreshBtn = $id('refresh-btn');

/* ---------- App state ---------- */
let currentUser = null;
let currentGroup = null;
let replyTarget = null;
const users = {}, groups = {}, tasks = {}, messages = {};
let unsub = { users: null, groups: null, tasks: null, messages: null };

/* ---------- Small helpers ---------- */
const isAdminOrDirector = () => currentUser && (currentUser.role === 'admin' || currentUser.role === 'director');
const isDirector = () => currentUser && currentUser.role === 'director';

function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).substr(2, 9);
}

function safeSetText(el, text) {
  if (!el) return;
  el.textContent = text;
}

/* ---------- View switching ---------- */
function clearViews() {
  [dashboardView, groupsView, groupChatView, adminView, profileView].forEach(v => v && v.classList && v.classList.remove('active'));
}
function showView(view) {
  clearViews();
  if (view === 'login') {
    if (loginView) loginView.classList.add('active');
    if (appView) appView.classList.remove('active');
  } else {
    if (appView) appView.classList.add('active');
    if (loginView) loginView.classList.remove('active');
    if (view === 'dashboard' && dashboardView) dashboardView.classList.add('active');
    if (view === 'groups' && groupsView) groupsView.classList.add('active');
    if (view === 'groupChat' && groupChatView) groupChatView.classList.add('active');
    if (view === 'admin' && adminView) adminView.classList.add('active');
    if (view === 'profile' && profileView) profileView.classList.add('active');
  }

  if (navAdmin) {
    if (isAdminOrDirector()) navAdmin.classList.remove('hidden');
    else navAdmin.classList.add('hidden');
  }
  if (createGroupBtn) createGroupBtn.classList.toggle('hidden', !isAdminOrDirector());
}

/* ---------- Firestore real-time listeners ---------- */
function startListeners() {
  if (unsub.users) return; // already listening
  try {
    unsub.users = onSnapshot(collection(db, 'users'), snap => {
      snap.forEach(d => users[d.id] = { id: d.id, ...d.data() });
      renderPendingUsers();
      renderUserManagement();
      renderProfile();
    });
    unsub.groups = onSnapshot(collection(db, 'groups'), snap => {
      snap.forEach(d => groups[d.id] = { id: d.id, ...d.data() });
      renderGroupsList();
      renderDashboardGroups();
      if (currentGroup && groups[currentGroup.id]) {
        currentGroup = { id: currentGroup.id, ...groups[currentGroup.id] };
        safeSetText(chatGroupName, currentGroup.name || '');
        if (chatMembersCount) chatMembersCount.textContent = `${(currentGroup.members || []).length} members`;
        populateMentionSelect();
      }
    });
    unsub.tasks = onSnapshot(collection(db, 'tasks'), snap => {
      snap.forEach(d => tasks[d.id] = { id: d.id, ...d.data() });
      renderDashboardTasks();
    });
    unsub.messages = onSnapshot(collection(db, 'messages'), snap => {
      snap.forEach(d => messages[d.id] = { id: d.id, ...d.data() });
      if (currentGroup) renderChat(currentGroup.id);
      renderMentionsColumn();
    });
  } catch (e) {
    console.warn('startListeners error', e);
  }
}

/* ---------- Auto-archive old completed tasks (background) ---------- */
async function autoArchiveOldTasks() {
  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const q = await getDocs(collection(db, 'tasks'));
    for (const d of q.docs) {
      const t = d.data();
      if (t.status === 'completed' && !t.archived && t.completedAt) {
        const ts = new Date(t.completedAt).getTime();
        if (ts < sevenDaysAgo) {
          await updateDoc(doc(db, 'tasks', d.id), { archived: true });
        }
      }
    }
  } catch (e) {
    console.error('autoArchive failed', e);
  }
}

/* ---------- Render helpers ---------- */
function renderProfile() {
  if (!currentUser) return;
  if (profileUsername) profileUsername.textContent = currentUser.username || '';
  if (profileRole) profileRole.textContent = currentUser.role || '';
}

/* Dashboard: Groups column */
function renderDashboardGroups() {
  if (!groupsCol) return;
  groupsCol.innerHTML = '';
  if (!currentUser) {
    groupsCol.innerHTML = '<p class="muted">Login to see groups.</p>';
    return;
  }
  const myGroups = Object.values(groups).filter(g => (g.members || []).includes(currentUser.id));
  if (myGroups.length === 0) {
    groupsCol.innerHTML = '<p class="muted">No groups.</p>';
    return;
  }
  myGroups.forEach(g => {
    const el = document.createElement('div');
    el.className = 'card';
    const adminsNames = (g.admins || []).map(a => users[a]?.username || a).join(', ');
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${g.name}</strong><div class="muted">Admins: ${adminsNames}</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn--outline small" data-open="${g.id}">Open</button>
        ${(isDirector() ? `<button class="btn btn--danger small" data-delete="${g.id}">Delete</button>` : '')}
      </div>
    </div>`;
    const openBtn = el.querySelector('[data-open]');
    if (openBtn) openBtn.onclick = () => openGroup(g.id);
    const delBtn = el.querySelector('[data-delete]');
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm(`Delete group "${g.name}"? This will remove its messages and tasks.`)) return;
      try {
        const msgs = await getDocs(query(collection(db, 'messages'), where('groupId', '==', g.id)));
        for (const m of msgs.docs) await deleteDoc(doc(db, 'messages', m.id));
        const ts = await getDocs(query(collection(db, 'tasks'), where('groupId', '==', g.id)));
        for (const t of ts.docs) await deleteDoc(doc(db, 'tasks', t.id));
        await deleteDoc(doc(db, 'groups', g.id));
        alert('Group deleted.');
      } catch (e) {
        console.error(e);
        alert('Delete failed.');
      }
    };
    groupsCol.appendChild(el);
  });
}

/* Dashboard: Tasks column */
function renderDashboardTasks() {
  if (!tasksCol) return;
  tasksCol.innerHTML = '';
  if (!currentUser) {
    tasksCol.innerHTML = '<p class="muted">Login to see tasks.</p>';
    return;
  }
  const myTasks = Object.values(tasks).filter(t => t.assignedTo === currentUser.id);
  const active = myTasks.filter(t => !t.archived && t.status !== 'completed');
  const completed = myTasks.filter(t => !t.archived && t.status === 'completed');

  if (active.length === 0) tasksCol.innerHTML = '<p class="muted">No active tasks.</p>';
  active.forEach(t => {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<div><strong>${t.title}</strong><div class="muted">${t.priority||'medium'} • ${t.groupId ? ('Group: ' + (groups[t.groupId]?.name || t.groupId)) : 'Personal'}</div></div>
      <div style="margin-top:8px">${t.description||''}</div>`;
    const actions = document.createElement('div'); actions.style.marginTop = '8px';
    const mark = document.createElement('button'); mark.className = 'btn btn--primary small'; mark.textContent = 'Mark Completed';
    mark.onclick = async () => {
      try {
        await updateDoc(doc(db, 'tasks', t.id), { status: 'completed', completedAt: new Date().toISOString() });
        alert('Task marked completed.');
      } catch (e) {
        console.error(e);
        alert('Failed to mark completed.');
      }
    };
    actions.appendChild(mark);
    el.appendChild(actions);
    tasksCol.appendChild(el);
  });

  if (completed.length) {
    const hdr = document.createElement('div'); hdr.className = 'card'; hdr.innerHTML = '<strong>Recently Completed</strong>';
    tasksCol.appendChild(hdr);
    completed.forEach(t => {
      const el = document.createElement('div'); el.className = 'card';
      el.innerHTML = `<div><strong>${t.title}</strong><div class="muted">Completed: ${t.completedAt ? new Date(t.completedAt).toLocaleString() : ''}</div></div>
        <div style="margin-top:8px">${t.description||''}</div>`;
      const actions = document.createElement('div'); actions.style.marginTop = '8px';
      const undo = document.createElement('button'); undo.className = 'btn btn--outline small'; undo.textContent = 'Undo';
      undo.onclick = async () => {
        try {
          await updateDoc(doc(db, 'tasks', t.id), { status: 'in-progress', completedAt: null });
          alert('Task restored.');
        } catch (e) { alert('Failed to restore.'); }
      };
      actions.appendChild(undo);
      if (isAdminOrDirector()) {
        const del = document.createElement('button'); del.className = 'btn btn--danger small'; del.textContent = 'Delete';
        del.onclick = async () => {
          if (!confirm('Delete permanently?')) return;
          try { await deleteDoc(doc(db, 'tasks', t.id)); alert('Deleted'); } catch(e){ alert('Delete failed'); }
        };
        actions.appendChild(del);
      }
      el.appendChild(actions);
      tasksCol.appendChild(el);
    });
  }
}

/* Mentions column */
function renderMentionsColumn() {
  if (!mentionsCol) return;
  mentionsCol.innerHTML = '';
  if (!currentUser) {
    mentionsCol.innerHTML = '<p class="muted">Login to see mentions.</p>';
    return;
  }
  const m = Object.values(messages).filter(msg => Array.isArray(msg.mentions) && msg.mentions.includes(currentUser.id));
  if (m.length === 0) {
    mentionsCol.innerHTML = '<p class="muted">No mentions.</p>';
    return;
  }
  m.sort((a, b) => new Date(b.timestamp||0) - new Date(a.timestamp||0));
  m.forEach(msg => {
    const el = document.createElement('div'); el.className = 'card';
    const from = users[msg.userId]?.username || msg.userId;
    el.innerHTML = `<div><strong>${from}</strong><div class="muted">${msg.groupId ? ('in ' + (groups[msg.groupId]?.name || msg.groupId)) : 'Direct'}</div></div>
      <div style="margin-top:8px">${msg.content}</div>
      <div class="muted" style="margin-top:6px">${new Date(msg.timestamp||'').toLocaleString()}</div>`;
    mentionsCol.appendChild(el);
  });
}

/* Groups list (detailed) */
function renderGroupsList() {
  if (!groupsList) return;
  groupsList.innerHTML = '';
  if (!currentUser) {
    groupsList.innerHTML = '<p class="muted">Login to see groups.</p>';
    return;
  }
  const my = Object.values(groups).filter(g => (g.members || []).includes(currentUser.id));
  if (my.length === 0) { groupsList.innerHTML = '<p class="muted">No groups.</p>'; return; }
  my.forEach(g => {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${g.name}</strong><div class="muted">Members: ${(g.members||[]).map(id => users[id]?.username || id).join(', ')}</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn--outline small" data-open="${g.id}">Open</button>
        ${(isAdminOrDirector() && (g.admins||[]).includes(currentUser.id) ? `<button class="btn btn--danger small" data-delete="${g.id}">Delete</button>` : '')}
      </div>
    </div>`;
    const openBtn = el.querySelector('[data-open]');
    if (openBtn) openBtn.onclick = () => openGroup(g.id);
    const delBtn = el.querySelector('[data-delete]');
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm(`Delete group "${g.name}"? This will remove messages & tasks.`)) return;
      try {
        const msgs = await getDocs(query(collection(db, 'messages'), where('groupId', '==', g.id)));
        for (const m of msgs.docs) await deleteDoc(doc(db, 'messages', m.id));
        const ts = await getDocs(query(collection(db, 'tasks'), where('groupId', '==', g.id)));
        for (const t of ts.docs) await deleteDoc(doc(db, 'tasks', t.id));
        await deleteDoc(doc(db, 'groups', g.id));
        alert('Deleted.');
      } catch (e) { console.error(e); alert('Delete failed'); }
    };
    groupsList.appendChild(el);
  });
}

/* Mention select population (members only) */
function populateMentionSelect() {
  if (!mentionSelect || !currentGroup) return;
  mentionSelect.innerHTML = '';
  const list = (currentGroup.members || []).map(id => ({ id, name: users[id]?.username || id }));
  list.forEach(m => {
    const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.name; mentionSelect.appendChild(opt);
  });
}

/* Chat rendering (threaded replies) */
function renderChat(groupId) {
  if (!chatMessages) return;
  chatMessages.innerHTML = '';
  const msgs = Object.values(messages).filter(m => m.groupId === groupId).sort((a, b) => new Date(a.timestamp||0) - new Date(b.timestamp||0));
  const children = {};
  msgs.forEach(m => { children[m.id] = children[m.id] || []; });
  msgs.forEach(m => { if (m.parentMessageId) children[m.parentMessageId] = children[m.parentMessageId] || [], children[m.parentMessageId].push(m); });

  function renderMessage(m, container) {
    const div = document.createElement('div'); div.className = 'message';
    const name = users[m.userId]?.username || m.userId;
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${name} • ${new Date(m.timestamp||'').toLocaleString()}`;
    div.appendChild(meta);
    const content = document.createElement('div'); content.textContent = m.content; div.appendChild(content);
    if (Array.isArray(m.mentions) && m.mentions.length) {
      const mm = document.createElement('div'); mm.className = 'muted'; mm.textContent = 'Mentioned: ' + m.mentions.map(id => users[id]?.username || id).join(', ');
      div.appendChild(mm);
    }
    const actions = document.createElement('div'); actions.style.marginTop = '8px'; actions.style.display = 'flex'; actions.style.gap = '8px';
    const replyBtn = document.createElement('button'); replyBtn.className = 'btn btn--outline small'; replyBtn.textContent = 'Reply';
    replyBtn.onclick = () => {
      replyTarget = m;
      if (replyToMessageContent) replyToMessageContent.textContent = m.content;
      if (modalReply) modalReply.classList.remove('hidden');
    };
    actions.appendChild(replyBtn);
    div.appendChild(actions);
    container.appendChild(div);

    const ch = children[m.id] || [];
    if (ch.length) {
      const thread = document.createElement('div'); thread.className = 'thread';
      ch.sort((a,b) => new Date(a.timestamp||0) - new Date(b.timestamp||0));
      ch.forEach(c => renderMessage(c, thread));
      container.appendChild(thread);
    }
  }

  msgs.filter(m => !m.parentMessageId).forEach(m => renderMessage(m, chatMessages));
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ---------- Admin / Pending / User Management ---------- */
function renderPendingUsers() {
  if (!pendingList) return;
  pendingList.innerHTML = '';
  if (!isDirector()) {
    pendingList.innerHTML = '<p class="muted">Only director can see pending approvals.</p>';
    return;
  }
  const pending = Object.values(users).filter(u => u.status === 'pending');
  if (pending.length === 0) { pendingList.innerHTML = '<p class="muted">No pending users.</p>'; return; }
  pending.forEach(u => {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${u.username}</strong><div class="muted">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ''}</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn--primary small" data-id="${u.id}">Approve</button>
        <button class="btn btn--danger small" data-id="${u.id}">Remove</button>
      </div>
    </div>`;
    el.querySelector('.btn--primary').onclick = async () => {
      try { await updateDoc(doc(db, 'users', u.id), { status: 'active' }); alert('Approved'); } catch(e){ alert('Failed'); }
    };
    el.querySelector('.btn--danger').onclick = async () => {
      if (!confirm('Remove user?')) return;
      try { await deleteDoc(doc(db, 'users', u.id)); alert('Removed'); } catch(e){ alert('Failed'); }
    };
    pendingList.appendChild(el);
  });
}

function renderUserManagement() {
  if (!userManagement) return;
  userManagement.innerHTML = '';
  if (!isDirector()) { userManagement.innerHTML = '<p class="muted">Only director can manage users.</p>'; return; }
  const activeUsers = Object.values(users).filter(u => u.status === 'active');
  if (activeUsers.length === 0) { userManagement.innerHTML = '<p class="muted">No users.</p>'; return; }
  activeUsers.forEach(u => {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${u.username}</strong><div class="muted">Role: ${u.role}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn--outline small set-user" data-id="${u.id}">User</button>
        <button class="btn btn--outline small set-admin" data-id="${u.id}">Admin</button>
        <button class="btn btn--outline small set-dir" data-id="${u.id}">Director</button>
        <button class="btn btn--danger small remove-user" data-id="${u.id}">Remove</button>
      </div>
    </div>`;
    el.querySelector('.set-user').onclick = () => changeRole(u.id, 'user');
    el.querySelector('.set-admin').onclick = () => changeRole(u.id, 'admin');
    el.querySelector('.set-dir').onclick = () => changeRole(u.id, 'director');
    el.querySelector('.remove-user').onclick = async () => {
      if (!confirm('Remove user?')) return;
      try { await deleteUser(u.id); alert('Removed'); } catch(e){ alert('Failed'); }
    };
    userManagement.appendChild(el);
  });
}

async function changeRole(uid, role) {
  if (!isDirector()) return alert('Only director');
  try { await updateDoc(doc(db, 'users', uid), { role }); alert('Role updated'); } catch(e){ alert('Failed'); }
}

/* ---------- Actions: login / register / logout ---------- */
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const uname = (loginUsername && loginUsername.value || '').trim();
    const pass = (loginPassword && loginPassword.value || '').trim();
    if (!uname || !pass) return alert('Enter username/password');
    try {
      const q = query(collection(db, 'users'), where('username', '==', uname));
      const snap = await getDocs(q);
      if (snap.empty) return alert('Invalid credentials');
      let found = null;
      snap.forEach(d => {
        const data = d.data();
        if (data.password === pass) found = { id: d.id, ...d.data() };
      });
      if (!found) return alert('Invalid credentials');
      if (found.status !== 'active') return alert('User not active. Wait for approval.');
      currentUser = found;

      // start listeners and load current data
      startListeners();
      const [us, gs, ts, ms] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'groups')),
        getDocs(collection(db, 'tasks')),
        getDocs(collection(db, 'messages'))
      ]);
      us.forEach(d => users[d.id] = { id: d.id, ...d.data() });
      gs.forEach(d => groups[d.id] = { id: d.id, ...d.data() });
      ts.forEach(d => tasks[d.id] = { id: d.id, ...d.data() });
      ms.forEach(d => messages[d.id] = { id: d.id, ...d.data() });

      // background housekeeping
      autoArchiveOldTasks();

      // show dashboard
      showView('dashboard');
      renderProfile();
      renderDashboardGroups();
      renderDashboardTasks();
      renderMentionsColumn();
    } catch (e) {
      console.error(e);
      alert('Login failed.');
    }
  });
}

/* register button optional, if present */
if (registerBtn) {
  registerBtn.addEventListener('click', async () => {
    const name = prompt('Choose a username (no spaces)');
    if (!name) return;
    const pass = prompt('Choose a password');
    if (!pass) return;
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('username', '==', name)));
      if (!snap.empty) return alert('Username taken');
      await addDoc(collection(db, 'users'), { username: name, password: pass, role: 'user', status: 'pending', groups: [], createdAt: new Date().toISOString() });
      alert('Registered — wait for director approval.');
    } catch (e) {
      console.error(e);
      alert('Register failed');
    }
  });
}

/* logout */
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    try {
      Object.values(unsub).forEach(u => { if (u) u(); });
      unsub = { users: null, groups: null, tasks: null, messages: null };
    } catch (e) { /* ignore */ }
    currentUser = null;
    currentGroup = null;
    showView('login');
  });
}

/* Nav buttons (if present) */
if (navDashboard) navDashboard.addEventListener('click', () => { showView('dashboard'); renderDashboardGroups(); renderDashboardTasks(); renderMentionsColumn(); });
if (navGroups) navGroups.addEventListener('click', () => { showView('groups'); renderGroupsList(); });
if (navAdmin) navAdmin.addEventListener('click', () => { showView('admin'); renderPendingUsers(); renderUserManagement(); });
if (navProfile) navProfile.addEventListener('click', () => { showView('profile'); renderProfile(); });

/* Create group: show modal, populate members/admins */
if (createGroupBtn) {
  createGroupBtn.addEventListener('click', () => {
    if (!isAdminOrDirector()) return alert('Only admins/directors can create groups.');
    if (membersCheckboxes) membersCheckboxes.innerHTML = '';
    if (adminsCheckboxes) adminsCheckboxes.innerHTML = '';
    Object.values(users).filter(u => u.status === 'active').forEach(u => {
      if (membersCheckboxes) {
        const div = document.createElement('div');
        div.innerHTML = `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" value="${u.id}" /> <span>${u.username}</span></label>`;
        membersCheckboxes.appendChild(div);
      }
      if (adminsCheckboxes) {
        const div2 = document.createElement('div');
        div2.innerHTML = `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" value="${u.id}" /> <span>${u.username}</span></label>`;
        adminsCheckboxes.appendChild(div2);
      }
    });
    if (groupNameInput) groupNameInput.value = '';
    if (modalCreateGroup) modalCreateGroup.classList.remove('hidden');
  });
}
if (createGroupCancel) createGroupCancel.addEventListener('click', () => modalCreateGroup && modalCreateGroup.classList.add('hidden'));
if (createGroupConfirm) {
  createGroupConfirm.addEventListener('click', async () => {
    if (!groupNameInput) return alert('Missing inputs');
    const name = groupNameInput.value.trim();
    if (!name) return alert('Group name required');
    const memberIds = membersCheckboxes ? Array.from(membersCheckboxes.querySelectorAll('input:checked')).map(i => i.value) : [];
    const adminIds = adminsCheckboxes ? Array.from(adminsCheckboxes.querySelectorAll('input:checked')).map(i => i.value) : [];
    if (adminIds.length === 0) return alert('Select at least one admin');
    try {
      const gRef = await addDoc(collection(db, 'groups'), { name, members: memberIds, admins: adminIds, type: 'team', createdAt: new Date().toISOString() });
      for (const uid of memberIds) {
        try {
          const uref = doc(db, 'users', uid);
          const ud = await getDoc(uref);
          if (ud.exists()) {
            const dat = ud.data();
            const arr = dat.groups || [];
            if (!arr.includes(gRef.id)) await updateDoc(uref, { groups: [...arr, gRef.id] });
          }
        } catch (e) { console.warn('user update failed', e); }
      }
      alert('Group created.');
      if (modalCreateGroup) modalCreateGroup.classList.add('hidden');
    } catch (e) {
      console.error(e);
      alert('Create group failed.');
    }
  });
}

/* Create task (modal) */
if (has($id('create-task-btn')) && has(modalCreateTask)) {
  $id('create-task-btn').addEventListener('click', () => {
    if (!taskAssignTo) return;
    taskAssignTo.innerHTML = '';
    Object.values(users).filter(u => u.status === 'active').forEach(u => {
      const opt = document.createElement('option'); opt.value = u.id; opt.textContent = u.username; taskAssignTo.appendChild(opt);
    });
    taskGroup.innerHTML = '<option value="">(no group - personal)</option>';
    Object.values(groups).filter(g => (g.members || []).includes(currentUser.id)).forEach(g => {
      const opt = document.createElement('option'); opt.value = g.id; opt.textContent = g.name; taskGroup.appendChild(opt);
    });
    taskTitle.value = ''; taskDesc.value = ''; taskPrivate.checked = false;
    modalCreateTask.classList.remove('hidden');
  });

  if (createTaskCancel) createTaskCancel.addEventListener('click', () => modalCreateTask.classList.add('hidden'));
  if (createTaskConfirm) {
    createTaskConfirm.addEventListener('click', async () => {
      const title = taskTitle.value.trim(); const description = taskDesc.value.trim();
      const assignedTo = taskAssignTo.value; const groupId = taskGroup.value || null;
      const isPrivate = taskPrivate.checked;
      if (!title || !assignedTo) return alert('Fill required fields');
      try {
        const data = { title, description, assignedBy: currentUser.id, assignedTo, status: 'in-progress', priority: 'medium', dueDate: null, groupId: isPrivate ? null : groupId, private: !!isPrivate, archived: false, createdAt: new Date().toISOString() };
        const tref = await addDoc(collection(db, 'tasks'), data);
        if (!isPrivate && groupId) {
          await addDoc(collection(db, 'messages'), { groupId, userId: currentUser.id, content: `Task assigned: ${title}`, type: 'task-assignment', parentMessageId: null, taskId: tref.id, timestamp: new Date().toISOString() });
        } else {
          await addDoc(collection(db, 'messages'), { groupId: null, userId: currentUser.id, content: `Private task assigned to ${users[assignedTo]?.username || assignedTo}: ${title}`, type: 'private-task', parentMessageId: null, taskId: tref.id, timestamp: new Date().toISOString(), mentions: [assignedTo] });
        }
        alert('Task created.');
        modalCreateTask.classList.add('hidden');
      } catch (e) { console.error(e); alert('Create task failed'); }
    });
  }
}

/* Create DM between two users */
if (newDmBtn) {
  newDmBtn.addEventListener('click', () => {
    if (!dmUserSelect) return;
    dmUserSelect.innerHTML = '';
    Object.values(users).filter(u => u.status === 'active' && u.id !== currentUser.id).forEach(u => {
      const opt = document.createElement('option'); opt.value = u.id; opt.textContent = u.username; dmUserSelect.appendChild(opt);
    });
    if (modalCreateDM) modalCreateDM.classList.remove('hidden');
  });
}
if (createDMCancel) createDMCancel.addEventListener('click', () => modalCreateDM && modalCreateDM.classList.add('hidden'));
if (createDMConfirm) createDMConfirm.addEventListener('click', async () => {
  const other = dmUserSelect && dmUserSelect.value;
  if (!other) return alert('Select a user');
  try {
    const existing = Object.values(groups).find(g => g.type === 'dm' && (g.members || []).includes(currentUser.id) && (g.members || []).includes(other));
    if (existing) {
      modalCreateDM && modalCreateDM.classList.add('hidden');
      openGroup(existing.id);
      return;
    }
    const name = `DM: ${users[other]?.username || other}`;
    const gref = await addDoc(collection(db, 'groups'), { name, members: [currentUser.id, other], admins: [], type: 'dm', createdAt: new Date().toISOString() });
    modalCreateDM && modalCreateDM.classList.add('hidden');
    openGroup(gref.id);
  } catch (e) { console.error(e); alert('Create DM failed'); }
});

/* Send message & reply */
if (sendMsgBtn) sendMsgBtn.addEventListener('click', async () => {
  if (!currentGroup) return alert('Open a group first');
  const text = chatInput && chatInput.value.trim();
  if (!text) return;
  const mentions = mentionSelect ? Array.from(mentionSelect.selectedOptions).map(o => o.value) : [];
  try {
    await addDoc(collection(db, 'messages'), { groupId: currentGroup.type === 'dm' ? currentGroup.id : currentGroup.id, userId: currentUser.id, content: text, type: 'message', parentMessageId: null, taskId: null, timestamp: new Date().toISOString(), mentions });
    if (chatInput) chatInput.value = '';
    if (mentionSelect) mentionSelect.selectedIndex = -1;
  } catch (e) { console.error(e); alert('Send failed'); }
});

if (replyForm) {
  replyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const replyContent = replyInput && replyInput.value.trim();
    if (!replyContent || !replyTarget) return;
    try {
      await addDoc(collection(db, 'messages'), { groupId: replyTarget.groupId, userId: currentUser.id, content: replyContent, type: 'message', parentMessageId: replyTarget.id, taskId: null, timestamp: new Date().toISOString() });
      replyInput.value = '';
      replyTarget = null;
      modalReply && modalReply.classList.add('hidden');
    } catch (err) { console.error(err); alert('Reply failed'); }
  });
}
if (replyCancel) replyCancel.addEventListener('click', () => { replyTarget = null; modalReply && modalReply.classList.add('hidden'); });

/* Open group with access control */
async function openGroup(groupId) {
  const gData = groups[groupId] || null;
  let g = null;
  if (gData) g = gData;
  else {
    try { const snap = await getDoc(doc(db, 'groups', groupId)); if (snap.exists()) g = { id: snap.id, ...snap.data() }; } catch (e) { console.error(e); }
  }
  if (!g) return alert('Group not found');
  if (!g.members || !g.members.includes(currentUser.id)) return alert('Access denied — not a member');
  currentGroup = { id: groupId, ...g };
  safeSetText(chatGroupName, currentGroup.name || '');
  if (chatMembersCount) chatMembersCount.textContent = `${(currentGroup.members || []).length} members`;
  showView('groupChat');
  populateMentionSelect();
  renderChat(groupId);
}
if (backToGroups) backToGroups.addEventListener('click', () => { currentGroup = null; showView('groups'); });

/* Delete user (director only) */
async function deleteUser(uid) {
  if (!isDirector()) return alert('Only director can remove users');
  if (!confirm('Really delete user and remove from groups/tasks?')) return;
  try {
    const groupIds = Object.values(groups).filter(g => (g.members || []).includes(uid)).map(g => g.id);
    for (const gid of groupIds) {
      const g = groups[gid];
      if (g.type === 'dm') {
        const msgs = await getDocs(query(collection(db, 'messages'), where('groupId', '==', gid)));
        for (const m of msgs.docs) await deleteDoc(doc(db, 'messages', m.id));
        await deleteDoc(doc(db, 'groups', gid));
      } else {
        const m = (g.members || []).filter(x => x !== uid);
        const a = (g.admins || []).filter(x => x !== uid);
        await updateDoc(doc(db, 'groups', gid), { members: m, admins: a });
      }
    }
    const ts = await getDocs(query(collection(db, 'tasks'), where('assignedTo', '==', uid)));
    for (const t of ts.docs) await updateDoc(doc(db, 'tasks', t.id), { assignedTo: null });
    await deleteDoc(doc(db, 'users', uid));
  } catch (e) {
    console.error('deleteUser failed', e);
    throw e;
  }
}

/* Refresh button (if present) */
if (refreshBtn) refreshBtn.addEventListener('click', () => {
  renderDashboardGroups();
  renderDashboardTasks();
  renderMentionsColumn();
  if (currentGroup) renderChat(currentGroup.id);
});

/* convenient Enter-to-login if password input present */
if (loginPassword) loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter' && loginBtn) loginBtn.click(); });

/* Debug API for console (small) */
window._tf_app = {
  getState: () => ({
    currentUser: currentUser ? { id: currentUser.id ?? currentUser.username, username: currentUser.username, role: currentUser.role, status: currentUser.status } : null,
    counts: { users: Object.keys(users).length, groups: Object.keys(groups).length, tasks: Object.keys(tasks).length, messages: Object.keys(messages).length },
    currentGroup: currentGroup ? { id: currentGroup.id, name: currentGroup.name } : null,
    listenersActive: !!(unsub.users || unsub.groups || unsub.tasks || unsub.messages)
  }),
  startListeners: () => { try { startListeners(); return { ok: true }; } catch (e) { return { ok: false, error: String(e) }; } }
};

/* Initial: show login screen */
showView('login');
