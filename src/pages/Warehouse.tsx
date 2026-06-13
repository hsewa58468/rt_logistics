import React, { useState, useEffect } from 'react'
import Map from '../components/Map'
import Modal from '../components/Modal'
import Button from '../components/Button'

interface Cargo {
  id: string
  type: string
  quantity: number
  unit: '板' | '箱'
  origin: string
  destination: string
  isAssigned: boolean
}

interface Truck {
  id: string
  number: string
  origin: string
}

interface RouteAction {
  type: 'pickup' | 'dropoff'
  cargoId: string
}

interface RouteStop {
  id: string
  warehouseName: string
  actions: RouteAction[]
}

interface Route {
  id: string
  truckId: string
  truckNumber: string
  stops: RouteStop[]
}

interface SelectOption {
  value: string
  label: string
  subLabel?: string
}

const WAREHOUSES = [
  {
    name: '桃園',
    address: '桃園市龜山區民生北路一段54巷4號',
    location: { lat: 25.034515, lng: 121.304649 },
  },
  {
    name: '華漢',
    address: '桃園市中壢區永清街460號',
    location: { lat: 24.987769, lng: 121.228338 },
  },
  {
    name: '牧昌',
    address: '桃園市中壢區東園路14號',
    location: { lat: 24.970119, lng: 121.239788 },
  },
  {
    name: '中和',
    address: '新北市中和區建三路81號',
    location: { lat: 25.000884, lng: 121.486139 },
  },
  {
    name: '汐止',
    address: '新北市汐止區環河街140號',
    location: { lat: 25.058563, lng: 121.628955 },
  },
  {
    name: '新竹',
    address: '新竹市香山區延平路二段727巷5號',
    location: { lat: 24.806429, lng: 120.921223 },
  },
  {
    name: '台中北屯',
    address: '台中市北屯區庄內巷15號',
    location: { lat: 24.189265, lng: 120.66665 },
  },
  { name: '東亮', address: '臺中市北區東成一街3號', location: { lat: 24.157564, lng: 120.700553 } },
]

// 自定義選擇器組件 (通用的)
const CustomSelect: React.FC<{
  label?: string
  value: string
  options: SelectOption[]
  onChange: (val: string) => void
  placeholder?: string
}> = ({ label, value, options, onChange, placeholder = '請選擇' }) => {
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = options.find((o) => o.value === value)

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
                  onChange(o.value)
                  setIsOpen(false)
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
  )
}

