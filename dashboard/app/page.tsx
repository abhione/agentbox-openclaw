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
    persona?: string;
  };
}

interface Activity {
  type: string;
  data: unknown;
  timestamp: string;
}

type LLMProvider = 'anthropic' | 'openai' | 'bedrock' | 'ollama';

interface AgentPersona {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  defaultModel: string;
  personality: { tone: string; style: string; traits: string[] };
  capabilities: string[];
  suggestedNames: string[];
}

const PERSONAS: AgentPersona[] = [
  {
    id: 'executive-assistant',
    name: 'Executive Assistant',
    emoji: '👔',
    tagline: 'Your tireless chief of staff',
    description: 'Manages calendars, drafts communications, researches topics, and handles administrative tasks.',
    defaultModel: 'anthropic/claude-sonnet-4-20250514',
    personality: { tone: 'Professional, warm, efficient', style: 'Concise but thorough', traits: ['Organized', 'Proactive', 'Discreet'] },
    capabilities: ['Calendar management', 'Email drafting', 'Research', 'Travel planning'],
    suggestedNames: ['Alexandra', 'Marcus', 'Victoria', 'James']
  },
  {
    id: 'sales-dev-rep',
    name: 'Sales Development Rep',
    emoji: '🎯',
    tagline: 'Outbound machine that books meetings',
    description: 'Researches prospects, crafts personalized outreach, and books qualified meetings.',
    defaultModel: 'anthropic/claude-sonnet-4-20250514',
    personality: { tone: 'Confident, friendly', style: 'Conversational, value-focused', traits: ['Persistent', 'Empathetic', 'Results-oriented'] },
    capabilities: ['Prospect research', 'Personalized outreach', 'Objection handling', 'Meeting scheduling'],
    suggestedNames: ['Jordan', 'Taylor', 'Morgan', 'Casey']
  },
  {
    id: 'customer-success',
    name: 'Customer Success Manager',
    emoji: '🤝',
    tagline: 'Keeps customers happy and growing',
    description: 'Onboards customers, monitors health, identifies expansion, and prevents churn.',
    defaultModel: 'anthropic/claude-sonnet-4-20250514',
    personality: { tone: 'Warm, supportive', style: 'Patient and thorough', traits: ['Empathetic', 'Strategic', 'Celebratory'] },
    capabilities: ['Customer onboarding', 'Health monitoring', 'QBR preparation', 'Churn prevention'],
    suggestedNames: ['Olivia', 'Ethan', 'Sophia', 'Noah']
  },
  {
    id: 'content-creator',
    name: 'Content Creator',
    emoji: '✍️',
    tagline: 'Writes content that converts',
    description: 'Creates blog posts, social content, email campaigns, and marketing copy.',
    defaultModel: 'anthropic/claude-sonnet-4-20250514',
    personality: { tone: 'Engaging, authentic', style: 'Clear and compelling', traits: ['Creative', 'Strategic', 'Versatile'] },
    capabilities: ['Blog writing', 'Social media', 'Email campaigns', 'Ad copy'],
    suggestedNames: ['Quinn', 'Avery', 'Riley', 'Blake']
  },
  {
    id: 'research-analyst',
    name: 'Research Analyst',
    emoji: '🔬',
    tagline: 'Deep dives that drive decisions',
    description: 'Conducts market research, competitive analysis, and data synthesis.',
    defaultModel: 'anthropic/claude-opus-4-5',
    personality: { tone: 'Analytical, thorough', style: 'Structured with clear takeaways', traits: ['Curious', 'Rigorous', 'Objective'] },
    capabilities: ['Market research', 'Competitive analysis', 'Trend identification', 'Report writing'],
    suggestedNames: ['Morgan', 'Parker', 'Reese', 'Sage']
  },
  {
    id: 'technical-writer',
    name: 'Technical Writer',
    emoji: '📚',
    tagline: 'Documentation developers love',
    description: 'Creates API docs, user guides, tutorials, and technical content.',
    defaultModel: 'anthropic/claude-sonnet-4-20250514',
    personality: { tone: 'Clear, precise', style: 'Structured, example-rich', traits: ['Precise', 'Empathetic', 'Systematic'] },
    capabilities: ['API documentation', 'User guides', 'Tutorials', 'Code examples'],
    suggestedNames: ['Alex', 'Sam', 'Jamie', 'Drew']
  },
  {
    id: 'recruiter',
    name: 'Recruiter',
    emoji: '🔍',
    tagline: 'Finds and attracts top talent',
    description: 'Sources candidates, crafts outreach, screens applicants, coordinates hiring.',
    defaultModel: 'anthropic/claude-sonnet-4-20250514',
    personality: { tone: 'Enthusiastic, genuine', style: 'Personal, never spammy', traits: ['Persistent', 'Perceptive', 'Organized'] },
    capabilities: ['Candidate sourcing', 'Outreach campaigns', 'Resume screening', 'Interview coordination'],
    suggestedNames: ['Meg', 'Spencer', 'Robin', 'Cameron']
  },
  {
    id: 'ops-automator',
    name: 'Operations Automator',
    emoji: '⚙️',
    tagline: 'Automates the boring stuff',
    description: 'Identifies repetitive tasks, builds automations, optimizes workflows.',
    defaultModel: 'anthropic/claude-sonnet-4-20250514',
    personality: { tone: 'Practical, efficient', style: 'Direct, documents everything', traits: ['Systematic', 'Reliable', 'Efficiency-obsessed'] },
    capabilities: ['Workflow automation', 'Integration management', 'Process documentation', 'Report generation'],
    suggestedNames: ['Dana', 'Ellis', 'Phoenix', 'Rowan']
  }
];

