
const DATA = {
  delegates: "data/DB_delegates.csv",
  membership: "data/DB_membership.csv",
  bodies: "data/DB_bodies.csv",
};

let raw = { delegates: [], membership: [], bodies: [] };
let expandedMembership = []; 


let maxAppointedByAll = 0;
let maxBodyAll = 0;

const els = {
  filterCountry: document.getElementById("filterCountry"),
  filterBody: document.getElementById("filterBody"),  filterSearch: document.getElementById("filterSearch"),
  btnReset: document.getElementById("btnReset"),

  mDelegates: document.getElementById("mDelegates"),
  mCountries: document.getElementById("mCountries"),
  statusLine: document.getElementById("statusLine"),

  chartAppointedBy: document.getElementById("chartAppointedBy"),
  sortAppointedBy: document.getElementById("sortAppointedBy"),  chartBody: document.getElementById("chartBody"),

  table: document.getElementById("table"),
};

let tooltip;

function ensureTooltip(){
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.className = "wec-tooltip";
  tooltip.style.display = "none";
  document.body.appendChild(tooltip);
  return tooltip;
}

function showTooltip(html, x, y){
  const tt = ensureTooltip();
  tt.innerHTML = html;
  tt.style.display = "block";

  const pad = 14;
  const rect = tt.getBoundingClientRect();
  let left = x + 14;
  let top = y + 14;
  if (left + rect.width > window.innerWidth - pad) left = x - rect.width - 14;
  if (top + rect.height > window.innerHeight - pad) top = y - rect.height - 14;
  tt.style.left = `${Math.max(pad, left)}px`;
  tt.style.top = `${Math.max(pad, top)}px`;
}

function hideTooltip(){
  const tt = ensureTooltip();
  tt.style.display = "none";
}

function uniq(arr){ return Array.from(new Set(arr)); }

function cleanPersonId(x){
  if (!x) return "";
  return String(x).trim().split(/\s+/)[0];
}

function cleanText(x){
  return (x ?? "").toString().trim();
}

function normalizeAppointedBy(x){
  const v = cleanText(x);
  if (!v) return v;
  if (v === "Kingdom of the Serbs, Croats and Slovenes") return "K.S.C.S.";
  return v;
}

function normGender(x){
  const g = cleanText(x).toLowerCase();
  if (g.startsWith("m")) return "male";
  if (g.startsWith("f")) return "female";
  return "";
}

function genderColor(g){
  if (g === "male") return "#2b6cb0";
  if (g === "female") return "#c53030";
  return "#9aa0a6"; // unknown
}

function initSelect(selectEl, values, placeholder){
  const opts = ["(All)"].concat(values);
  selectEl.innerHTML = "";
  for (const v of opts){
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v === "(All)" ? placeholder : v;
    selectEl.appendChild(o);
  }
}

function currentFilters(){
  return {
    country: els.filterCountry.value,
    body: els.filterBody.value,    search: cleanText(els.filterSearch.value).toLowerCase(),
  };
}

function applyFilters(opts = {}){
  const f = currentFilters();
  let rows = expandedMembership;

  if (f.country && f.country !== "(All)"){
    rows = rows.filter(d => d.appointed_by === f.country);
  }
  if (f.body && f.body !== "(All)"){
    rows = rows.filter(d => d.body_name === f.body);
  }
  if (f.search && !opts.ignoreSearch){
    rows = rows.filter(d => {
      const hay = (d.family_name + " " + d.given_names + " " + d.description).toLowerCase();
      return hay.includes(f.search);
    });
  }

  return rows;
}

function countUniqueDelegates(rows){
  return new Set(rows.map(d => d.person_id)).size;
}

function updateMetrics(rows){
  els.mDelegates.textContent = countUniqueDelegates(rows).toLocaleString();
  els.mCountries.textContent = new Set(rows.map(d => d.appointed_by).filter(Boolean)).size.toLocaleString();
}