// 多選選擇器組件 (專門用於地點過濾)
const MultiLocationSelect: React.FC<{
  label?: string
  selectedLocations: string[]
  options: SelectOption[]
  onToggle: (name: string) => void
  onToggleAll: () => void
  allCount: number
}> = ({ label, selectedLocations, options, onToggle, onToggleAll, allCount }) => {
  const [isOpen, setIsOpen] = useState(false)
  const isAllSelected = selectedLocations.length === allCount

  const getDisplayText = () => {
    if (isAllSelected) return '全選'
    if (selectedLocations.length === 0) return '未選取'
    return selectedLocations.join(', ')
  }

  return (
    <div className="custom-select-container multi-select">
      {label && <label className="select-label-mini">{label}</label>}
      <div className="custom-select-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span className="trigger-text">
          <i className="filter-icon">🔍</i> {getDisplayText()}
        </span>
        <i className={`arrow ${isOpen ? 'up' : 'down'}`}></i>
      </div>

      {isOpen && (
        <>
          <div className="select-backdrop" onClick={() => setIsOpen(false)}></div>
          <div className="custom-select-options multi-options">
            <div
              className={`custom-option all-option ${isAllSelected ? 'selected' : ''}`}
              onClick={onToggleAll}
            >
              <div className="option-name">{isAllSelected ? '取消全選' : '全選全部'}</div>
            </div>
            <div className="options-divider"></div>
            {options.map((o) => (
              <div
                key={o.value}
                className={`custom-option ${selectedLocations.includes(o.value) ? 'selected' : ''}`}
                onClick={() => onToggle(o.value)}
              >
                <div className="option-row">
                  <div className="checkbox-custom">
                    {selectedLocations.includes(o.value) && <i className="check-mark">✓</i>}
                  </div>
                  <div className="option-name-group">
                    <div className="option-name">{o.label}</div>
                    {o.subLabel && <div className="option-address">{o.subLabel}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface SavedRecord {
  id: string
  name: string
  date: string
  cargoList: Cargo[]
  truckList: Truck[]
  routes: Route[]
}

// --- 車程計算工具函式 ---
const getHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371 // 地球半徑 (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const getTravelInfo = (fromName: string, toName: string) => {
  if (fromName === toName) return { distance: 0, timeMin: 0 }
  const from = WAREHOUSES.find((w) => w.name === fromName)
  const to = WAREHOUSES.find((w) => w.name === toName)
  if (!from || !to) return { distance: 0, timeMin: 0 }

  const distance = getHaversineDistance(
    from.location.lat,
    from.location.lng,
    to.location.lat,
    to.location.lng
  )
  const speedKmh = 35 // 假設平均車速 35km/h
  const timeHours = distance / speedKmh
  const timeMin = Math.round(timeHours * 60)
  return { distance, timeMin }
}

const formatTime = (min: number) => {
  if (min <= 0) return '0 分鐘'
  const hours = Math.floor(min / 60)
  const remainingMin = min % 60
  if (hours > 0) {
    return `${hours} 小時 ${remainingMin} 分鐘`
  }
  return `${min} 分鐘`
}

const getStopOperationTime = (stop: RouteStop, cargoList: Cargo[]) => {
  let palletCount = 0
  stop.actions.forEach((action) => {
    const cargo = cargoList.find((c) => c.id === action.cargoId)
    if (cargo && cargo.unit === '板') {
      palletCount += cargo.quantity
    }
  })
  return palletCount * 15
}

const getRouteSummary = (route: Route, cargoList: Cargo[]) => {
  let totalTravelMin = 0
  let totalOpMin = 0

  route.stops.forEach((stop, idx) => {
    totalOpMin += getStopOperationTime(stop, cargoList)
    if (idx < route.stops.length - 1) {
      const travel = getTravelInfo(stop.warehouseName, route.stops[idx + 1].warehouseName)
      totalTravelMin += travel.timeMin
    }
  })

  return { totalTravelMin, totalOpMin, totalMin: totalTravelMin + totalOpMin }
}

const Warehouse: React.FC = () => {
  // 貨物區塊
  const [isCargoModalOpen, setIsCargoModalOpen] = useState(false)
  const [cargoList, setCargoList] = useState<Cargo[]>([])

  const [newCargo, setNewCargo] = useState({
    type: '',
    quantity: 0,
    unit: '板' as Cargo['unit'],
    origin: WAREHOUSES[0].name,
    destination: WAREHOUSES[1].name,
  })

  // 貨車區塊
  const [isTruckModalOpen, setIsTruckModalOpen] = useState(false)
  const [truckList, setTruckList] = useState<Truck[]>([])

  const [newTruck, setNewTruck] = useState({
    number: '',
    origin: WAREHOUSES[0].name,
  })

  // 路線排程狀態
  const [routes, setRoutes] = useState<Route[]>([])
  const [editingTruckId, setEditingTruckId] = useState('')
  const [isRouteBuilderExpanded, setIsRouteBuilderExpanded] = useState(true)

  // 配送紀錄/選取狀態
  const [isRecordsModalOpen, setIsRecordsModalOpen] = useState(false)
  const [selectedTruckIdForRecords, setSelectedTruckIdForRecords] = useState('')
  const [activeTruckIdForMap, setActiveTruckIdForMap] = useState('')

  // 貨物篩選狀態
  const [locationFilter, setLocationFilter] = useState<string[]>(WAREHOUSES.map((w) => w.name))

  const toggleLocationFilter = (name: string) => {
    setLocationFilter((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const toggleAllFilters = () => {
    if (locationFilter.length === WAREHOUSES.length) {
      setLocationFilter([])
    } else {
      setLocationFilter(WAREHOUSES.map((w) => w.name))
    }
  }

  // 儲存與歷史紀錄狀態
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [historyRecords, setHistoryRecords] = useState<SavedRecord[]>([])

  // 讀取歷史紀錄
  useEffect(() => {
    const saved = localStorage.getItem('rt_logistics_history')
    if (saved) {
      try {
        setHistoryRecords(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse history', e)
      }
    }
  }, [])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!saveName.trim()) return

    const newRecord: SavedRecord = {
      id: Date.now().toString(),
      name: saveName.trim(),
      date: new Date().toLocaleString(),
      cargoList,
      truckList,
      routes,
    }

    const updatedRecords = [newRecord, ...historyRecords]
    setHistoryRecords(updatedRecords)
    localStorage.setItem('rt_logistics_history', JSON.stringify(updatedRecords))

    setIsSaveModalOpen(false)
    setSaveName('')
  }

  const handleLoad = (record: SavedRecord) => {
    if (window.confirm(`確定要讀取「${record.name}」嗎？這將會覆蓋目前的資料。`)) {
      setCargoList(record.cargoList)
      setTruckList(record.truckList)
      setRoutes(record.routes)
      setIsHistoryModalOpen(false)
    }
  }

  const handleDeleteRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm('確定要刪除這筆紀錄嗎？')) {
      const updatedRecords = historyRecords.filter((r) => r.id !== id)
      setHistoryRecords(updatedRecords)
      localStorage.setItem('rt_logistics_history', JSON.stringify(updatedRecords))
    }
  }

  // 取得目前編輯中貨車的路徑
  const currentRoute = routes.find((r) => r.truckId === editingTruckId)

  // ---------------------------------------------------------
  // 智慧驗證邏輯：判斷貨物是否已正確排程
  // ---------------------------------------------------------
  const checkCargoStatus = (cargoId: string) => {
    // 檢查所有路徑，看是否有包含此貨物
    const cargo = cargoList.find((c) => c.id === cargoId)
    if (!cargo) return 'pending'

    let hasPickup = false
    let hasCorrectDropoff = false

    routes.forEach((route) => {
      route.stops.forEach((stop) => {
        stop.actions.forEach((action) => {
          if (action.cargoId === cargoId) {
            if (action.type === 'pickup' && stop.warehouseName === cargo.origin) {
              hasPickup = true
            }
            if (action.type === 'dropoff' && stop.warehouseName === cargo.destination) {
              hasCorrectDropoff = true
            }
          }
        })
      })
    })

    if (hasPickup && hasCorrectDropoff) return 'assigned'
    if (hasPickup) return 'transit' // 運送中 (已上貨但未下貨或地點不對)
    return 'pending'
  }

  // 配置倉庫清單選項
  const warehouseOptions: SelectOption[] = WAREHOUSES.map((w) => ({
    value: w.name,
    label: w.name,
    subLabel: w.address,
  }))

  const truckOptions: SelectOption[] = truckList.map((t) => ({
    value: t.id,
    label: t.number,
    subLabel: `目前：${t.origin}`,
  }))

  // 貨物處理邏輯
  const handleCargoInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setNewCargo((prev) => ({
      ...prev,
      [name]: name === 'quantity' ? parseInt(value) || 0 : value,
    }))
  }

  const handleAddCargo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCargo.type || !newCargo.origin || !newCargo.destination) return
    const newItem: Cargo = { id: Date.now().toString(), ...newCargo, isAssigned: false }
    setCargoList((prev) => [newItem, ...prev])
    setIsCargoModalOpen(false)
    setNewCargo({
      type: '',
      quantity: 0,
      unit: '板',
      origin: WAREHOUSES[0].name,
      destination: WAREHOUSES[1].name,
    })
  }

  // 貨車處理邏輯
  const handleTruckInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setNewTruck((prev) => ({ ...prev, [name]: value }))
  }

  const handleAddTruck = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTruck.number || !newTruck.origin) return
    const newItem: Truck = { id: Date.now().toString(), ...newTruck }
    setTruckList((prev) => [newItem, ...prev])
    setIsTruckModalOpen(false)
    setNewTruck({ number: '', origin: WAREHOUSES[0].name })
  }

  const handleDeleteCargo = (cargoId: string) => {
    if (!window.confirm('確定要刪除此貨物嗎？相關的路線動作也將被移除。')) return
    setCargoList((prev) => prev.filter((c) => c.id !== cargoId))
    setRoutes((prev) =>
      prev.map((route) => ({
        ...route,
        stops: route.stops.map((stop) => ({
          ...stop,
          actions: stop.actions.filter((a) => a.cargoId !== cargoId),
        })),
      }))
    )
  }

  const handleDeleteTruck = (truckId: string) => {
    if (!window.confirm('確定要刪除此貨車嗎？相關路線排程也將一併移除。')) return
    setTruckList((prev) => prev.filter((t) => t.id !== truckId))
    setRoutes((prev) => prev.filter((r) => r.truckId !== truckId))
    if (editingTruckId === truckId) {
      setEditingTruckId('')
      setActiveTruckIdForMap('')
    }
  }

  // ---------------------------------------------------------
  // 停靠點排程邏輯 (新)
  // ---------------------------------------------------------
  const handleAddStop = (warehouseName: string) => {
    if (!editingTruckId) return
    const truck = truckList.find((t) => t.id === editingTruckId)
    if (!truck) return

    setRoutes((prev) => {
      const existing = prev.find((r) => r.truckId === editingTruckId)
      const newStop: RouteStop = { id: Date.now().toString(), warehouseName, actions: [] }

      if (existing) {
        let newStops = [...existing.stops]
        if (newStops.length > 0) {
          const lastStop = newStops[newStops.length - 1]
          // 如果最後一點是出發地，則插入到倒數第二位
          if (lastStop.warehouseName === truck.origin && newStops.length > 1) {
            newStops.splice(newStops.length - 1, 0, newStop)
          } else {
            // 否則直接加入並補上返回點
            const returnStop: RouteStop = {
              id: `return-${Date.now()}`,
              warehouseName: truck.origin,
              actions: [],
            }
            newStops = [...newStops, newStop, returnStop]
          }
        } else {
          newStops = [newStop]
        }
        return prev.map((r) => (r.truckId === editingTruckId ? { ...r, stops: newStops } : r))
      } else {
        // 全新路徑：出發地 -> 新地點 -> 出發地
        const startStop: RouteStop = {
          id: `start-${Date.now()}`,
          warehouseName: truck.origin,
          actions: [],
        }
        const returnStop: RouteStop = {
          id: `return-${Date.now()}`,
          warehouseName: truck.origin,
          actions: [],
        }
        return [
          ...prev,
          {
            id: Date.now().toString(),
            truckId: editingTruckId,
            truckNumber: truck.number,
            stops: [startStop, newStop, returnStop],
          },
        ]
      }
    })
  }

  const handleToggleAction = (stopId: string, cargoId: string, type: 'pickup' | 'dropoff') => {
    setRoutes((prev) =>
      prev.map((route) => {
        if (route.truckId !== editingTruckId) return route
        return {
          ...route,
          stops: route.stops.map((stop) => {
            if (stop.id !== stopId) return stop
            const hasAction = stop.actions.some((a) => a.cargoId === cargoId && a.type === type)
            if (hasAction) {
              return {
                ...stop,
                actions: stop.actions.filter((a) => !(a.cargoId === cargoId && a.type === type)),
              }
            } else {
              return { ...stop, actions: [...stop.actions, { type, cargoId }] }
            }
          }),
        }
      })
    )
  }

  const handleRemoveStop = (stopId: string) => {
    setRoutes((prev) =>
      prev.map((r) =>
        r.truckId === editingTruckId ? { ...r, stops: r.stops.filter((s) => s.id !== stopId) } : r
      )
    )
  }

  const handleMoveStop = (idx: number, direction: 'up' | 'down') => {
    setRoutes((prev) =>
      prev.map((route) => {
        if (route.truckId !== editingTruckId) return route

        const newStops = [...route.stops]
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1

        // 確保不超過邊界，且不移動固定的起點與終點
        if (
          targetIdx < 1 ||
          targetIdx >= newStops.length - 1 ||
          idx < 1 ||
          idx >= newStops.length - 1
        ) {
          return route
        }

        // 交換位置
        ;[newStops[idx], newStops[targetIdx]] = [newStops[targetIdx], newStops[idx]]

        return { ...route, stops: newStops }
      })
    )
  }

  // 處理貨車選取：一定要將出發地設為第一點，且確保最後一筆也是出發地
  const handleTruckSelect = (truckId: string) => {
    setEditingTruckId(truckId)
    setActiveTruckIdForMap(truckId) // 同步啟用列表與地圖的貨車高亮
    setIsRouteBuilderExpanded(true) // 已選取貨車，自動展開區塊

    if (!truckId) return

    const truck = truckList.find((t) => t.id === truckId)
    if (!truck) return

    setRoutes((prev) => {
      const existingRoute = prev.find((r) => r.truckId === truckId)

      if (!existingRoute) {
        // 1. 完全沒路徑：就先給起點 [Origin]
        const initialStop: RouteStop = {
          id: `start-${Date.now()}`,
          warehouseName: truck.origin,
          actions: [],
        }
        return [
          ...prev,
          { id: Date.now().toString(), truckId, truckNumber: truck.number, stops: [initialStop] },
        ]
      } else {
        // 2. 已有路徑：檢查起點跟終點
        let newStops = [...existingRoute.stops]
        let changed = false

        // 確保起點
        if (newStops.length > 0 && newStops[0].warehouseName !== truck.origin) {
          const startStop: RouteStop = {
            id: `start-${Date.now()}`,
            warehouseName: truck.origin,
            actions: [],
          }
          newStops = [startStop, ...newStops]
          changed = true
        }

        // 確保終點 (如果路徑已經有超過1個點或是已經剛補了起點)
        if (newStops.length > 1 && newStops[newStops.length - 1].warehouseName !== truck.origin) {
          const returnStop: RouteStop = {
            id: `return-${Date.now()}`,
            warehouseName: truck.origin,
            actions: [],
          }
          newStops = [...newStops, returnStop]
          changed = true
        }

        if (!changed) return prev
        return prev.map((r) => (r.truckId === truckId ? { ...r, stops: newStops } : r))
      }
    })
  }

  // 配送紀錄光箱處理
  const handleOpenRecords = (e: React.MouseEvent<HTMLButtonElement>, truckId: string) => {
    e.stopPropagation()
    setSelectedTruckIdForRecords(truckId)
    setIsRecordsModalOpen(true)
  }

  const filteredRoutes = routes.filter((r) => r.truckId === selectedTruckIdForRecords)
  const activeTruck = truckList.find((t) => t.id === selectedTruckIdForRecords)

  return (
    <div className="warehouse-layout">
      {/* 左側清單區 */}
      <div className="sidebar-lists">
        {/* 指派區塊 */}
        <header className="list-header">
          <h3>🏢 路線指派專區</h3>
          <div className="header-actions">
            <Button className="btn-dispatch-main" onClick={() => setIsDispatchModalOpen(true)}>
              📋 派車單
            </Button>
            <Button className="btn-save-main" onClick={() => setIsSaveModalOpen(true)}>
              儲存檔案
            </Button>
            <Button className="btn-history-main" onClick={() => setIsHistoryModalOpen(true)}>
              歷史紀錄
            </Button>
          </div>
        </header>
        <section className="list-section appointment-box">
          <div className="appointment-form">
            <CustomSelect
              label="選擇要排程的貨車"
              value={editingTruckId}
              options={truckOptions}
              onChange={handleTruckSelect}
              placeholder="選擇貨車開始規劃..."
            />

            {editingTruckId && (
              <div className="route-builder">
                <div
                  className="route-builder-header"
                  onClick={() => setIsRouteBuilderExpanded(!isRouteBuilderExpanded)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="title-with-icon">
                    <i className={`collapsible-arrow ${isRouteBuilderExpanded ? 'open' : ''}`}>▶</i>
                    <h4>📍 路徑排程序列</h4>
                  </div>
                  <div className="add-stop-controls" onClick={(e) => e.stopPropagation()}>
                    <select
                      className="form-select mini"
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddStop(e.target.value)
                          e.target.value = ''
                          setIsRouteBuilderExpanded(true) // 新增停靠點時自動展開
                        }
                      }}
                      value=""
                    >
                      <option value="" disabled>
                        新增停靠點...
                      </option>
                      {WAREHOUSES.map((w) => (
                        <option key={w.name} value={w.name}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {isRouteBuilderExpanded && (
                  <div className="stops-sequence">
                    {currentRoute?.stops.map((stop, sIdx) => {
                      const prevStop = sIdx > 0 ? currentRoute.stops[sIdx - 1] : null
                      const travel = prevStop
                        ? getTravelInfo(prevStop.warehouseName, stop.warehouseName)
                        : null

                      const getLoadAtStop = () => {
                        let plates = 0
                        let boxes = 0
                        currentRoute.stops.slice(0, sIdx + 1).forEach((s) => {
                          s.actions.forEach((a) => {
                            const cargo = cargoList.find((c) => c.id === a.cargoId)
                            if (!cargo) return
                            const amount = a.type === 'pickup' ? cargo.quantity : -cargo.quantity
                            if (cargo.unit === '板') plates += amount
                            else boxes += amount
                          })
                        })
                        return { plates, boxes }
                      }
                      const load = getLoadAtStop()
                      const opTime = getStopOperationTime(stop, cargoList)

                      const isReorderable = sIdx > 0 && sIdx < (currentRoute?.stops.length || 0) - 1
                      const canMoveUp = sIdx > 1
                      const canMoveDown = sIdx < (currentRoute?.stops.length || 0) - 2

                      return (
                        <React.Fragment key={stop.id}>
                          {travel && travel.timeMin > 0 && (
                            <div className="travel-time-step">
                              <i className="time-icon">🚗</i>
                              <span className="time-text">
                                預估車程：{formatTime(travel.timeMin)} ({travel.distance.toFixed(1)}{' '}
                                km)
                              </span>
                            </div>
                          )}
                          <div className="stop-card">
                            <div className="stop-card-header">
                              <span className="stop-index">{sIdx + 1}</span>
                              <div className="stop-title-info">
                                <span className="stop-location">{stop.warehouseName}</span>
                                <div className="stop-load-badge">
                                  🚚 當前載重: {load.plates} 板 / {load.boxes} 箱
                                  {opTime > 0 && (
                                    <span className="op-time-badge"> | ⏳ 作業: {opTime} 分鐘</span>
                                  )}
                                </div>
                              </div>
                              <div className="stop-action-controls">
                                {isReorderable && (
                                  <>
                                    <button
                                      className="btn-move"
                                      disabled={!canMoveUp}
                                      onClick={() => handleMoveStop(sIdx, 'up')}
                                      title="上移"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      className="btn-move"
                                      disabled={!canMoveDown}
                                      onClick={() => handleMoveStop(sIdx, 'down')}
                                      title="下移"
                                    >
                                      ▼
                                    </button>
                                  </>
                                )}
                                <button
                                  className="btn-remove-stop"
                                  onClick={() => handleRemoveStop(stop.id)}
                                >
                                  ×
                                </button>
                              </div>
                            </div>

                            <div className="stop-actions">
                              <div className="action-group">
                                <label>載貨 (Pickup)</label>
                                <div className="action-items">
                                  {cargoList
                                    .filter((c) => {
                                      const status = checkCargoStatus(c.id)
                                      const isPickedInCurrentStop = stop.actions.some(
                                        (a) => a.cargoId === c.id && a.type === 'pickup'
                                      )
                                      return (
                                        c.origin === stop.warehouseName &&
                                        (status === 'pending' || isPickedInCurrentStop)
                                      )
                                    })
                                    .map((c) => (
                                      <button
                                        key={c.id}
                                        className={`action-btn pickup ${stop.actions.some((a) => a.cargoId === c.id && a.type === 'pickup') ? 'active' : ''}`}
                                        onClick={() => handleToggleAction(stop.id, c.id, 'pickup')}
                                      >
                                        {c.type}
                                      </button>
                                    ))}
                                </div>
                              </div>

                              <div className="action-group">
                                <label>卸貨 (Dropoff)</label>
                                <div className="action-items">
                                  {cargoList
                                    .filter((c) => {
                                      const allStops = currentRoute?.stops || []
                                      const isPickedUp = allStops
                                        .slice(0, sIdx)
                                        .some((ps) =>
                                          ps.actions.some(
                                            (pa) => pa.cargoId === c.id && pa.type === 'pickup'
                                          )
                                        )
                                      const isDroppedOffBefore = allStops
                                        .slice(0, sIdx)
                                        .some((ps) =>
                                          ps.actions.some(
                                            (pa) => pa.cargoId === c.id && pa.type === 'dropoff'
                                          )
                                        )
                                      return isPickedUp && !isDroppedOffBefore
                                    })
                                    .map((c) => (
                                      <button
                                        key={c.id}
                                        className={`action-btn dropoff ${stop.actions.some((a) => a.cargoId === c.id && a.type === 'dropoff') ? 'active' : ''}`}
                                        onClick={() => handleToggleAction(stop.id, c.id, 'dropoff')}
                                      >
                                        {c.type}
                                      </button>
                                    ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      )
                    })}
                    {currentRoute && currentRoute.stops.length > 1 && (
                      <div className="route-total-summary">
                        {(() => {
                          const summary = getRouteSummary(currentRoute, cargoList)
                          return (
                            <>
                              <div className="summary-row">
                                <span>🚗 預估車程：{formatTime(summary.totalTravelMin)}</span>
                                <span>⏳ 預估作業：{formatTime(summary.totalOpMin)}</span>
                              </div>
                              <div className="summary-total">
                                🏁 預估總工時：{formatTime(summary.totalMin)}
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    )}
                    {(!currentRoute || currentRoute.stops.length === 0) && (
                      <div className="empty-route-hint">尚未新增任何停靠點</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 貨物段 */}
        <header className="list-header" style={{ marginTop: '2rem' }}>
          <h3>📦 貨物清單</h3>
          <Button className="btn-small" onClick={() => setIsCargoModalOpen(true)}>
            新增貨物
          </Button>
        </header>

        <section className="list-section">
          <MultiLocationSelect
            label="所在地篩選 (起點或終地)"
            selectedLocations={locationFilter}
            options={warehouseOptions}
            onToggle={toggleLocationFilter}
            onToggleAll={toggleAllFilters}
            allCount={WAREHOUSES.length}
          />

          <ul className="data-list-refined">
            {cargoList
              .filter(
                (item) =>
                  locationFilter.includes(item.origin) || locationFilter.includes(item.destination)
              )
              .map((item) => {
                const status = checkCargoStatus(item.id)
                const statusText =
                  status === 'assigned' ? '已送達' : status === 'transit' ? '配送中' : '待處理'
                const statusClass =
                  status === 'assigned' ? 'assigned' : status === 'transit' ? 'transit' : 'pending'

                const assignedTruck = routes.find((r) =>
                  r.stops.some((s) => s.actions.some((a) => a.cargoId === item.id))
                )

                return (
                  <li
                    key={item.id}
                    className={`cargo-item-complex ${status === 'assigned' ? 'assigned-opacity' : ''}`}
                  >
                    <div className="cargo-main-info">
                      <span className={`status-pill ${statusClass}`}>{statusText}</span>
                      <span className="cargo-type">{item.type}</span>
                      <span className="cargo-qty">
                        {item.quantity} <small>{item.unit}</small>
                      </span>
                      {assignedTruck && (
                        <span className="assigned-truck-badge">🚚 {assignedTruck.truckNumber}</span>
                      )}
                      <button
                        className="btn-delete-item"
                        onClick={() => handleDeleteCargo(item.id)}
                        title="刪除"
                      >
                        ×
                      </button>
                    </div>
                    <div className="cargo-route-info">
                      <div className="route-step">
                        <span className="dot origin"></span>
                        <span className="loc-name">{item.origin}</span>
                        <span className="loc-addr">
                          {WAREHOUSES.find((w) => w.name === item.origin)?.address}
                        </span>
                      </div>
                      <div className="route-step">
                        <span className="dot dest"></span>
                        <span className="loc-name">{item.destination}</span>
                        <span className="loc-addr">
                          {WAREHOUSES.find((w) => w.name === item.destination)?.address}
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
          </ul>
        </section>

        {/* 貨車段 */}
        <header className="list-header" style={{ marginTop: '2rem' }}>
          <h3>🚚 貨車列表</h3>
          <Button className="btn-small" onClick={() => setIsTruckModalOpen(true)}>
            新增貨車
          </Button>
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
                onClick={() =>
                  setActiveTruckIdForMap(activeTruckIdForMap === truck.id ? '' : truck.id)
                }
              >
                <span className="truck-number">#{truck.number}</span>
                <div className="truck-loc-info">
                  <span className="loc-name">{truck.origin}</span>
                  <span className="loc-addr">
                    {WAREHOUSES.find((w) => w.name === truck.origin)?.address}
                  </span>
                </div>
                <div className="truck-actions">
                  <Button
                    className="btn-small btn-record"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) =>
                      handleOpenRecords(e, truck.id)
                    }
                  >
                    紀錄
                  </Button>
                  <Button
                    className="btn-small btn-delete"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation()
                      handleDeleteTruck(truck.id)
                    }}
                  >
                    刪除
                  </Button>
                </div>
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
      <Modal
        isOpen={isCargoModalOpen}
        onClose={() => setIsCargoModalOpen(false)}
        title="輸入新貨物資訊"
      >
        <form className="modal-form" onSubmit={handleAddCargo}>
          <div className="form-group">
            <label>貨物種類</label>
            <input
              name="type"
              type="text"
              placeholder="ex: 牛後腿肉"
              value={newCargo.type}
              onChange={handleCargoInputChange}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>數量</label>
              <div className="number-spinner">
                <button
                  type="button"
                  className="spinner-btn"
                  onClick={() =>
                    setNewCargo((prev) => ({ ...prev, quantity: Math.max(0, prev.quantity - 1) }))
                  }
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
                  onClick={() => setNewCargo((prev) => ({ ...prev, quantity: prev.quantity + 1 }))}
                >
                  +
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>單位</label>
              <select
                name="unit"
                className="form-select"
                value={newCargo.unit}
                onChange={handleCargoInputChange}
              >
                <option value="板">板</option>
                <option value="箱">箱</option>
              </select>
            </div>
          </div>

          <CustomSelect
            label="出發倉庫"
            value={newCargo.origin}
            options={warehouseOptions}
            onChange={(val) => setNewCargo((prev) => ({ ...prev, origin: val }))}
          />

          <CustomSelect
            label="抵達倉庫"
            value={newCargo.destination}
            options={warehouseOptions}
            onChange={(val) => setNewCargo((prev) => ({ ...prev, destination: val }))}
          />

          <Button className="btn-full">確認送出</Button>
        </form>
      </Modal>

      {/* 新增貨車光箱 */}
      <Modal isOpen={isTruckModalOpen} onClose={() => setIsTruckModalOpen(false)} title="新增貨車">
        <form className="modal-form" onSubmit={handleAddTruck}>
          <div className="form-group">
            <label>貨車編號</label>
            <input
              name="number"
              type="text"
              placeholder="例如：TR-999"
              value={newTruck.number}
              onChange={handleTruckInputChange}
              required
            />
          </div>

          <CustomSelect
            label="配置出發地"
            value={newTruck.origin}
            options={warehouseOptions}
            onChange={(val) => setNewTruck((prev) => ({ ...prev, origin: val }))}
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
              {filteredRoutes.map((r) => (
                <li key={r.id} className="route-record-card">
                  <div className="route-card-header">
                    <strong>📍 完整路線序列</strong>
                  </div>
                  <div className="route-card-body">
                    <div className="stop-sequence-vertical">
                      {r.stops.map((stop, idx) => (
                        <div key={stop.id} className="stop-item-vertical">
                          <div className="stop-marker-line">
                            <span className="stop-dot"></span>
                            {idx < r.stops.length - 1 && <span className="stop-line"></span>}
                          </div>
                          <div className="stop-info-vertical">
                            <div className="stop-loc-row">
                              <strong>{stop.warehouseName}</strong>
                            </div>
                            <div className="stop-actions-vertical">
                              {stop.actions.map((action, aIdx) => {
                                const cargo = cargoList.find((c) => c.id === action.cargoId)
                                return (
                                  <div key={aIdx} className={`action-tag ${action.type}`}>
                                    {action.type === 'pickup' ? '⬆️ 載貨' : '⬇️ 卸貨'}:{' '}
                                    {cargo?.type}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
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
      {/* 儲存檔案光箱 */}
      <Modal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        title="儲存當前設定"
      >
        <form className="modal-form" onSubmit={handleSave}>
          <div className="form-group">
            <label>紀錄名稱</label>
            <input
              type="text"
              placeholder="例如：2026-04-23 配送規劃"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <Button className="btn-full">確認儲存</Button>
        </form>
      </Modal>

      {/* 歷史紀錄光箱 */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title="歷史紀錄讀取"
      >
        <div className="history-modal-content">
          {historyRecords.length > 0 ? (
            <ul className="history-list">
              {historyRecords.map((record) => (
                <li key={record.id} className="history-item" onClick={() => handleLoad(record)}>
                  <div className="history-info">
                    <div className="history-name">{record.name}</div>
                    <div className="history-date">{record.date}</div>
                    <div className="history-stats">
                      <span>📦 {record.cargoList.length} 件貨物</span>
                      <span>🚚 {record.truckList.length} 台貨車</span>
                    </div>
                  </div>
                  <div className="history-actions">
                    <button className="btn-load-record">讀取</button>
                    <button
                      className="btn-delete-record"
                      onClick={(e) => handleDeleteRecord(record.id, e)}
                    >
                      刪除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-history">
              <p>目前尚無任何儲存紀錄。</p>
            </div>
          )}
        </div>
      </Modal>

      {/* 派車單（全域總覽）光箱 */}
      <Modal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        title="全域派車任務總覽"
      >
        <div className="dispatch-modal-wrapper">
          <div
            className="dispatch-cards-scroll"
            onWheel={(e) => {
              if (e.deltaY !== 0) {
                e.preventDefault()
                e.currentTarget.scrollBy({
                  left: e.deltaY,
                  behavior: 'smooth',
                })
              }
            }}
          >
            {truckList.map((truck) => {
              const route = routes.find((r) => r.truckId === truck.id)
              return (
                <div key={truck.id} className="dispatch-card">
                  <div className="dispatch-card-header">
                    <div className="truck-info-group">
                      <span className="dispatch-truck-no">🚚 {truck.number}</span>
                      <span className="dispatch-truck-origin">📍 {truck.origin}</span>
                    </div>
                  </div>
                  <div className="dispatch-card-body" onWheel={(e) => e.stopPropagation()}>
                    {route && route.stops.length > 0 ? (
                      <div className="dispatch-stops-flow">
                        {route.stops.map((stop, sIdx) => {
                          const prevStop = sIdx > 0 ? route.stops[sIdx - 1] : null
                          const travel = prevStop
                            ? getTravelInfo(prevStop.warehouseName, stop.warehouseName)
                            : null

                          return (
                            <React.Fragment key={stop.id}>
                              {travel && travel.timeMin > 0 && (
                                <div className="dispatch-travel-gap">
                                  ⏱️ {formatTime(travel.timeMin)}
                                </div>
                              )}
                              <div className="dispatch-stop-node">
                                <div className="node-marker">
                                  <span className="node-dot"></span>
                                  {sIdx < route.stops.length - 1 && (
                                    <span className="node-line"></span>
                                  )}
                                </div>
                                <div className="node-content">
                                  <div className="node-location">
                                    {stop.warehouseName}
                                    {getStopOperationTime(stop, cargoList) > 0 && (
                                      <span className="dispatch-op-tag">
                                        {' '}
                                        (⏳ {getStopOperationTime(stop, cargoList)}m)
                                      </span>
                                    )}
                                  </div>
                                  <div className="node-actions">
                                    {stop.actions.map((action, aIdx) => {
                                      const cargo = cargoList.find((c) => c.id === action.cargoId)
                                      return (
                                        <div
                                          key={aIdx}
                                          className={`dispatch-mini-tag ${action.type}`}
                                        >
                                          {action.type === 'pickup' ? '載' : '卸'} {cargo?.type}
                                        </div>
                                      )
                                    })}
                                    {stop.actions.length === 0 && (
                                      <span className="no-actions-text">無作業</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </React.Fragment>
                          )
                        })}
                        <div className="dispatch-route-footer">
                          🏁 總時數：
                          {(() => {
                            let totalMin = 0
                            for (let i = 1; i < route.stops.length; i++) {
                              totalMin += getTravelInfo(
                                route.stops[i - 1].warehouseName,
                                route.stops[i].warehouseName
                              ).timeMin
                            }
                            return formatTime(totalMin)
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="dispatch-no-route">
                        <p>尚未規劃路線</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Warehouse
