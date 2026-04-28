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
let state = {
  profile: null,
  theme: 'rosa',
  dark: false,
  breast: [],
  mix: [],
  pump: [],
  diaper: [],
  sleep: [],
  growth: []
};

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
  const b = new Date(birth), n = new Date();
  return Math.max(0, (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth()) - (n.getDate() < b.getDate() ? 1 : 0));
};

const is24h = (ts) => Date.now() - new Date(ts).getTime() <= 24 * 3600000;

// Mes actual
const isCurrentMonth = (ts) => {
  const date = new Date(ts);
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return date >= firstDay && date <= lastDay;
};

const getMonthRange = () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return { firstDay, lastDay, monthName: monthNames[now.getMonth()], year: now.getFullYear() };
};

const showError = (msg) => {
  alert('Error: ' + msg);
  console.error(msg);
};

const showSync = (syncing = false) => {
  const indicator = document.getElementById('syncIndicator');
  const text = document.getElementById('syncText');
  if (!indicator) return;
  indicator.style.display = 'block';
  indicator.classList.toggle('syncing', syncing);
  text.textContent = syncing ? '🔄 Sincronizando...' : '✓ Sincronizado';
  if (!syncing) setTimeout(() => indicator.style.display = 'none', 2000);
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

const saveTheme = async () => {
  if (currentUser) {
    try {
      showSync(true);
      await db.collection('users').doc(currentUser.uid).collection('settings').doc('theme').set({
        theme: state.theme,
        dark: state.dark
      });
      showSync(false);
    } catch (e) {
      console.error('Error saving theme:', e);
    }
  }
};

// ============================================
// DATA SYNC
// ============================================
const loadUserData = async (user) => {
  showSync(true);
  const uid = user.uid;
  
  try {
    const profileDoc = await db.collection('users').doc(uid).collection('profile').doc('baby').get();
    if (profileDoc.exists) state.profile = profileDoc.data();

    const themeDoc = await db.collection('users').doc(uid).collection('settings').doc('theme').get();
    if (themeDoc.exists) {
      state.theme = themeDoc.data().theme || 'rosa';
      state.dark = themeDoc.data().dark || false;
      applyTheme();
    }

    const loadCollection = async (name) => {
      try {
        const snapshot = await db.collection('users').doc(uid).collection(name).orderBy('ts', 'desc').limit(100).get();
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.error(`Error loading ${name}:`, e);
        return [];
      }
    };

    state.breast = await loadCollection('breast');
    state.mix = await loadCollection('mix');
    state.pump = await loadCollection('pump');
    state.diaper = await loadCollection('diaper');
    state.sleep = await loadCollection('sleep');
    state.growth = await loadCollection('growth');

    showSync(false);
  } catch (e) {
    console.error('Error loading user data:', e);
    showError('Error al cargar datos: ' + e.message);
    showSync(false);
  }
};

const saveRecord = async (collection, record) => {
  if (!currentUser) return;
  try {
    showSync(true);
    await db.collection('users').doc(currentUser.uid).collection(collection).doc(record.id).set(record);
    showSync(false);
  } catch (e) {
    showError('Error al guardar: ' + e.message);
  }
};

const deleteRecordFromDB = async (collection, id) => {
  if (!currentUser) return;
  try {
    showSync(true);
    await db.collection('users').doc(currentUser.uid).collection(collection).doc(id).delete();
    showSync(false);
  } catch (e) {
    showError('Error al eliminar: ' + e.message);
  }
};

// ============================================
// UI RENDERING
// ============================================
const updateUI = () => {
  if (state.profile) {
    showView('home');
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) bottomNav.style.display = 'block';
    renderHome();
    renderRecentFeeding();
    renderRecentDiapers();
    renderRecentSleep();
    renderGrowthHistory();
  } else {
    showView('profile');
    const bottomNav = document.getElementById('bottomNav');
    if (bottomNav) bottomNav.style.display = 'none';
  }
};

