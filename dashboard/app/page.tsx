'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface BoxInstance {
  id: string;
  name: string;
  type: 'openclaw' | 'hermes';
  state: string;
  containerId: string;
  ports: {
    gateway: number;
    browserControl: number;
    vnc: number;
    novnc: number;
  };
  createdAt: string;
  config: Record<string, unknown>;
}

interface Activity {
  timestamp: string;
  type: string;
  data: unknown;
}

interface ActivityEvent {
  box: BoxInstance;
  activity: Activity;
}

const STATE_COLORS: Record<string, string> = {
  creating: 'bg-blue-500',
  starting: 'bg-yellow-500',
  running: 'bg-green-500',
  idle: 'bg-green-400',
  waiting_input: 'bg-orange-500',
  error: 'bg-red-500',
  stopping: 'bg-yellow-600',
  stopped: 'bg-gray-500',
};

export default function Dashboard() {
  const [boxes, setBoxes] = useState<BoxInstance[]>([]);
  const [activities, setActivities] = useState<Map<string, Activity[]>>(new Map());
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const vncFrameRef = useRef<HTMLIFrameElement | null>(null);

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`ws://${window.location.host}/ws`);
      
      ws.onopen = () => {
        console.log('Dashboard connected');
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
          case 'init':
            setBoxes(msg.payload.boxes);
            break;
          case 'box:creating':
          case 'box:starting':
          case 'box:running':
          case 'box:stopping':
          case 'box:stopped':
          case 'box:state':
            setBoxes(prev => {
              const idx = prev.findIndex(b => b.id === msg.payload.id);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = msg.payload;
                return updated;
              }
              return [...prev, msg.payload];
            });
            break;
          case 'box:destroyed':
            setBoxes(prev => prev.filter(b => b.id !== msg.payload.id));
            break;
          case 'activity':
            const { box, activity } = msg.payload as ActivityEvent;
            setActivities(prev => {
              const newMap = new Map(prev);
              const boxActivities = newMap.get(box.id) || [];
              newMap.set(box.id, [...boxActivities.slice(-99), activity]);
              return newMap;
            });
            break;
        }
      };

      ws.onclose = () => {
        console.log('Dashboard disconnected, reconnecting...');
        setTimeout(connect, 2000);
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  const createBox = useCallback(async (config: Record<string, unknown>) => {
    const response = await fetch('/api/boxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (response.ok) {
      setShowCreateModal(false);
    }
  }, []);

  const stopBox = useCallback(async (id: string) => {
    await fetch(`/api/boxes/${id}/stop`, { method: 'POST' });
  }, []);

  const destroyBox = useCallback(async (id: string) => {
    if (confirm('Are you sure you want to destroy this agent?')) {
      await fetch(`/api/boxes/${id}`, { method: 'DELETE' });
    }
  }, []);

  const selectedBoxData = boxes.find(b => b.id === selectedBox);
  const selectedActivities = selectedBox ? activities.get(selectedBox) || [] : [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🔭</div>
            <div>
              <h1 className="text-xl font-semibold">Agent Observatory</h1>
              <p className="text-sm text-gray-400">Live visibility into your AI agents</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition"
          >
            + Deploy Agent
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar - Agent List */}
        <aside className="w-80 border-r border-gray-800 overflow-y-auto">
          <div className="p-4 space-y-2">
            {boxes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No agents running</p>
                <p className="text-sm mt-1">Deploy your first agent to get started</p>
              </div>
            ) : (
              boxes.map(box => (
                <button
                  key={box.id}
                  onClick={() => setSelectedBox(box.id)}
                  className={`w-full text-left p-4 rounded-lg transition ${
                    selectedBox === box.id 
                      ? 'bg-gray-800 ring-1 ring-blue-500' 
                      : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{box.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${STATE_COLORS[box.state]} text-white`}>
                      {box.state}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">
                    <div>Type: {box.type}</div>
                    <div>Gateway: :{box.ports.gateway}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {selectedBoxData ? (
            <>
              {/* Agent Header */}
              <div className="border-b border-gray-800 p-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{selectedBoxData.name}</h2>
                  <p className="text-sm text-gray-400">
                    {selectedBoxData.type} · {selectedBoxData.id.slice(0, 16)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`http://localhost:${selectedBoxData.ports.novnc}/vnc.html?autoconnect=true`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-sm"
                  >
                    🖥️ Open Screen
                  </a>
                  <button
                    onClick={() => stopBox(selectedBoxData.id)}
                    disabled={selectedBoxData.state === 'stopped'}
                    className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 rounded text-sm"
                  >
                    ⏹️ Stop
                  </button>
                  <button
                    onClick={() => destroyBox(selectedBoxData.id)}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-sm"
                  >
                    🗑️ Destroy
                  </button>
                </div>
              </div>

              {/* Split View - VNC + Activity */}
              <div className="flex-1 flex">
                {/* VNC Viewer */}
                <div className="flex-1 bg-black">
                  <iframe
                    ref={vncFrameRef}
                    src={`http://localhost:${selectedBoxData.ports.novnc}/vnc.html?autoconnect=true&resize=scale`}
                    className="w-full h-full border-0"
                    title="Agent Screen"
                  />
                </div>

                {/* Activity Feed */}
                <div className="w-96 border-l border-gray-800 flex flex-col">
                  <div className="p-3 border-b border-gray-800 font-medium">
                    Activity Feed
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
                    {selectedActivities.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">
                        Waiting for activity...
                      </p>
                    ) : (
                      selectedActivities.slice().reverse().map((act, i) => (
                        <div key={i} className="p-2 rounded bg-gray-900">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full ${
                              act.type === 'error' ? 'bg-red-500' :
                              act.type === 'tool_call' ? 'bg-blue-500' :
                              act.type === 'message' ? 'bg-green-500' :
                              'bg-gray-500'
                            }`} />
                            <span className="text-gray-400 text-xs">
                              {new Date(act.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="text-xs font-medium">{act.type}</span>
                          </div>
                          <pre className="text-xs text-gray-300 overflow-x-auto">
                            {JSON.stringify(act.data, null, 2).slice(0, 200)}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-6xl mb-4">🔭</p>
                <p>Select an agent to view its activity</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createBox}
        />
      )}
    </div>
  );
}

function CreateAgentModal({ 
  onClose, 
  onCreate 
}: { 
  onClose: () => void; 
  onCreate: (config: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'openclaw' | 'hermes'>('openclaw');
  const [model, setModel] = useState('anthropic/claude-sonnet-4');
  const [telegramToken, setTelegramToken] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name: name || `agent-${Date.now()}`,
      type,
      model,
      channels: telegramToken ? { telegram: { token: telegramToken } } : undefined,
      credentials: anthropicKey ? { anthropic_key: anthropicKey } : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Deploy New Agent</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'openclaw' | 'hermes')}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="openclaw">OpenClaw</option>
              <option value="hermes">Hermes</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="anthropic/claude-sonnet-4">Claude Sonnet 4</option>
              <option value="anthropic/claude-opus-4-5">Claude Opus 4.5</option>
              <option value="openai/gpt-4o">GPT-4o</option>
              <option value="bedrock/claude-sonnet">Bedrock Claude Sonnet</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Anthropic API Key</label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Telegram Bot Token (optional)</label>
            <input
              type="password"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder="123456:ABC-DEF..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium"
            >
              Deploy Agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
