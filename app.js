// ===== DATA STORE =====
const DEFAULT_SUBJECTS = [
  { id: 's1', name: 'RCC', color: 'blue' },
  { id: 's2', name: 'Irrigation & Drainage', color: 'mint' },
  { id: 's3', name: 'Estimation & Costing', color: 'lavender' },
  { id: 's4', name: 'Professional & Social', color: 'rose' },
  { id: 's5', name: 'Transportation II', color: 'peach' },
];

const MEMBERS = [
  { id: 'suyogi', name: 'Suyogi', emoji: 'S' },
  { id: 'rohi',   name: 'Rohi',   emoji: 'R' },
  { id: 'puntima',name: 'Puntima',emoji: 'P' },
  { id: 'nis',    name: 'Nis',    emoji: 'N' },
  { id: 'susmi',  name: 'Susmi',  emoji: 'Su' },
  { id: 'sne',    name: 'Sne',    emoji: 'Sn' },
];

const PLANTS = ['🌸','🌼','🌻','🌹','🌷','🍀','🌿','🌺','🪷','🌾','🪻','💐'];

// Max size per attached file (Firestore docs cap at ~1MB; keep margin for other fields)
const MAX_FILE_BYTES = 700 * 1024; // ~700KB base64

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ===== FIREBASE / SYNC SETUP =====
let db = null;
let syncEnabled = false;
let suppressNextSnapshot = false; // avoid feedback loop when we write our own change

function initFirebase() {
  const statusEl = document.getElementById('syncStatus');
  try {
    if (typeof firebaseConfig === 'undefined' || firebaseConfig.apiKey === 'YOUR_API_KEY') {
      statusEl.textContent = '📴 Offline (no sync set up)';
      statusEl.classList.add('offline');
      return;
    }
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    syncEnabled = true;
    statusEl.textContent = '🔄 Connecting...';

    const docRef = db.collection('rooms').doc(SYNC_ROOM_ID);

    docRef.onSnapshot(snap => {
      if (suppressNextSnapshot) { suppressNextSnapshot = false; return; }
      if (snap.exists) {
        const data = snap.data();
        if (data.subjects)    subjects    = data.subjects;
        if (data.assignments) assignments = data.assignments;
        if (data.gardens)     gardens     = data.gardens;
        renderTabs();
        renderAssignments();
      } else {
        // First time: push our local data up as the seed
        pushToCloud();
      }
      statusEl.textContent = '🟢 Synced with friends';
      statusEl.classList.remove('offline');
      statusEl.classList.add('online');
    }, err => {
      console.error('Firestore error:', err);
      statusEl.textContent = '⚠️ Sync error (saved locally)';
      statusEl.classList.add('offline');
    });
  } catch (e) {
    console.error('Firebase init failed:', e);
    statusEl.textContent = '📴 Offline (sync not configured)';
    statusEl.classList.add('offline');
  }
}

function pushToCloud() {
  if (!syncEnabled || !db) return;
  suppressNextSnapshot = true;

  // Strip too-large file data before sending to Firestore (keep locally only)
  const cloudAssignments = assignments.map(a => ({
    ...a,
    files: (a.files || []).filter(f => !f.tooLarge)
  }));

  db.collection('rooms').doc(SYNC_ROOM_ID).set({
    subjects, assignments: cloudAssignments, gardens,
    updatedAt: Date.now(),
  }).catch(err => {
    console.error('Failed to push to cloud:', err);
    const statusEl = document.getElementById('syncStatus');
    statusEl.textContent = '⚠️ Sync failed (saved locally)';
    statusEl.classList.add('offline');
  });
}

let subjects     = load('sg_subjects',     DEFAULT_SUBJECTS);
let assignments  = load('sg_assignments',  []);
let gardens      = load('sg_gardens',      {});  // { memberId: [plantEmoji, ...] }
let editingId    = null;
let currentTab   = 'all';
let deadlineMode = 'date'; // 'date' | 'next'
let pendingFiles = []; // { name, dataUrl, type }

// Init gardens for all members
MEMBERS.forEach(m => { if (!gardens[m.id]) gardens[m.id] = []; });
saveAll();

