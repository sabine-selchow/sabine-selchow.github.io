let svg, g, landG, countriesG, associatesG, projection, path, tooltip;
let worldData, landData, membershipData = [];
let associatesData = [];
let currentYear = 1947;
let isPlaying = false;
let playInterval;

let useHistoricalBasemap = false;
const cshapesCache = new Map();

let relevantYears = [];
let yearIdx = 0;

const COLOR_LAND = "#e8e8e8";
const COLOR_MEMBER = "#4A90E2";
const COLOR_NEW = "#d90c1a";
const COLOR_ASSOC_MEMBER = "#10a10bff";
const COLOR_ASSOC_NEW    = "#c61fd5ff";

const countryMappings = {
  'Soviet Union': ['Russia','Ukraine','Belarus','Kazakhstan','Uzbekistan','Kyrgyzstan','Tajikistan','Turkmenistan','Georgia','Armenia','Azerbaijan','Moldova','Lithuania','Latvia','Estonia'],
  'USSR': ['Russia','Ukraine','Belarus','Kazakhstan','Uzbekistan','Kyrgyzstan','Tajikistan','Turkmenistan','Georgia','Armenia','Azerbaijan','Moldova','Lithuania','Latvia','Estonia'],
  'Yugoslavia': ['Serbia','Croatia','Bosnia and Herzegovina','Slovenia','Montenegro','Macedonia','Kosovo'],
  'Czechoslovakia': ['Czech Republic','Slovakia'],
  'German Democratic Republic': ['Germany'],
  'East Germany': ['Germany'],
  'West Germany': ['Germany'],
  'Federal Republic of Germany': ['Germany'],
  'German Federal Republic': ['Germany'],
  'Yemen Arab Republic': ['Yemen'],
  "People's Democratic Republic of Yemen": ['Yemen'],
  'South Yemen': ['Yemen'],
  'North Yemen': ['Yemen']
};
const dissolutionYears = { 'Soviet Union':1991, 'USSR':1991, 'Yugoslavia':1991, 'Czechoslovakia':1993 };

init();

async function init() {
  setupSVG();
  setupControls();
  await loadData();
  drawLandMask();
  buildYearChips();
  if (relevantYears.length) currentYear = relevantYears[0];
  updateVisualization();
}

function setupSVG() {
  svg = d3.select('#ecafeViz')
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('viewBox', '0 0 1000 600');

  const width = 1000, height = 600;
  projection = d3.geoMercator().scale(150).translate([width/2, height/2 + 40]);
  path = d3.geoPath().projection(projection);

  g = svg.append('g');
  landG = g.append('g').attr('id', 'land-layer');
  countriesG = g.append('g').attr('id', 'countries-layer');
  associatesG = g.append('g').attr('id', 'associates-layer');

  tooltip = d3.select('#tooltip');

  tooltip
    .style('max-width', 'min(46ch, 60vw)')
    .style('white-space', 'normal')
    .style('word-break', 'break-word')
    .style('z-index', '9999');
}

function setupControls() {
  d3.select('#play').on('click', startAnimation);
  d3.select('#pause').on('click', stopAnimation);
  d3.select('#reset').on('click', () => {
    stopAnimation();
    yearIdx = 0;
    currentYear = relevantYears.length ? relevantYears[0] : 1947;
    updateVisualization();
  });

  const toggleBtn = document.getElementById('overlayToggle');
  const overlay = document.getElementById('memberOverlay');
  if (toggleBtn && overlay) {
    toggleBtn.addEventListener('click', () => {
      overlay.classList.toggle('collapsed');
      toggleBtn.textContent = overlay.classList.contains('collapsed') ? '+' : '–';
    });
  }
}