function clearEl(el){
  el.innerHTML = "";
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function personTooltipHTML(p){
  const name = `${p.family_name || ""}${p.given_names ? ", " + p.given_names : ""}`.trim();
  const desc = p.description || "";
  return `
    <div class="tt-title">${escapeHtml(name || "(Unknown)")}</div>
    <div class="tt-sub">${escapeHtml(desc || "No description")}</div>
  `;
}


function renderAppointedByBar(rows){
  const container = els.chartAppointedBy;
  if (!container) return;
  container.classList.add("wec-barchart");
  container.innerHTML = "";


  const allCategories = Array.from(new Set((raw.delegates || []).map(d => d.appointed_by || "(Unknown)")))
    .sort((a,b) => a.localeCompare(b));


  const peopleByCat = new Map();    
  const womenByCat = new Map();       
  const nameByCat = new Map();        

  for (const c of allCategories){
    peopleByCat.set(c, new Set());
    womenByCat.set(c, new Set());
    nameByCat.set(c, new Map());
  }

  for (const r of rows){
    const cat = r.appointed_by || "(Unknown)";
    if (!peopleByCat.has(cat)){
      peopleByCat.set(cat, new Set());
      womenByCat.set(cat, new Set());
      nameByCat.set(cat, new Map());
      allCategories.push(cat);
    }
    peopleByCat.get(cat).add(r.person_id);
    nameByCat.get(cat).set(r.person_id, { family_name: r.family_name || "", given_names: r.given_names || "", gender: r.gender || "" });
    if (r.gender === "female") womenByCat.get(cat).add(r.person_id);
  }

  const data = allCategories
    .map(cat => {
      const delegates = peopleByCat.get(cat)?.size || 0;
      const women = womenByCat.get(cat)?.size || 0;
      return { appointed_by: cat, delegates, women };
    })
    .sort((a,b) => {
      const mode = (els.sortAppointedBy && els.sortAppointedBy.value) ? els.sortAppointedBy.value : "count";
      if (mode === "alpha") return a.appointed_by.localeCompare(b.appointed_by);
      return d3.descending(a.delegates, b.delegates) || a.appointed_by.localeCompare(b.appointed_by);
    });


  const rowH = 22;
  const cw = container.clientWidth || 920;
  const isNarrow = cw < 700;
  const margin = { top: 10, right: isNarrow ? 120 : 180, bottom: 26, left: isNarrow ? 140 : 220 };
  const width = Math.max(520, cw);
  const height = margin.top + margin.bottom + rowH * data.length;

  const svg = d3.create("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img");

  const x = d3.scaleLinear()
    .domain([0, (maxAppointedByAll || (d3.max(data, d => d.delegates) || 0))])
    .nice()
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.appointed_by))
    .range([margin.top, height - margin.bottom])
    .padding(0.2);

 
  function tooltipHTML(cat){
    const peopleMap = nameByCat.get(cat) || new Map();
    const people = Array.from(peopleMap.values())
      .sort((a,b) => (a.family_name || "").localeCompare(b.family_name || "") || (a.given_names || "").localeCompare(b.given_names || ""));
    const maxShow = 40;
    const shown = people.slice(0, maxShow);
    const more = people.length - shown.length;

    const items = shown.map(p => {
      const cls = (p.gender === "female") ? "female-name" : "";
      const name = `${escapeHtml(p.family_name)}${p.given_names ? ", " + escapeHtml(p.given_names) : ""}`;
      return `<li class="${cls}">${name}</li>`;
    }).join("");

    return `
      <div class="tt-title">${escapeHtml(cat)}</div>
      <div class="tt-sub tt-scroll tt-scroll-appointed">
        <ul>${items || "<li class='text-secondary'>No delegates in current filter.</li>"}</ul>
        ${more > 0 ? `<div style="margin-top:6px;">…and ${more} more</div>` : ""}
      </div>
    `;
  }


  const bars = svg.append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
      .attr("x", x(0))
      .attr("y", d => y(d.appointed_by))
      .attr("width", d => x(d.delegates) - x(0))
      .attr("height", y.bandwidth())
      .attr("rx", 4);

  bars
    .on("mousemove", (event, d) => {
      showTooltip(tooltipHTML(d.appointed_by), event.clientX, event.clientY);
    })
    .on("mouseenter", (event, d) => {
      showTooltip(tooltipHTML(d.appointed_by), event.clientX, event.clientY);
    })
    .on("mouseleave", hideTooltip);


  svg.append("g")
    .selectAll("text")
    .data(data)
    .join("text")
      .attr("class", "value")
      .attr("x", d => Math.min(x(d.delegates) + 8, width - 8))
      .attr("y", d => y(d.appointed_by) + y.bandwidth()/2)
      .attr("alignment-baseline", "middle")
      .attr("text-anchor", d => (x(d.delegates) + 8 > width - 8 ? "end" : "start"))
      .text(d => `${d.delegates}`)
      .each(function(d){
        if (d.women > 0){
          d3.select(this)
            .append("tspan")
            .attr("class", "female-part")
            .attr("dy", "0")
            .attr("alignment-baseline", "middle")
            .text(` (${d.women} female)`);
        }
      });


  svg.append("g")
    .attr("class", "y-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove());

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));

  container.appendChild(svg.node());
}


