const choices=['Makes sense relative to prompt','Makes little sense to prompt but somehow interesting','Makes no sense to prompt — failure'];
const storageKey='mushroom-audio-evaluations';
let saved={};
try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{saved={}}
let inventory=[];
let activeRow=null;
let activeAudio=null;
let themePlayback=null;
let playbackSession=null;
let playbackToken=0;

function stopPlayback(){
  playbackToken++;
  const session=playbackSession;
  playbackSession=null;
  themePlayback=null;
  if(session?.button){
    session.button.textContent='▶ Play theme';
    session.button.setAttribute('aria-pressed','false');
  }
  if(activeAudio){
    activeAudio.pause();
    activeAudio.onended=null;
    activeAudio.onerror=null;
  }
  activeRow?.classList.remove('active');
  activeAudio=null;
  activeRow=null;
}

function stopThemePlayback(){stopPlayback()}

function playNext(session){
  if(playbackSession!==session)return;
  if(session.index>=session.tracks.length){stopPlayback();return}
  const row=session.tracks[session.index++];
  const audio=row.querySelector('audio');
  if(!audio){playNext(session);return}
  if(activeAudio&&activeAudio!==audio){
    activeAudio.pause();
    activeAudio.onended=null;
    activeAudio.onerror=null;
  }
  activeRow?.classList.remove('active');
  activeRow=row;
  activeAudio=audio;
  row.classList.add('active');
  for(const section of [row.closest('.theme-section'),row.closest('.prompt')]){
    section?.classList.add('open');
    section?.querySelector(':scope > .theme-header > .theme-toggle, :scope > .prompt-toggle')?.setAttribute('aria-expanded','true');
  }
  const token=++playbackToken;
  let advanced=false;
  const advance=()=>{
    if(advanced||playbackSession!==session||playbackToken!==token)return;
    advanced=true;
    row.classList.remove('active');
    playNext(session);
  };
  audio.onended=advance;
  audio.onerror=advance;
  try{
    audio.currentTime=0;
    const result=audio.play();
    if(result&&typeof result.catch==='function')result.catch(advance);
  }catch(error){advance()}
}

function startPlayback(tracks,button=null){
  stopPlayback();
  if(!tracks.length)return;
  const session={tracks,index:0,button};
  playbackSession=session;
  if(button){
    themePlayback=session;
    button.textContent='■ Stop theme';
    button.setAttribute('aria-pressed','true');
  }
  playNext(session);
}

function playThemeNext(session){playNext(session)}
const catalog=document.querySelector('#catalog');
function save(){localStorage.setItem(storageKey,JSON.stringify(saved))}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
function status(track){const entry=saved[track.id];return entry&&(entry.rating!==undefined||entry.comment?.trim())?'● evaluated':''}
function updateStatus(row,track){row.querySelector('.track-state').textContent=status(track)}
function openRecording(row,audio,track){
  if(activeRow===row){stopPlayback();return}
  const tracks=Array.from(catalog.querySelectorAll('.recording'));
  const index=tracks.indexOf(row);
  if(index<0)return;
  startPlayback(tracks.slice(index));
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
  audio.addEventListener('play',()=>{
    play.textContent='Ⅱ';
    if(activeAudio===audio&&playbackSession)return;
    const tracks=Array.from(catalog.querySelectorAll('.recording'));
    const index=tracks.indexOf(row);
    if(index>=0)startPlayback(tracks.slice(index));
  });
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
      const playAll=element('button','theme-play','▶ Play theme');
      playAll.type='button';
      playAll.setAttribute('aria-pressed','false');
      playAll.onclick=()=>{
        if(themePlayback?.button===playAll){stopThemePlayback();return}
        const tracks=Array.from(body.querySelectorAll('.recording'));
        if(!tracks.length)return;
        section.classList.add('open');
        toggle.setAttribute('aria-expanded','true');
        startPlayback(tracks,playAll);
      };
      const body=element('div','theme-body');
      toggle.onclick=()=>{
        const opening=!section.classList.contains('open');
        section.classList.toggle('open',opening);
        toggle.setAttribute('aria-expanded',String(opening));
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
  const latestByTheme=new Map();
  for(const group of data){
    const latest=Math.max(0,...group.recordings.map(track=>Number(track.timestamp)||0));
    latestByTheme.set(group.theme,Math.max(latestByTheme.get(group.theme)||0,latest));
  }
  const ordered=Array.from(themes.entries()).sort((a,b)=>
    (latestByTheme.get(b[0])||0)-(latestByTheme.get(a[0])||0));
  for(const [name,entry] of ordered){
    entry.count.textContent=entry.prompts+' prompts · '+entry.recordings+' recordings';
    catalog.append(entry.body.closest('.theme-section'));
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
