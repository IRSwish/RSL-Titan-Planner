const ICON_PATH = "/style/img/Misc/";
let rewards = [];
let unlocked = new Set(); // verts
let planned = new Set();  // bleus
let keys = 0;             // clés disponibles
let activeLocks = 0;      // locks actifs
let points = 0;
let dependentsMap = {};
let totalKeys = 0; 

const container = document.getElementById("rewardContainer");
const svg = document.getElementById("connections");
const titleEl = document.querySelector("h1");

/* === BOX FIXE À GAUCHE === */
const statsBox = document.createElement("div");
statsBox.style.position = "fixed";
statsBox.style.left = "15px";
statsBox.style.top = "50%";
statsBox.style.transform = "translateY(-50%)";
statsBox.style.background = "#1a1a1a";
statsBox.style.border = "2px solid var(--event-border)";
statsBox.style.padding = "15px";
statsBox.style.borderRadius = "10px";
statsBox.style.color = "#fcf6ff";
statsBox.style.fontFamily = "Inter, sans-serif";
statsBox.style.display = "flex";
statsBox.style.flexDirection = "column";
statsBox.style.gap = "8px";
statsBox.style.zIndex = "9999";

statsBox.innerHTML = `
  <label style="display:flex;flex-direction:column;gap:3px;">
    <span>Points available:</span>
    <input id="pointsAvailable" type="number" value="0"
      style="width:100px; padding:10px;background:#0e0e0e;color:#fcf6ff;border:none;border-radius:6px;">
  </label>
  <span id="pointsSpent">Spent: 0</span>
  <span id="pointsNeeded">Needed: 0</span>
  <span id="keysCount">Keys: 0</span>
  <button id="reset" style="
    margin-top:10px;
    background:var(--event-border);
    border:none;
    font-weight:bold;
    padding:5px 10px;
    border-radius:6px;
    cursor:pointer;
  ">↺</button>
`;
document.body.appendChild(statsBox);

/* === RÉFÉRENCES === */
const pointsAvailableInput = document.getElementById("pointsAvailable");
const pointsSpentSpan = document.getElementById("pointsSpent");
const pointsNeededSpan = document.getElementById("pointsNeeded");
const keysSpan = document.getElementById("keysCount");
const resetBtn = document.getElementById("reset");

/* === LOCAL STORAGE === */
function getStorageKey() {
  const pathId = window.location.hash.replace("#", "").trim() || "default";
  return `rewardState_${pathId}`;
}

function saveState() {
  const state = {
    unlocked: [...unlocked],
    planned: [...planned],
    pointsAvailable: Number(pointsAvailableInput.value || 0),
  };
  localStorage.setItem(getStorageKey(), JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(getStorageKey());
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    unlocked = new Set(s.unlocked || []);
    planned = new Set(s.planned || []);
    if (typeof s.pointsAvailable === "number")
      pointsAvailableInput.value = s.pointsAvailable;
  } catch (e) {
    console.warn("⚠️ Failed to parse saved state:", e);
  }
}

/* === STATS === */
function updateStats() {
  const available = Number(pointsAvailableInput.value || 0);

  // 🟩 Points dépensés
  let spentPoints = 0;
  for (const id of unlocked) {
    const r = rewards.find(x => x.id === id);
    if (!r || r.name.toLowerCase().includes("lock")) continue;
    spentPoints += r.cost || 0;
  }

  // 🟦 Points planifiés
  let plannedPoints = 0;
  for (const id of planned) {
    const r = rewards.find(x => x.id === id);
    if (!r || r.name.toLowerCase().includes("lock")) continue;
    plannedPoints += r.cost || 0;
  }

  // Points nécessaires
  const needed = Math.max(0, plannedPoints - available);

  pointsSpentSpan.textContent = `Spent: ${spentPoints.toLocaleString("en-US")}`;
  pointsNeededSpan.textContent = `Needed: ${needed.toLocaleString("en-US")}`;
  keysSpan.textContent = `Keys: ${keys}`;
  saveState();
}

