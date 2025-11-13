// ============================================================================
// TASKFLOW - app.js
// - Minimal, surgical updates:
//   1) "Assign to entire group" creates ONE shared task (groupWide: true)
//      that any group member can complete (no per-member tasks).
//   2) Collapse buttons fixed (use style.display toggling).
// - All other logic preserved.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ----------------------------------------------------------------------------
// Configuration (unchanged)
const CONFIG = {
  firebase: {
    apiKey: "AIzaSyCt3MkuMExKqg8J3BRm60Sf5RZWJZUjrpQ",
    authDomain: "taskflow-22167.firebaseapp.com",
    projectId: "taskflow-22167",
    storageBucket: "taskflow-22167.firebasestorage.app",
    messagingSenderId: "485747269063",
    appId: "1:485747269063:web:1924481b201b0f1d804de2",
    measurementId: "G-D2HQ4YVXL9"
  },
  autoArchive: {
    interval: 6 * 60 * 60 * 1000, // 6 hours
    daysOld: 7
  }
};

// ----------------------------------------------------------------------------
// Utilities
class Utils {
  static $(id) { return document.getElementById(id) || null; }
  static safeText(element, text) { if (element) element.textContent = text ?? ''; }
  static exists(element) { return !!element; }
  static uid(prefix = 'id') { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }
  static formatDate(dateString) { return dateString ? new Date(dateString).toLocaleString() : ''; }
  static formatDateShort(dateString) { return dateString ? new Date(dateString).toLocaleDateString() : ''; }

  // Safely escape text for insertion into innerHTML contexts
  static escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  static showElement(element) { if (element) element.classList.remove('hidden'); }
  static hideElement(element) { if (element) element.classList.add('hidden'); }
  static toggleElement(element, show) { if (!element) return; element.classList.toggle('hidden', !show); }
  static clearElement(element) { if (element) element.innerHTML = ''; }
  static addButtonListeners(element, selectors) {
    if (!element) return;
    Object.entries(selectors).forEach(([selector, handler]) => {
      const btn = element.querySelector(selector);
      if (btn) btn.addEventListener('click', handler);
    });
  }

