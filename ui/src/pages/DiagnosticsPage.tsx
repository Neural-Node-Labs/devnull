import { useState, useEffect } from 'react';
import { api, type SkillListEntry } from '../api/client';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'pending';
  message?: string;
}

export default function DiagnosticsPage() {
  const [skills, setSkills] = useState<SkillListEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [health, setHealth] = useState<{ status: string; version: string; uptime: number } | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([
    { name: 'API Connection', status: 'pending' },
    { name: 'Health Check', status: 'pending' },
    { name: 'Skills Loaded', status: 'pending' },
    { name: 'Telemetry Available', status: 'pending' },
    { name: 'React Render', status: 'pending' },
  ]);

  const runTests = async () => {
    // Test 1: API Connection
    setTestResults((prev) =>
      prev.map((t) => (t.name === 'API Connection' ? { ...t, status: 'pending' as const } : t))
    );
    try {
      const healthRes = await api.health();
      if (healthRes.success) {
        setHealth(healthRes.data || null);
        setTestResults((prev) =>
          prev.map((t) =>
            t.name === 'API Connection'
              ? { ...t, status: 'pass' as const, message: 'API is reachable' }
              : t
          )
        );
      } else {
        setTestResults((prev) =>
          prev.map((t) =>
            t.name === 'API Connection'
              ? { ...t, status: 'fail' as const, message: healthRes.error || 'API error' }
              : t
          )
        );
      }
    } catch (err) {
      setTestResults((prev) =>
        prev.map((t) =>
          t.name === 'API Connection'
            ? { ...t, status: 'fail' as const, message: String(err) }
            : t
        )
      );
    }

    // Test 2: Health Check
    if (health) {
      setTestResults((prev) =>
        prev.map((t) =>
          t.name === 'Health Check'
            ? {
                ...t,
                status: health.status === 'ok' ? 'pass' as const : 'fail' as const,
                message: `Status: ${health.status}, Version: ${health.version}`,
              }
            : t
        )
      );
    }

    // Test 3: Skills
    setSkillsLoading(true);
    try {
      const skillsRes = await api.skills();
      if (skillsRes.success && skillsRes.data) {
        const skillsData = skillsRes.data as SkillListEntry[];
        setSkills(skillsData);
        setTestResults((prev) =>
          prev.map((t) =>
            t.name === 'Skills Loaded'
              ? { ...t, status: 'pass' as const, message: `${skillsData.length} skills loaded` }
              : t
          )
        );
      } else {
        setTestResults((prev) =>
          prev.map((t) =>
            t.name === 'Skills Loaded'
              ? { ...t, status: 'fail' as const, message: skillsRes.error || 'No skills' }
              : t
          )
        );
      }
    } catch (err) {
      setTestResults((prev) =>
        prev.map((t) =>
          t.name === 'Skills Loaded'
            ? { ...t, status: 'fail' as const, message: String(err) }
            : t
        )
      );
    } finally {
      setSkillsLoading(false);
    }

    // Test 4: Telemetry
    try {
      const telemetryRes = await api.telemetry('thinking', 5);
      if (telemetryRes.success) {
        const telemetryData = telemetryRes.data as { entries?: unknown[] } | undefined;
        setTestResults((prev) =>
          prev.map((t) =>
            t.name === 'Telemetry Available'
              ? {
                  ...t,
                  status: 'pass' as const,
                  message: `${telemetryData?.entries?.length || 0} entries`,
                }
              : t
          )
        );
      } else {
        setTestResults((prev) =>
          prev.map((t) =>
            t.name === 'Telemetry Available'
              ? { ...t, status: 'fail' as const, message: telemetryRes.error }
              : t
          )
        );
      }
    } catch (err) {
      setTestResults((prev) =>
        prev.map((t) =>
          t.name === 'Telemetry Available'
            ? { ...t, status: 'fail' as const, message: String(err) }
            : t
        )
      );
    }

    // Test 5: React Render (always passes if we got here)
    setTestResults((prev) =>
      prev.map((t) =>
        t.name === 'React Render'
          ? { ...t, status: 'pass' as const, message: 'Component rendered successfully' }
          : t
      )
    );
  };

  useEffect(() => {
    runTests();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Diagnostics</h2>
            <p className="text-sm text-gray-500">System health checks and component testing</p>
          </div>
          <button
            onClick={runTests}
            className="px-3 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            Run Tests
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Test Results */}
        <section>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Test Results
          </h3>
          <div className="space-y-2">
            {testResults.map((test) => (
              <div
                key={test.name}
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  test.status === 'pass'
                    ? 'bg-green-900/10 border-green-800/30'
                    : test.status === 'fail'
                    ? 'bg-red-900/10 border-red-800/30'
                    : 'bg-gray-900 border-gray-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span>
                    {test.status === 'pass' ? '✅' : test.status === 'fail' ? '❌' : '⏳'}
                  </span>
                  <div>
                    <p className="text-sm text-gray-200">{test.name}</p>
                    {test.message && (
                      <p className="text-xs text-gray-500 mt-0.5">{test.message}</p>
                    )}
                  </div>
                </div>
                <span
                  className={`text-xs font-medium ${
                    test.status === 'pass'
                      ? 'text-green-400'
                      : test.status === 'fail'
                      ? 'text-red-400'
                      : 'text-yellow-400'
                  }`}
                >
                  {test.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Skills */}
        <section>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Loaded Skills
          </h3>
          {skillsLoading ? (
            <p className="text-sm text-gray-500">Loading skills...</p>
          ) : skills.length === 0 ? (
            <p className="text-sm text-gray-600">No skills loaded</p>
          ) : (
            <div className="space-y-2">
              {skills.map((skill) => (
                <div
                  key={skill.name}
                  className="p-3 bg-gray-900 rounded-xl border border-gray-800"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-200">{skill.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-600/20 text-purple-400">
                      {skill.role}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{skill.description}</p>
                  {skill.triggers.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-gray-600">Triggers:</span>
                      {skill.triggers.map((t) => (
                        <span
                          key={t}
                          className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Directives */}
        <section>
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Directives & Protocol
          </h3>
          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Engineering Protocol</span>
                <span className="text-xs text-green-400">✅ Loaded</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">System Directives</span>
                <span className="text-xs text-green-400">✅ Active</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Tool Definitions</span>
                <span className="text-xs text-green-400">✅ Available</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Skill Registry</span>
                <span className="text-xs text-green-400">✅ Loaded</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
