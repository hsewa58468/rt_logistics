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

interface RouteAction {
  type: 'pickup' | 'dropoff';
  cargoId: string;
}

interface RouteStop {
  id: string;
  warehouseName: string;
  actions: RouteAction[];
}

interface Route {
  id: string;
  truckId: string;
  truckNumber: string;
  stops: RouteStop[];
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
        
        {/* 渲染分段路線 */}
        {coloredRoutes.map((route) => {
          const stops = route.stops
            .map(stop => {
              const wh = warehouses.find(w => w.name === stop.warehouseName);
              return wh ? [wh.location.lat, wh.location.lng] as [number, number] : null;
            })
            .filter((p): p is [number, number] => p !== null);

          // 將路徑拆分為多個線段，每段顏色不同
          const segmentColors = [
            '#3b82f6', // 藍
            '#10b981', // 綠
            '#f59e0b', // 橘
            '#ef4444', // 紅
            '#8b5cf6', // 紫
            '#ec4899', // 粉
            '#06b6d4', // 靛
            '#f97316'  // 暖橘
          ];

          if (stops.length > 1) {
            return stops.slice(0, -1).map((startPos, idx) => (
              <Polyline 
                key={`${route.id}-seg-${idx}`}
                positions={[startPos, stops[idx + 1]]}
                pathOptions={{ 
                  color: segmentColors[idx % segmentColors.length], 
                  weight: 5, 
                  opacity: 0.8, 
                  dashArray: '12, 10', 
                  lineJoin: 'round'
                }} 
              />
            ));
          }
          return null;
        })}

        {/* 配送段圖例 (僅在選取貨車且有路徑時顯示) */}
        {activeTruckId && coloredRoutes.find(r => r.truckId === activeTruckId)?.stops.length! > 1 && (
          <div className="map-legend">
            <div className="legend-title">🚚 運送階段</div>
            <div className="legend-grid">
              {(() => {
                const activeRoute = coloredRoutes.find(r => r.truckId === activeTruckId);
                const segmentCount = (activeRoute?.stops.length || 1) - 1;
                const segmentColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
                
                return [...Array(segmentCount)].map((_, i) => (
                  <div key={i} className="legend-item">
                    <span 
                      className="legend-line" 
                      style={{ backgroundColor: segmentColors[i % segmentColors.length] }}
                    ></span>
                    <span>段 {i + 1}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

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
