// Classic Pong + smooth motion + powerups + difficulty + particles + notifications
// Place this in projects/pong/p.js

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

/* ---------- game state ---------- */
let player1Name = "Player 1";
let player2Name = "Player 2";
let roundsToWin = 9;
let scores = [0, 0];
let playing = false;
let paused = false;
let winnerName = null;
let mode = 'normal'; // easy / normal / hard

/* physics / objects (manual, not matter) */
const paddleW = 12;
const paddleHBase = 110;
let paddleH = paddleHBase;
const p1 = { x: 40, y: 0, vy: 0 };
const p2 = { x: 0, y: 0, vy: 0 };
const ball = { x:0, y:0, vx:0, vy:0, r:10 };
let particles = [];
let powerups = []; // {x,y,type,ttl}

/* tuning per mode */
const ModeSettings = {
  easy:   { ballSpeed: 5, paddleH: 140, spawnPowerups: true },
  normal: { ballSpeed: 6.2, paddleH: 110, spawnPowerups: true },
  hard:   { ballSpeed: 8.0, paddleH: 90, spawnPowerups: false }
};

/* input */
const keys = {};
document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup', e => keys[e.key] = false);

/* UI hooks */
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const demoBtn = document.getElementById('demoBtn');
const name1El = document.getElementById('name1');
const name2El = document.getElementById('name2');
const score1El = document.getElementById('score1');
const score2El = document.getElementById('score2');
const alertsWrap = document.getElementById('alerts');

/* notifications */
function createNotification(txt, duration=2800){
  const el = document.createElement('div');
  el.className = 'alert';
  el.textContent = txt;
  alertsWrap.prepend(el);
  setTimeout(()=> {
    el.style.opacity = '0';
    el.style.transform = 'translateX(8px)';
    setTimeout(()=> el.remove(),200);
  }, duration);
}

/* particles */
function spawnParticles(x,y,color='white',count=10,spread=3){
  for(let i=0;i<count;i++){
    particles.push({
      x, y,
      vx: (Math.random()*2-1) * spread,
      vy: (Math.random()*2-1) * spread,
      life: 1 + Math.random()*0.6,
      color
    });
  }
}

/* powerup mechanics */
const PowerTypes = {
  "shrink": { label:"Shrink Opponent", ttl:8000 },
  "slow":   { label:"Ball Slow", ttl:7000 },
  "grow":   { label:"Grow Paddle", ttl:7000 },
  "split":  { label:"Split Ball", ttl:1 } // instant effect
};

function spawnPowerup(){
  const types = Object.keys(PowerTypes);
  const type = types[Math.floor(Math.random()*types.length)];
  const x = 100 + Math.random()*(canvas.width-200);
  const y = 80 + Math.random()*(canvas.height-160);
  powerups.push({ x, y, type, ttl: 12*60 }); // frames
}

/* setup round */
function resetRound(centerServe=true){
  paddleH = ModeSettings[mode].paddleH;
  p1.y = (canvas.height - paddleH)/2;
  p2.y = p1.y;
  p1.vy = 0; p2.vy = 0;
  ball.x = canvas.width/2;
  ball.y = canvas.height/2;
  const speed = ModeSettings[mode].ballSpeed;
  const dir = centerServe ? (Math.random()>0.5?1:-1) : (Math.random()>0.5?1:-1);
  const ang = (Math.random()*0.8 - 0.4);
  ball.vx = speed * dir;
  ball.vy = speed * ang;
  // clear powerups sometimes
  powerups = powerups.filter(() => Math.random()<0.5);
}

/* score handling */
function awardPoint(side){
  if(side === 1) scores[0]++; else scores[1]++;
  updateScoreUI();
  createNotification(`${side===1?player1Name:player2Name} scores! (${scores[0]} - ${scores[1]})`);
  spawnParticles(canvas.width/2, canvas.height/2, 'white', 30, 6);
  if(scores[0] >= roundsToWin || scores[1] >= roundsToWin){
    playing = false;
    winnerName = scores[0] >= roundsToWin ? player1Name : player2Name;
    showWinner();
  } else {
    resetRound();
  }
}

/* UI update */
function updateScoreUI(){
  score1El.textContent = scores[0];
  score2El.textContent = scores[1];
  name1El.textContent = player1Name;
  name2El.textContent = player2Name;
}

/* collisions helpers */
function rectCircleCollide(rx, ry, rw, rh, cx, cy, cr){
  // simple AABB vs circle
  const nearestX = Math.max(rx, Math.min(cx, rx+rw));
  const nearestY = Math.max(ry, Math.min(cy, ry+rh));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return (dx*dx + dy*dy) < cr*cr;
}

