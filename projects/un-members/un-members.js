d3.csv("./un-members.csv").then(data => {
  data.forEach(d => {
    d.year = +d["end of year"];
    d.developed = +d["developed market economies"];
    d.socialist = +d["socialist countries"];
    d.developing = +d["developing countries"];
    d.dev_plus = +d["dev_plus"] || 0;
    d.soc_plus = +d["soc_plus"] || 0;
    d.de_plus = +d["de_plus"] || 0;
    d.dev_percent = +d["dev_percent"] || 0;
    d.soc_percent = +d["soc_percent"] || 0;
    d.de_percent = +d["de_percent"] || 0;
    d.dev_tool = d["dev_tool"];
    d.soc_tool = d["soc_tool"];
    d.de_tool = d["de_tool"];
  });

  const svg = d3.select("#chart");
  const width = 1000;
  const height = 600;
  const radius = Math.min(width, height) / 2;

  const arcGroup = svg.append("g")
    .attr("transform", `translate(${width / 2}, ${height - 100})`);

  const totalMax = d3.max(data, d => d.developed + d.socialist + d.developing);

  const color = {
    developed: "#1f77b4",
    socialist: "#d62728",
    developing: "#2ca02c",
    remaining: "#eeeeee"
  };

  const displayLabel = {
    developed: "Developed market economies",
    socialist: "Socialist countries",
    developing: "Developing countries"
  };

  const labelKey = {
    developed: { count: "dev_plus", percent: "dev_percent", tooltip: "dev_tool" },
    socialist: { count: "soc_plus", percent: "soc_percent", tooltip: "soc_tool" },
    developing: { count: "de_plus", percent: "de_percent", tooltip: "de_tool" }
  };

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("display", "none");

  function drawChart(yearObj) {
    arcGroup.selectAll("path").remove();
    arcGroup.selectAll("text").remove();

    const keys = ["developed", "socialist", "developing"];
    const angles = [];
    let startAngle = 0;

    keys.forEach(key => {
      const value = yearObj[key];
      const angle = (value / totalMax) * Math.PI;
      angles.push({
        key,
        value,
        plus: yearObj[labelKey[key].count],
        percent: yearObj[labelKey[key].percent],
        tooltip: yearObj[labelKey[key].tooltip],
        start: startAngle,
        end: startAngle + angle
      });
      startAngle += angle;
    });

    if (startAngle < Math.PI) {
      angles.push({ key: "remaining", start: startAngle, end: Math.PI });
    }

    const arcGenerator = d3.arc()
      .innerRadius(radius - 100)
      .outerRadius(radius)
      .startAngle(d => d.start - Math.PI / 2)
      .endAngle(d => d.end - Math.PI / 2);

    arcGroup.selectAll("path")
      .data(angles)
      .enter()
      .append("path")
      .attr("d", arcGenerator)
      .attr("fill", d => color[d.key] || "#eee")
      .attr("stroke", "white")
      .on("mouseover", function (event, d) {
        if (d.key === "remaining") return;
      
        tooltip.style("display", "block")
          .html(`
            <div class="tooltip-header">${displayLabel[d.key]} | ${yearObj.year}</div>
            <div class="tooltip-sub">Total countries: <span class="tooltip-value">${d.value}</span></div>
            <div class="tooltip-sub">Increase: <span class="tooltip-value">+${d.plus}</span></div>
            <div class="tooltip-note-label">Note from the 1978 Report:</div>
            <div class="tooltip-note">${d.tooltip || ""}</div>
          `);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", (event.pageX + 12) + "px")
               .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function () {
        tooltip.style("display", "none");
      });

    arcGroup.selectAll(".outer-label")
      .data(angles.filter(d => d.key !== "remaining"))
      .enter()
      .append("text")
      .attr("transform", d => {
        const arc = d3.arc().innerRadius(radius + 20).outerRadius(radius + 20)
          .startAngle((d.start + d.end) / 2 - Math.PI / 2)
          .endAngle((d.start + d.end) / 2 - Math.PI / 2);
        return `translate(${arc.centroid(d)})`;
      })
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .style("fill", "black")
      .text(d => `${Math.round(d.percent)}%`);

    const totalCountries = yearObj.developed + yearObj.socialist + yearObj.developing;
    d3.select("#total-count").html(`Total UN Member States in ${yearObj.year}: <strong>${totalCountries}</strong>`);
  }

  function drawLegend() {
    const legendData = [
      { label: "Developed market economies", color: color.developed },
      { label: "Socialist countries", color: color.socialist },
      { label: "Developing countries", color: color.developing }
    ];

    const container = d3.select("#legend");
    container.selectAll("*").remove();

    const items = container.selectAll(".legend-item")
      .data(legendData)
      .enter()
      .append("div")
      .attr("class", "legend-item");

    items.append("div")
      .attr("class", "legend-color")
      .style("background-color", d => d.color);

    items.append("div")
      .text(d => d.label);
  }

  function renderButtons() {
    const container = d3.select("#year-buttons");
    data.forEach((d, i) => {
      container.append("button")
        .text(d.year)
        .attr("class", i === 0 ? "active" : "")
        .on("click", function () {
          d3.selectAll("#year-buttons button").classed("active", false);
          d3.select(this).classed("active", true);
          drawChart(d);
        });
    });


    drawChart(data[0]);
    drawLegend();
  }

  renderButtons();
});



// === Zweite Visualisierung: Zoom in auf Developing Countries ===
d3.csv("./un-members--zoom.csv").then(dataZoom => {
  dataZoom.forEach(d => {
    d.year = +d["end of year"];

    d.we = +d["Western Hemisphere"] || 0;
    d.af = +d["Africa"] || 0;
    d.wa = +d["West Asia"] || 0;
    d.sa = +d["South and Southeast Asia"] || 0;

    d.we_plus = +d["we_plus"] || 0;
    d.af_plus = +d["af_plus"] || 0;
    d.wa_plus = +d["wa_plus"] || 0;
    d.sa_plus = +d["sa_plus"] || 0;

    d.we_percent = +d["we_percent"] || 0;
    d.af_percent = +d["af_percent"] || 0;
    d.wa_percent = +d["wa_percent"] || 0;
    d.sa_percent = +d["sa_percent"] || 0;

    d.we_tool = d["we_tool"];
    d.af_tool = d["af_tool"];
    d.wa_tool = d["wa_tool"];
    d.sa_tool = d["sa_tool"];
  });

  const svg = d3.select("#chart-zoom");
  const width = 1000;
  const height = 600;
  const radius = Math.min(width, height) / 2;

  const arcGroup = svg.append("g")
    .attr("transform", `translate(${width / 2}, ${height - 100})`);

  const totalMax = d3.max(dataZoom, d => d.we + d.af + d.wa + d.sa);

  const color = {
    we: "#d9f0d3",
    af: "#a1d99b",
    wa: "#41ab5d",
    sa: "#006d2c",
    remaining: "#eeeeee"
  };

  const displayLabel = {
    we: "Western Hemisphere",
    af: "Africa",
    wa: "West Asia",
    sa: "South and Southeast Asia"
  };

  const labelKey = {
    we: { count: "we_plus", percent: "we_percent", tooltip: "we_tool" },
    af: { count: "af_plus", percent: "af_percent", tooltip: "af_tool" },
    wa: { count: "wa_plus", percent: "wa_percent", tooltip: "wa_tool" },
    sa: { count: "sa_plus", percent: "sa_percent", tooltip: "sa_tool" }
  };

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("display", "none");

  function drawChartZoom(yearObj) {
    arcGroup.selectAll("path").remove();
    arcGroup.selectAll("text").remove();

    const keys = ["we", "af", "wa", "sa"];
    const angles = [];
    let startAngle = 0;

    keys.forEach(key => {
      const value = yearObj[key];
      const angle = (value / totalMax) * Math.PI;
      angles.push({
        key,
        value,
        plus: yearObj[labelKey[key].count],
        percent: yearObj[labelKey[key].percent],
        tooltip: yearObj[labelKey[key].tooltip],
        year: yearObj.year,
        start: startAngle,
        end: startAngle + angle
      });
      startAngle += angle;
    });

    if (startAngle < Math.PI) {
      angles.push({ key: "remaining", start: startAngle, end: Math.PI });
    }

    const arcGenerator = d3.arc()
      .innerRadius(radius - 100)
      .outerRadius(radius)
      .startAngle(d => d.start - Math.PI / 2)
      .endAngle(d => d.end - Math.PI / 2);

    arcGroup.selectAll("path")
      .data(angles)
      .enter()
      .append("path")
      .attr("d", arcGenerator)
      .attr("fill", d => color[d.key] || "#eee")
      .attr("stroke", "white")
      .on("mouseover", function (event, d) {
        if (d.key === "remaining") return;

        tooltip.style("display", "block")
          .html(`
            <div class="tooltip-header">${displayLabel[d.key]} | ${d.year}</div>
            <div class="tooltip-sub">Total countries: <span class="tooltip-value">${d.value}</span></div>
            <div class="tooltip-sub">Increase: <span class="tooltip-value">+${d.plus}</span></div>
            <div class="tooltip-note-label">Note from the 1978 Report:</div>
            <div class="tooltip-note">${d.tooltip || ""}</div>
          `);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", (event.pageX + 12) + "px")
               .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function () {
        tooltip.style("display", "none");
      });

    arcGroup.selectAll(".outer-label")
      .data(angles.filter(d => d.key !== "remaining"))
      .enter()
      .append("text")
      .attr("transform", d => {
        const arc = d3.arc().innerRadius(radius + 20).outerRadius(radius + 20)
          .startAngle((d.start + d.end) / 2 - Math.PI / 2)
          .endAngle((d.start + d.end) / 2 - Math.PI / 2);
        return `translate(${arc.centroid(d)})`;
      })
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .style("fill", "black")
      .text(d => `${Math.round(d.percent)}%`);

    const total = yearObj.we + yearObj.af + yearObj.wa + yearObj.sa;
    d3.select("#total-count-zoom").html(`Total Developing Countries in ${yearObj.year}: <strong>${total}</strong>`);

  }

  function drawLegendZoom() {
    const legendData = [
      { label: "Western Hemisphere", color: color.we },
      { label: "Africa", color: color.af },
      { label: "West Asia", color: color.wa },
      { label: "South and Southeast Asia", color: color.sa }
    ];

    const container = d3.select("#legend-zoom");
    container.selectAll("*").remove();

    const items = container.selectAll(".legend-item")
      .data(legendData)
      .enter()
      .append("div")
      .attr("class", "legend-item");

    items.append("div")
      .attr("class", "legend-color")
      .style("background-color", d => d.color);

    items.append("div")
      .text(d => d.label);
  }

  function renderButtonsZoom() {
    const container = d3.select("#year-buttons-zoom");
    dataZoom.forEach((d, i) => {
      container.append("button")
        .text(d.year)
        .attr("class", i === 0 ? "active" : "")
        .on("click", function () {
          d3.selectAll("#year-buttons-zoom button").classed("active", false);
          d3.select(this).classed("active", true);
          drawChartZoom(d);
        });
    });

    drawChartZoom(dataZoom[0]);
    drawLegendZoom();
  }

  renderButtonsZoom();
});
