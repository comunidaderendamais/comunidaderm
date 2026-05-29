import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import AuthActionEntry from './auth/AuthActionEntry.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthActionEntry />
  </StrictMode>
);