/* === RECALCUL GÉNÉRAL === */
function recalcKeysAndPoints() {
  let newTotalKeys = 0;
  let newLocks = 0;
  let newPoints = 0;

  for (const id of unlocked) {
    const r = rewards.find(x => x.id === id);
    if (!r) continue;
    const name = r.name.toLowerCase();

    if (name.includes("key")) {
      newTotalKeys += r.keys && r.keys > 0 ? r.keys : 1;
      newPoints += r.cost || 0;
    } else if (name.includes("lock")) {
      newLocks += 1;
      newPoints += r.cost || 0;
    } else {
      newPoints += r.cost || 0;
    }
  }

  totalKeys = newTotalKeys;                  // 🔢 total de clés possédées
  activeLocks = newLocks;                    // 🔒 locks actifs
  keys = Math.max(0, totalKeys - newLocks);  // ✅ clés disponibles (affichage)
  points = newPoints;
}

/* === SÉCURITÉ CLÉS / LOCKS === */
function enforceKeyLimit() {
  // ❗ On vérifie contre le TOTAL de clés, pas "keys" (qui est déjà soustrait des locks)
  if (activeLocks <= totalKeys) return;

  const locksToRemove = activeLocks - totalKeys;
  const activeLockRewards = Array.from(unlocked)
    .map(id => rewards.find(r => r.id === id))
    .filter(r => r && r.name.toLowerCase().includes("lock"));

  for (let i = 0; i < locksToRemove; i++) {
    const lockToRemove = activeLockRewards.pop();
    if (!lockToRemove) break;

    unlocked.delete(lockToRemove.id);
    const box = document.querySelector(`.reward-box[data-id="${lockToRemove.id}"]`);
    if (box) {
      box.className = "reward-box locked";
      box.dataset.state = "locked";
    }
    cascadeDeactivate(lockToRemove.id);
  }

  recalcKeysAndPoints();
}

/* === RESET === */
function resetAll() {
  unlocked.clear();
  planned.clear();
  keys = 0;
  activeLocks = 0;
  points = 0;

  document.querySelectorAll(".reward-box").forEach(b => {
    b.className = "reward-box locked";
    b.dataset.state = "locked";
  });

  recalcKeysAndPoints();
  enforceKeyLimit();
  updateAvailability();
  drawConnections();
  updateStats();
  saveState();
}

resetBtn.addEventListener("click", resetAll);
pointsAvailableInput.addEventListener("input", updateStats);

