let APP_DATA = [];
let dataColumns = [
  { key: 'Production', label: 'Total Domestic Production', color: '#2E86AB', active: false },
  { key: 'Imports_Crude', label: 'Crude Oil Imports', color: '#A23B72', active: false },
  { key: 'Imports_Refined', label: 'Refined Oil Imports', color: '#F18F01', active: false },
  { key: 'New_Supply', label: 'Total New Supply', color: '#C73E1D', active: false }
];

let svg, g, xScale, yScale, lineGen;
let margin, width, height;
let resizeObserver;

d3.csv("USTotalProduction.csv").then(function(csvData) {
  APP_DATA = csvData.map(d => ({
    Year: +d.Year,
    Production: +d.Production,
    Imports_Crude: +d.Imports_Crude,
    Imports_Refined: +d.Imports_Refined,
    New_Supply: +d.New_Supply
  }));
  init();
});

function getChartDimensions() {
  const container = document.getElementById('chart');
  const styles = window.getComputedStyle(container);
  const padL = parseFloat(styles.paddingLeft) || 0;
  const padR = parseFloat(styles.paddingRight) || 0;
  const inner = Math.max(0, (container.clientWidth || 800) - padL - padR);
  const isMobile = window.innerWidth <= 700;
  return {
    margin: isMobile ? { top: 20, right: 20, bottom: 60, left: 60 }
                     : { top: 30, right: 40, bottom: 70, left: 80 },
    width: Math.max(320, inner),
    height: isMobile ? 320 : 440
  };
}

function init() {
  const dims = getChartDimensions();
  margin = dims.margin;
  width = dims.width - margin.left - margin.right;
  height = dims.height;

  svg = d3.select("#chart")
    .append("svg")
    .style("width", "100%")
    .style("height", "auto")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("rect")
    .attr("class", "plot-background")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#f5f5f5");

  const xDomain = d3.extent(APP_DATA, d => d.Year);
  const yMax = d3.max(APP_DATA, d => Math.max(d.Production, d.Imports_Crude, d.Imports_Refined, d.New_Supply));
  xScale = d3.scaleLinear().domain(xDomain).range([0, width]);
  yScale = d3.scaleLinear().domain([0, yMax]).range([height, 0]);

  lineGen = d3.line()
    .x(d => xScale(d.Year))
    .y(d => yScale(d.value))
    .curve(d3.curveMonotoneX);

  drawAxesAndGrid();
  drawSeries();
  createLegend();
  updateLegend();
  updateVisibility();
  clearActiveButtons();

  window.addEventListener('resize', handleResize);
  const chartEl = document.getElementById('chart');
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(chartEl);
  }
}

function drawAxesAndGrid() {
  const xTicks = xScale.ticks().slice(0, -1);
  const yTicks = yScale.ticks().slice(0, -1);

  const xGrid = d3.axisBottom(xScale).tickSize(-height).tickFormat("").tickSizeOuter(0).tickValues(xTicks);
  const yGrid = d3.axisLeft(yScale).tickSize(-width).tickFormat("").tickSizeOuter(0).tickValues(yTicks);

  g.append("g").attr("class", "grid").attr("transform", `translate(0,${height})`)
    .call(xGrid).selectAll("line").attr("class", "grid-line");
  g.append("g").attr("class", "grid")
    .call(yGrid).selectAll("line").attr("class", "grid-line");

  const xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d")).tickSizeOuter(0);
  const yAxis = d3.axisLeft(yScale).tickFormat(d => d3.format(".2s")(d)).tickSizeOuter(0);

  g.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`)
    .call(xAxis).select(".domain").remove();
  g.append("g").attr("class", "axis")
    .call(yAxis).select(".domain").remove();

  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .text("Thousand Barrels");

  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 15})`)
    .style("text-anchor", "middle")
    .text("Year");
}

