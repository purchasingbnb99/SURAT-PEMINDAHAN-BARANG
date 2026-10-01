import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
  deleteDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const APP_VERSION = '1.0.38';
const COMPANY_NAME = 'PT. BEST & BEST INDONESIA';
const RETUR_CATEGORIES = ['Retur Jasa','Retur Benang','Retur Longchain','Retur Kain Pita','Retur Slider'];
const DEFAULT_UNITS = ['Pcs','Kg','Rol','MTR'];
const UNITS = DEFAULT_UNITS;
const FIREBASE_READY = isFirebaseConfigReady(firebaseConfig);

let app = null;
let auth = null;
let db = null;
if (FIREBASE_READY) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

const state = {
  user: null,
  role: null,
  profile: null,
  currentView: 'dashboard',
  destinations: [],
  yearCodes: [],
  masterBarang: [],
  masterSatuan: [],
  spbs: [],
  searchRows: [],
  reportRows: [],
  editingId: null,
  currentDetailId: null,
  staffName: localStorage.getItem('spb_staff_name') || '',
  staffSessionId: null,
  staffLoginStarted: false,
  heartbeatTimer: null,
  formItems: [],
  reportFilters: { start: firstDayOfMonth(), end: todayISO(), type: 'all', prefix: 'all', category: 'all', code: '' },
  searchTerm: '',
  searchLoaded: false,
  pageTitle: 'Dashboard',
  pendingImport: null,
  formPoMode: 'single',
  formSharedPo: ''
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const safeNum = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const normalized = (v) => String(v ?? '').trim().toLowerCase();
function destinationLines(dest={}) {
  let line1 = String(dest.line1 ?? '').trim();
  let line2 = String(dest.line2 ?? '').trim();
  if(!line1 && dest.name){
    const parts=String(dest.name).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    line1=parts.shift() || '';
    line2=line2 || parts.join(' ');
  }
  return { line1, line2 };
}
function destinationLabel(dest={}) {
  const {line1,line2} = destinationLines(dest);
  return [line1,line2].filter(Boolean).join(' — ') || '-';
}
function spbToLineValues(item={}) {
  let line1 = String(item.toPartyLine1 ?? '').trim();
  let line2 = String(item.toPartyLine2 ?? '').trim();
  if(!line1 && item.toParty){
    const parts=String(item.toParty).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    line1=parts.shift() || ''; line2=parts.join(' ');
  }
  return {line1,line2};
}
const fmtNum = (v) => Number.isFinite(Number(v)) ? new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(v)) : '-';
function isFirebaseConfigReady(cfg) {
  if (!cfg) return false;
  const required = ['apiKey','authDomain','projectId','messagingSenderId','appId'];
  return required.every(key => cfg[key] && !String(cfg[key]).startsWith('GANTI_'));
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
function formatDate(value) {
  if (!value) return '-';
  const s = String(value).slice(0,10).split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : String(value);
}
function formatDateTime(value) {
  if (!value) return '-';
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'});
}
function formatPrintTimestamp(value=new Date()) {
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d);
  const get = key => parts.find(p => p.type === key)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}.${get('minute')}.${get('second')} WIB`;
}
function showToast(message,type='success') {
  const root = $('toastRoot');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function setBusy(button,busy,text='Memproses...') {
  if (!button) return;
  button.disabled = busy;
  if (busy) { button.dataset.oldText = button.textContent; button.textContent = text; }
  else if (button.dataset.oldText) { button.textContent = button.dataset.oldText; delete button.dataset.oldText; }
}
function roleBadge(role) {
  return `<span class="pill ${role==='admin'?'status-active':'type-pill'}">${role==='admin'?'ADMIN':'STAFF'}</span>`;
}
function statusBadge(status='active') {
  return `<span class="pill ${status==='cancelled'?'status-cancelled':'status-active'}">${status==='cancelled'?'Dibatalkan':'Aktif'}</span>`;
}
function typeBadge(type) {
  return `<span class="pill type-pill">${escapeHtml(type)}</span>`;
}
function categoryBadge(cat) {
  return cat ? `<span class="pill retur-pill">${escapeHtml(cat)}</span>` : '';
}
function closeDrawer() { $('sidebar')?.classList.remove('open'); }
function openDrawer() { $('sidebar')?.classList.add('open'); }
function closeModal() { $('modalRoot').innerHTML=''; $('modalRoot').classList.add('hidden'); }
function openModal(html) { $('modalRoot').innerHTML = `<div class="modal-backdrop" data-modal-backdrop><div class="modal">${html}</div></div>`; $('modalRoot').classList.remove('hidden'); $('modalRoot').querySelector('[data-modal-backdrop]')?.addEventListener('click',e=>{if(e.target.dataset.modalBackdrop!==undefined)closeModal();}); }
function chunkText(value,max) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0,max-1)}…`;
}

const navIcons = { dashboard:'⌂', spb:'▣', search:'⌕', report:'▤', destination:'◎', year:'Y', masterbarang:'▦', satuan:'◌', signature:'✎', staff:'◉' };
function navButton(key,label,adminOnly=true) {
  return `<button type="button" class="nav-link" data-nav="${key}" ${adminOnly?'data-admin="1"':''}><span style="width:20px;text-align:center">${navIcons[key]||'•'}</span><span>${label}</span></button>`;
}
function renderNavigation() {
  $('adminNav').innerHTML = [
    navButton('dashboard','Dashboard'),
    navButton('spb','Input SPB'),
    navButton('search','Cari SPB'),
    navButton('report','Laporan'),
    navButton('destination','Master Tujuan'),
    navButton('year','Kode Tahun'),
    navButton('masterbarang','Master Barang'),
    navButton('satuan','Master Satuan'),
    navButton('signature','Tanda Tangan'),
    navButton('staff','Staff Aktif')
  ].join('');
  $('staffNav').innerHTML = [navButton('dashboard','Dashboard',false),navButton('search','Cari SPB',false)].join('');
  document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.nav)));
}
function setNavActive(key) { document.querySelectorAll('[data-nav]').forEach(btn=>btn.classList.toggle('active',btn.dataset.nav===key)); }
function navigate(key) {
  const allowedAdmin = ['dashboard','spb','search','report','destination','year','masterbarang','satuan','signature','staff'];
  const allowedStaff = ['dashboard','search'];
  if (state.role==='admin' && !allowedAdmin.includes(key)) key='dashboard';
  if (state.role==='staff' && !allowedStaff.includes(key)) key='dashboard';
  state.currentView = key;
  const ids = ['dashboard','spb','search','reports','destinations','yearcodes','masterbarang','satuan','signature','staff'];
  ids.forEach(id=>$(`view-${id}`)?.classList.add('hidden'));
  const targetId = key==='report'?'reports':key==='destination'?'destinations':key==='year'?'yearcodes':key;
  $(`view-${targetId}`)?.classList.remove('hidden');
  const titles = {dashboard:'Dashboard',spb:state.editingId?'Edit SPB':'Input Surat Pemindahan Barang',search:'Cari SPB',report:'Laporan SPB',destination:'Master Tujuan',year:'Master Kode Tahun',masterbarang:'Master Barang',satuan:'Master Satuan',signature:'Tanda Tangan Admin',staff:'Staff Aktif'};
  $('pageTitle').textContent = titles[key] || 'Dashboard';
  $('pageSubtitle').textContent = state.role==='admin'?'Administrasi Surat Pemindahan Barang':'Akses Staff — lihat, cari dan print';
  setNavActive(key); closeDrawer();
  if (key==='dashboard') renderDashboard();
  if (key==='spb') renderSpbForm(state.editingId);
  if (key==='search') renderSearchView();
  if (key==='report') renderReportsView();
  if (key==='destination') renderDestinationsView();
  if (key==='year') renderYearCodesView();
  if (key==='masterbarang') renderMasterBarangView();
  if (key==='satuan') renderMasterSatuanView();
  if (key==='signature') renderSignatureView();
  if (key==='staff') renderStaffView();
}

async function loadProfile(user) {
  if (!db || !user) return null;
  const snap = await getDoc(doc(db,'users',user.uid));
  return snap.exists() ? {id:snap.id,...snap.data()} : null;
}
async function handleAuth(user) {
  clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; state.staffLoginStarted=false;
  state.user=user;
  if (!user) {
    state.role=null; state.profile=null; state.editingId=null; state.currentDetailId=null;
    $('loginRoot').classList.remove('hidden'); $('appRoot').classList.add('hidden');
    return;
  }
  if (user.isAnonymous) {
    state.role='staff'; state.profile={name:state.staffName||'Staff',role:'staff'}; state.staffSessionId=user.uid;
    $('sessionName').textContent=state.staffName||'Staff'; $('sessionRole').innerHTML=roleBadge('staff');
    $('adminNav').classList.add('hidden'); $('staffNav').classList.remove('hidden');
    $('loginRoot').classList.add('hidden'); $('appRoot').classList.remove('hidden');
    await upsertStaffSession(true); state.staffLoginStarted=true; startHeartbeat(); navigate('dashboard');
    return;
  }
  const profile = await loadProfile(user);
  if (!profile || profile.role!=='admin') {
    showToast('Akun ini belum terdaftar sebagai Admin.','error');
    await signOut(auth);
    return;
  }
  state.role='admin'; state.profile=profile;
  $('sessionName').textContent=profile.name || user.email || 'Admin'; $('sessionRole').innerHTML=roleBadge('admin');
  $('adminNav').classList.remove('hidden'); $('staffNav').classList.add('hidden'); $('loginRoot').classList.add('hidden'); $('appRoot').classList.remove('hidden');
  await preloadReferenceData();
  navigate('dashboard');
}
async function upsertStaffSession(isLogin=false) {
  if (!db || !state.user?.isAnonymous) return;
  const sessionRef = doc(db,'staffSessions',state.user.uid);
  const base = {uid:state.user.uid,namaStaff:state.staffName||'Staff',lastSeen:serverTimestamp(),active:true};
  if (isLogin) base.loginAt=serverTimestamp();
  await setDoc(sessionRef,base,{merge:true});
}
function startHeartbeat() {
  clearInterval(state.heartbeatTimer);
  state.heartbeatTimer=setInterval(()=>upsertStaffSession(false).catch(()=>{}),30000);
}
async function doAdminLogin(email,password,button) {
  if (!FIREBASE_READY) return showToast('Firebase belum dikonfigurasi.','error');
  setBusy(button,true,'Masuk...');
  try { if(auth.currentUser) await signOut(auth); await signInWithEmailAndPassword(auth,email.trim(),password); }
  catch(err){console.error(err);showToast(firebaseError(err),'error');}
  finally{setBusy(button,false);}
}
async function doStaffLogin(name,button) {
  if (!FIREBASE_READY) return showToast('Firebase belum dikonfigurasi.','error');
  const clean=name.trim(); if(clean.length<2) return showToast('Nama Staff minimal 2 karakter.','warning');
  setBusy(button,true,'Masuk...');
  try { if(auth.currentUser) await signOut(auth); state.staffName=clean; localStorage.setItem('spb_staff_name',clean); await signInAnonymously(auth); }
  catch(err){console.error(err);showToast(firebaseError(err),'error');}
  finally{setBusy(button,false);}
}
function firebaseError(err) {
  const code=err?.code||'';
  const map={
    'auth/invalid-credential':'Email atau password salah.',
    'auth/invalid-login-credentials':'Email atau password salah.',
    'auth/user-not-found':'Akun Admin tidak ditemukan.',
    'auth/wrong-password':'Password salah.',
    'auth/too-many-requests':'Terlalu banyak percobaan. Coba lagi beberapa saat.',
    'auth/network-request-failed':'Koneksi jaringan bermasalah.',
    'auth/operation-not-allowed':'Metode login belum diaktifkan di Firebase.',
    'auth/email-already-in-use':'Email sudah digunakan.',
    'auth/requires-recent-login':'Silakan login ulang sebelum mengganti password.',
    'permission-denied':'Akses ditolak oleh Firestore Rules. Publish Rules terbaru atau periksa role Admin.'
  };
  return map[code] || err?.message || 'Terjadi kesalahan.';
}

async function loadDestinations() {
  if(!db) return;
  const snap=await getDocs(collection(db,'destinations'));
  state.destinations=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>destinationLabel(a).localeCompare(destinationLabel(b),'id'));
}
async function loadYearCodes() {
  if(!db) return;
  const snap=await getDocs(collection(db,'yearCodes'));
  state.yearCodes=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>Number(a.year)-Number(b.year)||String(a.code||'').localeCompare(String(b.code||''),'id'));
}
function yearCodesForYear(year){
  const y=Number(year);
  return state.yearCodes.filter(x=>Number(x.year)===y).sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''),'id'));
}
function nextAvailableCodeForYear(year, excludeId=''){
  const used=new Set(yearCodesForYear(year).filter(x=>x.id!==excludeId).map(x=>String(x.code||'').toUpperCase()));
  for(let i=0;i<26;i++){
    const c=String.fromCharCode(65+i);
    if(!used.has(c)) return c;
  }
  return '';
}
function parseSpbCodeParts(code){
  const m=/^(JS|R|U)(\d{2})([A-Z])(\d{4})$/i.exec(String(code||''));
  return m?{prefix:m[1].toUpperCase(),year2:m[2],code:String(m[3]).toUpperCase(),sequence:m[4]}:null;
}
async function loadMasterBarang() {
  if(!db) return;
  const snap=await getDocs(collection(db,'masterBarang'));
  state.masterBarang=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>normalized(a.kodeBarang).localeCompare(normalized(b.kodeBarang),'id'));
}
async function loadMasterSatuan() {
  if(!db) return;
  const snap=await getDocs(collection(db,'masterSatuan'));
  state.masterSatuan=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>normalized(a.nama).localeCompare(normalized(b.nama),'id'));
}
function availableUnits(){
  const custom=state.masterSatuan.filter(x=>x.active!==false).map(x=>String(x.nama||'').trim()).filter(Boolean);
  const source=[...DEFAULT_UNITS,...custom];
  return [...new Set(source.map(x=>unitLabel(x)).filter(Boolean))];
}
function unitLabel(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const up=raw.toUpperCase();
  const aliases={PCS:'PCS',PC:'PCS',KG:'KG',ROL:'ROL',MTR:'MTR',METER:'MTR',METRE:'MTR'};
  return aliases[up]||up;
}
async function preloadReferenceData() {
  if(!db) return;
  const results=await Promise.allSettled([loadDestinations(),loadYearCodes(),loadMasterBarang(),loadMasterSatuan()]);
  const failed=results.filter(r=>r.status==='rejected');
  if(failed.length){
    failed.forEach(r=>console.error('Gagal memuat Master Data:',r.reason));
    showToast('Sebagian Master Data gagal dimuat. Periksa koneksi dan Firestore Rules.','warning');
  }
}
async function loadRecentSPBs(max=300) {
  if(!db) return [];
  const snap=await getDocs(query(collection(db,'spb'),orderBy('tanggal','desc'),limit(max)));
  state.spbs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status!=='deleted');
  return state.spbs;
}
async function loadDashboardMonth() {
  const monthStart=firstDayOfMonth(); const end=todayISO();
  const snap=await getDocs(query(collection(db,'spb'),where('tanggal','>=',monthStart),where('tanggal','<=',end),limit(5000)));
  return snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status!=='cancelled');
}
async function loadReportRows(filters) {
  if(!db) return [];
  const constraints=[];
  if(filters.start) constraints.push(where('tanggal','>=',filters.start));
  if(filters.end) constraints.push(where('tanggal','<=',filters.end));
  constraints.push(limit(5000));
  const snap=await getDocs(query(collection(db,'spb'),...constraints));
  let rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status!=='deleted');
  if(filters.type!=='all') rows=rows.filter(r=>r.type===filters.type);
  if(filters.prefix!=='all') rows=rows.filter(r=>String(r.spbCode||'').startsWith(filters.prefix));
  if(filters.category!=='all') rows=rows.filter(r=>r.returCategory===filters.category);
  if(filters.code) rows=rows.filter(r=>normalized(r.spbCode).includes(normalized(filters.code)));
  rows.sort((a,b)=>String(b.tanggal||'').localeCompare(String(a.tanggal||''))||String(b.spbCode||'').localeCompare(String(a.spbCode||'')));
  return rows;
}

function renderDashboard() {
  const target=$('view-dashboard');
  target.innerHTML=`<div class="grid" style="gap:16px">
    ${state.role==='admin'?`<div id="dashboardMetrics" class="grid cards-5"></div><div class="grid two-col"><div id="recentSpbCard" class="card card-pad"></div><div id="dashboardStaffCard" class="card card-pad"></div></div>`:`<div class="grid" style="grid-template-columns:repeat(2,1fr)"><button class="card card-pad" style="text-align:left" data-go-search><div class="muted">Cari data</div><div class="card-title" style="margin-top:6px">Cari SPB</div><div class="card-sub">Cari berdasarkan kode, No LRB, barang, kategori, atau tujuan.</div></button><button class="card card-pad" style="text-align:left" data-go-search><div class="muted">Cetak</div><div class="card-title" style="margin-top:6px">Print SPB</div><div class="card-sub">Buka detail SPB lalu cetak dokumen A4.</div></button></div>`}
  </div>`;
  target.querySelectorAll('[data-go-search]').forEach(btn=>btn.addEventListener('click',()=>navigate('search')));
  if(state.role==='admin') loadDashboardData();
}

