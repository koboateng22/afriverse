import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { Sheet } from '../../components/Sheet/Sheet';
import { ProOffer } from './ProOffer';
import './PaywallModal.css';

type PaywallState = {
  /** Opens the upgrade sheet. `reason` explains what the student just ran into. */
  openPaywall: (reason?: string) => void;
};

const PaywallContext = createContext<PaywallState | null>(null);

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const openPaywall = useCallback((r?: string) => {
    setReason(r ?? null);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ openPaywall }), [openPaywall]);

  return (
    <PaywallContext.Provider value={value}>
      {children}
      <Sheet open={open} onClose={() => setOpen(false)} title="Upgrade to Pro">
        <div className="paywall-modal">
          {reason && (
            <p className="paywall-modal__reason">
              <Sparkles aria-hidden="true" />
              {reason}
            </p>
          )}
          <ProOffer compact />
        </div>
      </Sheet>
    </PaywallContext.Provider>
  );
}

export function usePaywall(): PaywallState {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error('usePaywall must be used inside <PaywallProvider>');
  return ctx;
}
