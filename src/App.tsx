import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Menage from "./Menage";
import Admin from "./Admin";
import CalendarDayUse from "./CalendarDayUse";

function App() {
  return (
    <Router>
      <Routes>
        {/* L'adresse de base (/) affiche la tablette de ménage */}
        <Route path="/" element={<Menage />} />

        {/* L'adresse secrète (/admin) affiche le panel de direction */}
        <Route path="/admin" element={<Admin />} />

        {/* Si quelqu'un tape n'importe quoi, on le renvoie au ménage */}
        <Route path="*" element={<Navigate to="/" />} />

        <Route path="/day-use" element={<CalendarDayUse />} />
      </Routes>
    </Router>
  );
}

export default App;
