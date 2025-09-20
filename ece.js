let svg, g, landG, countriesG, projection, path, tooltip;
let worldData, landData, membershipData = [];
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

const aliasMap = {
  "united states of america": ["united states","usa","us"],
  "russian federation": ["russia","soviet union","ussr"],
  "myanmar": ["burma"],
  "democratic republic of the congo": ["congo","drc","congo kinshasa"],
  "republic of the congo": ["congo brazzaville"],
  "republic of korea": ["south korea","korea republic of"],
  "democratic people's republic of korea": ["north korea","korea democratic people's republic of"],
  "iran islamic republic of": ["iran"],
  "viet nam": ["vietnam"],
  "lao people's democratic republic": ["laos"],
  "united kingdom of great britain and northern ireland": ["united kingdom","uk","britain"],
  "türkiye": ["turkey","turkiye"],
  "côte d'ivoire": ["ivory coast","cote d ivoire","cote d’ivoire"],
  "timor-leste": ["east timor"],
  "germany": [
    "federal republic of germany","german federal republic","west germany",
    "german democratic republic","east germany","frg","gdr",
    "german fed rep","fed rep of germany","german dem rep","german dem republic"
  ],
  "federal republic of germany": [
    "germany","german federal republic","west germany","frg","german fed rep","fed rep of germany"
  ],
  "german federal republic": [
    "germany","federal republic of germany","west germany","frg","german fed rep","fed rep of germany"
  ],
  "west germany": [
    "germany","federal republic of germany","german federal republic","frg","german fed rep","fed rep of germany"
  ],
  "german democratic republic": [
    "east germany","gdr","germany","german dem rep","german dem republic"
  ],
  "east germany": [
    "german democratic republic","germany","gdr","german dem rep","german dem republic"
  ],
  "frg": ["federal republic of germany","west germany","germany","german fed rep","fed rep of germany"],
  "gdr": ["german democratic republic","east germany","germany","german dem rep","german dem republic"],
  "german fed rep": ["federal republic of germany","west germany","frg","germany","fed rep of germany"],
  "fed rep of germany": ["federal republic of germany","west germany","frg","germany","german fed rep"],
  "german dem rep": ["german democratic republic","east germany","gdr","germany","german dem republic"],
  "german dem republic": ["german democratic republic","east germany","gdr","germany"]
};

function normalize(s) {
  return (s||"")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[\u2019’]/g,"'")
    .replace(/\./g,"")
    .replace(/\brep\b/g,"republic")
    .replace(/\bdem\b/g,"democratic")
    .replace(/[^a-z0-9\s\-]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function variants(name) {
  const n = normalize(name);
  const out = new Set([n]);
  if (aliasMap[n]) aliasMap[n].forEach(a => out.add(normalize(a)));
  for (const [k, arr] of Object.entries(aliasMap)) {
    if (arr.map(normalize).includes(n)) {
      out.add(k);
      arr.forEach(a => out.add(normalize(a)));
    }
  }
  return out;
}

function makeNormalizedSet(names) {
  const s = new Set();
  names.forEach(n => variants(n).forEach(v => s.add(v)));
  return s;
}

function basemapName(p) {
  return p?.NAME_LONG || p?.NAME || p?.GWSNAME || p?.NAME_EN || p?.ADMIN || p?.name || p?.CNTRY_NAME || "Unknown";
}

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
  svg = d3.select("#ecafeViz")
    .attr("preserveAspectRatio","xMidYMid meet")
    .attr("viewBox","0 0 1000 600");
  const width = 1000, height = 600;
  projection = d3.geoMercator().scale(150).translate([width/2, height/2 + 40]);
  path = d3.geoPath().projection(projection);
  g = svg.append("g");
  landG = g.append("g").attr("id","land-layer");
  countriesG = g.append("g").attr("id","countries-layer");
  tooltip = d3.select("#tooltip")
    .style("max-width","min(46ch, 60vw)")
    .style("white-space","normal")
    .style("word-break","break-word")
    .style("z-index","9999");
}

function setupControls() {
  d3.select("#play").on("click", startAnimation);
  d3.select("#pause").on("click", stopAnimation);
  d3.select("#reset").on("click", () => {
    stopAnimation();
    yearIdx = 0;
    currentYear = relevantYears.length ? relevantYears[0] : 1947;
    updateVisualization();
  });
  const toggleBtn = document.getElementById("overlayToggle");
  const overlay = document.getElementById("memberOverlay");
  if (toggleBtn && overlay) {
    toggleBtn.addEventListener("click", () => {
      overlay.classList.toggle("collapsed");
      toggleBtn.textContent = overlay.classList.contains("collapsed") ? "+" : "–";
    });
  }
}