  static initToastContainer() {
    if (!document.getElementById('toast-container')) {
      const container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
  }

  static showToast(message, type = 'info', duration = 4000) {
    Utils.initToastContainer();
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.textContent = message;

    const colors = {
      error: '#ef4444',
      success: '#10b981',
      warning: '#f59e0b',
      info: '#334155'
    };

    toast.style.cssText = `
      background-color: ${colors[type] || colors.info};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
      pointer-events: auto;
      max-width: 300px;
      word-wrap: break-word;
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    }, 10);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (container.contains(toast)) container.removeChild(toast);
      }, 300);
    }, duration);
  }
}

// ----------------------------------------------------------------------------
// Firebase wrapper (same API surface)
class FirebaseService {
  constructor() {
    this.app = initializeApp(CONFIG.firebase);
    this.db = getFirestore(this.app);
    this.listeners = new Map();
  }

  users() { return collection(this.db, 'users'); }
  groups() { return collection(this.db, 'groups'); }
  tasks() { return collection(this.db, 'tasks'); }
  messages() { return collection(this.db, 'messages'); }

  async getDoc(collectionName, id) { return await getDoc(doc(this.db, collectionName, id)); }
  async addDoc(collectionName, data) { return await addDoc(collection(this.db, collectionName), data); }
  async updateDoc(collectionName, id, data) { return await updateDoc(doc(this.db, collectionName, id), data); }
  async deleteDoc(collectionName, id) { return await deleteDoc(doc(this.db, collectionName, id)); }

  async getDocs(collectionName, queryConstraints = []) {
    const ref = queryConstraints.length > 0
      ? query(collection(this.db, collectionName), ...queryConstraints)
      : collection(this.db, collectionName);
    return await getDocs(ref);
  }

  addListener(name, collectionName, callback, queryConstraints = []) {
    if (this.listeners.has(name)) this.removeListener(name);
    const ref = queryConstraints.length > 0
      ? query(collection(this.db, collectionName), ...queryConstraints)
      : collection(this.db, collectionName);
    const unsubscribe = onSnapshot(ref, callback);
    this.listeners.set(name, unsubscribe);
    return unsubscribe;
  }

  removeListener(name) {
    const unsubscribe = this.listeners.get(name);
    if (unsubscribe) { unsubscribe(); this.listeners.delete(name); }
  }

  removeAllListeners() {
    this.listeners.forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
  }
}

// ----------------------------------------------------------------------------
// DataStore (unchanged)
class DataStore {
  constructor() {
    this.users = new Map();
    this.groups = new Map();
    this.tasks = new Map();
    this.messages = new Map();
  }

  setUsers(userData) { this.users.clear(); userData.forEach(u => this.users.set(u.id, u)); }
  getUser(id) { return this.users.get(id); }
  getAllUsers() { return Array.from(this.users.values()); }
  getActiveUsers() { return this.getAllUsers().filter(u => u.status === 'active'); }
  getPendingUsers() { return this.getAllUsers().filter(u => u.status === 'pending'); }

  setGroups(groupData) { this.groups.clear(); groupData.forEach(g => this.groups.set(g.id, g)); }
  getGroup(id) { return this.groups.get(id); }
  getAllGroups() { return Array.from(this.groups.values()); }
  getUserGroups(userId) { return this.getAllGroups().filter(g => (g.members || []).includes(userId)); }

  setTasks(taskData) { this.tasks.clear(); taskData.forEach(t => this.tasks.set(t.id, t)); }
  getTask(id) { return this.tasks.get(id); }
  getAllTasks() { return Array.from(this.tasks.values()); }
  getUserTasks(userId) { return this.getAllTasks().filter(t => t.assignedTo === userId); }

  getTasksAssignedBy(userId) { return this.getAllTasks().filter(t => t.assignedBy === userId); }
  getActiveTasks(userId) { return this.getUserTasks(userId).filter(t => !t.archived && t.status !== 'completed'); }
  getCompletedTasks(userId) { return this.getUserTasks(userId).filter(t => !t.archived && t.status === 'completed'); }

  setMessages(messageData) { this.messages.clear(); messageData.forEach(m => this.messages.set(m.id, m)); }
  getMessage(id) { return this.messages.get(id); }
  getAllMessages() { return Array.from(this.messages.values()); }
  getGroupMessages(groupId) {
    return this.getAllMessages()
      .filter(m => m.groupId === groupId)
      .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
  }

  clear() { this.users.clear(); this.groups.clear(); this.tasks.clear(); this.messages.clear(); }
}

// ----------------------------------------------------------------------------
// Authentication manager (only nav-admin visibility restricted to director)
class AuthenticationManager {
  constructor(firebaseService, dataStore) {
    this.firebase = firebaseService;
    this.dataStore = dataStore;
    this.currentUser = null;
    this.setupEventListeners();
  }

  setupEventListeners() {
    const loginBtn = Utils.$('login-btn');
    const registerBtn = Utils.$('show-register');
    const logoutBtn = Utils.$('logout-btn');

    if (loginBtn) loginBtn.addEventListener('click', () => this.handleLogin());
    if (registerBtn) registerBtn.addEventListener('click', () => this.handleRegister());
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.handleLogout());

    const loginPassword = Utils.$('login-password');
    if (loginPassword) {
      loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter' && loginBtn) loginBtn.click(); });
    }
  }

  async handleLogin() {
    const usernameEl = Utils.$('login-username');
    const passwordEl = Utils.$('login-password');
    const username = usernameEl?.value.trim();
    const password = passwordEl?.value.trim();

    if (!username || !password) { Utils.showToast('Please enter username and password', 'error'); return; }

    try {
      const userDocs = await this.firebase.getDocs('users', [where('username', '==', username)]);
      if (userDocs.empty) { Utils.showToast('Invalid username or password', 'error'); return; }

      let foundUser = null;
      userDocs.forEach(docSnap => {
        const userData = docSnap.data();
        if (userData.password === password) foundUser = { id: docSnap.id, ...userData };
      });

      if (!foundUser) { Utils.showToast('Invalid username or password', 'error'); return; }
      if (foundUser.status !== 'active') { Utils.showToast('User account is not approved yet', 'error'); return; }

      this.currentUser = foundUser;
      this.onLoginSuccess();
    } catch (error) {
      console.error('Login failed:', error);
      Utils.showToast('Login error: ' + (error.message || error), 'error');
    }
  }

  async handleRegister() {
    const username = prompt('Choose a username (no spaces)');
    if (!username) return;
    const password = prompt('Choose a password');
    if (!password) return;

    try {
      const existingUsers = await this.firebase.getDocs('users', [where('username', '==', username)]);
      if (!existingUsers.empty) { Utils.showToast('Username is already taken', 'error'); return; }

      await this.firebase.addDoc('users', {
        username, password, role: 'user', status: 'pending', groups: [], createdAt: new Date().toISOString()
      });
      Utils.showToast('Registration successful. Please wait for director approval.', 'success');
    } catch (error) {
      console.error('Registration failed:', error);
      Utils.showToast('Registration failed', 'error');
    }
  }

  handleLogout() {
    try {
      this.firebase.removeAllListeners();
      this.dataStore.clear();
      this.currentUser = null;
      this.onLogoutSuccess();
    } catch (error) {
      console.error('Logout error:', error);
      Utils.showToast('Logout error', 'error');
    }
  }

  onLoginSuccess() {
    Utils.hideElement(Utils.$('login-view'));
    Utils.showElement(Utils.$('app-view'));
    Utils.showElement(Utils.$('logout-btn'));
    this.updateNavigationVisibility();
    window.app.onUserLogin(this.currentUser);
    Utils.showToast('Logged in successfully', 'success');
  }

  onLogoutSuccess() {
    Utils.showElement(Utils.$('login-view'));
    Utils.hideElement(Utils.$('app-view'));
    Utils.hideElement(Utils.$('logout-btn'));
    Utils.hideElement(Utils.$('nav-admin'));
    Utils.hideElement(Utils.$('create-group-btn'));
    window.app.onUserLogout();
    Utils.showToast('Logged out successfully', 'success');
  }

  updateNavigationVisibility() {
    // Show Admin nav only to directors
    Utils.toggleElement(Utils.$('nav-admin'), this.isDirector());

    // Keep create-group button for admins & directors (unchanged)
    Utils.toggleElement(Utils.$('create-group-btn'), this.isAdminOrDirector());
  }

  getCurrentUser() { return this.currentUser; }
  isAdminOrDirector() { return this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'director'); }
  isDirector() { return this.currentUser && this.currentUser.role === 'director'; }
}

// ----------------------------------------------------------------------------
// Navigation manager (unchanged)
class NavigationManager {
  constructor() {
    this.currentView = 'login';
    this.viewHistory = [];
    this.setupEventListeners();
  }

  setupEventListeners() {
    const navButtons = {
      'nav-dashboard': 'dashboard',
      'nav-groups': 'groups',
      'nav-admin': 'admin',
      'nav-profile': 'profile'
    };

    Object.entries(navButtons).forEach(([buttonId, view]) => {
      const button = Utils.$(buttonId);
      if (button) button.addEventListener('click', () => this.navigateTo(view));
    });

    const backBtn = Utils.$('back-btn');
    if (backBtn) backBtn.addEventListener('click', () => this.goBack());
  }

  navigateTo(view, options = {}) {
    try {
      if (options.resetHistory) this.viewHistory = [];
      else if (this.currentView && this.currentView !== view) this.viewHistory.push(this.currentView);

      this.showView(view);
      this.currentView = view;

      const backBtn = Utils.$('back-btn');
      Utils.toggleElement(backBtn, view !== 'dashboard' && view !== 'login');

      window.app.onViewChange(view);
    } catch (error) {
      console.warn('Navigation error:', error);
    }
  }

  goBack() {
    try {
      if (this.viewHistory.length > 0) {
        const previousView = this.viewHistory.pop();
        this.showView(previousView);
        this.currentView = previousView;
        const backBtn = Utils.$('back-btn');
        Utils.toggleElement(backBtn, previousView !== 'dashboard' && previousView !== 'login');
      } else {
        this.navigateTo('dashboard', { resetHistory: true });
      }
    } catch (error) {
      console.warn('Back navigation error:', error);
      this.navigateTo('dashboard', { resetHistory: true });
    }
  }

  showView(viewName) {
    this.hideAllViews();

    if (viewName === 'login') {
      Utils.showElement(Utils.$('login-view'));
      Utils.hideElement(Utils.$('app-view'));
      Utils.hideElement(Utils.$('back-btn'));
      return;
    }

    Utils.hideElement(Utils.$('login-view'));
    Utils.showElement(Utils.$('app-view'));

    const viewMap = {
      'dashboard': 'dashboard-view',
      'groups': 'groups-view',
      'groupChat': 'group-chat-view',
      'admin': 'admin-view',
      'profile': 'profile-view'
    };

    const viewElementId = viewMap[viewName];
    if (viewElementId) {
      const viewElement = Utils.$(viewElementId);
      if (viewElement) viewElement.classList.add('active');
    }
  }

  hideAllViews() {
    const views = ['dashboard-view', 'groups-view', 'group-chat-view', 'admin-view', 'profile-view'];
    views.forEach(viewId => {
      const v = Utils.$(viewId);
      if (v) v.classList.remove('active');
    });
  }

  clearHistory() { this.viewHistory = []; this.currentView = 'login'; Utils.hideElement(Utils.$('back-btn')); }
}

// ----------------------------------------------------------------------------
// UI Renderer (keeps previous rendering logic; no functional changes)
// - Note: createActiveTaskCard & group completion logic already allow group members
//   to mark a group task (task.groupId set, assignedTo may be null). So no change needed.
class UIRenderer {
  constructor(dataStore, authManager) {
    this.dataStore = dataStore;
    this.authManager = authManager;
  }

   renderProfile() {
    const user = this.authManager.getCurrentUser();
    if (!user) return;

    const profileContainer = Utils.$('profile-view');
    if (!profileContainer) return;

    const card = profileContainer.querySelector('.card');
    if (!card) return;
    Utils.clearElement(card);

    const infoDiv = document.createElement('div');
    infoDiv.innerHTML = `
      <div><strong id="profile-username-display">${user.username}</strong></div>
      <div class="muted" id="profile-role-display">${user.role}</div>
    `;
    card.appendChild(infoDiv);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn--outline';
    editBtn.textContent = 'Edit profile';
    editBtn.style.marginTop = '10px';
    card.appendChild(editBtn);

    const form = document.createElement('div');
    form.className = 'muted';
    form.style.marginTop = '12px';
    form.style.display = 'none';
    form.innerHTML = `
      <label style="display:block;margin-bottom:6px">
        New username
        <input id="profile-new-username" type="text" style="width:100%;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:inherit" />
      </label>
      <label style="display:block;margin-bottom:6px">
        New password
        <input id="profile-new-password" type="password" style="width:100%;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:inherit" />
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="profile-cancel-btn" class="btn btn--outline">Cancel</button>
        <button id="profile-save-btn" class="btn btn--primary">Save</button>
      </div>
    `;
    card.appendChild(form);

    editBtn.addEventListener('click', () => {
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
      const unameInput = Utils.$('profile-new-username');
      if (unameInput) unameInput.value = user.username;
      const pwdInput = Utils.$('profile-new-password');
      if (pwdInput) pwdInput.value = '';
    });

    const cancelBtn = card.querySelector('#profile-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { form.style.display = 'none'; });

    const saveBtn = card.querySelector('#profile-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      const newUsername = (Utils.$('profile-new-username')?.value || '').trim();
      const newPassword = (Utils.$('profile-new-password')?.value || '').trim();

      if (!newUsername && !newPassword) { Utils.showToast('No changes to save', 'info'); return; }

      try {
        // If username is changing, ensure uniqueness
        if (newUsername && newUsername !== user.username) {
          const existing = await window.app.firebase.getDocs('users', [where('username', '==', newUsername)]);
          if (!existing.empty) { Utils.showToast('Username already taken', 'error'); return; }
        }

        const updates = {};
        if (newUsername && newUsername !== user.username) updates.username = newUsername;
        if (newPassword) updates.password = newPassword;

        if (Object.keys(updates).length === 0) { Utils.showToast('No changes', 'info'); return; }

        await window.app.firebase.updateDoc('users', user.id, updates);

        // Update local copy
        const updatedUser = { ...user, ...updates };
        window.app.dataStore.users.set(user.id, updatedUser);
        window.app.authManager.currentUser = updatedUser;

        // Re-render areas that depend on username
        this.renderProfile();
        this.renderAssignedByMe();
        this.renderDashboardGroups();
        this.renderGroupsList();
        Utils.showToast('Profile updated', 'success');
        } catch (err) {
          console.error('Profile update failed', err);
          Utils.showToast('Failed to update profile', 'error');
        }
      });
  }

  // ---------------------------
  // renderDashboardGroups() - Groups + DMs list
  // ---------------------------
  renderDashboardGroups() {
    const container = Utils.$('groups-col');
    if (!container) return;
    Utils.clearElement(container);

    const user = this.authManager.getCurrentUser();
    if (!user) {
      container.innerHTML = '<p class="muted">Login to see groups.</p>';
      return;
    }

    const userGroups = this.dataStore.getUserGroups(user.id) || [];

    // Separate DMs (type==='dm') from normal groups if a type is available
    const dms = userGroups.filter(g => g.type === 'dm');
    const groups = userGroups.filter(g => g.type !== 'dm');

    // Render DMs
    if (dms.length > 0) {
      const dmHdr = document.createElement('div');
      dmHdr.className = 'muted';
      dmHdr.style.marginBottom = '8px';
      dmHdr.textContent = 'Direct messages';
      container.appendChild(dmHdr);

      dms.forEach(dm => {
        const card = document.createElement('div');
        card.className = 'card';
        const otherMemberNames = (dm.members || [])
          .filter(id => id !== user.id)
          .map(id => this.dataStore.getUser(id)?.username || id)
          .join(', ');
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>${dm.name || otherMemberNames || 'Direct message'}</strong>
              <div class="muted">${otherMemberNames}</div>
            </div>
            <div>
              <button class="btn btn--outline btn--small" data-action="open">Open</button>
            </div>
          </div>
        `;
        Utils.addButtonListeners(card, {
          '[data-action="open"]': () => window.app.openGroup(dm.id)
        });
        container.appendChild(card);
      });
    }

    // Render regular groups
    if (groups.length > 0) {
      const grpHdr = document.createElement('div');
      grpHdr.className = 'muted';
      grpHdr.style.margin = '12px 0 8px';
      grpHdr.textContent = 'Groups';
      container.appendChild(grpHdr);

      groups.forEach(group => {
        let groupCard = null;
        if (typeof this.createGroupCard === 'function') {
          groupCard = this.createGroupCard(group);
        } else {
          groupCard = document.createElement('div');
          groupCard.className = 'card';
          const members = (group.members || []).map(m => this.dataStore.getUser(m)?.username || m).join(', ');
          groupCard.innerHTML = `<div><strong>${group.name}</strong><div class="muted">Members: ${members}</div></div>`;
        }
        container.appendChild(groupCard);
      });
    }

    if (userGroups.length === 0) {
      container.innerHTML = '<p class="muted">No groups or DMs.</p>';
    }
  }


  // Render active tasks (oldest first) — TOP column (combined user-scoped view)
  renderDashboardTasks() {
    const container = Utils.$('tasks-col');
    if (!container) return;
    Utils.clearElement(container);

    const user = this.authManager.getCurrentUser();
    if (!user) { container.innerHTML = '<p class="muted">Login to see tasks.</p>'; return; }

    // all active tasks (not archived && not completed)
    const allTasks = this.dataStore.getAllTasks().filter(t => !t.archived && t.status !== 'completed');

    // Relevant if assignedTo OR assignedBy OR in a group the user is a member of
    const userRelevant = allTasks.filter(t => {
      if (t.assignedTo === user.id) return true;
      if (t.assignedBy === user.id) return true;
      if (t.groupId) {
        const group = this.dataStore.getGroup(t.groupId);
        if (group && (group.members || []).includes(user.id)) return true;
      }
      return false;
    });

    // dedupe by id
    const seen = new Set();
    const tasksList = [];
    userRelevant.forEach(t => {
      if (!seen.has(t.id)) { seen.add(t.id); tasksList.push(t); }
    });

    // sort oldest first by createdAt
    tasksList.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()));

    if (tasksList.length === 0) container.innerHTML = '<p class="muted">No active tasks for you.</p>';

    tasksList.forEach(task => {
      // pass option to allow creators to mark complete too
      const card = this.createActiveTaskCard(task, { showAssignee: true, allowMarkCompleteForCreator: true });
      container.appendChild(card);
    });
  }


   // Recently completed tasks (user-relevant). Assignee can Undo or Delete.
  renderCompletedTasks() {
    const container = Utils.$('completed-tasks-col');
    if (!container) return;
    Utils.clearElement(container);

    const user = this.authManager.getCurrentUser();
    if (!user) { container.innerHTML = '<p class="muted">Login to see recently completed tasks.</p>'; return; }

    // get tasks with status completed and not archived
    let completed = this.dataStore.getAllTasks().filter(t => t.status === 'completed' && !t.archived);

    // keep only tasks relevant to the user (assignedTo OR assignedBy OR group membership)
    completed = completed.filter(t => {
      if (t.assignedTo === user.id) return true;
      if (t.assignedBy === user.id) return true;
      if (t.groupId) {
        const group = this.dataStore.getGroup(t.groupId);
        if (group && (group.members || []).includes(user.id)) return true;
      }
      return false;
    });

    // Sort by completedAt desc (most recent first)
    completed.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

    if (completed.length === 0) {
      container.innerHTML = '<p class="muted">No recently completed tasks.</p>';
      return;
    }

    completed.forEach(task => {
      const card = document.createElement('div');
      card.className = 'card';
      if (task.urgent) card.classList.add('task-urgent');

      const creatorName = this.dataStore.getUser(task.assignedBy)?.username || task.assignedBy || 'Unknown';
      const assigneeName = task.assignedTo ? (this.dataStore.getUser(task.assignedTo)?.username || task.assignedTo) : (task.groupWide ? 'Group task' : 'Unassigned');

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="flex:1">
            <div style="font-weight:600">${Utils.escapeHtml(task.title || 'Untitled')}</div>
            <div class="muted" style="font-size:13px;margin-top:6px">
              Assigned by: ${Utils.escapeHtml(creatorName)} • To: ${Utils.escapeHtml(assigneeName)}
            </div>
            <div style="margin-top:8px;color:var(--muted)">${Utils.escapeHtml(task.description || '')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;margin-left:12px">
            <div>
              <button class="btn btn--outline btn--small" data-action="open">Open</button>
            </div>
            <div id="completed-action-${task.id}"></div>
          </div>
        </div>
      `;

      Utils.addButtonListeners(card, {
        '[data-action="open"]': () => window.app.openTask ? window.app.openTask(task.id) : (window.app.openTaskDetail ? window.app.openTaskDetail(task.id) : null)
      });

      const actionEl = card.querySelector(`#completed-action-${task.id}`);
      const isAssignee = user && task.assignedTo === user.id;

      // allow the assignee to undo or delete
      if (isAssignee) {
        const undoBtn = document.createElement('button');
        undoBtn.className = 'btn btn--outline btn--small';
        undoBtn.textContent = 'Undo';
        undoBtn.addEventListener('click', async () => {
          try {
            const nowIso = new Date().toISOString();
            await window.app.firebase.updateDoc('tasks', task.id, {
              status: 'in-progress',
              completedAt: null,
              completedBy: null,
              activityLog: [...(task.activityLog || []), { ts: nowIso, text: `${this.authManager.getCurrentUser().username} restored task` }]
            });
            if (window.app && window.app.dataStore) {
              const updated = { ...task, status: 'in-progress' };
              delete updated.completedAt;
              delete updated.completedBy;
              window.app.dataStore.tasks.set(task.id, updated);
            }
            window.app.onDataUpdate && window.app.onDataUpdate('tasks');
            Utils.showToast('Task restored to active', 'success');
          } catch (err) {
            console.error('Failed to undo completed', err);
            Utils.showToast('Failed to undo', 'error');
          }
        });
        actionEl.appendChild(undoBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn--danger btn--small';
        delBtn.style.marginTop = '6px';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this task permanently? This cannot be undone.')) return;
          try {
            await window.app.firebase.deleteDoc('tasks', task.id);
            if (window.app && window.app.dataStore) window.app.dataStore.tasks.delete(task.id);
            window.app.onDataUpdate && window.app.onDataUpdate('tasks');
            Utils.showToast('Task deleted', 'success');
          } catch (err) {
            console.error('Failed to delete task', err);
            Utils.showToast('Failed to delete', 'error');
          }
        });
        actionEl.appendChild(delBtn);
      }

      container.appendChild(card);
    });
  }
  renderAssignedByMe() {
    const container = Utils.$('assigned-by-me-col');
    if (!container) return;
    Utils.clearElement(container);

    const user = this.authManager.getCurrentUser();
    if (!user) { container.innerHTML = '<p class="muted">Login to see tasks you assigned.</p>'; return; }

    const assignedTasks = this.dataStore.getTasksAssignedBy(user.id)
      .filter(t => (t.assignedTo && t.assignedTo !== user.id));

    if (assignedTasks.length === 0) { container.innerHTML = '<p class="muted">No tasks assigned by you.</p>'; return; }

    const header = document.createElement('div');
    header.className = 'card';
    header.innerHTML = '<strong>Tasks you assigned</strong>';
    container.appendChild(header);

    assignedTasks.forEach(task => {
      const card = this.createAssignedByMeCard(task);
      container.appendChild(card);
    });
  }

  createAssignedByMeCard(task) {
    const card = document.createElement('div');
    card.className = 'card';

    const assignee = task.assignedTo ? (this.dataStore.getUser(task.assignedTo)?.username || task.assignedTo) : 'Unassigned';
    const status = task.status || 'in-progress';
    const dueText = task.dueDate ? ` • due ${Utils.formatDateShort(task.dueDate)}` : '';

    card.innerHTML = `
      <div>
        <strong>${task.title}</strong>
        <div class="muted">To: ${assignee} • ${status}${dueText}</div>
      </div>
      <div style="margin-top:8px">${task.description || ''}</div>
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn btn--outline btn--small" data-action="message">Message</button>
        ${this.authManager.isDirector() || this.authManager.getCurrentUser().id === task.assignedBy ? '<button class="btn btn--danger btn--small" data-action="revoke">Revoke</button>' : ''}
      </div>
    `;

    Utils.addButtonListeners(card, {
      '[data-action="message"]': () => {
        if (!task.assignedTo) { Utils.showToast('Task has no assignee to message', 'warning'); return; }
        (async () => {
          try {
            await window.app.firebase.addDoc('messages', {
              groupId: null,
              userId: this.authManager.getCurrentUser().id,
              content: `Reminder: Please update on task "${task.title}"`,
              type: 'reminder',
              parentMessageId: null,
              taskId: task.id,
              timestamp: new Date().toISOString(),
              mentions: [task.assignedTo]
            });
            Utils.showToast('Reminder sent', 'success');
          } catch (err) {
            console.error('Failed to send reminder', err);
            Utils.showToast('Failed to send reminder', 'error');
          }
        })();
      },
      '[data-action="revoke"]': () => {
        if (!confirm('Revoke assignment and unassign this task?')) return;
        (async () => {
          try {
            await window.app.firebase.updateDoc('tasks', task.id, { assignedTo: null });
            Utils.showToast('Task unassigned', 'success');
          } catch (err) {
            console.error('Failed to unassign task', err);
            Utils.showToast('Failed to unassign task', 'error');
          }
        })();
      }
    });

    return card;
  }

  // createActiveTaskCard(task, opts)
  // opts: { showAssignee: boolean, allowMarkCompleteForCreator: boolean }
  createActiveTaskCard(task, opts = {}) {
    const user = this.authManager.getCurrentUser();
    const card = document.createElement('div');
    card.className = 'card active-task-card';
    if (task.urgent) card.classList.add('task-urgent');

    const group = task.groupId ? this.dataStore.getGroup(task.groupId) : null;
    const groupText = group ? `Group: ${group.name}` : 'Personal';
    const dueText = task.dueDate ? ` • due ${Utils.formatDateShort(task.dueDate)}` : '';

    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const subtasksHtml = subtasks.map(st => {
      const checked = st.completed ? 'checked' : '';
      return `<label class="subtask-item"><input type="checkbox" data-subtask-id="${st.id}" ${checked}/> <span>${Utils.escapeHtml(st.title)}</span></label>`;
    }).join('');

    const log = Array.isArray(task.activityLog) ? task.activityLog.slice(-4).reverse() : [];
    const logHtml = log.map(entry => `<div>${Utils.formatDate(entry.ts)} • ${Utils.escapeHtml(entry.text)}</div>`).join('');

    const creatorName = this.dataStore.getUser(task.assignedBy)?.username || task.assignedBy || 'Unknown';
    const assigneeName = task.assignedTo ? (this.dataStore.getUser(task.assignedTo)?.username || task.assignedTo) : (task.groupWide ? 'Group task' : 'Unassigned');

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="flex:1">
          <div style="font-weight:600">${Utils.escapeHtml(task.title || 'Untitled')}</div>
          <div class="muted" style="font-size:13px;margin-top:6px">
            Assigned by: ${Utils.escapeHtml(creatorName)} • To: ${Utils.escapeHtml(assigneeName)} ${dueText}
          </div>
          <div style="margin-top:8px;color:var(--muted)">${Utils.escapeHtml(task.description || '')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;margin-left:12px">
          <div>
            <button class="btn btn--outline btn--small" data-action="open">Open</button>
          </div>
          <div id="task-action-area-${task.id}"></div>
        </div>
      </div>

      <div style="margin-top:8px" class="subtasks">${subtasksHtml || '<div class="muted">No subtasks</div>'}</div>

      <div class="activity-log" style="margin-top:8px">${logHtml || '<div class="muted">No recent activity</div>'}</div>
    `;

    Utils.addButtonListeners(card, {
      '[data-action="open"]': () => window.app.openTask ? window.app.openTask(task.id) : (window.app.openTaskDetail ? window.app.openTaskDetail(task.id) : null)
    });

    const actionArea = card.querySelector(`#task-action-area-${task.id}`);

    const isAssignee = user && task.assignedTo === user.id;
    const isAssigner = user && task.assignedBy === user.id;
    const allowAssignerMark = !!opts.allowMarkCompleteForCreator;

    // If assignee OR (assigner and allowAssignerMark) => show mark complete button
    if ((isAssignee || (isAssigner && allowAssignerMark)) && task.status !== 'completed') {
      const markBtn = document.createElement('button');
      markBtn.className = 'btn btn--primary btn--small';
      markBtn.textContent = 'Mark Completed';
      markBtn.addEventListener('click', async () => {
        try {
          const nowIso = new Date().toISOString();
          await window.app.firebase.updateDoc('tasks', task.id, {
            status: 'completed',
            completedAt: nowIso,
            completedBy: this.authManager.getCurrentUser().id,
            activityLog: [...(task.activityLog || []), { ts: nowIso, text: `${this.authManager.getCurrentUser().username} completed task` }]
          });
          // update local store (if used)
          if (window.app && window.app.dataStore) {
            const updated = { ...task, status: 'completed', completedAt: nowIso, completedBy: this.authManager.getCurrentUser().id };
            window.app.dataStore.tasks.set(task.id, updated);
          }
          window.app.onDataUpdate && window.app.onDataUpdate('tasks');
          Utils.showToast('Marked completed', 'success');
        } catch (err) {
          console.error('Failed to mark complete', err);
          Utils.showToast('Failed to mark complete', 'error');
        }
      });
      actionArea.appendChild(markBtn);
    }

    return card;
  }
  createCompletedTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'card';
    if (task.urgent) card.classList.add('task-urgent');

    const dueText = task.dueDate ? ` • due ${Utils.formatDateShort(task.dueDate)}` : '';

    let completedByText = '';
    if (task.completedAt) {
      const completedByName = this.dataStore.getUser(task.completedBy)?.username || task.completedBy || '';
      if (this.authManager.isAdminOrDirector() || this.authManager.getCurrentUser()?.id === task.assignedBy) {
        completedByText = ` • completed by ${completedByName} at ${Utils.formatDate(task.completedAt)}`;
      } else {
        completedByText = ` • completed at ${Utils.formatDate(task.completedAt)}`;
      }
    }

    const log = Array.isArray(task.activityLog) ? task.activityLog.slice(-4).reverse() : [];
    const logHtml = log.map(entry => `<div>${Utils.formatDate(entry.ts)} • ${entry.text}</div>`).join('');

    card.innerHTML = `
      <div>
        <strong>${task.title}</strong>
        <div class="muted">Completed: ${Utils.formatDate(task.completedAt) || ''}${dueText}${completedByText}</div>
      </div>

      <div style="margin-top:8px">${task.description || ''}</div>

      <div class="activity-log">${logHtml || '<div class="muted">No recent activity</div>'}</div>

      <div style="margin-top:8px">
        <button class="btn btn--outline btn--small" data-action="undo">Undo</button>
        ${this.authManager.isAdminOrDirector() ? '<button class="btn btn--danger btn--small" data-action="delete">Delete</button>' : ''}
      </div>
    `;

    Utils.addButtonListeners(card, {
      '[data-action="undo"]': () => window.app.uncompleteTask(task.id),
      '[data-action="delete"]': () => window.app.deleteTask(task.id)
    });

    return card;
  }

  renderGroupsList() {
    const container = Utils.$('groups-list');
    if (!container) return;
    Utils.clearElement(container);

    const user = this.authManager.getCurrentUser();
    if (!user) { container.innerHTML = '<p class="muted">Login to see groups.</p>'; return; }

    const userGroups = this.dataStore.getUserGroups(user.id);
    if (userGroups.length === 0) { container.innerHTML = '<p class="muted">No groups.</p>'; return; }

    userGroups.forEach(group => { const groupCard = this.createGroupListCard(group); container.appendChild(groupCard); });
  }

  createGroupListCard(group) {
    const card = document.createElement('div');
    card.className = 'card';

    const members = (group.members || []).map(memberId => this.dataStore.getUser(memberId)?.username || memberId).join(', ');
    const canDelete = this.authManager.isAdminOrDirector() && (group.admins || []).includes(this.authManager.getCurrentUser().id);

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong>${group.name}</strong>
          <div class="muted">Members: ${members}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn--outline btn--small" data-action="open">Open</button>
          ${canDelete ? '<button class="btn btn--danger btn--small" data-action="delete">Delete</button>' : ''}
        </div>
      </div>
    `;

    Utils.addButtonListeners(card, {
      '[data-action="open"]': () => window.app.openGroup(group.id),
      '[data-action="delete"]': () => window.app.deleteGroup(group)
    });

    return card;
  }

  renderGroupTasks(groupId) {
    const container = Utils.$('group-tasks-list');
    if (!container) return;
    Utils.clearElement(container);

    const group = this.dataStore.getGroup(groupId);
    if (!group) { container.innerHTML = '<p class="muted">Group not found</p>'; return; }

    const pending = this.dataStore.getAllTasks().filter(t => t.groupId === groupId && !t.archived && t.status !== 'completed');

    if (pending.length === 0) { container.innerHTML = '<p class="muted">No pending tasks for this group.</p>'; return; }

    pending.forEach(task => {
      const taskCard = this.createGroupTaskCard(task);
      container.appendChild(taskCard);
    });
  }

  createGroupTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'card';

    const assignee = task.assignedTo ? (this.dataStore.getUser(task.assignedTo)?.username || task.assignedTo) : (task.groupWide ? 'Group task' : 'Unassigned');
    const dueText = task.dueDate ? ` • due ${Utils.formatDateShort(task.dueDate)}` : '';

    card.innerHTML = `
      <div>
        <strong>${task.title}</strong>
        <div class="muted">To: ${assignee}${dueText}</div>
      </div>
      <div style="margin-top:8px">${task.description || ''}</div>
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn btn--primary btn--small" data-action="complete">Mark Completed</button>
      </div>
    `;

    Utils.addButtonListeners(card, {
      '[data-action="complete"]': () => window.app.completeTaskFromMessage(task.id)
    });

    return card;
  }

  renderChat(groupId) {
    this.renderGroupTasks(groupId);

    const container = Utils.$('chat-messages');
    if (!container) return;
    Utils.clearElement(container);

    const messages = this.dataStore.getGroupMessages(groupId);
    messages.forEach(message => {
      const messageElement = this.createMessageElement(message);
      container.appendChild(messageElement);
    });

    container.scrollTop = container.scrollHeight;
  }

  createMessageElement(message) {
    const div = document.createElement('div');
    div.className = 'message';

    const sender = this.dataStore.getUser(message.userId);
    const senderName = sender?.username || message.userId;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${senderName} • ${Utils.formatDate(message.timestamp)}`;
    div.appendChild(meta);

    if ((message.type === 'task-assignment' || message.type === 'private-task') && message.taskId) {
      const task = this.dataStore.getTask(message.taskId);
      if (task) {
        const taskContainer = document.createElement('div');
        taskContainer.style.marginTop = '6px';
        taskContainer.style.padding = '8px';
        taskContainer.style.borderRadius = '8px';
        taskContainer.style.background = 'rgba(255,255,255,0.02)';
        taskContainer.style.display = 'flex';
        taskContainer.style.flexDirection = 'column';
        taskContainer.style.gap = '8px';

        const titleRow = document.createElement('div');
        titleRow.innerHTML = `<strong>${task.title}</strong> <span class="muted" style="margin-left:8px">${task.priority || 'medium'}${task.dueDate ? ' • due ' + Utils.formatDateShort(task.dueDate) : ''}</span>`;
        taskContainer.appendChild(titleRow);

        const descRow = document.createElement('div');
        descRow.textContent = task.description || '';
        taskContainer.appendChild(descRow);

        if (Array.isArray(message.mentions) && message.mentions.length > 0) {
          const mentionsDiv = document.createElement('div');
          mentionsDiv.className = 'muted';
          const mentionedUsers = message.mentions.map(id => this.dataStore.getUser(id)?.username || id).join(', ');
          mentionsDiv.textContent = `Mentioned: ${mentionedUsers}`;
          taskContainer.appendChild(mentionsDiv);
        }

        const assignmentRow = document.createElement('div');
        assignmentRow.style.display = 'flex';
        assignmentRow.style.justifyContent = 'space-between';
        assignmentRow.style.alignItems = 'center';

        const leftInfo = document.createElement('div');
        const assigneeName = task.assignedTo ? (this.dataStore.getUser(task.assignedTo)?.username || task.assignedTo) : (task.groupWide ? 'Group task' : 'Unassigned');
        leftInfo.textContent = `To: ${assigneeName}`;
        assignmentRow.appendChild(leftInfo);

        const rightControls = document.createElement('div');
        const currentUser = this.authManager.getCurrentUser();
        const group = this.dataStore.getGroup(this.currentGroup?.id);
        const isGroupMember = group ? (group.members || []).includes(currentUser?.id) : false;
        const isAssignedUser = currentUser && task.assignedTo === currentUser.id;
        const canMarkCompleted = (task.groupId && isGroupMember) || (!task.groupId && isAssignedUser) || (task.groupId && task.assignedTo == null && isGroupMember);

        if (task.status !== 'completed' && canMarkCompleted) {
          const markBtn = document.createElement('button');
          markBtn.className = 'btn btn--primary btn--small';
          markBtn.textContent = 'Mark Completed';
          markBtn.addEventListener('click', () => { window.app.completeTaskFromMessage(task.id); });
          rightControls.appendChild(markBtn);
        } else if (task.status === 'completed') {
          const completedBadge = document.createElement('span');
          completedBadge.className = 'muted';
          const completedByName = this.dataStore.getUser(task.completedBy)?.username || task.completedBy || '';
          const completedInfo = `Completed${task.completedAt ? ' at ' + Utils.formatDate(task.completedAt) : ''}`;
          if (this.authManager.isAdminOrDirector() || currentUser?.id === task.assignedBy) {
            completedBadge.textContent = `${completedInfo} by ${completedByName}`;
          } else {
            completedBadge.textContent = completedInfo;
          }
          rightControls.appendChild(completedBadge);
        }

        assignmentRow.appendChild(rightControls);
        taskContainer.appendChild(assignmentRow);
        div.appendChild(taskContainer);
      } else {
        const content = document.createElement('div');
        content.textContent = message.content;
        div.appendChild(content);
      }
    } else {
      const content = document.createElement('div');
      content.textContent = message.content;
      div.appendChild(content);

      if (Array.isArray(message.mentions) && message.mentions.length > 0) {
        const mentionsDiv = document.createElement('div');
        mentionsDiv.className = 'muted';
        const mentionedUsers = message.mentions.map(userId => this.dataStore.getUser(userId)?.username || userId).join(', ');
        mentionsDiv.textContent = `Mentioned: ${mentionedUsers}`;
        div.appendChild(mentionsDiv);
      }
    }

    const currentUser = this.authManager.getCurrentUser();
    if (currentUser && Array.isArray(message.mentions) && message.mentions.includes(currentUser.id)) {
      div.classList.add('mentioned');
    }

    return div;
  }

  renderPendingUsers() {
    const container = Utils.$('pending-users-list');
    if (!container) return;
    Utils.clearElement(container);

    if (!this.authManager.isDirector()) {
      container.innerHTML = '<p class="muted">Only director can see pending approvals.</p>';
      return;
    }

    const pendingUsers = this.dataStore.getPendingUsers();
    if (pendingUsers.length === 0) { container.innerHTML = '<p class="muted">No pending users.</p>'; return; }

    pendingUsers.forEach(user => { const userCard = this.createPendingUserCard(user); container.appendChild(userCard); });
  }

  createPendingUserCard(user) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>${user.username}</strong><div class="muted">${Utils.formatDateShort(user.createdAt)}</div></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn--primary btn--small" data-action="approve">Approve</button>
          <button class="btn btn--danger btn--small" data-action="remove">Remove</button>
        </div>
      </div>
    `;
    Utils.addButtonListeners(card, {
      '[data-action="approve"]': () => window.app.approveUser(user.id),
      '[data-action="remove"]': () => window.app.removeUser(user.id)
    });
    return card;
  }

  renderUserManagement() {
    const container = Utils.$('user-list');
    if (!container) return;
    Utils.clearElement(container);

    if (!this.authManager.isDirector()) {
      container.innerHTML = '<p class="muted">Only director can manage users.</p>';
      return;
    }

    const activeUsers = this.dataStore.getActiveUsers();
    if (activeUsers.length === 0) { container.innerHTML = '<p class="muted">No users.</p>'; return; }

    activeUsers.forEach(user => { const userCard = this.createUserManagementCard(user); container.appendChild(userCard); });
  }

  createUserManagementCard(user) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>${user.username}</strong><div class="muted">Role: ${user.role}</div></div>
        <div style="display:flex;gap:6px">
          <button class="btn btn--outline btn--small" data-action="set-user">User</button>
          <button class="btn btn--outline btn--small" data-action="set-admin">Admin</button>
          <button class="btn btn--outline btn--small" data-action="set-director">Director</button>
          <button class="btn btn--danger btn--small" data-action="remove">Remove</button>
        </div>
      </div>
    `;
    Utils.addButtonListeners(card, {
      '[data-action="set-user"]': () => window.app.changeUserRole(user.id, 'user'),
      '[data-action="set-admin"]': () => window.app.changeUserRole(user.id, 'admin'),
      '[data-action="set-director"]': () => window.app.changeUserRole(user.id, 'director'),
      '[data-action="remove"]': () => window.app.removeUser(user.id)
    });
    return card;
  }

   renderDirectorTasks() {
    const container = Utils.$('director-tasks-list');
    if (!container) return;
    Utils.clearElement(container);

    if (!this.authManager.isDirector()) {
      container.innerHTML = '<p class="muted">Only director can access this view.</p>';
      return;
    }

    const users = this.dataStore.getAllUsers() || [];
    // Header + filter
    const header = document.createElement('div');
    header.className = 'card';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '12px';
    header.innerHTML = `
      <div style="font-weight:600">Director - Remaining Tasks</div>
      <div>
        <select id="director-user-filter" style="padding:6px;border-radius:6px;">
          <option value="">All users</option>
          ${users.map(u => `<option value="${u.id}">${u.username || u.id}</option>`).join('')}
        </select>
      </div>
    `;
    container.appendChild(header);

    const listContainer = document.createElement('div');
    listContainer.id = 'director-tasks-list-body';
    container.appendChild(listContainer);

    const renderList = (filterUserId = '') => {
      Utils.clearElement(listContainer);
      let tasks = this.dataStore.getAllTasks().filter(t => !t.archived && t.status !== 'completed');
      if (filterUserId) {
        tasks = tasks.filter(t => t.assignedTo === filterUserId);
      }
      // sort oldest first
      tasks.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()));
      if (tasks.length === 0) {
        listContainer.innerHTML = '<p class="muted">No remaining tasks organization-wide.</p>';
        return;
      }
      tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'card';
        const assignedByName = this.dataStore.getUser(task.assignedBy)?.username || task.assignedBy || 'Unknown';
        const assignee = task.assignedTo ? (this.dataStore.getUser(task.assignedTo)?.username || task.assignedTo) : 'Unassigned';
        const dueText = task.dueDate ? ` • due ${Utils.formatDateShort(task.dueDate)}` : '';
        const completedByText = (task.status === 'completed' && task.completedAt) ? ` • completed by ${this.dataStore.getUser(task.completedBy)?.username || task.completedBy} at ${Utils.formatDate(task.completedAt)}` : '';
        card.innerHTML = `
          <div>
            <strong>${Utils.escapeHtml(task.title || 'Untitled')}</strong>
            <div class="muted">Assigned by: ${Utils.escapeHtml(assignedByName)} • To: ${Utils.escapeHtml(assignee)}${dueText}${completedByText}</div>
          </div>
          <div style="margin-top:8px">${Utils.escapeHtml(task.description || '')}</div>
        `;
        listContainer.appendChild(card);
      });
    };

    // initial render (all)
    renderList('');

    const sel = Utils.$('director-user-filter');
    if (sel) {
      sel.addEventListener('change', (e) => {
        renderList(e.target.value);
      });
    }
  }
}