function saveAll() {
  save('sg_subjects',    subjects);
  save('sg_assignments', assignments);
  save('sg_gardens',     gardens);
  pushToCloud();
}

// ===== HELPERS =====
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function formatDeadline(a) {
  if (a.deadlineType === 'next') return { label: '📖 Next Class', cls: 'next-class' };
  if (!a.deadline) return { label: '—', cls: '' };
  const now   = new Date(); now.setHours(0,0,0,0);
  const dl    = new Date(a.deadline + 'T00:00:00');
  const diff  = Math.round((dl - now) / 86400000);
  if (diff < 0)  return { label: `Overdue ${Math.abs(diff)}d`,  cls: 'overdue' };
  if (diff === 0) return { label: '🚨 Due Today!',              cls: 'due-today' };
  if (diff === 1) return { label: '⚠️ Due Tomorrow',            cls: 'due-soon' };
  if (diff === 2) return { label: `⚡ In 2 days`,               cls: 'due-soon' };
  return { label: `📅 ${dl.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`, cls: '' };
}

function isUrgent(a) {
  if (a.deadlineType === 'next') return false;
  if (!a.deadline) return false;
  const now  = new Date(); now.setHours(0,0,0,0);
  const dl   = new Date(a.deadline + 'T00:00:00');
  const diff = Math.round((dl - now) / 86400000);
  return diff <= 1;
}

function getSubjectColor(subjectId) {
  const s = subjects.find(x => x.id === subjectId);
  return s ? s.color : 'blue';
}

function getSubjectName(subjectId) {
  const s = subjects.find(x => x.id === subjectId);
  return s ? s.name : 'Unknown';
}

function memberInitials(m) {
  return m.emoji;
}

function randomPlant() {
  return PLANTS[Math.floor(Math.random() * PLANTS.length)];
}

// ===== RENDER =====
function renderTabs() {
  const tabsScroll = document.getElementById('subjectTabs');
  tabsScroll.innerHTML = subjects.map(s =>
    `<button class="tab-btn${currentTab===s.id?' active':''}" data-tab="${s.id}">${s.name}</button>`
  ).join('');
}

function renderAssignments() {
  const grid   = document.getElementById('assignmentsGrid');
  const empty  = document.getElementById('emptyState');
  const uCount = document.getElementById('urgentCount');

  let filtered = currentTab === 'all'
    ? assignments
    : assignments.filter(a => a.subjectId === currentTab);

  // Sort: urgent first, then by deadline
  filtered = [...filtered].sort((a, b) => {
    const ua = isUrgent(a), ub = isUrgent(b);
    if (ua !== ub) return ua ? -1 : 1;
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  const urgentCount = assignments.filter(isUrgent).length;
  if (urgentCount > 0) {
    uCount.style.display = 'inline-block';
    uCount.textContent   = `🚨 ${urgentCount} urgent`;
  } else {
    uCount.style.display = 'none';
  }

  if (!filtered.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = filtered.map(a => renderCard(a)).join('');

  // Attach chip click listeners
  grid.querySelectorAll('.member-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMember(chip.dataset.assignmentId, chip.dataset.memberId);
    });
  });
  grid.querySelectorAll('.card-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteAssignment(btn.dataset.id);
    });
  });
  grid.querySelectorAll('.card-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(btn.dataset.id);
    });
  });
}

