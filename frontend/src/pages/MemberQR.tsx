import { useEffect, useState } from 'react';
import api from '../api/client';
import QRCode from 'qrcode';

interface Member { id: number; firstName: string; lastName: string; membershipNumber?: string | null; membershipStatus?: string | null }

export default function MemberQR() {
  const [me, setMe] = useState<Member | null>(null);
  const [token, setToken] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const prof = await api.get('/members/me');
        const m = prof.data as Member;
        setMe(m);
        if (m?.id) {
          const { data } = await api.get(`/members/${m.id}/qr-token`);
          setToken(data.token);
        }
      } catch (e: any) {
        setError(e?.response?.data?.message || e.message || 'Failed to load member');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const url = await QRCode.toDataURL(token, { width: 320, margin: 2 });
        setQrDataUrl(url);
      } catch (e: any) {
        setError('Failed to generate QR');
      }
    })();
  }, [token]);

  return (
    <div className="container max-w-xl">
      <h2 className="text-2xl font-bold mb-4">My QR Code</h2>
      {error && <div className="p-2 border border-red-300 bg-red-50 text-red-700 rounded mb-3">{error}</div>}
      {!me ? (
        <div className="text-sm text-gray-600">No linked member profile.</div>
      ) : (
        <div className="card">
          <div className="text-sm mb-2">Scan this at Holy Communion to be marked present.</div>
          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img src={qrDataUrl} alt="Member QR" className="border rounded" />
              <div className="text-sm text-gray-600">Membership: {me.membershipNumber || 'N/A'} · Status: {me.membershipStatus || 'Unknown'}</div>
            </div>
          ) : (
            <div className="text-sm">Generating QR...</div>
          )}
        </div>
      )}
    </div>
  );
}

