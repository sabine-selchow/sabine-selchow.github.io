const CSV_CANDIDATES = ["nodes.csv", "lon.csv"];

const LEGEND_UI = {
  fontSize: 16,
  colMin: 320,
  gapRow: 12,
  gapCol: 28,
  btn: { w: 64, h: 26, rx: 6, gap: 10, fontSize: 14, fontWeight: 600 }
};

const VIZ_VERTICAL_TWEAK = { sun: -28, hier: -34 };

const clean = v => (v ?? "").toString().normalize("NFC").trim();
const key = s => clean(s).toLowerCase().replace(/[^a-z0-9]+/g,"");

function detectDelimiter(text){
  const lines = text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(l=>l.trim()).slice(0,6);
  const cand = [",",";","\t","|"];
  const score = cand.map(c => [c, d3.sum(lines, l => l.split(c).length-1)]);
  return score.sort((a,b)=>b[1]-a[1])[0]?.[0] || ",";
}

async function loadAnyCSV(paths){
  for(const p of paths){
    try{
      const txt = await d3.text(p);
      if(txt && txt.trim()){
        const delim = detectDelimiter(txt);
        const parse = d3.dsvFormat(delim).parse;
        return { rows: parse(txt.replace(/^\uFEFF/,"")), path:p, delim };
      }
    }catch(e){}
  }
  return { rows:[], path:null, delim:"," };
}

function findCols(cols){
  const K = cols.map(c => [c, key(c)]);
  const pick = (...patterns) => {
    for(const [raw,k] of K) for(const rx of patterns) if(rx.test(k)) return raw;
    return null;
  };
  return {
    id: pick(/^nodeid$/),
    parent: pick(/^parentid$/),
    name: pick(/^name$|^label$|^title$/),
    level: pick(/^level$|^tier$|^stufe$/),
    part: pick(/^part$|^teil$|^section$/),
    chapter: pick(/^chapter$|^chapitre$|^kapitel$/),
    chapterOrder: pick(/^chapter[_\s-]?order$|^order$/)
  };
}

function findExtraCols(cols){
  const lc = cols.map(c => [c, key(c)]);
  const pickExact = norm => {
    const hit = lc.find(([raw,k]) => k === norm);
    return hit ? hit[0] : null;
  };
  return {
    committeeType: pickExact("committee_type") || pickExact("committeetype") || pickExact("type"),
    creation:    pickExact("creation"),
    purpose:     pickExact("purpose"),
    character:   pickExact("character"),
    composition: pickExact("composition"),
    appointment: pickExact("appointment"),
    secretariat: pickExact("secretariat"),
    placeATC:    pickExact("placeoftheadvisoryandtechnicalcommittee"),
    organs:      pickExact("organs"),
    source:      pickExact("source"),
    notes:       pickExact("notes")
  };
}

function normPart(v){
  const s = clean(v).toUpperCase();
  if(!s) return null;
  if (s==="I"||/\b1\b/.test(s)||/^PART\s*I\b/i.test(s)||/^TEIL\s*I\b/i.test(s)) return "I";
  if (s==="II"||/\b2\b/.test(s)||/^PART\s*II\b/i.test(s)||/^TEIL\s*II\b/i.test(s)) return "II";
  if (s==="III"||/\b3\b/.test(s)||/^PART\s*III\b/i.test(s)||/^TEIL\s*III\b/i.test(s)) return "III";
  return null;
}
function normLevel(v){
  const s = key(v);
  if(/subsubsubcommittee/.test(s)) return "subsubsubcommittee";
  if(/subsubcommittee/.test(s))    return "subsubcommittee";
  if(/subcommittee/.test(s))       return "subcommittee";
  if(/committee/.test(s))          return "committee";
  return clean(v)||"";
}
const normChapter = v => (clean(v) || null);

const tt = d3.select("#tooltip");

// ---------- Touch-/Pointer-Logik & Tooltip-API ----------
const isCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
let ttPinned = false;

function getClientPoint(ev) {
  if (ev && ev.touches && ev.touches[0]) {
    return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
  }
  return { x: ev?.clientX ?? 0, y: ev?.clientY ?? 0 };
}

