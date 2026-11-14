import { z } from "zod";

/**
 * Zod to JSON Schema for tools/list, covering exactly the zod types MCP tool inputs use.
 * zod 3 ships no converter and the inputs are small, so this is cheaper than a dependency.
 * An unsupported type becomes {} (accept anything) rather than throwing, and the zod parse
 * on the call is still the real validation.
 */
export type JsonSchema = { [key: string]: unknown };

function describe(schema: z.ZodTypeAny, out: JsonSchema): JsonSchema {
  return schema.description ? { ...out, description: schema.description } : out;
}

export function toJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const def = schema._def as { typeName?: string };
  switch (def.typeName) {
    case "ZodString":
      return describe(schema, { type: "string" });
    case "ZodNumber": {
      const checks = (schema as z.ZodNumber)._def.checks;
      const out: JsonSchema = { type: checks.some((c) => c.kind === "int") ? "integer" : "number" };
      for (const c of checks) {
        if (c.kind === "min") out.minimum = c.value;
        if (c.kind === "max") out.maximum = c.value;
      }
      return describe(schema, out);
    }
    case "ZodBoolean":
      return describe(schema, { type: "boolean" });
    case "ZodEnum":
      return describe(schema, { type: "string", enum: [...(schema as z.ZodEnum<[string, ...string[]]>).options] });
    case "ZodLiteral":
      return describe(schema, { const: (schema as z.ZodLiteral<unknown>).value });
    case "ZodArray":
      return describe(schema, { type: "array", items: toJsonSchema((schema as z.ZodArray<z.ZodTypeAny>).element) });
    case "ZodOptional":
    case "ZodNullable":
      return describe(schema, toJsonSchema((schema as z.ZodOptional<z.ZodTypeAny>).unwrap()));
    case "ZodDefault": {
      const d = schema as z.ZodDefault<z.ZodTypeAny>;
      return describe(schema, { ...toJsonSchema(d._def.innerType), default: d._def.defaultValue() });
    }
    case "ZodRecord":
      return describe(schema, { type: "object", additionalProperties: true });
    case "ZodObject": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toJsonSchema(value);
        if (!value.isOptional()) required.push(key);
      }
      return describe(schema, {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      });
    }
    default:
      return describe(schema, {});
  }
}
