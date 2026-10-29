import * as THREE from "/vendor/three.module.js";

const socket = io({ reconnection: true, reconnectionDelayMax: 3000 });
const canvas = document.getElementById("world");
const lobby = document.getElementById("lobby");
const lobbyError = document.getElementById("lobbyError");
const joinBtn = document.getElementById("joinBtn");
const nameInput = document.getElementById("nameInput");
const roundEnd = document.getElementById("roundEnd");
const fullScreen = document.getElementById("fullScreen");
const topbar = document.getElementById("topbar");
const leaderboard = document.getElementById("leaderboard");
const bottomHud = document.getElementById("bottomHud");
const toast = document.getElementById("toast");
const gunBtn = document.getElementById("gunBtn");
const strikeBtn = document.getElementById("strikeBtn");
const weaponStatus = document.getElementById("weaponStatus");
const playerCount = document.getElementById("playerCount");
const lobbyCount = document.getElementById("lobbyCount");
const connLabel = document.getElementById("connLabel");
const connDot = document.getElementById("connDot");
const leaderRows = document.getElementById("leaderRows");
const roundName = document.getElementById("roundName");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x47182b, 0.0034);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 260);
camera.position.set(0, 33, 35);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(180, 48, 32),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "varying vec2 vUv; void main(){ float h=smoothstep(0.02,0.92,vUv.y); vec3 low=vec3(0.74,0.15,0.20); vec3 mid=vec3(0.38,0.07,0.15); vec3 top=vec3(0.10,0.025,0.095); vec3 c=mix(low,mid,smoothstep(0.0,0.5,h)); c=mix(c,top,smoothstep(0.45,1.0,h)); gl_FragColor=vec4(c,1.0); }"
  })
);
scene.add(sky);

scene.add(new THREE.HemisphereLight(0xffc5ba, 0x302049, 2.0));
const sunLight = new THREE.DirectionalLight(0xffdfbd, 3.1);
sunLight.position.set(-22, 44, 18);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
scene.add(sunLight);
const redFill = new THREE.PointLight(0xff4562, 65, 90, 2);
redFill.position.set(0, 13, -17);
scene.add(redFill);

function mesh(geometry, material, parent, x, y, z) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  if (parent) parent.add(item);
  return item;
}

function makeStars() {
  const positions = [];
  const colors = [];
  for (let i = 0; i < 600; i += 1) {
    const x = (Math.random() - 0.5) * 260;
    const y = 12 + Math.random() * 105;
    const z = (Math.random() - 0.5) * 260;
    positions.push(x, y, z);
    const tint = new THREE.Color().setHSL(0.92 + Math.random() * 0.1, 0.45, 0.65 + Math.random() * 0.3);
    colors.push(tint.r, tint.g, tint.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.48, vertexColors: true, transparent: true, opacity: 0.92, sizeAttenuation: true }));
  scene.add(points);
}
makeStars();

const moonMat = new THREE.MeshStandardMaterial({ color: 0xff9b83, emissive: 0x742e42, emissiveIntensity: 0.75, roughness: 0.88 });
const moon = mesh(new THREE.SphereGeometry(9, 32, 24), moonMat, scene, 42, 36, -69);
const moonHalo = mesh(new THREE.TorusGeometry(12, 0.12, 8, 72), new THREE.MeshBasicMaterial({ color: 0xffb09d, transparent: true, opacity: 0.42 }), scene, 42, 36, -69);
moonHalo.rotation.x = 0.9;
moonHalo.rotation.z = -0.35;

