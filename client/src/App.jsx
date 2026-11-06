import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { DataProvider } from './offline/DataContext.jsx';
import { StatusBanner } from './components/StatusBanner.jsx';
import { Home } from './pages/Home.jsx';
import { PlaceDetail } from './pages/PlaceDetail.jsx';
import { PlaceForm } from './pages/PlaceForm.jsx';
import { TripsPage } from './pages/TripsPage.jsx';
import { applyTheme, themeFor } from './lib/themes.js';
import { DEFAULT_TRIP, knownTrip, setEditKey } from './lib/tripAccess.js';

// Everything under /t/:trip shares one trip's data and colours. Keyed by
// trip so switching trips starts from a clean state.
function TripShell() {
  const { trip } = useParams();
  useEffect(() => {
    // Colours of a trip seen before apply at once; a new trip's apply when
    // its details arrive (DataProvider).
    const seen = knownTrip(trip);
    if (seen || trip === DEFAULT_TRIP) applyTheme(themeFor(seen));
  }, [trip]);
  return (
    <DataProvider key={trip} tripSlug={trip}>
      <StatusBanner />
      <div className="app-shell">
        <Outlet />
      </div>
    </DataProvider>
  );
}

// An organiser's edit link: keep the key on this phone, then open the trip.
function EditLink() {
  const { trip, key } = useParams();
  setEditKey(trip, key);
  return <Navigate to={`/t/${trip}`} replace />;
}

function LegacyPlace({ edit }) {
  const { id } = useParams();
  return <Navigate to={`/t/${DEFAULT_TRIP}/places/${id}${edit ? '/edit' : ''}`} replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<TripsPage />} />
        <Route path="/t/:trip/edit/:key" element={<EditLink />} />
        <Route path="/t/:trip" element={<TripShell />}>
          <Route index element={<Home />} />
          <Route path="new" element={<PlaceForm />} />
          <Route path="places/:id" element={<PlaceDetail />} />
          <Route path="places/:id/edit" element={<PlaceForm />} />
        </Route>
        {/* Addresses from before trips existed all meant Barbados. */}
        <Route path="/places/new" element={<Navigate to={`/t/${DEFAULT_TRIP}/new`} replace />} />
        <Route path="/places/:id" element={<LegacyPlace />} />
        <Route path="/places/:id/edit" element={<LegacyPlace edit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