// ----------------------------------------------------------------------------
// ModalManager (updated Create Task behavior: SINGLE shared group task when assign-to-entire-group)
class ModalManager {
  constructor(dataStore, authManager, firebaseService) {
    this.dataStore = dataStore;
    this.authManager = authManager;
    this.firebase = firebaseService;
    this.setupEventListeners();
  }

  setupEventListeners() {
    const createGroupBtn = Utils.$('create-group-btn');
    if (createGroupBtn) createGroupBtn.addEventListener('click', () => this.showCreateGroupModal());

    const createTaskBtn = Utils.$('create-task-btn');
    if (createTaskBtn) createTaskBtn.addEventListener('click', () => this.showCreateTaskModal());

    const newDmBtn = Utils.$('new-dm-btn');
    if (newDmBtn) newDmBtn.addEventListener('click', () => this.showCreateDMModal());

    this.setupModalButtons();
  }

  setupModalButtons() {
    const modals = [
      { modal: 'modal-create-group', confirm: 'create-group-confirm', cancel: 'create-group-cancel', handler: () => this.handleCreateGroup() },
      { modal: 'modal-create-task', confirm: 'create-task-confirm', cancel: 'create-task-cancel', handler: () => this.handleCreateTask() },
      { modal: 'modal-create-dm', confirm: 'create-dm-confirm', cancel: 'create-dm-cancel', handler: () => this.handleCreateDM() }
    ];

    modals.forEach(({ modal, confirm, cancel, handler }) => {
      const confirmBtn = Utils.$(confirm);
      const cancelBtn = Utils.$(cancel);
      const modalEl = Utils.$(modal);

      if (confirmBtn) confirmBtn.addEventListener('click', handler);
      if (cancelBtn) cancelBtn.addEventListener('click', () => Utils.hideElement(modalEl));
    });
  }

