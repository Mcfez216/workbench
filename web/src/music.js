// Music: YouTube Music's own player in a tab, so it keeps playing while you
// work. In the desktop app it's an isolated web view (its own cookies, no
// access to the rest of the app); in a browser it opens in a normal tab.

import { h, toast } from './ui.js';
import { call } from './rpc.js';
import { tabs, command, status } from './layout.js';

const inElectron = /\bElectron\//.test(navigator.userAgent);
let url = 'https://music.youtube.com/';
export function setMusicUrl(u) { if (/^https:\/\/(music|www)\.youtube\.com\//.test(u || '')) url = u; }

// Under WSL, sound from inside the app crackles (it goes through WSLg's
// remote-desktop audio): by default Music opens in its own Windows window,
// an Edge "app" window with no tabs or address bar, playing through
// Windows' own audio. Settings → Music can keep it inside the app.
let where = 'auto';
let wsl = false;
export function setMusicWhere(w, isWsl) { where = w || 'auto'; wsl = !!isWsl; }

async function openWindowsPlayer() {
  try {
    await call('music.windows', { url });
    status.set('music', '♪ in its own window', { order: 70, title: 'YouTube Music is playing in its own Windows window (Settings → Music)' });
    toast('YouTube Music opened in its own window, playing through Windows (no crackle). Your media keys work there.', 'ok', 7000);
    return true;
  } catch (err) {
    toast(`${err.message}. Playing inside the app instead.`, 'info', 7000);
    return false;
  }
}

async function openMusic(how) {
  if (inElectron && wsl && where !== 'app' && how !== 'inside') {
    if (how === 'restore') return;     // don't open a window every time the app starts
    if (await openWindowsPlayer()) return;
  }
  if (!inElectron) {
    if (how === 'restore') return;     // don't pop a browser tab every time the window loads
    window.open(url, '_blank', 'noopener');
    toast('Opened YouTube Music in your browser. In the desktop app (npm start) it plays inside a tab.', 'info', 6000);
    return;
  }
  tabs.open({
    id: 'music', kind: 'music', title: '♪ Music', session: { kind: 'music' },
    render(el) {
      const wv = document.createElement('webview');
      wv.setAttribute('partition', 'persist:music');
      wv.setAttribute('src', url);     // no allowpopups: links that open windows go to your browser
      const btn = (label, title, fn) => h('button', { class: 'btn small', type: 'button', title, onclick: fn }, label);
      const title = h('span', { class: 'grow', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, 'YouTube Music');
      const play = btn('Play/Pause', 'Play or pause (the media keys on your keyboard work too)', () => {
        wv.executeJavaScript('(() => { const v = document.querySelector("video"); if (!v) return false; if (v.paused) v.play(); else v.pause(); return true; })()')
          .then((ok) => { if (!ok) toast('Pick something to play first'); }).catch(() => {});
      });
      el.append(h('div', { class: 'music' },
        h('div', { class: 'toolbar' },
          btn('◄', 'Back', () => wv.canGoBack() && wv.goBack()),
          btn('►', 'Forward', () => wv.canGoForward() && wv.goForward()),
          btn('Home', 'YouTube Music home', () => wv.loadURL(url)),
          play, title,
          btn('Open in browser', 'Open this page in your web browser', () => window.open(wv.getURL(), '_blank', 'noopener'))),
        h('div', { class: 'music-host' }, wv)));
      let playing = false, name = '';
      const show = () => status.set('music', playing && name ? `♪ ${name.slice(0, 40)}` : '', { order: 70, title: name, onclick: () => tabs.focus('music') });
      wv.addEventListener('page-title-updated', (e) => {
        name = e.title.replace(/\s*-\s*YouTube Music\s*$/, '').trim();
        title.textContent = e.title;
        show();
      });
      wv.addEventListener('media-started-playing', () => { playing = true; show(); });
      wv.addEventListener('media-paused', () => { playing = false; show(); });
      wv.addEventListener('did-fail-load', (e) => { if (e.errorCode !== -3) title.textContent = `Couldn't load (${e.errorDescription}). Check your internet connection.`; });
      this.wv = wv;
    },
    onClose() { status.set('music', ''); },
  });
}

export function initMusic() {
  command('music.open', 'Music', [], (how) => openMusic(how));
  command('music.inside', 'Music: play inside the app', [], () => openMusic('inside'));
}
