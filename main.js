// ----- TYPEWRITER -----
const title = document.getElementById("title");
const text = "gallery with things yes";
let idx = 0;
// ----- PROJECT MAP -----
const projectMap = {
  "pong": "pong.html",
  "ui": "ui.html",
  "Project 3": "project3.html"
};

function typeWriter() {
  if (idx < text.length) {
    const span = document.createElement("span");
    span.textContent = text[idx];
    span.style.opacity = 0;
    span.style.transition = "opacity 0.4s ease, transform 0.3s cubic-bezier(0.68,-0.55,0.27,1.55)";
    span.style.transform = `translateY(${Math.random()*10}px)`;
    title.appendChild(span);
    requestAnimationFrame(() => {
      span.style.opacity = 1;
      span.style.transform = "translateY(0)";
    });
    idx++;
    setTimeout(typeWriter, 1 + Math.random()*80);
  }
}
typeWriter();

// ----- SIDEBAR TOGGLE -----
const triangle = document.getElementById("triangle");
const sidebar = document.getElementById("sidebar");
let open = false;
triangle.addEventListener("click", () => {
  open = !open;

  // Sidebar slide
  sidebar.style.left = open ? "0px" : "-260px";

  // Triangle glide to other side smoothly
  if(open) {
    triangle.style.left = sidebar.offsetWidth-20 + "px"; // moves right, just past sidebar
    triangle.style.transform = "translateY(-50%) rotate(180deg)";
  } else {
    triangle.style.left = "0px"; // back to left
    triangle.style.transform = "translateY(-50%) rotate(0deg)";
  }
});


// ----- NOTIFICATIONS -----
function createNotification(msg, dur=3000){
  const n = document.createElement("div");
  n.className = "notification";
  n.innerHTML = `<span>${msg}</span><button>&times;</button>`;
  document.body.appendChild(n);

  n.style.opacity = 0;
  n.style.transform = "translateY(-30px) scale(0.9)";
  requestAnimationFrame(()=>{ n.style.opacity=1; n.style.transform="translateY(0) scale(1)"; });

  const closeBtn = n.querySelector("button");
  closeBtn.onclick = () => close(n);
  setTimeout(()=>close(n), dur);

  function close(el){
    el.style.opacity = 0;
    el.style.transform = "translateY(-30px) scale(0.9)";
    setTimeout(()=>el.remove(),350);
  }
}

// ----- NOTES TOGGLE -----
const notesToggle = document.getElementById("notes-toggle");
const notes = document.getElementById("notes");
let notesOpen = false;
notesToggle.addEventListener("click",()=>{
  notesOpen = !notesOpen;
  notes.style.bottom = notesOpen ? "10px" : "-320px";
});

// ----- DRAG & DROP -----
const projects = document.querySelectorAll(".project");
const loader = document.getElementById("project-loader");
let loadedProject = null;

projects.forEach(p=>{
  let dragging=false, clone=null, offsetX=0, offsetY=0;

  p.addEventListener("mousedown", e=>{
    e.preventDefault();
    dragging=true;
    const rect = p.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    clone = p.cloneNode(true);
    clone.style.position="absolute";
    clone.style.left=rect.left+"px";
    clone.style.top=rect.top+"px";
    clone.style.pointerEvents="none";
    clone.style.zIndex=1000;
    clone.style.opacity=0.85;
    clone.style.boxShadow="0 20px 50px rgba(0,0,0,0.6)";
    clone.style.transition="transform 0.2s ease";
    document.body.appendChild(clone);
    p.style.opacity=0.4;
  });

  document.addEventListener("mousemove", e=>{
    if(!dragging||!clone)return;
    clone.style.left = e.clientX-offsetX+"px";
    clone.style.top = e.clientY-offsetY+"px";

    // magnetic effect
    const rect = loader.getBoundingClientRect();
    const dx = (e.clientX)-(rect.left+rect.width/2);
    const dy = (e.clientY)-(rect.top+rect.height/2);
    const dist = Math.hypot(dx,dy);
    clone.style.transform = dist<100 ? `scale(${1+(100-dist)/500})` : "scale(1)";
  });

  document.addEventListener("mouseup", e=>{
    if(!dragging||!clone)return;
    dragging=false;
    p.style.opacity=1;
    const rect = loader.getBoundingClientRect();
    const cloneRect = clone.getBoundingClientRect();
    const centerX = cloneRect.left+cloneRect.width/2;
    const centerY = cloneRect.top+cloneRect.height/2;

    if(centerX>=rect.left && centerX<=rect.right &&
       centerY>=rect.top && centerY<=rect.bottom){
      loadedProject = p.dataset.name;
      loader.textContent = loadedProject;
      createNotification(`Loaded ${loadedProject}!`);
      loader.style.transform="scale(1.15)";
      setTimeout(()=>loader.style.transform="scale(1)",200);
    }
    clone.remove();
    clone=null;
  });
});

// ----- INITIALIZE BUTTON -----
document.getElementById("initialize").addEventListener("click", () => {
  if (!loadedProject) {
    createNotification("No projects loaded.", 2000);
    return;
  }

  // Construct the path dynamically
  const projectPath = `projects/${loadedProject}/${loadedProject}.html`;

  createNotification(`Opening ${loadedProject}...`, 2000);
  setTimeout(() => {
    window.location.href = projectPath;
  }, 500);
});

// ----- BACKGROUND PARTICLES -----
const canvas=document.createElement("canvas");
canvas.id="bgCanvas";
document.body.appendChild(canvas);
const ctx=canvas.getContext("2d");
canvas.width=innerWidth;
canvas.height=innerHeight;

let particles=[];
for(let i=0;i<150;i++){
  particles.push({x:Math.random()*canvas.width, y:Math.random()*canvas.height, r:Math.random()*2+1, speed:Math.random()*0.7+0.3});
}

function animateParticles(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  particles.forEach(p=>{
    p.y-=p.speed;
    if(p.y<0)p.y=canvas.height;
    ctx.fillStyle="#b288ff44";
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fill();
  });
  requestAnimationFrame(animateParticles);
}
animateParticles();

window.addEventListener("resize",()=>{
  canvas.width=innerWidth;
  canvas.height=innerHeight;
});
