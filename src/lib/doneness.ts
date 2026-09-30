export interface DonenessOption {
  value: string;
  label: string;
  description: string;
}

// Como a maioria das boas hamburguerias artesanais (o blend é moído na hora e
// grelhado em chapa/brasa quente), oferecemos dois pontos seguros e conhecidos
// do público — sem opção "mal passada", já que carne moída exige cocção mais
// completa por segurança alimentar.
export const DONENESS_OPTIONS: DonenessOption[] = [
  {
    value: "Ponto da casa",
    label: "Ponto da casa",
    description: "Suculento, com um leve rosado no centro.",
  },
  {
    value: "Bem passado",
    label: "Bem passado",
    description: "Sem nenhum rosado, mais firme e douradinho por igual.",
  },
];

export const DEFAULT_DONENESS = DONENESS_OPTIONS[0].value;
