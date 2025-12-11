const svg = d3.select("#chart");
const margin = { top: 30, right: 30, bottom: 100, left: 60 };
const width = 1000 - margin.left - margin.right;
const height = 750 - margin.top - margin.bottom;

const chartArea = svg.append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const x = d3.scaleBand().padding(0.2).range([0, width]);
const y = d3.scaleLinear().range([height, 0]);

const xAxis = chartArea.append("g")
  .attr("transform", `translate(0,${height})`)
  .attr("class", "x-axis");

const yAxis = chartArea.append("g");

const yAxisLabel = chartArea.append("text")
  .attr("class", "y-axis-label")
  .attr("transform", "rotate(-90)")
  .attr("x", -height / 2)
  .attr("y", -50)
  .attr("text-anchor", "middle")
  .style("font-size", "14px")
  .text("Normalized frequency");

const tooltip = d3.select("body").append("div").attr("class", "tooltip");

let allData = [];
let allYears = [];
let currentActive = null;
let sortMode = "alpha";
let showAll = false;
let yearSortMode = "chronological";
let yMaxKeyword = 6000;

d3.csv("projects/wdr/wdr.csv").then(data => {
  data.forEach(d => {
    d.term = d.term.trim();
    d.year = +d.year;
    d.raw_frequency = +d.raw_frequency || 0;
    d.normalized = +d.normalized_frequency_per_million || 0;
  });

  allData = data;
  allYears = Array.from(new Set(data.map(d => d.year))).sort((a, b) => a - b);
  const keywords = Array.from(new Set(data.map(d => d.term)));

  yMaxKeyword = d3.max(allData, d => d.normalized);

  const freqMap = new Map();
  keywords.forEach(term => {
    const sum = d3.sum(data.filter(d => d.term === term), d => d.normalized);
    freqMap.set(term, sum);
  });

  function getTermsToRender() {
    return showAll ? keywords : keywords.filter(term => freqMap.get(term) > 0);
  }

  function renderButtons(termList) {
    const container = d3.select("#keyword-buttons");
    container.selectAll("*").remove();

    termList.forEach(term => {
      const sum = freqMap.get(term);
      const isZero = sum === 0;

      container.append("button")
        .attr("class", "keyword-button")
        .classed("inactive", isZero)
        .classed("active", term === currentActive)
        .text(term)
        .on("click", () => {
          updateChart(term);
          updateActiveButton(term);
        });
    });
  }

  function updateActiveButton(term) {
    currentActive = term;
    d3.selectAll(".keyword-button").classed("active", function () {
      return this.textContent === term;
    });
  }

  function sortKeywords(mode) {
    let sorted = (mode === "alpha")
      ? getTermsToRender().slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      : getTermsToRender().slice().sort((a, b) => d3.descending(freqMap.get(a), freqMap.get(b)));

    renderButtons(sorted);
    updateActiveButton(currentActive);
  }

  d3.selectAll(".sort-button").on("click", function () {
    const mode = d3.select(this).attr("data-sort");
    if (!mode) return;
    sortMode = mode;
    d3.selectAll(".sort-button").classed("active", false);
    d3.select(this).classed("active", true);
    sortKeywords(sortMode);
  });

  d3.select("#toggleHidden").on("click", function () {
    showAll = !showAll;
    d3.select(this).text(
      showAll ? "Hide zero-frequency search terms" : "Show zero-frequency search terms"
    );
    sortKeywords(sortMode);
  });

  // Year sort buttons
  d3.select("#sort-chronological").on("click", function () {
    yearSortMode = "chronological";
    d3.selectAll(".sort-year-button").classed("active", false);
    d3.select(this).classed("active", true);
    updateChart(currentActive);
  });

  d3.select("#sort-frequency").on("click", function () {
    yearSortMode = "frequency";
    d3.selectAll(".sort-year-button").classed("active", false);
    d3.select(this).classed("active", true);
    updateChart(currentActive);
  });

  currentActive = keywords.find(term => freqMap.get(term) > 0) || keywords[0];
  d3.select(".sort-button[data-sort='alpha']").classed("active", true);
  d3.select("#sort-chronological").classed("active", true);

  sortKeywords(sortMode);
  updateChart(currentActive);

  function updateChart(selectedTerm) {
    const rawFiltered = allData.filter(d => d.term === selectedTerm);
    let filtered = allYears.map(year => {
      const match = rawFiltered.find(d => d.year === year);
      return match || { term: selectedTerm, year: year, normalized: 0, raw_frequency: 0 };
    });

    if (yearSortMode === "frequency") {
      filtered.sort((a, b) => d3.descending(a.normalized, b.normalized));
    }

    const filteredNonZero = filtered.filter(d => d.normalized > 0);
    const maxValue = d3.max(filteredNonZero, d => d.normalized);

    x.domain(filtered.map(d => d.year));
    y.domain([0, yMaxKeyword]);
    yAxisLabel.text("Normalized frequency");

    xAxis.transition().duration(500)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");

    yAxis.transition().duration(500).call(d3.axisLeft(y));

    const bars = chartArea.selectAll(".bar")
      .data(filteredNonZero, d => d.year);

    const minBarHeight = 3;
    chartArea.selectAll(".bar").classed("bar-max", false);

    bars.enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.year))
      .attr("width", x.bandwidth())
      .attr("y", height)
      .attr("height", 0)
      .style("fill", "#37b645")
      .on("mouseover", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${d.year}</strong><br/>
            ${d.term}<br/>
            Normalized: ${d.normalized.toFixed(1)}<br/>
            Raw: ${d.raw_frequency}
          `)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 40) + "px");
      })
      .on("mouseout", () => tooltip.style("opacity", 0))
      .transition().duration(600)
      .attr("y", d => {
        const barHeight = height - y(d.normalized);
        return y(d.normalized) - (barHeight < minBarHeight ? (minBarHeight - barHeight) : 0);
      })
      .attr("height", d => {
        const barHeight = height - y(d.normalized);
        return barHeight < minBarHeight ? minBarHeight : barHeight;
      });

    bars.transition().duration(600)
      .attr("x", d => x(d.year))
      .attr("width", x.bandwidth())
      .attr("y", d => {
        const barHeight = height - y(d.normalized);
        return y(d.normalized) - (barHeight < minBarHeight ? (minBarHeight - barHeight) : 0);
      })
      .attr("height", d => {
        const barHeight = height - y(d.normalized);
        return barHeight < minBarHeight ? minBarHeight : barHeight;
      })
      .style("fill", "#37b645");

    chartArea.selectAll(".bar")
      .filter(d => d && d.normalized === maxValue)
      .classed("bar-max", true);

    bars.exit().transition().duration(300)
      .attr("y", height)
      .attr("height", 0)
      .remove();
  }
});
