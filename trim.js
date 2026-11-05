// Browser-only audio selection, preview, and WAV export.
function makeTrimEditor(track, audio) {
  const panel = document.createElement('div');
  panel.className = 'trim-editor';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'quiet trim-toggle';
  toggle.textContent = '✂ Trim + Download';

  const controls = document.createElement('div');
  controls.className = 'trim-controls';
  controls.hidden = true;

  const info = document.createElement('p');
  info.className = 'trim-info';
  info.textContent = 'Loading duration…';

  const timeline = document.createElement('div');
  timeline.className = 'trim-timeline';
  const waveform = document.createElement('canvas');
  waveform.className = 'trim-waveform';
  waveform.width = 900;
  waveform.height = 100;
  const selected = document.createElement('div');
  selected.className = 'trim-selection';
  const leftHandle = document.createElement('div');
  const rightHandle = document.createElement('div');
  leftHandle.className = 'trim-handle trim-handle-left';
  rightHandle.className = 'trim-handle trim-handle-right';
  leftHandle.setAttribute('role','slider');
  rightHandle.setAttribute('role','slider');
  leftHandle.setAttribute('aria-label','Trim start');
  rightHandle.setAttribute('aria-label','Trim end');
  leftHandle.tabIndex = 0;
  rightHandle.tabIndex = 0;
  selected.append(leftHandle,rightHandle);
  timeline.append(waveform,selected);
  let startTime = 0;
  let endTime = 0;
  const selection = () => [startTime,endTime];
  const paintSelection = () => {
    if(!duration)return;
    selected.style.left = `${startTime/duration*100}%`;
    selected.style.width = `${(endTime-startTime)/duration*100}%`;
    leftHandle.setAttribute('aria-valuenow',String(startTime.toFixed(2)));
    rightHandle.setAttribute('aria-valuenow',String(endTime.toFixed(2)));
  };
  function drawWaveform(samples){
    const ctx=waveform.getContext('2d');
    const w=waveform.width,h=waveform.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#8eaa9c';
    const step=Math.max(1,Math.floor(samples.length/w));
    for(let x=0;x<w;x++){
      let peak=0;
      const offset=x*step;
      for(let i=offset;i<Math.min(offset+step,samples.length);i+=Math.max(1,Math.floor(step/24)))
        peak=Math.max(peak,Math.abs(samples[i]));
      const height=Math.max(1,peak*h*.9);
      ctx.fillRect(x,(h-height)/2,1,height);
    }
  }
  let waveformLoaded=false;
  async function loadWaveform(){
    if(waveformLoaded)return;
    waveformLoaded=true;
    try{
      const response=await fetch(track.src);
      if(!response.ok)throw Error('Audio HTTP '+response.status);
      const context=new (window.AudioContext||window.webkitAudioContext)();
      let decoded;
      try{decoded=await context.decodeAudioData(await response.arrayBuffer())}
      finally{await context.close()}
      drawWaveform(decoded.getChannelData(0));
    }catch(error){
      waveformLoaded=false;
      info.textContent='Waveform unavailable: '+error.message;
    }
  }
  for(const [handle,side] of [[leftHandle,'start'],[rightHandle,'end']]){
    handle.addEventListener('pointerdown',event=>{
      if(!duration)return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const move=e=>{
        const rect=timeline.getBoundingClientRect();
        const value=Math.max(0,Math.min(duration,(e.clientX-rect.left)/rect.width*duration));
        if(side==='start')startTime=Math.min(value,endTime-.01);
        else endTime=Math.max(value,startTime+.01);
        startTime=Math.max(0,startTime);
        endTime=Math.min(duration,endTime);
        refresh();
      };
      const done=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',done);handle.removeEventListener('pointercancel',done)};
      handle.addEventListener('pointermove',move);
      handle.addEventListener('pointerup',done);
      handle.addEventListener('pointercancel',done);
    });
    handle.addEventListener('keydown',event=>{
      if(!duration||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      const delta=(event.key==='ArrowRight'?1:-1)*(event.shiftKey?1:.1);
      if(side==='start')startTime=Math.max(0,Math.min(endTime-.01,startTime+delta));
      else endTime=Math.min(duration,Math.max(startTime+.01,endTime+delta));
      refresh();
    });
  }

  const actions = document.createElement('div');
  actions.className = 'trim-actions';
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.textContent = '▶ Preview selection';
  preview.disabled = true;
  const download = document.createElement('button');
  download.type = 'button';
  download.textContent = '↓ Download WAV';
  download.disabled = true;
  actions.append(preview, download);
  controls.append(info, timeline, actions);
  panel.append(toggle, controls);

  let duration = 0;
  let previewing = false;
  const time = seconds => {
    const s = Math.max(0, seconds);
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };
  const refresh = () => {
    const [a, b] = selection();
    const valid = duration > 0 && b > a;
    info.textContent = duration
      ? `${time(a)} – ${time(b)}  ·  ${time(b - a)} selected`
      : 'Loading duration…';
    preview.disabled = !valid;
    download.disabled = !valid;
    paintSelection();
  };

  function setDuration() {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    duration = audio.duration;
    if(!endTime)endTime=duration;
    refresh();
  }

  toggle.onclick = () => {
    controls.hidden = !controls.hidden;
    toggle.setAttribute('aria-expanded', String(!controls.hidden));
    if (!controls.hidden) {
      if (audio.readyState >= 1) setDuration();
      else audio.load();
      loadWaveform();
    } else if (previewing) {
      audio.pause();
      previewing = false;
    }
  };
  toggle.setAttribute('aria-expanded', 'false');

  audio.addEventListener('loadedmetadata', setDuration);
  audio.addEventListener('timeupdate', () => {
    if (previewing && audio.currentTime >= endTime) {
      audio.pause();
      previewing = false;
    }
  });
  audio.addEventListener('pause', () => { previewing = false; });

  preview.onclick = async () => {
    audio.pause();
    audio.currentTime = startTime;
    previewing = true;
    try { await audio.play(); }
    catch (error) {
      previewing = false;
      info.textContent = 'Preview unavailable: ' + error.message;
    }
  };

  download.onclick = async () => {
    const [a, b] = selection();
    if (!(b > a)) return;
    download.disabled = true;
    download.textContent = 'Preparing WAV…';
    try {
      const response = await fetch(track.src);
      if (!response.ok) throw Error('Audio HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      const context = new (window.AudioContext || window.webkitAudioContext)();
      let decoded;
      try { decoded = await context.decodeAudioData(bytes); }
      finally { await context.close(); }

      const sampleRate = decoded.sampleRate;
      const first = Math.max(0, Math.floor(a * sampleRate));
      const last = Math.min(decoded.length, Math.ceil(b * sampleRate));
      const frames = last - first;
      if (frames <= 0) throw Error('Empty selection');
      const channels = decoded.numberOfChannels;
      const wav = new ArrayBuffer(44 + frames * channels * 2);
      const view = new DataView(wav);
      const ascii = (offset, value) => {
        for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
      };
      ascii(0, 'RIFF');
      view.setUint32(4, wav.byteLength - 8, true);
      ascii(8, 'WAVE');
      ascii(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * channels * 2, true);
      view.setUint16(32, channels * 2, true);
      view.setUint16(34, 16, true);
      ascii(36, 'data');
      view.setUint32(40, frames * channels * 2, true);
      const sources = Array.from({length: channels}, (_, i) => decoded.getChannelData(i));
      let offset = 44;
      for (let frame = first; frame < last; frame++) {
        for (const source of sources) {
          const sample = Math.max(-1, Math.min(1, source[frame]));
          view.setInt16(offset, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true);
          offset += 2;
        }
      }
      const url = URL.createObjectURL(new Blob([wav], {type: 'audio/wav'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${[track.theme || 'theme', String(track.prompt_name || track.promptName || 'prompt').replace(/^track_\d+_/, ''), String(track.recording_number || track.recordingNumber || track.id).padStart(2,'0')].map(v=>String(v).replace(/[^a-zA-Z0-9_-]/g,'_')).join('_')}.wav`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      info.textContent = `${time(a)} – ${time(b)} · WAV ready`;
    } catch (error) {
      info.textContent = 'Export failed: ' + error.message;
    } finally {
      download.textContent = '↓ Download WAV';
      download.disabled = false;
    }
  };
  return panel;
}
