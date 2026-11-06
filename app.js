const choices=['Makes sense relative to prompt','Makes little sense to prompt but somehow interesting','Makes no sense to prompt — failure'];
const storageKey='mushroom-audio-evaluations';
let saved={};
try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{saved={}}
let inventory=[];
let activeRow=null;
let activeAudio=null;
let themePlayback=null;
function stopThemePlayback(){
  if(!themePlayback)return;
  const session=themePlayback;
  themePlayback=null;
  session.button.textContent='▶ Play theme';
  session.button.setAttribute('aria-pressed','false');
  session.audio?.pause();
  if(activeRow&&session.tracks.includes(activeRow))activeRow.classList.remove('active');
  if(activeAudio===session.audio){activeAudio=null;activeRow=null}
}
function playThemeNext(session){
  if(themePlayback!==session)return;
  if(session.index>=session.tracks.length){stopThemePlayback();return}
  const track=session.tracks[session.index++];
  const audio=track.querySelector('audio');
  if(!audio){playThemeNext(session);return}
  session.audio=audio;
  if(activeRow&&activeRow!==track)activeRow.classList.remove('active');
  if(activeAudio&&activeAudio!==audio)activeAudio.pause();
  activeAudio=audio;
  activeRow=track;
  track.classList.add('active');
  track.closest('.prompt')?.classList.add('open');
  const promptToggle=track.closest('.prompt')?.querySelector('.prompt-toggle');
  promptToggle?.setAttribute('aria-expanded','true');
  audio.currentTime=0;
  audio.onended=()=>{
    if(themePlayback!==session)return;
    track.classList.remove('active');
    if(activeRow===track){activeRow=null;activeAudio=null}
    playThemeNext(session);
  };
  audio.play().catch(()=>stopThemePlayback());
}
const catalog=document.querySelector('#catalog');
function save(){localStorage.setItem(storageKey,JSON.stringify(saved))}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
function status(track){const entry=saved[track.id];return entry&&(entry.rating!==undefined||entry.comment?.trim())?'● evaluated':''}
function updateStatus(row,track){row.querySelector('.track-state').textContent=status(track)}
function openRecording(row,audio,track){
  stopThemePlayback();
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
  detail.append(audio,makeTrimEditor({...track,theme:track.theme||track._theme,prompt_name:track._prompt,recording_number:index},audio),meta,ratings,note);
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
  group.recordings.forEach((track,i)=>list.append(makeRecording({...track,_theme:group.theme,_prompt:group.name},i+1)));
  body.append(list);
  toggle.onclick=()=>{
    const opening=!section.classList.contains('open');
    section.classList.toggle('open',opening);
    toggle.setAttribute('aria-expanded',String(opening));
    if(!opening&&themePlayback?.tracks.some(row=>section.contains(row)))stopThemePlayback();
    if(!opening&&activeRow&&section.contains(activeRow)){
      activeAudio?.pause();activeRow.classList.remove('active');activeRow=null;activeAudio=null;
    }
  };
  section.append(toggle,body);
  return section;
}
fetch('inventory.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>{
  inventory=data;
  // Newest theme first, using the latest recording generation timestamp in each theme.
  const themeTimes=new Map();
  for(const group of data){
    const newest=Math.max(0,...group.recordings.map(track=>Number(track.timestamp)||0));
    themeTimes.set(group.theme,Math.max(themeTimes.get(group.theme)||0,newest));
  }
  data.sort((a,b)=>(themeTimes.get(b.theme)||0)-(themeTimes.get(a.theme)||0));
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
      const playAll=element('button','theme-play','▶ Play theme');
      playAll.type='button';
      playAll.setAttribute('aria-pressed','false');
      playAll.onclick=()=>{
        if(themePlayback?.button===playAll){stopThemePlayback();return}
        stopThemePlayback();
        const tracks=Array.from(body.querySelectorAll('.recording'));
        if(!tracks.length)return;
        section.classList.add('open');
        toggle.setAttribute('aria-expanded','true');
        const session={button:playAll,tracks,index:0,audio:null};
        themePlayback=session;
        playAll.textContent='■ Stop theme';
        playAll.setAttribute('aria-pressed','true');
        playThemeNext(session);
      };
      const body=element('div','theme-body');
      toggle.onclick=()=>{
        const opening=!section.classList.contains('open');
        section.classList.toggle('open',opening);
        toggle.setAttribute('aria-expanded',String(opening));
        if(!opening&&themePlayback?.button===playAll)stopThemePlayback();
        if(!opening&&activeRow&&section.contains(activeRow)){
          activeAudio?.pause();
          activeRow.classList.remove('active');
          activeRow=null;
          activeAudio=null;
        }
      };
      const header=element('div','theme-header');
      header.append(toggle,playAll);
      section.append(header,body);
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
  stopThemePlayback();
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
