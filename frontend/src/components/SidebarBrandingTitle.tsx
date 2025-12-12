import React, { useEffect, useRef, useState } from 'react';
import api from '../api/client';

export default function SidebarBrandingTitle() {
  const [title, setTitle] = useState<string>('FaithConnect');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/settings/info');
        const name = res?.data?.sidebarName || res?.data?.name || 'FaithConnect';
        setTitle(String(name));
      } catch {}
    })();
  }, []);

  return (
    <div className="flex items-center gap-2">
      <h1 className="text-2xl font-bold">{title}</h1>
    </div>
  );
}
