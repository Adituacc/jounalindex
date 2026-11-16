import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Journal from '../src/components/Journal';
import { TradeProvider } from '../src/context/TradeContext';
import { ToastProvider } from '../src/context/ToastContext';
export { act };
export function mount(container) {
  const root = createRoot(container);
  root.render(<TradeProvider><ToastProvider><Journal /></ToastProvider></TradeProvider>);
  return root;
}
