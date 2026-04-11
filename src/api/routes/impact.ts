import type { FastifyPluginAsync } from 'fastify';
import { getCountryByCode, getDataVersion } from '../../data/loader.js';
import { calculateSimulation } from '../../core/simulations.js';
import { calculateImpactAnalysis } from '../../core/impact.js';
import { getSimulationById } from '../../db/simulations-db.js';
import {
  saveImpactAnalysis,
  listImpactAnalyses,
  getImpactAnalysisById,
  deleteImpactAnalysis,
} from '../../db/impact-db.js';
import type { ImpactParameters, SimulationParameters, TargetGroup } from '../../core/types.js';
import { dispatchEvent } from '../../webhooks/dispatcher.js';
import { parsePagination, buildPaginationMeta } from '../pagination.js';
import { GLOBAL_INCOME_FLOOR_PPP } from '../../core/constants.js';

// ── Shared validation helper ─────────────────────────────────────────────

function resolveImpactParams(body: Record<string, unknown>): {
  ok: true;
  params: Omit<ImpactParameters, 'simulationId'>;
} | { ok: false; message: string } {
  const coverage = typeof body.coverage === 'number' ? body.coverage : 0.2;
  const targetGroup = (typeof body.targetGroup === 'string' ? body.targetGroup : 'all') as TargetGroup;
  const durationMonths = typeof body.durationMonths === 'number' ? body.durationMonths : 12;
  const floorOverride = typeof body.floorOverride === 'number' ? body.floorOverride : null;

  if (coverage <= 0 || coverage > 1) {
    return { ok: false, message: "'coverage' must be between 0 (exclusive) and 1 (inclusive)" };
  }
  if (!['all', 'bottom_decile', 'bottom_quintile', 'bottom_third', 'bottom_half'].includes(targetGroup)) {
    return { ok: false, message: "'targetGroup' must be one of: all, bottom_decile, bottom_quintile, bottom_third, bottom_half" };
  }
  if (durationMonths < 1 || durationMonths > 120) {
    return { ok: false, message: "'durationMonths' must be between 1 and 120" };
  }
  if (floorOverride !== null && (floorOverride <= 0 || floorOverride > 10000)) {
    return { ok: false, message: "'floorOverride' must be between 0 and 10000" };
  }

  return {
    ok: true,
    params: { country: '', coverage, targetGroup, durationMonths, floorOverride },
  };
}

// ── Route plugin ─────────────────────────────────────────────────────────