/* powerup pick */
function applyPowerup(type, collectorSide){
  // collectorSide 1 or 2
  const other = collectorSide===1?2:1;
  createNotification(`${collectorSide===1?player1Name:player2Name} got ${PowerTypes[type].label}!`);
  if(type === 'shrink'){
    if(other === 1) p1._shrink = performance.now();
    else p2._shrink = performance.now();
  } else if(type === 'grow'){
    if(collectorSide===1) p1._grow = performance.now(); else p2._grow = performance.now();
  } else if(type === 'slow'){
    ball.vx *= 0.6; ball.vy *= 0.6;
  } else if(type === 'split'){
    // create a faint extra ball as visual effect and nudge
    spawnParticles(ball.x, ball.y, 'white', 40, 6);
    ball.vx *= 1.05; ball.vy *= -1; // chaotic
  }
}

/* main update loop */
function updateLogic() {
  if(!playing || paused) return;

  // paddle input (smooth)
  const accel = 0.9;
  if(keys['w']) p1.vy -= accel;
  if(keys['s']) p1.vy += accel;
  if(keys['ArrowUp']) p2.vy -= accel;
  if(keys['ArrowDown']) p2.vy += accel;

  // tiny AI/demo for demo button when playing demo
  if(demoMode){
    // basic follow ball for p2
    const target = ball.y - paddleH/2;
    const diff = target - p2.y;
    p2.vy += Math.sign(diff) * 0.4;
  }

  // damping
  p1.vy *= 0.9; p2.vy *= 0.9;
  p1.y += p1.vy; p2.y += p2.vy;

  // clamp paddles
  p1.y = Math.max(6, Math.min(canvas.height - paddleH - 6, p1.y));
  p2.y = Math.max(6, Math.min(canvas.height - paddleH - 6, p2.y));

  // ball physics
  ball.x += ball.vx; ball.y += ball.vy;

  // top/bottom bounce
  if(ball.y - ball.r < 0){ ball.y = ball.r; ball.vy *= -1; spawnParticles(ball.x, ball.y, 'white', 8); }
  if(ball.y + ball.r > canvas.height){ ball.y = canvas.height - ball.r; ball.vy *= -1; spawnParticles(ball.x, ball.y, 'white', 8); }

  // paddle collisions
  if(rectCircleCollide(p1.x, p1.y, paddleW, paddleH, ball.x, ball.y, ball.r)){
    ball.x = p1.x + paddleW + ball.r;
    ball.vx = Math.abs(ball.vx) * 1.02; // speed up a tiny bit
    // angle based on hit position
    const rel = (ball.y - (p1.y + paddleH/2)) / (paddleH/2);
    ball.vy += rel * 3;
    spawnParticles(ball.x, ball.y, 'white', 12, 4);
  }
  if(rectCircleCollide(p2.x, p2.y, paddleW, paddleH, ball.x, ball.y, ball.r)){
    ball.x = p2.x - ball.r;
    ball.vx = -Math.abs(ball.vx) * 1.02;
    const rel = (ball.y - (p2.y + paddleH/2)) / (paddleH/2);
    ball.vy += rel * 3;
    spawnParticles(ball.x, ball.y, 'white', 12, 4);
  }

  // score out of bounds
  if(ball.x < -30) awardPoint(2);
  if(ball.x > canvas.width + 30) awardPoint(1);

  // powerups lifetime and collision
  for(let i=powerups.length-1;i>=0;i--){
    const pu = powerups[i];
    pu.ttl--;
    // draw handled in render; check collision with paddles
    // if near p1
    const coll1 = Math.hypot((pu.x)-(p1.x+paddleW/2), (pu.y)-(p1.y+paddleH/2)) < 60;
    const coll2 = Math.hypot((pu.x)-(p2.x+paddleW/2), (pu.y)-(p2.y+paddleH/2)) < 60;
    if(coll1){ applyPowerup(pu.type, 1); powerups.splice(i,1); spawnParticles(pu.x, pu.y, 'white', 18, 5); continue; }
    if(coll2){ applyPowerup(pu.type, 2); powerups.splice(i,1); spawnParticles(pu.x, pu.y, 'white', 18, 5); continue; }
    if(pu.ttl <= 0) powerups.splice(i,1);
  }

  // particles update
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.05; // gravity-ish tiny
    p.life -= 0.02;
    if(p.life <= 0) particles.splice(i,1);
  }

  // handle temporary effects (grow/shrink)
  const now = performance.now();
  // shrink lasts 8s -> shrink paddle of the side flagged
  if(p1._shrink && now - p1._shrink < PowerTypes['shrink'].ttl){
    paddleH = ModeSettings[mode].paddleH * 0.6;
  } else if(p2._shrink && now - p2._shrink < PowerTypes['shrink'].ttl){
    paddleH = ModeSettings[mode].paddleH * 0.6;
  } else if((p1._grow && now - p1._grow < PowerTypes['grow'].ttl) || (p2._grow && now - p2._grow < PowerTypes['grow'].ttl)){
    paddleH = ModeSettings[mode].paddleH * 1.3;
  } else {
    paddleH = ModeSettings[mode].paddleH;
  }
}

