window.addEventListener("resize", resize);

// Send player input packet every 50ms
setInterval(sendInput, 50);

// New active power-up mesh tracking list
let currentPowerUps = new Map(); 

// Global Camera Screen Shake Configuration Vector
let cameraShake = { time: 0, intensity: 0 };

// Setup Mobile Touch Joysticks State
let touchVector = { x: 0, z: 0 };
let joystickActive = false;
let mobileJumpHeld = false;

// Custom Mesh Builder for Power-Ups
function create3DPowerUpMesh(type) {
  const group = new THREE.Group();
  let geometry, material;

  if (type === "SPEED_BOOST") {
    geometry = new THREE.OctahedronGeometry(0.5, 0);
    material = new THREE.MeshStandardMaterial({
      color: 0xffd66e,
      emissive: 0xffa500,
      emissiveIntensity: 1.1,
      roughness: 0.1,
      metalness: 0.8
    });
  } else { // MEGA_BLAST
    geometry = new THREE.TorusGeometry(0.35, 0.12, 8, 24);
    material = new THREE.MeshStandardMaterial({
      color: 0xad9bff,
      emissive: 0x7b00ff,
      emissiveIntensity: 1.1,
      roughness: 0.2,
      metalness: 0.5
    });
  }

  const coreMesh = new THREE.Mesh(geometry, material);
  coreMesh.castShadow = true;
  group.add(coreMesh);

  // Faint matching ground ring aura for position visibility
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.5, 16),
    new THREE.MeshBasicMaterial({ color: material.color, side: THREE.DoubleSide, transparent: true, opacity: 0.3 })
  );
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.position.y = -0.4;
  group.add(ringMesh);

  return group;
}

// Intercept inputs to integrate Touch Joystick data alongside Key states
function sendInput() {
  if (!joined || !socket.connected || !myId) return;
  
  let x = Number(keys.has("keyd") || keys.has("d")) - Number(keys.has("keya") || keys.has("a"));
  let z = Number(keys.has("keys") || keys.has("s")) - Number(keys.has("keyw") || keys.has("w"));
  
  // If active phone touches are present, let joystick vectors override keyboard state
  if (joystickActive) {
    x = touchVector.x;
    z = touchVector.z;
  }
  
  socket.emit("input", { x, z, jump: keys.has("space") || mobileJumpHeld, yaw: aimYaw });
}