const arena = new THREE.Group();
scene.add(arena);
const base = mesh(new THREE.CylinderGeometry(30.4, 31.3, 1.7, 80), new THREE.MeshStandardMaterial({ color: 0x382744, roughness: 0.75, metalness: 0.28 }), arena, 0, -0.87, 0);
base.castShadow = true;
base.receiveShadow = true;
const floor = mesh(new THREE.CircleGeometry(30, 80), new THREE.MeshStandardMaterial({ color: 0x705064, roughness: 0.91, metalness: 0.06 }), arena, 0, 0.015, 0);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
const rim = mesh(new THREE.TorusGeometry(30, 0.38, 10, 96), new THREE.MeshStandardMaterial({ color: 0xff8c7d, emissive: 0x8f273c, emissiveIntensity: 1.0, metalness: 0.55, roughness: 0.3 }), arena, 0, 0.02, 0);
rim.rotation.x = Math.PI / 2;
for (let r = 5; r < 30; r += 5) {
  const ring = mesh(new THREE.TorusGeometry(r, 0.035, 6, 96), new THREE.MeshBasicMaterial({ color: 0xffc4b4, transparent: true, opacity: r === 15 ? 0.27 : 0.15 }), arena, 0, 0.045, 0);
  ring.rotation.x = Math.PI / 2;
}
const centerPad = mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.13, 48), new THREE.MeshStandardMaterial({ color: 0x957083, emissive: 0x441a37, emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.45 }), arena, 0, 0.09, 0);
const beacon = mesh(new THREE.CylinderGeometry(0.12, 0.24, 5.7, 12), new THREE.MeshBasicMaterial({ color: 0xffb284, transparent: true, opacity: 0.55 }), arena, 0, 3.1, 0);
const beaconTop = mesh(new THREE.SphereGeometry(0.48, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a3 }), arena, 0, 6.2, 0);
const beaconLight = new THREE.PointLight(0xff8c73, 24, 18, 2);
beaconLight.position.set(0, 5.5, 0);
arena.add(beaconLight);

const pillarPositions = [[-17, -12], [14, -18], [18, 7], [-19, 11], [7, 17], [-7, -21]];
for (let i = 0; i < pillarPositions.length; i += 1) {
  const [x, z] = pillarPositions[i];
  const color = i % 2 ? 0x76566f : 0x805b68;
  const pillar = mesh(new THREE.CylinderGeometry(0.48, 0.7, 2.5, 8), new THREE.MeshStandardMaterial({ color, metalness: 0.28, roughness: 0.68 }), arena, x, 1.27, z);
  pillar.castShadow = true;
  const light = mesh(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x85e5ed : 0xffb675 }), arena, x, 2.65, z);
  const glow = new THREE.PointLight(i % 2 ? 0x55d9ff : 0xff795c, 4, 7, 2);
  glow.position.set(x, 2.5, z);
  arena.add(glow);
}

const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const aimPoint = new THREE.Vector3();
const avatars = new Map();
const warnings = new Map();
const effects = [];
const keys = new Set();
let myId = null;
let joined = false;
let lastState = [];
let localGunReadyAt = 0;
let localStrikeReadyAt = 0;
let toastTimer = 0;
let lastInputAt = 0;
let aimYaw = 0;

const aimRing = mesh(new THREE.TorusGeometry(1, 0.075, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd18a, transparent: true, opacity: 0.86 }), scene, 0, 0.12, 0);
aimRing.rotation.x = Math.PI / 2;
aimRing.visible = false;
const aimDot = mesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe7ac }), scene, 0, 0.12, 0);
aimDot.visible = false;

function makeNameSprite(name) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 112;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(29, 13, 27, .83)";
  ctx.beginPath(); ctx.roundRect(42, 17, 428, 78, 34); ctx.fill();
  ctx.strokeStyle = "rgba(255, 230, 222, .35)"; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#fff5ee"; ctx.font = "800 38px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(name.slice(0, 16), 256, 57, 390);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(3.25, 0.72, 1);
  sprite.position.set(0, 3.1, 0);
  return sprite;
}

