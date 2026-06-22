export interface CarCostInput {
  purchasePrice: number;
  carExpenses: number;
}

export interface ProfitCalcInput {
  purchasePrice: number;
  sellingPrice: number;
  carExpenses: number;
  paymentAmount: number;
  alreadyRecognizedProfit: number;
}

export interface InstallmentScenarioInput {
  purchasePrice: number;
  sellingPrice: number;
  carExpenses: number;
  downPayment: number;
  monthlyPayment: number;
  totalPayments: number;
}

export interface OracleResult {
  carCost: number;
  fullCarProfit: number;
  profitRatio: number;
  paymentProfit: number;
  remainingRecognizableProfit: number;
  recognizedPaymentProfit: number;
  eachPartnerProfitShare: number;
}

export interface ScenarioOracleResult {
  label: string;
  qasa: number;
  partnerCash: number;
  profitTotal: number;
  partner1Profit: number;
  partner2Profit: number;
  inventory: number;
  receivables: number;
  liabilities: number;
  generalExpenses: number;
  carCost: number;
  carProfit: number;
  customerRemaining: number;
  rows: OracleRow[];
}

export interface OracleRow {
  sourceType: string;
  sourceRole: string;
  affectsQasa: boolean;
  affectsPartnerCash: boolean;
  affectsProfit: boolean;
  amount: number;
  description: string;
}

export function calcCarCost(input: CarCostInput): number {
  return input.purchasePrice + input.carExpenses;
}

export function calcFullCarProfit(sellingPrice: number, carCost: number): number {
  return sellingPrice - carCost;
}

export function calcProfitRatio(fullCarProfit: number, sellingPrice: number): number {
  if (sellingPrice === 0) return 0;
  return fullCarProfit / sellingPrice;
}

export function calcPaymentProfit(paymentAmount: number, profitRatio: number): number {
  return paymentAmount * profitRatio;
}

export function calcRecognizedPaymentProfit(
  calculatedPaymentProfit: number,
  remainingRecognizableProfit: number,
): number {
  return Math.min(Math.max(calculatedPaymentProfit, 0), Math.max(remainingRecognizableProfit, 0));
}

export function calcEachPartnerProfitShare(recognizedPaymentProfit: number): number {
  return recognizedPaymentProfit / 2;
}

export function calcOracle(input: ProfitCalcInput): OracleResult {
  const carCost = calcCarCost({ purchasePrice: input.purchasePrice, carExpenses: input.carExpenses });
  const fullCarProfit = calcFullCarProfit(input.sellingPrice, carCost);
  const profitRatio = calcProfitRatio(fullCarProfit, input.sellingPrice);
  const paymentProfit = calcPaymentProfit(input.paymentAmount, profitRatio);
  const remainingRecognizableProfit = fullCarProfit - input.alreadyRecognizedProfit;
  const recognizedPaymentProfit = calcRecognizedPaymentProfit(paymentProfit, remainingRecognizableProfit);
  const eachPartnerProfitShare = calcEachPartnerProfitShare(recognizedPaymentProfit);

  return {
    carCost,
    fullCarProfit,
    profitRatio,
    paymentProfit,
    remainingRecognizableProfit,
    recognizedPaymentProfit,
    eachPartnerProfitShare,
  };
}