async function loadData() {
  try {
    const landTopo = await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json');
    landData = topojson.feature(landTopo, landTopo.objects.land);
  } catch (e) {
    console.warn('Land-110m konnte nicht geladen werden.', e);
  }

  try {
    const topo = await d3.json('CShapes-2.0-simplified.json');
    const firstKey = topo && topo.objects ? Object.keys(topo.objects)[0] : null;
    if (!firstKey) throw new Error('TopoJSON objects missing');
    const fc = topojson.feature(topo, topo.objects[firstKey]);
    window.__CSHAPES__ = fc;
    useHistoricalBasemap = true;
  } catch {
    const world = await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    worldData = topojson.feature(world, world.objects.countries);
  }

  try {
    const rows = await d3.csv('ece.csv', d => {
      const rawCountry = (d.Country || '').trim();
      const yearText = String(d.Year || '').trim();
      const yearMatch = yearText.match(/\d{4}/);
      const year = yearMatch ? +yearMatch[0] : NaN;
      const date = (d.Date || '').trim() || null;
      const note = (d.Note || '').trim() || null;
      return { country: rawCountry, year, date, note };
    });

    membershipData = rows
      .filter(r => r.country && Number.isFinite(r.year))
      .sort((a, b) => d3.ascending(a.year, b.year));

    relevantYears = Array.from(new Set(membershipData.map(d => d.year))).sort((a, b) => a - b);
  } catch (err) {
    console.error('ece.csv konnte nicht geladen werden', err);
    alert('ece.csv fehlt oder ist nicht lesbar. Bitte ece.csv (Header: Country,Year,Date,Note) neben index.html legen.');
  }

  try {
    const pts = await d3.csv('ecafe_associates.csv', d => ({
      name: String(d.name || '').trim(),
      lat: +d.lat, lon: +d.lon,
      start: +String(d.start_year || '').slice(0,4),
      end: d.end_year ? +String(d.end_year).slice(0,4) : 9999,
      date: (d.Date ?? d.date ?? '').toString().trim() || null,
      note: (d.Note ?? d.note ?? '').toString().trim() || null
    }));
    associatesData = pts.filter(p =>
      p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.start)
    );
  } catch {
    console.warn('Keine ecafe_associates.csv gefunden (optional).');
  }
}

function drawLandMask() {
  if (!landData) return;
  landG.selectAll('path').remove();
  landG.append('path')
    .datum(landData)
    .attr('d', path)
    .attr('fill', COLOR_LAND)
    .attr('stroke', 'none');
}

function buildYearChips() {
  const wrap = d3.select('#yearChips');
  if (wrap.empty()) return;
  wrap.selectAll('*').remove();

  wrap.selectAll('div.year-chip')
    .data(relevantYears, d => d)
    .enter()
    .append('div')
    .attr('class', 'year-chip')
    .text(d => {
      if (d === 2006) return "since 2006";
      return d;
    })
    .on('click', (event, y) => {
      stopAnimation();
      currentYear = y;
      yearIdx = relevantYears.indexOf(y);
      updateVisualization();
    });
}

function drawCountries(features) {
  countriesG.selectAll('path').remove();
  countriesG.selectAll('path')
    .data(features)
    .enter()
    .append('path')
    .attr('d', path)
    .attr('fill', 'transparent')
    .attr('stroke', 'none')
    .on('mouseover', handleMouseOver)
    .on('mousemove', handleMouseMove)
    .on('mouseout', handleMouseOut);
}

