const colors = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#c2410c',
  '#0891b2', '#be123c', '#4338ca', '#059669', '#b45309', '#7c3aed'
];

let parsedData, selectedOrgs, svg, xScale, yScale, line, tooltip;

function parseCSV(csvString) {
  const lines = csvString.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim()).filter(h => h);
  const years = headers.slice(1);
  
  const organizations = [];
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    const orgName = row[0].trim();
    
    if (orgName && orgName !== 'Total' && orgName !== '') {
      organizations.push(orgName);
      
      const orgData = { organization: orgName };
      for (let j = 1; j < row.length && j <= years.length; j++) {
        const value = parseFloat(row[j]) || 0;
        orgData[years[j-1]] = value;
      }
      data.push(orgData);
    }
  }
  
  return { organizations, data, years };
}

async function loadCSV() {
  try {
    const response = await fetch('budget.csv');
    const csvText = await response.text();
    return csvText;
  } catch (error) {
    console.error('Error loading CSV:', error);
    return null;
  }
}

async function init() {
  const csvData = await loadCSV();
  if (!csvData) return;
  
  parsedData = parseCSV(csvData);
  selectedOrgs = new Set(parsedData.organizations.slice(0, 6));
  
  createTooltip();
  createLegend();
  createChart();
}

function createTooltip() {
  tooltip = d3.select('body').append('div')
    .attr('id', 'chart-tooltip')
    .style('position', 'absolute')
    .style('background', '#fff')
    .style('border', '1px solid #ccc')
    .style('border-radius', '6px')
    .style('padding', '10px')
    .style('font-size', '14px')
    .style('box-shadow', '0 2px 8px rgba(0,0,0,0.1)')
    .style('pointer-events', 'none')
    .style('z-index', '9999')
    .style('opacity', 0)
    .style('visibility', 'hidden');
}

function createLegend() {
  const legendGrid = d3.select('#legend-grid');
  legendGrid.selectAll('*').remove();
  
  parsedData.organizations.forEach((org, index) => {
    const legendItem = legendGrid.append('div')
      .attr('class', 'legend-item');
    
    const checkbox = legendItem.append('input')
      .attr('type', 'checkbox')
      .attr('id', `cb-${index}`)
      .property('checked', selectedOrgs.has(org))
      .on('change', function() {
        toggleOrganization(org);
      });
    
    legendItem.append('div')
      .attr('class', 'cb');
    
    legendItem.append('div')
      .attr('class', 'swatch')
      .style('background-color', colors[index % colors.length]);
    
    legendItem.append('div')
      .attr('class', 'label')
      .text(org);
    
    legendItem.on('click', function(event) {
      if (event.target.type !== 'checkbox') {
        const cb = this.querySelector('input[type="checkbox"]');
        cb.checked = !cb.checked;
        toggleOrganization(org);
      }
    });
  });
}

function toggleOrganization(org) {
  if (selectedOrgs.has(org)) {
    selectedOrgs.delete(org);
  } else {
    selectedOrgs.add(org);
  }
  updateChart();
}

function selectAllOrgs() {
  selectedOrgs = new Set(parsedData.organizations);
  d3.selectAll('#legend-grid input[type="checkbox"]').property('checked', true);
  updateChart();
}

function deselectAllOrgs() {
  selectedOrgs.clear();
  d3.selectAll('#legend-grid input[type="checkbox"]').property('checked', false);
  updateChart();
}

function selectTopOrgs() {
  const sortedOrgs = [...parsedData.data]
    .sort((a, b) => b['1975'] - a['1975'])
    .slice(0, 5)
    .map(d => d.organization);
  
  selectedOrgs = new Set(sortedOrgs);
  d3.selectAll('#legend-grid input[type="checkbox"]')
    .property('checked', function() {
      const legendItem = d3.select(this.parentNode);
      const label = legendItem.select('.label').text();
      return selectedOrgs.has(label);
    });
  updateChart();
}

function createChart() {
  const margin = { top: 20, right: 80, bottom: 50, left: 60 };
  const container = d3.select('#chart');
  const containerRect = container.node().getBoundingClientRect();
  const width = containerRect.width - margin.left - margin.right;
  const height = containerRect.height - margin.top - margin.bottom;
  
  container.selectAll('*').remove();
  
  svg = container.append('svg')
    .attr('width', containerRect.width)
    .attr('height', containerRect.height)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  xScale = d3.scalePoint()
    .domain(parsedData.years)
    .range([0, width]);
  
  const maxValue = d3.max(parsedData.data, d => 
    d3.max(parsedData.years, year => d[year])
  );
  
  yScale = d3.scaleLinear()
    .domain([0, maxValue * 1.1])
    .range([height, 0]);
  
  line = d3.line()
    .x(d => xScale(d.year))
    .y(d => yScale(d.value))
    .curve(d3.curveLinear);
  
  svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale))
    .selectAll('text')
    .style('font-size', '12px');
  
  svg.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(yScale))
    .selectAll('text')
    .style('font-size', '12px');
  
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', 0 - margin.left)
    .attr('x', 0 - (height / 2))
    .attr('dy', '1em')
    .style('text-anchor', 'middle')
    .style('font-size', '12px')
    .text('Budget (in US$ million)');
  
  svg.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
      .tickSize(-height)
      .tickFormat('')
    )
    .style('stroke-dasharray', '3,3')
    .style('opacity', 0.3);
  
  svg.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(yScale)
      .tickSize(-width)
      .tickFormat('')
    )
    .style('stroke-dasharray', '3,3')
    .style('opacity', 0.3);
  
  svg.on('mouseleave', hideTooltip);
  
  updateChart();
}

