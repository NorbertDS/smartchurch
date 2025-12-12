import { useState } from 'react';
import api from '../api/client';
import { Scanner } from '@yudiel/react-qr-scanner';

export default function CommunionScan() {
  const [scannedCount, setScannedCount] = useState<number>(0);
  const [lastStatus, setLastStatus] = useState<string>('');
  const [error, setError] = useState<string>('');

  const onDecode = async (text: string) => {
    try {
      setError('');
      const { data } = await api.post('/attendance/communion/scan', { token: text });
      setLastStatus(data.status || 'marked');
      setScannedCount(c => c + 1);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to mark attendance');
    }
  };

  return (
    <div className="container max-w-2xl">
      <h2 className="text-2xl font-bold mb-4">Communion QR Scan</h2>
      <div className="card">
        <div className="text-sm text-gray-700 mb-2">Aim the camera at member QR codes to mark attendance.</div>
        <div className="w-full h-72 border rounded overflow-hidden">
        <Scanner
          onScan={(res: any) => {
            try {
              const code = Array.isArray(res) ? res[0]?.rawValue : res?.rawValue;
              if (code) onDecode(String(code));
            } catch (e) { setError(String(e)); }
          }}
          onError={(err: unknown) => setError(String(err))}
          constraints={{ facingMode: 'environment' }}
        />
        </div>
        <div className="mt-3 text-sm">
          <div>Scanned: <span className="font-semibold">{scannedCount}</span></div>
          {lastStatus && <div className="text-green-700">Last: {lastStatus}</div>}
          {error && <div className="text-red-700">Error: {error}</div>}
        </div>
      </div>
    </div>
  );
}
