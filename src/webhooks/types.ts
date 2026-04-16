/** Webhook event types */
export type WebhookEvent =
  | 'user.created'
  | 'entitlement.calculated'
  | 'data.updated'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'simulation.created'
  | 'disbursement.created'
  | 'disbursement.approved'
  | 'disbursement.completed'
  | 'disbursement.confirmed'
  | 'disbursement.failed'
  | 'pilot.created'
  | 'pilot.status_changed'
  | 'pilot.report_generated'
  | 'pilot.audit_export_generated'
  | 'pilot.outcome_recorded'
  | 'funding_scenario.created'
  | 'impact_analysis.created';

/** Webhook subscription stored in the database */
export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  createdAt: string;
  apiKeyId?: string;
}

/** Payload sent to webhook endpoints */
export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

/** Result of a webhook delivery attempt */
export interface WebhookDelivery {
  webhookId: string;
  event: WebhookEvent;
  url: string;
  statusCode: number | null;
  success: boolean;
  error?: string;
  deliveredAt: string;
}
