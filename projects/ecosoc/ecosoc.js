/* ---------- Grund-Setup ---------- */
const width  = 900,
      height = 700,
      center = { x: width / 2, y: height / 2 },
      radius = 240;

const svg = d3.select("#ecosocViz").attr("viewBox", [0, 0, width, height]);

const linkLayer  = svg.append("g").attr("id", "linkLayer");
const nodeLayer  = svg.append("g").attr("id", "nodeLayer");
const labelLayer = svg.append("g").attr("id", "labelLayer");
const logoLayer  = svg.append("g").attr("id", "logoLayer");
const legendLayer = svg.append("g")
  .attr("id", "legendLayer")
  .attr("transform", `translate(${center.x - 280}, ${height - 40})`);

const colorScale = d3.scaleOrdinal()
  .domain(["Functional Commission", "Regional Commission", "Standing Committee", "Expert Bodies"])
  .range(["#4A90E2", "#7ED321", "#F5A623", "#BD10E0"]);

const tooltip = d3.select("#tooltip");
let currentYear = 0;
let timer = null;

const clean = str => (str || "").normalize("NFC").replace(/\s+/g, " ").trim();

/* ---------- Daten laden ---------- */
d3.csv("./ecosoc.csv").then(raw => {
  raw.forEach(d => {
    d.StartYear = +d.StartYear;
    d.EndYear   = d.EndYear ? +d.EndYear : Infinity;
  });

  const firstYear = new Map();
  raw.forEach(d => {
    const c = clean(d.Name);
    if (!firstYear.has(c) || firstYear.get(c) > d.StartYear) firstYear.set(c, d.StartYear);
  });

  let years = [...new Set(raw.flatMap(d => [d.StartYear, d.EndYear].filter(y => y && y !== Infinity)))];
  if (!years.includes(2006)) years.push(2006);
  years.sort((a, b) => a - b);

  d3.select("#yearButtons").selectAll("button")
    .data(years).enter().append("button")
      .text(d => d)
      .on("click", (_, y) => { stopAuto(); currentYear = y; update(); setPlayPause(); });

  d3.select("#play" ).on("click", () => { startAuto(); setPlayPause("play");  });
  d3.select("#pause").on("click", () => { stopAuto(); setPlayPause("pause"); });
  d3.select("#reset").on("click", () => {
    stopAuto(); currentYear = 0; update(true); setPlayPause();
  });

  logoLayer.append("circle")
    .attr("cx", center.x).attr("cy", center.y).attr("r", 22)
    .attr("fill", "#0033a0");
  logoLayer.append("text")
    .attr("x", center.x).attr("y", center.y + 5)
    .attr("fill", "#fff").attr("font-size", 8).attr("text-anchor", "middle")
    .text("ECOSOC");

  function update(reset = false) {
    if (reset) {
      linkLayer.selectAll("*").remove();
      nodeLayer.selectAll("*").remove();
      labelLayer.selectAll("*").remove();
    }

    const visible = raw.filter(d => d.StartYear <= currentYear && d.EndYear >= currentYear);
    const angleStep = 2 * Math.PI / visible.length;

    const layout = visible.map((d, i) => {
      const angle = i * angleStep;
      return {
        raw: d,
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
        isNew: firstYear.get(clean(d.Name)) === currentYear,
        labelX: center.x + (radius + 32) * Math.cos(angle),
        labelY: center.y + (radius + 32) * Math.sin(angle)
      };
    });

    const linkSel = linkLayer.selectAll("path").data(layout, d => d.raw.Name);
    linkSel.exit().transition().duration(600).attr("stroke-opacity", 0).remove();
    linkSel.enter().append("path")
        .attr("fill", "none")
        .attr("stroke-width", 1.5).attr("stroke-opacity", 0.8)
      .merge(linkSel)
        .attr("stroke", d => colorScale(d.raw.Category))
        .transition().duration(800)
        .attr("d", d => curve(center, { x: d.x, y: d.y }));

    const nodeSel = nodeLayer.selectAll("circle").data(layout, d => d.raw.Name);
    nodeSel.exit().transition().duration(600).attr("r", 0).remove();
    nodeSel.enter().append("circle")
        .attr("cx", center.x).attr("cy", center.y).attr("r", 0)
        .attr("fill", d => colorScale(d.raw.Category))
        .on("mouseover", (event, d) => {
          const name = d.raw.Name || "";
          const category = d.raw.Category || "";
          const startYear = d.raw.StartYear || "–";
          const url = d.raw.URL ? d.raw.URL.trim() : "";
          const description = d.raw.Description || "";

          const html = `
            <div class="tooltip-title">${name}</div>
            <div class="tooltip-category">${category}</div>
            <div class="tooltip-year">Established: ${startYear}</div>
            <div class="tooltip-description">${description}</div>
            ${url ? `<div class="tooltip-link"><a href="${url}" target="_blank">More info</a></div>` : ""}
          `;

          tooltip.html(html)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 28) + "px")
            .style("visibility", "visible")
            .style("opacity", 1);
        })
        .on("mouseout", () => {
          tooltip
            .style("visibility", "hidden")
            .style("opacity", 0);
        })
      .merge(nodeSel)
        .transition().duration(800)
        .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", 6);

    labelLayer.selectAll("*").remove();
    const labelG = labelLayer.selectAll("g").data(layout, d => d.raw.Name)
      .enter().append("g")
        .attr("transform", d => `translate(${d.labelX},${d.labelY})`)
        .attr("opacity", 0);

    labelG.each(function(d) {
      const g = d3.select(this);
      const left = (d.x < center.x);
      let xOff = 0;

      if (d.isNew) {
        const bx = left ? -35 : 0;
        g.append("rect").attr("x", bx).attr("y", -9).attr("width", 30).attr("height", 14)
          .attr("fill", "#D0021B").attr("rx", 3).attr("ry", 3);
        g.append("text").attr("x", bx + 15).attr("y", 2)
          .attr("fill", "#fff").attr("font-size", 10).attr("text-anchor", "middle")
          .text("NEW");
        xOff = left ? -40 : 35;
      }

      const shortTxt = d.raw.Short_name || "";
      const short = g.append("text")
        .attr("x", xOff).attr("y", 2)
        .attr("fill", "#444").attr("font-size", 10)
        .attr("text-anchor", left ? "end" : "start")
        .text(shortTxt);

      if (currentYear === 2006 && shortTxt === "Human Rights (1946)") {
        const sw = short.node().getComputedTextLength();
        const off = 6;
        g.append("text")
          .attr("x", left ? xOff - sw - off : xOff + sw + off)
          .attr("y", 2)
          .attr("fill", "#D0021B")
          .attr("font-size", 12)
          .attr("font-weight", "bold")
          .attr("text-anchor", left ? "end" : "start")
          .text("Replaced by Human Rights Council - ");
      }
    });

    labelG.transition().duration(800).attr("opacity", 1);
    d3.selectAll("#yearButtons button").classed("active", y => y === currentYear);
  }

  update(true);

  function curve(a, b) {
    const dx = (b.x - a.x) * 0.5, dy = (b.y - a.y) * 0.5;
    const cx = a.x + dx + dy * 0.1, cy = a.y + dy - dx * 0.1;
    return `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
  }

  function startAuto() {
    stopAuto();
    if (currentYear === 0) currentYear = years[0];
    update();
    timer = d3.interval(() => {
      const next = years.find(y => y > currentYear);
      if (next) { currentYear = next; update(); }
      else      { stopAuto(); }
    }, 3500);
  }

  function stopAuto() { if (timer) { timer.stop(); timer = null; } }

  function setPlayPause(id) {
    d3.selectAll("#play,#pause").classed("active-playpause", false);
    if (id) d3.select(`#${id}`).classed("active-playpause", true);
  }

  legendLayer.selectAll("g").data(colorScale.domain()).enter()
    .append("g").attr("transform", (d,i) => `translate(${i * 140},0)`)
    .call(g => {
      g.append("circle").attr("r", 6).attr("cy", -2).attr("fill", d => colorScale(d));
      g.append("text").attr("x", 12).attr("y", 2).attr("font-size", 11)
        .attr("fill", "#333").text(d => d);
    });
});