function showTT(ev, name, _path = "", data = null, { pin = false } = {}) {
  tt.select(".t-name").text(name || "");
  tt.select(".t-path").text(data && data.committee_type ? data.committee_type : "");

  let box = tt.select(".t-extra");
  if (box.empty()) box = tt.append("div").attr("class","t-extra");
  box.html("");

  if(data){
    const fields = [
      ["creation","Creation"],
      ["purpose","Purpose"],
      ["character","Character"],
      ["composition","Composition"],
      ["appointment","Appointment"],
      ["secretariat","Secretariat"],
      ["placeATC","Place of the Advisory and Technical Committee"],
      ["organs","Organs"],
      ["source","Source"],
      ["notes","Notes"]
    ];
    fields.forEach(([k,label])=>{
      if(data[k]){
        box.append("div").attr("class","t-field").attr("style","margin-top:6px;")
          .html(`<strong>${label}:</strong> ${data[k]}`);
      }
    });
  }

  const pad = 12, vw = window.innerWidth, vh = window.innerHeight;
  const { x: cx, y: cy } = getClientPoint(ev);
  tt.style("visibility","visible").style("opacity",1);
  const tw = tt.node().offsetWidth, th = tt.node().offsetHeight;

  let x = cx + pad, y = cy - th - pad;
  if (y < pad) y = cy + pad;
  if (x + tw > vw - pad) x = cx - tw - pad;
  x = Math.max(pad, Math.min(x, vw - tw - pad));
  y = Math.max(pad, Math.min(y, vh - th - pad));
  tt.style("left", x + "px").style("top", y + "px");

  if (pin) ttPinned = true;
}

function hideTT(){
  ttPinned = false;
  tt.style("opacity",0).style("visibility","hidden");
}


document.addEventListener("click", () => {
  if (ttPinned) hideTT();
}, { capture: true });

// ---------- Hilfen ----------
function panelNote(svg, text){
  const vb = svg.node().viewBox.baseVal;
  svg.append("text").attr("x", vb.width/2).attr("y", 34)
    .attr("text-anchor","middle").attr("fill","#777").attr("font-size",12).text(text);
}

function curveFromCenter(cx, cy, x, y, swoop = 0.16){
  const mx = (cx + x)/2, my = (cy + y)/2, dx = x-cx, dy = y-cy;
  const nx = -dy * swoop, ny = dx * swoop;
  return `M${cx},${cy} Q${mx+nx},${my+ny} ${x},${y}`;
}

// ---------- Sunburst-ähnliche Panels ----------
function drawSun(svg, items, opts={}){
  const { width, height } = svg.node().viewBox.baseVal;
  const center = { x: width/2, y: height/2 + (opts.offsetY ?? 0) };
  const rNode = Math.min(width, height) * (opts.radiusFactor ?? 0.36);
  const lineColor = opts.stroke ?? "#4A90E2";
  const nodeColor = opts.nodeFill ?? lineColor;
  const normItems = items.map(it => typeof it === "string" ? ({ label: it, meta: null }) : it);
  const N = normItems.length;
  const step = (2*Math.PI)/(N || 1);
  const layout = normItems.map((it,i)=>{
    const a = -Math.PI/2 + i*step;
    const xNode = center.x + rNode*Math.cos(a);
    const yNode = center.y + rNode*Math.sin(a);
    return {name: it.label, meta: it.meta, a, xNode, yNode};
  });

  const gL = svg.append("g").attr("class","links");
  const gN = svg.append("g").attr("class","nodes");

  const linkSel = gL.selectAll("path").data(layout, d=>d.name).join("path")
    .attr("d", d=>curveFromCenter(center.x, center.y, d.xNode, d.yNode, opts.swoop ?? 0.16))
    .attr("fill","none").attr("stroke", lineColor).attr("stroke-opacity", .8).attr("stroke-width", 1.5);

  const nodeSel = gN.selectAll("circle").data(layout, d=>d.name).join("circle")
    .attr("cx",d=>d.xNode).attr("cy",d=>d.yNode)
    .attr("r", opts.nodeRadius ?? 6)
    .attr("fill", nodeColor)
    
    .on("mousemove", (ev,d)=> {
      if (!isCoarsePointer && !ttPinned) showTT(ev, d.name, "", d.meta || null);
    })
    .on("mouseleave", ()=> {
      if (!isCoarsePointer && !ttPinned) hideTT();
    })
    
    .on("click", function(ev, d){
      ev.stopPropagation();
      if (ttPinned) {
        hideTT();
      } else {
        showTT(ev, d.name, "", d.meta || null, { pin: true });
      }
    });

  svg.append("circle").attr("cx",center.x).attr("cy",center.y).attr("r",22).attr("fill","#000");

  function applyFilter(hiddenSet){
    linkSel.attr("display", d => hiddenSet.has(d.name) ? "none" : null);
    nodeSel.attr("display", d => hiddenSet.has(d.name) ? "none" : null);
  }
  return { applyFilter, labels: normItems.map(it=>it.label) };
}

