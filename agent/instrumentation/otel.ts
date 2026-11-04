import { otel } from "eve/instrumentation/otel";

/**
 * DECISION: record tool/model inputs and outputs in traces for every session.
 * eve's default only records content for "public" sessions or in development,
 * so anonymous web-chat sessions showed "Input content was omitted" in Agent Runs
 * and their transcripts were deleted when the run ended.
 *
 * This is a demo with mock data, and seeing the booking parameters in Agent Runs
 * is the point. For real users, go back to the default or redact by audience:
 * conversations can contain personal data (names, dates, locations).
 */
export default otel({
  resource: { "deployment.environment": process.env.VERCEL_ENV ?? "development" },
  tracePolicy: () => ({ emit: true, recordInputs: true, recordOutputs: true }),
});
