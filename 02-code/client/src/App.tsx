import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import HomePage from './pages/Home';
import WordDetailPage from './pages/WordDetail';
import ReviewPage from './pages/Review';
import SettingsPage from './pages/Settings';

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isWordDetail = location.pathname.startsWith('/words/');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="brand" aria-label="回到首页">
            <span className="brand-mark">词</span>
            <div>
              <div className="brand-title">词穹</div>
              <div className="brand-subtitle">Lexicosmos · 单词的星空</div>
            </div>
          </Link>
          {isWordDetail && (
            <Link to="/" className="topbar-back">
              <span aria-hidden="true">←</span> 单词列表
            </Link>
          )}
        </div>
        {isHome && (
          <p className="topbar-tagline">
            输入一个英文单词，先由 AI 辅助梳理义项清单；针对每个义项，由人工逐条审核后进入知识库。
          </p>
        )}
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