function renderBodyBar(rowsFiltered, rowsCounts){
  const container = els.chartBody;
  if (!container) return;
  container.classList.add("wec-barchart");
  container.innerHTML = "";

  const f = currentFilters();
  const searchActive = !!(f.search && f.search.trim());

  const relevantBodies = new Set();
  if (searchActive){
    for (const r of (rowsFiltered || [])){
      const b = r.body_name || r.body_id || "(Unknown body)";
      relevantBodies.add(b);
    }
  }

  const src = (rowsCounts && Array.isArray(rowsCounts)) ? rowsCounts : (rowsFiltered || []);

  const peopleByBodyAll = new Map();
  const womenByBodyAll  = new Map();

  for (const r of src){
    const body = r.body_name || r.body_id || "(Unknown body)";
    if (!peopleByBodyAll.has(body)){
      peopleByBodyAll.set(body, new Set());
      womenByBodyAll.set(body, new Set());
    }
    peopleByBodyAll.get(body).add(r.person_id);
    if (r.gender === "female") womenByBodyAll.get(body).add(r.person_id);
  }

  const nameByBodyFiltered = new Map();
  for (const r of (rowsFiltered || [])){
    const body = r.body_name || r.body_id || "(Unknown body)";
    if (!nameByBodyFiltered.has(body)) nameByBodyFiltered.set(body, new Map());
    nameByBodyFiltered.get(body).set(r.person_id, {
      family_name: r.family_name || "",
      given_names: r.given_names || "",
      gender: r.gender || ""
    });
  }

  let data = Array.from(peopleByBodyAll.entries()).map(([body_name, set]) => ({
    body_name,
    delegates: set.size,
    women: (womenByBodyAll.get(body_name)?.size || 0),
  }));

  data = data.filter(d => {
    const n = (d.body_name || "").trim().toLowerCase();
    if (n === "world economic conference 1927") return false;
    if (n === "world economic conference") return false;
    if (n === "wec") return false;
    return true;
  });

  if (searchActive){
    data = data.filter(d => relevantBodies.has(d.body_name));
  }

  data = data
    .sort((a,b) => d3.descending(a.delegates, b.delegates) || a.body_name.localeCompare(b.body_name))
    .slice(0, 20);

  const rowH = 22;
  const cw = container.clientWidth || 920;
  const isNarrow = cw < 700;
  const margin = { top: 10, right: isNarrow ? 160 : 220, bottom: 26, left: isNarrow ? 140 : 240 };
  const width = Math.max(520, cw);
  const height = margin.top + margin.bottom + rowH * data.length;

  const svg = d3.create("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img");

  const x = d3.scaleLinear()
    .domain([0, (maxBodyAll || (d3.max(data, d => d.delegates) || 0))])
    .nice()
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.body_name))
    .range([margin.top, height - margin.bottom])
    .padding(0.2);

  function tooltipHTML(body){
    const peopleMap = nameByBodyFiltered.get(body) || new Map();
    const people = Array.from(peopleMap.values())
      .sort((a,b) => (a.family_name || "").localeCompare(b.family_name || "") || (a.given_names || "").localeCompare(b.given_names || ""));

    const maxShow = 60;
    const shown = people.slice(0, maxShow);
    const more = people.length - shown.length;

    const items = shown.map(p => {
      const cls = (p.gender === "female") ? "female-name" : "";
      const name = `${escapeHtml(p.family_name)}${p.given_names ? ", " + escapeHtml(p.given_names) : ""}`;
      return `<li class="${cls}">${name}</li>`;
    }).join("");

    return `
      <div class="tt-title">${escapeHtml(body)}</div>
      <div class="tt-sub tt-scroll tt-scroll-bodies">
        <ul>${items || "<li class='text-secondary'>No delegates in current filter.</li>"}</ul>
        ${more > 0 ? `<div style="margin-top:6px;">…and ${more} more</div>` : ""}
      </div>
    `;
  }

  const bars = svg.append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
      .attr("x", x(0))
      .attr("y", d => y(d.body_name))
      .attr("width", d => x(d.delegates) - x(0))
      .attr("height", y.bandwidth())
      .attr("rx", 4);


  svg.append("g")
    .selectAll("text")
    .data(data)
    .join("text")
      .attr("class", "value")
      .attr("x", d => Math.min(x(d.delegates) + 8, width - 8))
      .attr("y", d => y(d.body_name) + y.bandwidth()/2)
      .attr("alignment-baseline", "middle")
      .attr("text-anchor", d => (x(d.delegates) + 8 > width - 8 ? "end" : "start"))
      .text(d => `${d.delegates}`)
      .each(function(d){
        if (d.women > 0){
          d3.select(this)
            .append("tspan")
            .attr("class", "female-part")
            .attr("dy", "0")
            .attr("alignment-baseline", "middle")
            .text(` (${d.women} female)`);
        }
      });

  svg.append("g")
    .attr("class", "y-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove());

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));

  container.appendChild(svg.node());
}