function updateVisualization() {
  d3.select('#yearDisplay').text(currentYear);

  if (useHistoricalBasemap && window.__CSHAPES__) {
    drawCountries(filterCShapesByYear(currentYear));
  } else if (worldData) {
    drawCountries(worldData.features);
  }

  const currentMembers = getMembersUpToYear(currentYear);
  const newMembers = getNewMembersInYear(currentYear);

  d3.select('#memberCount').text(currentMembers.size);
  d3.select('#newMemberCount').text(newMembers.size);

  countriesG.selectAll('path')
    .attr('fill', d => {
      const p = d.properties || {};
      const isNew = isCountryMember(p, newMembers);
      const isMember = isNew ? false : isCountryMember(p, currentMembers);
      if (isNew) return COLOR_NEW;
      if (isMember) return COLOR_MEMBER;
      return 'transparent';
    })
    .style('pointer-events', d => {
      const p = d.properties || {};
      return isCountryMember(p, currentMembers) ? 'auto' : 'none';
    })
    .style('cursor', d => {
      const p = d.properties || {};
      return isCountryMember(p, currentMembers) ? 'pointer' : 'default';
    });

  updateAssociates(currentYear);
  associatesG.raise();

  d3.selectAll('.year-chip').classed('active', d => d === currentYear);
  const activeChip = document.querySelector('.year-chip.active');
  if (activeChip) activeChip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });

  updateMemberOverlay(currentYear);
}

function associateDisplayName(name, year) {
  if (name === 'Hong Kong') return (year >= 1997) ? 'Hong Kong, China' : 'Hong Kong';
  if (name === 'Macao' || name === 'Macau') return (year >= 1999) ? 'Macao, China' : name;
  return name;
}

function updateAssociates(year) {
  if (!associatesData.length) {
    associatesG.selectAll('circle.associate').remove();
    return;
  }
  const visible = associatesData.filter(p => year >= p.start && year < p.end);
  const newSet = new Set(visible.filter(p => p.start === year).map(p => p.name));

  const sel = associatesG.selectAll('circle.associate')
    .data(visible, d => `${d.name}|${d.start}`);

  const enter = sel.enter()
    .append('circle')
    .attr('class', 'associate')
    .attr('r', 3.2)
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.9);

  enter.merge(sel)
    .attr('cx', d => projection([d.lon, d.lat])[0])
    .attr('cy', d => projection([d.lon, d.lat])[1])
    .attr('fill', d => newSet.has(d.name) ? COLOR_ASSOC_NEW : COLOR_ASSOC_MEMBER)
    .on('mouseover', (event, d) => {
      const label = associateDisplayName(d.name, currentYear);
      let html = `<div class="tooltip-title">${label}</div>`;
      html += `<div class="tooltip-line">Associate member since: ${d.start}</div>`;
      if (d.date) html += `<div class="tooltip-line">Joined on: ${d.date}</div>`;
      if (d.note) html += `<div class="tooltip-line">Note: ${d.note}</div>`;
      tooltip.html(html).style('visibility','visible').style('opacity',1);
    })
    .on('mousemove', handleMouseMove)
    .on('mouseout', handleMouseOut);

  sel.exit().remove();
}

function updateMemberOverlay(year) {
  const titleYear = document.getElementById('overlayYear');
  if (titleYear) titleYear.textContent = year;

  const container = d3.select('#memberOverlayBody');
  if (container.empty()) return;

  const activeCountries = membershipData.filter(d => {
    if (d.year > year) return false;
    if (countryMappings[d.country]) {
      const dis = dissolutionYears[d.country] ?? 9999;
      return year < dis;
    }
    return true;
  });

  const activeAssoc = associatesData
    .filter(p => year >= p.start && year < p.end)
    .map(p => ({
      country: associateDisplayName(p.name, year) + ' (Assoc. member)',
      year: p.start
    }));

  const activeEntries = activeCountries.concat(activeAssoc);

  const grouped = d3.group(activeEntries, d => d.year);
  const years = Array.from(grouped.keys()).sort((a,b) => a - b);

  container.selectAll('*').remove();

  const groups = container.selectAll('.year-group')
    .data(years, d => d)
    .enter()
    .append('div')
    .attr('class', 'year-group');

  groups.append('div')
    .attr('class', 'year-title')
    .text(yr => {
      const names = dedupSort(
        grouped.get(yr).map(d => displayLabelForList(d.country, yr))
      );
      return `${yr} (${names.length})`;
    });

  groups.append('ul')
    .attr('class', 'country-list')
    .each(function(yr) {
      const ul = d3.select(this);
      const names = dedupSort(
        grouped.get(yr).map(d => displayLabelForList(d.country, yr))
      );
      ul.selectAll('li')
        .data(names)
        .enter()
        .append('li')
        .text(n => n);
    });
}

