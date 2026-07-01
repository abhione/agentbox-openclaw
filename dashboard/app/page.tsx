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

type LLMProvider = 'anthropic' | 'openai' | 'bedrock' | 'ollama';

interface OnboardingData {
  name: string;
  provider: LLMProvider;
  anthropicKey?: string;
  openaiKey?: string;
  bedrockAccessKey?: string;
  bedrockSecretKey?: string;
  bedrockRegion?: string;
  ollamaHost?: string;
  model: string;
  telegramToken?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3456';

const MODEL_OPTIONS: Record<LLMProvider, { value: string; label: string }[]> = {
  anthropic: [
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5' },
  ],
  openai: [
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  bedrock: [
    { value: 'bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0', label: 'Claude Sonnet 4 (Bedrock)' },
    { value: 'bedrock/us.anthropic.claude-opus-4-20250514-v1:0', label: 'Claude Opus 4 (Bedrock)' },
  ],
  ollama: [
    { value: 'ollama/llama3.3', label: 'Llama 3.3' },
    { value: 'ollama/qwen2.5', label: 'Qwen 2.5' },
  ],
};

export default function Dashboard() {
  const [boxes, setBoxes] = useState<AgentBox[]>([]);
  const [selectedBox, setSelectedBox] = useState<AgentBox | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activityEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3456`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'init') setBoxes(msg.boxes);
      else if (msg.type?.startsWith('box:')) fetchBoxes();
      else if (msg.messageType === 'activity' && msg.boxId === selectedBox?.id) {
        setActivities(prev => [...prev.slice(-99), { type: msg.type, data: msg.data, timestamp: msg.timestamp }]);
      }
    };

    return () => ws.close();
  }, [fetchBoxes, selectedBox?.id]);

  useEffect(() => {
    if (selectedBox && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', boxId: selectedBox.id }));
      setActivities([]);
    }
  }, [selectedBox]);

  useEffect(() => {
    fetchBoxes();
    const interval = setInterval(fetchBoxes, 10000);
    return () => clearInterval(interval);
  }, [fetchBoxes]);

  useEffect(() => {
    activityEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activities]);

  const handleAction = async (boxId: string, action: 'start' | 'stop' | 'destroy') => {
    try {
      const method = action === 'destroy' ? 'DELETE' : 'POST';
      const url = action === 'destroy' 
        ? `${API_BASE}/api/boxes/${boxId}`
        : `${API_BASE}/api/boxes/${boxId}/${action}`;
      await fetch(url, { method });
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

      <div className="flex-1 flex">
        {/* Sidebar */}
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
                <button onClick={() => setShowCreateModal(true)} className="mt-2 text-blue-400 hover:underline block mx-auto">
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
                  <div className="flex items-center gap-3">
                    <StatusIndicator state={box.state} />
                    <div>
                      <h3 className="font-medium">{box.name}</h3>
                      <p className="text-sm text-zinc-500">{box.config?.model?.split('/').pop() || 'default'}</p>
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

        {/* Main */}
        <main className="flex-1 flex flex-col">
          {selectedBox ? (
            <>
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{selectedBox.name}</h2>
                  <p className="text-sm text-zinc-500">Container: {selectedBox.containerId?.slice(0, 12)}</p>
                </div>
                <div className="flex gap-2">
                  {selectedBox.state === 'running' && (
                    <>
                      <a
                        href={`http://localhost:${selectedBox.ports?.novnc}/vnc.html?autoconnect=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm"
                      >
                        🖥️ Open VNC
                      </a>
                      <button onClick={() => handleAction(selectedBox.id, 'stop')} className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded text-sm">
                        Stop
                      </button>
                    </>
                  )}
                  {selectedBox.state === 'stopped' && (
                    <button onClick={() => handleAction(selectedBox.id, 'start')} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm">
                      Start
                    </button>
                  )}
                  <button onClick={() => handleAction(selectedBox.id, 'destroy')} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm">
                    Destroy
                  </button>
                </div>
              </div>

