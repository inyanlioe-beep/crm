import { z } from "zod";

export const registerSchema = z.object({
  tenantName: z.string().min(2, "Workspace name is too short").max(80),
  ownerName: z.string().min(2, "Your name is too short").max(80),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
