window.addEventListener('load', () => {
  fetch('events.json')
    .then(res => res.json())
    .then(data => {
      const timeline = document.querySelector('.timeline');
      timeline.innerHTML = '';

      // Titre dynamique
      document.getElementById('page-title').textContent = data.title || 'TITAN TIMELINE';
      const events = data.events;

      // Dates min / max
      const minDate = new Date(Math.min(...events.map(e => new Date(e.start_date))));
      const maxDate = new Date(Math.max(...events.map(e => new Date(e.end_date))));
      const totalDays = Math.ceil((maxDate - minDate) / (1000*60*60*24)) + 1;

      const timelineWidth = timeline.getBoundingClientRect().width;
      const dayWidth = timelineWidth / totalDays;

      const today = new Date();
      today.setHours(0,0,0,0);

      // Marge horizontale entre events
      const horizontalGap = 6;

      // Générer colonnes de dates avec lignes à gauche/droite
      for (let i = 0; i < totalDays; i++) {
        const currentDate = new Date(minDate);
        currentDate.setDate(minDate.getDate() + i);

        const day = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
        const date = currentDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

        const col = document.createElement('div');
        col.classList.add('date-column');
        col.style.width = `${dayWidth}px`;

        // Highlight du jour actuel
        if (
          currentDate.getDate() === today.getDate() &&
          currentDate.getMonth() === today.getMonth() &&
          currentDate.getFullYear() === today.getFullYear()
        ) {
          col.style.backgroundColor = 'rgba(212,175,55,0.15)';
        }

        // Labels
        col.innerHTML = `
          <span class="day">${day}</span>
          <span class="date">${date}</span>
        `;

        // Lignes verticales
        if (i > 0) {
          const leftLine = document.createElement('div');
          leftLine.classList.add('grid-line');
          leftLine.style.left = '0';
          leftLine.style.right = 'auto';
          col.appendChild(leftLine);
        }
        if (i < totalDays - 1) {
          const rightLine = document.createElement('div');
          rightLine.classList.add('grid-line');
          rightLine.style.right = '0';
          rightLine.style.left = 'auto';
          col.appendChild(rightLine);
        }

        timeline.appendChild(col);
      }

      // Ligne horizontale sous les dates
      const line = document.createElement('div');
      line.classList.add('timeline-line');
      timeline.appendChild(line);

      // Placement sur lignes (tracks) pour éviter chevauchement
      function computeTracks(events) {
        const tracks = [];
        const placedEvents = [];
        events.sort((a,b) => new Date(a.start_date) - new Date(b.start_date));

        events.forEach(event => {
          const start = new Date(event.start_date);
          const end = new Date(event.end_date);
          const startPx = ((start - minDate)/(1000*60*60*24)) * dayWidth;
          const endPx = ((end - minDate)/(1000*60*60*24)) * dayWidth;

          let placed = false;
          for (let i = 0; i < tracks.length; i++) {
            const line = tracks[i];
            if (!line.some(e => (startPx < e.endPx && endPx > e.startPx))) {
              line.push({startPx, endPx});
              placedEvents.push({event, top: i * 110});
              placed = true;
              break;
            }
          }

          if (!placed) {
            tracks.push([{startPx, endPx}]);
            placedEvents.push({event, top: (tracks.length - 1) * 110});
          }
        });

        return placedEvents;
      }

      const placedEvents = computeTracks(events);

      // Placer les events
      placedEvents.forEach(item => {
        const event = item.event;
        const top = item.top + 100;

        const start = new Date(event.start_date);
        const end = new Date(event.end_date);

        const dayStart = (start - minDate)/(1000*60*60*24);
        const dayEnd = (end - minDate)/(1000*60*60*24);

        const block = document.createElement('div');
        block.classList.add('event-block');
        block.style.left = `${Math.round(dayStart * dayWidth + horizontalGap/2)}px`;
        block.style.width = `${Math.round((dayEnd - dayStart) * dayWidth - horizontalGap)}px`;
        block.style.top = `${top}px`;

        const pointsHTML = event.points.map(p => `
          <div class="point-box">
            <img src="style/img/Points.png" alt="points"/>
            <span>${p}</span>
          </div>
        `).join('');

        block.innerHTML = `
          <div class="event-name">${event.name}</div>
          <div class="points-container">${pointsHTML}</div>
        `;

        timeline.appendChild(block);
      });
    });

  // Recalculer largeur au resize
  window.addEventListener('resize', () => location.reload());
});
