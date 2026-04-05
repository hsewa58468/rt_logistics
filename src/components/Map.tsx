import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// 修正 Leaflet 預設圖示路徑問題
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

interface WarehouseLocation {
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
}

interface Route {
  id: string;
  cargoId: string;
  truckId: string;
  cargoType: string;
  truckNumber: string;
  origin: string;
  destination: string;
}

interface MapProps {
  warehouses?: WarehouseLocation[];
  routes?: Route[];
  activeTruckId?: string;
}

// 任務順序顏色定義 (前 8 種)
const LEG_COLORS = [
  '#ef4444', // 1. 紅色
  '#10b981', // 2. 綠色
  '#3b82f6', // 3. 藍色
  '#f59e0b', // 4. 橘色
  '#a855f7', // 5. 紫色
  '#06b6d4', // 6. 青色
  '#ec4899', // 7. 粉色
  '#6366f1', // 8. 靛藍
];

// 自定義現代化倉庫 SVG 圖標
const createWarehouseIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-warehouse-icon',
    html: `
      <div style="
        background-color: ${color};
        width: 30px;
        height: 30px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        border: 2px solid white;
      ">
        <div style="
          transform: rotate(45deg);
          color: white;
          font-size: 14px;
        ">
          🏢
        </div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
  });
};

const warehouseIcon = createWarehouseIcon('#6366f1');

const Map: React.FC<MapProps> = ({ warehouses = [], routes = [], activeTruckId = '' }) => {
  // 台中以北區域範圍與中心
  const center: [number, number] = [24.75, 121.15];
  const bounds: L.LatLngBoundsExpression = [
    [24.1, 120.5], // 西南 (台中南側)
    [25.3, 122.0], // 東北 (基隆北側)
  ];

  // 過濾出目前選中貨車的路線
  const displayRoutes = activeTruckId 
    ? routes.filter(r => r.truckId === activeTruckId)
    : [];

  // 按貨車分組並排序任務 (雖然現在只剩一組，但保留邏輯方便後續擴充)
  const truckGroups: Record<string, Route[]> = {};
  displayRoutes.forEach(route => {
    if (!truckGroups[route.truckId]) {
      truckGroups[route.truckId] = [];
    }
    truckGroups[route.truckId].push(route);
  });

  // 為組內的任務依時間排序，並分配顏色
  const coloredRoutes = Object.values(truckGroups).flatMap(group => {
    const sortedGroup = [...group].sort((a, b) => a.id.localeCompare(b.id));
    return sortedGroup.map((route, index) => ({
      ...route,
      legIndex: index,
      color: LEG_COLORS[Math.min(index, LEG_COLORS.length - 1)]
    }));
  });

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 圖例 Legend - 只有在選取貨車時顯示 */}
      {activeTruckId && (
        <div className="map-legend">
          <header className="legend-header">貨車配送階段圖例</header>
          <div className="legend-items-grid">
            {LEG_COLORS.map((color, idx) => (
              <div key={idx} className="legend-item">
                <span className="legend-color" style={{ backgroundColor: color }}></span>
                <span>第 {idx + 1} 段</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <MapContainer 
        center={center} 
        zoom={10} 
        minZoom={10} 
        maxBounds={bounds} 
        maxBoundsViscosity={1.0}
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://nlsc.gov.tw">內政部國土測繪中心</a>'
          url="https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}"
        />
        
        {/* 渲染路線 */}
        {coloredRoutes.map((route) => {
          const originWh = warehouses.find(w => w.name === route.origin);
          const destWh = warehouses.find(w => w.name === route.destination);

          if (originWh && destWh) {
            const path: [number, number][] = [
              [originWh.location.lat, originWh.location.lng],
              [destWh.location.lat, destWh.location.lng]
            ];

            return (
              <Polyline 
                key={route.id} 
                positions={path} 
                pathOptions={{ 
                  color: route.color, 
                  weight: 4, 
                  opacity: 0.8, 
                  dashArray: '10, 10', 
                  lineJoin: 'round'
                }} 
              />
            );
          }
          return null;
        })}

        {/* 渲染標記點 */}
        {warehouses.map((w) => (
          <Marker 
            key={w.name} 
            position={[w.location.lat, w.location.lng]} 
            icon={warehouseIcon}
          >
            <Popup>
              <div style={{ padding: '4px' }}>
                <strong style={{ fontSize: '1.1rem', color: '#6366f1' }}>{w.name}</strong>
                <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#666' }}>{w.address}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default Map;
