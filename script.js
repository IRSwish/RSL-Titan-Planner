window.addEventListener('load', () => {
  fetch('events.json')
    .then(res => res.json())
    .then(data => {
      const timelineContainer = document.querySelector('.timeline-container');
      const timeline = document.querySelector('.timeline');
      timeline.innerHTML = '';

      const pageTitle = document.getElementById('page-title');
      pageTitle.textContent = data.title;

      const events = data.events;
      const minDate = new Date(Math.min(...events.map(e => new Date(e.start_date))));
      const maxDate = new Date(Math.max(...events.map(e => new Date(e.end_date))));
      const totalDays = Math.ceil((maxDate - minDate) / (1000*60*60*24)) + 1;

      const today = new Date();
      today.setHours(0,0,0,0);
      const horizontalGap = 6;

      const pointStates = ['state-upcoming', 'state-ongoing', 'state-validated', 'state-passed'];
      const savedStates = JSON.parse(localStorage.getItem('pointStates') || '{}');

      const containerStyle = getComputedStyle(timelineContainer);
      const paddingLeft = parseFloat(containerStyle.paddingLeft);
      const paddingRight = parseFloat(containerStyle.paddingRight);
      const usableWidth = timelineContainer.clientWidth - paddingLeft - paddingRight;
      const dayWidth = usableWidth / totalDays;

      // Colonnes
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

      const line = document.createElement('div');
      line.classList.add('timeline-line');
      timeline.appendChild(line);

      // placement des events
      function computeTracks(events) {
        const tracks = [];
        const placedEvents = [];
        events.sort((a,b) => new Date(a.start_date) - new Date(b.start_date));

        events.forEach(event => {
          const start = new Date(event.start_date);
          const end = new Date(event.end_date);
          const startPx = (start - minDate)/(1000*60*60*24) * dayWidth;
          const endPx = (end - minDate)/(1000*60*60*24) * dayWidth;

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

      placedEvents.forEach((item, eventIndex) => {
        const event = item.event;
        const top = item.top + 100;

        const start = new Date(event.start_date);
        const end = new Date(event.end_date);
        const dayStart = (start - minDate)/(1000*60*60*24);
        const dayEnd = (end - minDate)/(1000*60*60*24);

        const block = document.createElement('div');
        block.classList.add('event-block');
        block.style.left = `${Math.round(dayStart * dayWidth)}px`;
        block.style.width = `${Math.round((dayEnd - dayStart) * dayWidth - horizontalGap)}px`;
        block.style.top = `${top}px`;
        block.dataset.start = event.start_date;
        block.dataset.end = event.end_date;

        const pointsHTML = event.points.map((p, pointIndex) => {
          const uniqueId = `${eventIndex}-${pointIndex}`;
          let initialState;
          if (today < start) initialState = 'state-upcoming';
          else if (today >= start && today <= end) initialState = 'state-ongoing';
          else if (today > end) initialState = 'state-passed';
          const saved = savedStates[uniqueId] || initialState;
          return `<div class="point-box ${saved}" data-id="${uniqueId}">
                    <img src="style/img/Points.png" alt="points"/>
                    <span>${p}</span>
                  </div>`;
        }).join('');

        block.innerHTML = `<div class="event-name">${event.name}</div>
                           <div class="points-container">${pointsHTML}</div>`;

        timeline.appendChild(block);
      });

      // hauteur dynamique
      const blocks = document.querySelectorAll('.event-block');
      let maxBottom = 0;
      blocks.forEach(block => {
        const blockBottom = block.offsetTop + block.offsetHeight;
        if (blockBottom > maxBottom) maxBottom = blockBottom;
      });
      timeline.style.height = `${maxBottom + 20}px`;

      // clic sur points
      timeline.addEventListener('click', (e) => {
        const box = e.target.closest('.point-box');
        if (!box) return;

        const id = box.dataset.id;
        const currentIndex = pointStates.findIndex(s => box.classList.contains(s));
        let nextIndex = (e.ctrlKey || e.metaKey)
          ? (currentIndex - 1 + pointStates.length) % pointStates.length
          : (currentIndex + 1) % pointStates.length;

        pointStates.forEach(s => box.classList.remove(s));
        box.classList.add(pointStates[nextIndex]);
        savedStates[id] = pointStates[nextIndex];
        localStorage.setItem('pointStates', JSON.stringify(savedStates));
        updateSummary();
      });

      function updateSummary() {
        let totalAcquired = 0, totalOngoing = 0, totalPassed = 0;
      
        document.querySelectorAll('.point-box').forEach(box => {
          const p = parseInt(box.querySelector('span').textContent) || 0;
      
          if (box.classList.contains('state-validated')) {
            totalAcquired += p;
          } else if (box.classList.contains('state-ongoing')) {
            totalOngoing += p;
          } else if (box.classList.contains('state-passed')) {
            totalPassed += p;
          }
        });
      
        document.getElementById('points-acquired').textContent = totalAcquired;
        document.getElementById('points-virtual').textContent = totalAcquired + totalOngoing;
        document.getElementById('points-passed').textContent = totalPassed;
      }

      updateSummary();

      // summary-box centrée sous timeline
      const summaryBox = document.querySelector('.summary-box');
      if (summaryBox) {
        summaryBox.style.position = 'relative';
        summaryBox.style.margin = '20px auto 0 auto';
        summaryBox.style.left = 'unset';
        summaryBox.style.right = 'unset';
      }

      // ➜ Mettre en surbrillance la colonne correspondant à aujourd'hui
      (function highlightToday() {
          const currentDay = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      
          document.querySelectorAll('.date-column .date').forEach(el => {
              const colDate = el.textContent.trim();
              if (colDate === currentDay) {
                  el.closest('.date-column').classList.add('today');
              }
          });
      })();

    }); // <-- fermeture de .then(data => { ... })
}); // <-- fermeture de window.addEventListener('load', ...)
