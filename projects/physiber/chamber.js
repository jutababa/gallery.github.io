// chamber.js — Physiber Retro Editor v2
// Features: box/circle draw, select (rigid/constraint), properties inspector (float, draggable), anchor (freeze), delete, color picker, constraint types (spring/rope) with adjustable stiffness/length, visible constraints, debug HUD

(function(){
  const { Engine, Render, Runner, World, Bodies, Body, Mouse, MouseConstraint, Events, Constraint, Composite, Query } = Matter;

  // DOM
  const canvas = document.getElementById('world');
  const overlay = document.getElementById('overlay');
  const ctx = overlay.getContext('2d');

  const toolBtns = document.querySelectorAll('.tool-btn');
  const colorPicker = document.getElementById('colorPicker');
  const clearBtn = document.getElementById('clearBtn');
  const inspector = document.getElementById('inspector');
  const debug = document.getElementById('debug');

  const selName = document.getElementById('selName');
  const propX = document.getElementById('propX');
  const propY = document.getElementById('propY');
  const propAngle = document.getElementById('propAngle');
  const propScaleX = document.getElementById('propScaleX');
  const propScaleY = document.getElementById('propScaleY');
  const propColor = document.getElementById('propColor');
  const propAnchor = document.getElementById('propAnchor');
  const applyProps = document.getElementById('applyProps');
  const deleteObj = document.getElementById('deleteObj');

  const fpsEl = document.getElementById('fps');
  const bodiesEl = document.getElementById('bodies');
  const consEl = document.getElementById('cons');
  const toolEl = document.getElementById('tool');
  const mouseEl = document.getElementById('mouse');

  const constraintTypeEl = document.getElementById('constraintType');
  const constraintStiffEl = document.getElementById('constraintStiff');
  const constraintLenEl = document.getElementById('constraintLen');

  // engine + render
  const engine = Engine.create();
  engine.gravity.y = 1;
  const render = Render.create({ canvas, engine, options: { wireframes: false, background: 'transparent' }});
  Render.run(render);
  const runner = Runner.create();
  Runner.run(runner, engine);

  // fit canvases
  function resize(){
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = w; canvas.height = h;
    overlay.width = w; overlay.height = h;
    render.canvas.width = w; render.canvas.height = h;
    render.options.width = w; render.options.height = h;
  }
  resize(); window.addEventListener('resize', resize);

  // bounds
  const walls = [
    Bodies.rectangle(window.innerWidth/2, window.innerHeight+60, window.innerWidth+200, 120, { isStatic:true }),
    Bodies.rectangle(-60, window.innerHeight/2, 120, window.innerHeight+200, { isStatic:true }),
    Bodies.rectangle(window.innerWidth+60, window.innerHeight/2, 120, window.innerHeight+200, { isStatic:true }),
    Bodies.rectangle(window.innerWidth/2, -60, window.innerWidth+200, 120, { isStatic:true })
  ];
  World.add(engine.world, walls);


  // mouse & constraint for dragging bodies
  const mouse = Mouse.create(canvas);
  const mouseConstraint = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } }});
  World.add(engine.world, mouseConstraint);

  // state
  let currentTool = 'none';
  let drawing = false;
  let start = null;
  let currentColor = colorPicker.value;
  let selectedBody = null;
  let selectionMode = 'rigid'; // 'rigid' or 'constraintSelect'
  let creatingConstraint = null; // { from: body, tempPos: {x,y} }
  let bodiesMeta = new Map(); // store meta like original size for scaling

  // constraints list (we'll keep references)
  const constraints = [];

  // util: nearest body at point
  function bodyAt(point){
    // Query a small rectangle
    const found = Query.point(engine.world.bodies, point);
    return found.length ? found[0] : null;
  }

  // tool buttons
  toolBtns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      toolBtns.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.dataset.tool;
      toolEl.textContent = currentTool;
      updateCursor();
      // if switching away from constraint friendly state, cancel
      if (currentTool !== 'constraint') cancelCreatingConstraint();
    });
  });

  function updateCursor(){
    if (currentTool === 'box' || currentTool === 'circle' || currentTool === 'constraint'){
      canvas.classList.add('cursor-edit');
    } else {
      canvas.classList.remove('cursor-edit');
    }
  }

  colorPicker.addEventListener('input', e => currentColor = e.target.value);
  clearBtn.addEventListener('click', ()=>{
    // clear bodies & constraints but keep walls
    Composite.clear(engine.world, false);
    World.add(engine.world, walls);
    constraints.length = 0;
    selectedBody = null;
    updateInspector();
  });

  // drawing interactions
  canvas.addEventListener('mousedown', e=>{
    const pos = getMouse(e);
    if (currentTool === 'box' || currentTool === 'circle'){
      drawing = true; start = pos;
      // disable pick-up while drawing
      mouseConstraint.constraint.bodyB = null;
    } else if (currentTool === 'none'){
      // selection attempt
      const b = bodyAt(pos);
      if (b && !b.isStatic && !b.isSensor){
        setSelectedBody(b);
      } else {
        setSelectedBody(null);
      }
    } else if (currentTool === 'constraint'){
      // in constraint mode: start selecting source
      const b = bodyAt(pos);
      if (b){
        creatingConstraint = { from: b, tempPos: pos };
      }
    }
  });

  window.addEventListener('mousemove', e=>{
    const pos = getMouse(e);
    mouseEl.textContent = `${Math.round(pos.x)},${Math.round(pos.y)}`;
    if (drawing){
      drawPreview(start, pos);
    }
    if (creatingConstraint){
      creatingConstraint.tempPos = pos;
      drawOverlay(); // shows rope to mouse
    }
  });

  window.addEventListener('mouseup', e=>{
    const pos = getMouse(e);
    if (drawing){
      drawing = false;
      createBodyFromDrag(start, pos, e.shiftKey);
      clearOverlay();
    } else if (creatingConstraint){
      // finish constraint by clicking a target body
      const target = bodyAt(pos);
      if (target && target !== creatingConstraint.from){
        makeConstraintBetween(creatingConstraint.from, target);
      }
      cancelCreatingConstraint();
    }
  });

  window.addEventListener('keydown', e=>{
    if (e.key.toLowerCase() === 'x') {
      if (drawing){ drawing=false; clearOverlay(); }
      else if (creatingConstraint){ cancelCreatingConstraint(); }
      else { setTool('none'); toolEl.textContent='none' }
    } else if (e.key === 'Delete' || e.key === 'Backspace'){
      if (selectedBody) { removeBody(selectedBody); setSelectedBody(null); }
    } else if (e.key === 'c'){ // quick toggle selection mode
      selectionMode = selectionMode === 'rigid' ? 'constraintSelect' : 'rigid';
    }
  });

  // drawing preview
  function drawPreview(a,b){
    clearOverlay();
    ctx.setLineDash([6,4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.fillStyle = currentColor + '33';
    const dx = b.x - a.x, dy = b.y - a.y;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(dx), h = Math.abs(dy);
    if (currentTool === 'box'){
      ctx.strokeRect(x,y,w,h); ctx.fillRect(x,y,w,h);
    } else if (currentTool === 'circle'){
      ctx.beginPath();
      ctx.ellipse(a.x,a.y,Math.abs(dx),Math.abs(dy),0,0,Math.PI*2);
      ctx.fill(); ctx.stroke();
    }
  }

  function clearOverlay(){ ctx.clearRect(0,0,overlay.width,overlay.height); }

  // create body from drag
  function createBodyFromDrag(a,b,shift){
    const dx = b.x - a.x, dy = b.y - a.y;
    if (currentTool === 'box'){
      let w = Math.max(6, Math.abs(dx));
      let h = Math.max(6, Math.abs(dy));
      if (shift){ const s = Math.max(w,h); w = h = s; }
      const cx = a.x + dx/2, cy = a.y + dy/2;
      const body = Bodies.rectangle(cx, cy, w, h, {
        restitution: 0.2, friction: 0.6,
        render: { fillStyle: currentColor, strokeStyle:'#444', lineWidth:1 }
      });
      World.add(engine.world, body);
      bodiesMeta.set(body.id, { w, h });
    } else if (currentTool === 'circle'){
      const rx = Math.max(4, Math.abs(dx));
      const ry = Math.max(4, Math.abs(dy));
      // create approximated ellipse by circle radius = average but show as circle; to support ellipse visuals we store scale
      const r = Math.max(6, Math.hypot(rx, ry)/Math.SQRT2);
      const body = Bodies.circle(a.x, a.y, r, {
        restitution: 0.25, friction: 0.5,
        render: { fillStyle: currentColor, strokeStyle:'#444', lineWidth:1 }
      });
      World.add(engine.world, body);
      bodiesMeta.set(body.id, { r, scaleX: rx/r, scaleY: ry/r });
      // apply visual scale (use Body.scale to set shape)
      Body.scale(body, Math.max(0.01, rx/r), Math.max(0.01, ry/r));
    }
  }

  // selection
  function setSelectedBody(body){
    selectedBody = body;
    updateInspector();
  }

  function updateInspector(){
    if (!selectedBody){
      selName.textContent = 'none';
      propX.value = '';
      propY.value = '';
      propAngle.value = '';
      propScaleX.value = '';
      propScaleY.value = '';
      propColor.value = '#ffffff';
      propAnchor.checked = false;
    } else {
      selName.textContent = 'body #' + selectedBody.id;
      propX.value = Math.round(selectedBody.position.x);
      propY.value = Math.round(selectedBody.position.y);
      propAngle.value = (selectedBody.angle || 0).toFixed(2);
      // scale: infer from stored meta if present
      const meta = bodiesMeta.get(selectedBody.id);
      if (meta){
        if (meta.w && meta.h){
          propScaleX.value = (selectedBody.bounds.max.x - selectedBody.bounds.min.x) / meta.w;
          propScaleY.value = (selectedBody.bounds.max.y - selectedBody.bounds.min.y) / meta.h;
          propColor.value = selectedBody.render.fillStyle || '#ffffff';
        } else if (meta.r){
          propScaleX.value = meta.scaleX || 1;
          propScaleY.value = meta.scaleY || 1;
          propColor.value = selectedBody.render.fillStyle || '#ffffff';
        } else {
          propScaleX.value = 1; propScaleY.value = 1;
          propColor.value = selectedBody.render.fillStyle || '#ffffff';
        }
      } else {
        propScaleX.value = 1; propScaleY.value = 1;
        propColor.value = selectedBody.render.fillStyle || '#ffffff';
      }
      propAnchor.checked = selectedBody.isStatic;
    }
  }

  applyProps.addEventListener('click', ()=>{
    if (!selectedBody) return;
    // position
    const nx = parseFloat(propX.value), ny = parseFloat(propY.value);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)){
      Body.setPosition(selectedBody, { x: nx, y: ny });
    }
    // angle
    const ang = parseFloat(propAngle.value);
    if (!Number.isNaN(ang)) Body.setAngle(selectedBody, ang);
    // scale
    const sx = parseFloat(propScaleX.value) || 1;
    const sy = parseFloat(propScaleY.value) || 1;
    const meta = bodiesMeta.get(selectedBody.id);
    if (meta){
      if (meta.w && meta.h){
        // current bounds -> compute scale relative to original
        const curW = selectedBody.bounds.max.x - selectedBody.bounds.min.x;
        const curH = selectedBody.bounds.max.y - selectedBody.bounds.min.y;
        const targetW = meta.w * sx, targetH = meta.h * sy;
        const sxRatio = targetW / curW;
        const syRatio = targetH / curH;
        Body.scale(selectedBody, sxRatio, syRatio);
      } else if (meta.r){
        // circle-based body: scale by ratio
        const curW = selectedBody.bounds.max.x - selectedBody.bounds.min.x;
        const curH = selectedBody.bounds.max.y - selectedBody.bounds.min.y;
        const targetW = meta.r * 2 * sx;
        const targetH = meta.r * 2 * sy;
        const sxRatio = targetW / curW;
        const syRatio = targetH / curH;
        Body.scale(selectedBody, sxRatio, syRatio);
        // update stored scale
        meta.scaleX = sx; meta.scaleY = sy;
        bodiesMeta.set(selectedBody.id, meta);
      }
    }
    // color
    selectedBody.render.fillStyle = propColor.value;
    // anchor/freeze
    if (propAnchor.checked) {
      Body.setStatic(selectedBody, true);
    } else {
      Body.setStatic(selectedBody, false);
    }
    updateInspector();
  });

  deleteObj.addEventListener('click', ()=>{
    if (selectedBody) { removeBody(selectedBody); setSelectedBody(null); }
  });

  function removeBody(b){
    // remove constraints attached to it
    const toRemove = [];
    for (let c of constraints){
      if (c.bodyA === b || c.bodyB === b){
        World.remove(engine.world, c.mConstraint);
        toRemove.push(c);
      }
    }
    toRemove.forEach(x=>{
      const idx = constraints.indexOf(x); if (idx>=0) constraints.splice(idx,1);
    });
    Composite.remove(engine.world, b);
    bodiesMeta.delete(b.id);
  }

  // Constraint creation
  function makeConstraintBetween(a,b){
    const type = constraintTypeEl.value;
    const stiffness = parseFloat(constraintStiffEl.value);
    const lenInput = parseFloat(constraintLenEl.value);
    const diffX = a.position.x - b.position.x, diffY = a.position.y - b.position.y;
    const naturalLen = isFinite(lenInput) && lenInput >= 0 ? lenInput : Math.hypot(diffX, diffY);

    // create Matter.Constraint (mConstraint) and a wrapper for meta
    const mConstraint = Constraint.create({
      bodyA: a,
      bodyB: b,
      length: naturalLen,
      stiffness: Math.max(0.01, Math.min(1, stiffness)),
      damping: type === 'spring' ? 0.02 : 0.0,
      render: { visible: false } // we'll draw custom visuals on overlay
    });
    World.add(engine.world, mConstraint);
    const meta = { mConstraint, type, stiffness: mConstraint.stiffness, length: mConstraint.length };
    constraints.push(meta);
  }

  function cancelCreatingConstraint(){ creatingConstraint = null; clearOverlay(); }

  // overlay drawing: constraints + selection + temp rope
  function drawOverlay(){
    clearOverlay();
    // draw constraints
    for (let c of constraints){
      const m = c.mConstraint;
      if (!m) continue;
      const a = m.bodyA.position, b = m.bodyB.position;
      drawConstraintVisual(a,b,c);
    }
    // draw temp creation line if in constraint mode
    if (creatingConstraint){
      const from = creatingConstraint.from.position;
      const to = creatingConstraint.tempPos;
      drawTempRope(from,to);
    }
    // highlight selected body
    if (selectedBody){
      highlightBody(selectedBody);
    }
  }

  function drawConstraintVisual(a,b,c){
    const ax = a.x, ay = a.y, bx = b.x, by = b.y;
    ctx.beginPath();
    if (c.type === 'spring'){
      // draw spring: zigzag between points
      const segs = 12;
      const dx = (bx - ax), dy = (by - ay);
      const len = Math.hypot(dx,dy);
      const ux = dx / len, uy = dy / len;
      // perpendicular
      const px = -uy, py = ux;
      ctx.moveTo(ax, ay);
      for (let i=1;i<=segs;i++){
        const t = i / segs;
        const nx = ax + dx * t;
        const ny = ay + dy * t;
        const amp = Math.sin(t * Math.PI) * 8 * (1 - c.mConstraint.stiffness); // more stiffness -> less wiggle
        const ox = nx + px * amp;
        const oy = ny + py * amp;
        ctx.lineTo(ox, oy);
      }
      ctx.strokeStyle = 'rgba(100,60,180,0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // rope: straight line with slight shading
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = 'rgba(80,80,80,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  function drawTempRope(a,b){
    ctx.beginPath();
    ctx.moveTo(a.x,a.y);
    ctx.lineTo(b.x,b.y);
    ctx.strokeStyle = 'rgba(120,120,120,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6,4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function highlightBody(b){
    ctx.beginPath();
    // draw bounding box highlight
    const minX = b.bounds.min.x, minY = b.bounds.min.y, w = b.bounds.max.x - b.bounds.min.x, h = b.bounds.max.y - b.bounds.min.y;
    ctx.strokeStyle = 'rgba(30,120,200,0.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4,4]);
    roundRect(ctx, minX-4, minY-4, w+8, h+8, 6);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  // update loop: overlay + debug
  let frameCount = 0, lastTime = performance.now(), fps = 0;
  Events.on(render, 'afterRender', ()=>{
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000){
      fps = frameCount; frameCount = 0; lastTime = now;
    }
    fpsEl.textContent = fps;
    bodiesEl.textContent = engine.world.bodies.length;
    consEl.textContent = constraints.length;
    toolEl.textContent = currentTool;
    drawOverlay();
  });

  // physics selection via mouse click (when in select mode)
  // use mouseConstraint events to detect clicks on bodies
  Events.on(mouseConstraint, 'mousedown', function(e){
    // if current tool is none, select body under mouse
    if (currentTool === 'none'){
      const mpos = e.mouse.position;
      const b = bodyAt(mpos);
      if (b && !b.isStatic) {
        setSelectedBody(b);
      } else setSelectedBody(null);
    } else if (currentTool === 'constraint' && selectionMode === 'constraintSelect'){
      // in constraint select mode: begin creating constraint by picking source on mouse down
      const b = bodyAt(e.mouse.position);
      if (b){
        creatingConstraint = { from: b, tempPos: e.mouse.position };
      }
    }
  });

  // helper to make inspector draggable
  makePanelDraggable(inspector);
  makePanelDraggable(debug);

  // inspector interactions (dragging values also update)
  propX.addEventListener('change', ()=>{ if (selectedBody) Body.setPosition(selectedBody, {x: parseFloat(propX.value), y: selectedBody.position.y}); });
  propY.addEventListener('change', ()=>{ if (selectedBody) Body.setPosition(selectedBody, {x: selectedBody.position.x, y: parseFloat(propY.value)}); });
  propAngle.addEventListener('change', ()=>{ if (selectedBody) Body.setAngle(selectedBody, parseFloat(propAngle.value)); });
  propColor.addEventListener('input', ()=>{ if (selectedBody) selectedBody.render.fillStyle = propColor.value; });

  // helper functions
  function getMouse(e){ const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }

  function makePanelDraggable(el){
    const title = el.querySelector('.panel-title');
    let dragging = false, ox=0, oy=0;
    title.addEventListener('mousedown', (ev)=>{
      dragging = true; ox = ev.clientX - el.offsetLeft; oy = ev.clientY - el.offsetTop;
      title.style.cursor='grabbing';
      ev.preventDefault();
    });
    window.addEventListener('mousemove', (ev)=>{
      if (!dragging) return;
      el.style.left = (ev.clientX - ox) + 'px';
      el.style.top = (ev.clientY - oy) + 'px';
    });
    window.addEventListener('mouseup', ()=>{ dragging=false; title.style.cursor='grab';});
  }

  function cancelCreatingConstraint(){ creatingConstraint = null; clearOverlay(); }

  function removeConstraint(meta){
    if (!meta) return;
    World.remove(engine.world, meta.mConstraint);
    const idx = constraints.indexOf(meta);
    if (idx >= 0) constraints.splice(idx,1);
  }

  

  // utility: cleanly set tool programmatically
  function setTool(t){
    currentTool = t;
    toolBtns.forEach(b=>b.classList.toggle('active', b.dataset.tool === t));
    updateCursor();
    if (t !== 'constraint') cancelCreatingConstraint();
  }

  // initial demo bodies
  const demo1 = Bodies.rectangle(300,120,120,24,{ render:{ fillStyle:'#d6e7ff' }});
  const demo2 = Bodies.rectangle(380,100,60,60,{ render:{ fillStyle:'#ffd6c9' }});
  const demo3 = Bodies.circle(480,60,30,{ render:{ fillStyle:'#e6ffd9' }});
  World.add(engine.world, [demo1,demo2,demo3]);
  bodiesMeta.set(demo1.id,{w:120,h:24});
  bodiesMeta.set(demo2.id,{w:60,h:60});
  bodiesMeta.set(demo3.id,{r:30,scaleX:1,scaleY:1});

  // expose small API for debugging in global
  window.__physiber = {
    engine, world: engine.world, setTool,
    makeConstraintBetween(a,b){ makeConstraintBetween(a,b); }
  };

  // --- PHYSIBER EXTRAS: GIZMOS + PAUSE + DIRECT DRAGGING ---

let paused = false;
const pauseBtn = document.createElement('button');
pauseBtn.textContent = 'Pause';
pauseBtn.className = 'panel-btn';

pauseBtn.style.cursor = 'pointer';
document.body.appendChild(pauseBtn);

pauseBtn.addEventListener('click', togglePause);
window.addEventListener('keydown', e=>{
  if (e.key.toLowerCase() === 'p') togglePause();
});

function togglePause(){
  paused = !paused;
  if (paused){
    Runner.stop(runner);
    pauseBtn.textContent = 'Unpause';
  } else {
    Runner.run(runner, engine);
    pauseBtn.textContent = 'Pause';
  }
}

// --- DRAGGING IN SELECT MODE ---
let draggingBody = null;
let dragOffset = null;

canvas.addEventListener('mousedown', e=>{
  if (currentTool === 'none' && !paused){
    const pos = getMouse(e);
    const b = bodyAt(pos);
    if (b && !b.isStatic){
      draggingBody = b;
      dragOffset = { x: pos.x - b.position.x, y: pos.y - b.position.y };
    }
  }
});

window.addEventListener('mousemove', e=>{
  if (draggingBody && !paused){
    const pos = getMouse(e);
    Body.setPosition(draggingBody, { x: pos.x - dragOffset.x, y: pos.y - dragOffset.y });
  }
});

window.addEventListener('mouseup', ()=>{
  draggingBody = null;
});

// --- GIZMOS ---
let gizmo = { active: false, mode: null }; // mode: 'translate','rotate','scale'
function drawGizmos(){
  if (!selectedBody) return;
  const b = selectedBody;
  const pos = b.position;
  const r = Math.max(20, Math.min(40, (b.bounds.max.x - b.bounds.min.x) * 0.3));

  // translate handle (center dot)
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 6, 0, Math.PI*2);
  ctx.fillStyle = gizmo.active && gizmo.mode==='translate' ? '#44f' : '#00aaff';
  ctx.fill();

  // rotate handle (circle ring)
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI*2);
  ctx.strokeStyle = gizmo.active && gizmo.mode==='rotate' ? '#44f' : '#aaa';
  ctx.lineWidth = 2;
  ctx.stroke();

  // scale handle (bottom-right)
  const bx = b.bounds.max.x + 10;
  const by = b.bounds.max.y + 10;
  ctx.beginPath();
  ctx.rect(bx - 6, by - 6, 12, 12);
  ctx.fillStyle = gizmo.active && gizmo.mode==='scale' ? '#44f' : '#0a0';
  ctx.fill();
}

