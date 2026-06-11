import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Modal from "../components/Modal";
import Button from "../components/Button";

interface Warehouse {
  warehouse_id: string;
  warehouse_name: string;
}

interface InventoryItem {
  item_id: string;
  warehouse_id: string;
  warehouse_label: string;
  part_number: string;
  item_name: string;
  created_at: string;
  current_quantity: number;
  original_quantity: number;
  manufacture_date: string | null;
  board_unit: string | null;
  paper: number | null;
}

interface HistoryRecord {
  id: string;
  item_id: string;
  destination: string;
  quantity: number;
  date: string;
  notes: string;
}

interface QueryRecord {
  id: string;
  destination: string;
  quantity: number;
  date: string;
  notes: string;
  inventory: { item_name: string; part_number: string } | null;
}

const InventoryMng: React.FC = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [activeWarehouseId, setActiveWarehouseId] = useState("");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    warehouse_label: "",
    part_number: "",
    item_name: "",
    original_quantity: 0,
    manufacture_date: "",
    board_unit: "",
    paper: 0,
    created_at: new Date().toISOString().split("T")[0],
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState({
    warehouse_label: '',
    part_number: '',
    item_name: '',
    original_quantity: 0,
    manufacture_date: '',
    board_unit: '',
    paper: 0,
    created_at: '',
  });

  const [isShipModalOpen, setIsShipModalOpen] = useState(false);
  const [shipTarget, setShipTarget] = useState<InventoryItem | null>(null);
  const [shipForm, setShipForm] = useState({
    destination: "",
    quantity: 1,
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [detailHistory, setDetailHistory] = useState<HistoryRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 倉庫管理
  const [isAddWarehouseOpen, setIsAddWarehouseOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("");

  // 日期查詢
  const [isDateQueryOpen, setIsDateQueryOpen] = useState(false);
  const [queryDate, setQueryDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [queryResults, setQueryResults] = useState<QueryRecord[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (activeWarehouseId) fetchItems(activeWarehouseId);
  }, [activeWarehouseId]);

  const fetchWarehouses = async () => {
    const { data, error } = await supabase
      .from("warehouses")
      .select("*")
      .order("warehouse_name");
    if (error) {
      console.error(error);
      return;
    }
    if (data && data.length > 0) {
      setWarehouses(data);
      setActiveWarehouseId(data[0].warehouse_id);
    }
  };

  const fetchItems = async (warehouseId: string) => {
    setLoading(true);
    const { data: invData, error } = await supabase
      .from("inventory")
      .select("*")
      .eq("warehouse_id", warehouseId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const items = invData || [];
    if (items.length > 0) {
      const { data: histData } = await supabase
        .from("history")
        .select("item_id, quantity")
        .in(
          "item_id",
          items.map((i) => i.item_id),
        );

      const shippedMap: Record<string, number> = {};
      histData?.forEach((h) => {
        shippedMap[h.item_id] = (shippedMap[h.item_id] || 0) + h.quantity;
      });

      setItems(
        items.map((i) => ({
          ...i,
          current_quantity: i.original_quantity - (shippedMap[i.item_id] || 0),
        })),
      );
    } else {
      setItems([]);
    }
    setLoading(false);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("inventory").insert({
      warehouse_id: activeWarehouseId,
      warehouse_label: newItem.warehouse_label,
      part_number: newItem.part_number,
      item_name: newItem.item_name,
      original_quantity: newItem.original_quantity,
      current_quantity: newItem.original_quantity,
      manufacture_date: newItem.manufacture_date || null,
      board_unit: newItem.board_unit || null,
      paper: newItem.paper || null,
      created_at: newItem.created_at || new Date().toISOString(),
    });
    if (error) {
      console.error(error);
      return;
    }
    setIsAddModalOpen(false);
    setNewItem({
      warehouse_label: "",
      part_number: "",
      item_name: "",
      original_quantity: 0,
      manufacture_date: "",
      board_unit: "",
      paper: 0,
      created_at: new Date().toISOString().split("T")[0],
    });
    fetchItems(activeWarehouseId);
  };

  const handleShip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipTarget) return;

    const { error: histErr } = await supabase.from("history").insert({
      item_id: shipTarget.item_id,
      destination: shipForm.destination,
      quantity: shipForm.quantity,
      date: shipForm.date,
      notes: shipForm.notes,
    });
    if (histErr) {
      console.error(histErr);
      return;
    }

    setIsShipModalOpen(false);
    fetchItems(activeWarehouseId);
  };

  const handleOpenDetail = async (item: InventoryItem) => {
    setDetailItem(item);
    setDetailHistory([]);
    setIsDetailModalOpen(true);
    setDetailLoading(true);
    const { data, error } = await supabase
      .from("history")
      .select("*")
      .eq("item_id", item.item_id)
      .order("date", { ascending: false });
    if (error) console.error(error);
    setDetailHistory(data || []);
    setDetailLoading(false);
  };

  const handleDeleteHistory = async (id: string) => {
    if (!window.confirm("確定刪除此筆出貨紀錄？")) return;
    const { error } = await supabase.from("history").delete().eq("id", id);
    if (error) {
      console.error(error);
      return;
    }
    setDetailHistory((prev) => prev.filter((h) => h.id !== id));
    if (detailItem) fetchItems(activeWarehouseId);
  };

  const openShipModal = (item: InventoryItem) => {
    setShipTarget(item);
    setShipForm({
      destination: "",
      quantity: 1,
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setIsShipModalOpen(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditItem(item);
    setEditForm({
      warehouse_label: item.warehouse_label || '',
      part_number: item.part_number || '',
      item_name: item.item_name,
      original_quantity: item.original_quantity,
      manufacture_date: item.manufacture_date || '',
      board_unit: item.board_unit || '',
      paper: item.paper ?? 0,
      created_at: item.created_at.split('T')[0],
    });
    setIsEditModalOpen(true);
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    const { error } = await supabase.from('inventory').update({
      warehouse_label: editForm.warehouse_label,
      part_number: editForm.part_number,
      item_name: editForm.item_name,
      original_quantity: editForm.original_quantity,
      manufacture_date: editForm.manufacture_date || null,
      board_unit: editForm.board_unit || null,
      paper: editForm.paper || null,
      created_at: editForm.created_at || editItem.created_at,
    }).eq('item_id', editItem.item_id);
    if (error) { console.error(error); return; }
    setIsEditModalOpen(false);
    fetchItems(activeWarehouseId);
  };

  const handleDateQuery = async () => {
    setQueryLoading(true);
    setQueryResults([]);
    const nextDay = new Date(queryDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const { data, error } = await supabase
      .from("history")
      .select(
        "id, destination, quantity, date, notes, inventory(item_name, part_number)",
      )
      .gte("date", queryDate)
      .lt("date", nextDay.toISOString().split("T")[0])
      .order("date", { ascending: false });
    if (error) console.error(error);
    setQueryResults((data as unknown as QueryRecord[]) || []);
    setQueryLoading(false);
  };

  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWarehouseName.trim()) return;
    const { data, error } = await supabase
      .from("warehouses")
      .insert({ warehouse_name: newWarehouseName.trim() })
      .select()
      .single();
    if (error) {
      console.error(error);
      return;
    }
    setWarehouses((prev) => [...prev, data]);
    setActiveWarehouseId(data.warehouse_id);
    setNewWarehouseName("");
    setIsAddWarehouseOpen(false);
  };

  const handleDeleteWarehouse = async (w: Warehouse) => {
    if (
      !window.confirm(
        `確定刪除倉庫「${w.warehouse_name}」？該倉庫的庫存資料也將一併刪除。`,
      )
    )
      return;
    await supabase
      .from("inventory")
      .delete()
      .eq("warehouse_id", w.warehouse_id);
    await supabase
      .from("warehouses")
      .delete()
      .eq("warehouse_id", w.warehouse_id);
    const remaining = warehouses.filter(
      (x) => x.warehouse_id !== w.warehouse_id,
    );
    setWarehouses(remaining);
    setActiveWarehouseId(remaining[0]?.warehouse_id ?? "");
    if (activeWarehouseId === w.warehouse_id) setItems([]);
  };

  const activeWarehouse = warehouses.find(
    (w) => w.warehouse_id === activeWarehouseId,
  );

  return (
    <div className="inventory-page">
      {/* 倉庫分頁 */}
      <div className="warehouse-tabs">
        {warehouses.map((w) => (
          <div
            key={w.warehouse_id}
            className={`tab-item ${activeWarehouseId === w.warehouse_id ? "active" : ""}`}
          >
            <button
              className="tab-btn-label"
              onClick={() => setActiveWarehouseId(w.warehouse_id)}
            >
              {w.warehouse_name}
            </button>
            <button
              className="tab-btn-delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteWarehouse(w);
              }}
              title="刪除倉庫"
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="tab-btn tab-add-btn"
          onClick={() => setIsAddWarehouseOpen(true)}
        >
          + 新增倉庫
        </button>
      </div>

      {/* 分頁內容區 */}
      <div className="inventory-content">
        {/* 工具列 */}
        <div className="inventory-toolbar">
          <h3 className="inventory-title">
            {activeWarehouse?.warehouse_name ?? "—"} 庫存清單
          </h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              className="btn-small btn-query"
              onClick={() => setIsDateQueryOpen(true)}
            >
              日期查詢
            </Button>
            <Button
              className="btn-small"
              onClick={() => setIsAddModalOpen(true)}
              disabled={!activeWarehouseId}
            >
              + 新增
            </Button>
          </div>
        </div>

        {/* 表格 */}
        <div className="inventory-table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>倉庫標籤</th>
                <th>料號</th>
                <th>品項</th>
                <th>入庫日期</th>
                <th>製造日期</th>
                <th>每棧箱數</th>
                <th>文件數量</th>
                <th>拆櫃數量</th>
                <th>當前數量</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="loading-cell">
                    <span className="loading-spinner" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="table-empty">
                    此倉庫尚無資料
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.item_id}>
                    <td>{item.warehouse_label || "—"}</td>
                    <td>{item.part_number || "—"}</td>
                    <td className="item-name-cell">{item.item_name}</td>
                    <td>
                      {new Date(item.created_at).toLocaleDateString("zh-TW")}
                    </td>
                    <td>
                      {item.manufacture_date
                        ? new Date(item.manufacture_date).toLocaleDateString(
                            "zh-TW",
                          )
                        : "—"}
                    </td>
                    <td>{item.board_unit ?? "—"}箱/板</td>
                    <td>{item.paper ?? "—"}</td>
                    <td>{item.original_quantity}</td>
                    <td>
                      <span
                        className={item.current_quantity <= 0 ? "qty-zero" : ""}
                      >
                        {item.current_quantity}
                      </span>
                    </td>
                    <td className="action-cell">
                      <button
                        className="btn-ship"
                        onClick={() => openShipModal(item)}
                      >
                        出貨
                      </button>
                      <button
                        className="btn-detail"
                        onClick={() => handleOpenDetail(item)}
                      >
                        明細
                      </button>
                      <button
                        className="btn-edit"
                        onClick={() => openEditModal(item)}
                      >
                        編輯
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新增品項 Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="新增庫存品項"
      >
        <form className="modal-form" onSubmit={handleAddItem}>
          <div className="form-group">
            <label>倉庫標籤</label>
            <input
              type="text"
              placeholder="例如：A-01"
              value={newItem.warehouse_label}
              onChange={(e) =>
                setNewItem((p) => ({ ...p, warehouse_label: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>料號</label>
            <input
              type="text"
              placeholder="例如：SKU-001"
              value={newItem.part_number}
              onChange={(e) =>
                setNewItem((p) => ({ ...p, part_number: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>品項名稱</label>
            <input
              type="text"
              placeholder="例如：牛後腿肉"
              required
              value={newItem.item_name}
              onChange={(e) =>
                setNewItem((p) => ({ ...p, item_name: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>數量</label>
            <input
              type="number"
              min={0}
              value={newItem.original_quantity}
              onChange={(e) =>
                setNewItem((p) => ({
                  ...p,
                  original_quantity: +e.target.value,
                }))
              }
            />
          </div>
          <div className="form-group">
            <label>入庫日期</label>
            <input
              type="date"
              required
              value={newItem.created_at}
              onChange={(e) =>
                setNewItem((p) => ({ ...p, created_at: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>製造日期</label>
            <input
              type="date"
              value={newItem.manufacture_date}
              onChange={(e) =>
                setNewItem((p) => ({ ...p, manufacture_date: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>每棧箱數</label>
            <input
              type="text"
              placeholder="選填"
              value={newItem.board_unit}
              onChange={(e) =>
                setNewItem((p) => ({ ...p, board_unit: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>文件數量</label>
            <input
              type="number"
              min={0}
              placeholder="選填"
              value={newItem.paper || ""}
              onChange={(e) =>
                setNewItem((p) => ({ ...p, paper: +e.target.value || 0 }))
              }
            />
          </div>
          <Button className="btn-full">確認新增</Button>
        </form>
      </Modal>

      {/* 編輯品項 Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="編輯庫存品項">
        <form className="modal-form" onSubmit={handleEditItem}>
          <div className="form-group">
            <label>倉庫標籤</label>
            <input type="text" value={editForm.warehouse_label} onChange={e => setEditForm(p => ({ ...p, warehouse_label: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>料號</label>
            <input type="text" value={editForm.part_number} onChange={e => setEditForm(p => ({ ...p, part_number: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>品項名稱</label>
            <input type="text" required value={editForm.item_name} onChange={e => setEditForm(p => ({ ...p, item_name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>數量</label>
            <input type="number" min={0} value={editForm.original_quantity} onChange={e => setEditForm(p => ({ ...p, original_quantity: +e.target.value }))} />
          </div>
          <div className="form-group">
            <label>入庫時間</label>
            <input type="date" value={editForm.created_at} onChange={e => setEditForm(p => ({ ...p, created_at: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>製造日期</label>
            <input type="date" value={editForm.manufacture_date} onChange={e => setEditForm(p => ({ ...p, manufacture_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>每棧箱數</label>
            <input type="text" placeholder="選填" value={editForm.board_unit} onChange={e => setEditForm(p => ({ ...p, board_unit: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>文件數量</label>
            <input type="number" min={0} placeholder="選填" value={editForm.paper || ''} onChange={e => setEditForm(p => ({ ...p, paper: +e.target.value || 0 }))} />
          </div>
          <Button className="btn-full">確認修改</Button>
        </form>
      </Modal>

      {/* 出貨 Modal */}
      <Modal
        isOpen={isShipModalOpen}
        onClose={() => setIsShipModalOpen(false)}
        title={`出貨 — ${shipTarget?.item_name ?? ""}`}
      >
        <form className="modal-form" onSubmit={handleShip}>
          <div className="form-group">
            <label>出庫所</label>
            <input
              type="text"
              placeholder="請輸入出庫所名稱"
              required
              value={shipForm.destination}
              onChange={(e) =>
                setShipForm((p) => ({ ...p, destination: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>數量（庫存：{shipTarget?.current_quantity ?? 0}）</label>
            <input
              type="number"
              min={1}
              max={shipTarget?.current_quantity ?? 0}
              required
              value={shipForm.quantity}
              onChange={(e) =>
                setShipForm((p) => ({ ...p, quantity: +e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>日期</label>
            <input
              type="date"
              required
              value={shipForm.date}
              onChange={(e) =>
                setShipForm((p) => ({ ...p, date: e.target.value }))
              }
            />
          </div>
          <div className="form-group">
            <label>備註</label>
            <input
              type="text"
              placeholder="選填"
              value={shipForm.notes}
              onChange={(e) =>
                setShipForm((p) => ({ ...p, notes: e.target.value }))
              }
            />
          </div>
          <Button className="btn-full">確認出貨</Button>
        </form>
      </Modal>

      {/* 明細 Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`出貨明細 — ${detailItem?.item_name ?? ""}`}
      >
        <div className="detail-modal-content">
          {detailLoading ? (
            <p className="loading-cell">
              <span className="loading-spinner" />
            </p>
          ) : detailHistory.length === 0 ? (
            <p className="table-empty">尚無出貨紀錄</p>
          ) : (
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>出庫所</th>
                  <th>數量</th>
                  <th>日期</th>
                  <th>備註</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {detailHistory.map((h) => (
                  <tr key={h.id}>
                    <td>{h.destination || "—"}</td>
                    <td>{h.quantity}</td>
                    <td>{new Date(h.date).toLocaleDateString("zh-TW")}</td>
                    <td>{h.notes || "—"}</td>
                    <td>
                      <button
                        className="btn-delete-history"
                        onClick={() => handleDeleteHistory(h.id)}
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      {/* 日期查詢 Modal */}
      <Modal
        isOpen={isDateQueryOpen}
        onClose={() => setIsDateQueryOpen(false)}
        title="出貨明細查詢"
      >
        <div className="date-query-modal">
          <div className="date-query-bar">
            <input
              type="date"
              className="date-query-input"
              value={queryDate}
              onChange={(e) => setQueryDate(e.target.value)}
            />
            <Button className="btn-small" onClick={handleDateQuery}>
              查詢
            </Button>
          </div>

          {queryLoading ? (
            <p className="loading-cell">
              <span className="loading-spinner" />
            </p>
          ) : queryResults.length === 0 ? (
            <p className="table-empty">無出貨紀錄</p>
          ) : (
            <table className="inventory-table" style={{ marginTop: "12px" }}>
              <thead>
                <tr>
                  <th>品項</th>
                  <th>料號</th>
                  <th>出貨倉庫</th>
                  <th>數量</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {queryResults.map((r) => (
                  <tr key={r.id}>
                    <td>{r.inventory?.item_name ?? "—"}</td>
                    <td>{r.inventory?.part_number ?? "—"}</td>
                    <td>{r.destination || "—"}</td>
                    <td>{r.quantity}</td>
                    <td>{r.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      {/* 新增倉庫 Modal */}
      <Modal
        isOpen={isAddWarehouseOpen}
        onClose={() => setIsAddWarehouseOpen(false)}
        title="新增倉庫"
      >
        <form className="modal-form" onSubmit={handleAddWarehouse}>
          <div className="form-group">
            <label>倉庫名稱</label>
            <input
              type="text"
              placeholder="例如：台南"
              required
              autoFocus
              value={newWarehouseName}
              onChange={(e) => setNewWarehouseName(e.target.value)}
            />
          </div>
          <Button className="btn-full">確認新增</Button>
        </form>
      </Modal>
    </div>
  );
};

export default InventoryMng;
