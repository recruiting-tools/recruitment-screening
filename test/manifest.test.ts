import { describe, it, expect } from 'vitest';
import { buildManifest } from '../src/manifest';

describe('MCP manifest', () => {
  const manifest = buildManifest();

  it('has required top-level fields', () => {
    expect(manifest.service).toBe('recruitment-screening');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.auth.type).toBe('bearer');
    expect(manifest.auth.env_var).toBe('SCREENING_API_TOKEN');
    expect(manifest.base_url_env).toBe('SCREENING_API_URL');
  });

  it('has 8 tools with scr_ prefix', () => {
    expect(manifest.tools).toHaveLength(8);
    for (const tool of manifest.tools) {
      expect(tool.name).toMatch(/^scr_/);
      expect(tool.description).toBeTruthy();
      expect(tool.endpoint.method).toMatch(/^(GET|POST|PUT|DELETE)$/);
      expect(tool.endpoint.path).toMatch(/^\//);
    }
  });

  it('every tool has parameters with descriptions', () => {
    for (const tool of manifest.tools) {
      expect(tool.parameters).toBeTruthy();
      for (const [key, param] of Object.entries(tool.parameters)) {
        expect(param.description, `${tool.name}.${key} missing description`).toBeTruthy();
        expect(param.type, `${tool.name}.${key} missing type`).toBeTruthy();
      }
    }
  });

  it('has expected tool names', () => {
    const names = manifest.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('scr_match');
    expect(names).toContain('scr_evaluate');
    expect(names).toContain('scr_generate_questions');
    expect(names).toContain('scr_pipeline_init');
    expect(names).toContain('scr_pipeline_analyse');
    expect(names).toContain('scr_pipeline_write_message');
    expect(names).toContain('scr_pipeline_completion');
    expect(names).toContain('scr_pipeline_validate');
  });

  it('has playbooks', () => {
    expect(manifest.playbooks.length).toBeGreaterThan(0);
    for (const pb of manifest.playbooks) {
      expect(pb.name).toBeTruthy();
      expect(pb.description).toBeTruthy();
      expect(pb.steps.length).toBeGreaterThan(0);
    }
  });
});