function createCat(colorValue, name, id) {
  const color = new THREE.Color(colorValue || "#ff8e7e");
  const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xffe2d0, roughness: 0.82 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xffa0a5, roughness: 0.74 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x30202b, roughness: 0.42 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x536778, metalness: 0.78, roughness: 0.24, emissive: 0x102a44 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x9de8ff });
  const root = new THREE.Group();

  const body = mesh(new THREE.SphereGeometry(0.58, 24, 18), fur, root, 0, 0.66, 0);
  body.scale.set(0.75, 0.93, 0.8);
  body.castShadow = true;
  const belly = mesh(new THREE.SphereGeometry(0.4, 18, 14), pale, root, 0, 0.65, 0.34);
  belly.scale.set(0.78, 0.78, 0.45);
  const head = mesh(new THREE.SphereGeometry(0.63, 24, 20), fur, root, 0, 1.4, 0.08);
  head.castShadow = true;

  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.22, 0.58, 4), fur, root, side * 0.39, 1.94, 0.04);
    ear.rotation.z = -side * 0.19;
    ear.rotation.x = 0.05;
    const inner = mesh(new THREE.ConeGeometry(0.11, 0.34, 4), pink, root, side * 0.39, 1.96, 0.19);
    inner.rotation.z = -side * 0.19;
    inner.rotation.x = 0.05;
    const eye = mesh(new THREE.SphereGeometry(0.065, 12, 10), dark, root, side * 0.215, 1.47, 0.64);
    eye.scale.set(0.82, 1.12, 0.48);
    const paw = mesh(new THREE.SphereGeometry(0.22, 14, 10), fur, root, side * 0.23, 0.19, 0.17);
    paw.scale.set(0.83, 0.7, 1.0);
  }
  const muzzleL = mesh(new THREE.SphereGeometry(0.16, 12, 10), pale, root, -0.12, 1.18, 0.62);
  muzzleL.scale.set(1.1, 0.76, 0.65);
  const muzzleR = mesh(new THREE.SphereGeometry(0.16, 12, 10), pale, root, 0.12, 1.18, 0.62);
  muzzleR.scale.set(1.1, 0.76, 0.65);
  mesh(new THREE.SphereGeometry(0.065, 10, 8), pink, root, 0, 1.23, 0.75);

  const pack = mesh(new THREE.BoxGeometry(0.5, 0.6, 0.27), metal, root, 0, 0.72, -0.47);
  pack.castShadow = true;
  const packLight = mesh(new THREE.SphereGeometry(0.09, 10, 8), glowMat, root, 0, 0.76, -0.62);

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.58, -0.42),
    new THREE.Vector3(0.05, 0.64, -0.82),
    new THREE.Vector3(0.32, 0.88, -1.03),
    new THREE.Vector3(0.48, 1.12, -0.91)
  ]);
  const tail = mesh(new THREE.TubeGeometry(tailCurve, 16, 0.105, 8, false), fur, root, 0, 0, 0);
  tail.castShadow = true;

  const gun = new THREE.Group();
  gun.position.set(0.42, 0.78, 0.37);
  root.add(gun);
  const gunBody = mesh(new THREE.BoxGeometry(0.28, 0.23, 0.4), metal, gun, 0, 0, 0.02);
  gunBody.castShadow = true;
  const barrel = mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.46, 10), metal, gun, 0, 0.02, 0.38);
  barrel.rotation.x = Math.PI / 2;
  const muzzle = mesh(new THREE.SphereGeometry(0.11, 12, 8), glowMat, gun, 0, 0.02, 0.62);
  mesh(new THREE.BoxGeometry(0.14, 0.25, 0.16), fur, gun, 0, -0.2, -0.06).rotation.x = -0.2;

  const visor = mesh(new THREE.SphereGeometry(0.78, 24, 18), new THREE.MeshPhysicalMaterial({
    color: 0xc9f3ff, metalness: 0.04, roughness: 0.08, transparent: true, opacity: 0.12,
    clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide
  }), root, 0, 1.38, 0.06);
  visor.scale.set(1, 0.98, 0.96);

  const tag = makeNameSprite(name);
  root.add(tag);
  const group = new THREE.Group();
  group.add(root);
  scene.add(group);

  return { id, group, root, tag, gun, muzzle: new THREE.Vector3(0.42, 0.8, 0.95), target: null, color: color.getHex(), alive: true };
}

function getAvatar(p) {
  let avatar = avatars.get(p.id);
  if (!avatar) {
    avatar = createCat(p.color, p.name, p.id);
    avatars.set(p.id, avatar);
  }
  return avatar;
}

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(floorPlane, aimPoint)) {
    const length = Math.hypot(aimPoint.x, aimPoint.z);
    const maxRange = 28.8;
    if (length > maxRange) {
      aimPoint.x *= maxRange / length;
      aimPoint.z *= maxRange / length;
    }
    aimPoint.y = 0.13;
    aimRing.position.copy(aimPoint);
    aimDot.position.copy(aimPoint);
    aimRing.visible = joined;
    aimDot.visible = joined;
    if (myId && avatars.has(myId)) {
      const me = avatars.get(myId).group.position;
      if (Math.hypot(aimPoint.x - me.x, aimPoint.z - me.z) > 0.1) {
        aimYaw = Math.atan2(aimPoint.x - me.x, aimPoint.z - me.z);
      }
    }
  }
}

