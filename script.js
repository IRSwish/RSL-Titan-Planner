fetch('events.json')
  .then(response => response.json())
  .then(data => {
    // Titre dynamique
    document.getElementById('page-title').textContent = data.title || 'TITAN TIMELINE';

    const events = data.events;
    const timeline = document.querySelector('.timeline');

    // Dates min / max
    const minDate = new Date(Math.min(...events.map(e => new Date(e.start_date))));
    const maxDate = new Date(Math.max(...events.map(e => new Date(e.end_date))));
    const totalDays = (maxDate - minDate) / (1000 * 60 * 60 * 24) + 1;

    // Générer les colonnes de dates
    for (let i = 0; i < totalDays; i++) {
      const currentDate = new Date(minDate);
      currentDate.setDate(minDate.getDate() + i);

      const day = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
      const date = currentDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

      const dateCol = document.createElement('div');
      dateCol.classList.add('date-column');
      dateCol.innerHTML = `
        <span class="day">${day}</span>
        <span class="date">${date}</span>
        <div class="grid-line"></div>
      `;
      timeline.appendChild(dateCol);
    }

    // Ligne horizontale
    const line = document.createElement('div');
    line.classList.add('timeline-line');
    timeline.appendChild(line);

    // Positionner les événements
    events.forEach(event => {
      const start = new Date(event.start_date);
      const end = new Date(event.end_date);
      const startOffset = (start - minDate) / (1000 * 60 * 60 * 24);
      const duration = (end - start) / (1000 * 60 * 60 * 24) + 1;

      const block = document.createElement('div');
      block.classList.add('event-block');
      block.style.left = `${startOffset * 100}px`;
      block.style.top = '100px';
      block.style.width = `${duration * 100 - 10}px`;

      block.innerHTML = `
        <div class="event-name">${event.name}</div>
        <div class="points-container">
          ${event.points.map(p => `
            <div class="point-box">
              <img src="style/img/Points.png" alt="points"/>
              <span>${p}</span>
            </div>
          `).join('')}
        </div>
      `;

      timeline.appendChild(block);
    });
  });