function drawSeries() {
  const tooltip = d3.select("#tooltip");
  dataColumns.forEach(col => {
    const lineData = APP_DATA.map(d => ({ Year: d.Year, value: d[col.key] }));
    const grp = g.append("g").attr("class", `line-group-${col.key}`);

    grp.append("path")
      .datum(lineData)
      .attr("class", `line line-${col.key}`)
      .attr("d", lineGen)
      .style("stroke", col.color);

    grp.selectAll(`.dot-${col.key}`)
      .data(lineData)
      .enter()
      .append("circle")
      .attr("class", `dot dot-${col.key}`)
      .attr("cx", d => xScale(d.Year))
      .attr("cy", d => yScale(d.value))
      .attr("r", 4)
      .style("fill", col.color)
      .on("mouseover", function(event, d) {
        const chartRect = document.getElementById('chart').getBoundingClientRect();
        tooltip.style("opacity", 1)
          .html(`<strong>${col.label}</strong><br/>Year: ${d.Year}<br/>Value: ${d3.format(",")(d.value)} thousand barrels`)
          .style("left", (event.clientX - chartRect.left + 10) + "px")
          .style("top", (event.clientY - chartRect.top - 10) + "px");
      })
      .on("mouseout", function() {
        tooltip.style("opacity", 0);
      });
  });
}

function createLegend() {
  const legendGrid = d3.select("#legend-grid");
  legendGrid.selectAll(".legend-item")
    .data(dataColumns)
    .enter()
    .append("div")
    .attr("class", "legend-item")
    .on("click", function(event, d) {
      d.active = !d.active;
      updateVisibility();
      updateLegend();
    })
    .each(function(d) {
      const item = d3.select(this);
      item.append("div").attr("class", "legend-color").style("background-color", d.color);
      item.append("span").text(d.label);
    });
}

function updateLegend() {
  d3.selectAll(".legend-item").classed("inactive", d => !d.active);
}

function updateVisibility() {
  dataColumns.forEach(col => {
    const show = !!col.active;
    g.select(`.line-${col.key}`).style("display", show ? "block" : "none");
    g.selectAll(`.dot-${col.key}`).style("display", show ? "block" : "none");
  });
}

function handleResize() {
  const dims = getChartDimensions();
  margin = dims.margin;
  width = dims.width - margin.left - margin.right;
  height = dims.height;

  svg.attr("width", width + margin.left + margin.right)
     .attr("height", height + margin.top + margin.bottom);

  g.attr("transform", `translate(${margin.left},${margin.top})`).selectAll("*").remove();

  g.append("rect")
    .attr("class", "plot-background")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#f5f5f5");

  const xDomain = d3.extent(APP_DATA, d => d.Year);
  const yMax = d3.max(APP_DATA, d => Math.max(d.Production, d.Imports_Crude, d.Imports_Refined, d.New_Supply));

  xScale.range([0, width]).domain(xDomain);
  yScale.range([height, 0]).domain([0, yMax]);

  lineGen = d3.line()
    .x(d => xScale(d.Year))
    .y(d => yScale(d.value))
    .curve(d3.curveMonotoneX);

  drawAxesAndGrid();
  drawSeries();
  updateVisibility();
  updateLegend();
}

function clearActiveButtons() {
  document.querySelectorAll('.controls-top .control-btn, .controls .control-btn').forEach(b => b.classList.remove('active'));
}

function setActiveButton(el) {
  document.querySelectorAll('.controls-top .control-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
}

window.showAll = function() {
  dataColumns.forEach(c => c.active = true);
  updateVisibility();
  updateLegend();
  setActiveButton(document.querySelector('.controls-top .control-btn:nth-child(1)'));
};

window.hideAll = function() {
  dataColumns.forEach(c => c.active = false);
  updateVisibility();
  updateLegend();
  setActiveButton(document.querySelector('.controls-top .control-btn:nth-child(2)'));
};

window.showProductionOnly = function() {
  dataColumns.forEach(c => c.active = (c.key === 'Production'));
  updateVisibility();
  updateLegend();
  setActiveButton(document.querySelector('.controls-top .control-btn:nth-child(3)'));
};

window.showImportsOnly = function() {
  const importKeys = new Set(['Imports_Crude','Imports_Refined','New_Supply']);
  dataColumns.forEach(c => c.active = importKeys.has(c.key));
  updateVisibility();
  updateLegend();
  setActiveButton(document.querySelector('.controls-top .control-btn:nth-child(4)'));
};
