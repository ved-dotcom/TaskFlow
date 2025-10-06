// app.js - cleaned and modularized
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------- CONFIG ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyCt3MkUMeXkQg8JBRm6o5f5RZWJZUJrpQ",
  authDomain: "taskflow-22167.firebaseapp.com",
  projectId: "taskflow-22167",
  storageBucket: "taskflow-22167.appspot.com",
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
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout');

const navDashboard = document.getElementById('nav-dashboard');
const navGroups = document.getElementById('nav-groups');
const navAdmin = document.getElementById('nav-admin');
const navProfile = document.getElementById('nav-profile');

const dashboardView = document.getElementById('dashboard-view');
const groupsView = document.getElementById('groups-view');
const groupChatView = document.getElementById('group-chat-view');
const adminView = document.getElementById('admin-view');
const profileView = document.getElementById('profile-view');

const taskList = document.getElementById('task-list');
const createTaskBtn = document.getElementById('create-task-btn');
const refreshBtn = document.getElementById('refresh-btn');

const groupsList = document.getElementById('groups-list');
const createGroupBtn = document.getElementById('create-group-btn');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendMsgBtn = document.getElementById('send-msg');
const backToGroups = document.getElementById('back-to-groups');
const chatGroupName = document.getElementById('chat-group-name');
const chatMembersCount = document.getElementById('chat-members-count');
const cancelReplyBtn = document.getElementById('cancel-reply');

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
const createTaskConfirm = document.getElementById('create-task-confirm');
const createTaskCancel = document.getElementById('create-task-cancel');

const modalReply = document.getElementById('modal-reply');
const replyParent = document.getElementById('reply-parent');
const replyText = document.getElementById('reply-text');
const replySend = document.getElementById('reply-send');
const replyCancel = document.getElementById('reply-cancel');

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
  if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'director')) navAdmin.classList.remove('hidden');
  else navAdmin.classList.add('hidden');
}

/* ---------- REALTIME LISTENERS ---------- */
function startListeners(){
  if (unsub.users) return;
  unsub.users = onSnapshot(collection(db,'users'), snap => {
    snap.forEach(d => users[d.id] = { id:d.id, ...d.data() });
    renderPending();
    renderUserManagement();
    renderProfile();
  });
  unsub.groups = onSnapshot(collection(db,'groups'), snap => {
    snap.forEach(d => groups[d.id] = { id:d.id, ...d.data() });
    renderGroups();
    if (currentGroup && groups[currentGroup.id]) {
      currentGroup = groups[currentGroup.id];
      chatGroupName.textContent = currentGroup.name;
      chatMembersCount.textContent = `${(currentGroup.members||[]).length} members`;
    }
  });
  unsub.tasks = onSnapshot(collection(db,'tasks'), snap => {
    snap.forEach(d => tasks[d.id] = { id:d.id, ...d.data() });
    renderTasks();
  });
  unsub.messages = onSnapshot(collection(db,'messages'), snap => {
    snap.forEach(d => messages[d.id] = { id:d.id, ...d.data() });
    if (currentGroup) renderChat(currentGroup.id);
  });
}

/* ---------- RENDERS ---------- */
function renderProfile(){
  if (!currentUser) return;
  profileUsername.textContent = currentUser.username;
  profileRole.textContent = currentUser.role;
}

function renderTasks(){
  taskList.innerHTML = '';
  if (!currentUser) return taskList.innerHTML = '<p class="muted">Please login.</p>';
  const my = Object.values(tasks).filter(t=>t.assignedTo === currentUser.id);
  if (my.length === 0) return taskList.innerHTML = '<p class="muted">No tasks assigned.</p>';
  my.sort((a,b)=> new Date(a.dueDate||0) - new Date(b.dueDate||0));
  my.forEach(t=>{
    const el = document.createElement('div'); el.className='card';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${t.title}</strong><div class="muted">${t.priority||'medium'} • Due: ${t.dueDate? new Date(t.dueDate).toLocaleDateString() : '—'}</div></div>
      <div>${t.status === 'completed' ? '<span class="muted">Completed</span>' : (t.status === 'pending-approval' ? '<span style="color:var(--danger);font-weight:700">Pending</span>' : '')}</div>
    </div><div style="margin-top:8px">${t.description||''}</div>`;
    const actions = document.createElement('div'); actions.style.marginTop='8px';
    if (t.status !== 'completed' && currentUser.id === t.assignedTo) {
      const btn = document.createElement('button'); btn.className='btn btn--primary small'; btn.textContent='Mark Completed';
      btn.onclick = async ()=> { try{ await updateDoc(doc(db,'tasks',t.id), { status:'completed', completedAt: new Date().toISOString() }); alert('Task marked completed'); } catch(e){ alert('Failed'); } };
      actions.appendChild(btn);
    }
    el.appendChild(actions);
    taskList.appendChild(el);
  });
}

function renderGroups(){
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
        ${(isAdminOrDirector() && (g.admins||[]).includes(currentUser.id)) ? '<button class="btn btn--danger small" data-delete="'+g.id+'">Delete</button>' : ''}
      </div>
    </div>`;
    el.querySelector('[data-open]').onclick = ()=> openGroup(g.id);
    const delBtn = el.querySelector('[data-delete]');
    if (delBtn) delBtn.onclick = async ()=> {
      if (!confirm(`Delete group "${g.name}"?`)) return;
      try {
        const msgs = await getDocs(query(collection(db,'messages'), where('groupId','==', g.id)));
        for (const m of msgs.docs) await deleteDoc(doc(db,'messages',m.id));
        const ts = await getDocs(query(collection(db,'tasks'), where('groupId','==', g.id)));
        for (const t of ts.docs) await deleteDoc(doc(db,'tasks',t.id));
        await deleteDoc(doc(db,'groups', g.id));
        alert('Group deleted');
      } catch(e){ console.error(e); alert('Failed'); }
    };
    groupsList.appendChild(el);
  });
}

