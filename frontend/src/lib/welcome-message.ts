export const DEFAULT_WELCOME_MESSAGE = "Olá, {responsavel}! Sejam bem-vindos! Sou o tutor de {aluno}, da turma {turma}. Este é meu contato para acompanharmos as aulas. Salve meu número, por favor. Posso adicionar você ao grupo da turma?";
export const WELCOME_EXAMPLES = { responsavel: "Maria", aluno: "Ana", turma: "Programação" };
export function validateWelcomeMessage(template: string) {
  if (typeof template !== "string" || !template.trim() || template.length > 5000) throw new Error("Informe uma mensagem de boas-vindas com até 5000 caracteres.");
  const unknown = [...template.matchAll(/\{([^{}]+)\}/g)].find(match => !Object.hasOwn(WELCOME_EXAMPLES, match[1]));
  if (unknown) throw new Error(`Variável desconhecida na mensagem de boas-vindas: {${unknown[1]}}.`);
}
export function renderWelcomeMessage(template: string, student: string, className = "", guardian = "") {
  const values: Record<string, string> = { aluno: student, turma: className || "sua turma", responsavel: guardian || "responsável" };
  return template.replace(/\{([a-z_]+)\}/g, (token, key: string) => values[key] ?? token);
}
