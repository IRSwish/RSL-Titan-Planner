async function loadEvents() {
  const response = await fetch('events.json');
  const events = await response.json();
  renderTimeline(events);
}

function renderTimeline(events) {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';

  // Récupérer min et max date
  const startDates = events.map(e => new Date(e.start_date));
  const endDates = events.map(e => new Date(e.end_date));
  const minDate = new Date(Math.min(...startDates));
  const maxDate = new Date(Math.max(...endDates));

  const totalDuration = maxDate - minDate;

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
