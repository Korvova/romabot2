// webapp/src/App.jsx
import { useEffect, useRef, useState } from 'react';


function App() {
  const [log, setLog] = useState([]);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [started, setStarted] = useState(false);
  const wsRef = useRef(null);
  const pendingCallRef = useRef(null);
  const audioRef = useRef(null);

  // Инициализация WS при нажатии «Start»
  const start = () => {
    if (wsRef.current) return;
    setStarted(true);
    const ws = new WebSocket('ws://localhost:3002/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      addLog('🔌 Connected');
      // шлём первый оффер, например
      ws.send(JSON.stringify({ type: 'offer', sdp: '<SDP‑offer‑здесь>' }));
    };

    ws.onmessage = (evt) => {
      const data = evt.data;
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'answer') {
          addLog('← получен SDP‑ответ');
          // тут можно продолжить handshake, а пока эхо:
          return;
        }
      } catch {
        // не JSON — возможно бинарный поток
      }
      addLog(`← ${data}`);
      // переключаем анимацию говорения
      const speakImg = document.getElementById('speak-avatar');
      const silentImg = document.getElementById('silent-avatar');
      speakImg.style.zIndex = '1';
      silentImg.style.zIndex = '0';
      setTimeout(() => {
        speakImg.style.zIndex = '0';
        silentImg.style.zIndex = '1';
      }, 1500);
    };

    ws.onclose = () => addLog('❌ Disconnected');
    ws.onerror = () => addLog('⚠️ Error');
  };

  const stop = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setStarted(false);
    addLog('Stopped');
  };

  const addLog = (t) => {
    setLog(l => [...l, t]);
  };

  const toggleControls = () => {
    setControlsHidden(h => !h);
  };

  return (
    <div style={{ margin: 0, height: '100vh', overflow: 'hidden', background: '#000' }}>
      <div id="video-container">
        <img id="silent-avatar" src="/roma-silent.gif" alt="silent" />
        <img id="speak-avatar" src="/roma-speak.gif" alt="speak" />
      </div>

      <div id="controls" className={controlsHidden ? 'hidden' : ''}>
        <button id="toggle-controls" onClick={toggleControls}>
          {controlsHidden ? 'Показать' : 'Скрыть'}
        </button>
        <h1>Roma Assistant</h1>
        <button id="start" onClick={start} disabled={started}>Start Talking</button>
        <button id="stop" onClick={stop} disabled={!started}>Stop</button>
        <div id="log">
          {log.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      </div>

      <audio id="audio" ref={audioRef} autoPlay style={{ display: 'none' }} />
    </div>
  );
}

export default App;
