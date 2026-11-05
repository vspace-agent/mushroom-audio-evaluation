const choices=['Makes sense relative to prompt','Makes little sense to prompt but somehow interesting','Makes no sense to prompt — failure'];
const storageKey='mushroom-audio-evaluations';
let saved={};
try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{saved={}}
let inventory=[];
let activeRow=null;
let activeAudio=null;
const catalog=document.querySelector('#catalog');
function save(){localStorage.setItem(storageKey,JSON.stringify(saved))}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
function status(track){const entry=saved[track.id];return entry&&(entry.rating!==undefined||entry.comment?.trim())?'● evaluated':''}
function updateStatus(row,track){row.querySelector('.track-state').textContent=status(track)}
function openRecording(row,audio,track){
  if(activeRow&&activeRow!==row){activeRow.classList.remove('active');if(activeAudio)activeAudio.pause()}
  const wasOpen=row.classList.contains('active');
  row.classList.toggle('active',!wasOpen);
  activeRow=wasOpen?null:row;
  activeAudio=wasOpen?null:audio;
  if(wasOpen){audio.pause();return}
  audio.play().catch(()=>{});
}
function makeRecording(track,index){
  const row=element('div','recording');
  const line=element('div','track-line');
  const play=element('button','play','▶');
  play.type='button';play.setAttribute('aria-label','Play recording '+index);
  const number=element('span','track-index',String(index).padStart(2,'0'));
  const label=element('span','track-label',track.model);
  const state=element('span','track-state',status(track));
  line.append(play,number,label,state);
  const detail=element('div','track-detail');
  const audio=element('audio');
  audio.controls=true;audio.preload='none';audio.src=track.src;
  audio.addEventListener('play',()=>{play.textContent='Ⅱ'});
  audio.addEventListener('pause',()=>{play.textContent='▶'});
  audio.addEventListener('ended',()=>{play.textContent='▶'});
  play.onclick=()=>openRecording(row,audio,track);
  const meta=element('p','meta','Batch started: '+(track.timestamp?new Date(track.timestamp*1000).toLocaleString():'Unknown')+' · ID: '+track.id);
  const ratings=element('div','rating');
  choices.forEach((choice,i)=>{
    const wrapper=element('label');
    const input=element('input');
    input.type='radio';input.name=track.id;input.value=String(i);
    input.checked=saved[track.id]?.rating===i;
    input.onchange=()=>{saved[track.id]={...saved[track.id],rating:i};save();updateStatus(row,track)};
    wrapper.append(input,document.createTextNode(choice));ratings.append(wrapper);
  });
  const note=element('textarea');
  note.placeholder='Optional listening notes';
  note.setAttribute('aria-label','Listening notes for recording '+index);
  note.value=saved[track.id]?.comment||'';
  note.oninput=()=>{saved[track.id]={...saved[track.id],comment:note.value};save();updateStatus(row,track)};
  detail.append(audio,makeTrimEditor(track,audio),meta,ratings,note);
  row.append(line,detail);
  return row;
}
function makePrompt(group){
  const section=element('section','prompt');
  const toggle=element('button','prompt-toggle');
  toggle.type='button';toggle.setAttribute('aria-expanded','false');
  const chevron=element('span','chevron','›');
  const name=element('span','prompt-name',group.name.replaceAll('_',' '));
  const count=element('span','prompt-count',group.recordings.length+' recordings');
  toggle.append(chevron,name,count);
  const body=element('div','prompt-body');
  body.append(element('p','prompt-text',group.prompt));
  const list=element('div','track-list');
  group.recordings.forEach((track,i)=>list.append(makeRecording(track,i+1)));
  body.append(list);
  toggle.onclick=()=>{
    const opening=!section.classList.contains('open');
    section.classList.toggle('open',opening);
    toggle.setAttribute('aria-expanded',String(opening));
    if(!opening&&activeRow&&section.contains(activeRow)){
      activeAudio?.pause();activeRow.classList.remove('active');activeRow=null;activeAudio=null;
    }
  };
  section.append(toggle,body);
  return section;
}
fetch('inventory.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>{
  inventory=data;
  const themes=new Map();
  let total=0;
  for(const group of data){
    total+=group.recordings.length;
    if(!themes.has(group.theme)){
      const section=element('section','theme-section');
      const toggle=element('button','theme-toggle');
      toggle.type='button';
      toggle.setAttribute('aria-expanded','false');
      const arrow=element('span','chevron','›');
      const name=element('span','theme-name',group.theme.replaceAll('_',' '));
      const count=element('span','theme-count');
      toggle.append(arrow,name,count);
      const body=element('div','theme-body');
      toggle.onclick=()=>{
        const opening=!section.classList.contains('open');
        section.classList.toggle('open',opening);
        toggle.setAttribute('aria-expanded',String(opening));
        if(!opening&&activeRow&&section.contains(activeRow)){
          activeAudio?.pause();
          activeRow.classList.remove('active');
          activeRow=null;
          activeAudio=null;
        }
      };
      section.append(toggle,body);
      catalog.append(section);
      themes.set(group.theme,{body,count,prompts:0,recordings:0});
    }
    const entry=themes.get(group.theme);
    entry.prompts++;
    entry.recordings+=group.recordings.length;
    entry.body.append(makePrompt(group));
  }
  for(const entry of themes.values()){
    entry.count.textContent=entry.prompts+' prompts · '+entry.recordings+' recordings';
  }
  document.querySelector('#summary').textContent=data.length+' prompts / '+total+' recordings';
}).catch(error=>catalog.textContent='Could not load inventory: '+error.message);
document.querySelector('#collapse-all').onclick=()=>{
  document.querySelectorAll('.theme-section.open').forEach(section=>{
    section.classList.remove('open');
    section.querySelector('.theme-toggle').setAttribute('aria-expanded','false');
  });
  document.querySelectorAll('.prompt.open').forEach(section=>{
    section.classList.remove('open');
    section.querySelector('.prompt-toggle').setAttribute('aria-expanded','false');
  });
  activeAudio?.pause();activeRow?.classList.remove('active');activeRow=null;activeAudio=null;
};
document.querySelector('#prepare').onclick=()=>{
  const lines=['MUSHROOM HOUSE AUDIO EVALUATION',''];
  let count=0;
  for(const group of inventory){
    for(const track of group.recordings){
      const entry=saved[track.id];
      if(!entry||(entry.rating===undefined&&!entry.comment?.trim()))continue;
      count++;
      lines.push('Theme: '+group.theme,'Prompt: '+group.prompt,'Recording: '+track.id,'Model: '+track.model,'Batch started: '+(track.timestamp?new Date(track.timestamp*1000).toISOString():'Unknown'),'Evaluation: '+(entry.rating===undefined?'Not rated':choices[entry.rating]),'Comments: '+(entry.comment||''),'');
    }
  }
  document.querySelector('#report').value=count?lines.join('\n'):'No evaluated or commented recordings yet.';
};
document.querySelector('#copy').onclick=async()=>{
  const field=document.querySelector('#report');
  if(!field.value)document.querySelector('#prepare').click();
  try{await navigator.clipboard.writeText(field.value);document.querySelector('#status').textContent='Report copied.'}
  catch{field.select();document.querySelector('#status').textContent='Select and copy the report text.'}
};
