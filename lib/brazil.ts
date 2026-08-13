export function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function isValidCpf(value: unknown) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(cpf[index]) * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    return (remainder === 10 ? 0 : remainder) === Number(cpf[length]);
  };
  return check(9) && check(10);
}

export type CepAddress = {
  cep: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  cityIbgeCode: string;
};

export async function lookupCep(value: unknown): Promise<CepAddress> {
  const cep = digits(value);
  if (cep.length !== 8) throw new Error("Informe um CEP com 8 números.");
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !data || data.erro === true) throw new Error("CEP não encontrado.");
  return {
    cep,
    address: String(data.logradouro ?? "").trim(),
    neighborhood: String(data.bairro ?? "").trim(),
    city: String(data.localidade ?? "").trim(),
    state: String(data.uf ?? "").trim().toUpperCase(),
    cityIbgeCode: String(data.ibge ?? "").trim(),
  };
}
