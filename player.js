(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const stage = $('stage');
  if (!stage) return;

  if (!document.styleSheets.length) {
    console.warn('[player] styles.css tidak termuat — cek path file.');
  }

  const video = $('video'), hud = $('hud'), track = $('track'),
        played = $('played'), buffered = $('buffered'), knob = $('knob'),
        tCur = $('tCur'), tDur = $('tDur'), badge = $('badge'), toast = $('toast'),
        ripL = $('ripL'), ripR = $('ripR'), empty = $('empty'),
        btnPlay = $('btnPlay'), btnMute = $('btnMute'), btnSpeed = $('btnSpeed'),
        btnRotate = $('btnRotate'), btnFs = $('btnFs'), btnDl = $('btnDl'),
        loadPct = $('loadPct');

  const RATE = 2, STEP = 10;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const dur = () => (isFinite(video.duration) ? video.duration : 0);

  const ICON = {
    play: '<svg class="fill" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg class="fill" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    vol: '<svg class="stroke" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
    mute: '<svg class="stroke" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>'
  };

  const fmt = s => {
    if (!isFinite(s) || s < 0) return '0:00';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
  };

  const resolveUrl = u => {
    if (!u) return '';
    try {
      const x = new URL(u, location.href);
      return ['http:', 'https:', 'blob:', 'data:'].includes(x.protocol) ? x.href : '';
    } catch { return ''; }
  };

  const fileName = u => {
    try {
      const p = decodeURIComponent(new URL(u, location.href).pathname.split('/').pop() || '');
      return p || 'video.mp4';
    } catch { return 'video.mp4'; }
  };

  const q = new URLSearchParams(location.search);
  const src = resolveUrl(q.get('url') || q.get('src') || q.get('v') || '');
  const poster = q.get('poster') || '';

  if (!src) {
    stage.hidden = true;
    empty.hidden = false;
  } else {
    empty.hidden = true;
    video.src = src;
    if (poster) video.poster = poster;
    probeMimeType(src);
  }

  let hideTimer;
  function showHud() {
    hud.classList.remove('hidden');
    clearTimeout(hideTimer);
    if (!video.paused) hideTimer = setTimeout(() => hud.classList.add('hidden'), 3200);
  }
  function toggleHud() {
    if (hud.classList.contains('hidden')) showHud();
    else { hud.classList.add('hidden'); clearTimeout(hideTimer); }
  }
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(say._t);
    say._t = setTimeout(() => toast.classList.remove('show'), 1700);
  }
  function setRate(r) {
    video.playbackRate = r;
    if (r === 1) badge.classList.remove('show');
    else { badge.textContent = r + '×'; badge.classList.add('show'); }
  }
  function flashRipple(side) {
    const el = side === 'R' ? ripR : ripL;
    el.textContent = (side === 'R' ? '+' : '−') + STEP + 's';
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 550);
  }
  function seekBy(d) {
    const d0 = dur();
    if (!d0) return;
    video.currentTime = clamp(video.currentTime + d, 0, d0);
    flashRipple(d > 0 ? 'R' : 'L');
  }

  let lpTimer = null, longPressed = false, tapCount = 0, tapTimer = null, downX = 0, downY = 0;

  stage.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    downX = e.clientX; downY = e.clientY;
    longPressed = false;
    lpTimer = setTimeout(() => {
      longPressed = true;
      setRate(RATE);
      if (navigator.vibrate) navigator.vibrate(12);
    }, 380);
  });