function dedupSort(arr) {
  return Array.from(new Set(arr)).sort((a,b) => a.localeCompare(b));
}

function displayLabelForList(rawName, groupYear) {
  let suffix = '';
  let core = rawName;
  const assocFlag = /\(Assoc\. member\)$/;
  if (assocFlag.test(rawName)) {
    suffix = ' (Assoc. member)';
    core = rawName.replace(assocFlag, '').trim();
  }
  if ((core === 'Russia' || core === 'Russian Federation') && groupYear < 1991) {
    return 'Soviet Union' + suffix;
  }
  return core + suffix;
}

function pickProp(o, keys, fallback = null) { for (const k of keys) if (o && o[k] != null) return o[k]; return fallback; }

function filterCShapesByYear(year) {
  if (cshapesCache.has(year)) return cshapesCache.get(year);
  const fc = window.__CSHAPES__;
  const START_KEYS = ['GWSYEAR','START','start','begin','FROMYEAR','from'];
  const END_KEYS   = ['GWEYEAR','END','end','to','TOYEAR'];
  const features = fc.features.filter(f => {
    const p = f.properties || {};
    const ys = +pickProp(p, START_KEYS, -Infinity);
    const ye = +pickProp(p, END_KEYS, 9999);
    return Number.isFinite(ys) && (year >= ys) && (year < ye);
  });
  cshapesCache.set(year, features);
  return features;
}

function getMembersUpToYear(year) {
  const members = new Set();
  membershipData.filter(d => d.year <= year).forEach(d => {
    if (countryMappings[d.country]) {
      const dissolves = dissolutionYears[d.country] ?? 9999;
      if (year < dissolves) members.add(d.country);
      else countryMappings[d.country].forEach(s => members.add(s));
    } else members.add(d.country);
  });
  return members;
}

function getNewMembersInYear(year) {
  const set = new Set();
  membershipData.filter(d => d.year === year).forEach(d => {
    if (countryMappings[d.country]) countryMappings[d.country].forEach(s => set.add(s));
    else set.add(d.country);
  });
  return set;
}

function displayNameByYear(props, year) {
  const raw = props?.NAME || props?.NAME_EN || props?.ADMIN || props?.name || props?.CNTRY_NAME || 'Unknown';
  if (useHistoricalBasemap) return raw;
  if ((raw === 'Russia' || raw === 'Russian Federation') && year < 1991) return 'Soviet Union';
  return raw;
}

function isCountryMember(props, memberSet) {
  const name = props?.NAME || props?.NAME_EN || props?.ADMIN || props?.name || props?.CNTRY_NAME;
  if (!name) return false;
  if (memberSet.has(name)) return true;
  const variations = getCountryVariations(name);
  return variations.some(v => memberSet.has(v));
}

function getCountryVariations(countryName) {
  const variations = [countryName];
  const nameMap = {
    'United States of America': ['United States','USA','US'],
    'Russian Federation': ['Russia','Soviet Union','USSR'],
    'Myanmar': ['Burma'],
    'Democratic Republic of the Congo': ['Congo','DRC','Congo (Kinshasa)'],
    'Republic of the Congo': ['Congo (Brazzaville)'],
    'Republic of Korea': ['South Korea','Korea, Republic of'],
    "Democratic People's Republic of Korea": ['North Korea','Korea, Democratic People\'s Republic of'],
    'Iran (Islamic Republic of)': ['Iran'],
    'Viet Nam': ['Vietnam'],
    'Lao People\'s Democratic Republic': ['Laos'],
    'United Kingdom of Great Britain and Northern Ireland': ['United Kingdom','UK','Britain'],
    'Türkiye': ['Turkey'],
    'Côte d\'Ivoire': ['Ivory Coast'],
    'Timor-Leste': ['East Timor'],
  };
  if (nameMap[countryName]) variations.push(...nameMap[countryName]);
  for (const [canonical, alts] of Object.entries(nameMap)) {
    if (alts.includes(countryName)) variations.push(canonical, ...alts);
  }
  return [...new Set(variations)];
}

