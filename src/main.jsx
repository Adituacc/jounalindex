import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

// Remove loading spinner once React mounts
const loader = document.getElementById('app-loader');
if (loader) loader.style.transition = 'opacity 0.3s';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App onReady={() => { if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 300); } }} />
  </React.StrictMode>
);