function updateChart() {
  if (!svg) return;
  
  const selectedData = parsedData.data.filter(d => selectedOrgs.has(d.organization));
  
  if (selectedData.length === 0) {
    svg.selectAll('.line').remove();
    return;
  }
  
  const lineData = selectedData.map(org => {
    const values = parsedData.years.map(year => ({
      year: year,
      value: org[year] || 0
    })).filter(d => !isNaN(d.value) && d.value !== null);
    
    return {
      organization: org.organization,
      values: values
    };
  }).filter(d => d.values.length > 0);
  
  const lines = svg.selectAll('.line')
    .data(lineData, d => d.organization);
  
  lines.exit()
    .transition()
    .duration(500)
    .style('opacity', 0)
    .remove();
  
  const linesEnter = lines.enter()
    .append('g')
    .attr('class', 'line');
  
  linesEnter.append('path')
    .attr('class', 'line-path')
    .style('fill', 'none')
    .style('stroke-width', 2)
    .style('opacity', 0);
  
  const linesUpdate = linesEnter.merge(lines);
  
  const linePaths = linesUpdate.select('.line-path')
    .style('stroke', (d, i) => {
      const orgIndex = parsedData.organizations.indexOf(d.organization);
      return colors[orgIndex % colors.length];
    })
    .attr('d', d => {
      if (d.values.length < 1) {
        return null;
      }
      try {
        return line(d.values);
      } catch (e) {
        console.warn('Line generation failed for:', d.organization, e);
        return null;
      }
    });
  
  linePaths.each(function(d) {
    const path = d3.select(this);
    const pathNode = path.node();
    
    if (!pathNode || !pathNode.getTotalLength) {
      path.style('opacity', 1);
      return;
    }
    
    try {
      const totalLength = pathNode.getTotalLength();
      if (totalLength > 0) {
        path
          .attr('stroke-dasharray', totalLength + ' ' + totalLength)
          .attr('stroke-dashoffset', totalLength)
          .style('opacity', 1)
          .transition()
          .duration(2000)
          .ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0);
      } else {
        path.style('opacity', 1);
      }
    } catch (e) {
      path.style('opacity', 1);
    }
  });
  
  const dots = linesUpdate.selectAll('.dot')
    .data(d => d.values.map(v => ({
      ...v,
      organization: d.organization
    })));
  
  dots.exit().remove();
  
  const dotsEnter = dots.enter()
    .append('circle')
    .attr('class', 'dot')
    .attr('r', 4)
    .style('opacity', 0);
  
  const dotsUpdate = dotsEnter.merge(dots);
  
  dotsUpdate
    .attr('cx', d => xScale(d.year))
    .attr('cy', d => yScale(d.value))
    .style('fill', d => {
      const orgIndex = parsedData.organizations.indexOf(d.organization);
      return colors[orgIndex % colors.length];
    })
    .style('stroke', '#fff')
    .style('stroke-width', 2)
    .transition()
    .delay((d, i) => i * 100)
    .duration(800)
    .style('opacity', 1)
    .on('end', function() {
      d3.select(this)
        .on('mouseenter', function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 6);
          showTooltip(event, d);
        })
        .on('mouseleave', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 4);
          hideTooltip();
        });
    });
}

function showTooltip(event, d) {
  if (!tooltip) return;
  
  tooltip.html(`
    <strong>${d.organization}</strong><br>
    Year: ${d.year}<br>
    Budget: US$ ${d.value}m
  `);
  
  const [x, y] = d3.pointer(event, document.body);
  tooltip
    .style('left', (x + 10) + 'px')
    .style('top', (y - 10) + 'px')
    .style('visibility', 'visible')
    .transition()
    .duration(200)
    .style('opacity', 1);
}

function hideTooltip() {
  if (!tooltip) return;
  
  tooltip
    .transition()
    .duration(200)
    .style('opacity', 0)
    .on('end', function() {
      tooltip.style('visibility', 'hidden');
    });
}

window.addEventListener('resize', function() {
  if (svg) {
    createChart();
  }
});

document.addEventListener('DOMContentLoaded', init);