async function loadDashboardData() {
  try {
    const [rows,monthRows]=await Promise.all([loadRecentSPBs(100),loadDashboardMonth()]);
    const today=monthRows.filter(r=>r.tanggal===todayISO());
    const jasa=monthRows.filter(r=>r.type==='Jasa').length;
    const retur=monthRows.filter(r=>r.type==='Retur').length;
    const umum=monthRows.filter(r=>r.type==='Umum').length;
    $('dashboardMetrics').innerHTML=[metricCard('Hari Ini',today.length,'Dokumen aktif'),metricCard('Bulan Ini',monthRows.length,'Dokumen aktif'),metricCard('Jasa',jasa,'Bulan berjalan'),metricCard('Retur',retur,'Bulan berjalan'),metricCard('Umum',umum,'Bulan berjalan')].join('');
    $('recentSpbCard').innerHTML=`<div class="section-head"><div><div class="card-title">SPB Terbaru</div><div class="card-sub">100 dokumen terbaru</div></div><button class="btn btn-secondary btn-sm" data-open-search>Lihat Semua</button></div>${renderSpbTable(rows.slice(0,10),true,false)}`;
    $('recentSpbCard').querySelector('[data-open-search]')?.addEventListener('click',()=>navigate('search'));
    await renderStaffCard();
  } catch(err){console.error(err);showToast('Gagal memuat dashboard.','error');}
}