export const impactRoute: FastifyPluginAsync = async (app) => {
  /**
   * POST /v1/impact
   *
   * Run a full economic impact analysis for a basic income program.
   * Accepts either inline simulation parameters or a saved simulationId.
   *
   * Returns four impact dimensions + an exportable policy brief with all
   * assumptions explicitly listed.
   */
  app.post<{ Body: Record<string, unknown> }>('/impact', async (request, reply) => {
    const body = request.body ?? {};
    const simulationId = typeof body.simulationId === 'string' ? body.simulationId : null;
    const countryCode = typeof body.country === 'string' ? body.country.toUpperCase() : '';

    const paramResult = resolveImpactParams(body);
    if (!paramResult.ok) {
      return reply.status(400).send({ ok: false, error: { code: 'INVALID_PARAMETER', message: paramResult.message } });
    }

    let simulation;
    let country;
    let resolvedSimulationId: string | null = simulationId;

    if (simulationId) {
      const saved = getSimulationById(simulationId);
      if (!saved) {
        return reply.status(404).send({ ok: false, error: { code: 'SIMULATION_NOT_FOUND', message: `Simulation '${simulationId}' not found` } });
      }
      country = getCountryByCode(saved.countryCode);
      if (!country) {
        return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `Country data not found for '${saved.countryCode}'` } });
      }
      simulation = saved.results;
    } else {
      if (!countryCode) {
        return reply.status(400).send({ ok: false, error: { code: 'MISSING_PARAMETER', message: "Either 'simulationId' or 'country' is required" } });
      }
      country = getCountryByCode(countryCode);
      if (!country) {
        return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `No data for '${countryCode}'` } });
      }
      const simParams: SimulationParameters = {
        country: country.code,
        coverage: paramResult.params.coverage,
        targetGroup: paramResult.params.targetGroup,
        durationMonths: paramResult.params.durationMonths,
        adjustments: {
          floorOverride: paramResult.params.floorOverride,
          householdSize: null,
        },
      };
      simulation = calculateSimulation(country, simParams, getDataVersion());
      resolvedSimulationId = null;
    }

    const impactParams: ImpactParameters = {
      ...paramResult.params,
      country: country.code,
      simulationId: resolvedSimulationId,
    };

    const result = calculateImpactAnalysis(country, simulation, impactParams, getDataVersion());
    return { ok: true, data: result };
  });

  /**
   * POST /v1/impact-analyses
   *
   * Run an impact analysis and save it to the database.
   */
  app.post<{ Body: Record<string, unknown> }>('/impact-analyses', async (request, reply) => {
    const body = request.body ?? {};
    const name = typeof body.name === 'string' ? body.name : null;
    const simulationId = typeof body.simulationId === 'string' ? body.simulationId : null;
    const countryCode = typeof body.country === 'string' ? body.country.toUpperCase() : '';

    const paramResult = resolveImpactParams(body);
    if (!paramResult.ok) {
      return reply.status(400).send({ ok: false, error: { code: 'INVALID_PARAMETER', message: paramResult.message } });
    }

    let simulation;
    let country;
    let resolvedSimulationId: string | null = simulationId;

    if (simulationId) {
      const saved = getSimulationById(simulationId);
      if (!saved) {
        return reply.status(404).send({ ok: false, error: { code: 'SIMULATION_NOT_FOUND', message: `Simulation '${simulationId}' not found` } });
      }
      country = getCountryByCode(saved.countryCode);
      if (!country) {
        return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `Country data not found for '${saved.countryCode}'` } });
      }
      simulation = saved.results;
    } else {
      if (!countryCode) {
        return reply.status(400).send({ ok: false, error: { code: 'MISSING_PARAMETER', message: "Either 'simulationId' or 'country' is required" } });
      }
      country = getCountryByCode(countryCode);
      if (!country) {
        return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `No data for '${countryCode}'` } });
      }
      const simParams: SimulationParameters = {
        country: country.code,
        coverage: paramResult.params.coverage,
        targetGroup: paramResult.params.targetGroup,
        durationMonths: paramResult.params.durationMonths,
        adjustments: {
          floorOverride: paramResult.params.floorOverride,
          householdSize: null,
        },
      };
      simulation = calculateSimulation(country, simParams, getDataVersion());
      resolvedSimulationId = null;
    }

    const impactParams: ImpactParameters = {
      ...paramResult.params,
      country: country.code,
      simulationId: resolvedSimulationId,
    };

    const apiKeyId = (request as unknown as { apiKeyId?: string }).apiKeyId ?? null;
    const result = calculateImpactAnalysis(country, simulation, impactParams, getDataVersion());
    const saved = saveImpactAnalysis(
      name,
      resolvedSimulationId,
      country.code,
      impactParams,
      result,
      apiKeyId,
    );

    void dispatchEvent('impact_analysis.created', { id: saved.id, country: country.code });

    return reply.status(201).send({ ok: true, data: saved });
  });

  /**
   * GET /v1/impact-analyses
   *
   * List saved impact analyses (paginated).
   */
  app.get<{ Querystring: { page?: string; limit?: string } }>(
    '/impact-analyses',
    async (request) => {
      const pg = parsePagination(request.query);
      const { analyses, total } = listImpactAnalyses(pg.limit, pg.offset);
      return { ok: true, data: { analyses, pagination: buildPaginationMeta(pg, total) } };
    },
  );

  /**
   * GET /v1/impact-analyses/:id
   *
   * Retrieve a single saved impact analysis.
   */
  app.get<{ Params: { id: string } }>('/impact-analyses/:id', async (request, reply) => {
    const analysis = getImpactAnalysisById(request.params.id);
    if (!analysis) {
      return reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Impact analysis not found' } });
    }
    return { ok: true, data: analysis };
  });

  /**
   * DELETE /v1/impact-analyses/:id
   *
   * Delete a saved impact analysis.
   */
  app.delete<{ Params: { id: string } }>('/impact-analyses/:id', async (request, reply) => {
    const deleted = deleteImpactAnalysis(request.params.id);
    if (!deleted) {
      return reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Impact analysis not found' } });
    }
    return { ok: true, data: { deleted: true } };
  });

  /**
   * POST /v1/impact/brief
   *
   * Generate an impact analysis and return ONLY the policy brief portion,
   * formatted for export (JSON or human-readable text).
   *
   * Accepts ?format=json (default) or ?format=text for a plain-text version.
   */
  app.post<{ Body: Record<string, unknown>; Querystring: { format?: string } }>(
    '/impact/brief',
    async (request, reply) => {
      const body = request.body ?? {};
      const format = request.query.format ?? 'json';
      const simulationId = typeof body.simulationId === 'string' ? body.simulationId : null;
      const countryCode = typeof body.country === 'string' ? body.country.toUpperCase() : '';

      const paramResult = resolveImpactParams(body);
      if (!paramResult.ok) {
        return reply.status(400).send({ ok: false, error: { code: 'INVALID_PARAMETER', message: paramResult.message } });
      }

      let simulation;
      let country;
      let resolvedSimulationId: string | null = simulationId;

      if (simulationId) {
        const saved = getSimulationById(simulationId);
        if (!saved) {
          return reply.status(404).send({ ok: false, error: { code: 'SIMULATION_NOT_FOUND', message: `Simulation '${simulationId}' not found` } });
        }
        country = getCountryByCode(saved.countryCode);
        if (!country) {
          return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `Country data not found for '${saved.countryCode}'` } });
        }
        simulation = saved.results;
      } else {
        if (!countryCode) {
          return reply.status(400).send({ ok: false, error: { code: 'MISSING_PARAMETER', message: "Either 'simulationId' or 'country' is required" } });
        }
        country = getCountryByCode(countryCode);
        if (!country) {
          return reply.status(404).send({ ok: false, error: { code: 'COUNTRY_NOT_FOUND', message: `No data for '${countryCode}'` } });
        }
        const simParams: SimulationParameters = {
          country: country.code,
          coverage: paramResult.params.coverage,
          targetGroup: paramResult.params.targetGroup,
          durationMonths: paramResult.params.durationMonths,
          adjustments: {
            floorOverride: paramResult.params.floorOverride,
            householdSize: null,
          },
        };
        simulation = calculateSimulation(country, simParams, getDataVersion());
        resolvedSimulationId = null;
      }

      const impactParams: ImpactParameters = {
        ...paramResult.params,
        country: country.code,
        simulationId: resolvedSimulationId,
      };

      const result = calculateImpactAnalysis(country, simulation, impactParams, getDataVersion());
      const brief = result.policyBrief;

      if (format === 'text') {
        const text = renderBriefAsText(brief, result);
        return reply
          .header('content-type', 'text/plain; charset=utf-8')
          .header('content-disposition', `attachment; filename="impact-brief-${country.code.toLowerCase()}.txt"`)
          .send(text);
      }

      // JSON export — include full brief + key program/country context
      const exportData = {
        brief,
        country: result.country,
        program: result.program,
        meta: result.meta,
      };

      return reply
        .header('content-disposition', `attachment; filename="impact-brief-${country.code.toLowerCase()}.json"`)
        .send({ ok: true, data: exportData });
    },
  );
};

