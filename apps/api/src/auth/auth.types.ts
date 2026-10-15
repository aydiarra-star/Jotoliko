import { Request } from "express";

export type AppRole = "OWNER" | "ADMIN" | "MANAGER" | "DRIVER" | "SELLER" | "VIEWER";

export type AuthContext = {
  userId: string;
  companyId: string;
  role: AppRole;
};

export type AuthenticatedRequest = Request & { auth?: AuthContext };
