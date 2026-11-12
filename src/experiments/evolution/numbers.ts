// User input is length-limited in settings. Intermediate sums can have much larger denominators.
function parts(value: string): [bigint, bigint] {
  if (value.includes("/")) {
    const [a, b] = value.split("/");
    return [BigInt(a), BigInt(b)];
  }
  const digits = value.split(".")[1]?.length ?? 0;
  return [BigInt(value.replace(".", "")), 10n ** BigInt(digits)];
}
function reduced(n: bigint, d: bigint) {
  let a = n < 0n ? -n : n,
    b = d;
  while (b) [a, b] = [b, a % b];
  return d === a ? String(n / a) : n / a + "/" + d / a;
}
export function validAmount(value: string) {
  return /^-?(?:\d{1,9}(?:\.\d{1,9})?|\.\d{1,9}|\d{1,9}\/[1-9]\d{0,8})$/.test(
    value,
  );
}
export function canonical(value: string) {
  return reduced(...parts(value));
}
export function add(a: string, b: string) {
  const [n, d] = parts(a),
    [m, e] = parts(b);
  return reduced(n * e + m * d, d * e);
}
export function compare(a: string, b: string) {
  const [n, d] = parts(a),
    [m, e] = parts(b);
  const delta = n * e - m * d;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}