function renderChat(groupId){
  chatMessages.innerHTML = '';
  const msgs = Object.values(messages).filter(m=>m.groupId === groupId).sort((a,b)=> new Date(a.timestamp||0)-new Date(b.timestamp||0));
  const children = {};
  msgs.forEach(m=>{ children[m.id] = children[m.id] || []; });
  msgs.forEach(m=>{ if(m.parentMessageId) children[m.parentMessageId] = children[m.parentMessageId] || [], children[m.parentMessageId].push(m); });
  function renderMsg(m, container){
    const div = document.createElement('div'); div.className='message';
    const name = users[m.userId]?.username || m.userId;
    const meta = document.createElement('div'); meta.className='meta'; meta.textContent = `${name} • ${new Date(m.timestamp||'').toLocaleString()}`;
    div.appendChild(meta);
    const content = document.createElement('div'); content.textContent = m.content; div.appendChild(content);
    const actions = document.createElement('div'); actions.style.marginTop='8px'; actions.style.display='flex'; actions.style.gap='8px';
    const replyBtn = document.createElement('button'); replyBtn.className='btn btn--outline small'; replyBtn.textContent='Reply';
    replyBtn.onclick = ()=> { replyTo = m; replyParent.textContent = m.content; modalReply.classList.remove('hidden'); };
    actions.appendChild(replyBtn);
    if (m.type === 'task-assignment' && m.taskId) {
      const t = tasks[m.taskId];
      if (t && t.status !== 'completed' && currentUser.id === t.assignedTo) {
        const mark = document.createElement('button'); mark.className='btn btn--primary small'; mark.textContent='Mark Complete';
        mark.onclick = async ()=> { try{ await updateDoc(doc(db,'tasks',t.id), { status:'completed', completedAt: new Date().toISOString() }); alert('Marked complete'); } catch(e){alert('Failed')} };
        actions.appendChild(mark);
      }
    }
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

/* Admin UI */
function renderPending(){
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
    el.querySelector('.btn--danger').onclick = async ()=> { if(!confirm('Remove user?')) return; try{ await deleteDoc(doc(db,'users',u.id)); alert('Removed'); } catch(e){alert('Fail')} };
    pendingList.appendChild(el);
  });
}

function renderUserManagement(){
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
    el.querySelector('.remove-user').onclick = async ()=> { if(!confirm('Remove?')) return; try{ await deleteDoc(doc(db,'users',u.id)); alert('Removed'); } catch(e){alert('Fail')} };
    userManagement.appendChild(el);
  });
}

async function changeRole(uid, role){
  if (!isDirector()) return alert('Only director');
  try { await updateDoc(doc(db,'users',uid), { role }); alert('Role updated'); } catch(e){ alert('Failed'); }
}

/* ACTIONS */
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

    showView('dashboard');
    renderProfile();
    renderTasks();
    renderGroups();
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

navDashboard.onclick = ()=> showView('dashboard');
navGroups.onclick = ()=> showView('groups');
navAdmin.onclick = ()=> { showView('admin'); renderPending(); renderUserManagement(); };
navProfile.onclick = ()=> { showView('profile'); renderProfile(); };

