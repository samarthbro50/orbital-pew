"use strict";

const path = require("node:path");
const http = require("node:http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = 20;
const ARENA_RADIUS = 30;
const WIN_SCORE = 5;
const STRIKE_COOLDOWN_MS = 5000;
const STRIKE_DELAY_MS = 1250;
const STRIKE_RADIUS = 6.5;
const COLORS = [
  "#ff8e7e", "#78d7d5", "#ffd66e", "#ad9bff", "#85df91",
  "#ff9fd1", "#6db7ff", "#f6aa68", "#c4e879", "#e89cff",
  "#70e6b0", "#f488a7", "#a5c1ff", "#f3d26d", "#71cfeb",
  "#f1a0df", "#a9e792", "#ffb16c", "#94a7ff", "#e5e7a2"
];

const players = new Map();
const pendingStrikes = [];
let roundWinner = null;
let previousStep = Date.now();
let tick = 0;

app.use(express.static(path.join(__dirname, "public")));
app.get("/vendor/three.module.js", (req, res) => {
  res.sendFile(path.join(__dirname, "node_modules", "three", "build", "three.module.js"));
});
app.get("/healthz", (req, res) => {
  res.json({ ok: true, players: players.size, maxPlayers: MAX_PLAYERS });
});

function safeName(value) {
  const name = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 16);
  return name || "Star Cat";
}

function spawnPoint() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 5 + Math.random() * 16;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function makePlayer(id, name) {
  const point = spawnPoint();
  return {
    id,
    name,
    color: COLORS[players.size % COLORS.length],
    x: point.x,
    z: point.z,
    y: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    score: 0,
    alive: true,
    respawnAt: 0,
    lastHitBy: null,
    lastHitAt: 0,
    cooldownUntil: 0,
    gunCooldownUntil: 0,
    jumpHeld: false,
    input: { x: 0, z: 0, jump: false, yaw: 0 }
  };
}

function roster() {
  io.emit("roster", { count: players.size, max: MAX_PLAYERS });
}

function snapshot() {
  const now = Date.now();
  io.emit("state", {
    players: Array.from(players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      score: p.score,
      alive: p.alive,
      cooldown: Math.max(0, p.cooldownUntil - now),
      gunCooldown: Math.max(0, p.gunCooldownUntil - now)
    })),
    count: players.size,
    max: MAX_PLAYERS,
    winner: roundWinner
  });
}

function announce(message) {
  io.emit("notice", String(message).slice(0, 100));
}

function eliminate(p, now) {
  if (!p.alive) return;
  p.alive = false;
  p.respawnAt = now + 2600;
  p.vx = 0;
  p.vy = 0;
  p.vz = 0;

  const attacker = p.lastHitBy && players.get(p.lastHitBy);
  if (attacker && attacker.id !== p.id && now - p.lastHitAt < 8000) {
    attacker.score += 1;
    announce(attacker.name + " launched " + p.name + " into orbit!");
    if (attacker.score >= WIN_SCORE && !roundWinner) {
      roundWinner = { id: attacker.id, name: attacker.name };
      io.emit("winner", roundWinner);
    }
  } else {
    announce(p.name + " drifted off the moon!");
  }
}

function detonate(strike, now) {
  io.emit("explosion", {
    id: strike.id,
    x: strike.x,
    z: strike.z,
    by: strike.by,
    ownerName: strike.ownerName
  });

  for (const p of players.values()) {
    if (!p.alive) continue;
    const dx = p.x - strike.x;
    const dz = p.z - strike.z;
    const distance = Math.hypot(dx, dz);
    if (distance > STRIKE_RADIUS) continue;

    const strength = 1 - distance / STRIKE_RADIUS;
    let nx = dx / Math.max(distance, 0.2);
    let nz = dz / Math.max(distance, 0.2);
    if (distance < 0.2) {
      const fallback = Math.random() * Math.PI * 2;
      nx = Math.cos(fallback);
      nz = Math.sin(fallback);
    }
    p.vx += nx * (9 + strength * 15);
    p.vz += nz * (9 + strength * 15);
    p.vy += 8 + strength * 7;
    p.lastHitBy = strike.by;
    p.lastHitAt = now;
  }
}

