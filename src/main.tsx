import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { TrialAccessProvider } from './context/TrialAccessContext.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary variant="root" label="AutoElectric Lab Pro">
    <AuthProvider>
      <TrialAccessProvider>
        <App />
      </TrialAccessProvider>
    </AuthProvider>
  </AppErrorBoundary>
);
