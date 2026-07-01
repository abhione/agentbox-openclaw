'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface AgentBox {
  id: string;
  name: string;
  state: 'running' | 'stopped' | 'paused' | 'missing';
  containerId?: string;
  createdAt: string;
  ports?: {
    gateway: number;
    vnc: number;
    novnc: number;
    browserControl: number;
  };
  config?: {
    name: string;
    model?: string;
  };
}

interface Activity {
  type: string;
  data: unknown;
  timestamp: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3456';

export default function Dashboard() {
  const [boxes, setBoxes] = useState<AgentBox[]>([]);
  const [selectedBox, setSelectedBox] = useState<AgentBox | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);

  // Fetch boxes
  const fetchBoxes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/boxes`);
      if (!res.ok) throw new Error('Failed to fetch boxes');
      const data = await res.json();
      setBoxes(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3456`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'init') {
        setBoxes(msg.boxes);
      } else if (msg.type === 'box:created' || msg.type === 'box:started' || msg.type === 'box:stopped') {
        fetchBoxes();
      } else if (msg.type === 'box:destroyed') {
        setBoxes(prev => prev.filter(b => b.id !== msg.boxId));
        if (selectedBox?.id === msg.boxId) {
          setSelectedBox(null);
        }
      } else if (msg.messageType === 'activity' && msg.boxId === selectedBox?.id) {
        setActivities(prev => [...prev.slice(-99), { type: msg.type, data: msg.data, timestamp: msg.timestamp }]);
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection failed');
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    return () => {
      ws.close();
    };
  }, [fetchBoxes, selectedBox?.id]);

  // Subscribe to selected box activity
  useEffect(() => {
    if (selectedBox && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', boxId: selectedBox.id }));
      setActivities([]);
    }
  }, [selectedBox]);

  // Initial fetch
  useEffect(() => {
    fetchBoxes();
    const interval = setInterval(fetchBoxes, 10000);
    return () => clearInterval(interval);
  }, [fetchBoxes]);

  // Auto-scroll activity feed
  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activities]);

  const handleAction = async (boxId: string, action: 'start' | 'stop' | 'destroy') => {
    try {
      const method = action === 'destroy' ? 'DELETE' : 'POST';
      const url = action === 'destroy' 
        ? `${API_BASE}/api/boxes/${boxId}`
        : `${API_BASE}/api/boxes/${boxId}/${action}`;
      
      const res = await fetch(url, { method });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      
      fetchBoxes();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-xl">🔭</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold">Agent Observatory</h1>
              <p className="text-sm text-zinc-500">Zoom for AI Agents</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            + Deploy Agent
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Sidebar - Agent List */}
        <aside className="w-80 border-r border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-medium text-zinc-400">Agents ({boxes.length})</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-zinc-500">Loading...</div>
            ) : error ? (
              <div className="p-4 text-center text-red-400">{error}</div>
            ) : boxes.length === 0 ? (
              <div className="p-4 text-center text-zinc-500">
                No agents deployed yet.
                <br />
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="mt-2 text-blue-400 hover:underline"
                >
                  Deploy your first agent
                </button>
              </div>
            ) : (
              boxes.map((box) => (
                <div
                  key={box.id}
                  onClick={() => setSelectedBox(box)}
                  className={`p-4 border-b border-zinc-800 cursor-pointer hover:bg-zinc-900 transition-colors ${
                    selectedBox?.id === box.id ? 'bg-zinc-900 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StatusIndicator state={box.state} />
                      <div>
                        <h3 className="font-medium">{box.name}</h3>
                        <p className="text-sm text-zinc-500">
                          {box.config?.model?.split('/').pop() || 'default'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2 text-xs text-zinc-500">
                    <span>:{box.ports?.gateway}</span>
                    <span>•</span>
                    <span>VNC :{box.ports?.novnc}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Main panel */}
        <main className="flex-1 flex flex-col">
          {selectedBox ? (
            <>
              {/* Agent header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{selectedBox.name}</h2>
                  <p className="text-sm text-zinc-500">
                    Container: {selectedBox.containerId?.slice(0, 12) || 'N/A'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {selectedBox.state === 'running' ? (
                    <>
                      <a
                        href={`http://localhost:${selectedBox.ports?.novnc}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm transition-colors"
                      >
                        🖥️ Open VNC
                      </a>
                      <button
                        onClick={() => handleAction(selectedBox.id, 'stop')}
                        className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded text-sm transition-colors"
                      >
                        Stop
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleAction(selectedBox.id, 'start')}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
                    >
                      Start
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(selectedBox.id, 'destroy')}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors"
                  >
                    Destroy
                  </button>
                </div>
              </div>

              {/* Split view: VNC + Activity */}
              <div className="flex-1 flex">
                {/* VNC Panel */}
                <div className="flex-1 p-4">
                  <div className="h-full vnc-frame">
                    {selectedBox.state === 'running' ? (
                      <iframe
                        src={`http://localhost:${selectedBox.ports?.novnc}/vnc.html?autoconnect=true&resize=scale`}
                        className="w-full h-full border-0"
                        title={`VNC: ${selectedBox.name}`}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-zinc-500">
                        <div className="text-center">
                          <div className="text-4xl mb-2">📴</div>
                          <p>Agent is {selectedBox.state}</p>
                          <button
                            onClick={() => handleAction(selectedBox.id, 'start')}
                            className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors"
                          >
                            Start Agent
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Activity Feed */}
                <div className="w-80 border-l border-zinc-800 flex flex-col">
                  <div className="p-3 border-b border-zinc-800">
                    <h3 className="font-medium text-sm text-zinc-400">Activity Feed</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {activities.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-4">
                        No activity yet
                      </p>
                    ) : (
                      activities.map((activity, i) => (
                        <div key={i} className="activity-item text-sm p-2 bg-zinc-900 rounded">
                          <div className="flex items-center justify-between text-zinc-500 text-xs mb-1">
                            <span className="font-mono">{activity.type}</span>
                            <span>{new Date(activity.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <pre className="text-zinc-300 whitespace-pre-wrap break-words text-xs">
                            {typeof activity.data === 'string' 
                              ? activity.data 
                              : JSON.stringify(activity.data, null, 2)}
                          </pre>
                        </div>
                      ))
                    )}
                    <div ref={activityEndRef} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-500">
              <div className="text-center">
                <div className="text-6xl mb-4">🔭</div>
                <h2 className="text-xl font-medium mb-2">Select an agent</h2>
                <p>Choose an agent from the sidebar to view its screen</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchBoxes();
          }}
        />
      )}
    </div>
  );
}

function StatusIndicator({ state }: { state: AgentBox['state'] }) {
  const colors = {
    running: 'bg-green-500 status-running',
    stopped: 'bg-zinc-500',
    paused: 'bg-yellow-500',
    missing: 'bg-red-500',
  };

  return (
    <div className={`w-3 h-3 rounded-full ${colors[state]}`} title={state} />
  );
}

function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('anthropic/claude-sonnet-4-20250514');
  const [telegramToken, setTelegramToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/boxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || `agent-${Date.now().toString(36)}`,
          config: {
            name,
            model,
            channels: telegramToken ? { telegram: { botToken: telegramToken } } : undefined,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create agent');
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-md border border-zinc-800">
        <h2 className="text-xl font-semibold mb-4">Deploy New Agent</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Agent Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="anthropic/claude-sonnet-4-20250514">Claude Sonnet 4</option>
              <option value="anthropic/claude-opus-4-5">Claude Opus 4.5</option>
              <option value="bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0">Bedrock Sonnet 4</option>
              <option value="openai/gpt-4o">GPT-4o</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Telegram Bot Token (optional)
            </label>
            <input
              type="password"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder="123456:ABC-..."
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {loading ? 'Deploying...' : 'Deploy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
