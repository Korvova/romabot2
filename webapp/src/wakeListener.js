// webapp/src/wakeListener.js
export function initWakeListener({ onWake, lang = 'ru-RU' }) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('WakeListener: SpeechRecognition не поддерживается');
    return { stop: () => {} };
  }

  let alive = true;               // <— флаг активности
  const recog = new SpeechRecognition();
  recog.lang            = lang;
  recog.continuous      = true;
  recog.interimResults  = false;
  recog.maxAlternatives = 1;

  recog.onresult = (event) => {
    if (!alive) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        const text = event.results[i][0].transcript.trim().toLowerCase();
        console.log('⏳ ASR:', text);
        if (text.includes('рома')) onWake();
      }
    }
  };

  recog.onerror = (e) => {
    if (!alive) return;           // ошибки после stop() не логируем
    console.error('WakeListener ASR error', e);
  };

  recog.onend = () => {
    if (alive) recog.start();     // перезапуск только когда alive=true
  };

  recog.start();

  return {
    stop() {
      alive = false;              // ← выключаем автоматический ребут
      recog.onend = null;         // убираем перезапуск
      try { recog.stop(); } catch {}
    }
  };
}