const renderHome = () => {
  const age = getAge(state.profile?.birth);
  const recentBreast = state.breast.filter(r => is24h(r.ts));
  const recentMix = state.mix.filter(r => is24h(r.ts));
  const recentPump = state.pump.filter(r => is24h(r.ts));
  const recentDiaper = state.diaper.filter(r => is24h(r.ts));
  const recentSleep = state.sleep.filter(r => is24h(r.ts || r.start));
  
  const totalBreast = recentBreast.length;
  const totalOz = recentMix.reduce((s, r) => s + (r.lm || 0) + (r.lf || 0), 0);
  const totalPumpOz = recentPump.reduce((s, r) => s + (r.l || 0) + (r.r || 0), 0);
  const totalSleep = recentSleep.reduce((s, r) => s + (r.min || 0), 0) / 60;

  const homeView = document.getElementById('homeView');
  if (!homeView) return;
  
  homeView.innerHTML = `
    <section class="card">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="font-size: 40px;">${state.profile?.sex === 'niño' ? '👦' : '👧'}</div>
        <div>
          <div style="font-weight: 600; font-size: 18px;">${state.profile?.name || 'Bebé'}</div>
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
          <div class="big">${totalBreast}</div>
          <div class="muted">pechos</div>
        </div>
        <div style="text-align: center; padding: 10px; background: var(--suave); border-radius: 10px;">
          <div class="big">${(totalOz + totalPumpOz).toFixed(1)}</div>
          <div class="muted">oz leche</div>
        </div>
        <div style="text-align: center; padding: 10px; background: var(--suave); border-radius: 10px;">
          <div class="big">${recentDiaper.length}</div>
          <div class="muted">pañales</div>
        </div>
        <div style="text-align: center; padding: 10px; background: var(--suave); border-radius: 10px;">
          <div class="big">${totalSleep.toFixed(1)}</div>
          <div class="muted">horas</div>
        </div>
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
  
  renderTimelineIn('homeTimeline');
  renderMonthlySummary();
};

// ============================================
// RESUMEN MENSUAL
// ============================================
const renderMonthlySummary = () => {
  const container = document.getElementById('monthlySummary');
  if (!container) return;
  
  const monthBreast = state.breast.filter(r => isCurrentMonth(r.ts));
  const monthMix = state.mix.filter(r => isCurrentMonth(r.ts));
  const monthPump = state.pump.filter(r => isCurrentMonth(r.ts));
  const monthDiaper = state.diaper.filter(r => isCurrentMonth(r.ts));
  const monthSleep = state.sleep.filter(r => isCurrentMonth(r.ts || r.start));
  const monthGrowth = state.growth.filter(r => isCurrentMonth(r.ts));
  
  const totalOz = monthMix.reduce((s, r) => s + (r.lm || 0) + (r.lf || 0), 0);
  const totalPumpOz = monthPump.reduce((s, r) => s + (r.l || 0) + (r.r || 0), 0);
  const totalSleep = monthSleep.reduce((s, r) => s + (r.min || 0), 0);
  
  const monthRange = getMonthRange();
  const now = new Date();
  const daysInMonth = now.getDate();
  const avgSleep = monthSleep.length > 0 ? totalSleep / daysInMonth : 0;
  
  const lastWeight = monthGrowth.length > 0 ? monthGrowth[0].w : null;
  const lastHeight = monthGrowth.length > 0 ? monthGrowth[0].h : null;
  
  container.innerHTML = `
    <div class="muted text-center mb-2" style="font-size: 11px;">📅 ${monthRange.monthName} ${monthRange.year}</div>
    <div class="summary-grid">
      <div class="summary-item">
        <span class="summary-icon">🍼</span>
        <div class="summary-data">
          <div class="summary-value">${monthBreast.length}</div>
          <div class="summary-label">pechos</div>
        </div>
      </div>
      <div class="summary-item">
        <span class="summary-icon">🥛</span>
        <div class="summary-data">
          <div class="summary-value">${(totalOz + totalPumpOz).toFixed(0)}</div>
          <div class="summary-label">oz total</div>
        </div>
      </div>
      <div class="summary-item">
        <span class="summary-icon">💧</span>
        <div class="summary-data">
          <div class="summary-value">${monthPump.length}</div>
          <div class="summary-label">extracciones</div>
        </div>
      </div>
      <div class="summary-item">
        <span class="summary-icon">👶</span>
        <div class="summary-data">
          <div class="summary-value">${monthDiaper.length}</div>
          <div class="summary-label">pañales</div>
        </div>
      </div>
      <div class="summary-item">
        <span class="summary-icon">😴</span>
        <div class="summary-data">
          <div class="summary-value">${(totalSleep / 60).toFixed(0)}h</div>
          <div class="summary-label">sueño total</div>
        </div>
      </div>
      <div class="summary-item">
        <span class="summary-icon">📏</span>
        <div class="summary-data">
          <div class="summary-value">${lastWeight ? lastWeight + 'kg' : '-'}</div>
          <div class="summary-label">peso</div>
        </div>
      </div>
    </div>
    ${lastHeight ? `<div class="muted text-center mt-2">Talla actual: ${lastHeight} cm</div>` : ''}
  `;
};

// ============================================
// TIMELINE (Solo en inicio)
// ============================================
const renderTimelineIn = (containerId) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const events = [];
  state.breast.filter(r => is24h(r.ts)).forEach(r => events.push({ type: 'breast', ts: r.ts, title: `Pecho` }));
  state.mix.filter(r => is24h(r.ts)).forEach(r => events.push({ type: 'mix', ts: r.ts, title: `Mixta ${r.lm}+${r.lf} oz` }));
  state.pump.filter(r => is24h(r.ts)).forEach(r => events.push({ type: 'pump', ts: r.ts, title: `Extracción ${r.l}+${r.r} oz` }));
  state.diaper.filter(r => is24h(r.ts)).forEach(r => events.push({ type: 'diaper', ts: r.ts, title: `Pañal ${r.type}` }));
  state.sleep.filter(r => is24h(r.ts || r.start)).forEach(r => events.push({ type: 'sleep', ts: r.ts || r.start, title: `Sueño ${Math.round(r.min/60)}h` }));
  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  if (events.length === 0) {
    container.innerHTML = '<p class="muted text-center" style="padding: 20px;">No hay registros en las últimas 24 horas</p>';
    return;
  }

  const now = new Date();
  const start = new Date(now.getTime() - 23 * 3600000);
  start.setMinutes(0, 0, 0);

  const hours = [];
  for (let i = 0; i < 24; i++) {
    hours.push({ time: new Date(start.getTime() + i * 3600000), events: [] });
  }

  events.forEach(e => {
    const et = new Date(e.ts);
    const hourIndex = Math.floor((et - start) / 3600000);
    if (hourIndex >= 0 && hourIndex < 24) hours[hourIndex].events.push(e);
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
// REGISTROS RECIENTES
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
    if (r.type === 'breast') {
      html += `<div class="record-item"><span>🍼 ${formatDateTime(r.ts)} — Pecho</span><button class="btn-danger" onclick="delRecord('breast', '${r.id}')">🗑</button></div>`;
    } else if (r.type === 'mix') {
      html += `<div class="record-item"><span>🥛 ${formatDateTime(r.ts)} — Mixta: ${r.lm}oz LM + ${r.lf}oz fórmula</span><button class="btn-danger" onclick="delRecord('mix', '${r.id}')">🗑</button></div>`;
    } else if (r.type === 'pump') {
      html += `<div class="record-item"><span>💧 ${formatDateTime(r.ts)} — Extracción: ${r.l}oz izq + ${r.r}oz der</span><button class="btn-danger" onclick="delRecord('pump', '${r.id}')">🗑</button></div>`;
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
    html += `<div class="record-item"><span>${icon} ${formatDateTime(r.ts)} — Pañal ${r.type}</span><button class="btn-danger" onclick="delRecord('diaper', '${r.id}')">🗑</button></div>`;
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
    html += `<div class="record-item"><span>😴 ${formatDateTime(r.ts || r.start)} — Sueño: ${duration}</span><button class="btn-danger" onclick="delRecord('sleep', '${r.id}')">🗑</button></div>`;
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
    html += `<div class="record-item"><span>📏 ${dateStr} — Peso: ${r.w}kg, Talla: ${r.h}cm</span><button class="btn-danger" onclick="delRecord('growth', '${r.id}')">🗑</button></div>`;
  });
  container.innerHTML = html || '<p class="muted text-center">No hay registros</p>';
};

// ============================================
// HISTORIAL MENSUAL
// ============================================
let currentHistoryTab = 'feeding';

const renderMonthlyHistory = () => {
  const container = document.getElementById('monthlyHistoryContent');
  if (!container) return;
  
  const monthBreast = state.breast.filter(r => isCurrentMonth(r.ts));
  const monthMix = state.mix.filter(r => isCurrentMonth(r.ts));
  const monthPump = state.pump.filter(r => isCurrentMonth(r.ts));
  const monthDiaper = state.diaper.filter(r => isCurrentMonth(r.ts));
  const monthSleep = state.sleep.filter(r => isCurrentMonth(r.ts || r.start));
  
  let html = '';
  
  if (currentHistoryTab === 'feeding') {
    // Combinar todos los de alimentación
    const allFeeding = [];
    monthBreast.forEach(r => allFeeding.push({ ...r, type: 'breast', sortTs: r.ts }));
    monthMix.forEach(r => allFeeding.push({ ...r, type: 'mix', sortTs: r.ts }));
    monthPump.forEach(r => allFeeding.push({ ...r, type: 'pump', sortTs: r.ts }));
    allFeeding.sort((a, b) => new Date(b.sortTs) - new Date(a.sortTs));
    
    html = `<div class="muted mb-2">Total: ${allFeeding.length} registros</div>`;
    allFeeding.forEach(r => {
      if (r.type === 'breast') {
        html += `<div class="record-item"><span>🍼 ${formatDateTime(r.ts)} — Pecho</span><button class="btn-danger" onclick="delRecord('breast', '${r.id}')">🗑</button></div>`;
      } else if (r.type === 'mix') {
        html += `<div class="record-item"><span>🥛 ${formatDateTime(r.ts)} — Mixta: ${r.lm}oz LM + ${r.lf}oz fórmula</span><button class="btn-danger" onclick="delRecord('mix', '${r.id}')">🗑</button></div>`;
      } else if (r.type === 'pump') {
        html += `<div class="record-item"><span>💧 ${formatDateTime(r.ts)} — Extracción: ${r.l}oz + ${r.r}oz</span><button class="btn-danger" onclick="delRecord('pump', '${r.id}')">🗑</button></div>`;
      }
    });
  } else if (currentHistoryTab === 'diapers') {
    const sorted = [...monthDiaper].sort((a, b) => new Date(b.ts) - new Date(a.ts));
    html = `<div class="muted mb-2">Total: ${sorted.length} pañales</div>`;
    sorted.forEach(r => {
      const icon = r.type === 'pipi' ? '💧' : r.type === 'caca' ? '💩' : '💧💩';
      html += `<div class="record-item"><span>${icon} ${formatDateTime(r.ts)} — ${r.type}</span><button class="btn-danger" onclick="delRecord('diaper', '${r.id}')">🗑</button></div>`;
    });
  } else if (currentHistoryTab === 'sleep') {
    const sorted = [...monthSleep].sort((a, b) => new Date(b.ts || b.start) - new Date(a.ts || a.start));
    const totalHours = sorted.reduce((s, r) => s + (r.min || 0), 0) / 60;
    html = `<div class="muted mb-2">Total: ${totalHours.toFixed(1)} horas (${sorted.length} registros)</div>`;
    sorted.forEach(r => {
      const hours = Math.floor(r.min / 60);
      const mins = r.min % 60;
      const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
      html += `<div class="record-item"><span>😴 ${formatDateTime(r.ts || r.start)} — ${duration}</span><button class="btn-danger" onclick="delRecord('sleep', '${r.id}')">🗑</button></div>`;
    });
  }
  
  container.innerHTML = html || '<p class="muted text-center">No hay registros este mes</p>';
};

// ============================================
// NAVIGATION
// ============================================
const showView = (view) => {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById(view + 'View');
  if (viewEl) viewEl.classList.add('active');
  
  document.querySelectorAll('.nav-btn, .nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`[data-view="${view}"]`).forEach(b => b.classList.add('active'));
  
  const panel = document.getElementById('panel');
  const overlay = document.getElementById('overlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('open');

  if (view === 'home') renderHome();
  if (view === 'history') renderMonthlyHistory();
};

window.showView = showView;
window.editProfile = () => {
  if (state.profile) {
    document.getElementById('babyName').value = state.profile.name || '';
    document.getElementById('babySex').value = state.profile.sex || 'niño';
    document.getElementById('babyBirth').value = state.profile.birth || '';
  }
  showView('profile');
  const bottomNav = document.getElementById('bottomNav');
  if (bottomNav) bottomNav.style.display = 'none';
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

// Delete record
window.delRecord = async (collection, id) => {
  if (!confirm('¿Eliminar este registro?')) return;
  state[collection] = state[collection].filter(r => r.id !== id);
  await deleteRecordFromDB(collection, id);
  updateUI();
  renderRecentFeeding();
  renderRecentDiapers();
  renderRecentSleep();
  renderMonthlyHistory();
};

// ============================================
// EVENT HANDLERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('App starting...');
  
  // Auth state observer
  auth.onAuthStateChanged(async (user) => {
    console.log('Auth state changed:', user ? user.email : 'no user');
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.style.display = 'flex';
    
    if (user) {
      currentUser = user;
      const userEmail = document.getElementById('userEmail');
      if (userEmail) userEmail.textContent = user.email;
      
      await loadUserData(user);
      
      const authContainer = document.getElementById('authContainer');
      const appContainer = document.getElementById('appContainer');
      if (authContainer) authContainer.style.display = 'none';
      if (appContainer) appContainer.style.display = 'block';
      applyTheme();
      updateUI();
      
      // Initialize time inputs
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      const today = now.toISOString().slice(0, 10);
      
      const timeInputs = ['breastTime', 'mixTime', 'pumpTime', 'diaperTime', 'sleepTimeStart', 'sleepTimeEnd', 'growthTime'];
      timeInputs.forEach(id => { const el = document.getElementById(id); if (el) el.value = currentTime; });
      
      const dateInputs = ['sleepDate', 'sleepDateEnd', 'growthDate'];
      dateInputs.forEach(id => { const el = document.getElementById(id); if (el) el.value = today; });
    } else {
      currentUser = null;
      state = { profile: null, theme: 'rosa', dark: false, breast: [], mix: [], pump: [], diaper: [], sleep: [], growth: [] };
      const appContainer = document.getElementById('appContainer');
      const authContainer = document.getElementById('authContainer');
      if (appContainer) appContainer.style.display = 'none';
      if (authContainer) authContainer.style.display = 'block';
    }
    
    if (loadingScreen) loadingScreen.style.display = 'none';
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
      state.theme = sw.dataset.theme;
      applyTheme();
      await saveTheme();
    });
  });

  // Dark mode
  const toggleDark = async () => {
    state.dark = !state.dark;
    applyTheme();
    await saveTheme();
  };
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
    
    state.profile = { name, sex, birth };
    showSync(true);
    try {
      await db.collection('users').doc(currentUser.uid).collection('profile').doc('baby').set(state.profile);
      showSync(false);
      updateUI();
    } catch (e) {
      showError('Error al guardar perfil: ' + e.message);
      showSync(false);
    }
  });

  // ============================================
  // Pecho: Solo hora
  // ============================================
  document.getElementById('saveBreast')?.addEventListener('click', async () => {
    const ts = getTodayWithTime('breastTime');
    const record = { id: genId(), ts };
    state.breast.unshift(record);
    await saveRecord('breast', record);
    renderRecentFeeding();
    renderTimelineIn('homeTimeline');
    // Reset time to now
    document.getElementById('breastTime').value = new Date().toTimeString().slice(0, 5);
  });

  // ============================================
  // Mix feeding: Cantidades + hora
  // ============================================
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

  // ============================================
  // Extracción: Cantidad + hora
  // ============================================
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

  // ============================================
  // Pañal: Solo hora (fecha por defecto hoy)
  // ============================================
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

  // ============================================
  // Sueño: Solo manual (sin timer)
  // ============================================
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
    
    // Reset
    const now = new Date();
    document.getElementById('sleepDate').value = now.toISOString().slice(0, 10);
    document.getElementById('sleepDateEnd').value = now.toISOString().slice(0, 10);
    document.getElementById('sleepTimeStart').value = now.toTimeString().slice(0, 5);
    document.getElementById('sleepTimeEnd').value = now.toTimeString().slice(0, 5);
    
    renderRecentSleep();
    renderTimelineIn('homeTimeline');
  });

  // ============================================
  // Crecimiento
  // ============================================
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

  // ============================================
  // Historial: Búsqueda por fecha
  // ============================================
  document.getElementById('searchHistory')?.addEventListener('click', () => {
    const searchDate = document.getElementById('historyDate').value;
    if (!searchDate) {
      alert('Selecciona una fecha');
      return;
    }
    
    const dateStart = new Date(searchDate + 'T00:00:00');
    const dateEnd = new Date(searchDate + 'T23:59:59');
    
    const isSameDay = (ts) => {
      const d = new Date(ts);
      return d >= dateStart && d <= dateEnd;
    };
    
    const results = [];
    
    state.breast.filter(r => isSameDay(r.ts)).forEach(r => results.push({ ...r, type: 'breast' }));
    state.mix.filter(r => isSameDay(r.ts)).forEach(r => results.push({ ...r, type: 'mix' }));
    state.pump.filter(r => isSameDay(r.ts)).forEach(r => results.push({ ...r, type: 'pump' }));
    state.diaper.filter(r => isSameDay(r.ts)).forEach(r => results.push({ ...r, type: 'diaper' }));
    state.sleep.filter(r => isSameDay(r.ts || r.start)).forEach(r => results.push({ ...r, type: 'sleep' }));
    state.growth.filter(r => isSameDay(r.ts)).forEach(r => results.push({ ...r, type: 'growth' }));
    
    results.sort((a, b) => new Date(b.ts || b.start) - new Date(a.ts || a.start));
    
    const card = document.getElementById('historyResultsCard');
    const title = document.getElementById('historyDateTitle');
    const container = document.getElementById('historyResults');
    
    const formattedDate = new Date(searchDate).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    title.textContent = `Registros del ${formattedDate}`;
    
    if (results.length === 0) {
      container.innerHTML = '<p class="muted text-center">No hay registros para esta fecha</p>';
    } else {
      let html = '';
      results.forEach(r => {
        if (r.type === 'breast') {
          html += `<div class="record-item"><span>🍼 ${formatTime(r.ts)} — Pecho</span></div>`;
        } else if (r.type === 'mix') {
          html += `<div class="record-item"><span>🥛 ${formatTime(r.ts)} — Mixta: ${r.lm}oz + ${r.lf}oz</span></div>`;
        } else if (r.type === 'pump') {
          html += `<div class="record-item"><span>💧 ${formatTime(r.ts)} — Extracción: ${r.l}oz + ${r.r}oz</span></div>`;
        } else if (r.type === 'diaper') {
          const icon = r.type === 'pipi' ? '💧' : r.type === 'caca' ? '💩' : '💧💩';
          html += `<div class="record-item"><span>${icon} ${formatTime(r.ts)} — Pañal ${r.type}</span></div>`;
        } else if (r.type === 'sleep') {
          const hours = Math.floor(r.min / 60);
          const mins = r.min % 60;
          const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
          html += `<div class="record-item"><span>😴 ${formatTime(r.ts)} — Sueño: ${duration}</span></div>`;
        } else if (r.type === 'growth') {
          html += `<div class="record-item"><span>📏 ${formatTime(r.ts)} — ${r.w}kg, ${r.h}cm</span></div>`;
        }
      });
      container.innerHTML = html;
    }
    
    card.style.display = 'block';
  });

  // ============================================
  // Borrar datos
  // ============================================
  document.getElementById('clearData')?.addEventListener('click', async () => {
    if (!confirm('¿Estás seguro? Se borrarán TODOS tus datos. Esta acción no se puede deshacer.')) return;
    if (!confirm('¿REALMENTE quieres borrar todo?')) return;
    
    try {
      showSync(true);
      const collections = ['breast', 'mix', 'pump', 'diaper', 'sleep', 'growth', 'profile'];
      
      for (const col of collections) {
        const snapshot = await db.collection('users').doc(currentUser.uid).collection(col).get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      
      state = { profile: null, theme: state.theme, dark: state.dark, breast: [], mix: [], pump: [], diaper: [], sleep: [], growth: [] };
      showSync(false);
      updateUI();
      alert('Datos eliminados correctamente');
    } catch (e) {
      showError('Error al borrar datos: ' + e.message);
      showSync(false);
    }
  });
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed:', err));
  });
}
