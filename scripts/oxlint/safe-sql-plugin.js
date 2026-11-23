// Custom oxlint plugin. `sql.raw` stays allowed, but only with a static string:
// a dynamic argument is a SQL injection hole.

const isStaticString = (node) =>
  (node.type === "Literal" && typeof node.value === "string") ||
  (node.type === "TemplateLiteral" && node.expressions.length === 0);

const noDynamicSqlRaw = {
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        const isSqlRaw =
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.object.type === "Identifier" &&
          callee.object.name === "sql" &&
          callee.property.name === "raw";
        if (!isSqlRaw) return;
        const [argument] = node.arguments;
        if (argument && isStaticString(argument)) return;
        context.report({
          node,
          message:
            "sql.raw only accepts a static string. Bind values with sql`${value}` or use like()/eq().",
        });
      },
    };
  },
};

export default {
  meta: { name: "safe-sql" },
  rules: { "no-dynamic-sql-raw": noDynamicSqlRaw },
};
