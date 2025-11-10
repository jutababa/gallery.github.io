/* Liquid Glass OS — Upgraded
   - OS-like window manager (snap, resize, minimize -> dock, virtual desktops)
   - persistent state (localStorage)
   - improved liquid canvas with performance-friendly blobs & ripples
   - notifications, taskbar updates, focused-window effects
   - usable API: LiquidOS.open(id), LiquidOS.close(id), LiquidOS.notify(...)
*/

/* --------------- CONFIG --------------- */
const CSS = document.documentElement.style;
const STORAGE_KEY = 'liquid_os_state_v1';
const CONFIG = {
  snapGrid: 16,
  dockSelector: '.dock',
  minWinWidth: 200,
  minWinHeight: 120,
  maxRipples: 8,
  fpsCap: 60,
  virtualDesktops: 2,
  startupOpenControlPanel: true
};

/* --------------- STATE --------------- */
const state = {
  z: 1000,
  history: [],           // list of open window ids (order-of-open)
  desktop: 0,            // current virtual desktop
  windowsMeta: {},       // meta for windows (left,top,w,h,open,desktop,minimized)
  notifications: [],     // active notifications
  lastRender: performance.now()
};

/* restore saved state */
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  if (saved && saved.windowsMeta) Object.assign(state, saved);
} catch(e){ console.warn('Could not parse saved state', e); }

/* --------------- DOM refs --------------- */
const canvas = document.getElementById('liquidCanvas');
const ctx = canvas.getContext('2d');
let W = (canvas.width = innerWidth);
let H = (canvas.height = innerHeight);

const bgColorEl = document.getElementById('bgColor');
const tintRange = document.getElementById('tintRange');
const blurRange = document.getElementById('blurRange');
const shineSpeed = document.getElementById('shineSpeed');
const bevel = document.getElementById('bevel');
const reflectionToggle = document.getElementById('reflectionToggle');
const liquidIntensity = document.getElementById('liquidIntensity');
const backBtn = document.getElementById('backBtn');
const backBtn2 = document.getElementById('backBtn2');
const resetBtn = document.getElementById('resetBtn');

const windows = Array.from(document.querySelectorAll('.window'));
const dockItems = Array.from(document.querySelectorAll('.dock-item'));
const shortcuts = Array.from(document.querySelectorAll('.shortcut'));
const openBtns = Array.from(document.querySelectorAll('.dock-item, .shortcut, .btn.open'));
const dockEl = document.querySelector(CONFIG.dockSelector) || document.querySelector('.dock');

/* --------------- UTIL --------------- */
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify({
  z: state.z,
  history: state.history,
  desktop: state.desktop,
  windowsMeta: state.windowsMeta
})); }

