// --- fusion.js ---
(() => {
  let timelineData = null;

  // --- Chargement JSON + rendu ---
  function fetchAndRenderTimeline() {
    const timelineContainer = document.querySelector('.timeline-container');
    if (!timelineContainer) return;

    // Détermination du JSON à partir du hash
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

  // Recharger quand on change de hash
  window.addEventListener('hashchange', () => {
    fetchAndRenderTimeline();
  });

  window.addEventListener('resize', () => {
    if (timelineData) renderTimeline(timelineData);
  });

  // --- Chargement menu externe ---
  function loadMenu() {
    fetch('../menu.html')
      .then(response => response.text())
      .then(data => {
        const menuContainer = document.getElementById('menu-container');
        if (menuContainer) menuContainer.innerHTML = data;

        const burgerIcon = document.getElementById('burger-icon');
        const burgerLinks = document.getElementById('burger-links');
        if (burgerIcon && burgerLinks) {
          burgerIcon.addEventListener('click', () => {
            burgerLinks.classList.toggle('active');
          });
        }

        document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
          toggle.addEventListener('click', () => {
            toggle.parentElement.classList.toggle('open');
          });
        });
      })
      .catch(err => console.error('Erreur lors du chargement du menu :', err));
  }

  // --- Rendu timeline ---
  function renderTimeline(data) {
    const timelineContainer = document.querySelector('.timeline-container');
    const timeline = document.querySelector('.timeline');
    if (!timeline || !timelineContainer) return;

    timeline.innerHTML = ''; // on vide la timeline quoi qu'il arrive

    // Titre
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = data.title || '';

    const events = Array.isArray(data.events) ? data.events : [];

    // Si aucun event, on ne fait rien
    if (events.length === 0) return;

    const minDate = new Date(Math.min(...events.map(e => new Date(e.start_date))));
    const maxDate = new Date(Math.max(...events.map(e => new Date(e.end_date))));
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const horizontalGap = 16;
    const pointStates = ['state-upcoming', 'state-ongoing', 'state-validated', 'state-passed'];
    const savedStates = JSON.parse(localStorage.getItem('pointStates') || '{}');

    const containerStyle = getComputedStyle(timelineContainer);
    const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
    const usableWidth = timelineContainer.clientWidth - paddingLeft - paddingRight;
    const dayWidth = usableWidth / totalDays;

    // Colonnes de dates
    for (let i = 0; i < totalDays; i++) {
      const currentDate = new Date(minDate);
      currentDate.setDate(minDate.getDate() + i);
      const day = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
      const date = currentDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

      const col = document.createElement('div');
      col.classList.add('date-column');
      col.style.width = `${dayWidth}px`;

      if (currentDate.getTime() === today.getTime()) {
        col.style.backgroundColor = 'rgba(212,175,55,0.15)';
      }

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

      timeline.appendChild(col);
    }

    // Ligne centrale
    const line = document.createElement('div');
    line.classList.add('timeline-line');
    timeline.appendChild(line);

    // Placement events
    const placedEvents = computeTracks(events, minDate, dayWidth);
    placedEvents.forEach((item) => {
      const event = item.event;
      const top = item.top + 100;
      const start = new Date(event.start_date);
      const end = new Date(event.end_date);
      const dayStart = (start - minDate) / (1000 * 60 * 60 * 24);
      const dayEnd = (end - minDate) / (1000 * 60 * 60 * 24);

      const block = document.createElement('div');
      const left = Math.round(dayStart * dayWidth + horizontalGap / 2);
      const width = Math.round((dayEnd - dayStart) * dayWidth - horizontalGap);

      block.classList.add('event-block');
      block.style.left = `${left}px`;
      block.style.width = `${width}px`;
      block.style.top = `${top}px`;
      block.dataset.start = event.start_date;
      block.dataset.end = event.end_date;

      const rewards = (event.reward || '').split(',').map(r => r.trim());
      const pointsHTML = (event.points || []).map((p, pointIndex) => {
        const safeName = event.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        const uniqueId = `${safeName}-${event.start_date}-${event.end_date}-${pointIndex}`;
        let initialState;
        if (today < start) initialState = 'state-upcoming';
        else if (today >= start && today <= end) initialState = 'state-ongoing';
        else if (today > end) initialState = 'state-passed';
        const saved = savedStates[uniqueId] || initialState;
        const reward = rewards[pointIndex] || 'default';

        return `<div class="point-box ${saved}" data-id="${uniqueId}">
                  <img src="/style/img/${reward}.webp" alt="${reward}"/>
                  <span>${p}</span>
                </div>`;
      }).join('');

      block.innerHTML = `<div class="event-name">${event.name}</div>
                         <div class="points-container">${pointsHTML}</div>`;
      timeline.appendChild(block);
    });

    // Hauteur dynamique
    const blocks = document.querySelectorAll('.event-block');
    let maxBottom = 0;
    blocks.forEach(block => {
      const blockBottom = block.offsetTop + block.offsetHeight;
      if (blockBottom > maxBottom) maxBottom = blockBottom;
    });
    timeline.style.height = `${maxBottom + 20}px`;

    // Gestion clic sur points
    document.querySelectorAll('.point-box').forEach(box => {
      box.addEventListener('click', (e) => {
        const id = box.dataset.id;
        const currentIndex = pointStates.findIndex(s => box.classList.contains(s));
        const nextIndex = (e.ctrlKey || e.metaKey)
          ? (currentIndex - 1 + pointStates.length) % pointStates.length
          : (currentIndex + 1) % pointStates.length;
        pointStates.forEach(s => box.classList.remove(s));
        box.classList.add(pointStates[nextIndex]);
        savedStates[id] = pointStates[nextIndex];
        localStorage.setItem('pointStates', JSON.stringify(savedStates));
        updateSummary();
      });
    });

    updateSummary();

    // Centrage summary
    const summaryBox = document.querySelector('.summary-box');
    if (summaryBox) {
      summaryBox.style.position = 'relative';
      summaryBox.style.margin = '20px auto 0 auto';
      summaryBox.style.left = 'unset';
      summaryBox.style.right = 'unset';
    }
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
