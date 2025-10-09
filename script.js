async function loadEvents() {
  const response = await fetch('events.json');
  const events = await response.json();
  renderTimeline(events);
}

function renderTimeline(events) {
  const timeline = document.getElementById('timeline');
  const datesRow = document.getElementById('dates-row');
  timeline.innerHTML = '';
  datesRow.innerHTML = '';

  // Min et max
  const startDates = events.map(e => new Date(e.start_date));
  const endDates = events.map(e => new Date(e.end_date));
  const minDate = new Date(Math.min(...startDates));
  const maxDate = new Date(Math.max(...endDates));

  // Arrondir à minuit
  minDate.setHours(0, 0, 0, 0);
  maxDate.setHours(0, 0, 0, 0);

  // On ajoute 1 jour à max pour que la dernière ligne tombe après le dernier event
  maxDate.setDate(maxDate.getDate() + 1);

  const totalDuration = maxDate - minDate;
  const oneDay = 24 * 60 * 60 * 1000;

  // 📅 Génération des dates et lignes verticales
  for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
    const offsetPercent = ((d - minDate) / totalDuration) * 100;

    // ligne verticale
    const line = document.createElement('div');
    line.className = 'day-line';
    line.style.left = `${offsetPercent}%`;
    timeline.appendChild(line);

    // label de date
    const label = document.createElement('div');
    label.className = 'date-label';
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    label.textContent = `${dayName} ${dayNum}`;
    label.style.left = `${offsetPercent}%`;
    datesRow.appendChild(label);
  }

  // 📊 Génération des events
  events.forEach(event => {
    const evStart = new Date(event.start_date);
    const evEnd = new Date(event.end_date);

    const startOffset = ((evStart - minDate) / totalDuration) * 100;
    const widthPercent = ((evEnd - evStart) / totalDuration) * 100;

    const eventEl = document.createElement('div');
    eventEl.className = 'event';
    eventEl.style.left = `${startOffset}%`;
    eventEl.style.width = `${widthPercent}%`;

    eventEl.innerHTML = `
      <div class="event-name">${event.name}</div>
      <div class="event-points">
        ${event.points.map(p => `<div class="event-point">${p}</div>`).join('')}
      </div>
    `;

    timeline.appendChild(eventEl);
  });
}

loadEvents();