// ---------- Radiale Hierarchie ----------
function drawRadialHierarchy(svg, root, opts={}){
  const vb = svg.node().viewBox.baseVal, width = vb.width, height = vb.height;
  const R = Math.min(width,height)/2 - 30;
  const cluster = d3.cluster().size([2*Math.PI, R]).separation((a,b)=>{
    const sameParent = a.parent === b.parent;
    if (sameParent && a.parent && a.parent.depth === 0) return 2.2;
    return sameParent ? 1.2 : 1.6;
  });

  cluster(root);

  const ring = {
    root:            R * (opts.rRoot            ?? 0.10),
    committee:       R * (opts.rCommittee       ?? 0.40),
    subcommittee:    R * (opts.rSubcommittee    ?? 0.66),
    subsubcommittee: R * (opts.rSubsubcommittee ?? 0.86),
    default:         R * (opts.rDefault         ?? 0.94)
  };
  function levelOf(d){
    return d.data.level || (d.depth===1 ? "committee"
                     : d.depth===2 ? "subcommittee"
                     : d.depth===3 ? "subsubcommittee" : "default");
  }
  function ringFor(d){ return ring[levelOf(d)] ?? ring.default; }

  root.each(d => { d.y = (d.depth===0) ? 0 : ringFor(d); });

  const chColor = ch => (opts.chColorMap && ch && opts.chColorMap.has(ch)) ? opts.chColorMap.get(ch) : "#9aa6b2";

  const g = svg.append("g").attr("transform", `translate(${width/2},${height/2 + (opts.offsetY ?? 0)})`);
  const link = d3.linkRadial().angle(d=>d.x).radius(d=>d.y);

  const linkSel = g.append("g").attr("class","links")
    .selectAll("path").data(root.links()).join("path")
    .attr("d", link).style("fill","none").style("stroke", d => chColor(d.target.data.chapter))
    .style("stroke-opacity", .9).style("stroke-width", 1.1);

  const nodeSel = g.append("g").attr("class","nodes")
    .selectAll("circle").data(root.descendants().filter(d=>d.depth > 0)).join("circle")
    .attr("transform", d=>`rotate(${(d.x*180/Math.PI - 90)}) translate(${d.y},0)`)
    .attr("r", d=>{
      const lvl = levelOf(d);
      if (lvl==="committee") return 7;
      if (lvl==="subcommittee") return 3.8;
      if (lvl==="subsubcommittee") return 3.2;
      return 2.8;
    })
    .style("fill", d => chColor(d.data.chapter))
    
    .on("mousemove",(ev,d)=> {
      if (!isCoarsePointer && !ttPinned) showTT(ev, d.data.name, "", d.data);
    })
    .on("mouseleave", ()=> {
      if (!isCoarsePointer && !ttPinned) hideTT();
    })
    
    .on("click", function(ev, d){
      ev.stopPropagation();
      if (ttPinned) {
        hideTT();
      } else {
        showTT(ev, d.data.name, "", d.data, { pin: true });
      }
    });

  g.append("circle").attr("cx", 6).attr("cy", 6).attr("r", 22).attr("fill", "#000");

  function applyFilter(hiddenSet){
    linkSel.attr("display", d => hiddenSet.has(d.target.data.chapter) ? "none" : null);
    nodeSel.attr("display", d => hiddenSet.has(d.data.chapter) ? "none" : null);
  }
  return { applyFilter };
}

