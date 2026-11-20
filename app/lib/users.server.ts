import { db } from "~/db";
import { users } from "~/db/schema";

export function createUser(
  values: Pick<typeof users.$inferInsert, "name" | "email" | "role">
) {
  return db.insert(users).values(values).returning().get();
}
