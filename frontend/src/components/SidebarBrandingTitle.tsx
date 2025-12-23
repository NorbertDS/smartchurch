import React, { useEffect, useRef, useState } from 'react';
import api from '../api/client';

export default function SidebarBrandingTitle() {
  const [title, setTitle] = useState<string>('FaithConnect');

  useEffect(() => {
    (async () => {
      try {
        const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as string | null;
        if (role === 'PROVIDER_ADMIN') {
          setTitle('FaithConnect');
          return;
        }
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
