export const skip = (skipReason) => ({ action: null, skipReason });
export const submit = (action) => ({ action, skipReason: null });

export function selectionSchema(name, withPrice = false) {
  const properties = {
    action: { type: "string", enum: ["choose", "wait"] },
    choice: { type: ["integer", "null"] },
    ...(withPrice ? { price: { type: ["integer", "null"] } } : {}),
    reason: { type: "string" },
  };
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema: {
        type: "object",
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
      },
    },
  };
}

export function isWait(decision) {
  return (
    decision?.action === "wait" &&
    typeof decision.reason === "string" &&
    decision.choice == null &&
    decision.price == null
  );
}

export function isChoice(decision, count) {
  return (
    decision?.action === "choose" &&
    typeof decision.reason === "string" &&
    Number.isInteger(decision.choice) &&
    decision.choice >= 0 &&
    decision.choice < count
  );
}