function getMembershipInfo(countryName) {
  const variations = getCountryVariations(countryName);
  let minYear = null, bestDate = null, bestNote = null;
  for (const v of variations) {
    membershipData
      .filter(d => d.country === v)
      .forEach(d => {
        if (minYear === null || d.year < minYear) {
          minYear = d.year;
          bestDate = d.date ?? null;
          bestNote = d.note ?? null;
        } else if (d.year === minYear) {
          if (!bestDate && d.date) bestDate = d.date;
          if (!bestNote && d.note) bestNote = d.note;
        }
      });
  }
  return { year: minYear, date: bestDate, note: bestNote };
}

function handleMouseOver(event, d) {
  const p = d.properties || {};
  const curr = getMembersUpToYear(currentYear);
  if (!isCountryMember(p, curr)) {
    tooltip.style('visibility','hidden').style('opacity',0);
    return;
  }
  const display = displayNameByYear(p, currentYear);
  const info = getMembershipInfo(
    p.NAME || p.NAME_EN || p.ADMIN || p.name || p.CNTRY_NAME || 'Unknown'
  );
  let html = `<div class="tooltip-title">${display}</div>`;
  html += `<div class="tooltip-since">UNECE member since: ${info.year ?? 'Unknown'}</div>`;
  if (info.date) html += `<div class="tooltip-line">Joined on: ${info.date}</div>`;
  if (info.note) html += `<div class="tooltip-line">Note: ${info.note}</div>`;
  tooltip.html(html).style('visibility','visible').style('opacity',1);
}

function handleMouseMove(event) {
  const tt = document.getElementById('tooltip');
  if (!tt) return;

  if (tt.style.visibility !== 'visible') {
    tt.style.visibility = 'visible';
    tt.style.opacity = 1;
  }

  const padding = 18;
  const margin  = 12;

  const pageW = window.innerWidth || document.documentElement.clientWidth;
  const pageH = window.innerHeight || document.documentElement.clientHeight;

  const ttW = tt.offsetWidth;
  const ttH = tt.offsetHeight;

  let x = event.pageX + padding;
  let y = event.pageY + padding;

  if (x + ttW + margin > pageW) {
    x = event.pageX - ttW - padding;
  }
  
  if (y + ttH + margin > pageH + window.scrollY) {
    y = event.pageY - ttH - padding;
  }

  if (x < margin) x = margin;
  if (y < window.scrollY + margin) y = window.scrollY + margin;

  if (x + ttW > pageW - margin) {
    x = Math.max(margin, pageW - ttW - margin);
  }
  if (y + ttH > pageH + window.scrollY - margin) {
    y = Math.max(window.scrollY + margin, pageH + window.scrollY - ttH - margin);
  }

  tt.style.left = `${x}px`;
  tt.style.top  = `${y}px`;
}

function handleMouseOut() {
  tooltip.style('visibility','hidden').style('opacity',0);
}

function startAnimation() {
  if (isPlaying || relevantYears.length === 0) return;
  isPlaying = true;
  d3.select("#play").classed("playing", true);
  yearIdx = relevantYears.indexOf(currentYear);
  if (yearIdx < 0) yearIdx = 0;
  playInterval = setInterval(() => {
    yearIdx = (yearIdx + 1) % relevantYears.length;
    currentYear = relevantYears[yearIdx];
    updateVisualization();
  }, 1500);
}

function stopAnimation() {
  isPlaying = false;
  clearInterval(playInterval);
  d3.select("#play").classed("playing", false);
}