export function calcInstallmentFullRun(input: InstallmentScenarioInput): {
  downPaymentResult: OracleResult;
  installmentResults: OracleResult[];
  totalRecognizedProfit: number;
  totalQasa: number;
  totalPartnerCash: number;
  finalCustomerRemaining: number;
} {
  const carCost = calcCarCost({ purchasePrice: input.purchasePrice, carExpenses: input.carExpenses });
  const fullCarProfit = calcFullCarProfit(input.sellingPrice, carCost);
  const profitRatio = calcProfitRatio(fullCarProfit, input.sellingPrice);
  const remaining = input.sellingPrice - input.downPayment;
  const numPayments = input.totalPayments;

  let alreadyRecognized = 0;
  let totalQasa = 0;
  let totalPartnerCash = 0;

  const downProfit = calcPaymentProfit(input.downPayment, profitRatio);
  const recognizedDown = calcRecognizedPaymentProfit(downProfit, fullCarProfit - alreadyRecognized);
  alreadyRecognized += recognizedDown;
  totalQasa += input.downPayment;
  totalPartnerCash += input.downPayment;

  const downPaymentResult: OracleResult = {
    carCost,
    fullCarProfit,
    profitRatio,
    paymentProfit: downProfit,
    remainingRecognizableProfit: fullCarProfit - (alreadyRecognized - recognizedDown),
    recognizedPaymentProfit: recognizedDown,
    eachPartnerProfitShare: calcEachPartnerProfitShare(recognizedDown),
  };

  const installmentResults: OracleResult[] = [];
  for (let i = 0; i < numPayments; i++) {
    const payment = Math.min(input.monthlyPayment, remaining - i * input.monthlyPayment);
    if (payment <= 0) break;
    const pProfit = calcPaymentProfit(payment, profitRatio);
    const recognized = calcRecognizedPaymentProfit(pProfit, fullCarProfit - alreadyRecognized);
    alreadyRecognized += recognized;
    totalQasa += payment;
    totalPartnerCash += payment;

    installmentResults.push({
      carCost,
      fullCarProfit,
      profitRatio,
      paymentProfit: pProfit,
      remainingRecognizableProfit: fullCarProfit - (alreadyRecognized - recognized),
      recognizedPaymentProfit: recognized,
      eachPartnerProfitShare: calcEachPartnerProfitShare(recognized),
    });
  }

  const customerRemaining = remaining - numPayments * input.monthlyPayment;

  return {
    downPaymentResult,
    installmentResults,
    totalRecognizedProfit: alreadyRecognized,
    totalQasa,
    totalPartnerCash,
    finalCustomerRemaining: Math.max(customerRemaining, 0),
  };
}

export function scenarioCashSaleOracle(): ScenarioOracleResult {
  const purchasePrice = 10_000;
  const sellingPrice = 20_000;
  const carExpenses = 0;

  const carCost = calcCarCost({ purchasePrice, carExpenses });
  const fullCarProfit = calcFullCarProfit(sellingPrice, carCost);
  const profitRatio = calcProfitRatio(fullCarProfit, sellingPrice);
  const recognizedProfit = fullCarProfit;
  const eachPartner = calcEachPartnerProfitShare(recognizedProfit);

  return {
    label: "A: Cash Car Sale",
    qasa: sellingPrice,
    partnerCash: sellingPrice,
    profitTotal: recognizedProfit,
    partner1Profit: eachPartner,
    partner2Profit: eachPartner,
    inventory: 0,
    receivables: 0,
    liabilities: 0,
    generalExpenses: 0,
    carCost,
    carProfit: fullCarProfit,
    customerRemaining: 0,
    rows: [
      {
        sourceType: "car_sale",
        sourceRole: "cash_movement",
        affectsQasa: true,
        affectsPartnerCash: true,
        affectsProfit: false,
        amount: sellingPrice,
        description: "Cash car sale - cash movement",
      },
      {
        sourceType: "car_sale",
        sourceRole: "profit_recognition",
        affectsQasa: false,
        affectsPartnerCash: false,
        affectsProfit: true,
        amount: recognizedProfit,
        description: "Cash car sale - profit recognition",
      },
    ],
  };
}