// ── Plain-text policy brief renderer ─────────────────────────────────────

function renderBriefAsText(
  brief: import('../../core/types.js').PolicyBrief,
  result: import('../../core/types.js').ImpactAnalysisResult,
): string {
  const divider = '─'.repeat(72);
  const lines: string[] = [];

  lines.push(divider);
  lines.push(brief.title.toUpperCase());
  lines.push(brief.subtitle);
  lines.push(`Generated: ${brief.generatedAt}`);
  lines.push(`Ruleset: ${result.meta.rulesetVersion}  |  Data: ${result.meta.dataVersion}`);
  lines.push(divider);
  lines.push('');
  lines.push('PROGRAM DESCRIPTION');
  lines.push('');
  lines.push(brief.programDescription);
  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push('HEADLINE IMPACT FIGURES');
  lines.push('');

  const h = brief.headline;
  lines.push(`  Poverty Reduction:    ${h.povertyReduction.formatted}`);
  lines.push(`                        ${h.povertyReduction.label}`);
  lines.push('');
  lines.push(`  Purchasing Power:     ${h.purchasingPower.formatted}`);
  lines.push(`                        ${h.purchasingPower.label}`);
  lines.push('');
  lines.push(`  Social Coverage:      ${h.socialCoverage.formatted}`);
  lines.push(`                        ${h.socialCoverage.label}`);
  lines.push('');
  lines.push(`  GDP Stimulus:         ${h.gdpStimulus.formatted}`);
  lines.push(`                        ${h.gdpStimulus.label}`);
  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push('METHODOLOGY');
  lines.push('');
  lines.push('Poverty Model:');
  lines.push(wrapText(brief.methodology.povertyModel, 4));
  lines.push('');
  lines.push('Income Distribution Model:');
  lines.push(wrapText(brief.methodology.incomeDistributionModel, 4));
  lines.push('');
  lines.push('Social Coverage Model:');
  lines.push(wrapText(brief.methodology.socialCoverageModel, 4));
  lines.push('');
  lines.push('Fiscal Multiplier Model:');
  lines.push(wrapText(brief.methodology.fiscalMultiplierModel, 4));
  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push('ASSUMPTIONS (COMPLETE LIST)');
  lines.push('');
  brief.assumptions.forEach((a, i) => {
    lines.push(`  ${(i + 1).toString().padStart(2, ' ')}. ${a}`);
    lines.push('');
  });
  lines.push(divider);
  lines.push('');
  lines.push('DATA SOURCES');
  lines.push('');
  brief.dataSources.forEach((s) => lines.push(`  - ${s}`));
  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push('CAVEATS');
  lines.push('');
  brief.caveats.forEach((c) => lines.push(wrapText(`• ${c}`, 2)));
  lines.push('');
  lines.push(divider);
  lines.push('');
  lines.push('Open Global Income — https://github.com/alcoolio/open-global-income');
  lines.push(`IMPORTANT: These are modeled estimates, not guarantees. ` +
    `See caveats above. All assumptions are listed explicitly above.`);
  lines.push(divider);

  return lines.join('\n');
}

function wrapText(text: string, indent: number): string {
  const prefix = ' '.repeat(indent);
  const maxLen = 72 - indent;
  const words = text.split(' ');
  const result: string[] = [];
  let currentLine = prefix;

  for (const word of words) {
    if (currentLine.length + word.length + 1 > 72 && currentLine.trim().length > 0) {
      result.push(currentLine);
      currentLine = prefix + word;
    } else {
      currentLine = currentLine.length === indent ? prefix + word : `${currentLine} ${word}`;
    }
  }
  if (currentLine.trim()) result.push(currentLine);
  return result.join('\n');
}
