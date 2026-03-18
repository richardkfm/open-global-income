import type { FastifyPluginAsync } from 'fastify';
import { createUserDb, getUserByIdDb } from '../../db/users-db.js';
import { getCountryByCode, getDataVersion } from '../../data/loader.js';
import { calculateEntitlement } from '../../core/rules.js';

export const usersRoute: FastifyPluginAsync = async (app) => {
  /** Register a new user with a country code */
  app.post<{ Body: { country_code?: string } }>('/users', async (request, reply) => {
    const countryCode = request.body?.country_code;

    if (!countryCode || typeof countryCode !== 'string') {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'MISSING_PARAMETER',
          message: "Request body must include 'country_code'",
        },
      });
    }

    const country = getCountryByCode(countryCode);
    if (!country) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: 'COUNTRY_NOT_FOUND',
          message: `No data available for country code '${countryCode.toUpperCase()}'`,
        },
      });
    }

    const user = createUserDb(countryCode, request.apiKey?.id);
    return reply.status(201).send({ ok: true, data: user });
  });

  /** Get a user's income entitlement */
  app.get<{ Params: { id: string } }>('/users/:id/income', async (request, reply) => {
    const user = getUserByIdDb(request.params.id);

    if (!user) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: `No user found with id '${request.params.id}'`,
        },
      });
    }

    const country = getCountryByCode(user.countryCode);
    if (!country) {
      return reply.status(404).send({
        ok: false,
        error: {
          code: 'COUNTRY_NOT_FOUND',
          message: `No data available for country code '${user.countryCode}'`,
        },
      });
    }

    const entitlement = calculateEntitlement(country, getDataVersion());
    return {
      ok: true,
      data: {
        user: { id: user.id, countryCode: user.countryCode },
        entitlement,
      },
    };
  });
};
