// Just enough of next/server for a route handler to return something a test
// can inspect: the status it chose and the body it built.
export class NextResponse {
  static json(body: unknown, init?: { status?: number }) {
    return { status: init?.status ?? 200, body: body as Record<string, unknown> };
  }
}
// A runtime binding, not a type: route handlers import NextRequest as a value
// ("import { NextRequest, NextResponse }"), and a type-only export vanishes
// when types are stripped, leaving the import unresolvable.
export class NextRequest {
  json!: () => Promise<unknown>;
}
