import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../api/client';

interface LandingFeature { title: string; description: string; icon?: string }
interface LandingTestimonial { quote: string; author?: string }
interface LandingConfig {
  heroTitle: string;
  heroSubtitle: string;
  ctaMemberLabel: string;
  ctaAdminLabel: string;
  features: LandingFeature[];
  testimonials: LandingTestimonial[];
  heroImagePath?: string;
  links?: { features: string; testimonials: string; getStarted: string };
}
interface LandingStats { members: number; events: number; departments: number; attendancePercent: number }

export default function Landing() {
  const [brand, setBrand] = useState<string>('FaithConnect');
  const [cfg, setCfg] = useState<LandingConfig>({
    heroTitle: 'Connect, organize, and grow your church community',
    heroSubtitle: 'A modern, secure church management system that streamlines membership, events, communication, and reporting — accessible anywhere.',
    ctaMemberLabel: 'Member Login',
    ctaAdminLabel: 'Admin Login',
    features: [
      { title: 'Unified Dashboard', description: 'Clear insights into membership, finance, events, sermons, and attendance.', icon: '📊' },
      { title: 'Smart Member Management', description: 'Import, segment, and track member growth and participation.', icon: '🗂️' },
      { title: 'Communication Tools', description: 'Announcements, SMS, and suggestion box to keep everyone connected.', icon: '📣' },
    ],
    testimonials: [
      { quote: '“FaithConnect helped us centralize our operations and engage our members more meaningfully.”', author: 'Church Administrator' },
      { quote: '“The dashboard and attendance tracking saved hours every week.”', author: 'Pastoral Team' },
    ],
    links: { features: '#features', testimonials: '#testimonials', getStarted: '#cta' },
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [stats, setStats] = useState<LandingStats | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const tid = localStorage.getItem('fc_tenant_id');
        if (!tid) return;
        const r = await api.get('/church-info');
        const n = String(r?.data?.name || '').trim();
        if (n) setBrand(n);
      } catch {}
    })();
  }, []);
  useEffect(() => {
    if (brand) document.title = brand;
  }, [brand]);
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/landing');
        const data: Partial<LandingConfig> = r?.data || {};
        setCfg(prev => ({
          heroTitle: data.heroTitle || prev.heroTitle,
          heroSubtitle: data.heroSubtitle || prev.heroSubtitle,
          ctaMemberLabel: data.ctaMemberLabel || prev.ctaMemberLabel,
          ctaAdminLabel: data.ctaAdminLabel || prev.ctaAdminLabel,
          features: Array.isArray(data.features) && data.features.length ? data.features as LandingFeature[] : prev.features,
          testimonials: Array.isArray(data.testimonials) && data.testimonials.length ? data.testimonials as LandingTestimonial[] : prev.testimonials,
          heroImagePath: typeof data.heroImagePath === 'string' ? data.heroImagePath : prev.heroImagePath,
          links: (data.links && typeof data.links === 'object') ? {
            features: String((data.links as any).features || prev.links?.features || '#features'),
            testimonials: String((data.links as any).testimonials || prev.links?.testimonials || '#testimonials'),
            getStarted: String((data.links as any).getStarted || prev.links?.getStarted || '#cta'),
          } : prev.links,
        }));
        try {
          const s = await api.get('/stats');
          const v = s?.data as Partial<LandingStats>;
          setStats({
            members: typeof v.members === 'number' ? v.members : 0,
            events: typeof v.events === 'number' ? v.events : 0,
            departments: typeof v.departments === 'number' ? v.departments : 0,
            attendancePercent: typeof v.attendancePercent === 'number' ? v.attendancePercent : 0,
          });
        } catch (e: any) {
          setStats({ members: 0, events: 0, departments: 0, attendancePercent: 0 });
        }
        setLoadError('');
      } catch (e: any) {
        const msg = e?.response?.data?.message || 'Failed to load landing content';
        setLoadError(msg);
        try { console.warn('[Landing] load error:', msg); } catch {}
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  return (
    <div className="min-h-screen bg-gradient-to-b from-faith-blue via-blue-900 to-gray-900 text-white">
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="container py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-8 h-8 rounded-full bg-faith-gold" aria-hidden="true" />
          <h1 className="text-xl font-bold tracking-wide">{brand}</h1>
        </div>
        <nav aria-label="Primary">
          <ul className="hidden sm:flex items-center gap-4 text-sm">
            <li><a href={cfg.links?.features || '#features'} className="hover:underline">Features</a></li>
            <li><a href={cfg.links?.testimonials || '#testimonials'} className="hover:underline">Testimonials</a></li>
            <li><a href={cfg.links?.getStarted || '#cta'} className="hover:underline">Get Started</a></li>
          </ul>
        </nav>
        </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="landing-blob top-10 left-10" />
          <div className="landing-blob bottom-10 right-10" />
        </div>
        <div className="container py-12 sm:py-20 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-5xl font-extrabold leading-tight">{cfg.heroTitle}</h2>
            <p className="text-base sm:text-lg text-gray-100">{cfg.heroSubtitle}</p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2" id="cta">
              <Link to="/login?roleHint=member" aria-label="Member login" className="btn bg-faith-gold text-black hover:bg-yellow-500">{cfg.ctaMemberLabel}</Link>
              <Link to="/login?roleHint=admin" aria-label="Admin login" className="btn btn-primary">{cfg.ctaAdminLabel}</Link>
            </div>
            <p className="text-xs text-blue-200">Consistent with system branding. Secure authentication for members and administrators.</p>
          </div>
          <div className="relative">
            {cfg.heroImagePath ? (
              <img src={`${api.defaults.baseURL}/uploads/${cfg.heroImagePath}`} alt="Church" className="w-full rounded-lg shadow-lg max-h-[380px] object-cover" />
            ) : (
              <div className="landing-hero-card">
                <div className="p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-400" aria-hidden="true" />
                      <span className="w-3 h-3 rounded-full bg-yellow-400" aria-hidden="true" />
                      <span className="w-3 h-3 rounded-full bg-red-400" aria-hidden="true" />
                    </div>
                    <span className="text-blue-100 text-xs">Live Overview</span>
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                    <div className="landing-stat">
                      <div className="text-blue-200">Members</div>
                      <div className="text-2xl font-bold">{stats ? stats.members.toLocaleString() : '—'}</div>
                    </div>
                    <div className="landing-stat">
                      <div className="text-blue-200">Events</div>
                      <div className="text-2xl font-bold">{stats ? stats.events.toLocaleString() : '—'}</div>
                    </div>
                    <div className="landing-stat">
                      <div className="text-blue-200">Departments</div>
                      <div className="text-2xl font-bold">{stats ? stats.departments.toLocaleString() : '—'}</div>
                    </div>
                    <div className="landing-stat">
                      <div className="text-blue-200">Attendance</div>
                      <div className="text-2xl font-bold">{stats ? `${stats.attendancePercent}%` : '—'}</div>
                    </div>
                  </div>
                  <div className="mt-6">
                    <div className="h-24 bg-gradient-to-r from-faith-gold/30 to-faith-purple/30 rounded-md" aria-hidden="true" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <main id="main" className="container space-y-12 py-12" role="main">
        {loading && (
          <div className="card bg-white text-gray-900 border mb-6" role="status">Loading content…</div>
        )}
        {loadError && (
          <div className="card bg-yellow-50 text-yellow-800 border mb-6" role="alert">{loadError}</div>
        )}
        <section id="features" aria-labelledby="features-title" className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <h2 id="features-title" className="sr-only">Key features</h2>
          {cfg.features.slice(0,3).map((f, i) => (
            <article key={i} className="landing-feature">
              <div className="landing-icon" aria-hidden="true">{f.icon || '⭐'}</div>
              <h3 className="text-lg font-semibold text-faith-blue">{f.title}</h3>
              <p className="text-gray-800">{f.description}</p>
            </article>
          ))}
        </section>

        <section id="testimonials" aria-labelledby="testimonials-title" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <h2 id="testimonials-title" className="sr-only">Testimonials</h2>
          {cfg.testimonials.slice(0,2).map((t, i) => (
            <figure key={i} className="landing-quote">
              <blockquote className="text-gray-900">{t.quote}</blockquote>
              <figcaption className="mt-2 text-sm text-faith-blue">{t.author || ''}</figcaption>
            </figure>
          ))}
        </section>

        <section aria-labelledby="accessibility-title" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <h2 id="accessibility-title" className="sr-only">Performance and Accessibility</h2>
          <div className="card bg-white text-gray-900 border border-faith-blue/10">
            <h3 className="text-lg font-semibold">Fast and Accessible</h3>
            <ul className="list-disc pl-6 text-gray-800 text-sm">
              <li>Optimized assets and lazy-loaded visuals for quick startup.</li>
              <li>High contrast, keyboard navigation, and reduced-motion support.</li>
              <li>Works across modern browsers with responsive mobile design.</li>
            </ul>
          </div>
          <div className="card bg-white text-gray-900 border border-faith-blue/10">
            <h3 className="text-lg font-semibold">Get Started</h3>
            <p className="text-gray-800 text-sm">Choose your portal to continue:</p>
            <div className="mt-3 flex flex-col sm:flex-row gap-3">
              <Link to="/login?roleHint=member" className="btn bg-faith-gold text-black hover:bg-yellow-500">{cfg.ctaMemberLabel}</Link>
              <Link to="/login?roleHint=admin" className="btn btn-primary">{cfg.ctaAdminLabel}</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="container py-10 text-blue-200 text-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} {brand}</p>
          <div className="flex items-center gap-3">
            <a href="/login" className="hover:underline">Login</a>
            <a href="/signup" className="hover:underline">Sign Up</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

