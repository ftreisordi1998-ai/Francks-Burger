import { createClient } from "@/lib/supabase/server";
import { CustosScreen } from "@/components/admin/CustosScreen";
import type {
  CostIngredient,
  CostRecipe,
  CostRecipeItem,
  CostBurger,
  CostBurgerItem,
  CostProductionExpense,
  CostFixedExpense,
  CostFee,
  CostSimulation,
  Product,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminCustosPage() {
  const supabase = await createClient();

  const [
    { data: ingredients },
    { data: recipes },
    { data: recipeItems },
    { data: burgers },
    { data: burgerItems },
    { data: productionExpenses },
    { data: fixedExpenses },
    { data: fees },
    { data: simulations },
    { data: products },
  ] = await Promise.all([
    supabase.from("cost_ingredients").select("*").eq("archived", false).order("name"),
    supabase.from("cost_recipes").select("*").eq("archived", false).order("name"),
    supabase.from("cost_recipe_items").select("*").order("sort_order"),
    supabase.from("cost_burgers").select("*").eq("archived", false).order("name"),
    supabase.from("cost_burger_items").select("*").order("sort_order"),
    supabase.from("cost_production_expenses").select("*").eq("archived", false).order("name"),
    supabase.from("cost_fixed_expenses").select("*").eq("archived", false).order("name"),
    supabase.from("cost_fees").select("*").eq("archived", false).order("name"),
    supabase.from("cost_simulations").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("products").select("id, edition_id, name, description, price_cents, image_url, stock_qty, available_qty, sort_order, active").order("name"),
  ]);

  return (
    <CustosScreen
      initialIngredients={(ingredients ?? []) as CostIngredient[]}
      initialRecipes={(recipes ?? []) as CostRecipe[]}
      initialRecipeItems={(recipeItems ?? []) as CostRecipeItem[]}
      initialBurgers={(burgers ?? []) as CostBurger[]}
      initialBurgerItems={(burgerItems ?? []) as CostBurgerItem[]}
      initialProductionExpenses={(productionExpenses ?? []) as CostProductionExpense[]}
      initialFixedExpenses={(fixedExpenses ?? []) as CostFixedExpense[]}
      initialFees={(fees ?? []) as CostFee[]}
      initialSimulations={(simulations ?? []) as CostSimulation[]}
      products={(products ?? []) as Product[]}
    />
  );
}
