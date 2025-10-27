const ICON_PATH = "/style/img/Misc/";
let rewards = [];
let unlocked = new Set();
let keys = 0;
let points = 0;
let dependentsMap = {};

const container = document.getElementById("rewardContainer");
const svg = document.getElementById("connections");
const pointsSpan = document.getElementById("points");
const keysSpan = document.getElementById("keys");
const resetBtn = document.getElementById("reset");

function updateStats() {
  pointsSpan.textContent = `Points spent: ${points.toLocaleString("en-US")}`;
  keysSpan.textContent = `Keys available: ${keys}`;
}

function resetAll() {
  unlocked.clear();
  keys = 0;
  points = 0;
  document.querySelectorAll(".reward-box").forEach(b => {
    b.classList.remove("active", "available", "locked");
    b.dataset.state = "locked";
  });
  updateStats();
  updateAvailability();
  drawConnections();
}

resetBtn.addEventListener("click", resetAll);

async function init() {
  const res = await fetch("rewards.json");
  rewards = await res.json();

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

  updateStats();
  updateAvailability();
  drawConnections();
  window.addEventListener("resize", () => requestAnimationFrame(drawConnections));
  window.addEventListener("scroll", () => requestAnimationFrame(drawConnections));
}

function cascadeDeactivate(id) {
  const dependents = dependentsMap[id] || [];

  for (const depId of dependents) {
    const reward = rewards.find(r => r.id === depId);
    if (!reward) continue;

    // Vérifie si le dependent a AU MOINS un parent encore actif
    const stillConnected = (reward.requires || []).some(req => unlocked.has(req));

    if (stillConnected) continue; // on ne désactive pas si un parent reste actif

    // Sinon, on désactive normalement
    if (unlocked.has(depId)) {
      const box = document.querySelector(`.reward-box[data-id="${depId}"]`);
      if (!box) continue;

      box.classList.remove("active");
      box.classList.add("locked");
      box.dataset.state = "locked";
      unlocked.delete(depId);

      if (reward.name.toLowerCase().includes("key")) keys--;
      else if (reward.name.toLowerCase().includes("lock")) keys++;
      else points -= reward.cost;

      // Et on continue récursivement
      cascadeDeactivate(depId);
    }
  }
}


function handleClick(reward, box) {
  const state = box.dataset.state;
  const isKey = reward.name.toLowerCase().includes("key");
  const isLock = reward.name.toLowerCase().includes("lock");
  if (state === "locked") return;

  const isActive = state === "active";

  // DEACTIVATE
    if (isActive) {
    box.classList.remove("active");
    box.classList.add("available");
    box.dataset.state = "available";
    unlocked.delete(reward.id);

    if (isKey) {
        keys--;
        points -= reward.cost;
        verifyKeyLockBalance(); // 🧩 vérifie si on a encore assez de clés
    } else if (isLock) {
        keys++;
    } else {
        points -= reward.cost;
    }

    cascadeDeactivate(reward.id);
    updateStats();
    updateAvailability();
    drawConnections();
    return;
    }

  // ACTIVATE
  if (isLock) {
    if (keys <= 0) {
      box.style.boxShadow = "0 0 15px red";
      setTimeout(() => (box.style.boxShadow = ""), 300);
      return;
    }
    keys--; // use a key but don't add points
  } else if (isKey) {
    keys++;
    points += reward.cost; // count key cost
  } else {
    points += reward.cost;
  }

  box.classList.remove("available");
  box.classList.add("active");
  box.dataset.state = "active";
  unlocked.add(reward.id);
  playActivationEffect(box);
  updateStats();
  updateAvailability();
  drawConnections();
}

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

    const requires = reward.requires || [];
    const canTake = requires.length === 0 || requires.some(req => unlocked.has(req));

    if (canTake) {
      box.className = "reward-box available";
      box.dataset.state = "available";
    } else {
      box.className = "reward-box locked";
      box.dataset.state = "locked";
    }
  });
  updateStats();
}

function drawConnections() {
  svg.innerHTML = "";
  const boardRect = svg.getBoundingClientRect();

  // Trois ensembles de chemins selon la couleur
  const grayPaths = [];
  const goldPaths = [];
  const greenPaths = [];

  rewards.forEach(r => {
    (r.requires || []).forEach(req => {
      const parentBox = document.querySelector(`.reward-box[data-id="${req}"]`);
      const childBox = document.querySelector(`.reward-box[data-id="${r.id}"]`);
      if (!parentBox || !childBox) return;

      const pRect = parentBox.getBoundingClientRect();
      const cRect = childBox.getBoundingClientRect();

      const x1 = pRect.left + pRect.width / 2 - boardRect.left;
      const y1 = pRect.bottom - boardRect.top;
      const x2 = cRect.left + cRect.width / 2 - boardRect.left;
      const y2 = cRect.top - boardRect.top;
      const midY = y1 + (y2 - y1) * 0.45;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`);
      path.setAttribute("stroke-width", "3.5");
      path.setAttribute("fill", "none");

      const parentActive = unlocked.has(req);
      const childActive = unlocked.has(r.id);

      // Couleur selon état des nœuds
      if (parentActive && childActive) {
        path.setAttribute("stroke", "#00ff66"); // vert
        greenPaths.push(path);
      } else if (parentActive && !childActive) {
        path.setAttribute("stroke", "#d4af37"); // doré
        goldPaths.push(path);
      } else {
        path.setAttribute("stroke", "#555"); // gris
        grayPaths.push(path);
      }
    });
  });

  // Ordre d’empilement : gris → doré → vert
  grayPaths.forEach(p => svg.appendChild(p));
  goldPaths.forEach(p => svg.appendChild(p));
  greenPaths.forEach(p => svg.appendChild(p));
}



function playActivationEffect(box) {
  const effect = document.createElement("div");
  effect.className = "activation-flash";
  box.appendChild(effect);
  setTimeout(() => effect.remove(), 700);
}

function verifyKeyLockBalance() {
  // Récupère toutes les clés et locks actifs
  const activeKeys = rewards.filter(r =>
    r.name.toLowerCase().includes("key") && unlocked.has(r.id)
  );
  const activeLocks = rewards.filter(r =>
    r.name.toLowerCase().includes("lock") && unlocked.has(r.id)
  );

  const availableKeys = activeKeys.length;
  const usedLocks = activeLocks.length;

  // Si on a plus de locks actifs que de clés, on doit corriger
  if (usedLocks > availableKeys) {
    const excess = usedLocks - availableKeys;

    // On trie les locks actifs par "profondeur" (le plus bas dans l’arbre d’abord)
    const sortedLocks = activeLocks.sort((a, b) => {
      const tierA = parseInt(a.id.match(/^t(\d+)/)?.[1] || 0);
      const tierB = parseInt(b.id.match(/^t(\d+)/)?.[1] || 0);
      return tierB - tierA; // du plus profond au plus haut
    });

    // Désactivation des locks excédentaires
    for (let i = 0; i < excess; i++) {
      const lock = sortedLocks[i];
      if (!lock) continue;

      const box = document.querySelector(`.reward-box[data-id="${lock.id}"]`);
      if (!box) continue;

      box.classList.remove("active");
      box.classList.add("available");
      box.dataset.state = "available";
      unlocked.delete(lock.id);
      keys++; // on récupère la clé utilisée

      cascadeDeactivate(lock.id);
    }

    updateStats();
    updateAvailability();
    drawConnections();
  }
}

init();
