'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast, Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Plus, Play, Square, Trash2, Monitor, Settings, Loader2, 
  Bot, Zap, Users, Pencil, Search, FileText, Cog, Target, Handshake
} from 'lucide-react';

interface AgentBox {
  id: string;
  name: string;
  state: 'running' | 'stopped' | 'paused' | 'missing' | 'deploying';
  containerId?: string;
  createdAt: string;
  ports?: { gateway: number; vnc: number; novnc: number; browserControl: number };
  config?: { name: string; model?: string; persona?: string };
  deployProgress?: string;
}

type LLMProvider = 'anthropic' | 'openai' | 'bedrock' | 'ollama';
type InfraProvider = 'docker' | 'e2b';

interface AgentPersona {
  id: string;
  name: string;
  icon: React.ReactNode;
  tagline: string;
  description: string;
  defaultModel: string;
  suggestedNames: string[];
}

const PERSONAS: AgentPersona[] = [
  { id: 'executive-assistant', name: 'Executive Assistant', icon: <Bot className="w-5 h-5" />, tagline: 'Your tireless chief of staff', description: 'Manages calendars, drafts communications, researches topics.', defaultModel: 'anthropic/claude-sonnet-4-6', suggestedNames: ['Alexandra', 'Marcus', 'Victoria'] },
  { id: 'sales-dev-rep', name: 'Sales Dev Rep', icon: <Target className="w-5 h-5" />, tagline: 'Outbound machine that books meetings', description: 'Researches prospects, crafts personalized outreach.', defaultModel: 'anthropic/claude-sonnet-4-6', suggestedNames: ['Jordan', 'Taylor', 'Morgan'] },
  { id: 'customer-success', name: 'Customer Success', icon: <Handshake className="w-5 h-5" />, tagline: 'Keeps customers happy', description: 'Onboards customers, monitors health, prevents churn.', defaultModel: 'anthropic/claude-sonnet-4-6', suggestedNames: ['Olivia', 'Ethan', 'Sophia'] },
  { id: 'content-creator', name: 'Content Creator', icon: <Pencil className="w-5 h-5" />, tagline: 'Writes content that converts', description: 'Creates blog posts, social content, email campaigns.', defaultModel: 'anthropic/claude-sonnet-4-6', suggestedNames: ['Quinn', 'Avery', 'Riley'] },
  { id: 'research-analyst', name: 'Research Analyst', icon: <Search className="w-5 h-5" />, tagline: 'Deep dives that drive decisions', description: 'Conducts market research and competitive analysis.', defaultModel: 'anthropic/claude-opus-4-6', suggestedNames: ['Morgan', 'Parker', 'Reese'] },
  { id: 'technical-writer', name: 'Technical Writer', icon: <FileText className="w-5 h-5" />, tagline: 'Documentation developers love', description: 'Creates API docs, user guides, tutorials.', defaultModel: 'anthropic/claude-sonnet-4-6', suggestedNames: ['Alex', 'Sam', 'Jamie'] },
  { id: 'recruiter', name: 'Recruiter', icon: <Users className="w-5 h-5" />, tagline: 'Finds and attracts top talent', description: 'Sources candidates, crafts outreach, screens applicants.', defaultModel: 'anthropic/claude-sonnet-4-6', suggestedNames: ['Meg', 'Spencer', 'Robin'] },
  { id: 'ops-automator', name: 'Ops Automator', icon: <Cog className="w-5 h-5" />, tagline: 'Automates the boring stuff', description: 'Builds automations, optimizes workflows.', defaultModel: 'anthropic/claude-sonnet-4-6', suggestedNames: ['Dana', 'Ellis', 'Phoenix'] },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3457';

export default function Dashboard() {
  const [boxes, setBoxes] = useState<AgentBox[]>([]);
  const [selectedBox, setSelectedBox] = useState<AgentBox | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deployingBoxes, setDeployingBoxes] = useState<Map<string, { progress: string; persona?: string }>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  const fetchBoxes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/boxes`);
      if (!res.ok) throw new Error('Failed to fetch');
      setBoxes(await res.json());
    } catch {
      // Silent fail on fetch
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3457`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'init') setBoxes(msg.boxes);
      else if (msg.type?.startsWith('box:')) fetchBoxes();
    };
    return () => ws.close();
  }, [fetchBoxes]);

  useEffect(() => {
    fetchBoxes();
    const interval = setInterval(fetchBoxes, 10000);
    return () => clearInterval(interval);
  }, [fetchBoxes]);

  const handleAction = async (boxId: string, action: 'start' | 'stop' | 'destroy') => {
    try {
      const method = action === 'destroy' ? 'DELETE' : 'POST';
      const url = action === 'destroy' ? `${API_BASE}/api/boxes/${boxId}` : `${API_BASE}/api/boxes/${boxId}/${action}`;
      await fetch(url, { method });
      toast.success(`Agent ${action === 'destroy' ? 'destroyed' : action === 'start' ? 'started' : 'stopped'}`);
      fetchBoxes();
    } catch {
      toast.error(`Failed to ${action} agent`);
    }
  };

  const allAgents = [
    ...Array.from(deployingBoxes.entries()).map(([name, { progress, persona }]) => ({
      id: `deploying-${name}`,
      name,
      state: 'deploying' as const,
      deployProgress: progress,
      config: { name, persona },
    })),
    ...boxes,
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Toaster position="bottom-right" richColors />
      
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="logo-text">Box Claws</span>
              </h1>
              <p className="text-sm text-muted-foreground">AI Agent Observatory</p>
            </div>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" />
            Deploy Agent
          </Button>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-80 border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-muted-foreground">Agents</h2>
              <Badge variant="secondary">{allAgents.length}</Badge>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : allAgents.length === 0 ? (
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Bot className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-3">No agents deployed yet</p>
                <Button variant="outline" size="sm" onClick={() => setShowCreateModal(true)}>
                  Deploy your first agent
                </Button>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {allAgents.map((box) => (
                  <button
                    key={box.id}
                    onClick={() => box.state !== 'deploying' && setSelectedBox(box as AgentBox)}
                    disabled={box.state === 'deploying'}
                    className={`w-full p-3 rounded-lg text-left transition-all ${
                      selectedBox?.id === box.id 
                        ? 'bg-primary/10 border border-primary/20' 
                        : 'hover:bg-muted/50 border border-transparent'
                    } ${box.state === 'deploying' ? 'opacity-80' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <StatusDot state={box.state} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{box.name}</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {box.state === 'deploying' ? box.deployProgress : box.config?.persona || 'Custom'}
                        </p>
                      </div>
                      {box.state === 'deploying' && (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {selectedBox ? (
            <>
              {/* Agent Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusDot state={selectedBox.state} size="lg" />
                  <div>
                    <h2 className="text-lg font-semibold">{selectedBox.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedBox.config?.persona || 'Custom'} • Port {selectedBox.ports?.gateway}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedBox.state === 'running' && (
                    <>
                      <Button variant="outline" size="sm" asChild>
                        <a href={`http://localhost:${selectedBox.ports?.novnc}/vnc.html?autoconnect=true`} target="_blank">
                          <Monitor className="w-4 h-4" />
                          Open VNC
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleAction(selectedBox.id, 'stop')}>
                        <Square className="w-4 h-4" />
                        Stop
                      </Button>
                    </>
                  )}
                  {selectedBox.state === 'stopped' && (
                    <Button variant="outline" size="sm" onClick={() => handleAction(selectedBox.id, 'start')}>
                      <Play className="w-4 h-4" />
                      Start
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={() => handleAction(selectedBox.id, 'destroy')}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* VNC View */}
              <div className="flex-1 p-4">
                <div className="h-full bg-black rounded-lg overflow-hidden border border-border">
                  {selectedBox.state === 'running' ? (
                    <iframe
                      src={`http://localhost:${selectedBox.ports?.novnc}/vnc.html?autoconnect=true&resize=scale`}
                      className="w-full h-full border-0"
                      title={`VNC: ${selectedBox.name}`}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                          <Monitor className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground mb-4">Agent is {selectedBox.state}</p>
                        {selectedBox.state === 'stopped' && (
                          <Button onClick={() => handleAction(selectedBox.id, 'start')}>
                            <Play className="w-4 h-4" />
                            Start Agent
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Zap className="w-10 h-10 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-medium mb-2">Select an agent</h2>
                <p className="text-muted-foreground">Choose an agent from the sidebar to view its screen</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create Modal */}
      <CreateAgentDialog 
        open={showCreateModal} 
        onOpenChange={setShowCreateModal}
        onDeployStart={(name, persona) => {
          setShowCreateModal(false);
          setDeployingBoxes(prev => new Map(prev).set(name, { progress: 'Creating...', persona }));
        }}
        onDeployProgress={(name, progress) => {
          setDeployingBoxes(prev => {
            const updated = new Map(prev);
            const existing = updated.get(name);
            if (existing) updated.set(name, { ...existing, progress });
            return updated;
          });
        }}
        onDeployComplete={(name) => {
          setDeployingBoxes(prev => { const u = new Map(prev); u.delete(name); return u; });
          toast.success(`${name} deployed successfully!`);
          fetchBoxes();
        }}
        onDeployError={(name, error) => {
          setDeployingBoxes(prev => { const u = new Map(prev); u.delete(name); return u; });
          toast.error(`Failed to deploy ${name}: ${error}`);
        }}
      />
    </div>
  );
}

function StatusDot({ state, size = 'sm' }: { state: string; size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'w-3 h-3' : 'w-2 h-2';
  const colors: Record<string, string> = {
    running: 'bg-emerald-500 animate-pulse-ring',
    stopped: 'bg-zinc-500',
    paused: 'bg-yellow-500',
    missing: 'bg-red-500',
    deploying: 'bg-yellow-500 animate-pulse',
  };
  return <div className={`${sizeClass} rounded-full ${colors[state] || 'bg-zinc-500'}`} />;
}

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeployStart: (name: string, persona?: string) => void;
  onDeployProgress: (name: string, progress: string) => void;
  onDeployComplete: (name: string) => void;
  onDeployError: (name: string, error: string) => void;
}

function CreateAgentDialog({ open, onOpenChange, onDeployStart, onDeployProgress, onDeployComplete, onDeployError }: CreateAgentDialogProps) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    personaId: '',
    agentName: '',
    infraProvider: 'docker' as InfraProvider,
    provider: 'anthropic' as LLMProvider,
    anthropicKey: '',
    model: 'anthropic/claude-sonnet-4-6',
    telegramToken: '',
    telegramUserIds: '',
  });

  const selectedPersona = PERSONAS.find(p => p.id === data.personaId);

  const handleSubmit = async () => {
    const boxName = data.agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    onDeployStart(boxName, selectedPersona?.name);

    try {
      if (data.infraProvider === 'e2b') {
        const params = new URLSearchParams({
          name: boxName, provider: data.infraProvider, persona: data.personaId,
          model: data.model, anthropicApiKey: data.anthropicKey,
          telegramToken: data.telegramToken, telegramUserId: data.telegramUserIds?.split(',')[0]?.trim() || '',
        });
        const eventSource = new EventSource(`${API_BASE}/api/boxes/deploy-stream?${params}`);
        eventSource.onmessage = (e) => {
          const progress = JSON.parse(e.data);
          if (progress.error) { onDeployError(boxName, progress.error); eventSource.close(); }
          else if (progress.done) { onDeployComplete(boxName); eventSource.close(); }
          else onDeployProgress(boxName, progress.message);
        };
        eventSource.onerror = () => { onDeployError(boxName, 'Connection lost'); eventSource.close(); };
      } else {
        onDeployProgress(boxName, 'Starting container...');
        const res = await fetch(`${API_BASE}/api/boxes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: boxName, provider: data.infraProvider, persona: data.personaId,
            model: data.model, anthropicApiKey: data.anthropicKey,
            telegramToken: data.telegramToken, telegramUserId: data.telegramUserIds?.split(',')[0]?.trim(),
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed');
        onDeployComplete(boxName);
      }
    } catch (err) {
      onDeployError(boxName, err instanceof Error ? err.message : 'Failed');
    }
  };

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(1);
      setData({ personaId: '', agentName: '', infraProvider: 'docker', provider: 'anthropic', anthropicKey: '', model: 'anthropic/claude-sonnet-4-6', telegramToken: '', telegramUserIds: '' });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deploy New Agent</DialogTitle>
          <DialogDescription>Step {step} of 3 — {step === 1 ? 'Choose persona' : step === 2 ? 'Configure' : 'Channels'}</DialogDescription>
        </DialogHeader>

        {/* Step 1: Persona */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {PERSONAS.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setData(d => ({ ...d, personaId: p.id, model: p.defaultModel, agentName: p.suggestedNames[0] }));
                  }}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    data.personaId === p.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded ${data.personaId === p.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {p.icon}
                    </div>
                    <span className="font-medium">{p.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.tagline}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!data.personaId}>Next</Button>
            </div>
          </div>
        )}

        {/* Step 2: Config */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input value={data.agentName} onChange={e => setData(d => ({ ...d, agentName: e.target.value }))} placeholder="Give your agent a name" />
              <div className="flex gap-2">
                {selectedPersona?.suggestedNames.map(n => (
                  <Button key={n} variant="outline" size="sm" onClick={() => setData(d => ({ ...d, agentName: n }))}>{n}</Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Infrastructure</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'docker', name: 'Local Docker', desc: 'Free • Runs on your machine' },
                  { id: 'e2b', name: 'E2B Cloud', desc: '$0.05/hr • Isolated VM' },
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => setData(d => ({ ...d, infraProvider: p.id as InfraProvider }))}
                    className={`p-3 rounded-lg border text-left ${data.infraProvider === p.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                  >
                    <span className="font-medium">{p.name}</span>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Anthropic API Key</Label>
              <Input type="password" value={data.anthropicKey} onChange={e => setData(d => ({ ...d, anthropicKey: e.target.value }))} placeholder="sk-ant-..." />
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={data.model} onValueChange={v => setData(d => ({ ...d, model: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic/claude-sonnet-4-6">Claude Sonnet 4.6</SelectItem>
                  <SelectItem value="anthropic/claude-opus-4-6">Claude Opus 4.6</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!data.agentName || !data.anthropicKey}>Next</Button>
            </div>
          </div>
        )}

        {/* Step 3: Channels */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Telegram Bot Token (optional)</Label>
              <Input type="password" value={data.telegramToken} onChange={e => setData(d => ({ ...d, telegramToken: e.target.value }))} placeholder="123456789:ABCdef..." />
            </div>

            {data.telegramToken && (
              <div className="space-y-2">
                <Label>Allowed User IDs</Label>
                <Input value={data.telegramUserIds} onChange={e => setData(d => ({ ...d, telegramUserIds: e.target.value }))} placeholder="8576132014" />
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Name:</span> {data.agentName}</p>
                <p><span className="text-muted-foreground">Persona:</span> {selectedPersona?.name}</p>
                <p><span className="text-muted-foreground">Model:</span> {data.model}</p>
                <p><span className="text-muted-foreground">Infra:</span> {data.infraProvider}</p>
              </CardContent>
            </Card>

            {data.infraProvider === 'e2b' && (
              <p className="text-xs text-yellow-500">⏱️ E2B deployments take 3-5 minutes</p>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={handleSubmit}>
                <Zap className="w-4 h-4" />
                Deploy Agent
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