async function loadData() {
  try {
    const landTopo = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json");
    landData = topojson.feature(landTopo, landTopo.objects.land);
  } catch(e) {}

  try {
    const topo = await d3.json("CShapes-2.0-simplified.json");
    const firstKey = topo && topo.objects ? Object.keys(topo.objects)[0] : null;
    if (!firstKey) throw new Error();
    const fc = topojson.feature(topo, topo.objects[firstKey]);
    window.__CSHAPES__ = fc;
    useHistoricalBasemap = true;
  } catch {
    const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
    worldData = topojson.feature(world, world.objects.countries);
  }

  try {
    const rows = await d3.csv("ece.csv", d => {
      const country = (d.Country || "").trim();
      const sy = +String(d.StartYear||"").match(/\d{4}/)?.[0];
      const ey = +String(d.EndYear||"").match(/\d{4}/)?.[0] || 9999;
      const date = (d.Date || "").trim() || null;
      const note = (d.Note || "").trim() || null;
      return Number.isFinite(sy) ? { country, start: sy, end: ey, date, note } : null;
    });
    membershipData = rows.filter(Boolean).sort((a,b) => d3.ascending(a.start, b.start));
    relevantYears = Array.from(new Set(membershipData.map(d => d.start))).sort((a,b) => a - b);
  } catch(e) {
    alert("ece.csv fehlt oder ist nicht lesbar. Bitte ece.csv (Header: Country,StartYear,EndYear,Date,Note) neben index.html legen.");
  }
}

function drawLandMask() {
  if (!landData) return;
  landG.selectAll("path").remove();
  landG.append("path")
    .datum(landData)
    .attr("d", path)
    .attr("fill", COLOR_LAND)
    .attr("stroke","none");
}

function buildYearChips() {
  const wrap = d3.select("#yearChips");
  if (wrap.empty()) return;
  wrap.selectAll("*").remove();
  wrap.selectAll("div.year-chip")
    .data(relevantYears, d => d)
    .enter()
    .append("div")
    .attr("class","year-chip")
    .text(d => d)
    .on("click", (event, y) => {
      stopAnimation();
      currentYear = y;
      yearIdx = relevantYears.indexOf(y);
      updateVisualization();
    });
}

function drawCountries(features) {
  countriesG.selectAll("path").remove();
  countriesG.selectAll("path")
    .data(features)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("fill", "transparent")
    .attr("stroke", "none")
    .on("mouseover", handleMouseOver)
    .on("mousemove", handleMouseMove)
    .on("mouseout", handleMouseOut);
}

function updateVisualization() {
  d3.select("#yearDisplay").text(currentYear);
  if (useHistoricalBasemap && window.__CSHAPES__) {
    drawCountries(filterCShapesByYear(currentYear));
  } else if (worldData) {
    drawCountries(worldData.features);
  }

  const currentMembers = getMembersUpToYear(currentYear);
  const currentMembersNorm = makeNormalizedSet(currentMembers);
  const newMembers = getNewMembersInYear(currentYear);
  const newMembersNorm = makeNormalizedSet(newMembers);

  d3.select("#memberCount").text(currentMembers.size);
  d3.select("#newMemberCount").text(newMembers.size);

  countriesG.selectAll("path")
    .attr("fill", d => {
      const n = normalize(basemapName(d.properties||{}));
      const isNew = newMembersNorm.has(n);
      const isMember = isNew ? false : currentMembersNorm.has(n);
      if (isNew) return COLOR_NEW;
      if (isMember) return COLOR_MEMBER;
      return "transparent";
    })
    .style("pointer-events", d => {
      const n = normalize(basemapName(d.properties||{}));
      return (currentMembersNorm.has(n) || newMembersNorm.has(n)) ? "auto" : "none";
    })
    .style("cursor", d => {
      const n = normalize(basemapName(d.properties||{}));
      return (currentMembersNorm.has(n) || newMembersNorm.has(n)) ? "pointer" : "default";
    });

  d3.selectAll(".year-chip").classed("active", d => d === currentYear);
  const activeChip = document.querySelector(".year-chip.active");
  if (activeChip) activeChip.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });

  updateMemberOverlay(currentYear);
}

