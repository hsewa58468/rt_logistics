import React, { useState } from 'react';
import Map from '../components/Map';
import Modal from '../components/Modal';
import Button from '../components/Button';

interface Cargo {
  id: string;
  type: string;
  quantity: number;
  unit: '板' | '箱';
  origin: string;
  destination: string;
  isAssigned: boolean;
}

interface Truck {
  id: string;
  number: string;
  origin: string;
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

interface SelectOption {
  value: string;
  label: string;
  subLabel?: string;
}

const WAREHOUSES = [
  { name: '桃園', address: '桃園市龜山區民生北路一段54巷4號' ,location:{lat:25.034515,lng:121.304649}},
  { name: '華漢', address: '桃園市中壢區永清街460號' ,location:{lat:24.987769,lng:121.228338}},
  { name: '牧昌', address: '桃園市中壢區東園路14號' ,location:{lat:24.970119,lng:121.239788}},
  { name: '中和', address: '新北市中和區建三路81號' ,location:{lat:25.000884,lng:121.486139}},
  { name: '汐止', address: '新北市汐止區環河街140號' ,location:{lat:25.058563,lng:121.628955}},
  { name: '新竹', address: '新竹市香山區延平路二段727巷5號' ,location:{lat:24.806429,lng:120.921223}},
  { name: '台中北屯', address: '台中市北屯區庄內巷15號' ,location:{lat:24.189265,lng:120.666650}},
  { name: '東亮', address: '臺中市北區東成一街3號' ,location:{lat:24.157564,lng:120.700553}},
];

// 自定義選擇器組件 (通用的)
const CustomSelect: React.FC<{
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({ label, value, options, onChange, placeholder = '請選擇' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="custom-select-container">
      {label && <label>{label}</label>}
      <div className="custom-select-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span>{selectedOption?.label || placeholder}</span>
        <i className={`arrow ${isOpen ? 'up' : 'down'}`}></i>
      </div>
      
      {isOpen && (
        <div className="custom-select-options">
          {options.length > 0 ? (
            options.map((o) => (
              <div 
                key={o.value} 
                className={`custom-option ${value === o.value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(o.value);
                  setIsOpen(false);
                }}
              >
                <div className="option-name">{o.label}</div>
                {o.subLabel && <div className="option-address">{o.subLabel}</div>}
              </div>
            ))
          ) : (
            <div className="custom-option-empty">--- 無可用選項 ---</div>
          )}
        </div>
      )}
    </div>
  );
};

const Warehouse: React.FC = () => {
  // 貨物區塊
  const [isCargoModalOpen, setIsCargoModalOpen] = useState(false);
  const [cargoList, setCargoList] = useState<Cargo[]>([]);

  const [newCargo, setNewCargo] = useState({
    type: '',
    quantity: 0,
    unit: '板' as Cargo['unit'],
    origin: WAREHOUSES[0].name,
    destination: WAREHOUSES[1].name
  });

  // 貨車區塊
  const [isTruckModalOpen, setIsTruckModalOpen] = useState(false);
  const [truckList, setTruckList] = useState<Truck[]>([]);

  const [newTruck, setNewTruck] = useState({
    number: '',
    origin: WAREHOUSES[0].name
  });

  // 路線排程狀態
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedCargoId, setSelectedCargoId] = useState('');
  const [selectedTruckId, setSelectedTruckId] = useState('');

  // 配送紀錄/選取狀態
  const [isRecordsModalOpen, setIsRecordsModalOpen] = useState(false);
  const [selectedTruckIdForRecords, setSelectedTruckIdForRecords] = useState('');
  const [activeTruckIdForMap, setActiveTruckIdForMap] = useState('');

  // 配置倉庫清單選項
  const warehouseOptions: SelectOption[] = WAREHOUSES.map(w => ({
    value: w.name,
    label: w.name,
    subLabel: w.address
  }));

  // 配置排程選項
  const cargoOptions: SelectOption[] = cargoList
    .filter(c => !c.isAssigned)
    .map(c => ({
      value: c.id,
      label: c.type,
      subLabel: `${c.quantity} ${c.unit} (${c.origin} -> ${c.destination})`
    }));

  const truckOptions: SelectOption[] = truckList.map(t => ({
    value: t.id,
    label: t.number,
    subLabel: `出發地：${t.origin}`
  }));

  // 貨物處理邏輯
  const handleCargoInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewCargo(prev => ({
      ...prev,
      [name]: name === 'quantity' ? parseInt(value) || 0 : value
    }));
  };

  const handleAddCargo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCargo.type || !newCargo.origin || !newCargo.destination) return;
    const newItem: Cargo = { id: Date.now().toString(), ...newCargo, isAssigned: false };
    setCargoList(prev => [newItem, ...prev]);
    setIsCargoModalOpen(false);
    setNewCargo({ type: '', quantity: 0, unit: '箱', origin: WAREHOUSES[0].name, destination: WAREHOUSES[1].name });
  };

  // 貨車處理邏輯
  const handleTruckInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewTruck(prev => ({ ...prev, [name]: value }));
  };

  const handleAddTruck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTruck.number || !newTruck.origin) return;
    const newItem: Truck = { id: Date.now().toString(), ...newTruck };
    setTruckList(prev => [newItem, ...prev]);
    setIsTruckModalOpen(false);
    setNewTruck({ number: '', origin: WAREHOUSES[0].name });
  };

  // 路線安排邏輯
  const handleCreateRoute = () => {
    const cargo = cargoList.find(c => c.id === selectedCargoId);
    const truck = truckList.find(t => t.id === selectedTruckId);

    if (!cargo || !truck) {
      alert('請選擇有效的貨物與貨車');
      return;
    }

    const newRoute: Route = {
      id: Date.now().toString(),
      cargoId: cargo.id,
      truckId: truck.id,
      cargoType: cargo.type,
      truckNumber: truck.number,
      origin: cargo.origin,
      destination: cargo.destination
    };

    setRoutes(prev => [newRoute, ...prev]);
    setCargoList(prev => prev.map(c => c.id === cargo.id ? { ...c, isAssigned: true } : c));
    setSelectedCargoId('');
    setSelectedTruckId('');
  };

  // 配送紀錄光箱處理
  const handleOpenRecords = (e: React.MouseEvent<HTMLButtonElement>, truckId: string) => {
    e.stopPropagation(); // 防止觸發清單項目的選取點擊
    setSelectedTruckIdForRecords(truckId);
    setIsRecordsModalOpen(true);
  };

  const filteredRoutes = routes.filter(r => r.truckId === selectedTruckIdForRecords);
  const activeTruck = truckList.find(t => t.id === selectedTruckIdForRecords);

  return (
    <div className="warehouse-layout">
      {/* 左側清單區 */}
      <div className="sidebar-lists">
        {/* 指派區塊 */}
        <header className="list-header">
          <h3>🏢 路線指派專區</h3>
        </header>
        <section className="list-section appointment-box">
          <div className="appointment-form">
            <CustomSelect 
              value={selectedCargoId} 
              options={cargoOptions} 
              onChange={setSelectedCargoId} 
              placeholder="選擇待處理貨物..."
            />
            <CustomSelect 
              value={selectedTruckId} 
              options={truckOptions} 
              onChange={setSelectedTruckId} 
              placeholder="選擇可用貨車..."
            />
            <Button 
              className="btn-full" 
              onClick={handleCreateRoute}
              disabled={!selectedCargoId || !selectedTruckId}
            >
              確認排程
            </Button>
          </div>
        </section>

        {/* 貨物段 */}
        <header className="list-header" style={{ marginTop: '2rem' }}>
          <h3>📦 貨物清單</h3>
          <Button className="btn-small" onClick={() => setIsCargoModalOpen(true)}>新增貨物</Button>
        </header>
        
        <section className="list-section">
          {/* <div className="data-grid-header">
            <span>種類</span>
            <span>數量</span>
            <span>出發倉</span>
            <span>抵達倉</span>
          </div> */}
          <ul className="data-list-refined">
            {cargoList.map((item) => (
              <li key={item.id} className={`cargo-item-complex ${item.isAssigned ? 'assigned-opacity' : ''}`}>
                <div className="cargo-main-info">
                  <span className={`status-pill ${item.isAssigned ? 'assigned' : 'pending'}`}>
                    {item.isAssigned ? '已排程' : '待處理'}
                  </span>
                  <span className="cargo-type">{item.type}</span>
                  <span className="cargo-qty">{item.quantity} <small>{item.unit}</small></span>
                </div>
                <div className="cargo-route-info">
                  <div className="route-step">
                    <span className="dot origin"></span>
                    <span className="loc-name">{item.origin}</span>
                    <span className="loc-addr">{WAREHOUSES.find(w => w.name === item.origin)?.address}</span>
                  </div>
                  <div className="route-step">
                    <span className="dot dest"></span>
                    <span className="loc-name">{item.destination}</span>
                    <span className="loc-addr">{WAREHOUSES.find(w => w.name === item.destination)?.address}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 貨車段 */}
        <header className="list-header" style={{ marginTop: '2rem' }}>
          <h3>🚚 貨車列表</h3>
          <Button className="btn-small" onClick={() => setIsTruckModalOpen(true)}>新增貨車</Button>
        </header>
        <section className="list-section">
          <div className="data-grid-header-truck">
            <span>貨車編號</span>
            <span>出發地</span>
          </div>
          <ul className="data-list-refined truck">
            {truckList.map((truck) => (
              <li 
                key={truck.id} 
                className={`truck-item-complex ${activeTruckIdForMap === truck.id ? 'active' : ''}`}
                onClick={() => setActiveTruckIdForMap(activeTruckIdForMap === truck.id ? '' : truck.id)}
              >
                <span className="truck-number">#{truck.number}</span>
                <div className="truck-loc-info">
                  <span className="loc-name">{truck.origin}</span>
                  <span className="loc-addr">{WAREHOUSES.find(w => w.name === truck.origin)?.address}</span>
                </div>
                <Button 
                  className="btn-small btn-record" 
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleOpenRecords(e, truck.id)}
                >
                  紀錄
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 右側地圖區 */}
      <div className="map-display">
        <Map warehouses={WAREHOUSES} routes={routes} activeTruckId={activeTruckIdForMap} />
      </div>

      {/* 新增貨物光箱 */}
      <Modal isOpen={isCargoModalOpen} onClose={() => setIsCargoModalOpen(false)} title="輸入新貨物資訊">
        <form className="modal-form" onSubmit={handleAddCargo}>
          <div className="form-group">
            <label>貨物種類</label>
            <input name="type" type="text" placeholder="ex: 牛後腿肉" value={newCargo.type} onChange={handleCargoInputChange} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>數量</label>
              <div className="number-spinner">
                <button 
                  type="button" 
                  className="spinner-btn" 
                  onClick={() => setNewCargo(prev => ({ ...prev, quantity: Math.max(0, prev.quantity - 1) }))}
                >
                  -
                </button>
                <input 
                  name="quantity" 
                  type="number" 
                  placeholder="0" 
                  value={newCargo.quantity} 
                  onChange={handleCargoInputChange} 
                  required 
                />
                <button 
                  type="button" 
                  className="spinner-btn" 
                  onClick={() => setNewCargo(prev => ({ ...prev, quantity: prev.quantity + 1 }))}
                >
                  +
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>單位</label>
              <select name="unit" className="form-select" value={newCargo.unit} onChange={handleCargoInputChange}>
                <option value="板">板</option>
                <option value="箱">箱</option>
              </select>
            </div>
          </div>
          
          <CustomSelect 
            label="出發倉庫" 
            value={newCargo.origin} 
            options={warehouseOptions}
            onChange={(val) => setNewCargo(prev => ({ ...prev, origin: val }))} 
          />
          
          <CustomSelect 
            label="抵達倉庫" 
            value={newCargo.destination} 
            options={warehouseOptions}
            onChange={(val) => setNewCargo(prev => ({ ...prev, destination: val }))} 
          />

          <Button className="btn-full">確認送出</Button>
        </form>
      </Modal>

      {/* 新增貨車光箱 */}
      <Modal isOpen={isTruckModalOpen} onClose={() => setIsTruckModalOpen(false)} title="新增貨車">
        <form className="modal-form" onSubmit={handleAddTruck}>
          <div className="form-group">
            <label>貨車編號</label>
            <input name="number" type="text" placeholder="例如：TR-999" value={newTruck.number} onChange={handleTruckInputChange} required />
          </div>
          
          <CustomSelect 
            label="配置出發地" 
            value={newTruck.origin} 
            options={warehouseOptions}
            onChange={(val) => setNewTruck(prev => ({ ...prev, origin: val }))} 
          />

          <Button className="btn-full">確認新增</Button>
        </form>
      </Modal>

      {/* 配送紀錄光箱 */}
      <Modal 
        isOpen={isRecordsModalOpen} 
        onClose={() => setIsRecordsModalOpen(false)} 
        title={`🚛 貨車配送紀錄: ${activeTruck?.number || ''}`}
      >
        <div className="records-modal-content">
          {filteredRoutes.length > 0 ? (
            <ul className="route-list-modal">
              {filteredRoutes.map(r => (
                <li key={r.id} className="route-record-card">
                  <div className="route-card-header">
                    <strong>📦 {r.cargoType}</strong>
                    <span className="route-id">單號: {r.id}</span>
                  </div>
                  <div className="route-card-body">
                    <div className="route-status-line">
                      <span>{r.origin}</span>
                      <span className="route-arrow">➔</span>
                      <span>{r.destination}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-records">
              <p>目前此貨車尚未有任何配送紀錄。</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Warehouse;