function showToast(message, duration) {
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration || 2100);
}

function updateLobbyCount(count, max) {
  playerCount.textContent = String(count);
  lobbyCount.textContent = count + " / " + max;
  if (count >= max && !joined) joinBtn.textContent = "MOON IS FULL";
  else if (socket.connected && !joined) joinBtn.textContent = "DROP INTO THE ARENA";
}

function fireGun() {
  if (!joined || !socket.connected || Date.now() < localGunReadyAt) return;
  localGunReadyAt = Date.now() + 420;
  socket.emit("shoot");
}

function callStrike() {
  if (!joined || !socket.connected || Date.now() < localStrikeReadyAt || !aimRing.visible) return;
  localStrikeReadyAt = Date.now() + 5000;
  socket.emit("strike", { x: aimPoint.x, z: aimPoint.z });
}

function onPointerDown(event) {
  if (!joined || event.target !== canvas) return;
  updatePointer(event);
  if (event.button === 2) {
    event.preventDefault();
    callStrike();
  } else if (event.button === 0) {
    fireGun();
  }
}
canvas.addEventListener("pointermove", updatePointer);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
gunBtn.addEventListener("click", fireGun);
strikeBtn.addEventListener("click", callStrike);

window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
  keys.add(event.code.toLowerCase());
  if (event.code === "Space") keys.add("space");
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code.toLowerCase());
  if (event.code === "Space") keys.delete("space");
});
window.addEventListener("blur", () => keys.clear());

function sendInput() {
  if (!joined || !socket.connected || !myId) return;
  const x = Number(keys.has("keyd") || keys.has("d")) - Number(keys.has("keya") || keys.has("a"));
  const z = Number(keys.has("keys") || keys.has("s")) - Number(keys.has("keyw") || keys.has("w"));
  socket.emit("input", { x, z, jump: keys.has("space"), yaw: aimYaw });
}

function setJoined() {
  joined = true;
  lobby.classList.add("hidden");
  fullScreen.classList.add("hidden");
  topbar.classList.remove("hidden");
  leaderboard.classList.remove("hidden");
  bottomHud.classList.remove("hidden");
  aimRing.visible = true;
  aimDot.visible = true;
  canvas.focus();
}

joinBtn.addEventListener("click", () => {
  if (!socket.connected) {
    lobbyError.textContent = "Waiting for the moon server to reconnect…";
    return;
  }
  lobbyError.textContent = "";
  socket.emit("join", nameInput.value.trim() || "Star Cat");
});
nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinBtn.click();
});
document.getElementById("againBtn").addEventListener("click", () => socket.emit("restart"));

socket.on("connect", () => {
  connLabel.textContent = "SERVER LIVE";
  connDot.classList.add("online");
  joinBtn.disabled = false;
  if (!joined) joinBtn.textContent = "DROP INTO THE ARENA";
  lobbyError.textContent = "";
});
socket.on("disconnect", () => {
  connLabel.textContent = "RECONNECTING";
  connDot.classList.remove("online");
  if (!joined) joinBtn.disabled = true;
  showToast("Moon link lost. Reconnecting…");
});
socket.on("connect_error", () => {
  connLabel.textContent = "SERVER OFFLINE";
  connDot.classList.remove("online");
  joinBtn.disabled = true;
  lobbyError.textContent = "The game server is not online yet.";
});
socket.on("roster", (data) => updateLobbyCount(data.count, data.max));
socket.on("joined", (data) => {
  myId = data.id;
  setJoined();
  showToast("Welcome, " + data.name + "! First to five launches wins.");
});
socket.on("joinError", (data) => {
  lobbyError.textContent = data.message || "Could not join.";
  if ((data.message || "").toLowerCase().includes("full")) fullScreen.classList.remove("hidden");
});
socket.on("notice", (message) => showToast(message));
socket.on("strikeError", (data) => {
  localStrikeReadyAt = Date.now();
  showToast(data.message || "Strike unavailable.");
});
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
});
socket.on("winner", showWinner);
socket.on("strikeWarning", (data) => {
  const ring = mesh(new THREE.TorusGeometry(1, 0.09, 8, 48), new THREE.MeshBasicMaterial({ color: 0xff5f56, transparent: true, opacity: 0.92 }), scene, data.x, 0.18, data.z);
  ring.rotation.x = Math.PI / 2;
  warnings.set(data.id, { ring, data });
  showToast(data.ownerName + " called an ORBITAL BONK!");
});
socket.on("explosion", (data) => makeExplosion(data));
socket.on("shot", (data) => makeShot(data));

