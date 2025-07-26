let publications = [];

function loadPublications() {
  fetch('publications.csv')
    .then(response => response.text())
    .then(data => {
      const rows = data.split('\n').slice(1);
      publications = rows.map(row => {
        const [authorRaw, year, publicationRaw, url, concept] = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

        const author = (authorRaw || '').replaceAll('"', '').trim();
        const publication = (publicationRaw || '').replaceAll('"', '').trim();

        return { author, year, publication, url, concept };
      }).filter(p => p.author);
      
      renderPublications('concept');
    });
}

function renderPublications(mode) {
  const container = document.getElementById('publications-container');

  document.querySelectorAll('.pub-filter button').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`.pub-filter button[onclick*="${mode}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  container.innerHTML = '';

  let sorted;

  if (mode === 'year') {
    sorted = [...publications].sort((a, b) => b.year - a.year);

    let currentYear = '';
    sorted.forEach(pub => {
      if (pub.year !== currentYear) {
        currentYear = pub.year;
        const heading = document.createElement('h3');
        heading.textContent = currentYear;
        heading.className = 'pub-group';
        container.appendChild(heading);
      }

      const item = document.createElement('div');
      item.className = 'pub-item';
      item.innerHTML = pub.url
        ? `${pub.author} (${pub.year}). ${pub.publication}. <a href="${pub.url.trim()}" target="_blank" class="pub-link">[Link]</a>`
        : `${pub.author} (${pub.year}). ${pub.publication}.`;
      container.appendChild(item);
    });

  } else if (mode === 'concept') {
    const conceptOrder = [
      "global risk",
      "planetary",
      "human security",
      "global",
      "global civil society",
      "global corporations",
      "other"
    ];

    conceptOrder.forEach(concept => {
      const groupItems = publications.filter(p => (p.concept || '').trim().toLowerCase() === concept);
      if (groupItems.length > 0) {
        const heading = document.createElement('h3');
        heading.textContent = concept;
        heading.className = 'pub-group';
        container.appendChild(heading);

        groupItems.sort((a, b) => b.year - a.year);

        groupItems.forEach(pub => {
          const item = document.createElement('div');
          item.className = 'pub-item';
          item.innerHTML = pub.url
            ? `${pub.author} (${pub.year}). ${pub.publication}. <a href="${pub.url.trim()}" target="_blank" class="pub-link">[Link]</a>`
            : `${pub.author} (${pub.year}). ${pub.publication}.`;
          container.appendChild(item);
        });
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', loadPublications);
