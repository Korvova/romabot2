// webapp/src/App.jsx
import { useRef, useState } from 'react';
import './index.css';

function App() {
  const [log, setLog] = useState([]);
  const [started, setStarted] = useState(false);
  const pcRef    = useRef(null);
  const dcRef    = useRef(null);
  const wsRef    = useRef(null);
  const audioRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const addLog = txt => setLog(l => [...l, txt]);

  const start = async () => {
    if (started) return;
    setStarted(true);
    addLog('⏳ Loading config…');

    // 1) Загружаем assistant.txt и tools.json
    const [{ instructions }, { tools: userTools }] = await Promise.all([
      fetch('/2/get-assistant').then(r => r.json()),
      fetch('/2/get-tools').then(r => r.json())
    ]);
    const assistantTxt = (instructions || '').trim();

console.log('🔑 Loaded assistantTxt:', assistantTxt);
addLog(`🔑 assistantTxt: ${assistantTxt}`);


    const hasQR = userTools.some(f => f.name === 'show_qr_code');
    const tools = hasQR
      ? userTools
      : [{
          type:'function',
          name:'show_qr_code',
          description:'Показать QR‑код',
          parameters:{ type:'object', properties:{ qrUrl:{type:'string'}}, required:['qrUrl'] }
        }].concat(userTools);

    addLog('✅ Config loaded');

    // 2) Динамический URL для WS
    const loc = window.location;
    const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${loc.host}${loc.pathname}ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Ждём открытия WS, потом шлём offer
    ws.onopen = () => {
      addLog('🔌 WS open');
    };
    ws.onerror = () => addLog('⚠️ WS error');
    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.type === 'answer') {
        addLog('← got SDP answer');
        await pcRef.current.setRemoteDescription({ type:'answer', sdp: msg.sdp });
      }
    };

    // 3) RTCPeerConnection и микрофон
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

    // 4) DataChannel для OpenAI
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




    if (ev.type === 'response.content_part.added') {
       setIsSpeaking(true);
     }
     // Частичная распечатка аудио‑текста (если нужно подсветить речь)
    if (ev.type === 'response.audio_transcript.delta') {
       setIsSpeaking(true);
       addLog(`Roma: ${ev.delta}`);
     }
    // Когда OpenAI завершил говорить
     if (ev.type === 'output_audio_buffer.stopped') {
       setIsSpeaking(false);
     }



    };

    // 5) SDP handshake
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    addLog('→ sending SDP offer');
    // Отправляем оффер только после открытия WS
    ws.onopen = () => {
      addLog('🔌 WS open');
      ws.send(JSON.stringify({ type:'offer', sdp: offer.sdp }));
    };
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




      <div id="controls">
        <button onClick={start} disabled={started}>Start Talking</button>
        <button onClick={stop}   disabled={!started}>Stop</button>
        <div id="log">{log.map((l,i)=><p key={i}>{l}</p>)}</div>
      </div>

      <audio ref={audioRef} autoPlay style={{ display:'none' }} />
    </div>
  );
}

export default App;
