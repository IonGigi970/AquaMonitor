"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';

// Definim exact structura datelor pentru TypeScript
interface Avarie {
  id?: string;
  localitate: string;
  strada: string;
  status: string;
  descriere_text: string;
  data_inceput?: string;
  data_sfarsit?: string;
  latitudine?: number;
  longitudine?: number;
}

// Iconițe colorate în funcție de status (verde = remediat, roșu = avarie, galben = presiune scăzută)
function creeazaIcon(culoare: string) {
  return L.icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${culoare}.png`,
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
}

const iconAvarie = creeazaIcon('red');
const iconPresiune = creeazaIcon('orange');
const iconRemediat = creeazaIcon('green');

function iconPentruStatus(status: string) {
  if (status === 'AVARIE') return iconAvarie;
  if (status === 'REMEDIAT') return iconRemediat;
  return iconPresiune;
}

// Recentrează automat harta pe toate punctele disponibile
function AutoFitBounds({ avarii }: { avarii: Avarie[] }) {
  const map = useMap();

  useEffect(() => {
    const puncte = avarii
      .filter((a) => a.latitudine && a.longitudine)
      .map((a) => [a.latitudine as number, a.longitudine as number] as [number, number]);

    if (puncte.length > 0) {
      const bounds = L.latLngBounds(puncte);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [avarii, map]);

  return null;
}

export default function MapComponent({ avarii }: { avarii: Avarie[] }) {
  useEffect(() => {
    // Fix pentru iconițele default din Leaflet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }, []);

  return (
    <MapContainer 
      center={[44.1767, 28.6507]} // Centrat pe Constanța
      zoom={9} 
      style={{ height: '100%', width: '100%', minHeight: '500px', borderRadius: '1rem' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      <AutoFitBounds avarii={avarii} />

      {avarii.map((avarie, index) => {
        if (avarie.latitudine && avarie.longitudine) {
          return (
            <Marker 
              key={avarie.id || `marker-${index}`} 
              position={[avarie.latitudine, avarie.longitudine]}
              icon={iconPentruStatus(avarie.status)}
            >
              <Popup>
                <div className="font-sans">
                  <b className="text-sm">{avarie.localitate}</b><br/>
                  <span className="text-xs text-slate-600">{avarie.strada}</span><br/>
                  <span className={`text-xs font-bold ${avarie.status === 'AVARIE' ? 'text-red-500' : 'text-amber-600'}`}>
                    {avarie.status}
                  </span>
                  {avarie.data_inceput && (
                    <>
                      <br/>
                      <span className="text-xs">{avarie.data_inceput} - {avarie.data_sfarsit}</span>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        }
        return null;
      })}
    </MapContainer>
  );
}