function metricCard(title,value,sub){return `<div class="card metric"><div class="metric-label">${title}</div><div class="metric-value">${value}</div><div class="metric-sub">${sub}</div></div>`;}
function renderSpbTable(rows,adminActions=true,showActions=true,showItemNames=false) {
  if(!rows.length) return '<div class="empty">Belum ada data SPB.</div>';
  const itemNameCell=(r)=>{
    const items=Array.isArray(r.items)?r.items:[];
    if(!showItemNames) return '';
    if(!items.length) return '<span class="small-help">-</span>';
    return `<div class="spb-item-names">${items.map((it,i)=>`<div class="spb-item-name">${i+1}. ${escapeHtml(it?.namaBarang||it?.name||'-')}</div>`).join('')}</div>`;
  };
  const itemQtyCell=(r)=>{
    const items=Array.isArray(r.items)?r.items:[];
    if(!showItemNames) return '';
    if(!items.length) return '<span class="small-help">-</span>';
    return `<div class="spb-item-qty-list">${items.map((it)=>{
      const lines=normalizedQuantityLines(it);
      return `<div class="spb-item-qty-block">${lines.length?lines.map(q=>`<div class="spb-item-qty-line"><span>${escapeHtml(fmtNum(q.qty))}</span><span>${escapeHtml(q.satuan||'')}</span></div>`).join(''):'<span class="small-help">-</span>'}</div>`;
    }).join('')}</div>`;
  };
  return `<div class="table-wrap"><table class="table ${showItemNames?'search-spb-table':''}"><thead><tr><th>Kode</th><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Kepada</th>${showItemNames?'<th>Nama Barang</th><th>Qty / Satuan</th>':''}<th class="center">Item</th><th>Status</th>${showActions?'<th>Aksi</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${escapeHtml(r.spbCode)}</strong><div class="small-help">${escapeHtml(r.noLrb||'')}</div></td><td>${formatDate(r.tanggal)}</td><td>${typeBadge(r.type)}</td><td>${categoryBadge(r.returCategory)||'-'}</td><td>${escapeHtml(r.toPartyLine1||r.toParty||'-')}</td>${showItemNames?`<td>${itemNameCell(r)}</td><td>${itemQtyCell(r)}</td>`:''}<td class="center">${(r.items||[]).length}</td><td>${statusBadge(r.status)}</td>${showActions?`<td><div class="row-actions"><button class="btn btn-secondary btn-sm" data-spb-action="view" data-id="${r.id}">Lihat</button><button class="btn btn-primary btn-sm" data-spb-action="print" data-id="${r.id}">Print</button>${state.role==='admin'&&adminActions&&r.status!=='cancelled'?`<button class="btn btn-soft btn-sm" data-spb-action="edit" data-id="${r.id}">Edit</button><button class="btn btn-danger btn-sm" data-spb-action="delete" data-id="${r.id}">Hapus</button>`:''}</div></td>`:''}</tr>`).join('')}</tbody></table></div>`;
}

function bindSpbTableActions(root) {
  root.querySelectorAll('[data-spb-action]').forEach(btn=>btn.addEventListener('click',async()=>{
    const id=btn.dataset.id; const action=btn.dataset.spbAction;
    if(action==='view') return openSpbDetail(id);
    if(action==='print') return requestProtectedSpbPrintById(id);
    if(action==='edit'){state.editingId=id;navigate('spb');return;}
    if(action==='delete') return deleteSpb(id);
  }));
}

function normalizeQuantities(item={}) {
  if(Array.isArray(item.quantities)) return item.quantities.map(q=>({qty:q?.qty??'',satuan:unitLabel(q?.satuan||q?.unit||'')})).filter(q=>q.qty!==''||q.satuan);
  const legacy=[];
  const add=(qty,unit)=>{if(safeNum(qty)>0)legacy.push({qty,satuan:unit});};
  add(item.qtyPcs,'PCS'); add(item.qtyKg,'KG'); add(item.qtyRol,'ROL');
  if(!legacy.length && item.qty!==undefined && item.qty!==null && String(item.qty).trim()!=='') legacy.push({qty:item.qty,satuan:unitLabel(item.satuan||item.unit)});
  return legacy;
}
function legacyQtySummary(quantities){
  const sumBy=(u)=>quantities.filter(q=>unitLabel(q.satuan)===u).reduce((s,q)=>s+safeNum(q.qty),0);
  return {qtyPcs:sumBy('PCS'),qtyKg:sumBy('KG'),qtyRol:sumBy('ROL'),satuan:quantities.length?unitLabel(quantities[0].satuan):''};
}
function createInitialItem(no=1,item={}) {
  return {
    no,
    kodeBarang:item.kodeBarang||'',
    namaBarang:item.namaBarang||'',
    noPo:item.noPo||item.noPO||'',
    keterangan:item.keterangan||'',
    qtyOrder:item.qtyOrder ?? '',
    qtyRetur:item.qtyRetur ?? '',
    quantities:normalizeQuantities(item),
    qtyPcs:item.qtyPcs ?? '',
    qtyKg:item.qtyKg ?? '',
    qtyRol:item.qtyRol ?? '',
    satuan:item.satuan||item.unit||'',
    unitModes:Array.isArray(item.unitModes)?item.unitModes.map(unitLabel).filter(Boolean):undefined,
    persen:item.persen ?? item.presentase ?? ''
  };
}
function calculatePresentase(qtyOrder, qtyRetur, fallback='') {
  const order=safeNum(qtyOrder); const retur=safeNum(qtyRetur);
  if(order>0) return Math.round((retur/order)*10000)/100;
  return fallback === '' || fallback === null || fallback === undefined ? '' : safeNum(fallback);
}
function getSelectedMaster(code) { const c=normalized(code); return state.masterBarang.find(x=>normalized(x.kodeBarang)===c && x.active!==false) || null; }
function applyMasterToItem(index,master) {
  const item=state.formItems[index]; if(!item||!master)return;
  item.kodeBarang=master.kodeBarang||''; item.namaBarang=master.namaBarang||''; item.unitModes=Array.isArray(master.unitModes)?master.unitModes.map(unitLabel):availableUnits();
  if(!Array.isArray(item.quantities)||!item.quantities.length) item.quantities=[{qty:'',satuan:item.unitModes[0]||availableUnits()[0]||''}];
  renderFormItems();
}
function resolveExistingDestination(existing={}) {
  const lines = spbToLineValues(existing);
  const all = state.destinations || [];
  if (existing?.toPartyType === 'Manual') return { mode:'manual', id:'' , lines };
  if (existing?.toPartyType === 'Master' && existing?.toPartyId) {
    const byId = all.find(d=>d.id===existing.toPartyId);
    if (byId) return { mode:'master', id:byId.id, lines:destinationLines(byId) };
  }
  if (lines.line1) {
    const match = all.find(d=>{
      const dl=destinationLines(d);
      return normalized(dl.line1)===normalized(lines.line1) && normalized(dl.line2)===normalized(lines.line2);
    });
    if (match) return { mode:'master', id:match.id, lines:destinationLines(match) };
  }
  return { mode: lines.line1 ? 'manual' : 'none', id:'', lines };
}

async function getSpbForEdit(editId){
  if(!editId) return null;
  try{
    const snap=await getDoc(doc(db,'spb',editId));
    if(snap.exists()){
      const item={id:snap.id,...snap.data()};
      state.spbs=[item,...state.spbs.filter(x=>x.id!==item.id)];
      return item;
    }
  }catch(err){
    console.error(err);
  }
  return state.spbs.find(x=>x.id===editId)||null;
}

async function renderSpbForm(editId=null) {
  state.editingId=editId;
  const target=$('view-spb');
  const existing=editId?await getSpbForEdit(editId):null;
  if(editId && !existing){ showToast('Data SPB tidak ditemukan.','error');state.editingId=null;return renderSpbForm(); }
  state.formItems=existing?.items?.length?existing.items.map((x,i)=>createInitialItem(i+1,x)):[createInitialItem(1)];
  const existingPoValues=[...new Set(state.formItems.map(x=>String(x.noPo||'').trim()).filter(Boolean))];
  state.formPoMode=existing?.poMode||(existingPoValues.length>1?'perItem':'single');
  state.formSharedPo=existing?.sharedNoPo||existingPoValues[0]||'';
  if(state.formPoMode==='single' && state.formSharedPo) state.formItems.forEach(x=>{x.noPo=state.formSharedPo;});
  const type=existing?.type||'Jasa';
  const cat=existing?.returCategory||'';
  const toSelection=resolveExistingDestination(existing||{});
  const manualLines=toSelection.lines;
  const selectedToId=toSelection.mode==='master'?toSelection.id:'';
  const useManualTo=toSelection.mode==='manual';
  const existingParts=parseSpbCodeParts(existing?.spbCode);
  const selectedYear=Number(existing?.tanggal?.slice(0,4)||todayISO().slice(0,4));
  const yearOptions=yearCodesForYear(selectedYear);
  const selectedYearCode=existingParts?.code || existing?.yearCode || (yearOptions[0]?.code||'');
  const lockedYearCode=Boolean(existing);
  target.innerHTML=`<div class="grid" style="gap:16px">
    <form id="spbForm" class="grid" style="gap:16px">
      <div class="card card-pad"><div class="section-head"><div><div class="card-title">Informasi SPB</div><div class="card-sub">Semua informasi utama berada dalam satu panel.</div></div><button id="resetSpbBtn" class="btn btn-secondary" type="button">${existing?'Batal Edit':'Reset Form'}</button></div>
        <div class="form-grid">
          <div class="field"><label>No LRB</label><input id="spbNoLrb" class="input" maxlength="80" value="${escapeHtml(existing?.noLrb||'')}" placeholder="Isi manual"></div>
          <div class="field"><label>No SPB</label><div class="input" style="background:#f8fafc;font-weight:900;color:#64748b">${existing?escapeHtml(existing.spbCode):'Otomatis saat simpan'}</div></div>
          <div class="field"><label>Tanggal *</label><input id="spbTanggal" class="input" type="date" value="${existing?.tanggal||todayISO()}" required ${existing?'':' '}></div>
          <div class="field"><label>Jenis SPB *</label><select id="spbType" class="select" required><option value="Jasa" ${type==='Jasa'?'selected':''}>Jasa</option><option value="Retur" ${type==='Retur'?'selected':''}>Retur</option><option value="Umum" ${type==='Umum'?'selected':''}>Umum</option></select></div>
        </div>
        <div class="field" style="margin-top:14px;max-width:360px"><label>Kode Tahun *</label><select id="spbYearCode" class="select" ${lockedYearCode?'disabled':''}>${yearOptions.length?yearOptions.map(x=>`<option value="${escapeHtml(x.id)}" ${String(x.code).toUpperCase()===selectedYearCode?'selected':''}>${escapeHtml(selectedYear)}${escapeHtml(String(x.code||'').toUpperCase())}</option>`).join(''):'<option value="">Kode tahun belum tersedia</option>'}</select><div class="small-help">Dipakai untuk membentuk No SPB, misalnya 2026A → JS26A0001.</div></div>
        <div id="returCategoryWrap" class="field" style="margin-top:14px;max-width:360px;${type==='Retur'?'':'display:none'}"><label>Kategori Retur *</label><select id="spbCategory" class="select"><option value="">Pilih Kategori</option>${RETUR_CATEGORIES.map(x=>`<option value="${escapeHtml(x)}" ${x===cat?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></div>
        <div class="form-grid-2" style="margin-top:14px"><div class="field"><label>Dari</label><input class="input" value="${COMPANY_NAME}" readonly></div><div class="field"><label>Kepada *</label><select id="spbToMaster" class="select"><option value="">Pilih Master Tujuan</option>${state.destinations.filter(d=>d.active!==false).map(d=>`<option value="${escapeHtml(d.id)}" ${selectedToId===d.id?'selected':''}>${escapeHtml(destinationLabel(d))}</option>`).join('')}<option value="__manual__" ${useManualTo?'selected':''}>Lainnya / Manual</option></select></div></div>
        <div id="manualToWrap" style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;${useManualTo?'':'display:none'}"><div class="field"><label>Kepada — Baris 1 *</label><input id="spbManualTo1" class="input" maxlength="150" value="${escapeHtml(useManualTo?manualLines.line1:'')}" placeholder="Nama PT / tujuan"></div><div class="field"><label>Kepada — Baris 2</label><input id="spbManualTo2" class="input" maxlength="150" value="${escapeHtml(useManualTo?manualLines.line2:'')}" placeholder="Kota / keterangan tambahan"></div></div>
        <div class="field" style="margin-top:14px"><label>Note</label><textarea id="spbNote" class="textarea" placeholder="Catatan tambahan pada dokumen...">${escapeHtml(existing?.note||'')}</textarea></div>
      </div>

      <div class="card card-pad"><div class="section-head"><div><div class="card-title">Detail Barang</div><div class="card-sub">Pilih Kode Barang dari Master atau ketik manual. Nama otomatis terisi bila kode ditemukan.</div></div><button id="addItemBtn" class="btn btn-secondary" type="button">+ Tambah Barang</button></div>
        <div class="po-control-grid"><div class="field"><label>Pengaturan No. PO</label><select id="spbPoMode" class="select"><option value="single" ${state.formPoMode==='single'?'selected':''}>Satu No. PO untuk semua barang</option><option value="perItem" ${state.formPoMode==='perItem'?'selected':''}>No. PO berbeda per barang</option></select></div><div id="sharedPoWrap" class="field" style="${state.formPoMode==='single'?'':'display:none'}"><label>No. PO untuk semua barang</label><input id="spbSharedPo" class="input" maxlength="100" value="${escapeHtml(state.formSharedPo)}" placeholder="Contoh BZOB26H049"><div class="small-help">Cukup isi satu kali. Nilai otomatis diterapkan ke seluruh barang.</div></div></div>
        <div id="itemsTableWrap" class="table-wrap"></div>
        <div class="small-help" style="margin-top:10px">Mode satu No. PO menghindari pengisian ulang pada setiap baris. Ubah ke mode berbeda bila satu SPB mempunyai beberapa PO.</div>
      </div>
      <div class="card card-pad" style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><strong>TTD Admin</strong><div class="small-help">Dibuat otomatis dari TTD Admin yang sedang login. ${state.profile?.signatureSnapshotData?'TTD tersedia.':'TTD belum di-upload.'}</div></div><button id="openSignatureFromForm" class="btn btn-secondary" type="button">Kelola TTD</button><button id="saveSpbBtn" class="btn btn-primary" type="submit">${existing?'Simpan Perubahan':'Simpan SPB'}</button></div>
    </form>
  </div>`;
  renderFormItems();
  $('resetSpbBtn').addEventListener('click',()=>{state.editingId=null;navigate('spb');});
  $('addItemBtn').addEventListener('click',()=>{const next=createInitialItem(state.formItems.length+1);if(state.formPoMode==='single')next.noPo=state.formSharedPo;state.formItems.push(next);renderFormItems();});
  $('spbPoMode').addEventListener('change',()=>{const previousMode=state.formPoMode;const nextMode=$('spbPoMode').value;state.formPoMode=nextMode;if(nextMode==='single'){const firstPo=state.formItems.find(x=>String(x.noPo||'').trim())?.noPo?.trim()||'';const fieldPo=$('spbSharedPo')?.value.trim()||'';state.formSharedPo=previousMode==='perItem'?(firstPo||''):(fieldPo||state.formSharedPo||firstPo||'');state.formItems.forEach(x=>{x.noPo=state.formSharedPo;});$('sharedPoWrap').style.display='';}else{$('sharedPoWrap').style.display='none';}renderFormItems();});
  $('spbSharedPo').addEventListener('input',()=>{state.formSharedPo=$('spbSharedPo').value;state.formItems.forEach(x=>{x.noPo=state.formSharedPo.trim();});document.querySelectorAll('#itemsTableWrap input[data-field="noPo"]').forEach(inp=>{inp.value=state.formSharedPo;});});
  $('spbType').addEventListener('change',()=>{ $('returCategoryWrap').style.display=$('spbType').value==='Retur'?'':'none'; if($('spbType').value!=='Retur')$('spbCategory').value=''; });
  $('spbToMaster').addEventListener('change',()=>{const manual=$('spbToMaster').value==='__manual__';$('manualToWrap').style.display=manual?'grid':'none';if(!manual){$('spbManualTo1').value='';$('spbManualTo2').value='';}});
  $('spbTanggal').addEventListener('change',()=>{
    if(existing) return;
    const year=Number($('spbTanggal').value.slice(0,4));
    const opts=yearCodesForYear(year);
    const current=$('spbYearCode').value;
    const currentCode=state.yearCodes.find(x=>x.id===current);
    $('spbYearCode').innerHTML=opts.length?opts.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(year)}${escapeHtml(String(x.code||'').toUpperCase())}</option>`).join(''):'<option value="">Kode tahun belum tersedia</option>';
    if(currentCode && opts.some(x=>x.id===current)) $('spbYearCode').value=current;
    else if(opts.length) $('spbYearCode').value=opts[0].id;
  });
  $('openSignatureFromForm').addEventListener('click',()=>navigate('signature'));
  $('spbForm').addEventListener('submit',saveSpbFromForm);
}

function renderFormItems() {
  const wrap=$('itemsTableWrap');
  if(!wrap)return;
  const headers=['No','Kode Barang','Nama Barang','No. PO','Keterangan','Qty / Satuan','Qty Order','Qty Retur','%','Aksi'];
  const head=`<div class="item-grid-head" role="row">${headers.map((h,i)=>`<div class="item-grid-cell ${[0,6,7,8,9].includes(i)?'center':''}" role="columnheader">${h}</div>`).join('')}</div>`;
  const rows=state.formItems.map((item,i)=>{
    if(!Array.isArray(item.quantities)) item.quantities=normalizeQuantities(item);
    const qtyRows=item.quantities.length?item.quantities:[{qty:'',satuan:(item.unitModes?.[0]||availableUnits()[0]||'')}];
    item.quantities=qtyRows;
    const pct=calculatePresentase(item.qtyOrder,item.qtyRetur,item.persen); item.persen=pct;
    const units=(item.unitModes?.length?item.unitModes:availableUnits()).map(unitLabel);
    const qtyHtml=qtyRows.map((q,qi)=>`<div class="qty-line"><input class="input qty-unit-input" data-index="${i}" data-qty-index="${qi}" data-qty-field="qty" value="${escapeHtml(q.qty)}" type="number" min="0" step="any" placeholder="Qty"><select class="select qty-unit-select" data-index="${i}" data-qty-index="${qi}" data-qty-field="satuan"><option value="">Satuan</option>${units.map(u=>`<option value="${escapeHtml(u)}" ${unitLabel(q.satuan)===u?'selected':''}>${escapeHtml(u)}</option>`).join('')}</select>${qtyRows.length>1?`<button type="button" class="btn btn-danger btn-xs qty-remove-btn" data-index="${i}" data-qty-index="${qi}" aria-label="Hapus satuan">×</button>`:''}</div>`).join('');
    return `<div class="item-grid-row" role="row">
      <div class="item-grid-cell center" role="gridcell">${i+1}</div>
      <div class="item-grid-cell" role="gridcell"><input list="masterBarangOptions" class="input item-field" data-index="${i}" data-field="kodeBarang" value="${escapeHtml(item.kodeBarang)}" placeholder="Ketik / pilih kode" autocomplete="off"></div>
      <div class="item-grid-cell" role="gridcell"><input class="input item-field" data-index="${i}" data-field="namaBarang" value="${escapeHtml(item.namaBarang)}" placeholder="Nama barang"></div>
      <div class="item-grid-cell" role="gridcell"><input class="input item-field" data-index="${i}" data-field="noPo" value="${escapeHtml(state.formPoMode==='single'?state.formSharedPo:item.noPo)}" placeholder="No. PO" ${state.formPoMode==='single'?'readonly title="Mengikuti No. PO untuk semua barang"':''}></div>
      <div class="item-grid-cell" role="gridcell"><input class="input item-field" data-index="${i}" data-field="keterangan" value="${escapeHtml(item.keterangan)}" placeholder="Keterangan"></div>
      <div class="item-grid-cell qty-unit-cell" role="gridcell"><div class="qty-lines">${qtyHtml}</div><button type="button" class="btn btn-secondary btn-xs qty-add-btn" data-index="${i}">+ Satuan</button></div>
      <div class="item-grid-cell numeric" role="gridcell"><input class="input item-field qty-calc" data-index="${i}" data-field="qtyOrder" value="${escapeHtml(item.qtyOrder)}" type="number" min="0" step="any" placeholder="0"></div>
      <div class="item-grid-cell numeric" role="gridcell"><input class="input item-field qty-calc" data-index="${i}" data-field="qtyRetur" value="${escapeHtml(item.qtyRetur)}" type="number" min="0" step="any" placeholder="0"></div>
      <div class="item-grid-cell numeric" role="gridcell"><input class="input item-field" data-index="${i}" data-field="persen" value="${escapeHtml(pct)}" type="number" min="0" max="100" step="0.01" placeholder="0" readonly title="Otomatis: Qty Retur ÷ Qty Order × 100"></div>
      <div class="item-grid-cell center" role="gridcell"><button type="button" class="btn btn-danger btn-sm" data-remove-item="${i}" ${state.formItems.length===1?'disabled':''}>Hapus</button></div>
    </div>`;
  }).join('');
  wrap.innerHTML=`<datalist id="masterBarangOptions">${state.masterBarang.filter(x=>x.active!==false).slice(0,2000).map(x=>`<option value="${escapeHtml(x.kodeBarang)}">${escapeHtml(x.namaBarang)}</option>`).join('')}</datalist><div class="item-grid-scroll"><div class="item-grid" role="grid" aria-label="Detail barang">${head}${rows}</div></div>`;
  wrap.querySelectorAll('.item-field').forEach(inp=>inp.addEventListener('input',()=>{
    const i=Number(inp.dataset.index),field=inp.dataset.field; state.formItems[i][field]=inp.value;
    if(field==='noPo' && state.formPoMode==='perItem') state.formItems[i].noPo=inp.value;
    if(field==='qtyOrder'||field==='qtyRetur'){
      state.formItems[i].persen=calculatePresentase(state.formItems[i].qtyOrder,state.formItems[i].qtyRetur,state.formItems[i].persen);
      const pctInput=wrap.querySelector(`input[data-index="${i}"][data-field="persen"]`); if(pctInput)pctInput.value=state.formItems[i].persen;
    }
  }));
  wrap.querySelectorAll('input[data-field="kodeBarang"]').forEach(inp=>{const auto=()=>{const i=Number(inp.dataset.index),m=getSelectedMaster(inp.value);if(m){const item=state.formItems[i];item.kodeBarang=m.kodeBarang;item.namaBarang=m.namaBarang;item.unitModes=Array.isArray(m.unitModes)?m.unitModes.map(unitLabel):availableUnits();if(!item.quantities.length)item.quantities=[{qty:'',satuan:item.unitModes[0]||availableUnits()[0]||''}];renderFormItems();}};inp.addEventListener('change',auto);});
  wrap.querySelectorAll('.qty-unit-input,.qty-unit-select').forEach(el=>el.addEventListener('input',()=>{const i=Number(el.dataset.index),qi=Number(el.dataset.qtyIndex),f=el.dataset.qtyField;state.formItems[i].quantities[qi][f]=el.value;}));
  wrap.querySelectorAll('.qty-unit-select').forEach(el=>el.addEventListener('change',()=>{const i=Number(el.dataset.index),qi=Number(el.dataset.qtyIndex);state.formItems[i].quantities[qi].satuan=unitLabel(el.value);}));
  wrap.querySelectorAll('.qty-add-btn').forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.index),item=state.formItems[i],units=item.unitModes?.length?item.unitModes.map(unitLabel):availableUnits(),used=new Set(item.quantities.map(q=>unitLabel(q.satuan)));const next=units.find(u=>!used.has(u))||units[0]||'';item.quantities.push({qty:'',satuan:next});renderFormItems();}));
  wrap.querySelectorAll('.qty-remove-btn').forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.index),qi=Number(btn.dataset.qtyIndex);state.formItems[i].quantities.splice(qi,1);if(!state.formItems[i].quantities.length)state.formItems[i].quantities=[{qty:'',satuan:''}];renderFormItems();}));
  wrap.querySelectorAll('[data-remove-item]').forEach(btn=>btn.addEventListener('click',()=>{const i=Number(btn.dataset.removeItem);if(state.formItems.length>1){state.formItems.splice(i,1);state.formItems.forEach((x,j)=>x.no=j+1);renderFormItems();}}));
}

function openBarangPicker(index) {
  const active=state.masterBarang.filter(x=>x.active!==false);
  openModal(`<div class="modal-head"><div><div class="card-title">Pilih Barang</div><div class="card-sub">Cari berdasarkan kode atau nama.</div></div><button type="button" class="btn btn-soft" data-close-modal>Tutup</button></div><div class="modal-body"><div class="search-bar"><input id="barangPickerSearch" class="input" placeholder="Ketik kode / nama barang"><button id="barangPickerClear" type="button" class="btn btn-secondary">Reset</button></div><div id="barangPickerList" style="margin-top:12px"></div></div>`);
  $('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));
  const render=()=>{const term=normalized($('barangPickerSearch').value);const rows=active.filter(x=>!term||normalized(x.kodeBarang).includes(term)||normalized(x.namaBarang).includes(term));$('barangPickerList').innerHTML=rows.length?rows.slice(0,100).map(x=>`<div class="search-result"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><div><strong>${escapeHtml(x.kodeBarang)}</strong><div style="margin-top:3px">${escapeHtml(x.namaBarang)}</div><div class="chip-row" style="margin-top:6px">${(x.unitModes||availableUnits()).map(u=>`<span class="pill type-pill">${u}</span>`).join('')}</div></div><button type="button" class="btn btn-primary btn-sm" data-select-barang="${x.id}">Pilih</button></div></div>`).join(''):'<div class="empty">Barang tidak ditemukan.</div>'; $('barangPickerList').querySelectorAll('[data-select-barang]').forEach(b=>b.addEventListener('click',()=>{const m=active.find(x=>x.id===b.dataset.selectBarang);if(m)applyMasterToItem(index,m);closeModal();}));};
  $('barangPickerSearch').addEventListener('input',render); $('barangPickerClear').addEventListener('click',()=>{ $('barangPickerSearch').value='';render(); }); render(); $('barangPickerSearch').focus();
}
async function saveSpbFromForm(event) {
  event.preventDefault();
  const btn=$('saveSpbBtn'); setBusy(btn,true,state.editingId?'Menyimpan...':'Membuat SPB...');
  try {
    const tanggal=$('spbTanggal').value;
    const noLrb=$('spbNoLrb').value.trim();
    const type=$('spbType').value;
    const category=type==='Retur'?$('spbCategory').value:null;
    const year=Number(tanggal.slice(0,4));
    const yearCodeId=$('spbYearCode').value;
    const yearCodeDoc=state.yearCodes.find(x=>x.id===yearCodeId);
    let toParty=''; let toPartyLine1=''; let toPartyLine2=''; let toPartyType=''; let toPartyId=null;
    const toSelect=$('spbToMaster').value;
    if(toSelect==='__manual__'){
      toPartyLine1=$('spbManualTo1').value.trim(); toPartyLine2=$('spbManualTo2').value.trim();
      toParty=[toPartyLine1,toPartyLine2].filter(Boolean).join('\n'); toPartyType='Manual';
    } else if(toSelect){
      const dest=state.destinations.find(d=>d.id===toSelect);
      if(dest){const lines=destinationLines(dest);toPartyLine1=lines.line1;toPartyLine2=lines.line2;toParty=[toPartyLine1,toPartyLine2].filter(Boolean).join('\n');toPartyType='Master';toPartyId=dest.id;}
    } else if(state.editingId){
      const old=state.spbs.find(x=>x.id===state.editingId);
      if(old){const oldLines=spbToLineValues(old);toPartyLine1=oldLines.line1;toPartyLine2=oldLines.line2;toParty=[toPartyLine1,toPartyLine2].filter(Boolean).join('\n');toPartyType=old.toPartyType||'Manual';toPartyId=old.toPartyId||null;}
    }
    const note=$('spbNote').value.trim();
    if(!tanggal)throw new Error('Tanggal wajib diisi.');
    if(!yearCodeDoc || Number(yearCodeDoc.year)!==year)throw new Error(`Kode tahun untuk ${year} belum dipilih atau tidak valid.`);
    if(type==='Retur'&&!category)throw new Error('Kategori Retur wajib dipilih.');
    if(!toPartyLine1)throw new Error('Kepada wajib diisi.');
    if(!state.formItems.length)throw new Error('Minimal satu barang.');
    if(state.editingId){
      const existing=state.spbs.find(x=>x.id===state.editingId)||await getSpbForEdit(state.editingId);
      if(!existing)throw new Error('SPB yang diedit tidak ditemukan.');
      const parts=parseSpbCodeParts(existing.spbCode);
      if(parts && (String(year).slice(-2)!==parts.year2 || String(yearCodeDoc.code||'').toUpperCase()!==parts.code)) throw new Error('Tahun/Kode Tahun pada Edit tidak boleh diubah karena sudah menjadi bagian dari No SPB.');
    }
    const poMode=state.formPoMode==='perItem'?'perItem':'single';
    const sharedNoPo=poMode==='single'?String($('spbSharedPo')?.value??state.formSharedPo??'').trim():'';
    state.formSharedPo=sharedNoPo;
    if(poMode==='single') state.formItems.forEach(x=>{x.noPo=sharedNoPo;});
    const items=state.formItems.map((x,i)=>{const quantities=(Array.isArray(x.quantities)?x.quantities:normalizeQuantities(x)).map(q=>({qty:safeNum(q.qty),satuan:unitLabel(q.satuan)})).filter(q=>q.qty>0);const legacy=legacyQtySummary(quantities);return {no:i+1,kodeBarang:String(x.kodeBarang||'').trim(),namaBarang:String(x.namaBarang||'').trim(),noPo:String(poMode==='single'?sharedNoPo:(x.noPo||x.noPO||'')).trim(),keterangan:String(x.keterangan||'').trim(),qtyOrder:safeNum(x.qtyOrder),qtyRetur:safeNum(x.qtyRetur),quantities,qtyPcs:legacy.qtyPcs,qtyKg:legacy.qtyKg,qtyRol:legacy.qtyRol,satuan:legacy.satuan,persen:calculatePresentase(x.qtyOrder,x.qtyRetur,x.persen)};});
    items.forEach((x,i)=>{
      if(!x.kodeBarang)throw new Error(`Kode Barang pada baris ${i+1} wajib diisi.`);
      if(!x.namaBarang)throw new Error(`Nama Barang pada baris ${i+1} wajib diisi.`);
      if(x.qtyOrder<0||x.qtyRetur<0||x.qtyPcs<0||x.qtyKg<0||x.qtyRol<0)throw new Error(`Qty pada baris ${i+1} tidak boleh negatif.`);
      if(x.qtyRetur>0&&x.qtyOrder<=0)throw new Error(`Qty Order pada baris ${i+1} wajib diisi jika Qty Retur diisi.`);
      const hasQuantity=Array.isArray(x.quantities)&&x.quantities.some(q=>safeNum(q.qty)>0);
      if(x.qtyOrder<=0&&x.qtyRetur<=0&&!hasQuantity)throw new Error(`Minimal satu Qty Order, Qty Retur, atau Qty/Satuan pada baris ${i+1} harus diisi lebih dari 0.`);
      if(Array.isArray(x.quantities)) x.quantities.forEach((q,j)=>{if(q.qty>0&&!q.satuan)throw new Error(`Satuan pada Qty baris ${i+1}.${j+1} wajib dipilih.`);});
      if(x.persen<0||x.persen>100)throw new Error(`Presentase pada baris ${i+1} tidak valid.`);
    });
    if(state.editingId){
      const existing=state.spbs.find(x=>x.id===state.editingId)||await getSpbForEdit(state.editingId);
      await updateDoc(doc(db,'spb',state.editingId),{noLrb,tanggal,type,returCategory:category,fromCompany:COMPANY_NAME,toParty,toPartyLine1,toPartyLine2,toPartyType,toPartyId,note,items,poMode,sharedNoPo,yearCodeId:yearCodeDoc.id,yearCode:String(yearCodeDoc.code).toUpperCase(),updatedAt:serverTimestamp()});
      showToast(`SPB ${existing.spbCode} berhasil diperbarui.`); state.editingId=null; await loadRecentSPBs(2000); navigate('search');
    } else {
      const result=await createSpbTransaction({tanggal,type,category,noLrb,toParty,toPartyLine1,toPartyLine2,toPartyType,toPartyId,note,items,poMode,sharedNoPo,yearCodeId:yearCodeDoc.id,yearCode:String(yearCodeDoc.code).toUpperCase()});
      showToast(`SPB ${result.spbCode} berhasil disimpan.`); await loadRecentSPBs(2000); state.editingId=null; openSpbDetail(result.id);
    }
  } catch(err){console.error(err);showToast(firebaseError(err),'error');}
  finally{setBusy(btn,false);}
}

async function createSpbTransaction(data) {
  if(!state.profile?.signatureSnapshotData)throw new Error('TTD Admin belum tersedia. Upload TTD terlebih dahulu.');
  const createdByUid=state.user.uid; const createdByName=state.profile.name || state.user.email || 'Admin';
  const year=Number(data.tanggal.slice(0,4)); const yearCodeDoc=state.yearCodes.find(x=>x.id===data.yearCodeId && Number(x.year)===year); const codeYear=String(data.yearCode||yearCodeDoc?.code||'').toUpperCase();
  if(!codeYear)throw new Error(`Kode tahun ${year} tidak valid.`);
  const prefix=data.type==='Jasa'?'JS':data.type==='Retur'?'R':'U';
  const counterId=`${prefix}_${year}`;
  const counterRef=doc(db,'counters',counterId);
  const spbRef=doc(collection(db,'spb'));
  let generatedCode='';
  await runTransaction(db,async tx=>{
    const counterSnap=await tx.get(counterRef);
    const current=counterSnap.exists()?Number(counterSnap.data().value||0):0;
    const next=current+1;
    generatedCode=`${prefix}${String(year).slice(-2)}${codeYear}${String(next).padStart(4,'0')}`;
    tx.set(counterRef,{prefix,year,value:next,updatedAt:serverTimestamp()},{merge:true});
    tx.set(spbRef,{spbCode:generatedCode,noLrb:data.noLrb||'',tanggal:data.tanggal,type:data.type,returCategory:data.category||null,fromCompany:COMPANY_NAME,toParty:data.toParty,toPartyLine1:data.toPartyLine1||'',toPartyLine2:data.toPartyLine2||'',toPartyType:data.toPartyType,toPartyId:data.toPartyId||null,note:data.note||'',items:data.items,poMode:data.poMode==='perItem'?'perItem':'single',sharedNoPo:data.sharedNoPo||'',createdByUid,createdByName,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),signatureVersion:state.profile.signatureVersion||'1',signatureOwnerUid:createdByUid,signatureOwnerName:createdByName,signatureSnapshotData:state.profile.signatureSnapshotData,yearCodeId:data.yearCodeId||yearCodeDoc?.id||null,yearCode:codeYear});
  });
  return {id:spbRef.id,spbCode:generatedCode};
}

async function openSpbDetail(id) {
  const item=state.spbs.find(x=>x.id===id);
  if(!item){showToast('SPB tidak ditemukan di data lokal.','error');return;}
  state.currentDetailId=id;
  const to=spbToLineValues(item);
  const qtyCols = ['qtyPcs','qtyKg','qtyRol','persen'].map((f,i)=>({f,label:['Pcs','Kg','Rol','%'][i],show:(item.items||[]).some(x=>safeNum(x[f])>0)}));
  const unitHeads=qtyCols.filter(x=>x.show).map(x=>`<th class="numeric">${x.label}</th>`).join('');
  const unitCells=x=>qtyCols.filter(c=>c.show).map(c=>`<td class="numeric">${safeNum(x[c.f])>0?fmtNum(x[c.f]):''}</td>`).join('');
  openModal(`<div class="modal-head"><div><div class="card-title">${escapeHtml(item.spbCode)}</div><div class="chip-row" style="margin-top:5px">${statusBadge(item.status)} ${typeBadge(item.type)} ${categoryBadge(item.returCategory)}</div></div><button type="button" class="btn btn-soft" data-close-modal>Tutup</button></div><div class="modal-body"><div class="info-grid"><div class="card card-pad"><div class="small-help">Tanggal</div><strong>${formatDate(item.tanggal)}</strong></div><div class="card card-pad"><div class="small-help">No LRB</div><strong>${escapeHtml(item.noLrb||'-')}</strong></div><div class="card card-pad"><div class="small-help">Kepada</div><strong>${escapeHtml(to.line1||'-')}${to.line2?`<br>${escapeHtml(to.line2)}`:''}</strong></div><div class="card card-pad"><div class="small-help">Dibuat</div><strong>${escapeHtml(item.createdByName||'-')}</strong></div></div><div style="margin-top:16px"><div class="card-title">Note</div><div class="note-box" style="margin-top:7px">${escapeHtml(item.note||'-')}</div></div><div style="margin-top:16px" class="table-wrap"><table class="table" style="min-width:760px"><thead><tr><th>No</th><th>Kode</th><th>Nama</th><th>Keterangan</th>${unitHeads}</tr></thead><tbody>${(item.items||[]).map(x=>`<tr><td>${x.no}</td><td>${escapeHtml(x.kodeBarang)}</td><td>${escapeHtml(x.namaBarang)}</td><td>${escapeHtml(x.keterangan||'-')}</td>${unitCells(x)}</tr>`).join('')}</tbody></table></div><div class="small-help" style="margin-top:12px">TTD Admin versi ${escapeHtml(item.signatureVersion||'-')} • SPB dibuat ${formatDateTime(item.createdAt)}</div></div><div class="modal-foot"><button type="button" class="btn btn-secondary" data-close-modal>Tutup</button><button id="detailPrintBtn" type="button" class="btn btn-primary">Print SPB</button>${state.role==='admin'&&item.status!=='cancelled'?'<button id="detailEditBtn" type="button" class="btn btn-soft">Edit</button>':''}</div>`);
  $('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));
  $('detailPrintBtn').addEventListener('click',()=>requestProtectedSpbPrint(item));
  $('detailEditBtn')?.addEventListener('click',()=>{closeModal();state.editingId=id;navigate('spb');});
}

async function deleteSpb(id) {
  const item=state.spbs.find(x=>x.id===id); if(!item)return;
  const answer=window.confirm(`Hapus SPB ${item.spbCode}?\n\nData akan dihapus dari daftar aktif. Sistem akan mencoba menghapus permanen; bila Firebase menolak delete karena Rules belum dipublish, data akan ditandai terhapus agar tidak mengganggu operasional. Nomor SPB tidak akan dipakai ulang.`);
  if(!answer)return;
  try{
    let mode='permanent';
    try{
      await deleteDoc(doc(db,'spb',id));
    }catch(deleteErr){
      if(deleteErr?.code!=='permission-denied') throw deleteErr;
      mode='soft';
      await updateDoc(doc(db,'spb',id),{status:'deleted',deletedAt:serverTimestamp(),deletedByUid:state.user?.uid||'',deletedByName:state.profile?.name||state.user?.email||'Admin'});
    }
    state.spbs=state.spbs.filter(x=>x.id!==id);
    state.reportRows=state.reportRows.filter(x=>x.id!==id);
    showToast(mode==='permanent'?`SPB ${item.spbCode} berhasil dihapus.`:`SPB ${item.spbCode} disembunyikan dari data aktif. Publish Firestore Rules terbaru agar delete permanen dapat digunakan.`);
    if(state.currentView==='dashboard')renderDashboard();
    else if(state.currentView==='search')renderSearchView();
    else if(state.currentView==='report')renderReportsView();
  }catch(err){console.error(err);showToast(firebaseError(err),'error');}
}

function renderSearchView() {
  const target=$('view-search');
  target.innerHTML=`<div class="grid" style="gap:16px"><div class="card card-pad"><div class="section-head"><div><div class="card-title">Cari SPB</div><div class="card-sub">Ketik kode SPB, No LRB, tujuan, barang, kategori, atau keterangan.</div></div><button id="searchReloadBtn" class="btn btn-secondary">Muat Ulang</button></div><div class="search-bar"><input id="searchInput" class="input" value="${escapeHtml(state.searchTerm)}" placeholder="Contoh: R26I0001 / Benang / PT XYZ / LRB-001"><button id="searchBtn" class="btn btn-primary">Cari</button></div><div id="searchMeta" class="small-help" style="margin-top:8px"></div></div><div class="card card-pad"><div id="searchResults"></div></div></div>`;
  $('searchBtn').addEventListener('click',runSearch); $('searchReloadBtn').addEventListener('click',async()=>{await loadRecentSPBs(2000);state.searchLoaded=true;runSearch();}); $('searchInput').addEventListener('input',()=>{state.searchTerm=$('searchInput').value;runSearch();});
  if(!state.searchLoaded){loadRecentSPBs(2000).then(()=>{state.searchLoaded=true;runSearch();}).catch(err=>{console.error(err);$('searchResults').innerHTML='<div class="empty">Gagal memuat data.</div>';});} else runSearch();
}
function runSearch() {
  const term=normalized(state.searchTerm||$('searchInput')?.value||''); const rows=state.spbs.filter(r=>{if(!term)return true;const blob=[r.spbCode,r.noLrb,r.tanggal,r.type,r.returCategory,r.toParty,r.note,r.createdByName,...(r.items||[]).flatMap(x=>[x.kodeBarang,x.namaBarang,x.keterangan,x.noPo,...(Array.isArray(x.quantities)?x.quantities.flatMap(q=>[q.qty,q.satuan]):[])])].map(normalized).join(' ');return blob.includes(term);});
  $('searchMeta').textContent=`${rows.length} hasil ditemukan dari ${state.spbs.length} data yang dimuat.`;
  $('searchResults').innerHTML=renderSpbTable(rows.slice(0,500),state.role==='admin',true,true); bindSpbTableActions($('searchResults'));
}

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let xlsxLoaderPromise = null;
async function ensureXlsxReady(){
  if(window.XLSX) return window.XLSX;
  if(xlsxLoaderPromise) return xlsxLoaderPromise;
  xlsxLoaderPromise = new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=XLSX_CDN; s.async=true;
    s.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('Library Excel tidak berhasil dimuat.'));
    s.onerror=()=>reject(new Error('Library Excel tidak dapat dimuat. Periksa koneksi internet.'));
    document.head.appendChild(s);
  });
  return xlsxLoaderPromise;
}
function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadWorkbook(workbook,filename,XLSX){
  const bytes=XLSX.write(workbook,{bookType:'xlsx',type:'array'});
  downloadBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename);
}
function normalizedHeader(v){
  return String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
}
function findColumn(rowMap, aliases){
  for(const a of aliases){const key=normalizedHeader(a);if(key in rowMap)return rowMap[key];}
  return '';
}
function parseFlexibleNumber(v){
  if(v===null||v===undefined||v==='')return null;
  if(typeof v==='number' && Number.isFinite(v))return v;
  let s=String(v).trim().replace(/\s+/g,'');
  if(!s)return null;
  s=s.replace(/[^0-9,.-]/g,'');
  if(!s)return null;
  const hasDot=s.includes('.'), hasComma=s.includes(',');
  if(hasDot&&hasComma){
    if(s.lastIndexOf(',')>s.lastIndexOf('.')) s=s.replace(/\./g,'').replace(',','.'); else s=s.replace(/,/g,'');
  }else if(hasComma){
    const parts=s.split(',');
    if(parts.length===2 && parts[1].length<=3) s=parts[0].replace(/\./g,'')+'.'+parts[1]; else s=s.replace(/,/g,'');
  }else if(hasDot){
    const parts=s.split('.');
    if(parts.length===2 && parts[1].length===3 && parts[0].length>=1) s=parts[0]+parts[1];
  }
  const n=Number(s); return Number.isFinite(n)?n:null;
}
function excelDateToISO(v,XLSX){
  if(v instanceof Date && !Number.isNaN(v.getTime())){
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  }
  if(typeof v==='number' && Number.isFinite(v) && XLSX?.SSF?.parse_date_code){
    const p=XLSX.SSF.parse_date_code(v);
    if(p && p.y){return `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;}
  }
  const s=String(v??'').trim(); if(!s)return '';
  let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const d=new Date(s); if(!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return '';
}
function parseQuantityString(value){
  const s=String(value??'').trim(); if(!s)return [];
  const parts=s.split(/\||\r?\n|;/).map(x=>x.trim()).filter(Boolean);
  const out=[];
  for(const part of parts){
    const m=part.match(/^([0-9][0-9.,]*)\s+(.+)$/);
    if(!m)continue;
    const qty=parseFlexibleNumber(m[1]); const satuan=unitLabel(m[2]);
    if(qty!==null && qty>0 && satuan) out.push({qty,satuan});
  }
  return out;
}
function extractImportedQuantities(rowMap){
  const direct=[];
  const qText=findColumn(rowMap,['Qty/Satuan','Qty Satuan','Quantity Unit','Quantities']);
  if(qText) direct.push(...parseQuantityString(qText));
  for(let i=1;i<=6;i++){
    const q=findColumn(rowMap,[`Qty ${i}`,`Qty${i}`,`Quantity ${i}`,`Quantity${i}`]);
    const u=findColumn(rowMap,[`Satuan ${i}`,`Satuan${i}`,`Unit ${i}`,`Unit${i}`]);
    const qty=parseFlexibleNumber(q);
    if(qty!==null && qty>0 && u) direct.push({qty,satuan:unitLabel(u)});
  }
  const seen=new Set();
  return direct.filter(x=>x.qty>0&&x.satuan&&!seen.has(`${x.qty}|${x.satuan}`)&&(seen.add(`${x.qty}|${x.satuan}`),true));
}
function getTypeFromCode(code){
  const p=parseSpbCodeParts(code); if(!p)return '';
  return p.prefix==='JS'?'Jasa':p.prefix==='R'?'Retur':'Umum';
}
async function readExcelRows(file){
  const XLSX=await ensureXlsxReady();
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array',cellDates:true});
  const preferred=wb.SheetNames.find(n=>normalizedHeader(n)==='spbdetail')||wb.SheetNames[0];
  const ws=wb.Sheets[preferred];
  if(!ws)throw new Error('Sheet Excel tidak ditemukan.');
  const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});
  return {XLSX,rows,sheetName:preferred};
}
function buildImportGroups(rows,XLSX){
  const errors=[]; const groups=new Map();
  rows.forEach((raw,index)=>{
    const rowNo=index+2; const rowMap={}; Object.entries(raw).forEach(([k,v])=>rowMap[normalizedHeader(k)]=v);
    const noSpb=String(findColumn(rowMap,['No. SPB','No SPB','SPB','Kode SPB','SPB Code'])).trim().toUpperCase();
    if(!noSpb){errors.push(`Baris ${rowNo}: No. SPB wajib diisi.`);return;}
    const parts=parseSpbCodeParts(noSpb); if(!parts){errors.push(`Baris ${rowNo}: No. SPB "${noSpb}" tidak sesuai format JS26A0001/R26I0001/U26A0001.`);return;}
    const tanggal=excelDateToISO(findColumn(rowMap,['Tanggal','Tanggal SPB','Date']),XLSX); if(!tanggal){errors.push(`Baris ${rowNo}: Tanggal tidak valid.`);return;}
    const derivedType=getTypeFromCode(noSpb); const type=String(findColumn(rowMap,['Jenis SPB','Jenis','Type'])||derivedType).trim()||derivedType;
    if(!['Jasa','Retur','Umum'].includes(type)){errors.push(`Baris ${rowNo}: Jenis SPB harus Jasa, Retur, atau Umum.`);return;}
    if(getTypeFromCode(noSpb)!==type){errors.push(`Baris ${rowNo}: Jenis SPB tidak cocok dengan prefix No. SPB ${noSpb}.`);return;}
    let category=String(findColumn(rowMap,['Kategori Retur','Kategori','Retur Category'])).trim();
    if(type==='Retur' && !RETUR_CATEGORIES.includes(category)){errors.push(`Baris ${rowNo}: Kategori Retur wajib salah satu dari 5 kategori yang tersedia.`);return;}
    if(type!=='Retur')category=null;
    const to1=String(findColumn(rowMap,['Kepada — Baris 1','Kepada Baris 1','Kepada','Tujuan'])).trim();
    const to2=String(findColumn(rowMap,['Kepada — Baris 2','Kepada Baris 2','Kota','Kota Tujuan'])).trim();
    if(!to1){errors.push(`Baris ${rowNo}: Kepada Baris 1 wajib diisi.`);return;}
    const noLrb=String(findColumn(rowMap,['No. LRB','No LRB','LRB'])).trim();
    const note=String(findColumn(rowMap,['Note','Catatan'])).trim();
    const importedPoMode=String(findColumn(rowMap,['PO Mode','POMode','Mode PO'])).trim().toLowerCase();
    const importedSharedPo=String(findColumn(rowMap,['Shared No. PO','Shared No PO','PO Utama'])).trim();
    const noPo=String(findColumn(rowMap,['No. PO','No PO','PO'])).trim();
    const kodeBarang=String(findColumn(rowMap,['Kode Barang','Kode','Item Code'])).trim();
    let namaBarang=String(findColumn(rowMap,['Nama Barang','Nama','Item Name'])).trim();
    const master=getSelectedMaster(kodeBarang); if(!namaBarang&&master)namaBarang=master.namaBarang||'';
    if(!namaBarang){errors.push(`Baris ${rowNo}: Nama Barang wajib diisi atau harus ditemukan di Master Barang.`);return;}
    const keterangan=String(findColumn(rowMap,['Keterangan','Description'])).trim();
    const qtyOrder=parseFlexibleNumber(findColumn(rowMap,['Qty Order','QTY Order','Order Qty']));
    const qtyRetur=parseFlexibleNumber(findColumn(rowMap,['Qty Retur','QTY Retur','Return Qty']));
    const explicitPct=parseFlexibleNumber(findColumn(rowMap,['Presentase','Persentase','%','Percentage']));
    const quantities=extractImportedQuantities(rowMap);
    if((qtyRetur||0)>0&&(qtyOrder===null||qtyOrder<=0)){errors.push(`Baris ${rowNo}: Qty Order wajib diisi jika Qty Retur > 0.`);return;}
    if(!(quantities.length || (qtyOrder||0)>0 || (qtyRetur||0)>0)){errors.push(`Baris ${rowNo}: Minimal satu Qty/Satuan, Qty Order, atau Qty Retur harus diisi.`);return;}
    const item={no:1,kodeBarang,namaBarang,noPo,keterangan,qtyOrder:qtyOrder??'',qtyRetur:qtyRetur??'',quantities,persen:calculatePresentase(qtyOrder??'',qtyRetur??'',explicitPct??'')};
    if(!groups.has(noSpb))groups.set(noSpb,{spbCode:noSpb,tanggal,type,returCategory:category,noLrb,toPartyLine1:to1,toPartyLine2:to2,note,createdByName:String(findColumn(rowMap,['Dibuat Oleh','Dibuat','Created By'])).trim(),items:[],poMode:'single',sharedNoPo:''});
    const g=groups.get(noSpb);
    if(importedPoMode==='peritem'||importedPoMode==='per-item') g.poMode='perItem';
    if(importedPoMode==='single' && importedSharedPo){g.poMode='single';g.sharedNoPo=importedSharedPo;}
    const metadata=[['tanggal',tanggal],['type',type],['returCategory',category||''],['noLrb',noLrb],['toPartyLine1',to1],['toPartyLine2',to2],['note',note]];
    for(const [k,v] of metadata){if(String(g[k]??'')!==String(v??'')){errors.push(`Baris ${rowNo}: metadata No. SPB ${noSpb} tidak konsisten pada ${k}.`);return;}}
    item.no=g.items.length+1;
    const existingPo=g.items.map(x=>String(x.noPo||'').trim()).filter(Boolean);
    if(existingPo.length && existingPo.some(v=>v!==noPo)){g.poMode='perItem';g.sharedNoPo='';}
    else if(!existingPo.length && noPo) g.sharedNoPo=noPo;
    g.items.push(item);
  });
  return {groups:[...groups.values()],errors};
}
async function validateImportAgainstFirestore(groups){
  const snap=await getDocs(collection(db,'spb')); const existing=new Map(snap.docs.map(d=>[String(d.data()?.spbCode||'').toUpperCase(),d.id]));
  const duplicate=groups.filter(g=>existing.has(g.spbCode.toUpperCase())).map(g=>g.spbCode);
  if(duplicate.length)throw new Error(`Import dibatalkan. No. SPB sudah ada: ${duplicate.slice(0,20).join(', ')}${duplicate.length>20?'...':''}`);
}
function importedCounterMax(groups){
  const max=new Map();
  groups.forEach(g=>{const p=parseSpbCodeParts(g.spbCode); if(!p)return; const key=`${p.prefix}_${2000+Number(p.year2)}`; const seq=Number(p.sequence); max.set(key,Math.max(max.get(key)||0,seq));});
  return max;
}
async function commitImportedSpb(groups){
  await validateImportAgainstFirestore(groups);
  const chunkSize=350; const docs=groups.map(g=>{const p=parseSpbCodeParts(g.spbCode);return {...g,p};});
  for(let start=0;start<docs.length;start+=chunkSize){
    const batch=writeBatch(db);
    docs.slice(start,start+chunkSize).forEach(g=>{
      const spbRef=doc(collection(db,'spb'));
      const yearCodeId=state.yearCodes.find(x=>Number(x.year)===(2000+Number(g.p.year2))&&String(x.code||'').toUpperCase()===g.p.code)?.id||null;
      const importPoMode=g.poMode==='perItem'?'perItem':'single';
      const importSharedNoPo=importPoMode==='single'?(g.sharedNoPo||''):'';
      const importItems=importPoMode==='single'&&importSharedNoPo?g.items.map(x=>({...x,noPo:importSharedNoPo})):g.items;
      batch.set(spbRef,{spbCode:g.spbCode,noLrb:g.noLrb||'',tanggal:g.tanggal,type:g.type,returCategory:g.returCategory||null,fromCompany:COMPANY_NAME,toParty:[g.toPartyLine1,g.toPartyLine2].filter(Boolean).join('\n'),toPartyLine1:g.toPartyLine1,toPartyLine2:g.toPartyLine2,toPartyType:'Manual',toPartyId:null,note:g.note||'',items:importItems,poMode:importPoMode,sharedNoPo:importSharedNoPo,status:'active',createdByUid:state.user.uid,createdByName:g.createdByName||state.profile?.name||state.user.email||'Admin',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),signatureVersion:'',signatureSnapshotData:'',yearCodeId,yearCode:g.p.code});
    });
    await batch.commit();
  }
  const max=importedCounterMax(groups);
  for(const [counterId,value] of max.entries()){
    const ref=doc(db,'counters',counterId);
    await runTransaction(db,async tx=>{const snap=await tx.get(ref);const cur=snap.exists()?Number(snap.data().value||0):0;if(value>cur)tx.set(ref,{prefix:counterId.split('_')[0],year:Number(counterId.split('_')[1]),value,updatedAt:serverTimestamp()},{merge:true});});
  }
}
function showImportConfirmation(groups){
  state.pendingImport=groups;
  const itemCount=groups.reduce((n,g)=>n+g.items.length,0);
  openModal(`<div class="modal-head"><div><div class="card-title">Konfirmasi Import SPB</div><div class="card-sub">Data akan ditambahkan ke Firestore. No. SPB yang sudah ada akan ditolak agar tidak terjadi duplikasi.</div></div><button type="button" class="btn btn-soft" data-close-modal>Tutup</button></div><div class="modal-body"><div class="info-grid"><div class="card card-pad"><div class="small-help">Dokumen</div><strong>${groups.length}</strong></div><div class="card card-pad"><div class="small-help">Baris Barang</div><strong>${itemCount}</strong></div><div class="card card-pad"><div class="small-help">Catatan</div><strong>Tidak mengimpor TTD historis</strong></div></div><div class="alert alert-warning" style="margin-top:14px">Gunakan template resmi agar kolom No. SPB, Tanggal, Jenis, Kategori Retur, Kepada, barang, dan Qty terbaca dengan benar.</div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirmImportBtn" class="btn btn-primary">Import ${groups.length} SPB</button></div>`);
  $('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',()=>{state.pendingImport=null;closeModal();}));
  $('confirmImportBtn').addEventListener('click',async()=>{const btn=$('confirmImportBtn');setBusy(btn,true,'Mengimpor...');try{await commitImportedSpb(state.pendingImport||[]);const count=state.pendingImport?.length||0;state.pendingImport=null;closeModal();await preloadReferenceData();await loadRecentSPBs(5000);showToast(`Import berhasil: ${count} SPB.`);renderReportsView();}catch(err){console.error(err);showToast(firebaseError(err),'error');}finally{setBusy(btn,false);}});
}
async function importSpbExcelFile(file){
  try{const {XLSX,rows}=await readExcelRows(file); if(!rows.length)throw new Error('File Excel tidak berisi data.'); const {groups,errors}=buildImportGroups(rows,XLSX); if(errors.length){openModal(`<div class="modal-head"><div><div class="card-title">Import ditolak</div><div class="card-sub">Perbaiki data Excel terlebih dahulu.</div></div><button type="button" class="btn btn-soft" data-close-modal>Tutup</button></div><div class="modal-body"><div class="alert alert-danger">Ditemukan ${errors.length} masalah.</div><div style="max-height:320px;overflow:auto;margin-top:10px"><ol style="padding-left:22px">${errors.slice(0,60).map(e=>`<li style="margin:5px 0">${escapeHtml(e)}</li>`).join('')}</ol>${errors.length>60?`<div class="small-help">Masih ada ${errors.length-60} masalah lainnya.</div>`:''}</div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Tutup</button></div>`);$('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));return;} if(!groups.length)throw new Error('Tidak ada data SPB yang valid.'); showImportConfirmation(groups);}catch(err){console.error(err);showToast(firebaseError(err),'error');}
}
function buildSpbImportTemplate(XLSX){
  const headers=['No. SPB','No. LRB','Tanggal','Jenis SPB','Kategori Retur','Kepada — Baris 1','Kepada — Baris 2','Note','PO Mode','Shared No. PO','No. PO','Kode Barang','Nama Barang','Keterangan','Qty Order','Qty Retur','Presentase','Qty 1','Satuan 1','Qty 2','Satuan 2','Qty 3','Satuan 3','Qty/Satuan'];
  const sample=['R26I0001','LRB-001','27/09/2026','Retur','Retur Benang','PT. CONTOH','TANGERANG','Contoh data historis','single','PO001','PO001','BEN001','BENANG CONTOH','Retur produksi',1000,50,'',50,'KG',12,'MTR','','','','50 KG | 12 MTR'];
  const ws=XLSX.utils.aoa_to_sheet([headers,sample]); ws['!cols']=headers.map((h,i)=>({wch:[12,14,12,12,20,22,18,30,15,18,28,30,12,12,12,10,12,10,12,10,12,25][i]||16}));
  const info=[['PETUNJUK IMPORT SPB'],['Satu baris Excel = satu barang. Baris dengan No. SPB yang sama digabung menjadi satu dokumen.'],['Format No. SPB: JS26A0001 / R26I0001 / U26I0001.'],['Retur wajib menggunakan salah satu: Retur Jasa, Retur Benang, Retur Longchain, Retur Kain Pita, Retur Slider.'],['Gunakan Qty 1/Satuan 1, Qty 2/Satuan 2, Qty 3/Satuan 3, dst. atau kolom Qty/Satuan seperti "50 KG | 12 MTR".'],['No. SPB yang sudah ada tidak boleh diimpor ulang.'],['TTD historis tidak diimpor karena TTD adalah snapshot dokumen dan harus tetap berasal dari data asli.']];
  const wi=XLSX.utils.aoa_to_sheet(info); wi['!cols']=[{wch:90}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'SPB_DETAIL'); XLSX.utils.book_append_sheet(wb,wi,'PETUNJUK'); return wb;
}
async function downloadSpbImportTemplate(){const XLSX=await ensureXlsxReady();downloadWorkbook(buildSpbImportTemplate(XLSX),`Template-Import-SPB-${todayISO()}.xlsx`,XLSX);}
async function exportSpbDataExcel(rows=state.reportRows){
  const XLSX=await ensureXlsxReady();
  if(!rows.length)return showToast('Tidak ada data untuk diekspor.','warning');
  const data=[];
  rows.forEach(r=>{
    const to=spbToLineValues(r); const items=Array.isArray(r.items)&&r.items.length?r.items:[{}];
    items.forEach(x=>{
      const qs=normalizedQuantityLines(x);
      const row={
        'No. SPB':r.spbCode||'', 'No. LRB':r.noLrb||'', Tanggal:r.tanggal||'', 'Jenis SPB':r.type||'', 'Kategori Retur':r.returCategory||'',
        'Kepada — Baris 1':to.line1||'', 'Kepada — Baris 2':to.line2||'', Note:r.note||'', 'PO Mode':r.poMode||'single', 'Shared No. PO':r.sharedNoPo||'', 'No. PO':x.noPo||x.noPO||'',
        'Kode Barang':x.kodeBarang||'', 'Nama Barang':x.namaBarang||'', Keterangan:x.keterangan||'', 'Qty Order':x.qtyOrder!==''&&x.qtyOrder!==undefined?safeNum(x.qtyOrder):'', 'Qty Retur':x.qtyRetur!==''&&x.qtyRetur!==undefined?safeNum(x.qtyRetur):'',
        Presentase:x.persen!==''&&x.persen!==undefined?safeNum(x.persen):'', 'Dibuat Oleh':r.createdByName||'', 'Qty/Satuan':qs.map(q=>`${fmtNum(q.qty)}${q.satuan?` ${q.satuan}`:''}`).join(' | ')
      };
      qs.slice(0,6).forEach((q,i)=>{row[`Qty ${i+1}`]=safeNum(q.qty);row[`Satuan ${i+1}`]=unitLabel(q.satuan);});
      data.push(row);
    });
  });
  const ws=XLSX.utils.json_to_sheet(data);
  ws['!cols']=[{wch:14},{wch:14},{wch:12},{wch:12},{wch:20},{wch:26},{wch:18},{wch:34},{wch:16},{wch:18},{wch:36},{wch:34},{wch:12},{wch:12},{wch:12},{wch:18},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:28},{wch:12},{wch:12},{wch:12},{wch:12}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'SPB_DATA');
  const info=XLSX.utils.aoa_to_sheet([['KETERANGAN'],['File ini dapat digunakan sebagai backup/ekspor data SPB dan diimpor kembali ke aplikasi.'],['Satu baris = satu barang. Beberapa baris dengan No. SPB yang sama akan digabung menjadi satu dokumen.'],['TTD historis tidak ikut diekspor/import karena TTD adalah snapshot dokumen.']]); info['!cols']=[{wch:100}]; XLSX.utils.book_append_sheet(wb,info,'PETUNJUK');
  downloadWorkbook(wb,`Data-SPB-${todayISO()}.xlsx`,XLSX);
}

async function exportReportExcel(rows=state.reportRows){
  const XLSX=await ensureXlsxReady(); const details=reportDetailRows(rows); if(!details.length)return showToast('Tidak ada data untuk diekspor.','warning');
  const data=details.map((r,i)=>({No:i+1,'No. SPB':r.spbCode,Tanggal:formatDate(r.tanggal),'Nama Barang':r.namaBarang,'PO Mode':(rows.find(x=>x.id===r.spbId)?.poMode)||'single','Shared No. PO':(rows.find(x=>x.id===r.spbId)?.sharedNoPo)||'','No. PO':r.noPo||'','Qty Order':r.qtyOrder!==''?safeNum(r.qtyOrder):'','Qty Retur':r.qtyRetur!==''?safeNum(r.qtyRetur):'',Presentase:r.persen!==''?safeNum(r.persen):'','Keterangan':r.keterangan,'No. LRB':r.noLrb||'',Sample:'',Kategori:r.returCategory||'',Jenis:r.type||'',Qty_Satuan:normalizedQuantityLines((rows.find(x=>x.id===r.spbId)?.items||[])[r.itemNo-1]||{}).map(q=>`${fmtNum(q.qty)}${q.satuan?` ${q.satuan}`:''}`).join(' | ')}));
  const ws=XLSX.utils.json_to_sheet(data); ws['!cols']=[{wch:6},{wch:14},{wch:12},{wch:34},{wch:16},{wch:14},{wch:14},{wch:12},{wch:34},{wch:14},{wch:10},{wch:18},{wch:12},{wch:24}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Laporan SPB');
  const filters=state.reportFilters; const info=XLSX.utils.aoa_to_sheet([['FILTER LAPORAN'],['Tanggal Mulai',filters.start||''],['Tanggal Akhir',filters.end||''],['Jenis',filters.type||''],['Kategori Retur',filters.category||''],['Kode SPB',filters.code||'']]); XLSX.utils.book_append_sheet(wb,info,'Filter');
  downloadWorkbook(wb,`Laporan-SPB-${todayISO()}.xlsx`,XLSX);
}
function buildMasterBarangRows(){return state.masterBarang.map((x,i)=>({No:i+1,'Kode Barang':x.kodeBarang||'','Nama Barang':x.namaBarang||'','Satuan':(x.unitModes||availableUnits()).map(unitLabel).join(', '),'Status':x.active!==false?'Aktif':'Nonaktif'}));}
async function exportMasterBarangExcel(){const XLSX=await ensureXlsxReady();const data=buildMasterBarangRows();if(!data.length)return showToast('Master Barang belum memiliki data.','warning');const ws=XLSX.utils.json_to_sheet(data);ws['!cols']=[{wch:7},{wch:20},{wch:36},{wch:32},{wch:12}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Master Barang');downloadWorkbook(wb,`Master-Barang-${todayISO()}.xlsx`,XLSX);}
function parseUnitList(v){return [...new Set(String(v??'').split(/[,;|]/).map(x=>unitLabel(x)).filter(Boolean))];}
async function importMasterBarangExcelFile(file){try{const {XLSX,rows}=await readExcelRows(file);if(!rows.length)throw new Error('File Excel Master Barang kosong.');const errors=[],prepared=[];for(let i=0;i<rows.length;i++){const row=rows[i], rowMap={};Object.entries(row).forEach(([k,v])=>rowMap[normalizedHeader(k)]=v);const kode=String(findColumn(rowMap,['Kode Barang','Kode','SKU'])).trim();const nama=String(findColumn(rowMap,['Nama Barang','Nama'])).trim();const units=parseUnitList(findColumn(rowMap,['Satuan','Unit','Satuan yang digunakan']));if(!kode)errors.push(`Baris ${i+2}: Kode Barang wajib diisi.`);if(!nama)errors.push(`Baris ${i+2}: Nama Barang wajib diisi.`);if(!units.length)errors.push(`Baris ${i+2}: Satuan wajib diisi.`);if(kode&&nama&&units.length)prepared.push({kode,nama,units});}if(errors.length){showToast(`Import Master Barang ditolak: ${errors[0]}`,'error');return;}const dupInFile=new Set();for(const x of prepared){const k=normalized(x.kode);if(dupInFile.has(k))return showToast(`Kode Barang duplikat di file: ${x.kode}`,'error');dupInFile.add(k);}const existing=new Map(state.masterBarang.map(x=>[normalized(x.kodeBarang),x]));for(const x of prepared){const old=existing.get(normalized(x.kode));const payload={kodeBarang:x.kode,namaBarang:x.nama,unitModes:x.units,active:true,updatedAt:serverTimestamp()};if(old)await updateDoc(doc(db,'masterBarang',old.id),payload);else await addDoc(collection(db,'masterBarang'),{...payload,createdAt:serverTimestamp()});}await loadMasterBarang();renderMasterBarangView();showToast(`Import Master Barang berhasil: ${prepared.length} baris.`);}catch(err){console.error(err);showToast(firebaseError(err),'error');}}
function buildMasterBarangTemplate(XLSX){const ws=XLSX.utils.aoa_to_sheet([['Kode Barang','Nama Barang','Satuan'],['BEN001','BENANG CONTOH','KG, MTR']]);ws['!cols']=[{wch:20},{wch:36},{wch:28}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Master Barang');return wb;}
async function downloadMasterBarangTemplate(){const XLSX=await ensureXlsxReady();downloadWorkbook(buildMasterBarangTemplate(XLSX),`Template-Master-Barang-${todayISO()}.xlsx`,XLSX);}

function renderReportsView() {
  const f=state.reportFilters;
  $('view-reports').innerHTML=`<div class="grid" style="gap:16px"><div class="card card-pad"><div class="section-head"><div><div class="card-title">Laporan SPB</div><div class="card-sub">Filter tanggal dan pisahkan Retur berdasarkan 5 kategori. Import/Export menggunakan Excel.</div></div><div class="section-actions"><button id="runReportBtn" class="btn btn-primary">Terapkan Filter</button><button id="printReportBtn" class="btn btn-secondary">Print Laporan</button><button id="printAllReturBtn" class="btn btn-soft">Print Semua Retur</button><button id="exportReportExcelBtn" class="btn btn-secondary">Export Laporan Excel</button><button id="exportSpbDataExcelBtn" class="btn btn-secondary">Export Data SPB</button><button id="templateSpbBtn" class="btn btn-soft">Template Import</button><button id="importSpbBtn" class="btn btn-soft">Import Excel</button><input id="spbImportFile" type="file" accept=".xlsx,.xls,.csv" hidden></div></div><div class="form-grid"><div class="field"><label>Tanggal Mulai</label><input id="reportStart" class="input" type="date" value="${f.start}"></div><div class="field"><label>Tanggal Akhir</label><input id="reportEnd" class="input" type="date" value="${f.end}"></div><div class="field"><label>Jenis</label><select id="reportType" class="select"><option value="all" ${f.type==='all'?'selected':''}>Semua</option><option value="Jasa" ${f.type==='Jasa'?'selected':''}>Jasa</option><option value="Retur" ${f.type==='Retur'?'selected':''}>Retur</option><option value="Umum" ${f.type==='Umum'?'selected':''}>Umum</option></select></div><div class="field"><label>Prefix</label><select id="reportPrefix" class="select"><option value="all" ${f.prefix==='all'?'selected':''}>Semua</option><option value="JS" ${f.prefix==='JS'?'selected':''}>JS</option><option value="R" ${f.prefix==='R'?'selected':''}>R</option><option value="U" ${f.prefix==='U'?'selected':''}>U</option></select></div></div><div class="form-grid" style="margin-top:14px"><div class="field"><label>Kategori Retur</label><select id="reportCategory" class="select"><option value="all">Semua Kategori</option>${RETUR_CATEGORIES.map(x=>`<option value="${escapeHtml(x)}" ${f.category===x?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></div><div class="field"><label>Kode SPB</label><input id="reportCode" class="input" value="${escapeHtml(f.code)}" placeholder="Contoh R26I0001"></div></div></div><div class="card card-pad"><div id="reportSummary" class="small-help">Belum dijalankan.</div><div id="reportResult" style="margin-top:10px"></div></div></div>`;
  $('reportType').addEventListener('change',()=>{$('reportCategory').disabled=$('reportType').value!=='Retur';if($('reportType').value!=='Retur')$('reportCategory').value='all';});
  $('runReportBtn').addEventListener('click',runReportFromUi); $('printReportBtn').addEventListener('click',()=>printReport(state.reportRows)); $('printAllReturBtn').addEventListener('click',printAllReturReport); $('exportReportExcelBtn').addEventListener('click',()=>exportReportExcel(state.reportRows)); $('exportSpbDataExcelBtn').addEventListener('click',()=>exportSpbDataExcel(state.reportRows)); $('templateSpbBtn').addEventListener('click',downloadSpbImportTemplate); $('importSpbBtn').addEventListener('click',()=>$('spbImportFile').click()); $('spbImportFile').addEventListener('change',e=>{const f=e.target.files?.[0];e.target.value='';if(f)importSpbExcelFile(f);}); $('reportCategory').disabled=$('reportType').value!=='Retur';
  runReportFromUi();
}
async function runReportFromUi() {
  state.reportFilters={start:$('reportStart').value,end:$('reportEnd').value,type:$('reportType').value,prefix:$('reportPrefix').value,category:$('reportCategory').value,code:$('reportCode').value.trim()};
  if(state.reportFilters.start && state.reportFilters.end && state.reportFilters.start>state.reportFilters.end){showToast('Tanggal mulai tidak boleh lebih besar dari tanggal akhir.','warning');return;}
  $('reportSummary').textContent='Memuat laporan...';
  try{
    state.reportRows=await loadReportRows(state.reportFilters);
    const detailCount=state.reportRows.reduce((n,r)=>n+(Array.isArray(r.items)?r.items.length:0),0);
    $('reportSummary').textContent=`${detailCount} baris detail dari ${state.reportRows.length} dokumen.`;
    $('reportResult').innerHTML=renderReportTable(state.reportRows);
  }catch(err){console.error(err);$('reportSummary').textContent='Gagal memuat laporan.';showToast(firebaseError(err),'error');}
}
function reportDetailRows(rows){
  const out=[];
  rows.forEach(r=>{
    const items=Array.isArray(r.items)&&r.items.length?r.items:[{no:1,kodeBarang:'',namaBarang:'',noPo:'',qtyOrder:'',qtyRetur:'',persen:'',keterangan:''}];
    items.forEach((x,idx)=>out.push({
      spbId:r.id,
      spbCode:r.spbCode||'',
      tanggal:r.tanggal||'',
      namaBarang:x.namaBarang||'',
      noPo:x.noPo||x.noPO||'',
      qtyOrder:x.qtyOrder??'',
      qtyRetur:x.qtyRetur??'',
      qtyPcs:x.qtyPcs??'',
      qtyKg:x.qtyKg??'',
      qtyRol:x.qtyRol??'',
      satuan:x.satuan||x.unit||'',
      persen:calculatePresentase(x.qtyOrder,x.qtyRetur,x.persen),
      keterangan:x.keterangan||'',
      noLrb:r.noLrb||'',
      returCategory:r.returCategory||'',
      type:r.type||'',
      itemNo:x.no||idx+1
    }));
  });
  return out;
}
function renderReportTable(rows) {
  const details=reportDetailRows(rows);
  if(!details.length)return '<div class="empty">Tidak ada data sesuai filter.</div>';
  return `<div class="table-wrap report-table-wrap"><table class="table report-screen-table"><thead><tr><th>No</th><th>No. SPB</th><th>Tanggal</th><th>Nama Barang</th><th>No. PO</th><th>Qty Order</th><th>Qty Retur</th><th>Presentase</th><th>Keterangan</th><th>No. LRB</th><th class="sample-header">Sample</th></tr></thead><tbody>${details.map((r,i)=>`<tr><td>${i+1}</td><td><strong>${escapeHtml(r.spbCode)}</strong></td><td>${formatDate(r.tanggal)}</td><td>${escapeHtml(r.namaBarang||'-')}</td><td>${escapeHtml(r.noPo||'-')}</td><td class="right">${r.qtyOrder!==''?fmtNum(r.qtyOrder):''}</td><td class="right">${r.qtyRetur!==''?fmtNum(r.qtyRetur):''}</td><td class="right">${r.persen!==''?`${fmtNum(r.persen)}%`:''}</td><td>${escapeHtml(r.keterangan||'')}</td><td>${escapeHtml(r.noLrb||'-')}</td><td class="sample-cell" aria-label="Tempat sampel kosong"></td></tr>`).join('')}</tbody></table></div>`;
}

async function printAllReturReport() {
  if(!state.reportFilters.start||!state.reportFilters.end){showToast('Isi periode laporan terlebih dahulu.','warning');return;}
  try{
    const rows=await loadReportRows({...state.reportFilters,type:'Retur',prefix:'all',category:'all',code:''});
    if(!rows.length)return showToast('Tidak ada data Retur pada periode tersebut.','warning');
    printReport(rows,true);
  }catch(err){console.error(err);showToast(firebaseError(err),'error');}
}
function groupBy(rows,keyFn){return rows.reduce((acc,row)=>{const key=keyFn(row);(acc[key] ||= []).push(row);return acc;},{});}
function reportHeaderTitle(allRetur=false){
  const f=state.reportFilters;
  if(allRetur)return 'SEMUA RETUR';
  if(f.type==='Retur'&&f.category!=='all')return String(f.category).toUpperCase();
  if(f.type!=='all')return String(f.type).toUpperCase();
  return 'SEMUA SPB';
}
function renderReportPrintGroup(name,details,startNo=1){
  const rows=details.map((r,i)=>`<tr><td class="center">${i+1}</td><td>${escapeHtml(r.spbCode)}</td><td>${formatDate(r.tanggal)}</td><td>${escapeHtml(r.namaBarang||'-')}</td><td>${escapeHtml(r.noPo||'-')}</td><td class="right">${r.qtyOrder!==''?fmtNum(r.qtyOrder):''}</td><td class="right">${r.qtyRetur!==''?fmtNum(r.qtyRetur):''}</td><td class="right">${r.persen!==''?`${fmtNum(r.persen)}%`:''}</td><td>${escapeHtml(r.keterangan||'')}</td><td>${escapeHtml(r.noLrb||'-')}</td><td class="sample-cell"></td></tr>`).join('');
  return `<div class="report-group"><div class="report-group-title">${escapeHtml(name)}</div><table class="report-table"><colgroup><col style="width:8mm"><col style="width:25mm"><col style="width:22mm"><col style="width:37mm"><col style="width:22mm"><col style="width:20mm"><col style="width:20mm"><col style="width:18mm"><col style="width:32mm"><col style="width:23mm"><col style="width:50mm"></colgroup><thead><tr><th>No</th><th>No. SPB</th><th>Tanggal</th><th>Nama Barang</th><th>No. PO</th><th>Qty Order</th><th>Qty Retur</th><th>Presentase</th><th>Keterangan</th><th>No. LRB</th><th class="sample-header">Sample</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function printReport(rows,allRetur=false) {
  const details=reportDetailRows(rows);
  if(!details.length)return showToast('Tidak ada data untuk dicetak.','warning');
  const f=state.reportFilters;
  const groups=allRetur?groupBy(details,r=>r.returCategory||'Retur Lainnya'):{[reportHeaderTitle(false)]:details};
  const pages=[]; const groupEntries=Object.entries(groups);
  groupEntries.forEach(([name,groupRows])=>{
    for(let i=0;i<groupRows.length;i+=5) pages.push({name,rows:groupRows.slice(i,i+5)});
  });
  const reportPrintedAt=formatPrintTimestamp();
  const title=reportHeaderTitle(allRetur);
  const period=`Periode: ${formatDate(f.start)} s/d ${formatDate(f.end)}`;
  const body=pages.map((page,i)=>`<div class="report-page"><div class="report-header"><div class="company">${COMPANY_NAME}</div><div class="title">LAPORAN SURAT PEMINDAHAN BARANG</div><div class="meta">${escapeHtml(title)} • ${escapeHtml(period)}${allRetur?' • Setiap kategori dipisahkan':''}</div></div>${renderReportPrintGroup(page.name,page.rows)}<div class="report-footer"><span class="print-time">Dicetak: ${escapeHtml(reportPrintedAt)}</span><span>Lembar ${i+1} dari ${pages.length}</span></div></div>`).join('');
  printHtml(body,'landscape','report');
}

function paginateItems(items, maxPerPage=6) {
  const source=Array.isArray(items)?items:[];
  const pages=[];
  for(let i=0;i<source.length;i+=maxPerPage){
    pages.push(source.slice(i,i+maxPerPage));
  }
  return pages.length?pages:[[]];
}
function padPrintItemSlots(items, slotCount=6) {
  const source=Array.isArray(items)?items.slice(0,slotCount):[];
  while(source.length<slotCount) source.push(null);
  return source;
}
function hasExplicitSatuan(items){
  return (items||[]).some(x=>String(x.satuan||x.unit||'').trim()!=='');
}
function normalizedQuantityLines(item={}) {
  const qs=Array.isArray(item.quantities)?item.quantities.map(q=>({qty:q?.qty??'',satuan:unitLabel(q?.satuan||q?.unit||'')})).filter(q=>safeNum(q.qty)>0):[];
  if(qs.length)return qs;
  const legacy=[];
  if(safeNum(item.qtyPcs)>0)legacy.push({qty:item.qtyPcs,satuan:'PCS'});
  if(safeNum(item.qtyKg)>0)legacy.push({qty:item.qtyKg,satuan:'KG'});
  if(safeNum(item.qtyRol)>0)legacy.push({qty:item.qtyRol,satuan:'ROL'});
  if(!legacy.length && item.qty!==undefined && item.qty!==null && String(item.qty).trim()!=='') legacy.push({qty:item.qty,satuan:unitLabel(item.satuan||item.unit)});
  if(!legacy.length && safeNum(item.qtyRetur)>0)legacy.push({qty:item.qtyRetur,satuan:unitLabel(item.satuan||item.unit)});
  if(!legacy.length && safeNum(item.qtyOrder)>0)legacy.push({qty:item.qtyOrder,satuan:unitLabel(item.satuan||item.unit)});
  return legacy;
}
function printColumnsForItems(items){
  const hasQty=(items||[]).some(x=>normalizedQuantityLines(x).length>0);
  const hasPct=(items||[]).some(x=>safeNum(x.persen)>0);
  const cols=[];
  if(hasQty||!hasPct)cols.push(['__qty__','Qty']);
  if(hasPct)cols.push(['persen','%']);
  return cols;
}
function printQtyLines(item){
  const lines=normalizedQuantityLines(item);
  if(!lines.length)return '';
  return `<div class="print-qty-stack">${lines.map(q=>`<div class="print-qty-line"><span class="print-qty-number">${escapeHtml(fmtNum(q.qty))}</span><span class="print-qty-unit">${escapeHtml(q.satuan||'')}</span></div>`).join('')}</div>`;
}
function printQtyValue(item,field){
  if(field==='__qty__')return printQtyLines(item);
  if(field==='persen')return safeNum(item.persen)>0?`${fmtNum(item.persen)}%`:'';
  return '';
}
function printQtyCells(item,columns){return columns.map(([field])=>`<td class="right">${printQtyValue(item,field)}</td>`).join('');}
function printQtyHeaders(columns){return columns.map(([,label])=>`<th class="numeric">${escapeHtml(label)}</th>`).join('');}
function multilineHtml(value){return escapeHtml(String(value??'')).replace(/\r?\n/g,'<br>');}
function printKepada(item){const to=spbToLineValues(item);return `${escapeHtml(to.line1||'-')}${to.line2?`<br>${escapeHtml(to.line2)}`:''}`;}
function printNoPo(item){
  const pos=[...new Set((item.items||[]).map(x=>String(x.noPo||x.noPO||'').trim()).filter(Boolean))];
  if(!pos.length)return '-';
  return pos.map(escapeHtml).join('<br>');
}
async function requestProtectedSpbPrintById(id){
  const item=state.spbs.find(x=>x.id===id);
  if(!item){showToast('SPB tidak ditemukan.','error');return;}
  return requestProtectedSpbPrint(item);
}

async function verifyAutomaticSignatureAccess(item, onVerified){
  const signatureData=item?.signatureSnapshotData;
  if(!signatureData){
    return onVerified({signatureData:null,verified:false});
  }

  const isAdmin=state.role==='admin' && state.user && !state.user.isAnonymous;
  const ownerUid=item.signatureOwnerUid||item.createdByUid||'';
  const isOwner=Boolean(isAdmin && ownerUid && ownerUid===state.user.uid);
  const ownerName=item.signatureOwnerName||item.createdByName||'Admin';

  openModal(`
    <div class="modal-head">
      <div><div class="card-title">Konfirmasi Cetak SPB</div><div class="small-help">TTD otomatis hanya digunakan setelah verifikasi password Admin. Tanpa password, dokumen tetap bisa dicetak tanpa menampilkan TTD otomatis.</div></div>
      <button type="button" class="btn btn-soft" data-close-modal>Tutup</button>
    </div>
    <div class="modal-body" style="display:grid;gap:14px">
      <div class="alert alert-info">TTD otomatis terdaftar untuk Admin: <strong>${escapeHtml(ownerName)}</strong></div>
      <button id="printWithoutSignatureBtn" type="button" class="btn btn-secondary">Print Tanpa TTD</button>
      ${isOwner?`<form id="ttdConfirmForm" style="display:grid;gap:12px;border-top:1px solid var(--line);padding-top:14px">
        <div class="field"><label for="ttdConfirmPassword">Password Admin untuk TTD Otomatis *</label><input id="ttdConfirmPassword" type="password" class="input" autocomplete="current-password" required></div>
        <button id="ttdConfirmBtn" class="btn btn-primary" type="submit">Gunakan TTD & Print</button>
      </form>`:`<div class="small-help">Akun yang sedang login bukan pemilik TTD ini. Untuk keamanan, hanya opsi Print Tanpa TTD yang tersedia.</div>`}
    </div>`);
  $('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));
  $('printWithoutSignatureBtn').addEventListener('click',async()=>{closeModal();await onVerified({signatureData:null,verified:false});});

  if(isOwner){
    const form=$('ttdConfirmForm');
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const password=$('ttdConfirmPassword').value;
      if(!password){showToast('Password Admin wajib diisi untuk menggunakan TTD otomatis.','warning');return;}
      const btn=$('ttdConfirmBtn');
      setBusy(btn,true,'Memverifikasi...');
      try{
        const email=state.user?.email;
        if(!email) throw Object.assign(new Error('Akun Admin tidak memiliki email untuk verifikasi password.'),{code:'auth/invalid-credential'});
        const credential=EmailAuthProvider.credential(email,password);
        await reauthenticateWithCredential(state.user,credential);
        closeModal();
        await onVerified({signatureData,verified:true});
      }catch(err){
        console.error(err);
        showToast(err?.code==='auth/invalid-credential' || err?.code==='auth/wrong-password' ? 'Password Admin salah.' : firebaseError(err),'error');
      }finally{
        setBusy(btn,false);
      }
    });
  }
}

async function requestProtectedSpbPrint(item){
  if(!item)return;
  if(item.signatureSnapshotData){
    return verifyAutomaticSignatureAccess(item, async({signatureData})=>printSpb(item,{signatureData}));
  }
  return printSpb(item,{signatureData:null});
}

function printSpbById(id){return requestProtectedSpbPrintById(id);}
function printSpb(item,{signatureData=null}={}) {
  if(!item)return;
  const pages=paginateItems(item.items||[],6); const total=pages.length; const columns=printColumnsForItems(item.items||[]); let html='';
  pages.forEach((pageItems,index)=>{
    const continuation=index>0; const isLast=index===total-1; const printTimestamp=formatPrintTimestamp();
    const printSlots=padPrintItemSlots(pageItems,6);
    const header=continuation
      ? `<div class="print-info-row print-info-row-continuation"><div class="print-to"><div class="print-to-label">Kepada</div><div class="print-to-value">${printKepada(item)}</div></div><div class="print-meta-right"><div><b>No LRB</b><span>:</span><span>${escapeHtml(item.noLrb||'-')}</span></div><div><b>No SPB</b><span>:</span><span>${escapeHtml(item.spbCode)}</span></div><div><b>Tanggal</b><span>:</span><span>${formatDate(item.tanggal)}</span></div><div><b>Kategori</b><span>:</span><span>${escapeHtml(item.returCategory||'-')}</span></div><div><b>No PO</b><span>:</span><span>${printNoPo(item)}</span></div></div></div>`
      : `<div class="print-head"><div class="print-company">${COMPANY_NAME}</div><div class="print-title">SURAT PEMINDAHAN BARANG</div></div><div class="print-info-row"><div class="print-to"><div class="print-to-label">Kepada</div><div class="print-to-value">${printKepada(item)}</div></div><div class="print-meta-right"><div><b>No LRB</b><span>:</span><span>${escapeHtml(item.noLrb||'-')}</span></div><div><b>No SPB</b><span>:</span><span>${escapeHtml(item.spbCode)}</span></div><div><b>Tanggal</b><span>:</span><span>${formatDate(item.tanggal)}</span></div><div><b>Kategori</b><span>:</span><span>${escapeHtml(item.returCategory||'-')}</span></div><div><b>No PO</b><span>:</span><span>${printNoPo(item)}</span></div></div></div>`;
    const itemRows=printSlots.map(x=>x
      ? `<tr class="item-row"><td class="center">${escapeHtml(x.no)}</td><td><div class="print-item-text">${escapeHtml(x.namaBarang||'')}</div></td><td><div class="print-item-text">${escapeHtml(x.keterangan||'')}</div></td>${printQtyCells(x,columns)}</tr>`
      : `<tr class="item-row empty-item-row"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>${columns.map(()=>'<td>&nbsp;</td>').join('')}</tr>`
    ).join('');
    const noteRow=isLast?`<tr class="print-note-spacer-row"><td colspan="${3+columns.length}">&nbsp;</td></tr><tr class="print-note-row"><td colspan="${3+columns.length}"><strong>NOTE</strong><div class="print-note-content">${multilineHtml(item.note||'-')}</div></td></tr>`:'';
    const hasPercent=columns.some(([field])=>field==='persen');
    const colgroup=hasPercent
      ? `<colgroup><col style="width:6%"><col style="width:35%"><col style="width:40%"><col style="width:14%"><col style="width:5%"></colgroup>`
      : `<colgroup><col style="width:6%"><col style="width:38%"><col style="width:43%"><col style="width:13%"></colgroup>`;
    const table=`<div class="print-table-frame"><table class="print-table">${colgroup}<thead><tr><th>No</th><th>Nama Barang</th><th>Keterangan</th>${printQtyHeaders(columns)}</tr></thead><tbody>${itemRows}${noteRow}</tbody></table></div>`;
    html+=`<div class="print-page ${continuation?'continuation':''}">${header}${table}${isLast?`<div class="print-sign"><div class="print-sign-box"><div class="role">DIBUAT</div><div class="sig-space">${signatureData?`<img src="${escapeHtml(signatureData)}" alt="TTD Admin">`:''}</div><div class="line"></div><div class="name">${escapeHtml(item.createdByName||'')}</div></div><div class="print-sign-box"><div class="role">DISETUJUI</div><div class="sig-space"></div><div class="line"></div><div class="name">&nbsp;</div></div><div class="print-sign-box"><div class="role">GUDANG / INVENTORY</div><div class="sig-space"></div><div class="line"></div><div class="name">&nbsp;</div></div><div class="print-sign-box"><div class="role">PENERIMA</div><div class="sig-space"></div><div class="line"></div><div class="name">&nbsp;</div></div></div>`:''}<div class="print-footer"><span class="print-time">Dicetak: ${escapeHtml(printTimestamp)}</span><span>Lembar ${index+1} dari ${total}</span></div></div>`;
  });
  printHtml(html,'landscape','continuous');
}

async function printHtml(html,orientation='portrait',mode='a4') {
  const area=$('printArea');
  const modeClass=mode==='continuous'?'continuous-print':(mode==='report'?'report-print':'');
  area.innerHTML=`<div class="print-doc ${modeClass}">${html}</div>`;
  const style=document.createElement('style');
  style.id='printDynamicStyle';
  style.textContent=mode==='continuous'
    ? `@media print{@page{size:9.5in 5.5in;margin:0}#printArea{display:block!important}#printArea .continuous-print .print-page{width:241.3mm!important;height:139.7mm!important;min-height:139.7mm!important;margin:0!important;overflow:hidden!important;break-after:page}}`
    : `@media print{@page{size:A4 ${orientation};margin:10mm}#printArea{display:block!important}}`;
  document.head.appendChild(style);
  try {
    const images=[...area.querySelectorAll('img')];
    await Promise.all(images.map(img=>img.complete ? Promise.resolve() : new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;})));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.onafterprint=()=>{area.innerHTML='';style.remove();window.onafterprint=null;};
    window.print();
  } catch(err) {
    console.error(err);
    area.innerHTML='';
    style.remove();
    showToast('Dokumen print gagal disiapkan.','error');
  }
}

async function renderDestinationsView() {
  const t=$('view-destinations');
  t.innerHTML=`<div class="card card-pad"><div class="section-head"><div><div class="card-title">Master Tujuan</div><div class="card-sub">Digunakan oleh field Kepada. Tujuan bisa dipilih otomatis atau manual.</div></div><button id="addDestinationBtn" class="btn btn-primary">+ Tambah Tujuan</button></div><div id="destinationsTable"><div class="empty">Memuat Master Tujuan...</div></div></div>`;
  $('addDestinationBtn').addEventListener('click',()=>openDestinationModal());
  try{await loadDestinations();renderDestinationTable();}catch(err){console.error(err);$('destinationsTable').innerHTML=`<div class="empty" style="color:#b91c1c">${escapeHtml(firebaseError(err))}</div>`;}
}
function renderDestinationTable(){
  const t=$('destinationsTable');if(!state.destinations.length){t.innerHTML='<div class="empty">Belum ada Master Tujuan.</div>';return;}
  t.innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>Kepada — Baris 1</th><th>Kepada — Baris 2</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${state.destinations.map(x=>{const l=destinationLines(x);return `<tr><td><strong>${escapeHtml(l.line1||'-')}</strong></td><td>${escapeHtml(l.line2||'-')}</td><td>${x.active!==false?'<span class="pill status-active">Aktif</span>':'<span class="pill status-cancelled">Nonaktif</span>'}</td><td><div class="row-actions"><button class="btn btn-secondary btn-sm" data-dest-edit="${x.id}">Edit</button><button class="btn btn-soft btn-sm" data-dest-toggle="${x.id}">${x.active!==false?'Nonaktifkan':'Aktifkan'}</button></div></td></tr>`;}).join('')}</tbody></table></div>`;
  t.querySelectorAll('[data-dest-edit]').forEach(b=>b.addEventListener('click',()=>{const x=state.destinations.find(d=>d.id===b.dataset.destEdit);if(x)openDestinationModal(x);}));
  t.querySelectorAll('[data-dest-toggle]').forEach(b=>b.addEventListener('click',()=>toggleDestination(b.dataset.destToggle)));
}

function openDestinationModal(existing=null){
  const lines=destinationLines(existing||{});
  openModal(`<div class="modal-head"><div><div class="card-title">${existing?'Edit':'Tambah'} Tujuan</div><div class="card-sub">Baris 1 biasanya nama perusahaan/tujuan; Baris 2 dapat diisi kota atau informasi tambahan.</div></div><button type="button" class="btn btn-soft" data-close-modal>Tutup</button></div><div class="modal-body"><div class="form-grid-2"><div class="field"><label>Kepada — Baris 1 *</label><input id="destLine1" class="input" maxlength="150" value="${escapeHtml(lines.line1)}" placeholder="Nama PT / tujuan"></div><div class="field"><label>Kepada — Baris 2</label><input id="destLine2" class="input" maxlength="150" value="${escapeHtml(lines.line2)}" placeholder="Kota / informasi tambahan"></div></div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="saveDestBtn" class="btn btn-primary">Simpan</button></div>`);
  $('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));
  $('saveDestBtn').addEventListener('click',async()=>{const line1=$('destLine1').value.trim();const line2=$('destLine2').value.trim();if(!line1)return showToast('Kepada Baris 1 wajib diisi.','warning');const name=[line1,line2].filter(Boolean).join('\n');const btn=$('saveDestBtn');setBusy(btn,true,'Menyimpan...');try{const dup=state.destinations.find(x=>destinationLabel(x).toLowerCase()===destinationLabel({line1,line2}).toLowerCase()&&x.id!==existing?.id);if(dup)throw new Error('Tujuan tersebut sudah ada.');const payload={name,line1,line2,active:existing?.active!==false,updatedAt:serverTimestamp()};if(existing)await updateDoc(doc(db,'destinations',existing.id),payload);else await addDoc(collection(db,'destinations'),{...payload,createdAt:serverTimestamp()});closeModal();await loadDestinations();renderDestinationsView();showToast('Master Tujuan tersimpan.');}catch(err){console.error(err);showToast(firebaseError(err),'error');}finally{setBusy(btn,false);}});
}

async function toggleDestination(id){const x=state.destinations.find(d=>d.id===id);if(!x)return;try{await updateDoc(doc(db,'destinations',id),{active:x.active===false,updatedAt:serverTimestamp()});await loadDestinations();renderDestinationsView();}catch(err){console.error(err);showToast(firebaseError(err),'error');}}

async function renderYearCodesView(){
  const t=$('view-yearcodes'); t.innerHTML=`<div class="card card-pad"><div class="section-head"><div><div class="card-title">Master Kode Tahun</div><div class="card-sub">Satu tahun boleh memiliki beberapa kode, misalnya 2026A, 2026B, 2026C. Gunakan Edit untuk pasangan Tahun + Kode yang sudah terdaftar.</div></div><button id="addYearBtn" class="btn btn-primary">+ Tambah Kode Tahun</button></div><div id="yearCodesTable"><div class="empty">Memuat Kode Tahun...</div></div></div>`;
  $('addYearBtn').addEventListener('click',()=>openYearModal());
  try{await loadYearCodes();renderYearCodesTable();}catch(err){console.error(err);$('yearCodesTable').innerHTML=`<div class="empty" style="color:#b91c1c">${escapeHtml(firebaseError(err))}</div>`;}
}
function renderYearCodesTable(){const t=$('yearCodesTable');if(!state.yearCodes.length){t.innerHTML='<div class="empty">Belum ada kode tahun.</div>';return;}t.innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>Tahun</th><th>Kode</th><th>Gabungan</th><th>Aksi</th></tr></thead><tbody>${state.yearCodes.map(x=>`<tr><td>${escapeHtml(x.year)}</td><td><strong>${escapeHtml(String(x.code||'').toUpperCase())}</strong></td><td><strong>${escapeHtml(String(x.year))}${escapeHtml(String(x.code||'').toUpperCase())}</strong></td><td><button class="btn btn-secondary btn-sm" data-year-edit="${x.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;t.querySelectorAll('[data-year-edit]').forEach(b=>b.addEventListener('click',()=>{const x=state.yearCodes.find(y=>y.id===b.dataset.yearEdit);if(x)openYearModal(x);}));}
function openYearModal(existing=null){
  const defaultYear=Number(existing?.year ?? new Date().getFullYear());
  const defaultCode=existing?.code ?? nextAvailableCodeForYear(defaultYear);
  openModal(`<div class="modal-head"><div><div class="card-title">${existing?'Edit':'Tambah'} Kode Tahun</div><div class="card-sub">Satu tahun dapat memiliki banyak kode: ${escapeHtml(defaultYear)}A, ${escapeHtml(defaultYear)}B, dan seterusnya.</div></div><button type="button" class="btn btn-soft" data-close-modal>Tutup</button></div><div class="modal-body"><div class="form-grid-2"><div class="field"><label>Tahun *</label><input id="yearValue" class="input" type="number" min="2000" max="2100" value="${escapeHtml(defaultYear)}"></div><div class="field"><label>Kode Tahun *</label><input id="yearCodeValue" class="input" maxlength="1" value="${escapeHtml(String(defaultCode||'').toUpperCase())}" placeholder="A" autocapitalize="characters"></div></div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="saveYearBtn" class="btn btn-primary">Simpan</button></div>`);
  $('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));
  $('saveYearBtn').addEventListener('click',async()=>{
    const year=Number($('yearValue').value);
    const code=$('yearCodeValue').value.trim().toUpperCase();
    if(!year||year<2000||year>2100)return showToast('Tahun tidak valid.','warning');
    if(!/^[A-Z]$/.test(code))return showToast('Kode tahun harus 1 huruf A-Z.','warning');
    const dup=state.yearCodes.find(x=>Number(x.year)===year&&String(x.code||'').toUpperCase()===code&&x.id!==existing?.id);
    if(dup)return showToast(`Kombinasi ${year}${code} sudah terdaftar. Gunakan tombol Edit untuk mengubahnya.`,'warning');
    const btn=$('saveYearBtn'); setBusy(btn,true,'Menyimpan...');
    try{
      const payload={year,code,updatedAt:serverTimestamp()};
      if(existing) await updateDoc(doc(db,'yearCodes',existing.id),payload);
      else await addDoc(collection(db,'yearCodes'),{...payload,createdAt:serverTimestamp()});
      closeModal(); await loadYearCodes(); renderYearCodesTable(); showToast(`Kode ${year}${code} tersimpan.`);
    }catch(err){console.error(err);showToast(firebaseError(err),'error');}
    finally{setBusy(btn,false);}
  });
}

async function renderMasterBarangView(){
  const t=$('view-masterbarang');
  t.innerHTML=`<div class="grid" style="gap:16px"><div class="card card-pad"><div class="section-head"><div><div class="card-title">Master Barang</div><div class="card-sub">Pilih barang saat input SPB untuk mengisi Kode/Nama otomatis. Import/Export Excel tersedia.</div></div><div class="section-actions"><button id="addBarangBtn" class="btn btn-primary">+ Tambah Barang</button><button id="exportBarangBtn" class="btn btn-secondary">Export Excel</button><button id="templateBarangBtn" class="btn btn-soft">Template Excel</button><button id="importBarangBtn" class="btn btn-soft">Import Excel</button><input id="masterBarangImportFile" type="file" accept=".xlsx,.xls,.csv" hidden></div></div><div class="search-bar"><input id="masterBarangSearch" class="input" placeholder="Cari kode atau nama barang"><button id="reloadBarangBtn" class="btn btn-secondary">Muat Ulang</button></div></div><div class="card card-pad"><div id="masterBarangTable"><div class="empty">Memuat Master Barang...</div></div></div></div>`;
  $('addBarangBtn').addEventListener('click',()=>openBarangModal());
  $('reloadBarangBtn').addEventListener('click',loadAndRenderMasterBarang);
  $('masterBarangSearch').addEventListener('input',renderMasterBarangTable);
  $('exportBarangBtn').addEventListener('click',exportMasterBarangExcel);
  $('templateBarangBtn').addEventListener('click',async()=>{const XLSX=await ensureXlsxReady();downloadWorkbook(buildMasterBarangTemplate(XLSX),`Template-Master-Barang-${todayISO()}.xlsx`,XLSX);});
  $('importBarangBtn').addEventListener('click',()=>$('masterBarangImportFile').click());
  $('masterBarangImportFile').addEventListener('change',e=>{const f=e.target.files?.[0];e.target.value='';if(f)importMasterBarangExcelFile(f);});
  await loadAndRenderMasterBarang();
}
async function loadAndRenderMasterBarang(){try{await loadMasterBarang();renderMasterBarangTable();}catch(err){console.error(err);$('masterBarangTable').innerHTML=`<div class="empty" style="color:#b91c1c">${escapeHtml(firebaseError(err))}</div>`;}}
function renderMasterBarangTable(){const t=$('masterBarangTable');if(!t)return;const term=normalized($('masterBarangSearch')?.value||'');const rows=state.masterBarang.filter(x=>!term||normalized(x.kodeBarang).includes(term)||normalized(x.namaBarang).includes(term));if(!rows.length){t.innerHTML='<div class="empty">Belum ada barang yang sesuai.</div>';return;}t.innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>Kode</th><th>Nama</th><th>Satuan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${escapeHtml(x.kodeBarang)}</strong></td><td>${escapeHtml(x.namaBarang)}</td><td><div class="chip-row">${(x.unitModes||availableUnits()).map(u=>`<span class="pill type-pill">${u}</span>`).join('')}</div></td><td>${x.active!==false?'<span class="pill status-active">Aktif</span>':'<span class="pill status-cancelled">Nonaktif</span>'}</td><td><div class="row-actions"><button class="btn btn-secondary btn-sm" data-barang-edit="${x.id}">Edit</button><button class="btn btn-soft btn-sm" data-barang-toggle="${x.id}">${x.active!==false?'Nonaktifkan':'Aktifkan'}</button></div></td></tr>`).join('')}</tbody></table></div>`;t.querySelectorAll('[data-barang-edit]').forEach(b=>b.addEventListener('click',()=>{const x=state.masterBarang.find(y=>y.id===b.dataset.barangEdit);if(x)openBarangModal(x);}));t.querySelectorAll('[data-barang-toggle]').forEach(b=>b.addEventListener('click',()=>toggleBarang(b.dataset.barangToggle)));}
function openBarangModal(existing=null){openModal(`<div class="modal-head"><div><div class="card-title">${existing?'Edit':'Tambah'} Master Barang</div><div class="card-sub">Satuan dapat berupa Pcs, Kg, Rol, MTR, atau satuan tambahan dari Master Satuan.</div></div><button type="button" class="btn btn-soft" data-close-modal>Tutup</button></div><div class="modal-body"><div class="form-grid-2"><div class="field"><label>Kode Barang *</label><input id="barangKode" class="input" maxlength="60" value="${escapeHtml(existing?.kodeBarang||'')}"></div><div class="field"><label>Nama Barang *</label><input id="barangNama" class="input" maxlength="160" value="${escapeHtml(existing?.namaBarang||'')}"></div></div><div class="field" style="margin-top:14px"><label>Satuan yang digunakan</label><div class="checkboxes">${availableUnits().map(u=>`<label class="check-pill"><input type="checkbox" class="barang-unit" value="${u}" ${(existing?.unitModes||availableUnits()).map(unitLabel).includes(u)?'checked':''}> ${u}</label>`).join('')}</div></div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="saveBarangBtn" class="btn btn-primary">Simpan</button></div>`);$('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));$('saveBarangBtn').addEventListener('click',async()=>{const kode=$('barangKode').value.trim();const nama=$('barangNama').value.trim();const units=[...document.querySelectorAll('.barang-unit:checked')].map(x=>x.value);if(!kode||!nama)return showToast('Kode dan Nama Barang wajib diisi.','warning');if(!units.length)return showToast('Pilih minimal satu satuan.','warning');const dup=state.masterBarang.find(x=>normalized(x.kodeBarang)===normalized(kode)&&x.id!==existing?.id);if(dup)return showToast('Kode Barang sudah digunakan di Master Barang.','warning');const btn=$('saveBarangBtn');setBusy(btn,true,'Menyimpan...');try{const payload={kodeBarang:kode,namaBarang:nama,unitModes:units,active:existing?.active!==false,updatedAt:serverTimestamp()};if(existing)await updateDoc(doc(db,'masterBarang',existing.id),payload);else await addDoc(collection(db,'masterBarang'),{...payload,createdAt:serverTimestamp()});closeModal();await loadMasterBarang();renderMasterBarangView();showToast('Master Barang tersimpan.');}catch(err){console.error(err);showToast(firebaseError(err),'error');}finally{setBusy(btn,false);}});}
async function toggleBarang(id){const x=state.masterBarang.find(y=>y.id===id);if(!x)return;try{await updateDoc(doc(db,'masterBarang',id),{active:x.active===false,updatedAt:serverTimestamp()});await loadMasterBarang();renderMasterBarangView();}catch(err){console.error(err);showToast(firebaseError(err),'error');}}

async function renderMasterSatuanView(){
  const t=$('view-satuan');
  t.innerHTML=`<div class="grid" style="gap:16px"><div class="card card-pad"><div class="section-head"><div><div class="card-title">Master Satuan</div><div class="card-sub">Kelola satuan yang dapat dipakai pada Qty/Satuan. Default: Pcs, Kg, Rol, MTR.</div></div><button id="addSatuanBtn" class="btn btn-primary">+ Tambah Satuan</button></div><div class="small-help">Gunakan nama singkat dan konsisten, misalnya PCS, KG, ROL, MTR.</div></div><div class="card card-pad"><div id="masterSatuanTable"><div class="empty">Memuat Master Satuan...</div></div></div></div>`;
  $('addSatuanBtn').addEventListener('click',()=>openSatuanModal());
  await loadMasterSatuan(); renderMasterSatuanTable();
}
function renderMasterSatuanTable(){
  const t=$('masterSatuanTable'); if(!t)return; const rows=state.masterSatuan;
  const defaults=DEFAULT_UNITS.filter(u=>!rows.some(x=>unitLabel(x.nama)===u));
  const all=[...defaults.map(n=>({id:`default-${n}`,nama:n,default:true,active:true})),...rows];
  t.innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>Satuan</th><th>Sumber</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${all.map(x=>`<tr><td><strong>${escapeHtml(unitLabel(x.nama))}</strong></td><td>${x.default?'<span class="pill type-pill">Default</span>':'<span class="pill type-pill">Master</span>'}</td><td>${x.active!==false?'<span class="pill status-active">Aktif</span>':'<span class="pill status-cancelled">Nonaktif</span>'}</td><td>${x.default?'—':`<button class="btn btn-soft btn-sm" data-satuan-toggle="${x.id}">${x.active!==false?'Nonaktifkan':'Aktifkan'}</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  t.querySelectorAll('[data-satuan-toggle]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.satuanToggle;const item=state.masterSatuan.find(x=>x.id===id);if(!item)return;try{await updateDoc(doc(db,'masterSatuan',id),{active:item.active===false,updatedAt:serverTimestamp()});await loadMasterSatuan();renderMasterSatuanTable();showToast(item.active===false?'Satuan diaktifkan.':'Satuan dinonaktifkan.');}catch(err){console.error(err);showToast(firebaseError(err),'error');}}));
}
function openSatuanModal(existing=null){
  openModal(`<div class="modal-head"><div><div class="card-title">Tambah Satuan</div><div class="card-sub">Contoh: PCS, KG, ROL, MTR, BOX, SET.</div></div><button type="button" class="btn btn-soft" data-close-modal>Tutup</button></div><div class="modal-body"><div class="field"><label>Nama Satuan *</label><input id="satuanNama" class="input" maxlength="20" placeholder="Contoh BOX"></div></div><div class="modal-foot"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="saveSatuanBtn" class="btn btn-primary">Simpan</button></div>`);
  $('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));
  $('saveSatuanBtn').addEventListener('click',async()=>{const nama=unitLabel($('satuanNama').value);if(!/^[A-Z0-9 _\/-]{1,20}$/.test(nama))return showToast('Nama satuan tidak valid.','warning');if(state.masterSatuan.some(x=>unitLabel(x.nama)===nama))return showToast('Satuan tersebut sudah terdaftar.','warning');const btn=$('saveSatuanBtn');setBusy(btn,true,'Menyimpan...');try{await addDoc(collection(db,'masterSatuan'),{nama,active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});closeModal();await loadMasterSatuan();renderMasterSatuanTable();showToast(`Satuan ${nama} tersimpan.`);}catch(err){console.error(err);showToast(firebaseError(err),'error');}finally{setBusy(btn,false);}});
}

function renderSignatureView(){
  const t=$('view-signature'); t.innerHTML=`<div class="grid" style="grid-template-columns:1.25fr .75fr;gap:16px"><div class="card card-pad"><div class="card-title">Profil Admin & Tanda Tangan</div><div class="card-sub">TTD disimpan di Firestore sebagai data gambar terkompresi. Tidak menggunakan Cloud Storage; TTD disimpan terkompresi di Firestore.</div><div class="form-grid-2" style="margin-top:16px"><div class="field"><label>Nama Admin</label><input id="profileName" class="input" maxlength="100" value="${escapeHtml(state.profile?.name||'')}"></div><div class="field"><label>Email</label><div class="input" style="background:#f8fafc;color:#64748b">${escapeHtml(state.user?.email||'')}</div></div></div><div class="field" style="margin-top:14px"><label>File TTD (PNG/JPG)</label><input id="signatureFile" class="input" type="file" accept="image/png,image/jpeg"><div id="signaturePreview" class="signature-preview" style="margin-top:8px">${state.profile?.signatureSnapshotData?`<img src="${escapeHtml(state.profile.signatureSnapshotData)}" alt="TTD Admin">`:'<div class="muted">Belum ada TTD</div>'}</div><div class="small-help" style="margin-top:7px">File asli boleh lebih besar; aplikasi akan resize/compress agar aman untuk Firestore.</div></div><div class="section-actions" style="margin-top:14px"><button id="saveProfileBtn" class="btn btn-primary">Simpan Profil</button><button id="changePasswordBtn" class="btn btn-secondary">Ubah Password</button></div></div><div class="card card-pad"><div class="card-title">Status TTD</div><div style="margin-top:14px;display:grid;gap:10px;font-size:13px"><div style="display:flex;justify-content:space-between"><span class="muted">Versi</span><strong>${escapeHtml(state.profile?.signatureVersion||'-')}</strong></div><div style="display:flex;justify-content:space-between"><span class="muted">Status</span><strong>${state.profile?.signatureSnapshotData?'Siap':'Belum tersedia'}</strong></div><div class="alert ${state.profile?.signatureSnapshotData?'alert-success':'alert-warning'}">${state.profile?.signatureSnapshotData?'TTD akan otomatis tampil pada bagian DIBUAT saat SPB dicetak.':'Upload TTD terlebih dahulu sebelum membuat SPB baru.'}</div></div></div></div>`;
  let pending=null;
  $('signatureFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;if(!['image/png','image/jpeg'].includes(file.type))return showToast('Gunakan PNG atau JPG.','warning');if(file.size>5*1024*1024)return showToast('File asli maksimal 5 MB.','warning');try{pending=await fileToSignatureData(file);$('signaturePreview').innerHTML=`<img src="${escapeHtml(pending)}" alt="Preview TTD">`;showToast('Preview TTD siap.');}catch(err){console.error(err);showToast(err.message||'TTD tidak dapat diproses.','error');}});
  $('saveProfileBtn').addEventListener('click',()=>saveProfile(pending)); $('changePasswordBtn').addEventListener('click',openChangePasswordModal);
}
function fileToSignatureData(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Gagal membaca file.'));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error('File gambar tidak valid.'));img.onload=()=>{const sizes=[[1000,280],[850,240],[700,200],[600,170]];let output='';for(const [maxW,maxH] of sizes){const scale=Math.min(1,maxW/img.width,maxH/img.height);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');if(!ctx)return reject(new Error('Browser tidak mendukung pemrosesan TTD.'));ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);output=canvas.toDataURL('image/png');if(output.length<=220000)break;}if(output.length>220000)return reject(new Error('TTD masih terlalu besar setelah kompresi. Gunakan gambar yang lebih sederhana/kecil.'));resolve(output);};img.src=reader.result;};reader.readAsDataURL(file);});}
async function saveProfile(pendingData=null){const name=$('profileName').value.trim();if(!name)return showToast('Nama Admin wajib diisi.','warning');const btn=$('saveProfileBtn');setBusy(btn,true,'Menyimpan...');try{const payload={name,updatedAt:serverTimestamp()};if(pendingData){const current=Number(state.profile?.signatureVersion||0);const next=current+1;payload.signatureSnapshotData=pendingData;payload.signatureVersion=String(next);payload.signatureUpdatedAt=serverTimestamp();}await updateDoc(doc(db,'users',state.user.uid),payload);state.profile={...state.profile,...payload,signatureSnapshotData:pendingData||state.profile.signatureSnapshotData,signatureVersion:pendingData?String(Number(state.profile?.signatureVersion||0)+1):state.profile.signatureVersion};$('sessionName').textContent=state.profile.name;showToast('Profil Admin berhasil disimpan.');renderSignatureView();}catch(err){console.error(err);showToast(firebaseError(err),'error');}finally{setBusy(btn,false);}}
function openChangePasswordModal(){openModal(`<div class="modal-head"><div><div class="card-title">Ubah Password Admin</div></div><button type="button" class="btn btn-soft" data-close-modal>Tutup</button></div><form id="passwordForm" class="modal-body" style="display:grid;gap:14px"><div class="field"><label>Password Saat Ini *</label><input id="currentPw" type="password" class="input" required></div><div class="field"><label>Password Baru *</label><input id="newPw" type="password" class="input" minlength="8" required></div><div class="field"><label>Konfirmasi Password Baru *</label><input id="confirmPw" type="password" class="input" minlength="8" required></div><div class="modal-foot" style="margin:0 -20px -20px"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button id="savePwBtn" class="btn btn-primary">Ubah Password</button></div></form>`);$('modalRoot').querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));$('passwordForm').addEventListener('submit',async e=>{e.preventDefault();const cur=$('currentPw').value,n=$('newPw').value,c=$('confirmPw').value;if(n.length<8)return showToast('Password baru minimal 8 karakter.','warning');if(n!==c)return showToast('Konfirmasi password tidak sama.','warning');const btn=$('savePwBtn');setBusy(btn,true,'Mengubah...');try{const cred=EmailAuthProvider.credential(state.user.email,cur);await reauthenticateWithCredential(state.user,cred);await updatePassword(state.user,n);closeModal();showToast('Password berhasil diubah.');}catch(err){console.error(err);showToast(firebaseError(err),'error');}finally{setBusy(btn,false);}});}

async function renderStaffCard(){const card=$('dashboardStaffCard');if(!card)return;try{const snap=await getDocs(query(collection(db,'staffSessions'),orderBy('lastSeen','desc'),limit(10)));const rows=snap.docs.map(d=>({id:d.id,...d.data()}));card.innerHTML=`<div class="section-head"><div><div class="card-title">Staff Aktif</div><div class="card-sub">Sesi terbaru</div></div><button id="goStaffBtn" class="btn btn-secondary btn-sm">Lihat</button></div><div style="display:grid;gap:8px">${rows.length?rows.map(staffSessionRow).join(''):'<div class="empty">Belum ada sesi Staff.</div>'}</div>`;$('goStaffBtn').addEventListener('click',()=>navigate('staff'));}catch(err){card.innerHTML='<div class="empty" style="color:#b91c1c">Gagal memuat sesi Staff.</div>';}}
function isSessionActive(ts){if(!ts)return false;const d=ts?.toDate?ts.toDate():new Date(ts);return !Number.isNaN(d.getTime())&&Date.now()-d.getTime()<=120000;}
function staffSessionRow(x){const active=isSessionActive(x.lastSeen);return `<div style="border:1px solid #e4eaf1;border-radius:14px;padding:11px 12px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(x.namaStaff||'Staff')}</strong><div class="staff-status"><span class="dot ${active?'':'offline'}"></span>${active?'Online':'Offline'}</div></div><div class="small-help" style="margin-top:3px">Login ${formatDateTime(x.loginAt)} • Aktif ${formatDateTime(x.lastSeen)}</div></div>`;}
async function renderStaffView(){const t=$('view-staff');t.innerHTML=`<div class="grid" style="gap:16px"><div class="card card-pad"><div class="section-head"><div><div class="card-title">Staff Aktif & Riwayat Sesi</div><div class="card-sub">Status Online dihitung dari lastSeen.</div></div><button id="refreshStaffBtn" class="btn btn-secondary">Refresh</button></div><div id="staffList">Memuat...</div></div><div class="alert alert-warning">Karena Login Staff memang tanpa password, nama yang diketik adalah identitas sesi aplikasi, bukan verifikasi identitas orang.</div></div>`;$('refreshStaffBtn').addEventListener('click',renderStaffView);try{const snap=await getDocs(query(collection(db,'staffSessions'),orderBy('lastSeen','desc'),limit(100)));const rows=snap.docs.map(d=>({id:d.id,...d.data()}));$('staffList').innerHTML=rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Nama</th><th>Login</th><th>Terakhir Aktif</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${escapeHtml(x.namaStaff||'Staff')}</strong></td><td>${formatDateTime(x.loginAt)}</td><td>${formatDateTime(x.lastSeen)}</td><td>${isSessionActive(x.lastSeen)?'<span class="pill status-active">Online</span>':'<span class="pill type-pill">Offline</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Belum ada sesi Staff.</div>';}catch(err){console.error(err);$('staffList').innerHTML=`<div class="empty">${escapeHtml(firebaseError(err))}</div>`;}}

async function logout(){try{clearInterval(state.heartbeatTimer);if(state.user?.isAnonymous)await setDoc(doc(db,'staffSessions',state.user.uid),{lastSeen:serverTimestamp(),active:false},{merge:true}).catch(()=>{});await signOut(auth);localStorage.removeItem('spb_staff_name');state.searchLoaded=false;}catch(err){console.error(err);showToast(firebaseError(err),'error');}}

function bindGlobalEvents(){
  $('showAdminLogin').addEventListener('click',()=>{ $('showAdminLogin').classList.add('active');$('showStaffLogin').classList.remove('active');$('adminLoginForm').classList.remove('hidden');$('staffLoginForm').classList.add('hidden'); });
  $('showStaffLogin').addEventListener('click',()=>{ $('showStaffLogin').classList.add('active');$('showAdminLogin').classList.remove('active');$('staffLoginForm').classList.remove('hidden');$('adminLoginForm').classList.add('hidden'); });
  $('adminLoginForm').addEventListener('submit',e=>{e.preventDefault();doAdminLogin($('adminEmail').value,$('adminPassword').value,$('adminLoginBtn'));});
  $('staffLoginForm').addEventListener('submit',e=>{e.preventDefault();doStaffLogin($('staffName').value,$('staffLoginBtn'));});
  $('logoutBtn').addEventListener('click',logout); $('openDrawer').addEventListener('click',openDrawer);
  $('configWarning').classList.toggle('hidden',FIREBASE_READY); if(!FIREBASE_READY){$('adminLoginBtn').disabled=true;$('staffLoginBtn').disabled=true;}
}

bindGlobalEvents(); renderNavigation();
if(FIREBASE_READY){onAuthStateChanged(auth,user=>handleAuth(user).catch(err=>{console.error(err);showToast(firebaseError(err),'error');}));}
else showToast('Isi firebase-config.js terlebih dahulu.','warning');
