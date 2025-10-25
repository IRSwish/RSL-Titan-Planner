(() => {
  const ABS_COLS = tier => (tier === 1 ? [2,3] : [1,2,3,4]);
  const trees = document.querySelectorAll('.tree');
  const MASTERY_COSTS = {};

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

    // Création de la grille
    for (let tier = 1; tier <= 6; tier++) {
      const row = document.createElement('div');
      row.className = 'row' + (tier === 1 ? ' centered' : '');
      rows.appendChild(row);

      ABS_COLS(tier).forEach(colAbs => {
        const wrap = document.createElement("div");
        wrap.className = "mastery-wrap";

        const mastery = document.createElement("div");
        mastery.className = "mastery";
        mastery.dataset.id = `${branch}-${tier}-${colAbs}`;
        mastery.dataset.tier = String(tier);
        mastery.dataset.col = String(colAbs);

        wrap.appendChild(mastery);
        row.appendChild(wrap);
      });
    }

    // Bouton reset individuel
    const btn = tree.querySelector('.reset-tree');
    if (btn)
      btn.addEventListener('click', () => {
        tree.querySelectorAll('.mastery.active').forEach(x =>
          x.classList.remove('active')
        );
        updateAll(true);
      });
  });

  // Gestion des clics sur les maîtrises
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

  // ====== Logique du builder ======

  function getState() {
    const activeEls = Array.from(document.querySelectorAll('.mastery.active'));
    const active = new Set(activeEls.map(x => x.dataset.id));
    const byBranch = { offense: [], defense: [], support: [] };
    activeEls.forEach(el =>
      byBranch[el.dataset.id.split('-')[0]].push(el)
    );

    const activeTrees = new Set();
    const perTierGlobal = { 1:0,2:0,3:0,4:0,5:0,6:0 };
    const perTierPerBranch = {
      offense:{1:0,2:0,3:0,4:0,5:0,6:0},
      defense:{1:0,2:0,3:0,4:0,5:0,6:0},
      support:{1:0,2:0,3:0,4:0,5:0,6:0}
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

  function updateAll(cascade = false) {
    updateLocksAndAvailable();
    updateScrolls();
    if (cascade && validateActiveConnections()) {
      updateLocksAndAvailable();
      updateScrolls();
    }
  }

  // Chargement du JSON
  fetch('masteries.json')
    .then(res => res.json())
    .then(data => {
      for (const branch in data) {
        data[branch].flat().forEach(m => {
          const el = document.querySelector(`[data-id="${m.id}"]`);
          if (!el) return;

          MASTERY_COSTS[m.id] = m.cost || 0;

          el.dataset.info = JSON.stringify({
            name: m.name,
            description: m.description,
            cost: m.cost
          });

          if (m.icon) {
            el.style.setProperty("--bg-image", `url('style/img/masteries/${m.icon}.webp')`);
            el.style.setProperty("background-image", "none"); // désactive le fond direct
            el.style.setProperty("background", "none");
            el.style.setProperty("content", "none");
            el.querySelector(".mastery::after"); // inutile, c’est géré via CSS variable
            el.style.setProperty("--image", `url('style/img/masteries/${m.icon}.webp')`);
            el.style.setProperty("--image-url", `url('style/img/masteries/${m.icon}.webp')`);
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
          } else el.textContent = m.name.split(' ')[0];
        });
      }
      updateAll(true);
    });

  // Lecture du lien partagé (param ?m=)
  const params = new URLSearchParams(location.search);
  if (params.has('m')) {
    const ids = atob(params.get('m')).split(',').filter(Boolean);
    ids.forEach(id =>
      document.querySelector(`[data-id="${id}"]`)?.classList.add('active')
    );
  }

  attachEvents();
  updateAll(true);
})();
