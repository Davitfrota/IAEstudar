import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/server/ensure-app-user";
import { AppError } from "@/server/http";
import type { AppUser } from "@/server/types";

type UserRow = AppUser;

/**
 * Mock mínimo da cadeia Supabase usada por ensureAppUser:
 * from().select().eq().maybeSingle() e from().insert().select().single()
 */
function createUsersDbMock(opts: {
  selectResults: Array<{ data: UserRow | null; error: { message: string } | null }>;
  insertResult: { data: UserRow | null; error: { message: string; code?: string } | null };
}) {
  let selectCalls = 0;

  const db = {
    from(table: string) {
      assert.equal(table, "users");
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async maybeSingle() {
                  const result = opts.selectResults[selectCalls] ?? {
                    data: null,
                    error: { message: "unexpected select" },
                  };
                  selectCalls += 1;
                  return result;
                },
              };
            },
          };
        },
        insert(_row: unknown) {
          return {
            select(_cols: string) {
              return {
                async single() {
                  return opts.insertResult;
                },
              };
            },
          };
        },
      };
    },
    getSelectCalls: () => selectCalls,
  };

  return db as unknown as AdminClient & { getSelectCalls: () => number };
}

describe("ensureAppUser race on first login", () => {
  const user: UserRow = {
    id: "11111111-1111-4111-8111-111111111111",
    clerk_id: "user_abc",
    email: "a@example.com",
  };

  it("returns existing user without inserting", async () => {
    const db = createUsersDbMock({
      selectResults: [{ data: user, error: null }],
      insertResult: {
        data: null,
        error: { message: "should not insert" },
      },
    });

    const result = await ensureAppUser(db, user.clerk_id, user.email);
    assert.deepEqual(result, user);
    assert.equal(
      (db as unknown as { getSelectCalls: () => number }).getSelectCalls(),
      1,
    );
  });

  it("creates user when missing", async () => {
    const db = createUsersDbMock({
      selectResults: [{ data: null, error: null }],
      insertResult: { data: user, error: null },
    });

    const result = await ensureAppUser(db, user.clerk_id, user.email);
    assert.deepEqual(result, user);
  });

  it("recovers when parallel insert loses unique(clerk_id)", async () => {
    const db = createUsersDbMock({
      selectResults: [
        { data: null, error: null }, // first look: not found
        { data: user, error: null }, // after failed insert: winner's row
      ],
      insertResult: {
        data: null,
        error: {
          message:
            'duplicate key value violates unique constraint "users_clerk_id_key"',
          code: "23505",
        },
      },
    });

    const result = await ensureAppUser(db, user.clerk_id, user.email);
    assert.deepEqual(result, user);
    assert.equal(
      (db as unknown as { getSelectCalls: () => number }).getSelectCalls(),
      2,
    );
  });

  it("throws USER_SYNC when insert fails and row still missing", async () => {
    const db = createUsersDbMock({
      selectResults: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      insertResult: {
        data: null,
        error: { message: "connection reset" },
      },
    });

    await assert.rejects(
      () => ensureAppUser(db, user.clerk_id, user.email),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "USER_SYNC");
        return true;
      },
    );
  });
});
