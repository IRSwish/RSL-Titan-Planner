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

  const timelineWidth = timeline.offsetWidth;
  const padding = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-padding'));

  // Min et max
  const startDates = events.map(e => new Date(e.start_date));
  const endDates = events.map(e => new Date(e.end_date));
  const minDate = new Date(Math.min(...startDates));
  const maxDate = new Date(Math.max(...endDates));

  minDate.setHours(0, 0, 0, 0);
  maxDate.setHours(0, 0, 0, 0);
  maxDate.setDate(maxDate.getDate() + 1);

  const totalDuration = maxDate - minDate;

  // 📅 Dates + lignes verticales
  for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
    const offsetPercent = ((d - minDate) / totalDuration);
    const pixelOffset = padding + offsetPercent * (timelineWidth - padding * 2);

    const line = document.createElement('div');
    line.className = 'day-line';
    line.style.left = `${pixelOffset}px`;
    timeline.appendChild(line);

    const label = document.createElement('div');
    label.className = 'date-label';
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    label.textContent = `${dayName} ${dayNum}`;
    label.style.left = `${pixelOffset}px`;
    datesRow.appendChild(label);
  }

  // 📊 Events
  events.forEach(event => {
    const evStart = new Date(event.start_date);
    const evEnd = new Date(event.end_date);

    const startPercent = (evStart - minDate) / totalDuration;
    const endPercent = (evEnd - minDate) / totalDuration;

    const left = padding + startPercent * (timelineWidth - padding * 2);
    const right = padding + endPercent * (timelineWidth - padding * 2);

    const eventEl = document.createElement('div');
    eventEl.className = 'event';
    eventEl.style.left = `${left}px`;
    eventEl.style.width = `${right - left}px`;

    eventEl.innerHTML = `
      <div class="event-name">${event.name}</div>
      <div class="event-points">
        ${event.points.map(p => `<div class="event-point">${p}</div>`).join('')}
      </div>
    `;

    timeline.appendChild(eventEl);
  });
}

window.addEventListener('resize', () => loadEvents()); // 🔄 responsive sur resize
loadEvents();
