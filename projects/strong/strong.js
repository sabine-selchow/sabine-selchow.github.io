// === Grundeinstellungen ===
const totalPages = 385;


function getChapterInfo(page) {
  const chapters = [
    { name: "Intro", start: 1, end: 6 },
    { name: "Ch. 1", start: 7, end: 22 },
    { name: "Ch. 2", start: 23, end: 44 },
    { name: "Ch. 3", start: 45, end: 68 },
    { name: "Ch. 4", start: 69, end: 86 },
    { name: "Ch. 5", start: 87, end: 114 },
    { name: "Ch. 6", start: 115, end: 134 },
    { name: "Ch. 7", start: 135, end: 166 },
    { name: "Ch. 8", start: 167, end: 182 },
    { name: "Ch. 9", start: 183, end: 214 },
    { name: "Ch. 10", start: 215, end: 232 },
    { name: "Ch. 11", start: 233, end: 252 },
    { name: "Ch. 12", start: 253, end: 280 },
    { name: "Ch. 13", start: 281, end: 286 },
    { name: "Ch. 14", start: 287, end: 344 },
    { name: "Ch. 15", start: 345, end: 358 },
    { name: "Ch. 16", start: 359, end: 378 },
    { name: "Ch. 17", start: 379, end: 385 },
  ];

  for (const chapter of chapters) {
    if (page >= chapter.start && page <= chapter.end) {
      return {
        chapter: chapter.name,
        page,
        showLabel: page === chapter.start,
        isChapterStart: page === chapter.start
      };
    }
  }
  return { chapter: "", page, showLabel: false, isChapterStart: false };
}

d3.csv("./strong.csv").then(data => {
  data.forEach(d => {
    d.gender = d.gender ? d.gender.charAt(0).toUpperCase() + d.gender.slice(1).toLowerCase() : "";
  });

  const nationalities = Array.from(new Set(data.map(d => d.nationality))).sort();
  const roles = Array.from(new Set(data.map(d => d.role))).sort();
  const personNames = Array.from(new Set(data.map(d => `${d.family_name}, ${d.given_name}`))).sort();

  const mentionCounts = d3.rollup(data, v => new Set(v.map(d => d.page)).size, d => `${d.family_name}, ${d.given_name}`);
  const mentionPages = d3.rollup(data, v => Array.from(new Set(v.map(d => +d.page))).sort((a, b) => a - b), d => `${d.family_name}, ${d.given_name}`);

  nationalities.forEach(nat => d3.select("#nationalityFilter").append("option").attr("value", nat).text(nat));
  personNames.forEach(name => d3.select("#nameFilter").append("option").attr("value", name).text(name));

  roles.forEach(role => {
    d3.select("#roleFilterButtons").append("button")
      .attr("class", "role-button")
      .attr("data-role", role)
      .text(role)
      .on("click", function () {
        d3.select(this).classed("active", !d3.select(this).classed("active"));
        updateGrid();
      });
  });

  d3.select("#mentionFilter").on("change", updateGrid);

  const grid = d3.select("#grid");
  for (let page = 1; page <= totalPages; page++) {
    const info = getChapterInfo(page);
    const container = grid.append("div")
      .style("display", "flex")
      .style("flex-direction", "column")
      .style("align-items", "center");

    const labelDiv = container.append("div").attr("class", "page-number");
    if (info.showLabel) labelDiv.append("span").attr("class", "chapter-label").text(info.chapter);
    labelDiv.append("span").attr("class", "page-label").text(info.page);

    container.append("div")
      .attr("class", "page" + (info.isChapterStart ? " chapter-start" : ""))
      .attr("data-page", page);
  }

  function updateGrid() {
    const gender = d3.select("#genderFilter").property("value");
    const nat = d3.select("#nationalityFilter").property("value");
    const name = d3.select("#nameFilter").property("value");
    const mention = d3.select("#mentionFilter").property("value");
    const search = d3.select("#searchBox").property("value").toLowerCase();

    const activeRoles = [];
    d3.selectAll(".role-button.active").each(function () {
      activeRoles.push(d3.select(this).attr("data-role"));
    });

    d3.selectAll(".page").each(function () {
      const page = +d3.select(this).attr("data-page");

      const persons = data.filter(d => {
        const key = `${d.family_name}, ${d.given_name}`;
        const count = mentionCounts.get(key);
        return +d.page === page &&
          (gender === "All" || d.gender === gender) &&
          (nat === "All" || d.nationality === nat) &&
          (name === "All" || key === name) &&
          key.toLowerCase().includes(search) &&
          (mention === "All" || (mention === ">5" && count > 5) || (mention === ">10" && count > 10)) &&
          (activeRoles.length === 0 || activeRoles.includes(d.role));
      });

      const squares = d3.select(this).selectAll(".person-square")
        .data(persons, d => d.family_name + d.given_name + d.page + d.gender);

      squares.exit().remove();

      squares.enter()
        .append("div")
        .attr("class", "person-square")
        .style("background-color", d => {
          if (d.gender === "Female") return "#FF0000";
          if (d.gender === "Male") return "#4169E1";
          return "#ccc";
        })
        .on("mouseover", function (event, d) {
          const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .html(`
              <strong>${d.family_name}, ${d.given_name}</strong><br/>
              Gender: ${d.gender}<br/>
              Nationality: ${d.nationality}<br/>
              Role: ${d.role}<br/>
              Page: ${d.page}<br/>
              Mentions: ${mentionCounts.get(`${d.family_name}, ${d.given_name}`)} page/s
            `);
          d3.select(this).on("mousemove", function (event) {
            tooltip.style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 20) + "px");
          });
        })
        .on("mouseout", () => d3.selectAll(".tooltip").remove());
    });

    d3.select("#totalNumber").text(d3.selectAll(".person-square").size());

    const resultSet = new Set();
    d3.selectAll(".person-square").each(d => resultSet.add(`${d.family_name}, ${d.given_name}`));

    const sorted = Array.from(resultSet).sort();
    const resultBox = d3.select("#resultsList").html("");

    sorted.forEach(name => {
      const [fam, giv] = name.split(", ");
      const pages = mentionPages.get(name)?.join(", ") || "";
      resultBox.append("div").html(`${fam}, ${giv} <span style="font-size: 11px; color: #777;">(${pages})</span>`);
    });
  }

  updateGrid();

  d3.selectAll("#genderFilter, #nationalityFilter, #nameFilter").on("change", updateGrid);
  d3.select("#searchBox").on("input", updateGrid);
  d3.select("#resetButton").on("click", () => {
    d3.select("#genderFilter").property("value", "All");
    d3.select("#nationalityFilter").property("value", "All");
    d3.select("#mentionFilter").property("value", "All");
    d3.select("#nameFilter").property("value", "All");
    d3.select("#searchBox").property("value", "");
    d3.selectAll(".role-button").classed("active", false);
    updateGrid();
  });
});
