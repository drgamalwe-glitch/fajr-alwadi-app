import {
  scenarioCashSaleOracle,
  scenarioInstallmentOracle,
  scenarioGeneralExpenseOracle,
  type ScenarioOracleResult,
} from "./oracle";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  run: () => ScenarioOracleResult[];
}

export function getScenarios(): Scenario[] {
  return [
    {
      id: "A",
      name: "Cash Car Sale",
      description: "Purchase 10,000 / Sell 20,000 cash. Profit = 10,000. Partners 50/50.",
      run: () => [scenarioCashSaleOracle()],
    },
    {
      id: "B",
      name: "Installment Sale",
      description: "Purchase 10M / Sell 20M / Down payment 5M / 15 installments of 1M. Profit ratio 50%.",
      run: () => {
        const { afterDownPayment, afterOneInstallment, afterAllPayments } = scenarioInstallmentOracle();
        return [afterDownPayment, afterOneInstallment, afterAllPayments];
      },
    },
    {
      id: "C",
      name: "General Expense",
      description: "Rent 1,000,000 IQD. Partner cash decreases. Each partner bears 50%.",
      run: () => [scenarioGeneralExpenseOracle()],
    },
  ];
}