function renderCard(a) {
  const { label, cls } = formatDeadline(a);
  const color  = getSubjectColor(a.subjectId);
  const sName  = getSubjectName(a.subjectId);
  const urgent = isUrgent(a);
  const doneCount = a.checklist ? Object.values(a.checklist).filter(Boolean).length : 0;
  const progress  = Math.round((doneCount / MEMBERS.length) * 100);

  const chips = MEMBERS.map(m => {
    const done = a.checklist && a.checklist[m.id];
    return `<div class="member-chip${done?' done':''}" data-assignment-id="${a.id}" data-member-id="${m.id}" title="${m.name}">
      <div class="chip-avatar avatar-${m.id}">${m.emoji}</div>
      <span>${m.name}</span>
      ${done ? '<span class="chip-check">✓</span>' : ''}
    </div>`;
  }).join('');

  const filesHtml = a.files && a.files.length
    ? `<div class="card-files">${a.files.map(f=>`<span class="file-chip">${fileIcon(f.type)} ${truncate(f.name,18)}</span>`).join('')}</div>`
    : '';

  const urgentBadge = urgent ? `<div class="card-notif">URGENT</div>` : '';

  return `<div class="assignment-card${urgent?' urgent':''}" data-color="${color}" data-id="${a.id}">
    ${urgentBadge}
    <div class="card-header">
      <div class="card-subject">${sName}</div>
      <div class="card-deadline-tag ${cls}">${label}</div>
    </div>
    <div class="card-title">${escHtml(a.description || 'No description')}</div>
    <div class="card-teacher">By <span>${escHtml(a.teacher || 'Unknown')}</span></div>
    <div class="progress-bar-wrap"><div class="progress-bar" style="width:${progress}%"></div></div>
    ${filesHtml}
    <div class="card-checklist">${chips}</div>
    <div class="card-actions">
      <button class="card-action-btn card-edit-btn" data-id="${a.id}">✏️ Edit</button>
      <button class="card-action-btn delete card-delete-btn" data-id="${a.id}">🗑 Delete</button>
    </div>
  </div>`;
}

function fileIcon(type) {
  if (!type) return '📎';
  if (type.startsWith('image')) return '🖼';
  if (type.includes('pdf')) return '📄';
  if (type.includes('ppt') || type.includes('presentation')) return '📊';
  return '📎';
}

function truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ===== TOGGLE MEMBER =====
function toggleMember(assignmentId, memberId) {
  const a = assignments.find(x => x.id === assignmentId);
  if (!a) return;
  if (!a.checklist) a.checklist = {};
  const wasDone = a.checklist[memberId];
  a.checklist[memberId] = !wasDone;

  if (!wasDone) {
    // They completed it! Give them a plant 🌱
    if (!gardens[memberId]) gardens[memberId] = [];
    const plant = randomPlant();
    gardens[memberId].push(plant);
    saveAll();
    renderAssignments();
    showToast(`🌱 ${MEMBERS.find(m=>m.id===memberId).name} earned a plant! ${plant}`, 'success');
    launchConfetti();
    renderTabs(); // in case urgent count changed
  } else {
    // Un-completing removes a plant
    if (gardens[memberId] && gardens[memberId].length > 0) {
      gardens[memberId].pop();
    }
    saveAll();
    renderAssignments();
    showToast(`${MEMBERS.find(m=>m.id===memberId).name} unchecked.`, 'info');
  }
}

// ===== DELETE =====
function deleteAssignment(id) {
  if (!confirm('Delete this assignment?')) return;
  assignments = assignments.filter(a => a.id !== id);
  saveAll();
  renderAssignments();
  renderTabs();
  showToast('🗑 Assignment deleted.', 'info');
}

// ===== MODAL: OPEN =====
function populateSubjectSelect(selectedId) {
  const sel = document.getElementById('subjectSelect');
  sel.innerHTML = subjects.map(s =>
    `<option value="${s.id}"${s.id===selectedId?' selected':''}>${s.name}</option>`
  ).join('');
}

function populateModalChecklist(checklist) {
  const cont = document.getElementById('modalChecklist');
  cont.innerHTML = MEMBERS.map(m => {
    const checked = checklist && checklist[m.id];
    return `<label class="checklist-item${checked?' checked':''}" data-member="${m.id}">
      <input type="checkbox" ${checked?'checked':''} />
      <div class="checkmark${checked?' ✓':''}">${checked?'✓':''}</div>
      <div class="chip-avatar avatar-${m.id}" style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:0.7rem;font-weight:800">${m.emoji}</div>
      <span class="member-name">${m.name}</span>
    </label>`;
  }).join('');

  cont.querySelectorAll('.checklist-item').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('checked');
      const chk = item.querySelector('input');
      chk.checked = !chk.checked;
      const mark = item.querySelector('.checkmark');
      mark.textContent = chk.checked ? '✓' : '';
    });
  });
}

