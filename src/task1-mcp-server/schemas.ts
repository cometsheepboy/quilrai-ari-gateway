
import { z } from "zod";

// Customer IDs must follow CUST-XXXXX format.
// X represents an uppercase letter or digit.
export const customerIdSchema = z
  .string()
  .regex(
    /^CUST-[A-Z0-9]{5}$/,
    "Customer ID must follow CUST-XXXXX format"
  );

// Strictly validate customer lookup requests.
export const getCustomerRecordSchema = z
  .object({
    customer_id: customerIdSchema,
  })
  .strict();

// Strictly validate refund requests.
export const triggerRefundSchema = z
  .object({
    customer_id: customerIdSchema,
    amount: z.number().positive().finite(),
    reason: z.string().trim().min(
      10,
      "Refund reason must contain at least 10 characters"
    ),
  })
  .strict();
