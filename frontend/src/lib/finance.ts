export function brlToCents(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimal = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
export const centsToBrlInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });
export const formatMoney = (cents: number) => moneyFormatter.format(cents / 100);
export const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T12:00:00`));
