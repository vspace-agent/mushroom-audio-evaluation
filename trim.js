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

  const start = document.createElement('input');
  const end = document.createElement('input');
  for (const slider of [start, end]) {
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.disabled = true;
  }
  start.value = '0';
  end.value = '1';
  start.setAttribute('aria-label', 'Trim start');
  end.setAttribute('aria-label', 'Trim end');

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
  controls.append(info, start, end, actions);
  panel.append(toggle, controls);

  let duration = 0;
  let previewing = false;
  const time = seconds => {
    const s = Math.max(0, seconds);
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };
  const selection = () => [Number(start.value), Number(end.value)];
  const refresh = () => {
    const [a, b] = selection();
    const valid = duration > 0 && b > a;
    info.textContent = duration
      ? `${time(a)} – ${time(b)}  ·  ${time(b - a)} selected`
      : 'Loading duration…';
    preview.disabled = !valid;
    download.disabled = !valid;
  };

  function setDuration() {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    duration = audio.duration;
    for (const slider of [start, end]) {
      slider.max = String(duration);
      slider.disabled = false;
    }
    end.value = String(duration);
    refresh();
  }

  toggle.onclick = () => {
    controls.hidden = !controls.hidden;
    toggle.setAttribute('aria-expanded', String(!controls.hidden));
    if (!controls.hidden) {
      if (audio.readyState >= 1) setDuration();
      else audio.load();
    } else if (previewing) {
      audio.pause();
      previewing = false;
    }
  };
  toggle.setAttribute('aria-expanded', 'false');

  audio.addEventListener('loadedmetadata', setDuration);
  start.oninput = () => {
    if (Number(start.value) > Number(end.value)) end.value = start.value;
    refresh();
  };
  end.oninput = () => {
    if (Number(end.value) < Number(start.value)) start.value = end.value;
    refresh();
  };

  audio.addEventListener('timeupdate', () => {
    if (previewing && audio.currentTime >= Number(end.value)) {
      audio.pause();
      previewing = false;
    }
  });
  audio.addEventListener('pause', () => { previewing = false; });

  preview.onclick = async () => {
    audio.pause();
    audio.currentTime = Number(start.value);
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
      link.download = `${String(track.id).replace(/[^a-zA-Z0-9_-]/g, '_')}_trim.wav`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      info.textContent = `${time(a)} – ${time(b)} · WAV ready`;
    } catch (error) {
      info.textContent = 'Export failed: ' + error.message;
    } finally {
      download.textContent = '↓ Download WAV';
      refresh();
    }
  };
  return panel;
}