let table;

function renderTable(rows){
  const tableData = rows.map(d => ({
    family_name: d.family_name,
    given_names: d.given_names,
    gender: d.gender || "",
    appointed_by: d.appointed_by,
    body_name: d.body_name,
    role_label: d.role_label,
    description: d.description,
  }));

  if (!table){
    table = new Tabulator(els.table, {
      data: tableData,
      layout: "fitColumns",
      height: "1100px",
      responsiveLayout: "collapse",
      columns: [
        {title:"Family name", field:"family_name"},
        {title:"Given names", field:"given_names"},
        {title:"Gender", field:"gender", width: 110},
        {title:"Appointed by", field:"appointed_by"},
        {title:"Body", field:"body_name"},
        {title:"Role", field:"role_label"},
        {title:"Description", field:"description", widthGrow: 2},
      ],
    });
  } else {
    table.replaceData(tableData);
  }
}

function refresh(){
  const rows = applyFilters();
  const rowsNoSearch = applyFilters({ ignoreSearch: true });
  updateMetrics(rows);

  renderAppointedByBar(rows);

  renderBodyBar(rows, rowsNoSearch);
  renderTable(rows);

  const f = currentFilters();
  const active = [
    f.country !== "(All)" ? `Country: ${f.country}` : null,
    f.body !== "(All)" ? `Body: ${f.body}` : null,
    f.search ? `Search: “${f.search}”` : null,
  ].filter(Boolean);

  els.statusLine.textContent =
    active.length
      ? `Filtered: ${active.join(" • ")}`
      : "Showing all data.";
}

function wireEvents(){
  els.filterCountry.addEventListener("change", refresh);
  els.filterBody.addEventListener("change", refresh);
  if (els.sortAppointedBy){ els.sortAppointedBy.addEventListener("change", refresh); }
  els.filterSearch.addEventListener("input", () => {
    window.clearTimeout(window.__searchT);
    window.__searchT = window.setTimeout(refresh, 200);
  });

  els.btnReset.addEventListener("click", () => {
    els.filterCountry.value = "(All)";
    els.filterBody.value = "(All)";
    els.filterSearch.value = "";
    refresh();
  });
}

