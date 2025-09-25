let countryData = [];
let orgData = [];
let delegatesData = [];

let svgGroup, svgRoot;
let width, currentDynamicHeight;

let colorScales = { country: null, org: null };
let selectedSets = { country: new Set(), org: new Set() };
let legendOrder = [];
let currentMode = 'country';

let activeFilter = 'all';

function normalizeGender(v){
  if (v == null) return '';
  let s = String(v)
    .replace(/\u00A0/g, ' ')            
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');   
  s = s.replace(/[.\-_/]/g, '');        
  const fVals = new Set(['f','female','woman','w','fem','fema','weiblich','frau','wbl','feminine']);
  const mVals = new Set(['m','male','man','masc','maennlich','mannlich','herr','mnl','maennl','maenn']);
  if (fVals.has(s)) return 'female';
  if (mVals.has(s)) return 'male';
  return s || '';
}

function pickField(norm, candidates){
  const want = candidates.map(c => c.replace(/[\s_\-]/g,'').toLowerCase());
  for (const k of Object.keys(norm)) {
    const kClean = k.replace(/[\s_\-]/g,'').toLowerCase();
    if (want.includes(kClean)) return norm[k];
  }
  for (const k of Object.keys(norm)) {
    const kClean = k.replace(/[\s_\-]/g,'').toLowerCase();
    if (/(^|_|\\b)(gender|sex|geschlecht)(\\b|$)/.test(kClean)) return norm[k];
  }
  return '';
}

