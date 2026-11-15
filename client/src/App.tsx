import { NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/Home';
import WordDetailPage from './pages/WordDetail';
import ReviewPage from './pages/Review';
import SettingsPage from './pages/Settings';

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">词</span>
          <div>
            <div className="brand-title">单词概念研究台</div>
            {/* <div className="brand-subtitle">词义 ·  边界</div> */}
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            单词
          </NavLink>
          <NavLink to="/review">审核中心</NavLink>
          <NavLink to="/settings">设置与数据</NavLink>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/words/:id" element={<WordDetailPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
