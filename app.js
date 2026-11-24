// ============================================
// FIREBASE CONFIGURATION
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyCu92br-gwCNsAPta0OAcMpovTUUrr9lR8",
  authDomain: "agenda-bebe.firebaseapp.com",
  projectId: "agenda-bebe",
  storageBucket: "agenda-bebe.firebasestorage.app",
  messagingSenderId: "1016457842389",
  appId: "1:1016457842389:web:6d2a2af1aac6459e0b1c5c",
  measurementId: "G-47CKGHM1LZ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ============================================
// APP STATE
// ============================================
let currentUser = null;
const recordCollections = ['breast', 'mix', 'pump', 'diaper', 'sleep', 'growth'];
const emptyState = () => ({
  profile: null,
  theme: 'rosa',
  dark: false,
  breast: [],
  mix: [],
  pump: [],
  diaper: [],
  sleep: [],
  growth: []
});
let state = emptyState();
let dataSession = null;

// Current editing record
let currentEditRecord = null;
let currentEditCollection = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================
const genId = () => Date.now() + '-' + Math.random().toString(36).slice(2, 9);
const formatTime = (date) => new Date(date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const formatDate = (date) => new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

// Formato inteligente: muestra fecha y hora
const formatDateTime = (ts) => {
  const date = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const recordDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  
  if (recordDate.getTime() === today.getTime()) {
    return `Hoy ${time}`;
  } else if (recordDate.getTime() === yesterday.getTime()) {
    return `Ayer ${time}`;
  } else {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month} ${time}`;
  }
};

const getAge = (birth) => {
  if (!birth) return 0;
  const b = new Date(birth + 'T00:00:00'), n = new Date();
  return Math.max(0, (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth()) - (n.getDate() < b.getDate() ? 1 : 0));
};

const localDateInput = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

// All reporting periods include the start and exclude the end.
const withinPeriod = (ts, start, end) => {
  const time = new Date(ts).getTime();
  return time >= start && time < end;
};

const currentMonthStart = (now) => new Date(now.getFullYear(), now.getMonth(), 1).getTime();
const monthLabel = (date) => date.toLocaleDateString('es-ES', { month: 'long' });

const sleepMinutesInPeriod = (record, start, end) => {
  const sleepStart = new Date(record.start || record.ts).getTime();
  const sleepEnd = record.end ? new Date(record.end).getTime() : sleepStart + Number(record.min) * 60000;
  if (!Number.isFinite(sleepStart) || !Number.isFinite(sleepEnd)) return 0;
  return Math.max(0, Math.min(sleepEnd, end) - Math.max(sleepStart, start)) / 60000;
};

const formatDuration = (minutes) => {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

const summarizePeriod = (start, end) => {
  const inPeriod = (r) => withinPeriod(r.ts, start, end);
  const mix = state.mix.filter(inPeriod);
  const pump = state.pump.filter(inPeriod);
  const pumpLeft = pump.reduce((sum, r) => sum + Number(r.l || 0), 0);
  const pumpRight = pump.reduce((sum, r) => sum + Number(r.r || 0), 0);
  const mixedOz = mix.reduce((sum, r) => sum + Number(r.lm || 0) + Number(r.lf || 0), 0);
  return {
    breast: state.breast.filter(inPeriod).length,
    diapers: state.diaper.filter(inPeriod).length,
    ounces: mixedOz + pumpLeft + pumpRight,
    pumpLeft,
    pumpRight,
    sleep: state.sleep.reduce((sum, r) => sum + sleepMinutesInPeriod(r, start, end), 0)
  };
};

const showError = (msg) => {
  alert('Error: ' + msg);
  console.error(msg);
};

const showSync = () => {
  const indicator = document.getElementById('syncIndicator');
  let message = '';
  if (dataSession) {
    if (!navigator.onLine || dataSession.cached.size) {
      message = 'Sin conexión con Firebase. Los datos pueden estar desactualizados.';
    } else if (dataSession.failed.size) {
      message = 'No se pudieron sincronizar todos los datos. Recarga para reintentar.';
    } else if (dataSession.waiting.size || dataSession.pending) {
      message = '🔄 Sincronizando…';
    }
  }
  indicator.style.display = message ? 'block' : 'none';
  indicator.classList.toggle('syncing', !!dataSession?.pending);
  document.getElementById('syncText').textContent = message;
};

// ============================================
// THEME
// ============================================
const applyTheme = () => {
  document.documentElement.className = '';
  if (state.theme !== 'rosa') document.documentElement.classList.add('theme-' + state.theme);
  if (state.dark) document.documentElement.classList.add('dark');
  const darkBtn = document.getElementById('darkBtn');
  const darkBtn2 = document.getElementById('darkBtn2');
  const darkBtn3 = document.getElementById('darkBtn3');
  if (darkBtn) darkBtn.textContent = state.dark ? '☀️' : '🌙';
  if (darkBtn2) darkBtn2.textContent = state.dark ? '☀️ Modo claro' : '🌙 Modo oscuro';
  if (darkBtn3) darkBtn3.textContent = state.dark ? '☀️ Modo claro' : '🌙 Modo oscuro';
};

const saveTheme = async (change) => {
  if (await writeUserData('guardar el tema', userRef => userRef.collection('settings').doc('theme').set(change, { merge: true }))) {
    Object.assign(state, change);
    applyTheme();
  }
};

// ============================================
// DATA SYNC
// ============================================
const refreshRecordViews = () => {
  if (document.querySelector('#homeView.active')) renderHome();
  renderRecentFeeding();
  renderRecentDiapers();
  renderRecentSleep();
  renderGrowthHistory();
  if (document.querySelector('#historyView.active')) {
    renderMonthlyHistory();
    renderMonthlyChart();
    renderDailyHistory(document.getElementById('historyResultsCard').dataset.date);
  }
};

const subscribeToUserData = (user, openApp) => {
  const session = {
    ref: db.collection('users').doc(user.uid),
    unsubscribe: [],
    waiting: new Set(['profile', 'settings', ...recordCollections]),
    failed: new Set(),
    cached: new Set(),
    pending: 0,
    deleting: false,
    opened: false,
    refreshTimer: null
  };
  dataSession = session;
  const reveal = () => {
    if (dataSession !== session || session.opened) return;
    session.opened = true;
    openApp();
  };
  session.loadTimer = setTimeout(reveal, 8000);

  const refresh = (hadProfile) => {
    if (!session.opened) {
      if (!session.waiting.size || !navigator.onLine) reveal();
      return;
    }
    if (hadProfile !== !!state.profile) {
      if (!state.profile) resetProfileForm();
      updateUI();
    }
    clearTimeout(session.refreshTimer);
    session.refreshTimer = setTimeout(refreshRecordViews, 0);
  };

  const listen = (name, ref, apply) => {
    const unsubscribe = ref.onSnapshot({ includeMetadataChanges: true }, snapshot => {
      if (dataSession !== session) return;
      if (snapshot.metadata.fromCache) {
        if (!session.waiting.has(name) || !navigator.onLine) session.cached.add(name);
        showSync();
        if (!navigator.onLine) reveal();
        return;
      }
      if (snapshot.metadata.hasPendingWrites) return;
      session.cached.delete(name);
      session.waiting.delete(name);
      const hadProfile = !!state.profile;
      apply(snapshot);
      showSync();
      refresh(hadProfile);
    }, error => {
      if (dataSession !== session) return;
      console.error('Error de sincronización de ' + name, error);
      session.waiting.delete(name);
      session.failed.add(name);
      showSync();
      if (!session.waiting.size) reveal();
    });
    session.unsubscribe.push(unsubscribe);
  };

  listen('profile', session.ref.collection('profile').doc('baby'), snapshot => {
    state.profile = snapshot.exists ? snapshot.data() : null;
  });
  listen('settings', session.ref.collection('settings').doc('theme'), snapshot => {
    const theme = snapshot.data();
    state.theme = theme?.theme || 'rosa';
    state.dark = theme?.dark || false;
    applyTheme();
  });
  for (const name of recordCollections) {
    listen(name, session.ref.collection(name), snapshot => {
      state[name] = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    });
  }
  showSync();
};

const stopDataSession = () => {
  if (!dataSession) return;
  const session = dataSession;
  dataSession = null;
  clearTimeout(session.loadTimer);
  clearTimeout(session.refreshTimer);
  session.unsubscribe.forEach(unsubscribe => unsubscribe());
};

const writeUserData = async (action, operation) => {
  const session = dataSession;
  if (!session) return false;
  if (!navigator.onLine || session.cached.size) {
    showError('Conéctate a Internet para ' + action + '.');
    return false;
  }
  if (session.waiting.size || session.failed.size) {
    showError('Espera a que se carguen los datos o recarga la página para ' + action + '.');
    return false;
  }
  if (session.deleting) return false;
  session.pending++;
  showSync();
  try {
    await operation(session.ref);
    return session === dataSession;
  } catch (error) {
    if (session === dataSession) showError('No se pudo ' + action + ': ' + error.message);
    return false;
  } finally {
    session.pending--;
    if (session === dataSession) showSync();
  }
};

const saveRecord = (collection, record) => writeUserData(
  'guardar el registro', userRef => userRef.collection(collection).doc(record.id).set(record)
);
const updateRecordToDB = (collection, id, data) => writeUserData(
  'actualizar el registro', userRef => userRef.collection(collection).doc(id).update(data)
);
const deleteRecordFromDB = (collection, id) => writeUserData(
  'eliminar el registro', userRef => userRef.collection(collection).doc(id).delete()
);

// ============================================
// EDIT MODAL
// ============================================
const openEditModal = (collection, record) => {
  currentEditCollection = collection;
  currentEditRecord = record;
  
  const modal = document.getElementById('editModal');
  const title = document.getElementById('editModalTitle');
  const content = document.getElementById('editModalContent');
  
  const date = new Date(record.ts || record.start);
  const dateStr = date.toISOString().slice(0, 10);
  const timeStr = date.toTimeString().slice(0, 5);
  
  let formHtml = '';
  
  if (collection === 'breast') {
    title.textContent = '🍼 Editar Pecho';
    formHtml = `
      <div class="row">
        <div>
          <label>Fecha</label>
          <input type="date" id="editDate" value="${dateStr}" />
        </div>
        <div>
          <label>Hora</label>
          <input type="time" id="editTime" value="${timeStr}" />
        </div>
      </div>
    `;
  } else if (collection === 'mix') {
    title.textContent = '🥛 Editar Alimentación Mixta';
    formHtml = `
      <div class="row">
        <div>
          <label>Leche materna (oz)</label>
          <input type="number" step="0.5" min="0" id="editLm" value="${record.lm || 0}" />
        </div>
        <div>
          <label>Fórmula (oz)</label>
          <input type="number" step="0.5" min="0" id="editLf" value="${record.lf || 0}" />
        </div>
      </div>
      <div class="row">
        <div>
          <label>Fecha</label>
          <input type="date" id="editDate" value="${dateStr}" />
        </div>
        <div>
          <label>Hora</label>
          <input type="time" id="editTime" value="${timeStr}" />
        </div>
      </div>
    `;
  } else if (collection === 'pump') {
    title.textContent = '💧 Editar Extracción';
    formHtml = `
      <div class="row">
        <div>
          <label>Izquierdo (oz)</label>
          <input type="number" step="0.5" min="0" id="editPumpL" value="${record.l || 0}" />
        </div>
        <div>
          <label>Derecho (oz)</label>
          <input type="number" step="0.5" min="0" id="editPumpR" value="${record.r || 0}" />
        </div>
      </div>
      <div class="row">
        <div>
          <label>Fecha</label>
          <input type="date" id="editDate" value="${dateStr}" />
        </div>
        <div>
          <label>Hora</label>
          <input type="time" id="editTime" value="${timeStr}" />
        </div>
      </div>
    `;
  } else if (collection === 'diaper') {
    title.textContent = '👶 Editar Pañal';
    formHtml = `
      <div class="row">
        <div>
          <label>Tipo</label>
          <select id="editDiaperType">
            <option value="pipi" ${record.type === 'pipi' ? 'selected' : ''}>Pipí 💧</option>
            <option value="caca" ${record.type === 'caca' ? 'selected' : ''}>Popó 💩</option>
            <option value="ambos" ${record.type === 'ambos' ? 'selected' : ''}>Ambos 💧💩</option>
          </select>
        </div>
        <div>
          <label>Hora</label>
          <input type="time" id="editTime" value="${timeStr}" />
        </div>
      </div>
      <div class="row">
        <div>
          <label>Fecha</label>
          <input type="date" id="editDate" value="${dateStr}" />
        </div>
      </div>
    `;
  } else if (collection === 'sleep') {
    const startDate = new Date(record.start);
    const endDate = new Date(record.end);
    title.textContent = '😴 Editar Sueño';
    formHtml = `
      <div class="row">
        <div>
          <label>Fecha inicio</label>
          <input type="date" id="editStartDate" value="${startDate.toISOString().slice(0, 10)}" />
        </div>
        <div>
          <label>Hora inicio</label>
          <input type="time" id="editStartTime" value="${startDate.toTimeString().slice(0, 5)}" />
        </div>
      </div>
      <div class="row">
        <div>
          <label>Fecha fin</label>
          <input type="date" id="editEndDate" value="${endDate.toISOString().slice(0, 10)}" />
        </div>
        <div>
          <label>Hora fin</label>
          <input type="time" id="editEndTime" value="${endDate.toTimeString().slice(0, 5)}" />
        </div>
      </div>
    `;
  } else if (collection === 'growth') {
    title.textContent = '📏 Editar Crecimiento';
    formHtml = `
      <div class="row">
        <div>
          <label>Peso (kg)</label>
          <input type="number" step="0.1" id="editWeight" value="${record.w || 0}" />
        </div>
        <div>
          <label>Talla (cm)</label>
          <input type="number" id="editHeight" value="${record.h || 0}" />
        </div>
      </div>
      <div class="row">
        <div>
          <label>Fecha</label>
          <input type="date" id="editDate" value="${dateStr}" />
        </div>
        <div>
          <label>Hora</label>
          <input type="time" id="editTime" value="${timeStr}" />
        </div>
      </div>
    `;
  }
  
  content.innerHTML = formHtml;
  modal.classList.add('open');
};

const closeEditModal = () => {
  document.getElementById('editModal').classList.remove('open');
  currentEditRecord = null;
  currentEditCollection = null;
};

const saveEditedRecord = async () => {
  if (!currentEditRecord || !currentEditCollection) return;
  
  let updateData = {};
  
  if (currentEditCollection === 'breast') {
    const date = document.getElementById('editDate').value;
    const time = document.getElementById('editTime').value;
    updateData.ts = new Date(`${date}T${time}`).toISOString();
  } else if (currentEditCollection === 'mix') {
    const date = document.getElementById('editDate').value;
    const time = document.getElementById('editTime').value;
    updateData.ts = new Date(`${date}T${time}`).toISOString();
    updateData.lm = parseFloat(document.getElementById('editLm').value) || 0;
    updateData.lf = parseFloat(document.getElementById('editLf').value) || 0;
  } else if (currentEditCollection === 'pump') {
    const date = document.getElementById('editDate').value;
    const time = document.getElementById('editTime').value;
    updateData.ts = new Date(`${date}T${time}`).toISOString();
    updateData.l = parseFloat(document.getElementById('editPumpL').value) || 0;
    updateData.r = parseFloat(document.getElementById('editPumpR').value) || 0;
  } else if (currentEditCollection === 'diaper') {
    const date = document.getElementById('editDate').value;
    const time = document.getElementById('editTime').value;
    updateData.ts = new Date(`${date}T${time}`).toISOString();
    updateData.type = document.getElementById('editDiaperType').value;
  } else if (currentEditCollection === 'sleep') {
    const startDate = document.getElementById('editStartDate').value;
    const startTime = document.getElementById('editStartTime').value;
    const endDate = document.getElementById('editEndDate').value;
    const endTime = document.getElementById('editEndTime').value;
    
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    
    if (end <= start) {
      alert('La hora de fin debe ser mayor que la de inicio');
      return;
    }
    
    updateData.start = start.toISOString();
    updateData.end = end.toISOString();
    updateData.ts = start.toISOString();
    updateData.min = Math.round((end - start) / 60000);
  } else if (currentEditCollection === 'growth') {
    const date = document.getElementById('editDate').value;
    const time = document.getElementById('editTime').value;
    updateData.ts = new Date(`${date}T${time}`).toISOString();
    updateData.w = parseFloat(document.getElementById('editWeight').value) || 0;
    updateData.h = parseFloat(document.getElementById('editHeight').value) || 0;
  }
  
  // Update in state
  const index = state[currentEditCollection].findIndex(r => r.id === currentEditRecord.id);
  if (index !== -1) {
    state[currentEditCollection][index] = { ...state[currentEditCollection][index], ...updateData };
  }
  
  // Update in DB
  await updateRecordToDB(currentEditCollection, currentEditRecord.id, updateData);
  
  closeEditModal();
  
  // Refresh UI
  updateUI();
  renderRecentFeeding();
  renderRecentDiapers();
  renderRecentSleep();
  renderGrowthHistory();
  renderMonthlyHistory();
};

window.closeEditModal = closeEditModal;

// ============================================
// UI RENDERING
// ============================================
const updateUI = () => {
  if (state.profile) {
    showView('home');
    renderRecentFeeding();
    renderRecentDiapers();
    renderRecentSleep();
    renderGrowthHistory();
  } else {
    showView('profile');
  }
};

const renderHome = () => {
  const age = getAge(state.profile?.birth);
  const now = new Date();
  const end = now.getTime() + 1;
  const today = summarizePeriod(now.getTime() - 24 * 3600000, end);
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const week = summarizePeriod(weekStart.getTime(), end);

  const homeView = document.getElementById('homeView');
  if (!homeView) return;
  
  homeView.innerHTML = `
    <section class="card">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="font-size: 40px;">${state.profile?.sex === 'niño' ? '👦' : '👧'}</div>
        <div>
          <div id="homeBabyName" style="font-weight: 600; font-size: 18px;"></div>
          <div class="muted">${age} ${age === 1 ? 'mes' : 'meses'} • ${state.profile?.sex || ''}</div>
        </div>
        <span style="flex: 1;"></span>
        <button class="btn-sec" onclick="editProfile()">✏️</button>
      </div>
    </section>
    <section class="card">
      <h3>Acciones rápidas</h3>
      <div class="row">
        <button class="btn btn-full" onclick="showView('feeding')">🍼 Alimentar</button>
        <button class="btn btn-full" onclick="showView('diapers')">👶 Pañal</button>
        <button class="btn btn-full" onclick="showView('sleep')">😴 Dormir</button>
        <button class="btn btn-full" onclick="showView('growth')">📏 Crecer</button>
      </div>
    </section>
    <section class="card">
      <h3>Resumen 24h</h3>
      <div class="row">
        <div style="text-align: center; padding: 10px; background: var(--suave); border-radius: 10px;">
          <div class="big">${today.breast}</div>
          <div class="muted">pechos</div>
        </div>
        <div style="text-align: center; padding: 10px; background: var(--suave); border-radius: 10px;">
          <div class="big">${today.ounces.toFixed(1)}</div>
          <div class="muted">oz leche</div>
        </div>
        <div style="text-align: center; padding: 10px; background: var(--suave); border-radius: 10px;">
          <div class="big">${today.diapers}</div>
          <div class="muted">pañales</div>
        </div>
        <div style="text-align: center; padding: 10px; background: var(--suave); border-radius: 10px;">
          <div class="big">${(today.sleep / 60).toFixed(1)}</div>
          <div class="muted">horas</div>
        </div>
      </div>
    </section>
    <section class="card">
      <h3>Resumen semanal · últimos 7 días</h3>
      <div class="summary-grid" id="weeklySummary">
        ${summaryItem('🍼', week.breast, 'pechos')}
        ${summaryItem('🥛', week.ounces.toFixed(1), 'oz leche')}
        ${summaryItem('👶', week.diapers, 'pañales')}
        ${summaryItem('😴', formatDuration(week.sleep), 'sueño total')}
      </div>
    </section>
    <section class="card">
      <h3>📈 Resumen mensual</h3>
      <div id="monthlySummary"></div>
    </section>
    <section class="card">
      <h3>Línea de tiempo <span class="pill">24h</span></h3>
      <div id="homeTimeline"></div>
    </section>
  `;
  
  document.getElementById('homeBabyName').textContent = state.profile?.name || 'Bebé';
  renderTimelineIn('homeTimeline');
  renderMonthlySummary();
};

// ============================================
// RESUMEN MENSUAL
// ============================================
const summaryItem = (icon, value, label) => `
  <div class="summary-item">
    <span class="summary-icon">${icon}</span>
    <div class="summary-data">
      <div class="summary-value">${value}</div>
      <div class="summary-label">${label}</div>
    </div>
  </div>`;

const renderMonthlySummary = () => {
  const container = document.getElementById('monthlySummary');
  if (!container) return;

  const now = new Date();
  const start = currentMonthStart(now);
  const end = now.getTime() + 1;
  const month = summarizePeriod(start, end);
  const latest = state.growth.filter(r => withinPeriod(r.ts, start, end))
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))[0];

  container.innerHTML = `
    <div class="muted text-center mb-2">📅 ${monthLabel(now)} ${now.getFullYear()}</div>
    <div class="summary-grid">
      ${summaryItem('🍼', month.breast, 'pechos')}
      ${summaryItem('🥛', month.ounces.toFixed(1), 'oz total')}
      ${summaryItem('💧', month.pumpLeft.toFixed(1), 'oz izq')}
      ${summaryItem('💧', month.pumpRight.toFixed(1), 'oz der')}
      ${summaryItem('👶', month.diapers, 'pañales')}
      ${summaryItem('😴', formatDuration(month.sleep), 'sueño total')}
      ${summaryItem('📏', latest?.w ? Number(latest.w) + 'kg' : '-', 'peso')}
    </div>
    ${latest?.h ? `<div class="muted text-center mt-2">Talla actual: ${Number(latest.h)} cm</div>` : ''}
  `;
};

// ============================================
// TIMELINE (Solo en inicio)
// ============================================
const renderTimelineIn = (containerId) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const now = Date.now();
  const windowStart = now - 24 * 3600000;
  const is24h = (ts) => withinPeriod(ts, windowStart, now + 1);
  const events = [];
  state.breast.filter(r => is24h(r.ts)).forEach(r => events.push({ type: 'breast', ts: r.ts, title: `Pecho` }));
  state.mix.filter(r => is24h(r.ts)).forEach(r => events.push({ type: 'mix', ts: r.ts, title: `Mixta ${r.lm}+${r.lf} oz` }));
  state.pump.filter(r => is24h(r.ts)).forEach(r => events.push({ type: 'pump', ts: r.ts, title: `Extracción ${r.l}+${r.r} oz` }));
  state.diaper.filter(r => is24h(r.ts)).forEach(r => events.push({ type: 'diaper', ts: r.ts, title: `Pañal ${r.type}` }));
  state.sleep.forEach(record => {
    const minutes = sleepMinutesInPeriod(record, windowStart, now + 1);
    if (minutes > 0) {
      const ts = Math.max(new Date(record.start || record.ts).getTime(), windowStart);
      events.push({ type: 'sleep', ts, title: `Sueño ${formatDuration(minutes)}` });
    }
  });
  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  if (events.length === 0) {
    container.innerHTML = '<p class="muted text-center" style="padding: 20px;">No hay registros en las últimas 24 horas</p>';
    return;
  }

  const start = new Date(windowStart);
  start.setMinutes(0, 0, 0);
  const hours = [];
  for (let time = start.getTime(); time <= now; time += 3600000) {
    hours.push({ time: new Date(time), events: [] });
  }
  events.forEach(event => {
    const hourIndex = Math.floor((new Date(event.ts) - start) / 3600000);
    hours[hourIndex].events.push(event);
  });

  const getIcon = (type) => ({ breast: '🍼', mix: '🥛', pump: '💧', diaper: '👶', sleep: '😴' }[type] || '•');

  let html = '<div class="timeline">';
  hours.forEach(h => {
    let label = h.time.getHours();
    const ampm = label >= 12 ? 'PM' : 'AM';
    label = label % 12 || 12;
    html += `<div class="t-row"><div class="t-time">${label}${ampm}</div><div class="t-events">${h.events.map(e => `<div class="t-icon ${e.type}" title="${e.title}">${getIcon(e.type)}</div>`).join('')}</div></div>`;
  });
  html += '</div>';
  container.innerHTML = html;
};

// ============================================
// REGISTROS RECIENTES (con botón editar)
// ============================================
const renderRecentFeeding = () => {
  const container = document.getElementById('recentFeeding');
  if (!container) return;
  
  const allRecords = [];
  state.breast.forEach(r => allRecords.push({ ...r, type: 'breast', sortTs: r.ts }));
  state.mix.forEach(r => allRecords.push({ ...r, type: 'mix', sortTs: r.ts }));
  state.pump.forEach(r => allRecords.push({ ...r, type: 'pump', sortTs: r.ts }));
  
  allRecords.sort((a, b) => new Date(b.sortTs) - new Date(a.sortTs));
  
  let html = '';
  allRecords.slice(0, 10).forEach(r => {
    const actions = `<div class="record-actions"><button class="btn-edit" onclick="editRecord('${r.type}', '${r.id}')">✏️</button><button class="btn-danger" onclick="delRecord('${r.type}', '${r.id}')">🗑</button></div>`;
    if (r.type === 'breast') {
      html += `<div class="record-item"><span>🍼 ${formatDateTime(r.ts)} — Pecho</span>${actions}</div>`;
    } else if (r.type === 'mix') {
      html += `<div class="record-item"><span>🥛 ${formatDateTime(r.ts)} — Mixta: ${r.lm}oz LM + ${r.lf}oz fórmula</span>${actions}</div>`;
    } else if (r.type === 'pump') {
      html += `<div class="record-item"><span>💧 ${formatDateTime(r.ts)} — Extracción: ${r.l}oz izq + ${r.r}oz der</span>${actions}</div>`;
    }
  });
  container.innerHTML = html || '<p class="muted text-center">No hay registros</p>';
};

const renderRecentDiapers = () => {
  const container = document.getElementById('recentDiapers');
  if (!container) return;
  
  const sorted = [...state.diaper].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  
  let html = '';
  sorted.slice(0, 10).forEach(r => {
    const icon = r.type === 'pipi' ? '💧' : r.type === 'caca' ? '💩' : '💧💩';
    const actions = `<div class="record-actions"><button class="btn-edit" onclick="editRecord('diaper', '${r.id}')">✏️</button><button class="btn-danger" onclick="delRecord('diaper', '${r.id}')">🗑</button></div>`;
    html += `<div class="record-item"><span>${icon} ${formatDateTime(r.ts)} — Pañal ${r.type}</span>${actions}</div>`;
  });
  container.innerHTML = html || '<p class="muted text-center">No hay registros</p>';
};

const renderRecentSleep = () => {
  const container = document.getElementById('recentSleep');
  if (!container) return;
  
  const sorted = [...state.sleep].sort((a, b) => new Date(b.ts || b.start) - new Date(a.ts || a.start));
  
  let html = '';
  sorted.slice(0, 10).forEach(r => {
    const hours = Math.floor(r.min / 60);
    const mins = r.min % 60;
    const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
    const actions = `<div class="record-actions"><button class="btn-edit" onclick="editRecord('sleep', '${r.id}')">✏️</button><button class="btn-danger" onclick="delRecord('sleep', '${r.id}')">🗑</button></div>`;
    html += `<div class="record-item"><span>😴 ${formatDateTime(r.ts || r.start)} — Sueño: ${duration}</span>${actions}</div>`;
  });
  container.innerHTML = html || '<p class="muted text-center">No hay registros</p>';
};

const renderGrowthHistory = () => {
  const container = document.getElementById('growthHistory');
  if (!container) return;
  
  const sorted = [...state.growth].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  
  let html = '';
  sorted.slice(0, 5).forEach(r => {
    const dateStr = r.ts ? formatDateTime(r.ts) : r.date;
    const actions = `<div class="record-actions"><button class="btn-edit" onclick="editRecord('growth', '${r.id}')">✏️</button><button class="btn-danger" onclick="delRecord('growth', '${r.id}')">🗑</button></div>`;
    html += `<div class="record-item"><span>📏 ${dateStr} — Peso: ${r.w}kg, Talla: ${r.h}cm</span>${actions}</div>`;
  });
  container.innerHTML = html || '<p class="muted text-center">No hay registros</p>';
};

// ============================================
// HISTORIAL MENSUAL
// ============================================
let currentHistoryTab = 'feeding';

// Chart instances
let chartInstances = {};

const createDoughnutChart = (canvasId, label, prevValue, currentValue, labels) => {

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  // Destroy previous chart if exists
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }
  
  const ctx = canvas.getContext('2d');
  
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: [prevValue, currentValue],
        backgroundColor: ['rgba(255, 111, 168, 0.8)', 'rgba(127, 98, 255, 0.8)'],
        borderColor: ['rgba(255, 111, 168, 1)', 'rgba(127, 98, 255, 1)'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '60%',
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 8,
            font: { size: 10 }
          }
        },
        title: {
          display: true,
          text: label,
          font: { size: 13, weight: 'bold' },
          padding: { bottom: 8 }
        }
      }
    }
  });
};

// Render monthly comparison charts
const renderMonthlyChart = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = currentMonthStart(now);
  const previousStart = new Date(year, month - 1, 1);
  const daysInPreviousMonth = new Date(year, month, 0).getDate();
  const previousDay = Math.min(now.getDate(), daysInPreviousMonth);
  const previousEnd = now.getDate() > daysInPreviousMonth ? start :
    new Date(year, month - 1, previousDay, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).getTime() + 1;
  const current = summarizePeriod(start, now.getTime() + 1);
  const previous = summarizePeriod(previousStart.getTime(), previousEnd);
  const labels = [`${monthLabel(previousStart)} (1-${previousDay})`, `${monthLabel(now)} (1-${now.getDate()})`];

  createDoughnutChart('chartBreast', '🍼 Pechos', previous.breast, current.breast, labels);
  createDoughnutChart('chartOz', '🥛 Onzas', previous.ounces, current.ounces, labels);
  createDoughnutChart('chartDiaper', '👶 Pañales', previous.diapers, current.diapers, labels);
  createDoughnutChart('chartSleep', '😴 Horas', previous.sleep / 60, current.sleep / 60, labels);
};

const renderMonthlyHistory = () => {
  const container = document.getElementById('monthlyHistoryContent');
  if (!container) return;
  
  const now = new Date();
  const start = currentMonthStart(now);
  const end = now.getTime() + 1;
  const isCurrentMonth = (ts) => withinPeriod(ts, start, end);
  const monthBreast = state.breast.filter(r => isCurrentMonth(r.ts));
  const monthMix = state.mix.filter(r => isCurrentMonth(r.ts));
  const monthPump = state.pump.filter(r => isCurrentMonth(r.ts));
  const monthDiaper = state.diaper.filter(r => isCurrentMonth(r.ts));
  const monthSleep = state.sleep.filter(r => sleepMinutesInPeriod(r, start, end) > 0);
  
  let html = '';
  
  if (currentHistoryTab === 'feeding') {
    const allFeeding = [];
    monthBreast.forEach(r => allFeeding.push({ ...r, type: 'breast', sortTs: r.ts }));
    monthMix.forEach(r => allFeeding.push({ ...r, type: 'mix', sortTs: r.ts }));
    monthPump.forEach(r => allFeeding.push({ ...r, type: 'pump', sortTs: r.ts }));
    allFeeding.sort((a, b) => new Date(b.sortTs) - new Date(a.sortTs));
    
    html = `<div class="muted mb-2">Total: ${allFeeding.length} registros</div>`;
    allFeeding.forEach(r => {
      const actions = `<div class="record-actions"><button class="btn-edit" onclick="editRecord('${r.type}', '${r.id}')">✏️</button><button class="btn-danger" onclick="delRecord('${r.type}', '${r.id}')">🗑</button></div>`;
      if (r.type === 'breast') {
        html += `<div class="record-item"><span>🍼 ${formatDateTime(r.ts)} — Pecho</span>${actions}</div>`;
      } else if (r.type === 'mix') {
        html += `<div class="record-item"><span>🥛 ${formatDateTime(r.ts)} — Mixta: ${r.lm}oz LM + ${r.lf}oz fórmula</span>${actions}</div>`;
      } else if (r.type === 'pump') {
        html += `<div class="record-item"><span>💧 ${formatDateTime(r.ts)} — Extracción: ${r.l}oz + ${r.r}oz</span>${actions}</div>`;
      }
    });
  } else if (currentHistoryTab === 'diapers') {
    const sorted = [...monthDiaper].sort((a, b) => new Date(b.ts) - new Date(a.ts));
    html = `<div class="muted mb-2">Total: ${sorted.length} pañales</div>`;
    sorted.forEach(r => {
      const icon = r.type === 'pipi' ? '💧' : r.type === 'caca' ? '💩' : '💧💩';
      const actions = `<div class="record-actions"><button class="btn-edit" onclick="editRecord('diaper', '${r.id}')">✏️</button><button class="btn-danger" onclick="delRecord('diaper', '${r.id}')">🗑</button></div>`;
      html += `<div class="record-item"><span>${icon} ${formatDateTime(r.ts)} — ${r.type}${r.weightGrams ? ` · ${Number(r.weightGrams)} g` : ''}</span>${actions}</div>`;
    });
  } else if (currentHistoryTab === 'sleep') {
    const sorted = [...monthSleep].sort((a, b) => new Date(b.ts || b.start) - new Date(a.ts || a.start));
    const totalHours = sorted.reduce((sum, r) => sum + sleepMinutesInPeriod(r, start, end), 0) / 60;
    html = `<div class="muted mb-2">Total: ${totalHours.toFixed(1)} horas (${sorted.length} registros)</div>`;
    sorted.forEach(r => {
      const duration = formatDuration(sleepMinutesInPeriod(r, start, end));
      const actions = `<div class="record-actions"><button class="btn-edit" onclick="editRecord('sleep', '${r.id}')">✏️</button><button class="btn-danger" onclick="delRecord('sleep', '${r.id}')">🗑</button></div>`;
      html += `<div class="record-item"><span>😴 ${formatDateTime(r.ts || r.start)} — ${duration}</span>${actions}</div>`;
    });
  }
  
  container.innerHTML = html || '<p class="muted text-center">No hay registros este mes</p>';
};

const renderDailyHistory = (searchDate) => {
  const card = document.getElementById('historyResultsCard');
  const date = searchDate || card.dataset.date;
  if (!date) return;

  const dateStart = new Date(date + 'T00:00:00');
  const dateEnd = new Date(dateStart);
  dateEnd.setDate(dateEnd.getDate() + 1);
  const results = [];
  for (const category of ['breast', 'mix', 'pump', 'diaper', 'growth', 'sleep']) {
    for (const record of state[category]) {
      if (category === 'sleep') {
        const minutes = sleepMinutesInPeriod(record, dateStart, dateEnd);
        if (minutes > 0) {
          const ts = Math.max(new Date(record.start || record.ts), dateStart);
          results.push({ ...record, category, ts, minutes });
        }
      } else if (withinPeriod(record.ts, dateStart, dateEnd)) {
        results.push({ ...record, category });
      }
    }
  }

  results.sort((a, b) => new Date(b.ts || b.start) - new Date(a.ts || a.start));

  const title = document.getElementById('historyDateTitle');
  const container = document.getElementById('historyResults');

  const formattedDate = dateStart.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  title.textContent = `Registros del ${formattedDate}`;

  if (results.length === 0) {
    container.innerHTML = '<p class="muted text-center">No hay registros para esta fecha</p>';
  } else {
    let html = '';
    results.forEach(r => {
      if (r.category === 'breast') {
        html += `<div class="record-item"><span>🍼 ${formatTime(r.ts)} — Pecho</span></div>`;
      } else if (r.category === 'mix') {
        html += `<div class="record-item"><span>🥛 ${formatTime(r.ts)} — Mixta: ${r.lm}oz + ${r.lf}oz</span></div>`;
      } else if (r.category === 'pump') {
        html += `<div class="record-item"><span>💧 ${formatTime(r.ts)} — Extracción: ${r.l}oz + ${r.r}oz</span></div>`;
      } else if (r.category === 'diaper') {
        const icon = r.type === 'pipi' ? '💧' : r.type === 'caca' ? '💩' : '💧💩';
        html += `<div class="record-item"><span>${icon} ${formatTime(r.ts)} — Pañal ${r.type}${r.weightGrams ? ` · ${Number(r.weightGrams)} g` : ''}</span></div>`;
      } else if (r.category === 'sleep') {
        const duration = formatDuration(r.minutes);
        html += `<div class="record-item"><span>😴 ${formatTime(r.ts)} — Sueño: ${duration}</span></div>`;
      } else if (r.category === 'growth') {
        html += `<div class="record-item"><span>📏 ${formatTime(r.ts)} — ${r.w}kg, ${r.h}cm</span></div>`;
      }
    });
    container.innerHTML = html;
  }

  card.dataset.date = date;
  card.style.display = 'block';
};

// ============================================
// NAVIGATION
// ============================================
const showView = (view) => {
  if (!state.profile) view = 'profile';
  document.getElementById('appContainer').classList.toggle('needs-profile', !state.profile);
  document.getElementById('bottomNav').hidden = view === 'profile';
  if (view === 'profile') document.getElementById('babyBirth').max = localDateInput();

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById(view + 'View');
  if (viewEl) viewEl.classList.add('active');
  
  document.querySelectorAll('[data-view]').forEach(link => {
    const active = link.dataset.view === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  
  const panel = document.getElementById('panel');
  const overlay = document.getElementById('overlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('open');

  if (view === 'home') renderHome();
  if (view === 'history') {
    renderMonthlyHistory();
    renderMonthlyChart();
  }
};

window.showView = showView;
window.editProfile = () => {
  if (state.profile) {
    document.getElementById('babyName').value = state.profile.name || '';
    document.getElementById('babySex').value = state.profile.sex || 'niño';
    document.getElementById('babyBirth').value = state.profile.birth || '';
  }
  showView('profile');
};

// Elimina los datos mostrados y los borradores al cerrar la sesión o borrar los registros.
const resetProfileForm = () => {
  closeEditModal();
  showView('profile');

  const now = new Date();
  const today = localDateInput(now);
  const time = now.toTimeString().slice(0, 5);
  document.querySelectorAll('#appContainer input').forEach(input => {
    if (input.type === 'time') input.value = time;
    else if (['sleepDate', 'sleepDateEnd', 'growthDate'].includes(input.id)) input.value = today;
    else input.value = input.defaultValue;
  });
  document.querySelectorAll('#appContainer select').forEach(select => { select.selectedIndex = 0; });

  const lists = ['homeView', 'recentFeeding', 'recentDiapers', 'recentSleep', 'growthHistory',
    'monthlyHistoryContent', 'historyResults', 'editModalContent'];
  lists.forEach(id => document.getElementById(id).replaceChildren());
  document.getElementById('historyResultsCard').style.display = 'none';
  document.getElementById('historyDateTitle').textContent = 'Registros del día';
  Object.values(chartInstances).forEach(chart => chart.destroy());
  chartInstances = {};
};

// Helper para obtener fecha/hora
const getDateTime = (dateId, timeId) => {
  const date = document.getElementById(dateId)?.value || new Date().toISOString().slice(0, 10);
  const time = document.getElementById(timeId)?.value || new Date().toTimeString().slice(0, 5);
  return new Date(`${date}T${time}`).toISOString();
};

// Obtener timestamp de hoy + hora
const getTodayWithTime = (timeId) => {
  const today = new Date().toISOString().slice(0, 10);
  const time = document.getElementById(timeId)?.value || new Date().toTimeString().slice(0, 5);
  return new Date(`${today}T${time}`).toISOString();
};

// Edit record - abre el modal
window.editRecord = (collection, id) => {
  const record = state[collection].find(r => r.id === id);
  if (record) {
    openEditModal(collection, record);
  }
};

// Delete record
window.delRecord = async (collection, id) => {
  if (!confirm('¿Eliminar este registro?')) return;
  if (await deleteRecordFromDB(collection, id)) {
    state[collection] = state[collection].filter(record => record.id !== id);
    refreshRecordViews();
  }
};

// ============================================
// EVENT HANDLERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('online', showSync);
  window.addEventListener('offline', showSync);

  auth.onAuthStateChanged(user => {
    stopDataSession();
    currentUser = user;
    state = emptyState();
    const loadingScreen = document.getElementById('loadingScreen');
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    appContainer.style.display = 'none';
    appContainer.inert = false;
    authContainer.style.display = user ? 'none' : 'block';
    loadingScreen.style.display = user ? 'flex' : 'none';
    document.getElementById('userEmail').textContent = user?.email || '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('registerPassword').value = '';
    document.getElementById('registerPasswordConfirm').value = '';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('resetForm').style.display = 'none';
    resetProfileForm();
    applyTheme();
    renderSleepTimer();
    showSync();
    if (!user) return;

    subscribeToUserData(user, () => {
      appContainer.style.display = 'block';
      loadingScreen.style.display = 'none';
      updateUI();
    });
  });

  // Auth forms
  document.getElementById('showRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
  });
  
  document.getElementById('showLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('resetForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
  });
  
  document.getElementById('showReset')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('resetForm').style.display = 'block';
  });
  
  document.getElementById('showLoginFromReset')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('resetForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
  });

  // Login
  document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    if (errorEl) errorEl.textContent = '';
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      if (errorEl) errorEl.textContent = e.message;
    }
  });

  // Register
  document.getElementById('registerBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerPasswordConfirm').value;
    const errorEl = document.getElementById('registerError');
    if (errorEl) errorEl.textContent = '';
    
    if (password !== confirm) {
      if (errorEl) errorEl.textContent = 'Las contraseñas no coinciden';
      return;
    }
    if (password.length < 6) {
      if (errorEl) errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
      return;
    }
    
    try {
      await auth.createUserWithEmailAndPassword(email, password);
    } catch (e) {
      if (errorEl) errorEl.textContent = e.message;
    }
  });

  // Reset password
  document.getElementById('resetBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('resetEmail').value;
    const errorEl = document.getElementById('resetError');
    const successEl = document.getElementById('resetSuccess');
    if (errorEl) errorEl.textContent = '';
    if (successEl) successEl.textContent = '';
    
    try {
      await auth.sendPasswordResetEmail(email);
      if (successEl) successEl.textContent = 'Correo enviado. Revisa tu bandeja de entrada.';
    } catch (e) {
      if (errorEl) errorEl.textContent = e.message;
    }
  });

  // Logout
  const logout = async () => {
    if (confirm('¿Seguro que quieres cerrar sesión?')) {
      await auth.signOut();
    }
  };
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('logoutBtn2')?.addEventListener('click', logout);
  document.getElementById('logoutBtnSide')?.addEventListener('click', logout);

  // Menu
  document.getElementById('menuBtn')?.addEventListener('click', () => {
    document.getElementById('panel')?.classList.toggle('open');
    document.getElementById('overlay')?.classList.toggle('open');
  });
  document.getElementById('overlay')?.addEventListener('click', () => {
    document.getElementById('panel')?.classList.remove('open');
    document.getElementById('overlay')?.classList.remove('open');
  });

  // Theme
  document.querySelectorAll('.sw').forEach(sw => {
    sw.addEventListener('click', async () => {
      await saveTheme({ theme: sw.dataset.theme });
    });
  });

  // Dark mode
  const toggleDark = () => saveTheme({ dark: !state.dark });
  document.getElementById('darkBtn')?.addEventListener('click', toggleDark);
  document.getElementById('darkBtn2')?.addEventListener('click', toggleDark);
  document.getElementById('darkBtn3')?.addEventListener('click', toggleDark);

  // Navigation
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => showView(el.dataset.view));
  });

  // Feeding tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('breastTab').style.display = tab.dataset.tab === 'breast' ? 'block' : 'none';
      document.getElementById('mixTab').style.display = tab.dataset.tab === 'mix' ? 'block' : 'none';
      document.getElementById('pumpTab').style.display = tab.dataset.tab === 'pump' ? 'block' : 'none';
    });
  });

  // History tabs
  document.querySelectorAll('.history-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentHistoryTab = tab.dataset.history;
      renderMonthlyHistory();
    });
  });

  // Profile
  document.getElementById('saveProfile')?.addEventListener('click', async () => {
    const name = document.getElementById('babyName').value.trim();
    const sex = document.getElementById('babySex').value;
    const birth = document.getElementById('babyBirth').value;
    
    if (!name || !birth) {
      alert('Por favor completa nombre y fecha de nacimiento');
      return;
    }
    
    if (birth > localDateInput()) {
      alert('La fecha de nacimiento no puede ser futura');
      return;
    }

    const profile = { name, sex, birth };
    const saved = await writeUserData('guardar el perfil', ref =>
      ref.collection('profile').doc('baby').set(profile)
    );
    if (saved) {
      state.profile = profile;
      updateUI();
    }
  });

  // Pecho
  document.getElementById('saveBreast')?.addEventListener('click', async () => {
    const ts = getTodayWithTime('breastTime');
    const record = { id: genId(), ts };
    state.breast.unshift(record);
    await saveRecord('breast', record);
    renderRecentFeeding();
    renderTimelineIn('homeTimeline');
    document.getElementById('breastTime').value = new Date().toTimeString().slice(0, 5);
  });

  // Mix feeding
  document.getElementById('saveMix')?.addEventListener('click', async () => {
    const lm = parseFloat(document.getElementById('mixLm').value) || 0;
    const lf = parseFloat(document.getElementById('mixLf').value) || 0;
    if (lm === 0 && lf === 0) {
      alert('Ingresa al menos una cantidad');
      return;
    }
    const ts = getTodayWithTime('mixTime');
    const record = { id: genId(), ts, lm, lf };
    state.mix.unshift(record);
    await saveRecord('mix', record);
    document.getElementById('mixLm').value = '';
    document.getElementById('mixLf').value = '';
    document.getElementById('mixTime').value = new Date().toTimeString().slice(0, 5);
    renderRecentFeeding();
    renderTimelineIn('homeTimeline');
  });

  // Extracción
  document.getElementById('savePump')?.addEventListener('click', async () => {
    const l = parseFloat(document.getElementById('pumpL').value) || 0;
    const r = parseFloat(document.getElementById('pumpR').value) || 0;
    if (l === 0 && r === 0) {
      alert('Ingresa al menos una cantidad');
      return;
    }
    const ts = getTodayWithTime('pumpTime');
    const record = { id: genId(), ts, l, r };
    state.pump.unshift(record);
    await saveRecord('pump', record);
    document.getElementById('pumpL').value = '';
    document.getElementById('pumpR').value = '';
    document.getElementById('pumpTime').value = new Date().toTimeString().slice(0, 5);
    renderRecentFeeding();
    renderTimelineIn('homeTimeline');
  });

  // Pañal
  document.getElementById('saveDiaper')?.addEventListener('click', async () => {
    const type = document.getElementById('diaperType').value;
    const ts = getTodayWithTime('diaperTime');
    const record = { id: genId(), ts, type };
    state.diaper.unshift(record);
    await saveRecord('diaper', record);
    document.getElementById('diaperTime').value = new Date().toTimeString().slice(0, 5);
    renderRecentDiapers();
    renderTimelineIn('homeTimeline');
  });

  // Sueño
  document.getElementById('saveSleepManual')?.addEventListener('click', async () => {
    const startDate = document.getElementById('sleepDate').value;
    const startTime = document.getElementById('sleepTimeStart').value;
    const endDate = document.getElementById('sleepDateEnd').value;
    const endTime = document.getElementById('sleepTimeEnd').value;
    
    if (!startDate || !startTime || !endDate || !endTime) {
      alert('Completa todos los campos');
      return;
    }
    
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    
    if (end <= start) {
      alert('La hora de fin debe ser mayor que la de inicio');
      return;
    }
    
    const min = Math.round((end - start) / 60000);
    const record = { 
      id: genId(), 
      ts: start.toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      min 
    };
    state.sleep.unshift(record);
    await saveRecord('sleep', record);
    
    const now = new Date();
    document.getElementById('sleepDate').value = now.toISOString().slice(0, 10);
    document.getElementById('sleepDateEnd').value = now.toISOString().slice(0, 10);
    document.getElementById('sleepTimeStart').value = now.toTimeString().slice(0, 5);
    document.getElementById('sleepTimeEnd').value = now.toTimeString().slice(0, 5);
    
    renderRecentSleep();
    renderTimelineIn('homeTimeline');
  });

  // Crecimiento
  document.getElementById('saveGrowth')?.addEventListener('click', async () => {
    const w = parseFloat(document.getElementById('growthWeight').value) || 0;
    const h = parseFloat(document.getElementById('growthHeight').value) || 0;
    if (w === 0 || h === 0) {
      alert('Ingresa peso y talla');
      return;
    }
    const ts = getDateTime('growthDate', 'growthTime');
    const record = { id: genId(), ts, w, h };
    state.growth.unshift(record);
    await saveRecord('growth', record);
    document.getElementById('growthWeight').value = '';
    document.getElementById('growthHeight').value = '';
    renderGrowthHistory();
  });

  document.getElementById('searchHistory')?.addEventListener('click', () => {
    const date = document.getElementById('historyDate').value;
    if (date) renderDailyHistory(date);
    else alert('Selecciona una fecha');
  });

  // Save edit button
  document.getElementById('saveEditBtn')?.addEventListener('click', saveEditedRecord);
  
  // Close modal on overlay click
  document.getElementById('editModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeEditModal();
  });

  // Borrar datos
  document.getElementById('clearData')?.addEventListener('click', async () => {
    const session = dataSession;
    if (!session || session.deleting) return;
    if (session.pending) {
      alert('Espera a que se guarden los cambios antes de borrar tus datos.');
      return;
    }
    if (!confirm('¿Estás seguro? Se borrarán TODOS tus datos. Esta acción no se puede deshacer.')) return;
    if (!confirm('¿REALMENTE quieres borrar todo?')) return;
    const appContainer = document.getElementById('appContainer');
    const uid = currentUser.uid;

    const deleted = await writeUserData('borrar todos los datos', async userRef => {
      session.deleting = true;
      appContainer.inert = true;
      let completed = 0;
      try {
        const collections = [...recordCollections, 'profile', 'settings'];
        const snapshots = await Promise.all(collections.map(name =>
          userRef.collection(name).get({ source: 'server' })
        ));
        const documents = snapshots.flatMap(snapshot => snapshot.docs);
        for (let offset = 0; offset < documents.length; offset += 450) {
          if (dataSession !== session) return;
          const batch = db.batch();
          documents.slice(offset, offset + 450).forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          completed += Math.min(450, documents.length - offset);
        }
      } catch (error) {
        if (completed) throw new Error('Se eliminaron parte de los datos. Repite el borrado para eliminar los restantes. ' + error.message);
        throw error;
      } finally {
        session.deleting = false;
        if (dataSession === session) appContainer.inert = false;
      }
    });
    if (!deleted) return;

    clearSleepTimer(uid);
    resetProfileForm();
    renderSleepTimer();
    updateUI();
    alert('Datos eliminados correctamente');
  });
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed:', err));
  });
}
