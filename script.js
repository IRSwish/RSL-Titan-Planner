fetch('events.json')
  .then(res => res.json())
  .then(data => {
    // Titre dynamique
    document.getElementById('page-title').textContent = data.title || 'TITAN TIMELINE';
    const events = data.events;
    const timeline = document.querySelector('.timeline');
    timeline.innerHTML = '';

    // Dates min / max
    const minDate = new Date(Math.min(...events.map(e => new Date(e.start_date))));
    const maxDate = new Date(Math.max(...events.map(e => new Date(e.end_date))));
    const totalDays = Math.ceil((maxDate - minDate)/(1000*60*60*24)) + 1;
    const timelineWidth = timeline.offsetWidth;
    const dayWidth = timelineWidth / totalDays;

    // Générer colonnes de dates + lignes verticales
    for (let i = 0; i < totalDays; i++) {
      const currentDate = new Date(minDate);
      currentDate.setDate(minDate.getDate() + i);
      const day = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
      const date = currentDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

      const col = document.createElement('div');
      col.classList.add('date-column');
      col.style.width = `${dayWidth}px`;
      col.innerHTML = `
        <span class="day">${day}</span>
        <span class="date">${date}</span>
        <div class="grid-line"></div>
      `;
      timeline.appendChild(col);
    }

    // Ligne horizontale dorée sous les dates
    const line = document.createElement('div');
    line.classList.add('timeline-line');
    timeline.appendChild(line);

    // Générer événements
    events.forEach(event => {
      const start = new Date(event.start_date);
      const end = new Date(event.end_date);
      const startOffset = ((start - minDate)/(1000*60*60*24)) * dayWidth;
      const duration = ((end - start)/(1000*60*60*24) + 1) * dayWidth;

      const block = document.createElement('div');
      block.classList.add('event-block');
      block.style.left = `${startOffset}px`;
      block.style.width = `${duration - 10}px`;
      block.style.top = '100px';

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

window.addEventListener('resize', () => location.reload()); // recalculer largeur
