import React from 'react';
import { useData } from '../offline/DataContext.jsx';

export function StatusBanner() {
  const { isOffline, syncing, pendingCount } = useData();

  if (isOffline) {
    return (
      <div className="offline-banner">
        📡 Offline — showing saved places{pendingCount > 0 ? ` · ${pendingCount} change(s) will sync` : ''}
      </div>
    );
  }
  if (syncing || pendingCount > 0) {
    return <div className="offline-banner sync-banner">🔄 Syncing {pendingCount} change(s)…</div>;
  }
  return null;
}