  showCreateGroupModal() {
    if (!this.authManager.isAdminOrDirector()) { Utils.showToast('Only admins and directors can create groups', 'error'); return; }
    const modal = Utils.$('modal-create-group');
    const membersContainer = Utils.$('members-checkboxes');
    const adminsContainer = Utils.$('admins-checkboxes');
    const nameInput = Utils.$('group-name');
    Utils.clearElement(membersContainer);
    Utils.clearElement(adminsContainer);
    if (nameInput) nameInput.value = '';

    const activeUsers = this.dataStore.getActiveUsers();
    activeUsers.forEach(user => {
      if (membersContainer) {
        const memberDiv = document.createElement('div');
        memberDiv.innerHTML = `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" value="${user.id}" /><span>${user.username}</span></label>`;
        membersContainer.appendChild(memberDiv);
      }
      if (adminsContainer) {
        const adminDiv = document.createElement('div');
        adminDiv.innerHTML = `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" value="${user.id}" /><span>${user.username}</span></label>`;
        adminsContainer.appendChild(adminDiv);
      }
    });

    Utils.showElement(modal);
  }

  async handleCreateGroup() {
    const nameInput = Utils.$('group-name');
    const membersContainer = Utils.$('members-checkboxes');
    const adminsContainer = Utils.$('admins-checkboxes');
    const modal = Utils.$('modal-create-group');

    const name = nameInput?.value.trim();
    if (!name) { Utils.showToast('Group name is required', 'error'); return; }

    const memberIds = membersContainer ? Array.from(membersContainer.querySelectorAll('input:checked')).map(input => input.value) : [];
    const adminIds = adminsContainer ? Array.from(adminsContainer.querySelectorAll('input:checked')).map(input => input.value) : [];

    if (adminIds.length === 0) { Utils.showToast('Please select at least one admin', 'error'); return; }

    try {
      const groupData = { name, members: memberIds, admins: adminIds, type: 'team', createdAt: new Date().toISOString() };
      const groupRef = await this.firebase.addDoc('groups', groupData);

      for (const userId of memberIds) {
        try {
          const userDoc = await this.firebase.getDoc('users', userId);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const userGroups = userData.groups || [];
            if (!userGroups.includes(groupRef.id)) {
              await this.firebase.updateDoc('users', userId, { groups: [...userGroups, groupRef.id] });
            }
          }
        } catch (error) {
          console.warn('Failed to update user groups:', error);
        }
      }

      Utils.showToast('Group created successfully', 'success');
      Utils.hideElement(modal);
    } catch (error) {
      console.error('Create group failed:', error);
      Utils.showToast('Failed to create group', 'error');
    }
  }

  // Inject Create Task modal (unchanged layout; handler below adjusted to allow group-wide)
  showCreateTaskModal() {
    const modal = Utils.$('modal-create-task');
    if (!modal) { Utils.showToast('Create Task modal not found', 'error'); return; }

    modal.innerHTML = `
      <div class="modal-content" style="padding:24px; display:flex; flex-direction:column; gap:12px; min-width:720px;">
        <h2 style="margin:0 0 8px 0">Create Task</h2>

        <div style="display:flex;gap:12px;align-items:center">
          <label style="min-width:60px">Title</label>
          <input id="task-title" style="flex:1; padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06)" />
          <label style="min-width:80px">Assign to</label>
          <select id="task-assign-to" style="min-width:180px;padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.06)"></select>
        </div>

        <div style="display:flex;gap:12px;align-items:center">
          <label style="min-width:60px">Description</label>
          <input id="task-desc" style="flex:1; padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06)" />
          <label style="min-width:60px">Group (optional)</label>
          <select id="task-group" style="min-width:220px;padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.06)"></select>
        </div>

        <div style="display:flex;gap:12px;align-items:center">
          <label style="min-width:60px">Due date</label>
          <input id="task-due-date" type="date" style="padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06)" />
          <label style="display:flex;align-items:center;gap:8px">
            <input id="assign-to-entire-group" type="checkbox" /> Assign to entire group
          </label>
          <label style="display:flex;align-items:center;gap:8px">
            <input id="mark-urgent" type="checkbox" /> Mark as Urgent
          </label>
        </div>

        <div style="display:flex;gap:12px;align-items:flex-start">
          <label style="min-width:60px">Subtasks</label>
          <textarea id="task-subtasks" placeholder="One subtask per line" style="flex:1;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);min-height:80px"></textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:12px">
          <button id="create-task-cancel" class="btn btn--outline">Cancel</button>
          <button id="create-task-confirm" class="btn btn--primary">Create Task</button>
        </div>
      </div>
    `;

    const assignToSelect = Utils.$('task-assign-to');
    const groupSelect = Utils.$('task-group');

    if (assignToSelect) {
      Utils.clearElement(assignToSelect);
      const activeUsers = this.dataStore.getActiveUsers();
      activeUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.username;
        assignToSelect.appendChild(option);
      });
    }

    if (groupSelect) {
      Utils.clearElement(groupSelect);
      const noGroupOption = document.createElement('option');
      noGroupOption.value = '';
      noGroupOption.textContent = '(no group - create/reuse DM)';
      groupSelect.appendChild(noGroupOption);

      const currentUser = this.authManager.getCurrentUser();
      const userGroups = currentUser ? this.dataStore.getUserGroups(currentUser.id) : [];
      userGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        groupSelect.appendChild(option);
      });
    }

    const interlink = () => {
      const currentUser = this.authManager.getCurrentUser();
      if (!currentUser) return;

      assignToSelect?.addEventListener('change', () => {
        const assigneeId = assignToSelect.value;
        if (!groupSelect) return;
        Utils.clearElement(groupSelect);
        const noGroupOption = document.createElement('option');
        noGroupOption.value = '';
        noGroupOption.textContent = '(no group - create/reuse DM)';
        groupSelect.appendChild(noGroupOption);

        const possibleGroups = this.dataStore.getAllGroups().filter(g => {
          const members = g.members || [];
          return members.includes(currentUser.id) && members.includes(assigneeId);
        });

        possibleGroups.forEach(g => {
          const option = document.createElement('option');
          option.value = g.id;
          option.textContent = g.name;
          groupSelect.appendChild(option);
        });
      });

      groupSelect?.addEventListener('change', () => {
        const groupId = groupSelect.value;
        if (!assignToSelect) return;
        Utils.clearElement(assignToSelect);
        if (!groupId) {
          const activeUsers = this.dataStore.getActiveUsers();
          activeUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.username;
            assignToSelect.appendChild(option);
          });
          return;
        }
        const group = this.dataStore.getGroup(groupId);
        if (group) {
          (group.members || []).forEach(memberId => {
            const user = this.dataStore.getUser(memberId);
            const option = document.createElement('option');
            option.value = memberId;
            option.textContent = user?.username || memberId;
            assignToSelect.appendChild(option);
          });
        }
      });
    };

    interlink();

    const confirmBtn = Utils.$('create-task-confirm');
    const cancelBtn = Utils.$('create-task-cancel');
    if (confirmBtn) confirmBtn.addEventListener('click', () => this.handleCreateTask());
    if (cancelBtn) cancelBtn.addEventListener('click', () => Utils.hideElement(modal));

    Utils.showElement(modal);
  }

  // Modified: create one shared task for the group when assign-to-entire-group is checked.
  async handleCreateTask() {
    const titleInput = Utils.$('task-title');
    const descInput = Utils.$('task-desc');
    const assignToSelect = Utils.$('task-assign-to');
    const groupSelect = Utils.$('task-group');
    const dueDateInput = Utils.$('task-due-date');
    const modal = Utils.$('modal-create-task');

    const title = titleInput?.value.trim();
    const description = descInput?.value.trim();
    const assignedTo = assignToSelect?.value;
    let groupId = groupSelect?.value || null;
    const dueDateRaw = dueDateInput?.value?.trim();
    const dueDate = dueDateRaw ? new Date(dueDateRaw).toISOString() : null;

    const assignToEntireGroupEl = Utils.$('assign-to-entire-group');
    const assignToEntireGroup = !!assignToEntireGroupEl && assignToEntireGroupEl.checked;
    const urgentEl = Utils.$('mark-urgent');
    const urgent = !!urgentEl && urgentEl.checked;
    const subtasksRaw = Utils.$('task-subtasks')?.value || '';
    const subtasks = subtasksRaw.split('\n').map(s => s.trim()).filter(s => s).map(s => ({
      id: Utils.uid('sub'),
      title: s,
      completed: false,
      completedAt: null,
      completedBy: null
    }));

    // Validation: title required. If not assigning to entire group, need assignee.
    if (!title || (!assignedTo && !assignToEntireGroup)) {
      Utils.showToast('Please fill in title and assignee (or check Assign to entire group)', 'error');
      return;
    }

    try {
      const assignerId = this.authManager.getCurrentUser().id;
      if (!groupId) {
        // keep existing DM behavior if no group chosen
        const existingDM = this.dataStore.getAllGroups().find(g => {
          if (g.type !== 'dm') return false;
          const members = g.members || [];
          return members.includes(assignerId) && members.includes(assignedTo) && members.length === 2;
        });

        if (existingDM) groupId = existingDM.id;
        else {
          const otherUser = this.dataStore.getUser(assignedTo);
          const dmData = {
            name: `DM: ${otherUser?.username || assignedTo}`,
            members: [assignerId, assignedTo],
            admins: [],
            type: 'dm',
            createdAt: new Date().toISOString()
          };
          const dmRef = await this.firebase.addDoc('groups', dmData);

          for (const userId of [assignerId, assignedTo]) {
            try {
              const userDoc = await this.firebase.getDoc('users', userId);
              if (userDoc.exists()) {
                const userData = userDoc.data();
                const userGroups = userData.groups || [];
                if (!userGroups.includes(dmRef.id)) {
                  await this.firebase.updateDoc('users', userId, { groups: [...userGroups, dmRef.id] });
                }
              }
            } catch (err) {
              console.warn('Failed to update user groups for DM:', err);
            }
          }

          groupId = dmRef.id;
        }
      }

      // If assign-to-entire-group AND group exists: create a single shared task (groupWide)
      if (assignToEntireGroup && groupId) {
        const taskData = {
          title,
          description,
          assignedBy: this.authManager.getCurrentUser().id,
          // assignedTo null indicates it's group-level; groupWide flag clarifies intent
          assignedTo: null,
          status: 'in-progress',
          priority: 'medium',
          dueDate: dueDate,
          groupId: groupId,
          private: false,
          archived: false,
          urgent: urgent || false,
          subtasks: subtasks,
          activityLog: [{ ts: new Date().toISOString(), text: `Shared group task created by ${this.authManager.getCurrentUser().username}` }],
          groupWide: true,
          createdAt: new Date().toISOString(),
          completedAt: null,
          completedBy: null
        };

        const taskRef = await this.firebase.addDoc('tasks', taskData);

        // Post a notification message to the group referencing the created task
        let content = `Group task created: ${title}`;
        if (dueDate) content += ` (due ${Utils.formatDateShort(dueDate)})`;
        await this.firebase.addDoc('messages', {
          groupId,
          userId: this.authManager.getCurrentUser().id,
          content,
          type: 'task-assignment',
          parentMessageId: null,
          taskId: taskRef.id,
          timestamp: new Date().toISOString()
        });

        Utils.showToast('Shared group task created', 'success');
        Utils.hideElement(modal);
        return;
      }

      // Default: single-user assignment (unchanged)
      const taskData = {
        title,
        description,
        assignedBy: this.authManager.getCurrentUser().id,
        assignedTo,
        status: 'in-progress',
        priority: 'medium',
        dueDate: dueDate,
        groupId: groupId,
        private: false,
        archived: false,
        urgent: urgent || false,
        subtasks: subtasks,
        activityLog: [{ ts: new Date().toISOString(), text: 'Task created' }],
        createdAt: new Date().toISOString(),
        completedAt: null,
        completedBy: null
      };

      const taskRef = await this.firebase.addDoc('tasks', taskData);

      if (groupId) {
        let content = `Task assigned: ${title}`;
        if (dueDate) content += ` (due ${Utils.formatDateShort(dueDate)})`;
        await this.firebase.addDoc('messages', {
          groupId,
          userId: this.authManager.getCurrentUser().id,
          content,
          type: 'task-assignment',
          parentMessageId: null,
          taskId: taskRef.id,
          timestamp: new Date().toISOString()
        });
      }

      Utils.showToast('Task created successfully', 'success');
      Utils.hideElement(modal);
    } catch (error) {
      console.error('Create task failed:', error);
      Utils.showToast('Failed to create task', 'error');
    }
  }

  showCreateDMModal() {
    const modal = Utils.$('modal-create-dm');
    const userSelect = Utils.$('dm-user-select');

    if (userSelect) {
      Utils.clearElement(userSelect);
      const activeUsers = this.dataStore.getActiveUsers();
      const currentUserId = this.authManager.getCurrentUser().id;

      activeUsers
        .filter(user => user.id !== currentUserId)
        .forEach(user => {
          const option = document.createElement('option');
          option.value = user.id;
          option.textContent = user.username;
          userSelect.appendChild(option);
        });
    }

    Utils.showElement(modal);
  }

  async handleCreateDM() {
    const userSelect = Utils.$('dm-user-select');
    const modal = Utils.$('modal-create-dm');

    const otherUserId = userSelect?.value;
    if (!otherUserId) { Utils.showToast('Please select a user', 'error'); return; }

    try {
      const currentUserId = this.authManager.getCurrentUser().id;
      const existingDM = this.dataStore.getAllGroups().find(group =>
        group.type === 'dm' &&
        (group.members || []).includes(currentUserId) &&
        (group.members || []).includes(otherUserId)
      );

      if (existingDM) {
        Utils.hideElement(modal);
        window.app.openGroup(existingDM.id);
        return;
      }

      const otherUser = this.dataStore.getUser(otherUserId);
      const dmData = {
        name: `DM: ${otherUser?.username || otherUserId}`,
        members: [currentUserId, otherUserId],
        admins: [],
        type: 'dm',
        createdAt: new Date().toISOString()
      };

      const dmRef = await this.firebase.addDoc('groups', dmData);

      for (const userId of [currentUserId, otherUserId]) {
        try {
          const userDoc = await this.firebase.getDoc('users', userId);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const userGroups = userData.groups || [];
            if (!userGroups.includes(dmRef.id)) {
              await this.firebase.updateDoc('users', userId, { groups: [...userGroups, dmRef.id] });
            }
          }
        } catch (err) {
          console.warn('Failed to update user groups for DM creation:', err);
        }
      }

      Utils.hideElement(modal);
      window.app.openGroup(dmRef.id);
      Utils.showToast('Direct message created', 'success');
    } catch (error) {
      console.error('Create DM failed:', error);
      Utils.showToast('Failed to create DM', 'error');
    }
  }
}

