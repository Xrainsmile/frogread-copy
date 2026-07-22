import { useEffect, useState } from 'react';
import { ConfigProvider, useConfig } from './store';
import { NAV_ITEMS } from './constants';
import GeneralPage from './pages/general';
import ApiProvidersPage from './pages/api-providers';
import CustomActionsPage from './pages/custom-actions';
import TranslationPage from './pages/translation';
import SiteRulesPage from './pages/site-rules';
import VideoSubtitlesPage from './pages/video-subtitles';
import InputTranslationPage from './pages/input-translation';
import FloatingButtonPage from './pages/floating-button';

function useHashRoute(defaultRoute: string): [string, (r: string) => void] {
  const [route, setRoute] = useState(
    () => window.location.hash.replace(/^#\/?/, '') || defaultRoute,
  );
  useEffect(() => {
    const onHash = () =>
      setRoute(window.location.hash.replace(/^#\/?/, '') || defaultRoute);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [defaultRoute]);
  const nav = (r: string) => {
    window.location.hash = `/${r}`;
  };
  return [route, nav];
}

function renderPage(route: string) {
  switch (route) {
    case 'general':
      return <GeneralPage />;
    case 'api-providers':
      return <ApiProvidersPage />;
    case 'custom-actions':
      return <CustomActionsPage />;
    case 'translation':
      return <TranslationPage />;
    case 'site-rules':
      return <SiteRulesPage />;
    case 'video-subtitles':
      return <VideoSubtitlesPage />;
    case 'input-translation':
      return <InputTranslationPage />;
    case 'floating-button':
      return <FloatingButtonPage />;
    default:
      return <GeneralPage />;
  }
}

function Shell() {
  const { loaded } = useConfig();
  const [route, nav] = useHashRoute('general');

  return (
    <div className="rf-layout">
      <aside className="rf-sidebar">
        <div className="rf-brand">
          <img
            className="rf-brand-logo"
            src={chrome.runtime.getURL('icon128.png')}
            alt="ReadFlow"
          />
          <span>ReadFlow 设置</span>
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`rf-nav-item${route === item.id ? ' active' : ''}`}
            onClick={() => nav(item.id)}
          >
            <span className="rf-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </aside>
      <main className="rf-content">
        {loaded ? renderPage(route) : <p style={{ color: 'var(--rf-muted)' }}>加载中…</p>}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ConfigProvider>
      <Shell />
    </ConfigProvider>
  );
}
