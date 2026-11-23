// The database handle type is declared once, in app/db/types.ts. A second
// `type Db = ...` drifts from the schema the first one was written against.

const noRedeclaredDbType = {
  meta: {
    type: "problem",
    messages: {
      redeclared:
        "Import Db from ~/db/types instead of declaring it. The shared type is the only place that names the database handle.",
    },
  },
  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        if (node.id.name !== "Db") return;
        context.report({ node: node.id, messageId: "redeclared" });
      },
    };
  },
};

export default {
  meta: { name: "db" },
  rules: { "no-redeclared-db-type": noRedeclaredDbType },
};