// ----------------------------------------------------------------------------
// Main app class
class TaskFlowApp {
  constructor() {
    this.firebase = new FirebaseService();
    this.dataStore = new DataStore();
    this.authManager = new AuthenticationManager(this.firebase, this.dataStore);
    this.navigationManager = new NavigationManager();
    this.uiRenderer = new UIRenderer(this.dataStore, this.authManager);
    this.modalManager = new ModalManager(this.dataStore, this.authManager, this.firebase);

    this.currentGroup = null;
    this.autoArchiveInterval = null;

    // --- Notification audio (tiny embedded beep WAV, base64) ---
    // Very small 8-bit WAV beep embedded as a data URL
    this._notificationDataUrl = 'data:audio/wav;base64,UklGRlgAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YYAAAAA/AAAAAP8AAAAA/wAAAP8AAAAA/wAAAP8AAAAA/wAAAP8AAAAA/wAAAP8AAAAA/w==';
    try {
      this.notificationAudio = new Audio(this._notificationDataUrl);
      this.notificationAudio.volume = 0.12;
    } catch (e) {
      console.warn('Notification audio not available:', e);
      this.notificationAudio = null;
    }

    // Track last counts so we can detect when new messages/tasks arrive
    this._lastCounts = { messages: 0, tasks: 0 };

    this.setupEventListeners();
    this.initializeApp();
  }

