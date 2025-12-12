import React, { useEffect, useRef, useState } from 'react';
import api from '../api/client';

interface Props {
  storageKey: string; // e.g., 'attendance'
  defaultValue: string;
  className?: string;
}

export default function TitleEditable({ storageKey, defaultValue, className }: Props) {
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);
  const [title, setTitle] = useState<string>(defaultValue);
  const [editing, setEditing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [history, setHistory] = useState<Array<{ id: number; userId: number; createdAt: string; prev: any; next: any }>>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { (async () => {
    try {
      const res = await api.get(`/settings/titles/${encodeURIComponent(storageKey)}`);
      const val = res?.data?.value || defaultValue;
      setTitle(String(val));
    } catch {
      setTitle(defaultValue);
    }
  })(); }, [storageKey, defaultValue]);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  // Disable inline editing UI globally: edits should be done in Settings
  const canEdit = false;
  const beginEdit = () => { if (canEdit) setEditing(true); };
  const cancelEdit = () => { setEditing(false); setError(null); };
  const save = async () => {
    const next = title.trim();
    setMsg(null);
    if (!next) { setError('Title cannot be empty'); return; }
    if (next.length > 50) { setError('Max 50 characters'); return; }
    if (!confirm(`Save title as "${next}"?`)) return;
    setSaving(true); setError(null);
    try {
      await api.put(`/settings/titles/${encodeURIComponent(storageKey)}`, { value: next });
      setEditing(false);
      setMsg('Title saved');
      setTimeout(()=> setMsg(null), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  };

  const toggleHistory = async () => {
    if (!historyOpen) {
      try {
        const res = await api.get(`/settings/titles/${encodeURIComponent(storageKey)}/history`);
        setHistory(res?.data?.history || []);
      } catch {}
    }
    setHistoryOpen(o=>!o);
  };

  return (
    <div className="flex items-center gap-2">
      <span className={className || 'text-2xl font-semibold'}>{title}</span>
  </div>
  );
}

function tryParse(v: any): string {
  try { const s = typeof v === 'string' ? v : String(v); return JSON.parse(s); } catch { return String(v || ''); }
}