function openAddModal() {
  editingId    = null;
  pendingFiles = [];
  document.getElementById('modalTitle').textContent = 'New Assignment 🌱';
  document.getElementById('subjectSelect').value = '';
  populateSubjectSelect('');
  document.getElementById('teacherInput').value   = '';
  document.getElementById('descInput').value      = '';
  document.getElementById('deadlineDateInput').value = '';
  document.getElementById('fileList').innerHTML   = '';
  setDeadlineMode('date');
  populateModalChecklist({});
  document.getElementById('assignmentModal').style.display = 'flex';
}

function openEditModal(id) {
  const a = assignments.find(x => x.id === id);
  if (!a) return;
  editingId    = id;
  pendingFiles = a.files ? [...a.files] : [];

  document.getElementById('modalTitle').textContent = 'Edit Assignment ✏️';
  populateSubjectSelect(a.subjectId);
  document.getElementById('teacherInput').value = a.teacher || '';
  document.getElementById('descInput').value    = a.description || '';
  setDeadlineMode(a.deadlineType || 'date');
  if (a.deadlineType !== 'next') document.getElementById('deadlineDateInput').value = a.deadline || '';
  renderFileList();
  populateModalChecklist(a.checklist || {});
  document.getElementById('assignmentModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('assignmentModal').style.display = 'none';
  editingId    = null;
  pendingFiles = [];
}

// ===== DEADLINE MODE =====
function setDeadlineMode(mode) {
  deadlineMode = mode;
  const dateBtn  = document.getElementById('deadlineDateBtn');
  const nextBtn  = document.getElementById('deadlineNextBtn');
  const dateInp  = document.getElementById('deadlineDateInput');
  dateBtn.classList.toggle('active', mode === 'date');
  nextBtn.classList.toggle('active', mode === 'next');
  dateInp.style.display = mode === 'date' ? 'block' : 'none';
}

// ===== FILES =====
function handleFiles(fileList) {
  Array.from(fileList).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      // Rough check: base64 length vs cap (sync data limit)
      if (dataUrl.length > MAX_FILE_BYTES) {
        showToast(`⚠️ "${truncate(file.name,20)}" is too large to sync (max ~500KB). It won't sync to friends, only saved on this device.`, 'warning');
      }
      pendingFiles.push({ name: file.name, dataUrl, type: file.type, tooLarge: dataUrl.length > MAX_FILE_BYTES });
      renderFileList();
    };
    reader.readAsDataURL(file);
  });
}

function renderFileList() {
  const cont = document.getElementById('fileList');
  cont.innerHTML = pendingFiles.map((f, i) =>
    `<div class="file-item">${fileIcon(f.type)} ${truncate(f.name, 20)}
      <button onclick="removeFile(${i})">✕</button>
    </div>`
  ).join('');
}

window.removeFile = function(i) {
  pendingFiles.splice(i, 1);
  renderFileList();
};

// ===== SAVE ASSIGNMENT =====
function saveAssignment() {
  const subjectId = document.getElementById('subjectSelect').value;
  const teacher   = document.getElementById('teacherInput').value.trim();
  const desc      = document.getElementById('descInput').value.trim();
  const deadline  = deadlineMode === 'date' ? document.getElementById('deadlineDateInput').value : null;

  if (!subjectId) { showToast('Please select a subject!', 'warning'); return; }
  if (!desc) { showToast('Please add a description!', 'warning'); return; }

  // Collect checklist
  const checklist = {};
  document.querySelectorAll('#modalChecklist .checklist-item').forEach(item => {
    const memberId = item.dataset.member;
    const checked  = item.classList.contains('checked');
    checklist[memberId] = checked;
  });

  const data = {
    id: editingId || uid(),
    subjectId, teacher, description: desc,
    deadlineType: deadlineMode,
    deadline: deadlineMode === 'next' ? null : deadline,
    checklist,
    files: [...pendingFiles],
    createdAt: editingId ? (assignments.find(a=>a.id===editingId)?.createdAt || Date.now()) : Date.now(),
  };

  if (editingId) {
    const idx = assignments.findIndex(a => a.id === editingId);
    assignments[idx] = data;
    showToast('✅ Assignment updated!', 'success');
  } else {
    assignments.unshift(data);
    showToast('🌱 Assignment added!', 'success');
  }

  saveAll();
  closeModal();
  renderAssignments();
  renderTabs();
}

