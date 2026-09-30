import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/admin/SignOutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) redirect("/admin/login");

  return (
    <div className="min-h-dvh bg-cream-soft">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-coffee/10 bg-cream px-5 py-3">
        <div className="flex items-center gap-5">
          <span className="text-sm font-extrabold text-coffee">Franck&rsquo;s Burger · Admin</span>
          <nav className="hidden gap-4 text-sm font-semibold text-coffee-soft sm:flex">
            <Link href="/admin/pedidos" className="hover:text-orange">
              Pedidos
            </Link>
            <Link href="/admin/edicoes" className="hover:text-orange">
              Edições
            </Link>
          </nav>
        </div>
        <SignOutButton />
      </header>
      <nav className="flex gap-4 border-b border-coffee/10 bg-cream px-5 py-2 text-sm font-semibold text-coffee-soft sm:hidden">
        <Link href="/admin/pedidos" className="hover:text-orange">
          Pedidos
        </Link>
        <Link href="/admin/edicoes" className="hover:text-orange">
          Edições
        </Link>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