function step(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - previousStep) / 1000));
  previousStep = now;

  for (let i = pendingStrikes.length - 1; i >= 0; i -= 1) {
    if (pendingStrikes[i].detonateAt <= now) {
      detonate(pendingStrikes[i], now);
      pendingStrikes.splice(i, 1);
    }
  }

  for (const p of players.values()) {
    if (roundWinner) continue;

    if (!p.alive) {
      if (now >= p.respawnAt) {
        const point = spawnPoint();
        p.x = point.x;
        p.z = point.z;
        p.y = 0;
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
        p.alive = true;
        p.lastHitBy = null;
        p.lastHitAt = 0;
        announce(p.name + " is back in the arena!");
      }
      continue;
    }

    let ix = p.input.x;
    let iz = p.input.z;
    const inputLength = Math.hypot(ix, iz);
    if (inputLength > 1) {
      ix /= inputLength;
      iz /= inputLength;
    }

    p.vx += ix * 24 * dt;
    p.vz += iz * 24 * dt;
    const drag = Math.exp(-2.5 * dt);
    p.vx *= drag;
    p.vz *= drag;

    const speed = Math.hypot(p.vx, p.vz);
    if (speed > 8.3) {
      p.vx = (p.vx / speed) * 8.3;
      p.vz = (p.vz / speed) * 8.3;
    }

    if (p.input.jump && !p.jumpHeld && p.y <= 0.02) {
      p.vy = 10.5;
    }
    p.jumpHeld = p.input.jump;

    const radius = Math.hypot(p.x, p.z);
    if (radius > ARENA_RADIUS - 0.65 && p.y <= 0.03 && p.vy <= 0) {
      p.vy = -2;
    } else {
      p.vy -= 22 * dt;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.y < 0 && Math.hypot(p.x, p.z) < ARENA_RADIUS - 0.65) {
      p.y = 0;
      p.vy = 0;
    }

    const distanceFromCenter = Math.hypot(p.x, p.z);
    if (distanceFromCenter > ARENA_RADIUS + 3 && p.y < -4) {
      eliminate(p, now);
    }
  }

  tick += 1;
  if (tick % 3 === 0) snapshot();
}

