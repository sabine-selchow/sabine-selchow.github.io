/* Created by Dr Sabine Selchow, as part of a project funded by the European Research Council (ERC) under the EU’s Horizon 2020 research and innovation programme (grant agreement No 885285) 
    I asked AI to help me fix bugs in this .js */

const FILE_PEOPLE = "./historiographies.csv";
const FILE_BOOK_PRIMARY = "./historiographies--1.csv";
const FILE_BOOK_FALLBACK = "./historiographies--2.csv";

function normGender(g) {
  const s = String(g || "").trim().toLowerCase();
  if (s === "female" || s === "f") return "female";
  if (s === "male" || s === "m") return "male";
  if (["org", "organization", "institution"].includes(s)) return "org";
  return "unknown";
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

const svg = d3.select("#viz");
const g = svg.append("g");
const linkLayer        = g.append("g").attr("class", "links");
const centerLayer      = g.append("g").attr("class", "centers");
const labelLayer       = g.append("g").attr("class", "labels");
const nodeLayer        = g.append("g").attr("class", "nodes");
const linkOverlayLayer = g.append("g").attr("class", "links-overlay");

let width = 0, height = 0;
let nodes = [];
let clusters = [];
let clusterById = new Map();
let bookMetaById = new Map();
let vizCenterX = 0, vizCenterY = 0;

const R_NODE_BASE = 6;
const STROKE_W = 1.1;
const R_VIS = R_NODE_BASE + STROKE_W / 2;
const CLUSTER_PAD = 22;
const INNER_HOLE = 240;
const TRANS_DUR = 500;

const VIZ_VH = 0.84;
const VIZ_MAX = 1200;
const VIZ_MIN = 520;

const RING_ROT = -Math.PI / 6;
const RING_EDGE_GAP = 12;
const RIGHT_CLUSTER_NUDGE = -Math.PI / 18;
const SIDE_NEIGHBOR_FADE = 0.20;

const LABEL_FONT_PX = 14;
const LABEL_OFFSET = 12;
const LABEL_PAD = 12;

const LABEL_OVERRIDES = new Map([
  ["Mazower (2009)", { position: "top", anchor: "middle", radial: 10, dx: -100 }],
  ["Sluga (2013)",   { position: "top", anchor: "middle", radial: 10, dx: -80 }],
  ["book5", { dx: -22, dy: -26, anchor: "end" }]
]);

let currentGenderFilter = null;
let multiplicityByPerson = new Map();
let booksByPerson = new Map();
let currentMultiplicityFilter = null;
let currentClusterSelection = null; 
let personGenderById = new Map();

const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip")
  .style("opacity", 0);

const sidePanel = document.getElementById("side-panel");
const sideTitle = document.getElementById("side-title");
const sideSub   = document.getElementById("side-sub");
const sideCount = document.getElementById("side-count");
const sideTBody = d3.select("#person-tbody");

init();

async function init() {
  resize();
  const [people, books] = await Promise.all([loadPeople(), loadBooks()]);
  bookMetaById = new Map((books || []).map(d => [String(d.book_id ?? "").trim(), d]));

  const _booksByPerson = d3.rollup(
    people.filter(d => d.person_id && d.book_id),
    v => new Set(v.map(x => x.book_id)),
    d => d.person_id
  );
  booksByPerson = new Map(_booksByPerson);
  multiplicityByPerson = new Map(
    Array.from(_booksByPerson, ([pid, set]) => [pid, set.size])
  );

  const seen = new Set();
  nodes = people
    .filter(d => d.person_id && d.book_id)
    .map(d => {
      const key = `${d.person_id}__${d.book_id}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const gender = normGender(d.gender);
      if (!personGenderById.has(d.person_id)) personGenderById.set(d.person_id, gender);
      return {
        id: key,
        person_id: d.person_id,
        book_id: d.book_id,
        gender,
        name: d.name || "",
        given_name: d.given_name || "",
        notes: d.notes || "",
        mult: multiplicityByPerson.get(d.person_id) || 1,
        _raw: d,
        r: R_NODE_BASE,
        x: 0, y: 0
      };
    })
    .filter(Boolean);

  const byBook = d3.rollup(nodes, v => v.length, d => d.book_id);
  clusters = Array.from(byBook, ([book_id, size]) => {
    const meta = bookMetaById.get(String(book_id)) || {};
    const desc = meta.description ?? meta.desc ?? meta.label ?? meta.title ?? meta.name ?? "";
    return { book_id, size, desc: String(desc || "") };
  });
  clusterById = new Map(clusters.map(c => [c.book_id, c]));

  placeClustersOnRing();
  layoutNodesHex(false);
  draw();

  window.addEventListener("resize", () => {
    resize();
    placeClustersOnRing();
    layoutNodesHex(true);
    positionLabels(true);
    if (currentMultiplicityFilter !== null) {
      applyMultiplicityFilter(currentMultiplicityFilter);
    }
    if (currentClusterSelection) {
      applyClusterSelection(currentClusterSelection, false);
    }
  }, { passive: true });

  window.filterFemale = () => applyGenderFilter("female");
  window.filterMale   = () => applyGenderFilter("male");
  window.clearGenderFilter = () => applyGenderFilter(null);

  document.getElementById("btn-multi-2")?.addEventListener("click", () => applyMultiplicityFilter(2));
  document.getElementById("btn-multi-3")?.addEventListener("click", () => applyMultiplicityFilter(3));
  document.getElementById("btn-multi-4")?.addEventListener("click", () => applyMultiplicityFilter(4));
  document.getElementById("btn-multi-5")?.addEventListener("click", () => applyMultiplicityFilter(5));

  document.getElementById("btn-clear-multi")?.addEventListener("click", () => {
    clearMultiplicityFilter();   
    clearClusterSelection();     
    clearSideTable();            
    updateMultiplicityButtons(); 
  });

  updateFilterButtons();
  updateMultiplicityButtons();
}

function labelTarget(d) {
  const o = LABEL_OVERRIDES.get(String(d.book_id)) || {};
  let a = Math.atan2(d.cy - vizCenterY, d.cx - vizCenterX);
  if (o.position === "top") a = -Math.PI / 2;
  if (o.position === "right") a = 0;
  if (o.position === "bottom") a = Math.PI / 2;
  if (o.position === "left") a = Math.PI;
  if (typeof o.angle === "number") a = o.angle;
  const baseR = d.r + LABEL_OFFSET + (o.radial || 0);
  let x = d.cx + Math.cos(a) * baseR;
  let y = d.cy + Math.sin(a) * baseR;
  if (o.dx) x += o.dx;
  if (o.dy) y += o.dy;
  x = Math.max(LABEL_PAD, Math.min(width  - LABEL_PAD, x));
  y = Math.max(LABEL_PAD, Math.min(height - LABEL_PAD, y));
  const anchor = o.anchor ? o.anchor : (x >= d.cx ? "start" : "end");
  return { x, y, anchor };
}

function fixLabelOverflow() {
  labelLayer.selectAll("text.cluster-label").each(function() {
    const el = this;
    const w = el.getComputedTextLength();
    const x = parseFloat(el.getAttribute("x"));
    const anchor = (el.style.textAnchor || el.getAttribute("text-anchor") || "start");
    if (anchor === "start"  && x + w > width - LABEL_PAD)  el.setAttribute("x", String(width - LABEL_PAD - w));
    if (anchor === "end"    && x - w < LABEL_PAD)          el.setAttribute("x", String(LABEL_PAD + w));
    if (anchor === "middle") {
      const half = w / 2;
      if (x - half < LABEL_PAD)            el.setAttribute("x", String(LABEL_PAD + half));
      if (x + half > width - LABEL_PAD)    el.setAttribute("x", String(width - LABEL_PAD - half));
    }
  });
}

function positionLabels(withTransition) {
  const sel = labelLayer.selectAll("text.cluster-label")
    .data(clusters, d => d.book_id);

  const setAttrs = s => s
    .attr("x", d => labelTarget(d).x)
    .attr("y", d => labelTarget(d).y)
    .style("text-anchor", d => labelTarget(d).anchor)
    .style("font-size", LABEL_FONT_PX + "px")
    .classed("button", true)
    .classed("active", d => d.book_id === currentClusterSelection)
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr("aria-pressed", d => d.book_id === currentClusterSelection ? "true" : "false");

  if (withTransition) {
    const tr = sel.transition().duration(TRANS_DUR);
    setAttrs(tr);
    tr.on("end", function(_, i, n) { if (i === n.length - 1) fixLabelOverflow(); });
  } else {
    setAttrs(sel);
    fixLabelOverflow();
  }
}

function draw() {
  const selLabels = labelLayer.selectAll("text.cluster-label")
    .data(clusters, d => d.book_id)
    .join("text")
    .attr("class", "cluster-label")
    .style("dominant-baseline", "middle")
    .style("font-weight", "400")
    .style("opacity", 0.95)
    .text(d => {
      const t = d.desc && d.desc.trim() ? ` — ${d.desc.trim()}` : "";
      return `${d.book_id}${t}`;
    })
    .on("click", (event, d) => {
      if (currentClusterSelection === d.book_id) {
        clearClusterSelection();
        clearSideTable(); 
        updateMultiplicityButtons();
      } else {
        applyClusterSelection(d.book_id, true);
      }
    })
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (currentClusterSelection === d.book_id) {
          clearClusterSelection();
          clearSideTable();
          updateMultiplicityButtons();
        } else {
          applyClusterSelection(d.book_id, true);
        }
      }
    });

  positionLabels(false);

  const sel = nodeLayer.selectAll("circle.node-circle")
    .data(nodes, d => d.id)
    .join("circle")
    .attr("class", d => `node-circle ${d.gender}`)
    .attr("r", d => d.r)
    .attr("cx", d => d.x)
    .attr("cy", d => d.y);

  sel
    .on("mouseenter", function (event, d) { showTooltipNode(event, d); })
    .on("mousemove", function (event) { moveTooltip(event); })
    .on("mouseleave", function () { hideTooltip(); });
}

function applyClusterSelection(book_id, scrollTop = true) {
  currentClusterSelection = book_id;
  clearMultiplicityFilter();
  labelLayer.selectAll("text.cluster-label")
    .classed("active", d => d.book_id === currentClusterSelection)
    .attr("aria-pressed", d => d.book_id === currentClusterSelection ? "true" : "false");
  const personSet = new Set(
    nodes.filter(n => n.book_id === book_id).map(n => n.person_id)
  );
  const personIds = Array.from(personSet);
  updateSideTableForCluster(book_id, personIds, scrollTop);
  updateMultiplicityButtons();
}

function clearClusterSelection() {
  if (!currentClusterSelection) return;
  currentClusterSelection = null;
  labelLayer.selectAll("text.cluster-label")
    .classed("active", false)
    .attr("aria-pressed", "false");
}

function updateSideTableForCluster(book_id, personIds, scrollTop = true) {
  const data = personIds
    .map(personMeta)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "") || (a.given_name || "").localeCompare(b.given_name || ""));

  sideCount.textContent = data.length;
  const desc = (bookMetaById.get(String(book_id))?.label
             || bookMetaById.get(String(book_id))?.title
             || bookMetaById.get(String(book_id))?.name
             || bookMetaById.get(String(book_id))?.desc
             || "");
  sideTitle.textContent = `${book_id}${desc ? " — " + desc : ""}`;
  sideSub.style.display = data.length ? "none" : "block";

  const rows = sideTBody.selectAll("tr").data(data, d => d.person_id);
  rows.exit().remove();

  const enter = rows.enter().append("tr")
    .attr("data-pid", d => d.person_id);

  enter.append("td").attr("class", "td-name").text(d => d.name || "—");
  enter.append("td").attr("class", "td-given").text(d => d.given_name || "—");
  enter.append("td").attr("class", "td-gender").text(d => d.gender ? d.gender[0].toUpperCase() : "—");
  enter.append("td").attr("class", "td-mult").text(d => d.mult);

  const merged = enter.merge(rows);
  merged.select(".td-name").text(d => d.name || "—");
  merged.select(".td-given").text(d => d.given_name || "—");
  merged.select(".td-gender").text(d => d.gender ? d.gender[0].toUpperCase() : "—");
  merged.select(".td-mult").text(d => d.mult);

  if (scrollTop) {
    const wrap = document.querySelector(".side-table-wrap");
    if (wrap) wrap.scrollTop = 0;
  }
}

function showTooltipNode(event, d) {
  const fullName = (d.given_name && d.name) ? `${d.given_name} ${d.name}` : (d.name || d.given_name || d.person_id);
  const genderLabel = d.gender ? cap(d.gender) : "Unknown";
  const extras = [];
  for (const [k, v] of Object.entries(d._raw || {})) {
    if (["person_id", "name", "given_name", "gender", "book_id", "notes"].includes(k)) continue;
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      extras.push(`<div class="tt-row"><strong>${k}:</strong> ${v}</div>`);
    }
  }
  const html = `
    <strong>${fullName}</strong>
    <div class="tt-row"><strong>ID:</strong> ${d.person_id}</div>
    <div class="tt-row"><strong>Gender:</strong> ${genderLabel}</div>
    <div class="tt-row"><strong>Buch/Quelle:</strong> ${d.book_id}</div>
    ${d.notes ? `<div class="tt-row"><strong>Notes:</strong> ${d.notes}</div>` : ""}
    ${extras.length ? `<hr style="opacity:.2;border:none;border-top:1px solid rgba(255,255,255,.2);margin:6px 0;">${extras.join("")}` : ""}
  `;
  tooltip.html(html).classed("show", true).style("opacity", 1);
  moveTooltip(event);
}
function showTooltipCenter(event, pid) {
  const sample = nodes.find(n => n.person_id === pid) || {};
  const fullName = (sample.given_name && sample.name) ? `${sample.given_name} ${sample.name}` : (sample.name || sample.given_name || pid);
  const genderLabel = sample.gender ? cap(sample.gender) : "Unknown";
  const books = Array.from(booksByPerson.get(pid) || []);
  const mult = multiplicityByPerson.get(pid) || books.length || 1;
  const html = `
    <strong>${fullName}</strong>
    <div class="tt-row"><strong>ID:</strong> ${pid}</div>
    <div class="tt-row"><strong>Gender:</strong> ${genderLabel}</div>
    <div class="tt-row"><strong>Appears in:</strong> ${mult} book${mult===1?"":"s"}</div>
    ${books.length ? `<div class="tt-row"><strong>Books:</strong> ${books.join(", ")}</div>` : ""}
  `;
  tooltip.html(html).classed("show", true).style("opacity", 1);
  moveTooltip(event);
}
function moveTooltip(event) {
  const pad = 14;
  const { pageX, pageY } = event;
  const t = tooltip.node();
  const rect = t.getBoundingClientRect();
  let x = pageX + pad;
  let y = pageY + pad;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (x + rect.width + 8 > vw) x = pageX - rect.width - pad;
  if (y + rect.height + 8 > vh) y = pageY - rect.height - pad;
  tooltip.style("left", `${x}px`).style("top", `${y}px`);
}
function hideTooltip() {
  tooltip.classed("show", false).style("opacity", 0);
}

function applyGenderFilter(gender) {
  currentGenderFilter = gender;
  const sel = nodeLayer.selectAll("circle.node-circle");
  if (!gender) sel.attr("display", null);
  else sel.attr("display", d => d.gender === gender ? null : "none");
  updateFilterButtons();
  updateMultiplicityButtons();
  if (currentMultiplicityFilter !== null) {
    applyMultiplicityFilter(currentMultiplicityFilter);
  }
}
function updateFilterButtons() {
  const btnFemale = document.getElementById("btn-filter-female");
  const btnMale = document.getElementById("btn-filter-male");
  const btnAll = document.getElementById("btn-filter-all");
  if (!btnFemale || !btnMale || !btnAll) return;
  btnFemale.classList.toggle("active", currentGenderFilter === "female");
  btnMale.classList.toggle("active", currentGenderFilter === "male");
  btnAll.classList.toggle("active", currentGenderFilter === null);
}

function concentricCirclePositions(n, rNode, gap) {
  const pos = [];
  if (n <= 0) return pos;
  let count = 0;
  pos.push({ x: 0, y: 0 }); count++;
  let k = 1;
  while (count < n) {
    const cap = 6 * k;
    const ringR = k * (2 * rNode + gap);
    for (let i = 0; i < cap && count < n; i++) {
      const a = (i / cap) * Math.PI * 2 - Math.PI / 2;
      pos.push({ x: ringR * Math.cos(a), y: ringR * Math.sin(a) });
      count++;
    }
    k++;
  }
  return pos;
}

function centerPositionsForPersons(personIds) {
  const centerX = width / 2;
  const centerY = height / 2;
  const centerNodeR = 4;
  const gap = 2.5;
  const n = personIds.length;
  const rel = concentricCirclePositions(n, centerNodeR, gap);
  const allowedR = Math.max(40, INNER_HOLE * 0.58);
  let maxR = 0;
  for (const p of rel) {
    const r2 = p.x * p.x + p.y * p.y;
    if (r2 > maxR) maxR = r2;
  }
  maxR = Math.sqrt(maxR);
  const scale = maxR > 0 ? Math.min(1, allowedR / maxR) : 1;
  const map = new Map();
  for (let i = 0; i < personIds.length; i++) {
    const p = rel[i] || { x: 0, y: 0 };
    map.set(personIds[i], { x: centerX + p.x * scale, y: centerY + p.y * scale });
  }
  return map;
}

function setPersonLinkEmphasis(pid, on) {
  const allBase    = linkLayer.selectAll("line.connector-line");
  const allOverlay = linkOverlayLayer.selectAll("line.connector-line");
  const all        = allBase.merge(allOverlay);
  const mine       = all.filter(d => d.person_id === pid);
  const others     = all.filter(d => d.person_id !== pid);
  if (on) {
    others.classed("connector-line--dim", true);
    mine.each(function() {
        linkOverlayLayer.node().appendChild(this);
      })
      .classed("connector-line--emph", true)
      .attr("pointer-events", "none");
  } else {
    all.classed("connector-line--dim", false);
    linkOverlayLayer.selectAll("line.connector-line.connector-line--emph")
      .classed("connector-line--emph", false)
      .attr("pointer-events", "stroke")
      .each(function() {
        linkLayer.node().appendChild(this);
      });
  }
}

function wireCenterEvents(sel) {
  sel
    .style("pointer-events", "all")
    .on("mouseenter", function (event, pid) {
      showTooltipCenter(event, pid);
      setPersonLinkEmphasis(pid, true);
      highlightRow(pid, true);
    })
    .on("mousemove", function (event) { moveTooltip(event); })
    .on("mouseleave", function (event, pid) {
      hideTooltip();
      setPersonLinkEmphasis(pid, false);
      highlightRow(pid, false);
    });
}

function applyMultiplicityFilter(k) {
  currentMultiplicityFilter = k;
  const matchPersons = new Set(
    nodes
      .filter(d => d.mult === k && (!currentGenderFilter || d.gender === currentGenderFilter))
      .map(d => d.person_id)
  );
  const personIds = Array.from(matchPersons);
  nodeLayer.selectAll("circle.node-circle")
    .classed("highlight", d => d.mult === k && (!currentGenderFilter || d.gender === currentGenderFilter));
  const centers = centerPositionsForPersons(personIds);
  const centerSel = centerLayer.selectAll("circle.center-node")
    .data(personIds, d => d);
  centerSel.exit().remove();
  centerSel.enter()
    .append("circle")
    .attr("class", "center-node")
    .attr("r", 4)
    .attr("cx", d => centers.get(d).x)
    .attr("cy", d => centers.get(d).y)
    .attr("opacity", 0)
    .call(wireCenterEvents)
    .transition().duration(TRANS_DUR)
    .attr("opacity", 1);
  centerSel
    .call(wireCenterEvents)
    .transition().duration(TRANS_DUR)
    .attr("cx", d => centers.get(d).x)
    .attr("cy", d => centers.get(d).y);
  const matchedNodes = nodes.filter(d => matchPersons.has(d.person_id));
  const linkSel = linkLayer.selectAll("line.connector-line")
    .data(matchedNodes, d => d.id);
  linkSel.exit().remove();
  linkSel.enter()
    .append("line")
    .attr("class", "connector-line")
    .attr("x1", d => d.x)
    .attr("y1", d => d.y)
    .attr("x2", d => centers.get(d.person_id).x)
    .attr("y2", d => centers.get(d.person_id).y)
    .attr("opacity", 0)
    .transition().duration(TRANS_DUR)
    .attr("opacity", 1);
  linkSel
    .transition().duration(TRANS_DUR)
    .attr("x1", d => d.x)
    .attr("y1", d => d.y)
    .attr("x2", d => centers.get(d.person_id).x)
    .attr("y2", d => centers.get(d.person_id).y);
  updateSideTable(personIds);
  updateMultiplicityButtons();
}

function clearMultiplicityFilter() {
  currentMultiplicityFilter = null;
  nodeLayer.selectAll("circle.node-circle").classed("highlight", false);
  linkOverlayLayer.selectAll("line.connector-line")
    .attr("pointer-events", "stroke")
    .classed("connector-line--emph", false)
    .each(function(){ linkLayer.node().appendChild(this); });
  centerLayer.selectAll("*").remove();
  linkLayer.selectAll("*").remove();
  updateMultiplicityButtons();
}

function personMeta(pid) {
  const sample = nodes.find(n => n.person_id === pid) || {};
  const gender = sample.gender || personGenderById.get(pid) || "unknown";
  const name = sample.name || "";
  const given_name = sample.given_name || "";
  const books = Array.from(booksByPerson.get(pid) || []);
  const mult = multiplicityByPerson.get(pid) || books.length || 1;
  return { person_id: pid, name, given_name, gender, books, mult };
}

function updateSideTable(personIds) {
  const data = personIds.map(personMeta)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "") || (a.given_name || "").localeCompare(b.given_name || ""));
  sideCount.textContent = data.length;
  sideTitle.textContent = `in ${currentMultiplicityFilter} books${currentGenderFilter ? ` — ${currentGenderFilter}` : ""}`;
  sideSub.style.display = data.length ? "none" : "block";
  const rows = sideTBody.selectAll("tr").data(data, d => d.person_id);
  rows.exit().remove();
  const enter = rows.enter().append("tr")
    .attr("data-pid", d => d.person_id)
    .on("mouseenter", (event, d) => setPersonLinkEmphasis(d.person_id, true))
    .on("mouseleave", (event, d) => setPersonLinkEmphasis(d.person_id, false));
  enter.append("td").attr("class", "td-name").text(d => d.name || "—");
  enter.append("td").attr("class", "td-given").text(d => d.given_name || "—");
  enter.append("td").attr("class", "td-gender").text(d => d.gender ? d.gender[0].toUpperCase() : "—");
  enter.append("td").attr("class", "td-mult").text(d => d.mult);
  const merged = enter.merge(rows);
  merged.select(".td-name").text(d => d.name || "—");
  merged.select(".td-given").text(d => d.given_name || "—");
  merged.select(".td-gender").text(d => d.gender ? d.gender[0].toUpperCase() : "—");
  merged.select(".td-mult").text(d => d.mult);
  const wrap = document.querySelector(".side-table-wrap");
  if (wrap) wrap.scrollTop = 0;
}

function clearSideTable() {
  sideTBody.selectAll("*").remove();
  sideCount.textContent = "0";
  sideTitle.textContent = "Selection";
  sideSub.style.display = "block";
}

function highlightRow(pid, on) {
  const tr = sideTBody.selectAll("tr").filter(d => d.person_id === pid);
  tr.classed("row-highlight", !!on);
}

function updateMultiplicityButtons() {
  const counts = {2:0,3:0,4:0,5:0};
  for (const [pid, mult] of multiplicityByPerson.entries()) {
    const g = personGenderById.get(pid);
    if (currentGenderFilter && g !== currentGenderFilter) continue;
    if (counts[mult] !== undefined) counts[mult] += 1;
  }
  const map = new Map([
    [2, document.getElementById("btn-multi-2")],
    [3, document.getElementById("btn-multi-3")],
    [4, document.getElementById("btn-multi-4")],
    [5, document.getElementById("btn-multi-5")]
  ]);
  for (const [k, el] of map.entries()) {
    if (!el) continue;
    const n = counts[k] || 0;
    el.textContent = `in ${k} books (${n})`;
    el.title = `Show people appearing in ${k} books${currentGenderFilter ? ` – ${currentGenderFilter}` : ""}`;
    el.classList.toggle("active", currentMultiplicityFilter === k);
    el.disabled = n === 0;
  }
  const btnClear = document.getElementById("btn-clear-multi");
  if (btnClear) btnClear.disabled = currentMultiplicityFilter === null && !currentClusterSelection;
}

function layoutNodesHex(withTransition = false) {
  const nodesByBook = d3.group(nodes, d => d.book_id);
  const rank = { female: 0, male: 1, org: 2, unknown: 3 };
  nodesByBook.forEach((arr, book_id) => {
    const c = clusterById.get(book_id);
    const startR = Math.max(24, c.r * 0.86);
    const targetR = findRadiusForCapacity(arr.length, startR, R_VIS);
    const positions = hexGridPositions(targetR - R_VIS, R_VIS)
      .map(p => ({ x: p.x, y: p.y, r2: p.x * p.x + p.y * p.y, a: Math.atan2(p.y, p.x) }))
      .sort((a, b) => a.r2 - b.r2 || a.a - b.a || a.x - b.x || a.y - b.y);
    const grouped = [...arr].sort((u, v) => {
      const ru = (rank[u.gender] ?? 3), rv = (rank[v.gender] ?? 3);
      if (ru !== rv) return ru - rv;
      if (u.person_id !== v.person_id) return u.person_id < v.person_id ? -1 : 1;
      return u.book_id < v.book_id ? -1 : 1;
    });
    for (let i = 0; i < grouped.length; i++) {
      const p = positions[i];
      grouped[i].x = c.cx + p.x;
      grouped[i].y = c.cy + p.y;
      grouped[i].r = R_NODE_BASE;
    }
  });

  const sel = nodeLayer.selectAll("circle.node-circle").data(nodes, d => d.id);
  if (withTransition) {
    sel.transition().duration(TRANS_DUR)
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.r);
  } else {
    sel.attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.r);
  }

  if (currentMultiplicityFilter !== null) {
    const k = currentMultiplicityFilter;
    const matchPersons = new Set(
      nodes
        .filter(d => d.mult === k && (!currentGenderFilter || d.gender === currentGenderFilter))
        .map(d => d.person_id)
    );
    const personIds = Array.from(matchPersons);
    const centers = centerPositionsForPersons(personIds);
    linkLayer.selectAll("line.connector-line")
      .data(nodes.filter(d => matchPersons.has(d.person_id)), d => d.id)
      .transition().duration(TRANS_DUR)
      .attr("x1", d => d.x)
      .attr("y1", d => d.y)
      .attr("x2", d => centers.get(d.person_id).x)
      .attr("y2", d => centers.get(d.person_id).y);
    centerLayer.selectAll("circle.center-node")
      .data(personIds, d => d)
      .transition().duration(TRANS_DUR)
      .attr("cx", d => centers.get(d).x)
      .attr("cy", d => centers.get(d).y);
  }
}

function hexGridPositions(R_in, R_vis) {
  const pts = [];
  const stepX = 2 * R_vis;
  const stepY = Math.sqrt(3) * R_vis;
  const limit = Math.max(0, R_in);
  let row = 0;
  for (let y = -limit; y <= limit + 1e-6; y += stepY, row++) {
    const offset = (row % 2 === 0) ? 0 : R_vis;
    const maxX = Math.sqrt(Math.max(0, limit * limit - y * y));
    for (let x = -maxX; x <= maxX + 1e-6; x += stepX) {
      const xx = x + offset;
      if ((xx * xx + y * y) <= limit * limit + 1e-6) pts.push({ x: xx, y });
    }
  }
  return pts;
}
function findRadiusForCapacity(n, startR, R_vis) {
  if (n <= 0) return Math.max(0, startR);
  const capacity = R => hexGridPositions(R - R_vis, R_vis).length;
  if (capacity(startR) >= n) return startR;
  let lo = startR, hi = Math.max(startR * 1.2, startR + 1);
  while (capacity(hi) < n) hi *= 1.5;
  for (let it = 0; it < 24; it++) {
    const mid = 0.5 * (lo + hi);
    if (capacity(mid) >= n) hi = mid; else lo = mid;
  }
  return hi;
}
function placeClustersOnRing() {
  const margin = 16;
  const usableW = Math.max(200, width - margin * 2);
  const usableH = Math.max(200, height - margin * 2);
  const lift = 0;
  const centerX = margin + usableW / 2;
  const centerY = margin + usableH / 2 - lift;
  vizCenterX = centerX;
  vizCenterY = centerY;

  const sizes = clusters.map(c => c.size);
  const sMin = d3.min(sizes), sMax = d3.max(sizes);
  const rScale = (sMin === sMax)
    ? (() => Math.max(52, R_NODE_BASE * 6))
    : d3.scaleSqrt().domain([sMin, sMax]).range([58, 144]);
  clusters.forEach(c => { c.r = rScale(c.size); });

  const maxClusterR = d3.max(clusters, d => d.r) ?? 60;
  const hole = Math.max(INNER_HOLE, maxClusterR * 1.30);

  const maxRLeft = centerX - margin - maxClusterR - CLUSTER_PAD - RING_EDGE_GAP;
  const maxRRight = (margin + usableW) - centerX - maxClusterR - CLUSTER_PAD - RING_EDGE_GAP;
  const maxRTop = centerY - margin - maxClusterR - CLUSTER_PAD - RING_EDGE_GAP;
  const maxRBottom = (margin + usableH) - centerY - maxClusterR - CLUSTER_PAD - RING_EDGE_GAP;
  const ringR = Math.max(0, Math.min(maxRLeft, maxRRight, maxRTop, maxRBottom));

  const k = Math.max(1, clusters.length);
  const rr = Math.max(ringR, hole);
  const baseAngles = d3.range(k).map(i => RING_ROT + Math.PI * 2 * (i / k));

  let idxRight = 0, bestCos = -Infinity;
  baseAngles.forEach((a, i) => { const c = Math.cos(a); if (c > bestCos) { bestCos = c; idxRight = i; } });
  const angles = baseAngles.map((a, i) => {
    if (i === idxRight) return a + RIGHT_CLUSTER_NUDGE;
    if (i === (idxRight + 1) % k || i === (idxRight - 1 + k) % k) return a + RIGHT_CLUSTER_NUDGE * SIDE_NEIGHBOR_FADE;
    return a;
  });

  clusters.forEach((c, i) => {
    const a = angles[i];
    c.cx = centerX + Math.cos(a) * rr;
    c.cy = centerY + Math.sin(a) * rr;
  });
}

async function loadBooks() {
  for (const fn of [FILE_BOOK_PRIMARY, FILE_BOOK_FALLBACK]) {
    try {
      const rows = await d3.csv(fn, d3.autoType);
      if (rows?.length) return rows;
    } catch (e) {}
  }
  return [];
}
async function loadPeople() {
  const rows = await d3.csv(FILE_PEOPLE, d3.autoType);
  return rows.map(d => ({
    person_id: String(d.person_id ?? "").trim(),
    book_id: String(d.book_id ?? "").trim(),
    gender: d.gender ?? "",
    name: d.name ?? d.surname ?? "",
    given_name: d.given_name ?? d.first_name ?? "",
    notes: d.notes ?? d.note ?? ""
  })).filter(d => d.person_id && d.book_id);
}

function resize() {
  const rect = svg.node().getBoundingClientRect();
  width = rect.width || 900;
  height = Math.max(VIZ_MIN, Math.min(VIZ_MAX, window.innerHeight * VIZ_VH));
  svg.attr("viewBox", [0, 0, width, height].join(" "));
}