function setVar(name,val){ CSS.setProperty(name,val); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function snap(n){ return Math.round(n / CONFIG.snapGrid) * CONFIG.snapGrid; }
function hexToRgba(hex, a=1){
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* --------------- CSS VARS & CONTROLS --------------- */
function updateCSSVars(opts = {}){
  if(opts.bg) document.body.style.background = opts.bg;
  if(opts.tint !== undefined) setVar('--glass-tint', (opts.tint/255*0.14).toFixed(3));
  if(opts.blur !== undefined) setVar('--glass-blur', `${opts.blur}px`);
  if(opts.shineDuration !== undefined) setVar('--shine-duration', `${opts.shineDuration}s`);
  if(opts.bevel !== undefined) setVar('--bevel', `${opts.bevel}px`);
  if(opts.reflect !== undefined) setVar('--reflect', opts.reflect ? 1 : 0);
  if(opts.liq !== undefined) setVar('--liquid-intensity', opts.liq);
}

function applyControls(){
  const bg = bgColorEl.value;
  const tint = Number(tintRange.value);
  const blur = Number(blurRange.value);
  const shine = Number(shineSpeed.value);
  const bev = Number(bevel.value);
  const reflect = reflectionToggle.checked;
  const liq = Number(liquidIntensity.value);

  updateCSSVars({
    bg: `linear-gradient(135deg, ${bg}, ${bg}22)`,
    tint, blur, shineDuration: Math.max(1, 12 - shine),
    bevel: bev, reflect: reflect ? 1 : 0, liq
  });

  const taskRight = document.getElementById('taskRight');
  if(taskRight) taskRight.textContent = `blur ${blur}px • tint ${Math.round(tint)}`;
}
[bgColorEl, tintRange, blurRange, shineSpeed, bevel, reflectionToggle, liquidIntensity].forEach(el=>{
  if(!el) return;
  el.addEventListener('input', applyControls);
  el.addEventListener('change', applyControls);
});
if(resetBtn) resetBtn.addEventListener('click', resetDefaults);

/* --------------- DEFAULTS --------------- */
function resetDefaults(){
  if(bgColorEl) bgColorEl.value = '#0b0b0f';
  if(tintRange) tintRange.value = 160;
  if(blurRange) blurRange.value = 28;
  if(shineSpeed) shineSpeed.value = 6;
  if(bevel) bevel.value = 10;
  if(reflectionToggle) reflectionToggle.checked = true;
  if(liquidIntensity) liquidIntensity.value = 1;
  applyControls();
}
resetDefaults();

/* --------------- HISTORY / BACK --------------- */
function pushHistory(id){
  if(!id) return;
  if(state.history.length && state.history[state.history.length-1] === id) return;
  state.history.push(id);
  updateBackUI();
  saveState();
}
function popHistory(){
  const id = state.history.pop();
  updateBackUI();
  saveState();
  return id;
}
function updateBackUI(){
  const b = state.history.length > 0;
  if(backBtn) backBtn.disabled = !b;
  if(backBtn2) backBtn2.disabled = !b;
}

/* override original back btn behavior: don't navigate away — act as window-back */
if(backBtn) backBtn.addEventListener('click', () => {
  const last = popHistory();
  if(last) closeWindowById(last);
});
if(backBtn2) backBtn2.addEventListener('click', () => {
  const last = popHistory();
  if(last) closeWindowById(last);
});

/* --------------- WINDOW MANAGER --------------- */
function getWindowById(id){ return document.getElementById(id); }

function ensureWindowMeta(id){
  state.windowsMeta[id] = state.windowsMeta[id] || { open:false, minimized:false, left: null, top: null, w:null, h:null, desktop:0 };
  return state.windowsMeta[id];
}

function openWindow(id, opts = {}){
  const win = getWindowById(id);
  if(!win) { console.warn('openWindow: no node', id); return; }

  // restore display if minimized
  if(win.style.display === 'none') win.style.display = '';

  win.classList.add('open');
  focusWindow(win);

  // pick meta
  const meta = ensureWindowMeta(id);
  meta.open = true;
  meta.minimized = false;

  // initial placement: center unless meta exists
  if(meta.left == null || opts.center){
    const left = Math.max(20, (W - win.offsetWidth)/2);
    const top = Math.max(70, (H - win.offsetHeight)/2);
    win.style.left = `${snap(left)}px`;
    win.style.top = `${snap(top)}px`;
    meta.left = left; meta.top = top;
  } else {
    win.style.left = `${meta.left}px`;
    win.style.top = `${meta.top}px`;
  }

  win.style.pointerEvents = 'auto';
  win.style.opacity = '1';
  win.style.transform = 'none';
  win.style.zIndex = ++state.z;
  state.history.push(id);
  updateBackUI();
  saveState();
  renderTaskbar();
}

/* close */
function closeWindowById(id){
  const win = getWindowById(id);
  if(!win) return;
  win.classList.remove('open');
  ensureWindowMeta(id).open = false;
  ensureWindowMeta(id).minimized = false;
  win.style.pointerEvents = 'none';
  win.style.display = '';
  // remove from history
  state.history = state.history.filter(x => x !== id);
  updateBackUI();
  saveState();
  renderTaskbar();
}

/* minimize to dock */
function minimizeWindow(win){
  if(typeof win === 'string') win = getWindowById(win);
  if(!win) return;
  const id = win.id;
  const meta = ensureWindowMeta(id);
  meta.minimized = true;
  win.style.transition = 'transform 180ms ease, opacity 180ms ease';
  win.style.opacity = '0';
  win.style.transform = 'scale(.98) translateY(8px)';
  setTimeout(()=>{ if(meta.minimized) win.style.display = 'none'; }, 200);
  saveState();
  renderTaskbar();
}

/* restore */
function restoreWindow(win){
  if(typeof win === 'string') win = getWindowById(win);
  if(!win) return;
  const id = win.id;
  const meta = ensureWindowMeta(id);
  meta.minimized = false;
  win.style.display = '';
  requestAnimationFrame(()=>{ 
    win.style.opacity = '1';
    win.style.transform = 'none';
    win.style.zIndex = ++state.z;
    focusWindow(win);
  });
  openWindow(id, {center:false});
}

/* focus */
function focusWindow(win){
  if(typeof win === 'string') win = getWindowById(win);
  if(!win) return;
  windows.forEach(w => w.classList.remove('focused'));
  win.classList.add('focused');
  win.style.zIndex = ++state.z;
  // update meta z so ordering can be persisted if desired
  ensureWindowMeta(win.id).z = state.z;
  saveState();
  renderTaskbar();
}

/* window toggle via dock */
dockItems.forEach(d => {
  d.addEventListener('click', (e)=>{
    const target = d.dataset.open || d.getAttribute('data-open');
    const node = getWindowById(target);
    if(!node) return;
    const meta = ensureWindowMeta(target);
    if(node.classList.contains('open') && node.style.display !== 'none' && !meta.minimized){
      minimizeWindow(node);
    } else {
      restoreWindow(node);
      openWindow(target, {center:true});
    }
  });
});

/* open buttons */
openBtns.forEach(btn=>{
  btn.addEventListener('click', (e) => {
    const target = btn.dataset.open || btn.getAttribute('data-open') || btn.dataset.target;
    if(!target) return;
    const node = getWindowById(target);
    if(!node) return;
    if(node.style.display === 'none') restoreWindow(node);
    openWindow(target, {center:true});
  });
});

/* generic close/minimize/focus/drag/resize wiring */
windows.forEach(win=>{
  const closeBtn = win.querySelector('.close');
  const minBtn = win.querySelector('.minimize');
  const winbar = win.querySelector('.winbar');
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  win.appendChild(resizeHandle);

  if(closeBtn) closeBtn.addEventListener('click', ()=> closeWindowById(win.id));
  if(minBtn) minBtn.addEventListener('click', ()=> minimizeWindow(win));

  // focus on down
  win.addEventListener('pointerdown', (e) => {
    focusWindow(win);
  });

  // DRAG
  let dragging = false, dx=0, dy=0;
  if(winbar){
    winbar.addEventListener('pointerdown', (e) => {
      dragging = true;
      focusWindow(win);
      winbar.setPointerCapture && winbar.setPointerCapture(e.pointerId);
      const rect = win.getBoundingClientRect();
      dx = e.clientX - rect.left;
      dy = e.clientY - rect.top;
      win.style.transition = 'none';
    });
  }
  window.addEventListener('pointermove', (e) => {
    if(!dragging) return;
    // keep inside bounds
    let nx = e.clientX - dx;
    let ny = e.clientY - dy;
    nx = clamp(nx, 8, W - win.offsetWidth - 8);
    ny = clamp(ny, 56, H - win.offsetHeight - 8);
    nx = snap(nx); ny = snap(ny);
    win.style.left = nx + 'px';
    win.style.top = ny + 'px';
    // persist
    const meta = ensureWindowMeta(win.id);
    meta.left = nx; meta.top = ny;
  });
  window.addEventListener('pointerup', (e) => {
    if(dragging){
      dragging = false;
      winbar && winbar.releasePointerCapture && winbar.releasePointerCapture(e.pointerId);
      win.style.transition = '';
      saveState();
    }
  });

  // RESIZE
  let resizing = false, startW=0, startH=0, sx=0, sy=0;
  resizeHandle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    resizing = true;
    focusWindow(win);
    resizeHandle.setPointerCapture && resizeHandle.setPointerCapture(e.pointerId);
    const rect = win.getBoundingClientRect();
    startW = rect.width; startH = rect.height; sx = e.clientX; sy = e.clientY;
    win.style.transition = 'none';
  });
  window.addEventListener('pointermove', (e) => {
    if(!resizing) return;
    let nw = Math.max(CONFIG.minWinWidth, startW + (e.clientX - sx));
    let nh = Math.max(CONFIG.minWinHeight, startH + (e.clientY - sy));
    nw = Math.round(nw); nh = Math.round(nh);
    win.style.width = nw + 'px';
    win.style.height = nh + 'px';
    const meta = ensureWindowMeta(win.id);
    meta.w = nw; meta.h = nh; // persist size
  });
  window.addEventListener('pointerup', (e) => {
    if(resizing){
      resizing = false;
      resizeHandle.releasePointerCapture && resizeHandle.releasePointerCapture(e.pointerId);
      win.style.transition = '';
      saveState();
    }
  });
});

