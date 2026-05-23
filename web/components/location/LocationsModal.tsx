'use client';

// "Watching" location picker — opens from the sidebar Watching button.
// Mirrors mobile app/locations.tsx: GPS radio + saved-cities list + city search.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Icon } from '@/components/Icon';
import { Modal } from '@/components/ui/Modal';
import { useAesthetic } from '@/lib/aesthetic';
import { api } from '@/lib/api';
import type { GeocodeHit } from '@/lib/api';
import { useDebounced } from '@/lib/queries';
import { RISK_LEVELS } from '@/lib/theme';
import { useSavedLocations } from '@/lib/use-saved-locations';

const GREEN = RISK_LEVELS.low.color;
const GREEN_RGB = RISK_LEVELS.low.glow;

export function LocationsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { ae } = useAesthetic();
  const { items, activeId, setActive, add, remove } = useSavedLocations();
  const [query, setQuery] = useState('');
  const debouncedQ = useDebounced(query, 350);
  const search = useQuery({
    queryKey: ['geocode', debouncedQ],
    queryFn: () => api.geocode(debouncedQ),
    enabled: debouncedQ.trim().length >= 3,
    staleTime: 5 * 60_000,
  });

  const onAdd = (hit: GeocodeHit) => {
    const label = [hit.name, hit.state, hit.country].filter(Boolean).join(', ');
    const id = add({ label, lat: hit.lat, lon: hit.lon });
    setActive(id);
    setQuery('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} eyebrow="Watching" title="Active focus point" maxWidth={560}>
      <p
        style={{
          margin: 0,
          fontFamily: ae.fontBody,
          fontSize: 13.5,
          lineHeight: 1.5,
          color: ae.textDim,
        }}
      >
        Pick where Status, Map, and Safety should track. Use your browser&apos;s GPS or any saved city.
      </p>

      <Row
        label="My Location"
        sub="Use the browser's GPS"
        selected={activeId === null}
        onPress={() => {
          setActive(null);
          onClose();
        }}
        ae={ae}
      />

      {items.length > 0 ? (
        <>
          <SectionHeader ae={ae}>Saved cities · {items.length}</SectionHeader>
          {items.map((item) => (
            <Row
              key={item.id}
              label={item.label}
              sub={`${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}`}
              selected={activeId === item.id}
              onPress={() => {
                setActive(item.id);
                onClose();
              }}
              onRemove={() => remove(item.id)}
              ae={ae}
            />
          ))}
        </>
      ) : null}

      {/* Search */}
      <div style={{ marginTop: 20 }}>
        <SectionHeader ae={ae}>Add a city</SectionHeader>
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: 'rgba(0, 0, 0, 0.30)',
            border: `0.5px solid ${ae.line}`,
            borderRadius: ae.radius,
          }}
        >
          <Icon name="search" size={14} color={ae.textMute} strokeWidth={1.6} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Boulder, San Francisco"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: ae.text,
              fontFamily: ae.fontBody,
              fontSize: 14,
            }}
          />
          {query.length > 0 ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: ae.textMute,
                padding: 0,
                display: 'inline-flex',
              }}
            >
              <Icon name="plus" size={14} color={ae.textMute} style={{ transform: 'rotate(45deg)' }} />
            </button>
          ) : null}
        </div>

        {query.trim().length > 0 && query.trim().length < 3 ? (
          <p style={{ marginTop: 10, fontFamily: ae.fontMono, fontSize: 11, color: ae.textMute }}>
            Type at least 3 characters to search.
          </p>
        ) : null}

        {search.isFetching ? (
          <p style={{ marginTop: 10, fontFamily: ae.fontMono, fontSize: 11, color: ae.textDim }}>
            Searching…
          </p>
        ) : null}

        {search.isError ? (
          <p style={{ marginTop: 10, fontFamily: ae.fontMono, fontSize: 11, color: RISK_LEVELS.extreme.color }}>
            Couldn&apos;t reach the geocoding service.
          </p>
        ) : null}

        {search.data && search.data.length === 0 && debouncedQ.trim().length >= 3 ? (
          <p style={{ marginTop: 10, fontFamily: ae.fontMono, fontSize: 11, color: ae.textMute }}>
            No matches.
          </p>
        ) : null}

        {search.data && search.data.length > 0 ? (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {search.data.map((hit, i) => {
              const label = [hit.name, hit.state, hit.country].filter(Boolean).join(', ');
              return (
                <button
                  key={`${hit.lat}-${hit.lon}-${i}`}
                  type="button"
                  onClick={() => onAdd(hit)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: `0.5px solid ${ae.line}`,
                    borderRadius: ae.radius - 4,
                    cursor: 'pointer',
                    color: 'inherit',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon name="pin" size={13} color={ae.textMute} strokeWidth={1.6} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: ae.fontDisplay,
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: ae.text,
                        letterSpacing: ae.titleTracking,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        fontFamily: ae.fontMono,
                        fontSize: 10,
                        color: ae.textMute,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {hit.lat.toFixed(2)}, {hit.lon.toFixed(2)}
                    </div>
                  </div>
                  <Icon name="plus" size={13} color={GREEN} strokeWidth={1.8} />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function SectionHeader({
  ae,
  children,
}: {
  ae: ReturnType<typeof useAesthetic>['ae'];
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: 18,
        padding: '6px 4px',
        fontFamily: ae.fontMono,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.18em',
        color: ae.textMute,
        textTransform: ae.chipUpper ? 'uppercase' : 'none',
      }}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  sub,
  selected,
  onPress,
  onRemove,
  ae,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
  onRemove?: () => void;
  ae: ReturnType<typeof useAesthetic>['ae'];
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 6px',
        background: 'transparent',
        borderBottom: `0.5px solid ${ae.line}`,
      }}
    >
      <button
        type="button"
        onClick={onPress}
        aria-pressed={selected}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          textAlign: 'left',
          fontFamily: 'inherit',
          cursor: 'pointer',
          minWidth: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: 99,
            border: `1.5px solid ${selected ? GREEN : ae.lineStrong}`,
            background: selected ? `rgba(${GREEN_RGB}, 0.16)` : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {selected ? (
            <span style={{ width: 7, height: 7, borderRadius: 99, background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
          ) : null}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: ae.fontDisplay,
              fontSize: 14,
              fontWeight: 600,
              color: ae.text,
              letterSpacing: ae.titleTracking,
            }}
          >
            {label}
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: ae.fontMono,
              fontSize: 10.5,
              color: ae.textMute,
              letterSpacing: '0.04em',
            }}
          >
            {sub}
          </div>
        </div>
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: ae.textMute,
            flexShrink: 0,
          }}
        >
          <Icon name="plus" size={14} color={ae.textMute} style={{ transform: 'rotate(45deg)' }} />
        </button>
      ) : null}
    </div>
  );
}
