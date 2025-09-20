let svg, g, landG, countriesG, projection, path, tooltip;
let worldData, landData, membershipData = [];
let currentYear = 1947;
let isPlaying = false;
let playInterval;
let useHistoricalBasemap = false;
const cshapesCache = new Map();
let relevantYears = [];
let yearIdx = 0;
const COLOR_LAND = "#e8e8e8";
const COLOR_MEMBER = "#4A90E2";
const COLOR_NEW = "#d90c1a";

function stripDiacritics(s){try{return s.normalize('NFD').replace(/\p{Diacritic}+/gu,'')}catch{return s}}
function normalizeBase(s){return stripDiacritics(String(s||'').replace(/\(.*?\)/g,' ').replace(/,.*$/,' ').replace(/\s+/g,' ').trim().toLowerCase())}
function normalizeCountry(s){
  const x=normalizeBase(s);
  const map=new Map([
    ['germany','germany'],['federal republic of germany','germany_frg'],['german federal republic','germany_frg'],['west germany','germany_frg'],['german democratic republic','germany_gdr'],['east germany','germany_gdr'],
    ['russian federation','russia'],['russia','russia'],['soviet union','ussr'],['ussr','ussr'],
    ['united kingdom of great britain and northern ireland','united kingdom'],['united kingdom','united kingdom'],['britain','united kingdom'],
    ['usa','united states'],['us','united states'],['united states of america','united states'],['united states','united states'],
    ['republic of korea','south korea'],['south korea','south korea'],["democratic people's republic of korea",'north korea'],['north korea','north korea'],
    ['democratic republic of the congo','drc'],['congo (kinshasa)','drc'],['drc','drc'],
    ['republic of the congo','congo_brazzaville'],['congo (brazzaville)','congo_brazzaville'],
    ['turkiye','turkey'],
    ['cote d ivoire','ivory coast'],['côte d ivoire','ivory coast'],
    ['iran (islamic republic of)','iran'],
    ['viet nam','vietnam'],
    ['lao people s democratic republic','laos'],
    ['timor-leste','east timor'],
    ['myanmar','burma'],['burma','burma'],
    ['yugoslavia','yugoslavia'],['czechoslovakia','czechoslovakia'],
    ['yemen arab republic','yemen'],["people's democratic republic of yemen",'yemen'],['north yemen','yemen'],['south yemen','yemen']
  ]);
  return map.get(x)||x
}
function variationsToKeys(raw){
  const n=normalizeCountry(raw);
  const v=new Set([n]);
  if(n==='germany'){v.add('germany_frg');v.add('germany_gdr')}
  if(n==='germany_frg'||n==='germany_gdr'){v.add('germany')}
  if(n==='russia')v.add('ussr');
  if(n==='ussr')v.add('russia');
  return [...v]
}
function membersSetUpToYear(year){
  const set=new Set();
  membershipData.filter(d=>d.year<=year).forEach(d=>{
    if(d.country.trim()==='Germany'&&d.year===1973){['germany','germany_frg','germany_gdr'].forEach(k=>set.add(k));return}
    variationsToKeys(d.country).forEach(k=>set.add(k))
  });
  return set
}
function newMembersSetInYear(year){
  const set=new Set();
  membershipData.filter(d=>d.year===year).forEach(d=>{
    if(d.country.trim()==='Germany'&&year===1973){['germany','germany_frg','germany_gdr'].forEach(k=>set.add(k));return}
    variationsToKeys(d.country).forEach(k=>set.add(k))
  });
  return set
}
function featureKey(props){
  const raw=props?.NAME||props?.NAME_EN||props?.ADMIN||props?.name||props?.CNTRY_NAME||props?.SOVEREIGNT||'Unknown';
  return normalizeCountry(raw)
}

init();