/* keyboard shortcuts */
window.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){
    // close topmost open window (not the controlPanel)
    const openWins = windows.filter(w => w.classList.contains('open') && w.style.display !== 'none');
    if(openWins.length){
      const top = openWins.sort((a,b)=> parseInt(b.style.zIndex||0) - parseInt(a.style.zIndex||0))[0];
      if(top && top.id !== 'controlPanel') closeWindowById(top.id);
      else openWindow('controlPanel', {center:true});
    } else {
      openWindow('controlPanel', {center:true});
    }
  } else if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b'){
    // ctrl/cmd + b -> back (close last)
    const last = popHistory();
    if(last) closeWindowById(last);
  } else if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === '1'){
    setDesktop(0);
  } else if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === '2'){
    if(CONFIG.virtualDesktops > 1) setDesktop(1);
  }
});

/* --------------- TASKBAR / DOCK --------------- */
function renderTaskbar(){
  // update dock item badges for minimized / open state
  dockItems.forEach(d => {
    const target = d.dataset.open || d.getAttribute('data-open');
    const node = getWindowById(target);
    const meta = state.windowsMeta[target] || {};
    d.classList.toggle('open', meta.open && !meta.minimized);
    d.classList.toggle('minimized', meta.minimized);
  });

  // optionally update a small tasklist element
  const taskList = document.getElementById('taskList');
  if(taskList){
    taskList.innerHTML = '';
    Object.entries(state.windowsMeta).forEach(([id, meta])=>{
      if(!meta.open) return;
      const el = document.createElement('div');
      el.className = 'task-item';
      el.textContent = id;
      el.addEventListener('click', ()=> {
        const n = getWindowById(id);
        if(n.style.display === 'none' || meta.minimized) restoreWindow(n); else focusWindow(n);
      });
      taskList.appendChild(el);
    });
  }
}
renderTaskbar();