io.on("connection", (socket) => {
  socket.emit("roster", { count: players.size, max: MAX_PLAYERS });

  socket.on("join", (requestedName) => {
    if (players.has(socket.id)) return;
    if (players.size >= MAX_PLAYERS) {
      socket.emit("joinError", { message: "This moon is full. Try again in a moment." });
      return;
    }

    const p = makePlayer(socket.id, safeName(requestedName));
    players.set(socket.id, p);
    socket.data.joined = true;
    socket.emit("joined", { id: socket.id, name: p.name, max: MAX_PLAYERS });
    announce(p.name + " joined the moon.");
    roster();
    snapshot();
  });

  socket.on("input", (data) => {
    const p = players.get(socket.id);
    if (!p || !data || typeof data !== "object") return;

    const x = Number(data.x);
    const z = Number(data.z);
    const yaw = Number(data.yaw);
    p.input.x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    p.input.z = Number.isFinite(z) ? Math.max(-1, Math.min(1, z)) : 0;
    p.input.jump = Boolean(data.jump);
    p.input.yaw = Number.isFinite(yaw) ? yaw : p.yaw;
    p.yaw = p.input.yaw;
  });

  socket.on("strike", (data) => {
    const p = players.get(socket.id);
    if (!p || !p.alive || roundWinner || !data || typeof data !== "object") return;

    const x = Number(data.x);
    const z = Number(data.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (Math.abs(x) > ARENA_RADIUS || Math.abs(z) > ARENA_RADIUS) return;
    if (Math.hypot(p.x - x, p.z - z) > 34) {
      socket.emit("strikeError", { message: "That target is out of range." });
      return;
    }

    const now = Date.now();
    if (now < p.cooldownUntil) {
      socket.emit("strikeError", { message: "Orbital cannon is recharging." });
      return;
    }

    p.cooldownUntil = now + STRIKE_COOLDOWN_MS;
    const id = socket.id + "-" + now;
    const strike = {
      id,
      by: socket.id,
      ownerName: p.name,
      x,
      z,
      detonateAt: now + STRIKE_DELAY_MS
    };
    pendingStrikes.push(strike);
    io.emit("strikeWarning", {
      id,
      x,
      z,
      by: socket.id,
      ownerName: p.name,
      detonateAt: strike.detonateAt
    });
  });

  socket.on("shoot", () => {
    const p = players.get(socket.id);
    if (!p || !p.alive || roundWinner) return;
    const now = Date.now();
    if (now < p.gunCooldownUntil) return;
    p.gunCooldownUntil = now + 460;

    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    let target = null;
    let bestDistance = 22;
    for (const q of players.values()) {
      if (q.id === p.id || !q.alive) continue;
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.8 || distance >= bestDistance || Math.abs(q.y - p.y) > 3.2) continue;
      const bearing = Math.atan2(dx, dz);
      const difference = Math.atan2(Math.sin(bearing - p.yaw), Math.cos(bearing - p.yaw));
      if (Math.abs(difference) > 0.24) continue;
      target = q;
      bestDistance = distance;
    }

    let end = { x: p.x + fx * 22, y: p.y + 1.15, z: p.z + fz * 22 };
    if (target) {
      target.vx += fx * 11;
      target.vz += fz * 11;
      target.vy += 4.2;
      target.lastHitBy = p.id;
      target.lastHitAt = now;
      end = { x: target.x, y: target.y + 1.15, z: target.z };
    }
    io.emit("shot", {
      from: { x: p.x + fx * 0.65, y: p.y + 1.1, z: p.z + fz * 0.65 },
      to: end,
      hit: target ? target.id : null,
      by: p.id
    });
  });

  socket.on("shoot", () => {
    const p = players.get(socket.id);
    if (!p || !p.alive || roundWinner) return;
    const now = Date.now();
    if (now < p.gunCooldownUntil) return;
    p.gunCooldownUntil = now + 460;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let target = null, best = 22;
    for (const q of players.values()) {
      if (q.id === p.id || !q.alive) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.8 || d >= best || Math.abs(q.y - p.y) > 3.2) continue;
      const bearing = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(bearing - p.yaw), Math.cos(bearing - p.yaw));
      if (Math.abs(diff) > 0.24) continue;
      target = q; best = d;
    }
    let end = { x: p.x + fx * 22, y: p.y + 1.15, z: p.z + fz * 22 };
    if (target) {
      target.vx += fx * 11; target.vz += fz * 11; target.vy += 4.2;
      target.lastHitBy = p.id; target.lastHitAt = now;
      end = { x: target.x, y: target.y + 1.15, z: target.z };
    }
    io.emit("shot", { from: { x: p.x + fx * 0.65, y: p.y + 1.1, z: p.z + fz * 0.65 }, to: end, hit: target ? target.id : null, by: p.id });
  });

  socket.on("restart", () => {
    if (!roundWinner) return;
    roundWinner = null;
    for (const p of players.values()) {
      p.score = 0;
      p.alive = true;
      p.respawnAt = 0;
      p.lastHitBy = null;
      p.lastHitAt = 0;
      p.cooldownUntil = 0;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      const point = spawnPoint();
      p.x = point.x;
      p.z = point.z;
      p.y = 0;
    }
    announce("New round! First to five launches wins.");
    snapshot();
  });

  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;
    players.delete(socket.id);
    if (roundWinner && roundWinner.id === socket.id) roundWinner = null;
    announce(p.name + " left the moon.");
    roster();
    snapshot();
  });
});

setInterval(() => step(Date.now()), 1000 / 60);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Orbital Paws listening on port " + PORT);
});
