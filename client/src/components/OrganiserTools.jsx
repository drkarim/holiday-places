import React, { useState } from 'react';
import { useData } from '../offline/DataContext.jsx';

// Shown only with a trip's edit key: load or update the trip's places from
// a spreadsheet (.xlsx, .xls or .csv).
export function OrganiserTools() {
  const { api, refresh, isOffline } = useData();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const { created, updated, skipped } = await api.importSpreadsheet(file);
      await refresh();
      setMessage({
        ok: true,
        text: `Imported ${file.name}: ${created} added, ${updated} updated${skipped ? `, ${skipped} rows without a name skipped` : ''}.`,
      });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="organiser-tools">
      <div className="organiser-tools-row">
        <label className={`btn btn-secondary ${busy || isOffline ? 'is-disabled' : ''}`}>
          {busy ? 'Importing…' : '📄 Import spreadsheet'}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={onFile}
            disabled={busy || isOffline}
          />
        </label>
        <a className="btn btn-secondary" href="/places-template.csv" download="places-template.csv">
          Template
        </a>
      </div>
      {message && <div className={message.ok ? 'notice' : 'notice notice-error'}>{message.text}</div>}
    </div>
  );
}
