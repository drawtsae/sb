import { parseArgs } from "node:util";
import { getDb } from "../src/server/db/client";
import { createUser } from "../src/server/repo/users";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    admin: { type: "boolean", default: false },
  },
});

if (!values.email || !values.password) {
  console.error("Usage: create-user.ts --email x --password y [--admin]");
  process.exit(1);
}

createUser(getDb(), values.email, values.password, values.admin ?? false)
  .then((u) => console.log(`Created ${u.isAdmin ? "admin" : "user"} ${u.email}`))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
