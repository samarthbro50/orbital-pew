# Orbital Paws

A small, original 3D browser arena for up to 20 cat pilots in one shared lobby. Pew with a knockback blaster, dodge the edge, and mark a spot for a delayed orbital strike. First pilot to five launches wins.

## Play locally

You need Node.js 20 or newer.

1. Open a terminal in this folder.
2. Run npm install.
3. Run npm start.
4. Visit http://localhost:3000 in a browser.

For a friend to join your local game, both devices need access to the same hosted server.

## Publish online

This is a real-time multiplayer game, so publish the whole project to a Node web service that supports WebSockets. The included render.yaml is a starting point for Render:

1. Put this folder in a GitHub repository.
2. In Render, create a Blueprint from that repository.
3. Keep the service at one instance so all 20 players share the same lobby.
4. Open the service URL and share it with your players.

The server enforces a 20-player cap. If all slots are used, a new player sees a full-lobby message. The lobby is in memory, so restarting the service starts a fresh match.

## Controls

- WASD — move
- Space — hop
- Mouse — aim
- Left-click — fire the pew-pew blaster
- Right-click or the on-screen button — call an orbital strike

The browser game is desktop-first. It uses procedural 3D models and has no external art assets.