  // Helper: attempt to play notification sound (fails silently if blocked)
  playNotification() {
    if (!this.notificationAudio) return;
    try {
      // clone so overlapping notifications can play
      const a = this.notificationAudio.cloneNode();
      a.volume = this.notificationAudio.volume;
      a.play().catch(err => {
        // autoplay may be blocked until user interacts; ignore silently
      });
    } catch (err) {
      // ignore
    }
  }

  setupEventListeners() {
    const sendMsgBtn = Utils.$('send-msg');
    if (sendMsgBtn) sendMsgBtn.addEventListener('click', () => this.sendMessage());

    const backToGroups = Utils.$('back-to-groups');
    if (backToGroups) backToGroups.addEventListener('click', () => {
      this.currentGroup = null;
      this.navigationManager.navigateTo('groups');
    });

    const refreshBtn = Utils.$('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshData());

    // Removed wiring for show-completed / show-archived (UI removed).
    // Collapse / Expand toggles: use style.display toggling so it's reliable.
    const toggleGroups = Utils.$('toggle-groups-col');
    const toggleActive = Utils.$('toggle-active-tasks-col');
    const toggleCompleted = Utils.$('toggle-completed-col');

    if (toggleGroups) toggleGroups.addEventListener('click', () => {
      const col = Utils.$('groups-col');
      if (!col) return;
      if (col.style.display === 'none') {
        col.style.display = '';
        toggleGroups.textContent = '–';
      } else {
        col.style.display = 'none';
        toggleGroups.textContent = '+';
      }
    });

    if (toggleActive) toggleActive.addEventListener('click', () => {
      const col = Utils.$('tasks-col');
      if (!col) return;
      if (col.style.display === 'none') {
        col.style.display = '';
        toggleActive.textContent = '–';
      } else {
        col.style.display = 'none';
        toggleActive.textContent = '+';
      }
    });

    if (toggleCompleted) toggleCompleted.addEventListener('click', () => {
      const col = Utils.$('completed-tasks-col');
      if (!col) return;
      if (col.style.display === 'none') {
        col.style.display = '';
        toggleCompleted.textContent = '–';
      } else {
        col.style.display = 'none';
        toggleCompleted.textContent = '+';
      }
    });

    const showMembersBtn = Utils.$('show-members-btn');
    if (showMembersBtn) showMembersBtn.addEventListener('click', () => this.showGroupMembers());
  }

  initializeApp() {
    this.navigationManager.showView('login');
    this.startAutoArchive();
  }

  onUserLogin(user) {
    this.startDataListeners();
    this.loadInitialData();
    this.navigationManager.navigateTo('dashboard', { resetHistory: true });
  }

  onUserLogout() {
    this.firebase.removeAllListeners();
    this.dataStore.clear();
    this.currentGroup = null;
    this.navigationManager.clearHistory();
    this.navigationManager.showView('login');
  }

  onViewChange(view) {
    switch (view) {
      case 'dashboard':
        this.uiRenderer.renderDashboardGroups();
        this.uiRenderer.renderDashboardTasks();
        this.uiRenderer.renderCompletedTasks();
        this.uiRenderer.renderAssignedByMe();
        break;
      case 'groups':
        this.uiRenderer.renderGroupsList();
        break;
      case 'admin':
        this.uiRenderer.renderPendingUsers();
        this.uiRenderer.renderUserManagement();
        if (this.authManager.isDirector()) this.uiRenderer.renderDirectorTasks();
        break;
      case 'profile':
        this.uiRenderer.renderProfile();
        break;
      case 'groupChat':
        if (this.currentGroup) {
          this.uiRenderer.renderChat(this.currentGroup.id);
          this.populateMentionSelect();
        }
        break;
    }
  }

  startDataListeners() {
    this.firebase.addListener('users', 'users', (snapshot) => {
      const users = [];
      snapshot.forEach(docSnap => users.push({ id: docSnap.id, ...docSnap.data() }));
      this.dataStore.setUsers(users);
      this.onDataUpdate('users');
    });

    this.firebase.addListener('groups', 'groups', (snapshot) => {
      const groups = [];
      snapshot.forEach(docSnap => groups.push({ id: docSnap.id, ...docSnap.data() }));
      this.dataStore.setGroups(groups);
      this.onDataUpdate('groups');
    });

    this.firebase.addListener('tasks', 'tasks', (snapshot) => {
      const tasks = [];
      snapshot.forEach(docSnap => tasks.push({ id: docSnap.id, ...docSnap.data() }));
      this.dataStore.setTasks(tasks);
      this.onDataUpdate('tasks');
    });

    this.firebase.addListener('messages', 'messages', (snapshot) => {
      const messages = [];
      snapshot.forEach(docSnap => messages.push({ id: docSnap.id, ...docSnap.data() }));
      this.dataStore.setMessages(messages);
      this.onDataUpdate('messages');
    });
  }

    onDataUpdate(dataType) {
    const currentView = this.navigationManager.currentView;

    // --- notification detection: simple count-increase logic ---
    try {
      if (dataType === 'messages') {
        const newCount = this.dataStore.getAllMessages().length;
        if (newCount > (this._lastCounts.messages || 0)) {
          this.playNotification();
        }
        this._lastCounts.messages = newCount;
      }

      if (dataType === 'tasks') {
        const newCount = this.dataStore.getAllTasks().filter(t => !t.archived && t.status !== 'completed').length;
        if (newCount > (this._lastCounts.tasks || 0)) {
          this.playNotification();
        }
        this._lastCounts.tasks = newCount;
      }
    } catch (err) {
      console.warn('Notification detection failed', err);
    }

    if (dataType === 'users') {
      this.uiRenderer.renderPendingUsers();
      this.uiRenderer.renderUserManagement();
      this.uiRenderer.renderProfile();
      this.uiRenderer.renderAssignedByMe();
    }

    if (dataType === 'groups') {
      this.uiRenderer.renderDashboardGroups();
      this.uiRenderer.renderGroupsList();

      if (this.currentGroup && currentView === 'groupChat') {
        const updatedGroup = this.dataStore.getGroup(this.currentGroup.id);
        if (updatedGroup) {
          this.currentGroup = updatedGroup;
          Utils.safeText(Utils.$('chat-group-name'), this.currentGroup.name);
          const membersCount = Utils.$('chat-members-count');
          if (membersCount) membersCount.textContent = `${(this.currentGroup.members || []).length} members`;
          this.populateMentionSelect();
          this.uiRenderer.renderGroupTasks(this.currentGroup.id);
        }
      }
    }

    if (dataType === 'tasks') {
      this.uiRenderer.renderDashboardTasks();
      this.uiRenderer.renderAssignedByMe();
      this.uiRenderer.renderCompletedTasks();
      if (this.authManager.isDirector()) this.uiRenderer.renderDirectorTasks();
      if (this.currentGroup && currentView === 'groupChat') this.uiRenderer.renderGroupTasks(this.currentGroup.id);
    }

    if (dataType === 'messages') {
      if (this.currentGroup && currentView === 'groupChat') this.uiRenderer.renderChat(this.currentGroup.id);
    }
  }


  async loadInitialData() {
    try {
      const [users, groups, tasks, messages] = await Promise.all([
        this.firebase.getDocs('users'),
        this.firebase.getDocs('groups'),
        this.firebase.getDocs('tasks'),
        this.firebase.getDocs('messages')
      ]);

      const userData = [];
      users.forEach(docSnap => userData.push({ id: docSnap.id, ...docSnap.data() }));
      this.dataStore.setUsers(userData);

      const groupData = [];
      groups.forEach(docSnap => groupData.push({ id: docSnap.id, ...docSnap.data() }));
      this.dataStore.setGroups(groupData);

      const taskData = [];
      tasks.forEach(docSnap => taskData.push({ id: docSnap.id, ...docSnap.data() }));
      this.dataStore.setTasks(taskData);

      const messageData = [];
      messages.forEach(docSnap => messageData.push({ id: docSnap.id, ...docSnap.data() }));
      this.dataStore.setMessages(messageData);

      this.autoArchiveOldTasks();

      // Seed last counts so initial load does not count as "new"
      try {
        this._lastCounts.messages = this.dataStore.getAllMessages().length;
        this._lastCounts.tasks = this.dataStore.getAllTasks().filter(t => !t.archived && t.status !== 'completed').length;
      } catch (err) {
        console.warn('Failed to seed last counts', err);
      }
    } catch (error) {
      console.error('Failed to load initial ', error);
      Utils.showToast('Failed to load initial data', 'error');
    }
  }


  async openGroup(groupId) {
    try {
      let group = this.dataStore.getGroup(groupId);
      if (!group) {
        const groupDoc = await this.firebase.getDoc('groups', groupId);
        if (groupDoc.exists()) group = { id: groupDoc.id, ...groupDoc.data() };
      }

      if (!group) { Utils.showToast('Group not found', 'error'); return; }

      const currentUser = this.authManager.getCurrentUser();
      if (!(group.members || []).includes(currentUser.id)) { Utils.showToast('Access denied - you are not a member of this group', 'error'); return; }

      this.currentGroup = group;
      Utils.safeText(Utils.$('chat-group-name'), group.name);
      const membersCount = Utils.$('chat-members-count');
      if (membersCount) membersCount.textContent = `${(group.members || []).length} members`;

      this.populateMentionSelect();
      this.navigationManager.navigateTo('groupChat');
      this.uiRenderer.renderChat(groupId);
    } catch (error) {
      console.error('Failed to open group:', error);
      Utils.showToast('Failed to open group', 'error');
    }
  }

  populateMentionSelect() {
    const mentionSelect = Utils.$('mention-select');
    if (!mentionSelect || !this.currentGroup) return;
    Utils.clearElement(mentionSelect);
    mentionSelect.multiple = true;
    (this.currentGroup.members || []).forEach(memberId => {
      const user = this.dataStore.getUser(memberId);
      const option = document.createElement('option');
      option.value = memberId;
      option.textContent = user?.username || memberId;
      mentionSelect.appendChild(option);
    });
  }

  // sendMessage unchanged (mentions are stored in messages; mention column removed from dashboard UI)
  async sendMessage() {
    if (!this.currentGroup) { Utils.showToast('Open a group first', 'error'); return; }
    const chatInput = Utils.$('chat-input');
    const mentionSelect = Utils.$('mention-select');

    const messageText = chatInput?.value.trim();
    if (!messageText) return;

    const mentions = mentionSelect ? Array.from(mentionSelect.selectedOptions).map(option => option.value) : [];
    const allowedMentions = (this.currentGroup.members || []).filter(memberId => mentions.includes(memberId));

    try {
      const messageRef = await this.firebase.addDoc('messages', {
        groupId: this.currentGroup.id,
        userId: this.authManager.getCurrentUser().id,
        content: messageText,
        type: 'message',
        parentMessageId: null,
        taskId: null,
        timestamp: new Date().toISOString(),
        mentions: allowedMentions
      });

      const title = messageText.length > 80 ? (messageText.slice(0, 77) + '...') : messageText;
      const taskData = {
        title,
        description: messageText,
        assignedBy: this.authManager.getCurrentUser().id,
        assignedTo: null,
        status: 'in-progress',
        priority: 'low',
        dueDate: null,
        groupId: this.currentGroup.id,
        private: false,
        archived: false,
        urgent: false,
        subtasks: [],
        activityLog: [{ ts: new Date().toISOString(), text: 'Task auto-created from message' }],
        createdAt: new Date().toISOString(),
        completedAt: null,
        completedBy: null
      };

      await this.firebase.addDoc('tasks', taskData);

      if (chatInput) chatInput.value = '';
      if (mentionSelect) mentionSelect.selectedIndex = -1;
    } catch (error) {
      console.error('Send message failed:', error);
      Utils.showToast('Failed to send message', 'error');
    }
  }

  async deleteGroup(group) {
    if (!this.authManager.isAdminOrDirector()) { Utils.showToast("You don't have permission to delete groups", 'error'); return; }
    if (!confirm(`Delete group "${group.name}"? This will remove all messages and tasks.`)) return;

    try {
      const messages = await this.firebase.getDocs('messages', [where('groupId', '==', group.id)]);
      for (const messageDoc of messages.docs) await this.firebase.deleteDoc('messages', messageDoc.id);

      const tasks = await this.firebase.getDocs('tasks', [where('groupId', '==', group.id)]);
      for (const taskDoc of tasks.docs) await this.firebase.deleteDoc('tasks', taskDoc.id);

      await this.firebase.deleteDoc('groups', group.id);
      Utils.showToast('Group deleted successfully', 'success');
    } catch (error) {
      console.error('Delete group failed:', error);
      Utils.showToast('Failed to delete group', 'error');
    }
  }

  async completeTask(taskId) {
    try {
      await this.firebase.updateDoc('tasks', taskId, { status: 'completed', completedAt: new Date().toISOString() });
      Utils.showToast('Task marked as completed', 'success');
    } catch (error) {
      console.error('Complete task failed:', error);
      Utils.showToast('Failed to complete task', 'error');
    }
  }

  // completeTaskFromMessage: unchanged permission model but now supports group-wide shared tasks
  async completeTaskFromMessage(taskId) {
    try {
      const task = this.dataStore.getTask(taskId);
      if (!task) { Utils.showToast('Task not found', 'error'); return; }
      const currentUser = this.authManager.getCurrentUser();
      if (!currentUser) { Utils.showToast('Login required', 'error'); return; }

      if (task.groupId) {
        const group = this.dataStore.getGroup(task.groupId);
        if (!group || !(group.members || []).includes(currentUser.id)) {
          Utils.showToast('Only group members can complete this task', 'error');
          return;
        }
      } else {
        if (task.assignedTo && task.assignedTo !== currentUser.id) {
          Utils.showToast('Only the assigned user can complete this personal task', 'error');
          return;
        }
      }

      // Update task with completed metadata and activity log
      await this.firebase.updateDoc('tasks', taskId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        completedBy: currentUser.id,
        activityLog: [...(task.activityLog || []), { ts: new Date().toISOString(), text: `${currentUser.username} completed task` }]
      });

      if (task.groupId) {
        await this.firebase.addDoc('messages', {
          groupId: task.groupId,
          userId: currentUser.id,
          content: `Task completed: ${task.title}`,
          type: 'task-completed',
          parentMessageId: null,
          taskId,
          timestamp: new Date().toISOString()
        });
      }

      Utils.showToast('Task marked completed', 'success');
    } catch (error) {
      console.error('Complete task from message failed:', error);
      Utils.showToast('Failed to complete task', 'error');
    }
  }

