// app.js v1 - TaskFlow (vanilla JS, Firestore)
// READY-TO-UPLOAD VERSION (includes your firebaseConfig).
// Paste this file into your repo as app.js (no edits needed on iPad).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- FIREBASE CONFIG (your project) ---------- */
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

/* ---------- STATE ---------- */
let currentUser = null;
let currentGroup = null;
let replyTo = null;
const users = {}, groups = {}, tasks = {}, messages = {};
let unsub = { users:null, groups:null, tasks:null, messages:null };

/* ---------- DOM refs ---------- */
const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');

const navDashboard = document.getElementById('nav-dashboard');
const navGroups = document.getElementById('nav-groups');
const navAdmin = document.getElementById('nav-admin');
const navProfile = document.getElementById('nav-profile');

const dashboardView = document.getElementById('dashboard-view');
const groupsView = document.getElementById('groups-view');
const groupChatView = document.getElementById('group-chat-view');
const adminView = document.getElementById('admin-view');
const profileView = document.getElementById('profile-view');

const groupsCol = document.getElementById('groups-col');
const tasksCol = document.getElementById('tasks-col');
const mentionsCol = document.getElementById('mentions-col');

const createTaskBtn = document.getElementById('create-task-btn');
const refreshBtn = document.getElementById('refresh-btn');

const groupsList = document.getElementById('groups-list');
const createGroupBtn = document.getElementById('create-group-btn');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const mentionSelect = document.getElementById('mention-select');
const sendMsgBtn = document.getElementById('send-msg');
const backToGroups = document.getElementById('back-to-groups');
const chatGroupName = document.getElementById('chat-group-name');
const chatMembersCount = document.getElementById('chat-members-count');

const pendingList = document.getElementById('pending-list');
const userManagement = document.getElementById('user-management');

const profileUsername = document.getElementById('profile-username');
const profileRole = document.getElementById('profile-role');

const modalCreateGroup = document.getElementById('modal-create-group');
const groupNameInput = document.getElementById('group-name');
const membersBoxes = document.getElementById('members-checkboxes');
const adminsBoxes = document.getElementById('admins-checkboxes');
const createGroupConfirm = document.getElementById('create-group-confirm');
const createGroupCancel = document.getElementById('create-group-cancel');

const modalCreateTask = document.getElementById('modal-create-task');
const taskTitle = document.getElementById('task-title');
const taskDesc = document.getElementById('task-desc');
const taskAssignTo = document.getElementById('task-assign-to');
const taskGroup = document.getElementById('task-group');
const taskPrivate = document.getElementById('task-private');
const createTaskConfirm = document.getElementById('create-task-confirm');
const createTaskCancel = document.getElementById('create-task-cancel');

const modalCreateDM = document.getElementById('modal-create-dm');
const dmUserSelect = document.getElementById('dm-user-select');
const createDMConfirm = document.getElementById('create-dm-confirm');
const createDMCancel = document.getElementById('create-dm-cancel');

const modalReply = document.getElementById('modal-reply');
const replyParent = document.getElementById('reply-parent');
const replyText = document.getElementById('reply-text');
const replySend = document.getElementById('reply-send');
const replyCancel = document.getElementById('reply-cancel');

const newDmBtn = document.getElementById('new-dm-btn');
const showCompletedBtn = document.getElementById('show-completed');
const showArchivedBtn = document.getElementById('show-archived');

/* ---------- HELPERS ---------- */
function isAdminOrDirector(){ return currentUser && (currentUser.role === 'admin' || currentUser.role === 'director') }
function isDirector(){ return currentUser && currentUser.role === 'director' }

function uid(prefix='id'){ return prefix + '_' + Math.random().toString(36).substr(2,9); }

function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  if (name === 'login') {
    loginView.classList.add('active');
    appView.classList.remove('active');
  } else {
    appView.classList.add('active');
    loginView.classList.remove('active');
    if (name === 'dashboard') dashboardView.classList.add('active');
    if (name === 'groups') groupsView.classList.add('active');
    if (name === 'groupChat') groupChatView.classList.add('active');
    if (name === 'admin') adminView.classList.add('active');
    if (name === 'profile') profileView.classList.add('active');
  }
  if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'director')) {
    const navAdminBtn = document.getElementById('nav-admin');
    if (navAdminBtn) navAdminBtn.classList.remove('hidden');
  } else {
    const navAdminBtn = document.getElementById('nav-admin');
    if (navAdminBtn) navAdminBtn.classList.add('hidden');
  }
  // create group visibility
  if (createGroupBtn) createGroupBtn.classList.toggle('hidden', !isAdminOrDirector());
}

