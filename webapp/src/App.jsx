// webapp/src/App.jsx
import { useRef, useState } from 'react';
import { initWakeListener } from './wakeListener.js';
import './index.css';

const pendingCallRef = { current: null };
const SLEEP_KEYWORDS = ['рома спящий режим', 'рома спи', 'roma sleep'];

/* ─────────────────────────────────────────────
 *  1) Утилита: показать QR‑код
 * ────────────────────────────────────────────*/
function showQr(src = '/2/qr.png', ms = 10_000) {
  const img = document.getElementById('qr-img');
  if (!img) return;
  img.src = src;
  img.style.display = 'block';
  setTimeout(() => { img.style.display = 'none'; }, ms);
}

/* ─────────────────────────────────────────────
 *  2) Встроенные tool‑handlers
 * ────────────────────────────────────────────*/
const builtinHandlers = {
  show_qr_code: ({ qrUrl }) => {
    const url = qrUrl?.startsWith('/2/') ? qrUrl : `/2${qrUrl || '/qr.png'}`;
    showQr(url);
    return { ok: true };
  },

  // 💤 Перевод ассистента в спящий режим
  stop_roma: () => {
    if (typeof window.pauseRoma === 'function') {
      window.pauseRoma();
      console.log('🛌 stop_roma: Roma is sleeping');
      return { ok: true };
    }
    console.warn('stop_roma: pauseRoma is not ready');
    return { ok: false, error: 'not_ready' };
  }
};

/* ─────────────────────────────────────────────
 *  3) Вызов сторонних функций (admin tools)
 * ────────────────────────────────────────────*/
async function runTool(name, args, tools) {
  if (builtinHandlers[name]) return builtinHandlers[name](args);

  const fn = tools.find(f => f.name === name);
  if (!fn?.meta?.endpoint) throw new Error(`Function ${name} has no endpoint`);

  const res = await fetch(fn.meta.endpoint, {
    method : fn.meta.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body   : fn.meta.method === 'POST' ? JSON.stringify(args) : undefined
  });
  return res.json();
}

/* ─────────────────────────────────────────────
 *  4) Завершение function_call
 * ────────────────────────────────────────────*/
async function finishCall(dc, tools) {
  const call = pendingCallRef.current;
  if (!call) return;

  try {
    const json   = call.args.join('');
    const args   = json ? JSON.parse(json) : {};
    const output = await runTool(call.name, args, tools);

    dc.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type   : 'function_call_output',
        call_id: call.call_id,
        output : JSON.stringify(output)
      }
    }));
    dc.send(JSON.stringify({ type: 'response.create' }));
  } catch (e) {
    console.error('finishCall error', e);
  } finally {
    pendingCallRef.current = null;
  }
}

/* ─────────────────────────────────────────────
 *  5) React‑компонент
 * ────────────────────────────────────────────*/
