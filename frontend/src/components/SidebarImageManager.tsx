import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

type Role = 'ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|'PROVIDER_ADMIN'|null;

const LS_IMG = 'fc_sidebar_img';
const LS_IMG_ALT = 'fc_sidebar_img_alt';
const LS_IMG_DIMS = 'fc_sidebar_img_dims';
const LS_IMG_CROP = 'fc_sidebar_img_crop';

export default function SidebarImageManager({ role }: { role: Role }) {
  const [imgData, setImgData] = useState<string | null>(() => localStorage.getItem(LS_IMG));
  const [alt, setAlt] = useState<string>(() => localStorage.getItem(LS_IMG_ALT) || 'Sidebar image');
  const [width, setWidth] = useState<number>(() => {
    const dims = localStorage.getItem(LS_IMG_DIMS);
    try { return dims ? JSON.parse(dims).width || 40 : 40; } catch { return 40; }
  });
  const [height, setHeight] = useState<number>(() => {
    const dims = localStorage.getItem(LS_IMG_DIMS);
    try { return dims ? JSON.parse(dims).height || 40 : 40; } catch { return 40; }
  });
  const [crop, setCrop] = useState<'cover'|'contain'>(() => (localStorage.getItem(LS_IMG_CROP) as any) || 'cover');
  const [open, setOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fullRights = role && role !== 'MEMBER';

  // Load initial logo from server settings
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/settings/info');
        const url: string = res?.data?.logoUrl || '';
        if (url) setImgData(url);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_IMG_ALT, alt);
  }, [alt]);
  useEffect(() => {
    localStorage.setItem(LS_IMG_DIMS, JSON.stringify({ width, height }));
  }, [width, height]);
  useEffect(() => { localStorage.setItem(LS_IMG_CROP, crop); }, [crop]);

  const onUpload = async (file: File) => {
    setError(null);
    const valid = /\.(jpe?g|png|svg)$/i.test(file.name);
    if (!valid) { setError('Unsupported format. Use JPG, PNG, or SVG.'); return; }
    setLoading(true);
    try {
      const reader = new FileReader();
      const done = await new Promise<string>((resolve, reject) => {
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      localStorage.setItem(LS_IMG, done);
      setImgData(done);
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const onDelete = () => {
    if (!confirm('Delete the sidebar image?')) return;
    localStorage.removeItem(LS_IMG);
    setImgData(null);
  };

  const saveToServer = async () => {
    setMsg(null);
    setError(null);
    try {
      const current = await api.get('/settings/info');
      const payload = { ...(current?.data || {}), logoUrl: imgData || '' };
      await api.put('/settings/info', payload);
      setMsg('Logo saved');
      setTimeout(()=> setMsg(null), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save logo');
    }
  };

  const imgStyle = useMemo(() => ({
    width: `${Math.max(24, Math.min(96, width))}px`,
    height: `${Math.max(24, Math.min(96, height))}px`,
    objectFit: crop,
    borderRadius: '6px',
  }), [width, height, crop]);

  return (
    <div className="flex items-center gap-2">
      {imgData ? (
        <img src={imgData} alt={alt} style={imgStyle} />
      ) : (
        <div role="img" aria-label="No sidebar image"
             className="w-10 h-10 rounded bg-white/20 flex items-center justify-center text-xs">No Img</div>
      )}
      {fullRights && (
        <div className="relative">
          <button aria-label="Manage sidebar image" className="btn px-2 py-1" onClick={()=>setOpen(o=>!o)}>
            {open ? 'Close' : 'Manage'}
          </button>
          {open && (
            <div className="absolute z-10 mt-2 p-3 w-64 bg-white dark:bg-gray-800 border rounded shadow space-y-2">
              {error && <div className="p-2 text-sm bg-red-50 text-red-700 rounded" aria-live="polite">{error}</div>}
              {msg && <div className="p-2 text-sm bg-green-50 text-green-700 rounded" aria-live="polite">{msg}</div>}
              <div className="text-sm font-medium">Upload</div>
              <input type="file" accept=".jpg,.jpeg,.png,.svg" onChange={e=>{ const f=e.target.files?.[0]; if (f) onUpload(f); }} />
              {loading && <div className="text-xs text-gray-600" aria-live="polite">Uploading…</div>}
              <div className="text-sm font-medium">Alt Text</div>
              <input className="fc-input" value={alt} onChange={e=>setAlt(e.target.value)} aria-label="Sidebar image alt text" />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="block"><span>Width</span><input type="number" min={24} max={96} className="fc-input" value={width} onChange={e=>setWidth(Number(e.target.value || 40))} /></label>
                <label className="block"><span>Height</span><input type="number" min={24} max={96} className="fc-input" value={height} onChange={e=>setHeight(Number(e.target.value || 40))} /></label>
              </div>
              <label className="block text-sm"><span>Cropping</span>
                <select className="fc-input" value={crop} onChange={e=>setCrop(e.target.value as any)}>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                </select>
              </label>
              <div className="text-sm font-medium">Logo URL</div>
              <input className="fc-input" placeholder="https://…" value={imgData || ''} onChange={e=>setImgData(e.target.value || null)} />
              <button className="w-full btn bg-faith-blue text-white" onClick={saveToServer} disabled={!imgData}>Save to Server</button>
              {imgData && (
                <button className="w-full btn bg-red-600 hover:bg-red-700 text-white" onClick={onDelete}>Delete Image</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
