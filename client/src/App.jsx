import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { DataProvider } from './offline/DataContext.jsx';
import { StatusBanner } from './components/StatusBanner.jsx';
import { Home } from './pages/Home.jsx';
import { PlaceDetail } from './pages/PlaceDetail.jsx';
import { PlaceForm } from './pages/PlaceForm.jsx';

export default function App() {
  return (
    <DataProvider>
      <HashRouter>
        <StatusBanner />
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/places/new" element={<PlaceForm />} />
            <Route path="/places/:id" element={<PlaceDetail />} />
            <Route path="/places/:id/edit" element={<PlaceForm />} />
          </Routes>
        </div>
      </HashRouter>
    </DataProvider>
  );
}