createGroupBtn.onclick = ()=>{
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
createGroupCancel.onclick = ()=> modalCreateGroup.classList.add('hidden');
createGroupConfirm.onclick = async ()=>{
  const name = groupNameInput.value.trim();
  if (!name) return alert('Group name required');
  const memberIds = Array.from(membersBoxes.querySelectorAll('input:checked')).map(i=>i.value);
  const adminIds = Array.from(adminsBoxes.querySelectorAll('input:checked')).map(i=>i.value);
  if (adminIds.length === 0) return alert('Select at least one admin');
  try {
    const gref = await addDoc(collection(db,'groups'), { name, members: memberIds, admins: adminIds, createdAt: new Date().toISOString() });
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

createTaskBtn.onclick = ()=>{
  taskAssignTo.innerHTML = '';
  Object.values(users).filter(u=>u.status==='active').forEach(u => {
    const opt = document.createElement('option'); opt.value = u.id; opt.textContent = u.username; taskAssignTo.appendChild(opt);
  });
  taskGroup.innerHTML = '';
  Object.values(groups).filter(g => (g.members||[]).includes(currentUser.id)).forEach(g => {
    const opt = document.createElement('option'); opt.value = g.id; opt.textContent = g.name; taskGroup.appendChild(opt);
  });
  taskTitle.value=''; taskDesc.value=''; taskGroup.value = taskGroup.options.length ? taskGroup.options[0].value : '';
  modalCreateTask.classList.remove('hidden');
};
createTaskCancel.onclick = ()=> modalCreateTask.classList.add('hidden');
createTaskConfirm.onclick = async ()=>{
  const title = taskTitle.value.trim(); const description = taskDesc.value.trim();
  const assignedTo = taskAssignTo.value; const groupId = taskGroup.value;
  if (!title || !assignedTo || !groupId) return alert('Fill required fields');
  try {
    const tref = await addDoc(collection(db,'tasks'), { title, description, assignedBy: currentUser.id, assignedTo, status:'in-progress', priority:'medium', dueDate:null, groupId, createdAt:new Date().toISOString() });
    await addDoc(collection(db,'messages'), { groupId, userId: currentUser.id, content: `Task assigned: ${title}`, type:'task-assignment', parentMessageId:null, taskId: tref.id, timestamp: new Date().toISOString() });
    alert('Task created'); modalCreateTask.classList.add('hidden');
  } catch(e){ console.error(e); alert('Create task failed'); }
};

sendMsgBtn.onclick = async ()=>{
  if (!currentGroup) return alert('Open a group');
  const text = chatInput.value.trim(); if (!text) return;
  try { await addDoc(collection(db,'messages'), { groupId: currentGroup.id, userId: currentUser.id, content:text, type:'message', parentMessageId:null, taskId:null, timestamp:new Date().toISOString() }); chatInput.value=''; }
  catch(e){ console.error(e); alert('Send failed'); }
};
replySend.onclick = async ()=>{
  const text = replyText.value.trim(); if (!text || !replyTo) return;
  try { await addDoc(collection(db,'messages'), { groupId: replyTo.groupId, userId: currentUser.id, content:text, type:'message', parentMessageId: replyTo.id, taskId:null, timestamp:new Date().toISOString() }); replyText.value=''; replyTo=null; modalReply.classList.add('hidden'); }
  catch(e){ console.error(e); alert('Reply failed'); }
};
replyCancel.onclick = ()=> { replyTo=null; modalReply.classList.add('hidden'); };

async function openGroup(groupId){
  const gdoc = groups[groupId] || (await getDoc(doc(db,'groups',groupId))).data();
  if (!gdoc) return alert('Group not found');
  currentGroup = { id: groupId, ...gdoc };
  chatGroupName.textContent = currentGroup.name;
  chatMembersCount.textContent = `${(currentGroup.members||[]).length} members`;
  showView('groupChat');
  renderChat(groupId);
}
backToGroups.onclick = ()=> { currentGroup=null; showView('groups'); };
refreshBtn.onclick = ()=> { renderTasks(); renderGroups(); if (currentGroup) renderChat(currentGroup.id); };
loginPassword.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') loginBtn.click(); });

/* TEMP DEBUG API */
window._tf_app = {
  getState: ()=> ({
    currentUser: currentUser ? { id: currentUser.id ?? currentUser.username, username: currentUser.username, role: currentUser.role, status: currentUser.status } : null,
    counts: { users:Object.keys(users).length, groups:Object.keys(groups).length, tasks:Object.keys(tasks).length, messages:Object.keys(messages).length },
    currentGroup: currentGroup? { id: currentGroup.id, name: currentGroup.name } : null,
    listenersActive: !!(unsub.users || unsub.groups || unsub.tasks || unsub.messages)
  }),
  startListeners: ()=> { try{ startListeners(); return {ok:true}; } catch(e){ return {ok:false, error:String(e)}; } }
};

showView('login');