interface OnboardingData {
  // Step 1: Persona
  personaId: string;
  // Step 2: Identity
  agentName: string;
  // Step 3: LLM Provider & Credentials
  provider: LLMProvider;
  anthropicKey?: string;
  openaiKey?: string;
  bedrockAccessKey?: string;
  bedrockSecretKey?: string;
  bedrockRegion?: string;
  ollamaHost?: string;
  model: string;
  // Step 4: Channels
  telegramToken?: string;
  telegramUserIds?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3457';

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
    const ws = new WebSocket(`ws://localhost:3457`);
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
                      <p className="text-sm text-zinc-500">{box.config?.persona || 'Custom'}</p>
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
    personaId: '',
    agentName: '',
    provider: 'anthropic',
    model: 'anthropic/claude-sonnet-4-20250514',
  });

  const selectedPersona = PERSONAS.find(p => p.id === data.personaId);

  const updateData = (field: keyof OnboardingData, value: string) => {
    setData(prev => {
      const updated = { ...prev, [field]: value };
      // Update model when provider changes
      if (field === 'provider') {
        const models: Record<LLMProvider, string> = {
          anthropic: 'anthropic/claude-sonnet-4-5',
          openai: 'openai/gpt-4o',
          bedrock: 'bedrock/anthropic.claude-sonnet-4-5-v1',
          ollama: 'ollama/llama3.3'
        };
        updated.model = models[value as LLMProvider];
      }
      return updated;
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/boxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          config: { 
            name: data.agentName, 
            model: data.model,
            persona: selectedPersona?.name 
          },
          persona: data.personaId,
          credentials: {
            provider: data.provider,
            anthropicKey: data.anthropicKey,
            openaiKey: data.openaiKey,
            bedrockAccessKey: data.bedrockAccessKey,
            bedrockSecretKey: data.bedrockSecretKey,
            bedrockRegion: data.bedrockRegion || 'us-east-1',
            ollamaHost: data.ollamaHost,
          },
          model: data.model,
          telegramToken: data.telegramToken,
          telegramAllowedUsers: data.telegramUserIds?.split(',').map(id => id.trim()).filter(Boolean),
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl w-full max-w-2xl border border-zinc-800 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Deploy New Agent</h2>
            <p className="text-sm text-zinc-500">Step {step} of 4</p>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className={`w-2 h-2 rounded-full ${step >= s ? 'bg-blue-500' : 'bg-zinc-700'}`} />
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Step 1: Choose Persona */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-zinc-400">What kind of agent do you need?</p>
              
              <div className="grid grid-cols-2 gap-3">
                {PERSONAS.map(persona => (
                  <button
                    key={persona.id}
                    onClick={() => {
                      updateData('personaId', persona.id);
                      updateData('model', persona.defaultModel);
                      // Suggest a name
                      const suggestedName = persona.suggestedNames[Math.floor(Math.random() * persona.suggestedNames.length)];
                      updateData('agentName', suggestedName);
                    }}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      data.personaId === persona.id 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{persona.emoji}</span>
                      <div>
                        <h3 className="font-medium">{persona.name}</h3>
                        <p className="text-xs text-zinc-500">{persona.tagline}</p>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400 line-clamp-2">{persona.description}</p>
                  </button>
                ))}
              </div>

              <div className="flex justify-end pt-4">
                <button 
                  onClick={() => setStep(2)} 
                  disabled={!data.personaId}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Agent Identity */}
          {step === 2 && selectedPersona && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-zinc-800 rounded-lg">
                <span className="text-4xl">{selectedPersona.emoji}</span>
                <div>
                  <h3 className="font-medium">{selectedPersona.name}</h3>
                  <p className="text-sm text-zinc-400">{selectedPersona.tagline}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Agent Name</label>
                <input
                  type="text"
                  value={data.agentName}
                  onChange={(e) => updateData('agentName', e.target.value)}
                  placeholder="Give your agent a name"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 text-lg"
                />
                <div className="flex gap-2 mt-2">
                  {selectedPersona.suggestedNames.map(name => (
                    <button
                      key={name}
                      onClick={() => updateData('agentName', name)}
                      className="px-3 py-1 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-full"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Personality</label>
                <div className="p-4 bg-zinc-800 rounded-lg space-y-2">
                  <p><span className="text-zinc-500">Tone:</span> {selectedPersona.personality.tone}</p>
                  <p><span className="text-zinc-500">Style:</span> {selectedPersona.personality.style}</p>
                  <div className="flex gap-2 flex-wrap mt-2">
                    {selectedPersona.personality.traits.map(trait => (
                      <span key={trait} className="px-2 py-1 text-xs bg-zinc-700 rounded-full">{trait}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Capabilities</label>
                <div className="flex gap-2 flex-wrap">
                  {selectedPersona.capabilities.map(cap => (
                    <span key={cap} className="px-3 py-1 text-sm bg-green-900/30 text-green-400 rounded-full">✓ {cap}</span>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button onClick={() => setStep(1)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                  ← Back
                </button>
                <button 
                  onClick={() => setStep(3)} 
                  disabled={!data.agentName}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: LLM Credentials */}
          {step === 3 && (
            <div className="space-y-6">
              <p className="text-zinc-400">Configure the AI model that powers {data.agentName}.</p>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">LLM Provider</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'anthropic', name: 'Anthropic', desc: 'Claude models', icon: '🧠' },
                    { id: 'openai', name: 'OpenAI', desc: 'GPT models', icon: '💚' },
                    { id: 'bedrock', name: 'AWS Bedrock', desc: 'Enterprise AWS', icon: '☁️' },
                    { id: 'ollama', name: 'Ollama', desc: 'Local models', icon: '🦙' },
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => updateData('provider', p.id)}
                      className={`p-3 rounded-lg border text-left ${
                        data.provider === p.id ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <span className="text-xl mr-2">{p.icon}</span>
                      <span className="font-medium">{p.name}</span>
                      <p className="text-xs text-zinc-500 mt-1">{p.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

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
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Model</label>
                <select
                  value={data.model}
                  onChange={(e) => updateData('model', e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
                >
                  {data.provider === 'anthropic' && (
                    <>
                      <option value="anthropic/claude-sonnet-4-5">Claude Sonnet 4.5 (Recommended)</option>
                      <option value="anthropic/claude-opus-4-5">Claude Opus 4.5 (Powerful)</option>
                    </>
                  )}
                  {data.provider === 'openai' && (
                    <>
                      <option value="openai/gpt-4o">GPT-4o</option>
                      <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                    </>
                  )}
                  {data.provider === 'bedrock' && (
                    <>
                      <option value="bedrock/anthropic.claude-sonnet-4-5-v1">Claude Sonnet 4.5</option>
                      <option value="bedrock/anthropic.claude-opus-4-5-v1">Claude Opus 4.5</option>
                    </>
                  )}
                  {data.provider === 'ollama' && (
                    <>
                      <option value="ollama/llama3.3">Llama 3.3</option>
                      <option value="ollama/qwen2.5">Qwen 2.5</option>
                    </>
                  )}
                </select>
              </div>

              <div className="flex justify-between pt-4">
                <button onClick={() => setStep(2)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                  ← Back
                </button>
                <button onClick={() => setStep(4)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Channels & Deploy */}
          {step === 4 && (
            <div className="space-y-6">
              <p className="text-zinc-400">Connect {data.agentName} to chat channels (optional).</p>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Telegram Bot Token</label>
                <input
                  type="password"
                  value={data.telegramToken || ''}
                  onChange={(e) => updateData('telegramToken', e.target.value)}
                  placeholder="123456789:ABCdefGHI..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
                />
                <p className="text-xs text-zinc-500 mt-1">Create a bot via @BotFather on Telegram</p>
              </div>

              {data.telegramToken && (
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Allowed Telegram User IDs</label>
                  <input
                    type="text"
                    value={data.telegramUserIds || ''}
                    onChange={(e) => updateData('telegramUserIds', e.target.value)}
                    placeholder="8576132014, 123456789"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Comma-separated user IDs. Only these users can message the agent. 
                    <a href="https://t.me/userinfobot" target="_blank" rel="noopener" className="text-blue-400 hover:underline ml-1">Get your ID</a>
                  </p>
                </div>
              )}

              <div className="p-4 bg-zinc-800 rounded-lg">
                <h4 className="font-medium mb-3">Summary</h4>
                <div className="space-y-2 text-sm">
                  <p><span className="text-zinc-500">Name:</span> {data.agentName}</p>
                  <p><span className="text-zinc-500">Persona:</span> {selectedPersona?.emoji} {selectedPersona?.name}</p>
                  <p><span className="text-zinc-500">Model:</span> {data.model}</p>
                  <p><span className="text-zinc-500">Provider:</span> {data.provider}</p>
                  <p><span className="text-zinc-500">Telegram:</span> {data.telegramToken ? '✓ Configured' : 'Not configured'}</p>
                </div>
              </div>

              <div className="p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
                <h4 className="font-medium text-blue-400 mb-2">🚀 What happens next</h4>
                <ul className="text-sm text-zinc-300 space-y-1">
                  <li>• Docker container with OpenClaw + Chromium</li>
                  <li>• VNC for real-time screen viewing</li>
                  <li>• Browser automation ready (Claude Code)</li>
                  <li>• Telegram bot connected (if configured)</li>
                  <li>• Agent workspace with SOUL.md, MEMORY.md</li>
                </ul>
              </div>

              {error && (
                <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="flex justify-between pt-4">
                <button onClick={() => setStep(3)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
                  ← Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-medium"
                >
                  {loading ? 'Deploying...' : '🚀 Deploy Agent'}
                </button>
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
