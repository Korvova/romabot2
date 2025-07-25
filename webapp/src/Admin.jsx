// webapp/src/Admin.jsx
import { useEffect, useState } from 'react';

export default function Admin() {
  const [instructions, setInstructions] = useState('');
  const [toolsJson, setToolsJson] = useState('[]');
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/2/admin/settings')
      .then(r => r.json())
      .then(data => {
        setInstructions(data.instructions);
        setToolsJson(JSON.stringify(data.tools, null, 2));
      });
  }, []);

  const save = () => {
    let tools;
    try {
      tools = JSON.parse(toolsJson);
    } catch {
      setStatus('❌ Invalid JSON');
      return;
    }
    fetch('/2/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions, tools })
    })
    .then(r => r.json())
    .then(res => {
      if (res.success) setStatus('✔ Saved');
      else            setStatus('❌ Error');
    });
  };

  return (
    <div style={{ padding: 20, color: '#eee', background: '#222', minHeight:'100vh' }}>
      <h1>🛠 RomaBot2 Admin</h1>
      <h2>System Prompt</h2>
      <textarea
        value={instructions}
        onChange={e => setInstructions(e.target.value)}
        rows={6}
        style={{ width:'100%', fontFamily:'monospace' }}
      />
      <h2>Tools (JSON array)</h2>
      <textarea
        value={toolsJson}
        onChange={e => setToolsJson(e.target.value)}
        rows={10}
        style={{ width:'100%', fontFamily:'monospace' }}
      />
      <br/>
      <button onClick={save} style={{ marginTop:10 }}>Save</button>
      <span style={{ marginLeft:10 }}>{status}</span>
    </div>
  );
}
