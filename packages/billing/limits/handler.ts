import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import { AppError } from '@documenso/lib/errors/app-error';

import type { TLimitsErrorResponseSchema, TLimitsResponseSchema } from './schema';
import { getServerLimits } from './server';

/**
 * GET /api/limits — limits for the team given in the `team-id` header.
 */
export const limitsHandler = async (req: Request) => {
  try {
    const { user } = await getOptionalSession(req);

    if (!user) {
      return Response.json({ error: 'Unauthorized' } satisfies TLimitsErrorResponseSchema, { status: 401 });
    }

    const teamId = Number(req.headers.get('team-id'));

    if (!Number.isInteger(teamId) || teamId <= 0) {
      return Response.json({ error: 'Invalid team-id header' } satisfies TLimitsErrorResponseSchema, {
        status: 400,
      });
    }

    const limits = await getServerLimits({ userId: user.id, teamId });

    // Infinity is not valid JSON, the client schema reads null back as Infinity.
    return new Response(
      JSON.stringify(limits satisfies TLimitsResponseSchema, (_key, value) => (value === Infinity ? null : value)),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    // AppErrors here mean the user is not a member of the team.
    return Response.json({ error: 'Failed to load limits' } satisfies TLimitsErrorResponseSchema, {
      status: err instanceof AppError ? 403 : 500,
    });
  }
};