/* --------------- VIRTUAL DESKTOPS --------------- */
function setDesktop(n){
  if(n === state.desktop) return;
  // hide windows not on this desktop; show those on this desktop
  windows.forEach(w => {
    const meta = ensureWindowMeta(w.id);
    meta.desktop = meta.desktop || 0;
    if(meta.desktop !== n){
      // hide visually but keep meta.open true
      if(w.classList.contains('open')){
        w.style.display = 'none';
      }
    } else {
      if(meta.open && !meta.minimized) w.style.display = '';
    }
  });
  state.desktop = n;
  saveState();
  renderTaskbar();
}

/* --------------- NOTIFICATIONS --------------- */
function notify(title, body='', opts = {}){
  const id = 'notif-' + Date.now();
  const container = document.getElementById('notifications') || document.createElement('div');
  container.id = 'notifications';
  container.style.position = 'fixed';
  container.style.right = '20px';
  container.style.bottom = '20px';
  container.style.zIndex = 99999;
  if(!document.getElementById('notifications')) document.body.appendChild(container);

  const el = document.createElement('div');
  el.className = 'notif';
  el.style.marginTop = '8px';
  el.style.padding = '10px 14px';
  el.style.borderRadius = '10px';
  el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
  el.style.backdropFilter = 'blur(6px)';
  el.style.background = 'rgba(20,20,24,0.7)';
  el.style.color = 'white';
  el.innerHTML = `<strong>${title}</strong><div style="opacity:.9;font-size:12px;margin-top:4px">${body}</div>`;
  container.appendChild(el);

  // auto-dismiss
  setTimeout(()=> { el.style.transform = 'translateY(12px)'; el.style.opacity = '0'; setTimeout(()=>el.remove(),300); }, opts.timeout || 4200);
  state.notifications.push({id, title});
  saveState();
  return id;
}

