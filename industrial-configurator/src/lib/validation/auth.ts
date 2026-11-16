import { z } from 'zod';

/** Body of `POST /api/auth/login`. */
export const loginSchema = z.strictObject({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
