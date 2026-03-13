import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef({});

  const dismissToast = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    clearTimeout(timersRef.current[id + '_exit']);
    delete timersRef.current[id];
    delete timersRef.current[id + '_exit'];
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
  }, []);

  const showToast = useCallback((msg, type = 'info') => {
    const id = ++idRef.current;
    setToasts(prev => {
      // Limit to 5 visible toasts
      const next = [...prev, { id, msg, type, exiting: false }];
      return next.length > 5 ? next.slice(-5) : next;
    });
    timersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      timersRef.current[id + '_exit'] = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const colors = {
            success: 'border-profit bg-profit/10 text-profit',
            error: 'border-loss bg-loss/10 text-loss',
            info: 'border-hl bg-hl/10 text-hl',
            warning: 'border-yellow-500 bg-yellow-500/10 text-yellow-400',
          };
          const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
          return (
            <div
              key={t.id}
              className={`${t.exiting ? 'toast-exit' : 'toast-enter'} pointer-events-auto flex items-center gap-3 pl-4 pr-2 py-3 rounded-lg border ${colors[t.type] || colors.info} text-sm font-medium backdrop-blur-md shadow-lg max-w-sm`}
            >
              <i className={`fa-solid ${icons[t.type] || icons.info} flex-shrink-0`} />
              <span className="flex-1 line-clamp-2">{t.msg}</span>
              <button
                onClick={() => dismissToast(t.id)}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
              >
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
