import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useData } from '../offline/DataContext.jsx';
import { buildFormSpec, initialFormState, buildPayload, validate } from '../lib/formSpec.js';
import './PlaceForm.css';

export function PlaceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { schema, places, createPlace, updatePlace } = useData();
  const isEdit = !!id;
  const place = isEdit ? places.find((p) => p.id === id) : null;

  const spec = useMemo(() => buildFormSpec(schema), [schema]);
  const [formState, setFormState] = useState(() => initialFormState(schema, place));
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  function setValue(key, value) {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const missing = validate(schema, formState);
    if (missing.length) {
      setErrors(missing);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const payload = buildPayload(schema, formState);
      if (isEdit) {
        await updatePlace(place.id, payload);
        navigate(`/places/${place.id}`);
      } else {
        const created = await createPlace(payload);
        navigate(`/places/${created.id}`);
      }
    } catch (err) {
      setErrors([err.message]);
    } finally {
      setSaving(false);
    }
  }

  if (isEdit && !place) {
    return <div style={{ padding: 24 }}>Place not found.</div>;
  }

  return (
    <div className="place-form-page">
      <div className="detail-top-bar">
        <button className="btn btn-secondary back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </div>
      <form className="place-form" onSubmit={onSubmit}>
        <h1>{isEdit ? 'Edit place' : 'Add a place'}</h1>

        {errors.length > 0 && (
          <div className="form-errors">
            {errors.map((e) => (
              <div key={e}>⚠️ {e}</div>
            ))}
          </div>
        )}

        {spec.map((item) => (
          <div className="field" key={item.formKey}>
            <label>
              {item.field.label}
              {item.required ? ' *' : ''}
            </label>
            {item.multiline ? (
              <textarea
                value={formState[item.formKey] ?? ''}
                onChange={(e) => setValue(item.formKey, e.target.value)}
              />
            ) : (
              <input
                type={item.kind === 'lat' || item.kind === 'lng' ? 'number' : 'text'}
                step="any"
                value={formState[item.formKey] ?? ''}
                onChange={(e) => setValue(item.formKey, e.target.value)}
                placeholder={
                  item.kind === 'mapsLink'
                    ? 'Leave blank to build automatically from name + address'
                    : undefined
                }
              />
            )}
          </div>
        ))}

        <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add place'}
        </button>
      </form>
    </div>
  );
}