async function loadCSV(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP error ${response.status} for ${path}`);
  const text = await response.text();
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const lower = headers.map(h => h.toLowerCase());
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim().replace(/(^"|"$)/g, ''); });
    const norm = {};
    headers.forEach((h, idx) => norm[lower[idx]] = row[h]);
    if (!norm['organisation'] && norm['organization']) norm['organisation'] = norm['organization'];

    if ((norm['name'] || norm['surname'] || norm['given_name'] || norm['first_name']) &&
        (norm['country'] || norm['organisation'])) {
      data.push({
        name: norm['name'] || norm['surname'] || '',
        given_name: norm['given_name'] || norm['first_name'] || '',
        title: norm['title'] || norm['role'] || '',
        description: norm['description'] || norm['notes'] || '',
        country: norm['country'] || '',
        organisation: norm['organisation'] || '',
        gender: normalizeGender(pickField(norm, ['gender','sex','geschlecht','geschl','gen']))
      });
    }
  }
  return data;
}

function parseCSVLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function init() {
  try {
    countryData = await loadCSV('delegates_1933.csv');
    orgData     = await loadCSV('delegates_1933_NGOs.csv');
    if (!countryData.length && !orgData.length) throw new Error('Keine gültigen Daten in den CSV-Dateien gefunden.');

    colorScales.country = buildColorScale(uniqueSorted(countryData, 'country'));
    colorScales.org     = buildColorScale(uniqueSorted(orgData, 'organisation'));

    selectedSets.country = new Set(uniqueSorted(countryData, 'country'));
    selectedSets.org     = new Set(uniqueSorted(orgData, 'organisation'));

    currentMode   = 'country';
    delegatesData = countryData;
    activeFilter = 'all';

    setupSVG();
    updateModeUI();
    buildLegend();
    setupGenderControls();
    updateAllButtonStates();
    drawVisualization();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', () => hideTooltip(), { passive: true });

    window.switchMode        = switchMode;
    window.selectAllGroups   = selectAllGroups;
    window.deselectAllGroups = deselectAllGroups;
    window.selectTopGroups   = selectTopGroups;
    window.setSelectedGender = setSelectedGender;

  } catch (err) {
    document.getElementById('chart').innerHTML = `
      <div style="padding: 40px; text-align: center; color: #d32f2f; background: #ffebee; border-radius: 8px; margin: 20px;">
        <h3>Daten konnten nicht geladen werden</h3>
        <p><strong>Fehler:</strong> ${err.message}</p>
        <ul style="text-align:left; display:inline-block; margin-top:8px">
          <li>Liegt "delegates_1933.csv" / "delegates_1933_NGOs.csv" im selben Verzeichnis?</li>
          <li>Groß-/Kleinschreibung korrekt?</li>
          <li>Seite über Webserver öffnen (nicht file://)</li>
          <li>Browser-Konsole prüfen</li>
        </ul>
      </div>`;
  }
}

function setupGenderControls() {
  const controls = document.querySelector('.controls');
  if (!controls) return;
  if (document.getElementById('gender-group')) return;

  const spacer = document.createElement('div');
  spacer.className = 'controls-spacer';

  const group = document.createElement('div');
  group.id = 'gender-group';
  group.className = 'gender-group';

  const btnMale = document.createElement('button');
  btnMale.id = 'gender-male';
  btnMale.className = 'control-btn';
  btnMale.type = 'button';
  btnMale.textContent = 'male';
  btnMale.onclick = () => setSelectedGender('male');

  const btnFemale = document.createElement('button');
  btnFemale.id = 'gender-female';
  btnFemale.className = 'control-btn';
  btnFemale.type = 'button';
  btnFemale.textContent = 'female';
  btnFemale.onclick = () => setSelectedGender('female');

  group.appendChild(btnMale);
  group.appendChild(btnFemale);
  controls.appendChild(spacer);
  controls.appendChild(group);
}

function updateAllButtonStates() {
  updateModeUI();
  updateFilterButtons();
}

function updateFilterButtons() {
  const btnTop5 = getTop5Button();
  if (btnTop5) {
    btnTop5.classList.toggle('active', activeFilter === 'top5');
    btnTop5.setAttribute('aria-pressed', activeFilter === 'top5' ? 'true' : 'false');
  }

  const btnMale = document.getElementById('gender-male');
  const btnFemale = document.getElementById('gender-female');
  if (btnMale && btnFemale) {
    btnMale.classList.toggle('active', activeFilter === 'male');
    btnFemale.classList.toggle('active', activeFilter === 'female');
    btnMale.setAttribute('aria-pressed', activeFilter === 'male' ? 'true' : 'false');
    btnFemale.setAttribute('aria-pressed', activeFilter === 'female' ? 'true' : 'false');
  }

  const btnSelectAll = getSelectAllButton();
  if (btnSelectAll) {
    btnSelectAll.classList.toggle('active', activeFilter === 'all');
    btnSelectAll.setAttribute('aria-pressed', activeFilter === 'all' ? 'true' : 'false');
  }

  const btnDeselectAll = getDeselectAllButton();
  if (btnDeselectAll) {
    btnDeselectAll.classList.remove('active');
    btnDeselectAll.setAttribute('aria-pressed', 'false');
  }
}

function getTop5Button(){
  const byId = document.getElementById('btn-top5');
  if (byId) return byId;
  const controls = document.querySelector('.controls');
  if (!controls) return null;
  const btns = controls.querySelectorAll('button, .control-btn');
  for (const el of btns) {
    const t = (el.textContent || '').trim().toLowerCase();
    if (t === 'top 5' || t === 'top5' || t === 'top-5' || t === 'top five') return el;
  }
  return null;
}

function getSelectAllButton(){
  const controls = document.querySelector('.controls');
  if (!controls) return null;
  const btns = controls.querySelectorAll('button, .control-btn');
  for (const el of btns) {
    const t = (el.textContent || '').trim().toLowerCase();
    if (t === 'select all' || t === 'all' || t === 'alle') return el;
  }
  return null;
}

function getDeselectAllButton(){
  const controls = document.querySelector('.controls');
  if (!controls) return null;
  const btns = controls.querySelectorAll('button, .control-btn');
  for (const el of btns) {
    const t = (el.textContent || '').trim().toLowerCase();
    if (t === 'deselect all' || t === 'none' || t === 'keine') return el;
  }
  return null;
}

function setSelectedGender(targetGender) {
  if (activeFilter === targetGender) {
    activeFilter = 'all';
  } else {
    activeFilter = targetGender;
  }
  
  applyCurrentFilter();
  updateAllButtonStates();
  buildLegend();
  drawVisualization();
}

function selectTopGroups() {
  if (activeFilter === 'top5') {
    activeFilter = 'all';
  } else {
    activeFilter = 'top5';
  }
  
  applyCurrentFilter();
  updateAllButtonStates();
  buildLegend();
  drawVisualization();
}

function selectAllGroups() {
  activeFilter = 'all';
  applyCurrentFilter();
  updateAllButtonStates();
  buildLegend();
  drawVisualization();
}

function deselectAllGroups() {
  activeFilter = 'none';
  selectedSets[currentMode].clear();
  updateAllButtonStates();
  updateLegendVisuals();
  drawVisualization();
}

function applyCurrentFilter() {
  const field = (currentMode === 'country') ? 'country' : 'organisation';
  const base = (currentMode === 'country') ? countryData : orgData;
  
  if (activeFilter === 'top5') {
    const top = computeTopKeys('all');
    selectedSets[currentMode] = new Set(top);
  } else if (activeFilter === 'male' || activeFilter === 'female') {
    const relevantGroups = new Set();
    base.forEach(d => {
      const genderMatch = (activeFilter === 'male') 
        ? normalizeGender(d.gender) === 'male'
        : normalizeGender(d.gender) === 'female';
      
      if (genderMatch && d[field]) {
        relevantGroups.add(d[field]);
      }
    });
    selectedSets[currentMode] = relevantGroups;
  } else if (activeFilter === 'all') {
    selectedSets[currentMode] = new Set(uniqueSorted(base, field));
  }
}

function buildColorScale(values) {
  const palette = [
    '#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf',
    '#aec7e8','#ffbb78','#98df8a','#ff9896','#c5b0d5','#c49c94','#f7b6d3','#c7c7c7','#dbdb8d','#9edae5',
    '#393b79','#5254a3','#6b6ecf','#9c9ede','#637939','#8ca252','#b5cf6b','#cedb9c','#8c6d31','#bd9e39',
    '#e7ba52','#e7cb94','#843c39','#ad494a','#d6616b','#e7969c','#7b4173','#a55194','#ce6dbd','#de9ed6'
  ];
  return d3.scaleOrdinal().domain(values).range(palette);
}

function uniqueSorted(data, field) {
  return [...new Set(data.map(d => d[field]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function ensureTooltip() {
  let tooltip = document.getElementById('tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'tooltip';
    tooltip.className = 'tooltip';
    document.getElementById('chart').appendChild(tooltip);
  }
  return tooltip;
}

function setupSVG() {
  const container = d3.select('#chart');
  container.selectAll('svg').remove();
  ensureTooltip();
  const rect = container.node().getBoundingClientRect();
  width = rect.width - 40;
  const initialHeight = Math.max(rect.height - 40, 360);
  svgRoot = container.append('svg')
    .attr('width', width + 40)
    .attr('height', initialHeight + 40);
  svgGroup = svgRoot.append('g').attr('transform', 'translate(20,20)');
}

function switchMode(mode) {
  if (mode !== 'country' && mode !== 'org') return;
  if (currentMode === mode) return;

  currentMode = mode;
  delegatesData = (mode === 'country') ? countryData : orgData;

  applyCurrentFilter();

  updateAllButtonStates();
  buildLegend();
  drawVisualization();
}

function updateModeUI() {
  const bCountry = document.getElementById('mode-country');
  const bOrg = document.getElementById('mode-org');
  if (bCountry && bOrg) {
    if (currentMode === 'country') {
      bCountry.classList.add('active');  bCountry.setAttribute('aria-pressed','true');
      bOrg.classList.remove('active');   bOrg.setAttribute('aria-pressed','false');
    } else {
      bOrg.classList.add('active');      bOrg.setAttribute('aria-pressed','true');
      bCountry.classList.remove('active'); bCountry.setAttribute('aria-pressed','false');
    }
  }
  const title = document.getElementById('panel-title');
  if (title) {
    title.textContent = currentMode === 'country'
      ? 'Delegates by Country'
      : 'Delegates by Organisations';
  }
}

function buildLegend() {
  const legendContainer = document.getElementById('legend');
  legendContainer.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = (currentMode === 'country')
    ? 'Countries (click to show/hide)'
    : 'Organisations (click to show/hide)';
  legendContainer.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'legend-grid';
  legendContainer.appendChild(grid);

  const field = (currentMode === 'country') ? 'country' : 'organisation';
  const base = (currentMode === 'country') ? countryData : orgData;
  const values = uniqueSorted(base, field);
  legendOrder = values;

  values.forEach(val => {
    const count = base.filter(d => {
      const gOk = getGenderFilter(d);
      return d[field] === val && gOk;
    }).length;

    const item = document.createElement('div');
    item.className = 'legend-item';
    item.onclick = () => toggleGroup(val);
    item.innerHTML = `
      <div class="legend-color" style="background-color:${colorScales[currentMode](val)}"></div>
      <span>${val} (${count})</span>
    `;
    grid.appendChild(item);
  });

  if (!selectedSets[currentMode] || selectedSets[currentMode].size === 0) {
    selectedSets[currentMode] = new Set(values);
  }
  updateLegendVisuals();
}

function toggleGroup(val) {
  const set = selectedSets[currentMode];
  if (set.has(val)) set.delete(val); else set.add(val);
  updateLegendVisuals();
  drawVisualization();
}

function updateLegendVisuals() {
  const items = document.querySelectorAll('.legend-item');
  const set = selectedSets[currentMode];
  items.forEach((el, idx) => {
    const key = legendOrder[idx];
    const on = set.has(key);
    el.style.opacity = on ? '1' : '0.35';
    const box = el.querySelector('.legend-color');
    if (box) box.style.opacity = on ? '1' : '0.35';
  });
}

function getGenderFilter(d) {
  if (activeFilter === 'male') return normalizeGender(d.gender) === 'male';
  if (activeFilter === 'female') return normalizeGender(d.gender) === 'female';
  return true;
}

function filteredDataForCounts() {
  const field = (currentMode === 'country') ? 'country' : 'organisation';
  const set = selectedSets[currentMode];
  const base = (currentMode === 'country') ? countryData : orgData;
  return base.filter(d => {
    const gOk = getGenderFilter(d);
    return set.has(d[field]) && gOk;
  });
}

function drawVisualization() {
  svgGroup.selectAll('*').remove();

  const data = filteredDataForCounts();
  const field = (currentMode === 'country') ? 'country' : 'organisation';
  const label = currentMode === 'country' ? 'countries' : 'organisations';

  if (!data.length) {
    svgGroup.append('text')
      .attr('x', width / 2).attr('y', 40)
      .attr('text-anchor', 'middle').attr('fill', '#666')
      .style('font-size', '16px')
      .text('');
    adjustSvgHeight(120);
    return;
  }

  const distinctFiltered = new Set(data.map(d => d[field]).filter(Boolean)).size;
  const infoY = 16;
  svgGroup.append('text')
    .attr('x', width / 2).attr('y', infoY)
    .attr('text-anchor', 'middle')
    .attr('fill', '#333')
    .style('font-size', '14px')
    .style('font-weight', 'bold')
    .text(`${data.length} delegates, ${distinctFiltered} ${label}`);

  const squareSize = 32, padding = 4, total = squareSize + padding;
  const cols = Math.max(1, Math.floor(width / total));
  const rows = Math.ceil(data.length / cols);
  const startY = infoY + 18;
  const startX = Math.max(0, (width - (cols * total - padding)) / 2);

  data.forEach((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * total;
    const y = startY + row * total;
    svgGroup.append('rect')
      .attr('class', 'delegate-square')
      .attr('x', x).attr('y', y)
      .attr('width', squareSize).attr('height', squareSize)
      .attr('fill', colorScales[currentMode](d[field]))
      .attr('stroke', 'white').attr('stroke-width', 1).attr('rx', 3)
      .style('cursor', 'pointer')
      .on('mouseenter', (event) => {
        d3.select(event.currentTarget).attr('stroke', '#000').attr('stroke-width', 2);
        showTooltip(event, d);
      })
      .on('mousemove', (event) => moveTooltip(event))
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget).attr('stroke', 'white').attr('stroke-width', 1);
        hideTooltip();
      });
  });

  const gridBottom = startY + rows * total;
  adjustSvgHeight(gridBottom + 24);
}

function adjustSvgHeight(innerHeight) {
  currentDynamicHeight = Math.max(innerHeight, 140);
  svgRoot.attr('height', currentDynamicHeight + 40);
  const chart = document.getElementById('chart');
  chart.style.height = (currentDynamicHeight + 40) + 'px';
}

function formatNameGivenTitle(d) {
  const last = d.name || '';
  const given = d.given_name || '';
  const title = d.title || '';
  const namePart = last ? last : (given || '(Unbekannt)');
  const givenPart = given ? `, ${given}` : '';
  const titlePart = title ? ` (${title})` : '';
  return `${namePart}${givenPart}${titlePart}`;
}

function showTooltip(event, d) {
  const tooltip = ensureTooltip();
  const chart = document.getElementById('chart');
  if (!tooltip || !chart) return;
  const field = (currentMode === 'country') ? 'country' : 'organisation';
  const label = (currentMode === 'country') ? 'Country' : 'Organisation';
  const value = d[field] || '—';
  const desc = d.description || '';
  const line1 = formatNameGivenTitle(d);
  const g = normalizeGender(d.gender);
  tooltip.innerHTML = `
    <div style="line-height:1.4">
      <div style="color:#fff;font-weight:700;margin-bottom:4px">${line1}</div>
      <div class="tt-row" style="color:#ddd;margin-bottom:2px;white-space:nowrap">
        ${label}:&nbsp;<span style="font-weight:700;color:#fff">${value}</span>
      </div>
      ${g ? `<div class="tt-row" style="color:#ddd;margin-bottom:2px;white-space:nowrap">Gender:&nbsp;<span style="font-weight:700;color:#fff">${g}</span></div>` : ''}
      ${desc ? `<div style="color:#ccc;font-style:italic;font-size:11px">${desc}</div>` : ''}
    </div>
  `;
  tooltip.style.opacity = 1;
  placeTooltip(event, tooltip, chart);
}

function moveTooltip(event) {
  const tooltip = document.getElementById('tooltip');
  const chart = document.getElementById('chart');
  if (!tooltip || !chart || tooltip.style.opacity === '0') return;
  placeTooltip(event, tooltip, chart);
}

function placeTooltip(event, tooltip, chart) {
  const rect = chart.getBoundingClientRect();
  const tipW = tooltip.offsetWidth || 280;
  const tipH = tooltip.offsetHeight || 80;
  let left = (event.clientX - rect.left) + 12;
  let top = (event.clientY - rect.top) + 12;
  const maxLeft = rect.width - tipW - 8;
  const maxTop = rect.height - tipH - 8;
  left = Math.max(8, Math.min(left, Math.max(8, maxLeft)));
  top = Math.max(8, Math.min(top, Math.max(8, maxTop)));
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

function hideTooltip() {
  const tooltip = document.getElementById('tooltip');
  if (tooltip) tooltip.style.opacity = 0;
}

function computeTopKeys(genderFilter = null) {
  const field = (currentMode === 'country') ? 'country' : 'organisation';
  const base = (currentMode === 'country') ? countryData : orgData;
  const counts = {};
  
  base.forEach(d => {
    let gOk = true;
    
    if (genderFilter === 'all') {
      gOk = true;
    } else if (genderFilter === 'male') {
      gOk = normalizeGender(d.gender) === 'male';
    } else if (genderFilter === 'female') {
      gOk = normalizeGender(d.gender) === 'female';
    } else if (genderFilter === null) {
      gOk = getGenderFilter(d);
    }
    
    if (!gOk) return;
    const k = d[field];
    if (k) counts[k] = (counts[k] || 0) + 1;
  });
  
  return Object.entries(counts)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);
}

function handleResize() {
  const container = d3.select('#chart');
  if (container.empty()) return;
  const rect = container.node().getBoundingClientRect();
  const newWidth = rect.width - 40;
  if (Math.abs(newWidth - width) > 8) {
    width = newWidth;
    svgRoot.attr('width', width + 40);
    drawVisualization();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}