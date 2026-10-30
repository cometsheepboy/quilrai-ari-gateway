
export interface Customer {
  customer_id: string;
  name: string;
  email: string;
  status: "active" | "inactive";
}

export interface Refund {
  refund_id: string;
  customer_id: string;
  amount: number;
  reason: string;
  status: "processed";
  created_at: string;
}

// Mock customer database.
// In a real application, this would connect to a database.
const customers: Customer[] = [
  {
    customer_id: "CUST-12345",
    name: "John Smith",
    email: "john@example.com",
    status: "active",
  },
  {
    customer_id: "CUST-67890",
    name: "Sarah Johnson",
    email: "sarah@example.com",
    status: "active",
  },
];

// In-memory refund history for this assessment.
const refunds: Refund[] = [];

export function getCustomerRecord(
  customerId: string
): Customer | undefined {
  return customers.find(
    (customer) => customer.customer_id === customerId
  );
}

export function triggerRefund(
  customerId: string,
  amount: number,
  reason: string
): Refund | undefined {
  const customer = getCustomerRecord(customerId);

  if (!customer) {
    return undefined;
  }

  const refund: Refund = {
    refund_id: `REF-${Date.now()}`,
    customer_id: customerId,
    amount,
    reason,
    status: "processed",
    created_at: new Date().toISOString(),
  };

  refunds.push(refund);

  return refund;
}

export function getRefundHistory(): Refund[] {
  return [...refunds];
}