/* ---------- REALTIME LISTENERS ---------- */
function startListeners(){
  if (unsub.users) return; // already listening
  unsub.users = onSnapshot(collection(db,'users'), snap => {
    snap.forEach(d => users[d.id] = { id:d.id, ...d.data() });
    renderPending();
    renderUserManagement();
    renderProfile();
  });
  unsub.groups = onSnapshot(collection(db,'groups'), snap => {
    snap.forEach(d => groups[d.id] = { id:d.id, ...d.data() });
    renderGroups();
    renderDashboardGroups();
    if (currentGroup && groups[currentGroup.id]) {
      currentGroup = groups[currentGroup.id];
      chatGroupName.textContent = currentGroup.name;
      chatMembersCount.textContent = `${(currentGroup.members||[]).length} members`;
      populateMentionSelect();
    }
  });
  unsub.tasks = onSnapshot(collection(db,'tasks'), snap => {
    snap.forEach(d => tasks[d.id] = { id:d.id, ...d.data() });
    renderDashboardTasks();
  });
  unsub.messages = onSnapshot(collection(db,'messages'), snap => {
    snap.forEach(d => messages[d.id] = { id:d.id, ...d.data() });
    if (currentGroup) renderChat(currentGroup.id);
    renderMentionsColumn();
  });
}

/* ---------- AUTO-ARCHIVE ---------- */
async function autoArchiveOldTasks(){
  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const q = await getDocs(collection(db,'tasks'));
    for (const d of q.docs) {
      const t = d.data();
      if (t.status === 'completed' && !t.archived && t.completedAt) {
        const ts = new Date(t.completedAt).getTime();
        if (ts < sevenDaysAgo) {
          await updateDoc(doc(db,'tasks', d.id), { archived: true });
        }
      }
    }
  } catch(e){ console.error('autoArchive failed', e); }
}

/* ---------- RENDERS ---------- */
function renderProfile(){
  if (!currentUser) return;
  const pUser = document.getElementById('profile-username');
  const pRole = document.getElementById('profile-role');
  if (pUser) pUser.textContent = currentUser.username;
  if (pRole) pRole.textContent = currentUser.role;
}