// ---------- Legende ----------
function ensureLegendHost(svgSel){
  const svgNode = svgSel.node();
  const panel = svgNode.closest(".panel");
  if(!panel) return null;
  let host = panel.querySelector(":scope > .legend-host");
  if(!host){
    host = document.createElement("div");
    host.className = "legend-host";
    panel.insertBefore(host, svgNode);
  }
  return d3.select(host);
}

function createLegendDOM(hostSel, items, {
  colorFor = ()=>"#9aa6b2",
  startVisible = true,
  onFilterChange = ()=>{},
  fontSize = LEGEND_UI.fontSize
} = {}){
  if(!hostSel || !items || !items.length) return null;

  hostSel.html("");
  const wrap = hostSel.append("div")
    .attr("class","legend legend-dom")
    .style("font-size", fontSize + "px");

  const btnRow = wrap.append("div").attr("class","legend-btnrow");
  const hidden = startVisible ? new Set() : new Set(items);

  btnRow.append("button")
    .attr("class","legend-btn")
    .style("font-size", Math.max(12, fontSize - 2) + "px")
    .text("ALL")
    .on("click", ()=>{
      hidden.clear();
      wrap.selectAll("input[type=checkbox]").property("checked", true);
      onFilterChange(hidden);
      wrap.selectAll(".legend-item").classed("is-hidden", false);
    });

  btnRow.append("button")
    .attr("class","legend-btn")
    .style("font-size", Math.max(12, fontSize - 2) + "px")
    .text("RESET")
    .on("click", ()=>{
      hidden.clear(); items.forEach(it=>hidden.add(it));
      wrap.selectAll("input[type=checkbox]").property("checked", false);
      onFilterChange(hidden);
      wrap.selectAll(".legend-item").classed("is-hidden", true);
    });

  const list = wrap.append("div").attr("class","legend-grid");

  items.forEach(label=>{
    const row = list.append("label").attr("class","legend-item");
    row.append("input")
      .attr("type","checkbox")
      .property("checked", !hidden.has(label))
      .on("change", function(){
        if(this.checked) hidden.delete(label); else hidden.add(label);
        onFilterChange(hidden);
        row.classed("is-hidden", hidden.has(label));
      });

    row.append("span").attr("class","cb");
    row.append("span").attr("class","swatch").style("background-color", colorFor(label));
    row.append("span")
      .attr("class","label")
      .style("font-size", Math.max(12, fontSize - 2) + "px")
      .text(label);

    row.classed("is-hidden", hidden.has(label));
  });

  onFilterChange(hidden);
  return { getHidden: ()=>new Set(hidden) };
}