export default function App() {
  const [log, setLog]         = useState([]);
  const [started, setStarted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hidden, setHidden]   = useState(false);   // ← новое состояние


  const pcRef     = useRef(null);
  const dcRef     = useRef(null);
  const wsRef     = useRef(null);
  const audioRef  = useRef(null);
  const senderRef = useRef(null);   // RTCRtpSender (audio)
  const wakeRef   = useRef(null);   // активный wake‑listener

  const addLog = txt => setLog(prev => [...prev, txt]);

  /* ─────────────────────────────────────────────
   *  Переходы режимов: pause / resume
   * ────────────────────────────────────────────*/
  let sleeping = false;          // текущее состояние

  const pauseRealtime = () => {
    if (sleeping) {
      addLog('🟡 Already sleeping');
      return;
    }
    if (!senderRef.current) {
      addLog('⚠️ pauseRealtime: sender not ready');
      return;
    }
    sleeping = true;

    // ⛔ остановить передачу аудио
    const oldTrack = senderRef.current.track;
    try {
      senderRef.current.replaceTrack(null);
      addLog('🔇 RTP stream muted (replaceTrack → null)');
      oldTrack && oldTrack.stop();
      addLog('🛑 Old mic track stopped');
    } catch (e) {
      addLog(`❌ pauseRealtime error: ${e.message}`);
    }

    // 👂 запустить wake‑listener
    if (!wakeRef.current) {
      wakeRef.current = initWakeListener({
        lang  : 'ru-RU',
        onWake: resumeRealtime
      });
      addLog('👂 Wake‑listener started — ждём слово «рома»');
    }
  };

  const resumeRealtime = async () => {
    if (!sleeping) {
      addLog('🟢 Already awake');
      return;
    }
    sleeping = false;

    // 1) остановить wake‑listener
    if (wakeRef.current) {
      wakeRef.current.stop();
      wakeRef.current = null;
      addLog('🔕 Wake‑listener stopped');
    }

    // 2) прикрепить новый аудиотрек
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const newTrack = stream.getAudioTracks()[0];
      await senderRef.current.replaceTrack(newTrack);
      addLog('🎤 New mic track attached (resume real‑time)');
    } catch (e) {
      addLog(`❌ resumeRealtime error: ${e.message}`);
    }
  };

  // делаем доступным для builtinHandlers
  window.pauseRoma = pauseRealtime;

  /* ─────────────────────────────────────────────
   *  Старт
   * ────────────────────────────────────────────*/
  const start = async () => {
    if (started) return;
    setStarted(true);
    addLog('⏳ Loading config…');

    /* 1) prompt & tools ---------------------------------- */
    const [{ instructions }, { tools: userTools }] = await Promise.all([
      fetch('/2/get-assistant').then(r => r.json()),
      fetch('/2/get-tools').then(r => r.json())
    ]);

    const assistantTxt = (instructions || '').trim();
    addLog(`🔑 Prompt: ${assistantTxt || '(empty)'}`);

    const hasQR   = userTools.some(f => f.name === 'show_qr_code');
    const hasStop = userTools.some(f => f.name === 'stop_roma');

    const tools = [
      ...userTools,
      ...(!hasQR && [{
        type       : 'function',
        name       : 'show_qr_code',
        description: 'Показать QR‑код',
        parameters : {
          type: 'object',
          properties: { qrUrl: { type: 'string' } },
          required: ['qrUrl']
        }
      }]),
      ...(!hasStop && [{
        type       : 'function',
        name       : 'stop_roma',
        description: 'Усыпить ассистента (остановить аудио и включить wake‑listener)',
        parameters : { type: 'object', properties: {}, required: [] }
      }])
    ].flat();

    addLog('✅ Config loaded');

    /* 2) WebSocket (signalling) --------------------------- */
    const loc   = window.location;
    const wsUrl = `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}${loc.pathname}ws`;
    const ws    = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen  = () => addLog('🔌 WS open');
    ws.onerror = () => addLog('⚠️ WS error');
    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.type === 'answer') {
        addLog('← SDP answer received');
        await pcRef.current.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      }
    };

    /* 3) RTCPeerConnection + Mic -------------------------- */
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pcRef.current = pc;

    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const micTrack  = micStream.getAudioTracks()[0];
    senderRef.current = pc.addTrack(micTrack);
    addLog('🎤 Mic added to PC');

    pc.ontrack = e => {
      audioRef.current.srcObject = e.streams[0];
      addLog('🎧 Remote audio stream attached');
      setIsSpeaking(true);
      setTimeout(() => setIsSpeaking(false), 1_500);
    };

    /* 4) DataChannel for OpenAI --------------------------- */
    const dc = pc.createDataChannel('oai-events');
    dcRef.current = dc;

    dc.onopen = () => {
      addLog('📡 DC open — sending session.update');

      const oaTools = tools.map(({ type, name, description, parameters }) => ({
        type, name, description, parameters
      }));

      dc.send(JSON.stringify({
        type: 'session.update',
        session: {
          instructions: assistantTxt,
          voice: 'alloy',
          turn_detection: { type: 'server_vad' },
          input_audio_transcription: { model: 'whisper-1' },
          output_audio_format: 'pcm16',
          modalities: ['text', 'audio'],
          tools: oaTools,
          tool_choice: 'auto'
        }
      }));

      // сразу переходим в "спящий" режим
      pauseRealtime();
    };

    dc.onmessage = ({ data }) => {
      const ev = JSON.parse(data);

      /* function_call flow ------------------------------- */
      if (ev.type === 'response.output_item.added' && ev.item?.type === 'function_call') {
        pendingCallRef.current = { call_id: ev.item.call_id, name: ev.item.name, args: [] };
        return;
      }
      if (ev.type === 'response.function_call_arguments.delta' && pendingCallRef.current) {
        pendingCallRef.current.args.push(ev.delta || '');
        return;
      }
      if (ev.type === 'response.function_call_arguments.done' && pendingCallRef.current) {
        finishCall(dc, tools);
        return;
      }

      /* анимации / логи --------------------------------- */
      if (ev.type === 'response.content_part.added') setIsSpeaking(true);

      if (ev.type === 'response.audio_transcript.delta') {
        const snippet = ev.delta.toLowerCase().trim();
        addLog(`🎙️ YOU: ${snippet}`);

        if (SLEEP_KEYWORDS.some(k => snippet.includes(k))) {
          addLog('😴 Voice cmd detected — going to sleep');
          pauseRealtime();
        }
      }

      if (ev.type === 'output_audio_buffer.stopped') setIsSpeaking(false);
    };

    /* 5) SDP handshake ----------------------------------- */
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    addLog('→ Sending SDP offer');

    ws.onopen = () => ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
  };

  /* ─────────────────────────────────────────────
   *  Stop — полный disconnect
   * ────────────────────────────────────────────*/
  const stop = () => {
    wakeRef.current?.stop();
    wakeRef.current = null;
    senderRef.current = null;

    dcRef.current?.close();
    pcRef.current?.close();
    wsRef.current?.close();

    setStarted(false);
    setIsSpeaking(false);
    addLog('🛑 Stopped (full disconnect)');
  };

  /* ─────────────────────────────────────────────
   *  UI
   * ────────────────────────────────────────────*/
  return (
    <div className="app-container">
      <img
        id="silent-avatar"
        src="/2/roma-silent.gif"
        className="avatar silent"
        style={{ zIndex: isSpeaking ? 0 : 1 }}
      />
      <img
        id="speak-avatar"
        src="/2/roma-speak.gif"
        className="avatar speaking"
        style={{ zIndex: isSpeaking ? 1 : 0 }}
      />

      {/* QR‑картинка */}
      <img
        id="qr-img"
        src="/2/qr.png"
        alt="QR Code"
        style={{
          display: 'none',
          position: 'fixed',
          inset: 0,
          margin: 'auto',
          maxWidth: '60vmin',
          maxHeight: '60vmin',
          zIndex: 1_000,
          background: 'rgba(0,0,0,0.8)'
        }}
      />

     <div
   id="controls"
   style={{ display: hidden ? 'none' : 'block' }}   // <-- прячем всю панель
 >




        <button onClick={start} disabled={started}>Start Talking</button>
        <button onClick={stop}   disabled={!started}>Stop</button>
        <button onClick={() => setHidden(!hidden)}>
          {hidden ? 'Show' : 'Hide'}
        </button>



        <div id="log">
          {log.map((t, i) => <p key={i}>{t}</p>)}
        </div>
      </div>

 {/* прозрачная «Show», видна только при скрытой панели */}
      {hidden && (
        <button
          className="toggle-btn"
          onClick={() => setHidden(false)}
        >
          Show
        </button>
      )}

      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
    </div>
  );
}
