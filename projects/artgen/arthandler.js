const canvas = document.getElementById('artCanvas');
const ctx = canvas.getContext('2d');

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let frame = 0;
let hue = 220;

let flowers = [];
let trees = [];
let plants = [];
let stars = [];
let fireflies = [];

// --- Utility Functions ---
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 26;
}

function pastelHue(offset = 0, sat = 60, light = 75, alpha = 0.5) {
  return `hsla(${(hue + offset) % 360}, ${sat}%, ${light}%, ${alpha})`;
}

// --- Math-based Spiral Flower ---
class SpiralFlower {
  constructor(x, y, petals, a = 4, b = 4) {
    this.x = x;
    this.y = y;
    this.petals = petals;
    this.a = a; // scale factor
    this.b = b; // spiral tightness
    this.progress = 0;
  }

  draw() {
    for (let i = 0; i < this.petals; i++) {
      const theta = i * 137.5 * Math.PI / 180; // golden angle
      const r = this.a * Math.sqrt(i) * (Math.sin(this.progress * Math.PI / 2) + 0.2);
      const px = this.x + r * Math.cos(theta);
      const py = this.y + r * Math.sin(theta);

      ctx.fillStyle = pastelHue(i * 2, 50, 70, 0.7);
      ctx.beginPath();
      ctx.arc(px, py, 1.5 + Math.sin(i * 0.1 + frame / 20), 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.progress < 1) this.progress += 0.01;
  }
}

// --- L-System Tree ---
class Tree {
  constructor(x, y, len, angle, depth) {
    this.x = x;
    this.y = y;
    this.len = len;
    this.angle = angle;
    this.depth = depth;
  }

  draw() {
    if (this.depth <= 0) return;
    const x2 = this.x + this.len * Math.cos(this.angle);
    const y2 = this.y - this.len * Math.sin(this.angle);

    ctx.strokeStyle = pastelHue(this.depth * 30, 60, 50, 0.6);
    ctx.lineWidth = Math.max(0.8, this.depth * 1.2);
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const newLen = this.len * 0.7;
    const angleOffset = Math.PI / 6;
    new Tree(x2, y2, newLen, this.angle - angleOffset, this.depth - 1).draw();
    new Tree(x2, y2, newLen, this.angle + angleOffset, this.depth - 1).draw();
  }
}

// --- Sinusoidal Plants ---
class Plant {
  constructor(x, y, h, sway) {
    this.x = x;
    this.y = y;
    this.height = h;
    this.sway = sway;
    this.phase = Math.random() * Math.PI * 2;
  }

  draw(frame) {
    const swayX = Math.sin(frame / 30 + this.phase) * this.sway;
    ctx.strokeStyle = pastelHue(120 + this.phase * 30, 60, 60, 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + swayX, this.y - this.height);
    ctx.stroke();
  }
}

// --- Stars with Sinusoidal Flicker ---
class Star {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height * 0.5;
    this.size = Math.random() * 1.5;
    this.baseAlpha = Math.random() * 0.5 + 0.5;
    this.phase = Math.random() * Math.PI * 2;
  }
  draw(frame) {
    const alpha = this.baseAlpha * (0.5 + 0.5 * Math.sin(frame / 50 + this.phase));
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Fireflies with Simple Harmonic Motion ---
class Firefly {
  constructor() {
    this.x0 = Math.random() * canvas.width;
    this.y0 = Math.random() * canvas.height * 0.7;
    this.size = 1 + Math.random() * 2;
    this.vx = Math.random() * 0.02 + 0.01;
    this.vy = Math.random() * 0.02 + 0.01;
    this.freq = Math.random() * 0.05 + 0.01;
    this.phase = Math.random() * Math.PI * 2;
  }
  draw(frame) {
    const t = frame;
    const x = this.x0 + Math.sin(t * this.freq + this.phase) * 50;
    const y = this.y0 + Math.cos(t * this.freq + this.phase) * 30;
    ctx.fillStyle = `rgba(255,255,150,0.6)`;
    ctx.beginPath();
    ctx.arc(x, y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Initialize Scene ---
function resetScene() {
  flowers = [];
  trees = [];
  plants = [];
  stars = [];
  fireflies = [];

  for (let i = 0; i < 6; i++) flowers.push(new SpiralFlower(Math.random() * canvas.width, canvas.height * 0.4 + Math.random() * canvas.height * 0.5, 300 + Math.floor(Math.random() * 200)));
  for (let i = 0; i < 4; i++) trees.push(new Tree(Math.random() * canvas.width, canvas.height, 60 + Math.random() * 40, Math.PI / 2 + (Math.random() * 0.2 - 0.1), 5 + Math.floor(Math.random() * 2)));
  for (let i = 0; i < 50; i++) plants.push(new Plant(Math.random() * canvas.width, canvas.height, 20 + Math.random() * 30, 5 + Math.random() * 3));
  for (let i = 0; i < 100; i++) stars.push(new Star());
  for (let i = 0; i < 30; i++) fireflies.push(new Firefly());
}

resetScene();

// --- Animation Loop ---
function animate() {
  frame++;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(10,10,30,0.95)');
  gradient.addColorStop(1, 'rgba(20,20,50,0.95)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  stars.forEach(s => s.draw(frame));
  fireflies.forEach(f => f.draw(frame));
  flowers.forEach(f => f.draw());
  trees.forEach(t => t.draw());
  plants.forEach(p => p.draw(frame));

  hue += 0.05;
  requestAnimationFrame(animate);
}

animate();