// ---------- Boot ----------
(async function(){
  document.getElementById("viz1")?.classList.add("large");
  document.getElementById("viz2")?.classList.add("large");

  const { rows, path, delim } = await loadAnyCSV(CSV_CANDIDATES);
  if(!rows.length){
    panelNote(d3.select("#viz1"), "Keine CSV geladen.");
    panelNote(d3.select("#viz2"), "Keine CSV geladen.");
    panelNote(d3.select("#viz3"), "Keine CSV geladen.");
    return;
  }

  const cols = Object.keys(rows[0]);
  const { id:idCol, parent:parentCol, name:nameCol, level:levelCol, part:partCol, chapter:chapterCol, chapterOrder:chapterOrderCol } = findCols(cols);
  const extraCols = findExtraCols(cols);

  if(!idCol || !parentCol){
    panelNote(d3.select("#viz1"), "Spalten node_id/parent_id fehlen.");
    panelNote(d3.select("#viz2"), "Spalten node_id/parent_id fehlen.");
    panelNote(d3.select("#viz3"), "Spalten node_id/parent_id fehlen.");
    console.warn("Headers:", cols);
    return;
  }

  const nodes = rows.map(r => ({
    id:       clean(r[idCol]),
    parent:   clean(r[parentCol]),
    name:     clean(nameCol ? r[nameCol] : r[idCol]),
    level:    normLevel(levelCol ? r[levelCol] : ""),
    part:     normPart(partCol ? r[partCol] : null),
    chapter:  normChapter(chapterCol ? r[chapterCol] : null),
    chapterOrder: chapterOrderCol ? +clean(r[chapterOrderCol]) : null,
    committee_type: extraCols.committeeType ? clean(r[extraCols.committeeType]) : null,
    creation:    extraCols.creation    ? clean(r[extraCols.creation])    : null,
    purpose:     extraCols.purpose     ? clean(r[extraCols.purpose])     : null,
    character:   extraCols.character   ? clean(r[extraCols.character])   : null,
    composition: extraCols.composition ? clean(r[extraCols.composition]) : null,
    appointment: extraCols.appointment ? clean(r[extraCols.appointment]) : null,
    secretariat: extraCols.secretariat ? clean(r[extraCols.secretariat]) : null,
    placeATC:    extraCols.placeATC    ? clean(r[extraCols.placeATC])    : null,
    organs:      extraCols.organs      ? clean(r[extraCols.organs])      : null,
    source:      extraCols.source      ? clean(r[extraCols.source])      : null,
    notes:       extraCols.notes       ? clean(r[extraCols.notes])       : null
  })).filter(n => n.id);

  const byId = new Map(nodes.map(n => [n.id, n]));

  function getEffectivePart(n){
    if(n._effPart !== undefined) return n._effPart;
    if(n.part) return (n._effPart = n.part);
    const p = n.parent && byId.get(n.parent);
    return (n._effPart = p ? getEffectivePart(p) : null);
  }
  function getEffectiveChapter(n){
    if(n._effChap !== undefined) return n._effChap;
    if(n.chapter) return (n._effChap = n.chapter);
    const p = n.parent && byId.get(n.parent);
    return (n._effChap = p ? getEffectiveChapter(p) : null);
  }
  nodes.forEach(getEffectivePart);
  nodes.forEach(getEffectiveChapter);

  const committeesI_nodes  = nodes.filter(n => getEffectivePart(n)==="I"  && n.level==="committee");
  const committeesII_nodes = nodes.filter(n => getEffectivePart(n)==="II" && n.level==="committee");

  const uniqueByName = (arr)=> {
    const m = new Map();
    for(const n of arr){ if(!m.has(n.name)) m.set(n.name, n); }
    return [...m.values()];
  };
  const committeesI_unique  = uniqueByName(committeesI_nodes);
  const committeesII_unique = uniqueByName(committeesII_nodes);

  const toMeta = n => ({
    committee_type: n.committee_type || null,
    creation: n.creation || null,
    purpose: n.purpose || null,
    character: n.character || null,
    composition: n.composition || null,
    appointment: n.appointment || null,
    secretariat: n.secretariat || null,
    placeATC: n.placeATC || null,
    organs: n.organs || null,
    source: n.source || null,
    notes: n.notes || null
  });

  const itemsI  = committeesI_unique.map(n => ({ label: n.name, meta: toMeta(n) }));
  const itemsII = committeesII_unique.map(n => ({ label: n.name, meta: toMeta(n) }));

  const subsetIII = nodes.filter(n => getEffectivePart(n)==="III");
  const work = subsetIII.length ? subsetIII : nodes;
  const idsIII = new Set(work.map(n=>n.id));

  const chaptersIII = (() => {
    const out = [], seen = new Set();
    for (const n of work) {
      const ch = n._effChap;
      if (ch && !seen.has(ch)) { seen.add(ch); out.push(ch); }
    }
    return out;
  })();

  if (chapterOrderCol) {
    const orderByChapter = new Map();
    for (const n of work) {
      if (n._effChap && Number.isFinite(n.chapterOrder)) {
        const cur = orderByChapter.get(n._effChap);
        if (cur === undefined || n.chapterOrder < cur) orderByChapter.set(n._effChap, n.chapterOrder);
      }
    }
    if (orderByChapter.size) {
      chaptersIII.sort((a,b) =>
        (orderByChapter.get(a) ?? Number.POSITIVE_INFINITY) -
        (orderByChapter.get(b) ?? Number.POSITIVE_INFINITY)
      );
    }
  }

  const CHAPTER_PALETTE = [
    "#4A90E2","#2E7D32","#F5A623","#D0021B","#7B1FA2","#009688",
    "#8D6E63","#455A64","#C2185B","#7CB342","#F57C00","#5D4037"
  ];
  const chColorMap = new Map(chaptersIII.map((ch,i)=> [ch, CHAPTER_PALETTE[i % CHAPTER_PALETTE.length]]));

  const stratRows = work.map(n => ({
    id: n.id,
    parentId: n.parent && idsIII.has(n.parent) ? n.parent : "__ROOT__",
    name: n.name,
    level: n.level,
    chapter: n._effChap || null,
    committee_type: n.committee_type || null,
    creation: n.creation || null,
    purpose: n.purpose || null,
    character: n.character || null,
    composition: n.composition || null,
    appointment: n.appointment || null,
    secretariat: n.secretariat || null,
    placeATC: n.placeATC || null,
    organs: n.organs || null,
    source: n.source || null,
    notes: n.notes || null
  }));
  stratRows.push({ id: "__ROOT__", parentId: "", name: "Part III", level: "root", chapter: null });

  const root = d3.stratify().id(d=>d.id).parentId(d=>d.parentId)(stratRows);
  root.each(d => {
    d.data = {
      name: d.data.name,
      level: d.data.level,
      chapter: d.data.chapter,
      committee_type: d.data.committee_type,
      creation: d.data.creation,
      purpose: d.data.purpose,
      character: d.data.character,
      composition: d.data.composition,
      appointment: d.data.appointment,
      secretariat: d.data.secretariat,
      placeATC: d.data.placeATC,
      organs: d.data.organs,
      source: d.data.source,
      notes: d.data.notes
    };
  });

  const apiI = drawSun(d3.select("#viz1"), itemsI, {
    radiusFactor: .50,
    pathTitle:"Part I",
    stroke:"#4A90E2",
    nodeFill:"#4A90E2",
    nodeRadius: 16,
    offsetY: VIZ_VERTICAL_TWEAK.sun,
    swoop: 0.16
  });
  const apiII = drawSun(d3.select("#viz2"), itemsII, {
    radiusFactor: .52,
    pathTitle:"Part II",
    stroke:"#7ED321",
    nodeFill:"#7ED321",
    nodeRadius: 16,
    offsetY: VIZ_VERTICAL_TWEAK.sun,
    swoop: 0.16
  });
  const apiIII = drawRadialHierarchy(d3.select("#viz3"), root, {
    rRoot: 0.10, rCommittee: 0.40, rSubcommittee: 0.66, rSubsubcommittee: 0.86,
    chColorMap,
    offsetY: VIZ_VERTICAL_TWEAK.hier
  });

  createLegendDOM(ensureLegendHost(d3.select("#viz1")), apiI.labels, {
    colorFor: ()=>"#4A90E2",
    startVisible: false,
    onFilterChange: hidden => apiI.applyFilter(hidden),
    fontSize: LEGEND_UI.fontSize
  });
  createLegendDOM(ensureLegendHost(d3.select("#viz2")), apiII.labels, {
    colorFor: ()=>"#7ED321",
    startVisible: false,
    onFilterChange: hidden => apiII.applyFilter(hidden),
    fontSize: LEGEND_UI.fontSize
  });
  createLegendDOM(ensureLegendHost(d3.select("#viz3")), Array.from(chColorMap.keys()), {
    colorFor: ch => chColorMap.get(ch) ?? "#9aa6b2",
    startVisible: false,
    onFilterChange: hidden => apiIII.applyFilter(hidden),
    fontSize: LEGEND_UI.fontSize
  });

  console.log({ loaded_from: path, delimiter: delim, headers: cols });
})();
