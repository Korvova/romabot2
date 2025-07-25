// webapp/src/Admin.jsx
import { useEffect, useState } from 'react';

export default function Admin() {
  const [instructions, setInstructions] = useState('');
  const [funcRows, setFuncRows]       = useState([]);  // массив объектов { name, description, method, endpoint }
  const [status, setStatus]           = useState('');

  // Загрузить из БД prompt + tools
  useEffect(() => {
    fetch('/2/admin/settings')
      .then(r => r.json())
      .then(data => {
        setInstructions(data.instructions || '');
        // data.tools — это уже массив объектов вида { type, name, description, parameters, meta:{method,endpoint} }
        // Преобразуем его в наш формат строк:
        const rows = (data.tools || []).map(f => ({
          name       : f.name,
          description: f.description,
          method     : f.meta?.method   || 'GET',
          endpoint   : f.meta?.endpoint || ''
        }));
        setFuncRows(rows);
      });
  }, []);

  // Добавить пустую строку
  const addRow = () => {
    setFuncRows(r => [...r, { name:'', description:'', method:'GET', endpoint:'' }]);
  };

  // Удалить строку
  const removeRow = idx => {
    setFuncRows(r => r.filter((_,i) => i!==idx));
  };

  // Обработчик изменения ячейки
  const updateRow = (idx, field, value) => {
    setFuncRows(r => {
      const nr = [...r];
      nr[idx] = { ...nr[idx], [field]: value };
      return nr;
    });
  };

  // Сохранить
  const save = async () => {
    // Подготовить tools из таблицы
    const tools = funcRows
      .filter(f => f.name.trim())
      .map(f => ({
        type       : 'function',
        name       : f.name.trim(),
        description: f.description.trim(),
        parameters : { type:'object', properties:{}, required:[] },
        meta       : { method: f.method, endpoint: f.endpoint.trim() }
      }));

    const res = await fetch('/2/admin/settings', {
      method :'POST',
      headers:{ 'Content-Type':'application/json' },
      body   : JSON.stringify({ instructions, tools })
    });
    const pj = await res.json();
    setStatus(pj.success ? '✔ Saved' : '❌ Error');
  };

  return (
    <div style={{padding:20, color:'#eee', background:'#222', minHeight:'100vh', fontFamily:'system-ui'}}>
      <h1>🛠 RomaBot2 Admin</h1>
      <h2>System Prompt</h2>
      <textarea
        value={instructions}
        onChange={e => setInstructions(e.target.value)}
        rows={6}
        style={{width:'100%', fontFamily:'monospace', background:'#333', color:'#eee', border:'1px solid #444', padding:6}}
      />

      <h2>Инструменты (Functions)</h2>
      <table style={{width:'100%', borderCollapse:'collapse', marginTop:8}}>
        <thead>
          <tr>
            {['name','description','method','endpoint',''].map((h,i)=>
              <th key={i} style={{border:'1px solid #333', padding:4, textAlign:'left'}}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {funcRows.map((f,idx)=>(
            <tr key={idx} style={ idx%2?{background:'#181818'}:{} }>
              <td style={{border:'1px solid #333',padding:4}}>
                <input
                  value={f.name}
                  onChange={e=>updateRow(idx,'name',e.target.value)}
                  style={{width:'100%',background:'#222',border:'1px solid #444',color:'#eee',padding:6}}
                />
              </td>
              <td style={{border:'1px solid #333',padding:4}}>
                <input
                  value={f.description}
                  onChange={e=>updateRow(idx,'description',e.target.value)}
                  style={{width:'100%',background:'#222',border:'1px solid #444',color:'#eee',padding:6}}
                />
              </td>
              <td style={{border:'1px solid #333',padding:4}}>
                <select
                  value={f.method}
                  onChange={e=>updateRow(idx,'method',e.target.value)}
                  style={{width:'100%',background:'#222',border:'1px solid #444',color:'#eee',padding:6}}
                >
                  <option>GET</option>
                  <option>POST</option>
                </select>
              </td>
              <td style={{border:'1px solid #333',padding:4}}>
                <input
                  value={f.endpoint}
                  onChange={e=>updateRow(idx,'endpoint',e.target.value)}
                  style={{width:'100%',background:'#222',border:'1px solid #444',color:'#eee',padding:6}}
                />
              </td>
              <td style={{border:'1px solid #333',padding:4,textAlign:'center'}}>
                <button onClick={()=>removeRow(idx)} style={{background:'#444',color:'#eee',border:'none',padding:'4px 8px'}}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} style={{margin:'8px 4px',background:'#444',color:'#eee',border:'none',padding:'6px 12px'}}>+ Добавить функцию</button>

      <h2>Предпросмотр TOOLS</h2>
      <pre style={{background:'#000',padding:12, color:'#0f0'}}>
        {JSON.stringify(funcRows
          .filter(f => f.name.trim())
          .map(f => ({
            type:'function', name:f.name.trim(), description:f.description.trim(),
            parameters:{type:'object',properties:{},required:[]},
            meta:{ method:f.method, endpoint:f.endpoint.trim() }
          })),null,2)}
      </pre>

      <br/>
      <button onClick={save} style={{background:'#444',color:'#eee',border:'none',padding:'6px 12px'}}>💾 Сохранить всё</button>
      <span style={{marginLeft:10}}>{status}</span>
    </div>
  );
}