              <div className="flex-1 flex">
                <div className="flex-1 p-4">
                  <div className="h-full bg-black rounded-lg overflow-hidden">
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
                          <button onClick={() => handleAction(selectedBox.id, 'start')} className="mt-4 px-4 py-2 bg-green-600 rounded">
                            Start Agent
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-80 border-l border-zinc-800 flex flex-col">
                  <div className="p-3 border-b border-zinc-800">
                    <h3 className="font-medium text-sm text-zinc-400">Activity Feed</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {activities.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-4">No activity yet</p>
                    ) : (
                      activities.map((activity, i) => (
                        <div key={i} className="text-sm p-2 bg-zinc-900 rounded">
                          <div className="flex justify-between text-zinc-500 text-xs mb-1">
                            <span className="font-mono">{activity.type}</span>
                            <span>{new Date(activity.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <pre className="text-zinc-300 whitespace-pre-wrap break-words text-xs">
                            {typeof activity.data === 'string' ? activity.data : JSON.stringify(activity.data, null, 2)}
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

      {showCreateModal && (
        <CreateAgentModal onClose={() => setShowCreateModal(false)} onCreated={() => { setShowCreateModal(false); fetchBoxes(); }} />
      )}
    </div>
  );
}

function StatusIndicator({ state }: { state: AgentBox['state'] }) {
  const colors = { running: 'bg-green-500', stopped: 'bg-zinc-500', paused: 'bg-yellow-500', missing: 'bg-red-500' };
  return <div className={`w-3 h-3 rounded-full ${colors[state]} ${state === 'running' ? 'animate-pulse' : ''}`} title={state} />;
}

function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData>({
    name: '',
    provider: 'anthropic',
    model: 'anthropic/claude-sonnet-4-20250514',
  });

  const updateData = (field: keyof OnboardingData, value: string) => {
    setData(prev => {
      const updated = { ...prev, [field]: value };
      // Update model when provider changes
      if (field === 'provider') {
        updated.model = MODEL_OPTIONS[value as LLMProvider][0].value;
      }
      return updated;
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    // Build OpenClaw config
    const openclawConfig: Record<string, unknown> = {
      gateway: { mode: 'local', port: 18789, bind: '0.0.0.0' },
      models: { default: data.model },
      tools: { exec: { enabled: true }, browser: { enabled: true } },
      channels: {},
    };

    // Add auth based on provider
    if (data.provider === 'anthropic' && data.anthropicKey) {
      openclawConfig.auth = { anthropic: { apiKey: data.anthropicKey } };
    } else if (data.provider === 'openai' && data.openaiKey) {
      openclawConfig.auth = { openai: { apiKey: data.openaiKey } };
    } else if (data.provider === 'bedrock' && data.bedrockAccessKey) {
      openclawConfig.auth = {
        bedrock: {
          accessKeyId: data.bedrockAccessKey,
          secretAccessKey: data.bedrockSecretKey,
          region: data.bedrockRegion || 'us-east-1',
        },
      };
    } else if (data.provider === 'ollama') {
      openclawConfig.auth = { ollama: { host: data.ollamaHost || 'http://host.docker.internal:11434' } };
    }

    if (data.telegramToken) {
      (openclawConfig.channels as Record<string, unknown>).telegram = { botToken: data.telegramToken };
    }

    try {
      const res = await fetch(`${API_BASE}/api/boxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name || `agent-${Date.now().toString(36)}`,
          config: { name: data.name, model: data.model },
          openclawConfig,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-lg border border-zinc-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Deploy New Agent</h2>
          <div className="flex gap-1">
            {[1, 2, 3].map(s => (
              <div key={s} className={`w-2 h-2 rounded-full ${step >= s ? 'bg-blue-500' : 'bg-zinc-700'}`} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm mb-4">Let's set up your agent. First, give it a name and choose your LLM provider.</p>
            
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Agent Name</label>
              <input
                type="text"
                value={data.name}
                onChange={(e) => updateData('name', e.target.value)}
                placeholder="my-agent"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">LLM Provider</label>
              <select
                value={data.provider}
                onChange={(e) => updateData('provider', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
              >
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT)</option>
                <option value="bedrock">AWS Bedrock</option>
                <option value="ollama">Ollama (Local)</option>
              </select>
            </div>

            <div className="flex justify-end pt-4">
              <button onClick={() => setStep(2)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
                Next →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm mb-4">Enter your API credentials for {data.provider}.</p>

            {data.provider === 'anthropic' && (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Anthropic API Key</label>
                <input
                  type="password"
                  value={data.anthropicKey || ''}
                  onChange={(e) => updateData('anthropicKey', e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
                />
                <p className="text-xs text-zinc-500 mt-1">Get your key at console.anthropic.com</p>
              </div>
            )}

            {data.provider === 'openai' && (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">OpenAI API Key</label>
                <input
                  type="password"
                  value={data.openaiKey || ''}
                  onChange={(e) => updateData('openaiKey', e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
                />
              </div>
            )}

            {data.provider === 'bedrock' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">AWS Access Key ID</label>
                  <input
                    type="password"
                    value={data.bedrockAccessKey || ''}
                    onChange={(e) => updateData('bedrockAccessKey', e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">AWS Secret Access Key</label>
                  <input
                    type="password"
                    value={data.bedrockSecretKey || ''}
                    onChange={(e) => updateData('bedrockSecretKey', e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Region</label>
                  <select
                    value={data.bedrockRegion || 'us-east-1'}
                    onChange={(e) => updateData('bedrockRegion', e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
                  >
                    <option value="us-east-1">US East (N. Virginia)</option>
                    <option value="us-west-2">US West (Oregon)</option>
                    <option value="eu-west-1">Europe (Ireland)</option>
                  </select>
                </div>
              </>
            )}

            {data.provider === 'ollama' && (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Ollama Host</label>
                <input
                  type="text"
                  value={data.ollamaHost || ''}
                  onChange={(e) => updateData('ollamaHost', e.target.value)}
                  placeholder="http://host.docker.internal:11434"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
                />
                <p className="text-xs text-zinc-500 mt-1">Use host.docker.internal to reach your local Ollama</p>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(1)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                ← Back
              </button>
              <button onClick={() => setStep(3)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
                Next →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm mb-4">Choose your model and optionally connect a chat channel.</p>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Model</label>
              <select
                value={data.model}
                onChange={(e) => updateData('model', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
              >
                {MODEL_OPTIONS[data.provider].map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Telegram Bot Token (optional)</label>
              <input
                type="password"
                value={data.telegramToken || ''}
                onChange={(e) => updateData('telegramToken', e.target.value)}
                placeholder="123456:ABC-..."
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
              />
              <p className="text-xs text-zinc-500 mt-1">Connect a Telegram bot to chat with your agent</p>
            </div>

            {error && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(2)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg"
              >
                {loading ? 'Deploying...' : '🚀 Deploy Agent'}
              </button>
            </div>
          </div>
        )}

        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
          ✕
        </button>
      </div>
    </div>
  );
}
