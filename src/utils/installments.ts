export interface InstallmentAlert {
  buyerName: string;
  phone: string;
  dueDate: string;
  monthlyPayment: number;
  status: "overdue" | "due_today" | "upcoming";
  daysDifference: number;
}