// Responsive Touch Controls Screen Interface Builder
function setupMobileHTMLDOMControls() {
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  if (document.getElementById("mobileUiOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "mobileUiOverlay";
  overlay.style.cssText = "position:absolute; bottom:20px; left:0; width:100%; height:140px; pointer-events:none; z-index:999; user-select:none;";

  overlay.innerHTML = `
    <div id="mJoystick" style="position:absolute; bottom:10px; left:25px; width:100px; height:100px; background:rgba(255,255,255,0.08); border:2px solid rgba(255,255,255,0.25); border-radius:50%; pointer-events:auto; display:flex; align-items:center; justify-content:center;">
      <div id="mKnob" style="width:40px; height:40px; background:#78d7d5; border-radius:50%; box-shadow:0 0 10px #78d7d5; transition:transform 0.05s ease;"></div>
    </div>
    <div style="position:absolute; bottom:10px; right:25px; display:flex; gap:12px; pointer-events:auto;">
      <button id="mBtnHop" style="width:65px; height:65px; background:rgba(255,255,255,0.15); border:2px solid #fff; color:#fff; border-radius:50%; font-weight:800; font-size:12px;">HOP</button>
      <button id="mBtnStrike" style="width:65px; height:65px; background:#ff8e7e; border:none; color:#fff; border-radius:50%; font-weight:800; font-size:12px; box-shadow:0 0 12px #ff8e7e;">BONK</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const pad = document.getElementById("mJoystick");
  const knob = document.getElementById("mKnob");

  pad.addEventListener("touchstart", (e) => { joystickActive = true; runTouch(e); });
  pad.addEventListener("touchmove", (e) => { runTouch(e); });
  pad.addEventListener("touchend", () => {
    joystickActive = false;
    knob.style.transform = "translate(0px, 0px)";
    touchVector = { x: 0, z: 0 };
  });

  function runTouch(e) {
    e.preventDefault();
    const t = e.touches[0];
    const b = pad.getBoundingClientRect();
    const cX = b.left + b.width / 2;
    const cY = b.top + b.height / 2;
    let dX = t.clientX - cX;
    let dY = t.clientY - cY;
    const dist = Math.hypot(dX, dY);
    const maxR = b.width / 2;

    if (dist > maxR) {
      dX = (dX / dist) * maxR;
      dY = (dY / dist) * maxR;
    }
    knob.style.transform = `translate(${dX}px, ${dY}px)`;
    touchVector.x = dX / maxR;
    touchVector.z = dY / maxR;
  }

  document.getElementById("mBtnHop").addEventListener("touchstart", (e) => { e.preventDefault(); mobileJumpHeld = true; });
  document.getElementById("mBtnHop").addEventListener("touchend", (e) => { e.preventDefault(); mobileJumpHeld = false; });
  document.getElementById("mBtnStrike").addEventListener("touchstart", (e) => { e.preventDefault(); callStrike(); });
}

// Hook mobile builder to setup the moment you successfully join the arena
socket.on("joined", (data) => {
  myId = data.id;
  setJoined();
  showToast("Welcome, " + data.name + "! First to five launches wins.");
  setupMobileHTMLDOMControls();
});

// Update the state engine to pull floating power-up synchronization loops
socket.on("state", (state) => {
  lastState = state.players || [];
  updateLobbyCount(state.count, state.max);
  const present = new Set();
  
  for (const p of lastState) {
    present.add(p.id);
    const a = getAvatar(p);
    a.target = p;
    a.alive = p.alive;
    a.group.visible = true;
    a.root.visible = true;
    a.group.userData.cooldown = p.cooldown;
    
    // Custom name tag color modifications based on active player power-up status
    if (p.activePowerUp && a.tag) {
      a.tag.material.color.setHex(p.activePowerUp === "SPEED_BOOST" ? 0xffffff : 0xad9bff);
    } else if (a.tag) {
      a.tag.material.color.setHex(0xffffff);
    }

    if (p.id === myId) {
      const until = Date.now() + Math.max(0, p.cooldown || 0);
      if (until > localStrikeReadyAt) localStrikeReadyAt = until;
    }
  }

  for (const [id, a] of avatars) {
    if (!present.has(id)) {
      scene.remove(a.group);
      avatars.delete(id);
    }
  }
  drawLeaderboard(lastState);
  if (state.winner) showWinner(state.winner);

  // --- INTERPOLATE & DRAW ACTIVE 3D POWER-UP PICKUPS ---
  if (state.powerUps) {
    const serverIds = state.powerUps.map(p => p.id);
    currentPowerUps.forEach((mesh, id) => {
      if (!serverIds.includes(id)) {
        scene.remove(mesh);
        currentPowerUps.delete(id);
      }
    });
    state.powerUps.forEach(p => {
      if (!currentPowerUps.has(p.id)) {
        const pMesh = create3DPowerUpMesh(p.type);
        pMesh.position.set(p.x, 0.55, p.z);
        scene.add(pMesh);
        currentPowerUps.set(p.id, pMesh);
      }
    });
  }
});

// Capture explosion vectors to process distance relative camera shakes
socket.on("shakeCamera", (data) => {
  if (!myId || !lastState) return;
  const me = lastState.find(p => p.id === myId);
  if (!me || !me.alive) return;

  const distance = Math.hypot(me.x - data.x, me.z - data.z);
  if (distance < data.radius) {
    const factor = 1.0 - (distance / data.radius);
    cameraShake.time = 0.36;
    cameraShake.intensity = factor * 0.72;
  }
});

let lastFrame = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  // Animate and float 3D active power-up items inside the arena space
  const ticks = Date.now();
  currentPowerUps.forEach((mesh) => {
    mesh.rotation.y += 1.6 * dt;
    mesh.rotation.x += 0.4 * dt;
    mesh.position.y = 0.55 + Math.sin(ticks * 0.004) * 0.12;
  });

  const local = myId && avatars.get(myId);
  if (local && local.target) {
    const p = local.target;
    const k = 1 - Math.exp(-12 * dt);
    local.group.position.x += (p.x - local.group.position.x) * k;
    local.group.position.y += (p.y - local.group.position.y) * k;
    local.group.position.z += (p.z - local.group.position.z) * k;
    local.group.rotation.y = p.yaw;
    local.root.visible = p.alive;
    const aimX = local.group.position.x;
    const aimZ = local.group.position.z + 27;
    const targetCamera = new THREE.Vector3(aimX, 29, aimZ);
    camera.position.lerp(targetCamera, 1 - Math.exp(-2.2 * dt));
    camera.lookAt(local.group.position.x, 0.7, local.group.position.z);
    
    // --- INTEGRATE DYNAMIC VISUAL SCREEN SHAKE OFFSET DISPLACEMENTS ---
    if (cameraShake.time > 0) {
      camera.position.x += (Math.random() - 0.5) * cameraShake.intensity;
      camera.position.y += (Math.random() - 0.5) * cameraShake.intensity;
      camera.position.z += (Math.random() - 0.5) * cameraShake.intensity;
      cameraShake.time -= dt;
      if (cameraShake.time <= 0) cameraShake.time = 0;
    }
  }

  for (const a of avatars.values()) {
    if (!a.target) continue;
    if (a.id !== myId) {
      const k = 1 - Math.exp(-10 * dt);
      a.group.position.x += (a.target.x - a.group.position.x) * k;
      a.group.position.y += (a.target.y - a.group.position.y) * k;
      a.group.position.z += (a.target.z - a.group.position.z) * k;
      a.group.rotation.y = a.target.yaw;
      a.root.visible = a.target.alive;
    }
  }

  for (const [id, warning] of warnings) {
    const remain = Math.max(0, warning.data.detonateAt - Date.now());
    const progress = 1 - remain / 1250;
    const scale = Math.max(0.12, progress * 6.2);
    warning.ring.scale.set(scale, scale, scale);
    warning.ring.material.opacity = 0.35 + progress * 0.6;
    if (remain <= 0) warning.ring.material.opacity = 0.08;
  }

  const time = performance.now();
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const effect = effects[i];
    const progress = Math.min(1, (time - effect.start) / effect.life);
