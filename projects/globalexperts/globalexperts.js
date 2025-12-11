const svg = d3.select("#viz");
const width = 1200;
const height = 900;

const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip")
  .style("opacity", 0);

const boxWidth = 120;
const boxHeight = 20;
const topY = 100;
const bottomY = 700;

const projection = d3.geoNaturalEarth1()
  .scale(width / 6.5)
  .translate([width / 2, height / 2]);

const path = d3.geoPath(projection);

Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
  d3.csv("./globalexperts.csv")
]).then(([worldData, people]) => {
  const land = topojson.feature(worldData, worldData.objects.countries).features
    .filter(d => d.id !== "010");

  svg.append("g")
    .selectAll("path")
    .data(land)
    .enter().append("path")
    .attr("d", path)
    .attr("fill", "#eaeaea")
    .attr("stroke", "none");

  people.forEach(d => {
    d.latitude = +d.latitude;
    d.longitude = +d.longitude;
    d.box_pos = +d["box-pos"];
    d.city_clean = d.city?.trim().toLowerCase();
  });

  const topGroup = people.filter(d => d.box_pos < 47);
  const bottomGroup = people.filter(d => d.box_pos >= 47);
  const maxCount = Math.max(topGroup.length, bottomGroup.length);
  const spacing = (width - 120) / maxCount;
  const topOffset = (width - (topGroup.length - 1) * spacing) / 2;
  const bottomOffset = (width - (bottomGroup.length - 1) * spacing) / 2;

  const lineGroup = svg.append("g");
  const boxGroup = svg.append("g");
  const dotGroup = svg.append("g");

  const sortedPeople = people.sort((a, b) => a.box_pos - b.box_pos);

  sortedPeople.forEach(d => {
    const showOnly = d["show only"]?.trim().toLowerCase();
    const [mapX, mapY] = projection([d.longitude, d.latitude]);
    const isBottom = d.box_pos >= 47;
    const rowIndex = isBottom ? d.box_pos - 47 : d.box_pos - 1;
    const dx = (isBottom ? bottomOffset : topOffset) + rowIndex * spacing;
    const dy = isBottom ? bottomY : topY;
    const rotation = isBottom ? 90 : -90;
    const personId = "id-" + d.name.replace(/\s+/g, "_");
    const cityClass = "city-" + d.city_clean.replace(/\s+/g, "_");

    const lineTargetX = dx;
    const lineTargetY = dy + (isBottom ? -boxWidth / 2 : boxWidth / 2);

    const line = lineGroup.append("path")
      .attr("fill", "none")
      .attr("stroke", "#aaa")
      .attr("stroke-width", 0.6)
      .attr("opacity", 0.4)
      .attr("class", `line ${cityClass} ${personId}`)
      .attr("d", d3.linkVertical().x(p => p.x).y(p => p.y)({
        source: { x: mapX, y: mapY },
        target: { x: lineTargetX, y: lineTargetY }
      }));
    line.node().__data__ = d;

    const g = boxGroup.append("g")
      .attr("transform", `translate(${dx},${dy}) rotate(${rotation})`)
      .on("mouseover", function(event) {
        showTooltipPerson(event, d, personId);
        d3.select(this).select("rect")
          .attr("fill", showOnly === "eminent persons" ? "#f9d08e"
                      : showOnly === "experts" ? "#c3ee94"
                      : "white");
      })
      .on("mouseout", function() {
        hideTooltipPerson(personId);
        d3.select(this).select("rect")
          .attr("fill", showOnly === "eminent persons" ? "#fff8f0"
                      : showOnly === "experts" ? "#f6fff0"
                      : "white");
      });
    g.node().__data__ = d;

    g.append("rect")
      .attr("x", -boxWidth / 2)
      .attr("y", -boxHeight / 2)
      .attr("width", boxWidth)
      .attr("height", boxHeight)
      .attr("rx", 3)
      .attr("fill", showOnly === "eminent persons" ? "#fff8f0"
                : showOnly === "experts" ? "#f6fff0"
                : "white")
      .attr("stroke", showOnly === "eminent persons" ? "#F5A623"
                  : showOnly === "experts" ? "#7ED321"
                  : "#ccc")
      .attr("stroke-width", 1);

    g.append("text")
      .attr("x", 0).attr("y", 3)
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .text(d.name);
  });

  const cityMap = d3.group(people, d => d.city_clean);
  cityMap.forEach((peopleInCity, city_clean) => {
    const first = peopleInCity[0];
    const [mapX, mapY] = projection([first.longitude, first.latitude]);

    dotGroup.append("circle")
      .attr("cx", mapX).attr("cy", mapY)
      .attr("r", 3)
      .attr("fill", "red")
      .attr("opacity", 1)
      .attr("data-city", city_clean)
      .on("mouseover", event => showTooltipCity(event, city_clean))
      .on("mouseout", () => hideTooltipCity(city_clean));
  });

  function showTooltipCity(event, city_clean) {
    const person = people.find(p => p.city_clean === city_clean);
    const cityClass = "city-" + city_clean.replace(/\s+/g, "_");

    tooltip.transition().duration(100).style("opacity", 1);
    tooltip.html(`<strong>${person.location}</strong>`)
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 28) + "px");

    d3.selectAll(`.${cityClass}`)
      .raise()
      .attr("opacity", 1)
      .attr("stroke", "red");
  }

  function hideTooltipCity(city_clean) {
    const cityClass = "city-" + city_clean.replace(/\s+/g, "_");
    tooltip.transition().duration(150).style("opacity", 0);
    d3.selectAll(`.${cityClass}`)
      .attr("stroke-width", 0.6)
      .attr("opacity", 0.4)
      .attr("stroke", "#aaa");
  }

  function showTooltipPerson(event, d, personId) {
    tooltip.transition().duration(100).style("opacity", 1);
      tooltip.html(`<strong>${d.first_name} ${d.name}</strong>
        <span style="color:red; font-weight:500">${d.type}</span> | ${d.location}<br/><br>
        ${d.description}`
)

    .style("left", (event.pageX + 10) + "px")
    .style("top", (event.pageY - 28) + "px");

    d3.selectAll("." + personId)
      .raise()
      .attr("opacity", 1)
      .attr("stroke", "red");
  }

  function hideTooltipPerson(personId) {
    tooltip.transition().duration(150).style("opacity", 0);
    d3.selectAll("." + personId)
      .attr("stroke-width", 0.6)
      .attr("opacity", 0.4)
      .attr("stroke", "#aaa");
  }

  // === FILTER BUTTONS ===
  const filterFields = ["show only", "gender", "type"];
  const activeFilters = {};
  const uniqueValues = {};
  const container = d3.select("#filter-container");

  const filterBlock = container.append("div")
    .attr("class", "filter-block");

  const resetRow = filterBlock.append("div").attr("class", "filter-row");

  resetRow.append("div")
    .attr("class", "filter-label")
    .text("");

  resetRow.append("button")
    .attr("class", "filter-button reset")
    .text("Reset all")
    .on("click", () => {
      d3.selectAll(".filter-button").classed("active", false);
      filterFields.forEach(field => activeFilters[field].clear());
      applyFilters();
    });

  // === RESULTS COUNTER ===
  const resultsCount = resetRow.append("span")
    .attr("class", "results-count")
    .style("margin-left", "16px")
    .style("font-size", "13px")
    .html('Results: <span style="color:red" id="results-number">' + people.length + '</span>');


  filterFields.forEach(field => {
    uniqueValues[field] = Array.from(new Set(people.map(d => d[field]))).filter(Boolean);
    activeFilters[field] = new Set();

    const row = filterBlock.append("div").attr("class", "filter-row");

    row.append("div")
      .attr("class", "filter-label")
      .text(field.charAt(0).toUpperCase() + field.slice(1));

    uniqueValues[field].forEach(value => {
      row.append("button")
        .attr("class", "filter-button")
        .attr("data-field", field)
        .attr("data-value", value)
        .text(value)
        .on("click", function () {
          const isActive = activeFilters[field].has(value);
          if (isActive) {
            activeFilters[field].delete(value);
            this.classList.remove("active");
          } else {
            activeFilters[field].add(value);
            this.classList.add("active");
          }
          applyFilters();
        });
    });
  });

  function applyFilters() {
    const isMatch = d =>
      filterFields.every(field =>
        activeFilters[field].size === 0 || activeFilters[field].has(d[field])
      );

    boxGroup.selectAll("g")
      .style("display", d => isMatch(d) ? null : "none");

    lineGroup.selectAll("path")
      .each(function(d) {
        const bound = this.__data__;
        d3.select(this).style("display", isMatch(bound) ? null : "none");
      });

    dotGroup.selectAll("circle")
      .style("display", function () {
        const city_clean = d3.select(this).attr("data-city");
        const peopleInCity = people.filter(p => p.city_clean === city_clean);
        return peopleInCity.some(isMatch) ? null : "none";
      });

    const visibleCount = people.filter(isMatch).length;
    d3.select("#results-number").text(visibleCount);
  }
});

