import { useState } from 'react';
import api from '../api/client';

export default function SMS() {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remaining = Math.max(0, 160 - message.length);

  async function sendBulk() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const resp = await api.post('/sms/send', { message: message.trim(), audience: 'ALL' });
      setResult({ sent: resp.data.sent, failed: resp.data.failed });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to send SMS');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Bulk SMS</h1>
      <p className="text-sm text-gray-600 mb-4">
        Send a short message to all approved members. Keep messages concise.
      </p>
      <label className="block text-sm font-medium mb-1">Message</label>
      <textarea
        className="w-full p-3 border rounded mb-2 dark:bg-gray-800 dark:text-gray-100"
        rows={4}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Enter your SMS message"
      />
      <div className="flex items-center justify-between text-sm mb-4">
        <span className={remaining < 0 ? 'text-red-600' : 'text-gray-600'}>
          {remaining} characters remaining (typical SMS up to 160)
        </span>
        <button
          className="px-4 py-2 bg-faith-blue text-white rounded hover:bg-blue-700 disabled:opacity-50"
          disabled={sending || !message.trim()}
          onClick={sendBulk}
        >
          {sending ? 'Sending…' : 'Send to All Members'}
        </button>
      </div>
      {error && (
        <div className="p-3 bg-red-100 text-red-800 rounded mb-3">{error}</div>
      )}
      {result && (
        <div className="p-3 bg-green-100 text-green-800 rounded">
          Sent: {result.sent} • Failed: {result.failed}
        </div>
      )}
      <div className="mt-6 text-xs text-gray-500">
        Tip: Configure SMS provider via backend environment variables. Default provider logs to server console.
      </div>
    </div>
  );
}

