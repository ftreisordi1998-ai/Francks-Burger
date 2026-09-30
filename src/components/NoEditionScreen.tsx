import { Logo } from "./Logo";
import { SocialFooter } from "./SocialFooter";

export function NoEditionScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <Logo size={88} />
      <p className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-orange">
        Burgers na brasa, por encomenda
      </p>
      <h1 className="mt-2 text-2xl font-extrabold leading-tight text-coffee">
        Nenhuma edição aberta no momento
      </h1>
      <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-coffee-soft">
        A próxima edição será anunciada em breve. Volte aqui para conferir a data de
        preparo e os sabores disponíveis.
      </p>
      <SocialFooter />
    </div>
  );
}