// ===== GARDEN MODAL =====
function openGardenModal() {
  const grid = document.getElementById('gardensGrid');
  grid.innerHTML = MEMBERS.map(m => {
    const plants = gardens[m.id] || [];
    const plotHtml = plants.length
      ? plants.map((p,i) => `<span class="garden-plant" style="animation-delay:${i*0.05}s" title="${p}">${p}</span>`).join('')
      : '<span style="color:rgba(100,140,100,0.4);font-size:0.8rem;align-self:center">empty...</span>';
    return `<div class="garden-card">
      <div class="chip-avatar avatar-${m.id}" style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:0.9rem;font-weight:800;margin:0 auto 6px">${m.emoji}</div>
      <div class="garden-name">${m.name}</div>
      <div class="garden-count">${plants.length} 🌸 plant${plants.length!==1?'s':''}</div>
      <div class="garden-plot">${plotHtml}</div>
    </div>`;
  }).join('');
  document.getElementById('gardenModal').style.display = 'flex';
}

// ===== SUBJECTS SETTINGS =====
function renderSubjectsList() {
  const cont = document.getElementById('subjectsList');
  const COLORS = ['blue','lavender','mint','rose','peach'];
  cont.innerHTML = subjects.map((s,i) =>
    `<div class="subject-item">
      <span>${s.name}</span>
      <button class="subject-delete" onclick="deleteSubject('${s.id}')">✕</button>
    </div>`
  ).join('');
}

window.deleteSubject = function(id) {
  if (subjects.length <= 1) { showToast('Need at least one subject!', 'warning'); return; }
  subjects = subjects.filter(s => s.id !== id);
  assignments = assignments.filter(a => a.subjectId !== id);
  saveAll();
  renderSubjectsList();
  renderTabs();
  renderAssignments();
};

function addSubject() {
  const inp = document.getElementById('newSubjectInput');
  const name = inp.value.trim();
  if (!name) return;
  const COLORS = ['blue','lavender','mint','rose','peach'];
  const color = COLORS[subjects.length % COLORS.length];
  subjects.push({ id: uid(), name, color });
  saveAll();
  inp.value = '';
  renderSubjectsList();
  renderTabs();
  showToast(`📚 Subject "${name}" added!`, 'success');
}

// ===== TOAST =====
function showToast(msg, type = 'info') {
  const cont = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  cont.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ===== CONFETTI =====
function launchConfetti() {
  const canvas  = document.getElementById('confettiCanvas');
  const ctx     = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const pieces  = [];
  const COLORS  = ['#a8c5e8','#c4b5e8','#a8e8d0','#f0b8c8','#f5d0b0','#f0e88a'];
  for (let i = 0; i < 80; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: -10,
      r: Math.random() * 6 + 3,
      d: Math.random() * 80 + 20,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngle: 0,
      tiltAngleInc: Math.random() * 0.07 + 0.05,
      vy: Math.random() * 3 + 2,
    });
  }
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.5, p.tiltAngle, 0, Math.PI * 2);
      ctx.fill();
    });
    pieces.forEach(p => {
      p.tiltAngle += p.tiltAngleInc;
      p.y += p.vy;
      p.x += Math.sin(p.tiltAngle) * 2;
    });
    frame++;
    if (frame < 120) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

// ===== DEADLINE WARNINGS =====
function checkDeadlineWarnings() {
  const now = new Date(); now.setHours(0,0,0,0);
  assignments.forEach(a => {
    if (a.deadlineType === 'next' || !a.deadline) return;
    const dl   = new Date(a.deadline + 'T00:00:00');
    const diff = Math.round((dl - now) / 86400000);
    if (diff === 1) {
      showToast(`⚠️ "${truncate(a.description,30)}" is due TOMORROW!`, 'warning');
    } else if (diff === 2) {
      showToast(`📅 "${truncate(a.description,30)}" is due in 2 days.`, 'warning');
    }
  });
}