async function loadData(){
  els.statusLine.textContent = "Loading CSV files…";

  const [delegates, membership, bodies] = await Promise.all([
    d3.csv(DATA.delegates, d => ({
      person_id: cleanPersonId(d.person_id),
      family_name: cleanText(d.family_name),
      given_names: cleanText(d.given_names),
      appointed_by: normalizeAppointedBy(d.appointed_by),
      gender: normGender(d.gender),
      description: cleanText(d.description),
    })),
    d3.csv(DATA.membership, d => ({
      membership_id: cleanText(d.membership_id),
      person_id: cleanPersonId(d.person_id),
      body_id: cleanText(d.body_id),
      role: cleanText(d.role),
      role_label: cleanText(d.role_label),
      notes: cleanText(d.notes),
    })),
    d3.csv(DATA.bodies, d => ({
      body_id: cleanText(d.body_id),
      body_name: cleanText(d.body_name),
      body_type: cleanText(d.body_type),
      parent_body_id: cleanText(d.parent_body_id),
      phase: cleanText(d.phase),
      notes: cleanText(d.notes),
    })),
  ]);

  raw = { delegates, membership, bodies };

  const personById = new Map(delegates.map(d => [d.person_id, d]));
  const bodyById = new Map(bodies.map(d => [d.body_id, d]));

  expandedMembership = membership
    .filter(m => m.person_id)
    .map(m => {
      const p = personById.get(m.person_id) || {};
      const b = bodyById.get(m.body_id) || {};
      return {
        ...m,
        family_name: p.family_name || "(Unknown)",
        given_names: p.given_names || "",
        appointed_by: normalizeAppointedBy(p.appointed_by) || "(Unknown)",
        gender: p.gender || "",
        description: p.description || "",
        body_name: b.body_name || m.body_id || "(Unknown body)",
        body_type: b.body_type || "",
      };
    });

  const appointedCountsAll = d3.rollups(
    expandedMembership,
    v => new Set(v.map(d => d.person_id)).size,
    d => d.appointed_by || "(Unknown)"
  ).map(([k,v]) => v);
  maxAppointedByAll = d3.max(appointedCountsAll) || 0;

  const bodyCountsAllRaw = d3.rollups(
    expandedMembership,
    v => new Set(v.map(d => d.person_id)).size,
    d => d.body_name || d.body_id || "(Unknown body)"
  ).map(([k,v]) => ({ name: k, count: v }));

  const bodyCountsAll = bodyCountsAllRaw
    .filter(d => {
      const n = (d.name || "").trim().toLowerCase();
      if (n === "world economic conference 1927") return false;
      if (n === "world economic conference") return false;
      if (n === "wec") return false;
      return true;
    })
    .map(d => d.count);

  maxBodyAll = d3.max(bodyCountsAll) || 0;

  initSelect(
    els.filterCountry,
    uniq(expandedMembership.map(d => d.appointed_by).filter(Boolean)).sort((a,b) => a.localeCompare(b)),
    "All"
  );

  initSelect(
    els.filterBody,
    uniq(expandedMembership.map(d => d.body_name).filter(Boolean)).sort((a,b) => a.localeCompare(b)),
    "All"
  );

  wireEvents();
  refresh();

  const missingPeople = uniq(
    raw.membership
      .map(d => d.person_id)
      .filter(pid => pid && !personById.has(pid))
  );
  if (missingPeople.length){
    console.warn("Membership rows reference person_id not found in delegates:", missingPeople.slice(0, 20));
    els.statusLine.textContent += `  (Warning: ${missingPeople.length} membership rows reference missing person_id in delegates CSV; see browser console.)`;
  }
}

loadData().catch(err => {
  console.error(err);
  els.statusLine.textContent = "Error loading data. Check the console (F12).";
});