/* Demo flag */
let demoMode = false;

/* render */
function renderAll(){
  // clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // center dashed line
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14,10]);
  ctx.beginPath();
  ctx.moveTo(canvas.width/2, 20);
  ctx.lineTo(canvas.width/2, canvas.height-20);
  ctx.stroke();
  ctx.setLineDash([]);

  // paddles
  ctx.fillStyle = '#fff';
  ctx.fillRect(p1.x, p1.y, paddleW, paddleH);
  ctx.fillRect(p2.x, p2.y, paddleW, paddleH);

  // ball with slight glow
  ctx.beginPath();
  ctx.fillStyle = '#fff';
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
  ctx.fill();

  // powerups
  powerups.forEach(pu => {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pu.type[0].toUpperCase(), pu.x, pu.y);
    ctx.restore();
  });

  // particles
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 3, 3);
  });
  ctx.globalAlpha = 1;
}

/* main loop */
function gameLoop(){
  updateLogic();
  renderAll();
  if(playing) requestAnimationFrame(gameLoop);
}

/* start / demo buttons */
startBtn.addEventListener('click', ()=>{
  demoMode = false;
  startMatch();
});
demoBtn.addEventListener('click', ()=>{
  demoMode = true;
  startMatch(true);
});

function startMatch(isDemo=false){
  // read inputs
  const p1nm = document.getElementById('player1').value.trim();
  const p2nm = document.getElementById('player2').value.trim();
  player1Name = p1nm || 'Player 1';
  player2Name = p2nm || 'Player 2';
  mode = document.getElementById('mode').value;
  roundsToWin = Math.max(1, Math.min(15, parseInt(document.getElementById('rounds').value || '9')));
  // init variables
  demosetup = isDemo;
  demoMode = isDemo;
  scores = [0,0];
  updateScoreUI();
  roundsToWin = roundsToWin;
  overlay.style.display = 'none';
  playing = true;
  paused = false;
  winnerName = null;
  resetRound();
  // set paddle X
  p1.x = 40;
  p2.x = canvas.width - 40 - paddleW;
  resetRound();
  createNotification(`Starting: ${player1Name} vs ${player2Name} — Mode: ${mode.toUpperCase()}`);
  // powerups spawn schedule depending on mode
  if(ModeSettings[mode].spawnPowerups){
    spawnPowerup(); // immediate chance
    // spawn loop
    powerupSpawner = setInterval(()=> {
      if(playing && Math.random()<0.65) spawnPowerup();
    }, 4200);
  }
  gameLoop();
}
let powerupSpawner = null;

/* show winner overlay */
function showWinner(){
  // stop spawner
  if(powerupSpawner){ clearInterval(powerupSpawner); powerupSpawner = null; }
  // create overlay element
  const ov = document.createElement('div');
  ov.id = 'winnerOverlay';
  ov.innerHTML = `<div>${winnerName} wins the tournament! (${scores[0]} - ${scores[1]})</div>`;
  const rematch = document.createElement('button');
  rematch.textContent = 'Play Again';
  rematch.onclick = () => {
    ov.remove();
    startMatch(demoMode);
  };
  const quit = document.createElement('button');
  quit.textContent = 'Quit to Menu';
  quit.onclick = () => {
    ov.remove();
    overlay.style.display = 'flex';
    playing = false;
    paused = false;
    // clear spawner
    if(powerupSpawner){ clearInterval(powerupSpawner); powerupSpawner = null; }
  };
  ov.appendChild(rematch);
  ov.appendChild(quit);
  document.body.appendChild(ov);
}

    const notesToggle = document.getElementById("notes-toggle");
const notes = document.getElementById("notes");
let notesOpen = false;

notesToggle.addEventListener("click", () => {
  notesOpen = !notesOpen;
  notes.style.bottom = notesOpen ? "20px" : "-320px";
});

/* pause / resume with P */
document.addEventListener('keydown', (e) => {
  if(e.key.toLowerCase()==='p'){
    if(!playing) return;
    paused = !paused;
    if(paused) createNotification('Paused');
    else createNotification('Resumed');
    if(!paused) gameLoop();
  }
});

/* utility: random chance spawn powerups on wall hits, etc. We already spawn on timer. */

/* initial UI defaults */
function initUI(){
  document.getElementById('mode').value = 'normal';
  document.getElementById('rounds').value = '9';
  updateScoreUI();
}
initUI();

/* start with overlay visible by default (user changed HTML title already) */
overlay.style.display = 'flex';

/* ensure paddle initial positions set when page loads */
resetRound();

/* small tweak: if window loses focus, pause for safety */
window.addEventListener('blur', ()=> {
  if(playing && !paused){ paused = true; createNotification('Paused (lost focus)'); }
});

/* Done */
