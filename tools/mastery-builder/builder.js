(() => {
  const ABS_COLS = tier => (tier === 1 ? [2, 3] : [1, 2, 3, 4]);
  const trees = document.querySelectorAll('.tree');
  const MASTERY_COSTS = {};

  // === Construction du builder ===
  trees.forEach(tree => {
    if (tree.dataset._built) return;
    tree.dataset._built = '1';
    const branch = tree.dataset.branch;

    const rows = tree.querySelector('.rows') || (() => {
      const d = document.createElement('div');
      d.className = 'rows';
      tree.appendChild(d);
      return d;
    })();

    for (let tier = 1; tier <= 6; tier++) {
      const row = document.createElement('div');
      row.className = 'row' + (tier === 1 ? ' centered' : '');
      rows.appendChild(row);

      ABS_COLS(tier).forEach(colAbs => {
        const mastery = document.createElement('div');
        mastery.className = 'mastery';
        mastery.dataset.id = `${branch}-${tier}-${colAbs}`;
        mastery.dataset.tier = String(tier);
        mastery.dataset.col = String(colAbs);

        const container = document.createElement('div');
        container.className = 'octogone-container';

        const octo = document.createElement('div');
        octo.className = 'octogone';
        container.appendChild(octo);

        const img = document.createElement('div');
        img.className = 'octogone-image';
        container.appendChild(img);

        mastery.appendChild(container);
        row.appendChild(mastery);
      });
    }

    // Bouton reset
    const btn = tree.querySelector('.reset-tree');
    if (btn)
      btn.addEventListener('click', () => {
        tree.querySelectorAll('.mastery.active').forEach(x => x.classList.remove('active'));
        updateAll(true);
      });

    // === Calque SVG pour les connexions ===
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("connections");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.pointerEvents = "none";
    svg.style.overflow = "visible";
    tree.style.position = "relative";
    tree.prepend(svg);
  });

  // === Clics sur les maîtrises ===
  function attachEvents() {
    document.querySelectorAll('.mastery').forEach(m => {
      m.addEventListener('click', () => {
        if (m.classList.contains('locked')) return;

        if (m.classList.contains('active')) {
          m.classList.remove('active');
          updateAll(true);
          return;
        }

        if (!canSelect(m)) return;

        m.classList.add('active');
        updateAll(true);
      });
    });
  }

  // === Logique du builder ===
  function getState() {
    const activeEls = Array.from(document.querySelectorAll('.mastery.active'));
    const active = new Set(activeEls.map(x => x.dataset.id));
    const byBranch = { offense: [], defense: [], support: [] };
    activeEls.forEach(el => byBranch[el.dataset.id.split('-')[0]].push(el));

    const activeTrees = new Set();
    const perTierGlobal = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const perTierPerBranch = {
      offense: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      defense: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      support: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    };
    let totalT6 = 0;

    active.forEach(id => {
      const [b, tStr] = id.split('-');
      const t = +tStr;
      activeTrees.add(b);
      perTierGlobal[t]++;
      perTierPerBranch[b][t]++;
      if (t === 6) totalT6++;
    });

    return { active, byBranch, activeTrees, perTierGlobal, perTierPerBranch, totalT6 };
  }

  function isAdjacentAllowed(m) {
    const [branch, tStr, cStr] = m.dataset.id.split('-');
    const tier = +tStr, col = +cStr;
    if (tier === 1) return true;

    const prevTier = tier - 1;
    for (const d of [-1, 0, 1]) {
      const prev = document.querySelector(`[data-id="${branch}-${prevTier}-${col + d}"]`);
      if (prev && prev.classList.contains('active')) return true;
    }

    const sameTierActive = !!document.querySelector(`.mastery.active[data-id^="${branch}-${tier}-"]`);
    if (sameTierActive) {
      for (const d of [-1, 1]) {
        const adj = document.querySelector(`[data-id="${branch}-${tier}-${col + d}"]`);
        if (adj && adj.classList.contains('active')) return true;
      }
    }

    return false;
  }

  function canSelect(m) {
    const { activeTrees, perTierGlobal, perTierPerBranch, totalT6 } = getState();
    const [branch, tStr] = m.dataset.id.split('-');
    const tier = +tStr;

    if (!activeTrees.has(branch) && activeTrees.size >= 2) return false;
    if (!isAdjacentAllowed(m)) return false;
    if (tier === 1) return perTierPerBranch[branch][1] < 1;
    if (tier >= 2 && tier <= 5)
      return perTierGlobal[tier] < 3 && perTierPerBranch[branch][tier] < 2;
    if (tier === 6) return totalT6 < 1;

    return true;
  }

  function validateActiveConnections() {
    const { byBranch } = getState();
    let changed = false;

    ['offense', 'defense', 'support'].forEach(branch => {
      const actives = byBranch[branch];
      if (!actives.length) return;

      const anchor = actives.find(el => +el.dataset.tier === 1);
      if (!anchor) {
        actives.forEach(el => el.classList.remove('active'));
        changed = true;
        return;
      }

      const reachable = new Set([anchor.dataset.id]);
      const stack = [anchor];

      while (stack.length) {
        const cur = stack.pop();
        const [b, tStr, cStr] = cur.dataset.id.split('-');
        const tier = +tStr, col = +cStr;
        if (tier >= 6) continue;

        const nextTier = tier + 1;
        for (const d of [-1, 0, 1]) {
          const next = document.querySelector(`[data-id="${branch}-${nextTier}-${col + d}"]`);
          if (next && next.classList.contains('active') && !reachable.has(next.dataset.id)) {
            reachable.add(next.dataset.id);
            stack.push(next);
          }
        }

        for (const d of [-1, 1]) {
          const side = document.querySelector(`[data-id="${branch}-${tier}-${col + d}"]`);
          if (side && side.classList.contains('active') && !reachable.has(side.dataset.id)) {
            reachable.add(side.dataset.id);
            stack.push(side);
          }
        }
      }

      actives.forEach(el => {
        if (!reachable.has(el.dataset.id)) {
          el.classList.remove('active');
          changed = true;
        }
      });
    });

    return changed;
  }

function drawConnections() {
  document.querySelectorAll('.tree').forEach(tree => {
    const svg = tree.querySelector('svg.connections');
    if (!svg) return;
    svg.innerHTML = '';

    const actives = Array.from(tree.querySelectorAll('.mastery.active'));
    if (actives.length < 2) return;

    const treeRect = tree.getBoundingClientRect();

    // Indexation par tier
    const byTier = {};
    actives.forEach(m => {
      const t = +m.dataset.tier;
      (byTier[t] ||= []).push(m);
    });
    Object.values(byTier).forEach(list => list.sort((a,b)=>+a.dataset.col-+b.dataset.col));

    const branch = tree.dataset.branch;
    const chosenParent = new Map();
    const parentCandidatesCount = new Map();

    // === Connexions VERTICALES / DIAGONALES ===
    Object.keys(byTier).map(Number).sort((a,b)=>a-b).forEach(tier => {
      const prevTier = tier - 1;
      if (!byTier[tier] || !byTier[prevTier]) return;

      byTier[tier].forEach(child => {
        const c = +child.dataset.col;
        const same  = byTier[prevTier].find(p => +p.dataset.col === c);
        const left  = byTier[prevTier].find(p => +p.dataset.col === c - 1);
        const right = byTier[prevTier].find(p => +p.dataset.col === c + 1);

        const candidates = [same, left, right].filter(Boolean);
        parentCandidatesCount.set(child.dataset.id, candidates.length);

        if (!candidates.length) return;

        const parentEl = same || left || right;
        chosenParent.set(child.dataset.id, parentEl);
      });
    });

    // Tracé des liens verticaux/diagonaux
    chosenParent.forEach((parentEl, childId) => {
      const childEl = actives.find(m => m.dataset.id === childId);
      if (!childEl) return;

      const r1 = parentEl.getBoundingClientRect();
      const r2 = childEl.getBoundingClientRect();

      const x1 = r1.left + r1.width / 2 - treeRect.left;
      const y1 = r1.top + r1.height / 2 - treeRect.top;
      const x2 = r2.left + r2.width / 2 - treeRect.left;
      const y2 = r2.top + r2.height / 2 - treeRect.top;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.classList.add('glow-line');
      svg.appendChild(line);
    });

    // === Connexions HORIZONTALES ===
    Object.keys(byTier).map(Number).forEach(tier => {
      const row = byTier[tier];
      if (!row) return;

      for (let i = 0; i < row.length - 1; i++) {
        const a = row[i], b = row[i+1];
        if (+b.dataset.col !== +a.dataset.col + 1) continue;

        const aHasParents = (parentCandidatesCount.get(a.dataset.id) || 0) > 0;
        const bHasParents = (parentCandidatesCount.get(b.dataset.id) || 0) > 0;

        // règle : relier si au moins une des deux n’a pas de parent au-dessus
        if (aHasParents && bHasParents) continue;

        const r1 = a.getBoundingClientRect();
        const r2 = b.getBoundingClientRect();

        const x1 = r1.right - treeRect.left - (r1.width * 0.25);
        const y1 = r1.top + r1.height / 2 - treeRect.top;
        const x2 = r2.left - treeRect.left + (r2.width * 0.25);
        const y2 = r2.top + r2.height / 2 - treeRect.top;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.classList.add('glow-line');
        svg.appendChild(line);
      }
    });
  });
}


  function updateLocksAndAvailable() {
    const { activeTrees } = getState();
    document.querySelectorAll('.mastery').forEach(m => {
      if (m.classList.contains('active')) {
        m.classList.remove('locked', 'available');
        return;
      }
      const branch = m.dataset.id.split('-')[0];
      let lock = false;
      if (!activeTrees.has(branch) && activeTrees.size >= 2) lock = true;
      const selectable = !lock && canSelect(m);
      m.classList.toggle('locked', !selectable);
      m.classList.toggle('available', selectable);
    });
  }

  function updateScrolls() {
    let basic = 0, adv = 0, div = 0;
    document.querySelectorAll('.mastery.active').forEach(m => {
      const tier = +m.dataset.tier;
      const cost = MASTERY_COSTS[m.dataset.id] || 0;
      if (tier <= 2) basic += cost;
      else if (tier <= 4) adv += cost;
      else div += cost;
    });
    document.querySelector('#basic-scrolls span').textContent = `${Math.min(basic, 100)} / 100`;
    document.querySelector('#advanced-scrolls span').textContent = `${Math.min(adv, 600)} / 600`;
    document.querySelector('#divine-scrolls span').textContent = `${Math.min(div, 950)} / 950`;
  }

  // === Encodage / Décodage compact ===
  function b64urlFromBytes(bytes) {
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytesFromB64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  }
  function encodeMasteries(activeIds) {
    const bytes = new Uint8Array(activeIds.length);
    activeIds.forEach((id, i) => {
      const [branch, t, c] = id.split('-');
      const b = branch === 'offense' ? 0 : branch === 'defense' ? 1 : 2;
      const tier = parseInt(t, 10) - 1;
      const col = parseInt(c, 10) - 1;
      bytes[i] = (b << 5) | ((tier & 0b111) << 2) | (col & 0b11);
    });
    return b64urlFromBytes(bytes);
  }
  function decodeMasteries(encoded) {
    const arr = bytesFromB64url(encoded);
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const byte = arr[i];
      const b = (byte >> 5) & 0b11;
      const tier = ((byte >> 2) & 0b111) + 1;
      const col = (byte & 0b11) + 1;
      const branch = b === 0 ? 'offense' : b === 1 ? 'defense' : 'support';
      out.push(`${branch}-${tier}-${col}`);
    }
    return out;
  }

  // === Mise à jour globale + lien ===
  function updateAll(cascade = false) {
    updateLocksAndAvailable();
    updateScrolls();
    if (cascade && validateActiveConnections()) {
      updateLocksAndAvailable();
      updateScrolls();
    }

    drawConnections();

    // Génération du lien de build
    const activeIds = Array.from(document.querySelectorAll('.mastery.active')).map(m => m.dataset.id);
    const base = `${location.origin}${location.pathname}`;
    const encoded = encodeMasteries(activeIds);
    window.currentShareLink = `${base}?m=${encoded}`;
  }

  // === Lecture du lien partagé ===
  const params = new URLSearchParams(location.search);
  let initialMasteries = [];
  if (params.has('m')) {
    try { initialMasteries = decodeMasteries(params.get('m')); } catch { initialMasteries = []; }
  }

  // === Chargement JSON + application ===
  fetch('/tools/mastery-builder/masteries.json')
    .then(res => res.json())
    .then(data => {
      for (const branch in data) {
        data[branch].flat().forEach(m => {
          const masteryEl = document.querySelector(`[data-id="${m.id}"]`);
          if (!masteryEl) return;
          MASTERY_COSTS[m.id] = m.cost || 0;
          masteryEl.dataset.info = JSON.stringify({
            name: m.name,
            description: m.description,
            cost: m.cost
          });
          const imgEl = masteryEl.querySelector(".octogone-image");
          if (m.icon && imgEl) {
            imgEl.style.setProperty("--mastery-icon", `url('/style/img/masteries/${m.icon}.webp')`);
          }
        });
      }

      if (initialMasteries.length) {
        initialMasteries.forEach(id => {
          const el = document.querySelector(`[data-id="${id}"]`);
          if (el) el.classList.add('active');
        });

        // backfill pour garder les arbres complets
        const branches = ["offense", "defense", "support"];
        branches.forEach(branch => {
          const picks = initialMasteries.filter(id => id.startsWith(branch));
          if (picks.length && !picks.some(id => id.startsWith(`${branch}-1-`))) {
            const avgCol = picks.map(id => +id.split('-')[2]).reduce((a, b) => a + b, 0) / picks.length;
            const targetCol = avgCol < 2.5 ? 2 : 3;
            const t1 = document.querySelector(`[data-id="${branch}-1-${targetCol}"]`);
            if (t1) t1.classList.add('active');
          }
        });
      }

      attachEvents();
      updateAll(true);
    });

  // === Bouton "Copy link" ===
  document.addEventListener('click', e => {
    if (e.target?.id === 'copy-link') {
      e.preventDefault();
      const btn = e.target;
      const link = window.currentShareLink || `${location.origin}${location.pathname}`;
      navigator.clipboard.writeText(link).then(() => {
        const oldText = btn.textContent;
        btn.textContent = 'Lien copié !';
        btn.disabled = true;
        btn.style.opacity = '0.8';
        setTimeout(() => {
          btn.textContent = oldText;
          btn.disabled = false;
          btn.style.opacity = '1';
        }, 1500);
      });
    }
  });
})();
