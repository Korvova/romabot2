import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import Admin from './Admin.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename="/2">
    <Routes>
      <Route path="admin" element={<Admin />} />
      <Route path="/*"   element={<App />} />
    </Routes>
  </BrowserRouter>
);