/* === INIT === */
async function init() {
  const pathId = window.location.hash.replace("#", "").trim();

  if (!pathId || !window.fusions || !window.fusions[pathId]) {
    document.body.innerHTML = "<h2 style='text-align:center;color:red'>Invalid Path Configuration</h2>";
    return;
  }

  const fusion = window.fusions[pathId];
  const jsonFile = fusion.json;
  const displayName = fusion.name || "Hero's Path";

  const pageTitleEl = document.getElementById("page-title");
  if (pageTitleEl) pageTitleEl.textContent = displayName.toUpperCase();
  document.title = `${displayName} - ${window.siteConfig.title}`;
  if (titleEl) titleEl.textContent = displayName.toUpperCase();

  try {
    const res = await fetch(jsonFile);
    rewards = await res.json();
  } catch {
    document.body.innerHTML = `<h2 style='text-align:center;color:red'>Failed to load ${jsonFile}</h2>`;
    return;
  }

  dependentsMap = {};
  for (const r of rewards) {
    (r.requires || []).forEach(req => {
      if (!dependentsMap[req]) dependentsMap[req] = [];
      dependentsMap[req].push(r.id);
    });
  }

  const tiers = {};
  for (const r of rewards) {
    const match = r.id.match(/^t(\d+)/);
    const tier = match ? parseInt(match[1]) : 0;
    if (!tiers[tier]) tiers[tier] = [];
    tiers[tier].push(r);
  }

  const sortedTiers = Object.keys(tiers).sort((a, b) => a - b);
  sortedTiers.forEach(tier => {
    const row = document.createElement("div");
    row.className = "reward-row";
    tiers[tier].forEach(r => {
      const box = document.createElement("div");
      box.className = "reward-box locked";
      box.dataset.id = r.id;
      box.dataset.state = "locked";

      const img = document.createElement("img");
      img.src = ICON_PATH + r.image + ".webp";
      img.alt = r.name;

      const name = document.createElement("div");
      name.className = "reward-name";
      name.textContent = r.name;

      const cost = document.createElement("div");
      cost.className = "reward-cost";
      cost.textContent = r.name.toLowerCase().includes("lock")
        ? "1 key"
        : `${r.cost.toLocaleString("en-US")} pts`;

      box.append(img, name, cost);
      row.appendChild(box);
      box.addEventListener("click", () => handleClick(r, box));
    });
    container.appendChild(row);
  });

  loadState();
  recalcKeysAndPoints();
  enforceKeyLimit();
  updateAvailability();
  drawConnections();
  updateStats();

  window.addEventListener("resize", () => requestAnimationFrame(drawConnections));
  window.addEventListener("scroll", () => requestAnimationFrame(drawConnections));
}

/* === INTERACTIONS === */
function handleClick(reward, box) {
  const state = box.dataset.state;
  const name = reward.name.toLowerCase();
  const isKey = name.includes("key");
  const isLock = name.includes("lock");

  // LOCKED → PLANNED
  if (state === "locked" || state === "available") {
    const requires = reward.requires || [];
    const canTake = requires.length === 0 || requires.some(req => unlocked.has(req) || planned.has(req));
    if (!canTake) return;

    planned.add(reward.id);
    box.className = "reward-box planned";
    box.dataset.state = "planned";

    updateAvailability();
    drawConnections();
    recalcKeysAndPoints();
    enforceKeyLimit();
    updateStats();
    return;
  }

  // PLANNED → ACTIVE
  if (state === "planned") {
    recalcKeysAndPoints(); // 🆕 recalcul avant vérif
    const requires = reward.requires || [];
    const canActivate = requires.length === 0 || requires.some(req => unlocked.has(req));
    if (!canActivate) {
      const requires = reward.requires || [];
      const parentPlanned = requires.some(req => planned.has(req));
      if (parentPlanned) {
        // 🔁 Si le parent est aussi planned, on repasse l’enfant en locked
        planned.delete(reward.id);
        const boxEl = document.querySelector(`.reward-box[data-id="${reward.id}"]`);
        if (boxEl) {
          boxEl.className = "reward-box locked";
          boxEl.dataset.state = "locked";
        }
        cascadeDeactivate(reward.id); // coupe les enfants
        updateAvailability();
        drawConnections();
        updateStats();
        return;
      }

      flashRed(box);
      return;
    }

    if (isLock && keys <= 0) {
      flashRed(box);
      return;
    }

    planned.delete(reward.id);
    unlocked.add(reward.id);

    box.className = "reward-box active";
    box.dataset.state = "active";

    playActivationEffect(box);
    recalcKeysAndPoints();
    enforceKeyLimit();
    updateAvailability();
    drawConnections();
    updateStats();
    return;
  }

  // ACTIVE → LOCKED
  if (state === "active") {
    unlocked.delete(reward.id);
    cascadeDeactivate(reward.id);
    recalcKeysAndPoints();
    enforceKeyLimit();
    updateAvailability();
    drawConnections();
    updateStats();
    return;
  }
}

function flashRed(el) {
  el.style.boxShadow = "0 0 10px red";
  setTimeout(() => (el.style.boxShadow = ""), 300);
}