/* --------------- LIQUID CANVAS (optimized) --------------- */
const blobs = [
  {x: W*0.25, y: H*0.25, r: Math.min(W,H)*0.45 * 0.22, vx:0.02, vy:0.015},
  {x: W*0.75, y: H*0.2,  r: Math.min(W,H)*0.55 * 0.2, vx:-0.01, vy:0.01},
  {x: W*0.5, y: H*0.65, r: Math.min(W,H)*0.7 * 0.25, vx:0.008, vy:-0.006}
];
const ripples = []; // {x,y,r,life}
let mouse = {x: W/2, y: H/2, down:false};
window.addEventListener('pointermove', (e)=>{ mouse.x = e.clientX; mouse.y = e.clientY });
window.addEventListener('pointerdown', (e)=>{ mouse.down = true; createRipple(e.clientX, e.clientY); });
window.addEventListener('pointerup', (e)=>{ mouse.down = false; });

function createRipple(x,y){
  ripples.push({x,y,r:10,life:1});
  if(ripples.length > CONFIG.maxRipples) ripples.shift();
}

/* resize canvas */
window.addEventListener('resize', () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; });

/* render with fps cap */
let accTime = 0;
function render(time){
  const dt = Math.min(1/15, (time - state.lastRender) / 1000); // clamp large gaps
  state.lastRender = time;
  accTime += dt;
  // throttle to fpsCap if needed
  const step = 1 / CONFIG.fpsCap;
  if(accTime < step) { requestAnimationFrame(render); return; }
  accTime = 0;

  ctx.clearRect(0,0,W,H);

  // background gradient from control
  const bgv = bgColorEl ? bgColorEl.value : '#0b0b0f';
  const grad = ctx.createLinearGradient(0,0,W,H);
  grad.addColorStop(0, bgv);
  grad.addColorStop(1, hexToRgba(bgv, 0.18));
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,W,H);

  // blobs: gentle movement + soft radial gradient
  const liq = Number(liquidIntensity.value) || 1;
  ctx.globalCompositeOperation = 'lighter';
  blobs.forEach((b,i) => {
    const t = time * 0.0006 * (i+1);
    b.x += Math.sin(t) * b.vx * 60 * liq;
    b.y += Math.cos(time*0.0005*(i+1)) * b.vy * 60 * liq;
    // slight attraction to mouse
    b.x += (mouse.x - b.x) * 0.002 * liq;
    b.y += (mouse.y - b.y) * 0.002 * liq;

    const radius = b.r;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, radius * 1.4);
    g.addColorStop(0, `rgba(255,255,255,${0.06 * liq})`);
    g.addColorStop(0.4, `rgba(255,255,255,${0.02 * liq})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, radius, 0, Math.PI*2);
    ctx.fill();
  });

  // ripples
  for(let i = ripples.length-1; i >= 0; i--){
    const r = ripples[i];
    r.r += 60 * dt;
    r.life -= dt * 0.8;
    if(r.life <= 0) { ripples.splice(i,1); continue; }
    ctx.beginPath();
    ctx.strokeStyle = `rgba(255,255,255,${0.12 * (r.life)})`;
    ctx.lineWidth = 2 + (1 - r.life) * 6;
    ctx.arc(r.x, r.y, r.r, 0, Math.PI*2);
    ctx.stroke();
  }

  // vignette & subtle noise overlay
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  const edgeGrad = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.1, W/2, H/2, Math.max(W,H));
  edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
  edgeGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0,0,W,H);
  ctx.restore();

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

/* --------------- SEED WINDOWS (initial placement & restore meta) --------------- */
function seedWindows(){
  const pad = 40;
  windows.forEach((w,i)=>{
    const meta = ensureWindowMeta(w.id);
    // restore size/pos if present
    if(meta.left != null) {
      w.style.left = `${meta.left}px`;
      w.style.top = `${meta.top}px`;
    } else {
      w.style.left = `${pad + i*40}px`;
      w.style.top = `${120 + i*28}px`;
      meta.left = parseInt(w.style.left);
      meta.top = parseInt(w.style.top);
    }
    if(meta.w) w.style.width = meta.w + 'px';
    if(meta.h) w.style.height = meta.h + 'px';
    // show control panel if requested
    if(w.id === 'controlPanel' && CONFIG.startupOpenControlPanel){
      w.classList.add('open'); w.style.pointerEvents='auto';
      w.style.left = `${Math.max(20, W - w.offsetWidth - 48)}px`;
      w.style.top = `96px`;
      meta.open = true; meta.minimized = false; meta.desktop = 0;
      pushHistory(w.id);
    } else {
      // keep other windows hidden until user opens them
      if(!meta.open) {
        // keep in DOM but visually closed
        w.classList.remove('open');
      }
    }
  });
  renderTaskbar();
}
seedWindows();

/* small shortcuts UX - double click opens, single click pulses */
shortcuts.forEach(s => {
  s.addEventListener('dblclick', () => {
    const id = s.dataset.open;
    openWindow(id, {center:true});
  });
  s.addEventListener('click', () => {
    s.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.2,1)' });
  });
});

/* thumbs & submit nice feedback */
document.querySelectorAll('.thumb').forEach(t => {
  t.addEventListener('click', () => {
    t.animate([{ transform: 'scale(1)'},{ transform: 'scale(1.08)'},{ transform: 'scale(1)'}], { duration: 280, easing: 'cubic-bezier(.2,.9,.2,1)'});
  });
});
document.querySelectorAll('.submit').forEach(b => {
  b.addEventListener('click', () => {
    b.textContent = 'Submitted ✓';
    b.disabled = true;
    setTimeout(()=>{ b.textContent = 'Submit'; b.disabled = false }, 1200);
  });
});

/* open the control panel on load if saved state says so */
if(CONFIG.startupOpenControlPanel) {
  const cp = document.getElementById('controlPanel');
  if(cp) openWindow('controlPanel', {center:false});
}

/* --------------- PUBLIC API --------------- */
window.LiquidOS = {
  open: openWindow,
  close: closeWindowById,
  minimize: (id)=> minimizeWindow(getWindowById(id)),
  restore: (id)=> restoreWindow(getWindowById(id)),
  setDesktop,
  notify,
  pushHistory
};

/* --------------- NOTES PANEL --------------- */
const notesToggle = document.getElementById("notes-toggle");
const notes = document.getElementById("notes");
const notesContent = document.getElementById("notes-content");
let notesOpen = false;

if(notesToggle && notes){
  notesToggle.addEventListener("click", () => {
    notesOpen = !notesOpen;
    notes.style.bottom = notesOpen ? "10px" : "-320px";
  });
}


notesToggle.addEventListener('click', () => {
  notes.classList.toggle('open');
});


/* --------------- FINAL POLISH: small helpful notification to user --------------- */
setTimeout(()=> notify('this is bad, holy css'), 300);
