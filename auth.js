'use strict';
if (typeof firebase === 'undefined') {
  console.error('Firebase SDK не загружен. Проверь подключение скриптов и наличие firebase-config.js');
}
const firebaseApp = firebase.initializeApp(window.FIREBASE_CONFIG);
const firebaseAuth = firebase.auth();
const firebaseDb = firebase.firestore();
if (firebaseDb.enablePersistence) {
  firebaseDb.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
    if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
      console.warn('Firestore persistence:', err.code, err.message);
    }
  });
}
let authState = {
  user: null,
  isAdmin: false,
  access: null
};
function currentUser() { return authState.user; }
function isAdminUser() { return authState.isAdmin; }
function currentAccess() { return authState.access; }
function loadAdminEmails() {
  return firebaseDb.collection('settings').doc('app').get()
    .then(function (doc) {
      if (doc.exists) return doc.data().adminEmails || [];
      return [];
    })
    .catch(function () { return []; });
}
function ensureAdminRole() {
  if (!authState.user) return Promise.resolve();
  const email = String(authState.user.email || '').toLowerCase();
  if (!email) return Promise.resolve();
  return firebaseDb.collection('settings').doc('app').get()
    .then(function (doc) {
      const emails = doc.exists ? (doc.data().adminEmails || []) : [];
      if (emails.indexOf(email) !== -1) return;
      if (emails.length > 0) return;
      return firebaseDb.collection('settings').doc('app').set({ adminEmails: [email] })
        .catch(function () {});
    })
    .catch(function () {});
}
function updateIsAdmin() {
  if (!authState.user) { authState.isAdmin = false; return Promise.resolve(); }
  return loadAdminEmails().then(function (emails) {
    authState.isAdmin = emails.indexOf(String(authState.user.email || '').toLowerCase()) !== -1;
    renderAuthBar();
  });
}
let syncTimer = null;
let syncUid = null;
let lastSync = null;
function syncProgressToFirestore() {
  if (!authState.user) return;
  clearTimeout(syncTimer);
  syncUid = authState.user.uid;
  syncTimer = setTimeout(function () { doSyncProgress(); }, 1500);
}
function doSyncProgress() {
  if (!authState.user || authState.user.uid !== syncUid) return;
  const progressMap = {};
  for (const k in progress) {
    const d = progress[k];
    if (/^\d+-\d+$/.test(k) && d && (d.stars > 0 || d.done)) progressMap[k] = d;
  }
  const userRef = firebaseDb.collection('users').doc(authState.user.uid);
  userRef.set({
    progress: progressMap,
    lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
    .then(function () { lastSync = Date.now(); })
    .catch(function (err) {
      if (navigator.onLine === false) return;
      console.warn('Sync progress error:', err.code, err.message);
    });
}
function mergeCloudProgress(cloud) {
  if (!cloud || typeof cloud !== 'object') return;
  let changed = false;
  for (const k in cloud) {
    const cp = cloud[k];
    if (!cp || typeof cp !== 'object' || !/^\d+-\d+$/.test(k)) continue;
    const local = progress[k];
    const cpStars = Number(cp.stars) || 0;
    const cpTasks = (cp.tasks && typeof cp.tasks === 'object') ? cp.tasks : {};
    if (!local) {
      progress[k] = {
        stars: cpStars,
        tasks: cpTasks,
        done: !!cp.done
      };
      changed = true;
      continue;
    }
    const localTasks = (local.tasks && typeof local.tasks === 'object') ? local.tasks : {};
    let maxStars = Math.max(Number(local.stars) || 0, cpStars);
    let tasks = Object.assign({}, localTasks);
    for (const t in cpTasks) if (cpTasks[t]) tasks[t] = true;
    let done = !!(local.done || cp.done);
    if ((local.stars || 0) !== maxStars || done !== !!local.done) changed = true;
    local.stars = maxStars;
    local.tasks = tasks;
    if (maxStars >= 4) done = true;
    local.done = done;
  }
  if (changed) saveProgress();
}
function loadCloudProgress() {
  if (!authState.user) return Promise.resolve();
  const uid = authState.user.uid;
  const email = String(authState.user.email || '').toLowerCase();
  authState.access = null;
  return ensureAdminRole().then(function () {
    return firebaseDb.collection('users').doc(uid).get();
  }).then(function (doc) {
    if (doc.exists) {
      authState.data = doc.data();
      authState.access = doc.data().access || null;
      if (authState.data.progress) mergeCloudProgress(authState.data.progress);
    }
    firebaseDb.collection('users').doc(uid).set({
      email: email,
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(function () {});
    return updateIsAdmin();
  }).then(function () {
    renderAuthBar();
    if (typeof window.onAuthChanged === 'function') window.onAuthChanged();
  }).catch(function () {
    renderAuthBar();
    if (typeof window.onAuthChanged === 'function') window.onAuthChanged();
  });
}
let authMode = 'login';
function openAuthScreen() {
  setAuthMode('login');
  document.getElementById('authMsg').textContent = '';
  showScreen('screen-auth');
}
function setAuthMode(mode) {
  authMode = mode;
  const isReg = mode === 'register';
  document.getElementById('authTitle').textContent = isReg ? 'Регистрация' : 'Вход';
  document.getElementById('authSubmitBtn').textContent = isReg ? 'Зарегистрироваться' : 'Войти';
  document.getElementById('authToggleBtn').textContent = isReg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться';
  document.getElementById('authRegFields').style.display = isReg ? 'block' : 'none';
  document.getElementById('authPasswordInput').autocomplete = isReg ? 'new-password' : 'current-password';
}
function toggleAuthMode() {
  setAuthMode(authMode === 'login' ? 'register' : 'login');
  document.getElementById('authMsg').textContent = '';
}
function authErrorText(code) {
  const map = {
    'auth/email-already-in-use': 'Эта почта уже зарегистрирована. Войдите.',
    'auth/invalid-email': 'Некорректный адрес электронной почты.',
    'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов).',
    'auth/wrong-password': 'Неверный пароль.',
    'auth/user-not-found': 'Пользователь с такой почтой не найден.',
    'auth/invalid-credential': 'Неверная почта или пароль.',
    'auth/too-many-requests': 'Слишком много попыток. Подождите и попробуйте снова.',
    'auth/network-request-failed': 'Нет соединения с интернетом.'
  };
  return map[code] || 'Ошибка входа: ' + code;
}
function submitAuth() {
  const email = document.getElementById('authEmailInput').value.trim();
  const pass = document.getElementById('authPasswordInput').value;
  const msgEl = document.getElementById('authMsg');
  msgEl.textContent = '';
  if (!email || !pass) {
    msgEl.textContent = 'Заполните почту и пароль.';
    return;
  }
  const submit = document.getElementById('authSubmitBtn');
  submit.disabled = true;
  submit.textContent = 'Подождите…';
  const finish = function (err) {
    submit.disabled = false;
    submit.textContent = authMode === 'register' ? 'Зарегистрироваться' : 'Войти';
    if (err) msgEl.textContent = authErrorText(err.code || '');
  };
  if (authMode === 'register') {
    const pass2 = document.getElementById('authPasswordInput2').value;
    if (pass.length < 6) {
      finish({ code: 'auth/weak-password' });
      return;
    }
    if (pass !== pass2) {
      msgEl.textContent = 'Пароли не совпадают.';
      submit.disabled = false;
      submit.textContent = 'Зарегистрироваться';
      return;
    }
    firebaseAuth.createUserWithEmailAndPassword(email, pass)
      .then(function (cred) {
        return firebaseDb.collection('users').doc(cred.user.uid).set({
          email: email.toLowerCase(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
          progress: {}
        });
      })
      .then(function () { showHome(); })
      .catch(finish);
  } else {
    firebaseAuth.signInWithEmailAndPassword(email, pass)
      .then(function () { showHome(); })
      .catch(finish);
  }
}
function logout() {
  firebaseAuth.signOut()
    .then(function () { showHome(); })
    .catch(function () {});
}
function renderAuthBar() {
  const guest = document.getElementById('authBarGuest');
  const userEl = document.getElementById('authBarUser');
  if (!guest || !userEl) return;
  if (!authState.user) {
    guest.style.display = 'block';
    userEl.style.display = 'none';
    return;
  }
  guest.style.display = 'none';
  userEl.style.display = 'block';
  document.getElementById('authEmail').textContent = authState.user.email;
  const acc = document.getElementById('authAccess');
  if (authState.isAdmin) {
    acc.textContent = '👩‍🏫 Админ';
    acc.className = 'auth-access auth-access-full';
  } else if (authState.access === 'denied') {
    acc.textContent = '⛔ Доступ закрыт';
    acc.className = 'auth-access auth-access-denied';
  } else if (authState.access === 'full') {
    acc.textContent = '⭐ Полный доступ';
    acc.className = 'auth-access auth-access-full';
  } else {
    acc.textContent = '';
    acc.className = 'auth-access';
  }
}
firebaseAuth.onAuthStateChanged(function (user) {
  authState.user = user;
  authState.isAdmin = false;
  authState.access = null;
  authState.data = null;
  renderAuthBar();
  if (user) {
    loadCloudProgress();
  } else {
    clearTimeout(syncTimer);
    syncUid = null;
    if (typeof window.onAuthChanged === 'function') window.onAuthChanged();
  }
});
window.addEventListener('online', function () {
  if (authState.user) doSyncProgress();
});
window.addEventListener('offline', function () {
  showSaveIndicator && showSaveIndicator();
});