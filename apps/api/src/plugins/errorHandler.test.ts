import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { errorHandler } from "./errorHandler.js";

function appThrowing(err: Error) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.get("/boom", async () => {
    throw err;
  });
  return app;
}

// Overload (capacity criterion): when every database connection is busy the pool times out. That means "saturated, try
// again", not "broken": the client gets a fast 503 with Retry-After instead of a 500 that looks like a bug.
test("a database pool timeout is a 503 server_busy with Retry-After, not a 500", async () => {
  for (const message of ["timeout exceeded when trying to connect", "Connection terminated due to connection timeout"]) {
    const app = appThrowing(new Error(message));
    const res = await app.inject({ method: "GET", url: "/boom" });
    assert.equal(res.statusCode, 503, message);
    assert.equal((res.json() as { error: string }).error, "server_busy");
    assert.equal(res.headers["retry-after"], "1");
    await app.close();
  }
});

test("any other unexpected error is still a 500 internal_error without details", async () => {
  const app = appThrowing(new Error("something else broke: secret detail"));
  const res = await app.inject({ method: "GET", url: "/boom" });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.json(), { error: "internal_error" });
  await app.close();
});
