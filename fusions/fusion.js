// --- fusion.js ---
(() => {
  let timelineData = null;

  function fetchAndRenderTimeline() {
    const timelineContainer = document.querySelector('.timeline-container');
    if (!timelineContainer) return;

    const hash = window.location.hash.replace('#', '');
    const fusionConfig = window.fusions[hash];

    if (!fusionConfig) {
      console.error('Aucune fusion trouvée pour le hash :', hash);
      timelineContainer.querySelector('.timeline').innerHTML = '';
      return;
    }

    const jsonPath = `/fusions/${fusionConfig.json}`;
    timelineContainer.dataset.json = jsonPath;

    fetch(jsonPath)
      .then(res => {
        if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        timelineData = data;
        renderTimeline(data);
      })
      .catch(err => {
        console.error('Erreur lors du chargement du JSON :', err);
        timelineContainer.querySelector('.timeline').innerHTML = '';
      });
  }

  window.addEventListener('load', () => {
    fetchAndRenderTimeline();
    loadMenu();
  });

  window.addEventListener('hashchange', () => {
    fetchAndRenderTimeline();
  });

  window.addEventListener('resize', () => {
    if (timelineData) renderTimeline(timelineData);
  });

  // --- Rendu principal ---
  function renderTimeline(data) {
    const timelineContainer = document.querySelector('.timeline-container');
    const timeline = document.querySelector('.timeline');
    if (!timeline || !timelineContainer) return;

    timeline.innerHTML = '';

    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = data.title || '';

    const events = Array.isArray(data.events) ? data.events : [];
    if (events.length === 0) return;

    const parseLocal = (iso) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d, 0, 0, 0, 0);
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const minDate = new Date(Math.min(...events.map(e => parseLocal(e.start_date))));
    const maxDate = new Date(Math.max(...events.map(e => parseLocal(e.end_date))));
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;

    const savedStates = JSON.parse(localStorage.getItem('pointStates') || '{}');
    const pointStates = ['state-upcoming', 'state-ongoing', 'state-validated', 'state-passed'];
    const horizontalGap = 16;

    const containerStyle = getComputedStyle(timelineContainer);
    const usableWidth = timelineContainer.clientWidth
      - parseFloat(containerStyle.paddingLeft)
      - parseFloat(containerStyle.paddingRight);
    const dayWidth = usableWidth / totalDays;

    const selectedDates = new Set();

    function highlightByDates() {
      document.querySelectorAll('.date-column').forEach(col => {
        const date = col.dataset.date;
        col.classList.toggle('date-selected', selectedDates.has(date));
      });

      document.querySelectorAll('.event-block').forEach(block => {
        const start = parseLocal(block.dataset.start);
        const end = parseLocal(block.dataset.end);
        let highlighted = false;
        selectedDates.forEach(dateStr => {
          const d = parseLocal(dateStr);
          if (d >= start && d <= end) highlighted = true;
        });
        block.classList.toggle('event-highlight', highlighted);
      });
    }

    // --- Colonnes de dates ---
    for (let i = 0; i < totalDays; i++) {
      const currentDate = new Date(minDate);
      currentDate.setDate(minDate.getDate() + i);

      const isoDate = [
        currentDate.getFullYear(),
        String(currentDate.getMonth() + 1).padStart(2, '0'),
        String(currentDate.getDate()).padStart(2, '0')
      ].join('-');

      const day = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
      const date = currentDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

      const col = document.createElement('div');
      col.classList.add('date-column');
      col.style.width = `${dayWidth}px`;
      col.dataset.date = isoDate;

      col.innerHTML = `<span class="day">${day}</span><span class="date">${date}</span>`;

      if (i > 0) {
        const leftLine = document.createElement('div');
        leftLine.classList.add('grid-line');
        leftLine.style.left = '0';
        col.appendChild(leftLine);
      }
      if (i < totalDays - 1) {
        const rightLine = document.createElement('div');
        rightLine.classList.add('grid-line');
        rightLine.style.right = '0';
        col.appendChild(rightLine);
      }

      if (
        currentDate.getFullYear() === today.getFullYear() &&
        currentDate.getMonth() === today.getMonth() &&
        currentDate.getDate() === today.getDate()
      ) {
        col.classList.add('date-selected');
        selectedDates.add(isoDate);
      }

      col.addEventListener('click', () => {
        const date = col.dataset.date;
        if (selectedDates.has(date)) selectedDates.delete(date);
        else selectedDates.add(date);
        highlightByDates();
      });

      timeline.appendChild(col);
    }

    highlightByDates();

    // --- Ligne centrale ---
    const line = document.createElement('div');
    line.classList.add('timeline-line');
    timeline.appendChild(line);

    // --- Placement des events ---
    const placedEvents = computeTracks(events, minDate, dayWidth);
    placedEvents.forEach((item) => {
      const event = item.event;
      const top = item.top + 100;
      const start = parseLocal(event.start_date);
      const end = parseLocal(event.end_date);

      const dayStart = ((start - minDate) / (1000 * 60 * 60 * 24)) + 0.5;
      const dayEnd = ((end - minDate) / (1000 * 60 * 60 * 24)) + 0.5;

      const block = document.createElement('div');
      block.classList.add('event-block');
      block.dataset.start = event.start_date;
      block.dataset.end = event.end_date;

      const left = Math.round(dayStart * dayWidth + horizontalGap / 2);
      const width = Math.round((dayEnd - dayStart) * dayWidth - horizontalGap);

      block.style.left = `${left}px`;
      block.style.width = `${width}px`;
      block.style.top = `${top}px`;

      if (end.getTime() < today.getTime()) {
        block.classList.add('event-ended');

        const allPoints = (event.points || []).length;
        const allIds = Array.from({ length: allPoints }, (_, idx) => {
          const safeName = event.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
          return `${safeName}-${event.start_date}-${event.end_date}-${idx}`;
        });

        const validatedCount = allIds.filter(pid => savedStates[pid] === 'state-validated').length;

        if (validatedCount === allPoints && allPoints > 0) block.classList.add('validated');
        else if (validatedCount > 0) block.classList.add('partial');
      }

      const rewards = (event.reward || '').split(',').map(r => r.trim());
      const pointsHTML = (event.points || []).map((p, idx) => {
        const safeName = event.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        const id = `${safeName}-${event.start_date}-${event.end_date}-${idx}`;
        let initialState;
        if (today < start) initialState = 'state-upcoming';
        else if (today >= start && today <= end) initialState = 'state-ongoing';
        else if (today > end) initialState = 'state-passed';
        const saved = savedStates[id] || initialState;
        const reward = rewards[idx] || 'default';
        return `<div class="point-box ${saved}" data-id="${id}">
                  <img src="/tools/champions-index/img/champions/${reward}.webp" alt="${reward}"/>
                  <span>${p}</span>
                </div>`;
      }).join('');

      block.innerHTML = `
        <div class="event-name">${event.name}</div>
        <button class="event-reset" title="Réinitialiser cet événement">↺</button>
        <div class="points-container">${pointsHTML}</div>
      `;

      timeline.appendChild(block);
    });

    // --- Ajuste la hauteur totale ---
    const blocks = document.querySelectorAll('.event-block');
    let maxBottom = 0;
    blocks.forEach(b => {
      const bottom = b.offsetTop + b.offsetHeight;
      if (bottom > maxBottom) maxBottom = bottom;
    });
    timeline.style.height = `${maxBottom + 20}px`;

    // --- Clics sur les points et resets (inchangé, idem que version précédente) ---
    document.querySelectorAll('.point-box').forEach(box => {
      box.addEventListener('click', (e) => {
        const parentEvent = box.closest('.event-block');
        const id = box.dataset.id;

        if (parentEvent && parentEvent.classList.contains('event-ended')) {
          if (box.classList.contains('state-validated')) {
            box.classList.remove('state-validated');
            box.classList.add('state-passed');
          } else {
            box.classList.remove('state-passed');
            box.classList.add('state-validated');
          }

          savedStates[id] = box.classList.contains('state-validated')
            ? 'state-validated'
            : 'state-passed';
          localStorage.setItem('pointStates', JSON.stringify(savedStates));

          const allPoints = parentEvent.querySelectorAll('.point-box');
          const validatedCount = Array.from(allPoints).filter(p => p.classList.contains('state-validated')).length;

          parentEvent.classList.remove('validated', 'partial');
          if (validatedCount === 0) { }
          else if (validatedCount === allPoints.length) parentEvent.classList.add('validated');
          else parentEvent.classList.add('partial');

          updateSummary();
          return;
        }

        const states = ['state-upcoming', 'state-ongoing', 'state-validated', 'state-passed'];
        const currentIndex = states.findIndex(s => box.classList.contains(s));
        const nextIndex = (e.ctrlKey || e.metaKey)
          ? (currentIndex - 1 + states.length) % states.length
          : (currentIndex + 1) % states.length;

        states.forEach(s => box.classList.remove(s));
        box.classList.add(states[nextIndex]);
        savedStates[id] = states[nextIndex];
        localStorage.setItem('pointStates', JSON.stringify(savedStates));
        updateSummary();
      });
    });

    // --- Reset individuel ---
    document.querySelectorAll('.event-reset').forEach(btn => {
      btn.addEventListener('click', () => {
        const parentEvent = btn.closest('.event-block');
        if (!parentEvent) return;

        const boxes = parentEvent.querySelectorAll('.point-box');
        boxes.forEach(box => {
          const id = box.dataset.id;
          const start = new Date(parentEvent.dataset.start);
          const end = new Date(parentEvent.dataset.end);
          let initialState;
          if (today < start) initialState = 'state-upcoming';
          else if (today >= start && today <= end) initialState = 'state-ongoing';
          else initialState = 'state-passed';
          box.className = `point-box ${initialState}`;
          savedStates[id] = initialState;
        });

        parentEvent.classList.remove('validated', 'partial');
        localStorage.setItem('pointStates', JSON.stringify(savedStates));
        updateSummary();
      });
    });

    // --- Reset global (ajouté dynamiquement) ---
    const summaryBox = document.querySelector('.summary-box');
    if (summaryBox && !document.getElementById('reset-global')) {
      const globalBtn = document.createElement('button');
      globalBtn.id = 'reset-global';
      globalBtn.className = 'global-reset';
      globalBtn.textContent = '↺';
      summaryBox.appendChild(globalBtn);

      globalBtn.addEventListener('click', () => {
        if (!confirm('Reset all points ?')) return;

        document.querySelectorAll('.point-box').forEach(box => {
          const parent = box.closest('.event-block');
          const start = new Date(parent.dataset.start);
          const end = new Date(parent.dataset.end);
          let initialState;
          if (today < start) initialState = 'state-upcoming';
          else if (today >= start && today <= end) initialState = 'state-ongoing';
          else initialState = 'state-passed';
          box.className = `point-box ${initialState}`;
          savedStates[box.dataset.id] = initialState;
        });

        document.querySelectorAll('.event-block').forEach(ev => ev.classList.remove('validated', 'partial'));
        localStorage.setItem('pointStates', JSON.stringify(savedStates));
        updateSummary();
      });
    }

    highlightByDates();
    updateSummary();
  }

  function computeTracks(events, minDate, dayWidth) {
    const tracks = [];
    const placedEvents = [];
    events.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    events.forEach(event => {
      const start = new Date(event.start_date);
      const end = new Date(event.end_date);
      const startPx = (start - minDate) / (1000 * 60 * 60 * 24) * dayWidth;
      const endPx = (end - minDate) / (1000 * 60 * 60 * 24) * dayWidth;
      let placed = false;
      for (let i = 0; i < tracks.length; i++) {
        const line = tracks[i];
        if (!line.some(e => (startPx < e.endPx && endPx > e.startPx))) {
          line.push({ startPx, endPx });
          placedEvents.push({ event, top: i * 110 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        tracks.push([{ startPx, endPx }]);
        placedEvents.push({ event, top: (tracks.length - 1) * 110 });
      }
    });
    return placedEvents;
  }

  function updateSummary() {
    let totalAcquired = 0, totalOngoing = 0, totalPassed = 0;
    document.querySelectorAll('.point-box').forEach(box => {
      const p = parseInt(box.querySelector('span').textContent) || 0;
      if (box.classList.contains('state-validated')) totalAcquired += p;
      else if (box.classList.contains('state-ongoing')) totalOngoing += p;
      else if (box.classList.contains('state-passed')) totalPassed += p;
    });
    const elAcquired = document.getElementById('points-acquired');
    if (elAcquired) elAcquired.textContent = totalAcquired;
    const elVirtual = document.getElementById('points-virtual');
    if (elVirtual) elVirtual.textContent = totalAcquired + totalOngoing;
    const elPassed = document.getElementById('points-passed');
    if (elPassed) elPassed.textContent = totalPassed;
  }

})();