function updateMemberOverlay(year) {
  const titleYear = document.getElementById("overlayYear");
  if (titleYear) titleYear.textContent = year;
  const container = d3.select("#memberOverlayBody");
  if (container.empty()) return;

  const activeCountries = membershipData.filter(d => d.start <= year && year < d.end);
  const grouped = d3.group(activeCountries, d => d.start);
  const years = Array.from(grouped.keys()).sort((a,b) => a - b);

  container.selectAll("*").remove();

  const groups = container.selectAll(".year-group")
    .data(years, d => d)
    .enter()
    .append("div")
    .attr("class", "year-group");

  groups.append("div")
    .attr("class", "year-title")
    .text(yr => {
      const names = dedupSort(grouped.get(yr).map(d => displayLabelForList(d.country, yr)));
      return `${yr} (${names.length})`;
    });

  groups.append("ul")
    .attr("class", "country-list")
    .each(function(yr) {
      const ul = d3.select(this);
      const names = dedupSort(grouped.get(yr).map(d => displayLabelForList(d.country, yr)));
      ul.selectAll("li").data(names).enter().append("li").text(n => n);
    });
}

function dedupSort(arr) {
  return Array.from(new Set(arr)).sort((a,b) => a.localeCompare(b));
}

function displayLabelForList(rawName, groupYear) {
  if ((rawName === "Russia" || rawName === "Russian Federation") && groupYear < 1991) return "Soviet Union";
  return rawName;
}

function pickProp(o, keys, fallback = null) { for (const k of keys) if (o && o[k] != null) return o[k]; return fallback; }

function filterCShapesByYear(year) {
  if (cshapesCache.has(year)) return cshapesCache.get(year);
  const fc = window.__CSHAPES__;
  const START_KEYS = ["GWSYEAR","START","start","begin","FROMYEAR","from"];
  const END_KEYS   = ["GWEYEAR","END","end","to","TOYEAR"];
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
  membershipData.forEach(d => {
    if (d.start <= year && year < d.end) {
      members.add(d.country);
      variants(d.country).forEach(v => members.add(v));
    }
  });
  return members;
}

function getNewMembersInYear(year) {
  const set = new Set();
  membershipData.forEach(d => {
    if (d.start === year) {
      set.add(d.country);
      variants(d.country).forEach(v => set.add(v));
    }
  });
  return set;
}

function isCountryMember(props, memberSetNorm) {
  const n = normalize(basemapName(props||{}));
  return memberSetNorm.has(n);
}

function getMembershipInfo(countryName) {
  const vs = Array.from(variants(countryName));
  let minYear = null, bestDate = null, bestNote = null;
  for (const v of vs) {
    membershipData.filter(d => variants(d.country).has(v)).forEach(d => {
      if (minYear === null || d.start < minYear) {
        minYear = d.start;
        bestDate = d.date ?? null;
        bestNote = d.note ?? null;
      } else if (d.start === minYear) {
        if (!bestDate && d.date) bestDate = d.date;
        if (!bestNote && d.note) bestNote = d.note;
      }
    });
  }
  return { year: minYear, date: bestDate, note: bestNote };
}

function handleMouseOver(event, d) {
  const p = d.properties || {};
  const curr = makeNormalizedSet(getMembersUpToYear(currentYear));
  if (!isCountryMember(p, curr)) {
    tooltip.style("visibility","hidden").style("opacity",0);
    return;
  }
  const display = basemapName(p);
  const info = getMembershipInfo(basemapName(p));
  let html = `<div class="tooltip-title">${display}</div>`;
  html += `<div class="tooltip-since">UNECE member since: ${info.year ?? "Unknown"}</div>`;
  if (info.date) html += `<div class="tooltip-line">Joined on: ${info.date}</div>`;
  if (info.note) html += `<div class="tooltip-line">Note: ${info.note}</div>`;
  tooltip.html(html).style("visibility","visible").style("opacity",1);
}

function handleMouseMove(event) {
  const tt = document.getElementById("tooltip");
  if (!tt) return;
  if (tt.style.visibility !== "visible") { tt.style.visibility = "visible"; tt.style.opacity = 1; }
  const padding = 18, margin = 12;
  const pageW = window.innerWidth || document.documentElement.clientWidth;
  const pageH = window.innerHeight || document.documentElement.clientHeight;
  const ttW = tt.offsetWidth, ttH = tt.offsetHeight;
  let x = event.pageX + padding, y = event.pageY + padding;
  if (x + ttW + margin > pageW) x = event.pageX - ttW - padding;
  if (y + ttH + margin > pageH + window.scrollY) y = event.pageY - ttH - padding;
  if (x < margin) x = margin;
  if (y < window.scrollY + margin) y = window.scrollY + margin;
  if (x + ttW > pageW - margin) x = Math.max(margin, pageW - ttW - margin);
  if (y + ttH > pageH + window.scrollY - margin) y = Math.max(window.scrollY + margin, pageH + window.scrollY - ttH - margin);
  tt.style.left = `${x}px`;
  tt.style.top  = `${y}px`;
}

function handleMouseOut() {
  tooltip.style("visibility","hidden").style("opacity",0);
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
