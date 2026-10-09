export type WindowColor = "red" | "yellow" | "green";

// Mapeia o horário de início da janela (extraído do rótulo, ex: "18h às 19h")
// para a cor fixa que representa exclusivamente essa janela, em qualquer tela.
export function getWindowColor(label: string): WindowColor | null {
  const match = label.match(/(\d{1,2})h/);
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour === 18) return "red";
  if (hour === 19) return "yellow";
  if (hour === 20) return "green";
  return null;
}

export const WINDOW_COLOR_BADGE_CLASS: Record<WindowColor, string> = {
  red: "bg-danger-bg text-danger",
  yellow: "bg-warning-bg text-warning",
  green: "bg-success-bg text-success",
};

export const WINDOW_COLOR_BORDER_CLASS: Record<WindowColor, string> = {
  red: "border-l-danger",
  yellow: "border-l-warning",
  green: "border-l-success",
};

export const WINDOW_COLOR_CARD_CLASS: Record<WindowColor, string> = {
  red: "bg-danger-bg",
  yellow: "bg-warning-bg",
  green: "bg-success-bg",
};

// Texto só com a cor (sem fundo tingido), pra etiquetas sobre o card já
// colorido — o chip de fundo (WINDOW_COLOR_BADGE_CLASS) fica invisível
// quando o card inteiro já é dessa mesma cor.
export const WINDOW_COLOR_TEXT_CLASS: Record<WindowColor, string> = {
  red: "text-danger",
  yellow: "text-warning",
  green: "text-success",
};

// Ordena por horário de início da janela (extraído do rótulo), não por
// ordem de chegada do pedido — janelas sem horário reconhecível vão por
// último, mantidas na ordem relativa entre si.
export function windowSortKey(label: string): number {
  const match = label.match(/(\d{1,2})h/);
  return match ? Number(match[1]) : 99;
}
