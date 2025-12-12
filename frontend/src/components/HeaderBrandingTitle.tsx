import React, { useEffect, useRef, useState } from 'react';
import api from '../api/client';

export default function HeaderBrandingTitle() {
  const [title, setTitle] = useState<string>('FaithConnect');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/settings/info');
        const name = res?.data?.name || 'FaithConnect';
        setTitle(String(name));
      } catch {}
    })();
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span className="text-lg font-semibold">{title}</span>
    </div>
  );
}