/* === DISPONIBILITÉ === */
function updateAvailability() {
  document.querySelectorAll(".reward-box").forEach(box => {
    const id = box.dataset.id;
    const reward = rewards.find(r => r.id === id);
    if (!reward) return;

    if (unlocked.has(id)) {
      box.className = "reward-box active";
      box.dataset.state = "active";
      return;
    }
    if (planned.has(id)) {
      box.className = "reward-box planned";
      box.dataset.state = "planned";
      return;
    }

    const requires = reward.requires || [];
    const canTake = requires.length === 0 ||
                    requires.some(req => unlocked.has(req) || planned.has(req));

    box.className = canTake ? "reward-box available" : "reward-box locked";
    box.dataset.state = canTake ? "available" : "locked";
  });

  updateStats();
}

/* === CASCADE === */
function cascadeDeactivate(id) {
  const dependents = dependentsMap[id] || [];
  for (const depId of dependents) {
    const reward = rewards.find(r => r.id === depId);
    if (!reward) continue;

    const stillConnected = (reward.requires || []).some(req => unlocked.has(req) || planned.has(req));
    if (stillConnected) continue;

    const box = document.querySelector(`.reward-box[data-id="${depId}"]`);
    if (!box) continue;

    unlocked.delete(depId);
    planned.delete(depId);
    box.className = "reward-box locked";
    box.dataset.state = "locked";

    cascadeDeactivate(depId);
  }
}

/* === CHEMINS === */
function drawConnections() {
  svg.innerHTML = "";
  const boardRect = svg.getBoundingClientRect();
  const grayPaths = [], goldPaths = [], bluePaths = [], greenPaths = [];

  rewards.forEach(r => {
    (r.requires || []).forEach(req => {
      const pBox = document.querySelector(`.reward-box[data-id="${req}"]`);
      const cBox = document.querySelector(`.reward-box[data-id="${r.id}"]`);
      if (!pBox || !cBox) return;

      const pRect = pBox.getBoundingClientRect();
      const cRect = cBox.getBoundingClientRect();
      const x1 = pRect.left + pRect.width / 2 - boardRect.left;
      const y1 = pRect.bottom - boardRect.top;
      const x2 = cRect.left + cRect.width / 2 - boardRect.left;
      const y2 = cRect.top - boardRect.top;
      const midY = y1 + (y2 - y1) * 0.45;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`);
      path.setAttribute("stroke-width", "3.5");
      path.setAttribute("fill", "none");

      const parentPlanned = planned.has(req);
      const childPlanned = planned.has(r.id);
      const parentActive = unlocked.has(req);
      const childActive = unlocked.has(r.id);

      if (parentActive && childActive) {
        path.setAttribute("stroke", "#00ff66");
        greenPaths.push(path);
      } else if ((parentPlanned && childPlanned) || (parentActive && childPlanned)) {
        path.setAttribute("stroke", "#00c9ff");
        bluePaths.push(path);
      } else if (parentActive && !childActive) {
        path.setAttribute("stroke", "#d4af37");
        goldPaths.push(path);
      } else {
        path.setAttribute("stroke", "#555");
        grayPaths.push(path);
      }
    });
  });

  grayPaths.forEach(p => svg.appendChild(p));
  goldPaths.forEach(p => svg.appendChild(p));
  bluePaths.forEach(p => svg.appendChild(p));
  greenPaths.forEach(p => svg.appendChild(p));
}

function playActivationEffect(box) {
  const fx = document.createElement("div");
  fx.className = "activation-flash";
  box.appendChild(fx);
  setTimeout(() => fx.remove(), 700);
}

/* === BOOT === */
init();
window.addEventListener("hashchange", () => {
  container.innerHTML = "";
  svg.innerHTML = "";
  unlocked.clear();
  planned.clear();
  keys = 0;
  activeLocks = 0;
  points = 0;
  init();
});