// ===== WHO AM I (per-device identity, for nicer toasts) =====
let myId = load('sg_myid', null);

function initWhoAmI() {
  if (myId) return;
  const grid = document.getElementById('whoAmIGrid');
  grid.innerHTML = MEMBERS.map(m =>
    `<label class="checklist-item" data-member="${m.id}">
      <div class="chip-avatar avatar-${m.id}" style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:0.7rem;font-weight:800">${m.emoji}</div>
      <span class="member-name">${m.name}</span>
    </label>`
  ).join('');
  grid.querySelectorAll('.checklist-item').forEach(item => {
    item.addEventListener('click', () => {
      myId = item.dataset.member;
      save('sg_myid', myId);
      document.getElementById('whoAmIModal').style.display = 'none';
      showToast(`Welcome, ${MEMBERS.find(m=>m.id===myId).name}! 🌱`, 'success');
    });
  });
  document.getElementById('whoAmIModal').style.display = 'flex';
}

function renderWhoAmISettings() {
  const grid = document.getElementById('whoAmISettingsGrid');
  grid.innerHTML = MEMBERS.map(m =>
    `<label class="checklist-item${myId===m.id?' checked':''}" data-member="${m.id}">
      <div class="checkmark">${myId===m.id?'✓':''}</div>
      <div class="chip-avatar avatar-${m.id}" style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:0.7rem;font-weight:800">${m.emoji}</div>
      <span class="member-name">${m.name}</span>
    </label>`
  ).join('');
  grid.querySelectorAll('.checklist-item').forEach(item => {
    item.addEventListener('click', () => {
      myId = item.dataset.member;
      save('sg_myid', myId);
      renderWhoAmISettings();
      showToast(`You're now set as ${MEMBERS.find(m=>m.id===myId).name} 🌱`, 'info');
    });
  });
}

// ===== EVENT BINDINGS =====
document.addEventListener('DOMContentLoaded', () => {
  renderTabs();
  renderAssignments();
  initFirebase();
  initWhoAmI();

  // Tab clicks
  document.getElementById('subjectTabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    currentTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAssignments();
  });
  document.querySelector('.tab-btn[data-tab="all"]').addEventListener('click', () => {
    currentTab = 'all';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="all"]').classList.add('active');
    renderAssignments();
  });

  // Header buttons
  document.getElementById('addAssignmentBtn').addEventListener('click', openAddModal);
  document.getElementById('gardenBtn').addEventListener('click', openGardenModal);
  document.getElementById('settingsBtn').addEventListener('click', () => {
    renderSubjectsList();
    renderWhoAmISettings();
    document.getElementById('settingsModal').style.display = 'flex';
  });

  // Modal close buttons
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('closeGarden').addEventListener('click', () => { document.getElementById('gardenModal').style.display = 'none'; });
  document.getElementById('closeSettings').addEventListener('click', () => { document.getElementById('settingsModal').style.display = 'none'; });

  // Overlay click to close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });

  // Deadline options
  document.getElementById('deadlineDateBtn').addEventListener('click', () => setDeadlineMode('date'));
  document.getElementById('deadlineNextBtn').addEventListener('click', () => setDeadlineMode('next'));

  // File input
  const dropZone = document.getElementById('fileDropZone');
  const fileInput = document.getElementById('fileInput');
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFiles(fileInput.files));
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });

  // Save assignment
  document.getElementById('saveAssignment').addEventListener('click', saveAssignment);

  // Add subject
  document.getElementById('addSubjectBtn').addEventListener('click', addSubject);
  document.getElementById('newSubjectInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSubject();
  });

  // Check warnings on load (after small delay)
  setTimeout(checkDeadlineWarnings, 1500);
});

// ===== SERVICE WORKER REGISTRATION =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('SW registered:', reg.scope);
    }).catch(err => console.log('SW error:', err));
  });
}