/*
  stage.addEventListener('pointerup', e => {
    clearTimeout(lpTimer);
    if (longPressed) { longPressed = false; setRate(1); return; }
    if (Math.abs(e.clientX - downX) > 14 || Math.abs(e.clientY - downY) > 14) return;

    tapCount++;
    if (tapCount === 1) {
      tapTimer = setTimeout(() => { tapCount = 0; toggleHud(); }, 250);
    } else {
      clearTimeout(tapTimer);
      tapCount = 0;
      const r = stage.getBoundingClientRect();
      seekBy((e.clientX - r.left) < r.width / 2 ? -STEP : STEP);
    }
  });
*/
  stage.addEventListener('pointerup', e => {
    clearTimeout(lpTimer);
    if (longPressed) { longPressed = false; setRate(1); return; }
    if (Math.abs(e.clientX - downX) > 14 || Math.abs(e.clientY - downY) > 14) return;

    tapCount++;
    if (tapCount === 1) {
      tapTimer = setTimeout(() => {
        tapCount = 0;
        togglePlay();   // klik tunggal = play / pause
        showHud();
      }, 250);
    } else {
      clearTimeout(tapTimer);
      tapCount = 0;
      const r = stage.getBoundingClientRect();
      seekBy((e.clientX - r.left) < r.width / 2 ? -STEP : STEP);
      showHud();
    }
  });
  stage.addEventListener('pointercancel', () => {
    clearTimeout(lpTimer);
    if (longPressed) { longPressed = false; setRate(1); }
  });

  let scrubbing = false;
  const ratioFrom = e => {
    const r = track.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  };
  const paint = (t, d) => {
    const p = d ? clamp(t / d, 0, 1) : 0;
    played.style.width = p * 100 + '%';
    knob.style.left = p * 100 + '%';
    tCur.textContent = fmt(t);
  };
  const seekToRatio = p => {
    const d = dur();
    if (!d) return;
    video.currentTime = p * d;
    paint(video.currentTime, d);
  };

  track.addEventListener('pointerdown', e => {
    e.stopPropagation();
    scrubbing = true;
    try { track.setPointerCapture(e.pointerId); } catch {}
    seekToRatio(ratioFrom(e));
    showHud();
  });
  track.addEventListener('pointermove', e => { if (scrubbing) seekToRatio(ratioFrom(e)); });
  track.addEventListener('pointerup', e => {
    if (!scrubbing) return;
    scrubbing = false;
    seekToRatio(ratioFrom(e));
  });
  track.addEventListener('pointercancel', () => { scrubbing = false; });

  function paintBuffer() {
    const d = dur();
    if (!d || !video.buffered.length) return;
    let end = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime + 1) end = Math.max(end, video.buffered.end(i));
    }
    buffered.style.width = clamp(end / d, 0, 1) * 100 + '%';
    if (track.classList.contains('loading')) {
      const pct = Math.round(clamp(end / d, 0, 1) * 100);
      loadPct.textContent = pct + '%';
    }
  }

  video.addEventListener('loadedmetadata', () => { tDur.textContent = fmt(dur()); showHud(); });
  video.addEventListener('durationchange', () => { tDur.textContent = fmt(dur()); });
  video.addEventListener('timeupdate', () => { paint(video.currentTime, dur()); paintBuffer(); });
  video.addEventListener('progress', paintBuffer);
  video.addEventListener('play', () => { stage.classList.add('playing'); btnPlay.innerHTML = ICON.pause; showHud(); });
  video.addEventListener('pause', () => { stage.classList.remove('playing'); btnPlay.innerHTML = ICON.play; showHud(); });
  //video.addEventListener('play', () => { btnPlay.innerHTML = ICON.pause; showHud(); });
  //video.addEventListener('pause', () => { btnPlay.innerHTML = ICON.play; showHud(); });
  video.addEventListener('ended', showHud);
  video.addEventListener('waiting', () => track.classList.add('loading'));
  video.addEventListener('playing', () => track.classList.remove('loading'));
  video.addEventListener('canplay', () => track.classList.remove('loading'));
  video.addEventListener('canplaythrough', () => track.classList.remove('loading'));
  const ERR_MSG = {
    1: 'Putaran dibatalkan oleh pengguna.',
    2: 'Gagal mengambil data video (jaringan).',
    3: 'Gagal mendekode video (format tidak didukung / rusak).',
    4: 'Format video tidak didukung oleh browser.'
  };
  const VIDEO_MIME = ['video/mp4', 'video/webm', 'video/ogg', 'video/x-matroska', 'application/x-mpegURL', 'application/vnd.apple.mpegurl', 'application/dash+xml'];

  function isVideoMime(type) {
    if (!type) return false;
    return VIDEO_MIME.some(m => type.toLowerCase().startsWith(m.split('/')[0] + '/') || type.toLowerCase().startsWith(m));
  }

  async function probeMimeType(src) {
    if (!src) return;
    try {
      const res = await fetch(src, { method: 'HEAD', mode: 'cors' });
      const ct = res.headers.get('content-type') || '';
      console.debug('[player] probe HEAD', src, '->', ct, res.status);
      if (res.status >= 400) {
        say('Server merespon ' + res.status + ' (' + res.statusText + ')');
      } else if (!isVideoMime(ct)) {
        say('Server mengirim tipe bukan video: ' + ct || '(kosong)');
      }
    } catch (err) {
      // CORS atau jaringan memblokir pemeriksaan HEAD — tidak perlu memunculkan toast,
      // karena video elemen masih bisa memutar cross-origin tanpa CORS.
      console.debug('[player] probe dibatalkan (CORS/jaringan):', err);
    }
  }

  const NET_STATE = {
    0: 'EMPTY (belum ada data)',
    1: 'IDLE (siap, belum dimuat)',
    2: 'LOADING (mengunduh data)',
    3: 'NO_SOURCE (tidak ada sumber)'
  };
  const READY_STATE = {
    0: 'HAVE_NOTHING',
    1: 'HAVE_METADATA',
    2: 'HAVE_CURRENT_DATA',
    3: 'HAVE_FUTURE_DATA',
    4: 'HAVE_ENOUGH_DATA'
  };

  function errorDiagnosis() {
    const e = video.error;
    const ct = video.currentType || '';
    const src = video.currentSrc || '';
    const isCrossOrigin = src && new URL(src, location.href).origin !== location.origin;

    console.group('▶ [player] video error');
    console.log('code        :', e.code);
    console.log('msg         :', e.message || '-');
    console.log('src         :', src);
    console.log('type        :', ct);
    console.log('networkState:', video.networkState, '(' + NET_STATE[video.networkState] + ')');
    console.log('readyState  :', video.readyState, '(' + READY_STATE[video.readyState] + ')');
    console.log('crossOrigin :', isCrossOrigin);
    console.groupEnd();

    let desc = ERR_MSG[e.code] || 'Terjadi kesalahan saat memutar video.';
    let saran = '';

    if (e.code === 4) {
      if (!ct) {
        desc = 'Browser tidak menerima tipe konten video dari server.';
        saran = 'Pastikan URL langsung ke file video (bukan halaman HTML) dan server mengirim Content-Type video/mp4.';
      } else if (!isVideoMime(ct)) {
        desc = 'Server mengirim tipe bukan video: ' + ct;
        saran = 'URL mungkin mengarah ke halaman HTML alih-alih file video.';
      } else {
        desc = 'Codec video dalam file ini tidak didukung oleh browser.';
        saran = 'Gunakan MP4 dengan codec H.264 + AAC untuk kompatibilitas terbaik.';
      }
    } else if (e.code === 2) {
      if (isCrossOrigin) {
        desc = 'Gagal mengambil data video (jaringan / diblokir server).';
        saran = 'Server mungkin memblokir pemutaran langsung dari luar (hotlink protection). Coba buka URL di tab browser terlebih dahulu.';
      } else {
        desc = 'Gagal mengambil data video (jaringan).';
        saran = 'Periksa koneksi internet dan apakah URL masih aktif.';
      }
    } else if (e.code === 3) {
      desc = 'Gagal mendekode video (format tidak didukung / rusak).';
      saran = 'File mungkin rusak atau codec tidak didukung browser.';
    } else if (e.code === 1) {
      desc = 'Putaran dibatalkan oleh pengguna.';
    }

    if (video.networkState === 3) {
      saran += ' (Sumber video tidak ditemukan / tidak valid.)';
    }

    const msg = e.message ? desc + ' (' + e.message + ')' : desc;
    const full = saran ? msg + ' ' + saran : msg;
    say(full);

    // Alihkan ke URL video asli setelah player gagal
    const target = video.currentSrc || '';
    if (target) {
      setTimeout(() => {
        location.href = target;
      }, 2000);
    }
  }
  video.addEventListener('error', errorDiagnosis);
  video.addEventListener('loadedmetadata', () => { tDur.textContent = fmt(dur()); showHud(); });
  video.addEventListener('contextmenu', e => e.preventDefault());

  function bind(el, fn) {
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => { e.stopPropagation(); fn(); });
  }

  async function togglePlay() {
    if (video.paused) {
      console.debug('[player] play() src=', video.currentSrc);
      try { await video.play(); } catch (err) {
        console.debug('[player] play() rejected:', err);
        if (video.error) errorDiagnosis();
        else say('Tidak bisa memutar video');
      }
    } else video.pause();
  }

  function toggleMute() {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    btnMute.innerHTML = video.muted ? ICON.mute : ICON.vol;
    say(video.muted ? 'Suara mati' : 'Suara aktif');
  }

  let rotated = false;
  function toggleRotate() {
    rotated = !rotated;
    stage.classList.toggle('rotated', rotated);
    say(rotated ? 'Orientasi diputar' : 'Orientasi normal');
    showHud();
  }

  async function toggleFullscreen() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (!fsEl) {
        if (stage.requestFullscreen) await stage.requestFullscreen({ navigationUI: 'hide' });
        else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } catch { say('Layar penuh tidak didukung'); }
    showHud();
  }

  async function download() {
    if (!src) return;
    const name = fileName(src);
    try {
      const res = await fetch(src, { mode: 'cors' });
      if (!res.ok) throw new Error('fetch gagal');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 15000);
      say('Mengunduh…');
    } catch {
      // CORS diblokir oleh server — fallback: buka/download langsung via tautan.
      const a = document.createElement('a');
      a.href = src;
      a.download = name;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
      say('Membuka video di tab baru (CORS diblokir)');
    }
  }

  bind(btnPlay, togglePlay);
  bind(btnMute, toggleMute);
  bind(btnRotate, toggleRotate);
  bind(btnFs, toggleFullscreen);
  bind(btnDl, download);

  btnSpeed.addEventListener('pointerdown', e => {
    e.stopPropagation();
    e.preventDefault();
    btnSpeed.classList.add('active');
    setRate(RATE);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t =>
    btnSpeed.addEventListener(t, () => {
      btnSpeed.classList.remove('active');
      setRate(1);
    })
  );

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key;
    if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
    else if (k === 'ArrowRight') { e.preventDefault(); seekBy(5); }
    else if (k === 'ArrowLeft') { e.preventDefault(); seekBy(-5); }
    else if (k === 'l') seekBy(10);
    else if (k === 'j') seekBy(-10);
    else if (k === 'm') toggleMute();
    else if (k === 'f') toggleFullscreen();
    else if (k === 'r') toggleRotate();
    else if (k === 'd') download();
  });

  $('form').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('urlInput').value.trim();
    if (v) location.search = '?url=' + encodeURIComponent(v);
  });
})();