  async uncompleteTask(taskId) {
    try {
      const task = this.dataStore.getTask(taskId);
      if (!task) { Utils.showToast('Task not found', 'error'); return; }
      await this.firebase.updateDoc('tasks', taskId, {
        status: 'in-progress',
        completedAt: null,
        completedBy: null,
        activityLog: [...(task.activityLog || []), { ts: new Date().toISOString(), text: `${this.authManager.getCurrentUser().username} restored task` }]
      });
      Utils.showToast('Task restored', 'success');
    } catch (error) {
      console.error('Uncomplete task failed:', error);
      Utils.showToast('Failed to restore task', 'error');
    }
  }

  async deleteTask(taskId) {
    if (!confirm('Delete this task permanently?')) return;
    try {
      await this.firebase.deleteDoc('tasks', taskId);
      Utils.showToast('Task deleted', 'success');
    } catch (error) {
      console.error('Delete task failed:', error);
      Utils.showToast('Failed to delete task', 'error');
    }
  }

  async approveUser(userId) {
    if (!this.authManager.isDirector()) { Utils.showToast("Only director can approve users", 'error'); return; }
    try {
      await this.firebase.updateDoc('users', userId, { status: 'active' });
      Utils.showToast('User approved', 'success');
    } catch (error) {
      console.error('Approve user failed:', error);
      Utils.showToast('Failed to approve user', 'error');
    }
  }

