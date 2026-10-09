"use client";

import { useState } from "react";
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
import { IngredientsPanel } from "./cost/IngredientsPanel";
import { RecipesPanel } from "./cost/RecipesPanel";
import { BurgersPanel } from "./cost/BurgersPanel";
import { SimulationPanel } from "./cost/SimulationPanel";

type Tab = "insumos" | "fichas" | "simulacao";

const TABS: { id: Tab; label: string }[] = [
  { id: "insumos", label: "Insumos e preparos" },
  { id: "fichas", label: "Fichas dos burgers" },
  { id: "simulacao", label: "Simulação da produção" },
];

export function CustosScreen({
  initialIngredients,
  initialRecipes,
  initialRecipeItems,
  initialBurgers,
  initialBurgerItems,
  initialProductionExpenses,
  initialFixedExpenses,
  initialFees,
  initialSimulations,
  products,
}: {
  initialIngredients: CostIngredient[];
  initialRecipes: CostRecipe[];
  initialRecipeItems: CostRecipeItem[];
  initialBurgers: CostBurger[];
  initialBurgerItems: CostBurgerItem[];
  initialProductionExpenses: CostProductionExpense[];
  initialFixedExpenses: CostFixedExpense[];
  initialFees: CostFee[];
  initialSimulations: CostSimulation[];
  products: Product[];
}) {
  const [tab, setTab] = useState<Tab>("insumos");
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [recipes, setRecipes] = useState(initialRecipes);
  const [recipeItems, setRecipeItems] = useState(initialRecipeItems);
  const [burgers, setBurgers] = useState(initialBurgers);
  const [burgerItems, setBurgerItems] = useState(initialBurgerItems);
  const [productionExpenses, setProductionExpenses] = useState(initialProductionExpenses);
  const [fixedExpenses, setFixedExpenses] = useState(initialFixedExpenses);
  const [fees, setFees] = useState(initialFees);
  const [simulations, setSimulations] = useState(initialSimulations);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-extrabold text-coffee">Custos e margens</h1>
        <p className="text-sm text-coffee-soft">
          Cadastre insumos, preparos e fichas técnicas para acompanhar custo e margem de cada
          burger. Dados marcados como estimados ou pendentes aparecem identificados — nunca
          tratados como preço confirmado.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-coffee/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-bold ${
              tab === t.id ? "border-orange text-orange" : "border-transparent text-coffee-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "insumos" && (
        <div className="flex flex-col gap-6">
          <IngredientsPanel ingredients={ingredients} onChange={setIngredients} />
          <RecipesPanel
            recipes={recipes}
            recipeItems={recipeItems}
            ingredients={ingredients}
            onRecipesChange={setRecipes}
            onRecipeItemsChange={setRecipeItems}
          />
        </div>
      )}

      {tab === "fichas" && (
        <BurgersPanel
          burgers={burgers}
          burgerItems={burgerItems}
          ingredients={ingredients}
          recipes={recipes}
          products={products}
          onBurgersChange={setBurgers}
          onBurgerItemsChange={setBurgerItems}
        />
      )}

      {tab === "simulacao" && (
        <SimulationPanel
          burgers={burgers}
          fees={fees}
          productionExpenses={productionExpenses}
          fixedExpenses={fixedExpenses}
          simulations={simulations}
          onProductionExpensesChange={setProductionExpenses}
          onFixedExpensesChange={setFixedExpenses}
          onFeesChange={setFees}
          onSimulationsChange={setSimulations}
        />
      )}
    </div>
  );
}