async function init(){
  setupSVG();
  setupControls();
  await loadData();
  drawLandMask();
  buildYearChips();
  if(relevantYears.length) currentYear=relevantYears[0];
  updateVisualization()
}
function setupSVG(){
  svg=d3.select('#ecafeViz').attr('preserveAspectRatio','xMidYMid meet').attr('viewBox','0 0 1000 600');
  const width=1000,height=600;
  projection=d3.geoMercator().scale(150).translate([width/2,height/2+40]);
  path=d3.geoPath().projection(projection);
  g=svg.append('g');
  landG=g.append('g').attr('id','land-layer');
  countriesG=g.append('g').attr('id','countries-layer');
  tooltip=d3.select('#tooltip').style('max-width','min(46ch, 60vw)').style('white-space','normal').style('word-break','word-break').style('z-index','9999')
}
function setupControls(){
  d3.select('#play').on('click',startAnimation);
  d3.select('#pause').on('click',stopAnimation);
  d3.select('#reset').on('click',()=>{
    stopAnimation();
    yearIdx=0;
    currentYear=relevantYears.length?relevantYears[0]:1947;
    updateVisualization()
  });
  const toggleBtn=document.getElementById('overlayToggle');
  const overlay=document.getElementById('memberOverlay');
  if(toggleBtn&&overlay){
    toggleBtn.addEventListener('click',()=>{
      overlay.classList.toggle('collapsed');
      toggleBtn.textContent=overlay.classList.contains('collapsed')?'+':'–'
    })
  }
}
async function loadData(){
  try{
    const landTopo=await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json');
    landData=topojson.feature(landTopo,landTopo.objects.land)
  }catch(e){}
  try{
    const topo=await d3.json('CShapes-2.0-simplified.json');
    const firstKey=topo&&topo.objects?Object.keys(topo.objects)[0]:null;
    if(!firstKey) throw new Error('no objects');
    const fc=topojson.feature(topo,topo.objects[firstKey]);
    window.__CSHAPES__=fc;
    useHistoricalBasemap=true
  }catch{
    const world=await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    worldData=topojson.feature(world,world.objects.countries)
  }
  try{
    const rows=await d3.csv('ece.csv',d=>{
      const country=(d.Country||'').trim();
      const yearText=String(d.Year||'').trim();
      const ym=yearText.match(/\d{4}/);
      const year=ym?+ym[0]:NaN;
      return {country,year,date:(d.Date||'').trim()||null,note:(d.Note||'').trim()||null}
    });
    membershipData=rows.filter(r=>r.country&&Number.isFinite(r.year)).sort((a,b)=>d3.ascending(a.year,b.year));
    relevantYears=Array.from(new Set(membershipData.map(d=>d.year))).sort((a,b)=>a-b)
  }catch(err){
    console.error('ece.csv load error',err);
    alert('ece.csv fehlt oder ist nicht lesbar. Bitte ece.csv (Header: Country,Year,Date,Note) neben index.html legen.')
  }
}
function drawLandMask(){
  if(!landData) return;
  landG.selectAll('path').remove();
  landG.append('path').datum(landData).attr('d',path).attr('fill',COLOR_LAND).attr('stroke','none')
}
function buildYearChips(){
  const wrap=d3.select('#yearChips');
  if(wrap.empty()) return;
  wrap.selectAll('*').remove();
  wrap.selectAll('div.year-chip').data(relevantYears,d=>d).enter().append('div').attr('class','year-chip').text(d=>(d===2006?'since 2006':d)).on('click',(event,y)=>{
    stopAnimation();
    currentYear=y;
    yearIdx=relevantYears.indexOf(y);
    updateVisualization()
  })
}
function drawCountries(features){
  countriesG.selectAll('path').remove();
  countriesG.selectAll('path').data(features).enter().append('path').attr('d',path).attr('fill','transparent').attr('stroke','none').on('mouseover',handleMouseOver).on('mousemove',handleMouseMove).on('mouseout',handleMouseOut)
}
function updateVisualization(){
  d3.select('#yearDisplay').text(currentYear);
  if(useHistoricalBasemap&&window.__CSHAPES__){
    drawCountries(filterCShapesByYear(currentYear))
  }else if(worldData){
    drawCountries(worldData.features)
  }
  const currentMembers=membersSetUpToYear(currentYear);
  const newMembers=newMembersSetInYear(currentYear);
  d3.select('#memberCount').text(currentMembers.size);
  d3.select('#newMemberCount').text(newMembers.size);
  countriesG.selectAll('path').attr('fill',d=>{
    const fk=featureKey(d.properties||{});
    const isNew=newMembers.has(fk);
    const isMember=isNew?false:currentMembers.has(fk);
    if(isNew) return COLOR_NEW;
    if(isMember) return COLOR_MEMBER;
    if(!isNew&&!isMember){
      if(fk==='germany'&&(newMembers.has('germany_frg')||newMembers.has('germany_gdr'))) return COLOR_NEW;
      if(fk==='germany'&&(currentMembers.has('germany_frg')||currentMembers.has('germany_gdr'))) return COLOR_MEMBER;
      if((fk==='germany_frg'||fk==='germany_gdr')&&newMembers.has('germany')) return COLOR_NEW;
      if((fk==='germany_frg'||fk==='germany_gdr')&&currentMembers.has('germany')) return COLOR_MEMBER
    }
    return 'transparent'
  }).style('pointer-events',d=>{
    const fk=featureKey(d.properties||{});
    return (newMembers.has(fk)||currentMembers.has(fk))?'auto':'none'
  }).style('cursor',d=>{
    const fk=featureKey(d.properties||{});
    return (newMembers.has(fk)||currentMembers.has(fk))?'pointer':'default'
  });
  d3.selectAll('.year-chip').classed('active',d=>d===currentYear);
  const activeChip=document.querySelector('.year-chip.active');
  if(activeChip) activeChip.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});
  updateMemberOverlay(currentYear)
}
function updateMemberOverlay(year){
  const titleYear=document.getElementById('overlayYear');
  if(titleYear) titleYear.textContent=year;
  const container=d3.select('#memberOverlayBody');
  if(container.empty()) return;
  const activeCountries=membershipData.filter(d=>d.year<=year);
  const grouped=d3.group(activeCountries,d=>d.year);
  const years=Array.from(grouped.keys()).sort((a,b)=>a-b);
  container.selectAll('*').remove();
  const groups=container.selectAll('.year-group').data(years,d=>d).enter().append('div').attr('class','year-group');
  groups.append('div').attr('class','year-title').text(yr=>`${yr} (${grouped.get(yr).length})`);
  groups.append('ul').attr('class','country-list').each(function(yr){
    const ul=d3.select(this);
    const names=Array.from(new Set(grouped.get(yr).map(d=>d.country))).sort((a,b)=>a.localeCompare(b));
    ul.selectAll('li').data(names).enter().append('li').text(n=>n)
  })
}
function pickProp(o,keys,fallback=null){for(const k of keys) if(o&&o[k]!=null) return o[k]; return fallback}
function filterCShapesByYear(year){
  if(cshapesCache.has(year)) return cshapesCache.get(year);
  const fc=window.__CSHAPES__;
  const START_KEYS=['GWSYEAR','START','start','begin','FROMYEAR','from'];
  const END_KEYS=['GWEYEAR','END','end','to','TOYEAR'];
  const features=fc.features.filter(f=>{
    const p=f.properties||{};
    const ys=+pickProp(p,START_KEYS,-Infinity);
    const ye=+pickProp(p,END_KEYS,9999);
    return Number.isFinite(ys)&&(year>=ys)&&(year<ye)
  });
  cshapesCache.set(year,features);
  return features
}
function getMembershipInfo(countryName){
  const keys=variationsToKeys(countryName);
  let minYear=null,bestDate=null,bestNote=null;
  for(const d of membershipData){
    const ds=variationsToKeys(d.country);
    if(ds.some(k=>keys.includes(k))){
      if(minYear===null||d.year<minYear){minYear=d.year;bestDate=d.date??null;bestNote=d.note??null}
      else if(d.year===minYear){if(!bestDate&&d.date) bestDate=d.date; if(!bestNote&&d.note) bestNote=d.note}
    }
  }
  return {year:minYear,date:bestDate,note:bestNote}
}
function displayNameByYear(props,year){
  return props?.NAME||props?.NAME_EN||props?.ADMIN||props?.name||props?.CNTRY_NAME||'Unknown'
}
function handleMouseOver(event,d){
  const p=d.properties||{};
  const curr=membersSetUpToYear(currentYear);
  const nm=featureKey(p);
  const isMem=curr.has(nm)||(nm==='germany'&&(curr.has('germany_frg')||curr.has('germany_gdr')))||((nm==='germany_frg'||nm==='germany_gdr')&&curr.has('germany'));
  if(!isMem){tooltip.style('visibility','hidden').style('opacity',0);return}
  const display=displayNameByYear(p,currentYear);
  const info=getMembershipInfo(display);
  let html=`<div class="tooltip-title">${display}</div>`;
  html+=`<div class="tooltip-since">UNECE member since: ${info.year??'Unknown'}</div>`;
  if(info.date) html+=`<div class="tooltip-line">Joined on: ${info.date}</div>`;
  if(info.note) html+=`<div class="tooltip-line">Note: ${info.note}</div>`;
  tooltip.html(html).style('visibility','visible').style('opacity',1)
}
function handleMouseMove(event){
  const tt=document.getElementById('tooltip'); if(!tt) return;
  if(tt.style.visibility!=='visible'){tt.style.visibility='visible';tt.style.opacity=1}
  const padding=18,margin=12;
  const pageW=window.innerWidth||document.documentElement.clientWidth;
  const pageH=window.innerHeight||document.documentElement.clientHeight;
  const ttW=tt.offsetWidth,ttH=tt.offsetHeight;
  let x=event.pageX+padding;
  let y=event.pageY+padding;
  if(x+ttW+margin>pageW) x=event.pageX-ttW-padding;
  if(y+ttH+margin>pageH+window.scrollY) y=event.pageY-ttH-padding;
  if(x<margin) x=margin;
  if(y<window.scrollY+margin) y=window.scrollY+margin;
  if(x+ttW>pageW-margin) x=Math.max(margin,pageW-ttW-margin);
  if(y+ttH>pageH+window.scrollY-margin) y=Math.max(window.scrollY+margin,pageH+window.scrollY-ttH-margin);
  tt.style.left=`${x}px`;
  tt.style.top=`${y}px`
}
function handleMouseOut(){tooltip.style('visibility','hidden').style('opacity',0)}
function startAnimation(){
  if(isPlaying||relevantYears.length===0) return;
  isPlaying=true;
  d3.select("#play").classed("playing",true);
  yearIdx=relevantYears.indexOf(currentYear);
  if(yearIdx<0) yearIdx=0;
  playInterval=setInterval(()=>{
    yearIdx=(yearIdx+1)%relevantYears.length;
    currentYear=relevantYears[yearIdx];
    updateVisualization()
  },1500)
}
function stopAnimation(){
  isPlaying=false;
  clearInterval(playInterval);
  d3.select("#play").classed("playing",false)
}
