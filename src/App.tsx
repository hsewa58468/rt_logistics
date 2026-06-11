import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Warehouse from "./pages/Warehouse";
import InventoryMng from "./pages/InventoryMng";

function App() {
  return (
    <Router>
      <Navbar />
      <div className="app-container">
        <Routes>
          <Route path="/" element={<InventoryMng />} />
          <Route path="/inventory" element={<InventoryMng />} />
          <Route path="/path_plan" element={<Warehouse />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