export function scenarioInstallmentOracle(): {
  afterDownPayment: ScenarioOracleResult;
  afterOneInstallment: ScenarioOracleResult;
  afterAllPayments: ScenarioOracleResult;
} {
  const input: InstallmentScenarioInput = {
    purchasePrice: 10_000_000,
    sellingPrice: 20_000_000,
    carExpenses: 0,
    downPayment: 5_000_000,
    monthlyPayment: 1_000_000,
    totalPayments: 15,
  };

  const fullRun = calcInstallmentFullRun(input);
  const downResult = fullRun.downPaymentResult;

  let runningQasa = input.downPayment;
  let runningProfit = downResult.recognizedPaymentProfit;
  let runningCustomerRemaining = input.sellingPrice - input.downPayment;

  const afterDownPayment: ScenarioOracleResult = {
    label: "B1: Installment - After Down Payment",
    qasa: runningQasa,
    partnerCash: runningQasa,
    profitTotal: runningProfit,
    partner1Profit: downResult.eachPartnerProfitShare,
    partner2Profit: downResult.eachPartnerProfitShare,
    inventory: 0,
    receivables: runningCustomerRemaining,
    liabilities: 0,
    generalExpenses: 0,
    carCost: downResult.carCost,
    carProfit: downResult.fullCarProfit,
    customerRemaining: runningCustomerRemaining,
    rows: [
      {
        sourceType: "customer_payment",
        sourceRole: "cash_movement",
        affectsQasa: true,
        affectsPartnerCash: true,
        affectsProfit: false,
        amount: input.downPayment,
        description: "Down payment - cash movement",
      },
      {
        sourceType: "customer_payment",
        sourceRole: "profit_recognition",
        affectsQasa: false,
        affectsPartnerCash: false,
        affectsProfit: true,
        amount: downResult.recognizedPaymentProfit,
        description: "Down payment - profit recognition",
      },
    ],
  };

  const firstInstallment = fullRun.installmentResults[0];
  runningQasa += input.monthlyPayment;
  runningProfit += firstInstallment.recognizedPaymentProfit;
  runningCustomerRemaining -= input.monthlyPayment;

  const afterOneInstallment: ScenarioOracleResult = {
    label: "B2: Installment - After One Installment",
    qasa: runningQasa,
    partnerCash: runningQasa,
    profitTotal: runningProfit,
    partner1Profit: downResult.eachPartnerProfitShare + firstInstallment.eachPartnerProfitShare,
    partner2Profit: downResult.eachPartnerProfitShare + firstInstallment.eachPartnerProfitShare,
    inventory: 0,
    receivables: runningCustomerRemaining,
    liabilities: 0,
    generalExpenses: 0,
    carCost: downResult.carCost,
    carProfit: downResult.fullCarProfit,
    customerRemaining: runningCustomerRemaining,
    rows: [
      {
        sourceType: "customer_payment",
        sourceRole: "cash_movement",
        affectsQasa: true,
        affectsPartnerCash: true,
        affectsProfit: false,
        amount: input.monthlyPayment,
        description: "Installment 1 - cash movement",
      },
      {
        sourceType: "customer_payment",
        sourceRole: "profit_recognition",
        affectsQasa: false,
        affectsPartnerCash: false,
        affectsProfit: true,
        amount: firstInstallment.recognizedPaymentProfit,
        description: "Installment 1 - profit recognition",
      },
    ],
  };

  const afterAllPayments: ScenarioOracleResult = {
    label: "B3: Installment - After All Payments",
    qasa: fullRun.totalQasa,
    partnerCash: fullRun.totalPartnerCash,
    profitTotal: fullRun.totalRecognizedProfit,
    partner1Profit: fullRun.totalRecognizedProfit / 2,
    partner2Profit: fullRun.totalRecognizedProfit / 2,
    inventory: 0,
    receivables: 0,
    liabilities: 0,
    generalExpenses: 0,
    carCost: downResult.carCost,
    carProfit: downResult.fullCarProfit,
    customerRemaining: 0,
    rows: [],
  };

  return { afterDownPayment, afterOneInstallment, afterAllPayments };
}

export function scenarioGeneralExpenseOracle(): ScenarioOracleResult {
  const expenseAmount = 1_000_000;

  return {
    label: "C: General Expense",
    qasa: -expenseAmount,
    partnerCash: -expenseAmount,
    profitTotal: -expenseAmount,
    partner1Profit: -expenseAmount / 2,
    partner2Profit: -expenseAmount / 2,
    inventory: 0,
    receivables: 0,
    liabilities: 0,
    generalExpenses: expenseAmount,
    carCost: 0,
    carProfit: 0,
    customerRemaining: 0,
    rows: [
      {
        sourceType: "expense",
        sourceRole: "cash_movement",
        affectsQasa: true,
        affectsPartnerCash: true,
        affectsProfit: false,
        amount: -expenseAmount,
        description: "General expense (rent) - cash movement",
      },
    ],
  };
}