function renderDashboardGroups(){
  if (!groupsCol) return;
  groupsCol.innerHTML = '';
  if (!currentUser) return groupsCol.innerHTML = '<p class="muted">Login to see groups.</p>';
  const my = Object.values(groups).filter(g => (g.members||[]).includes(currentUser.id));
  if (my.length === 0) return groupsCol.innerHTML = '<p class="muted">No groups.</p>';
  my.forEach(g=>{
    const el = document.createElement('div'); el.className='card';
    const adminsNames = (g.admins||[]).map(a=>users[a]?.username||a).join(', ');
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${g.name}</strong><div class="muted">Admins: ${adminsNames}</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn--outline small" data-open="${g.id}">Open</button>
        ${(isDirector() ? '<button class="btn btn--danger small" data-delete="'+g.id+'">Delete</button>' : '')}
      </div>
    </div>`;
    const openBtn = el.querySelector('[data-open]');
    if (openBtn) openBtn.onclick = ()=> openGroup(g.id);
    const delBtn = el.querySelector('[data-delete]');
    if (delBtn) delBtn.onclick = async ()=> {
      if (!confirm(`Delete group "${g.name}"? This will remove its messages and tasks.`)) return;
      try {
        // delete messages in group
        const msgs = await getDocs(query(collection(db,'messages'), where('groupId','==', g.id)));
        for (const m of msgs.docs) await deleteDoc(doc(db,'messages', m.id));
        const ts = await getDocs(query(collection(db,'tasks'), where('groupId','==', g.id)));
        for (const t of ts.docs) await deleteDoc(doc(db,'tasks', t.id));
        await deleteDoc(doc(db,'groups', g.id));
        alert('Group deleted');
      } catch(e){ console.error(e); alert('Delete failed'); }
    };
    groupsCol.appendChild(el);
  });
}

function renderDashboardTasks(){
  if (!tasksCol) return;
  tasksCol.innerHTML = '';
  if (!currentUser) return tasksCol.innerHTML = '<p class="muted">Login to see tasks.</p>';
  const my = Object.values(tasks).filter(t => (t.assignedTo === currentUser.id));
  const active = my.filter(t => !t.archived && t.status !== 'completed');
  const completed = my.filter(t => !t.archived && t.status === 'completed');
  const archived = my.filter(t => t.archived);
  // Active
  if (active.length === 0) tasksCol.innerHTML = '<p class="muted">No active tasks.</p>';
  active.forEach(t=>{
    const el = document.createElement('div'); el.className='card';
    el.innerHTML = `<div><strong>${t.title}</strong><div class="muted">${t.priority||'medium'} • ${t.groupId ? ('Group: ' + (groups[t.groupId]?.name||t.groupId)) : 'Personal'}</div></div>
      <div style="margin-top:8px">${t.description||''}</div>`;
    const actions = document.createElement('div'); actions.style.marginTop='8px';
    const btn = document.createElement('button'); btn.className='btn btn--primary small'; btn.textContent='Mark Completed';
    btn.onclick = async ()=> { try{ await updateDoc(doc(db,'tasks',t.id), { status:'completed', completedAt: new Date().toISOString() }); alert('Completed'); } catch(e){ alert('Failed'); } };
    actions.appendChild(btn);
    el.appendChild(actions);
    tasksCol.appendChild(el);
  });
  // Completed
  if (completed.length) {
    const hdr = document.createElement('div'); hdr.className='card'; hdr.innerHTML='<strong>Recently Completed</strong>';
    tasksCol.appendChild(hdr);
    completed.forEach(t=>{
      const el = document.createElement('div'); el.className='card';
      el.innerHTML = `<div><strong>${t.title}</strong><div class="muted">Completed at: ${t.completedAt ? new Date(t.completedAt).toLocaleString() : ''}</div></div>
        <div style="margin-top:8px">${t.description||''}</div>`;
      const actions = document.createElement('div'); actions.style.marginTop='8px';
      const undo = document.createElement('button'); undo.className='btn btn--outline small'; undo.textContent='Undo';
      undo.onclick = async ()=> { try{ await updateDoc(doc(db,'tasks',t.id), { status:'in-progress', completedAt: null }); alert('Restored'); } catch(e){ alert('Failed'); } };
      actions.appendChild(undo);
      if (isAdminOrDirector()) {
        const del = document.createElement('button'); del.className='btn btn--danger small'; del.textContent='Delete';
        del.onclick = async ()=> { if(!confirm('Delete permanently?')) return; try{ await deleteDoc(doc(db,'tasks',t.id)); alert('Deleted'); } catch(e){ alert('Fail'); } };
        actions.appendChild(del);
      }
      el.appendChild(actions);
      tasksCol.appendChild(el);
    });
  }
  // Archived view toggled by button; hidden by default
  if (showCompletedBtn) showCompletedBtn.onclick = ()=> {
    const c = Object.values(tasks).filter(t=>t.assignedTo===currentUser.id && t.status==='completed' && !t.archived);
    if (c.length===0) return alert('No completed tasks');
    const list = c.map(t=>`${t.title} — completedAt: ${t.completedAt||''}`).join('\\n');
    alert('Completed tasks:\\n' + list);
  };
  if (showArchivedBtn) showArchivedBtn.onclick = async ()=> {
    const a = Object.values(tasks).filter(t=>t.assignedTo===currentUser.id && t.archived);
    if (a.length===0) return alert('No archived tasks');
    const list = a.map(t=>`${t.title} — archived`).join('\\n');
    alert('Archived tasks:\\n' + list);
  };
}

function renderMentionsColumn(){
  if (!mentionsCol) return;
  mentionsCol.innerHTML = '';
  if (!currentUser) return mentionsCol.innerHTML = '<p class="muted">Login to see mentions.</p>';
  const m = Object.values(messages).filter(msg => Array.isArray(msg.mentions) && msg.mentions.includes(currentUser.id));
  if (m.length === 0) return mentionsCol.innerHTML = '<p class="muted">No mentions.</p>';
  m.sort((a,b)=> new Date(b.timestamp||0) - new Date(a.timestamp||0));
  m.forEach(msg=>{
    const el = document.createElement('div'); el.className='card';
    const from = users[msg.userId]?.username || msg.userId;
    el.innerHTML = `<div><strong>${from}</strong> <div class="muted">${msg.groupId ? ('in ' + (groups[msg.groupId]?.name||msg.groupId)) : 'Direct'}</div></div>
      <div style="margin-top:8px">${msg.content}</div>
      <div class="muted" style="margin-top:6px">${new Date(msg.timestamp||'').toLocaleString()}</div>`;
    mentionsCol.appendChild(el);
  });
}

/* ---------- GROUPS & CHAT ---------- */
function renderGroups(){
  if (!groupsList) return;
  groupsList.innerHTML = '';
  if (!currentUser) return groupsList.innerHTML = '<p class="muted">Login to see groups.</p>';
  const my = Object.values(groups).filter(g => (g.members||[]).includes(currentUser.id));
  if (my.length === 0) return groupsList.innerHTML = '<p class="muted">No groups.</p>';
  my.forEach(g=>{
    const el = document.createElement('div'); el.className='card';
    const adminsNames = (g.admins||[]).map(a=>users[a]?.username||a).join(', ');
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${g.name}</strong><div class="muted">Admins: ${adminsNames}</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn--outline small" data-open="${g.id}">Open</button>
        ${(isAdminOrDirector() && (g.admins||[]).includes(currentUser.id) ? '<button class="btn btn--danger small" data-delete="'+g.id+'">Delete</button>' : '')}
      </div>
    </div>`;
    const openBtn = el.querySelector('[data-open]');
    if (openBtn) openBtn.onclick = ()=> openGroup(g.id);
    const delBtn = el.querySelector('[data-delete]');
    if (delBtn) delBtn.onclick = async ()=> {
      if (!confirm(`Delete group "${g.name}"? This will remove its messages and tasks.`)) return;
      try {
        const msgs = await getDocs(query(collection(db,'messages'), where('groupId','==', g.id)));
        for (const m of msgs.docs) await deleteDoc(doc(db,'messages', m.id));
        const ts = await getDocs(query(collection(db,'tasks'), where('groupId','==', g.id)));
        for (const t of ts.docs) await deleteDoc(doc(db,'tasks', t.id));
        await deleteDoc(doc(db,'groups', g.id));
        alert('Group deleted');
      } catch(e){ console.error(e); alert('Delete failed'); }
    };
    groupsList.appendChild(el);
  });
}