function showWinner(winner) {
  roundName.textContent = winner.name + " WINS!";
  roundEnd.classList.remove("hidden");
}
function drawLeaderboard(players) {
  const sorted = players.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 20);
  leaderRows.replaceChildren();
  for (const p of sorted) {
    const row = document.createElement("div");
    row.className = "leader-row" + (p.id === myId ? " me" : "");
    const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = p.color;
    const who = document.createElement("span"); who.className = "who"; who.textContent = p.name;
    const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = String(p.score);
    row.append(dot, who, pts);
    leaderRows.appendChild(row);
  }
}

function makeShot(data) {
  const from = new THREE.Vector3(data.from.x, data.from.y, data.from.z);
  const to = new THREE.Vector3(data.to.x, data.to.y, data.to.z);
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
  const material = new THREE.LineBasicMaterial({ color: data.hit ? 0xfff0ad : 0x8beaff, transparent: true, opacity: 1 });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  effects.push({ object: line, material, start: performance.now(), life: 145, type: "line" });
  const flash = mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9decff }), scene, from.x, from.y, from.z);
  effects.push({ object: flash, material: flash.material, start: performance.now(), life: 120, type: "flash" });
}

function makeExplosion(data) {
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff765e, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = mesh(new THREE.CylinderGeometry(0.25, 1.6, 50, 16, 1, true), beamMat, scene, data.x, 25, data.z);
  effects.push({ object: beam, material: beamMat, start: performance.now(), life: 460, type: "beam" });

  const boomMat = new THREE.MeshBasicMaterial({ color: 0xff9c55, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const boom = mesh(new THREE.SphereGeometry(1, 20, 14), boomMat, scene, data.x, 1.5, data.z);
  effects.push({ object: boom, material: boomMat, start: performance.now(), life: 560, type: "boom" });
  const ring = mesh(new THREE.TorusGeometry(1, 0.14, 8, 36), new THREE.MeshBasicMaterial({ color: 0xffe5a4, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }), scene, data.x, 0.4, data.z);
  ring.rotation.x = Math.PI / 2;
  effects.push({ object: ring, material: ring.material, start: performance.now(), life: 650, type: "blastRing" });

  const warning = warnings.get(data.id);
  if (warning) {
    scene.remove(warning.ring);
    warning.ring.geometry.dispose();
    warning.ring.material.dispose();
    warnings.delete(data.id);
  }
  showToast("KABOOM! " + (data.ownerName || "A pilot") + " dropped the sky.");
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

setInterval(sendInput, 50);

let lastFrame = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

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
    if (effect.type === "boom") effect.object.scale.setScalar(0.6 + progress * 5.8);
    if (effect.type === "blastRing") effect.object.scale.setScalar(0.2 + progress * 6.2);
    if (effect.type === "beam") effect.object.scale.x = effect.object.scale.z = 0.4 + progress * 2.4;
    effect.material.opacity = (1 - progress) * (effect.type === "line" ? 1 : 0.86);
    if (progress >= 1) {
      scene.remove(effect.object);
      if (effect.object.geometry) effect.object.geometry.dispose();
      if (effect.material.dispose) effect.material.dispose();
      effects.splice(i, 1);
    }
  }

  if (joined) {
    const now = Date.now();
    gunBtn.disabled = now < localGunReadyAt;
    strikeBtn.disabled = now < localStrikeReadyAt;
    if (now < localStrikeReadyAt) {
      weaponStatus.textContent = "ORBITAL RECHARGE · " + Math.ceil((localStrikeReadyAt - now) / 1000) + "s";
    } else if (now < localGunReadyAt) {
      weaponStatus.textContent = "BLASTER RECHARGING…";
    } else {
      weaponStatus.textContent = "CLICK TO PEW · RIGHT-CLICK TO BONK";
    }
  }
  beaconTop.scale.setScalar(1 + Math.sin(now * 0.003) * 0.09);
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);