function hitGizmo(pos){
  if (!selectedBody) return null;
  const b = selectedBody;
  const center = b.position;
  const r = Math.max(20, Math.min(40, (b.bounds.max.x - b.bounds.min.x) * 0.3));
  const bx = b.bounds.max.x + 10;
  const by = b.bounds.max.y + 10;

  const dx = pos.x - center.x, dy = pos.y - center.y;
  const dist = Math.hypot(dx,dy);
  if (dist < 8) return 'translate';
  if (Math.abs(pos.x - bx) < 10 && Math.abs(pos.y - by) < 10) return 'scale';
  if (Math.abs(dist - r) < 8) return 'rotate';
  return null;
}

let gizmoDragStart = null;
window.addEventListener('mousedown', e=>{
  if (!selectedBody || currentTool!=='none') return;
  const pos = getMouse(e);
  const mode = hitGizmo(pos);
  if (mode){
    gizmo.active = true;
    gizmo.mode = mode;
    gizmoDragStart = { pos, body: {...selectedBody.position}, angle: selectedBody.angle };
  }
});

window.addEventListener('mousemove', e=>{
  if (!gizmo.active || !selectedBody) return;
  const pos = getMouse(e);
  const start = gizmoDragStart.pos;
  const b = selectedBody;

  if (gizmo.mode === 'translate'){
    Body.setPosition(b, { x: pos.x, y: pos.y });
  } else if (gizmo.mode === 'rotate'){
    const dx1 = start.x - b.position.x;
    const dy1 = start.y - b.position.y;
    const dx2 = pos.x - b.position.x;
    const dy2 = pos.y - b.position.y;
    const ang1 = Math.atan2(dy1, dx1);
    const ang2 = Math.atan2(dy2, dx2);
    Body.setAngle(b, gizmoDragStart.angle + (ang2 - ang1));
  } else if (gizmo.mode === 'scale'){
    const meta = bodiesMeta.get(b.id);
    if (meta){
      const dist0 = Math.hypot(start.x - b.position.x, start.y - b.position.y);
      const dist1 = Math.hypot(pos.x - b.position.x, pos.y - b.position.y);
      const scale = dist1 / dist0;
      Body.scale(b, scale, scale);
    }
  }
});

window.addEventListener('mouseup', ()=>{
  gizmo.active = false;
  gizmo.mode = null;
});

// integrate gizmo drawing into overlay render
const oldDrawOverlay = drawOverlay;
drawOverlay = function(){
  oldDrawOverlay();
  drawGizmos();
};

document.getElementById('quitBtn').addEventListener('click', () => {
  window.location.href = '../../index.html';
});


})();
