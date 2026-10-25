import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useData } from '../offline/DataContext.jsx';
import { fieldByRole, valueByRole, shortLabel } from '../lib/fieldHelpers.js';
import { PhotoCarousel } from '../components/PhotoCarousel.jsx';
import { MapsButton } from '../components/MapsButton.jsx';
import { api } from '../api.js';
import './PlaceDetail.css';

export function PlaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { schema, places, updatePlace, deletePlace, addPhotoUrl, applyServerPlace } = useData();
  const place = places.find((p) => p.id === id);
  const [notesDraft, setNotesDraft] = useState(place?.userNotes || '');
  const [photoUrl, setPhotoUrl] = useState('');
  const [busy, setBusy] = useState(false);

  if (!place) {
    return (
      <div className="app-shell">
        <div style={{ padding: 24 }}>
          Place not found. <Link to="/">Back home</Link>
        </div>
      </div>
    );
  }

  const name = valueByRole(schema, place, 'name');
  const type = shortLabel(valueByRole(schema, place, 'type'));
  const area = valueByRole(schema, place, 'area');

  const shown = new Set(['rowNumber', 'name', 'mapsLink', 'lat', 'lng']);
  const detailFields = (schema.fields || [])
    .filter((f) => !shown.has(f.role))
    .map((f) => ({ ...f, value: place.fields?.[f.key] }))
    .filter((f) => f.value !== null && f.value !== undefined && String(f.value).trim() !== '');

  async function toggleVisited() {
    await updatePlace(place.id, { visited: !place.visited });
  }

  async function saveNotes() {
    await updatePlace(place.id, { userNotes: notesDraft });
  }

  async function onAddPhotoUrl(e) {
    e.preventDefault();
    if (!photoUrl.trim()) return;
    setBusy(true);
    try {
      await addPhotoUrl(place.id, photoUrl.trim());
      setPhotoUrl('');
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const updated = await api.uploadPhoto(place.id, file);
      await applyServerPlace(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onFetchWikimedia() {
    setBusy(true);
    try {
      const updated = await api.fetchWikimediaPhotos(place.id);
      await applyServerPlace(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    await deletePlace(place.id);
    navigate('/');
  }

  return (
    <div className="place-detail">
      <div className="detail-top-bar">
        <button className="btn btn-secondary back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </div>

      <PhotoCarousel
        photos={
          place.photos.length
            ? place.photos
            : place.categoryPhoto
            ? [{ ...place.categoryPhoto, isStock: true }]
            : []
        }
      />

      <div className="detail-content">
        <MapsButton url={place.mapsUrl} size="large" />

        <h1>{name}</h1>
        <div className="detail-meta">
          {type && <div className="place-card-type">{type}</div>}
          {area && <div>{area}</div>}
        </div>

        <div className="action-row">
          {place.contact?.telHref && (
            <a className="btn btn-secondary" href={place.contact.telHref}>
              📞 Call
            </a>
          )}
          {place.contact?.website && (
            <a className="btn btn-secondary" href={place.contact.website} target="_blank" rel="noreferrer">
              🌐 Website
            </a>
          )}
          <button className={`btn ${place.visited ? 'btn-secondary' : 'btn-primary'}`} onClick={toggleVisited}>
            {place.visited ? '✓ Visited' : 'Mark visited'}
          </button>
        </div>

        <section className="detail-section">
          <h2>My notes</h2>
          <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Add your own notes…" />
          <button className="btn btn-secondary" onClick={saveNotes} disabled={notesDraft === (place.userNotes || '')}>
            Save notes
          </button>
        </section>

        <section className="detail-section">
          <h2>Photos</h2>
          <div className="photo-tools">
            <form onSubmit={onAddPhotoUrl} className="photo-url-form">
              <input
                type="url"
                placeholder="Paste an image URL"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
              <button className="btn btn-secondary" type="submit" disabled={busy}>
                Add
              </button>
            </form>
            <label className="btn btn-secondary upload-btn">
              📷 Upload photo
              <input type="file" accept="image/*" hidden onChange={onUpload} disabled={busy} />
            </label>
            <button className="btn btn-secondary" onClick={onFetchWikimedia} disabled={busy}>
              🔍 Find photos online
            </button>
          </div>
        </section>

        <section className="detail-section">
          <h2>Details</h2>
          <dl className="detail-fields">
            {detailFields.map((f) => (
              <React.Fragment key={f.key}>
                <dt>{f.label}</dt>
                <dd>{String(f.value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>

        <div className="detail-footer-actions">
          <Link className="btn btn-secondary btn-block" to={`/places/${place.id}/edit`}>
            Edit place
          </Link>
          <button className="btn btn-danger btn-block" onClick={onDelete}>
            Delete place
          </button>
        </div>
      </div>
    </div>
  );
}
