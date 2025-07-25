// webapp/src/App.jsx
import { useRef, useState } from 'react';
import './index.css';

const pendingCallRef = { current: null };

// 1) Показ QR‑кода
function showQr(src = '/2/qr.png', ms = 10000) {
  const img = document.getElementById('qr-img');
  if (!img) return;
  img.src = src;
  img.style.display = 'block';
  setTimeout(() => {
    img.style.display = 'none';
  }, ms);
}

// 2) Встроенные обработчики
const builtinHandlers = {
  show_qr_code: ({ qrUrl }) => {
  const url = qrUrl?.startsWith('/2/') ? qrUrl : `/2${qrUrl || '/qr.png'}`;
showQr(url);
    return { ok: true };
  }
};

// 3) Универсальный раннер (админские функции)
async function runTool(name, args, tools) {
  if (builtinHandlers[name]) {
    return builtinHandlers[name](args);
  }
  const fn = tools.find(f => f.name === name);
  if (!fn?.meta?.endpoint) {
    throw new Error(`Function ${name} has no endpoint`);
  }
  const res = await fetch(fn.meta.endpoint, {
    method: fn.meta.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: fn.meta.method === 'POST' ? JSON.stringify(args) : undefined
  });
  return res.json();
}

// 4) Завершение function_call
async function finishCall(dc, tools) {
  const call = pendingCallRef.current;
  if (!call) return;
  try {
    const json = call.args.join('');
    const args = json ? JSON.parse(json) : {};
    const output = await runTool(call.name, args, tools);

    dc.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(output)
      }
    }));
    dc.send(JSON.stringify({ type: 'response.create' }));
  } catch (e) {
    console.error('finishCall error', e);
  } finally {
    pendingCallRef.current = null;
  }
}

export default function App() {
  const [log, setLog] = useState([]);
  const [started, setStarted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const pcRef    = useRef(null);
  const dcRef    = useRef(null);
  const wsRef    = useRef(null);
  const audioRef = useRef(null);

  const addLog = txt => setLog(l => [...l, txt]);

  const start = async () => {
    if (started) return;
    setStarted(true);
    addLog('⏳ Loading config…');

    // ─── 1) Load prompt & tools ─────────────────────────────
    const [{ instructions }, { tools: userTools }] = await Promise.all([
      fetch('/2/get-assistant').then(r => r.json()),
      fetch('/2/get-tools').then(r => r.json())
    ]);
    const assistantTxt = (instructions || '').trim();
    addLog(`🔑 Prompt: ${assistantTxt}`);

    const hasQR = userTools.some(f => f.name === 'show_qr_code');
    const tools = hasQR
      ? userTools
      : [{
          type: 'function',
          name: 'show_qr_code',
          description: 'Показать QR‑код',
          parameters: { type:'object', properties:{ qrUrl:{type:'string'}}, required:['qrUrl'] }
        }].concat(userTools);
    addLog('✅ Config loaded');

    // ─── 2) WebSocket ────────────────────────────────────────
    const loc = window.location;
    const wsUrl = `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}${loc.pathname}ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen    = () => addLog('🔌 WS open');
    ws.onerror   = () => addLog('⚠️ WS error');
    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.type === 'answer') {
        addLog('← got SDP answer');
        await pcRef.current.setRemoteDescription({ type:'answer', sdp: msg.sdp });
      }
    };

    // ─── 3) RTCPeerConnection + Mic ─────────────────────────
    const pc = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] });
    pcRef.current = pc;
    const mic = await navigator.mediaDevices.getUserMedia({ audio:true });
    pc.addTrack(mic.getTracks()[0]);
    addLog('🎤 Mic added');
    pc.ontrack = e => {
      audioRef.current.srcObject = e.streams[0];
      addLog('🎧 Remote audio');
      setIsSpeaking(true);
      setTimeout(()=>setIsSpeaking(false),1500);
    };

    // ─── 4) DataChannel for OpenAI ─────────────────────────
    const dc = pc.createDataChannel('oai-events');
    dcRef.current = dc;
    dc.onopen = () => {
      addLog('📡 DC open');
      const oaTools = tools.map(({ type,name,description,parameters })=>({ type,name,description,parameters }));
      dc.send(JSON.stringify({
        type: 'session.update',
        session: {
          instructions: assistantTxt,
          voice: 'alloy',
          turn_detection: { type:'server_vad' },
          input_audio_transcription: { model:'whisper-1' },
          output_audio_format: 'pcm16',
          modalities: ['text','audio'],
          tools: oaTools,
          tool_choice: 'auto'
        }
      }));
    };
    dc.onmessage = ({ data }) => {
      const ev = JSON.parse(data);

      // === function_call flow ===
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

      // === animation & logs ===
      if (ev.type === 'response.content_part.added')     setIsSpeaking(true);
      if (ev.type === 'response.audio_transcript.delta') addLog(`Roma: ${ev.delta}`);
      if (ev.type === 'output_audio_buffer.stopped')     setIsSpeaking(false);
    };

    // ─── 5) SDP handshake ────────────────────────────────────
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    addLog('→ sending SDP offer');
    ws.onopen = () => ws.send(JSON.stringify({ type:'offer', sdp:offer.sdp }));
  };

  const stop = () => {
    dcRef.current?.close();
    pcRef.current?.close();
    wsRef.current?.close();
    setStarted(false);
    setIsSpeaking(false);
    addLog('🛑 Stopped');
  };

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

      {/* QR-картинка: */}
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
          zIndex: 1000,
          background: 'rgba(0,0,0,0.8)'
        }}
      />

      <div id="controls">
        <button onClick={start} disabled={started}>Start Talking</button>
        <button onClick={stop}   disabled={!started}>Stop</button>
        <div id="log">{log.map((t,i)=><p key={i}>{t}</p>)}</div>
      </div>
      <audio ref={audioRef} autoPlay style={{ display:'none' }} />
    </div>
  );
}
