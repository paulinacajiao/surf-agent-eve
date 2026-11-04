import { InvokeCommand } from "@aws-sdk/client-lambda";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { lambda, SURF_LAMBDA } from "../lib/aws";

/**
 * Same contract as the AgentCore Gateway target `surf-report` in AWS, so the
 * existing Lambda (and its Open-Meteo logic) stays exactly where it is.
 *
 * DECISION: call Lambda directly (SigV4 via an OIDC-assumed role) instead of going
 * through the AgentCore Gateway MCP endpoint. The gateway would add a second
 * SigV4-signed hop and an MCP client for one tool. If the customer later puts many
 * tools behind the gateway, swap this for an eve MCP connection to it.
 *
 * The tool is read-only and idempotent, so it's safe when eve replays an
 * interrupted step after a crash or deploy.
 */
export default defineTool({
  description:
    "Get LIVE surf conditions for a surf spot: current wave height, period and direction, swell, " +
    "water and air temperature, wind speed/gusts/direction, plus a 3-day wave forecast. Use this " +
    "whenever the user asks about surf, waves, swell or wind at a beach or break. You must supply " +
    "the spot's latitude and longitude; use a point just offshore of the break. Heights are in " +
    "meters, periods in seconds, wind in knots, temperatures in Celsius.",
  inputSchema: z.object({
    spot_name: z.string().min(1).max(100).describe("Name of the surf spot, e.g. 'Pipeline, Oahu'"),
    latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees (-90 to 90)"),
    longitude: z.number().min(-180).max(180).describe("Longitude in decimal degrees (-180 to 180)"),
  }),
  label: { start: ({ spot_name }) => `Checking the surf at ${spot_name}` },
  async execute(input, ctx) {
    const res = await lambda().send(
      new InvokeCommand({
        FunctionName: SURF_LAMBDA,
        InvocationType: "RequestResponse",
        Payload: new TextEncoder().encode(JSON.stringify(input)),
      }),
      { abortSignal: ctx.abortSignal },
    );
    const body = res.Payload ? new TextDecoder().decode(res.Payload) : "{}";
    if (res.FunctionError) {
      // Don't leak stack traces to the model; the full error is in CloudWatch.
      throw new Error(`surf_report Lambda failed (${res.FunctionError}). Try again shortly.`);
    }
    // The Lambda returns {error: "..."} for bad coordinates or upstream API
    // failures; pass it through so the model can explain or retry with
    // better coordinates.
    return JSON.parse(body) as Record<string, unknown>;
  },
});