function populateMentionSelect(){
  if (!mentionSelect) return;
  mentionSelect.innerHTML = '';
  if (!currentGroup) return;
  const members = (currentGroup.members || []).map(id => ({ id, username: users[id]?.username || id }));
  members.forEach(m => {
    const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.username; mentionSelect.appendChild(opt);
  });
}

function renderChat(groupId){
  if (!chatMessages) return;
  chatMessages.innerHTML = '';
  const msgs = Object.values(messages).filter(m=>m.groupId === groupId).sort((a,b)=> new Date(a.timestamp||0)-new Date(b.timestamp||0));
  // threaded replies
  const children = {};
  msgs.forEach(m=>{ children[m.id] = children[m.id] || []; });
  msgs.forEach(m=>{ if(m.parentMessageId) children[m.parentMessageId] = children[m.parentMessageId] || [], children[m.parentMessageId].push(m); });
  function renderMsg(m, container){
    const div = document.createElement('div'); div.className='message';
    const name = users[m.userId]?.username || m.userId;
    const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `${name} • ${new Date(m.timestamp||'').toLocaleString()}`;
    div.appendChild(meta);
    const content = document.createElement('div'); content.textContent = m.content; div.appendChild(content);
    if (Array.isArray(m.mentions) && m.mentions.length) {
      const mm = document.createElement('div'); mm.className='muted'; mm.textContent = 'Mentioned: ' + m.mentions.map(id=>users[id]?.username||id).join(', ');
      div.appendChild(mm);
    }
    const actions = document.createElement('div'); actions.style.marginTop='8px'; actions.style.display='flex'; actions.style.gap='8px';
    const replyBtn = document.createElement('button'); replyBtn.className='btn btn--outline small'; replyBtn.textContent='Reply';
    replyBtn.onclick = ()=> { replyTo = m; replyParent.textContent = m.content; modalReply.classList.remove('hidden'); };
    actions.appendChild(replyBtn);
    div.appendChild(actions);
    container.appendChild(div);
    const ch = children[m.id] || [];
    if (ch.length) {
      const thread = document.createElement('div'); thread.className='thread';
      ch.sort((a,b)=> new Date(a.timestamp||0)-new Date(b.timestamp||0));
      ch.forEach(c=> renderMsg(c, thread));
      container.appendChild(thread);
    }
  }
  msgs.filter(m=>!m.parentMessageId).forEach(m=> renderMsg(m, chatMessages));
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ---------- ADMIN UI ---------- */
function renderPending(){
  if (!pendingList) return;
  pendingList.innerHTML = '';
  if (!isDirector()) { pendingList.innerHTML = '<p class="muted">Only director can see pending approvals.</p>'; return; }
  const pending = Object.values(users).filter(u=>u.status === 'pending');
  if (pending.length === 0) { pendingList.innerHTML = '<p class="muted">No pending users.</p>'; return; }
  pending.forEach(u=>{
    const el = document.createElement('div'); el.className='card';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${u.username}</strong><div class="muted">${u.createdAt? new Date(u.createdAt).toLocaleDateString():''}</div></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn--primary small" data-id="${u.id}">Approve</button>
        <button class="btn btn--danger small" data-id="${u.id}">Remove</button>
      </div>
    </div>`;
    el.querySelector('.btn--primary').onclick = async ()=> { try{ await updateDoc(doc(db,'users',u.id), { status:'active' }); alert('Approved'); } catch(e){alert('Fail')} };
    el.querySelector('.btn--danger').onclick = async ()=> { if(!confirm('Remove user?')) return; try{ await deleteUser(u.id); alert('Removed'); } catch(e){alert('Fail')} };
    pendingList.appendChild(el);
  });
}

function renderUserManagement(){
  if (!userManagement) return;
  userManagement.innerHTML = '';
  if (!isDirector()) { userManagement.innerHTML = '<p class="muted">Only director can manage users.</p>'; return; }
  const act = Object.values(users).filter(u=>u.status === 'active');
  act.forEach(u=>{
    const el = document.createElement('div'); el.className='card';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${u.username}</strong><div class="muted">Role: ${u.role}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn btn--outline small set-user" data-id="${u.id}">User</button>
        <button class="btn btn--outline small set-admin" data-id="${u.id}">Admin</button>
        <button class="btn btn--outline small set-dir" data-id="${u.id}">Director</button>
        <button class="btn btn--danger small remove-user" data-id="${u.id}">Remove</button>
      </div>
    </div>`;
    el.querySelector('.set-user').onclick = ()=> changeRole(u.id,'user');
    el.querySelector('.set-admin').onclick = ()=> changeRole(u.id,'admin');
    el.querySelector('.set-dir').onclick = ()=> changeRole(u.id,'director');
    el.querySelector('.remove-user').onclick = async ()=> { if(!confirm('Remove?')) return; try{ await deleteUser(u.id); alert('Removed'); } catch(e){alert('Fail')} };
    userManagement.appendChild(el);
  });
}

async function changeRole(uid, role){
  if (!isDirector()) return alert('Only director');
  try { await updateDoc(doc(db,'users',uid), { role }); alert('Role updated'); } catch(e){ alert('Failed'); }
}

/* ---------- ACTIONS ---------- */
loginBtn.onclick = async ()=>{
  const uname = loginUsername.value.trim();
  const pass = loginPassword.value.trim();
  if (!uname || !pass) return alert('Enter username/password');
  try {
    const q = query(collection(db,'users'), where('username','==', uname));
    const snap = await getDocs(q);
    if (snap.empty) return alert('Invalid credentials');
    let found = null;
    snap.forEach(d=>{ const data = d.data(); if (data.password === pass) found = { id:d.id, ...d.data() }; });
    if (!found) return alert('Invalid credentials');
    if (found.status !== 'active') return alert('Account not active.');
    currentUser = found;

    startListeners();

    // immediate load
    const [us, gs, ts, ms] = await Promise.all([
      getDocs(collection(db,'users')),
      getDocs(collection(db,'groups')),
      getDocs(collection(db,'tasks')),
      getDocs(collection(db,'messages'))
    ]);
    us.forEach(d=> users[d.id] = { id:d.id, ...d.data() });
    gs.forEach(d=> groups[d.id] = { id:d.id, ...d.data() });
    ts.forEach(d=> tasks[d.id] = { id:d.id, ...d.data() });
    ms.forEach(d=> messages[d.id] = { id:d.id, ...d.data() });

    // auto-archive run once at login
    autoArchiveOldTasks();

    showView('dashboard');
    renderProfile();
    renderDashboardGroups();
    renderDashboardTasks();
    renderMentionsColumn();
  } catch(e){ console.error(e); alert('Login failed'); }
};

registerBtn.onclick = async ()=>{
  const uname = prompt('Choose a username (no spaces)');
  if (!uname) return;
  const pass = prompt('Choose a password');
  if (!pass) return;
  try {
    const snap = await getDocs(query(collection(db,'users'), where('username','==', uname)));
    if (!snap.empty) return alert('Username taken');
    await addDoc(collection(db,'users'), { username: uname, password: pass, role:'user', status:'pending', groups:[], createdAt: new Date().toISOString() });
    alert('Registered. Wait for director approval.');
  } catch(e){ console.error(e); alert('Register failed'); }
};

logoutBtn.onclick = ()=>{
  Object.values(unsub).forEach(u=>{ if (u) u(); });
  unsub = { users:null, groups:null, tasks:null, messages:null };
  currentUser = null; currentGroup = null;
  showView('login');
};

/* NAV */
if (navDashboard) navDashboard.onclick = ()=> { showView('dashboard'); renderDashboardGroups(); renderDashboardTasks(); renderMentionsColumn(); };
if (navGroups) navGroups.onclick = ()=> { showView('groups'); renderGroups(); };
if (navAdmin) navAdmin.onclick = ()=> { showView('admin'); renderPending(); renderUserManagement(); };
if (navProfile) navProfile.onclick = ()=> { showView('profile'); renderProfile(); };

/* Create Group */
if (createGroupBtn) createGroupBtn.onclick = ()=>{
  if (!isAdminOrDirector()) return alert('Only admins/directors can create groups');
  membersBoxes.innerHTML = ''; adminsBoxes.innerHTML = '';
  Object.values(users).filter(u=>u.status==='active').forEach(u=>{
    const r = document.createElement('div');
    r.innerHTML = `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" value="${u.id}" /> <span>${u.username}</span></label>`;
    membersBoxes.appendChild(r);
    const r2 = document.createElement('div');
    r2.innerHTML = `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" value="${u.id}" /> <span>${u.username}</span></label>`;
    adminsBoxes.appendChild(r2);
  });
  groupNameInput.value = '';
  modalCreateGroup.classList.remove('hidden');
};
if (createGroupCancel) createGroupCancel.onclick = ()=> modalCreateGroup.classList.add('hidden');
if (createGroupConfirm) createGroupConfirm.onclick = async ()=>{
  const name = groupNameInput.value.trim();
  if (!name) return alert('Group name required');
  const memberIds = Array.from(membersBoxes.querySelectorAll('input:checked')).map(i=>i.value);
  const adminIds = Array.from(adminsBoxes.querySelectorAll('input:checked')).map(i=>i.value);
  if (adminIds.length === 0) return alert('Select at least one admin');
  try {
    const gref = await addDoc(collection(db,'groups'), { name, members: memberIds, admins: adminIds, type:'team', createdAt: new Date().toISOString() });
    for (const uid of memberIds) {
      try {
        const uref = doc(db,'users', uid);
        const ud = await getDoc(uref);
        if (ud.exists()) {
          const dat = ud.data();
          const arr = dat.groups || [];
          if (!arr.includes(gref.id)) await updateDoc(uref, { groups: [...arr, gref.id] });
        }
      } catch(e){ console.warn('user update failed', e); }
    }
    alert('Group created');
    modalCreateGroup.classList.add('hidden');
  } catch(e){ console.error(e); alert('Create group failed'); }
};

/* Create Task */
if (createTaskBtn) createTaskBtn.onclick = ()=>{
  if (!taskAssignTo) return;
  taskAssignTo.innerHTML = '';
  Object.values(users).filter(u=>u.status==='active').forEach(u => {
    const opt = document.createElement('option'); opt.value = u.id; opt.textContent = u.username; taskAssignTo.appendChild(opt);
  });
  taskGroup.innerHTML = '<option value="">(no group - personal)</option>';
  Object.values(groups).filter(g => (g.members||[]).includes(currentUser.id)).forEach(g => {
    const opt = document.createElement('option'); opt.value = g.id; opt.textContent = g.name; taskGroup.appendChild(opt);
  });
  taskTitle.value=''; taskDesc.value=''; taskPrivate.checked = false;
  modalCreateTask.classList.remove('hidden');
};
if (createTaskCancel) createTaskCancel.onclick = ()=> modalCreateTask.classList.add('hidden');
if (createTaskConfirm) createTaskConfirm.onclick = async ()=>{
  const title = taskTitle.value.trim(); const description = taskDesc.value.trim();
  const assignedTo = taskAssignTo.value; const groupId = taskGroup.value || null;
  const isPrivate = taskPrivate.checked;
  if (!title || !assignedTo) return alert('Fill required fields');
  try {
    const data = { title, description, assignedBy: currentUser.id, assignedTo, status:'in-progress', priority:'medium', dueDate:null, groupId: isPrivate ? null : groupId, private: !!isPrivate, archived:false, createdAt:new Date().toISOString() };
    const tref = await addDoc(collection(db,'tasks'), data);
    if (!isPrivate && groupId) {
      await addDoc(collection(db,'messages'), { groupId, userId: currentUser.id, content: `Task assigned: ${title}`, type:'task-assignment', parentMessageId:null, taskId: tref.id, timestamp: new Date().toISOString() });
    } else {
      await addDoc(collection(db,'messages'), { groupId: null, userId: currentUser.id, content: `Private task assigned to ${users[assignedTo]?.username||assignedTo}: ${title}`, type:'private-task', parentMessageId:null, taskId: tref.id, timestamp: new Date().toISOString(), mentions: [assignedTo] });
    }
    alert('Task created'); modalCreateTask.classList.add('hidden');
  } catch(e){ console.error(e); alert('Create task failed'); }
};

/* Create DM */
if (newDmBtn) newDmBtn.onclick = ()=>{
  dmUserSelect.innerHTML = '';
  Object.values(users).filter(u=>u.status==='active' && u.id !== currentUser.id).forEach(u=>{
    const opt = document.createElement('option'); opt.value = u.id; opt.textContent = u.username; dmUserSelect.appendChild(opt);
  });
  modalCreateDM.classList.remove('hidden');
};
if (createDMCancel) createDMCancel.onclick = ()=> modalCreateDM.classList.add('hidden');
if (createDMConfirm) createDMConfirm.onclick = async ()=>{
  const other = dmUserSelect.value;
  if (!other) return alert('Select a user');
  try {
    const existing = Object.values(groups).find(g => g.type === 'dm' && (g.members||[]).includes(currentUser.id) && (g.members||[]).includes(other));
    if (existing) {
      modalCreateDM.classList.add('hidden');
      openGroup(existing.id);
      return;
    }
    const name = `DM: ${users[other]?.username||other}`;
    const gref = await addDoc(collection(db,'groups'), { name, members: [currentUser.id, other], admins: [], type:'dm', createdAt: new Date().toISOString() });
    modalCreateDM.classList.add('hidden');
    openGroup(gref.id);
  } catch(e){ console.error(e); alert('Create DM failed'); }
};

/* Chat send & reply */
if (sendMsgBtn) sendMsgBtn.onclick = async ()=>{
  if (!currentGroup) return alert('Open a group');
  const text = chatInput.value.trim(); if (!text) return;
  const mentions = Array.from(mentionSelect.selectedOptions).map(o=>o.value);
  try { await addDoc(collection(db,'messages'), { groupId: currentGroup.type === 'dm' ? currentGroup.id : currentGroup.id, userId: currentUser.id, content:text, type:'message', parentMessageId:null, taskId:null, timestamp:new Date().toISOString(), mentions }); chatInput.value=''; mentionSelect.selectedIndex = -1; }
  catch(e){ console.error(e); alert('Send failed'); }
};
if (replySend) replySend.onclick = async ()=>{
  const text = replyText.value.trim(); if (!text || !replyTo) return;
  try { await addDoc(collection(db,'messages'), { groupId: replyTo.groupId, userId: currentUser.id, content:text, type:'message', parentMessageId: replyTo.id, taskId:null, timestamp:new Date().toISOString() }); replyText.value=''; replyTo=null; modalReply.classList.add('hidden'); }
  catch(e){ console.error(e); alert('Reply failed'); }
};
if (replyCancel) replyCancel.onclick = ()=> { replyTo=null; modalReply.classList.add('hidden'); };

/* open group by id */
async function openGroup(groupId){
  const gDoc = groups[groupId];
  const g = gDoc || (await getDoc(doc(db,'groups',groupId))).data();
  if (!g) return alert('Group not found');
  if (!g.members || !g.members.includes(currentUser.id)) return alert('Access denied — you are not a member of this group.');
  currentGroup = { id: groupId, ...g };
  if (chatGroupName) chatGroupName.textContent = currentGroup.name;
  if (chatMembersCount) chatMembersCount.textContent = `${(currentGroup.members||[]).length} members`;
  showView('groupChat');
  populateMentionSelect();
  renderChat(groupId);
}
if (backToGroups) backToGroups.onclick = ()=> { currentGroup=null; showView('groups'); };

/* Delete user (director action) */
async function deleteUser(uid){
  if (!isDirector()) return alert('Only director can remove users');
  if (!confirm('Really delete user and remove from groups/tasks?')) return;
  try {
    const groupIds = Object.values(groups).filter(g => (g.members||[]).includes(uid)).map(g=>g.id);
    for (const gid of groupIds) {
      const g = groups[gid];
      if (g.type === 'dm') {
        const msgs = await getDocs(query(collection(db,'messages'), where('groupId','==', gid)));
        for (const m of msgs.docs) await deleteDoc(doc(db,'messages', m.id));
        await deleteDoc(doc(db,'groups', gid));
      } else {
        const m = (g.members||[]).filter(x=>x!==uid);
        const a = (g.admins||[]).filter(x=>x!==uid);
        await updateDoc(doc(db,'groups', gid), { members: m, admins: a });
      }
    }
    const ts = await getDocs(query(collection(db,'tasks'), where('assignedTo','==', uid)));
    for (const t of ts.docs) {
      await updateDoc(doc(db,'tasks', t.id), { assignedTo: null });
    }
    await deleteDoc(doc(db,'users', uid));
  } catch(e){ console.error('deleteUser failed', e); throw e; }
}

/* refresh */
if (refreshBtn) refreshBtn.onclick = ()=> { renderDashboardGroups(); renderDashboardTasks(); renderMentionsColumn(); if (currentGroup) renderChat(currentGroup.id); };

/* keyboard enter login convenience */
if (loginPassword) loginPassword.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') loginBtn.click(); });

/* TEMP DEBUG API (kept small) */
window._tf_app = {
  getState: ()=> ({
    currentUser: currentUser ? { id: currentUser.id ?? currentUser.username, username: currentUser.username, role: currentUser.role, status: currentUser.status } : null,
    counts: { users:Object.keys(users).length, groups:Object.keys(groups).length, tasks:Object.keys(tasks).length, messages:Object.keys(messages).length },
    currentGroup: currentGroup? { id: currentGroup.id, name: currentGroup.name } : null,
    listenersActive: !!(unsub.users || unsub.groups || unsub.tasks || unsub.messages)
  }),
  startListeners: ()=> { try{ startListeners(); return {ok:true}; } catch(e){ return {ok:false, error:String(e)}; } }
};

/* initial view */
showView('login');