  async removeUser(userId) {
    if (!this.authManager.isAdminOrDirector()) { Utils.showToast("You don't have permission to remove users", 'error'); return; }
    if (!confirm('Remove this user?')) return;
    try {
      await this.deleteUser(userId);
      Utils.showToast('User removed', 'success');
    } catch (error) {
      console.error('Remove user failed:', error);
      Utils.showToast('Failed to remove user', 'error');
    }
  }

  async changeUserRole(userId, role) {
    if (!this.authManager.isDirector()) { Utils.showToast("Only director can change user roles", 'error'); return; }
    try {
      await this.firebase.updateDoc('users', userId, { role });
      Utils.showToast('User role updated', 'success');
    } catch (error) {
      console.error('Change role failed:', error);
      Utils.showToast('Failed to change role', 'error');
    }
  }

  async deleteUser(userId) {
    if (!this.authManager.isDirector()) { Utils.showToast("Only director can delete users", 'error'); return; }
    if (!confirm('Really delete user and remove from all groups and tasks?')) return;
    try {
      const userGroups = this.dataStore.getAllGroups().filter(group => (group.members || []).includes(userId));
      for (const group of userGroups) {
        if (group.type === 'dm') {
          const messages = await this.firebase.getDocs('messages', [where('groupId', '==', group.id)]);
          for (const messageDoc of messages.docs) await this.firebase.deleteDoc('messages', messageDoc.id);
          await this.firebase.deleteDoc('groups', group.id);
        } else {
          const updatedMembers = (group.members || []).filter(memberId => memberId !== userId);
          const updatedAdmins = (group.admins || []).filter(adminId => adminId !== userId);
          await this.firebase.updateDoc('groups', group.id, { members: updatedMembers, admins: updatedAdmins });
        }
      }

      const userTasks = await this.firebase.getDocs('tasks', [where('assignedTo', '==', userId)]);
      for (const taskDoc of userTasks.docs) await this.firebase.updateDoc('tasks', taskDoc.id, { assignedTo: null });

      await this.firebase.deleteDoc('users', userId);
    } catch (error) {
      console.error('Delete user failed:', error);
      throw error;
    }
  }

  refreshData() {
    const currentView = this.navigationManager.currentView;
    this.onViewChange(currentView);
    Utils.showToast('Data refreshed', 'info');
  }

  showCompletedTasks() {
    const user = this.authManager.getCurrentUser();
    const completedTasks = this.dataStore.getCompletedTasks(user.id);
    if (completedTasks.length === 0) { Utils.showToast('No completed tasks', 'info'); return; }
    const taskList = completedTasks.map(task => `${task.title} (${Utils.formatDate(task.completedAt)})`).join('\n');
    alert('Completed tasks:\n' + taskList);
  }

  showArchivedTasks() {
    const user = this.authManager.getCurrentUser();
    const archivedTasks = this.dataStore.getAllTasks().filter(task => task.assignedTo === user.id && task.archived);
    if (archivedTasks.length === 0) { Utils.showToast('No archived tasks', 'info'); return; }
    const taskList = archivedTasks.map(task => task.title).join('\n');
    alert('Archived tasks:\n' + taskList);
  }

  startAutoArchive() {
    this.autoArchiveInterval = setInterval(() => { this.autoArchiveOldTasks(); }, CONFIG.autoArchive.interval);
  }

  async autoArchiveOldTasks() {
    try {
      const cutoffDate = Date.now() - (CONFIG.autoArchive.daysOld * 24 * 60 * 60 * 1000);
      const taskDocs = await this.firebase.getDocs('tasks');
      for (const taskDoc of taskDocs.docs) {
        const task = taskDoc.data();
        if (task.status === 'completed' && !task.archived && task.completedAt) {
          const completedDate = new Date(task.completedAt).getTime();
          if (completedDate < cutoffDate) await this.firebase.updateDoc('tasks', taskDoc.id, { archived: true });
        }
      }
    } catch (error) {
      console.error('Auto-archive failed:', error);
    }
  }

  showGroupMembers() {
    if (!this.currentGroup) { Utils.showToast('Open a group first', 'error'); return; }
    const memberNames = (this.currentGroup.members || []).map(id => this.dataStore.getUser(id)?.username || id);
    if (memberNames.length === 0) { Utils.showToast('No members in this group', 'info'); return; }
    alert(`Members in ${this.currentGroup.name}:\n\n` + memberNames.join('\n'));
  }
}

// ----------------------------------------------------------------------------
// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.app = new TaskFlowApp();

  window._tf_debug = {
    getAppState: () => ({
      currentUser: window.app.authManager.getCurrentUser(),
      currentGroup: window.app.currentGroup,
      currentView: window.app.navigationManager.currentView,
      dataStore: {
        users: window.app.dataStore.getAllUsers().length,
        groups: window.app.dataStore.getAllGroups().length,
        tasks: window.app.dataStore.getAllTasks().length,
        messages: window.app.dataStore.getAllMessages().length
      }
    }),
    clearData: () => { window.app.dataStore.clear(); console.log('Data store cleared'); },
    reloadData: () => { window.app.loadInitialData(); console.log('Data reloaded'); }
  };

  console.log('TaskFlow initialized successfully (updated features: group-shared tasks + collapse fix)');
});
